/* ============================================================
 * volvix-google-analytics-wiring.js
 * Volvix POS — Google Analytics 4 (GA4) wiring
 *
 * Expone window.GAAPI con utilidades para:
 *   - Inicializar GA4 (gtag.js) con measurement ID
 *   - Page views (SPA routing)
 *   - Eventos custom
 *   - Eventos de ecommerce (view_item, add_to_cart, begin_checkout, purchase, refund)
 *   - Conversiones (send_to)
 *   - User properties / user_id
 *   - Consent Mode v2
 *   - Debug mode
 *
 * Uso rápido:
 *   GAAPI.init('G-XXXXXXXXXX', { debug: false });
 *   GAAPI.pageview('/dashboard', 'Dashboard');
 *   GAAPI.event('button_click', { label: 'guardar' });
 *   GAAPI.ecommerce.purchase({ transaction_id: 'T-123', value: 99.9, currency: 'MXN', items: [...] });
 *   GAAPI.conversion('AW-123/abc');
 * ============================================================ */
(function (global) {
  'use strict';

  var STATE = {
    initialized: false,
    measurementId: null,
    debug: false,
    queue: [],
    userId: null,
    userProps: {},
    defaultCurrency: 'MXN',
    sendPageView: false,
    consentGranted: false
  };

  function log() {
    if (!STATE.debug) return;
    try { console.log.apply(console, ['[GAAPI]'].concat([].slice.call(arguments))); }
    catch (e) {}
  }

  function warn() {
    try { console.warn.apply(console, ['[GAAPI]'].concat([].slice.call(arguments))); }
    catch (e) {}
  }

  function ensureDataLayer() {
    global.dataLayer = global.dataLayer || [];
    if (typeof global.gtag !== 'function') {
      global.gtag = function () { global.dataLayer.push(arguments); };
    }
  }

  function loadGtagScript(measurementId) {
    return new Promise(function (resolve, reject) {
      if (document.getElementById('ga4-gtag-script')) return resolve();
      var s = document.createElement('script');
      s.id = 'ga4-gtag-script';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('No se pudo cargar gtag.js')); };
      document.head.appendChild(s);
    });
  }

  function flushQueue() {
    while (STATE.queue.length) {
      var args = STATE.queue.shift();
      try { global.gtag.apply(null, args); } catch (e) { warn('flush error', e); }
    }
  }

  function gtagSafe() {
    var args = [].slice.call(arguments);
    if (!STATE.initialized) { STATE.queue.push(args); return; }
    try { global.gtag.apply(null, args); } catch (e) { warn('gtag error', e); }
  }

  // ---------------------- Consent Mode v2 ----------------------
  function setDefaultConsent(opts) {
    ensureDataLayer();
    var defaults = {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500
    };
    for (var k in (opts || {})) defaults[k] = opts[k];
    global.gtag('consent', 'default', defaults);
    log('consent default', defaults);
  }

  function updateConsent(opts) {
    gtagSafe('consent', 'update', opts || {});
    STATE.consentGranted = !!(opts && opts.analytics_storage === 'granted');
    log('consent update', opts);
  }

  // ---------------------- Init ----------------------
  function init(measurementId, options) {
    options = options || {};
    if (!measurementId) { warn('init: falta measurementId'); return Promise.reject(new Error('measurementId requerido')); }
    if (STATE.initialized && STATE.measurementId === measurementId) {
      log('ya inicializado'); return Promise.resolve();
    }
    STATE.measurementId = measurementId;
    STATE.debug = !!options.debug;
    STATE.defaultCurrency = options.currency || STATE.defaultCurrency;
    STATE.sendPageView = !!options.sendPageView;

    ensureDataLayer();
    if (options.consentDefault) setDefaultConsent(options.consentDefault);

    return loadGtagScript(measurementId).then(function () {
      global.gtag('js', new Date());
      var cfg = {
        send_page_view: STATE.sendPageView,
        debug_mode: STATE.debug,
        anonymize_ip: options.anonymizeIp !== false,
        currency: STATE.defaultCurrency
      };
      if (options.cookieDomain) cfg.cookie_domain = options.cookieDomain;
      if (options.cookieFlags) cfg.cookie_flags = options.cookieFlags;
      global.gtag('config', measurementId, cfg);
      STATE.initialized = true;
      log('inicializado', measurementId, cfg);
      flushQueue();
    });
  }

  // ---------------------- Page views ----------------------
  function pageview(path, title, extra) {
    var params = {
      page_path: path || (location.pathname + location.search),
      page_title: title || document.title,
      page_location: location.href
    };
    if (extra && typeof extra === 'object') {
      for (var k in extra) params[k] = extra[k];
    }
    gtagSafe('event', 'page_view', params);
    log('page_view', params);
  }

  // ---------------------- Eventos custom ----------------------
  function event(name, params) {
    if (!name) { warn('event: nombre requerido'); return; }
    gtagSafe('event', name, params || {});
    log('event', name, params || {});
  }

  // ---------------------- User ----------------------
  function setUserId(id) {
    STATE.userId = id || null;
    if (STATE.measurementId) {
      gtagSafe('config', STATE.measurementId, { user_id: id || undefined });
    }
    log('user_id', id);
  }

  function setUserProperties(props) {
    if (!props || typeof props !== 'object') return;
    for (var k in props) STATE.userProps[k] = props[k];
    gtagSafe('set', 'user_properties', props);
    log('user_properties', props);
  }

  // ---------------------- Ecommerce helpers ----------------------
  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (it, i) {
      return {
        item_id: String(it.id || it.item_id || it.sku || ('SKU-' + i)),
        item_name: String(it.name || it.item_name || 'Producto'),
        item_brand: it.brand || it.item_brand || undefined,
        item_category: it.category || it.item_category || undefined,
        item_variant: it.variant || it.item_variant || undefined,
        price: Number(it.price || 0),
        quantity: Number(it.qty || it.quantity || 1),
        discount: it.discount != null ? Number(it.discount) : undefined,
        currency: it.currency || STATE.defaultCurrency
      };
    });
  }

  function ecomEvent(name, payload) {
    payload = payload || {};
    var params = {
      currency: payload.currency || STATE.defaultCurrency,
      value: payload.value != null ? Number(payload.value) : undefined,
      items: normalizeItems(payload.items || [])
    };
    if (payload.transaction_id) params.transaction_id = String(payload.transaction_id);
    if (payload.tax != null) params.tax = Number(payload.tax);
    if (payload.shipping != null) params.shipping = Number(payload.shipping);
    if (payload.coupon) params.coupon = String(payload.coupon);
    if (payload.affiliation) params.affiliation = String(payload.affiliation);
    if (payload.payment_type) params.payment_type = String(payload.payment_type);
    gtagSafe('event', name, params);
    log('ecom:' + name, params);
  }

  var ecommerce = {
    viewItem:        function (p) { ecomEvent('view_item', p); },
    viewItemList:    function (p) { ecomEvent('view_item_list', p); },
    selectItem:      function (p) { ecomEvent('select_item', p); },
    addToCart:       function (p) { ecomEvent('add_to_cart', p); },
    removeFromCart:  function (p) { ecomEvent('remove_from_cart', p); },
    viewCart:        function (p) { ecomEvent('view_cart', p); },
    beginCheckout:   function (p) { ecomEvent('begin_checkout', p); },
    addPaymentInfo:  function (p) { ecomEvent('add_payment_info', p); },
    addShippingInfo: function (p) { ecomEvent('add_shipping_info', p); },
    purchase:        function (p) {
      if (!p || !p.transaction_id) warn('purchase: transaction_id recomendado');
      ecomEvent('purchase', p);
    },
    refund:          function (p) { ecomEvent('refund', p); }
  };

  // ---------------------- Conversiones ----------------------
  function conversion(sendTo, params) {
    if (!sendTo) { warn('conversion: send_to requerido (ej: AW-XXXX/abc)'); return; }
    var p = { send_to: sendTo };
    if (params && typeof params === 'object') {
      for (var k in params) p[k] = params[k];
    }
    gtagSafe('event', 'conversion', p);
    log('conversion', p);
  }

  // ---------------------- Excepciones / timing ----------------------
  function exception(description, fatal) {
    gtagSafe('event', 'exception', {
      description: String(description || ''),
      fatal: !!fatal
    });
  }

  function timing(name, value, category) {
    gtagSafe('event', 'timing_complete', {
      name: String(name || 'timing'),
      value: Number(value || 0),
      event_category: category || 'performance'
    });
  }

  // ---------------------- SPA hook ----------------------
  function hookHistory() {
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      var r = origPush.apply(this, arguments);
      try { pageview(); } catch (e) {}
      return r;
    };
    history.replaceState = function () {
      var r = origReplace.apply(this, arguments);
      try { pageview(); } catch (e) {}
      return r;
    };
    global.addEventListener('popstate', function () { try { pageview(); } catch (e) {} });
    log('SPA history hook activo');
  }

  // ---------------------- API pública ----------------------
  global.GAAPI = {
    init: init,
    pageview: pageview,
    event: event,
    setUserId: setUserId,
    setUserProperties: setUserProperties,
    ecommerce: ecommerce,
    conversion: conversion,
    exception: exception,
    timing: timing,
    setDefaultConsent: setDefaultConsent,
    updateConsent: updateConsent,
    hookHistory: hookHistory,
    _state: STATE
  };

  log('GAAPI listo (sin inicializar). Llama GAAPI.init(measurementId).');
})(window);
