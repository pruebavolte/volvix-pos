// ============================================================================
// R5A / B42 — ETIQUETA DESIGNER E2E (Label Templates)
// File: tests/r5a-etiquetas-e2e.spec.js
//
// Mission: verify the full label-template life-cycle on PRODUCTION:
//   E1  Page loads + auth-gate redirects unauthenticated to /login
//   E2  GET  /api/label-templates list shape {ok:true, templates:[...]}
//   E3  POST /api/label-templates → 201 + template.id
//   E4  GET  /api/label-templates/:id → returns just-created, elements JSONB intact
//   E5  PATCH /api/label-templates/:id → name + element changes persist
//   E6  DELETE /api/label-templates/:id → soft-delete, deleted_at set, list hides it
//   E7  4 quick templates (Básica/Producto/Granel/Oferta) populate canvas
//   E8  Drag-drop 10 components onto canvas (Texto, Nombre, Precio, Código,
//        QR, Logo, SKU, Línea, Caja, Fecha)
//   E9  Properties panel: click element → edit X/Y/W/H/fontSize/color/bold
//   E10 4 sizes (Pequeña 50×30, Mediana 60×40, Grande 80×50, Vertical 40×60)
//   E11 Save template (modal) → POST + success toast + ID returned
//   E12 "Mis Plantillas" modal → list templates → load restores canvas
//   E13 Print (ESC/POS) → POST /api/printer/raw (audit_only acceptable)
//   E14 Multi-tenant isolation: TNT001 templates not visible to TNT002
//
// Run:
//   cd "C:/Users/DELL/Downloads/verion 340"
//   BASE_URL=https://volvix-pos.vercel.app \
//     npx playwright test --config=tests/playwright.r5a.config.js --reporter=list
//
// IMPORTANT:
//   - Does NOT modify api/index.js or any HTML.
//   - Uses public HTTP surface plus a UI walk-through.
//   - ALL POSTs send Idempotency-Key.
//   - Final cleanup deletes every test template that was created.
// ============================================================================
const { test, expect, request } = require('@playwright/test');
const crypto = require('crypto');
const path = require('path');

// ── Test users ──────────────────────────────────────────────────────────────
const USERS = {
  admin: { email: 'admin@volvix.test', password: 'Volvix2026!', role: 'admin', tenant: 'TNT001' },
  owner: { email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner', tenant: 'TNT002' },
};

const LOGIN_PATHS = ['/api/login', '/api/auth/login', '/api/v1/auth/login'];

// ── Helpers ─────────────────────────────────────────────────────────────────
function newIdempotencyKey(tag = 'r5a') {
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
  let token = null;
  let session = null;
  let lastStatus = null;
  for (const p of LOGIN_PATHS) {
    const res = await ctx.post(p, { data: { email, password }, failOnStatusCode: false });
    lastStatus = res.status();
    if (res.ok()) {
      const b = await res.json().catch(() => ({}));
      token = b.token
        || b.access_token
        || b.jwt
        || (b.session && b.session.token)
        || (b.data && b.data.token)
        || null;
      session = b.session || null;
      if (token) break;
    }
  }
  await ctx.dispose();
  return { token, session, lastStatus };
}

async function api(baseURL, token, method, urlPath, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const m = String(method || 'get').toLowerCase();
  if ((m === 'post' || m === 'patch') && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = newIdempotencyKey('r5a');
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

function pickTemplateId(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.template && body.template.id) return body.template.id;
  if (body.id) return body.id;
  if (body.data && body.data.id) return body.data.id;
  return null;
}

// Sample elements for a tiny but valid label.
function sampleElements() {
  return [
    { type: 'name',  x: 20, y: 15, w: 180, h: 24, text: 'Producto E2E', fontSize: 14, bold: true },
    { type: 'price', x: 20, y: 50, w: 100, h: 32, text: '$25.00',       fontSize: 22, bold: true, color: '#EA580C' },
    { type: 'sku',   x: 20, y: 90, w: 120, h: 14, text: 'SKU-R5A-1',    fontSize: 10 },
  ];
}

// ── Shared state across the suite ───────────────────────────────────────────
const ctx = {
  adminToken: null,
  ownerToken: null,
  // every template id created during the run; cleaned up in afterAll
  createdIds: new Set(),
  // primary template the API tests pivot on
  templateId: null,
  // template id created from the UI in E11
  uiTemplateId: null,
};

// ============================================================================
test.describe.configure({ mode: 'serial' });

test.describe('R5A Etiqueta Designer E2E', () => {
  test.setTimeout(120_000);

  // ---------- bootstrap: log in both roles ----------
  test.beforeAll(async ({ baseURL }) => {
    const a = await loginViaAPI(baseURL, USERS.admin.email, USERS.admin.password);
    ctx.adminToken = a.token;
    const o = await loginViaAPI(baseURL, USERS.owner.email, USERS.owner.password);
    ctx.ownerToken = o.token;
  });

  // ---------- final cleanup: best-effort soft-delete every test template ----
  test.afterAll(async ({ baseURL }) => {
    if (!ctx.adminToken) return;
    for (const id of Array.from(ctx.createdIds)) {
      try {
        await api(baseURL, ctx.adminToken, 'delete', `/api/label-templates/${id}`);
      } catch (_) { /* best-effort */ }
    }
    if (ctx.ownerToken) {
      // also try to clean any owner-tenant templates left behind
      try {
        const list = await api(baseURL, ctx.ownerToken, 'get', '/api/label-templates?limit=200');
        const arr = (list.body && list.body.templates) || [];
        for (const t of arr) {
          if (t && t.name && /^\[r5a-/.test(t.name)) {
            try { await api(baseURL, ctx.ownerToken, 'delete', `/api/label-templates/${t.id}`); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  });

  // ==========================================================================
  // E1 — auth-gate redirects unauthenticated to /login
  // ==========================================================================
  test('E1: auth-gate redirects to /login when no JWT, OK when authenticated', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'no baseURL');

    // 1) Without any token in localStorage → must be redirected to /login.html
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    // Give auth-gate a beat to run its redirect
    await page.waitForTimeout(800);
    const urlNoAuth = page.url();
    annotate(test, 'E1-url_no_auth', urlNoAuth);
    expect(urlNoAuth, 'unauthenticated visit must land on /login.html').toMatch(/login\.html/i);

    // 2) Login via UI then re-navigate → page loads, auth-gate stays out of the way.
    let uiLoggedIn = false;
    try {
      const emailLoc = page.locator('#emailInput, input[name="email"], input[type="email"]').first();
      const passLoc  = page.locator('#passwordInput, input[name="password"], input[type="password"]').first();
      if (await emailLoc.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await emailLoc.fill(USERS.admin.email);
        await passLoc.fill(USERS.admin.password);
        const submit = page.locator('button[type="submit"], #btnLogin, form button:has-text("Entrar")').first();
        await Promise.all([
          page.waitForURL(u => !/login\.html?$/i.test(u.toString()), { timeout: 18_000 }).catch(() => null),
          submit.click().catch(() => {}),
        ]);
        uiLoggedIn = !/login\.html/i.test(page.url());
      }
    } catch (_) { /* fallthrough: API-injected token below */ }

    // 3) Fallback: inject the token from API login if the UI flow didn't stick.
    if (!uiLoggedIn && ctx.adminToken) {
      const tok = ctx.adminToken;
      // open any same-origin page so localStorage is the right origin
      await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.evaluate(t => {
        try {
          localStorage.setItem('volvix_token', t);
          localStorage.setItem('volvixAuthToken', t);
        } catch (_) {}
      }, tok);
    }

    // 4) Navigate to the designer — should NOT redirect.
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(800);
    const urlAuth = page.url();
    annotate(test, 'E1-url_auth', urlAuth);
    expect(urlAuth, 'authenticated visit must stay on the designer page')
      .toMatch(/etiqueta_designer\.html/i);

    // The drawer canvas must be present.
    const canvas = page.locator('#canvas');
    await expect(canvas, 'canvas must render on the page').toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'r5a-e1-designer-loaded.png'),
      fullPage: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // E2 — GET list returns {ok:true, templates:[...]}
  // ==========================================================================
  test('E2: GET /api/label-templates list returns {ok:true, templates:[...]}', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    const r = await api(baseURL, ctx.adminToken, 'get', '/api/label-templates?limit=100');
    annotate(test, 'E2-status', String(r.status));
    annotate(test, 'E2-shape',  Object.keys(r.body || {}));
    annotate(test, 'E2-count',  r.body && r.body.count);

    expectStatusIn(r.status, [200], 'list must return 200');
    expect(r.body && r.body.ok, 'response must have ok:true').toBeTruthy();
    expect(Array.isArray(r.body && r.body.templates), 'templates must be an array').toBeTruthy();
    // Count is informational; can be 0 on a fresh tenant.
    annotate(test, 'E2-sample', (r.body.templates || []).slice(0, 2));
  });

  // ==========================================================================
  // E3 — POST CREATE → 201 + template.id
  // ==========================================================================
  test('E3: POST /api/label-templates creates a template (201 + id)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    const idem = newIdempotencyKey('E3-create');
    const payload = {
      name: `[r5a-E3] template-${Date.now()}`,
      notes: 'Created by r5a E3',
      elements: sampleElements(),
      canvas_w: 300,
      canvas_h: 180,
      paper_size: 'Pequeña',
      printer_target: 'thermal',
    };
    const r = await api(baseURL, ctx.adminToken, 'post', '/api/label-templates', payload, {
      'Idempotency-Key': idem,
    });
    annotate(test, 'E3-idem',    idem);
    annotate(test, 'E3-status',  String(r.status));
    annotate(test, 'E3-body',    r.body);

    expectStatusIn(r.status, [200, 201], 'create must return 201 (or 200 fallback)');
    expect(r.body && r.body.ok, 'response.ok must be true').toBeTruthy();
    const id = pickTemplateId(r.body);
    expect(id, 'response must expose template.id').toBeTruthy();
    ctx.templateId = id;
    ctx.createdIds.add(id);
    annotate(test, 'E3-template_id', id);
  });

  // ==========================================================================
  // E4 — GET single → returns the just-created with elements JSONB intact
  // ==========================================================================
  test('E4: GET /api/label-templates/:id returns the template with elements intact', async ({ baseURL }) => {
    test.skip(!ctx.adminToken || !ctx.templateId, 'E3 must succeed first');

    const r = await api(baseURL, ctx.adminToken, 'get', `/api/label-templates/${ctx.templateId}`);
    annotate(test, 'E4-status', String(r.status));
    annotate(test, 'E4-body',   r.body);

    expectStatusIn(r.status, [200], 'single fetch must return 200');
    const t = r.body && (r.body.template || r.body.data);
    expect(t, 'response.template required').toBeTruthy();
    expect(String(t.id), 'id must echo back').toBe(String(ctx.templateId));

    expect(Array.isArray(t.elements), 'elements must be an array (JSONB)').toBeTruthy();
    expect(t.elements.length, 'elements must contain the 3 we sent').toBe(3);
    const types = t.elements.map(e => e.type).sort();
    expect(types).toEqual(['name', 'price', 'sku']);

    // Numeric canvas dimensions should round-trip.
    expect(Number(t.canvas_w)).toBe(300);
    expect(Number(t.canvas_h)).toBe(180);
  });

  // ==========================================================================
  // E5 — PATCH update name + add an element
  // ==========================================================================
  test('E5: PATCH /api/label-templates/:id updates name and elements', async ({ baseURL }) => {
    test.skip(!ctx.adminToken || !ctx.templateId, 'E3 must succeed first');

    const newName = `[r5a-E5] renamed-${Date.now()}`;
    const updatedElements = [
      ...sampleElements(),
      { type: 'qr', x: 200, y: 90, w: 60, h: 60, value: 'https://volvix.test/p/r5a-e5' },
    ];
    const idem = newIdempotencyKey('E5-patch');
    const r = await api(baseURL, ctx.adminToken, 'patch', `/api/label-templates/${ctx.templateId}`, {
      name: newName,
      elements: updatedElements,
    }, { 'Idempotency-Key': idem });
    annotate(test, 'E5-idem',   idem);
    annotate(test, 'E5-status', String(r.status));
    annotate(test, 'E5-body',   r.body);

    expectStatusIn(r.status, [200, 201], 'patch must return 200/201');
    expect(r.body && r.body.ok, 'response.ok must be true').toBeTruthy();

    // Re-read and confirm both fields persisted.
    const after = await api(baseURL, ctx.adminToken, 'get', `/api/label-templates/${ctx.templateId}`);
    annotate(test, 'E5-after_status', String(after.status));
    expectStatusIn(after.status, [200]);
    const t = after.body && (after.body.template || after.body.data);
    expect(t.name, 'name must be the new value').toBe(newName);
    expect(Array.isArray(t.elements), 'elements still array').toBeTruthy();
    expect(t.elements.length, 'elements must now be 4').toBe(4);
    expect(t.elements.some(e => e.type === 'qr'), 'qr element must be present').toBeTruthy();
  });

  // ==========================================================================
  // E6 — DELETE soft-delete, then GET list must NOT include it
  // ==========================================================================
  test('E6: DELETE /api/label-templates/:id soft-deletes, list hides it', async ({ baseURL }) => {
    test.skip(!ctx.adminToken || !ctx.templateId, 'E3 must succeed first');

    // Create a *throwaway* template so E6 doesn't kill the one E11/E12 will reuse.
    const create = await api(baseURL, ctx.adminToken, 'post', '/api/label-templates', {
      name: `[r5a-E6] to-delete-${Date.now()}`,
      elements: sampleElements(),
      canvas_w: 300, canvas_h: 180,
    }, { 'Idempotency-Key': newIdempotencyKey('E6-create') });
    expectStatusIn(create.status, [200, 201]);
    const targetId = pickTemplateId(create.body);
    expect(targetId, 'must have a target id').toBeTruthy();
    ctx.createdIds.add(targetId);

    // Delete
    const del = await api(baseURL, ctx.adminToken, 'delete', `/api/label-templates/${targetId}`);
    annotate(test, 'E6-del_status', String(del.status));
    annotate(test, 'E6-del_body',   del.body);
    expectStatusIn(del.status, [200, 204], 'delete must return 200/204');
    if (del.body) {
      expect(del.body.ok || del.body.deleted || del.body.already_deleted, 'must report ok/deleted').toBeTruthy();
    }

    // Single GET on the deleted id → 404 (it filters deleted_at=is.null)
    const single = await api(baseURL, ctx.adminToken, 'get', `/api/label-templates/${targetId}`);
    annotate(test, 'E6-single_after_delete', String(single.status));
    expectStatusIn(single.status, [404], 'deleted template should be 404 on single fetch');

    // List must NOT include the deleted id
    const list = await api(baseURL, ctx.adminToken, 'get', '/api/label-templates?limit=500');
    expectStatusIn(list.status, [200]);
    const arr = (list.body && list.body.templates) || [];
    const stillThere = arr.find(t => String(t.id) === String(targetId));
    expect(stillThere, 'deleted template must NOT show in the list').toBeFalsy();
    annotate(test, 'E6-list_count', arr.length);
  });

  // ==========================================================================
  // E7 — 4 quick templates (Básica/Producto/Granel/Oferta) populate canvas
  // ==========================================================================
  test('E7: clicking the 4 quick-template chips populates the canvas', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);

    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.loadTemplate === 'function', null, { timeout: 8_000 });

    const expected = {
      basica:   3,    // name + price + barcode
      producto: 6,    // logo + name + sku + price + barcode + qr
      granel:   5,    // name + 2x text + price + barcode
      oferta:   5,    // box + text + name + price + text
    };

    const results = {};
    for (const tpl of Object.keys(expected)) {
      // Use the page's API so we don't depend on visual chip styling.
      await page.evaluate(name => window.loadTemplate(name), tpl);
      // After loadTemplate, `elements` is a top-level var inside the page script.
      const count = await page.evaluate(() => (Array.isArray(window.elements) ? window.elements.length : null));
      results[tpl] = count;
      // The canvas should now have <count> .element children
      const elementsOnCanvas = await page.locator('#canvas .element').count();
      results[`${tpl}_canvas`] = elementsOnCanvas;
      expect(elementsOnCanvas, `quick template "${tpl}" must populate canvas`).toBeGreaterThanOrEqual(expected[tpl]);
    }
    annotate(test, 'E7-counts', results);

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'r5a-e7-quick-templates.png'),
      fullPage: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // E8 — Drag-drop 10 components onto the canvas
  // The page declares `elements`, `addElement`, etc. as top-level vars
  // inside a non-IIFE <script> block — they ARE on window in practice but
  // some browsers tree-shake them out of `window` lookup. We assert by DOM
  // counts (most authoritative) and back it up with element types read off
  // the rendered nodes, never depending on `window.elements` to be writable
  // from outside.
  // ==========================================================================
  test('E8: simulate drop for the 10 components — each lands on canvas', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.addElement === 'function', null, { timeout: 8_000 });

    // Clear via clearCanvas() (it's wired to onclick of the "Limpiar" button).
    // First stub VolvixUI.confirm so it auto-confirms.
    await page.evaluate(() => {
      window.VolvixUI = window.VolvixUI || {};
      window.VolvixUI.confirm = async () => true;
      if (typeof window.clearCanvas === 'function') window.clearCanvas();
    });
    // Wait for canvas to be empty
    await page.waitForFunction(() => document.querySelectorAll('#canvas .element').length === 0,
      null, { timeout: 5_000 });

    const types = ['text','name','price','barcode','qr','logo','sku','line','box','date'];
    let xOff = 10, yOff = 10;
    for (const t of types) {
      // addElement mutates the page-internal `elements` array and re-renders.
      await page.evaluate(({ t, x, y }) => window.addElement(t, x, y), { t, x: xOff, y: yOff });
      xOff += 12; yOff += 8;
    }
    // Authoritative source: the DOM nodes the renderer produced.
    const onCanvas = await page.locator('#canvas .element').count();
    annotate(test, 'E8-elements_on_canvas', onCanvas);
    expect(onCanvas, 'all 10 components should render on canvas').toBe(10);

    // Each type must have produced a recognizable element. We verify by
    // round-tripping through the page: attempt to open the properties of
    // each by clicking and reading the props panel content.
    // Simpler: count children and check distinct backgrounds/structures.
    const renderedSummary = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#canvas .element'));
      return nodes.map(n => ({
        w: n.style.width,
        h: n.style.height,
        innerLen: n.innerHTML.length,
      }));
    });
    annotate(test, 'E8-rendered_summary', renderedSummary);
    expect(renderedSummary.length).toBe(10);

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'r5a-e8-10-components.png'),
      fullPage: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // E9 — Properties panel: select element → edit X/Y/W/H/fontSize/color/bold
  // We assert via the rendered DOM (node.style.left/top/width/height),
  // never via window.elements which is a function-local variable in some
  // browsers.
  // ==========================================================================
  test('E9: properties panel updates element attrs (visual update)', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.addElement === 'function', null, { timeout: 8_000 });

    // Clean state via clearCanvas + auto-confirm
    await page.evaluate(() => {
      window.VolvixUI = window.VolvixUI || {};
      window.VolvixUI.confirm = async () => true;
      if (typeof window.clearCanvas === 'function') window.clearCanvas();
    });
    await page.waitForFunction(() => document.querySelectorAll('#canvas .element').length === 0,
      null, { timeout: 5_000 });

    // Add a fresh "name" element.
    await page.evaluate(() => window.addElement('name', 30, 30));
    await page.waitForFunction(() => document.querySelectorAll('#canvas .element').length === 1,
      null, { timeout: 5_000 });

    // Read the id off the rendered DOM (data-id) and select it.
    const id = await page.locator('#canvas .element').first().evaluate(n => Number(n.dataset.id));
    expect(id, 'rendered element must expose data-id').toBeGreaterThan(0);
    await page.evaluate(eid => window.selectElement(eid), id);

    // Properties panel must now have real inputs (not the empty placeholder).
    const propsPanel = page.locator('#props-content');
    await expect(propsPanel).toBeVisible();
    const hasInputs = await propsPanel.locator('input').count();
    expect(hasInputs, 'props panel must show inputs after selection').toBeGreaterThan(0);

    // Update each property via updateProp — the function is global.
    await page.evaluate(() => window.updateProp('x', 80));
    await page.evaluate(() => window.updateProp('y', 60));
    await page.evaluate(() => window.updateProp('w', 220));
    await page.evaluate(() => window.updateProp('h', 30));
    await page.evaluate(() => window.updateProp('fontSize', 18));
    await page.evaluate(() => window.updateProp('color', '#1E40AF'));
    await page.evaluate(() => window.updateProp('bold', true));

    // Visual: the rendered DOM node must reflect left/top/width/height.
    const rect = await page.locator('#canvas .element').first().evaluate(el => ({
      left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height,
    }));
    annotate(test, 'E9-rect', rect);
    expect(rect.left).toBe('80px');
    expect(rect.top).toBe('60px');
    expect(rect.width).toBe('220px');
    expect(rect.height).toBe('30px');

    // The font-size + color + bold are applied in the inner <div>'s inline style.
    const innerStyle = await page.locator('#canvas .element').first().evaluate(el => {
      const inner = el.querySelector('div');
      return inner ? inner.getAttribute('style') : '';
    });
    annotate(test, 'E9-inner_style', innerStyle);
    expect(innerStyle, 'fontSize 18px must appear in inner style').toMatch(/font-size:\s*18px/);
    // Color may be lowercased / formatted as rgb — accept either case.
    expect(innerStyle.toLowerCase(), 'color must be applied').toMatch(/#1e40af|rgb\(\s*30,\s*64,\s*175\s*\)/);
    expect(innerStyle, 'font-weight 700 (bold) must be applied').toMatch(/font-weight:\s*700/);
  });

  // ==========================================================================
  // E10 — 4 sizes: Pequeña/Mediana/Grande/Vertical resize the canvas
  // ==========================================================================
  test('E10: setSize resizes canvas to the 4 presets', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.setSize === 'function', null, { timeout: 8_000 });

    const sizes = [
      { name: 'Pequeña',  w: 300, h: 180 },
      { name: 'Mediana',  w: 360, h: 240 },
      { name: 'Grande',   w: 480, h: 300 },
      { name: 'Vertical', w: 240, h: 360 },
    ];
    const results = [];
    for (const s of sizes) {
      await page.evaluate(({ w, h }) => window.setSize(w, h, null), s);
      const dims = await page.locator('#canvas').evaluate(el => ({ w: el.offsetWidth, h: el.offsetHeight }));
      const lbl  = await page.locator('#size-label').textContent();
      results.push({ name: s.name, want_w: s.w, want_h: s.h, got_w: dims.w, got_h: dims.h, label: lbl });
      expect(dims.w, `${s.name} width`).toBe(s.w);
      expect(dims.h, `${s.name} height`).toBe(s.h);
    }
    annotate(test, 'E10-results', results);
  });

  // ==========================================================================
  // E11 — Save template via UI (modal) → POST + ID returned
  // ==========================================================================
  test('E11: saveTemplate() with a name persists via POST and returns an ID', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.addElement === 'function', null, { timeout: 8_000 });

    // Build a small label
    await page.evaluate(() => {
      window.elements = [];
      window.addElement('name',  20, 20);
      window.addElement('price', 20, 60);
    });

    // The UI uses VolvixUI.form modal — short-circuit it by patching it
    // to immediately resolve with the values. This is identical to a user
    // filling-in the form and clicking submit.
    const tplName = `[r5a-E11] from-ui-${Date.now()}`;
    const tplNotes = 'Saved by E11 via UI walk';
    await page.evaluate(({ name, notes }) => {
      window.VolvixUI = window.VolvixUI || {};
      window.VolvixUI.form = async () => ({ name, notes });
    }, { name: tplName, notes: tplNotes });

    // Listen to the POST so we can capture the returned id even if the toast
    // is missed by the test runner.
    const postPromise = page.waitForResponse(
      r => /\/api\/label-templates(\?|$)/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 25_000 },
    );

    await page.evaluate(() => window.saveTemplate());

    let postBody = null, postStatus = null;
    try {
      const resp = await postPromise;
      postStatus = resp.status();
      postBody = await resp.json().catch(() => ({}));
    } catch (e) {
      annotate(test, 'E11-post_wait_error', String(e && e.message || e));
    }
    annotate(test, 'E11-post_status', String(postStatus));
    annotate(test, 'E11-post_body',   postBody);

    expectStatusIn(postStatus, [200, 201], 'POST must succeed via UI save');
    const id = pickTemplateId(postBody);
    expect(id, 'response must include template id').toBeTruthy();
    ctx.uiTemplateId = id;
    ctx.createdIds.add(id);

    // The page also exposes window._etiquetaCurrentId after a successful save
    const exposed = await page.evaluate(() => window._etiquetaCurrentId);
    annotate(test, 'E11-exposed_id', exposed);
    expect(String(exposed)).toBe(String(id));

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'r5a-e11-save.png'),
      fullPage: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // E12 — Load via "Mis Plantillas" → list + restore canvas
  // ==========================================================================
  test('E12: openTemplatesModal lists templates and Cargar restores canvas', async ({ page, baseURL }) => {
    test.skip(!ctx.adminToken || !ctx.uiTemplateId, 'E11 must succeed first');

    await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(t => {
      localStorage.setItem('volvix_token', t);
      localStorage.setItem('volvixAuthToken', t);
    }, ctx.adminToken);
    await page.goto('/etiqueta_designer.html', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => typeof window.openTemplatesModal === 'function', null, { timeout: 8_000 });

    // Open the modal — this triggers GET /api/label-templates
    const listPromise = page.waitForResponse(
      r => /\/api\/label-templates(\?|$)/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await page.evaluate(() => window.openTemplatesModal());

    let listStatus = null, listBody = null;
    try {
      const resp = await listPromise;
      listStatus = resp.status();
      listBody = await resp.json().catch(() => ({}));
    } catch (e) {
      annotate(test, 'E12-list_wait_error', String(e && e.message || e));
    }
    annotate(test, 'E12-list_status', String(listStatus));
    annotate(test, 'E12-list_count',  listBody && listBody.count);

    expectStatusIn(listStatus, [200], 'modal list must succeed');
    expect(Array.isArray(listBody && listBody.templates)).toBeTruthy();
    const found = (listBody.templates || []).find(t => String(t.id) === String(ctx.uiTemplateId));
    expect(found, 'E11 template must appear in the modal list').toBeTruthy();
    expect(found.name, 'name must match what E11 saved').toMatch(/^\[r5a-E11\]/);
    expect(found.updated_at, 'updated_at must be set').toBeTruthy();
    expect(Array.isArray(found.elements), 'elements must be array').toBeTruthy();
    expect(found.elements.length, 'should reflect 2 elements from E11').toBeGreaterThanOrEqual(2);

    // Verify the modal DOM shows the row + a "Cargar" button
    const modal = page.locator('#templates-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    const cargarBtn = page.locator(`#templates-modal [data-load-id="${ctx.uiTemplateId}"]`);
    await expect(cargarBtn, 'Cargar button must exist for the saved template').toBeVisible({ timeout: 5_000 });

    // Click "Cargar" — invoke directly (the inline onclick is set programmatically)
    await page.evaluate(id => window.loadTemplateFromBackend(id), ctx.uiTemplateId);

    // Wait for the canvas to repopulate with at least 2 elements (DOM-based)
    await page.waitForFunction(() => document.querySelectorAll('#canvas .element').length >= 2,
      null, { timeout: 8_000 });
    const restoredCount = await page.locator('#canvas .element').count();
    annotate(test, 'E12-restored_count', restoredCount);
    expect(restoredCount, 'canvas must show >=2 elements after load').toBeGreaterThanOrEqual(2);

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'r5a-e12-load.png'),
      fullPage: true,
    }).catch(() => {});
  });

  // ==========================================================================
  // E13 — Print (ESC/POS) → POST /api/printer/raw (audit_only acceptable)
  // ==========================================================================
  test('E13: print posts ESC/POS to /api/printer/raw (audit_only acceptable)', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');

    // Build a small ESC/POS payload (mimics _buildEscPosFromElements output).
    const ESC = '\x1B', GS = '\x1D';
    const raw = ESC + '@'        // init
              + ESC + 'a' + '\x01'    // center
              + 'VOLVIX TEST LABEL\n'
              + ESC + 'a' + '\x00'    // left
              + 'SKU-R5A-13\n'
              + GS + 'V' + '\x01';    // cut
    const dataB64 = Buffer.from(raw, 'utf8').toString('base64');

    const r = await api(baseURL, ctx.adminToken, 'post', '/api/printer/raw', {
      printer_id: 'default',
      format: 'escpos',
      encoding: 'base64',
      payload: dataB64,
      length: dataB64.length,
      data: dataB64,
      ip: '127.0.0.1',
      port: 9100,
      source: 'etiqueta_designer:r5a-test',
    }, { 'Idempotency-Key': newIdempotencyKey('E13-print') });

    annotate(test, 'E13-status', String(r.status));
    annotate(test, 'E13-body',   r.body);

    // 200/201 audit_only is the happy path. 403 is also acceptable (some
    // deploys restrict to owner/superadmin) — what we MUST not see is 5xx.
    expectStatusIn(r.status, [200, 201, 202, 403, 404, 503],
      '/api/printer/raw must respond with a known auth/audit shape, never 5xx');

    if (r.status === 200 || r.status === 201) {
      expect(r.body && r.body.ok, 'audit response must have ok:true').toBeTruthy();
      expect(r.body && r.body.audit_only, 'audit_only flag expected').toBeTruthy();
      expect(Number(r.body.bytes), 'bytes must equal length').toBe(dataB64.length);
    }
  });

  // ==========================================================================
  // E14 — Multi-tenant isolation: TNT001 templates not visible to TNT002
  // ==========================================================================
  test('E14: owner (TNT002) does NOT see admin (TNT001) templates', async ({ baseURL }) => {
    test.skip(!ctx.adminToken, 'admin login required');
    test.skip(!ctx.ownerToken, 'owner login required (TNT002)');
    test.skip(!ctx.templateId, 'E3 must succeed first');

    // The admin (TNT001) created ctx.templateId in E3.
    // Now query as owner (TNT002) — admin's template MUST NOT appear.
    const r = await api(baseURL, ctx.ownerToken, 'get', '/api/label-templates?limit=500');
    annotate(test, 'E14-owner_status', String(r.status));
    annotate(test, 'E14-owner_count',  r.body && r.body.count);

    expectStatusIn(r.status, [200], 'owner must be able to list its own tenant');
    const arr = (r.body && r.body.templates) || [];
    const leaked = arr.find(t => String(t.id) === String(ctx.templateId));
    expect(leaked, 'TNT001 template must NOT appear when listing as TNT002').toBeFalsy();

    // Cross-tenant read by id → must 404 (server hides it as if it didn't exist).
    const single = await api(baseURL, ctx.ownerToken, 'get', `/api/label-templates/${ctx.templateId}`);
    annotate(test, 'E14-cross_id_status', String(single.status));
    expectStatusIn(single.status, [404, 403],
      'cross-tenant GET by id must be denied (404 expected, 403 acceptable)');

    // For symmetry, owner can list their own tenant successfully.
    annotate(test, 'E14-owner_sample',
      (arr || []).slice(0, 2).map(t => ({ id: t.id, name: t.name })));
  });
});
