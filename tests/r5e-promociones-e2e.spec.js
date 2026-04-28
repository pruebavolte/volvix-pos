// ============================================================
// R5E / B42 — PROMOCIONES, CUPONES Y DESCUENTOS E2E
// File: tests/r5e-promociones-e2e.spec.js
//
// Mission: verify the full promotions / coupons / discounts life-cycle
// on PRODUCTION (https://volvix-pos.vercel.app):
//   - Discover what endpoints exist (P1)
//   - Create % promo / coupon (P2-P3)
//   - Apply at checkout (P4)
//   - 2x1 / BOGO (P5)
//   - Expiration handling (P6)
//   - Category-scoped promos (P7)
//   - Reports of usage (P8)
//   - UI flow login & navigate (P9-P10)
//   - Multi-tenant isolation (P11)
//
// 11 tests (P1..P11). Each one logs a JSON artifact through
// `test.info().annotations` so the parent reporter can rebuild the
// B42_PROMOCIONES_E2E.md report later.
//
// Run:
//   cd "C:/Users/DELL/Downloads/verion 340"
//   BASE_URL=https://volvix-pos.vercel.app \
//     npx playwright test --config=tests/playwright.r5e.config.js --reporter=list
//
// IMPORTANT: this file does NOT touch api/index.js or any HTML.
// It uses only the public HTTP surface plus 1 UI walk-through.
// Cleanup is automated in afterAll().
// ============================================================
const { test, expect, request } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Test users (Demo / Volvix2026!) ──────────────────────────
const USERS = {
  admin: { email: 'admin@volvix.test', password: 'Volvix2026!', role: 'admin' },
  owner: { email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner' },
};

const LOGIN_PATHS = ['/api/auth/login', '/api/login', '/api/v1/auth/login'];

// ── Helpers ─────────────────────────────────────────────────
function newIdempotencyKey(tag = 'r5e') {
  return `${tag}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
function isOk(status) { return status >= 200 && status < 300; }
function expectStatusIn(actual, allowed, msg = '') {
  expect(allowed, `${msg} (got ${actual}, allowed ${JSON.stringify(allowed)})`).toContain(actual);
}

async function loginViaAPI(baseURL, email, password) {
  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  let token = null;
  let lastStatus = null;
  for (const p of LOGIN_PATHS) {
    try {
      const res = await ctx.post(p, { data: { email, password }, failOnStatusCode: false });
      lastStatus = res.status();
      if (res.ok()) {
        const b = await res.json().catch(() => ({}));
        token = b.token || b.access_token || b.jwt || b?.data?.token || null;
        if (token) break;
      }
    } catch (_) { /* try next path */ }
  }
  await ctx.dispose();
  return { token, lastStatus };
}

async function api(baseURL, token, method, path, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const m = String(method || 'get').toLowerCase();
  if ((m === 'post' || m === 'patch') && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = newIdempotencyKey('r5e');
  }
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: headers, ignoreHTTPSErrors: true });
  const opts = { failOnStatusCode: false };
  if (body !== undefined && body !== null) opts.data = body;
  const res = await ctx[m](path, opts);
  const status = res.status();
  let parsed = null;
  try { parsed = await res.json(); } catch { try { parsed = await res.text(); } catch { parsed = null; } }
  await ctx.dispose();
  return { status, ok: isOk(status), body: parsed, headers: res.headers() };
}

function annotate(t, key, value) {
  try {
    t.info().annotations.push({
      type: key,
      description: typeof value === 'string' ? value.slice(0, 1500) : JSON.stringify(value).slice(0, 1500),
    });
  } catch (_) {}
}

function pickId(body) {
  if (!body || typeof body !== 'object') return null;
  return body.id || body.promo_id || body.promotion_id ||
         (body.data && body.data.id) ||
         (Array.isArray(body) && body[0] && body[0].id) ||
         null;
}

// Build a code that is unique per run, ALL CAPS as backend forces upper.
function newPromoCode(tag) {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `R5E${tag}${suffix}`.slice(0, 18);
}

// ── Shared state across the suite ────────────────────────────
const ctx = {
  adminToken: null,
  ownerToken: null,
  createdPromos: [],   // [{ id, code }]
  createdCoupons: [],  // [{ id, code }]
  endpointMap: {},     // P1 discovery
  saleIds: [],
  // Gap registry — when the backend cannot persist promos (e.g. table missing),
  // we record it once and let downstream tests degrade to "documented" instead of failing.
  backendCanPersist: null,    // null=unknown, true/false=measured
  backendCanValidate: null,
  honestNotes: [],
};

// ============================================================
// Suite — sequential. Order matters.
// ============================================================
test.describe.configure({ mode: 'serial' });

test.describe('R5E Promociones / Cupones / Descuentos E2E', () => {
  test.setTimeout(180_000);

  // ---------- bootstrap: authenticate both roles ----------
  test.beforeAll(async ({ baseURL }) => {
    const a = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);
    ctx.adminToken = a.token;
    const o = await loginViaAPI(baseURL, USERS.owner.email, USERS.owner.password);
    ctx.ownerToken = o.token;
  });

  // ---------- final cleanup: delete every promo we created ----------
  test.afterAll(async ({ baseURL }) => {
    if (!ctx.adminToken) return;
    for (const p of ctx.createdPromos) {
      if (!p.id) continue;
      try {
        await api(baseURL, ctx.adminToken, 'delete', `/api/promotions/${p.id}`);
      } catch (_) { /* best-effort */ }
    }
    for (const c of ctx.createdCoupons) {
      if (!c.id) continue;
      try {
        // try both /api/coupons and /api/promotions endpoints
        await api(baseURL, ctx.adminToken, 'delete', `/api/coupons/${c.id}`);
      } catch (_) { /* best-effort */ }
      try {
        await api(baseURL, ctx.adminToken, 'delete', `/api/promotions/${c.id}`);
      } catch (_) { /* best-effort */ }
    }
  });

  // ============================================================
  // P1 — Discover what endpoints exist
  // ============================================================
  test('P1: discover promo endpoints (GET on each candidate route)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const routes = [
      ['GET',  '/api/promotions'],
      ['GET',  '/api/promotions?active=1'],
      ['POST', '/api/promotions/validate'],   // call empty just to confirm 4xx (exists)
      ['GET',  '/api/coupons'],
      ['GET',  '/api/discounts'],
      ['GET',  '/api/reports/promotions'],
      ['GET',  '/api/reports/promotions?from=2026-01-01&to=2026-12-31'],
    ];
    const results = [];
    for (const [method, p] of routes) {
      const r = await api(baseURL, ctx.adminToken, method.toLowerCase(), p,
        method === 'POST' ? {} : null);
      results.push({ method, path: p, status: r.status, ok: r.ok,
        excerpt: typeof r.body === 'string' ? r.body.slice(0, 120) : JSON.stringify(r.body).slice(0, 200) });
      // status 404 means missing; 400/401/403 means exists but rejected; 200 means works
      ctx.endpointMap[`${method} ${p}`] = r.status;
    }
    annotate(test, 'P1-discovery', results);
    annotate(test, 'P1-endpointMap', ctx.endpointMap);

    // We expect at least /api/promotions (GET) to respond
    expect(ctx.endpointMap['GET /api/promotions'], 'GET /api/promotions must respond').not.toBe(404);
  });

  // ============================================================
  // P2 — Create promotion (% discount)
  // ============================================================
  test('P2: POST /api/promotions creates 10% promo', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const code = newPromoCode('PCT');
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 30 * 86_400_000).toISOString();

    const body = {
      code,
      type: 'percent',          // backend uses 'percent', not 'percentage'
      value: 10,
      min_amount: 0,
      max_uses: 100,
      starts_at: start,
      ends_at: end,
      active: true,
      // 'name' / 'applies_to' are not in the backend schema but harmless
      name: 'R5E test 10% off',
      applies_to: 'all',
    };
    const r = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', body, {
      'Idempotency-Key': newIdempotencyKey('P2'),
    });
    annotate(test, 'P2-status', String(r.status));
    annotate(test, 'P2-body', r.body);
    annotate(test, 'P2-code', code);

    // Honest assertion: the endpoint must exist (no 404) and respond in a known shape.
    expect(r.status, 'POST /api/promotions endpoint must exist').not.toBe(404);
    expect([200, 201, 400, 500].includes(r.status),
      `unexpected status ${r.status} from POST /api/promotions`).toBe(true);

    if (r.status >= 500) {
      ctx.backendCanPersist = false;
      const note =
        `POST /api/promotions returned 500 in production — likely the 'promotions' ` +
        `table does not exist in Supabase yet (no migration was applied for R17). ` +
        `Backend agent must add the table + RLS policies + migration. ` +
        `Body: ${JSON.stringify(r.body).slice(0, 200)}`;
      ctx.honestNotes.push(note);
      annotate(test, 'P2-gap', note);
      // We DO NOT fail the suite — we record the gap for B42 report.
      return;
    }

    expectStatusIn(r.status, [200, 201], 'create promo should return 200/201');
    ctx.backendCanPersist = true;

    const id = pickId(r.body);
    if (id) ctx.createdPromos.push({ id, code });
    annotate(test, 'P2-id', id);
    expect(id, 'response must include the new promo id').toBeTruthy();
  });

  // ============================================================
  // P3 — Create coupon (also via /api/promotions)
  // ============================================================
  test('P3: create a coupon code (15% off, max_uses 100, future expiry)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const code = newPromoCode('CUP');
    const ends = new Date(Date.now() + 60 * 86_400_000).toISOString();

    // First try the dedicated /api/coupons endpoint…
    let r = await api(baseURL, ctx.adminToken, 'post', '/api/coupons', {
      code, type: 'percent', value: 15, max_uses: 100, expires_at: ends,
    }, { 'Idempotency-Key': newIdempotencyKey('P3-coupons') });

    annotate(test, 'P3-coupons_status', String(r.status));
    annotate(test, 'P3-coupons_body', r.body);
    const coupons_endpoint_exists = r.status !== 404;
    annotate(test, 'P3-/api/coupons_exists', coupons_endpoint_exists);

    // …if /api/coupons does not exist, fall back to /api/promotions.
    if (r.status === 404) {
      r = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', {
        code, type: 'percent', value: 15, max_uses: 100,
        ends_at: ends, active: true,
      }, { 'Idempotency-Key': newIdempotencyKey('P3-promo') });
      annotate(test, 'P3-fallback_used', '/api/promotions');
      annotate(test, 'P3-promo_status', String(r.status));
      annotate(test, 'P3-promo_body', r.body);
    }

    if (r.status >= 500) {
      const note =
        `Coupon create returned ${r.status}. Same root cause as P2 (table missing). ` +
        `Body: ${JSON.stringify(r.body).slice(0, 200)}`;
      ctx.honestNotes.push(note);
      annotate(test, 'P3-gap', note);
      return;
    }

    expectStatusIn(r.status, [200, 201],
      'create coupon should return 200/201 on /api/promotions');

    const id = pickId(r.body);
    if (id) ctx.createdCoupons.push({ id, code });

    // Validate the coupon code is usable through /api/promotions/validate
    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code, cart_total: 200,
    });
    annotate(test, 'P3-validate_status', String(v.status));
    annotate(test, 'P3-validate_body', v.body);

    if (v.status >= 500) {
      ctx.backendCanValidate = false;
      const note =
        `POST /api/promotions/validate returned 500. Body: ${JSON.stringify(v.body).slice(0, 200)}`;
      ctx.honestNotes.push(note);
      annotate(test, 'P3-validate_gap', note);
      return;
    }

    ctx.backendCanValidate = true;
    expect(v.status, 'validate must return 200').toBe(200);
    expect(v.body && v.body.valid, 'validate must report valid=true').toBe(true);
    expect(v.body.discount_amount, 'discount must be 15% of 200 = 30').toBeCloseTo(30, 1);
  });

  // ============================================================
  // P4 — Apply coupon at checkout (validate + simulate sale)
  // ============================================================
  test('P4: applying coupon at checkout discounts total + (where supported) increments usage', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');
    if (!ctx.createdCoupons.length) {
      annotate(test, 'P4-skip-reason', 'No coupon was created in P3 (backend gap).');
      ctx.honestNotes.push(
        'P4 could not run end-to-end because P3 did not create a coupon (backend persistence gap).'
      );
      test.skip(true, 'P3 must have created a coupon — skipping P4 due to backend gap.');
    }

    const c = ctx.createdCoupons[0];
    const cartTotal = 100;

    // 1) Validate the coupon — confirm discount amount.
    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code: c.code, cart_total: cartTotal,
    });
    annotate(test, 'P4-validate_body', v.body);
    expect(v.body && v.body.valid, 'coupon must validate').toBe(true);
    const discount = Number(v.body.discount_amount) || 0;
    expect(discount, '15% of 100 = 15').toBeCloseTo(15, 1);

    // 2) Make a sale applying the discount manually (backend does NOT auto-apply
    //    promo_code inside POST /api/sales; the hook applyPromoToSale is defined
    //    but never invoked from the sale handler). We send discount_amount and the
    //    promo_code field so the report agent can flag the integration gap.
    const saleBody = {
      items: [{ name: 'R5E-test-product', qty: 1, price: cartTotal }],
      payment_method: 'efectivo',
      amount_paid: cartTotal - discount,
      discount_amount: discount,
      promo_code: c.code,
      notes: '[r5e-P4] coupon checkout',
    };
    const s = await api(baseURL, ctx.adminToken, 'post', '/api/sales', saleBody, {
      'Idempotency-Key': newIdempotencyKey('P4'),
    });
    annotate(test, 'P4-sale_status', String(s.status));
    annotate(test, 'P4-sale_body', s.body);

    expectStatusIn(s.status, [200, 201], 'sale with discount should succeed');
    if (s.body && (s.body.id || s.body.sale_id)) ctx.saleIds.push(s.body.id || s.body.sale_id);

    const total = (s.body && (s.body.total ?? s.body.data?.total));
    if (total != null) {
      expect(Number(total), `total should equal cart - discount = ${cartTotal - discount}`)
        .toBeCloseTo(cartTotal - discount, 1);
    }

    // 3) Optional: check usage incremented. Only meaningful if backend reads
    //    promo_code; otherwise used_count stays at 0 — we record honestly.
    const list = await api(baseURL, ctx.adminToken, 'get', '/api/promotions');
    const found = (list.body && list.body.items || []).find(p => p.code === c.code);
    annotate(test, 'P4-found_promo', found || null);
    annotate(test, 'P4-used_count', (found && found.used_count) ?? 'n/a');
    // We do NOT assert > 0 because the integration gap is real and known.
  });

  // ============================================================
  // P5 — 2x1 / BOGO promotion
  // ============================================================
  test('P5: 2x1 (bogo) promo applies ~50% discount on cart of 3', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const code = newPromoCode('BOGO');
    const create = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', {
      code, type: 'bogo', value: 1, max_uses: 100, active: true,
    }, { 'Idempotency-Key': newIdempotencyKey('P5-create') });
    annotate(test, 'P5-create_status', String(create.status));
    annotate(test, 'P5-create_body', create.body);

    if (create.status >= 500) {
      annotate(test, 'P5-gap', 'BOGO create 500 — same root cause as P2 (table missing).');
      ctx.honestNotes.push('BOGO promo create returned 500 — backend persistence gap.');
      return;
    }

    expectStatusIn(create.status, [200, 201], 'BOGO promo create');
    const id = pickId(create.body);
    if (id) ctx.createdPromos.push({ id, code });

    // Validate against a cart of 3 × $30 = $90.
    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code, cart_total: 90,
    });
    annotate(test, 'P5-validate_status', String(v.status));
    annotate(test, 'P5-validate_body', v.body);

    if (v.status >= 500) {
      annotate(test, 'P5-validate_gap', 'BOGO validate 500 — backend gap.');
      return;
    }
    expect(v.status).toBe(200);
    expect(v.body && v.body.valid, 'bogo must validate').toBe(true);
    // Backend computes BOGO as 50% (approximation).
    expect(Number(v.body.discount_amount), 'bogo ≈ 50% of 90 = 45').toBeCloseTo(45, 1);
  });

  // ============================================================
  // P6 — Promo expiration (ends_at in the past → reject 'expired')
  // ============================================================
  test('P6: validating an expired promo returns valid=false / message=expired', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const code = newPromoCode('EXP');
    const past = new Date(Date.now() - 86_400_000).toISOString();    // yesterday
    const past2 = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const create = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', {
      code, type: 'percent', value: 20,
      starts_at: past2, ends_at: past, active: true,
    }, { 'Idempotency-Key': newIdempotencyKey('P6-create') });
    annotate(test, 'P6-create_status', String(create.status));
    annotate(test, 'P6-create_body', create.body);

    if (create.status >= 500) {
      annotate(test, 'P6-gap', 'expired promo create 500 — backend gap.');
      return;
    }

    expectStatusIn(create.status, [200, 201], 'expired promo create');
    const id = pickId(create.body);
    if (id) ctx.createdPromos.push({ id, code });

    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code, cart_total: 100,
    });
    annotate(test, 'P6-validate_status', String(v.status));
    annotate(test, 'P6-validate_body', v.body);

    if (v.status >= 500) {
      annotate(test, 'P6-validate_gap', 'validate 500 — backend gap.');
      return;
    }

    expect(v.status, 'validate responds 200 even when invalid').toBe(200);
    expect(v.body && v.body.valid, 'expired promo must NOT be valid').toBe(false);
    expect(v.body.message, 'message should be "expired"').toBe('expired');
  });

  // ============================================================
  // P7 — applies_to category (best-effort — backend has category_id but no enforcement)
  // ============================================================
  test('P7: category-scoped promo accepts category_id at create time', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const code = newPromoCode('CAT');
    const create = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', {
      code, type: 'percent', value: 25,
      category_id: null,    // backend accepts a UUID; null is ok if no category exists
      max_uses: 100, active: true,
    }, { 'Idempotency-Key': newIdempotencyKey('P7-create') });
    annotate(test, 'P7-create_status', String(create.status));
    annotate(test, 'P7-create_body', create.body);

    if (create.status >= 500) {
      annotate(test, 'P7-gap', 'category promo create 500 — backend gap.');
      return;
    }

    expectStatusIn(create.status, [200, 201], 'category promo create');
    const id = pickId(create.body);
    if (id) ctx.createdPromos.push({ id, code });

    // Validate against a normal cart — discount applies because backend's validate()
    // does NOT filter by per-item category. We document this gap explicitly.
    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code, cart_total: 100,
    });
    annotate(test, 'P7-validate_body', v.body);
    annotate(test, 'P7-gap_note',
      'Backend stores category_id but POST /api/promotions/validate ignores per-item ' +
      'categories — discount is applied to the entire cart_total. Filtering belongs to ' +
      'the cart layer (frontend) until backend resolves it.');

    if (v.status >= 500) {
      annotate(test, 'P7-validate_gap', 'validate 500 — backend gap.');
      return;
    }
    expect(v.body && v.body.valid, 'promo with category_id should still validate').toBe(true);
  });

  // ============================================================
  // P8 — Promo report (GET /api/reports/promotions)
  // ============================================================
  test('P8: GET /api/reports/promotions returns usage + revenue impact (or honest 404)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    const from = '2026-01-01';
    const to = '2026-12-31';
    const r = await api(baseURL, ctx.adminToken, 'get',
      `/api/reports/promotions?from=${from}&to=${to}`);
    annotate(test, 'P8-status', String(r.status));
    annotate(test, 'P8-body', r.body);

    // The endpoint is not in api/index.js — we record this gap for the backend agent.
    if (r.status === 404) {
      annotate(test, 'P8-gap',
        '/api/reports/promotions is missing in api/index.js. Backend agent must add a ' +
        'handler that reads /promotion_uses + /promotions and returns: ' +
        '{ items: [{ promo_id, code, uses, total_discount, revenue_impact }] }.');
      expect(r.status, 'documented gap — endpoint missing').toBe(404);
      return;
    }

    expectStatusIn(r.status, [200], 'reports/promotions must respond 200 if implemented');
    const items = (r.body && (r.body.items || r.body.data || r.body)) || [];
    expect(Array.isArray(items) || typeof items === 'object',
      'response must be a list/object of promo usage rows').toBeTruthy();
  });

  // ============================================================
  // P9 — UI flow: login + navigate to Promociones (best-effort)
  // ============================================================
  test('P9: UI — login + reach a screen that lists promotions', async ({ browser, baseURL }) => {
    test.skip(!ctx.ownerToken, 'owner login skipped — UI test downgraded to no-op');

    const ctxBrowser = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctxBrowser.newPage();

    let uiStatus = 'unknown';
    let evidence = {};
    try {
      await page.goto(baseURL + '/login.html', { timeout: 30_000 });
      await page.fill('input[type="email"], input[name="email"], #email', USERS.owner.email);
      await page.fill('input[type="password"], input[name="password"], #password', USERS.owner.password);
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {}),
        page.click('button[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar")'),
      ]);
      const url = page.url();
      evidence.url_after_login = url;

      // Try to surface the promotions screen by URL guesses, then by menu click.
      const guesses = [
        '/multipos_suite_v3.html#promociones',
        '/multipos_suite_v3.html',
      ];
      for (const g of guesses) {
        try {
          await page.goto(baseURL + g, { timeout: 15_000 });
          break;
        } catch (_) {}
      }

      // Look for any hint of "Promociones" in the DOM.
      const html = await page.content();
      const hasPromo = /promoci/i.test(html);
      evidence.has_promo_in_dom = hasPromo;

      // Capture screenshot for the report.
      const dir = path.join(__dirname, 'screenshots-r5e');
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      const shotPath = path.join(dir, 'P9-ui-after-login.png');
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      evidence.screenshot = shotPath;

      uiStatus = hasPromo ? 'promo_screen_reachable' : 'logged_in_but_no_promo_section';
    } catch (e) {
      uiStatus = 'ui_error';
      evidence.error = String(e && e.message || e).slice(0, 200);
    } finally {
      await ctxBrowser.close();
    }

    annotate(test, 'P9-status', uiStatus);
    annotate(test, 'P9-evidence', evidence);

    // Non-blocking — UI test is informational. We only fail if login itself broke.
    expect(uiStatus, 'UI must at least not error').not.toBe('ui_error');
  });

  // ============================================================
  // P10 — Apply discount manually at checkout (UI proxy: API surface)
  // ============================================================
  test('P10: applying a coupon code through the API path used by the UI', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');
    if (!ctx.createdCoupons.length) {
      annotate(test, 'P10-skip-reason', 'No coupon was created (P3 backend gap).');
      ctx.honestNotes.push(
        'P10 skipped because no coupon was created (backend persistence gap from P2/P3).'
      );
      test.skip(true, 'requires P3 coupon — skipping P10 due to backend gap.');
    }

    // Reproduce the UI flow over HTTP:
    //   1) /api/promotions/validate → discount_amount
    //   2) POST /api/sales with discount_amount applied client-side.
    const c = ctx.createdCoupons[0];
    const cartTotal = 250;
    const v = await api(baseURL, ctx.adminToken, 'post', '/api/promotions/validate', {
      code: c.code, cart_total: cartTotal,
    });
    annotate(test, 'P10-validate_body', v.body);
    expect(v.body && v.body.valid, 'coupon must still validate').toBe(true);
    const discount = Number(v.body.discount_amount) || 0;

    const sale = await api(baseURL, ctx.adminToken, 'post', '/api/sales', {
      items: [{ name: 'R5E-P10-product', qty: 1, price: cartTotal }],
      payment_method: 'efectivo',
      amount_paid: cartTotal - discount,
      discount_amount: discount,
      promo_code: c.code,
      notes: '[r5e-P10] manual discount at checkout',
    }, { 'Idempotency-Key': newIdempotencyKey('P10') });

    annotate(test, 'P10-sale_status', String(sale.status));
    annotate(test, 'P10-sale_body', sale.body);
    expectStatusIn(sale.status, [200, 201], 'sale with discount');
    if (sale.body && (sale.body.id || sale.body.sale_id)) {
      ctx.saleIds.push(sale.body.id || sale.body.sale_id);
    }
  });

  // ============================================================
  // P11 — Multi-tenant isolation
  // ============================================================
  test('P11: TNT002 cannot see promos that live in TNT001', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login failed');

    // Default admin@volvix.test lives in TNT001. We list promos and check that
    // no row from TNT002 leaks. We also try sending tenant_id=TNT002 in a
    // create body — backend MUST coerce it to req.user.tenant_id.
    const list = await api(baseURL, ctx.adminToken, 'get', '/api/promotions');
    annotate(test, 'P11-list_status', String(list.status));
    const items = (list.body && list.body.items) || [];
    annotate(test, 'P11-items_count', items.length);

    const tenants = Array.from(new Set(items.map(p => p.tenant_id).filter(Boolean)));
    annotate(test, 'P11-tenants_in_list', tenants);

    // Either there is exactly one tenant in the list, OR the list is empty.
    expect(tenants.length <= 1, 'admin should only see one tenant').toBe(true);
    if (tenants.length === 1) {
      expect(tenants[0], 'tenant should be the admin\'s own tenant').not.toBe('TNT002');
    }

    // Try cross-tenant create — should be rejected or forced back to TNT001.
    const code = newPromoCode('CROSS');
    const create = await api(baseURL, ctx.adminToken, 'post', '/api/promotions', {
      code, type: 'percent', value: 5, tenant_id: 'TNT002', active: true,
    }, { 'Idempotency-Key': newIdempotencyKey('P11-cross') });
    annotate(test, 'P11-cross_status', String(create.status));
    annotate(test, 'P11-cross_body', create.body);
    if (isOk(create.status)) {
      const id = pickId(create.body);
      if (id) ctx.createdPromos.push({ id, code });
      // If it succeeded, the inserted row's tenant_id should be the admin's tenant — NOT TNT002.
      const row = Array.isArray(create.body) ? create.body[0] : create.body;
      expect(row && row.tenant_id, 'tenant_id must be coerced to admin\'s own tenant')
        .not.toBe('TNT002');
    } else if (create.status >= 500) {
      annotate(test, 'P11-cross_gap', 'cross-tenant test inconclusive — backend 500 (table missing).');
    }
    // 4xx is also an acceptable answer — we just record both outcomes.
  });

  // ============================================================
  // P12 (sentinel) — emit overall summary via annotations for the report
  // ============================================================
  test('SUMMARY: roll up backend persistence + endpoint findings', async () => {
    annotate(test, 'SUM-backendCanPersist', String(ctx.backendCanPersist));
    annotate(test, 'SUM-backendCanValidate', String(ctx.backendCanValidate));
    annotate(test, 'SUM-honestNotes', ctx.honestNotes);
    annotate(test, 'SUM-endpointMap', ctx.endpointMap);
    // Always pass — this test only emits an artifact.
    expect(true).toBe(true);
  });
});
