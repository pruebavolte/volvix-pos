/* Volvix · A/B Testing client-side wiring
 *
 * Public API:
 *   window.VolvixAB.assign(experimentId, variants[])  → string variant
 *      Sticky per user_id (localStorage). Deterministic FNV-1a hash.
 *      If `variants` omitted, server-side assignment is used (POST /api/abtest/assign).
 *
 *   window.VolvixAB.track(experimentId, eventType, metadata?)
 *      POSTs /api/abtest/event. Events: 'impression', 'click', 'conversion'.
 *
 *   window.VolvixAB.getUserId()    → stable user_id from localStorage (auto-generated)
 *   window.VolvixAB.setUserId(id)  → override user_id (e.g. after login)
 *   window.VolvixAB.scan(root?)    → process [data-ab-experiment] elements in DOM
 *
 * DOM API:
 *   <div data-ab-experiment="hero_test"
 *        data-ab-variant="A"
 *        data-ab-variants="A,B,C">
 *     ...shown only if assigned variant === A
 *   </div>
 *
 *   <button data-ab-experiment="hero_test" data-ab-track="click">CTA</button>
 */
(function () {
  'use strict';
  if (window.VolvixAB) return; // idempotent

  var STORAGE_USER_KEY = 'volvix_ab_user_id';
  var STORAGE_ASSIGN_KEY = 'volvix_ab_assignments';
  var ENDPOINT_ASSIGN = '/api/abtest/assign';
  var ENDPOINT_EVENT  = '/api/abtest/event';

  /* ---------- user id ---------- */

  function genId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) {}
    return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getUserId() {
    try {
      var v = localStorage.getItem(STORAGE_USER_KEY);
      if (v) return v;
    } catch (_) {}
    var id = genId();
    try { localStorage.setItem(STORAGE_USER_KEY, id); } catch (_) {}
    return id;
  }

  function setUserId(id) {
    if (!id) return;
    try { localStorage.setItem(STORAGE_USER_KEY, String(id)); } catch (_) {}
  }

  /* ---------- assignment cache ---------- */

  function loadAssignments() {
    try { return JSON.parse(localStorage.getItem(STORAGE_ASSIGN_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function saveAssignments(map) {
    try { localStorage.setItem(STORAGE_ASSIGN_KEY, JSON.stringify(map || {})); } catch (_) {}
  }

  /* ---------- FNV-1a 32-bit (matches server) ---------- */

  function fnv1a(str) {
    var hash = 0x811c9dc5;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash >>> 0;
  }

  function pickVariant(seed, variants) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    var bucket = fnv1a(seed) % variants.length;
    return variants[bucket];
  }

  /* ---------- assign ---------- */

  function assign(experimentId, variants) {
    if (!experimentId) return null;
    var userId = getUserId();
    var cache = loadAssignments();
    var key = experimentId;
    if (cache[key]) return cache[key];

    if (Array.isArray(variants) && variants.length > 0) {
      var v = pickVariant(userId + ':' + experimentId, variants.map(String));
      cache[key] = v;
      saveAssignments(cache);
      // Fire-and-forget impression
      track(experimentId, 'impression', { variant: v, source: 'client' });
      return v;
    }
    return null; // caller should use assignAsync for server-side
  }

  function assignAsync(experimentId, variants, metadata) {
    if (!experimentId) return Promise.resolve(null);
    var cache = loadAssignments();
    if (cache[experimentId]) return Promise.resolve(cache[experimentId]);

    var body = {
      experiment_id: experimentId,
      user_id: getUserId(),
    };
    if (Array.isArray(variants)) body.variants = variants.map(String);
    if (metadata) body.metadata = metadata;

    return fetch(ENDPOINT_ASSIGN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.variant) return null;
        cache[experimentId] = d.variant;
        saveAssignments(cache);
        return d.variant;
      })
      .catch(function () { return null; });
  }

  /* ---------- track ---------- */

  function track(experimentId, eventType, metadata) {
    if (!experimentId || !eventType) return;
    var cache = loadAssignments();
    var variant = (metadata && metadata.variant) || cache[experimentId] || null;

    var payload = {
      experiment_id: experimentId,
      variant: variant,
      user_id: getUserId(),
      event_type: String(eventType).toLowerCase(),
      metadata: metadata && typeof metadata === 'object' ? metadata : null,
    };

    try {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT_EVENT, blob)) return;
    } catch (_) {}

    fetch(ENDPOINT_EVENT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(function () {});
  }

  /* ---------- DOM scanner ---------- */

  function scan(root) {
    var scope = root || document;
    var variantEls = scope.querySelectorAll('[data-ab-experiment][data-ab-variant]');
    var variantsByExp = {};

    // Pre-collect all available variants per experiment (any element listing them)
    variantEls.forEach(function (el) {
      var exp = el.getAttribute('data-ab-experiment');
      if (!exp) return;
      var declared = el.getAttribute('data-ab-variants');
      if (declared) {
        variantsByExp[exp] = declared.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      } else {
        if (!variantsByExp[exp]) variantsByExp[exp] = [];
        var v = el.getAttribute('data-ab-variant');
        if (v && variantsByExp[exp].indexOf(v) === -1) variantsByExp[exp].push(v);
      }
    });

    Object.keys(variantsByExp).forEach(function (exp) {
      var variants = variantsByExp[exp];
      var assigned = assign(exp, variants);
      if (!assigned) return;

      scope.querySelectorAll('[data-ab-experiment="' + exp + '"][data-ab-variant]')
        .forEach(function (el) {
          var v = el.getAttribute('data-ab-variant');
          if (v === assigned) {
            el.removeAttribute('hidden');
            el.style.display = '';
          } else {
            el.setAttribute('hidden', '');
            el.style.display = 'none';
          }
        });
    });

    // Wire data-ab-track elements
    scope.querySelectorAll('[data-ab-experiment][data-ab-track]').forEach(function (el) {
      if (el.__volvixAbWired) return;
      el.__volvixAbWired = true;
      var exp = el.getAttribute('data-ab-experiment');
      var ev  = el.getAttribute('data-ab-track') || 'click';
      el.addEventListener('click', function () { track(exp, ev); }, { passive: true });
    });
  }

  /* ---------- public API ---------- */

  window.VolvixAB = {
    assign: assign,
    assignAsync: assignAsync,
    track: track,
    getUserId: getUserId,
    setUserId: setUserId,
    scan: scan,
    _fnv1a: fnv1a,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }
})();
