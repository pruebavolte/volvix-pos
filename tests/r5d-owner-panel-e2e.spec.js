// ============================================================================
// R5D / B42 — OWNER PANEL E2E (O1..O12)
// File: tests/r5d-owner-panel-e2e.spec.js
//
// MISSION: verify on PRODUCTION that volvix_owner_panel_v7.html lets the owner
// of a tenant do EVERYTHING from a single panel — auth, navigation, sub-tenant
// CRUD, user CRUD, feature flags, deploys, activity log, settings, suspend,
// marketing landings, fixed P0 button references, and multi-tenant isolation.
//
// Each O-test records pass/fail in a shared `state.results` map without
// hard-stopping the suite (so we always get the full /100 score even if early
// tests reveal architectural breakage). The afterAll hook writes
// B42_OWNER_PANEL_E2E.md with a per-test summary and an aggregate score.
//
// Run:
//   cd "C:/Users/DELL/Downloads/verion 340"
//   VOLVIX_BASE_URL=https://volvix-pos.vercel.app \
//   npx playwright test tests/r5d-owner-panel-e2e.spec.js --reporter=list
//
// CONSTRAINTS:
//   - DO NOT modify api/index.js or any HTML.
//   - Cleanup at the end: delete the test sub-tenant (DELETE /api/owner/tenants/:id).
//   - Idempotency-Key on every POST.
// ============================================================================
const { test, expect, request, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const BASE = process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app';
const PANEL_PATH = '/volvix_owner_panel_v7.html';

const ADMIN = { email: 'admin@volvix.test', password: 'Volvix2026!' };  // superadmin TNT001
const OWNER = { email: 'owner@volvix.test', password: 'Volvix2026!' };  // owner TNT002

const RUN_TAG = String(Date.now()).slice(-8);
const TEST_TENANT_NAME = 'R5D Owner E2E ' + RUN_TAG;
const TEST_USER_EMAIL = `r5d-user+${RUN_TAG}@volvix.test`;
const TEST_USER_PWD = 'R5DSecureP@ss!';

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-r5d-owner');
const REPORT_PATH = path.join(__dirname, '..', 'B42_OWNER_PANEL_E2E.md');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// -----------------------------------------------------------------------------
// Shared state
// -----------------------------------------------------------------------------
const state = {
  ownerToken: null,
  adminToken: null,
  subTenantId: null,
  newUserId: null,
  results: {},      // { O1: {pass, detail, evidence}, ... }
  consoleErrors: [],
  networkFailures: [],
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function newIdempotencyKey(tag) {
  return `r5d-${tag}-${RUN_TAG}-${crypto.randomBytes(4).toString('hex')}`;
}

function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
  } catch (_) { return null; }
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
  return { status, body, token: body && (body.token || (body.session && body.session.token)) };
}

async function api(method, path, token, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const m = String(method || 'get').toLowerCase();
  if ((m === 'post' || m === 'patch') && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = newIdempotencyKey(m);
  }
  const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, extraHTTPHeaders: headers });
  const opts = { failOnStatusCode: false };
  if (body !== undefined && body !== null) opts.data = body;
  const res = await ctx[m](path, opts);
  const status = res.status();
  let parsed = null;
  try { parsed = await res.json(); } catch (_) { try { parsed = await res.text(); } catch (_) { parsed = null; } }
  await ctx.dispose();
  return { status, ok: status >= 200 && status < 300, body: parsed, headers: res.headers() };
}

function recordResult(id, pass, detail, evidence) {
  state.results[id] = {
    pass: !!pass,
    detail: String(detail || '').slice(0, 1500),
    evidence: evidence || null,
  };
}

async function safeScreenshot(page, name) {
  try {
    const fpath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: fpath, fullPage: false });
    return path.basename(fpath);
  } catch (_) { return null; }
}

async function attachLoggers(page, tag) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      state.consoleErrors.push({
        tag, text: String(msg.text()).slice(0, 300),
      });
    }
  });
  page.on('pageerror', err => {
    state.consoleErrors.push({
      tag, text: 'PAGE ERROR: ' + String(err && err.message || err).slice(0, 300),
    });
  });
  page.on('response', res => {
    const status = res.status();
    if (status >= 500) {
      state.networkFailures.push({
        tag, url: res.url(), status, method: res.request().method(),
      });
    }
  });
}

async function loginInBrowser(page, creds) {
  // Hit /api/login then inject token+session before navigating to the protected page.
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(500);
  const result = await page.evaluate(async (c) => {
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, password: c.password }),
      });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      const token = j.token || (j.session && j.session.token);
      if (j.session) localStorage.setItem('volvixSession', JSON.stringify(j.session));
      if (token) {
        localStorage.setItem('volvixAuthToken', token);
        localStorage.setItem('volvix_token', token);
      }
      return { ok: true, hasToken: !!token, role: j.session && j.session.role };
    } catch (e) { return { ok: false, error: String(e) }; }
  }, creds);
  return result;
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------
test.describe('R5D / B42 — Owner Panel E2E', () => {

  test.beforeAll(async () => {
    const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
    const [ownerRes, adminRes] = await Promise.all([
      loginAndGetToken(ctx, OWNER),
      loginAndGetToken(ctx, ADMIN),
    ]);
    state.ownerToken = ownerRes.token;
    state.adminToken = adminRes.token;
    expect(state.ownerToken, 'owner debe loguear OK').toBeTruthy();
    expect(state.adminToken, 'admin debe loguear OK').toBeTruthy();
    await ctx.dispose();
  });

  // ---------------------------------------------------------------------------
  // O1 — Page loads with auth, console errors < 5
  // ---------------------------------------------------------------------------
  test('O1 — Owner panel page loads with auth (console errors < 5)', async () => {
    let detail = '';
    let pass = false;
    let evidence = null;
    let browser = null;
    try {
      browser = await chromium.launch();
      const ctx = await browser.newContext({
        baseURL: BASE, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      await attachLoggers(page, 'O1');

      const login = await loginInBrowser(page, OWNER);
      if (!login.ok) {
        recordResult('O1', false, `login fail status=${login.status} err=${login.error || ''}`);
        await browser.close(); return;
      }

      const resp = await page.goto(BASE + PANEL_PATH, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => ({ error: e }));
      await page.waitForTimeout(1500);
      const httpStatus = resp && typeof resp.status === 'function' ? resp.status() : null;
      // Wait for sidebar nav as a signal the page initialized
      const navVisible = await page.locator('nav.nav .nav-item').first().isVisible({ timeout: 8000 }).catch(() => false);

      evidence = await safeScreenshot(page, 'O1_panel_loaded');

      const errs = state.consoleErrors.filter(e => e.tag === 'O1');
      pass = !!navVisible && errs.length < 5;
      detail = `http=${httpStatus} nav_visible=${navVisible} console_errors=${errs.length} sample=${JSON.stringify(errs.slice(0, 3).map(e => e.text))}`;
      await browser.close();
    } catch (err) {
      detail = 'exception: ' + String(err && err.message);
      try { browser && await browser.close(); } catch (_) {}
    }
    recordResult('O1', pass, detail, evidence);
  });

  // ---------------------------------------------------------------------------
  // O2 — Navigation menu items work
  // ---------------------------------------------------------------------------
  test('O2 — Navigation menu items work', async () => {
    let pass = false; let detail = ''; let evidence = null; let browser = null;
    try {
      browser = await chromium.launch();
      const ctx = await browser.newContext({
        baseURL: BASE, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      await attachLoggers(page, 'O2');
      await loginInBrowser(page, OWNER);
      await page.goto(BASE + PANEL_PATH, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);

      // Map menu labels (per panel definition) → expected v-section id
      const items = [
        { label: 'Overview',     section: 'v-overview' },
        { label: 'Arquitectura', section: 'v-architecture' },
        { label: 'Verticales',   section: 'v-verticals' },
        { label: 'Apps Suite',   section: 'v-apps' },
        { label: 'Tenants',      section: 'v-tenants' },
        { label: 'Dispositivos', section: 'v-devices' },
        { label: 'Sincronización', section: 'v-sync' },
        { label: 'Facturación',  section: 'v-billing' },
        { label: 'Deploys',      section: 'v-deploys' },
        { label: 'Logs',         section: 'v-logs' },
        { label: 'Ajustes',      section: 'v-settings' },
        { label: 'Editor Web WYSIWYG', section: 'v-webeditor' },
        { label: 'Marcas blancas', section: 'v-brands' },
        { label: 'Módulos',      section: 'v-modules' },
      ];

      const checks = [];
      let okCount = 0;
      for (const it of items) {
        const btn = page.locator(`button.nav-item:has-text("${it.label}")`).first();
        const exists = await btn.count() > 0;
        if (!exists) { checks.push({ ...it, ok: false, reason: 'btn_not_found' }); continue; }
        try {
          await btn.click({ timeout: 3000 });
        } catch (_) {
          checks.push({ ...it, ok: false, reason: 'click_fail' }); continue;
        }
        await page.waitForTimeout(200);
        const visible = await page.locator('#' + it.section).isVisible({ timeout: 1500 }).catch(() => false);
        const ok = !!visible;
        if (ok) okCount++;
        checks.push({ ...it, ok, visible });
      }

      // Verify "Gestión de Usuarios" link (different mechanism — window.location.href change)
      // We just check the button exists with expected onclick attribute.
      const usersBtn = page.locator('button.nav-item:has-text("Gestión de Usuarios")').first();
      const usersBtnExists = await usersBtn.count() > 0;
      const usersOnClick = usersBtnExists ? await usersBtn.getAttribute('onclick').catch(() => '') : '';
      const usersWired = !!(usersOnClick && usersOnClick.indexOf('volvix-user-management.html') >= 0);

      evidence = await safeScreenshot(page, 'O2_nav_final');
      pass = okCount >= Math.ceil(items.length * 0.8) && usersWired; // at least 80%
      detail = `nav_ok=${okCount}/${items.length} users_wired=${usersWired} sample_fail=${JSON.stringify(checks.filter(c => !c.ok).slice(0, 3))}`;
      await browser.close();
    } catch (err) {
      detail = 'exception: ' + String(err && err.message);
      try { browser && await browser.close(); } catch (_) {}
    }
    recordResult('O2', pass, detail, evidence);
  });

  // ---------------------------------------------------------------------------
  // O3 — Crear sub-tenant flow (POST /api/owner/tenants → 201)
  // ---------------------------------------------------------------------------
  test('O3 — Create sub-tenant via POST /api/owner/tenants', async () => {
    const r = await api('POST', '/api/owner/tenants', state.ownerToken, {
      name: TEST_TENANT_NAME,
      vertical: 'abarrotes',
      plan: 'basic',
    });
    let pass = false; let detail = `status=${r.status}`;
    if (r.status === 201 && r.body && r.body.tenant && r.body.tenant.id) {
      state.subTenantId = r.body.tenant.id;
      pass = true;
      detail = `created sub_tenant_id=${state.subTenantId} name="${r.body.tenant.name}" plan=${r.body.tenant.plan}`;
    } else {
      detail += ` body=${JSON.stringify(r.body || {}).slice(0, 400)}`;
    }
    // Verify it appears in the list
    if (state.subTenantId) {
      const list = await api('GET', '/api/owner/tenants', state.ownerToken);
      let arr = [];
      if (list.body && Array.isArray(list.body)) arr = list.body;
      else if (list.body && list.body.tenants) arr = list.body.tenants;
      else if (list.body && list.body.data) arr = list.body.data;
      const found = arr.find(t => String(t.id) === String(state.subTenantId) || t.name === TEST_TENANT_NAME);
      detail += ` listed=${!!found} list_count=${arr.length}`;
      if (!found) pass = false;
    }
    recordResult('O3', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // O4 — Crear usuario en sub-tenant (POST /api/sub-tenants/:id/users → 201)
  // ---------------------------------------------------------------------------
  test('O4 — Create user inside sub-tenant', async () => {
    if (!state.subTenantId) { recordResult('O4', false, 'skipped: O3 sin sub_tenant_id'); return; }
    const r = await api('POST', `/api/sub-tenants/${state.subTenantId}/users`, state.ownerToken, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PWD,
      name: 'R5D Test Cajero',
      role: 'cajero',
    });
    let pass = false; let detail = `status=${r.status}`;
    if (r.status === 201 && r.body && (r.body.user || r.body.user_id)) {
      state.newUserId = (r.body.user && r.body.user.id) || r.body.user_id;
      pass = true;
      detail = `created user_id=${state.newUserId} email=${(r.body.user && r.body.user.email) || TEST_USER_EMAIL}`;
    } else {
      detail += ` body=${JSON.stringify(r.body || {}).slice(0, 400)}`;
    }
    recordResult('O4', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // O5 — Toggle module.recargas → disabled (PATCH /api/users/:id/permissions)
  // ---------------------------------------------------------------------------
  test('O5 — Assign feature flag (module.recargas disabled) to a user', async () => {
    // Use the new user if O4 succeeded; otherwise fall back to admin (but still
    // exercise the endpoint).
    let targetId = state.newUserId;
    if (!targetId) {
      // fetch any user from /api/users to use as fallback target
      const ur = await api('GET', '/api/users', state.ownerToken);
      const arr = (ur.body && (ur.body.users || ur.body.data || (Array.isArray(ur.body) ? ur.body : []))) || [];
      const candidate = arr.find(u => u && u.id);
      if (candidate) targetId = candidate.id;
    }
    if (!targetId) {
      recordResult('O5', false, 'skipped: no user_id disponible (O4 falló y /api/users no devolvió users)');
      return;
    }
    const r = await api('PATCH', `/api/users/${encodeURIComponent(targetId)}/permissions`, state.ownerToken, {
      modules: [{ key: 'module.recargas', status: 'disabled' }],
    });
    let pass = false;
    let applied = (r.body && r.body.applied) || [];
    const found = Array.isArray(applied) && applied.find(a => a && a.key === 'module.recargas' && a.status === 'disabled');
    pass = (r.status === 200 || r.status === 201) && !!found;
    const detail = `target_user=${targetId} status=${r.status} applied_count=${Array.isArray(applied) ? applied.length : 0} flag_present=${!!found} body=${JSON.stringify(r.body || {}).slice(0, 300)}`;
    recordResult('O5', pass, detail);

    // Roll back so we don't leave the user crippled (best-effort)
    if (pass) {
      try {
        await api('PATCH', `/api/users/${encodeURIComponent(targetId)}/permissions`, state.ownerToken, {
          modules: [{ key: 'module.recargas', status: 'enabled' }],
        });
      } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // O6 — Trigger deploy (POST /api/owner/deploys)
  // ---------------------------------------------------------------------------
  test('O6 — Trigger deploy via POST /api/owner/deploys', async () => {
    const r = await api('POST', '/api/owner/deploys', state.ownerToken, {
      env: 'staging',
      branch: 'main',
      version: 'v1.0.0',
      channel: 'beta',
      platform: 'web',
      notes: 'R5D E2E deploy trigger (no-op staging)',
    });
    // Backend currently returns 202 ("queued"); accept 201 too for forward-compat.
    let pass = false;
    if ([201, 202].includes(r.status) && r.body && (r.body.deploy_id || r.body.ok === true)) pass = true;
    const detail = `status=${r.status} ok=${r.body && r.body.ok} deploy_id=${r.body && r.body.deploy_id} body=${JSON.stringify(r.body || {}).slice(0, 300)}`;
    recordResult('O6', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // O7 — View activity log (GET /api/audit-log o /api/owner/logs)
  // ---------------------------------------------------------------------------
  test('O7 — View activity log (audit/owner logs endpoint)', async () => {
    // Try /api/audit-log first, then /api/owner/logs as fallback.
    const tryPaths = ['/api/audit-log?limit=20', '/api/owner/logs?limit=20'];
    let last = null;
    let foundEntries = false;
    let usedPath = null;
    for (const p of tryPaths) {
      const r = await api('GET', p, state.ownerToken);
      last = r;
      const list = (r.body && (r.body.entries || r.body.logs || r.body.events || r.body.data || (Array.isArray(r.body) ? r.body : []))) || [];
      if (r.status === 200) {
        usedPath = p;
        foundEntries = Array.isArray(list);
        break;
      }
    }
    // The endpoints return 200 with an array even if empty — that's still a
    // working "view activity log" experience.
    const pass = !!last && last.status === 200 && foundEntries;
    const list = (last && last.body && (last.body.entries || last.body.logs || last.body.events || last.body.data || (Array.isArray(last.body) ? last.body : []))) || [];
    const detail = `path=${usedPath} status=${last && last.status} count=${Array.isArray(list) ? list.length : 0}`;
    recordResult('O7', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // O8 — Edit tenant settings (PATCH /api/owner/tenants/:id) plan change
  // ---------------------------------------------------------------------------
  test('O8 — Edit tenant settings (PATCH /api/owner/tenants/:id)', async () => {
    if (!state.subTenantId) { recordResult('O8', false, 'skipped: O3 no produjo sub_tenant_id'); return; }
    const r = await api('PATCH', `/api/owner/tenants/${state.subTenantId}`, state.ownerToken, {
      plan: 'pro',
    });
    let pass = false;
    const tenantBack = r.body && (r.body.tenant || r.body.data);
    const planBack = tenantBack && tenantBack.plan;
    pass = (r.status === 200) && (planBack === 'pro' || (r.body && r.body.ok === true));
    const detail = `status=${r.status} plan_back=${planBack} body=${JSON.stringify(r.body || {}).slice(0, 300)}`;
    recordResult('O8', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // O9 — Suspender tenant (PATCH suspended:true ó DELETE)
  // ---------------------------------------------------------------------------
  test('O9 — Suspend tenant (PATCH suspended=true ó DELETE soft-suspend)', async () => {
    if (!state.subTenantId) { recordResult('O9', false, 'skipped: O3 no produjo sub_tenant_id'); return; }
    // First try PATCH suspended=true (the canonical path per backend)
    const r = await api('PATCH', `/api/owner/tenants/${state.subTenantId}`, state.ownerToken, {
      suspended: true,
    });
    let pass = (r.status === 200) && (r.body && r.body.ok === true);
    let detail = `patch_status=${r.status} body=${JSON.stringify(r.body || {}).slice(0, 300)}`;

    // Verify the tenant is now suspended/disabled in the listing
    const list = await api('GET', '/api/owner/tenants', state.ownerToken);
    let arr = [];
    if (list.body && Array.isArray(list.body)) arr = list.body;
    else if (list.body && list.body.tenants) arr = list.body.tenants;
    else if (list.body && list.body.data) arr = list.body.data;
    const me = arr.find(t => String(t.id) === String(state.subTenantId));
    if (me) {
      const isSuspended = (me.is_active === false) || me.suspended === true || !!me.disabled_at;
      detail += ` listed_is_active=${me.is_active} suspended=${me.suspended} disabled_at=${me.disabled_at} considered_suspended=${isSuspended}`;
      if (!isSuspended) pass = false;
    } else {
      detail += ' tenant_not_in_list_after_suspend';
    }
    recordResult('O9', pass, detail);

    // Re-activate so subsequent tests (cleanup) can still target it
    if (pass) {
      try {
        await api('PATCH', `/api/owner/tenants/${state.subTenantId}`, state.ownerToken, { suspended: false });
      } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // O10 — Marketing — Crear/persistir landing personalizada
  // ---------------------------------------------------------------------------
  test('O10 — Marketing — POST /api/owner/landings persists a landing', async () => {
    const r = await api('POST', '/api/owner/landings', state.ownerToken, {
      vertical: 'abarrotes',
      slug: `r5d-test-${RUN_TAG}`,
      headline: 'R5D test landing',
      pain_points: ['ventas lentas', 'inventario manual'],
      cta_label: 'Probar gratis',
    });
    let pass = false;
    if ((r.status === 200 || r.status === 201) && r.body && (r.body.id || r.body.ok)) pass = true;
    const detail = `status=${r.status} body=${JSON.stringify(r.body || {}).slice(0, 300)}`;

    // Verify list endpoint at least responds 200 (current backend returns []).
    const list = await api('GET', '/api/owner/landings', state.ownerToken);
    const listOk = list.status === 200;
    if (!listOk) pass = false;
    recordResult('O10', pass, detail + ` list_status=${list.status}`);
  });

  // ---------------------------------------------------------------------------
  // O11 — Verify 3 P0 button references already FIXED (B40)
  // ---------------------------------------------------------------------------
  test('O11 — Verify P0 button references (v25/marketplace/v7) — B40 fixes', async () => {
    let pass = false; let detail = ''; let evidence = null; let browser = null;
    try {
      browser = await chromium.launch();
      const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await attachLoggers(page, 'O11');
      await loginInBrowser(page, OWNER);
      await page.goto(BASE + PANEL_PATH, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);

      // Inspect onclick attributes server-rendered into the panel (B40 guarantees v25 + marketplace.html + v7)
      const html = await page.content();
      const hasV25      = html.indexOf("salvadorex_web_v25.html") >= 0;
      const hasV24      = html.indexOf("salvadorex_web_v24.html") >= 0; // must NOT exist
      const hasMkt      = html.indexOf("'marketplace.html'") >= 0 || html.indexOf("\"marketplace.html\"") >= 0 || html.indexOf("marketplace.html'") >= 0;
      const hasLandTpl  = html.indexOf("landing_template") >= 0; // must NOT exist
      const hasPanelV7  = html.indexOf("volvix_owner_panel_v7.html") >= 0 || page.url().indexOf("volvix_owner_panel_v7.html") >= 0;
      const hasPanelV2  = html.indexOf("volvix_owner_panel_v2.html") >= 0; // must NOT exist

      const fixOk = hasV25 && !hasV24 && hasMkt && !hasLandTpl && hasPanelV7 && !hasPanelV2;
      pass = !!fixOk;
      detail = `v25=${hasV25} v24=${hasV24} marketplace=${hasMkt} landing_template=${hasLandTpl} panel_v7=${hasPanelV7} panel_v2=${hasPanelV2}`;
      evidence = await safeScreenshot(page, 'O11_panel_overview');
      await browser.close();
    } catch (err) {
      detail = 'exception: ' + String(err && err.message);
      try { browser && await browser.close(); } catch (_) {}
    }
    recordResult('O11', pass, detail, evidence);
  });

  // ---------------------------------------------------------------------------
  // O12 — Multi-tenant: owner (TNT002) cannot see admin (TNT001) data
  // ---------------------------------------------------------------------------
  test('O12 — Multi-tenant isolation: owner cannot see admin tenant data', async () => {
    // Owner lists customers; result must NOT contain TNT001-tagged rows.
    const ownerCust = await api('GET', '/api/customers?limit=100', state.ownerToken);
    let ownerArr = [];
    if (ownerCust.body && Array.isArray(ownerCust.body)) ownerArr = ownerCust.body;
    else if (ownerCust.body && ownerCust.body.customers) ownerArr = ownerCust.body.customers;
    else if (ownerCust.body && ownerCust.body.data) ownerArr = ownerCust.body.data;

    const ownerLeak = ownerArr.filter(c => {
      const tid = c && (c.tenant_id || c.tenantId || c.tenant);
      return tid && String(tid) === 'TNT001';
    }).length;

    // Owner lists users; cajero@volvix.test (TNT001) must NOT appear.
    const ownerUsers = await api('GET', '/api/users', state.ownerToken);
    let ownerU = [];
    if (ownerUsers.body && Array.isArray(ownerUsers.body)) ownerU = ownerUsers.body;
    else if (ownerUsers.body && ownerUsers.body.users) ownerU = ownerUsers.body.users;
    else if (ownerUsers.body && ownerUsers.body.data) ownerU = ownerUsers.body.data;
    const cajeroLeak = ownerU.some(u => {
      const e = String((u && u.email) || '').toLowerCase();
      const tid = String((u && (u.tenant_id || u.tenantId)) || '');
      return e === 'cajero@volvix.test' || tid === 'TNT001';
    });

    // Try a known TNT001 customer id directly — should 401/403/404
    const adminCust = await api('GET', '/api/customers?limit=1', state.adminToken);
    let adminArr = [];
    if (adminCust.body && Array.isArray(adminCust.body)) adminArr = adminCust.body;
    else if (adminCust.body && adminCust.body.customers) adminArr = adminCust.body.customers;
    else if (adminCust.body && adminCust.body.data) adminArr = adminCust.body.data;
    const targetId = adminArr[0] && (adminArr[0].id || adminArr[0].customer_id);

    let crossStatus = null; let crossLeaked = false;
    if (targetId) {
      const direct = await api('GET', `/api/customers/${encodeURIComponent(targetId)}`, state.ownerToken);
      crossStatus = direct.status;
      if (direct.status === 200 && direct.body) {
        const tid = direct.body.tenant_id || (direct.body.customer && direct.body.customer.tenant_id) || (direct.body.data && direct.body.data.tenant_id);
        if (tid && String(tid) === 'TNT001') crossLeaked = true;
        const sameId = String(direct.body.id || (direct.body.customer && direct.body.customer.id) || (direct.body.data && direct.body.data.id) || '') === String(targetId);
        if (sameId) crossLeaked = true;
      }
    }

    const noLeaksInLists = (ownerLeak === 0) && !cajeroLeak;
    const crossOk = !targetId || (!crossLeaked && [401, 403, 404].includes(crossStatus));
    const pass = noLeaksInLists && crossOk;
    const detail = `owner_customer_count=${ownerArr.length} TNT001_leak=${ownerLeak} cajero_leak=${cajeroLeak} cross_target=${targetId} cross_status=${crossStatus} cross_leaked=${crossLeaked}`;
    recordResult('O12', pass, detail);
  });

  // ---------------------------------------------------------------------------
  // CLEANUP + REPORT
  // ---------------------------------------------------------------------------
  test.afterAll(async () => {
    // 1. Cleanup test sub-tenant
    if (state.subTenantId) {
      try {
        await api('DELETE', `/api/owner/tenants/${state.subTenantId}`, state.ownerToken);
      } catch (_) {}
    }

    // 2. Aggregate score and write B42_OWNER_PANEL_E2E.md
    const ids = ['O1','O2','O3','O4','O5','O6','O7','O8','O9','O10','O11','O12'];
    const labels = {
      O1:  'Page loads with auth (console errors < 5)',
      O2:  'Navigation menu items work',
      O3:  'Crear sub-tenant (POST /api/owner/tenants → 201)',
      O4:  'Crear usuario en sub-tenant (POST /api/sub-tenants/:id/users → 201)',
      O5:  'Asignar permisos / feature flag a usuario (PATCH /api/users/:id/permissions)',
      O6:  'Trigger deploy (POST /api/owner/deploys)',
      O7:  'View activity log (audit-log endpoint)',
      O8:  'Edit tenant settings (PATCH /api/owner/tenants/:id)',
      O9:  'Suspender tenant (PATCH suspended=true)',
      O10: 'Marketing — Crear landing personalizada (POST /api/owner/landings)',
      O11: 'P0 button references FIXED (v25 / marketplace.html / panel_v7)',
      O12: 'Multi-tenant isolation (owner TNT002 ≠ admin TNT001)',
    };
    let pass = 0, total = 0;
    const lines = [];
    for (const id of ids) {
      total++;
      const r = state.results[id];
      if (r && r.pass) pass++;
      lines.push({ id, label: labels[id], result: r });
    }
    const score = total ? Math.round((pass/total)*100) : 0;

    // Console summary
    console.log('\n=== R5D / B42 OWNER PANEL E2E RESULTS ===');
    for (const ln of lines) {
      const status = ln.result ? (ln.result.pass ? 'PASS' : 'FAIL') : 'NO-RUN';
      console.log(`${ln.id} [${status}] ${ln.label} — ${ln.result ? ln.result.detail : ''}`);
    }
    console.log(`SCORE = ${pass}/${total} = ${score}/100`);
    console.log('=== /R5D RESULTS ===\n');

    // Markdown report
    const md = [];
    md.push('# B42 — Owner Panel E2E Report');
    md.push('');
    md.push(`- **Run tag**: \`${RUN_TAG}\``);
    md.push(`- **Base**: ${BASE}`);
    md.push(`- **Panel**: \`${PANEL_PATH}\``);
    md.push(`- **Owner**: \`${OWNER.email}\` (TNT002)`);
    md.push(`- **Admin**: \`${ADMIN.email}\` (TNT001 superadmin)`);
    md.push(`- **Test sub-tenant**: \`${TEST_TENANT_NAME}\` ${state.subTenantId ? `(id=${state.subTenantId})` : '(NOT CREATED)'}`);
    md.push(`- **Test user**: \`${TEST_USER_EMAIL}\` ${state.newUserId ? `(id=${state.newUserId})` : '(NOT CREATED)'}`);
    md.push('');
    md.push(`## Score: **${pass}/${total} = ${score}/100**`);
    md.push('');
    md.push('| ID | Label | Result | Detail |');
    md.push('|----|-------|--------|--------|');
    for (const ln of lines) {
      const status = ln.result ? (ln.result.pass ? 'PASS' : 'FAIL') : 'NO-RUN';
      const det = (ln.result && ln.result.detail || '').replace(/\|/g, '\\|').slice(0, 280);
      md.push(`| ${ln.id} | ${ln.label} | ${status} | ${det} |`);
    }
    md.push('');
    md.push('## Console errors captured');
    md.push('');
    if (state.consoleErrors.length === 0) {
      md.push('_None._');
    } else {
      md.push('```');
      for (const e of state.consoleErrors.slice(0, 30)) {
        md.push(`[${e.tag}] ${e.text}`);
      }
      md.push('```');
    }
    md.push('');
    md.push('## 5xx network failures captured');
    md.push('');
    if (state.networkFailures.length === 0) {
      md.push('_None._');
    } else {
      md.push('| Tag | Method | Status | URL |');
      md.push('|-----|--------|--------|-----|');
      for (const f of state.networkFailures.slice(0, 30)) {
        md.push(`| ${f.tag} | ${f.method} | ${f.status} | ${String(f.url).slice(0, 100)} |`);
      }
    }
    md.push('');
    md.push('## Cleanup');
    md.push('');
    md.push(state.subTenantId
      ? `- DELETE /api/owner/tenants/${state.subTenantId} → executed.`
      : '- No sub-tenant created → nothing to clean.');
    md.push('');
    md.push('## Constraints respected');
    md.push('');
    md.push('- No modification of `api/index.js` or any HTML.');
    md.push('- `Idempotency-Key` header sent on every POST/PATCH.');
    md.push('- `failOnStatusCode: false` on every request — each O-test records pass/fail without aborting the suite.');
    md.push('');
    md.push(`Generated: ${new Date().toISOString()}`);
    md.push('');
    try {
      fs.writeFileSync(REPORT_PATH, md.join('\n'), 'utf8');
    } catch (e) {
      console.error('Failed writing report:', String(e && e.message));
    }

    // Also dump raw JSON results next to the report for downstream tooling
    try {
      const jsonPath = path.join(__dirname, 'r5d-owner-panel-results.json');
      fs.writeFileSync(jsonPath, JSON.stringify({
        run_tag: RUN_TAG,
        base: BASE,
        panel: PANEL_PATH,
        sub_tenant_id: state.subTenantId,
        new_user_id: state.newUserId,
        score: { pass, total, percent: score },
        results: state.results,
        console_errors: state.consoleErrors.slice(0, 100),
        network_failures: state.networkFailures.slice(0, 100),
      }, null, 2), 'utf8');
    } catch (_) {}
  });
});
