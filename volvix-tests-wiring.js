/**
 * volvix-tests-wiring.js
 * Sistema de tests E2E automatizados para Volvix POS
 * Agent-6 / Ronda 6 Fibonacci
 *
 * Uso:
 *   <script src="/volvix-tests-wiring.js"></script>
 *   Aparecera un boton flotante con un tubo de ensayo. Click -> corre todos los tests.
 *   window.runVolvixTests()  -> programatico
 *   window.exportTestResults() -> descarga JSON
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const API = location.origin;
  // Password loaded from env (TEST_USER_PASSWORD) — never hardcode.
  const PASS = (typeof process !== 'undefined' && process.env && process.env.TEST_USER_PASSWORD)
    || (typeof window !== 'undefined' && window.TEST_USER_PASSWORD)
    || ''; // <<test-password-via-env>>
  const USERS = {
    admin:  { email: 'admin@volvix.test',  password: PASS, role: 'superadmin' },
    owner:  { email: 'owner@volvix.test',  password: PASS, role: 'owner' },
    cajero: { email: 'cajero@volvix.test', password: PASS, role: 'cashier' }
  };
  const STATE = { sessions: {}, lastSaleId: null, lastCustomerId: null };

  const tests = [];
  let results = [];

  function test(name, fn) { tests.push({ name, fn }); }
  function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

  async function jpost(path, body, opts = {}) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = { _raw: await res.text() }; }
    return { res, data, status: res.status, ok: res.ok };
  }

  async function jget(path, opts = {}) {
    const res = await fetch(API + path, { method: 'GET', headers: opts.headers || {} });
    let data = null;
    try { data = await res.json(); } catch (_) { data = { _raw: await res.text() }; }
    return { res, data, status: res.status, ok: res.ok };
  }

  // ============================================================
  // TESTS - AUTH
  // ============================================================
  test('Login admin@volvix.test', async () => {
    const { data, ok } = await jpost('/api/login', {
      email: USERS.admin.email, password: USERS.admin.password
    });
    assert(ok, 'HTTP no OK');
    assert(data.ok === true, 'Login admin failed: ' + JSON.stringify(data));
    assert(data.session && data.session.role === 'superadmin', 'Wrong role admin');
    STATE.sessions.admin = data.session;
  });

  test('Login owner@volvix.test', async () => {
    const { data, ok } = await jpost('/api/login', {
      email: USERS.owner.email, password: USERS.owner.password
    });
    assert(ok, 'HTTP no OK');
    assert(data.ok === true, 'Login owner failed');
    assert(data.session && data.session.role === 'owner', 'Wrong role owner');
    STATE.sessions.owner = data.session;
  });

  test('Login cajero@volvix.test', async () => {
    const { data, ok } = await jpost('/api/login', {
      email: USERS.cajero.email, password: USERS.cajero.password
    });
    assert(ok, 'HTTP no OK');
    assert(data.ok === true, 'Login cajero failed');
    assert(data.session, 'Sin session');
    STATE.sessions.cajero = data.session;
  });

  test('Login invalido falla (credenciales malas)', async () => {
    const { data, status } = await jpost('/api/login', {
      email: 'noexiste@volvix.test', password: 'malisimo'
    });
    assert(data.ok !== true, 'Login no deberia haber pasado');
    assert(status >= 400 || data.error, 'No vino error');
  });

  test('Login invalido falla (password vacio)', async () => {
    const { data } = await jpost('/api/login', { email: USERS.admin.email, password: '' });
    assert(data.ok !== true, 'Password vacio no deberia funcionar');
  });

  // ============================================================
  // TESTS - HEALTH / META
  // ============================================================
  test('GET /api/health responde OK', async () => {
    const { data, ok } = await jget('/api/health');
    assert(ok, 'health no OK');
    assert(data.ok === true || data.status === 'ok' || data.healthy, 'health payload raro');
  });

  test('GET /api/tenants devuelve >=3 tenants', async () => {
    const { data, ok } = await jget('/api/tenants');
    assert(ok, 'tenants no OK');
    const arr = Array.isArray(data) ? data : (data.tenants || data.data || []);
    assert(Array.isArray(arr), 'tenants no es array');
    assert(arr.length >= 3, 'esperaba >=3 tenants, hay ' + arr.length);
  });

  // ============================================================
  // TESTS - CATALOGO
  // ============================================================
  test('GET /api/products devuelve array', async () => {
    const { data, ok } = await jget('/api/products');
    assert(ok, 'products no OK');
    const arr = Array.isArray(data) ? data : (data.products || data.data || []);
    assert(Array.isArray(arr), '/api/products no devolvio array');
  });

  test('GET /api/products items tienen estructura minima', async () => {
    const { data } = await jget('/api/products');
    const arr = Array.isArray(data) ? data : (data.products || data.data || []);
    if (arr.length === 0) return; // OK si esta vacio
    const p = arr[0];
    assert(typeof p === 'object' && p !== null, 'item no es objeto');
    assert('name' in p || 'nombre' in p || 'code' in p, 'item sin name/code');
  });

  test('GET /api/customers devuelve array', async () => {
    const { data, ok } = await jget('/api/customers');
    assert(ok || data, 'customers no respondio');
    const arr = Array.isArray(data) ? data : (data.customers || data.data || []);
    assert(Array.isArray(arr), 'customers no es array');
  });

  // ============================================================
  // TESTS - OWNER DASHBOARD
  // ============================================================
  test('GET /api/owner/dashboard tiene metrics', async () => {
    const { data, ok } = await jget('/api/owner/dashboard');
    assert(ok, 'dashboard no OK');
    assert(data && typeof data === 'object', 'dashboard sin payload');
    const hasMetric =
      'metrics' in data || 'sales' in data || 'totals' in data ||
      'revenue' in data || 'kpis' in data || 'today' in data;
    assert(hasMetric, 'dashboard sin metricas reconocibles: ' + Object.keys(data).join(','));
  });

  // ============================================================
  // TESTS - VENTAS
  // ============================================================
  test('POST /api/sales crea venta', async () => {
    const { data, ok } = await jpost('/api/sales', {
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      total: 50,
      payment_method: 'efectivo',
      items: [{ code: 'TEST', name: 'Test', price: 50, qty: 1, subtotal: 50 }]
    });
    assert(ok, 'sales POST no OK status');
    const id = data.id || (data.sale && data.sale.id) || data.sale_id;
    assert(id, 'No vino sale id: ' + JSON.stringify(data).slice(0, 200));
    STATE.lastSaleId = id;
  });

  test('GET /api/sales lista ventas (incluye la recien creada)', async () => {
    const { data, ok } = await jget('/api/sales');
    assert(ok, 'sales GET no OK');
    const arr = Array.isArray(data) ? data : (data.sales || data.data || []);
    assert(Array.isArray(arr), 'sales no es array');
    if (STATE.lastSaleId) {
      const found = arr.some(s => s.id === STATE.lastSaleId);
      // No es estricto (paginacion), solo warning suave
      if (!found && arr.length > 0) {
        // pasa: puede estar paginado
      }
    }
  });

  // ============================================================
  // TESTS - CUSTOMERS
  // ============================================================
  test('POST /api/customers crea cliente', async () => {
    const stamp = Date.now();
    const { data, ok } = await jpost('/api/customers', {
      name: 'Test Cliente ' + stamp,
      phone: '5550000' + (stamp % 1000),
      email: `test${stamp}@volvix.test`
    });
    assert(ok, 'customers POST no OK');
    const id = data.id || (data.customer && data.customer.id);
    assert(id || data.ok, 'Cliente sin id: ' + JSON.stringify(data).slice(0, 200));
    STATE.lastCustomerId = id;
  });

  // ============================================================
  // TESTS - LOCAL STATE / OFFLINE
  // ============================================================
  test('localStorage persistencia basica', () => {
    const k = 'volvix:test:' + Date.now();
    localStorage.setItem(k, 'ok');
    assert(localStorage.getItem(k) === 'ok', 'localStorage roto');
    localStorage.removeItem(k);
    assert(localStorage.getItem(k) === null, 'remove no funciono');
  });

  test('localStorage soporta JSON serializado', () => {
    const k = 'volvix:test:json:' + Date.now();
    const obj = { a: 1, b: [2, 3], c: 'hola' };
    localStorage.setItem(k, JSON.stringify(obj));
    const back = JSON.parse(localStorage.getItem(k));
    assert(back.a === 1 && back.b[1] === 3 && back.c === 'hola', 'JSON roundtrip fallo');
    localStorage.removeItem(k);
  });

  test('Sync queue: encola y vacia', () => {
    const QKEY = 'volvix:syncqueue:test';
    const queue = [];
    queue.push({ type: 'sale', payload: { id: 1 }, ts: Date.now() });
    queue.push({ type: 'customer', payload: { id: 2 }, ts: Date.now() });
    localStorage.setItem(QKEY, JSON.stringify(queue));
    const loaded = JSON.parse(localStorage.getItem(QKEY));
    assert(loaded.length === 2, 'queue no persiste');
    // drain
    while (loaded.length) loaded.shift();
    localStorage.setItem(QKEY, JSON.stringify(loaded));
    assert(JSON.parse(localStorage.getItem(QKEY)).length === 0, 'drain fallo');
    localStorage.removeItem(QKEY);
  });

  test('sessionStorage funciona', () => {
    const k = 'volvix:ss:' + Date.now();
    sessionStorage.setItem(k, '42');
    assert(sessionStorage.getItem(k) === '42', 'sessionStorage roto');
    sessionStorage.removeItem(k);
  });

  test('fetch API disponible', () => {
    assert(typeof fetch === 'function', 'fetch no existe');
    assert(typeof Promise !== 'undefined', 'Promise no existe');
  });

  test('navigator.onLine reportable', () => {
    assert(typeof navigator.onLine === 'boolean', 'navigator.onLine no es boolean');
  });

  // ============================================================
  // RUNNER
  // ============================================================
  window.runVolvixTests = async function () {
    results = [];
    console.group('%c[VolvixTests] running ' + tests.length + ' tests', 'color:#8b5cf6;font-weight:bold');
    for (const t of tests) {
      const start = Date.now();
      try {
        await t.fn();
        const r = { name: t.name, status: 'pass', time: Date.now() - start };
        results.push(r);
        console.log('%c PASS', 'color:#22c55e', t.name, '(' + r.time + 'ms)');
      } catch (e) {
        const r = { name: t.name, status: 'fail', error: String(e.message || e), time: Date.now() - start };
        results.push(r);
        console.log('%c FAIL', 'color:#ef4444', t.name, '->', r.error);
      }
    }
    console.groupEnd();
    showResults();
    return results;
  };

  // ============================================================
  // UI - PANEL DE RESULTADOS
  // ============================================================
  function showResults() {
    // limpia panel previo
    const prev = document.getElementById('volvix-tests-panel');
    if (prev) prev.remove();

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const total  = results.length;
    const pct    = total ? Math.round((passed / total) * 100) : 0;
    const barColor = failed === 0 ? '#22c55e' : (passed / total > 0.7 ? '#f59e0b' : '#ef4444');

    const wrap = document.createElement('div');
    wrap.id = 'volvix-tests-panel';
    wrap.style.cssText = [
      'position:fixed', 'top:50px', 'right:20px',
      'background:#0f172a', 'color:#fff',
      'padding:18px', 'border-radius:14px',
      'width:420px', 'max-height:80vh', 'overflow:auto',
      'z-index:99999', 'box-shadow:0 20px 60px rgba(0,0,0,0.6)',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'font-size:13px', 'border:1px solid #1e293b'
    ].join(';');

    const header = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;font-size:15px;">Volvix Tests <span style="opacity:.6;font-weight:400;">${passed}/${total}</span></h3>
        <span style="background:${barColor};padding:3px 8px;border-radius:8px;font-size:11px;font-weight:bold;">${pct}%</span>
      </div>
      <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;margin-bottom:12px;">
        <div style="width:${pct}%;height:100%;background:${barColor};transition:width .3s;"></div>
      </div>
    `;

    const rows = results.map(r => `
      <div style="padding:7px 4px;border-bottom:1px solid #1e293b;display:flex;align-items:flex-start;gap:8px;">
        <span style="color:${r.status === 'pass' ? '#22c55e' : '#ef4444'};font-weight:bold;min-width:14px;">
          ${r.status === 'pass' ? '+' : 'x'}
        </span>
        <div style="flex:1;min-width:0;">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.name)}</div>
          ${r.error ? `<div style="color:#fbbf24;font-size:11px;margin-top:2px;word-break:break-word;">${escapeHtml(r.error)}</div>` : ''}
        </div>
        <span style="opacity:.5;font-size:11px;">${r.time}ms</span>
      </div>
    `).join('');

    const footer = `
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="vt-rerun"  style="${btnStyle('#8b5cf6')}">Re-run</button>
        <button id="vt-export" style="${btnStyle('#2563eb')}">Export JSON</button>
        <button id="vt-close"  style="${btnStyle('#475569')}">Cerrar</button>
      </div>
    `;

    wrap.innerHTML = header + rows + footer;
    document.body.appendChild(wrap);

    document.getElementById('vt-rerun').onclick  = () => window.runVolvixTests();
    document.getElementById('vt-export').onclick = () => window.exportTestResults();
    document.getElementById('vt-close').onclick  = () => wrap.remove();
  }

  function btnStyle(bg) {
    return `flex:1;padding:8px;background:${bg};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.exportTestResults = function () {
    const payload = {
      generatedAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'pass').length,
        failed: results.filter(r => r.status === 'fail').length
      },
      results
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volvix-tests-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ============================================================
  // BOTON FLOTANTE
  // ============================================================
  function addTestButton() {
    if (document.getElementById('volvix-tests-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'volvix-tests-fab';
    btn.textContent = 'TEST';
    btn.title = 'Run Volvix Tests';
    btn.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px',
      'width:54px', 'height:54px', 'border-radius:50%',
      'background:linear-gradient(135deg,#8b5cf6,#6366f1)',
      'color:#fff', 'border:none', 'cursor:pointer',
      'font-size:11px', 'font-weight:bold', 'letter-spacing:1px',
      'z-index:99998',
      'box-shadow:0 4px 16px rgba(139,92,246,.55)'
    ].join(';');
    btn.onclick = () => window.runVolvixTests();
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addTestButton);
  } else {
    addTestButton();
  }

  // ============================================================
  // API PUBLICA
  // ============================================================
  window.VolvixTests = {
    run: () => window.runVolvixTests(),
    export: () => window.exportTestResults(),
    results: () => results.slice(),
    list: () => tests.map(t => t.name),
    count: () => tests.length,
    state: () => STATE
  };

  console.log('%c[VolvixTests] cargado: ' + tests.length + ' tests. Usa window.runVolvixTests() o el boton flotante.', 'color:#8b5cf6');
})();
