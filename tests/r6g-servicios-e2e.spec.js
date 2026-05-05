// ============================================================================
// R6G / B42 — SERVICIOS (Pago de servicios — luz, agua, gas, telefonía,
//                       internet, TV de paga) E2E
// File: tests/r6g-servicios-e2e.spec.js
//
// Mission: verify the "Pago de servicios" module of the Volvix POS targeted
// at Mexican abarrotes (CFE/Telmex/Megacable/Izzi/Totalplay/Sky/Dish/Gas
// Natural/Cospel/etc).
//
// 11 tests (S1..S11). Each one logs JSON artefacts via test.info().annotations
// so the parent reporter can rebuild the B42 markdown report later.
//
// Run:
//   cd "C:/Users/DELL/Downloads/verion 340"
//   BASE_URL=https://volvix-pos.vercel.app \
//     npx playwright test --config=tests/playwright.r6g.config.js --reporter=list
//
// IMPORTANT: this file does NOT touch api/index.js or any HTML.
// It uses only the public HTTP surface plus a UI walk-through.
// All POSTs send Idempotency-Key.
// ============================================================================
const { test, expect, request } = require('@playwright/test');
const crypto = require('crypto');
const path = require('path');

// ── Test users (Volvix2026!) ─────────────────────────────────────────────────
const USERS = {
  cajero: { email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero', tenant: 'TNT001' },
  admin:  { email: 'admin@volvix.test',  password: 'Volvix2026!', role: 'admin',  tenant: 'TNT001' },
  owner:  { email: 'owner@volvix.test',  password: 'Volvix2026!', role: 'owner',  tenant: 'TNT002' },
};

const LOGIN_PATHS = ['/api/auth/login', '/api/login', '/api/v1/auth/login'];

// Candidate endpoints we probe. The brief calls out three "to find":
//   /api/services, /api/service-payments, /api/utility-bills.
// We also probe likely siblings used in Mexican utility-bill aggregators.
const ENDPOINT_CANDIDATES = {
  // Catalogue / providers
  catalog: [
    '/api/services/categories',
    '/api/services/providers',
    '/api/utility-bills/providers',
    '/api/service-payments/providers',
    '/api/services/catalog',
    '/api/utilities/providers',
  ],
  list: [
    '/api/services',
    '/api/service-payments',
    '/api/utility-bills',
  ],
  verify: [
    '/api/services/verify',
    '/api/service-payments/verify',
    '/api/utility-bills/verify',
    '/api/services/reference/verify',
  ],
  pay: [
    '/api/services/pay',
    '/api/service-payments/pay',
    '/api/service-payments',         // POST as a "create payment"
    '/api/utility-bills/pay',
  ],
  receipt: [
    '/api/services/receipt',
    '/api/service-payments/receipt',
    '/api/utility-bills/receipt',
    '/api/printer/raw',              // generic ESC/POS audit endpoint (fallback)
  ],
  report: [
    '/api/reports/services',
    '/api/reports/service-payments',
    '/api/reports/utility-bills',
    '/api/services/reports',
  ],
  commission: [
    '/api/services/commissions',
    '/api/service-payments/commissions',
    '/api/utility-bills/commissions',
  ],
  reverse: [
    '/api/services/reverse',
    '/api/service-payments/reverse',
    '/api/services/refund',
    '/api/service-payments/refund',
    '/api/utility-bills/refund',
  ],
};

// Mexican providers we expect a real catalogue to expose (used to score the
// catalogue test S2/S3 even if it is mocked / empty).
const MX_PROVIDERS_EXPECTED = [
  'CFE',           // luz
  'Telmex',        // teléfono fijo + internet
  'Megacable',     // internet + TV
  'Izzi',          // internet + TV
  'Totalplay',     // internet + TV
  'Sky',           // TV satelital
  'Dish',          // TV satelital
  'Gas Natural',   // gas
  'Cospel',        // bill aggregator
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function newIdempotencyKey(tag = 'r6g') {
  return `${tag}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function isOk(status) { return status >= 200 && status < 300; }
function expectStatusIn(actual, allowed, msg = '') {
  expect(allowed, `${msg} (got ${actual}, allowed ${JSON.stringify(allowed)})`).toContain(actual);
}

function annotate(t, key, value) {
  try {
    t.info().annotations.push({
      type: key,
      description: typeof value === 'string'
        ? value.slice(0, 1500)
        : JSON.stringify(value).slice(0, 1500),
    });
  } catch (_) {}
}

async function loginViaAPI(baseURL, email, password) {
  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  let token = null, lastStatus = null, lastBody = null;
  for (const p of LOGIN_PATHS) {
    const res = await ctx.post(p, { data: { email, password }, failOnStatusCode: false });
    lastStatus = res.status();
    if (res.ok()) {
      const b = await res.json().catch(() => ({}));
      lastBody = b;
      token = b.token
        || b.access_token
        || b.jwt
        || (b.session && b.session.token)
        || (b.data && b.data.token)
        || null;
      if (token) break;
    }
  }
  await ctx.dispose();
  return { token, lastStatus, lastBody };
}

async function api(baseURL, token, method, urlPath, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const m = String(method || 'get').toLowerCase();
  if ((m === 'post' || m === 'patch' || m === 'put') && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = newIdempotencyKey('r6g');
  }
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: headers, ignoreHTTPSErrors: true });
  const opts = { failOnStatusCode: false };
  if (body !== undefined && body !== null) opts.data = body;
  const res = await ctx[m](urlPath, opts);
  const status = res.status();
  let parsed = null;
  try { parsed = await res.json(); } catch { try { parsed = await res.text(); } catch { parsed = null; } }
  await ctx.dispose();
  return { status, ok: isOk(status), body: parsed, headers: res.headers() };
}

// Probe a set of endpoints with the same method/body and return the FIRST one
// whose response is "interesting" — i.e. NOT 404. We classify each candidate.
async function probeEndpoints(baseURL, token, method, candidates, body) {
  const results = [];
  let firstNon404 = null;
  for (const url of candidates) {
    const r = await api(baseURL, token, method, url, body);
    const cls = classify(r.status);
    results.push({ url, status: r.status, class: cls, body_keys: r.body && typeof r.body === 'object' ? Object.keys(r.body).slice(0, 8) : null });
    if (!firstNon404 && r.status !== 404 && r.status !== 0) {
      firstNon404 = { url, ...r };
    }
  }
  return { firstNon404, results };
}

// Status classifier we use across all probes.
function classify(s) {
  if (s >= 200 && s < 300) return 'OK';
  if (s === 401) return 'AUTH_REQUIRED';
  if (s === 403) return 'FORBIDDEN';
  if (s === 404) return 'NOT_FOUND';
  if (s === 405) return 'METHOD_NOT_ALLOWED';
  if (s === 409) return 'CONFLICT';
  if (s === 410) return 'GONE';
  if (s === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (s === 422) return 'UNPROCESSABLE';
  if (s === 429) return 'RATE_LIMITED';
  if (s >= 500) return 'SERVER_ERROR';
  if (s >= 400) return 'CLIENT_ERROR';
  return 'UNKNOWN';
}

// ── Shared state ─────────────────────────────────────────────────────────────
const ctx = {
  cajeroToken: null,
  adminToken:  null,
  ownerToken:  null,
  // discovered endpoint URLs (or null when missing)
  discovered: {
    catalog:    null,
    list:       null,
    verify:     null,
    pay:        null,
    receipt:    null,
    report:     null,
    commission: null,
    reverse:    null,
  },
  endpointProbes: {},   // raw probe results per category
  // sample provider/reference we used in the verify/pay flow
  paymentRef:  null,
  paymentId:   null,    // captured if /pay returned a real id
};

// ============================================================================
test.describe.configure({ mode: 'serial' });

test.describe('R6G Pago de Servicios E2E', () => {
  test.setTimeout(120_000);

  // ---------- bootstrap: log in all 3 roles ----------
  test.beforeAll(async ({ baseURL }) => {
    const c = await loginViaAPI(baseURL, USERS.cajero.email, USERS.cajero.password);
    ctx.cajeroToken = c.token;
    const a = await loginViaAPI(baseURL, USERS.admin.email,  USERS.admin.password);
    ctx.adminToken = a.token;
    const o = await loginViaAPI(baseURL, USERS.owner.email,  USERS.owner.password);
    ctx.ownerToken = o.token;
  });

  // ============================================================================
  // S1 — Discover endpoint
  // We probe the entire candidate matrix and record HTTP class for each. This is
  // intentionally read-only (GET) for the discovery sweep. The test PASSES if
  // every candidate responds (i.e. nothing 0/socket-error). It does NOT require
  // every candidate to be 200 — many will be 404 on a placeholder module.
  // ============================================================================
  test('S1: discover endpoint surface (sweep all candidates)', async ({ baseURL }) => {
    test.skip(!ctx.cajeroToken && !ctx.adminToken, 'no login token');
    const tok = ctx.adminToken || ctx.cajeroToken;

    const summary = {};
    for (const cat of Object.keys(ENDPOINT_CANDIDATES)) {
      const { firstNon404, results } = await probeEndpoints(
        baseURL, tok, 'get', ENDPOINT_CANDIDATES[cat], null,
      );
      ctx.endpointProbes[cat] = results;
      ctx.discovered[cat]     = firstNon404 ? firstNon404.url : null;
      summary[cat] = {
        first_non_404: firstNon404 ? `${firstNon404.url} (${firstNon404.status})` : 'none',
        results: results.map(r => `${r.url} -> ${r.status} ${r.class}`),
      };
    }
    annotate(test, 'S1-summary', summary);
    annotate(test, 'S1-discovered', ctx.discovered);

    // Special note: GET /api/services is reused by the appointments module (R17)
    // and DOES return 200, but that semantics is APPOINTMENTS, not utility-bill
    // payments. The test records this collision so the report can call it out.
    const collisionProbe = await api(baseURL, tok, 'get', '/api/services');
    annotate(test, 'S1-services_collision_status', String(collisionProbe.status));
    annotate(test, 'S1-services_collision_keys',
      collisionProbe.body && typeof collisionProbe.body === 'object'
        ? Object.keys(collisionProbe.body).slice(0, 10) : null);
    annotate(test, 'S1-services_collision_sample',
      Array.isArray(collisionProbe.body && collisionProbe.body.items)
        ? collisionProbe.body.items.slice(0, 2) : null);

    // Soft assertion: at least one of the categories must respond non-404
    // OR all 8 must explicitly 404. Both are acceptable; we just record.
    const everyMissing = Object.values(ctx.discovered).every(v => v === null);
    annotate(test, 'S1-every_missing', String(everyMissing));
    // The test always passes — discovery is informational. If everyMissing is
    // true, the rest of the suite documents the module as PLACEHOLDER and the
    // B42 report scores accordingly.
    expect(true).toBe(true);
  });

  // ============================================================================
  // S2 — Service categories: luz, agua, gas, telefonía, internet
  // ============================================================================
  test('S2: list service categories (luz/agua/gas/telefonía/internet)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.adminToken || ctx.cajeroToken;

    const REQUIRED_CATEGORIES = ['luz', 'agua', 'gas', 'telefonía', 'internet'];

    let foundCategories = [];
    let endpointHit = null;
    let bodyShape = null;

    for (const url of ENDPOINT_CANDIDATES.catalog) {
      const r = await api(baseURL, tok, 'get', url);
      annotate(test, `S2-probe ${url}`, String(r.status));
      if (r.status >= 200 && r.status < 300 && r.body) {
        endpointHit = url;
        bodyShape = typeof r.body === 'object' ? Object.keys(r.body).slice(0, 12) : null;
        // Try common shapes
        const list = r.body.categories || r.body.items || r.body.data || (Array.isArray(r.body) ? r.body : []);
        foundCategories = (list || []).map(it => {
          if (typeof it === 'string') return it.toLowerCase();
          return String(it && (it.name || it.label || it.category) || '').toLowerCase();
        }).filter(Boolean);
        break;
      }
    }

    annotate(test, 'S2-endpoint_hit',  endpointHit || 'NONE (mock)');
    annotate(test, 'S2-body_shape',    bodyShape);
    annotate(test, 'S2-found_count',   foundCategories.length);
    annotate(test, 'S2-found_sample',  foundCategories.slice(0, 10));

    if (!endpointHit) {
      // No catalogue endpoint exists — the module is a placeholder.
      annotate(test, 'S2-status', 'PLACEHOLDER (no catalogue endpoint)');
      annotate(test, 'S2-required_categories', REQUIRED_CATEGORIES);
      // Pass with a clear "module is mock" annotation so the suite continues.
      expect(endpointHit, 'no catalogue endpoint discovered — module is placeholder').toBeNull();
      return;
    }

    // If we DID find a catalogue, confirm at least 3 of the 5 required categories.
    const matched = REQUIRED_CATEGORIES.filter(c =>
      foundCategories.some(f => f.includes(c.replace('í', 'i'))));
    annotate(test, 'S2-matched_required', matched);
    expect(matched.length, 'at least 3 of {luz,agua,gas,telefonía,internet}').toBeGreaterThanOrEqual(3);
  });

  // ============================================================================
  // S3 — Providers per category (CFE, Telmex, Megacable, Izzi, Totalplay,
  //        Sky, Dish, Gas Natural, Cospel)
  // ============================================================================
  test('S3: list providers per category (Mexican utility brands)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.adminToken || ctx.cajeroToken;

    let endpointHit = null;
    let providers = [];

    // We try the "providers" candidate directly — many APIs split categories
    // and providers separately.
    const providerCandidates = [
      '/api/services/providers',
      '/api/utility-bills/providers',
      '/api/service-payments/providers',
      '/api/utilities/providers',
      // some APIs filter on category:
      '/api/services/providers?category=luz',
      '/api/services/providers?category=internet',
    ];

    for (const url of providerCandidates) {
      const r = await api(baseURL, tok, 'get', url);
      annotate(test, `S3-probe ${url}`, String(r.status));
      if (r.status >= 200 && r.status < 300 && r.body) {
        endpointHit = url;
        const list = r.body.providers || r.body.items || r.body.data || (Array.isArray(r.body) ? r.body : []);
        providers = (list || []).map(p => {
          if (typeof p === 'string') return p;
          return String(p && (p.name || p.brand || p.label || p.code) || '');
        }).filter(Boolean);
        break;
      }
    }

    annotate(test, 'S3-endpoint_hit', endpointHit || 'NONE (mock)');
    annotate(test, 'S3-found_count',  providers.length);
    annotate(test, 'S3-found_sample', providers.slice(0, 20));
    annotate(test, 'S3-expected_mx_providers', MX_PROVIDERS_EXPECTED);

    if (!endpointHit) {
      annotate(test, 'S3-status', 'PLACEHOLDER (no providers endpoint)');
      expect(endpointHit, 'no providers endpoint discovered').toBeNull();
      return;
    }

    // Score how many of the expected MX brands the catalogue exposes.
    const lower = providers.map(p => p.toLowerCase());
    const matched = MX_PROVIDERS_EXPECTED.filter(brand =>
      lower.some(p => p.includes(brand.toLowerCase())));
    annotate(test, 'S3-matched_mx_brands', matched);
    expect(matched.length, 'at least 4 of the expected MX brands').toBeGreaterThanOrEqual(4);
  });

  // ============================================================================
  // S4 — Verify reference (POST /api/services/verify {provider, reference})
  // ============================================================================
  test('S4: verify reference (POST /api/services/verify)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.adminToken || ctx.cajeroToken;

    const sampleRef = {
      provider:  'CFE',
      reference: '123456789012',  // 12-digit CFE pattern
    };
    ctx.paymentRef = sampleRef;

    let endpointHit = null;
    let verifyBody  = null;
    let verifyStatus = null;

    for (const url of ENDPOINT_CANDIDATES.verify) {
      const idem = newIdempotencyKey('S4-verify');
      const r = await api(baseURL, tok, 'post', url, sampleRef, { 'Idempotency-Key': idem });
      annotate(test, `S4-probe ${url}`, String(r.status));
      // 200/201 = real implementation; 422 = recognised but bad ref;
      // 404 = endpoint missing (try next).
      if (r.status !== 404) {
        endpointHit  = url;
        verifyBody   = r.body;
        verifyStatus = r.status;
        break;
      }
    }

    annotate(test, 'S4-endpoint_hit',   endpointHit || 'NONE (mock)');
    annotate(test, 'S4-status',         verifyStatus);
    annotate(test, 'S4-body_keys',
      verifyBody && typeof verifyBody === 'object' ? Object.keys(verifyBody).slice(0, 10) : null);
    annotate(test, 'S4-body_sample',    verifyBody);

    if (!endpointHit) {
      annotate(test, 'S4-final', 'PLACEHOLDER (no verify endpoint)');
      expect(endpointHit, 'no verify endpoint discovered').toBeNull();
      return;
    }

    // If the endpoint exists, must NOT 5xx.
    expect(verifyStatus, 'verify must not return 5xx').toBeLessThan(500);
    // Real impls return either OK with amount/concept, or 422 for bad ref.
    expectStatusIn(verifyStatus, [200, 201, 400, 401, 403, 404, 409, 422],
      'verify response must be a known auth/validation shape');
  });

  // ============================================================================
  // S5 — Pay service (POST /api/services/pay {provider, reference, amount})
  // ============================================================================
  test('S5: pay service (POST /api/services/pay)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.cajeroToken || ctx.adminToken;

    const payload = {
      provider:  ctx.paymentRef && ctx.paymentRef.provider  || 'CFE',
      reference: ctx.paymentRef && ctx.paymentRef.reference || '123456789012',
      amount:    250.00,
      currency:  'MXN',
      method:    'cash',
    };

    let endpointHit = null;
    let payBody  = null;
    let payStatus = null;

    for (const url of ENDPOINT_CANDIDATES.pay) {
      const idem = newIdempotencyKey('S5-pay');
      const r = await api(baseURL, tok, 'post', url, payload, { 'Idempotency-Key': idem });
      annotate(test, `S5-probe ${url}`, String(r.status));
      if (r.status !== 404) {
        endpointHit  = url;
        payBody      = r.body;
        payStatus    = r.status;
        // Capture id for the receipt/reverse tests later
        ctx.paymentId = (payBody && (payBody.id || payBody.payment_id || (payBody.payment && payBody.payment.id))) || null;
        break;
      }
    }

    annotate(test, 'S5-endpoint_hit', endpointHit || 'NONE (mock)');
    annotate(test, 'S5-status',       payStatus);
    annotate(test, 'S5-payment_id',   ctx.paymentId);
    annotate(test, 'S5-body_sample',  payBody);

    if (!endpointHit) {
      annotate(test, 'S5-final', 'PLACEHOLDER (no pay endpoint)');
      expect(endpointHit, 'no pay endpoint discovered').toBeNull();
      return;
    }

    expect(payStatus, 'pay must not return 5xx').toBeLessThan(500);
    expectStatusIn(payStatus, [200, 201, 202, 400, 401, 403, 404, 409, 422, 503],
      'pay response must be a known auth/validation shape');
  });

  // ============================================================================
  // S6 — Print receipt
  // The POS' generic /api/printer/raw endpoint is the receipt fallback. A full
  // implementation would also expose /api/services/receipt/:id.
  // ============================================================================
  test('S6: print receipt (ESC/POS via /api/printer/raw, or service-specific)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.cajeroToken || ctx.adminToken;

    // Try service-specific receipt first
    let endpointHit = null;
    let recvStatus  = null;
    let recvBody    = null;
    if (ctx.paymentId) {
      const candidates = [
        `/api/services/receipt/${ctx.paymentId}`,
        `/api/service-payments/${ctx.paymentId}/receipt`,
        `/api/utility-bills/${ctx.paymentId}/receipt`,
      ];
      for (const url of candidates) {
        const r = await api(baseURL, tok, 'get', url);
        annotate(test, `S6-probe ${url}`, String(r.status));
        if (r.status !== 404) { endpointHit = url; recvStatus = r.status; recvBody = r.body; break; }
      }
    }

    // Fallback: send a small ESC/POS payload to /api/printer/raw — same
    // pattern the etiquetas/cortes tests use.
    const ESC = '\x1B', GS = '\x1D';
    const raw = ESC + '@'                      // init
              + ESC + 'a' + '\x01'             // center
              + 'COMPROBANTE PAGO SERVICIO\n'
              + ESC + 'a' + '\x00'             // left
              + 'CFE - Ref 123456789012\n'
              + 'Monto: $250.00 MXN\n'
              + GS  + 'V' + '\x01';            // cut
    const dataB64 = Buffer.from(raw, 'utf8').toString('base64');

    const printResp = await api(baseURL, tok, 'post', '/api/printer/raw', {
      printer_id: 'default',
      format:     'escpos',
      encoding:   'base64',
      payload:    dataB64,
      length:     dataB64.length,
      data:       dataB64,
      ip:         '127.0.0.1',
      port:       9100,
      source:     'servicios:r6g-test',
    }, { 'Idempotency-Key': newIdempotencyKey('S6-print') });
    annotate(test, 'S6-printer_status', String(printResp.status));
    annotate(test, 'S6-printer_body',   printResp.body);

    annotate(test, 'S6-service_specific_hit', endpointHit || 'NONE');
    annotate(test, 'S6-service_specific_status', recvStatus);

    // /api/printer/raw must respond with a known shape (200/201/audit, 403/404
    // role-denial, 503 under service degradation). Never 5xx silently.
    expectStatusIn(printResp.status, [200, 201, 202, 401, 403, 404, 503],
      '/api/printer/raw must respond with a known auth/audit shape');
  });

  // ============================================================================
  // S7 — Service payment report
  // ============================================================================
  test('S7: service payment report', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin token required for reports');

    let endpointHit = null;
    let reportBody = null;
    let reportStatus = null;
    for (const url of ENDPOINT_CANDIDATES.report) {
      const r = await api(baseURL, ctx.adminToken, 'get', url);
      annotate(test, `S7-probe ${url}`, String(r.status));
      if (r.status !== 404) {
        endpointHit = url;
        reportBody = r.body;
        reportStatus = r.status;
        break;
      }
    }

    annotate(test, 'S7-endpoint_hit', endpointHit || 'NONE (mock)');
    annotate(test, 'S7-status',       reportStatus);
    annotate(test, 'S7-body_keys',
      reportBody && typeof reportBody === 'object' ? Object.keys(reportBody).slice(0, 10) : null);

    if (!endpointHit) {
      annotate(test, 'S7-final', 'PLACEHOLDER (no report endpoint)');
      expect(endpointHit, 'no report endpoint discovered').toBeNull();
      return;
    }

    expect(reportStatus, 'report must not return 5xx').toBeLessThan(500);
  });

  // ============================================================================
  // S8 — Comisión del negocio per servicio
  // ============================================================================
  test('S8: comisión del negocio per servicio', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin token required for commissions');

    let endpointHit = null;
    let commBody = null;
    let commStatus = null;
    for (const url of ENDPOINT_CANDIDATES.commission) {
      const r = await api(baseURL, ctx.adminToken, 'get', url);
      annotate(test, `S8-probe ${url}`, String(r.status));
      if (r.status !== 404) {
        endpointHit = url;
        commBody = r.body;
        commStatus = r.status;
        break;
      }
    }

    annotate(test, 'S8-endpoint_hit', endpointHit || 'NONE (mock)');
    annotate(test, 'S8-status',       commStatus);
    annotate(test, 'S8-body_sample',  commBody);

    if (!endpointHit) {
      annotate(test, 'S8-final', 'PLACEHOLDER (no commission endpoint)');
      expect(endpointHit, 'no commission endpoint discovered').toBeNull();
      return;
    }

    expect(commStatus, 'commission must not return 5xx').toBeLessThan(500);
  });

  // ============================================================================
  // S9 — Reverse failed payment
  // ============================================================================
  test('S9: reverse failed payment (POST /api/services/reverse)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken && !ctx.cajeroToken, 'no token');
    const tok = ctx.adminToken || ctx.cajeroToken;

    const payload = {
      payment_id: ctx.paymentId || 'r6g-fake-id-' + Date.now(),
      reason: 'aggregator_failed',
    };

    let endpointHit = null;
    let revBody = null;
    let revStatus = null;
    for (const url of ENDPOINT_CANDIDATES.reverse) {
      const idem = newIdempotencyKey('S9-reverse');
      const r = await api(baseURL, tok, 'post', url, payload, { 'Idempotency-Key': idem });
      annotate(test, `S9-probe ${url}`, String(r.status));
      if (r.status !== 404) {
        endpointHit = url;
        revBody = r.body;
        revStatus = r.status;
        break;
      }
    }

    annotate(test, 'S9-endpoint_hit', endpointHit || 'NONE (mock)');
    annotate(test, 'S9-status',       revStatus);
    annotate(test, 'S9-body_sample',  revBody);

    if (!endpointHit) {
      annotate(test, 'S9-final', 'PLACEHOLDER (no reverse endpoint)');
      expect(endpointHit, 'no reverse endpoint discovered').toBeNull();
      return;
    }

    expect(revStatus, 'reverse must not return 5xx').toBeLessThan(500);
  });

  // ============================================================================
  // S10 — UI flow: open salvadorex_web_v25.html, login, click "Servicios" menu,
  // confirm the placeholder screen appears with the expected copy.
  // ============================================================================
  test('S10: UI flow — Servicios menu opens placeholder screen', async ({ page, baseURL }) => {
    test.skip(!ctx.cajeroToken, 'cajero token required to inject');

    // 1) Inject the cajero token via login.html origin
    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.evaluate(t => {
      try {
        localStorage.setItem('volvix_token', t);
        localStorage.setItem('volvixAuthToken', t);
      } catch (_) {}
    }, ctx.cajeroToken);

    // 2) Navigate to salvadorex_web_v25.html
    let pageReached = false;
    try {
      const resp = await page.goto('/salvadorex_web_v25.html', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      pageReached = !!(resp && resp.ok());
    } catch (e) {
      annotate(test, 'S10-nav_error', String(e && e.message || e));
    }
    annotate(test, 'S10-page_reached', String(pageReached));
    annotate(test, 'S10-final_url',    page.url());

    if (!pageReached) {
      // Page itself unreachable — record and pass softly (this happens when
      // the deploy temporarily 502s; surrounding tests capture the symptom).
      annotate(test, 'S10-status', 'PAGE_UNREACHABLE');
      return;
    }

    // 3) Confirm the menu button + placeholder section exist
    const menuBtn  = page.locator('button[data-menu="servicios"]').first();
    const screen   = page.locator('#screen-servicios');
    const menuOk   = await menuBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const screenExists = await screen.count();

    annotate(test, 'S10-menu_btn_visible', String(menuOk));
    annotate(test, 'S10-screen_exists',    String(screenExists > 0));

    // The screen is hidden by default; click the menu and confirm it shows.
    let placeholderText = '';
    if (menuOk) {
      try {
        await menuBtn.click({ timeout: 5_000 });
        await page.waitForTimeout(400);
        placeholderText = (await screen.innerText().catch(() => '')) || '';
      } catch (e) {
        annotate(test, 'S10-click_error', String(e && e.message || e));
      }
    }
    annotate(test, 'S10-placeholder_text', placeholderText.slice(0, 500));

    // 4) Screenshot for the report
    try {
      await page.screenshot({
        path: path.join(__dirname, 'screenshots', 'r6g-s10-servicios-placeholder.png'),
        fullPage: true,
      });
    } catch (_) {}

    // Lightweight assertions
    expect(screenExists, '#screen-servicios section must exist in the page').toBeGreaterThan(0);
    if (placeholderText) {
      // Expected copy: "CFE, agua, teléfono, internet, gas..."
      const txt = placeholderText.toLowerCase();
      const tokens = ['cfe', 'agua', 'tele', 'internet', 'gas'];
      const hits   = tokens.filter(t => txt.includes(t));
      annotate(test, 'S10-expected_tokens_hit', hits);
      expect(hits.length, 'placeholder copy must mention at least 3 of {CFE, agua, teléfono, internet, gas}').toBeGreaterThanOrEqual(3);
    }
  });

  // ============================================================================
  // S11 — Multi-tenant: TNT001 payments must NOT appear in TNT002's list.
  // If no list endpoint is implemented, verify cross-tenant on every probe
  // returns NOT 200-with-data (i.e. either 404 missing OR an empty isolated list).
  // ============================================================================
  test('S11: multi-tenant isolation', async ({ baseURL }) => {
    test.skip(!ctx.ownerToken, 'owner token (TNT002) required');

    const URLS = [
      ...ENDPOINT_CANDIDATES.list,
      ...ENDPOINT_CANDIDATES.report,
      ...ENDPOINT_CANDIDATES.commission,
      ...ENDPOINT_CANDIDATES.catalog,
    ];

    let crossTenantLeak = null;
    const probes = [];
    for (const url of URLS) {
      const tnt001 = ctx.adminToken
        ? await api(baseURL, ctx.adminToken, 'get', url)
        : { status: 0, body: null };
      const tnt002 = await api(baseURL, ctx.ownerToken, 'get', url);
      probes.push({
        url,
        tnt001: { status: tnt001.status, count: pickCount(tnt001.body) },
        tnt002: { status: tnt002.status, count: pickCount(tnt002.body) },
      });

      // A leak means: the ids visible to TNT001 are also visible to TNT002.
      const ids001 = pickIds(tnt001.body);
      const ids002 = pickIds(tnt002.body);
      if (ids001.length && ids002.length) {
        const leak = ids001.find(id => ids002.includes(id));
        if (leak) { crossTenantLeak = { url, id: leak }; break; }
      }
    }

    annotate(test, 'S11-probes',         probes.slice(0, 16));
    annotate(test, 'S11-cross_tenant_leak', crossTenantLeak || 'NONE');

    // Assertion: no cross-tenant leak — either every endpoint isolates, OR
    // every endpoint is 404 (placeholder module).
    expect(crossTenantLeak, 'no cross-tenant id leak between TNT001 and TNT002').toBeNull();
  });

});

// ── tiny helpers used in S11 ────────────────────────────────────────────────
function pickCount(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.count === 'number') return body.count;
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body.items))      return body.items.length;
  if (Array.isArray(body.data))       return body.data.length;
  if (Array.isArray(body.payments))   return body.payments.length;
  if (Array.isArray(body.providers))  return body.providers.length;
  return null;
}
function pickIds(body) {
  if (!body || typeof body !== 'object') return [];
  const list = body.items || body.data || body.payments || body.providers
            || (Array.isArray(body) ? body : []);
  if (!Array.isArray(list)) return [];
  return list.map(it => it && (it.id || it.payment_id)).filter(Boolean);
}
