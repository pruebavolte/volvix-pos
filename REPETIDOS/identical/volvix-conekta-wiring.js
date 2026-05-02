/**
 * volvix-conekta-wiring.js
 * Integración Conekta (México) para Volvix POS
 * Provee: tokenización de tarjetas, OXXO Pay, transferencia SPEI, payment links
 * Expone: window.ConektaAPI
 *
 * Requiere: <script src="https://cdn.conekta.io/js/latest/conekta.js"></script>
 */
(function (global) {
  'use strict';

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  const CONFIG = {
    publicKey: '',                       // key_xxx (pública)
    privateKeyEndpoint: '/api/conekta',  // backend proxy (NUNCA private key en cliente)
    locale: 'es',
    currency: 'MXN',
    country: 'MX',
    apiVersion: '2.0.0',
    debug: false,
    timeoutMs: 20000,
  };

  // ============================================================
  // UTILIDADES
  // ============================================================
  function log() {
    if (CONFIG.debug) console.log('[ConektaAPI]', ...arguments);
  }
  function warn() { console.warn('[ConektaAPI]', ...arguments); }
  function err()  { console.error('[ConektaAPI]', ...arguments); }

  function uuid() {
    return 'cnk-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }

  function isLuhnValid(number) {
    const s = String(number).replace(/\D/g, '');
    if (s.length < 12 || s.length > 19) return false;
    let sum = 0, alt = false;
    for (let i = s.length - 1; i >= 0; i--) {
      let n = parseInt(s.charAt(i), 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function detectBrand(number) {
    const s = String(number).replace(/\D/g, '');
    if (/^4/.test(s)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(s)) return 'mastercard';
    if (/^3[47]/.test(s)) return 'amex';
    if (/^6(011|5)/.test(s)) return 'discover';
    if (/^(50|56|57|58|6\d)/.test(s)) return 'carnet';
    return 'unknown';
  }

  function isExpiryValid(month, year) {
    const m = parseInt(month, 10), y = parseInt(year, 10);
    if (!(m >= 1 && m <= 12)) return false;
    const fullYear = y < 100 ? 2000 + y : y;
    const now = new Date();
    const exp = new Date(fullYear, m, 0, 23, 59, 59);
    return exp >= now;
  }

  function isCvcValid(cvc, brand) {
    const s = String(cvc).replace(/\D/g, '');
    if (brand === 'amex') return s.length === 4;
    return s.length === 3;
  }

  function validateAmount(amountCents) {
    const n = Number(amountCents);
    if (!Number.isFinite(n)) throw new Error('amount inválido');
    if (n < 300) throw new Error('amount mínimo: 3.00 MXN (300 cents)');
    if (!Number.isInteger(n)) throw new Error('amount debe ser entero (centavos)');
    return n;
  }

  function fetchJSON(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeout || CONFIG.timeoutMs);
    return fetch(url, {
      method: opts.method || 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
                 'X-Idempotency-Key': opts.idempotencyKey || uuid() },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    }).then(async (r) => {
      clearTimeout(t);
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) throw Object.assign(new Error(data.message || `HTTP ${r.status}`),
        { status: r.status, data });
      return data;
    }).catch((e) => {
      clearTimeout(t);
      if (e.name === 'AbortError') throw new Error('timeout en Conekta');
      throw e;
    });
  }

  // ============================================================
  // ESTADO
  // ============================================================
  let _ready = false;
  const _listeners = { ready: [], token: [], charge: [], error: [] };
  function emit(ev, payload) { (_listeners[ev] || []).forEach((fn) => {
    try { fn(payload); } catch (e) { err(ev, e); } }); }
  function on(ev, fn) { (_listeners[ev] = _listeners[ev] || []).push(fn); }
  function off(ev, fn) {
    if (!_listeners[ev]) return;
    _listeners[ev] = _listeners[ev].filter((f) => f !== fn);
  }

  // ============================================================
  // INIT
  // ============================================================
  function init(opts = {}) {
    Object.assign(CONFIG, opts);
    if (!CONFIG.publicKey) warn('publicKey vacía — set ConektaAPI.init({publicKey})');
    if (!global.Conekta) {
      err('SDK de Conekta no cargado. Incluye conekta.js antes de este script.');
      return false;
    }
    try {
      global.Conekta.setPublicKey(CONFIG.publicKey);
      global.Conekta.setLanguage(CONFIG.locale);
      _ready = true;
      log('inicializado');
      emit('ready', { ok: true });
      return true;
    } catch (e) {
      err('init falló', e);
      emit('error', { stage: 'init', error: e });
      return false;
    }
  }

  // ============================================================
  // TOKENIZACIÓN DE TARJETA
  // ============================================================
  function validateCard(card) {
    const errors = [];
    if (!card) { errors.push('card requerida'); return errors; }
    if (!card.number || !isLuhnValid(card.number)) errors.push('número inválido');
    if (!card.name || card.name.trim().length < 3) errors.push('nombre inválido');
    const brand = detectBrand(card.number);
    if (!isExpiryValid(card.exp_month, card.exp_year)) errors.push('expiración inválida');
    if (!isCvcValid(card.cvc, brand)) errors.push('CVC inválido');
    return errors;
  }

  function tokenizeCard(card) {
    return new Promise((resolve, reject) => {
      if (!_ready) return reject(new Error('ConektaAPI no inicializado'));
      const errs = validateCard(card);
      if (errs.length) return reject(new Error('validación: ' + errs.join('; ')));
      const tokenParams = {
        card: {
          number:    String(card.number).replace(/\s+/g, ''),
          name:      card.name,
          exp_year:  String(card.exp_year).slice(-2),
          exp_month: String(card.exp_month).padStart(2, '0'),
          cvc:       String(card.cvc),
        },
      };
      try {
        global.Conekta.Token.create(
          tokenParams,
          (token) => {
            log('token creado', token.id);
            const out = { id: token.id, brand: detectBrand(card.number),
                          last4: String(card.number).slice(-4) };
            emit('token', out);
            resolve(out);
          },
          (e) => {
            err('token error', e);
            emit('error', { stage: 'token', error: e });
            reject(new Error(e.message_to_purchaser || e.message || 'token error'));
          }
        );
      } catch (e) { reject(e); }
    });
  }

  // ============================================================
  // CHARGES (vía backend proxy — NUNCA private key en frontend)
  // ============================================================
  function buildOrder(opts) {
    const amount = validateAmount(opts.amount);
    if (!opts.customer || !opts.customer.email) throw new Error('customer.email requerido');
    return {
      currency: opts.currency || CONFIG.currency,
      customer_info: {
        name:  opts.customer.name  || 'Cliente Volvix',
        email: opts.customer.email,
        phone: opts.customer.phone || '',
      },
      line_items: opts.items && opts.items.length ? opts.items.map((it) => ({
        name: it.name, unit_price: validateAmount(it.unit_price),
        quantity: it.quantity || 1, sku: it.sku || '', description: it.description || '',
      })) : [{ name: opts.description || 'Venta Volvix', unit_price: amount, quantity: 1 }],
      metadata: Object.assign({ source: 'volvix-pos', ref: opts.reference || uuid() },
        opts.metadata || {}),
    };
  }

  function chargeWithToken(opts) {
    const order = buildOrder(opts);
    order.charges = [{
      payment_method: { type: 'default', token_id: opts.tokenId },
      amount: validateAmount(opts.amount),
    }];
    return fetchJSON(CONFIG.privateKeyEndpoint + '/orders', {
      body: order, idempotencyKey: opts.idempotencyKey,
    }).then((r) => { emit('charge', { method: 'card', result: r }); return r; })
      .catch((e) => { emit('error', { stage: 'charge_card', error: e }); throw e; });
  }

  function chargeOXXO(opts) {
    const order = buildOrder(opts);
    const expiresAt = Math.floor((opts.expiresAt || (Date.now() + 72 * 3600e3)) / 1000);
    order.charges = [{
      payment_method: { type: 'oxxo_cash', expires_at: expiresAt },
      amount: validateAmount(opts.amount),
    }];
    return fetchJSON(CONFIG.privateKeyEndpoint + '/orders', {
      body: order, idempotencyKey: opts.idempotencyKey,
    }).then((r) => {
      const ref = r.charges && r.charges.data && r.charges.data[0] &&
                  r.charges.data[0].payment_method &&
                  r.charges.data[0].payment_method.reference;
      const out = { order_id: r.id, oxxo_reference: ref,
                    expires_at: expiresAt * 1000, barcode_url:
                    r.charges && r.charges.data && r.charges.data[0] &&
                    r.charges.data[0].payment_method &&
                    r.charges.data[0].payment_method.barcode_url, raw: r };
      emit('charge', { method: 'oxxo', result: out });
      return out;
    }).catch((e) => { emit('error', { stage: 'charge_oxxo', error: e }); throw e; });
  }

  function chargeSPEI(opts) {
    const order = buildOrder(opts);
    const expiresAt = Math.floor((opts.expiresAt || (Date.now() + 72 * 3600e3)) / 1000);
    order.charges = [{
      payment_method: { type: 'spei', expires_at: expiresAt },
      amount: validateAmount(opts.amount),
    }];
    return fetchJSON(CONFIG.privateKeyEndpoint + '/orders', {
      body: order, idempotencyKey: opts.idempotencyKey,
    }).then((r) => {
      const pm = r.charges && r.charges.data && r.charges.data[0] &&
                 r.charges.data[0].payment_method || {};
      const out = { order_id: r.id, clabe: pm.clabe, bank: pm.bank,
                    expires_at: expiresAt * 1000, raw: r };
      emit('charge', { method: 'spei', result: out });
      return out;
    }).catch((e) => { emit('error', { stage: 'charge_spei', error: e }); throw e; });
  }

  // ============================================================
  // PAYMENT LINKS (Checkout)
  // ============================================================
  function createPaymentLink(opts) {
    const body = {
      name: opts.name || ('Cobro Volvix ' + new Date().toISOString().slice(0, 10)),
      type: opts.type || 'PaymentLink',
      recurrent: false,
      expires_at: Math.floor((opts.expiresAt || (Date.now() + 7 * 86400e3)) / 1000),
      allowed_payment_methods: opts.methods || ['cash', 'card', 'bank_transfer'],
      needs_shipping_contact: !!opts.needsShipping,
      monthly_installments_enabled: !!opts.installments,
      monthly_installments_options: opts.installmentsOpts || [3, 6, 9, 12],
      order_template: buildOrder(opts),
    };
    return fetchJSON(CONFIG.privateKeyEndpoint + '/checkouts', {
      body, idempotencyKey: opts.idempotencyKey,
    }).then((r) => {
      const out = { id: r.id, url: r.url || (r.checkout && r.checkout.url),
                    expires_at: body.expires_at * 1000, raw: r };
      emit('charge', { method: 'link', result: out });
      return out;
    }).catch((e) => { emit('error', { stage: 'payment_link', error: e }); throw e; });
  }

  // ============================================================
  // CONSULTA / WEBHOOK HELPERS
  // ============================================================
  function getOrder(orderId) {
    return fetchJSON(CONFIG.privateKeyEndpoint + '/orders/' + encodeURIComponent(orderId),
      { method: 'GET' });
  }

  function refund(orderId, amount, reason) {
    return fetchJSON(CONFIG.privateKeyEndpoint + '/orders/' +
      encodeURIComponent(orderId) + '/refund',
      { body: { amount: validateAmount(amount), reason: reason || 'requested_by_customer' } });
  }

  function verifyWebhookSignature(payload, signature, secret) {
    // Verificación real va en backend. Helper informativo.
    warn('verifyWebhookSignature debe ejecutarse en backend con HMAC-SHA256');
    return { payload, signature, secret, note: 'use backend' };
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  const ConektaAPI = {
    version: '1.0.0',
    init,
    isReady: () => _ready,
    getConfig: () => Object.assign({}, CONFIG, { publicKey: CONFIG.publicKey ? '***' : '' }),
    setDebug: (v) => { CONFIG.debug = !!v; },

    // validaciones
    validateCard, isLuhnValid, detectBrand, isExpiryValid, isCvcValid,

    // tokenización
    tokenizeCard,

    // cargos
    chargeWithToken,
    chargeOXXO,
    chargeSPEI,

    // links
    createPaymentLink,

    // consulta
    getOrder,
    refund,
    verifyWebhookSignature,

    // eventos
    on, off,

    // utils
    uuid,
  };

  global.ConektaAPI = ConektaAPI;
  log('volvix-conekta-wiring cargado');
})(typeof window !== 'undefined' ? window : globalThis);
