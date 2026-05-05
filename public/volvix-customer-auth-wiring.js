/**
 * Volvix · Customer Auth Wiring (R14)
 * Magic-link OTP de 6 dígitos por email.
 *
 * Uso:
 *   await Volvix.customerAuth.requestOtp('cliente@email.com');
 *   const { token } = await Volvix.customerAuth.verifyOtp('cliente@email.com', '123456');
 */
(function (global) {
  'use strict';

  const API_BASE = (global.VOLVIX_API_BASE || '').replace(/\/$/, '');

  async function postJSON(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function isEmail(s) {
    return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  const customerAuth = {
    /**
     * Solicita un OTP. POST /api/customer/otp/request
     * Devuelve { ok:true, expires_in: 600 } (no expone el código).
     */
    async requestOtp(email) {
      if (!isEmail(email)) throw new Error('Email inválido');
      return postJSON('/api/customer/otp/request', { email: email.toLowerCase().trim() });
    },

    /**
     * Verifica el OTP. POST /api/customer/otp/verify
     * Devuelve { ok:true, token: '<jwt>', customer: {...} }.
     */
    async verifyOtp(email, otp) {
      if (!isEmail(email)) throw new Error('Email inválido');
      const code = String(otp || '').replace(/\D/g, '');
      if (code.length !== 6) throw new Error('Código inválido (6 dígitos)');
      return postJSON('/api/customer/otp/verify', { email: email.toLowerCase().trim(), otp: code });
    },
  };

  global.Volvix = global.Volvix || {};
  global.Volvix.customerAuth = customerAuth;
})(typeof window !== 'undefined' ? window : globalThis);
