/**
 * volvix-fb-pixel-wiring.js
 * Facebook Pixel + Conversions API wiring for Volvix POS / SalvadoreX.
 * Exposes window.FBPixelAPI with PageView, Purchase, AddToCart, custom
 * conversions and audience helpers.
 *
 * Loader expects window.VOLVIX_FB_CONFIG = {
 *   pixelId: '1234567890',
 *   capiEndpoint: '/api/fb/capi',   // optional server-side proxy
 *   testEventCode: null,            // 'TEST12345' for debug
 *   debug: false,
 *   currency: 'USD',
 *   autoPageView: true
 * }
 */
(function (global) {
  'use strict';

  var CFG = global.VOLVIX_FB_CONFIG || {};
  var PIXEL_ID = CFG.pixelId || null;
  var CAPI_URL = CFG.capiEndpoint || null;
  var TEST_CODE = CFG.testEventCode || null;
  var DEBUG = !!CFG.debug;
  var DEFAULT_CCY = CFG.currency || 'USD';

  // ─── tiny utils ────────────────────────────────────────────────────────
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, ['[FBPixel]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warn() {
    try { console.warn.apply(console, ['[FBPixel]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function uuid() {
    return 'fbe_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 10);
  }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function sha256Hex(str) {
    if (!str) return null;
    try {
      var enc = new TextEncoder().encode(String(str).trim().toLowerCase());
      return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) { return ('00' + b.toString(16)).slice(-2); })
          .join('');
      });
    } catch (e) { return Promise.resolve(null); }
  }

  // ─── pixel loader (snippet inlined) ────────────────────────────────────
  function loadPixel() {
    if (global.fbq) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(global,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
  }

  function init() {
    if (!PIXEL_ID) { warn('pixelId missing — pixel disabled'); return false; }
    loadPixel();
    global.fbq('init', PIXEL_ID);
    if (TEST_CODE) global.fbq('set', 'agent', 'volvix-' + TEST_CODE, PIXEL_ID);
    log('pixel initialized', PIXEL_ID);
    return true;
  }

  // ─── consent gate ─────────────────────────────────────────────────────
  var consentGranted = true;
  function setConsent(granted) {
    consentGranted = !!granted;
    if (!global.fbq) return;
    global.fbq('consent', granted ? 'grant' : 'revoke');
    log('consent', granted);
  }

  // ─── event dispatch (browser + CAPI) ───────────────────────────────────
  var eventQueue = [];
  function track(eventName, params, opts) {
    params = params || {};
    opts = opts || {};
    if (!consentGranted) { eventQueue.push([eventName, params, opts]); return null; }
    if (!global.fbq) { eventQueue.push([eventName, params, opts]); return null; }

    var eventId = opts.eventId || uuid();
    var custom = opts.custom === true;
    var method = custom ? 'trackCustom' : 'track';

    try {
      global.fbq(method, eventName, params, { eventID: eventId });
      log('browser', method, eventName, params, eventId);
    } catch (e) { warn('fbq error', e); }

    if (CAPI_URL) {
      sendCAPI(eventName, params, eventId, opts.userData || {}).catch(function (e) {
        warn('CAPI failed', e);
      });
    }
    return eventId;
  }

  function flushQueue() {
    while (eventQueue.length) {
      var args = eventQueue.shift();
      track(args[0], args[1], args[2]);
    }
  }

  // ─── Conversions API (server-side mirror) ──────────────────────────────
  function sendCAPI(eventName, params, eventId, userData) {
    var fbp = getCookie('_fbp');
    var fbc = getCookie('_fbc');
    var payload = {
      pixel_id: PIXEL_ID,
      test_event_code: TEST_CODE || undefined,
      data: [{
        event_name: eventName,
        event_id: eventId,
        event_time: nowSec(),
        action_source: 'website',
        event_source_url: location.href,
        user_data: {
          client_user_agent: navigator.userAgent,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
          em: userData.em_hashed || undefined,
          ph: userData.ph_hashed || undefined,
          external_id: userData.external_id || undefined
        },
        custom_data: params
      }]
    };
    return fetch(CAPI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (r) {
      log('CAPI status', r.status);
      return r.ok;
    });
  }

  // ─── Standard event helpers ────────────────────────────────────────────
  function pageView(extra) {
    return track('PageView', extra || {});
  }

  function viewContent(p) {
    p = p || {};
    return track('ViewContent', {
      content_ids: p.content_ids || (p.id ? [p.id] : []),
      content_name: p.name,
      content_type: p.content_type || 'product',
      content_category: p.category,
      value: p.value,
      currency: p.currency || DEFAULT_CCY
    });
  }

  function addToCart(p) {
    p = p || {};
    return track('AddToCart', {
      content_ids: p.content_ids || (p.id ? [p.id] : []),
      content_name: p.name,
      content_type: 'product',
      contents: p.contents || (p.id ? [{ id: p.id, quantity: p.quantity || 1 }] : []),
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY
    });
  }

  function initiateCheckout(p) {
    p = p || {};
    return track('InitiateCheckout', {
      content_ids: p.content_ids || [],
      contents: p.contents || [],
      num_items: p.num_items || (p.contents ? p.contents.length : 0),
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY
    });
  }

  function addPaymentInfo(p) {
    p = p || {};
    return track('AddPaymentInfo', {
      content_ids: p.content_ids || [],
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY
    });
  }

  function purchase(p, userData) {
    p = p || {};
    if (typeof p.value !== 'number') warn('Purchase requires numeric value');
    return track('Purchase', {
      content_ids: p.content_ids || [],
      content_type: p.content_type || 'product',
      contents: p.contents || [],
      num_items: p.num_items || (p.contents ? p.contents.length : 0),
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY,
      order_id: p.order_id
    }, { userData: userData || {} });
  }

  function lead(p, userData) {
    p = p || {};
    return track('Lead', {
      content_name: p.name,
      content_category: p.category,
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY
    }, { userData: userData || {} });
  }

  function completeRegistration(p, userData) {
    p = p || {};
    return track('CompleteRegistration', {
      content_name: p.name,
      status: p.status || 'completed',
      value: p.value || 0,
      currency: p.currency || DEFAULT_CCY
    }, { userData: userData || {} });
  }

  function search(query) {
    return track('Search', { search_string: String(query || '') });
  }

  function customEvent(name, params, userData) {
    return track(name, params || {}, { custom: true, userData: userData || {} });
  }

  // ─── Audience helpers (custom audience signals) ────────────────────────
  function tagAudience(audienceName, payload) {
    return customEvent('Audience_' + audienceName, payload || {});
  }

  function userIdentify(user) {
    // Hash PII in-browser before storing/sending
    user = user || {};
    return Promise.all([
      sha256Hex(user.email),
      sha256Hex(user.phone)
    ]).then(function (h) {
      var ud = { em_hashed: h[0], ph_hashed: h[1], external_id: user.id };
      if (global.fbq) {
        global.fbq('init', PIXEL_ID, {
          em: h[0] || undefined,
          ph: h[1] || undefined,
          external_id: user.id || undefined
        });
      }
      log('identified', user.id);
      return ud;
    });
  }

  // ─── Auto wiring ───────────────────────────────────────────────────────
  function autoWireDom() {
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-fb-event]');
      if (!el) return;
      var name = el.getAttribute('data-fb-event');
      var raw = el.getAttribute('data-fb-params');
      var params = {};
      if (raw) { try { params = JSON.parse(raw); } catch (e) { warn('bad data-fb-params', e); } }
      track(name, params);
    }, true);
  }

  // ─── Public API ────────────────────────────────────────────────────────
  var API = {
    init: init,
    setConsent: setConsent,
    flushQueue: flushQueue,
    track: track,
    pageView: pageView,
    viewContent: viewContent,
    addToCart: addToCart,
    initiateCheckout: initiateCheckout,
    addPaymentInfo: addPaymentInfo,
    purchase: purchase,
    lead: lead,
    completeRegistration: completeRegistration,
    search: search,
    customEvent: customEvent,
    tagAudience: tagAudience,
    userIdentify: userIdentify,
    _config: CFG,
    version: '1.0.0'
  };

  global.FBPixelAPI = API;

  // boot
  if (init()) {
    if (CFG.autoPageView !== false) pageView();
    autoWireDom();
  }
})(window);
