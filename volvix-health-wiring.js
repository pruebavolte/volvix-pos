/* ============================================================================
 * volvix-health-wiring.js
 * Volvix POS — Health Checker continuo
 * Agent-79 R9 — versión 340
 * ----------------------------------------------------------------------------
 * Responsabilidades:
 *   - Ping continuo a endpoints API (cada 30s)
 *   - Verificación de Supabase (auth + db + realtime)
 *   - Network speed test (latencia + throughput)
 *   - Verificación de integraciones externas
 *   - Panel visual de status en DOM
 *   - Sistema de alertas (toast + console + callbacks)
 *   - API pública en window.HealthAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. CONFIGURACIÓN
  // -------------------------------------------------------------------------
  const CONFIG = {
    interval: 30_000,                  // 30 segundos
    timeoutMs: 8_000,
    speedTestIntervalMs: 120_000,      // network speed cada 2 min
    historyMax: 50,
    panelId: 'volvix-health-panel',
    alertThresholds: {
      latencyWarn: 600,                // ms
      latencyCrit: 1500,
      failStreak: 3
    },
    endpoints: [
      { id: 'api-root',    url: '/api/health',                  critical: true  },
      { id: 'api-auth',    url: '/api/auth/session',            critical: true  },
      { id: 'api-pos',     url: '/api/pos/ping',                critical: true  },
      { id: 'api-stock',   url: '/api/stock/ping',              critical: false },
      { id: 'api-reports', url: '/api/reports/ping',            critical: false }
    ],
    integrations: [
      { id: 'supabase',    kind: 'supabase' },
      { id: 'stripe',      kind: 'http', url: 'https://api.stripe.com/v1' },
      { id: 'sat-cfdi',    kind: 'http', url: '/api/integrations/sat/ping' },
      { id: 'whatsapp',    kind: 'http', url: '/api/integrations/whatsapp/ping' }
    ],
    speedTestUrl: '/api/health/speedtest',
    speedTestSizeKB: 64
  };

  const STATUS = Object.freeze({
    OK:       'ok',
    WARN:     'warn',
    CRIT:     'crit',
    DOWN:     'down',
    UNKNOWN:  'unknown'
  });

  // -------------------------------------------------------------------------
  // 2. ESTADO INTERNO
  // -------------------------------------------------------------------------
  const state = {
    running:       false,
    timer:         null,
    speedTimer:    null,
    lastRun:       null,
    history:       [],
    failStreak:    {},          // por endpoint id
    listeners:     [],          // callbacks alertas
    snapshot: {
      overall:     STATUS.UNKNOWN,
      endpoints:   {},
      integrations:{},
      network:     { latency: null, downKbps: null, ts: null },
      updatedAt:   null
    }
  };

  // -------------------------------------------------------------------------
  // 3. UTILIDADES
  // -------------------------------------------------------------------------
  function now() { return new Date().toISOString(); }

  function fetchTimeout(url, opts = {}, ms = CONFIG.timeoutMs) {
    return new Promise((resolve, reject) => {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const t = setTimeout(() => {
        if (ctrl) ctrl.abort();
        reject(new Error('timeout'));
      }, ms);
      fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}))
        .then(r => { clearTimeout(t); resolve(r); })
        .catch(e => { clearTimeout(t); reject(e); });
    });
  }

  function classifyLatency(ms) {
    if (ms == null) return STATUS.UNKNOWN;
    if (ms >= CONFIG.alertThresholds.latencyCrit) return STATUS.CRIT;
    if (ms >= CONFIG.alertThresholds.latencyWarn) return STATUS.WARN;
    return STATUS.OK;
  }

  function pushHistory(entry) {
    state.history.push(entry);
    if (state.history.length > CONFIG.historyMax) state.history.shift();
  }

  // -------------------------------------------------------------------------
  // 4. PING DE ENDPOINTS
  // -------------------------------------------------------------------------
  async function pingEndpoint(ep) {
    const t0 = performance.now();
    try {
      const r = await fetchTimeout(ep.url, { method: 'GET', cache: 'no-store' });
      const latency = Math.round(performance.now() - t0);
      const ok = r.ok;
      if (!ok) {
        state.failStreak[ep.id] = (state.failStreak[ep.id] || 0) + 1;
        return { id: ep.id, status: STATUS.DOWN, latency, code: r.status };
      }
      state.failStreak[ep.id] = 0;
      return { id: ep.id, status: classifyLatency(latency), latency, code: r.status };
    } catch (err) {
      state.failStreak[ep.id] = (state.failStreak[ep.id] || 0) + 1;
      return { id: ep.id, status: STATUS.DOWN, latency: null, error: String(err.message || err) };
    }
  }

  async function pingAllEndpoints() {
    const results = await Promise.all(CONFIG.endpoints.map(pingEndpoint));
    const map = {};
    results.forEach(r => { map[r.id] = r; });
    return map;
  }

  // -------------------------------------------------------------------------
  // 5. VERIFICACIÓN SUPABASE
  // -------------------------------------------------------------------------
  async function checkSupabase() {
    const sb = global.supabase || (global.SupabaseClient && global.SupabaseClient.client);
    if (!sb) return { id: 'supabase', status: STATUS.UNKNOWN, reason: 'sdk-not-loaded' };
    const t0 = performance.now();
    try {
      const checks = {};
      // Auth
      try {
        const { data, error } = await sb.auth.getSession();
        checks.auth = error ? 'fail' : (data && data.session ? 'session' : 'anon');
      } catch (e) { checks.auth = 'fail'; }
      // DB ping (tabla _health o RPC)
      try {
        const { error } = await sb.from('_health').select('id').limit(1);
        checks.db = error ? 'fail' : 'ok';
      } catch (e) { checks.db = 'fail'; }
      // Realtime
      checks.realtime = sb.realtime && sb.realtime.isConnected
        ? (sb.realtime.isConnected() ? 'ok' : 'down') : 'unknown';

      const latency = Math.round(performance.now() - t0);
      const fails = Object.values(checks).filter(v => v === 'fail').length;
      const status = fails === 0 ? classifyLatency(latency)
                   : fails >= 2 ? STATUS.CRIT : STATUS.WARN;
      return { id: 'supabase', status, latency, checks };
    } catch (err) {
      return { id: 'supabase', status: STATUS.DOWN, error: String(err.message || err) };
    }
  }

  // -------------------------------------------------------------------------
  // 6. INTEGRACIONES
  // -------------------------------------------------------------------------
  async function checkIntegration(integ) {
    if (integ.kind === 'supabase') return await checkSupabase();
    if (integ.kind === 'http') {
      const t0 = performance.now();
      try {
        const r = await fetchTimeout(integ.url, { method: 'GET', mode: 'no-cors' });
        const latency = Math.round(performance.now() - t0);
        return { id: integ.id, status: classifyLatency(latency), latency, code: r.status || 0 };
      } catch (err) {
        return { id: integ.id, status: STATUS.DOWN, error: String(err.message || err) };
      }
    }
    return { id: integ.id, status: STATUS.UNKNOWN };
  }

  async function checkAllIntegrations() {
    const results = await Promise.all(CONFIG.integrations.map(checkIntegration));
    const map = {};
    results.forEach(r => { map[r.id] = r; });
    return map;
  }

  // -------------------------------------------------------------------------
  // 7. NETWORK SPEED TEST
  // -------------------------------------------------------------------------
  async function networkSpeedTest() {
    const t0 = performance.now();
    try {
      const r = await fetchTimeout(CONFIG.speedTestUrl + '?bytes=' + (CONFIG.speedTestSizeKB * 1024),
                                   { cache: 'no-store' }, 12_000);
      const blob = await r.blob();
      const ms = performance.now() - t0;
      const kb = blob.size / 1024;
      const kbps = Math.round((kb * 8) / (ms / 1000));
      return { latency: Math.round(ms), downKbps: kbps, ts: now() };
    } catch (err) {
      return { latency: null, downKbps: null, ts: now(), error: String(err.message || err) };
    }
  }

  // -------------------------------------------------------------------------
  // 8. AGREGACIÓN
  // -------------------------------------------------------------------------
  function aggregate(endpoints, integrations) {
    let worst = STATUS.OK;
    const order = { ok: 0, warn: 1, crit: 2, down: 3, unknown: 0 };
    const bump = (s) => { if (order[s] > order[worst]) worst = s; };

    CONFIG.endpoints.forEach(ep => {
      const r = endpoints[ep.id];
      if (!r) return;
      if (ep.critical && (r.status === STATUS.DOWN || r.status === STATUS.CRIT)) bump(STATUS.CRIT);
      else bump(r.status);
    });
    Object.values(integrations).forEach(r => bump(r.status));
    return worst;
  }

  // -------------------------------------------------------------------------
  // 9. ALERTAS
  // -------------------------------------------------------------------------
  function emitAlert(level, msg, ctx) {
    const payload = { level, msg, ctx: ctx || null, ts: now() };
    try { console[(level === STATUS.CRIT || level === STATUS.DOWN) ? 'error' : 'warn']
            ('[Health]', msg, ctx || ''); } catch (_) {}
    state.listeners.forEach(fn => { try { fn(payload); } catch (_) {} });
    // showToast removed — #volvix-health-toasts floating UI eliminated (UI cleanup)
  }

  function showToast(level, msg) {
    // no-op: health toasts removed (UI cleanup). Alerts still fire via console + onAlert callbacks.
  }

  function evaluateAlerts(prev, next) {
    if (!prev) return;
    if (prev.overall !== next.overall) {
      emitAlert(next.overall, 'Overall status: ' + prev.overall + ' -> ' + next.overall);
    }
    Object.keys(next.endpoints).forEach(id => {
      const p = prev.endpoints[id], n = next.endpoints[id];
      if (!p || !n) return;
      if (p.status !== n.status && (n.status === STATUS.DOWN || n.status === STATUS.CRIT)) {
        emitAlert(n.status, 'Endpoint ' + id + ' degradado', n);
      }
      if ((state.failStreak[id] || 0) >= CONFIG.alertThresholds.failStreak) {
        emitAlert(STATUS.CRIT, 'Endpoint ' + id + ' falla ' + state.failStreak[id] + 'x consecutivas');
      }
    });
    Object.keys(next.integrations).forEach(id => {
      const p = prev.integrations[id], n = next.integrations[id];
      if (p && n && p.status !== n.status &&
          (n.status === STATUS.DOWN || n.status === STATUS.CRIT)) {
        emitAlert(n.status, 'Integración ' + id + ' degradada', n);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 10. PANEL DE STATUS — REMOVED (UI cleanup)
  // #volvix-health-panel floating widget eliminated.
  // HealthAPI.snapshot() still available for programmatic access.
  // -------------------------------------------------------------------------
  function ensurePanel() {
    return null; // no-op: panel removed
  }

  function renderPanel(snap) {
    // no-op: panel UI removed
  }

  // -------------------------------------------------------------------------
  // 11. CICLO PRINCIPAL
  // -------------------------------------------------------------------------
  async function runOnce() {
    const prev = JSON.parse(JSON.stringify(state.snapshot));
    const [endpoints, integrations] = await Promise.all([
      pingAllEndpoints(),
      checkAllIntegrations()
    ]);
    const overall = aggregate(endpoints, integrations);
    state.snapshot.endpoints = endpoints;
    state.snapshot.integrations = integrations;
    state.snapshot.overall = overall;
    state.snapshot.updatedAt = now();
    state.lastRun = Date.now();
    pushHistory({ ts: state.snapshot.updatedAt, overall, endpoints, integrations });
    evaluateAlerts(prev.updatedAt ? prev : null, state.snapshot);
    renderPanel(state.snapshot);
    return state.snapshot;
  }

  async function runSpeed() {
    const r = await networkSpeedTest();
    state.snapshot.network = r;
    renderPanel(state.snapshot);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    runOnce().catch(()=>{});
    runSpeed().catch(()=>{});
    state.timer = setInterval(() => { runOnce().catch(()=>{}); }, CONFIG.interval);
    state.speedTimer = setInterval(() => { runSpeed().catch(()=>{}); }, CONFIG.speedTestIntervalMs);
    console.log('[Health] started — interval', CONFIG.interval, 'ms');
  }

  function stop() {
    state.running = false;
    if (state.timer) clearInterval(state.timer);
    if (state.speedTimer) clearInterval(state.speedTimer);
    state.timer = state.speedTimer = null;
    console.log('[Health] stopped');
  }

  // -------------------------------------------------------------------------
  // 12. API PÚBLICA
  // -------------------------------------------------------------------------
  const HealthAPI = {
    STATUS,
    config: CONFIG,
    start,
    stop,
    runNow: runOnce,
    speedTest: runSpeed,
    snapshot: () => JSON.parse(JSON.stringify(state.snapshot)),
    history:  () => state.history.slice(),
    onAlert:  (fn) => { if (typeof fn === 'function') state.listeners.push(fn); },
    offAlert: (fn) => { state.listeners = state.listeners.filter(f => f !== fn); },
    showPanel: () => { ensurePanel(); renderPanel(state.snapshot); },
    hidePanel: () => { const p = document.getElementById(CONFIG.panelId); if (p) p.remove(); },
    addEndpoint: (ep) => { CONFIG.endpoints.push(ep); },
    addIntegration: (it) => { CONFIG.integrations.push(it); },
    isRunning: () => state.running,
    version: '340.1.0'
  };

  global.HealthAPI = HealthAPI;

  // Auto-start cuando DOM listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
