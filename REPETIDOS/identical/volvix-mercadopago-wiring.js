/**
 * volvix-mercadopago-wiring.js
 * MercadoPago integration for Volvix POS
 * Exposes window.MercadoPagoAPI with: preferences, payments, QR, links
 *
 * NOTE: Production integration requires backend signing of access tokens.
 * This module is the front-end wiring layer. It calls a backend proxy
 * (MP_PROXY_BASE) for any operation that needs the secret access token.
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Config ─────────────────────────────
  const CONFIG = {
    PUBLIC_KEY: global.MP_PUBLIC_KEY || 'APP_USR-PUBLIC-KEY-PLACEHOLDER',
    PROXY_BASE: global.MP_PROXY_BASE || '/api/mercadopago',
    LOCALE: 'es-MX',
    CURRENCY: 'MXN',
    SDK_URL: 'https://sdk.mercadopago.com/js/v2',
    DEFAULT_EXPIRES_MIN: 30,
    DEBUG: !!global.MP_DEBUG
  };

  function log(...a) { if (CONFIG.DEBUG) console.log('[MP]', ...a); }
  function warn(...a) { console.warn('[MP]', ...a); }
  function err(...a)  { console.error('[MP]', ...a); }

  // ───────────────────────────── State ─────────────────────────────
  const state = {
    sdkLoaded: false,
    sdkLoading: null,
    mp: null,
    lastPreference: null,
    lastPayment: null,
    listeners: { payment: [], preference: [], error: [] }
  };

  // ───────────────────────────── Utils ─────────────────────────────
  function uid(prefix) {
    return (prefix || 'mp') + '_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  function emit(event, payload) {
    (state.listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { err('listener', event, e); }
    });
  }

  function on(event, fn) {
    if (!state.listeners[event]) state.listeners[event] = [];
    state.listeners[event].push(fn);
    return () => {
      state.listeners[event] = state.listeners[event].filter(f => f !== fn);
    };
  }

  async function fetchJSON(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      opts.headers || {}
    );
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.status = res.status;
      e.body = json;
      throw e;
    }
    return json;
  }

  function money(n) {
    const v = Number(n);
    if (!isFinite(v)) throw new Error('invalid amount');
    return Math.round(v * 100) / 100;
  }

  function isoExpires(minutes) {
    const d = new Date(Date.now() + (minutes || CONFIG.DEFAULT_EXPIRES_MIN) * 60000);
    return d.toISOString();
  }

  // ───────────────────────────── SDK ─────────────────────────────
  function loadSDK() {
    if (state.sdkLoaded) return Promise.resolve(state.mp);
    if (state.sdkLoading) return state.sdkLoading;

    state.sdkLoading = new Promise((resolve, reject) => {
      if (global.MercadoPago) {
        state.mp = new global.MercadoPago(CONFIG.PUBLIC_KEY, { locale: CONFIG.LOCALE });
        state.sdkLoaded = true;
        return resolve(state.mp);
      }
      const script = document.createElement('script');
      script.src = CONFIG.SDK_URL;
      script.async = true;
      script.onload = () => {
        try {
          state.mp = new global.MercadoPago(CONFIG.PUBLIC_KEY, { locale: CONFIG.LOCALE });
          state.sdkLoaded = true;
          log('SDK loaded');
          resolve(state.mp);
        } catch (e) { reject(e); }
      };
      script.onerror = () => reject(new Error('Failed to load MercadoPago SDK'));
      document.head.appendChild(script);
    });
    return state.sdkLoading;
  }

  // ───────────────────────────── Preferences ─────────────────────────────
  /**
   * Build a Preference payload from cart items.
   * cart: [{ title, quantity, unit_price, currency_id?, description? }]
   */
  function buildPreferencePayload(cart, opts) {
    opts = opts || {};
    if (!Array.isArray(cart) || cart.length === 0) {
      throw new Error('cart vacio');
    }
    const items = cart.map((it, i) => ({
      id: String(it.id || i + 1),
      title: String(it.title || 'Item'),
      description: it.description || '',
      quantity: Math.max(1, parseInt(it.quantity || 1, 10)),
      unit_price: money(it.unit_price),
      currency_id: it.currency_id || CONFIG.CURRENCY
    }));

    return {
      items,
      external_reference: opts.external_reference || uid('order'),
      statement_descriptor: opts.statement_descriptor || 'VOLVIX',
      expires: true,
      expiration_date_to: opts.expires_at || isoExpires(opts.expires_min),
      back_urls: opts.back_urls || {
        success: global.location.origin + '/pago/exito',
        failure: global.location.origin + '/pago/falla',
        pending: global.location.origin + '/pago/pendiente'
      },
      auto_return: 'approved',
      notification_url: opts.notification_url || (CONFIG.PROXY_BASE + '/webhook'),
      payer: opts.payer || undefined,
      metadata: Object.assign({ source: 'volvix-pos' }, opts.metadata || {})
    };
  }

  async function createPreference(cart, opts) {
    const payload = buildPreferencePayload(cart, opts);
    log('createPreference', payload);
    try {
      const pref = await fetchJSON(CONFIG.PROXY_BASE + '/preferences', {
        method: 'POST',
        body: payload
      });
      state.lastPreference = pref;
      emit('preference', pref);
      return pref;
    } catch (e) {
      err('createPreference', e);
      emit('error', { op: 'createPreference', error: e });
      throw e;
    }
  }

  async function getPreference(id) {
    if (!id) throw new Error('id requerido');
    return fetchJSON(CONFIG.PROXY_BASE + '/preferences/' + encodeURIComponent(id));
  }

  // ───────────────────────────── Checkout (Brick / Redirect) ─────────────────────────────
  async function openCheckout(prefId, mountOpts) {
    if (!prefId) throw new Error('preference id requerido');
    await loadSDK();
    mountOpts = mountOpts || {};

    if (mountOpts.mode === 'redirect') {
      const url = (state.lastPreference && state.lastPreference.init_point) ||
                  ('https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=' + prefId);
      global.location.href = url;
      return { redirected: true, url };
    }

    // Wallet Brick
    const containerId = mountOpts.containerId || 'mp-wallet-container';
    if (!document.getElementById(containerId)) {
      const div = document.createElement('div');
      div.id = containerId;
      document.body.appendChild(div);
    }
    const bricks = state.mp.bricks();
    const controller = await bricks.create('wallet', containerId, {
      initialization: { preferenceId: prefId },
      callbacks: {
        onReady: () => log('wallet ready'),
        onError: (e) => emit('error', { op: 'wallet', error: e })
      }
    });
    return controller;
  }

  // ───────────────────────────── Payments ─────────────────────────────
  async function getPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId requerido');
    const p = await fetchJSON(CONFIG.PROXY_BASE + '/payments/' + encodeURIComponent(paymentId));
    state.lastPayment = p;
    emit('payment', p);
    return p;
  }

  async function searchPayments(filters) {
    const qs = new URLSearchParams(filters || {}).toString();
    return fetchJSON(CONFIG.PROXY_BASE + '/payments/search?' + qs);
  }

  async function refundPayment(paymentId, amount) {
    if (!paymentId) throw new Error('paymentId requerido');
    const body = amount != null ? { amount: money(amount) } : {};
    return fetchJSON(CONFIG.PROXY_BASE + '/payments/' + encodeURIComponent(paymentId) + '/refund', {
      method: 'POST',
      body
    });
  }

  async function cancelPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId requerido');
    return fetchJSON(CONFIG.PROXY_BASE + '/payments/' + encodeURIComponent(paymentId) + '/cancel', {
      method: 'POST'
    });
  }

  /**
   * Polls payment status until terminal or timeout.
   */
  async function waitForPayment(paymentId, opts) {
    opts = opts || {};
    const interval = opts.interval || 3000;
    const timeout = opts.timeout || 5 * 60 * 1000;
    const start = Date.now();
    const terminal = new Set(['approved', 'rejected', 'cancelled', 'refunded', 'charged_back']);
    while (Date.now() - start < timeout) {
      try {
        const p = await getPayment(paymentId);
        if (p && terminal.has(p.status)) return p;
      } catch (e) { warn('poll', e.message); }
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('waitForPayment timeout');
  }

  // ───────────────────────────── QR Pay (Point/Store) ─────────────────────────────
  /**
   * Creates a dynamic QR for in-person payment.
   * Requires backend with user_id + pos_id.
   */
  async function createQR(cart, opts) {
    opts = opts || {};
    const payload = {
      external_reference: opts.external_reference || uid('qr'),
      title: opts.title || 'Volvix POS',
      description: opts.description || '',
      total_amount: money(
        cart.reduce((s, it) => s + money(it.unit_price) * (parseInt(it.quantity || 1, 10)), 0)
      ),
      items: cart.map((it, i) => ({
        sku_number: String(it.id || i + 1),
        category: it.category || 'general',
        title: it.title,
        description: it.description || '',
        unit_price: money(it.unit_price),
        quantity: parseInt(it.quantity || 1, 10),
        unit_measure: 'unit',
        total_amount: money(money(it.unit_price) * parseInt(it.quantity || 1, 10))
      })),
      cash_out: { amount: 0 },
      notification_url: opts.notification_url || (CONFIG.PROXY_BASE + '/webhook')
    };
    const res = await fetchJSON(CONFIG.PROXY_BASE + '/qr', {
      method: 'POST',
      body: payload
    });
    // res expected: { qr_data, in_store_order_id, deep_link, image_url? }
    log('QR created', res);
    return res;
  }

  function renderQR(qrData, mountEl, size) {
    size = size || 240;
    const target = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!target) throw new Error('mount target not found');
    target.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'MercadoPago QR';
    img.width = size; img.height = size;
    const enc = encodeURIComponent(qrData);
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + enc;
    target.appendChild(img);
    return img;
  }

  async function cancelQR(orderId) {
    if (!orderId) throw new Error('orderId requerido');
    return fetchJSON(CONFIG.PROXY_BASE + '/qr/' + encodeURIComponent(orderId), {
      method: 'DELETE'
    });
  }

  // ───────────────────────────── Payment Links ─────────────────────────────
  /**
   * Generates a shareable payment link from a preference.
   * Returns { url, short, qr_url }.
   */
  async function generateLink(cart, opts) {
    opts = opts || {};
    const pref = await createPreference(cart, opts);
    const url = opts.sandbox ? pref.sandbox_init_point : pref.init_point;
    if (!url) throw new Error('init_point no disponible');
    const qr_url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
                   encodeURIComponent(url);

    let short = url;
    if (opts.shorten) {
      try {
        const s = await fetchJSON(CONFIG.PROXY_BASE + '/shorten', {
          method: 'POST',
          body: { url }
        });
        short = s.short_url || url;
      } catch (e) { warn('shorten failed', e.message); }
    }
    return { preference_id: pref.id, url, short, qr_url, expires_at: pref.expiration_date_to };
  }

  function copyLink(url) {
    if (!url) return Promise.reject(new Error('url requerido'));
    if (global.navigator && navigator.clipboard) {
      return navigator.clipboard.writeText(url);
    }
    return new Promise((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); resolve();
    });
  }

  function shareLink(url, title) {
    if (global.navigator && navigator.share) {
      return navigator.share({ title: title || 'Pago Volvix', url });
    }
    return copyLink(url).then(() => ({ fallback: 'copied' }));
  }

  // ───────────────────────────── Webhooks (client mirror) ─────────────────────────────
  /**
   * Subscribe to backend-pushed webhook events via SSE/WebSocket if configured.
   */
  function subscribeWebhooks(opts) {
    opts = opts || {};
    const url = opts.url || (CONFIG.PROXY_BASE + '/webhook/stream');
    if (!global.EventSource) {
      warn('EventSource no soportado');
      return { close: () => {} };
    }
    const es = new EventSource(url);
    es.addEventListener('payment', (ev) => {
      try { emit('payment', JSON.parse(ev.data)); } catch (e) { err('webhook parse', e); }
    });
    es.addEventListener('error', (ev) => emit('error', { op: 'webhook', error: ev }));
    return { close: () => es.close() };
  }

  // ───────────────────────────── Public API ─────────────────────────────
  const MercadoPagoAPI = {
    // config
    config: CONFIG,
    setPublicKey(k) { CONFIG.PUBLIC_KEY = k; state.sdkLoaded = false; state.mp = null; },
    setProxyBase(u) { CONFIG.PROXY_BASE = u; },

    // sdk
    loadSDK,
    getInstance: () => state.mp,

    // preferences & checkout
    buildPreferencePayload,
    createPreference,
    getPreference,
    openCheckout,

    // payments
    getPayment,
    searchPayments,
    refundPayment,
    cancelPayment,
    waitForPayment,

    // qr
    createQR,
    renderQR,
    cancelQR,

    // links
    generateLink,
    copyLink,
    shareLink,

    // webhooks
    subscribeWebhooks,

    // events
    on,
    emit,

    // state
    state: () => ({
      sdkLoaded: state.sdkLoaded,
      lastPreference: state.lastPreference,
      lastPayment: state.lastPayment
    })
  };

  global.MercadoPagoAPI = MercadoPagoAPI;
  log('MercadoPagoAPI ready');
})(window);
