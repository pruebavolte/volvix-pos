/**
 * volvix-payments-wallets.js
 * Volvix POS — Apple Pay + Google Pay (Web Payment Request API)
 * Routes through backend /api/payments/stripe/intent (Stripe handles wallet routing).
 *
 * Public API:
 *   Volvix.wallets.isApplePayAvailable()
 *   Volvix.wallets.isGooglePayAvailable()
 *   Volvix.wallets.payWithApple(amount, currency, sale_id)
 *   Volvix.wallets.payWithGoogle(amount, currency, sale_id)
 */
(function (global) {
  'use strict';

  const API_BASE = (global.VOLVIX_API_BASE || '');
  const ENDPOINT_INTENT = API_BASE + '/api/payments/stripe/intent';
  const ENDPOINT_WALLETS_CFG = API_BASE + '/api/payments/wallets/config';
  const ENDPOINT_VALIDATE = API_BASE + '/api/payments/wallets/validate-merchant';

  // ---------- Helpers ----------
  function _token() {
    try { return localStorage.getItem('volvix_jwt') || localStorage.getItem('jwt') || ''; }
    catch (e) { return ''; }
  }

  function _authHeaders(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    const t = _token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function _fetchJSON(url, opts) {
    const r = await fetch(url, opts || {});
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      const msg = (body && body.error) || ('HTTP ' + r.status);
      const err = new Error(msg); err.status = r.status; err.body = body;
      throw err;
    }
    return body;
  }

  async function _getConfig() {
    try { return await _fetchJSON(ENDPOINT_WALLETS_CFG, { headers: _authHeaders() }); }
    catch (e) {
      console.warn('[wallets] config fallback', e.message);
      return { apple_merchant_id: null, google_merchant_id: null, supported_networks: ['visa', 'mastercard', 'amex'] };
    }
  }

  async function _createIntent(amount, currency, sale_id) {
    return _fetchJSON(ENDPOINT_INTENT, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ sale_id: sale_id, amount: amount, currency: (currency || 'mxn').toLowerCase() }),
    });
  }

  // ---------- Capability checks ----------
  function isApplePayAvailable() {
    try {
      return typeof global.ApplePaySession !== 'undefined'
        && typeof ApplePaySession.canMakePayments === 'function'
        && ApplePaySession.canMakePayments() === true;
    } catch (e) { return false; }
  }

  function isGooglePayAvailable() {
    try {
      const hasPR = typeof global.PaymentRequest === 'function';
      const hasGoogle = !!(global.google && global.google.payments && global.google.payments.api);
      return hasPR || hasGoogle;
    } catch (e) { return false; }
  }

  // ---------- Apple Pay ----------
  async function payWithApple(amount, currency, sale_id) {
    if (!isApplePayAvailable()) throw new Error('Apple Pay no disponible en este dispositivo');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount inválido');

    const cfg = await _getConfig();
    const cur = (currency || 'MXN').toUpperCase();
    const total = (amount / 100).toFixed(2);

    const request = {
      countryCode: 'MX',
      currencyCode: cur,
      supportedNetworks: (cfg.supported_networks || ['visa', 'mastercard', 'amex']),
      merchantCapabilities: ['supports3DS'],
      total: { label: 'Volvix POS', amount: total, type: 'final' },
    };

    return new Promise(function (resolve, reject) {
      let session;
      try { session = new ApplePaySession(3, request); }
      catch (e) { return reject(new Error('ApplePaySession no soportada: ' + e.message)); }

      session.onvalidatemerchant = async function (event) {
        try {
          const r = await _fetchJSON(ENDPOINT_VALIDATE, {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ validation_url: event.validationURL, merchant_id: cfg.apple_merchant_id }),
          });
          if (r && r.merchant_session) session.completeMerchantValidation(r.merchant_session);
          else { session.abort(); reject(new Error('merchant validation sin session')); }
        } catch (e) { session.abort(); reject(e); }
      };

      session.onpaymentauthorized = async function (event) {
        try {
          const intent = await _createIntent(amount, cur, sale_id);
          // Token from Apple Pay = event.payment.token
          // Stripe SDK normally confirms; here we record + return client_secret + token
          const result = {
            ok: true,
            provider: 'apple',
            payment_intent_id: intent.payment_intent_id,
            client_secret: intent.client_secret,
            apple_token: event.payment.token,
            sale_id: sale_id,
            amount_cents: amount,
            currency: cur,
          };
          session.completePayment({ status: ApplePaySession.STATUS_SUCCESS });
          resolve(result);
        } catch (e) {
          session.completePayment({ status: ApplePaySession.STATUS_FAILURE });
          reject(e);
        }
      };

      session.oncancel = function () { reject(new Error('apple_pay_cancelled')); };
      session.begin();
    });
  }

  // ---------- Google Pay (via PaymentRequest API) ----------
  async function payWithGoogle(amount, currency, sale_id) {
    if (!isGooglePayAvailable()) throw new Error('Google Pay no disponible');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount inválido');

    const cfg = await _getConfig();
    const cur = (currency || 'MXN').toUpperCase();
    const total = (amount / 100).toFixed(2);
    const networks = (cfg.supported_networks || ['visa', 'mastercard', 'amex'])
      .map(function (s) { return s.toUpperCase(); });

    const methodData = [{
      supportedMethods: 'https://google.com/pay',
      data: {
        environment: 'TEST',
        apiVersion: 2,
        apiVersionMinor: 0,
        merchantInfo: { merchantId: cfg.google_merchant_id || '01234567890123456789', merchantName: 'Volvix POS' },
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: networks,
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: { gateway: 'stripe', 'stripe:version': '2020-08-27', 'stripe:publishableKey': (cfg.stripe_publishable_key || '') },
          },
        }],
        transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: total, currencyCode: cur, countryCode: 'MX' },
      },
    }];

    const details = {
      total: { label: 'Volvix POS', amount: { currency: cur, value: total } },
    };

    let request;
    try { request = new PaymentRequest(methodData, details); }
    catch (e) { throw new Error('PaymentRequest no soportada: ' + e.message); }

    let canPay = true;
    try { canPay = await request.canMakePayment(); } catch (_) {}
    if (!canPay) throw new Error('Google Pay no puede hacer pagos en este contexto');

    const response = await request.show();
    try {
      const intent = await _createIntent(amount, cur, sale_id);
      const result = {
        ok: true,
        provider: 'google',
        payment_intent_id: intent.payment_intent_id,
        client_secret: intent.client_secret,
        google_token: response.details,
        sale_id: sale_id,
        amount_cents: amount,
        currency: cur,
      };
      await response.complete('success');
      return result;
    } catch (e) {
      try { await response.complete('fail'); } catch (_) {}
      throw e;
    }
  }

  // ---------- Expose ----------
  const V = global.Volvix = global.Volvix || {};
  V.wallets = {
    isApplePayAvailable: isApplePayAvailable,
    isGooglePayAvailable: isGooglePayAvailable,
    payWithApple: payWithApple,
    payWithGoogle: payWithGoogle,
    _config: _getConfig,
  };

})(typeof window !== 'undefined' ? window : globalThis);
