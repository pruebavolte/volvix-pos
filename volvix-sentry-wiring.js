/**
 * volvix-sentry-wiring.js
 * Sentry-style error tracking for Volvix POS.
 * Self-contained: no external Sentry SDK required. Captures errors,
 * breadcrumbs, user context, releases, and exposes window.SentryAPI.
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Configuration ─────────────────────────────
  var DEFAULTS = {
    dsn: null,                    // Optional remote endpoint (POST JSON)
    release: 'volvix-pos@0.0.0',
    environment: 'production',
    maxBreadcrumbs: 100,
    maxEvents: 200,
    sampleRate: 1.0,
    storageKey: 'volvix.sentry.events',
    breadcrumbsKey: 'volvix.sentry.breadcrumbs',
    userKey: 'volvix.sentry.user',
    autoSessionTracking: true,
    beforeSend: null,             // function(event) -> event|null
    debug: false
  };

  var config = Object.assign({}, DEFAULTS);
  var breadcrumbs = [];
  var events = [];
  var user = null;
  var tags = {};
  var extras = {};
  var contexts = {};
  var sessionId = null;
  var sessionStartedAt = null;
  var initialized = false;

  // ───────────────────────────── Utilities ─────────────────────────────
  function now() { return new Date().toISOString(); }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function log() {
    if (!config.debug) return;
    try { console.log.apply(console, ['[Sentry]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function safeStringify(obj) {
    var seen = new WeakSet();
    try {
      return JSON.stringify(obj, function (k, v) {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (typeof v === 'function') return '[Function]';
        return v;
      });
    } catch (e) { return '"[Unserializable]"'; }
  }

  function persist(key, value) {
    try { localStorage.setItem(key, safeStringify(value)); } catch (e) {}
  }

  function restore(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  // ───────────────────────────── Stack Parsing ─────────────────────────────
  function parseStack(err) {
    if (!err || !err.stack) return [];
    var frames = [];
    var lines = String(err.stack).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('Error') === 0) continue;
      var m = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
              line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (m && m.length === 5) {
        frames.push({ function: m[1], filename: m[2], lineno: +m[3], colno: +m[4] });
      } else if (m && m.length === 4) {
        frames.push({ function: '?', filename: m[1], lineno: +m[2], colno: +m[3] });
      } else {
        frames.push({ raw: line });
      }
    }
    return frames;
  }

  // ───────────────────────────── Breadcrumbs ─────────────────────────────
  function addBreadcrumb(crumb) {
    if (!crumb || typeof crumb !== 'object') return;
    var entry = {
      timestamp: crumb.timestamp || now(),
      category: crumb.category || 'default',
      message: crumb.message || '',
      level: crumb.level || 'info',
      type: crumb.type || 'default',
      data: crumb.data || null
    };
    breadcrumbs.push(entry);
    if (breadcrumbs.length > config.maxBreadcrumbs) {
      breadcrumbs.splice(0, breadcrumbs.length - config.maxBreadcrumbs);
    }
    persist(config.breadcrumbsKey, breadcrumbs);
    log('breadcrumb', entry);
  }

  function clearBreadcrumbs() {
    breadcrumbs = [];
    persist(config.breadcrumbsKey, breadcrumbs);
  }

  // ───────────────────────────── Context ─────────────────────────────
  function setUser(u) {
    user = u || null;
    persist(config.userKey, user);
  }
  function setTag(k, v) { tags[k] = String(v); }
  function setTags(obj) { Object.keys(obj || {}).forEach(function (k) { setTag(k, obj[k]); }); }
  function setExtra(k, v) { extras[k] = v; }
  function setContext(name, ctx) { contexts[name] = ctx; }

  // ───────────────────────────── Event Building ─────────────────────────────
  function buildEvent(level, payload) {
    var ev = {
      event_id: uuid().replace(/-/g, ''),
      timestamp: now(),
      level: level || 'error',
      platform: 'javascript',
      release: config.release,
      environment: config.environment,
      sdk: { name: 'volvix.sentry', version: '1.0.0' },
      user: user,
      tags: Object.assign({}, tags),
      extra: Object.assign({}, extras),
      contexts: Object.assign({
        browser: { name: navigator.userAgent },
        page: { url: location.href, referrer: document.referrer || null }
      }, contexts),
      breadcrumbs: breadcrumbs.slice(),
      session_id: sessionId
    };
    return Object.assign(ev, payload || {});
  }

  function captureException(err, hint) {
    if (Math.random() > config.sampleRate) return null;
    var ev = buildEvent('error', {
      exception: {
        values: [{
          type: err && err.name ? err.name : 'Error',
          value: err && err.message ? err.message : String(err),
          stacktrace: { frames: parseStack(err).reverse() }
        }]
      },
      hint: hint || null
    });
    return dispatch(ev);
  }

  function captureMessage(message, level) {
    if (Math.random() > config.sampleRate) return null;
    var ev = buildEvent(level || 'info', { message: String(message) });
    return dispatch(ev);
  }

  function dispatch(ev) {
    if (typeof config.beforeSend === 'function') {
      try {
        ev = config.beforeSend(ev);
        if (!ev) return null;
      } catch (e) { log('beforeSend threw', e); }
    }
    events.push(ev);
    if (events.length > config.maxEvents) {
      events.splice(0, events.length - config.maxEvents);
    }
    persist(config.storageKey, events);
    log('event captured', ev.event_id, ev.level);

    if (config.dsn) {
      try {
        var body = safeStringify(ev);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(config.dsn, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(config.dsn, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true })
            .catch(function () {});
        }
      } catch (e) { log('dispatch failed', e); }
    }
    return ev.event_id;
  }

  // ───────────────────────────── Global Handlers ─────────────────────────────
  function installGlobalHandlers() {
    global.addEventListener('error', function (e) {
      captureException(e.error || new Error(e.message || 'window.error'), {
        filename: e.filename, lineno: e.lineno, colno: e.colno
      });
    });

    global.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason || 'unhandledrejection';
      captureException(reason instanceof Error ? reason : new Error(String(reason)));
    });

    // Console breadcrumbs
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
      var orig = console[m];
      console[m] = function () {
        try {
          addBreadcrumb({
            category: 'console',
            level: m === 'log' ? 'info' : m,
            message: [].slice.call(arguments).map(function (a) {
              return typeof a === 'string' ? a : safeStringify(a);
            }).join(' ')
          });
        } catch (e) {}
        return orig.apply(console, arguments);
      };
    });

    // Click breadcrumbs
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var sel = t.tagName.toLowerCase() +
        (t.id ? '#' + t.id : '') +
        (t.className && typeof t.className === 'string' ? '.' + t.className.split(/\s+/).join('.') : '');
      addBreadcrumb({ category: 'ui.click', message: sel, type: 'user' });
    }, true);

    // Navigation breadcrumbs
    var lastUrl = location.href;
    setInterval(function () {
      if (location.href !== lastUrl) {
        addBreadcrumb({ category: 'navigation', message: lastUrl + ' -> ' + location.href, data: { from: lastUrl, to: location.href } });
        lastUrl = location.href;
      }
    }, 500);

    // Fetch instrumentation
    if (global.fetch) {
      var origFetch = global.fetch;
      global.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '?';
        var method = (init && init.method) || (input && input.method) || 'GET';
        var startedAt = Date.now();
        return origFetch.apply(this, arguments).then(function (res) {
          addBreadcrumb({
            category: 'fetch', type: 'http',
            message: method + ' ' + url + ' -> ' + res.status,
            data: { url: url, method: method, status_code: res.status, duration_ms: Date.now() - startedAt }
          });
          return res;
        }, function (err) {
          addBreadcrumb({ category: 'fetch', level: 'error', message: method + ' ' + url + ' FAILED', data: { error: String(err) } });
          throw err;
        });
      };
    }
  }

  // ───────────────────────────── Sessions ─────────────────────────────
  function startSession() {
    sessionId = uuid();
    sessionStartedAt = now();
    addBreadcrumb({ category: 'session', message: 'session started', data: { session_id: sessionId } });
  }

  function endSession(status) {
    addBreadcrumb({ category: 'session', message: 'session ended: ' + (status || 'ok') });
    sessionId = null;
  }

  // ───────────────────────────── Init ─────────────────────────────
  function init(options) {
    if (initialized) { log('already initialized'); return SentryAPI; }
    config = Object.assign({}, DEFAULTS, options || {});
    breadcrumbs = restore(config.breadcrumbsKey, []) || [];
    events = restore(config.storageKey, []) || [];
    user = restore(config.userKey, null);
    if (config.autoSessionTracking) startSession();
    installGlobalHandlers();
    initialized = true;
    log('initialized', config.release, config.environment);
    return SentryAPI;
  }

  function flush() {
    var pending = events.slice();
    if (!config.dsn || !pending.length) return Promise.resolve(true);
    return Promise.all(pending.map(function (ev) {
      return fetch(config.dsn, { method: 'POST', body: safeStringify(ev), headers: { 'Content-Type': 'application/json' } })
        .then(function () { return true; }, function () { return false; });
    })).then(function () { events = []; persist(config.storageKey, events); return true; });
  }

  function getEvents() { return events.slice(); }
  function getBreadcrumbs() { return breadcrumbs.slice(); }
  function clearAll() {
    events = []; breadcrumbs = []; tags = {}; extras = {}; contexts = {};
    persist(config.storageKey, events);
    persist(config.breadcrumbsKey, breadcrumbs);
  }

  // ───────────────────────────── Public API ─────────────────────────────
  var SentryAPI = {
    init: init,
    captureException: captureException,
    captureMessage: captureMessage,
    addBreadcrumb: addBreadcrumb,
    clearBreadcrumbs: clearBreadcrumbs,
    setUser: setUser,
    setTag: setTag,
    setTags: setTags,
    setExtra: setExtra,
    setContext: setContext,
    startSession: startSession,
    endSession: endSession,
    flush: flush,
    getEvents: getEvents,
    getBreadcrumbs: getBreadcrumbs,
    clearAll: clearAll,
    getConfig: function () { return Object.assign({}, config); },
    getUser: function () { return user; },
    getSessionId: function () { return sessionId; }
  };

  global.SentryAPI = SentryAPI;
})(typeof window !== 'undefined' ? window : this);
