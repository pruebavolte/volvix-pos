/* ============================================================================
 * volvix-sentry-wiring.js — B40 OBSERVABILITY (Sentry-style)
 * Auto-loaded from volvix-uplift-wiring.js (ALWAYS_LOAD).
 *
 * SDK PUBLIC API
 * --------------
 *   window.VolvixObs.captureException(err, extra)
 *       Manually capture an exception. `extra` is merged into payload.
 *
 *   window.VolvixObs.captureMessage(message, level, extra)
 *       level: 'debug'|'info'|'warning'|'error'|'fatal'
 *
 *   window.VolvixObs.addBreadcrumb(category, message, data)
 *       Append a user breadcrumb. Last 20 are kept and shipped with each event.
 *       category: 'navigation'|'click'|'fetch'|'console'|'custom'
 *
 *   window.VolvixObs.setUser({tenant_id, user_id, role})
 *       Set user context. Auto-loaded from sessionStorage/localStorage if absent.
 *
 *   window.VolvixObs.getSessionId()
 *       Get current session id (UUID, persisted in sessionStorage).
 *
 *   window.VolvixObs.flush()
 *       Force-send buffered events (sendBeacon).
 *
 *   window.SentryAPI  (legacy alias preserved for older callers)
 *
 * AUTOMATIC CAPTURE
 * -----------------
 *   - Uncaught exceptions          (extends, does not duplicate, error-reporter.js)
 *   - Unhandled promise rejections
 *   - Network errors (fetch failures, 5xx responses)
 *   - Long tasks > 1s (PerformanceObserver)
 *   - Breadcrumbs: clicks, navigation, fetch
 *
 * THROTTLING
 * ----------
 *   Max 30 events / minute / session, with hash-dedup of repeated stacks.
 *
 * PRIVACY
 * -------
 *   - Removes tokens, passwords, authorization headers from breadcrumbs/payload.
 *   - Strips JWT-shaped strings.
 *   - Strips secret-looking query string keys.
 *
 * ENDPOINT
 * --------
 *   POST /api/observability/events  (no auth, see api/index.js)
 *
 * Idempotent: safe to load multiple times.
 * ==========================================================================*/
(function (global) {
  'use strict';
  if (global.__volvixObsLoaded) return;
  global.__volvixObsLoaded = true;

  var ENDPOINT = '/api/observability/events';
  var MAX_PER_MIN = 30;
  var BREADCRUMB_MAX = 20;
  var SECRET_KEYS = /token|password|secret|authorization|apikey|api_key|cookie|session_id|jwt/i;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var sessionId = (function () {
    try {
      var k = 'vlx_obs_session';
      var s = sessionStorage.getItem(k);
      if (!s) {
        s = (global.crypto && global.crypto.randomUUID)
          ? global.crypto.randomUUID()
          : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(k, s);
      }
      return s;
    } catch (_) { return 'sess-' + Date.now(); }
  })();

  var breadcrumbs = [];
  var sentTimes = [];
  var sentHashes = (typeof Set === 'function') ? new Set() : { add: function () {}, has: function () { return false; }, clear: function () {}, size: 0 };
  var userContext = { tenant_id: null, user_id: null, role: null };

  // Hydrate user from existing app state, if any
  try {
    var ls = localStorage.getItem('volvix_user') || localStorage.getItem('vlx_user') || sessionStorage.getItem('volvix_user');
    if (ls) {
      var u = JSON.parse(ls);
      userContext.tenant_id = u.tenant_id || u.tenantId || null;
      userContext.user_id   = u.id || u.user_id || null;
      userContext.role      = u.role || null;
    }
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function hashStr(s) {
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return String(h);
  }
  function rateOk() {
    var t = nowSec();
    sentTimes = sentTimes.filter(function (x) { return t - x < 60; });
    return sentTimes.length < MAX_PER_MIN;
  }
  function sanitizeValue(v) {
    if (v == null) return v;
    if (typeof v === 'string') {
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return '[REDACTED_JWT]';
      if (/^Bearer\s+\S+/i.test(v)) return 'Bearer [REDACTED]';
      return v.slice(0, 1000);
    }
    if (typeof v === 'object') return sanitizeObj(v, 1);
    return v;
  }
  function sanitizeObj(o, depth) {
    depth = depth || 0;
    if (depth > 5) return '[deep]';
    if (Array.isArray(o)) return o.slice(0, 50).map(function (x) { return sanitizeValue(x); });
    if (o && typeof o === 'object') {
      var out = {};
      var keys = Object.keys(o).slice(0, 50);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (SECRET_KEYS.test(k)) { out[k] = '[REDACTED]'; continue; }
        try { out[k] = sanitizeValue(o[k]); } catch (_) { out[k] = '[unserializable]'; }
      }
      return out;
    }
    return o;
  }
  function safeUrl(u) {
    try {
      var url = new URL(u, location.origin);
      var sp = url.searchParams;
      var toRedact = [];
      sp.forEach(function (val, key) { if (SECRET_KEYS.test(key)) toRedact.push(key); });
      toRedact.forEach(function (k) { sp.set(k, '[REDACTED]'); });
      return url.toString().slice(0, 500);
    } catch (_) { return String(u || '').slice(0, 500); }
  }
  function getBrowser() {
    var ua = navigator.userAgent || '';
    var browser = 'unknown', os = 'unknown';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return { browser: browser, os: os };
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------
  function send(event) {
    if (!rateOk()) return false;
    var dedupKey = hashStr((event.message || '') + '|' + (event.stack_trace || '').slice(0, 200) + '|' + (event.type || ''));
    if (sentHashes.has(dedupKey)) return false;
    sentHashes.add(dedupKey);
    if (sentHashes.size > 500 && sentHashes.clear) sentHashes.clear();
    sentTimes.push(nowSec());

    var bi = getBrowser();
    var payload = {
      session_id: sessionId,
      tenant_id: userContext.tenant_id,
      user_id: userContext.user_id,
      type: event.type || 'exception',
      severity: event.severity || 'error',
      message: String(event.message || '').slice(0, 1000),
      stack_trace: String(event.stack_trace || '').slice(0, 4000),
      payload: sanitizeObj(event.payload || {}),
      breadcrumbs: breadcrumbs.slice(-BREADCRUMB_MAX),
      user_agent: (navigator.userAgent || '').slice(0, 300),
      url: safeUrl(location.href),
      occurred_at: new Date().toISOString(),
      browser: bi.browser,
      os: bi.os,
      role: userContext.role
    };

    try {
      var body = JSON.stringify({ events: [payload] });
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body, keepalive: true
        }).catch(function () {});
      }
      return true;
    } catch (_) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Breadcrumbs
  // ---------------------------------------------------------------------------
  function addBreadcrumb(category, message, data) {
    try {
      breadcrumbs.push({
        ts: Date.now(),
        category: String(category || 'custom').slice(0, 30),
        message: String(message || '').slice(0, 200),
        data: sanitizeObj(data || {})
      });
      if (breadcrumbs.length > BREADCRUMB_MAX) breadcrumbs.shift();
    } catch (_) {}
  }

  // Click breadcrumbs
  document.addEventListener('click', function (ev) {
    try {
      var t = ev.target;
      if (!t) return;
      var label = (t.textContent || t.value || t.title || t.id || t.tagName || '').toString().trim().slice(0, 80);
      var sel = t.tagName ? t.tagName.toLowerCase() : '?';
      if (t.id) sel += '#' + t.id;
      else if (t.className && typeof t.className === 'string') sel += '.' + t.className.split(/\s+/).slice(0, 2).join('.');
      addBreadcrumb('click', label, { selector: sel.slice(0, 100) });
    } catch (_) {}
  }, true);

  // Navigation breadcrumbs
  var lastUrl = location.href;
  setInterval(function () {
    if (location.href !== lastUrl) {
      addBreadcrumb('navigation', location.pathname, { from: safeUrl(lastUrl), to: safeUrl(location.href) });
      lastUrl = location.href;
    }
  }, 1000);

  // ---------------------------------------------------------------------------
  // Auto-capture
  // ---------------------------------------------------------------------------
  window.addEventListener('error', function (ev) {
    if (!ev) return;
    var msg = (ev.error && ev.error.message) || ev.message || 'unknown';
    var stk = (ev.error && ev.error.stack) || '';
    send({
      type: 'exception',
      severity: 'error',
      message: msg,
      stack_trace: stk,
      payload: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno, source: 'window.onerror' }
    });
  });

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    var msg = (r && r.message) || String(r || 'unhandled rejection');
    var stk = (r && r.stack) || '';
    send({
      type: 'rejection',
      severity: 'error',
      message: msg,
      stack_trace: stk,
      payload: { kind: 'unhandledrejection' }
    });
  });

  // Network errors via fetch wrapping
  if (typeof fetch === 'function') {
    var origFetch = fetch.bind(window);
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var t0 = Date.now();
      addBreadcrumb('fetch', method + ' ' + safeUrl(url), {});
      return origFetch(input, init).then(function (resp) {
        var dur = Date.now() - t0;
        if (/\/api\/(observability|log\/client|analytics)/.test(url)) return resp;
        if (resp && resp.status >= 500) {
          send({
            type: 'network',
            severity: 'error',
            message: 'HTTP ' + resp.status + ' ' + method + ' ' + safeUrl(url),
            payload: { status: resp.status, method: method, url: safeUrl(url), duration_ms: dur }
          });
        }
        return resp;
      }).catch(function (err) {
        if (!/\/api\/(observability|log\/client|analytics)/.test(url)) {
          send({
            type: 'network',
            severity: 'error',
            message: 'Network failure: ' + method + ' ' + safeUrl(url),
            stack_trace: (err && err.stack) || '',
            payload: { method: method, url: safeUrl(url), error: String(err && err.message || err) }
          });
        }
        throw err;
      });
    };
  }

  // Long tasks via PerformanceObserver
  try {
    if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes
        && PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1) {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (entry.duration > 1000) {
            send({
              type: 'longtask',
              severity: 'warning',
              message: 'Long task ' + Math.round(entry.duration) + 'ms',
              payload: { duration_ms: Math.round(entry.duration), name: entry.name, start_time: Math.round(entry.startTime) }
            });
          }
        });
      });
      po.observe({ entryTypes: ['longtask'] });
    }
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var VolvixObs = {
    captureException: function (err, extra) {
      var msg = (err && err.message) || String(err || 'manual exception');
      var stk = (err && err.stack) || '';
      return send({
        type: 'exception', severity: 'error',
        message: msg, stack_trace: stk,
        payload: Object.assign({ source: 'manual' }, extra || {})
      });
    },
    captureMessage: function (message, level, extra) {
      return send({
        type: 'exception', severity: level || 'info',
        message: String(message || ''),
        payload: Object.assign({ source: 'manual_message' }, extra || {})
      });
    },
    addBreadcrumb: addBreadcrumb,
    setUser: function (u) {
      if (!u || typeof u !== 'object') return;
      if ('tenant_id' in u) userContext.tenant_id = u.tenant_id;
      if ('user_id' in u)   userContext.user_id   = u.user_id;
      if ('role' in u)      userContext.role      = u.role;
    },
    getSessionId: function () { return sessionId; },
    getBreadcrumbs: function () { return breadcrumbs.slice(); },
    flush: function () { /* sendBeacon is fire-and-forget */ }
  };

  global.VolvixObs = VolvixObs;

  // Legacy alias for any code that referenced the older SentryAPI stub
  if (!global.SentryAPI) {
    global.SentryAPI = {
      init: function () { return VolvixObs; },
      captureException: VolvixObs.captureException,
      captureMessage: VolvixObs.captureMessage,
      addBreadcrumb: function (crumb) {
        if (crumb && typeof crumb === 'object') {
          addBreadcrumb(crumb.category || 'custom', crumb.message || '', crumb.data || {});
        }
      },
      setUser: VolvixObs.setUser,
      getSessionId: VolvixObs.getSessionId,
      getBreadcrumbs: VolvixObs.getBreadcrumbs,
      flush: VolvixObs.flush
    };
  }

  // Initial breadcrumb
  addBreadcrumb('navigation', 'page_load', { url: safeUrl(location.href), referrer: document.referrer || '' });
})(typeof window !== 'undefined' ? window : self);
