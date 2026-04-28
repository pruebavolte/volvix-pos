// tests/fixtures/auth.js
// Authentication helpers for B36 regression suite
const { request: pwRequest } = require('@playwright/test');

const USERS = {
  admin:  { email: 'admin@volvix.test',  password: 'Volvix2026!', role: 'admin'  },
  owner:  { email: 'owner@volvix.test',  password: 'Volvix2026!', role: 'owner'  },
  cajero: { email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero' },
};

const LOGIN_PATHS = ['/api/auth/login', '/api/login', '/api/v1/auth/login'];
const TOKEN_KEYS = ['volvix_token', 'token', 'auth_token', 'access_token', 'jwt'];

/**
 * Login through the UI and wait for redirect away from login page.
 * Returns the JWT stored in localStorage / sessionStorage.
 */
async function loginAs(page, email, password) {
  await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
  const emailSel = 'input[name="email"], input#email, input[type="email"], [data-testid="login-email"]';
  const passSel  = 'input[name="password"], input#password, input[type="password"], [data-testid="login-password"]';
  const submit   = 'button[type="submit"], [data-testid="login-submit"], button:has-text("Iniciar")';

  await page.locator(emailSel).first().fill(email);
  await page.locator(passSel).first().fill(password);
  await page.locator(submit).first().click();

  // Wait either for redirect or for an error visible on screen
  await Promise.race([
    page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 15_000 }).catch(() => null),
    page.waitForTimeout(3000),
  ]);
  return await getJWT(page);
}

/**
 * Extract JWT from any well-known storage key.
 */
async function getJWT(page) {
  return await page.evaluate((keys) => {
    for (const k of keys) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) return v;
    }
    return null;
  }, TOKEN_KEYS);
}

/**
 * Login via the API directly (no UI). Returns the token string or null.
 * Tries known login endpoints until one returns 200.
 */
async function loginViaAPI(baseURL, email, password) {
  const ctx = await pwRequest.newContext({ baseURL });
  let token = null;
  for (const path of LOGIN_PATHS) {
    const res = await ctx.post(path, { data: { email, password }, failOnStatusCode: false });
    if (res.ok()) {
      const body = await res.json().catch(() => ({}));
      token = body.token || body.access_token || body.jwt || body?.data?.token || null;
      if (token) break;
    }
  }
  await ctx.dispose();
  return token;
}

/**
 * Generic API call helper. Returns { status, ok, body, headers }.
 */
async function apiCall(baseURL, token, method, path, body = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const m = String(method || 'get').toLowerCase();
  // Auto-add Idempotency-Key for POST/PATCH (B39: some endpoints require it).
  // Caller can override by passing 'Idempotency-Key' in extraHeaders.
  if ((m === 'post' || m === 'patch') && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = `b36test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: headers });
  const opts = { failOnStatusCode: false };
  if (body !== null && body !== undefined) opts.data = body;
  const res = await ctx[m](path, opts);
  const status = res.status();
  let parsed = null;
  try { parsed = await res.json(); } catch { try { parsed = await res.text(); } catch { parsed = null; } }
  await ctx.dispose();
  return { status, ok: res.ok(), body: parsed, headers: res.headers() };
}

/**
 * Extract list payload from any of the known response shapes:
 *   - bare array: [...]
 *   - {ok, data: [...], count}, {ok, items: [...]}, {ok, cuts: [...]}, etc.
 */
function extractList(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.items)) return body.items;
  for (const k of Object.keys(body)) {
    if (Array.isArray(body[k])) return body[k];
  }
  return [];
}

/**
 * Extract id from any known response shape:
 *   - body.id, body.<resource>.id, body.data.id
 *   - body.tenant_id / user_id / product_id / etc.
 */
function extractId(body, resourceName) {
  if (!body || typeof body !== 'object') return null;
  if (body.id) return body.id;
  if (resourceName && body[resourceName]?.id) return body[resourceName].id;
  if (body.data?.id) return body.data.id;
  const keys = ['tenant_id', 'user_id', 'product_id', 'customer_id', 'cut_id', 'sale_id'];
  for (const k of keys) if (body[k]) return body[k];
  for (const k of Object.keys(body)) {
    if (body[k] && typeof body[k] === 'object' && body[k].id) return body[k].id;
  }
  return null;
}

/**
 * Clear all known JWT keys from browser storage.
 */
async function clearAuthStorage(page) {
  await page.evaluate((keys) => {
    for (const k of keys) {
      try { localStorage.removeItem(k); } catch {}
      try { sessionStorage.removeItem(k); } catch {}
    }
  }, TOKEN_KEYS);
}

module.exports = {
  USERS,
  TOKEN_KEYS,
  LOGIN_PATHS,
  loginAs,
  getJWT,
  loginViaAPI,
  apiCall,
  extractList,
  extractId,
  clearAuthStorage,
};
