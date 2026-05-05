// tests/performance.spec.js
// B41 Performance Audit — Web Vitals + API timings + key flows.
//
// Targets:
//   POS sale completion (POST /api/sales): < 500ms p95
//   Product search (barcode + autocomplete): < 200ms p95
//   Page load (salvadorex_web_v25.html): < 3s on 3G
//   Time to Interactive (TTI): < 5s
//   First Contentful Paint (FCP): < 1.5s
//
// Run:
//   TEST_TARGET=prod npx playwright test --config=tests/playwright.b36.config.js tests/performance.spec.js
//
// Output:
//   tests/perf-results.json  (consumed by B41_PERFORMANCE_REPORT.md)

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { USERS, loginViaAPI, apiCall } = require('./fixtures/auth');

const RESULTS_FILE = path.join(__dirname, 'perf-results.json');

// Simple percentile helper
function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function statsBlock(samples) {
  if (!samples || !samples.length) return { count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: samples.length,
    min: +sorted[0].toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
    p50: +pct(sorted, 0.5).toFixed(1),
    p95: +pct(sorted, 0.95).toFixed(1),
    p99: +pct(sorted, 0.99).toFixed(1),
    mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1),
  };
}

// Persistent results buffer accumulated across tests, written once at end.
const results = {
  meta: {
    target: process.env.TEST_TARGET || 'local',
    baseURL: null,
    capturedAt: new Date().toISOString(),
    userAgent: null,
  },
  webVitals: {},        // FCP, LCP, CLS, TTI, DOMContentLoaded, load
  resourceTimings: {},  // mainHTML / largest JS / first paint
  apiTimings: {},       // login / products(cold/warm) / customers / sales / search
  flowTimings: {},      // addToCart, openModal, completeSale
  scoring: {},          // computed at end
};

// ────────────────────────────────────────────────────────────────────
// Helper: login and persist token in localStorage so the page picks it up
// ────────────────────────────────────────────────────────────────────
async function loginAndPersist(page, baseURL) {
  const t0 = Date.now();
  const token = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);
  const elapsed = Date.now() - t0;
  if (!token) throw new Error('No se pudo obtener token admin via /api/login');

  // Land on origin so localStorage is writable for this domain
  await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    try {
      localStorage.setItem('volvix_token', tok);
      localStorage.setItem('volvixAuthToken', tok);
      localStorage.setItem('token', tok);
      localStorage.setItem('auth_token', tok);
    } catch (_) {}
  }, token);

  // Also persist via init script — ensures token is present BEFORE any script
  // runs on subsequent navigations, defeating the SSO redirect race.
  await page.addInitScript((tok) => {
    try {
      if (!localStorage.getItem('volvix_token')) localStorage.setItem('volvix_token', tok);
      if (!localStorage.getItem('volvixAuthToken')) localStorage.setItem('volvixAuthToken', tok);
    } catch (_) {}
  }, token);

  return { token, elapsed };
}

// ────────────────────────────────────────────────────────────────────
// 1) Web Vitals — FCP, LCP, CLS, TTI, DCL, load
// ────────────────────────────────────────────────────────────────────
test('PERF-01: Web Vitals on /salvadorex_web_v25.html', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  results.meta.baseURL = baseURL;

  const { token } = await loginAndPersist(page, baseURL);
  expect(token).toBeTruthy();

  // Inject web-vitals capture before navigation
  await page.addInitScript(() => {
    window.__perf = { fcp: null, lcp: null, cls: 0, ttfb: null, longTasks: 0, longTaskTotal: 0 };
    try {
      const po1 = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime;
        }
      });
      po1.observe({ type: 'paint', buffered: true });
    } catch (_) {}
    try {
      const po2 = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__perf.lcp = e.startTime;
        }
      });
      po2.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}
    try {
      const po3 = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__perf.cls += e.value;
        }
      });
      po3.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
    try {
      const po4 = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__perf.longTasks++;
          window.__perf.longTaskTotal += e.duration;
        }
      });
      po4.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });

  // Listen to console errors that may indicate why the page redirects
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + String(err).slice(0, 300)));

  const navStart = Date.now();
  // Use domcontentloaded first (more reliable on heavy pages with 200+ scripts);
  // we then wait for the load event below with a separate timeout, so even if the
  // load event never fires we still capture useful metrics.
  let resp;
  try {
    resp = await page.goto('/salvadorex_web_v25.html', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (e) {
    // Capture whatever we have even on timeout
    results.webVitals.navError = String(e.message || e);
  }
  const dclTime = Date.now() - navStart;

  // Check if we ended up redirected (e.g. SSO bounce to /login.html)
  const finalURL = page.url();
  results.webVitals.finalURL = finalURL;
  if (!/salvadorex_web_v25\.html/i.test(finalURL)) {
    results.webVitals.redirectedAway = true;
    results.webVitals.consoleErrors = consoleErrors.slice(0, 10);
    // Still return whatever we can from the redirected page
  }

  // userAgent — read from a fresh evaluate, retry if needed
  for (let attempt = 0; attempt < 3 && !results.meta.userAgent; attempt++) {
    try {
      results.meta.userAgent = await page.evaluate(() => navigator.userAgent);
    } catch (e) {
      await page.waitForTimeout(800);
    }
  }

  // Wait for load event (up to 25s extra) so we can capture LCP, longTasks, etc.
  let loadEvent = null;
  try {
    await page.waitForLoadState('load', { timeout: 25_000 });
    loadEvent = Date.now() - navStart;
  } catch (e) {
    results.webVitals.loadEventTimeout = true;
  }
  // Give LCP time to settle and let some layout-shift events trigger
  await page.waitForTimeout(3000);

  let vitals = {};
  try {
    vitals = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = {};
      for (const p of performance.getEntriesByType('paint')) paints[p.name] = p.startTime;
      return {
        fcp: window.__perf?.fcp || paints['first-contentful-paint'] || null,
        fp:  paints['first-paint'] || null,
        lcp: window.__perf?.lcp || null,
        cls: window.__perf?.cls || 0,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
        load:             nav ? nav.loadEventEnd - nav.startTime : null,
        ttfb:             nav ? nav.responseStart - nav.startTime : null,
        transferSize:     nav ? nav.transferSize : null,
        encodedBodySize:  nav ? nav.encodedBodySize : null,
        decodedBodySize:  nav ? nav.decodedBodySize : null,
        longTasks:        window.__perf?.longTasks || 0,
        longTaskTotal:    window.__perf?.longTaskTotal || 0,
      };
    });
  } catch (e) {
    results.webVitals.evaluateError = String(e.message || e);
    vitals = { cls: 0, longTasks: 0, longTaskTotal: 0 };
  }

  // TTI approximation: first long quiet window of 5s after FCP. Simpler: when no
  // long tasks for 1s past load. We approximate by load + last longTask cluster.
  const ttiApprox = (vitals.load || 0) + Math.min(vitals.longTaskTotal || 0, 5000);

  results.webVitals = {
    FCP_ms: vitals.fcp != null ? +vitals.fcp.toFixed(0) : null,
    FP_ms:  vitals.fp != null ? +vitals.fp.toFixed(0) : null,
    LCP_ms: vitals.lcp != null ? +vitals.lcp.toFixed(0) : null,
    CLS:    +vitals.cls.toFixed(3),
    TTFB_ms: vitals.ttfb != null ? +vitals.ttfb.toFixed(0) : null,
    DCL_ms:  vitals.domContentLoaded != null ? +vitals.domContentLoaded.toFixed(0) : null,
    Load_ms: vitals.load != null ? +vitals.load.toFixed(0) : null,
    TTI_approx_ms: +ttiApprox.toFixed(0),
    LongTasks_count: vitals.longTasks,
    LongTasks_total_ms: +vitals.longTaskTotal.toFixed(0),
    NavTotal_ms: loadEvent,
    DCL_navTime_ms: dclTime,
    transferSize_bytes: vitals.transferSize || 0,
    encodedBodySize_bytes: vitals.encodedBodySize || 0,
    decodedBodySize_bytes: vitals.decodedBodySize || 0,
  };

  // Resource timings — group by file & sum sizes
  let resources = [];
  try {
    resources = await page.evaluate(() => {
      const list = performance.getEntriesByType('resource');
      return list.map((e) => ({
        name: e.name,
        initiatorType: e.initiatorType,
        duration: +e.duration.toFixed(1),
        transferSize: e.transferSize || 0,
        encodedBodySize: e.encodedBodySize || 0,
        decodedBodySize: e.decodedBodySize || 0,
      }));
    });
  } catch (e) {
    results.webVitals.resourcesError = String(e.message || e);
  }
  // Aggregate
  const buckets = { script: { count: 0, transfer: 0, decoded: 0, slowest: [] }, css: { count: 0, transfer: 0, decoded: 0 }, img: { count: 0, transfer: 0, decoded: 0 }, font: { count: 0, transfer: 0, decoded: 0 }, fetch: { count: 0, transfer: 0, decoded: 0 }, xhr: { count: 0, transfer: 0, decoded: 0 }, other: { count: 0, transfer: 0, decoded: 0 } };
  for (const r of resources) {
    const t = r.initiatorType;
    const bucket = (t === 'script' || t === 'link' || t === 'css' || t === 'img' || t === 'font' || t === 'fetch' || t === 'xmlhttprequest')
      ? (t === 'link' ? 'css' : (t === 'xmlhttprequest' ? 'xhr' : t))
      : 'other';
    if (!buckets[bucket]) buckets[bucket] = { count: 0, transfer: 0, decoded: 0 };
    buckets[bucket].count++;
    buckets[bucket].transfer += r.transferSize;
    buckets[bucket].decoded += r.decodedBodySize;
  }
  // Top 15 slowest scripts
  const slowestScripts = [...resources]
    .filter((r) => r.initiatorType === 'script')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 15)
    .map((r) => ({ url: r.name.split('/').pop(), duration_ms: r.duration, transferSize: r.transferSize, decodedBodySize: r.decodedBodySize }));
  // Largest scripts by decoded bytes
  const largestScripts = [...resources]
    .filter((r) => r.initiatorType === 'script')
    .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
    .slice(0, 15)
    .map((r) => ({ url: r.name.split('/').pop(), decodedBodySize: r.decodedBodySize, transferSize: r.transferSize, duration_ms: r.duration }));

  results.resourceTimings = {
    totalRequests: resources.length,
    bucketSummary: buckets,
    slowestScripts,
    largestScripts,
  };
});

// ────────────────────────────────────────────────────────────────────
// 2) API timings — login / products (cold + warm) / customers
// ────────────────────────────────────────────────────────────────────
test('PERF-02: API endpoint timings', async ({ baseURL }) => {
  test.setTimeout(120_000);

  // 2.a Login (5 samples)
  const loginSamples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const t = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);
    loginSamples.push(Date.now() - t0);
    if (!t) throw new Error('login failed during PERF-02');
  }
  const token = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);

  // 2.b GET /api/products — first call considered "cold" then 4 warm
  const productsCold = [];
  const productsWarm = [];
  {
    const t0 = Date.now();
    const r = await apiCall(baseURL, token, 'get', '/api/products?limit=200');
    productsCold.push(Date.now() - t0);
    if (r.status === 401 || r.status === 404) {
      // Try alternate path
      const t1 = Date.now();
      const r2 = await apiCall(baseURL, token, 'get', '/api/products');
      productsCold[0] = Date.now() - t1;
    }
  }
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    await apiCall(baseURL, token, 'get', '/api/products?limit=200');
    productsWarm.push(Date.now() - t0);
  }

  // 2.c GET /api/customers — 5 samples
  const customers = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await apiCall(baseURL, token, 'get', '/api/customers?limit=100');
    customers.push(Date.now() - t0);
  }

  // 2.d Product search by barcode — 5 samples
  const search = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await apiCall(baseURL, token, 'get', '/api/products?search=7501234567890');
    search.push(Date.now() - t0);
  }

  // 2.e Health check
  const health = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await apiCall(baseURL, null, 'get', '/api/health');
    health.push(Date.now() - t0);
  }

  results.apiTimings = {
    login: statsBlock(loginSamples),
    productsCold_ms: productsCold[0] || null,
    productsWarm: statsBlock(productsWarm),
    customers: statsBlock(customers),
    productSearch: statsBlock(search),
    health: statsBlock(health),
  };
});

// ────────────────────────────────────────────────────────────────────
// 3) Sale completion flow — full POST /api/sales
// ────────────────────────────────────────────────────────────────────
test('PERF-03: POST /api/sales (full sale)', async ({ baseURL }) => {
  test.setTimeout(120_000);

  const token = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);
  if (!token) test.skip(true, 'admin login failed');

  // First fetch a real product list so we can build a valid sale payload
  const prodResp = await apiCall(baseURL, token, 'get', '/api/products?limit=10');
  let productIds = [];
  if (prodResp.status === 200) {
    const arr = Array.isArray(prodResp.body) ? prodResp.body
              : (prodResp.body && (prodResp.body.data || prodResp.body.products || prodResp.body.items)) || [];
    productIds = arr.map((p) => p.id || p.product_id || p.code).filter(Boolean).slice(0, 5);
  }

  const saleSamples = [];
  for (let i = 0; i < 5; i++) {
    const items = (productIds.length ? productIds : Array(5).fill('PERF-TEST-PRODUCT')).slice(0, 5).map((id, idx) => ({
      product_id: id,
      qty: 1,
      price: 10.0 + idx,
      tax: 0,
      discount: 0,
    }));
    const payload = {
      items,
      total: items.reduce((s, it) => s + it.price * it.qty, 0),
      payment_method: 'cash',
      cash_received: 100,
      change: 0,
      customer_id: null,
      tenant_id: 'TNT001',
      perf_test: true,
    };
    const t0 = Date.now();
    const r = await apiCall(baseURL, token, 'post', '/api/sales', payload, {
      'Idempotency-Key': `b41-perf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    const elapsed = Date.now() - t0;
    saleSamples.push(elapsed);
    // Status doesn't have to be 200 — even 400/422 timing is informative.
    // We only care about latency for performance.
  }

  results.flowTimings = {
    sale_post: statsBlock(saleSamples),
  };
});

// ────────────────────────────────────────────────────────────────────
// 4) UI flow timing — typing barcode, autocomplete, add to cart
// ────────────────────────────────────────────────────────────────────
test('PERF-04: UI flow timings (barcode + cart)', async ({ page, baseURL }) => {
  test.setTimeout(60_000);

  await loginAndPersist(page, baseURL);
  await page.goto('/salvadorex_web_v25.html', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2500); // settle defer scripts

  // Locate barcode input (different selectors fallback)
  const barcodeSelectors = ['#barcode-input', 'input[name="barcode"]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]'];
  let barcodeInput = null;
  for (const sel of barcodeSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      barcodeInput = loc;
      break;
    }
  }

  const barcodeFlow = [];
  if (barcodeInput) {
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await barcodeInput.fill('');
      await barcodeInput.type('7501234567890', { delay: 30 });
      await barcodeInput.press('Enter');
      // Wait briefly for any lookup to complete
      await page.waitForTimeout(800);
      barcodeFlow.push(Date.now() - t0);
    }
  }

  // Memory / FPS snapshot via PerfMonitor if running
  let perfSnapshot = null;
  try {
    perfSnapshot = await page.evaluate(() => {
      if (window.PerfMonitor && typeof window.PerfMonitor.summary === 'function') {
        return window.PerfMonitor.summary();
      }
      return null;
    });
  } catch (e) {
    perfSnapshot = { error: String(e.message || e) };
  }

  results.flowTimings.barcodeTyping = statsBlock(barcodeFlow);
  results.flowTimings.barcodeInputFound = !!barcodeInput;
  results.flowTimings.perfMonitorSnapshot = perfSnapshot;
  results.flowTimings.finalURL = page.url();
});

// ────────────────────────────────────────────────────────────────────
// 5) Final write — runs after all tests
// ────────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  // Compute basic scoring
  const targets = {
    FCP_ms: 1500,
    LCP_ms: 2500,
    TTI_approx_ms: 5000,
    Load_ms: 3000,
    CLS: 0.1,
    sale_p95: 500,
    productSearch_p95: 200,
  };
  const v = results.webVitals || {};
  const a = results.apiTimings || {};
  const f = results.flowTimings || {};
  const checks = [];
  function checkLT(label, actual, target) {
    if (actual == null) return;
    const ratio = actual / target;
    let cat = 'PASS';
    if (ratio > 1.5) cat = 'FAIL';
    else if (ratio > 1.0) cat = 'NEAR';
    checks.push({ metric: label, actual, target, ratio: +ratio.toFixed(2), category: cat });
  }
  checkLT('FCP', v.FCP_ms, targets.FCP_ms);
  checkLT('LCP', v.LCP_ms, targets.LCP_ms);
  checkLT('TTI', v.TTI_approx_ms, targets.TTI_approx_ms);
  checkLT('Load', v.Load_ms, targets.Load_ms);
  checkLT('CLS', v.CLS, targets.CLS);
  if (a.productSearch && a.productSearch.p95 != null) checkLT('ProductSearch_p95', a.productSearch.p95, targets.productSearch_p95);
  if (f.sale_post && f.sale_post.p95 != null) checkLT('Sale_p95', f.sale_post.p95, targets.sale_p95);
  const passes = checks.filter((c) => c.category === 'PASS').length;
  results.scoring = {
    targets,
    checks,
    passCount: passes,
    totalChecks: checks.length,
    passRate: checks.length ? +(passes / checks.length).toFixed(2) : 0,
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\n[B41-perf] results written to ${RESULTS_FILE}`);
});
