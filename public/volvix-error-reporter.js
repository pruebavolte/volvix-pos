/* ============================================================================
 * volvix-error-reporter.js — B32.4
 * Frontend error reporter -> POST /api/log/client
 *
 * Captura: window.error, unhandledrejection, console.error (opt-in)
 * Buffer en memoria + flush con sendBeacon (no bloquea unload).
 * Rate-limited cliente: max 10/min, dedup por message+stack-hash.
 * ==========================================================================*/
(function (global) {
  'use strict';
  if (global.__volvixErrorReporterLoaded) return;
  global.__volvixErrorReporterLoaded = true;

  var ENDPOINT = '/api/log/client';
  var MAX_PER_MIN = 10;
  var BUFFER = [];
  var SENT_HASHES = new Set();
  var SENT_TIMES = [];

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function hash(s) {
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return String(h);
  }

  function rateOk() {
    var t = nowSec();
    SENT_TIMES = SENT_TIMES.filter(function (x) { return t - x < 60; });
    return SENT_TIMES.length < MAX_PER_MIN;
  }

  function send(payload) {
    if (!rateOk()) return;
    var key = hash(payload.message + '|' + (payload.stack || '').slice(0, 200));
    if (SENT_HASHES.has(key)) return; // dedup
    SENT_HASHES.add(key);
    if (SENT_HASHES.size > 200) SENT_HASHES.clear();
    SENT_TIMES.push(nowSec());

    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function makePayload(level, message, stack, extra) {
    return {
      level: level || 'error',
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 2000),
      url: location.href.slice(0, 300),
      meta: Object.assign({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        ua_lang: navigator.language,
        ts_client: Date.now()
      }, extra || {})
    };
  }

  // window.onerror
  window.addEventListener('error', function (ev) {
    if (!ev) return;
    var msg = (ev.error && ev.error.message) || ev.message || 'unknown';
    var stk = (ev.error && ev.error.stack) || '';
    send(makePayload('error', msg, stk, {
      filename: ev.filename, lineno: ev.lineno, colno: ev.colno
    }));
  });

  // unhandledrejection
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    var msg = (r && r.message) || String(r || 'unhandled rejection');
    var stk = (r && r.stack) || '';
    send(makePayload('error', msg, stk, { kind: 'unhandledrejection' }));
  });

  // Public API
  global.VolvixErrors = {
    report: function (msg, extra) { send(makePayload('error', msg, '', extra)); },
    warn:   function (msg, extra) { send(makePayload('warn',  msg, '', extra)); },
    info:   function (msg, extra) { send(makePayload('info',  msg, '', extra)); },
    flush:  function () { /* sendBeacon flushes automatically */ }
  };

  // Console.error opt-in (off por defecto, activar con ?errReport=1)
  try {
    if (location.search.indexOf('errReport=1') >= 0) {
      var origErr = console.error;
      console.error = function () {
        try {
          var args = Array.prototype.slice.call(arguments);
          send(makePayload('error', args.map(String).join(' ').slice(0, 500), '', { source: 'console.error' }));
        } catch (_) {}
        return origErr.apply(console, arguments);
      };
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : self);
