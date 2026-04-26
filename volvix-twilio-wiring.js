/**
 * volvix-twilio-wiring.js
 * Twilio integration: SMS, Voice calls, Verify OTP, WhatsApp via Twilio.
 * Exposes window.TwilioAPI
 *
 * NOTE: Twilio REST API requires Basic Auth (AccountSid:AuthToken).
 * In browsers, calling Twilio REST directly exposes credentials.
 * For production use a backend proxy. This wiring supports both modes:
 *   - direct  : calls api.twilio.com directly (DEV ONLY)
 *   - proxy   : calls a backend endpoint you control
 */
(function (global) {
  'use strict';

  const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';
  const VERIFY_BASE = 'https://verify.twilio.com/v2';

  const state = {
    mode: 'proxy',           // 'proxy' | 'direct'
    proxyBase: '/api/twilio',
    accountSid: null,
    authToken: null,
    fromNumber: null,        // default SMS/Voice From (E.164)
    whatsappFrom: null,      // e.g. 'whatsapp:+14155238886'
    verifyServiceSid: null,
    debug: false,
  };

  function log(...args) { if (state.debug) console.log('[TwilioAPI]', ...args); }
  function err(...args) { console.error('[TwilioAPI]', ...args); }

  function configure(opts) {
    Object.assign(state, opts || {});
    log('configured', { mode: state.mode, hasSid: !!state.accountSid });
    return getStatus();
  }

  function getStatus() {
    return {
      mode: state.mode,
      configured: state.mode === 'proxy'
        ? !!state.proxyBase
        : !!(state.accountSid && state.authToken),
      fromNumber: state.fromNumber,
      whatsappFrom: state.whatsappFrom,
      verifyServiceSid: state.verifyServiceSid,
    };
  }

  function basicAuthHeader() {
    if (!state.accountSid || !state.authToken) {
      throw new Error('Twilio credentials not set (accountSid/authToken)');
    }
    const token = btoa(`${state.accountSid}:${state.authToken}`);
    return `Basic ${token}`;
  }

  function toForm(obj) {
    const params = new URLSearchParams();
    Object.keys(obj).forEach(k => {
      if (obj[k] !== undefined && obj[k] !== null) params.append(k, obj[k]);
    });
    return params;
  }

  async function request(method, url, formObj) {
    const init = { method, headers: {} };
    if (state.mode === 'direct') {
      init.headers['Authorization'] = basicAuthHeader();
    }
    if (formObj) {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = toForm(formObj).toString();
    }
    log(method, url, formObj || '');
    const res = await fetch(url, init);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const e = new Error(data.message || `Twilio HTTP ${res.status}`);
      e.status = res.status;
      e.code = data.code;
      e.details = data;
      throw e;
    }
    return data;
  }

  function urlMessages() {
    return state.mode === 'direct'
      ? `${TWILIO_BASE}/Accounts/${state.accountSid}/Messages.json`
      : `${state.proxyBase}/messages`;
  }
  function urlCalls() {
    return state.mode === 'direct'
      ? `${TWILIO_BASE}/Accounts/${state.accountSid}/Calls.json`
      : `${state.proxyBase}/calls`;
  }
  function urlMessage(sid) {
    return state.mode === 'direct'
      ? `${TWILIO_BASE}/Accounts/${state.accountSid}/Messages/${sid}.json`
      : `${state.proxyBase}/messages/${sid}`;
  }
  function urlCall(sid) {
    return state.mode === 'direct'
      ? `${TWILIO_BASE}/Accounts/${state.accountSid}/Calls/${sid}.json`
      : `${state.proxyBase}/calls/${sid}`;
  }
  function urlVerifyStart() {
    return state.mode === 'direct'
      ? `${VERIFY_BASE}/Services/${state.verifyServiceSid}/Verifications`
      : `${state.proxyBase}/verify/start`;
  }
  function urlVerifyCheck() {
    return state.mode === 'direct'
      ? `${VERIFY_BASE}/Services/${state.verifyServiceSid}/VerificationCheck`
      : `${state.proxyBase}/verify/check`;
  }

  // ---- SMS ----
  async function sendSMS({ to, body, from, mediaUrl, statusCallback }) {
    if (!to) throw new Error('sendSMS: "to" required');
    if (!body && !mediaUrl) throw new Error('sendSMS: "body" or "mediaUrl" required');
    const payload = {
      To: to,
      From: from || state.fromNumber,
      Body: body,
    };
    if (mediaUrl) payload.MediaUrl = mediaUrl;
    if (statusCallback) payload.StatusCallback = statusCallback;
    return request('POST', urlMessages(), payload);
  }

  async function getSMS(sid) {
    if (!sid) throw new Error('getSMS: sid required');
    return request('GET', urlMessage(sid));
  }

  async function listSMS({ to, from, limit = 20 } = {}) {
    const qs = new URLSearchParams();
    if (to) qs.set('To', to);
    if (from) qs.set('From', from);
    qs.set('PageSize', String(limit));
    const base = urlMessages();
    return request('GET', `${base}?${qs.toString()}`);
  }

  // ---- Voice ----
  async function makeCall({ to, from, twiml, url, statusCallback, record }) {
    if (!to) throw new Error('makeCall: "to" required');
    if (!twiml && !url) throw new Error('makeCall: "twiml" or "url" required');
    const payload = {
      To: to,
      From: from || state.fromNumber,
    };
    if (twiml) payload.Twiml = twiml;
    if (url) payload.Url = url;
    if (statusCallback) payload.StatusCallback = statusCallback;
    if (record) payload.Record = 'true';
    return request('POST', urlCalls(), payload);
  }

  async function getCall(sid) {
    if (!sid) throw new Error('getCall: sid required');
    return request('GET', urlCall(sid));
  }

  async function endCall(sid) {
    if (!sid) throw new Error('endCall: sid required');
    return request('POST', urlCall(sid), { Status: 'completed' });
  }

  // Quick TwiML helper to <Say> a message
  function buildSayTwiml(text, voice = 'alice', language = 'es-MX') {
    const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<Response><Say voice="${voice}" language="${language}">${safe}</Say></Response>`;
  }

  async function sayCall({ to, text, from, voice, language }) {
    return makeCall({
      to, from,
      twiml: buildSayTwiml(text, voice, language),
    });
  }

  // ---- Verify (OTP) ----
  async function startVerify({ to, channel = 'sms', locale }) {
    if (!to) throw new Error('startVerify: "to" required');
    const payload = { To: to, Channel: channel };
    if (locale) payload.Locale = locale;
    return request('POST', urlVerifyStart(), payload);
  }

  async function checkVerify({ to, code }) {
    if (!to || !code) throw new Error('checkVerify: "to" and "code" required');
    const result = await request('POST', urlVerifyCheck(), { To: to, Code: code });
    return { ...result, approved: result.status === 'approved' || result.valid === true };
  }

  // ---- WhatsApp via Twilio ----
  function ensureWhats(addr) {
    if (!addr) return addr;
    return addr.startsWith('whatsapp:') ? addr : `whatsapp:${addr}`;
  }

  async function sendWhatsApp({ to, body, from, mediaUrl }) {
    if (!to) throw new Error('sendWhatsApp: "to" required');
    if (!body && !mediaUrl) throw new Error('sendWhatsApp: "body" or "mediaUrl" required');
    const payload = {
      To: ensureWhats(to),
      From: ensureWhats(from || state.whatsappFrom),
      Body: body,
    };
    if (mediaUrl) payload.MediaUrl = mediaUrl;
    return request('POST', urlMessages(), payload);
  }

  async function sendWhatsAppTemplate({ to, contentSid, contentVariables, from }) {
    if (!to || !contentSid) throw new Error('sendWhatsAppTemplate: "to" and "contentSid" required');
    const payload = {
      To: ensureWhats(to),
      From: ensureWhats(from || state.whatsappFrom),
      ContentSid: contentSid,
    };
    if (contentVariables) {
      payload.ContentVariables = typeof contentVariables === 'string'
        ? contentVariables
        : JSON.stringify(contentVariables);
    }
    return request('POST', urlMessages(), payload);
  }

  // ---- Utils ----
  function isValidE164(num) {
    return typeof num === 'string' && /^\+[1-9]\d{6,14}$/.test(num);
  }

  async function ping() {
    try {
      await listSMS({ limit: 1 });
      return { ok: true };
    } catch (e) {
      err('ping failed', e.message);
      return { ok: false, error: e.message };
    }
  }

  const TwilioAPI = {
    configure,
    getStatus,
    // sms
    sendSMS, getSMS, listSMS,
    // voice
    makeCall, getCall, endCall, sayCall, buildSayTwiml,
    // verify
    startVerify, checkVerify,
    // whatsapp
    sendWhatsApp, sendWhatsAppTemplate,
    // utils
    isValidE164, ping,
    _state: state,
  };

  global.TwilioAPI = TwilioAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = TwilioAPI;
  log('window.TwilioAPI ready');
})(typeof window !== 'undefined' ? window : globalThis);
