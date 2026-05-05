/**
 * VOLVIX · Error Tracker (R25 Observability) — v3 Sentry-like
 * --------------------------------------------------------------------
 * Captures uncaught errors + unhandled promise rejections in the browser
 * and ships them in batches to POST /api/errors/log.
 *
 * Drop-in usage:
 *   <script src="/volvix-error-tracker.js" defer></script>
 *
 * Features (v3 / R25):
 *   - window.onerror + unhandledrejection capture
 *   - Performance metrics: TTFB, FP, FCP, LCP (PerformanceObserver)
 *   - Auto context: url, user_id, tenant_id, user_agent, viewport,
 *     JWT exp, screen/dpr, language, online status, referrer
 *   - Console history ring buffer (last 50 log/info/warn/error entries)
 *   - Stack trace cleanup + sourceMapResolution placeholder
 *     (hook: window.VOLVIX_SOURCEMAP_RESOLVER(stack) -> Promise<string>)
 *   - Buffered batch send: every 30s OR when 10 errors queued
 *   - Throttle 10/min to avoid runaway loops
 *   - keepalive fetch + sendBeacon fallback on unload
 *   - Dev visual indicator: red badge bottom-left with captured count
 *     (active when NODE_ENV !== 'production' OR window.VOLVIX_DEV === true
 *      OR hostname is localhost / 127.0.0.1 / *.local / *.test)
 *
 * Compat: works alongside R13 auth — JWT in localStorage("volvix_token"|"token")
 * is sent as Bearer; otherwise anonymous.
 */
(function () {
  if (typeof window === 'undefined') return;
  if (window.__VOLVIX_ERR_TRACKER__) return;
  window.__VOLVIX_ERR_TRACKER__ = true;

  var ENDPOINT          = '/api/errors/log';
  var MAX_PER_MIN       = 10;
  var BATCH_SIZE        = 10;
  var BATCH_INTERVAL_MS = 30000;
  var CONSOLE_HISTORY   = 50;

  var sentTimestamps = [];
  var buffer = [];
  var perfMetrics = {};
  var consoleRing = [];
  var capturedCount = 0;

  // ---------- helpers ----------
  function getToken() {
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('token') ||
             (window.VOLVIX_SESSION && window.VOLVIX_SESSION.token) || null;
    } catch (_) { return null; }
  }

  function decodeJWT(tok) {
    try {
      var parts = String(tok || '').split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_) { return null; }
  }

  function getSessionContext() {
    var ctx = { user_id: null, tenant_id: null, jwt_exp: null };
    try {
      if (window.VOLVIX_SESSION) {
        ctx.user_id   = window.VOLVIX_SESSION.user_id || window.VOLVIX_SESSION.id || null;
        ctx.tenant_id = window.VOLVIX_SESSION.tenant_id || null;
      }
      var tok = getToken();
      if (tok) {
        var payload = decodeJWT(tok);
        if (payload) {
          ctx.user_id   = ctx.user_id   || payload.id || payload.sub || null;
          ctx.tenant_id = ctx.tenant_id || payload.tenant_id || null;
          if (payload.exp) {
            ctx.jwt_exp = new Date(payload.exp * 1000).toISOString();
          }
        }
      }
    } catch (_) {}
    return ctx;
  }

  function isDevMode() {
    try {
      if (typeof window.VOLVIX_DEV === 'boolean') return window.VOLVIX_DEV;
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
        return process.env.NODE_ENV !== 'production';
      }
      var h = (location.hostname || '').toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' ||
             /\.local$|\.test$|^192\.168\.|^10\./.test(h);
    } catch (_) { return false; }
  }

  function throttleOk() {
    var now = Date.now();
    sentTimestamps = sentTimestamps.filter(function (t) { return now - t < 60000; });
    if (sentTimestamps.length >= MAX_PER_MIN) return false;
    sentTimestamps.push(now);
    return true;
  }

  // Strip webpack / vercel / next internal noise from stack frames
  function cleanStack(stack) {
    if (!stack) return null;
    var lines = String(stack).split('\n');
    var skipRe = /(webpack-internal:|webpack:\/\/|\/_next\/static\/chunks\/webpack|\/__nextjs_|\/node_modules\/(?:next|react-dom|webpack)\/|\.vercel\/output\/|node:internal\/)/i;
    var cleaned = lines.filter(function (l) { return !skipRe.test(l); });
    if (cleaned.length > 20) cleaned = cleaned.slice(0, 20);
    return cleaned.join('\n');
  }

  // Source-map resolution placeholder. Wire by setting:
  //   window.VOLVIX_SOURCEMAP_RESOLVER = function(stack) { return Promise.resolve(resolved); };
  function sourceMapResolution(stack) {
    try {
      if (typeof window.VOLVIX_SOURCEMAP_RESOLVER === 'function') {
        var maybe = window.VOLVIX_SOURCEMAP_RESOLVER(stack);
        if (maybe && typeof maybe.then === 'function') return maybe;
        if (typeof maybe === 'string') return Promise.resolve(maybe);
      }
    } catch (_) {}
    // TODO: integrate source-map.js once a /sourcemaps/ manifest is published.
    return Promise.resolve(stack);
  }

  // ---------- performance metrics ----------
  function collectPerfMetrics() {
    try {
      if (!window.performance) return;
      var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
      if (nav) {
        perfMetrics.ttfb = Math.round(nav.responseStart - nav.requestStart);
        perfMetrics.dom_load = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
      } else if (performance.timing) {
        var t = performance.timing;
        perfMetrics.ttfb = t.responseStart - t.requestStart;
      }
      var paints = performance.getEntriesByType ? performance.getEntriesByType('paint') : [];
      paints.forEach(function (p) {
        if (p.name === 'first-paint') perfMetrics.fp = Math.round(p.startTime);
        if (p.name === 'first-contentful-paint') perfMetrics.fcp = Math.round(p.startTime);
      });
    } catch (_) {}
  }

  function observeLCP() {
    try {
      if (!window.PerformanceObserver) return;
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) perfMetrics.lcp = Math.round(last.startTime || last.renderTime || 0);
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}
  }

  // ---------- console history ----------
  function installConsoleHook() {
    try {
      ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
        var orig = console[lvl];
        if (typeof orig !== 'function') return;
        console[lvl] = function () {
          try {
            var args = Array.prototype.slice.call(arguments).map(function (a) {
              if (a == null) return String(a);
              if (typeof a === 'string') return a.slice(0, 500);
              try { return JSON.stringify(a).slice(0, 500); } catch (_) { return String(a).slice(0, 500); }
            });
            consoleRing.push({ lvl: lvl, ts: Date.now(), msg: args.join(' ').slice(0, 1000) });
            if (consoleRing.length > CONSOLE_HISTORY) consoleRing.shift();
          } catch (_) {}
          return orig.apply(console, arguments);
        };
      });
    } catch (_) {}
  }

  // ---------- batching ----------
  function basePayload() {
    var ctx = getSessionContext();
    return {
      url: location.href,
      user_id: ctx.user_id,
      tenant_id: ctx.tenant_id,
      user_agent: navigator.userAgent,
      meta: {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        screen: window.screen ? { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1 } : null,
        language: navigator.language || null,
        online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
        referrer: document.referrer || null,
        jwt_exp: ctx.jwt_exp,
        perf: Object.assign({}, perfMetrics),
        console: consoleRing.slice(-CONSOLE_HISTORY),
        ts_client: new Date().toISOString(),
      }
    };
  }

  function enqueue(p) {
    capturedCount++;
    updateBadge();
    buffer.push(p);
    if (buffer.length >= BATCH_SIZE) flush();
  }

  function flush(useBeacon) {
    if (!buffer.length) return;
    if (!throttleOk()) { buffer = []; return; }

    var pending = buffer.splice(0);
    var token = getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    pending.forEach(function (entry) {
      var body = JSON.stringify(entry);
      try {
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
          return;
        }
        if (window.fetch) {
          fetch(ENDPOINT, { method: 'POST', headers: headers, body: body, keepalive: true })
            .catch(function () {});
          return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ENDPOINT, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.send(body);
      } catch (_) {}
    });
  }

  setInterval(function () { flush(false); }, BATCH_INTERVAL_MS);
  window.addEventListener('beforeunload', function () { flush(true); });
  window.addEventListener('pagehide',     function () { flush(true); });

  // ---------- dev badge ----------
  var badgeEl = null;
  function ensureBadge() {
    if (!isDevMode()) return null;
    if (badgeEl) return badgeEl;
    try {
      if (document.readyState === 'loading') return null;
      badgeEl = document.createElement('div');
      badgeEl.id = 'volvix-err-badge';
      badgeEl.setAttribute('role', 'status');
      badgeEl.style.cssText = [
        'position:fixed', 'left:12px', 'bottom:12px', 'z-index:2147483647',
        'background:#dc2626', 'color:#fff', 'font:600 12px/1 system-ui,sans-serif',
        'padding:6px 10px', 'border-radius:999px',
        'box-shadow:0 2px 8px rgba(0,0,0,.25)', 'cursor:pointer',
        'user-select:none', 'pointer-events:auto'
      ].join(';');
      badgeEl.title = 'VOLVIX errors capturados (click para flush)';
      badgeEl.addEventListener('click', function () { flush(false); });
      (document.body || document.documentElement).appendChild(badgeEl);
    } catch (_) { return null; }
    return badgeEl;
  }
  function updateBadge() {
    var el = ensureBadge();
    if (!el) return;
    el.textContent = '⚠ errors: ' + capturedCount;
  }

  // ---------- capture ----------
  window.addEventListener('error', function (ev) {
    try {
      var p = basePayload();
      p.type = 'window.onerror';
      p.message = (ev && ev.message) ? String(ev.message) : 'unknown';
      p.source = ev && ev.filename ? String(ev.filename) : null;
      p.lineno = ev && ev.lineno ? ev.lineno : null;
      p.colno  = ev && ev.colno  ? ev.colno  : null;
      var rawStack = cleanStack(ev && ev.error && ev.error.stack);
      sourceMapResolution(rawStack).then(function (resolved) {
        p.stack = resolved || rawStack;
        enqueue(p);
      }).catch(function () { p.stack = rawStack; enqueue(p); });
    } catch (_) {}
  });

  window.addEventListener('unhandledrejection', function (ev) {
    try {
      var p = basePayload();
      p.type = 'unhandledrejection';
      var r = ev && ev.reason;
      var rawStack = null;
      if (r && typeof r === 'object') {
        p.message = String(r.message || r);
        rawStack = cleanStack(r.stack);
      } else {
        p.message = String(r);
      }
      sourceMapResolution(rawStack).then(function (resolved) {
        p.stack = resolved || rawStack;
        enqueue(p);
      }).catch(function () { p.stack = rawStack; enqueue(p); });
    } catch (_) {}
  });

  // ---------- public manual API ----------
  window.VolvixErrorTracker = {
    capture: function (err, meta) {
      var p = basePayload();
      p.type = 'manual';
      var rawStack = null;
      if (err && typeof err === 'object') {
        p.message = String(err.message || err);
        rawStack = cleanStack(err.stack);
      } else {
        p.message = String(err);
      }
      if (meta) p.meta = Object.assign(p.meta || {}, meta);
      sourceMapResolution(rawStack).then(function (resolved) {
        p.stack = resolved || rawStack;
        enqueue(p);
      }).catch(function () { p.stack = rawStack; enqueue(p); });
    },
    flush: function () { flush(false); },
    metrics: function () { return Object.assign({}, perfMetrics); },
    consoleHistory: function () { return consoleRing.slice(); },
    capturedCount: function () { return capturedCount; },
    isDev: isDevMode,
  };

  // ---------- bootstrap ----------
  installConsoleHook();
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    collectPerfMetrics();
    if (isDevMode()) updateBadge();
  } else {
    window.addEventListener('load', function () {
      collectPerfMetrics();
      if (isDevMode()) updateBadge();
    });
  }
  observeLCP();
})();
