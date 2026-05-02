/**
 * volvix-logger-wiring.js
 * Sistema de logs centralizado tipo Sentry para Volvix POS.
 *
 * Características:
 *  - Captura window.error, unhandledrejection, console.error/warn
 *  - Fetch interceptor (API errors)
 *  - User actions (clicks importantes [data-track])
 *  - Niveles: debug / info / warn / error / fatal
 *  - Buffer en localStorage (últimos 200 logs)
 *  - Panel UI con filtros por nivel y búsqueda
 *  - Export logs a JSON
 *  - Send logs to backend (POST /api/logs)
 *  - Stack traces capturadas
 *  - User context (sesión actual)
 *
 * API pública: window.logger
 *   logger.debug/info/warn/error/fatal(msg, data?)
 *   logger.list()        → array de logs
 *   logger.clear()       → limpia buffer
 *   logger.export()      → descarga JSON
 *   logger.flush()       → envía pendientes al backend
 *   logger.openPanel()   → abre panel UI
 *   logger.setUser(obj)  → contexto de usuario manual
 *
 * Agent-10 — Ronda 6 Fibonacci
 */
(function () {
  'use strict';

  if (window.__volvixLoggerLoaded) return;
  window.__volvixLoggerLoaded = true;

  // ─────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────
  const LOGS_KEY        = 'volvix:logs';
  const PENDING_KEY     = 'volvix:logs:pending';
  const MAX_LOGS        = 200;
  const BACKEND_URL     = '/api/logs';
  const SEND_LEVELS     = ['error', 'fatal'];
  const FLUSH_INTERVAL  = 30000; // 30s
  const MAX_STACK_LINES = 30;

  let logs    = [];
  let pending = [];
  let userCtx = {};
  let panelOpen = false;
  let activeFilter = 'all';
  let activeSearch = '';

  // Preserva consola original ANTES de override
  const origConsole = window._origConsole || {
    log:   console.log.bind(console),
    info:  console.info ? console.info.bind(console) : console.log.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  };
  window._origConsole = origConsole;

  // ─────────────────────────────────────────────────────────────
  // Persistencia
  // ─────────────────────────────────────────────────────────────
  function load() {
    try { logs    = JSON.parse(localStorage.getItem(LOGS_KEY)    || '[]'); } catch { logs = []; }
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { pending = []; }
    if (!Array.isArray(logs))    logs = [];
    if (!Array.isArray(pending)) pending = [];
  }

  function save() {
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    try { localStorage.setItem(LOGS_KEY, JSON.stringify(logs)); } catch {}
  }

  function savePending() {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-MAX_LOGS))); } catch {}
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  function genId() {
    return 'LOG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem('volvixSession') || '{}') || {};
    } catch { return {}; }
  }

  function captureStack() {
    try {
      const e = new Error();
      const lines = (e.stack || '').split('\n').slice(2, MAX_STACK_LINES + 2);
      return lines.join('\n');
    } catch { return ''; }
  }

  function safeStringify(obj) {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack };
        }
        return v;
      });
    } catch (e) { return String(obj); }
  }

  function fmtArgs(args) {
    return args.map(a => {
      if (a instanceof Error) return a.message + '\n' + a.stack;
      if (typeof a === 'object') return safeStringify(a);
      return String(a);
    }).join(' ');
  }

  // ─────────────────────────────────────────────────────────────
  // Core log()
  // ─────────────────────────────────────────────────────────────
  function log(level, message, data) {
    data = data || {};
    const session = getSession();

    const entry = {
      id:        genId(),
      level:     level,
      message:   String(message).slice(0, 2000),
      data:      data,
      timestamp: Date.now(),
      url:       location.href,
      route:     location.pathname + location.hash,
      user:      userCtx.email    || session.email      || null,
      tenant:    userCtx.tenantId || session.tenant_id  || null,
      role:      userCtx.role     || session.role       || null,
      userAgent: (navigator.userAgent || '').slice(0, 160),
      stack:     data.stack || captureStack(),
    };

    logs.push(entry);
    save();

    // Eco a consola original con color
    const tag = `[${level.toUpperCase()}]`;
    const styled = level === 'error' || level === 'fatal'
      ? origConsole.error
      : level === 'warn' ? origConsole.warn
      : level === 'debug' ? origConsole.debug
      : origConsole.log;
    try { styled(tag, message, data); } catch {}

    // Refresca panel si está abierto
    if (panelOpen) renderLogList();

    // Cola pendiente para backend
    if (SEND_LEVELS.indexOf(level) !== -1) {
      pending.push(entry);
      savePending();
      sendToBackend(entry).catch(() => {});
    }

    return entry;
  }

  // ─────────────────────────────────────────────────────────────
  // Backend
  // ─────────────────────────────────────────────────────────────
  async function sendToBackend(entry) {
    try {
      const res = await (window._origFetch || window.fetch).call(window, BACKEND_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
        keepalive: true,
      });
      if (res && res.ok) {
        pending = pending.filter(p => p.id !== entry.id);
        savePending();
      }
    } catch (e) { /* offline → queda en pending */ }
  }

  async function flush() {
    if (!pending.length) return { sent: 0 };
    const toSend = pending.slice();
    let sent = 0;
    for (const entry of toSend) {
      try {
        const res = await (window._origFetch || window.fetch).call(window, BACKEND_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(entry),
          keepalive: true,
        });
        if (res && res.ok) {
          pending = pending.filter(p => p.id !== entry.id);
          sent++;
        }
      } catch { break; /* sigue offline */ }
    }
    savePending();
    return { sent: sent, remaining: pending.length };
  }

  // ─────────────────────────────────────────────────────────────
  // Captura: window.error
  // ─────────────────────────────────────────────────────────────
  window.addEventListener('error', function (e) {
    log('error', e.message || 'Uncaught error', {
      filename: e.filename,
      line:     e.lineno,
      col:      e.colno,
      stack:    e.error && e.error.stack,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Captura: unhandledrejection
  // ─────────────────────────────────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    const reason = e.reason;
    log('error', 'Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack:  reason && reason.stack,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Override console.error / console.warn
  // ─────────────────────────────────────────────────────────────
  console.error = function () {
    const args = Array.prototype.slice.call(arguments);
    log('error', fmtArgs(args));
    origConsole.error.apply(console, args);
  };
  console.warn = function () {
    const args = Array.prototype.slice.call(arguments);
    log('warn', fmtArgs(args));
    origConsole.warn.apply(console, args);
  };

  // ─────────────────────────────────────────────────────────────
  // Fetch interceptor
  // ─────────────────────────────────────────────────────────────
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  window._origFetch = origFetch;

  if (origFetch) {
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET';
      const start = Date.now();

      // No interceptar el propio endpoint de logs (loop)
      const isLogEndpoint = typeof url === 'string' && url.indexOf(BACKEND_URL) !== -1;

      try {
        const res = await origFetch(input, init);
        const time = Date.now() - start;
        if (!isLogEndpoint) {
          if (!res.ok) {
            log('warn', `API ${method} ${url} → HTTP ${res.status}`, {
              url, method, status: res.status, time,
            });
          } else {
            log('debug', `API ${method} ${url} (${time}ms)`, { url, method, status: res.status, time });
          }
        }
        return res;
      } catch (err) {
        if (!isLogEndpoint) {
          log('error', `API ${method} ${url} failed: ${err.message}`, {
            url, method, error: err.message, stack: err.stack,
          });
        }
        throw err;
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // User actions: clicks con [data-track] o botones importantes
  // ─────────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('[data-track], button[type="submit"], a.cta, .btn-primary');
    if (!t) return;
    const label = t.getAttribute('data-track')
      || t.getAttribute('aria-label')
      || (t.textContent || '').trim().slice(0, 60)
      || t.tagName;
    log('info', `User action: ${label}`, {
      tag:    t.tagName,
      id:     t.id || null,
      cls:    t.className || null,
      route:  location.pathname,
    });
  }, true);

  // Cambios de ruta (SPA)
  let lastRoute = location.pathname + location.hash;
  setInterval(() => {
    const cur = location.pathname + location.hash;
    if (cur !== lastRoute) {
      log('info', `Navigation: ${lastRoute} → ${cur}`, { from: lastRoute, to: cur });
      lastRoute = cur;
    }
  }, 800);

  // Flush periódico
  setInterval(() => { flush().catch(() => {}); }, FLUSH_INTERVAL);
  window.addEventListener('online', () => { flush().catch(() => {}); });

  // ─────────────────────────────────────────────────────────────
  // Panel UI
  // ─────────────────────────────────────────────────────────────
  const LEVEL_COLORS = {
    debug: '#94a3b8',
    info:  '#3b82f6',
    warn:  '#f59e0b',
    error: '#ef4444',
    fatal: '#dc2626',
  };

  function filtered() {
    const q = activeSearch.toLowerCase();
    return logs.filter(l => {
      if (activeFilter !== 'all' && l.level !== activeFilter) return false;
      if (q && (l.message || '').toLowerCase().indexOf(q) === -1
            && safeStringify(l.data).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderLogList() {
    const list = document.getElementById('logger-list');
    const counter = document.getElementById('logger-counter');
    if (!list) return;
    const items = filtered().slice().reverse();
    if (counter) counter.textContent = `${items.length}/${logs.length}`;
    list.innerHTML = items.map(l => {
      const color = LEVEL_COLORS[l.level] || '#94a3b8';
      const time  = new Date(l.timestamp).toLocaleTimeString();
      const dataStr = (l.data && Object.keys(l.data).length)
        ? `<pre style="margin:4px 0 0 12px;color:#64748b;font-size:10px;white-space:pre-wrap;">${escapeHtml(safeStringify(l.data)).slice(0, 500)}</pre>`
        : '';
      return `
        <div style="padding:6px 4px;border-bottom:1px solid #1e293b;">
          <div style="color:${color};">
            <span style="opacity:.6;">[${time}]</span>
            <strong>[${l.level.toUpperCase()}]</strong>
            ${escapeHtml(l.message)}
          </div>
          ${dataStr}
        </div>`;
    }).join('') || '<div style="color:#64748b;padding:20px;text-align:center;">Sin logs</div>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function openPanel() {
    if (panelOpen) return;
    const panel = document.createElement('div');
    panel.id = 'logger-panel';
    panel.style.cssText = `
      position:fixed;bottom:80px;left:20px;width:560px;height:460px;
      background:#0f172a;color:#e2e8f0;border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,0.5);
      z-index:9994;display:flex;flex-direction:column;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      border:1px solid #1e293b;
    `;
    panel.innerHTML = `
      <div style="padding:10px 12px;background:#1e293b;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <strong>Logs <span id="logger-counter" style="opacity:.7;font-weight:normal;">${logs.length}</span></strong>
        <div style="display:flex;gap:6px;">
          <button data-act="flush"  style="${btnCss()}">Flush</button>
          <button data-act="export" style="${btnCss()}">Export</button>
          <button data-act="clear"  style="${btnCss()}">Clear</button>
          <button data-act="close"  style="${btnCss()}">×</button>
        </div>
      </div>
      <div style="padding:8px 12px;background:#0b1220;display:flex;gap:6px;align-items:center;border-bottom:1px solid #1e293b;">
        ${['all','debug','info','warn','error','fatal'].map(lv => `
          <button data-filter="${lv}" style="${filterBtnCss(lv === activeFilter)}">${lv}</button>
        `).join('')}
        <input id="logger-search" placeholder="buscar…" value="${escapeHtml(activeSearch)}"
          style="margin-left:auto;background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:4px 8px;border-radius:4px;font-size:11px;width:140px;" />
      </div>
      <div id="logger-list" style="flex:1;overflow:auto;padding:6px 10px;font-size:11px;line-height:1.45;"></div>
    `;
    document.body.appendChild(panel);
    panelOpen = true;
    renderLogList();

    panel.addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-act');
      if (act === 'close')  closePanel();
      if (act === 'clear')  { window.logger.clear(); renderLogList(); }
      if (act === 'export') window.logger.export();
      if (act === 'flush')  flush().then(r => log('info', `Flush: enviados=${r.sent}`, r));
      const f = e.target.getAttribute('data-filter');
      if (f) {
        activeFilter = f;
        panel.querySelectorAll('[data-filter]').forEach(b => {
          b.style.cssText = filterBtnCss(b.getAttribute('data-filter') === activeFilter);
        });
        renderLogList();
      }
    });
    const search = panel.querySelector('#logger-search');
    search.addEventListener('input', (e) => {
      activeSearch = e.target.value || '';
      renderLogList();
    });
  }

  function closePanel() {
    const p = document.getElementById('logger-panel');
    if (p) p.remove();
    panelOpen = false;
  }

  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  function btnCss() {
    return `background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;`;
  }
  function filterBtnCss(active) {
    return `background:${active ? '#3b82f6' : '#0f172a'};border:1px solid ${active ? '#3b82f6' : '#334155'};
            color:#e2e8f0;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;text-transform:uppercase;`;
  }

  function createButton() {
    if (document.getElementById('logger-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'logger-fab';
    btn.textContent = 'Logs';
    btn.title = 'Volvix Logs (Alt+L)';
    btn.style.cssText = `
      position:fixed;bottom:20px;left:80px;width:auto;height:36px;padding:0 12px;
      border-radius:18px;background:#475569;color:#fff;border:none;
      cursor:pointer;font-size:12px;z-index:9994;font-family:system-ui,sans-serif;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
    `;
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
  }

  // Atajo teclado: Alt+L
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      togglePanel();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  window.logger = {
    debug: (m, d) => log('debug', m, d),
    info:  (m, d) => log('info',  m, d),
    warn:  (m, d) => log('warn',  m, d),
    error: (m, d) => log('error', m, d),
    fatal: (m, d) => log('fatal', m, d),

    list:  () => logs.slice(),
    pending: () => pending.slice(),
    clear: () => { logs = []; save(); if (panelOpen) renderLogList(); },

    flush: flush,
    setUser: (obj) => { userCtx = Object.assign({}, userCtx, obj || {}); },

    openPanel: openPanel,
    closePanel: closePanel,
    togglePanel: togglePanel,

    export: () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        session:    getSession(),
        userCtx:    userCtx,
        count:      logs.length,
        logs:       logs,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `volvix-logs-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init() {
    load();
    createButton();
    log('info', 'Logger initialized', {
      url: location.href,
      buffered: logs.length,
      pending:  pending.length,
    });
    // Reintenta envío de pendientes al arrancar
    flush().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
