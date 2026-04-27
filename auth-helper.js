/**
 * AUTH-HELPER · Volvix JWT Bearer Token Manager
 *
 * Provides Volvix.auth.* utilities to manage JWT tokens for the hardened
 * backend (api/index.js). All endpoints except /api/login and /api/health
 * require Authorization: Bearer <token>.
 *
 * Usage:
 *   <script defer src="auth-helper.js"></script>
 *   // ...later, in any wiring:
 *   const r = await Volvix.auth.fetch('/api/products');
 */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'volvixAuthToken';
  const LOGIN_URL = '/login.html';

  // ── Token storage ──────────────────────────────────────────────
  function saveToken(token) {
    if (!token || typeof token !== 'string') return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.warn('[auth-helper] saveToken failed:', e);
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* noop */ }
  }

  // ── JWT decode (no signature verification - just exp claim) ────
  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const json = atob(b64 + pad);
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      try {
        return JSON.parse(atob(parts[1]));
      } catch (e2) {
        return null;
      }
    }
  }

  function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    const payload = decodeJwtPayload(token);
    if (!payload) return false;
    // exp is seconds since epoch; if missing assume valid
    if (typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp <= nowSec) return false;
    }
    return true;
  }

  // ── Authenticated fetch wrapper ────────────────────────────────
  async function authFetch(url, opts) {
    opts = opts || {};
    const token = getToken();

    // Merge headers preserving any caller-supplied ones
    const baseHeaders = {};
    if (opts.headers) {
      if (opts.headers instanceof Headers) {
        opts.headers.forEach((v, k) => { baseHeaders[k] = v; });
      } else if (Array.isArray(opts.headers)) {
        for (const [k, v] of opts.headers) baseHeaders[k] = v;
      } else {
        Object.assign(baseHeaders, opts.headers);
      }
    }

    if (token && !baseHeaders['Authorization'] && !baseHeaders['authorization']) {
      baseHeaders['Authorization'] = 'Bearer ' + token;
    }

    // Set JSON content-type when body is a plain string/object and not provided
    const hasCT = Object.keys(baseHeaders).some(k => k.toLowerCase() === 'content-type');
    if (!hasCT && opts.body && typeof opts.body === 'string') {
      baseHeaders['Content-Type'] = 'application/json';
    }

    const finalOpts = Object.assign({}, opts, { headers: baseHeaders });

    let response;
    try {
      response = await fetch(url, finalOpts);
    } catch (err) {
      throw err;
    }

    // 401 → clear token and redirect to login (skip if we are already there)
    if (response.status === 401) {
      clearToken();
      const here = window.location.pathname;
      if (here.indexOf('login.html') === -1) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(LOGIN_URL + '?expired=1&redirect=' + redirect);
      }
      // Still return the response so callers can handle it gracefully
      return response;
    }

    // Attach a parsed JSON helper (non-destructive: response.json() still works once)
    // We expose response.parsed() that caches.
    let _cached;
    response.parsed = async function () {
      if (_cached !== undefined) return _cached;
      const ct = response.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) {
        try {
          _cached = await response.clone().json();
        } catch (e) {
          _cached = null;
        }
      } else {
        _cached = null;
      }
      return _cached;
    };

    return response;
  }

  // ── Expose ─────────────────────────────────────────────────────
  global.Volvix = global.Volvix || {};
  global.Volvix.auth = {
    saveToken: saveToken,
    getToken: getToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    fetch: authFetch,
    _decodeJwtPayload: decodeJwtPayload, // exposed for debugging
  };
})(typeof window !== 'undefined' ? window : globalThis);
