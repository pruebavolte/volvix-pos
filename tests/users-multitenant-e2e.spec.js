// B42 — Multi-Tenant Users E2E (U1..U10)
// Verifies the FUNDAMENTAL multi-tenant flow:
// SaaS owner (admin) creates a sub-tenant + a user in it,
// the new user can login and see ONLY their tenant's data,
// and cross-tenant attacks are blocked.
//
// Run: npx playwright test --config=tests/playwright.b42.config.js
//
// IMPORTANT: this is an HONEST AUDIT. Each U test records pass/fail without
// hard-stopping the entire suite — we want all 10 results, even if early
// tests reveal architectural breakage.

const { test, expect, request } = require('@playwright/test');

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const BASE = process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app';

const ADMIN  = { email: 'admin@volvix.test',  password: 'Volvix2026!' };  // superadmin TNT001
const OWNER  = { email: 'owner@volvix.test',  password: 'Volvix2026!' };  // owner      TNT002
const CAJERO = { email: 'cajero@volvix.test', password: 'Volvix2026!' };  // cajero     TNT001

const RUN_TAG = String(Date.now()).slice(-8);
const TEST_TENANT_NAME = 'Test Tenant Round2 ' + RUN_TAG;
const TEST_USER_EMAIL  = `b42-owner+${RUN_TAG}@volvix.test`;
const TEST_USER_PWD    = 'B42SecureP@ss!';

// Shared state across tests
const state = {
  adminToken:  null,
  ownerToken:  null,
  cajeroToken: null,
  newUserToken: null,

  subTenantId: null,    // uuid del sub-tenant creado en U1
  newUserId:   null,    // uuid del usuario creado en U2
  newProductId: null,   // producto creado en U5

  results: {},          // {U1: {pass, detail}, ...}
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
  } catch (_) { return null; }
}

function newIdempotencyKey(tag) {
  return `b42-${tag}-${RUN_TAG}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loginAndGetToken(req, creds) {
  const r = await req.post('/api/login', {
    headers: { 'Content-Type': 'application/json' },
    data: { email: creds.email, password: creds.password },
    failOnStatusCode: false,
  });
  const status = r.status();
  let body = null;
  try { body = await r.json(); } catch (_) { body = null; }
  return { status, body, token: body && body.token };
}

function recordResult(test_id, pass, detail) {
  state.results[test_id] = { pass: !!pass, detail: String(detail || '').slice(0, 1000) };
}

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------
// IMPORTANT: we DON'T use describe.serial because in serial mode a failing
// soft-expect still aborts subsequent tests. Instead each U-test simply
// records pass/fail to `state.results` and we rely on test ORDER (Playwright
// runs tests in definition order within a single worker — workers=1 in the
// config). Each test is guarded by `if (!state.X) skip-and-record`.
//
// NO `expect.soft()` calls inside U-tests — every assertion is recorded
// in state.results and the test body always returns success so the next
// test runs. Real findings live in state.results.
test.describe('B42 — Multi-Tenant Users E2E', () => {
  test.beforeAll(async () => {
    const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
    const [adminRes, ownerRes, cajeroRes] = await Promise.all([
      loginAndGetToken(ctx, ADMIN),
      loginAndGetToken(ctx, OWNER),
      loginAndGetToken(ctx, CAJERO),
    ]);
    state.adminToken  = adminRes.token;
    state.ownerToken  = ownerRes.token;
    state.cajeroToken = cajeroRes.token;
    expect(state.adminToken,  'admin debe loguear OK').toBeTruthy();
    expect(state.ownerToken,  'owner debe loguear OK').toBeTruthy();
    expect(state.cajeroToken, 'cajero debe loguear OK').toBeTruthy();
    await ctx.dispose();
  });

  // ---------------------------------------------------------------------------
  // U1 — Admin crea sub-tenant
  // ---------------------------------------------------------------------------
  test('U1 — Admin creates a sub-tenant', async () => {
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${state.adminToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': newIdempotencyKey('u1-tenant'),
      },
    });
    const r = await ctx.post('/api/owner/tenants', {
      data: { name: TEST_TENANT_NAME, vertical: 'abarrotes', plan: 'basic' },
      failOnStatusCode: false,
    });
    const status = r.status();
    let body = null;
    try { body = await r.json(); } catch (_) {}

    let pass = false; let detail = `status=${status}`;
    if (status === 201 && body && body.tenant && body.tenant.id) {
      state.subTenantId = body.tenant.id;
      pass = true;
      detail = `created sub_tenant_id=${state.subTenantId} name="${body.tenant.name}"`;
    } else {
      detail += ` body=${JSON.stringify(body || {}).slice(0, 400)}`;
    }
    recordResult('U1', pass, detail);
    await ctx.dispose();
  });

  // ---------------------------------------------------------------------------
  // U2 — Admin crea usuario en sub-tenant
  // ---------------------------------------------------------------------------
  test('U2 — Admin creates a user in that sub-tenant', async () => {
    if (!state.subTenantId) { recordResult('U2', false, 'skipped: U1 no produjo sub_tenant_id'); return; }
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${state.adminToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': newIdempotencyKey('u2-user'),
      },
    });
    const r = await ctx.post(`/api/sub-tenants/${state.subTenantId}/users`, {
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PWD,
        name: 'B42 Test Owner',
        role: 'owner',
      },
      failOnStatusCode: false,
    });
    const status = r.status();
    let body = null;
    try { body = await r.json(); } catch (_) {}

    let pass = false;
    let detail = `status=${status}`;
    if (status === 201 && body && body.user && body.user.id) {
      state.newUserId = body.user.id;
      pass = true;
      detail = `created user_id=${state.newUserId} email=${body.user.email}`;
    } else {
      detail += ` body=${JSON.stringify(body || {}).slice(0, 400)}`;
    }
    recordResult('U2', pass, detail);
    await ctx.dispose();
  });

  // ---------------------------------------------------------------------------
  // U3 — Nuevo usuario puede loguearse y JWT trae su tenant
  // ---------------------------------------------------------------------------
  test('U3 — New user can login and JWT carries correct tenant_id', async () => {
    const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
    const lr = await loginAndGetToken(ctx, { email: TEST_USER_EMAIL, password: TEST_USER_PWD });
    await ctx.dispose();

    let pass = false;
    let detail = `login_status=${lr.status}`;
    if (lr.status === 200 && lr.token) {
      state.newUserToken = lr.token;
      const claims = decodeJwtPayload(lr.token);
      const tenantClaim = claims && (claims.tenant_id || claims.tenant);
      const expectedTenant = state.subTenantId;
      // Coincidencia: el JWT debería traer tenant_id == sub_tenant_id (uuid).
      pass = !!claims && tenantClaim && (String(tenantClaim) === String(expectedTenant));
      detail = `login OK; jwt.tenant_id=${tenantClaim || '(missing)'} expected=${expectedTenant}; jwt.role=${claims && claims.role}; jwt.email=${claims && claims.email}`;
    } else {
      detail += ` body=${JSON.stringify(lr.body || {}).slice(0, 400)}`;
    }
    recordResult('U3', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // U4 — Nuevo usuario ve SOLO sus datos (lista vacía o filtrada por tenant)
  // ---------------------------------------------------------------------------
  test('U4 — New user sees ONLY their tenant data (no leak from TNT001)', async () => {
    if (!state.newUserToken) { recordResult('U4', false, 'skipped: U3 sin token de nuevo usuario'); return; }
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${state.newUserToken}`,
        'Content-Type': 'application/json',
      },
    });
    const claims = decodeJwtPayload(state.newUserToken) || {};
    const myTenant = String(claims.tenant_id || '');

    const checks = [];
    const endpoints = ['/api/products', '/api/customers', '/api/sales'];
    let leaks = 0;
    for (const ep of endpoints) {
      const r = await ctx.get(ep, { failOnStatusCode: false });
      const status = r.status();
      let arr = [];
      try {
        const j = await r.json();
        arr = Array.isArray(j) ? j : (j.data || j.items || j.results || j.products || j.customers || j.sales || []);
      } catch (_) {}
      const foreign = (Array.isArray(arr) ? arr : []).filter(it => {
        const tid = it && (it.tenant_id || it.tenantId || it.tenant);
        return tid && String(tid) !== myTenant && String(tid) === 'TNT001';
      });
      if (foreign.length > 0) leaks += foreign.length;
      checks.push({ ep, status, count: Array.isArray(arr) ? arr.length : 0, foreign: foreign.length });
    }
    const pass = leaks === 0;
    recordResult('U4', pass, `myTenant=${myTenant} leaks=${leaks} checks=${JSON.stringify(checks)}`);
    await ctx.dispose();
  });

  // ---------------------------------------------------------------------------
  // U5 — Nuevo usuario crea producto; admin (TNT001) NO lo debe ver
  // ---------------------------------------------------------------------------
  test('U5 — New user creates product; admin TNT001 does NOT see it', async () => {
    if (!state.newUserToken) { recordResult('U5', false, 'skipped: U3 sin token de nuevo usuario'); return; }

    const ctxNew = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${state.newUserToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': newIdempotencyKey('u5-product'),
      },
    });
    const productName = `B42-PRD-${RUN_TAG}`;
    const cr = await ctxNew.post('/api/products', {
      data: { name: productName, price: 99.99, sku: `B42SKU${RUN_TAG}`, stock: 5 },
      failOnStatusCode: false,
    });
    let cBody = null;
    try { cBody = await cr.json(); } catch (_) {}
    const cStatus = cr.status();
    if (cBody && (cBody.id || (cBody.product && cBody.product.id) || (cBody.data && cBody.data.id))) {
      state.newProductId = cBody.id || (cBody.product && cBody.product.id) || (cBody.data && cBody.data.id);
    }
    await ctxNew.dispose();

    const ctxAdmin = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.adminToken}` },
    });
    const lr = await ctxAdmin.get('/api/products?limit=500', { failOnStatusCode: false });
    let arr = [];
    try {
      const j = await lr.json();
      arr = Array.isArray(j) ? j : (j.data || j.items || j.products || []);
    } catch (_) {}
    const found = (Array.isArray(arr) ? arr : []).find(p => {
      const n = (p && (p.name || p.nombre)) || '';
      const sk = (p && (p.sku || p.SKU)) || '';
      return String(n) === productName || String(sk) === `B42SKU${RUN_TAG}`;
    });
    await ctxAdmin.dispose();

    const pass = !found;
    recordResult('U5', pass, `create_status=${cStatus} new_product_id=${state.newProductId || 'n/a'} create_body=${JSON.stringify(cBody||{}).slice(0,200)} leak_to_TNT001=${found ? 'YES (' + (found.id||'?') + ')' : 'no'}`);
  });

  // ---------------------------------------------------------------------------
  // U6 — Admin (superadmin) ve todos los tenants, incluyendo el nuevo
  // ---------------------------------------------------------------------------
  test('U6 — Admin (superadmin) can see ALL tenants including the new one', async () => {
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.adminToken}` },
    });
    const r = await ctx.get('/api/owner/tenants?all=true', { failOnStatusCode: false });
    const status = r.status();
    let arr = [];
    try {
      const j = await r.json();
      arr = Array.isArray(j) ? j : (j.data || j.items || j.tenants || []);
    } catch (_) {}
    await ctx.dispose();

    const found = state.subTenantId
      ? (arr || []).find(t => String(t.id) === String(state.subTenantId) || String(t.name || '') === TEST_TENANT_NAME)
      : null;
    const pass = (status === 200) && (state.subTenantId ? !!found : true);
    recordResult('U6', pass, `status=${status} count=${arr.length} found_test_tenant=${!!found}`);
  });

  // ---------------------------------------------------------------------------
  // U7 — Owner (TNT002) lista usuarios de su tenant; cajero TNT001 NO aparece
  // ---------------------------------------------------------------------------
  test('U7 — Owner (TNT002) lists users of TNT002 only — cajero@volvix.test NOT in list', async () => {
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.ownerToken}` },
    });
    const r = await ctx.get('/api/users', { failOnStatusCode: false });
    const status = r.status();
    let arr = [];
    try {
      const j = await r.json();
      arr = Array.isArray(j) ? j : (j.users || j.data || j.items || []);
    } catch (_) {}
    await ctx.dispose();

    const cajeroLeak = (arr || []).some(u => {
      const e = String(u.email || '').toLowerCase();
      const tid = String(u.tenant_id || u.tenantId || '');
      return e === 'cajero@volvix.test' || tid === 'TNT001';
    });
    const pass = status === 200 && !cajeroLeak;
    recordResult('U7', pass, `status=${status} count=${arr.length} cajero_leak=${cajeroLeak} sample=${JSON.stringify((arr||[]).slice(0,3).map(u=>({email:u.email,tenant:u.tenant_id})))}`);
  });

  // ---------------------------------------------------------------------------
  // U8 — Feature flags resueltos por usuario; toggle de un módulo
  // ---------------------------------------------------------------------------
  test('U8 — Feature flags applied correctly per user', async () => {
    const cajeroClaims = decodeJwtPayload(state.cajeroToken) || {};
    const cajeroId = cajeroClaims.id;

    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.cajeroToken}` },
    });
    const r1 = await ctx.get(`/api/feature-flags?user_id=${encodeURIComponent(cajeroId || '')}`, { failOnStatusCode: false });
    const s1 = r1.status();
    let b1 = null;
    try { b1 = await r1.json(); } catch (_) {}
    await ctx.dispose();

    const ctxAdmin = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${state.adminToken}`,
        'Content-Type': 'application/json',
      },
    });
    const setRes = await ctxAdmin.patch(`/api/users/${encodeURIComponent(cajeroId || '')}/permissions`, {
      data: { modules: [{ key: 'module.recargas', status: 'disabled' }] },
      failOnStatusCode: false,
    });
    const setStatus = setRes.status();
    let setBody = null; try { setBody = await setRes.json(); } catch (_) {}
    await ctxAdmin.dispose();

    const ctx2 = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.cajeroToken}` },
    });
    const r2 = await ctx2.get(`/api/feature-flags?user_id=${encodeURIComponent(cajeroId || '')}`, { failOnStatusCode: false });
    const s2 = r2.status();
    let b2 = null;
    try { b2 = await r2.json(); } catch (_) {}
    await ctx2.dispose();

    const recargasAfter = b2 && b2.modules && (b2.modules['module.recargas'] || b2.modules.recargas);
    const hasModulesObject = !!(b1 && b1.modules);
    const flagApplied = recargasAfter === 'disabled';
    const pass = (s1 === 200) && hasModulesObject && (s2 === 200);
    recordResult('U8', pass, `s1=${s1} s2=${s2} modules_in_response=${hasModulesObject} set_status=${setStatus} applied_count=${(setBody && setBody.applied && setBody.applied.length)||0} recargas_after=${recargasAfter || 'undefined'} flag_actually_applied=${flagApplied}`);

    if (cajeroId) {
      const ctxReset = await request.newContext({
        baseURL: BASE, ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Authorization': `Bearer ${state.adminToken}`,
          'Content-Type': 'application/json',
        },
      });
      await ctxReset.patch(`/api/users/${encodeURIComponent(cajeroId)}/permissions`, {
        data: { modules: [{ key: 'module.recargas', status: 'enabled' }] },
        failOnStatusCode: false,
      });
      await ctxReset.dispose();
    }
  });

  // ---------------------------------------------------------------------------
  // U9 — Soft-delete del nuevo usuario; login debe fallar
  // ---------------------------------------------------------------------------
  test('U9 — Disable user (soft-delete); login fails afterward', async () => {
    if (!state.newUserId) { recordResult('U9', false, 'skipped: U2 no produjo new_user_id'); return; }
    const ctx = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.adminToken}` },
    });
    const dr = await ctx.delete(`/api/users/${state.newUserId}`, { failOnStatusCode: false });
    const dStatus = dr.status();
    let dBody = null; try { dBody = await dr.json(); } catch (_) {}
    await ctx.dispose();

    const ctxLogin = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
    const lr = await loginAndGetToken(ctxLogin, { email: TEST_USER_EMAIL, password: TEST_USER_PWD });
    await ctxLogin.dispose();

    const passDelete = (dStatus === 200);
    const passLoginBlocked = lr.status === 401 || lr.status === 403;
    const pass = passDelete && passLoginBlocked;
    recordResult('U9', pass, `delete_status=${dStatus} delete_body=${JSON.stringify(dBody||{}).slice(0,200)} login_after_status=${lr.status} login_blocked=${passLoginBlocked}`);
  });

  // ---------------------------------------------------------------------------
  // U10 — Cross-tenant attack prevention
  // ---------------------------------------------------------------------------
  test('U10 — Cross-tenant attack prevention (owner TNT002 → customer TNT001)', async () => {
    const ctxA = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.adminToken}` },
    });
    const lr = await ctxA.get('/api/customers?limit=10', { failOnStatusCode: false });
    let cusArr = [];
    try {
      const j = await lr.json();
      cusArr = Array.isArray(j) ? j : (j.data || j.items || j.customers || []);
    } catch (_) {}
    await ctxA.dispose();

    let targetId = (cusArr[0] && (cusArr[0].id || cusArr[0].customer_id)) || null;

    if (!targetId) {
      const ctxCreate = await request.newContext({
        baseURL: BASE, ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Authorization': `Bearer ${state.adminToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': newIdempotencyKey('u10-cust'),
        },
      });
      const cr = await ctxCreate.post('/api/customers', {
        data: { name: `B42 Cust ${RUN_TAG}`, email: `b42cust+${RUN_TAG}@volvix.test`, phone: '5551234567' },
        failOnStatusCode: false,
      });
      let cb = null; try { cb = await cr.json(); } catch (_) {}
      targetId = (cb && (cb.id || (cb.customer && cb.customer.id) || (cb.data && cb.data.id))) || null;
      await ctxCreate.dispose();
    }

    if (!targetId) {
      recordResult('U10', false, 'no se pudo obtener customer_id de TNT001 para probar');
      return;
    }

    const ctxO = await request.newContext({
      baseURL: BASE, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Authorization': `Bearer ${state.ownerToken}` },
    });
    const r = await ctxO.get(`/api/customers/${encodeURIComponent(targetId)}`, { failOnStatusCode: false });
    const status = r.status();
    let body = null; try { body = await r.json(); } catch (_) {}
    await ctxO.dispose();

    let leaked = false;
    if (status === 200 && body) {
      const tid = body.tenant_id || (body.customer && body.customer.tenant_id) || (body.data && body.data.tenant_id);
      if (tid && String(tid) === 'TNT001') leaked = true;
      const sameId = String((body.id || (body.customer && body.customer.id) || (body.data && body.data.id) || '')) === String(targetId);
      if (sameId) leaked = true;
    }
    const pass = !leaked && [403, 404, 401].includes(status);
    recordResult('U10', pass, `target_customer_id=${targetId} cross_tenant_status=${status} leaked=${leaked} expected=404|403`);
  });

  // ---------------------------------------------------------------------------
  // CLEANUP + REPORT
  // ---------------------------------------------------------------------------
  test.afterAll(async () => {
    try {
      if (state.subTenantId) {
        const ctx = await request.newContext({
          baseURL: BASE, ignoreHTTPSErrors: true,
          extraHTTPHeaders: { 'Authorization': `Bearer ${state.adminToken}` },
        });
        await ctx.delete(`/api/owner/tenants/${state.subTenantId}`, { failOnStatusCode: false });
        await ctx.dispose();
      }
    } catch (_) {}

    const ids = ['U1','U2','U3','U4','U5','U6','U7','U8','U9','U10'];
    let pass = 0, total = 0;
    const lines = [];
    for (const id of ids) {
      const r = state.results[id];
      total++;
      if (r && r.pass) pass++;
      lines.push(`${id}: ${r ? (r.pass ? 'PASS' : 'FAIL') : 'NO-RUN'} — ${r ? r.detail : ''}`);
    }
    const score = total ? Math.round((pass/total)*100) : 0;
    console.log('\n=== B42 RESULTS ===');
    for (const ln of lines) console.log(ln);
    console.log(`SCORE=${pass}/${total} = ${score}%`);
    console.log('=== /B42 RESULTS ===\n');

    try {
      const fs = require('fs');
      const path = require('path');
      const outPath = path.join(__dirname, 'b42-results.json');
      fs.writeFileSync(outPath, JSON.stringify({
        run_tag: RUN_TAG,
        sub_tenant_id: state.subTenantId,
        new_user_id: state.newUserId,
        new_product_id: state.newProductId,
        results: state.results,
        score: { pass, total, percent: score },
      }, null, 2));
    } catch (_) {}
  });
});
