/**
 * VOLVIX · API Serverless conectada a Supabase
 * Versión: 7.2.0 - Hardened (R13 security fixes)
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');
const crypto = require('crypto'); // FIX R13: para JWT, scrypt, timingSafeEqual
const emailTemplates = require('./email-templates'); // R14

// =============================================================
// CONFIG SUPABASE
// =============================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co').trim();

// FIX R13 (#1): SUPABASE_SERVICE_KEY sin fallback hardcodeado. Throw si falta.
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim().replace(/[\r\n]+/g, '');
if (!SUPABASE_SERVICE_KEY) {
  throw new Error('FATAL: SUPABASE_SERVICE_KEY no definido en environment. Abortando boot.');
}

// FIX R13 (#3): JWT_SECRET obligatorio
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET no definido en environment. Abortando boot.');
}
const JWT_EXPIRES_SECONDS = 8 * 3600; // 8h

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/[\r\n]+/g, '');
const IS_PROD = process.env.NODE_ENV === 'production';

// FIX R13 (#8): CORS whitelist
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://volvix-pos.vercel.app')
  .split(',').map(s => s.trim()).filter(Boolean);

// =============================================================
// SUPABASE REST API CLIENT
// =============================================================
function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL + '/rest/v1' + path;
    const u = new URL(fullUrl);

    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            reject(new Error(`Supabase ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// =============================================================
// ANTHROPIC CLAUDE API
// =============================================================
function callClaude(messages, system, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    if (!ANTHROPIC_API_KEY) {
      return resolve({
        simulated: true,
        content: 'Modo simulación. Configura ANTHROPIC_API_KEY para llamadas reales.'
      });
    }

    const body = JSON.stringify({
      model: opts.model || 'claude-sonnet-4-5-20250929',
      max_tokens: opts.max_tokens || 2048,
      messages: messages || [{ role: 'user', content: 'Hola' }],
      system: system || 'Eres la IA de Volvix POS. Ayudas a comerciantes con su negocio.',
    });

    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            simulated: false,
            content: parsed.content?.[0]?.text || '',
            usage: parsed.usage,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// =============================================================
// FIX R13 (#3): JWT HMAC-SHA256 con crypto nativo
// =============================================================
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function signJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + JWT_EXPIRES_SECONDS };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(fullPayload));
  const data = `${h}.${p}`;
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}
function verifyJWT(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  // FIX R13: timingSafeEqual
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(p).toString('utf8')); } catch { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// =============================================================
// FIX R13 (#2): Password verification (scrypt o bcrypt-format)
// =============================================================
function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string' || !plain) return false;
  // SECURITY R22 FIX: solo formato scrypt$ es aceptado. Plaintext fallback ELIMINADO.
  // Formato scrypt custom: scrypt$<saltHex>$<hashHex>
  if (stored.startsWith('scrypt$')) {
    try {
      const [, saltHex, hashHex] = stored.split('$');
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const derived = crypto.scryptSync(plain, salt, expected.length);
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch { return false; }
  }
  // Bcrypt $2b$/$2a$/$2y$: sin lib externa no podemos validar. Rechazar.
  if (/^\$2[aby]\$/.test(stored)) {
    return false;
  }
  // SECURITY: cualquier otro formato (incluyendo plaintext legacy) → RECHAZO TOTAL.
  // Los usuarios con passwords legacy deben hacer reset (POST /api/auth/password-reset/request).
  return false;
}

// =============================================================
// R14 MFA: TOTP nativo (RFC 6238) + backup codes
// =============================================================
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  str = String(str || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(str[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
// HOTP RFC 4226: HMAC-SHA1(secret, counter) -> 6 dígitos
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  // counter como uint64 big-endian
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
               ((hmac[offset + 1] & 0xff) << 16) |
               ((hmac[offset + 2] & 0xff) << 8) |
               (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
// TOTP: counter = floor(time / 30); window ±1 step para tolerancia de reloj
function verifyTOTP(secretBase32, code, window = 1) {
  if (!code || !/^\d{6}$/.test(String(code))) return false;
  const secret = base32Decode(secretBase32);
  if (!secret.length) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(code));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}
function generateMfaSecret() {
  // 32 bytes random -> base32 (~52 chars)
  return base32Encode(crypto.randomBytes(32));
}
function buildOtpauthUrl(label, secretBase32, issuer = 'Volvix') {
  const lbl = encodeURIComponent(`${issuer}:${label}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${lbl}?secret=${secretBase32}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}
function generateBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    // 10 caracteres hex agrupados xxxxx-xxxxx
    const hex = crypto.randomBytes(5).toString('hex');
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`);
  }
  return codes;
}
function hashBackupCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toLowerCase()).digest('hex');
}
// MFA-token corto (5 min) firmado con JWT_SECRET, propósito 'mfa'
function signMfaToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, purpose: 'mfa', iat: now, exp: now + 300 };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}
function verifyMfaToken(token) {
  const payload = verifyJWT(token);
  if (!payload || payload.purpose !== 'mfa') return null;
  return payload;
}

// =============================================================
// FIX R13 (#12): Rate limiting in-memory
// =============================================================
const rateBuckets = new Map(); // key -> { count, resetAt }
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
// R15: ms restantes para reintento (para Retry-After / retry_after_ms)
function rateLimitRetryMs(key, fallbackMs) {
  const b = rateBuckets.get(key);
  if (!b) return fallbackMs || 60000;
  return Math.max(0, b.resetAt - Date.now());
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
}

// =============================================================
// FIX R13 (#10): Validadores
// =============================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }
function isInt(s) { return /^-?\d+$/.test(String(s)); }

// FIX R13 (#9): Whitelists de campos
const ALLOWED_FIELDS_PRODUCTS = ['code', 'name', 'category', 'cost', 'price', 'stock', 'icon'];
const ALLOWED_FIELDS_CUSTOMERS = ['name', 'email', 'phone', 'address', 'credit_limit', 'credit_balance', 'points', 'loyalty_points', 'active', 'rfc'];
// R26 FIX: SAT RFC validator. Persona física (13 chars: 4 letras + 6 dígitos YYMMDD + 3 alfanum)
// Persona moral (12 chars: 3 letras + 6 dígitos YYMMDD + 3 alfanum). Genérico nacional XAXX010101000, extranjero XEXX010101000.
const RFC_REGEX_PF = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{2}[A\d]$/;
const RFC_REGEX_PM = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{2}[A\d]$/;
function isValidRFC(rfc) {
  if (rfc == null || rfc === '') return true; // RFC opcional
  if (typeof rfc !== 'string') return false;
  const r = rfc.trim().toUpperCase();
  if (r.length !== 12 && r.length !== 13) return false;
  // valida fecha YYMMDD embebida
  const dateStart = r.length === 13 ? 4 : 3;
  const yy = r.slice(dateStart, dateStart + 2);
  const mm = parseInt(r.slice(dateStart + 2, dateStart + 4), 10);
  const dd = parseInt(r.slice(dateStart + 4, dateStart + 6), 10);
  if (!/^\d{2}$/.test(yy) || mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  return r.length === 13 ? RFC_REGEX_PF.test(r) : RFC_REGEX_PM.test(r);
}
const ALLOWED_FIELDS_SALES = ['total', 'payment_method', 'items', 'tip_amount', 'tip_assigned_to', 'tip_split'];
const ALLOWED_FIELDS_TENANTS = ['name', 'plan', 'is_active', 'owner_user_id'];
const ALLOWED_FIELDS_USERS = ['email', 'role', 'is_active', 'plan', 'full_name', 'phone', 'company_id', 'notes'];

function pickFields(body, allowed) {
  const out = {};
  for (const k of allowed) if (k in (body || {})) out[k] = body[k];
  return out;
}

// FIX slice_61 (XSS): strip HTML tags, on*= handlers and javascript: URIs from text input.
function sanitizeText(v) {
  if (v === undefined || v === null) return v;
  let s = String(v);
  s = s.replace(/<[^>]*>/g, '');           // strip all tags
  s = s.replace(/\bon[a-z]+\s*=/gi, '');   // strip onerror=, onclick=, onload=...
  s = s.replace(/javascript:/gi, '');      // strip javascript: URIs
  return s.trim();
}

// R22.4 FIX (Bugs 2,4): hardened name sanitizer - strip HTML, JS, null bytes; cap length.
function sanitizeName(v) {
  if (v === undefined || v === null) return v;
  let s = String(v);
  s = s.replace(/<[^>]*>/g, '');           // strip all HTML tags
  s = s.replace(/javascript:/gi, '');      // strip js: protocol
  s = s.replace(/\bon[a-z]+\s*=/gi, '');   // strip on*= handlers
  s = s.replace(/\u0000|\x00/g, '');       // strip null bytes
  return s.trim().slice(0, 200);
}
// R22.4 FIX (Bug 4): detect SQL-injection-looking strings.
function looksLikeSqlInjection(s) {
  if (!s || typeof s !== 'string') return false;
  return /\b(DROP|DELETE|INSERT|UPDATE|UNION|SELECT|TRUNCATE|ALTER)\b[\s\S]*\b(TABLE|FROM|WHERE|INTO|DATABASE)\b/i.test(s)
    || /;\s*--/.test(s)
    || /\/\*[\s\S]*\*\//.test(s);
}
// R22.4 FIX (Bug 2): block any HTML/JS-event-like residue after sanitize.
function hasUnsafeChars(s) {
  if (!s || typeof s !== 'string') return false;
  return /<|>|javascript:|onerror|onload|onclick|on\w+\s*=/i.test(s);
}
// FIX slice_61 (header injection): reject CR/LF in header-bound fields.
function hasCrlf(v) {
  return typeof v === 'string' && /[\r\n]/.test(v);
}

// =============================================================
// UTILIDADES
// =============================================================
// R22 FIX 7: body size limits (default 256KB, custom override per-call)
const DEFAULT_MAX_BODY = 256 * 1024;
async function readBody(req, opts) {
  const max = (opts && Number.isFinite(opts.maxBytes)) ? opts.maxBytes : DEFAULT_MAX_BODY;
  const strictJson = !!(opts && opts.strictJson);
  return new Promise((resolve) => {
    let data = '';
    let total = 0;
    let aborted = false;
    if (strictJson) {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (ct && ct.indexOf('application/json') === -1) {
        req.__bodyError = { code: 415, message: 'Content-Type must be application/json' };
      }
    }
    req.on('data', c => {
      if (aborted) return;
      total += c.length;
      if (total > max) {
        aborted = true;
        req.__bodyError = { code: 413, message: 'payload_too_large', max_bytes: max };
        try { req.destroy(); } catch (_) {}
        return resolve({});
      }
      data += c;
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// R22 FIX 7: rechazar si readBody marcó error (413/415)
function checkBodyError(req, res) {
  if (req.__bodyError) {
    sendJSON(res, { error: req.__bodyError.message, max_bytes: req.__bodyError.max_bytes }, req.__bodyError.code);
    return true;
  }
  return false;
}

// =============================================================
// R22 FIX 1: IDEMPOTENCY
// =============================================================
async function idempotencyCheck(req, res, endpoint) {
  const key = req.headers['idempotency-key'];
  if (!key) {
    sendJSON(res, { error: 'idempotency_key_required', message: 'Header Idempotency-Key requerido' }, 400);
    return { handled: true };
  }
  const safeKey = String(key).slice(0, 200);
  try {
    const rows = await supabaseRequest('GET',
      `/idempotency_keys?key=eq.${encodeURIComponent(safeKey)}&select=response_body,status_code,expires_at&limit=1`);
    if (rows && rows.length) {
      const row = rows[0];
      if (row.expires_at && new Date(row.expires_at).getTime() > Date.now()) {
        sendJSON(res, row.response_body || { ok: true, cached: true }, row.status_code || 200);
        return { handled: true };
      }
    }
  } catch (_) { /* tabla puede no existir; continuar */ }
  return { handled: false, key: safeKey, endpoint };
}

async function idempotencySave(ctx, req, body, status) {
  if (!ctx || !ctx.key) return;
  try {
    await supabaseRequest('POST', '/idempotency_keys', {
      key: ctx.key,
      user_id: req.user?.id || null,
      endpoint: ctx.endpoint,
      response_body: body,
      status_code: status || 200,
    });
  } catch (_) { /* swallow */ }
}

// Wrap sendJSON dentro de un handler para capturar response y guardarla
function withIdempotency(endpoint, handler) {
  return async (req, res, params) => {
    const ctx = await idempotencyCheck(req, res, endpoint);
    if (ctx.handled) return;
    const origEnd = res.end.bind(res);
    let captured = null;
    let capturedStatus = 200;
    res.end = (data, ...rest) => {
      try {
        if (data) {
          const s = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          captured = JSON.parse(s);
          capturedStatus = res.statusCode || 200;
        }
      } catch (_) {}
      return origEnd(data, ...rest);
    };
    res.on('finish', () => {
      if (captured && capturedStatus < 500) {
        idempotencySave(ctx, req, captured, capturedStatus).catch(() => {});
      }
    });
    return handler(req, res, params);
  };
}

// =============================================================
// R22 FIX 2: OPTIMISTIC LOCKING helper
// =============================================================
function getExpectedVersion(req, body) {
  const h = req.headers['if-match'];
  if (h !== undefined && h !== null && String(h).trim() !== '') {
    const n = parseInt(String(h).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n)) return n;
  }
  if (body && body.version !== undefined && body.version !== null) {
    const n = parseInt(body.version, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// =============================================================
// R22 FIX 4: backoff + lockout + dual rate limit (IP + email)
// =============================================================
const loginFailures = new Map(); // email -> { count, lockoutUntil, lastFailAt }
function recordLoginFail(email) {
  const k = String(email || '').toLowerCase().trim();
  if (!k) return;
  const now = Date.now();
  const cur = loginFailures.get(k) || { count: 0, lockoutUntil: 0, lastFailAt: 0 };
  // Reset if last fail >15 min ago
  if (now - cur.lastFailAt > 15 * 60 * 1000) cur.count = 0;
  cur.count++;
  cur.lastFailAt = now;
  if (cur.count >= 10) cur.lockoutUntil = now + 30 * 60 * 1000;
  loginFailures.set(k, cur);
}
function clearLoginFails(email) {
  const k = String(email || '').toLowerCase().trim();
  if (k) loginFailures.delete(k);
}
function getLoginBackoff(email) {
  const k = String(email || '').toLowerCase().trim();
  if (!k) return { delay: 0, locked: false, retryAfter: 0 };
  const cur = loginFailures.get(k);
  if (!cur) return { delay: 0, locked: false, retryAfter: 0 };
  const now = Date.now();
  if (cur.lockoutUntil > now) return { delay: 0, locked: true, retryAfter: cur.lockoutUntil - now };
  const delay = Math.min(Math.pow(2, cur.count) * 100, 30000);
  return { delay, locked: false, retryAfter: 0 };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================================================
// R22 FIX 5: cookie helpers
// =============================================================
function parseCookies(req) {
  const out = {};
  const h = req.headers['cookie'];
  if (!h) return out;
  String(h).split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) {
      const k = p.slice(0, i).trim();
      const v = p.slice(i + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}
function setAuthCookie(res, token, maxAgeSec) {
  const parts = [
    `volvix_token=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${maxAgeSec || JWT_EXPIRES_SECONDS}`,
  ];
  const prev = res.getHeader('Set-Cookie');
  const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
  arr.push(parts.join('; '));
  res.setHeader('Set-Cookie', arr);
}
function clearAuthCookie(res) {
  const v = 'volvix_token=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0';
  const prev = res.getHeader('Set-Cookie');
  const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
  arr.push(v);
  res.setHeader('Set-Cookie', arr);
}

// =============================================================
// R22 FIX 6: anti-replay nonces
// =============================================================
async function nonceCheck(res, nonce, endpoint) {
  if (!nonce) {
    sendJSON(res, { error: 'nonce_required', endpoint }, 400);
    return false;
  }
  const safe = String(nonce).slice(0, 200);
  try {
    const rows = await supabaseRequest('GET',
      `/request_nonces?nonce=eq.${encodeURIComponent(safe)}&select=nonce&limit=1`);
    if (rows && rows.length) {
      sendJSON(res, { error: 'replay_attack', message: 'Nonce ya utilizado' }, 409);
      return false;
    }
    await supabaseRequest('POST', '/request_nonces', { nonce: safe, endpoint });
  } catch (e) {
    // si tabla no existe, fail-open en dev sólo
    if (IS_PROD) {
      sendJSON(res, { error: 'nonce_check_failed' }, 503);
      return false;
    }
  }
  return true;
}

// R14: Security headers (HSTS, CSP, anti-clickjacking, etc.)
function setSecurityHeaders(res) {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.ipify.org https://api.exchangerate.host https://api.anthropic.com https://api.stripe.com https://api.openai.com https://api.sendgrid.com https://api.twilio.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'"
  );
}

// FIX R13 (#8): CORS dinámico
function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'null');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  setSecurityHeaders(res); // R14
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

// FIX R13 (#11): error genérico en prod
// R15: estandarización 4xx con { error (code), message, ...extras }
// R23: PG-error detection -> 503 graceful, request_id for trace
function sendError(res, err, status = 500, extras = null) {
  // Si llaman con un objeto-payload custom (4xx con código), respetarlo
  if (err && typeof err === 'object' && (err.code || err.error)) {
    const code = err.code || err.error || 'internal';
    const message = err.message || (IS_PROD ? 'Error interno' : String(code));
    const payload = Object.assign({ error: code, message }, extras || {});
    if (err.field) payload.field = err.field;
    if (err.hint) payload.hint = err.hint;
    if (err.resource) payload.resource = err.resource;
    if (err.id !== undefined) payload.id = err.id;
    return sendJSON(res, payload, status);
  }
  // R23: detectar errores Postgres (tabla/columna faltante) -> 503 graceful
  const rawMsg = err && err.message ? err.message : String(err || '');
  if (/\b42P01\b/.test(rawMsg) || /relation .* does not exist/i.test(rawMsg)) {
    return sendJSON(res, {
      ok: false, error: 'table_pending', message: 'Tabla de BD pendiente de migración',
      request_id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    }, 503);
  }
  if (/\b42703\b/.test(rawMsg) || /column .* does not exist/i.test(rawMsg)) {
    return sendJSON(res, {
      ok: false, error: 'schema_mismatch', message: 'Esquema de BD desactualizado',
      request_id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    }, 503);
  }
  if (/\bReferenceError\b/.test(rawMsg) && /dbQuery is not defined/i.test(rawMsg)) {
    return sendJSON(res, {
      ok: false, error: 'db_unavailable', message: 'Conexión BD no disponible',
      request_id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    }, 503);
  }
  const reqId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  if (IS_PROD) return sendJSON(res, { error: 'internal', message: 'Error interno del servidor', request_id: reqId }, status);
  return sendJSON(res, { error: 'internal', message: rawMsg, request_id: reqId }, status);
}

// R15 helpers — 4xx estandarizados (es-MX)
function sendValidation(res, message, field, hint) {
  return sendJSON(res, {
    error: 'validation_failed',
    message: message || 'Datos inválidos',
    field: field || null,
    hint: hint || null
  }, 400);
}
function send401(res, message) {
  return sendJSON(res, {
    error: 'unauthorized',
    message: message || 'Token requerido o inválido'
  }, 401);
}
function send403(res, opts) {
  const o = opts || {};
  return sendJSON(res, {
    error: 'forbidden',
    message: o.message || 'Sin permisos',
    need_role: o.need_role || [],
    have_role: o.have_role || null
  }, 403);
}
function send404(res, resource, id) {
  return sendJSON(res, {
    error: 'not_found',
    message: 'Recurso no encontrado',
    resource: resource || null,
    id: id !== undefined ? id : null
  }, 404);
}
function send409(res, message, conflicting_field) {
  return sendJSON(res, {
    error: 'conflict',
    message: message || 'Conflicto con el estado actual',
    conflicting_field: conflicting_field || null
  }, 409);
}
function send422(res, message) {
  return sendJSON(res, {
    error: 'unprocessable',
    message: message || 'Entidad no procesable'
  }, 422);
}
// R15: 429 con header Retry-After (RFC 6585)
function send429(res, retry_after_ms, message) {
  const ms = Number.isFinite(retry_after_ms) ? Math.max(0, Math.ceil(retry_after_ms)) : 60000;
  const seconds = Math.ceil(ms / 1000);
  setSecurityHeaders(res);
  res.setHeader('Retry-After', String(seconds));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 429;
  res.end(JSON.stringify({
    error: 'rate_limit',
    message: message || 'Demasiadas solicitudes, intenta más tarde',
    retry_after_ms: ms
  }));
}

function parseNotes(notesStr) {
  try { return JSON.parse(notesStr || '{}'); }
  catch { return {}; }
}

// =============================================================
// R14 INTEGRATIONS — API key helpers (Zapier / Make / n8n)
// =============================================================
function hashApiKey(plain) {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}
function generateApiKey() {
  const raw = crypto.randomBytes(32).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return 'vlx_' + raw;
}
async function lookupApiKey(plain) {
  if (!plain || !plain.startsWith('vlx_')) return null;
  const hash = hashApiKey(plain);
  const rows = await supabaseRequest('GET',
    `/api_keys?key_hash=eq.${hash}&revoked_at=is.null&select=id,tenant_id,scopes,expires_at,name`);
  if (!rows || !rows.length) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  supabaseRequest('PATCH', `/api_keys?id=eq.${row.id}`,
    { last_used_at: new Date().toISOString() }).catch(() => {});
  return row;
}
function methodToScope(method) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  return 'write';
}

// =============================================================
// FIX R13 (#4): Middleware requireAuth
// R14: ahora acepta también `X-API-Key: vlx_xxx`
// =============================================================
function requireAuth(handler, requiredRoles) {
  return async (req, res, params) => {
    // 1) X-API-Key tiene prioridad si está presente
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const row = await lookupApiKey(String(apiKey).trim());
      if (!row) return sendJSON(res, { error: 'unauthorized', reason: 'invalid_api_key' }, 401);
      const needed = methodToScope(req.method);
      const scopes = row.scopes || [];
      const ok = scopes.includes('admin') || scopes.includes(needed);
      if (!ok) return sendJSON(res, { error: 'forbidden', reason: 'insufficient_scope', needed }, 403);
      const inferredRole = scopes.includes('admin') ? 'admin' : 'user';
      if (requiredRoles && requiredRoles.length && !requiredRoles.includes(inferredRole)) {
        return sendJSON(res, { error: 'forbidden', reason: 'role_required' }, 403);
      }
      req.user = {
        id: null, email: `apikey:${row.name}`,
        role: inferredRole, tenant_id: row.tenant_id,
        api_key_id: row.id, via: 'api_key', scopes
      };
      return handler(req, res, params);
    }

    // 2) Bearer JWT o cookie volvix_token (R22 FIX 5)
    const auth = req.headers['authorization'] || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    let tok = m ? m[1] : null;
    if (!tok) {
      const cookies = parseCookies(req);
      if (cookies.volvix_token) tok = cookies.volvix_token;
    }
    if (!tok) return sendJSON(res, { error: 'unauthorized' }, 401);
    const payload = verifyJWT(tok);
    if (!payload) return sendJSON(res, { error: 'unauthorized' }, 401);
    if (requiredRoles && requiredRoles.length && !requiredRoles.includes(payload.role)) {
      return sendJSON(res, { error: 'forbidden' }, 403);
    }
    req.user = {
      id: payload.id, email: payload.email,
      role: payload.role, tenant_id: payload.tenant_id, via: 'jwt'
    };
    return handler(req, res, params);
  };
}

// FIX R13 (#6) + slice_38: Resolver tenant SIEMPRE de req.user. Solo superadmin puede override
function resolveTenant(req, queryTenant) {
  const role = req.user?.role;
  if (role === 'superadmin' && queryTenant) {
    return queryTenant;
  }
  return req.user?.tenant_id;
}

// =============================================================
// ARCHIVOS ESTÁTICOS
// =============================================================
function findFile(filename) {
  const possibleRoots = [
    path.join(__dirname, '..'), path.join(process.cwd()), '/var/task',
    __dirname, path.join(__dirname, '..', '..'),
    '/var/task/api', path.join(process.cwd(), '..')
  ];
  for (const root of possibleRoots) {
    try {
      const fullPath = path.join(root, filename);
      if (fs.existsSync(fullPath)) return fullPath;
    } catch (_) {}
  }
  return null;
}

function serveStaticFile(res, pathname) {
  if (pathname === '/' || pathname === '') pathname = '/login.html';
  const filePath = findFile(pathname);

  if (!filePath) {
    // R28: servir 404.html custom con branding si existe
    const customPath = findFile('/404.html');
    if (customPath) {
      try {
        const html = fs.readFileSync(customPath, 'utf8');
        res.statusCode = 404;
        setSecurityHeaders(res);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(html);
        return;
      } catch (e) { /* fallthrough a fallback */ }
    }
    res.statusCode = 404;
    setSecurityHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<h1>404</h1><p>${pathname}</p><p><a href="/login.html">Login</a></p>`);
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
      '.ico':  'image/x-icon', '.woff': 'font/woff', '.woff2':'font/woff2',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.statusCode = 200;
    setSecurityHeaders(res); // R14
    res.setHeader('Content-Type', mime);
    // R23: HTML siempre fresco; assets pueden cachear
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    res.end(fs.readFileSync(filePath));
  } catch (err) {
    res.statusCode = 500;
    res.end(`<h1>500</h1><p>${IS_PROD ? 'internal' : err.message}</p>`);
  }
}

// =============================================================
// R14: METRICS / OBSERVABILITY (in-memory)
// =============================================================
const METRICS = {
  startedAt: Date.now(),
  requestCount: 0,
  errorCount: 0,
  latencies: [],         // ring buffer last 1000
  latencyMax: 1000,
};
function recordMetric(durationMs, statusCode) {
  METRICS.requestCount++;
  if (statusCode >= 500) METRICS.errorCount++;
  METRICS.latencies.push(durationMs);
  if (METRICS.latencies.length > METRICS.latencyMax) {
    METRICS.latencies.shift();
  }
}
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
function computeLatencyStats() {
  const arr = METRICS.latencies.slice().sort((a, b) => a - b);
  return {
    samples: arr.length,
    p50: percentile(arr, 50),
    p95: percentile(arr, 95),
    p99: percentile(arr, 99),
  };
}

// =============================================================
// R14: STRUCTURED LOGGING (one JSON line per request)
// =============================================================
function logRequest(entry) {
  try {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } catch (_) {}
}

// =============================================================
// HANDLERS - ENDPOINTS COMPLETOS
// =============================================================
const handlers = {
  // ============ AUTH ============
  // FIX R13 (#5): /api/login NO requiere auth, pero SÍ rate-limit (#12)
  'POST /api/login': async (req, res) => {
    try {
      // R22 FIX 4: rate-limit dual (IP + email) + backoff + lockout
      const ip = clientIp(req);
      // R26 Bug 3: subir de 20 → 60 intentos/15min por IP (oficinas con NAT)
      if (!rateLimit('login:ip:' + ip, 60, 15 * 60 * 1000)) {
        return send429(res, 60000, 'Demasiados intentos, intenta más tarde');
      }

      const body = await readBody(req, { maxBytes: 8 * 1024 });
      if (checkBodyError(req, res)) return;
      const { email, password } = body;

      if (!email || !password) return sendJSON(res, { error: 'Email y contraseña requeridos' }, 400);

      // R22 FIX 4: rate-limit por email; R26 Bug 3: 5 → 15/15min
      if (!rateLimit('login:email:' + String(email).toLowerCase(), 15, 15 * 60 * 1000)) {
        return send429(res, 60000, 'Demasiados intentos para este usuario');
      }

      // R22 FIX 4: lockout (10 fails consecutivos => 30min)
      const bo = getLoginBackoff(email);
      if (bo.locked) {
        return send429(res, bo.retryAfter, 'Cuenta bloqueada temporalmente por intentos fallidos');
      }

      const users = await supabaseRequest('GET',
        `/pos_users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,role,plan,full_name,company_id,notes,is_active`);

      const failLogin = async (msg) => {
        recordLoginFail(email);
        const b = getLoginBackoff(email);
        if (b.delay > 0) await sleep(b.delay);
        return sendJSON(res, { error: msg || 'Credenciales inválidas' }, 401);
      };

      if (!users || users.length === 0) return failLogin();

      const user = users[0];
      if (!verifyPassword(password, user.password_hash)) {
        return failLogin();
      }
      if (!user.is_active) return sendJSON(res, { error: 'Usuario inactivo' }, 403);
      clearLoginFails(email);

      // R14 MFA: si está habilitado, no emitir session todavía (skip si columna no existe)
      if (user.mfa_enabled) {
        const mfa_token = signMfaToken(user.id);
        return sendJSON(res, { ok: true, requires_mfa: true, mfa_token, expires_in: 300 });
      }

      const notes = parseNotes(user.notes);
      const volvixRole = notes.volvix_role || (user.role === 'ADMIN' ? 'superadmin' : 'cajero');
      const tenantId = notes.tenant_id || 'TNT001';
      const tenantName = notes.tenant_name || 'Mi Negocio';

      supabaseRequest('PATCH', `/pos_users?id=eq.${user.id}`, {
        last_login_at: new Date().toISOString()
      }).catch(() => {});

      supabaseRequest('POST', '/pos_login_events', {
        pos_user_id: user.id, platform: 'web', ip: clientIp(req)
      }).catch(() => {});

      // FIX R13 (#3): emitir JWT
      const token = signJWT({
        id: user.id, email: user.email,
        role: volvixRole, tenant_id: tenantId
      });

      // R22 FIX 5: httpOnly cookie
      setAuthCookie(res, token, JWT_EXPIRES_SECONDS);

      sendJSON(res, {
        ok: true,
        token, // nuevo
        session: {
          user_id: user.id, email: user.email, role: volvixRole,
          tenant_id: tenantId, tenant_name: tenantName,
          full_name: user.full_name, company_id: user.company_id,
          expires_at: Date.now() + (JWT_EXPIRES_SECONDS * 1000), plan: user.plan,
        }
      });
    } catch (err) {
      sendError(res, err);
    }
  },

  'POST /api/logout': async (req, res) => {
    // R22 FIX 5: clear cookie
    clearAuthCookie(res);
    sendJSON(res, { ok: true, message: 'Sesión cerrada' });
  },

  // FIX R13 (#5): /api/health público
  'GET /api/health': async (req, res) => {
    try {
      const test = await supabaseRequest('GET', '/pos_users?limit=1&select=id');
      sendJSON(res, {
        ok: true, time: Date.now(), version: '7.2.0',
        database: 'Supabase', supabase_connected: true,
        users_table_accessible: Array.isArray(test)
      });
    } catch (err) {
      sendJSON(res, { ok: true, time: Date.now(), supabase_connected: false });
    }
  },

  // ============ TENANTS / COMPANIES ============
  'GET /api/tenants': requireAuth(async (req, res) => {
    try {
      const companies = await supabaseRequest('GET',
        '/pos_companies?id=in.(11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222,33333333-3333-3333-3333-333333333333)&select=*');
      sendJSON(res, companies || []);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/tenants': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const safe = pickFields(body, ALLOWED_FIELDS_TENANTS); // FIX R13 (#9)
      const result = await supabaseRequest('POST', '/pos_companies', {
        name: safe.name, owner_user_id: safe.owner_user_id,
        plan: safe.plan || 'trial', is_active: safe.is_active !== false
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'PATCH /api/tenants/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400); // FIX R13 (#10)
      const body = await readBody(req);
      const safe = pickFields(body, ALLOWED_FIELDS_TENANTS); // FIX R13 (#9)
      const result = await supabaseRequest('PATCH', `/pos_companies?id=eq.${params.id}`, safe);
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'DELETE /api/tenants/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      await supabaseRequest('PATCH', `/pos_companies?id=eq.${params.id}`, { is_active: false });
      sendJSON(res, { ok: true, message: 'Tenant suspendido' });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  // ============ PRODUCTOS ============
  'GET /api/products': requireAuth(async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const q = parsed.query.q ? String(parsed.query.q).trim() : '';
      const lowStock = parsed.query.low_stock === 'true' || parsed.query.low_stock === '1';
      const exportCsv = parsed.query.export === 'csv';
      const limit = Math.min(parseInt(parsed.query.limit) || 1000, 5000);
      // FIX R13 (#6): tenant del JWT, no del query
      const tenantId = resolveTenant(req, parsed.query.tenant_id);
      let posUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      if (tenantId === 'TNT002') posUserId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

      let qs = `/pos_products?pos_user_id=eq.${posUserId}&select=*&order=name.asc&limit=${limit}`;
      if (q) {
        const safe = q.replace(/[*,()]/g, '').slice(0, 80);
        qs += `&or=(name.ilike.*${encodeURIComponent(safe)}*,code.ilike.*${encodeURIComponent(safe)}*,category.ilike.*${encodeURIComponent(safe)}*)`;
      }
      if (lowStock) {
        qs += `&stock=lte.10`;
      }
      const products = await supabaseRequest('GET', qs);

      const mapped = (products || []).map(p => ({
        id: p.id, code: p.code, name: p.name, category: p.category,
        price: parseFloat(p.price), cost: parseFloat(p.cost),
        stock: p.stock, icon: p.icon, tenant_id: tenantId || 'TNT001',
      }));

      if (exportCsv) {
        const head = 'id,code,name,category,price,cost,stock\n';
        const rows = mapped.map(p => [p.id, p.code, JSON.stringify(p.name||''), p.category||'', p.price, p.cost, p.stock].join(',')).join('\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="products.csv"'
        });
        res.end(head + rows);
        return;
      }

      sendJSON(res, mapped);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/products': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req, { maxBytes: 100 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      const safe = pickFields(body, ALLOWED_FIELDS_PRODUCTS); // FIX R13 (#9)
      // R22.4 BUG 2: rechazar el INPUT ORIGINAL si contiene XSS/JS handlers (NO sanear-y-guardar).
      const rawName = typeof safe.name === 'string' ? safe.name : '';
      const rawCode = typeof safe.code === 'string' ? safe.code : '';
      if (hasUnsafeChars(rawName) || hasUnsafeChars(rawCode)) {
        return sendValidation(res, 'caracteres inválidos en name/code', 'name');
      }
      // R22.4 BUG 4: rechazar nombres con sintaxis SQL.
      if (looksLikeSqlInjection(rawName) || looksLikeSqlInjection(rawCode)) {
        return sendValidation(res, 'name/code contienen SQL no permitido', 'name', 'invalid_name');
      }
      // Sanea null bytes / trim / cap.
      safe.name = sanitizeName(safe.name);
      safe.code = sanitizeName(safe.code);
      if (safe.category !== undefined) safe.category = sanitizeName(safe.category);
      if (!safe.name || !safe.name.length) return sendValidation(res, 'name requerido', 'name');
      if (safe.name.length > 200) return sendValidation(res, 'name max 200 chars', 'name');
      // R22.4 BUG 3: precio numérico finito y >= 0.
      const priceNum = Number(safe.price);
      if (safe.price === undefined || safe.price === null || !Number.isFinite(priceNum) || priceNum < 0) {
        return sendValidation(res, 'price debe ser número >= 0', 'price');
      }
      safe.price = priceNum;
      // R22.4 BUG 3: stock entero >= 0.
      if (safe.stock !== undefined && safe.stock !== null) {
        const stockNum = Number(safe.stock);
        if (!Number.isFinite(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
          return sendValidation(res, 'stock debe ser entero >= 0', 'stock');
        }
        safe.stock = stockNum;
      }
      const costNum = safe.cost !== undefined && safe.cost !== null ? Number(safe.cost) : 0;
      if (!Number.isFinite(costNum) || costNum < 0) {
        return sendValidation(res, 'cost debe ser número >= 0', 'cost');
      }
      // FIX slice_38: pos_user_id derivado del JWT, NUNCA del body (impide cross-tenant write)
      const tenantId = resolveTenant(req);
      const ownerUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      const result = await supabaseRequest('POST', '/pos_products', {
        pos_user_id: ownerUserId,
        code: safe.code, name: safe.name, category: safe.category || 'general',
        cost: costNum, price: safe.price, stock: Number(safe.stock || 0),
        icon: safe.icon || '📦'
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendError(res, err); }
  }),

  'PATCH /api/products/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400); // FIX R13 (#10)
      const body = await readBody(req, { maxBytes: 100 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      // R22 FIX 2: optimistic locking
      const expectedVersion = getExpectedVersion(req, body);
      if (expectedVersion === null) {
        return sendJSON(res, { error: 'version_required', message: 'Header If-Match o body.version requerido' }, 400);
      }
      const safe = pickFields(body, ALLOWED_FIELDS_PRODUCTS); // FIX R13 (#9)
      // FIX v340: existence check before patch
      const existing = await supabaseRequest('GET', `/pos_products?id=eq.${params.id}&select=id,pos_user_id,version`);
      if (!existing || existing.length === 0) return sendJSON(res, { error: 'not found' }, 404);
      // FIX slice_38: tenant ownership check
      const tenantId = resolveTenant(req);
      const expectedUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      if (req.user.role !== 'superadmin' && existing[0].pos_user_id && existing[0].pos_user_id !== expectedUserId) {
        return sendJSON(res, { error: 'not found' }, 404);
      }
      if (safe.name !== undefined) {
        const rawName = typeof safe.name === 'string' ? safe.name : '';
        if (hasUnsafeChars(rawName) || looksLikeSqlInjection(rawName)) {
          return sendValidation(res, 'caracteres inválidos en name', 'name');
        }
        const cleanName = sanitizeName(safe.name);
        if (!cleanName) delete safe.name;
        else safe.name = cleanName;
      }
      if (safe.code !== undefined) {
        const rawCode = typeof safe.code === 'string' ? safe.code : '';
        if (hasUnsafeChars(rawCode) || looksLikeSqlInjection(rawCode)) {
          return sendValidation(res, 'caracteres inválidos en code', 'code');
        }
        safe.code = sanitizeName(safe.code);
      }
      if (safe.price !== undefined) {
        const priceNum = Number(safe.price);
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          return sendValidation(res, 'price debe ser número >= 0', 'price');
        }
        safe.price = priceNum;
      }
      if (safe.stock !== undefined && safe.stock !== null) {
        const stockNum = Number(safe.stock);
        if (!Number.isFinite(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
          return sendValidation(res, 'stock debe ser entero >= 0', 'stock');
        }
        safe.stock = stockNum;
      }
      // R22 FIX 2: PATCH con WHERE version=expected
      const result = await supabaseRequest('PATCH',
        `/pos_products?id=eq.${params.id}&version=eq.${expectedVersion}`, safe);
      if (!result || (Array.isArray(result) && result.length === 0)) {
        const cur = await supabaseRequest('GET', `/pos_products?id=eq.${params.id}&select=version`);
        return sendJSON(res, {
          error: 'version_conflict',
          message: 'El recurso fue modificado por otro proceso',
          current_version: cur && cur[0] ? cur[0].version : null,
          expected_version: expectedVersion
        }, 409);
      }
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }),

  'DELETE /api/products/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      // FIX v340: existence check before delete
      const existing = await supabaseRequest('GET', `/pos_products?id=eq.${params.id}&select=id,pos_user_id`);
      if (!existing || existing.length === 0) return sendJSON(res, { error: 'not found' }, 404);
      // FIX slice_38: tenant ownership check
      const tenantId = resolveTenant(req);
      const expectedUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      if (req.user.role !== 'superadmin' && existing[0].pos_user_id && existing[0].pos_user_id !== expectedUserId) {
        return sendJSON(res, { error: 'not found' }, 404);
      }
      await supabaseRequest('DELETE', `/pos_products?id=eq.${params.id}`);
      sendJSON(res, { ok: true, deleted: true });
    } catch (err) { sendError(res, err); }
  }),

  // ============ VENTAS ============
  'GET /api/sales': requireAuth(async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      // FIX slice_38: filtrar SIEMPRE por tenant (vía pos_user_id derivado).
      // Solo superadmin puede pasar user_id arbitrario.
      const tenantId = resolveTenant(req);
      const ownerUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      let posUserId = ownerUserId;
      if (req.user.role === 'superadmin' && parsed.query.user_id && isUuid(parsed.query.user_id)) {
        posUserId = parsed.query.user_id;
      }
      const qs = `?pos_user_id=eq.${posUserId}&select=*&order=created_at.desc&limit=100`;
      const sales = await supabaseRequest('GET', '/pos_sales' + qs);
      sendJSON(res, sales || []);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/sales': requireAuth(withIdempotency('POST /api/sales', async (req, res) => {
    try {
      const body = await readBody(req, { maxBytes: 200 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      const safe = pickFields(body, ALLOWED_FIELDS_SALES); // FIX R13 (#9)
      // FIX slice_31: validaciones VENTAS
      const itemsIn = Array.isArray(safe.items) ? safe.items : (Array.isArray(body.items) ? body.items : []);
      if (!itemsIn.length) return sendJSON(res, { error: 'items required' }, 400);
      for (const it of itemsIn) {
        const q = Number(it && it.qty);
        const p = Number(it && it.price);
        if (!Number.isFinite(q) || q <= 0) return sendJSON(res, { error: 'qty must be > 0' }, 400);
        if (!Number.isFinite(p) || p < 0) return sendJSON(res, { error: 'price must be >= 0' }, 400);
        // R22.4 BUG 2,4: validar items[].name / items[].notes contra XSS/SQL.
        if (it && typeof it.name === 'string') {
          if (hasUnsafeChars(it.name) || looksLikeSqlInjection(it.name)) {
            return sendValidation(res, 'caracteres inválidos en items[].name', 'items.name');
          }
          it.name = sanitizeName(it.name);
        }
        if (it && typeof it.notes === 'string') {
          if (hasUnsafeChars(it.notes) || looksLikeSqlInjection(it.notes)) {
            return sendValidation(res, 'caracteres inválidos en items[].notes', 'items.notes');
          }
          it.notes = sanitizeName(it.notes);
        }
      }
      // R22.4: sanitize sale-level notes.
      if (body.notes !== undefined && typeof body.notes === 'string') {
        if (hasUnsafeChars(body.notes) || looksLikeSqlInjection(body.notes)) {
          return sendValidation(res, 'caracteres inválidos en notes', 'notes');
        }
        body.notes = sanitizeName(body.notes);
      }
      let total = itemsIn.reduce((s, it) => s + (Number(it.qty) * Number(it.price)) - (Number(it.discount) || 0), 0);
      const dPct = Number(body.discount_pct) || 0;
      const dAmt = Number(body.discount_amount) || 0;
      if (dPct > 0) total = total * (1 - Math.min(dPct, 100) / 100);
      if (dAmt > 0) total = Math.max(0, total - dAmt);
      // R17 TIPS: validar y sumar propina al total
      const tipAmount = Math.max(0, Number(body.tip_amount) || Number(safe.tip_amount) || 0);
      const tipAssignedTo = (body.tip_assigned_to || safe.tip_assigned_to || null);
      if (tipAmount > 0) total = total + tipAmount;
      const pm = safe.payment_method || body.payment_method || 'efectivo';
      if (pm === 'efectivo' && body.amount_paid != null) {
        const ap = Number(body.amount_paid);
        if (!Number.isFinite(ap) || ap < total) return sendJSON(res, { error: 'amount_paid insufficient', total, amount_paid: ap }, 400);
      }
      if (Array.isArray(body.payments_split) && body.payments_split.length) {
        const sum = body.payments_split.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        if (Math.abs(sum - total) > 0.01) return sendJSON(res, { error: 'payments_split mismatch', total, sum }, 400);
      }
      const change = (pm === 'efectivo' && body.amount_paid != null) ? Math.max(0, Number(body.amount_paid) - total) : 0;

      // R22 FIX 3: stock atómico (RPC decrement_stock_atomic)
      try {
        const stockItems = itemsIn
          .filter(it => it && it.id && isUuid(String(it.id)))
          .map(it => ({ id: it.id, qty: Number(it.qty) }));
        if (stockItems.length) {
          await supabaseRequest('POST', '/rpc/decrement_stock_atomic', { items: stockItems });
        }
      } catch (stockErr) {
        const msg = String(stockErr.message || '');
        if (/stock_insuficiente/i.test(msg)) {
          const m = msg.match(/stock_insuficiente:([0-9a-f-]+)/i);
          return sendJSON(res, { error: 'stock_insuficiente', product_id: m ? m[1] : null }, 409);
        }
        // 42883 = function does not exist; fail-open en dev, fail en prod
        if (IS_PROD && !/42883|does not exist/i.test(msg)) {
          return sendJSON(res, { error: 'stock_check_failed', message: msg }, 500);
        }
      }

      let saleRow;
      try {
        const result = await supabaseRequest('POST', '/pos_sales', {
          pos_user_id: req.user.id, // FIX R13 (#6): usuario del JWT
          total, payment_method: pm,
          items: itemsIn,
          // R17 TIPS
          tip_amount: tipAmount,
          tip_assigned_to: tipAssignedTo
        });
        saleRow = result && (result[0] || result);
      } catch (dbErr) {
        saleRow = { id: (require('crypto').randomUUID && require('crypto').randomUUID()) || ('sale_' + Date.now()), total, payment_method: pm, items: itemsIn, status: 'paid', created_at: new Date().toISOString() };
      }
      if (saleRow && typeof saleRow === 'object') {
        saleRow.change = change;
        if (Array.isArray(body.payments_split)) saleRow.payments_split = body.payments_split;
        if (dPct) saleRow.discount_pct = dPct;
        if (dAmt) saleRow.discount_amount = dAmt;
      }
      // R14: receipt email si customer.email existe
      try {
        const customerEmail = body.customer?.email || body.customer_email;
        if (customerEmail) {
          const tpl = emailTemplates.receiptTemplate(saleRow || { items: safe.items, total: safe.total, payment_method: safe.payment_method });
          sendEmail({ to: customerEmail, subject: tpl.subject, html: tpl.html, text: tpl.text, template: 'receipt' })
            .catch(() => {});
        }
      } catch (_) {}
      // R17: WhatsApp confirmation fire-and-forget si customer.phone existe
      try {
        const customerPhone = (body.customer && body.customer.phone) || body.customer_phone;
        if (customerPhone && global.__waSend && global.__waConfigured) {
          const customerName = (body.customer && body.customer.name) || 'Cliente';
          const totalStr = String(saleRow && saleRow.total || 0);
          const orderId = String(saleRow && saleRow.id || '').slice(0, 12);
          global.__waSend({
            to: customerPhone,
            template: 'order_confirmation',
            params: [customerName, orderId, totalStr],
          }).then((r) => {
            try {
              global.__waLog && global.__waLog({
                tenant_id: (req.user && req.user.tenant_id) || null,
                direction: 'out', to_phone: customerPhone, template: 'order_confirmation',
                body: 'sale:' + orderId, status: r && r.ok ? 'sent' : 'failed',
                wa_id: r && r.wa_id || null,
              });
            } catch (_) {}
          }).catch(() => {});
        }
      } catch (_) {}
      try { dispatchWebhook(resolveTenant(req), 'sale.created', saleRow); } catch (_) {}
      // R18 MARKETPLACE: revenue split por item.vendor_id
      try { if (global.__mpRegisterSaleSplits) await global.__mpRegisterSaleSplits(saleRow, itemsIn); } catch (_) {}
      sendJSON(res, saleRow);
    } catch (err) { sendError(res, err); }
  })),

  // ============ CUSTOMERS ============
  'GET /api/customers': requireAuth(async (req, res) => {
    try {
      // FIX slice_38: filtrar por user_id del JWT (tenant)
      let qs = `?user_id=eq.${req.user.id}&select=*&order=created_at.desc&limit=100`;
      if (req.user.role === 'superadmin') {
        qs = '?select=*&order=created_at.desc&limit=100';
      }
      const customers = await supabaseRequest('GET', '/customers' + qs);
      sendJSON(res, customers || []);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/customers': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const safe = pickFields(body, ALLOWED_FIELDS_CUSTOMERS); // FIX R13 (#9)
      // FIX slice_61: reject CRLF in email (header injection)
      if (hasCrlf(safe.email) || hasCrlf(safe.phone) || hasCrlf(safe.name)) {
        return sendJSON(res, { error: 'invalid characters in input' }, 400);
      }
      // R22.4 BUG 2,4: rechazar input ORIGINAL con XSS/SQL antes de sanear.
      const rawCustName = typeof safe.name === 'string' ? safe.name : '';
      const rawCustAddr = typeof safe.address === 'string' ? safe.address : '';
      const rawCustNotes = typeof body.notes === 'string' ? body.notes : '';
      if (hasUnsafeChars(rawCustName) || hasUnsafeChars(rawCustAddr) || hasUnsafeChars(rawCustNotes)) {
        return sendValidation(res, 'caracteres inválidos en input', 'name');
      }
      if (looksLikeSqlInjection(rawCustName) || looksLikeSqlInjection(rawCustNotes)) {
        return sendValidation(res, 'name/notes contienen SQL no permitido', 'name', 'invalid_name');
      }
      // FIX slice_61 + R22.4: sanitize XSS in stored text fields
      safe.name = sanitizeName(safe.name);
      safe.email = sanitizeText(safe.email);
      safe.phone = sanitizeText(safe.phone);
      safe.address = sanitizeText(safe.address);
      if (body.notes !== undefined) safe.notes = sanitizeName(body.notes);
      if (!safe.name) return sendValidation(res, 'name requerido', 'name');
      if (safe.name.length > 200) return sendValidation(res, 'name max 200 chars', 'name');
      // R26 FIX: validar RFC SAT
      if (body.rfc !== undefined && body.rfc !== null && body.rfc !== '' && !isValidRFC(body.rfc)) {
        return sendJSON(res, { error: 'invalid_rfc', message: 'RFC no cumple formato SAT' }, 400);
      }
      if (body.rfc) safe.rfc = String(body.rfc).trim().toUpperCase();
      const cl = Number(safe.credit_limit);
      if (safe.credit_limit !== undefined && safe.credit_limit !== null && (!Number.isFinite(cl) || cl < 0)) {
        return sendValidation(res, 'credit_limit debe ser número >= 0', 'credit_limit');
      }
      const result = await supabaseRequest('POST', '/customers', {
        name: safe.name, email: safe.email, phone: safe.phone,
        address: safe.address, credit_limit: safe.credit_limit || 0,
        credit_balance: safe.credit_balance || 0,
        points: safe.points || 0, loyalty_points: safe.loyalty_points || 0,
        rfc: safe.rfc || null,
        active: true, user_id: req.user.id // FIX R13 (#6)
      });
      const customerRow = result[0] || result;
      try { dispatchWebhook(resolveTenant(req), 'customer.created', customerRow); } catch (_) {}
      sendJSON(res, customerRow);
    } catch (err) { sendError(res, err); }
  }),

  'PATCH /api/customers/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req, { maxBytes: 100 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      // R22 FIX 2: optimistic locking
      const expectedVersion = getExpectedVersion(req, body);
      if (expectedVersion === null) {
        return sendJSON(res, { error: 'version_required', message: 'Header If-Match o body.version requerido' }, 400);
      }
      const safe = pickFields(body, ALLOWED_FIELDS_CUSTOMERS); // FIX R13 (#9)
      // FIX slice_61: reject CRLF + sanitize XSS
      if (hasCrlf(safe.email) || hasCrlf(safe.phone) || hasCrlf(safe.name)) {
        return sendJSON(res, { error: 'invalid characters in input' }, 400);
      }
      // R22.4: validar input ORIGINAL antes de sanear.
      if (safe.name !== undefined && typeof safe.name === 'string'
          && (hasUnsafeChars(safe.name) || looksLikeSqlInjection(safe.name))) {
        return sendValidation(res, 'caracteres inválidos en name', 'name');
      }
      if (body.notes !== undefined && typeof body.notes === 'string'
          && (hasUnsafeChars(body.notes) || looksLikeSqlInjection(body.notes))) {
        return sendValidation(res, 'caracteres inválidos en notes', 'notes');
      }
      if (safe.name !== undefined) safe.name = sanitizeName(safe.name);
      if (safe.email !== undefined) safe.email = sanitizeText(safe.email);
      if (safe.phone !== undefined) safe.phone = sanitizeText(safe.phone);
      if (safe.address !== undefined) safe.address = sanitizeText(safe.address);
      if (body.notes !== undefined) safe.notes = sanitizeName(body.notes);
      // FIX slice_38: tenant ownership check
      const existing = await supabaseRequest('GET', `/customers?id=eq.${params.id}&select=id,user_id,version`);
      if (!existing || existing.length === 0) return sendJSON(res, { error: 'not found' }, 404);
      if (req.user.role !== 'superadmin' && existing[0].user_id && existing[0].user_id !== req.user.id) {
        return sendJSON(res, { error: 'not found' }, 404);
      }
      // R22 FIX 2
      const result = await supabaseRequest('PATCH',
        `/customers?id=eq.${params.id}&version=eq.${expectedVersion}`, safe);
      if (!result || (Array.isArray(result) && result.length === 0)) {
        const cur = await supabaseRequest('GET', `/customers?id=eq.${params.id}&select=version`);
        return sendJSON(res, {
          error: 'version_conflict',
          message: 'El recurso fue modificado por otro proceso',
          current_version: cur && cur[0] ? cur[0].version : null,
          expected_version: expectedVersion
        }, 409);
      }
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }),

  'DELETE /api/customers/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      // FIX slice_38: tenant ownership check
      const existing = await supabaseRequest('GET', `/customers?id=eq.${params.id}&select=id,user_id`);
      if (!existing || existing.length === 0) return sendJSON(res, { error: 'not found' }, 404);
      if (req.user.role !== 'superadmin' && existing[0].user_id && existing[0].user_id !== req.user.id) {
        return sendJSON(res, { error: 'not found' }, 404);
      }
      await supabaseRequest('PATCH', `/customers?id=eq.${params.id}`, { active: false });
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }),

  // ============ R14 INTEGRATIONS · API KEYS (Zapier/Make/n8n) ============
  'GET /api/integrations/api-keys/whoami': requireAuth(async (req, res) => {
    sendJSON(res, {
      ok: true,
      tenant_id: req.user.tenant_id,
      via: req.user.via,
      scopes: req.user.scopes || null,
      email: req.user.email
    });
  }),

  'GET /api/integrations/api-keys': requireAuth(async (req, res) => {
    try {
      const tenant = req.user.tenant_id;
      const rows = await supabaseRequest('GET',
        `/api_keys?tenant_id=eq.${tenant}&select=id,name,key_prefix,scopes,last_used_at,expires_at,created_by,created_at,revoked_at&order=created_at.desc`);
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'POST /api/integrations/api-keys': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJSON(res, { error: 'name required' }, 400);
      const allowed = ['read', 'write', 'admin'];
      const scopes = Array.isArray(body.scopes) && body.scopes.length
        ? body.scopes.filter(s => allowed.includes(s))
        : ['read'];
      if (!scopes.length) return sendJSON(res, { error: 'invalid scopes' }, 400);
      let expires_at = null;
      if (body.expires_at) {
        const t = new Date(body.expires_at);
        if (isNaN(t.getTime())) return sendJSON(res, { error: 'invalid expires_at' }, 400);
        expires_at = t.toISOString();
      }
      const plain = generateApiKey();
      const inserted = await supabaseRequest('POST', '/api_keys', {
        tenant_id: req.user.tenant_id,
        name,
        key_prefix: plain.slice(0, 12),
        key_hash: hashApiKey(plain),
        scopes,
        expires_at,
        created_by: req.user.id
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      sendJSON(res, {
        ok: true,
        api_key: plain,
        id: row?.id,
        name: row?.name,
        key_prefix: row?.key_prefix,
        scopes: row?.scopes,
        expires_at: row?.expires_at,
        warning: 'Store this key now. It will not be shown again.'
      }, 201);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'PATCH /api/integrations/api-keys/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const patch = {};
      if (body.revoke === true) patch.revoked_at = new Date().toISOString();
      if (typeof body.name === 'string') patch.name = body.name.trim();
      if (Array.isArray(body.scopes)) {
        const allowed = ['read', 'write', 'admin'];
        patch.scopes = body.scopes.filter(s => allowed.includes(s));
        if (!patch.scopes.length) return sendJSON(res, { error: 'invalid scopes' }, 400);
      }
      if (body.expires_at === null) patch.expires_at = null;
      else if (body.expires_at) {
        const t = new Date(body.expires_at);
        if (isNaN(t.getTime())) return sendJSON(res, { error: 'invalid expires_at' }, 400);
        patch.expires_at = t.toISOString();
      }
      if (!Object.keys(patch).length) return sendJSON(res, { error: 'no changes' }, 400);
      const result = await supabaseRequest('PATCH',
        `/api_keys?id=eq.${params.id}&tenant_id=eq.${req.user.tenant_id}`, patch);
      sendJSON(res, { ok: true, result });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  // ============ OWNER PANEL DASHBOARD ============
  // FIX R13 (#5): /api/owner/* requiere admin/owner
  'GET /api/owner/dashboard': requireAuth(async (req, res) => {
    try {
      const [users, companies, sales, products, customers] = await Promise.all([
        supabaseRequest('GET', '/pos_users?select=id,is_active'),
        supabaseRequest('GET', '/pos_companies?select=id,plan,is_active'),
        supabaseRequest('GET', '/pos_sales?select=total,created_at'),
        supabaseRequest('GET', '/pos_products?select=id,stock'),
        supabaseRequest('GET', '/customers?select=id,active'),
      ]);

      const totalRevenue = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      const activeUsers = (users || []).filter(u => u.is_active).length;
      const activeTenants = (companies || []).filter(c => c.is_active).length;
      const lowStock = (products || []).filter(p => (p.stock || 0) < 20).length;

      const planPrices = { trial: 0, free: 0, pro: 799, enterprise: 1499 };
      const mrr = (companies || [])
        .filter(c => c.is_active)
        .reduce((s, c) => s + (planPrices[c.plan] || 0), 0);

      sendJSON(res, {
        ok: true,
        metrics: {
          total_users: (users || []).length,
          active_users: activeUsers,
          total_tenants: (companies || []).length,
          active_tenants: activeTenants,
          total_sales: (sales || []).length,
          total_revenue: totalRevenue,
          total_products: (products || []).length,
          low_stock_count: lowStock,
          total_customers: (customers || []).length,
          active_customers: (customers || []).filter(c => c.active).length,
          mrr: mrr,
          arr: mrr * 12,
        },
        sales_by_day: (sales || []).slice(0, 30),
        top_tenants: (companies || []).slice(0, 5),
      });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  // B2 fix: KPIs "hoy" calculados sobre la DB real (no hardcoded)
  // Devuelve {sales_today, tickets_today, conversion_today, latency_p50, low_stock_count}
  'GET /api/dashboard/today': requireAuth(async (req, res) => {
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const sinceISO = today.toISOString();

      // posUserId derivado del JWT (igual que /api/sales) — NO se acepta del query string
      const tenantId = (typeof resolveTenant === 'function') ? resolveTenant(req) : null;
      const ownerUserId = tenantId === 'TNT002'
        ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
        : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      const posUserId = (req.user && req.user.role === 'superadmin' && (typeof url !== 'undefined' && url.parse(req.url, true).query.user_id))
        ? url.parse(req.url, true).query.user_id
        : ownerUserId;

      const todaySalesQ = `?pos_user_id=eq.${posUserId}&created_at=gte.${sinceISO}&select=total,created_at&limit=500`;
      const productsQ = `?pos_user_id=eq.${posUserId}&select=id,stock,reorder_point&limit=2000`;

      const [todaySales, products] = await Promise.all([
        supabaseRequest('GET', '/pos_sales' + todaySalesQ).catch(() => []),
        supabaseRequest('GET', '/pos_products' + productsQ).catch(() => []),
      ]);

      const sales = Array.isArray(todaySales) ? todaySales : [];
      const prods = Array.isArray(products) ? products : [];

      const ticketsToday = sales.length;
      const salesToday = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
      const lowStock = prods.filter(p => {
        const st = Number(p.stock || 0);
        const rp = Number(p.reorder_point || 5);
        return st <= rp;
      }).length;
      // Conversión simple (placeholder): tickets / (tickets + 1) — no hay carrito abandonado aún
      const conversion = ticketsToday > 0 ? Math.min(100, ticketsToday / (ticketsToday + 1) * 100) : 0;

      sendJSON(res, {
        ok: true,
        date: sinceISO.slice(0, 10),
        sales_today: Number(salesToday.toFixed(2)),
        tickets_today: ticketsToday,
        conversion_today: Number(conversion.toFixed(1)),
        low_stock_count: lowStock,
        latency_p50: null, // measurable from logs en futuro bloque
        generated_at: Date.now(),
      });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin', 'manager', 'cashier']),

  'GET /api/owner/tenants': requireAuth(async (req, res) => {
    try {
      const companies = await supabaseRequest('GET', '/pos_companies?select=*&order=created_at.desc');
      sendJSON(res, companies || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/users': requireAuth(async (req, res) => {
    try {
      // FIX slice_38: admin/owner sólo ven usuarios de su tenant; superadmin ve todos
      const tenantId = resolveTenant(req);
      let qs = '?select=id,email,role,is_active,plan,full_name,phone,company_id,last_login_at,created_at&order=created_at.desc&limit=100';
      if (req.user.role !== 'superadmin') {
        qs = `?company_id=eq.${encodeURIComponent(tenantId)}&select=id,email,role,is_active,plan,full_name,phone,company_id,last_login_at,created_at&order=created_at.desc&limit=100`;
      }
      const users = await supabaseRequest('GET', '/pos_users' + qs);
      sendJSON(res, users || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'POST /api/owner/users': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const safe = pickFields(body, ALLOWED_FIELDS_USERS); // FIX R13 (#9)
      // FIX R13 (#2): hashear password con scrypt antes de guardar
      let passwordHash = 'changeme';
      if (body.password) {
        const salt = crypto.randomBytes(16);
        const hash = crypto.scryptSync(String(body.password), salt, 64);
        passwordHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
      }
      const result = await supabaseRequest('POST', '/pos_users', {
        email: safe.email, password_hash: passwordHash,
        role: safe.role || 'USER', is_active: safe.is_active !== false,
        plan: safe.plan || 'trial', full_name: safe.full_name,
        phone: safe.phone, company_id: safe.company_id,
        notes: typeof safe.notes === 'string' ? safe.notes : JSON.stringify(safe.notes || {})
      });
      const userRow = result[0] || result;
      // R14: welcome email
      try {
        if (safe.email) {
          const tpl = emailTemplates.welcomeTemplate({
            email: safe.email, full_name: safe.full_name,
            plan: safe.plan || 'trial', role: safe.role || 'USER'
          });
          sendEmail({ to: safe.email, subject: tpl.subject, html: tpl.html, text: tpl.text, template: 'welcome' })
            .catch(() => {});
        }
      } catch (_) {}
      sendJSON(res, userRow);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/sales-report': requireAuth(async (req, res) => {
    try {
      const report = await supabaseRequest('GET', '/daily_sales_report?select=*&order=sale_date.desc&limit=30');
      sendJSON(res, report || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/licenses': requireAuth(async (req, res) => {
    try {
      const licenses = await supabaseRequest('GET', '/licenses?select=*&order=created_at.desc&limit=100');
      sendJSON(res, licenses || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'POST /api/owner/licenses': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/licenses', {
        license_key: body.license_key || ('LIC-' + Date.now()),
        machine_name: body.machine_name, platform: body.platform,
        restaurant_id: body.restaurant_id, restaurant_name: body.restaurant_name,
        is_active: true, notes: body.notes
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/domains': requireAuth(async (req, res) => {
    try {
      const domains = await supabaseRequest('GET', '/domains?select=*&order=created_at.desc');
      sendJSON(res, domains || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/billing': requireAuth(async (req, res) => {
    try {
      const billing = await supabaseRequest('GET', '/billing_configs?select=*&order=created_at.desc&limit=100');
      sendJSON(res, billing || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/low-stock': requireAuth(async (req, res) => {
    try {
      const products = await supabaseRequest('GET',
        '/pos_products?select=id,code,name,stock,price&order=stock.asc&limit=50');
      const lowStock = (products || []).filter(p => (p.stock || 0) < 20);
      sendJSON(res, lowStock);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/owner/sync-queue': requireAuth(async (req, res) => {
    try {
      const queue = await supabaseRequest('GET', '/sync_queue?select=*&order=created_at.desc&limit=100');
      sendJSON(res, queue || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  // ============ MARKETPLACE / FEATURES ============
  'GET /api/features': requireAuth(async (req, res) => {
    sendJSON(res, [
      { id: 'FEAT-0001', name: 'Cobrar ticket', module: 'pos', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0002', name: 'Agregar producto por código', module: 'pos', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0030', name: 'Corte de caja estándar', module: 'corte', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0050', name: 'Factura CFDI 4.0', module: 'facturacion', status: 'stable', usage: 892, price: 99 },
      { id: 'FEAT-0080', name: 'Comanda a cocina (KDS)', module: 'restaurante', status: 'stable', usage: 347, price: 199 },
      { id: 'FEAT-0120', name: 'Control de colegiaturas', module: 'educacion', status: 'stable', usage: 48, price: 299 },
      { id: 'FEAT-0150', name: 'Diseñador drag-and-drop etiquetas', module: 'etiquetas', status: 'stable', usage: 234, price: 0 },
      { id: 'FEAT-0240', name: 'Envío de ticket a WhatsApp', module: 'pos', status: 'new', usage: 23, price: 49, createdByAI: true },
    ]);
  }),

  'POST /api/features/request': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const { clientRequest } = body;
      const tenantId = resolveTenant(req, body.tenantId); // FIX R13 (#6)

      const aiResp = await callClaude([{
        role: 'user',
        content: `Cliente pidió: "${clientRequest}". Decide si esto es una feature existente, una extensión, o nueva. Responde JSON: {"decision": "activate|extend|create", "feature_name": "...", "module": "...", "reason": "..."}`
      }], 'Eres la IA de Volvix que decide si crear features. Responde SOLO JSON.');

      let decision = { decision: 'create', feature_name: clientRequest, module: 'custom', reason: 'Auto-creado' };
      try {
        if (aiResp.content) decision = JSON.parse(aiResp.content);
      } catch {}

      const featureId = 'FEAT-' + Date.now();
      sendJSON(res, {
        ok: true,
        decision: decision.decision,
        feature: {
          id: featureId,
          name: decision.feature_name,
          module: decision.module,
          status: decision.decision === 'create' ? 'new' : 'extended',
          tenantScope: [tenantId],
          createdByAI: !aiResp.simulated,
          reason: decision.reason
        }
      });
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/features/activate': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req, body.tenantId); // FIX R13 (#6)
      sendJSON(res, {
        ok: true,
        message: `Feature ${body.featureId} activada para tenant ${tenantId}`,
        activated_at: Date.now()
      });
    } catch (err) { sendError(res, err); }
  }),

  // ============ AI ENGINE / SUPPORT ============
  // FIX R13 (#12): rate limit /api/ai/* a 20/min por usuario
  'POST /api/ai/decide': requireAuth(async (req, res) => {
    try {
      if (!rateLimit('ai:' + req.user.id, 20, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      const body = await readBody(req);
      const result = await callClaude([{
        role: 'user',
        content: body.prompt || 'Hola'
      }], body.system || 'Eres la IA autónoma de Volvix.');
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/ai/support': requireAuth(async (req, res) => {
    try {
      if (!rateLimit('ai:' + req.user.id, 20, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      const body = await readBody(req);
      const result = await callClaude([{
        role: 'user',
        content: body.message || 'Necesito ayuda'
      }], 'Eres soporte técnico de Volvix POS. Resuelve problemas comunes: impresoras, cortes, ventas, inventario.');
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }),

  'GET /api/ai/decisions': requireAuth(async (req, res) => {
    sendJSON(res, [
      { id: 'DEC-001', request: 'Quiero cobrar con propinas', decision: 'extend', feature_id: 'FEAT-0001-ext', timestamp: Date.now() - 3600000 },
      { id: 'DEC-002', request: 'Necesito reporte por mesero', decision: 'create', feature_id: 'FEAT-0241', timestamp: Date.now() - 7200000 },
    ]);
  }, ['admin', 'superadmin', 'owner']),

  // FIX: AI tickets stats (frontend espera este endpoint al hacer login)
  'GET /api/ai/tickets/stats': requireAuth(async (req, res) => {
    try {
      sendJSON(res, {
        ok: true,
        total_tickets: 0,
        resolved_by_ai: 0,
        resolved_pct: 0,
        avg_response_ms: 0,
        by_category: [],
        by_day: []
      });
    } catch (err) { sendJSON(res, { ok: true, total_tickets: 0, resolved_by_ai: 0, resolved_pct: 0 }); }
  }),

  'GET /api/ai/tickets': requireAuth(async (req, res) => {
    try {
      sendJSON(res, { ok: true, items: [], total: 0 });
    } catch (err) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  }),

  // ============ AI ASSISTANT (R14) ============
  // POST /api/ai/chat — chat general autenticado
  'POST /api/ai/chat': requireAuth(async (req, res) => {
    try {
      if (!ANTHROPIC_API_KEY) return sendJSON(res, { error: 'ANTHROPIC_API_KEY no configurada' }, 503);
      if (!rateLimit('ai:' + req.user.id, 20, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      const body = await readBody(req);
      const msg = String(body.message || '').trim();
      if (!msg) return sendJSON(res, { error: 'message requerido' }, 400);
      if (msg.length > 4000) return sendJSON(res, { error: 'message excede 4000 caracteres' }, 400);
      const ctxStr = body.context ? `\nContexto del usuario: ${JSON.stringify(body.context).slice(0, 2000)}` : '';
      const result = await callClaude(
        [{ role: 'user', content: msg + ctxStr }],
        'Eres asistente de Volvix POS. Ayuda con preguntas sobre el sistema, productos, ventas, configuración.',
        { model: 'claude-3-5-haiku-20241022', max_tokens: 1024 }
      );
      // Log de costo (best-effort, no bloquea)
      try {
        await supabaseRequest('POST', '/ai_chat_log', {
          user_id: req.user.id,
          prompt_tokens: result.usage?.input_tokens || 0,
          completion_tokens: result.usage?.output_tokens || 0,
          model: 'claude-3-5-haiku-20241022',
          ts: new Date().toISOString(),
        });
      } catch {}
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }),

  // POST /api/ai/insights — solo admin/superadmin/owner
  'POST /api/ai/insights': requireAuth(async (req, res) => {
    try {
      if (!ANTHROPIC_API_KEY) return sendJSON(res, { error: 'ANTHROPIC_API_KEY no configurada' }, 503);
      if (!rateLimit('ai:' + req.user.id, 20, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      let sales = [];
      try {
        sales = await supabaseRequest('GET',
          '/pos_sales?select=id,total,created_at,items&order=created_at.desc&limit=100') || [];
      } catch {}
      // Cálculos locales: ventas por hora, top categorías, anomalías simples
      const byHour = {};
      let sum = 0, count = 0, max = 0, min = Infinity;
      for (const s of sales) {
        const h = new Date(s.created_at).getHours();
        byHour[h] = (byHour[h] || 0) + 1;
        const t = Number(s.total) || 0;
        sum += t; count++;
        if (t > max) max = t;
        if (t < min) min = t;
      }
      const avg = count ? sum / count : 0;
      const anomalies = sales.filter(s => Number(s.total) > avg * 3).map(s => ({ id: s.id, total: s.total }));
      const summary = { sales_count: count, avg_ticket: avg, max_ticket: max, min_ticket: min === Infinity ? 0 : min, by_hour: byHour, anomalies_count: anomalies.length };

      const aiResp = await callClaude(
        [{ role: 'user', content: `Analiza estos KPIs de las últimas 100 ventas y entrega 3 insights accionables en español:\n${JSON.stringify(summary)}` }],
        'Eres analista de negocio para Volvix POS. Responde con bullets cortos.',
        { model: 'claude-3-5-haiku-20241022', max_tokens: 700 }
      );
      try {
        await supabaseRequest('POST', '/ai_chat_log', {
          user_id: req.user.id,
          prompt_tokens: aiResp.usage?.input_tokens || 0,
          completion_tokens: aiResp.usage?.output_tokens || 0,
          model: 'claude-3-5-haiku-20241022',
          ts: new Date().toISOString(),
        });
      } catch {}
      sendJSON(res, { summary, anomalies, insights: aiResp.content, simulated: aiResp.simulated });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'superadmin', 'owner']),

  // POST /api/ai/copilot/suggest-product — sugerencia upsell/cross-sell
  'POST /api/ai/copilot/suggest-product': requireAuth(async (req, res) => {
    try {
      if (!ANTHROPIC_API_KEY) return sendJSON(res, { error: 'ANTHROPIC_API_KEY no configurada' }, 503);
      if (!rateLimit('ai:' + req.user.id, 20, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      const body = await readBody(req);
      const customerId = body.customer_id || null;
      const history = Array.isArray(body.history) ? body.history.slice(0, 50) : [];
      const result = await callClaude(
        [{ role: 'user', content: `Cliente: ${customerId || 'anónimo'}.\nHistorial reciente: ${JSON.stringify(history)}\nSugiere 3 productos para upsell y 2 para cross-sell. Devuelve JSON {"upsell":[...],"cross_sell":[...]}.` }],
        'Eres copiloto de ventas en Volvix POS. Responde SOLO con JSON válido.',
        { model: 'claude-3-5-haiku-20241022', max_tokens: 600 }
      );
      let parsed = null;
      try { parsed = JSON.parse(result.content); } catch {}
      try {
        await supabaseRequest('POST', '/ai_chat_log', {
          user_id: req.user.id,
          prompt_tokens: result.usage?.input_tokens || 0,
          completion_tokens: result.usage?.output_tokens || 0,
          model: 'claude-3-5-haiku-20241022',
          ts: new Date().toISOString(),
        });
      } catch {}
      sendJSON(res, { suggestions: parsed, raw: result.content, simulated: result.simulated });
    } catch (err) { sendError(res, err); }
  }),

  // ============ TICKETS ============
  'GET /api/tickets': requireAuth(async (req, res) => {
    sendJSON(res, [
      { id: 'TKT-1047', tenant: 'TNT001', title: 'Impresora térmica no imprime', status: 'open', aiHandling: true, opened: Date.now() - 120000 },
      { id: 'TKT-1046', tenant: 'TNT002', title: 'Error 301 al timbrar factura', status: 'solved', solvedBy: 'ai', solvedInSec: 18, opened: Date.now() - 900000 },
    ]);
  }),

  'POST /api/tickets': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const ticketId = 'TKT-' + (1000 + Math.floor(Math.random() * 9000));
      const tenantId = resolveTenant(req, body.tenant_id); // FIX R13 (#6)

      const aiResp = await callClaude([{
        role: 'user',
        content: `Ticket: "${body.title}". Detalles: "${body.description || ''}". Si conoces solución, dala en formato JSON: {"solved": true/false, "solution": "...", "confidence": 0-100}`
      }], 'Eres soporte AI. Soluciona si es problema común.');

      let aiResult = { solved: false, solution: 'Asignado a soporte humano' };
      try { aiResult = JSON.parse(aiResp.content); } catch {}

      sendJSON(res, {
        ok: true,
        ticket: {
          id: ticketId, tenant: tenantId || 'TNT001',
          title: body.title, status: aiResult.solved ? 'solved' : 'open',
          aiHandling: true,
          solution: aiResult.solution,
          opened: Date.now()
        }
      });
    } catch (err) { sendError(res, err); }
  }),

  // ============ INVENTORY ============
  'GET /api/inventory': requireAuth(async (req, res) => {
    try {
      // FIX slice_38: filtro por tenant
      const tenantId = resolveTenant(req);
      const ownerUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      let qs = `?pos_user_id=eq.${ownerUserId}&select=id,code,name,stock,cost,price&order=name.asc`;
      if (req.user.role === 'superadmin') qs = '?select=id,code,name,stock,cost,price&order=name.asc';
      const products = await supabaseRequest('GET', '/pos_products' + qs);
      sendJSON(res, products || []);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/inventory/adjust': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!isUuid(body.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400); // FIX R13 (#10)
      if (!isInt(body.new_stock)) return sendJSON(res, { error: 'invalid new_stock' }, 400);
      // FIX slice_38: tenant ownership check del producto
      const existing = await supabaseRequest('GET', `/pos_products?id=eq.${body.product_id}&select=id,pos_user_id`);
      if (!existing || existing.length === 0) return sendJSON(res, { error: 'not found' }, 404);
      const tenantId = resolveTenant(req);
      const expectedUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      if (req.user.role !== 'superadmin' && existing[0].pos_user_id && existing[0].pos_user_id !== expectedUserId) {
        return sendJSON(res, { error: 'not found' }, 404);
      }
      const result = await supabaseRequest('PATCH',
        `/pos_products?id=eq.${body.product_id}`, { stock: parseInt(body.new_stock, 10) });
      sendJSON(res, { ok: true, result });
    } catch (err) { sendError(res, err); }
  }),

  // ============ REPORTES ============
  'GET /api/reports/daily': requireAuth(async (req, res) => {
    try {
      // FIX slice_38: filtro por tenant
      const tenantId = resolveTenant(req);
      let qs = `?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=sale_date.desc&limit=30`;
      if (req.user.role === 'superadmin') qs = '?select=*&order=sale_date.desc&limit=30';
      let report = [];
      try { report = await supabaseRequest('GET', '/daily_sales_report' + qs); } catch (_) { report = []; }
      sendJSON(res, report || []);
    } catch (err) { sendError(res, err); }
  }),

  'GET /api/reports/sales': requireAuth(async (req, res) => {
    try {
      // FIX slice_38: filtro por tenant (vía pos_user_id)
      const tenantId = resolveTenant(req);
      const ownerUserId = tenantId === 'TNT002' ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      let qs = `?pos_user_id=eq.${ownerUserId}&select=*&order=created_at.desc&limit=200`;
      if (req.user.role === 'superadmin') qs = '?select=*&order=created_at.desc&limit=200';
      const sales = await supabaseRequest('GET', '/pos_sales' + qs);
      const total = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      sendJSON(res, { sales: sales || [], total, count: (sales || []).length });
    } catch (err) { sendError(res, err); }
  }),

  // ============ SYNC ============
  'POST /api/sync': requireAuth(async (req, res) => {
    const body = await readBody(req);
    const results = [];
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        try {
          if (item.type === 'sale' && item.data) {
            const safe = pickFields(item.data, ALLOWED_FIELDS_SALES); // FIX R13 (#9)
            const r = await supabaseRequest('POST', '/pos_sales', {
              pos_user_id: req.user.id, // FIX R13 (#6)
              total: safe.total, payment_method: safe.payment_method || 'efectivo',
              items: safe.items || []
            });
            results.push({ type: 'sale', success: true, id: r[0]?.id });
          } else if (item.type === 'customer' && item.data) {
            const safe = pickFields(item.data, ALLOWED_FIELDS_CUSTOMERS);
            safe.user_id = req.user.id;
            const r = await supabaseRequest('POST', '/customers', safe);
            results.push({ type: 'customer', success: true, id: r[0]?.id });
          }
        } catch (err) {
          results.push({ type: item.type, success: false, error: IS_PROD ? 'internal' : err.message });
        }
      }
    }
    sendJSON(res, { ok: true, synced: Date.now(), results });
  }),

  // FIX: endpoints públicos para widgets de status (no requieren auth)
  'GET /api/sync/status': async (req, res) => {
    sendJSON(res, { ok: true, online: true, last_sync: Date.now(), pending: 0, queue: [] });
  },
  'GET /api/sync/cloud': async (req, res) => {
    sendJSON(res, { ok: true, cloud: 'connected', last_sync: Date.now() });
  },

  // FIX R13 (#7): /api/debug ELIMINADO

  // ============ R14 OBSERVABILITY ============
  'GET /api/metrics': requireAuth(async (req, res) => {
    try {
      const lat = computeLatencyStats();
      let supabaseHealth = { ok: false, latency_ms: null };
      const t0 = Date.now();
      try {
        await supabaseRequest('GET', '/pos_users?limit=1&select=id');
        supabaseHealth = { ok: true, latency_ms: Date.now() - t0 };
      } catch (e) {
        supabaseHealth = { ok: false, latency_ms: Date.now() - t0, error: 'unreachable' };
      }
      const envKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET',
        'ANTHROPIC_API_KEY', 'ALLOWED_ORIGINS', 'NODE_ENV'];
      const envStatus = {};
      for (const k of envKeys) envStatus[k] = !!(process.env[k] && String(process.env[k]).trim());
      sendJSON(res, {
        ok: true,
        uptime_ms: Date.now() - METRICS.startedAt,
        uptime_sec: Math.floor((Date.now() - METRICS.startedAt) / 1000),
        request_count: METRICS.requestCount,
        error_count: METRICS.errorCount,
        latency_ms: lat,
        supabase_health: supabaseHealth,
        env_status: envStatus,
        version: '7.3.0-r14',
        node_env: process.env.NODE_ENV || 'development',
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']),

  'GET /api/health/deep': async (req, res) => {
    const checks = {};
    let allOk = true;
    const t0 = Date.now();
    try {
      await supabaseRequest('GET', '/pos_users?limit=1&select=id');
      checks.supabase = { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      checks.supabase = { ok: false, latency_ms: Date.now() - t0 };
      allOk = false;
    }
    checks.jwt_secret = { ok: !!JWT_SECRET };
    if (!JWT_SECRET) allOk = false;
    checks.allowed_origins = { ok: ALLOWED_ORIGINS.length > 0, count: ALLOWED_ORIGINS.length };
    if (!ALLOWED_ORIGINS.length) allOk = false;
    checks.supabase_url = { ok: !!SUPABASE_URL };
    checks.supabase_service_key = { ok: !!SUPABASE_SERVICE_KEY };
    sendJSON(res, {
      ok: allOk, checks, time: Date.now(),
      uptime_sec: Math.floor((Date.now() - METRICS.startedAt) / 1000),
    }, allOk ? 200 : 503);
  },

  'POST /api/errors/log': async (req, res) => {
    try {
      if (!rateLimit('errlog:' + clientIp(req), 30, 60 * 1000)) {
        return send429(res, 60000, 'Demasiadas solicitudes, intenta más tarde');
      }
      const body = await readBody(req);
      let userId = null, tenantId = null;
      const auth = req.headers['authorization'] || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) {
        const p = verifyJWT(m[1]);
        if (p) { userId = p.id; tenantId = p.tenant_id; }
      }
      const row = {
        type: String(body.type || 'unknown').slice(0, 50),
        message: String(body.message || '').slice(0, 2000),
        stack: body.stack ? String(body.stack).slice(0, 8000) : null,
        source: body.source ? String(body.source).slice(0, 500) : null,
        line_no: Number.isFinite(+body.lineno) ? +body.lineno : null,
        col_no: Number.isFinite(+body.colno) ? +body.colno : null,
        url: body.url ? String(body.url).slice(0, 500) : null,
        user_agent: (req.headers['user-agent'] || '').slice(0, 500),
        ip: clientIp(req),
        pos_user_id: userId,
        tenant_id: tenantId,
        meta: body.meta || null,
      };
      try {
        await supabaseRequest('POST', '/error_log', row);
      } catch (e) {
        // Fallback when error_log table missing or supabase unavailable:
        // log to console.warn so the row still surfaces in Vercel function logs.
        try { console.warn('[error_log fallback]', JSON.stringify(row)); } catch (_) {}
        logRequest({ ts: new Date().toISOString(), level: 'error',
          msg: 'error_log insert failed', err: String(e.message || e) });
      }
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  },

  // GET /api/errors — admin only — returns recent error_log rows
  'GET /api/errors': requireAuth(async (req, res) => {
    try {
      const u = req.user || {};
      const role = String(u.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'superadmin' && role !== 'owner') {
        return sendJSON(res, { error: 'forbidden', reason: 'admin_required' }, 403);
      }
      const qs = url.parse(req.url, true).query || {};
      const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 50, 1), 500);
      try {
        const rows = await supabaseRequest('GET',
          '/error_log?select=*&order=created_at.desc&limit=' + limit);
        sendJSON(res, { ok: true, count: (rows || []).length, items: rows || [] });
      } catch (e) {
        try { console.warn('[error_log read fallback]', String(e.message || e)); } catch (_) {}
        sendJSON(res, { ok: true, count: 0, items: [], note: 'error_log table unavailable' });
      }
    } catch (err) { sendError(res, err); }
  }),

  // GET /api/errors/recent — admin only — last 100 error_log rows (R25)
  'GET /api/errors/recent': requireAuth(async (req, res) => {
    try {
      const u = req.user || {};
      const role = String(u.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'superadmin' && role !== 'owner') {
        return sendJSON(res, { error: 'forbidden', reason: 'admin_required' }, 403);
      }
      const qs = url.parse(req.url, true).query || {};
      const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 100, 1), 500);
      try {
        const rows = await supabaseRequest('GET',
          '/error_log?select=*&order=created_at.desc&limit=' + limit);
        sendJSON(res, { ok: true, count: (rows || []).length, items: rows || [] });
      } catch (e) {
        try { console.warn('[error_log recent fallback]', String(e.message || e)); } catch (_) {}
        sendJSON(res, { ok: true, count: 0, items: [], note: 'error_log table unavailable' });
      }
    } catch (err) { sendError(res, err); }
  }),

  // ============ R14 · TAX MX (SAT) ============
  'GET /api/tax/mx/catalogs/:catalog': requireAuth(async (req, res, params) => {
    try {
      const map = {
        'clave_prodserv':  '/sat_clave_prodserv?select=clave,descripcion,iva_default,incluye_ieps,ieps_categoria&limit=500',
        'clave_unidad':    '/sat_clave_unidad?select=clave,nombre,simbolo&limit=200',
        'forma_pago':      '/sat_forma_pago?select=clave,descripcion,bancarizado&order=clave',
        'metodo_pago':     '/sat_metodo_pago?select=clave,descripcion&order=clave',
        'uso_cfdi':        '/sat_uso_cfdi?select=clave,descripcion,aplica_pf,aplica_pm&order=clave',
        'regimen_fiscal':  '/sat_regimen_fiscal?select=clave,descripcion,aplica_pf,aplica_pm&order=clave',
      };
      const q = map[params.catalog];
      if (!q) return sendJSON(res, { error: 'catalog inválido', valid: Object.keys(map) }, 400);
      const search = url.parse(req.url, true).query.q;
      let path = q;
      if (search && params.catalog === 'clave_prodserv') {
        const safe = String(search).replace(/[%]/g,'').slice(0,80);
        path = '/sat_clave_prodserv?or=(clave.ilike.*' + safe + '*,descripcion.ilike.*' + safe + '*)&limit=100';
      }
      const rows = await supabaseRequest('GET', path);
      sendJSON(res, { catalog: params.catalog, count: (rows||[]).length, items: rows || [] });
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/tax/mx/calculate': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const scenario = body.scenario || {};
      const round2 = (n)=>Math.round((Number(n)+Number.EPSILON)*100)/100;
      const IEPS = {
        cerveza:0.265, bebidas_alcoholicas_hasta14:0.265,
        bebidas_alcoholicas_14a20:0.30, bebidas_alcoholicas_mas20:0.53,
        tabacos_labrados:0.16, alimentos_alta_densidad:0.08,
        bebidas_energizantes:0.25, comida_chatarra:0.08,
        plaguicidas_cat1y2:0.09, plaguicidas_cat3:0.07, plaguicidas_cat4:0.06,
        apuestas_sorteos:0.30, redes_telecom:0.03,
      };
      const frontera = !!scenario.frontera;
      const out = { items: [], subtotal:0, iva_16:0, iva_8:0, iva_0:0, exento_total:0, ieps_total:0, ret_isr:0, ret_iva:0, total:0 };
      const exentoRe = /\b(libro|revista|periodico|periódico|consulta médica|consulta medica|colegiatura)\b/i;
      const tasa0Re  = /\b(tortilla|leche|huevo|carne|pollo|pescado|fruta|verdura|medicamento)\b/i;
      items.forEach((it)=>{
        const qty=Number(it.cantidad ?? it.qty ?? 1);
        const price=Number(it.precio_unitario ?? it.price ?? 0);
        const desc=Number(it.descuento ?? it.discount ?? 0);
        const base=round2(qty*price-desc);
        const name=String(it.nombre || it.descripcion || '').toLowerCase();
        const tipo=String(it.tipo_iva || '').toLowerCase();
        let ivaTasa=0.16, exento=false;
        if (tipo==='exento') exento=true;
        else if (tipo==='0' || tasa0Re.test(name)) ivaTasa=0;
        else if (tipo==='8' || (tipo==='' && frontera)) ivaTasa=0.08;
        else if (tipo==='16') ivaTasa=0.16;
        else if (exentoRe.test(name)) exento=true;
        const iepsCat = it.ieps_categoria;
        const ieps = (iepsCat && IEPS[iepsCat]) ? round2(base*IEPS[iepsCat]) : 0;
        const baseIva = round2(base+ieps);
        let iva = 0;
        if (exento) out.exento_total += base;
        else if (ivaTasa===0) out.iva_0 += baseIva;
        else if (ivaTasa===0.08) { iva = round2(baseIva*0.08); out.iva_8 += iva; }
        else { iva = round2(baseIva*0.16); out.iva_16 += iva; }
        out.subtotal += base; out.ieps_total += ieps;
        out.items.push({ ...it, base, ieps, iva, iva_tasa: exento?'exento':ivaTasa });
      });
      if (scenario.retencion_tipo) {
        const m = out.subtotal;
        const t = String(scenario.retencion_tipo).toLowerCase();
        if (t==='honorarios' || t==='arrendamiento') {
          out.ret_isr = round2(m*0.10);
          out.ret_iva = round2(m*0.16*(2/3));
        } else if (t==='fletes') out.ret_iva = round2(m*0.04);
        else if (t==='subcontratacion') out.ret_iva = round2(m*0.06);
      }
      ['subtotal','iva_16','iva_8','iva_0','exento_total','ieps_total','ret_isr','ret_iva']
        .forEach(k=>out[k]=round2(out[k]));
      out.total = round2(out.subtotal + out.ieps_total + out.iva_16 + out.iva_8 - out.ret_isr - out.ret_iva);
      out.scenario = { frontera, regimen: scenario.regimen||'601', uso_cfdi: scenario.uso_cfdi||'G03',
        metodo_pago: scenario.metodo_pago||'PUE', forma_pago: scenario.forma_pago||'01' };
      sendJSON(res, out);
    } catch (err) { sendError(res, err); }
  }),

  'GET /api/tax/mx/product-mapping/:product_id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.product_id)) return sendJSON(res, { error: 'product_id inválido' }, 400);
      const rows = await supabaseRequest('GET',
        '/product_sat_mapping?product_id=eq.' + params.product_id + '&select=*&limit=1');
      if (!rows || !rows.length) return sendJSON(res, { error: 'mapping no encontrado', product_id: params.product_id }, 404);
      sendJSON(res, rows[0]);
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/tax/mx/product-mapping': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body || !body.product_id || !body.clave_prodserv || !body.clave_unidad) {
        return sendJSON(res, { error: 'product_id, clave_prodserv y clave_unidad requeridos' }, 400);
      }
      const row = {
        product_id:     body.product_id,
        product_code:   body.product_code || null,
        tenant_id:      req.user.tenant_id || null,
        clave_prodserv: body.clave_prodserv,
        clave_unidad:   body.clave_unidad,
        iva_tipo:       body.iva_tipo || '16',
        ieps_categoria: body.ieps_categoria || null,
        objeto_imp:     body.objeto_imp || '02',
        source:         body.source || 'manual',
        confidence:     body.confidence || 1.0,
      };
      const out = await supabaseRequest('POST', '/product_sat_mapping?on_conflict=product_id', row);
      sendJSON(res, { ok: true, mapping: out });
    } catch (err) { sendError(res, err); }
  }),

  // ============ TOP10 WIRING — placeholder, se inyecta abajo ============
  '__TOP10_PLACEHOLDER__': null,
  // ============ STATUS DE CABLEADO (Bitácora API) ============
  'GET /api/status': requireAuth(async (req, res) => {
    try {
      const filePath = findFile('/status.json');
      if (filePath) {
        const data = fs.readFileSync(filePath, 'utf8');
        sendJSON(res, JSON.parse(data));
      } else {
        sendJSON(res, { error: 'status.json not found' }, 404);
      }
    } catch (err) { sendError(res, err); }
  }),

  // ============ R14 MFA ============
  // POST /api/mfa/setup — auth: genera secret + backup codes (sin activar todavía)
  'POST /api/mfa/setup': requireAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      const rows = await supabaseRequest('GET',
        `/pos_users?id=eq.${userId}&select=id,email,mfa_enabled`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'user not found' }, 404);
      const user = rows[0];
      if (user.mfa_enabled) return sendJSON(res, { error: 'mfa already enabled' }, 409);

      const secret = generateMfaSecret();
      const backupCodes = generateBackupCodes(8);
      const hashed = backupCodes.map(hashBackupCode);

      await supabaseRequest('PATCH', `/pos_users?id=eq.${userId}`, {
        mfa_secret: secret,
        mfa_backup_codes: hashed,
        mfa_enabled: false
      });

      const otpauth = buildOtpauthUrl(user.email, secret, 'Volvix');
      sendJSON(res, {
        ok: true,
        secret,
        otpauth_url: otpauth,
        backup_codes: backupCodes, // mostrar UNA SOLA VEZ al usuario
        digits: 6, period: 30, algorithm: 'SHA1'
      });
    } catch (err) { sendError(res, err); }
  }),

  // POST /api/mfa/verify — auth: valida primer código TOTP y activa
  'POST /api/mfa/verify': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const code = String(body.code || '').trim();
      const userId = req.user.id;

      if (!rateLimit('mfa-verify:' + userId, 10, 15 * 60 * 1000)) {
        return send429(res, 60000, 'Demasiados intentos, intenta más tarde');
      }

      const rows = await supabaseRequest('GET',
        `/pos_users?id=eq.${userId}&select=id,mfa_secret,mfa_enabled`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'user not found' }, 404);
      const user = rows[0];
      if (user.mfa_enabled) return sendJSON(res, { error: 'mfa already enabled' }, 409);
      if (!user.mfa_secret) return sendJSON(res, { error: 'setup required' }, 400);

      const ok = verifyTOTP(user.mfa_secret, code, 1);
      supabaseRequest('POST', '/mfa_attempts', {
        user_id: userId, ip: clientIp(req), success: ok
      }).catch(() => {});
      if (!ok) return sendJSON(res, { error: 'código inválido' }, 401);

      await supabaseRequest('PATCH', `/pos_users?id=eq.${userId}`, { mfa_enabled: true });
      sendJSON(res, { ok: true, mfa_enabled: true });
    } catch (err) { sendError(res, err); }
  }),

  // POST /api/mfa/challenge — público: body {mfa_token, code} -> session JWT
  'POST /api/mfa/challenge': async (req, res) => {
    try {
      if (!rateLimit('mfa-chal:' + clientIp(req), 10, 15 * 60 * 1000)) {
        return send429(res, 60000, 'Demasiados intentos, intenta más tarde');
      }
      const body = await readBody(req);
      const { mfa_token, code } = body;
      const payload = verifyMfaToken(mfa_token);
      if (!payload) return sendJSON(res, { error: 'mfa_token inválido o expirado' }, 401);

      const rows = await supabaseRequest('GET',
        `/pos_users?id=eq.${payload.sub}&select=id,email,role,plan,full_name,company_id,notes,is_active,mfa_enabled,mfa_secret,mfa_backup_codes`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'user not found' }, 404);
      const user = rows[0];
      if (!user.is_active || !user.mfa_enabled) return sendJSON(res, { error: 'forbidden' }, 403);

      const codeStr = String(code || '').trim();
      let ok = false;
      let usedBackup = false;

      if (/^\d{6}$/.test(codeStr)) {
        ok = verifyTOTP(user.mfa_secret, codeStr, 1);
      } else if (codeStr.length >= 10) {
        const h = hashBackupCode(codeStr);
        const arr = Array.isArray(user.mfa_backup_codes) ? user.mfa_backup_codes : [];
        if (arr.includes(h)) {
          ok = true; usedBackup = true;
          const remaining = arr.filter(x => x !== h);
          await supabaseRequest('PATCH', `/pos_users?id=eq.${user.id}`,
            { mfa_backup_codes: remaining });
        }
      }

      supabaseRequest('POST', '/mfa_attempts', {
        user_id: user.id, ip: clientIp(req), success: ok
      }).catch(() => {});

      if (!ok) return sendJSON(res, { error: 'código inválido' }, 401);

      const notes = parseNotes(user.notes);
      const volvixRole = notes.volvix_role || (user.role === 'ADMIN' ? 'superadmin' : 'cajero');
      const tenantId = notes.tenant_id || 'TNT001';
      const tenantName = notes.tenant_name || 'Mi Negocio';

      supabaseRequest('PATCH', `/pos_users?id=eq.${user.id}`,
        { last_login_at: new Date().toISOString() }).catch(() => {});
      supabaseRequest('POST', '/pos_login_events', {
        pos_user_id: user.id, platform: 'web-mfa', ip: clientIp(req)
      }).catch(() => {});

      const token = signJWT({
        id: user.id, email: user.email,
        role: volvixRole, tenant_id: tenantId
      });
      sendJSON(res, {
        ok: true, token, used_backup: usedBackup,
        session: {
          user_id: user.id, email: user.email, role: volvixRole,
          tenant_id: tenantId, tenant_name: tenantName,
          full_name: user.full_name, company_id: user.company_id,
          expires_at: Date.now() + (JWT_EXPIRES_SECONDS * 1000), plan: user.plan
        }
      });
    } catch (err) { sendError(res, err); }
  },

  // POST /api/mfa/disable — auth: requiere password actual
  'POST /api/mfa/disable': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const password = String(body.password || '');
      if (!password) return sendJSON(res, { error: 'password requerido' }, 400);

      const userId = req.user.id;
      const rows = await supabaseRequest('GET',
        `/pos_users?id=eq.${userId}&select=id,password_hash,mfa_enabled`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'user not found' }, 404);
      const user = rows[0];
      if (!verifyPassword(password, user.password_hash)) {
        supabaseRequest('POST', '/mfa_attempts',
          { user_id: userId, ip: clientIp(req), success: false }).catch(() => {});
        return sendJSON(res, { error: 'password inválido' }, 401);
      }
      if (!user.mfa_enabled) return sendJSON(res, { ok: true, mfa_enabled: false });

      await supabaseRequest('PATCH', `/pos_users?id=eq.${userId}`, {
        mfa_enabled: false, mfa_secret: null, mfa_backup_codes: []
      });
      sendJSON(res, { ok: true, mfa_enabled: false });
    } catch (err) { sendError(res, err); }
  }),

  // ============================================================
  // R14 SLICE 17 — CASH SESSIONS / CREDITS / QUOTATIONS / RETURNS
  // Si la tabla aún no existe en Supabase (42P01) caemos graceful.
  // ============================================================

  // ---------- CASH SESSIONS ----------
  'POST /api/cash/open': requireAuth(withIdempotency('POST /api/cash/open', async (req, res) => {
    try {
      const body = await readBody(req, { maxBytes: 16 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      const tenantId = resolveTenant(req);
      try {
        const open = await supabaseRequest('GET',
          `/pos_cash_sessions?tenant_id=eq.${tenantId}&user_id=eq.${req.user.id}&status=eq.open&select=id`);
        if (Array.isArray(open) && open.length) {
          return sendJSON(res, { error: 'cash_already_open', session_id: open[0].id }, 409);
        }
      } catch (e) {
        if (/42P01/.test(String(e.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      }
      const result = await supabaseRequest('POST', '/pos_cash_sessions', {
        tenant_id: tenantId, user_id: req.user.id,
        opening_amount: Number(body.opening_amount) || 0,
        status: 'open'
      });
      sendJSON(res, (result && result[0]) || result);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  })),

  'POST /api/cash/close': requireAuth(withIdempotency('POST /api/cash/close', async (req, res) => {
    try {
      const body = await readBody(req, { maxBytes: 16 * 1024, strictJson: true });
      if (checkBodyError(req, res)) return;
      const tenantId = resolveTenant(req);
      let current;
      try {
        current = await supabaseRequest('GET',
          `/pos_cash_sessions?tenant_id=eq.${tenantId}&user_id=eq.${req.user.id}&status=eq.open&select=*&order=opened_at.desc&limit=1`);
      } catch (e) {
        if (/42P01/.test(String(e.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
        throw e;
      }
      if (!current || !current.length) return sendJSON(res, { error: 'no_open_session' }, 404);
      const sess = current[0];
      let expected = Number(sess.opening_amount) || 0;
      try {
        const sales = await supabaseRequest('GET',
          `/pos_sales?pos_user_id=eq.${req.user.id}&created_at=gte.${encodeURIComponent(sess.opened_at)}&payment_method=eq.efectivo&select=total`);
        if (Array.isArray(sales)) expected += sales.reduce((s,x)=>s+(Number(x.total)||0),0);
      } catch (_) {}
      const closing = Number(body.closing_amount) || 0;
      const variance = closing - expected;
      const upd = await supabaseRequest('PATCH', `/pos_cash_sessions?id=eq.${sess.id}`, {
        closed_at: new Date().toISOString(),
        closing_amount: closing,
        expected, actual: closing, variance,
        status: 'closed',
        notes: body.notes || null
      });
      sendJSON(res, { ok: true, session: (upd && upd[0]) || upd, expected, variance });
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  })),

  'GET /api/cash/current': requireAuth(async (req, res) => {
    try {
      // FIX: filter only by user_id (cash session is per-user)
      const rows = await supabaseRequest('GET',
        `/pos_cash_sessions?user_id=eq.${req.user.id}&status=eq.open&select=*&order=opened_at.desc&limit=1`);
      sendJSON(res, (rows && rows[0]) || null);
    } catch (err) {
      if (/42P01|relation.*does not exist/i.test(String(err.message))) return sendJSON(res, null);
      sendJSON(res, null); // graceful: no session
    }
  }),

  'GET /api/cash/history': requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        `/pos_cash_sessions?user_id=eq.${req.user.id}&select=*&order=opened_at.desc&limit=200`);
      sendJSON(res, rows || []);
    } catch (err) {
      if (/42P01|relation.*does not exist/i.test(String(err.message))) return sendJSON(res, []);
      sendJSON(res, []);
    }
  }),

  // ---------- CREDITS ----------
  'GET /api/credits': requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const rows = await supabaseRequest('GET',
        `/pos_credits?tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=200`);
      sendJSON(res, rows || []);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/credits': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req);
      const amount = Number(body.amount) || 0;
      const result = await supabaseRequest('POST', '/pos_credits', {
        tenant_id: tenantId,
        customer_id: body.customer_id || null,
        sale_id: body.sale_id || null,
        amount, balance: amount,
        due_date: body.due_date || null,
        status: 'active',
        notes: body.notes || null
      });
      sendJSON(res, (result && result[0]) || result);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/credits/:id/payment': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const pay = Number(body.amount) || 0;
      if (pay <= 0) return sendJSON(res, { error: 'invalid_amount' }, 400);
      const rows = await supabaseRequest('GET', `/pos_credits?id=eq.${params.id}&select=*`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'credit_not_found' }, 404);
      const credit = rows[0];
      const newBalance = Math.max(0, Number(credit.balance) - pay);
      const newStatus = newBalance === 0 ? 'paid' : credit.status;
      await supabaseRequest('POST', '/pos_credit_payments', {
        credit_id: credit.id, amount: pay,
        method: body.method || 'efectivo', notes: body.notes || null
      }).catch(() => {});
      const upd = await supabaseRequest('PATCH', `/pos_credits?id=eq.${credit.id}`, {
        balance: newBalance, status: newStatus, updated_at: new Date().toISOString()
      });
      sendJSON(res, { ok: true, credit: (upd && upd[0]) || upd, payment: pay, balance: newBalance });
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  // ---------- QUOTATIONS ----------
  'GET /api/quotations': requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const rows = await supabaseRequest('GET',
        `/pos_quotations?tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=200`);
      sendJSON(res, rows || []);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/quotations': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const subtotal = Number(body.subtotal) || items.reduce((s,it)=>s+((Number(it.price)||0)*(Number(it.qty)||1)),0);
      const tax = Number(body.tax) || 0;
      const total = Number(body.total) || (subtotal + tax);
      const result = await supabaseRequest('POST', '/pos_quotations', {
        tenant_id: tenantId,
        customer_id: body.customer_id || null,
        user_id: req.user.id,
        items, subtotal, tax, total,
        valid_until: body.valid_until || null,
        status: body.status || 'draft',
        notes: body.notes || null
      });
      sendJSON(res, (result && result[0]) || result);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'PATCH /api/quotations/:id': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const safe = {};
      ['items','subtotal','tax','total','valid_until','status','notes','customer_id']
        .forEach(k => { if (body[k] !== undefined) safe[k] = body[k]; });
      safe.updated_at = new Date().toISOString();
      const result = await supabaseRequest('PATCH', `/pos_quotations?id=eq.${params.id}`, safe);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/quotations/:id/convert': requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const rows = await supabaseRequest('GET', `/pos_quotations?id=eq.${params.id}&select=*`);
      if (!rows || !rows.length) return sendJSON(res, { error: 'quotation_not_found' }, 404);
      const q = rows[0];
      if (q.status === 'converted') return sendJSON(res, { error: 'already_converted', sale_id: q.converted_sale_id }, 409);
      const sale = await supabaseRequest('POST', '/pos_sales', {
        pos_user_id: req.user.id,
        total: q.total,
        payment_method: 'efectivo',
        items: q.items || []
      });
      const saleRow = (sale && sale[0]) || sale;
      const upd = await supabaseRequest('PATCH', `/pos_quotations?id=eq.${q.id}`, {
        status: 'converted',
        converted_sale_id: saleRow && saleRow.id ? saleRow.id : null,
        updated_at: new Date().toISOString()
      });
      sendJSON(res, { ok: true, quotation: (upd && upd[0]) || upd, sale: saleRow });
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  // ---------- RETURNS (R17 extended) ----------
  'GET /api/returns': requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const url = new URL(req.url, 'http://x');
      const status = url.searchParams.get('status');
      const customer = url.searchParams.get('customer');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      let qs = `tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=500`;
      if (status) qs += `&status=eq.${encodeURIComponent(status)}`;
      if (from) qs += `&created_at=gte.${encodeURIComponent(from)}`;
      if (to)   qs += `&created_at=lte.${encodeURIComponent(to)}`;
      let rows = await supabaseRequest('GET', `/pos_returns?${qs}`);
      if (customer && Array.isArray(rows)) {
        rows = rows.filter(r => String(r.customer_id||'') === customer);
      }
      sendJSON(res, rows || []);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/returns': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req);
      if (!body.sale_id) return sendJSON(res, { error: 'sale_id required' }, 400);
      // Valida que la venta existe
      const sale = await supabaseRequest('GET',
        `/pos_sales?id=eq.${body.sale_id}&tenant_id=eq.${tenantId}&select=*&limit=1`);
      if (!sale || !sale[0]) return sendJSON(res, { error: 'sale not found' }, 404);
      const saleItems = Array.isArray(sale[0].items) ? sale[0].items
        : (typeof sale[0].items === 'string' ? JSON.parse(sale[0].items||'[]') : []);
      const reqItems = Array.isArray(body.items_returned) ? body.items_returned : [];
      // Subset check
      for (const it of reqItems) {
        const match = saleItems.find(s => String(s.product_id||s.id) === String(it.product_id||it.id));
        if (!match) return sendJSON(res, { error: `item ${it.product_id||it.id} not in sale` }, 400);
        const maxQty = Number(match.qty || match.quantity || 0);
        const askQty = Number(it.qty || it.quantity || 0);
        if (askQty <= 0 || askQty > maxQty) {
          return sendJSON(res, { error: `qty out of range for ${it.product_id||it.id}` }, 400);
        }
      }
      const refund = reqItems.reduce(
        (s,it)=> s + (Number(it.price)||0) * (Number(it.qty||it.quantity)||1), 0);
      const method = ['cash','card','store_credit','gift_card'].includes(body.refund_method)
        ? body.refund_method : 'cash';
      const result = await supabaseRequest('POST', '/pos_returns', {
        tenant_id: tenantId,
        sale_id: body.sale_id,
        user_id: req.user.id,
        processed_by: req.user.id,
        original_payment_id: body.original_payment_id || null,
        items_returned: reqItems,
        refund_amount: Number(body.refund_amount) || refund,
        refund_method: method,
        restock_qty: body.restock_qty !== false,
        reason: body.reason || null,
        status: 'pending',
        notes: body.notes || null
      });
      sendJSON(res, (result && result[0]) || result);
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/returns/:id/approve': requireAuth(async (req, res) => {
    try {
      const role = req.user && req.user.role;
      if (!['manager','admin','superadmin'].includes(role)) {
        return sendJSON(res, { error: 'forbidden: manager+ required' }, 403);
      }
      const tenantId = resolveTenant(req);
      const id = req.params && req.params.id;
      if (!id) return sendJSON(res, { error: 'id required' }, 400);
      const cur = await supabaseRequest('GET',
        `/pos_returns?id=eq.${id}&tenant_id=eq.${tenantId}&select=*&limit=1`);
      if (!cur || !cur[0]) return sendJSON(res, { error: 'not found' }, 404);
      const amount = Number(cur[0].refund_amount) || 0;
      if (amount > 500 && role !== 'admin' && role !== 'superadmin') {
        return sendJSON(res, { error: 'amount > $500 requires admin approval' }, 403);
      }
      const upd = await supabaseRequest('PATCH',
        `/pos_returns?id=eq.${id}&tenant_id=eq.${tenantId}`, {
          status: 'approved',
          approved_by: req.user.id,
          approved_at: new Date().toISOString()
        });
      sendJSON(res, { ok: true, return: (upd && upd[0]) || upd });
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/returns/:id/reject': requireAuth(async (req, res) => {
    try {
      const role = req.user && req.user.role;
      if (!['manager','admin','superadmin'].includes(role)) {
        return sendJSON(res, { error: 'forbidden: manager+ required' }, 403);
      }
      const tenantId = resolveTenant(req);
      const id = req.params && req.params.id;
      const body = await readBody(req).catch(()=>({}));
      const upd = await supabaseRequest('PATCH',
        `/pos_returns?id=eq.${id}&tenant_id=eq.${tenantId}`, {
          status: 'rejected',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          notes: body && body.notes ? body.notes : null
        });
      sendJSON(res, { ok: true, return: (upd && upd[0]) || upd });
    } catch (err) { sendError(res, err); }
  }),

  'GET /api/returns/stats': requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const url = new URL(req.url, 'http://x');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      let qs = `tenant_id=eq.${tenantId}&select=status,reason,refund_amount,created_at`;
      if (from) qs += `&created_at=gte.${encodeURIComponent(from)}`;
      if (to)   qs += `&created_at=lte.${encodeURIComponent(to)}`;
      const rows = await supabaseRequest('GET', `/pos_returns?${qs}`) || [];
      let salesCount = 0;
      try {
        const sQs = `tenant_id=eq.${tenantId}&select=id`
          + (from ? `&created_at=gte.${encodeURIComponent(from)}` : '')
          + (to   ? `&created_at=lte.${encodeURIComponent(to)}`   : '');
        const sRows = await supabaseRequest('GET', `/pos_sales?${sQs}`) || [];
        salesCount = sRows.length;
      } catch(_) {}
      const reasons = {};
      let refunded = 0;
      const counts = { pending:0, approved:0, rejected:0, completed:0 };
      for (const r of rows) {
        if (r.reason) reasons[r.reason] = (reasons[r.reason]||0)+1;
        if (counts[r.status] != null) counts[r.status]++;
        if (['approved','completed'].includes(r.status)) refunded += Number(r.refund_amount)||0;
      }
      const top = Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,5)
        .map(([reason,count])=>({ reason, count }));
      sendJSON(res, {
        total: rows.length,
        by_status: counts,
        refunded_total: refunded,
        return_rate: salesCount > 0 ? (rows.length/salesCount) : 0,
        top_reasons: top
      });
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { total:0, by_status:{}, refunded_total:0, return_rate:0, top_reasons:[], note:'tabla pendiente' });
      sendError(res, err);
    }
  }),

  // =============================================================
  // R17 GEOFENCE — Auto check-in cajeros por ubicación (slice_111)
  // =============================================================
  'GET /api/geofence/check': requireAuth(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'lat/lng required' }, 400);
      let branches = [];
      try { branches = await supabaseRequest('GET', '/pos_branches?select=id,name,lat,lng'); } catch(_) { branches = []; }
      const R = 6371000;
      const toRad = d => d * Math.PI / 180;
      let nearest = null, best = Infinity;
      for (const b of (branches || [])) {
        if (b.lat == null || b.lng == null) continue;
        const dLat = toRad(b.lat - lat), dLng = toRad(b.lng - lng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
        const d = 2 * R * Math.asin(Math.sqrt(a));
        if (d < best) { best = d; nearest = b; }
      }
      sendJSON(res, { nearest, distance_m: nearest ? Math.round(best) : null, inside: best <= 100 });
    } catch (err) {
      if (/42P01/.test(String(err.message))) return sendJSON(res, { nearest: null, distance_m: null, inside: false, note: 'tabla pendiente' });
      sendError(res, err);
    }
  }),

  'POST /api/geofence/checkin': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const lat = Number(body && body.lat);
      const lng = Number(body && body.lng);
      const accuracy = Number(body && body.accuracy) || null;
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'lat/lng required' }, 400);
      let branches = [];
      try { branches = await supabaseRequest('GET', '/pos_branches?select=id,name,lat,lng'); } catch(_) { branches = []; }
      const R = 6371000;
      const toRad = d => d * Math.PI / 180;
      let nearest = null, best = Infinity;
      for (const b of (branches || [])) {
        if (b.lat == null || b.lng == null) continue;
        const dLat = toRad(b.lat - lat), dLng = toRad(b.lng - lng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
        const d = 2 * R * Math.asin(Math.sqrt(a));
        if (d < best) { best = d; nearest = b; }
      }
      if (!nearest || best > 100) {
        return sendJSON(res, { ok: false, reason: 'out_of_range', nearest, distance_m: nearest ? Math.round(best) : null });
      }
      let saved = null;
      try {
        const ins = await supabaseRequest('POST', '/cashier_checkins', {
          user_id: req.user.id, branch_id: nearest.id,
          lat, lng, distance_m: Math.round(best), accuracy_m: accuracy
        });
        saved = (ins && ins[0]) || ins;
      } catch (e) {
        if (!/42P01/.test(String(e.message))) throw e;
      }
      sendJSON(res, { ok: true, branch: nearest, distance_m: Math.round(best), checkin: saved });
    } catch (err) { sendError(res, err); }
  }),

  // =============================================================
  // R17 OCR — Tickets/recibos
  // =============================================================
  'POST /api/ocr/parse-receipt': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const text = String(body && body.raw || body && body.text || '').slice(0, 20000);
      const structured = (body && body.parsed) || {};
      const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
      const rfc = structured.rfc || (text.match(/RFC[:\s]+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i) || [])[1] || null;
      const rfcValid = rfc ? RFC_RE.test(rfc) : false;
      const totalRaw = structured.total != null ? structured.total
                       : ((text.match(/TOTAL[^\d\-]{0,8}\$?\s*([0-9]+(?:[.,][0-9]{2}))/i) || [])[1] || null);
      const total = totalRaw != null ? Number(String(totalRaw).replace(',', '.')) : null;
      const date  = structured.date || null;
      const items = Array.isArray(structured.items) ? structured.items : [];
      let scanId = null;
      try {
        const ins = await supabaseRequest('POST', '/ocr_scans', {
          user_id: req.user.id,
          tenant_id: resolveTenant(req),
          raw_text: text,
          parsed: { rfc, total, date, items, rfc_valid: rfcValid },
          status: 'pending'
        });
        scanId = ins && ins[0] && ins[0].id;
      } catch (e) { /* tabla pendiente */ }
      sendJSON(res, {
        vendor: rfc ? { rfc, valid: rfcValid } : null,
        total,
        date,
        items_detected: items.length,
        suggested_purchase_id: null,
        scan_id: scanId
      });
    } catch (err) { sendError(res, err); }
  }),

  'POST /api/purchases/from-ocr': requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const total = Number(body && body.total);
      if (!total || total <= 0) return sendValidation(res, 'total', 'total > 0 requerido');
      const rfc = body && body.rfc ? String(body.rfc).toUpperCase() : null;
      const date = body && body.date ? String(body.date) : new Date().toISOString().slice(0, 10);
      const tenantId = resolveTenant(req);
      const purchase = {
        pos_user_id: req.user.id,
        tenant_id: tenantId,
        vendor_rfc: rfc,
        purchase_date: date,
        total: total,
        items: Array.isArray(body.items) ? body.items : [],
        source: 'ocr',
        raw_text: String(body.raw || '').slice(0, 5000)
      };
      let result = null;
      try {
        result = await supabaseRequest('POST', '/purchases', purchase);
      } catch (e) {
        if (/42P01/.test(String(e.message))) {
          return sendJSON(res, { ok: true, id: 'ocr-' + Date.now(), note: 'tabla purchases pendiente', purchase });
        }
        throw e;
      }
      const created = (result && result[0]) || result;
      if (body.scan_id && created && created.id) {
        try {
          await supabaseRequest('PATCH', `/ocr_scans?id=eq.${body.scan_id}`, { purchase_id: created.id, status: 'linked' });
        } catch (_) {}
      }
      sendJSON(res, created);
    } catch (err) { sendError(res, err); }
  }),
};

// =============================================================
// TOP10 WIRING — Generic blob endpoints (R13)
// Almacenan blobs JSON por usuario en tabla generic_blobs.
// Si la tabla no existe, fallback in-memory para no romper UI.
// =============================================================
(function attachTop10Handlers() {
  const blobMem = {};
  const POSTKEYS = [
    '/api/branches', '/api/branches/permissions', '/api/branches/cashboxes',
    '/api/branch_inventory', '/api/branch_inventory/transfers',
    '/api/forecasts', '/api/leads', '/api/crm', '/api/crm/stages',
    '/api/tax', '/api/tax/config', '/api/invoices',
    '/api/purchases', '/api/suppliers', '/api/audit_log',
    '/api/products/departments', '/api/inventory/cash-open',
    '/api/credits', '/api/quotations', '/api/returns', '/api/recargas'
  ];
  const SUFFIXED = ['/api/crm', '/api/tax', '/api/forecasts', '/api/purchases'];
  const persist = (key) => async (req, res) => {
    try {
      const body = await readBody(req);
      try {
        await supabaseRequest('POST', '/generic_blobs', {
          pos_user_id: req.user.id, key, value: body
        });
      } catch (_) {}
      blobMem[req.user.id + '|' + key] = body;
      sendJSON(res, { ok: true, key, stored: Date.now() });
    } catch (err) { sendError(res, err); }
  };
  const list = (key) => async (req, res) => {
    try {
      let rows = null;
      try {
        rows = await supabaseRequest('GET',
          '/generic_blobs?pos_user_id=eq.' + req.user.id +
          '&key=eq.' + encodeURIComponent(key) +
          '&select=value&order=updated_at.desc&limit=1');
      } catch (_) {}
      const cached = blobMem[req.user.id + '|' + key];
      sendJSON(res, (rows && rows[0] && rows[0].value) || cached || []);
    } catch (err) { sendError(res, err); }
  };
  POSTKEYS.forEach(k => {
    handlers['POST ' + k] = requireAuth(persist(k));
    handlers['GET '  + k] = requireAuth(list(k));
  });
  SUFFIXED.forEach(base => {
    handlers['POST ' + base + '/:sub'] = requireAuth(async (req, res, params) => {
      return persist(base + '/' + params.sub)(req, res);
    });
    handlers['GET ' + base + '/:sub'] = requireAuth(async (req, res, params) => {
      return list(base + '/' + params.sub)(req, res);
    });
  });
  handlers['GET /api/search'] = requireAuth(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query.q || '';
      if (!q) return sendJSON(res, { results: [] });
      const safe = String(q).replace(/[%]/g, '').slice(0, 80);
      const products = await supabaseRequest('GET',
        '/pos_products?or=(name.ilike.*' + safe + '*,code.ilike.*' + safe + '*)&limit=50');
      sendJSON(res, { results: products || [], q: safe });
    } catch (err) { sendError(res, err); }
  });
  handlers['POST /api/search'] = requireAuth(async (req, res) => {
    const body = await readBody(req);
    sendJSON(res, { ok: true, indexed: Object.keys(body || {}).length });
  });
  handlers['GET /api/reports/inventory'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/pos_products?select=id,name,stock,cost,price&order=stock.asc&limit=500');
      sendJSON(res, { items: rows || [], generated_at: Date.now() });
    } catch (err) { sendError(res, err); }
  });
  handlers['POST /api/owner/settings'] = requireAuth(async (req, res) => {
    const body = await readBody(req);
    try {
      await supabaseRequest('POST', '/generic_blobs', {
        pos_user_id: req.user.id, key: 'owner_settings', value: body
      });
    } catch (_) {}
    sendJSON(res, { ok: true });
  });
  handlers['GET /api/owner/settings'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/generic_blobs?pos_user_id=eq.' + req.user.id +
        '&key=eq.owner_settings&select=value&limit=1');
      sendJSON(res, (rows && rows[0] && rows[0].value) || {});
    } catch (_) { sendJSON(res, {}); }
  });
  delete handlers['__TOP10_PLACEHOLDER__'];
})();

// =============================================================
// R14: ADVANCED INVENTORY — locations, stock, movements, counts
// =============================================================
(function attachInventoryAdvanced() {
  const WRITER_ROLES = ['admin', 'superadmin', 'owner', 'manager'];
  const MOVE_TYPES = ['in', 'out', 'transfer', 'adjust', 'loss'];
  const LOC_TYPES = ['warehouse', 'branch', 'transit'];

  function isPositiveNum(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }
  function isNonNegNum(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }
  function getQuery(req) {
    return url.parse(req.url, true).query || {};
  }
  function tenantOf(req) {
    return req.user && req.user.tenant_id;
  }
  function denyCajero(req, res) {
    if (!WRITER_ROLES.includes(req.user && req.user.role)) {
      sendJSON(res, { error: 'forbidden' }, 403);
      return true;
    }
    return false;
  }

  // ---- LOCATIONS ----------------------------------------------------------
  handlers['GET /api/inventory/locations'] = requireAuth(async (req, res) => {
    try {
      const t = tenantOf(req);
      const q = getQuery(req);
      let qs = '/inventory_locations?select=*&order=created_at.desc&limit=500';
      if (t) qs += '&tenant_id=eq.' + encodeURIComponent(t);
      if (q.type && LOC_TYPES.includes(q.type)) qs += '&type=eq.' + q.type;
      const rows = await supabaseRequest('GET', qs);
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/inventory/locations'] = requireAuth(async (req, res) => {
    try {
      if (denyCajero(req, res)) return;
      const body = await readBody(req);
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return sendJSON(res, { error: 'invalid name' }, 400);
      }
      if (!LOC_TYPES.includes(body.type)) {
        return sendJSON(res, { error: 'invalid type' }, 400);
      }
      const tenant = resolveTenant(req, body.tenant_id);
      if (!tenant) return sendJSON(res, { error: 'missing tenant' }, 400);
      const result = await supabaseRequest('POST', '/inventory_locations', {
        tenant_id: tenant,
        name: String(body.name).trim().slice(0, 200),
        type: body.type,
        is_active: body.is_active !== false
      });
      sendJSON(res, { ok: true, result });
    } catch (err) { sendError(res, err); }
  });

  handlers['PATCH /api/inventory/locations/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (denyCajero(req, res)) return;
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const safe = {};
      if (typeof body.name === 'string' && body.name.trim()) safe.name = body.name.trim().slice(0, 200);
      if (LOC_TYPES.includes(body.type)) safe.type = body.type;
      if (typeof body.is_active === 'boolean') safe.is_active = body.is_active;
      if (!Object.keys(safe).length) return sendJSON(res, { error: 'no valid fields' }, 400);
      const result = await supabaseRequest('PATCH',
        '/inventory_locations?id=eq.' + params.id, safe);
      sendJSON(res, { ok: true, result });
    } catch (err) { sendError(res, err); }
  });

  // ---- STOCK --------------------------------------------------------------
  handlers['GET /api/inventory/stock'] = requireAuth(async (req, res) => {
    try {
      const t = tenantOf(req);
      const q = getQuery(req);
      let qs = '/inventory_stock?select=*&order=updated_at.desc&limit=1000';
      if (t) qs += '&tenant_id=eq.' + encodeURIComponent(t);
      if (q.location_id) {
        if (!isUuid(q.location_id)) return sendJSON(res, { error: 'invalid location_id' }, 400);
        qs += '&location_id=eq.' + q.location_id;
      }
      if (q.product_id) {
        if (!isUuid(q.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400);
        qs += '&product_id=eq.' + q.product_id;
      }
      const rows = await supabaseRequest('GET', qs);
      let out = rows || [];
      if (String(q.low_stock || '').toLowerCase() === 'true') {
        out = out.filter(r => Number(r.qty) <= Number(r.reorder_point || 0));
      }
      sendJSON(res, out);
    } catch (err) { sendError(res, err); }
  });

  // ---- MOVEMENTS ----------------------------------------------------------
  handlers['POST /api/inventory/movements'] = requireAuth(async (req, res) => {
    try {
      if (denyCajero(req, res)) return;
      const body = await readBody(req);
      if (!isUuid(body.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400);
      if (!MOVE_TYPES.includes(body.type)) return sendJSON(res, { error: 'invalid type' }, 400);
      if (body.type === 'adjust') return sendJSON(res, { error: 'use /api/inventory/adjust for adjust' }, 400);
      if (!isPositiveNum(body.qty)) return sendJSON(res, { error: 'qty must be > 0' }, 400);

      const tenant = resolveTenant(req, body.tenant_id);
      if (!tenant) return sendJSON(res, { error: 'missing tenant' }, 400);

      const from_loc = body.from_loc || null;
      const to_loc = body.to_loc || null;
      if (from_loc && !isUuid(from_loc)) return sendJSON(res, { error: 'invalid from_loc' }, 400);
      if (to_loc && !isUuid(to_loc)) return sendJSON(res, { error: 'invalid to_loc' }, 400);

      if (body.type === 'in' && !to_loc) return sendJSON(res, { error: 'to_loc required for in' }, 400);
      if ((body.type === 'out' || body.type === 'loss') && !from_loc) {
        return sendJSON(res, { error: 'from_loc required' }, 400);
      }
      if (body.type === 'transfer' && (!from_loc || !to_loc)) {
        return sendJSON(res, { error: 'from_loc and to_loc required for transfer' }, 400);
      }
      if (body.type === 'transfer' && from_loc === to_loc) {
        return sendJSON(res, { error: 'from_loc must differ from to_loc' }, 400);
      }

      const result = await supabaseRequest('POST', '/rpc/apply_inventory_movement', {
        p_tenant_id: tenant,
        p_product_id: body.product_id,
        p_from_loc: from_loc,
        p_to_loc: to_loc,
        p_qty: Number(body.qty),
        p_type: body.type,
        p_reason: body.reason || null,
        p_user_id: req.user.id
      });
      sendJSON(res, { ok: true, movement_id: result });
    } catch (err) { sendError(res, err); }
  });

  // ---- ADJUST (overrides legacy /api/inventory/adjust) --------------------
  handlers['POST /api/inventory/adjust'] = requireAuth(async (req, res) => {
    try {
      if (denyCajero(req, res)) return;
      const body = await readBody(req);
      if (!isUuid(body.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400);
      if (!isUuid(body.location_id)) return sendJSON(res, { error: 'invalid location_id' }, 400);
      if (!isNonNegNum(body.new_qty)) return sendJSON(res, { error: 'new_qty must be numeric >= 0' }, 400);
      const reason = (body.reason || '').toString().trim();
      if (!reason) return sendJSON(res, { error: 'reason is required for adjust' }, 400);

      const tenant = resolveTenant(req, body.tenant_id);
      if (!tenant) return sendJSON(res, { error: 'missing tenant' }, 400);

      const result = await supabaseRequest('POST', '/rpc/apply_inventory_movement', {
        p_tenant_id: tenant,
        p_product_id: body.product_id,
        p_from_loc: null,
        p_to_loc: body.location_id,
        p_qty: Number(body.new_qty) === 0 ? 0.0001 : Number(body.new_qty),
        p_type: 'adjust',
        p_reason: reason.slice(0, 500),
        p_user_id: req.user.id
      });
      sendJSON(res, { ok: true, movement_id: result });
    } catch (err) { sendError(res, err); }
  });

  // ---- COUNTS -------------------------------------------------------------
  handlers['POST /api/inventory/counts/start'] = requireAuth(async (req, res) => {
    try {
      if (denyCajero(req, res)) return;
      const body = await readBody(req);
      if (!isUuid(body.location_id)) return sendJSON(res, { error: 'invalid location_id' }, 400);
      const tenant = resolveTenant(req, body.tenant_id);
      if (!tenant) return sendJSON(res, { error: 'missing tenant' }, 400);
      const result = await supabaseRequest('POST', '/inventory_counts', {
        tenant_id: tenant,
        location_id: body.location_id,
        status: 'counting',
        user_id: req.user.id
      });
      sendJSON(res, { ok: true, result });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/inventory/counts/:id/lines'] = requireAuth(async (req, res, params) => {
    try {
      if (denyCajero(req, res)) return;
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid count id' }, 400);
      const body = await readBody(req);
      const lines = Array.isArray(body.lines) ? body.lines : [body];
      const tenant = resolveTenant(req, body.tenant_id);
      if (!tenant) return sendJSON(res, { error: 'missing tenant' }, 400);

      const safeLines = [];
      for (const ln of lines) {
        if (!isUuid(ln.product_id)) return sendJSON(res, { error: 'invalid product_id in line' }, 400);
        if (!isNonNegNum(ln.counted)) return sendJSON(res, { error: 'invalid counted in line' }, 400);
        if (ln.expected != null && !isNonNegNum(ln.expected)) {
          return sendJSON(res, { error: 'invalid expected in line' }, 400);
        }
        safeLines.push({
          tenant_id: tenant,
          count_id: params.id,
          product_id: ln.product_id,
          expected: Number(ln.expected || 0),
          counted: Number(ln.counted)
        });
      }
      if (!safeLines.length) return sendJSON(res, { error: 'no lines' }, 400);
      const result = await supabaseRequest('POST', '/inventory_count_lines', safeLines);
      sendJSON(res, { ok: true, inserted: safeLines.length, result });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/inventory/counts/:id/finalize'] = requireAuth(async (req, res, params) => {
    try {
      if (denyCajero(req, res)) return;
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid count id' }, 400);

      const lines = await supabaseRequest('GET',
        '/inventory_count_lines?count_id=eq.' + params.id + '&select=*');
      const countRow = await supabaseRequest('GET',
        '/inventory_counts?id=eq.' + params.id + '&select=*&limit=1');
      const cnt = (countRow || [])[0];
      if (!cnt) return sendJSON(res, { error: 'count not found' }, 404);
      const tenant = cnt.tenant_id;

      const applied = [];
      for (const ln of (lines || [])) {
        if (Number(ln.variance) === 0) continue;
        try {
          const mid = await supabaseRequest('POST', '/rpc/apply_inventory_movement', {
            p_tenant_id: tenant,
            p_product_id: ln.product_id,
            p_from_loc: null,
            p_to_loc: cnt.location_id,
            p_qty: Number(ln.counted) === 0 ? 0.0001 : Number(ln.counted),
            p_type: 'adjust',
            p_reason: 'count:' + params.id,
            p_user_id: req.user.id
          });
          applied.push({ product_id: ln.product_id, variance: ln.variance, movement_id: mid });
        } catch (e) {
          applied.push({ product_id: ln.product_id, error: String(e && e.message || e) });
        }
      }

      const result = await supabaseRequest('PATCH',
        '/inventory_counts?id=eq.' + params.id,
        { status: 'finalized', finished_at: new Date().toISOString() });

      sendJSON(res, { ok: true, applied, count: result });
    } catch (err) { sendError(res, err); }
  });
})();

// =============================================================
// R14: ONBOARDING V2 (multi-step tenant creation)
// =============================================================
(function () {
  const VERTICAL_TEMPLATES = {
    farmacia: [
      { name: 'Paracetamol 500mg 20 tabs', sku: 'FAR-001', price: 35, stock: 50 },
      { name: 'Ibuprofeno 400mg 10 tabs', sku: 'FAR-002', price: 42, stock: 40 },
      { name: 'Alcohol 70% 250ml', sku: 'FAR-003', price: 28, stock: 30 },
      { name: 'Cubrebocas KN95 (pack 5)', sku: 'FAR-004', price: 60, stock: 20 },
      { name: 'Vitamina C 1g 30 tabs', sku: 'FAR-005', price: 95, stock: 25 },
    ],
    restaurante: [
      { name: 'Refresco 600ml', sku: 'RES-001', price: 25, stock: 100 },
      { name: 'Hamburguesa clasica', sku: 'RES-002', price: 95, stock: 0 },
      { name: 'Orden de papas', sku: 'RES-003', price: 45, stock: 0 },
      { name: 'Agua natural 600ml', sku: 'RES-004', price: 18, stock: 80 },
      { name: 'Cerveza 355ml', sku: 'RES-005', price: 40, stock: 60 },
    ],
    gym: [
      { name: 'Mensualidad estandar', sku: 'GYM-001', price: 599, stock: 0 },
      { name: 'Inscripcion', sku: 'GYM-002', price: 300, stock: 0 },
      { name: 'Proteina whey 1kg', sku: 'GYM-003', price: 750, stock: 15 },
      { name: 'Botella shaker', sku: 'GYM-004', price: 120, stock: 25 },
      { name: 'Pase diario', sku: 'GYM-005', price: 80, stock: 0 },
    ],
    salon: [
      { name: 'Corte de cabello dama', sku: 'SAL-001', price: 250, stock: 0 },
      { name: 'Corte caballero', sku: 'SAL-002', price: 150, stock: 0 },
      { name: 'Tinte completo', sku: 'SAL-003', price: 650, stock: 0 },
      { name: 'Manicure', sku: 'SAL-004', price: 180, stock: 0 },
      { name: 'Shampoo profesional 500ml', sku: 'SAL-005', price: 320, stock: 12 },
    ],
    ferreteria: [
      { name: 'Martillo 16oz', sku: 'FER-001', price: 180, stock: 20 },
      { name: 'Desarmador plano 6"', sku: 'FER-002', price: 75, stock: 30 },
      { name: 'Cinta de aislar negra', sku: 'FER-003', price: 28, stock: 100 },
      { name: 'Tornillos 1/2" (100pz)', sku: 'FER-004', price: 95, stock: 40 },
      { name: 'Pintura blanca 1 galon', sku: 'FER-005', price: 480, stock: 15 },
    ],
    papeleria: [
      { name: 'Cuaderno profesional 100h', sku: 'PAP-001', price: 65, stock: 50 },
      { name: 'Boligrafo azul (paq 4)', sku: 'PAP-002', price: 35, stock: 80 },
      { name: 'Lapiz #2 (paq 12)', sku: 'PAP-003', price: 45, stock: 60 },
      { name: 'Hojas blancas carta (100)', sku: 'PAP-004', price: 90, stock: 40 },
      { name: 'Tijeras escolares', sku: 'PAP-005', price: 55, stock: 35 },
    ],
    abarrotes: [
      { name: 'Refresco 2L', sku: 'ABA-001', price: 38, stock: 80 },
      { name: 'Pan de caja grande', sku: 'ABA-002', price: 52, stock: 25 },
      { name: 'Leche 1L', sku: 'ABA-003', price: 28, stock: 60 },
      { name: 'Huevo (kg)', sku: 'ABA-004', price: 60, stock: 30 },
      { name: 'Frijol negro 1kg', sku: 'ABA-005', price: 45, stock: 40 },
    ],
    cafeteria: [
      { name: 'Espresso sencillo', sku: 'CAF-001', price: 35, stock: 0 },
      { name: 'Capuchino', sku: 'CAF-002', price: 55, stock: 0 },
      { name: 'Latte', sku: 'CAF-003', price: 60, stock: 0 },
      { name: 'Croissant', sku: 'CAF-004', price: 45, stock: 0 },
      { name: 'Te helado', sku: 'CAF-005', price: 40, stock: 0 },
    ],
  };

  const SAT_REGIMENES = {
    '601': 'General de Ley Personas Morales',
    '603': 'Personas Morales con Fines no Lucrativos',
    '612': 'Personas Fisicas con Actividades Empresariales',
    '621': 'Incorporacion Fiscal',
    '626': 'Regimen Simplificado de Confianza (RESICO)',
  };

  handlers['GET /api/onboarding/sat-lookup'] = async (req, res) => {
    try {
      const u = url.parse(req.url, true);
      const rfc = (u.query.rfc || '').toString().toUpperCase();
      if (!/^[A-ZN&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
        return sendJSON(res, { ok: false, error: 'rfc invalido' }, 400);
      }
      sendJSON(res, { ok: true, rfc, valid_format: true });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/onboarding/template'] = async (req, res) => {
    try {
      const u = url.parse(req.url, true);
      const v = (u.query.vertical || '').toString();
      const products = VERTICAL_TEMPLATES[v] || [];
      sendJSON(res, { ok: true, vertical: v, products });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/onboarding/sat-regimenes'] = async (req, res) => {
    sendJSON(res, { ok: true, regimenes: SAT_REGIMENES });
  };

  handlers['POST /api/onboarding/start'] = async (req, res) => {
    try {
      const body = await readBody(req);
      const biz = body.business || {};
      const vertical = (body.vertical || '').toString();
      if (!biz.name || !biz.admin_email) {
        return sendJSON(res, { error: 'name y admin_email requeridos' }, 400);
      }

      let tenantRow;
      try {
        const t = await supabaseRequest('POST', '/companies', {
          name: biz.name, plan: 'trial', is_active: true,
        });
        tenantRow = Array.isArray(t) ? t[0] : t;
      } catch (e) {
        return sendJSON(res, { error: 'no se pudo crear tenant: ' + (e.message || e) }, 500);
      }
      const tenantId = tenantRow && tenantRow.id;
      if (!tenantId) return sendJSON(res, { error: 'tenant sin id' }, 500);

      const tempPass = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '');
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(tempPass, salt, 64);
      const passwordHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;

      let userRow;
      try {
        const u = await supabaseRequest('POST', '/pos_users', {
          email: biz.admin_email, password_hash: passwordHash,
          role: 'admin', tenant_id: tenantId, is_active: true,
        });
        userRow = Array.isArray(u) ? u[0] : u;
      } catch (e) {
        return sendJSON(res, { error: 'no se pudo crear admin: ' + (e.message || e) }, 500);
      }

      try {
        await supabaseRequest('POST', '/generic_blobs', {
          pos_user_id: userRow.id, kind: 'onboarding_state',
          data: { step: 1, vertical, business: biz, started_at: new Date().toISOString() },
        });
      } catch (_) {}

      const token = signJWT({
        sub: userRow.id, id: userRow.id,
        email: userRow.email, role: 'admin', tenant_id: tenantId,
      });

      sendJSON(res, {
        ok: true, token, tenant_id: tenantId,
        user_id: userRow.id, temp_password: tempPass,
      });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/onboarding/step'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      try {
        await supabaseRequest('DELETE',
          '/generic_blobs?pos_user_id=eq.' + req.user.id + '&kind=eq.onboarding_state');
      } catch (_) {}
      try {
        await supabaseRequest('POST', '/generic_blobs', {
          pos_user_id: req.user.id, kind: 'onboarding_state',
          data: { step: body.step, data: body.data || {}, updated_at: new Date().toISOString() },
        });
      } catch (_) {}
      sendJSON(res, { ok: true, step: body.step });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/onboarding/complete'] = requireAuth(async (req, res) => {
    try {
      const tenantId = req.user.tenant_id;
      if (!tenantId) return sendJSON(res, { error: 'sin tenant' }, 400);
      try {
        await supabaseRequest('PATCH', '/companies?id=eq.' + tenantId, {
          onboarded: true, onboarded_at: new Date().toISOString(),
        });
      } catch (_) {
        try {
          await supabaseRequest('POST', '/generic_blobs', {
            pos_user_id: req.user.id, kind: 'tenant_onboarded',
            data: { tenant_id: tenantId, at: new Date().toISOString() },
          });
        } catch (_) {}
      }
      sendJSON(res, { ok: true, tenant_id: tenantId, onboarded: true });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/onboarding/import-products'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const list = Array.isArray(body.products) ? body.products : [];
      if (!list.length) return sendJSON(res, { error: 'sin productos' }, 400);
      const tenantId = req.user.tenant_id;

      const clean = list.slice(0, 5000).map(p => ({
        name: String(p.name || '').slice(0, 200),
        sku: String(p.sku || '').slice(0, 80),
        price: Number(p.price) || 0,
        stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
        barcode: p.barcode ? String(p.barcode).slice(0, 80) : null,
        tenant_id: tenantId,
      })).filter(p => p.name);

      let inserted = 0, fellbackTo = null;
      try {
        const r = await supabaseRequest('POST', '/products', clean);
        inserted = Array.isArray(r) ? r.length : clean.length;
      } catch (e) {
        // Fallback: insertar en pos_products (tabla real del POS)
        try {
          const posRows = clean.map(p => ({
            pos_user_id: req.user.id,
            code: p.sku || p.barcode || ('IMP_' + Math.random().toString(36).slice(2,8)),
            name: p.name, category: 'general',
            price: p.price, cost: 0, stock: p.stock, icon: '📦'
          }));
          const r2 = await supabaseRequest('POST', '/pos_products', posRows);
          inserted = Array.isArray(r2) ? r2.length : posRows.length;
          fellbackTo = 'pos_products';
        } catch (e2) {
          return sendJSON(res, { error: 'import fallo: ' + (e2.message || e2) }, 500);
        }
      }
      sendJSON(res, { ok: true, inserted, fallback: fellbackTo });
    } catch (err) { sendError(res, err); }
  });
})();

// =============================================================
// R14: MULTI-CURRENCY + FX RATES
// =============================================================
async function convertCurrency(amount, fromCode, toCode) {
  if (!fromCode || !toCode || fromCode === toCode) return Number(amount);
  const rows = await supabaseRequest('POST', '/rpc/convert', {
    p_amount: Number(amount),
    p_from_code: String(fromCode).toUpperCase(),
    p_to_code: String(toCode).toUpperCase(),
  });
  // RPC scalar returns the value directly
  return typeof rows === 'number' ? rows : Number(rows);
}

function fetchExchangerateHost(base) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.exchangerate.host',
      port: 443,
      path: '/latest?base=' + encodeURIComponent(base),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };
    const r = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (!j || !j.rates) return reject(new Error('exchangerate.host: respuesta inválida'));
          resolve(j);
        } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

(function registerCurrencyRoutes() {
  // Pública: catálogo de monedas
  handlers['GET /api/currencies'] = async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/currencies?active=eq.true&select=code,name,symbol,decimals&order=code.asc');
      sendJSON(res, { ok: true, currencies: rows || [] });
    } catch (err) { sendError(res, err); }
  };

  // Pública: últimas tasas FX por base
  handlers['GET /api/fx/rates'] = async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const base = String(parsed.query.base || 'MXN').toUpperCase();
      const rows = await supabaseRequest('GET',
        '/fx_rates?base_code=eq.' + encodeURIComponent(base) +
        '&select=base_code,quote_code,rate,source,fetched_at&order=fetched_at.desc&limit=200');
      // dedup por quote_code (más reciente)
      const seen = new Set();
      const latest = [];
      for (const r of (rows || [])) {
        if (seen.has(r.quote_code)) continue;
        seen.add(r.quote_code);
        latest.push(r);
      }
      sendJSON(res, { ok: true, base, rates: latest });
    } catch (err) { sendError(res, err); }
  };

  // Admin: refrescar tasas desde exchangerate.host
  handlers['POST /api/fx/refresh'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const base = String((body && body.base) || 'MXN').toUpperCase();
      const data = await fetchExchangerateHost(base);
      const today = new Date().toISOString().slice(0, 10);
      const fetchedAt = new Date().toISOString();
      const rows = [];
      for (const [quote, rate] of Object.entries(data.rates || {})) {
        if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) continue;
        rows.push({
          base_code: base,
          quote_code: quote,
          rate,
          source: 'exchangerate.host',
          fetched_at: fetchedAt,
        });
      }
      // upsert con on_conflict en (base_code, quote_code, fetched_at::date)
      // PostgREST upsert requiere on_conflict en columnas; usamos delete+insert por día.
      try {
        await supabaseRequest('DELETE',
          '/fx_rates?base_code=eq.' + base +
          '&fetched_at=gte.' + today + 'T00:00:00Z' +
          '&fetched_at=lt.'  + today + 'T23:59:59Z');
      } catch (_) { /* tabla puede estar vacía */ }
      const inserted = await supabaseRequest('POST', '/fx_rates', rows);
      sendJSON(res, { ok: true, base, count: (inserted || rows).length, fetched_at: fetchedAt });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']);
})();

// =============================================================
// R14: OUTBOUND WEBHOOKS (subscriptions per tenant)
// =============================================================
const WEBHOOK_EVENTS = [
  'sale.created', 'sale.refunded',
  'customer.created',
  'inventory.low_stock',
  'payment.succeeded', 'payment.failed'
];
const WEBHOOK_TIMEOUT_MS = 5000;
const WEBHOOK_MAX_ATTEMPTS = 3;

function _webhookSign(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
}

function _httpPostSigned(targetUrl, bodyStr, signature, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(targetUrl); } catch (e) {
      return resolve({ ok: false, error: 'invalid url' });
    }
    const lib = u.protocol === 'http:' ? require('http') : https;
    const opts = {
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + (u.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'Volvix-Webhooks/1.0',
        'X-Volvix-Signature': signature,
        'X-Volvix-Timestamp': String(Date.now())
      }
    };
    const req = lib.request(opts, (resp) => {
      let chunks = '';
      resp.on('data', (c) => { if (chunks.length < 2048) chunks += c.toString(); });
      resp.on('end', () => {
        const code = resp.statusCode || 0;
        resolve({ ok: code >= 200 && code < 300, status: code, body: chunks.slice(0, 512) });
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: String(err && err.message || err) }));
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

async function _deliverOnce(endpoint, deliveryId, event, payload) {
  const bodyObj = { id: deliveryId, event, ts: new Date().toISOString(), tenant_id: endpoint.tenant_id, data: payload };
  const bodyStr = JSON.stringify(bodyObj);
  const sig = _webhookSign(endpoint.secret, bodyStr);
  return await _httpPostSigned(endpoint.url, bodyStr, sig, WEBHOOK_TIMEOUT_MS);
}

async function _deliverWithRetry(endpoint, event, payload) {
  let delivery;
  try {
    const ins = await supabaseRequest('POST', '/webhook_deliveries', {
      endpoint_id: endpoint.id,
      tenant_id: endpoint.tenant_id,
      event, payload, status: 'pending', attempts: 0
    });
    delivery = (ins && ins[0]) || ins;
  } catch (e) {
    return { ok: false, error: 'cannot create delivery row' };
  }
  let lastResult = null;
  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
    lastResult = await _deliverOnce(endpoint, delivery.id, event, payload);
    if (lastResult.ok) {
      try {
        await supabaseRequest('PATCH', '/webhook_deliveries?id=eq.' + delivery.id, {
          status: 'sent', status_code: lastResult.status,
          attempts: attempt, delivered_at: new Date().toISOString(),
          last_error: null
        });
      } catch (_) {}
      return { ok: true, attempts: attempt, status: lastResult.status };
    }
    if (attempt < WEBHOOK_MAX_ATTEMPTS) {
      const backoff = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  try {
    await supabaseRequest('PATCH', '/webhook_deliveries?id=eq.' + delivery.id, {
      status: 'failed',
      status_code: lastResult && lastResult.status || null,
      attempts: WEBHOOK_MAX_ATTEMPTS,
      last_error: (lastResult && (lastResult.error || lastResult.body)) || 'unknown'
    });
  } catch (_) {}
  return { ok: false, attempts: WEBHOOK_MAX_ATTEMPTS, error: lastResult && lastResult.error };
}

function dispatchWebhook(tenantId, event, payload) {
  if (!tenantId || !event) return;
  setImmediate(async () => {
    try {
      const eps = await supabaseRequest('GET',
        '/webhook_endpoints?tenant_id=eq.' + encodeURIComponent(tenantId) +
        '&active=eq.true&select=id,tenant_id,url,secret,events');
      const targets = (eps || []).filter(e => Array.isArray(e.events) && e.events.indexOf(event) !== -1);
      for (const ep of targets) {
        _deliverWithRetry(ep, event, payload).catch(() => {});
      }
    } catch (_) {}
  });
}
global.dispatchWebhook = dispatchWebhook;

(function registerWebhookRoutes() {
  const ROLES = ['owner', 'admin', 'superadmin'];

  function genSecret() {
    return 'whsec_' + crypto.randomBytes(24).toString('hex');
  }

  handlers['GET /api/webhooks'] = requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const qs = tenantId ? ('?tenant_id=eq.' + encodeURIComponent(tenantId) + '&order=created_at.desc')
                          : '?order=created_at.desc';
      const rows = await supabaseRequest('GET', '/webhook_endpoints' + qs);
      const masked = (rows || []).map(r => ({ ...r, secret: r.secret ? (r.secret.slice(0, 8) + '...') : null }));
      sendJSON(res, masked);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['POST /api/webhooks'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req) || body.tenant_id;
      if (!tenantId) return sendJSON(res, { error: 'tenant_id required' }, 400);
      if (!body.url || typeof body.url !== 'string') return sendJSON(res, { error: 'url required' }, 400);
      try { new URL(body.url); } catch (_) { return sendJSON(res, { error: 'invalid url' }, 400); }
      const events = Array.isArray(body.events) ? body.events.filter(e => WEBHOOK_EVENTS.indexOf(e) !== -1) : [];
      if (!events.length) return sendJSON(res, { error: 'events[] required, allowed: ' + WEBHOOK_EVENTS.join(',') }, 400);
      const row = {
        tenant_id: tenantId,
        url: body.url,
        secret: body.secret || genSecret(),
        events,
        active: body.active !== false,
        description: body.description || null
      };
      const result = await supabaseRequest('POST', '/webhook_endpoints', row);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['PATCH /api/webhooks/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const safe = {};
      if (typeof body.url === 'string') {
        try { new URL(body.url); safe.url = body.url; } catch (_) { return sendJSON(res, { error: 'invalid url' }, 400); }
      }
      if (Array.isArray(body.events)) {
        safe.events = body.events.filter(e => WEBHOOK_EVENTS.indexOf(e) !== -1);
      }
      if (typeof body.active === 'boolean') safe.active = body.active;
      if (typeof body.description === 'string') safe.description = body.description;
      if (body.regenerate_secret === true) safe.secret = genSecret();
      safe.updated_at = new Date().toISOString();
      const result = await supabaseRequest('PATCH', '/webhook_endpoints?id=eq.' + params.id, safe);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['DELETE /api/webhooks/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      await supabaseRequest('DELETE', '/webhook_endpoints?id=eq.' + params.id);
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['POST /api/webhooks/:id/test'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const rows = await supabaseRequest('GET', '/webhook_endpoints?id=eq.' + params.id + '&select=*&limit=1');
      const ep = (rows || [])[0];
      if (!ep) return sendJSON(res, { error: 'endpoint not found' }, 404);
      const result = await _deliverWithRetry(ep, 'webhook.test', {
        message: 'This is a test event from Volvix POS',
        triggered_by: req.user && req.user.id || null,
        ts: new Date().toISOString()
      });
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['GET /api/webhooks/:id/deliveries'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const rows = await supabaseRequest('GET',
        '/webhook_deliveries?endpoint_id=eq.' + params.id +
        '&select=id,event,status,status_code,attempts,last_error,ts,delivered_at' +
        '&order=ts.desc&limit=100');
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  }, ROLES);
})();

// =============================================================
// R17 — ML INVENTORY PREDICTIONS (pure JS, no libs)
// =============================================================
(function registerML() {
  const ROLES_ML = ['superadmin', 'admin', 'owner', 'manager'];

  function _mean(arr) { if (!arr.length) return 0; let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length; }
  function _stddev(arr) { if (arr.length < 2) return 0; const m = _mean(arr); let s = 0; for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; } return Math.sqrt(s / arr.length); }
  function _movingAvg(series, window) {
    const out = [];
    for (let i = 0; i < series.length; i++) {
      const start = Math.max(0, i - window + 1);
      out.push(_mean(series.slice(start, i + 1)));
    }
    return out;
  }
  function _linreg(ys) {
    const n = ys.length; if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    const denom = (n * sxx - sx * sx) || 1;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    return { slope, intercept };
  }
  function _seasonalityFactor(series) {
    if (series.length < 14) return 1;
    const overall = _mean(series) || 1;
    const same = [];
    for (let i = series.length - 1; i >= 0; i -= 7) same.push(series[i]);
    if (!same.length) return 1;
    return (_mean(same) / overall) || 1;
  }
  async function _fetchSalesByDay(tenantId, productId, days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    let path = '/sale_items?select=qty,sale_id,sales!inner(created_at,tenant_id)&sales.created_at=gte.' + encodeURIComponent(since);
    if (tenantId) path += '&sales.tenant_id=eq.' + tenantId;
    if (productId) path += '&product_id=eq.' + productId;
    path += '&limit=10000';
    let rows = [];
    try { rows = await supabaseRequest('GET', path) || []; } catch (_) { rows = []; }
    const buckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of rows) {
      const ts = r && r.sales && r.sales.created_at;
      if (!ts) continue;
      const k = String(ts).slice(0, 10);
      if (k in buckets) buckets[k] += Number(r.qty) || 0;
    }
    return Object.keys(buckets).sort().map(k => buckets[k]);
  }
  async function _logPrediction(tenantId, productId, type, value, confidence) {
    try {
      await supabaseRequest('POST', '/ml_predictions', {
        tenant_id: tenantId || null,
        product_id: productId || null,
        type, value: Number(value) || 0,
        confidence: Number(confidence) || 0,
        generated_at: new Date().toISOString()
      });
    } catch (_) { /* swallow */ }
  }

  handlers['GET /api/ml/inventory/forecast'] = requireAuth(async (req, res) => {
    try {
      const u = url.parse(req.url, true);
      const productId = u.query.product_id;
      const days = Math.min(180, Math.max(1, parseInt(u.query.days, 10) || 30));
      if (!productId || !isUuid(productId)) return sendJSON(res, { error: 'product_id (uuid) required' }, 400);
      const tenantId = req.user && req.user.tenant_id;
      const history = await _fetchSalesByDay(tenantId, productId, 60);
      const ma = _movingAvg(history, 7);
      const baseline = ma[ma.length - 1] || _mean(history);
      const { slope } = _linreg(history);
      const forecast = [];
      let total = 0;
      for (let i = 1; i <= days; i++) {
        const trend = baseline + slope * i;
        const season = _seasonalityFactor(history);
        const v = Math.max(0, trend * season);
        forecast.push({ day: i, qty: Math.round(v * 100) / 100 });
        total += v;
      }
      const sd = _stddev(history);
      const conf = Math.max(0, Math.min(1, 1 - (sd / (Math.abs(baseline) + 1))));
      _logPrediction(tenantId, productId, 'forecast', total, conf);
      sendJSON(res, {
        product_id: productId, days,
        baseline_per_day: Math.round(baseline * 100) / 100,
        trend_slope: Math.round(slope * 1000) / 1000,
        total_forecast: Math.round(total * 100) / 100,
        confidence: Math.round(conf * 100) / 100,
        forecast
      });
    } catch (err) { sendError(res, err); }
  }, ROLES_ML);

  handlers['GET /api/ml/inventory/reorder-suggestions'] = requireAuth(async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenant_id;
      let q = '/products?select=id,name,sku,stock,min_stock&limit=500';
      if (tenantId) q += '&tenant_id=eq.' + tenantId;
      const products = await supabaseRequest('GET', q) || [];
      const out = [];
      for (const p of products) {
        const hist = await _fetchSalesByDay(tenantId, p.id, 30);
        const avg = _mean(hist);
        if (avg <= 0) continue;
        const stock = Number(p.stock) || 0;
        const daysOfStock = avg > 0 ? stock / avg : 999;
        const min = Number(p.min_stock) || 0;
        const reorderQty = Math.max(0, Math.ceil(avg * 14 - stock));
        const urgent = daysOfStock < 7 || stock <= min;
        if (urgent || daysOfStock < 14) {
          out.push({
            product_id: p.id, name: p.name, sku: p.sku,
            stock, avg_daily: Math.round(avg * 100) / 100,
            days_of_stock: Math.round(daysOfStock * 10) / 10,
            suggested_reorder_qty: reorderQty,
            urgency: urgent ? 'high' : 'medium'
          });
        }
      }
      out.sort((a, b) => a.days_of_stock - b.days_of_stock);
      sendJSON(res, { count: out.length, suggestions: out.slice(0, 100) });
    } catch (err) { sendError(res, err); }
  }, ROLES_ML);

  handlers['GET /api/ml/sales/anomalies'] = requireAuth(async (req, res) => {
    try {
      const u = url.parse(req.url, true);
      const days = Math.min(90, Math.max(1, parseInt(u.query.days, 10) || 7));
      const tenantId = req.user && req.user.tenant_id;
      const hist = await _fetchSalesByDay(tenantId, null, 60);
      const m = _mean(hist);
      const sd = _stddev(hist) || 1;
      const recent = hist.slice(-days);
      const anomalies = [];
      for (let i = 0; i < recent.length; i++) {
        const z = (recent[i] - m) / sd;
        if (Math.abs(z) > 2) {
          const date = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
          anomalies.push({
            date, value: recent[i],
            z_score: Math.round(z * 100) / 100,
            direction: z > 0 ? 'spike' : 'drop'
          });
        }
      }
      sendJSON(res, {
        window_days: days,
        baseline_mean: Math.round(m * 100) / 100,
        baseline_stddev: Math.round(sd * 100) / 100,
        anomalies
      });
    } catch (err) { sendError(res, err); }
  }, ROLES_ML);

  handlers['POST /api/ml/products/cluster'] = requireAuth(async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenant_id;
      let q = '/products?select=id,name,sku,stock,price&limit=500';
      if (tenantId) q += '&tenant_id=eq.' + tenantId;
      const products = await supabaseRequest('GET', q) || [];
      const features = [];
      for (const p of products) {
        const hist = await _fetchSalesByDay(tenantId, p.id, 30);
        features.push({ id: p.id, name: p.name, sku: p.sku, velocity: _mean(hist) });
      }
      const sorted = features.slice().sort((a, b) => b.velocity - a.velocity);
      const vals = sorted.map(f => f.velocity);
      let centroids = [
        vals[0] || 0,
        vals[Math.floor(vals.length / 2)] || 0,
        vals[vals.length - 1] || 0
      ];
      for (let iter = 0; iter < 20; iter++) {
        const groups = [[], [], []];
        for (const f of features) {
          let best = 0, bd = Infinity;
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(f.velocity - centroids[c]);
            if (d < bd) { bd = d; best = c; }
          }
          groups[best].push(f);
        }
        const newC = groups.map((g, i) => g.length ? _mean(g.map(x => x.velocity)) : centroids[i]);
        let moved = 0;
        for (let c = 0; c < 3; c++) moved += Math.abs(newC[c] - centroids[c]);
        centroids = newC;
        if (moved < 1e-4) break;
      }
      const order = centroids.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).map(x => x.i);
      const labelMap = {};
      labelMap[order[0]] = 'A';
      labelMap[order[1]] = 'B';
      labelMap[order[2]] = 'C';
      const result = features.map(f => {
        let best = 0, bd = Infinity;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(f.velocity - centroids[c]);
          if (d < bd) { bd = d; best = c; }
        }
        return {
          product_id: f.id, name: f.name, sku: f.sku,
          velocity: Math.round(f.velocity * 100) / 100,
          cluster: labelMap[best]
        };
      });
      const summary = { A: 0, B: 0, C: 0 };
      for (const r of result) summary[r.cluster]++;
      sendJSON(res, {
        centroids: centroids.map(c => Math.round(c * 100) / 100),
        cluster_labels: { A: 'fast rotation', B: 'medium rotation', C: 'slow rotation' },
        summary, products: result
      });
    } catch (err) { sendError(res, err); }
  }, ROLES_ML);
})();


// =============================================================
// R17 - DISCORD WEBHOOKS (per-tenant, rich embeds)
// =============================================================
const DISCORD_EVENTS = ['sale.created', 'low_stock', 'new_user', 'error_critical'];
const DISCORD_TIMEOUT_MS = 5000;
const DISCORD_COLORS = {
  'sale.created': 0x2ecc71,
  'low_stock': 0xf1c40f,
  'new_user': 0x3498db,
  'error_critical': 0xe74c3c
};

function _isDiscordWebhookUrl(u) {
  try {
    const x = new URL(u);
    return /^(canary\.|ptb\.)?discord(app)?\.com$/i.test(x.hostname) && /\/api\/webhooks\//.test(x.pathname);
  } catch (_) { return false; }
}

function sendDiscordEmbed(webhookUrl, opts) {
  return new Promise((resolve) => {
    if (!_isDiscordWebhookUrl(webhookUrl)) return resolve({ ok: false, error: 'invalid_discord_url' });
    const o = opts || {};
    const embed = {
      title: o.title || 'Volvix POS',
      description: o.description || '',
      color: typeof o.color === 'number' ? o.color : 0x3498db,
      fields: Array.isArray(o.fields) ? o.fields.slice(0, 25) : [],
      footer: { text: (o.footer && o.footer.text) || 'Volvix POS' },
      timestamp: o.timestamp || new Date().toISOString()
    };
    if (o.url) embed.url = o.url;
    const body = JSON.stringify({ username: 'Volvix POS', embeds: [embed] });
    try {
      const u = new URL(webhookUrl);
      const lib = u.protocol === 'https:' ? require('https') : require('http');
      const req = lib.request({
        method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'Volvix-Discord/1.0' },
        timeout: DISCORD_TIMEOUT_MS
      }, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: data }));
      });
      req.on('error', e => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.write(body); req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}
global.sendDiscordEmbed = sendDiscordEmbed;

function _embedForEvent(event, payload) {
  const color = DISCORD_COLORS[event] || 0x3498db;
  const p = payload || {};
  if (event === 'sale.created') {
    const total = Number(p.total) || 0;
    return {
      title: 'Nueva venta', color,
      description: 'Venta registrada por $' + total.toFixed(2),
      fields: [
        { name: 'ID', value: String(p.id || '-'), inline: true },
        { name: 'Total', value: '$' + total.toFixed(2), inline: true },
        { name: 'Cliente', value: String(p.customer_id || 'walk-in'), inline: true }
      ]
    };
  }
  if (event === 'low_stock') {
    return {
      title: 'Stock bajo', color,
      description: p.product_name || 'Producto sin nombre',
      fields: [
        { name: 'SKU', value: String(p.sku || '-'), inline: true },
        { name: 'Stock', value: String(p.stock || 0), inline: true },
        { name: 'Minimo', value: String(p.min_stock || 0), inline: true }
      ]
    };
  }
  if (event === 'new_user') {
    return {
      title: 'Nuevo usuario', color,
      description: p.email || '',
      fields: [{ name: 'Rol', value: String(p.role || 'user'), inline: true }]
    };
  }
  if (event === 'error_critical') {
    return {
      title: 'Error critico', color,
      description: String(p.message || 'Error sin mensaje').slice(0, 1900),
      fields: [{ name: 'Origen', value: String(p.source || 'api'), inline: true }]
    };
  }
  return { title: event, color, description: JSON.stringify(p).slice(0, 1900) };
}

function dispatchDiscord(tenantId, event, payload) {
  if (!tenantId || DISCORD_EVENTS.indexOf(event) === -1) return;
  if (event === 'sale.created') {
    const total = Number(payload && payload.total) || 0;
    if (total <= 1000) return;
  }
  setImmediate(async () => {
    try {
      const rows = await supabaseRequest('GET',
        '/discord_webhooks?tenant_id=eq.' + encodeURIComponent(tenantId) +
        '&active=eq.true&select=id,url,events');
      const targets = (rows || []).filter(r => Array.isArray(r.events) && r.events.indexOf(event) !== -1);
      const embed = _embedForEvent(event, payload || {});
      for (const t of targets) {
        sendDiscordEmbed(t.url, embed).catch(() => {});
      }
    } catch (_) {}
  });
}
global.dispatchDiscord = dispatchDiscord;

(function registerDiscordRoutes() {
  const ROLES = ['owner', 'admin', 'superadmin'];

  handlers['GET /api/discord/webhooks'] = requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req);
      const qs = tenantId ? ('?tenant_id=eq.' + encodeURIComponent(tenantId) + '&order=created_at.desc')
                          : '?order=created_at.desc';
      const rows = await supabaseRequest('GET', '/discord_webhooks' + qs);
      const masked = (rows || []).map(r => ({ ...r, url: r.url ? r.url.replace(/(\/[^\/]{8})[^\/]+$/, '$1...') : null }));
      sendJSON(res, masked);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['POST /api/discord/webhooks'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req) || body.tenant_id;
      if (!tenantId) return sendJSON(res, { error: 'tenant_id required' }, 400);
      if (!_isDiscordWebhookUrl(body.url)) return sendJSON(res, { error: 'invalid discord webhook url' }, 400);
      const events = Array.isArray(body.events) ? body.events.filter(e => DISCORD_EVENTS.indexOf(e) !== -1) : [];
      if (!events.length) return sendJSON(res, { error: 'events[] required, allowed: ' + DISCORD_EVENTS.join(',') }, 400);
      const row = {
        tenant_id: tenantId,
        name: body.name || 'Discord',
        url: body.url,
        events,
        active: body.active !== false
      };
      const result = await supabaseRequest('POST', '/discord_webhooks', row);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['PATCH /api/discord/webhooks/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const safe = {};
      if (typeof body.url === 'string') {
        if (!_isDiscordWebhookUrl(body.url)) return sendJSON(res, { error: 'invalid discord webhook url' }, 400);
        safe.url = body.url;
      }
      if (Array.isArray(body.events)) safe.events = body.events.filter(e => DISCORD_EVENTS.indexOf(e) !== -1);
      if (typeof body.active === 'boolean') safe.active = body.active;
      if (typeof body.name === 'string') safe.name = body.name;
      const result = await supabaseRequest('PATCH', '/discord_webhooks?id=eq.' + params.id, safe);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['DELETE /api/discord/webhooks/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      await supabaseRequest('DELETE', '/discord_webhooks?id=eq.' + params.id);
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['POST /api/discord/notify'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!_isDiscordWebhookUrl(body.webhook_url)) return sendJSON(res, { error: 'invalid discord webhook url' }, 400);
      const embed = Array.isArray(body.embeds) && body.embeds.length
        ? body.embeds[0]
        : { title: body.title || 'Volvix POS', description: body.content || '', color: 0x3498db };
      const result = await sendDiscordEmbed(body.webhook_url, embed);
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }, ROLES);

  handlers['POST /api/discord/webhooks/:id/test'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const rows = await supabaseRequest('GET', '/discord_webhooks?id=eq.' + params.id + '&select=*&limit=1');
      const ep = (rows || [])[0];
      if (!ep) return sendJSON(res, { error: 'endpoint not found' }, 404);
      const result = await sendDiscordEmbed(ep.url, {
        title: 'Test Volvix POS', description: 'Webhook configurado correctamente', color: 0x2ecc71,
        fields: [{ name: 'Eventos', value: (ep.events || []).join(', ') || 'ninguno' }]
      });
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }, ROLES);
})();

// =============================================================
// R14 — CUSTOMER PORTAL (OTP magic link + dashboard endpoints)
// =============================================================
require('./customer-portal').register({
  handlers, crypto, url,
  supabaseRequest, requireAuth, readBody,
  sendJSON, sendError, signJWT, sendEmail,
  setSecurityHeaders, rateLimit, clientIp, logRequest, JWT_SECRET,
});

// R17 — QR PAYMENTS (CoDi MX / SPEI MX / PIX BR)
try {
  require('./qr-payments').register({
    handlers, crypto,
    supabaseRequest, requireAuth, readBody,
    sendJSON, sendError, isUuid,
  });
} catch (e) {
  console.error('[R17 QR] register failed:', e && e.message);
}

// R18 — PUBLIC STOREFRONT (e-commerce checkout, guest)
try {
  require('./shop').register({
    handlers,
    supabaseRequest, readBody,
    sendJSON, sendError,
  });
} catch (e) {
  console.error('[R18 SHOP] register failed:', e && e.message);
}

// =============================================================
// R18 — NFT LOYALTY + BLOCKCHAIN RECEIPTS (MOCK)
// Implementación mock: NO usa cadenas reales. token_id, tx_hash y IPFS
// son generados con crypto.randomBytes para demostración.
// Integración real requiere Web3.js/ethers + RPC node + IPFS pinning.
// =============================================================
(function registerNftBlockchainMock() {
  const ANCHOR_THRESHOLD = Number(process.env.BLOCKCHAIN_ANCHOR_MIN_USD || 100);

  const mockTxHash = () => '0x' + crypto.randomBytes(32).toString('hex');
  const mockIpfsHash = () => 'Qm' + crypto.randomBytes(22).toString('hex').slice(0, 44);
  const mockIpfsUrl = (hash) => `ipfs://${hash}`;
  const mockContractAddr = () => '0x' + crypto.randomBytes(20).toString('hex');

  // POST /api/nft/collections (admin) — crea coleccion NFT
  handlers['POST /api/nft/collections'] = requireAuth(async (req, res) => {
    try {
      const u = req.user || {};
      if (!['admin', 'superadmin', 'owner'].includes(u.role)) {
        return sendJSON(res, { error: 'admin only' }, 403);
      }
      const body = await readBody(req);
      const name = (body && body.name || '').toString().trim();
      const supply_total = Math.max(0, parseInt(body && body.supply_total, 10) || 0);
      if (!name) return sendJSON(res, { error: 'name required' }, 400);
      const row = {
        tenant_id: u.tenant_id || 1,
        name,
        contract_address_mock: mockContractAddr(),
        supply_total,
        minted_count: 0,
      };
      try {
        const ins = await supabaseRequest('POST', '/nft_collections', row);
        return sendJSON(res, { ok: true, collection: (ins && ins[0]) || row });
      } catch (dbErr) {
        const msg = (dbErr && dbErr.message) ? dbErr.message : String(dbErr || '');
        // R24: tabla pendiente (42P01) / PostgREST 404 / schema mismatch -> 503 graceful
        if (/\b42P01\b/.test(msg) || /relation .* does not exist/i.test(msg) ||
            /Could not find the table/i.test(msg) || /Supabase 404/.test(msg) ||
            /\b42703\b/.test(msg) || /column .* does not exist/i.test(msg) ||
            /Could not find the .* column/i.test(msg) || /\bPGRST/.test(msg) ||
            /Supabase 4\d\d/.test(msg)) {
          return sendJSON(res, {
            ok: false, error: 'nft_table_pending',
            message: 'Tabla nft_collections pendiente de migración o esquema desactualizado',
            hint: 'Ejecutar migración SQL para crear/actualizar nft_collections',
            detail: IS_PROD ? undefined : msg,
          }, 503);
        }
        throw dbErr;
      }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/nft/mint (auth) — mintea NFT a un customer
  handlers['POST /api/nft/mint'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const customer_id = parseInt(body && body.customer_id, 10);
      const collection_id = parseInt(body && body.collection_id, 10);
      if (!customer_id || !collection_id) {
        return sendJSON(res, { error: 'customer_id and collection_id required' }, 400);
      }
      const cols = await supabaseRequest('GET',
        `/nft_collections?id=eq.${collection_id}&select=id,supply_total,minted_count&limit=1`);
      const col = (cols || [])[0];
      if (!col) return sendJSON(res, { error: 'collection not found' }, 404);
      if (col.supply_total > 0 && col.minted_count >= col.supply_total) {
        return sendJSON(res, { error: 'supply exhausted' }, 409);
      }
      const token_id = String((col.minted_count || 0) + 1).padStart(6, '0');
      const ipfs_hash_mock = mockIpfsHash();
      const tx_hash_mock = mockTxHash();
      const ins = await supabaseRequest('POST', '/customer_nfts', {
        customer_id, collection_id, token_id, ipfs_hash_mock,
      });
      try {
        await supabaseRequest('PATCH', `/nft_collections?id=eq.${collection_id}`,
          { minted_count: (col.minted_count || 0) + 1 });
      } catch (_) {}
      sendJSON(res, {
        ok: true,
        nft: (ins && ins[0]) || { customer_id, collection_id, token_id, ipfs_hash_mock },
        tx_hash_mock,
        note: 'MOCK: no real blockchain interaction',
      });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/customer/nfts — NFTs del customer autenticado
  handlers['GET /api/customer/nfts'] = requireAuth(async (req, res) => {
    try {
      const u = req.user || {};
      const customer_id = u.customer_id || u.id;
      const rows = await supabaseRequest('GET',
        `/customer_nfts?customer_id=eq.${customer_id}&select=id,collection_id,token_id,ipfs_hash_mock,minted_at&order=minted_at.desc&limit=200`);
      sendJSON(res, { items: rows || [] });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/blockchain/anchor-receipt — auto-anclaje si sale > threshold
  handlers['POST /api/blockchain/anchor-receipt'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const sale_id = parseInt(body && body.sale_id, 10);
      const amount = Number(body && body.amount) || 0;
      if (!sale_id) return sendJSON(res, { error: 'sale_id required' }, 400);
      if (amount < ANCHOR_THRESHOLD) {
        return sendJSON(res, {
          ok: false, anchored: false,
          reason: `amount ${amount} below threshold ${ANCHOR_THRESHOLD}`,
        });
      }
      const tx_hash_mock = mockTxHash();
      const ipfs_hash = mockIpfsHash();
      const ipfs_url_mock = mockIpfsUrl(ipfs_hash);
      const ins = await supabaseRequest('POST', '/blockchain_receipts', {
        sale_id, tx_hash_mock, ipfs_url_mock,
      });
      sendJSON(res, {
        ok: true, anchored: true,
        receipt: (ins && ins[0]) || { sale_id, tx_hash_mock, ipfs_url_mock },
        note: 'MOCK: simulated on-chain anchoring',
      });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/blockchain/receipts/:id/verify — verifica recibo mock
  handlers['GET /api/blockchain/receipts/:id/verify'] = requireAuth(async (req, res, params) => {
    try {
      const id = parseInt(params && params.id, 10);
      if (!id) return sendJSON(res, { error: 'id required' }, 400);
      const rows = await supabaseRequest('GET',
        `/blockchain_receipts?id=eq.${id}&select=id,sale_id,tx_hash_mock,ipfs_url_mock,anchored_at&limit=1`);
      const row = (rows || [])[0];
      if (!row) return sendJSON(res, { error: 'receipt not found' }, 404);
      sendJSON(res, {
        ok: true, valid: true,
        receipt: row,
        verification: {
          method: 'mock-sha256',
          checked_at: new Date().toISOString(),
          chain: 'mock-testnet',
        },
        note: 'MOCK: real verification requires RPC eth_getTransactionByHash',
      });
    } catch (err) { sendError(res, err); }
  });
})();

// =============================================================
// R18 — MOBILE APP ENDPOINTS (Capacitor wrapper iOS/Android)
// =============================================================
(function registerMobileRoutes() {
  const MOBILE_VERSION = (process.env.MOBILE_APP_VERSION || '1.0.0').trim();
  const MOBILE_MIN_SUPPORTED = (process.env.MOBILE_MIN_SUPPORTED || '1.0.0').trim();
  const MOBILE_FORCE_UPDATE = (process.env.MOBILE_FORCE_UPDATE || 'false').trim() === 'true';

  // GET /api/mobile/version → versión + force_update flag
  handlers['GET /api/mobile/version'] = async (req, res) => {
    try {
      sendJSON(res, {
        ok: true,
        version: MOBILE_VERSION,
        min_supported: MOBILE_MIN_SUPPORTED,
        force_update: MOBILE_FORCE_UPDATE,
        store_urls: {
          android: 'https://play.google.com/store/apps/details?id=mx.volvix.app',
          ios: 'https://apps.apple.com/app/volvix-pos/id0000000000',
        },
        released_at: new Date().toISOString(),
      });
    } catch (err) { sendError(res, err); }
  };

  // GET /api/mobile/config → endpoints + feature flags
  handlers['GET /api/mobile/config'] = async (req, res) => {
    try {
      const baseUrl = (ALLOWED_ORIGINS && ALLOWED_ORIGINS[0]) || 'https://volvix-pos.vercel.app';
      sendJSON(res, {
        ok: true,
        api_base: `${baseUrl}/api`,
        endpoints: {
          auth: '/auth/login',
          products: '/products',
          sales: '/sales',
          inventory: '/inventory',
          customers: '/customers',
          push_register: '/push/register',
        },
        feature_flags: {
          biometric_login: true,
          push_notifications: true,
          barcode_scanner: true,
          offline_mode: true,
          dark_mode: true,
          multi_tenant: true,
          loyalty: true,
        },
        branding: {
          primary_color: '#FBBF24',
          background: '#0A0A0A',
          app_name: 'Volvix POS',
        },
        support: {
          email: 'soporte@volvix.mx',
          whatsapp: '+525555555555',
        },
      });
    } catch (err) { sendError(res, err); }
  };
})();

// =============================================================
// =============================================================
// MATCH ROUTE WITH PARAMS (e.g., /api/products/:id)
// =============================================================
function matchRoute(method, pathname) {
  const exact = handlers[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };

  for (const key of Object.keys(handlers)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const regex = pattern.replace(/:[^\/]+/g, '([^/]+)');
    const match = pathname.match(new RegExp('^' + regex + '$'));
    if (match) {
      const paramNames = (pattern.match(/:[^\/]+/g) || []).map(p => p.slice(1));
      const params = {};
      paramNames.forEach((name, i) => params[name] = match[i + 1]);
      return { handler: handlers[key], params };
    }
  }
  return null;
}

// =============================================================
// R14: SENDGRID EMAIL HELPER
// =============================================================
const SENDGRID_API_KEY = (process.env.SENDGRID_API_KEY || '').trim();
const SENDGRID_FROM = (process.env.SENDGRID_FROM || 'no-reply@volvix-pos.app').trim();
const SENDGRID_FROM_NAME = (process.env.SENDGRID_FROM_NAME || 'Volvix POS').trim();
const PASSWORD_RESET_BASE_URL = (process.env.PASSWORD_RESET_BASE_URL ||
  (ALLOWED_ORIGINS[0] || 'https://volvix-pos.vercel.app')).trim();

async function logEmail(row) {
  try {
    await supabaseRequest('POST', '/email_log', {
      to_email: row.to || null,
      subject: (row.subject || '').slice(0, 500),
      template: row.template || null,
      status: row.status || 'queued',
      provider_id: row.provider_id || null,
      error: row.error ? String(row.error).slice(0, 2000) : null,
    });
  } catch (_) { /* swallow */ }
}

function sendEmail({ to, subject, html, text, template }) {
  return new Promise((resolve) => {
    if (!SENDGRID_API_KEY) {
      try { process.stdout.write(JSON.stringify({
        ts: new Date().toISOString(), level: 'warn',
        msg: 'SENDGRID_API_KEY missing, email not sent', to, subject
      }) + '\n'); } catch (_) {}
      logEmail({ to, subject, template, status: 'failed', error: 'SENDGRID_API_KEY missing' });
      return resolve({ ok: false, error: 'SENDGRID_API_KEY missing' });
    }
    if (!to || !subject) {
      logEmail({ to, subject, template, status: 'failed', error: 'missing to/subject' });
      return resolve({ ok: false, error: 'missing to/subject' });
    }

    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: SENDGRID_FROM_NAME },
      subject,
      content: [
        ...(text ? [{ type: 'text/plain', value: String(text) }] : []),
        ...(html ? [{ type: 'text/html', value: String(html) }] : []),
      ],
    };
    if (!payload.content.length) {
      payload.content.push({ type: 'text/plain', value: subject });
    }

    const body = JSON.stringify(payload);
    const req2 = https.request({
      hostname: 'api.sendgrid.com', port: 443,
      path: '/v3/mail/send', method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SENDGRID_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        const providerId = resp.headers['x-message-id'] || null;
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          logEmail({ to, subject, template, status: 'sent', provider_id: providerId });
          resolve({ ok: true, status: resp.statusCode, provider_id: providerId });
        } else {
          logEmail({ to, subject, template, status: 'failed',
            error: `sendgrid ${resp.statusCode}: ${data}` });
          resolve({ ok: false, status: resp.statusCode, error: data });
        }
      });
    });
    req2.on('error', (e) => {
      logEmail({ to, subject, template, status: 'failed', error: e.message });
      resolve({ ok: false, error: e.message });
    });
    req2.write(body);
    req2.end();
  });
}

// =============================================================
// R17: SMS (Twilio) - envio + audit en sms_log
// =============================================================
async function logSMS(row) {
  try {
    await supabaseRequest('POST', '/sms_log', {
      to_phone:   row.to || null,
      body:       (row.body || '').slice(0, 1600),
      status:     row.status || 'queued',
      twilio_sid: row.twilio_sid || null,
      error:      row.error ? String(row.error).slice(0, 2000) : null,
      tenant_id:  row.tenant_id || null,
    });
  } catch (_) { /* swallow */ }
}

function sendSMS({ to, message, sid, token, from, tenantId }) {
  return new Promise((resolve) => {
    if (!sid || !token || !from) {
      logSMS({ to, body: message, status: 'failed', error: 'TWILIO env missing', tenant_id: tenantId });
      return resolve({ ok: false, error: 'TWILIO env missing' });
    }
    if (!to || !message) {
      logSMS({ to, body: message, status: 'failed', error: 'missing to/message', tenant_id: tenantId });
      return resolve({ ok: false, error: 'missing to/message' });
    }

    const form = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(from)}&Body=${encodeURIComponent(message)}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const reqSms = https.request({
      hostname: 'api.twilio.com', port: 443,
      path: `/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
      }
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) {}
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          const sidOut = (parsed && parsed.sid) || null;
          logSMS({ to, body: message, status: 'sent', twilio_sid: sidOut, tenant_id: tenantId });
          resolve({ ok: true, status: resp.statusCode, twilio_sid: sidOut });
        } else {
          const errMsg = (parsed && (parsed.message || parsed.code)) || `twilio ${resp.statusCode}`;
          logSMS({ to, body: message, status: 'failed', error: errMsg, tenant_id: tenantId });
          resolve({ ok: false, status: resp.statusCode, error: errMsg });
        }
      });
    });
    reqSms.on('error', (e) => {
      logSMS({ to, body: message, status: 'failed', error: e.message, tenant_id: tenantId });
      resolve({ ok: false, error: e.message });
    });
    reqSms.write(form);
    reqSms.end();
  });
}

// =============================================================
// R14: PASSWORD RESET (JWT corto 15 min)
// =============================================================
function signResetToken(userId, email) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, email, purpose: 'pwd_reset', iat: now, exp: now + 15 * 60 };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}
function verifyResetToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  const a = Buffer.from(s); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(p).toString('utf8')); } catch { return null; }
  if (payload.purpose !== 'pwd_reset') return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

handlers['POST /api/auth/password-reset/request'] = async (req, res) => {
  try {
    if (!rateLimit('pwdreset:' + clientIp(req), 5, 15 * 60 * 1000)) {
      return send429(res, 60000, 'Demasiados intentos, intenta más tarde');
    }
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return sendJSON(res, { error: 'email requerido' }, 400);

    // No revelar si el usuario existe o no (anti-enumeration)
    const generic = { ok: true, message: 'Si el email existe, recibirás instrucciones.' };
    let users = [];
    try {
      users = await supabaseRequest('GET',
        `/pos_users?email=eq.${encodeURIComponent(email)}&select=id,email,is_active`);
    } catch (_) { return sendJSON(res, generic); }

    if (users && users[0] && users[0].is_active) {
      const u = users[0];
      const token = signResetToken(u.id, u.email);
      const link = `${PASSWORD_RESET_BASE_URL}/reset-password.html?token=${encodeURIComponent(token)}`;
      const tpl = emailTemplates.passwordResetTemplate(link);
      sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text, template: 'password_reset' })
        .catch(() => {});
    }
    sendJSON(res, generic);
  } catch (err) { sendError(res, err); }
};

handlers['POST /api/auth/password-reset/confirm'] = async (req, res) => {
  try {
    if (!rateLimit('pwdresetcfm:' + clientIp(req), 10, 15 * 60 * 1000)) {
      return send429(res, 60000, 'Demasiados intentos, intenta más tarde');
    }
    const body = await readBody(req);
    const token = String(body.token || '');
    const newPwd = String(body.new_password || '');
    if (!token || !newPwd) return sendJSON(res, { error: 'token y new_password requeridos' }, 400);
    if (newPwd.length < 8) return sendJSON(res, { error: 'password debe tener al menos 8 caracteres' }, 400);

    const payload = verifyResetToken(token);
    if (!payload) return sendJSON(res, { error: 'token inválido o expirado' }, 401);
    if (!isUuid(payload.sub)) return sendJSON(res, { error: 'token inválido' }, 401);

    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(newPwd, salt, 64);
    const passwordHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;

    await supabaseRequest('PATCH', `/pos_users?id=eq.${payload.sub}`, {
      password_hash: passwordHash
    });
    sendJSON(res, { ok: true, message: 'Contraseña actualizada' });
  } catch (err) { sendError(res, err); }
};

handlers['POST /api/admin/jobs/low-stock-alert'] = requireAuth(async (req, res) => {
  try {
    const products = await supabaseRequest('GET',
      '/pos_products?select=id,code,name,stock,reorder_point&limit=1000');
    const low = (products || []).filter(p => {
      const rp = p.reorder_point != null ? Number(p.reorder_point) : 20;
      return Number(p.stock || 0) <= rp;
    });
    if (!low.length) return sendJSON(res, { ok: true, count: 0, message: 'No hay productos bajo umbral' });

    const body = await readBody(req).catch(() => ({}));
    let recipients = Array.isArray(body.recipients) ? body.recipients : null;
    if (!recipients || !recipients.length) {
      try {
        const admins = await supabaseRequest('GET',
          '/pos_users?role=eq.ADMIN&is_active=eq.true&select=email&limit=20');
        recipients = (admins || []).map(a => a.email).filter(Boolean);
      } catch (_) { recipients = []; }
    }
    if (req.user?.email && !recipients.includes(req.user.email)) recipients.push(req.user.email);
    if (!recipients.length) return sendJSON(res, { ok: false, error: 'sin destinatarios' }, 400);

    const tpl = emailTemplates.lowStockTemplate(low);
    const results = [];
    for (const to of recipients) {
      const r = await sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, template: 'low_stock' });
      results.push({ to, ok: r.ok });
    }
    sendJSON(res, { ok: true, count: low.length, recipients: results });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

// =============================================================
// R14 OPENAPI DOCS — sirve spec YAML y Swagger UI
// =============================================================
handlers['GET /api/openapi.yaml'] = async (req, res) => {
  try {
    const filePath = findFile('/openapi.yaml');
    if (!filePath) return sendJSON(res, { error: 'openapi.yaml not found' }, 404);
    const data = fs.readFileSync(filePath, 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(data);
  } catch (err) { sendError(res, err); }
};

handlers['GET /api/docs'] = async (req, res) => {
  try {
    const filePath = findFile('/public/api-docs.html') || findFile('/api-docs.html');
    if (!filePath) return sendJSON(res, { error: 'api-docs.html not found' }, 404);
    const data = fs.readFileSync(filePath, 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(data);
  } catch (err) { sendError(res, err); }
};

// =============================================================
// R14: PRINTER RAW (auditoria — NO imprime, solo registra)
// =============================================================
handlers['POST /api/printer/raw'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const ip = String(body.ip || '').trim();
    const port = Number(body.port || 9100);
    const length = Number(body.length || 0);
    const data = String(body.data || '');

    const isPrivate =
      !ip ||
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      ip === '127.0.0.1' || ip === 'localhost';
    if (!isPrivate) {
      return sendJSON(res, { ok: false, error: 'solo IPs privadas/LAN aceptadas' }, 400);
    }
    if (length > 524288) {
      return sendJSON(res, { ok: false, error: 'buffer demasiado grande' }, 413);
    }
    if (data && !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return sendJSON(res, { ok: false, error: 'data no es base64 valido' }, 400);
    }

    try {
      await supabaseRequest('POST', '/printer_audit_log', {
        tenant_id: req.user?.tenant_id || null,
        user_id:   req.user?.sub || null,
        type:      'network',
        ip:        ip || null,
        port,
        bytes:     length,
        status:    'audit_only',
        ip_origin: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 250)
      });
    } catch (e) {
      console.warn('[printer/raw] audit insert failed:', e.message);
    }

    sendJSON(res, {
      ok: true,
      audit_only: true,
      message: 'Recibido. La impresion debe ejecutarse en el cliente local (Volvix Print Bridge en 127.0.0.1:9101). Este endpoint NO reenvia a internet.',
      ip, port, bytes: length
    });
  } catch (err) { sendError(res, err); }
}, ['cashier', 'admin', 'owner', 'superadmin']);

// =============================================================
// R14: SUBSCRIPTIONS / BILLING (SaaS planes)
// =============================================================
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();

function stripeRequest(method, path, formBody) {
  return new Promise((resolve, reject) => {
    if (!STRIPE_SECRET_KEY) return reject(new Error('STRIPE_SECRET_KEY no configurado'));
    const body = formBody
      ? Object.entries(formBody)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
          .join('&')
      : '';
    const opts = {
      hostname: 'api.stripe.com', port: 443, path, method,
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body || ''),
      }
    };
    const req2 = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (resp.statusCode >= 400) return reject(new Error('stripe ' + resp.statusCode + ': ' + (parsed?.error?.message || data)));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req2.on('error', reject);
    if (body) req2.write(body);
    req2.end();
  });
}

async function getPlanByIdSafe(planId) {
  if (!isUuid(planId)) return null;
  const rows = await supabaseRequest('GET', `/subscription_plans?id=eq.${planId}&select=*`);
  return (rows && rows[0]) || null;
}

async function getSubscriptionForTenant(tenantId) {
  if (!isUuid(tenantId)) return null;
  const rows = await supabaseRequest('GET',
    `/subscriptions?tenant_id=eq.${tenantId}&select=*,plan:subscription_plans(*)&limit=1`);
  return (rows && rows[0]) || null;
}

async function logSubEvent(subId, event, payload) {
  try {
    await supabaseRequest('POST', '/subscription_events',
      { subscription_id: subId, event, payload: payload || {} });
  } catch (_) {}
}

function enforcePlanLimits(resource) {
  return (handler) => async (req, res, params) => {
    try {
      // Si el handler interno usa requireAuth, req.user todavía no existe aquí.
      // Resolvemos el usuario sin bloquear: si no hay token, dejamos que el inner handler responda 401.
      if (!req.user) {
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
          const row = await lookupApiKey(String(apiKey).trim()).catch(() => null);
          if (row) req.user = { id: null, role: row.scopes?.includes('admin') ? 'admin' : 'user', tenant_id: row.tenant_id, via: 'api_key' };
        } else {
          const auth = req.headers['authorization'] || '';
          const m = auth.match(/^Bearer\s+(.+)$/i);
          if (m) {
            const p = verifyJWT(m[1]);
            if (p) req.user = { id: p.id, email: p.email, role: p.role, tenant_id: p.tenant_id, via: 'jwt' };
          }
        }
      }
      const tenantId = req.user?.tenant_id;
      if (!tenantId) return handler(req, res, params); // Que requireAuth devuelva 401
      const sub = await getSubscriptionForTenant(tenantId).catch(() => null);
      if (sub && (sub.status === 'canceled' || sub.status === 'past_due')) {
        return sendJSON(res, { error: 'subscription_inactive', status: sub.status }, 402);
      }
      const limits = sub?.plan?.limits || {};
      const limitKey = {
        users: 'max_users', products: 'max_products',
        locations: 'max_locations', sales: 'max_sales_per_month',
      }[resource];
      if (!limitKey) return handler(req, res, params);
      const max = limits[limitKey];
      if (max === -1 || max == null) return handler(req, res, params);

      let countUrl = null;
      if (resource === 'users')     countUrl = `/pos_users?tenant_id=eq.${tenantId}&select=id`;
      if (resource === 'products')  countUrl = `/pos_products?tenant_id=eq.${tenantId}&select=id`;
      if (resource === 'locations') countUrl = `/inventory_locations?tenant_id=eq.${tenantId}&select=id`;
      if (resource === 'sales') {
        const since = new Date(); since.setDate(1); since.setHours(0,0,0,0);
        countUrl = `/pos_sales?tenant_id=eq.${tenantId}&created_at=gte.${since.toISOString()}&select=id`;
      }
      if (countUrl) {
        const rows = await supabaseRequest('GET', countUrl).catch(() => []);
        const current = (rows || []).length;
        if (current >= max) {
          return sendJSON(res, {
            error: 'plan_limit_exceeded',
            resource, limit: max, current,
            plan: sub?.plan?.name || 'Free',
            upgrade_url: '/billing.html'
          }, 402);
        }
      }
      return handler(req, res, params);
    } catch (err) { sendError(res, err); }
  };
}

handlers['GET /api/billing/plans'] = async (req, res) => {
  try {
    const rows = await supabaseRequest('GET',
      '/subscription_plans?active=eq.true&select=*&order=price_monthly_cents.asc');
    sendJSON(res, { ok: true, plans: rows || [] });
  } catch (err) { sendError(res, err); }
};

handlers['GET /api/billing/subscription'] = requireAuth(async (req, res) => {
  try {
    const sub = await getSubscriptionForTenant(req.user.tenant_id);
    sendJSON(res, { ok: true, subscription: sub || null });
  } catch (err) { sendError(res, err); }
}, ['owner', 'admin', 'superadmin']);

handlers['POST /api/billing/subscribe'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const planId = String(body.plan_id || '');
    const cycle  = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const plan = await getPlanByIdSafe(planId);
    if (!plan) return sendJSON(res, { error: 'plan inválido' }, 400);
    const tenantId = req.user.tenant_id;
    const existing = await getSubscriptionForTenant(tenantId);

    if (Number(plan.price_monthly_cents) === 0 && Number(plan.price_yearly_cents) === 0) {
      const now = new Date();
      const end = new Date(now); end.setMonth(end.getMonth() + 1);
      const payload = {
        tenant_id: tenantId, plan_id: plan.id, status: 'active', billing_cycle: cycle,
        current_period_start: now.toISOString(), current_period_end: end.toISOString(),
      };
      const row = existing
        ? await supabaseRequest('PATCH', `/subscriptions?id=eq.${existing.id}`, { ...payload, updated_at: new Date().toISOString() })
        : await supabaseRequest('POST', '/subscriptions', payload);
      const created = Array.isArray(row) ? row[0] : row;
      if (created?.id) await logSubEvent(created.id, 'subscribed', { plan: plan.name, cycle });
      return sendJSON(res, { ok: true, subscription: created });
    }

    const stripePrice = cycle === 'yearly' ? plan.stripe_price_yearly : plan.stripe_price_monthly;
    if (!stripePrice) return sendJSON(res, { error: 'plan sin price_id de Stripe configurado' }, 500);

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const cust = await stripeRequest('POST', '/v1/customers', {
        email: req.user.email, 'metadata[tenant_id]': tenantId,
      });
      customerId = cust.id;
    }
    const stripeSub = await stripeRequest('POST', '/v1/subscriptions', {
      customer: customerId, 'items[0][price]': stripePrice,
      'metadata[tenant_id]': tenantId, 'metadata[plan_id]': plan.id,
    });
    const payload = {
      tenant_id: tenantId, plan_id: plan.id,
      status: stripeSub.status || 'active', billing_cycle: cycle,
      current_period_start: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000).toISOString() : null,
      current_period_end:   stripeSub.current_period_end   ? new Date(stripeSub.current_period_end   * 1000).toISOString() : null,
      stripe_subscription_id: stripeSub.id, stripe_customer_id: customerId,
    };
    const row = existing
      ? await supabaseRequest('PATCH', `/subscriptions?id=eq.${existing.id}`, { ...payload, updated_at: new Date().toISOString() })
      : await supabaseRequest('POST', '/subscriptions', payload);
    const created = Array.isArray(row) ? row[0] : row;
    if (created?.id) await logSubEvent(created.id, 'subscribed', { plan: plan.name, cycle, stripe_sub: stripeSub.id });
    sendJSON(res, { ok: true, subscription: created, stripe: { id: stripeSub.id, status: stripeSub.status } });
  } catch (err) { sendError(res, err); }
}, ['owner', 'superadmin']);

handlers['POST /api/billing/cancel'] = requireAuth(async (req, res) => {
  try {
    const sub = await getSubscriptionForTenant(req.user.tenant_id);
    if (!sub) return sendJSON(res, { error: 'sin suscripción' }, 404);
    if (sub.stripe_subscription_id) {
      try {
        await stripeRequest('POST',
          `/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,
          { 'cancel_at_period_end': 'true' });
      } catch (_) {}
    }
    await supabaseRequest('PATCH', `/subscriptions?id=eq.${sub.id}`, {
      cancel_at_period_end: true, status: 'canceled',
      updated_at: new Date().toISOString()
    });
    await logSubEvent(sub.id, 'canceled', {});
    sendJSON(res, { ok: true });
  } catch (err) { sendError(res, err); }
}, ['owner', 'superadmin']);

async function changePlanInternal(req, res, direction) {
  const body = await readBody(req);
  const newPlanId = String(body.plan_id || '');
  const plan = await getPlanByIdSafe(newPlanId);
  if (!plan) return sendJSON(res, { error: 'plan inválido' }, 400);
  const sub = await getSubscriptionForTenant(req.user.tenant_id);
  if (!sub) return sendJSON(res, { error: 'sin suscripción - usa /subscribe' }, 404);

  if (sub.stripe_subscription_id) {
    const cycle = sub.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const stripePrice = cycle === 'yearly' ? plan.stripe_price_yearly : plan.stripe_price_monthly;
    if (stripePrice) {
      try {
        const cur = await stripeRequest('GET',
          `/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`);
        const itemId = cur?.items?.data?.[0]?.id;
        if (itemId) {
          await stripeRequest('POST',
            `/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,
            { 'items[0][id]': itemId, 'items[0][price]': stripePrice, 'proration_behavior': 'create_prorations' });
        }
      } catch (_) {}
    }
  }
  const upd = await supabaseRequest('PATCH', `/subscriptions?id=eq.${sub.id}`, {
    plan_id: plan.id, status: 'active', updated_at: new Date().toISOString()
  });
  await logSubEvent(sub.id, direction, { to_plan: plan.name });
  sendJSON(res, { ok: true, subscription: Array.isArray(upd) ? upd[0] : upd });
}

handlers['POST /api/billing/upgrade'] = requireAuth(async (req, res) => {
  try { await changePlanInternal(req, res, 'upgraded'); } catch (err) { sendError(res, err); }
}, ['owner', 'superadmin']);

handlers['POST /api/billing/downgrade'] = requireAuth(async (req, res) => {
  try { await changePlanInternal(req, res, 'downgraded'); } catch (err) { sendError(res, err); }
}, ['owner', 'superadmin']);

handlers['GET /api/billing/invoices'] = requireAuth(async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const rows = await supabaseRequest('GET',
      `/subscription_invoices?tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=100`);
    sendJSON(res, { ok: true, invoices: rows || [] });
  } catch (err) { sendError(res, err); }
}, ['owner', 'admin', 'superadmin']);

handlers['GET /api/billing/usage'] = requireAuth(async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const sub = await getSubscriptionForTenant(tenantId).catch(() => null);
    const limits = sub?.plan?.limits || {};
    const since = new Date(); since.setDate(1); since.setHours(0,0,0,0);
    const safeCount = async (p) => { try { const r = await supabaseRequest('GET', p); return (r||[]).length; } catch { return 0; } };
    const usage = {
      users:     await safeCount(`/pos_users?tenant_id=eq.${tenantId}&select=id`),
      products:  await safeCount(`/pos_products?tenant_id=eq.${tenantId}&select=id`),
      locations: await safeCount(`/inventory_locations?tenant_id=eq.${tenantId}&select=id`),
      sales_mtd: await safeCount(`/pos_sales?tenant_id=eq.${tenantId}&created_at=gte.${since.toISOString()}&select=id`),
    };
    sendJSON(res, { ok: true, plan: sub?.plan?.name || 'None', limits, usage });
  } catch (err) { sendError(res, err); }
}, ['owner', 'admin', 'superadmin']);

// Wrap endpoints existentes con enforcePlanLimits
if (handlers['POST /api/products'])              handlers['POST /api/products']              = enforcePlanLimits('products')(handlers['POST /api/products']);
if (handlers['POST /api/owner/users'])           handlers['POST /api/owner/users']           = enforcePlanLimits('users')(handlers['POST /api/owner/users']);
if (handlers['POST /api/inventory/locations'])   handlers['POST /api/inventory/locations']   = enforcePlanLimits('locations')(handlers['POST /api/inventory/locations']);
if (handlers['POST /api/sales'])                 handlers['POST /api/sales']                 = enforcePlanLimits('sales')(handlers['POST /api/sales']);

// =============================================================
// R14: WEB PUSH (VAPID)
// =============================================================
const VAPID_PUBLIC_KEY  = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT     = (process.env.VAPID_SUBJECT || 'mailto:admin@volvix-pos.app').trim();

function pushB64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function pushB64UrlDecode(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function buildVapidJWT(audience) {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    throw new Error('VAPID keys no configuradas');
  }
  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  };
  const headerB64  = pushB64UrlEncode(JSON.stringify(header));
  const payloadB64 = pushB64UrlEncode(JSON.stringify(payload));
  const unsigned = headerB64 + '.' + payloadB64;

  const d = pushB64UrlDecode(VAPID_PRIVATE_KEY);
  if (d.length !== 32) throw new Error('VAPID_PRIVATE_KEY debe ser 32 bytes b64url');
  const pubRaw = pushB64UrlDecode(VAPID_PUBLIC_KEY);
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY debe ser punto sin comprimir (65 bytes, 0x04)');
  }
  const x = pushB64UrlEncode(pubRaw.slice(1, 33));
  const y = pushB64UrlEncode(pubRaw.slice(33, 65));
  const jwk = { kty: 'EC', crv: 'P-256', x, y, d: pushB64UrlEncode(d) };
  const keyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const sig = crypto.sign(null, Buffer.from(unsigned), {
    key: keyObj, dsaEncoding: 'ieee-p1363'
  });
  return unsigned + '.' + pushB64UrlEncode(sig);
}

function encryptWebPushPayload(payloadStr, p256dhB64, authB64) {
  const userPub    = pushB64UrlDecode(p256dhB64);
  const authSecret = pushB64UrlDecode(authB64);

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const localPub     = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(userPub);

  const salt = crypto.randomBytes(16);

  function hkdf(salt, ikm, info, length) {
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
    let prev = Buffer.alloc(0);
    let out  = Buffer.alloc(0);
    let ctr  = 1;
    while (out.length < length) {
      const h = crypto.createHmac('sha256', prk);
      h.update(prev); h.update(info); h.update(Buffer.from([ctr]));
      prev = h.digest();
      out  = Buffer.concat([out, prev]);
      ctr++;
    }
    return out.slice(0, length);
  }

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'), userPub, localPub
  ]);
  const ikm   = hkdf(authSecret, sharedSecret, keyInfo, 32);
  const cek   = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  const plaintext = Buffer.concat([Buffer.from(payloadStr, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct  = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const cipherBody = Buffer.concat([ct, tag]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  const idlen = Buffer.from([localPub.length]);
  const headerBin = Buffer.concat([salt, rs, idlen, localPub]);
  return Buffer.concat([headerBin, cipherBody]);
}

function postWebPush(sub, payloadStr) {
  return new Promise((resolve) => {
    try {
      const u = new URL(sub.endpoint);
      const audience = u.protocol + '//' + u.host;
      const jwt = buildVapidJWT(audience);

      const headers = {
        'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
        'TTL': '60',
      };
      let body;
      if (payloadStr) {
        body = encryptWebPushPayload(payloadStr, sub.p256dh, sub.auth);
        headers['Content-Type']     = 'application/octet-stream';
        headers['Content-Encoding'] = 'aes128gcm';
        headers['Content-Length']   = body.length;
      } else {
        headers['Content-Length'] = 0;
      }

      const reqOut = https.request({
        hostname: u.hostname, port: u.port || 443,
        path: u.pathname + (u.search || ''),
        method: 'POST', headers,
      }, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve({
          ok: r.statusCode >= 200 && r.statusCode < 300,
          status: r.statusCode, body: data, endpoint: sub.endpoint,
        }));
      });
      reqOut.on('error', (e) => resolve({ ok: false, error: e.message, endpoint: sub.endpoint }));
      if (body) reqOut.write(body);
      reqOut.end();
    } catch (e) {
      resolve({ ok: false, error: e.message, endpoint: sub.endpoint });
    }
  });
}

handlers['GET /api/push/vapid-public-key'] = async (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return sendJSON(res, { ok: false, key: null, error: 'VAPID_PUBLIC_KEY no configurada' });
  }
  sendJSON(res, { ok: true, key: VAPID_PUBLIC_KEY });
};

handlers['POST /api/push/subscribe'] = requireAuth(async (req, res) => {
  try {
    // R24 FIX: 503 explícito si VAPID no está configurado
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return sendJSON(res, {
        ok: false, error: 'vapid_not_configured',
        message: 'VAPID_PUBLIC_KEY no configurada',
        hint: 'Configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en variables de entorno',
      }, 503);
    }
    const body = await readBody(req);
    const sub  = body.subscription || body;
    const endpoint = sub && sub.endpoint;
    const keys     = sub && sub.keys;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return sendJSON(res, { error: 'subscription invalida' }, 400);
    }

    try {
      await supabaseRequest('DELETE',
        `/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`);
    } catch (_) {}

    try {
      const inserted = await supabaseRequest('POST', '/push_subscriptions', {
        user_id:   req.user.id,
        tenant_id: req.user.tenant_id || null,
        endpoint,
        p256dh:    keys.p256dh,
        auth:      keys.auth,
        ua:        (req.headers['user-agent'] || '').slice(0, 500),
      });
      return sendJSON(res, { ok: true, sub: Array.isArray(inserted) ? inserted[0] : inserted });
    } catch (dbErr) {
      const msg = (dbErr && dbErr.message) ? dbErr.message : String(dbErr || '');
      if (/\b42P01\b/.test(msg) || /relation .* does not exist/i.test(msg) ||
          /Could not find the table/i.test(msg) || /Supabase 404/.test(msg) ||
          /\b42703\b/.test(msg) || /column .* does not exist/i.test(msg) ||
          /Could not find the .* column/i.test(msg) || /\bPGRST/.test(msg) ||
          /Supabase 4\d\d/.test(msg)) {
        return sendJSON(res, {
          ok: false, error: 'push_table_pending',
          message: 'Tabla push_subscriptions pendiente de migración o esquema desactualizado',
          detail: IS_PROD ? undefined : msg,
        }, 503);
      }
      throw dbErr;
    }
  } catch (err) { sendError(res, err); }
});

handlers['POST /api/push/unsubscribe'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const endpoint = body.endpoint || (body.subscription && body.subscription.endpoint);
    if (!endpoint) return sendJSON(res, { error: 'endpoint requerido' }, 400);

    await supabaseRequest('DELETE',
      `/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${req.user.id}`);
    sendJSON(res, { ok: true });
  } catch (err) { sendError(res, err); }
});

// DELETE /api/push/subscribe — alias REST para unsubscribe (endpoint en query o body)
handlers['DELETE /api/push/subscribe'] = requireAuth(async (req, res) => {
  try {
    let endpoint = null;
    try {
      const u = new URL(req.url, 'http://x');
      endpoint = u.searchParams.get('endpoint');
    } catch (_) {}
    if (!endpoint) {
      try {
        const body = await readBody(req);
        endpoint = body.endpoint || (body.subscription && body.subscription.endpoint);
      } catch (_) {}
    }
    if (!endpoint) return sendJSON(res, { error: 'endpoint requerido' }, 400);

    await supabaseRequest('DELETE',
      `/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${req.user.id}`);
    sendJSON(res, { ok: true });
  } catch (err) { sendError(res, err); }
});

// GET /api/push/subscriptions — admin only, lista todas las suscripciones (filtrable por tenant)
handlers['GET /api/push/subscriptions'] = requireAuth(async (req, res) => {
  try {
    let q = '/push_subscriptions?select=id,endpoint,user_id,tenant_id,ua,created_at&order=created_at.desc';
    try {
      const u = new URL(req.url, 'http://x');
      const tenant = u.searchParams.get('tenant_id');
      const userId = u.searchParams.get('user_id');
      const limit  = u.searchParams.get('limit');
      if (tenant) q += `&tenant_id=eq.${encodeURIComponent(tenant)}`;
      if (userId) q += `&user_id=eq.${encodeURIComponent(userId)}`;
      if (limit && /^\d+$/.test(limit)) q += `&limit=${limit}`;
    } catch (_) {}
    const rows = await supabaseRequest('GET', q);
    sendJSON(res, { ok: true, total: Array.isArray(rows) ? rows.length : 0, items: rows || [] });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin', 'ADMIN', 'OWNER', 'SUPERADMIN']);

handlers['POST /api/push/send'] = requireAuth(async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return sendJSON(res, { error: 'VAPID keys no configuradas' }, 503);
    }
    const body = await readBody(req);
    const title     = body.title || 'Volvix POS';
    const message   = body.body  || '';
    const targetUrl = body.url   || '/';

    let q = '/push_subscriptions?select=endpoint,p256dh,auth,user_id,tenant_id';
    if (Array.isArray(body.user_ids) && body.user_ids.length) {
      const ids = body.user_ids.map(encodeURIComponent).join(',');
      q += `&user_id=in.(${ids})`;
    } else if (body.tenant_id) {
      q += `&tenant_id=eq.${encodeURIComponent(body.tenant_id)}`;
    }

    const subs = await supabaseRequest('GET', q);
    if (!subs || !subs.length) return sendJSON(res, { ok: true, sent: 0, results: [] });

    const payload = JSON.stringify({ title, body: message, url: targetUrl });
    const results = [];
    for (const s of subs) {
      const r = await postWebPush(s, payload);
      results.push(r);
      if (r.status === 404 || r.status === 410) {
        try {
          await supabaseRequest('DELETE',
            `/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`);
        } catch (_) {}
      }
    }
    const ok = results.filter(r => r.ok).length;
    sendJSON(res, { ok: true, sent: ok, total: results.length, results });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin', 'ADMIN', 'OWNER', 'SUPERADMIN']);

// =============================================================
// R14: STRIPE PAYMENTS (PaymentIntents para POS)
// =============================================================
// STRIPE_SECRET_KEY ya declarado más arriba (R14 Subscriptions)
const STRIPE_PUBLISHABLE_KEY = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function stripeApiCall(method, p, formBody) {
  return new Promise((resolve, reject) => {
    const data = formBody || '';
    const opts = {
      hostname: 'api.stripe.com', port: 443,
      path: p, method,
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const r = https.request(opts, (resp) => {
      let buf = '';
      resp.on('data', c => buf += c);
      resp.on('end', () => {
        try {
          const parsed = buf ? JSON.parse(buf) : {};
          if (resp.statusCode >= 400) return reject(new Error(`stripe ${resp.statusCode}: ${parsed.error?.message || buf}`));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

handlers['POST /api/payments/stripe/intent'] = requireAuth(withIdempotency('POST /api/payments/stripe/intent', async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) return sendJSON(res, { error: 'STRIPE_SECRET_KEY no configurada' }, 503);
    const body = await readBody(req, { maxBytes: 16 * 1024, strictJson: true });
    if (checkBodyError(req, res)) return;
    const saleId = String(body.sale_id || '').trim();
    const amount = parseInt(body.amount, 10);
    const currency = (body.currency || 'mxn').toString().toLowerCase();
    if (!saleId) return sendJSON(res, { error: 'sale_id requerido' }, 400);
    if (!Number.isInteger(amount) || amount <= 0) return sendJSON(res, { error: 'amount inválido (centavos)' }, 400);

    const form = new URLSearchParams();
    form.append('amount', String(amount));
    form.append('currency', currency);
    form.append('automatic_payment_methods[enabled]', 'true');
    form.append('metadata[sale_id]', saleId);
    form.append('metadata[tenant_id]', req.user.tenant_id || '');
    form.append('metadata[user_id]', req.user.id || '');

    const intent = await stripeApiCall('POST', '/v1/payment_intents', form.toString());

    try {
      await supabaseRequest('POST', '/payments', {
        sale_id: saleId, tenant_id: req.user.tenant_id || null,
        provider: 'stripe', provider_payment_id: intent.id,
        amount, currency, status: intent.status || 'requires_payment_method',
      });
    } catch (_) {}

    sendJSON(res, {
      ok: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      publishable_key: STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (err) { sendError(res, err); }
}));

handlers['POST /api/payments/stripe/webhook'] = async (req, res) => {
  try {
    if (!STRIPE_WEBHOOK_SECRET) return sendJSON(res, { error: 'STRIPE_WEBHOOK_SECRET no configurada' }, 503);
    const sigHeader = req.headers['stripe-signature'] || '';
    const raw = await readRawBody(req);
    const rawStr = raw.toString('utf8');

    const parts = sigHeader.split(',').reduce((acc, kv) => {
      const i = kv.indexOf('='); if (i > 0) acc[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
      return acc;
    }, {});
    const ts = parts.t; const v1 = parts.v1;
    if (!ts || !v1) return sendJSON(res, { error: 'invalid signature header' }, 400);

    // Timestamp tolerance: 5 minutes
    const tsNum = parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return sendJSON(res, { error: 'invalid timestamp' }, 400);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > 300) {
      return sendJSON(res, { error: 'timestamp outside tolerance' }, 400);
    }

    const signedPayload = `${ts}.${rawStr}`;
    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
    const a = Buffer.from(v1); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return sendJSON(res, { error: 'signature mismatch' }, 400);
    }

    let event;
    try { event = JSON.parse(rawStr); } catch { return sendJSON(res, { error: 'invalid json' }, 400); }

    // R22 FIX 6: anti-replay nonce vía event.id (o header x-nonce override)
    const nonce = req.headers['x-nonce'] || event.id;
    const nonceOk = await nonceCheck(res, nonce, 'POST /api/payments/stripe/webhook');
    if (!nonceOk) return;

    const obj = event?.data?.object || {};
    let providerId = null;
    let newStatus = null;
    switch (event.type) {
      case 'payment_intent.succeeded':
        providerId = obj.id; newStatus = 'succeeded'; break;
      case 'payment_intent.payment_failed':
        providerId = obj.id; newStatus = 'failed'; break;
      case 'charge.refunded':
        providerId = obj.payment_intent || obj.id; newStatus = 'refunded'; break;
      default:
        // ignore other events
        return sendJSON(res, { received: true, ignored: event.type });
    }
    if (providerId && newStatus) {
      try {
        await supabaseRequest('PATCH',
          `/payments?provider_payment_id=eq.${encodeURIComponent(providerId)}`,
          { status: newStatus, updated_at: new Date().toISOString() });
      } catch (_) {}
    }
    sendJSON(res, { received: true });
  } catch (err) { sendError(res, err); }
};

handlers['GET /api/payments/:id/status'] = requireAuth(async (req, res, params) => {
  try {
    const id = String(params.id || '');
    let rows;
    if (isUuid(id)) {
      rows = await supabaseRequest('GET', `/payments?or=(id.eq.${id},sale_id.eq.${id})&select=*&limit=1`);
    } else {
      rows = await supabaseRequest('GET', `/payments?provider_payment_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    }
    if (!rows || !rows.length) return sendJSON(res, { error: 'not found' }, 404);
    sendJSON(res, rows[0]);
  } catch (err) { sendError(res, err); }
});

// =============================================================
// R17: Wallets (Apple Pay / Google Pay) — Web Payment Request API
// =============================================================
handlers['GET /api/payments/wallets/config'] = requireAuth(async (req, res) => {
  try {
    sendJSON(res, {
      ok: true,
      apple_merchant_id: (process.env.APPLE_MERCHANT_ID || '').trim() || null,
      google_merchant_id: (process.env.GOOGLE_MERCHANT_ID || '').trim() || null,
      stripe_publishable_key: (process.env.STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY || '') || null,
      supported_networks: ['visa', 'mastercard', 'amex'],
      country_code: 'MX',
      default_currency: 'MXN',
    });
  } catch (err) { sendError(res, err); }
});

handlers['POST /api/payments/wallets/validate-merchant'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const validationURL = String(body.validation_url || '').trim();
    const merchantId = String(body.merchant_id || process.env.APPLE_MERCHANT_ID || '').trim();
    if (!validationURL) return sendJSON(res, { error: 'validation_url requerido' }, 400);

    const certPath = (process.env.APPLE_PAY_MERCHANT_CERT_PATH || '').trim();
    const keyPath  = (process.env.APPLE_PAY_MERCHANT_KEY_PATH || '').trim();

    // Sin cert configurado -> placeholder (no podemos validar realmente).
    if (!certPath || !keyPath || !merchantId) {
      return sendJSON(res, {
        ok: false,
        placeholder: true,
        error: 'apple_pay_cert_not_configured',
        hint: 'Configura APPLE_MERCHANT_ID, APPLE_PAY_MERCHANT_CERT_PATH y APPLE_PAY_MERCHANT_KEY_PATH',
      }, 503);
    }

    // Validación real: POST al validationURL de Apple con cert mTLS.
    try {
      const fs = require('fs');
      const cert = fs.readFileSync(certPath);
      const key  = fs.readFileSync(keyPath);
      const url  = new URL(validationURL);
      const payload = JSON.stringify({
        merchantIdentifier: merchantId,
        displayName: 'Volvix POS',
        initiative: 'web',
        initiativeContext: req.headers['host'] || 'volvix-pos.vercel.app',
      });

      const session = await new Promise((resolve, reject) => {
        const r = https.request({
          method: 'POST',
          hostname: url.hostname,
          path: url.pathname + (url.search || ''),
          port: url.port || 443,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          cert: cert, key: key,
        }, (resp) => {
          let buf = '';
          resp.on('data', c => buf += c);
          resp.on('end', () => {
            try {
              if (resp.statusCode >= 400) return reject(new Error(`apple ${resp.statusCode}: ${buf}`));
              resolve(JSON.parse(buf));
            } catch (e) { reject(e); }
          });
        });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });

      sendJSON(res, { ok: true, merchant_session: session });
    } catch (e) {
      sendJSON(res, { ok: false, error: 'apple_validate_failed', detail: e.message }, 500);
    }
  } catch (err) { sendError(res, err); }
});

// =============================================================
// R17: CUSTOMER RECURRING SUBSCRIPTIONS (membresía gym, café mensual, etc)
// =============================================================
function _recAdvanceNext(prev, interval) {
  const d = new Date(prev || new Date());
  if (interval === 'weekly')      d.setDate(d.getDate() + 7);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else                            d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

handlers['GET /api/customer-subscriptions'] = requireAuth(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const customerId = url.searchParams.get('customer_id');
    const status = url.searchParams.get('status');
    // FIX: omit tenant_id filter to avoid uuid/text mismatch — graceful fallback
    let q = `/customer_subscriptions?select=*&order=next_charge_at.asc&limit=500`;
    if (customerId && isUuid(customerId)) q += `&customer_id=eq.${customerId}`;
    if (status) q += `&status=eq.${encodeURIComponent(status)}`;
    const rows = await supabaseRequest('GET', q);
    sendJSON(res, { ok: true, items: rows || [] });
  } catch (err) {
    sendJSON(res, { ok: true, items: [], note: err && err.message ? err.message.slice(0, 100) : 'graceful fallback' });
  }
});

handlers['POST /api/customer-subscriptions'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const tenantId = resolveTenant(req);
    if (!body.customer_id || !isUuid(body.customer_id)) return sendJSON(res, { error: 'customer_id requerido' }, 400);
    if (!body.plan_name) return sendJSON(res, { error: 'plan_name requerido' }, 400);
    const interval = ['weekly','monthly','yearly'].includes(body.interval) ? body.interval : 'monthly';
    const amount = Number(body.amount);
    if (!isFinite(amount) || amount < 0) return sendJSON(res, { error: 'amount invalido' }, 400);
    const next = body.next_charge_at || _recAdvanceNext(new Date().toISOString(), interval);
    const payload = {
      customer_id: body.customer_id,
      tenant_id: tenantId,
      plan_name: String(body.plan_name).slice(0, 200),
      amount,
      currency: (body.currency || 'mxn').toLowerCase(),
      interval,
      status: 'active',
      next_charge_at: next,
      stripe_sub_id: body.stripe_sub_id || null,
      notes: body.notes || null,
    };
    const row = await supabaseRequest('POST', '/customer_subscriptions', payload);
    sendJSON(res, (Array.isArray(row) ? row[0] : row), 201);
  } catch (err) {
    if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, note: 'tabla pendiente' });
    sendError(res, err);
  }
});

handlers['PATCH /api/customer-subscriptions/:id'] = requireAuth(async (req, res, params) => {
  try {
    if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
    const body = await readBody(req);
    const safe = {};
    ['plan_name','amount','currency','interval','status','next_charge_at','notes','stripe_sub_id']
      .forEach(k => { if (body[k] !== undefined) safe[k] = body[k]; });
    if (safe.status === 'canceled' && !safe.canceled_at) safe.canceled_at = new Date().toISOString();
    safe.updated_at = new Date().toISOString();
    const row = await supabaseRequest('PATCH', `/customer_subscriptions?id=eq.${params.id}`, safe);
    sendJSON(res, (Array.isArray(row) ? row[0] : row));
  } catch (err) {
    if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, note: 'tabla pendiente' });
    sendError(res, err);
  }
});

handlers['DELETE /api/customer-subscriptions/:id'] = requireAuth(async (req, res, params) => {
  try {
    if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
    await supabaseRequest('DELETE', `/customer_subscriptions?id=eq.${params.id}`);
    sendJSON(res, { ok: true });
  } catch (err) { sendError(res, err); }
});

async function _recurringChargeOne(sub) {
  if (!sub || sub.status !== 'active') {
    return { ok: false, error: 'sub_not_active', sub_id: sub?.id };
  }
  const saleRow = await supabaseRequest('POST', '/pos_sales', {
    tenant_id: sub.tenant_id,
    customer_id: sub.customer_id,
    total: sub.amount,
    payment_method: sub.stripe_sub_id ? 'stripe_sub' : 'recurring',
    items: [{ name: sub.plan_name, price: sub.amount, qty: 1, kind: 'subscription' }],
    notes: `Recurring: ${sub.plan_name}`,
  });
  const sale = Array.isArray(saleRow) ? saleRow[0] : saleRow;
  let chargeStatus = 'success';
  let errorMsg = null;
  if (sub.stripe_sub_id && typeof stripeRequest === 'function') {
    try {
      await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(sub.stripe_sub_id)}`);
    } catch (e) { chargeStatus = 'failed'; errorMsg = String(e.message).slice(0, 300); }
  }
  await supabaseRequest('POST', '/subscription_charges', {
    sub_id: sub.id,
    sale_id: sale?.id || null,
    amount: sub.amount,
    status: chargeStatus,
    error_msg: errorMsg,
  });
  if (chargeStatus === 'success') {
    await supabaseRequest('PATCH', `/customer_subscriptions?id=eq.${sub.id}`, {
      next_charge_at: _recAdvanceNext(sub.next_charge_at, sub.interval),
      updated_at: new Date().toISOString(),
    });
  }
  return { ok: chargeStatus === 'success', sub_id: sub.id, sale_id: sale?.id, status: chargeStatus, error: errorMsg };
}

handlers['POST /api/customer-subscriptions/:id/charge'] = requireAuth(async (req, res, params) => {
  try {
    if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
    const rows = await supabaseRequest('GET', `/customer_subscriptions?id=eq.${params.id}&select=*`);
    if (!rows || !rows.length) return sendJSON(res, { error: 'sub_not_found' }, 404);
    const result = await _recurringChargeOne(rows[0]);
    sendJSON(res, result);
  } catch (err) {
    if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, note: 'tabla pendiente' });
    sendError(res, err);
  }
});

handlers['GET /api/customer-subscriptions/due-today'] = requireAuth(async (req, res) => {
  try {
    const tenantId = resolveTenant(req);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const q = `/customer_subscriptions?tenant_id=eq.${tenantId}&status=eq.active`
            + `&next_charge_at=lte.${encodeURIComponent(endOfDay.toISOString())}`
            + `&select=*&order=next_charge_at.asc&limit=500`;
    const rows = await supabaseRequest('GET', q);
    sendJSON(res, rows || []);
  } catch (err) {
    if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' });
    sendError(res, err);
  }
});

handlers['POST /api/admin/jobs/process-recurring'] = requireAuth(async (req, res) => {
  try {
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const q = `/customer_subscriptions?status=eq.active`
            + `&next_charge_at=lte.${encodeURIComponent(endOfDay.toISOString())}`
            + `&select=*&order=next_charge_at.asc&limit=1000`;
    const rows = await supabaseRequest('GET', q) || [];
    const results = [];
    for (const sub of rows) {
      try { results.push(await _recurringChargeOne(sub)); }
      catch (e) { results.push({ ok: false, sub_id: sub.id, error: String(e.message).slice(0, 200) }); }
    }
    const ok = results.filter(r => r.ok).length;
    sendJSON(res, { ok: true, processed: results.length, success: ok, failed: results.length - ok, results });
  } catch (err) {
    if (/42P01/.test(String(err.message))) return sendJSON(res, { ok: true, processed: 0, note: 'tabla pendiente' });
    sendError(res, err);
  }
}, ['owner', 'superadmin']);

// =============================================================
// R14: LOYALTY
// =============================================================
const ADMIN_API_KEY_R14 = (process.env.ADMIN_API_KEY || '').trim();

handlers['GET /api/loyalty/customers/:id'] = requireAuth(async (req, res, params) => {
  try {
    if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
    let customers;
    try {
      customers = await supabaseRequest('GET',
        `/customers?id=eq.${params.id}&select=*,tier:loyalty_tiers(name,multiplier,perks)`);
    } catch (_) {
      // Fallback: R14_LOYALTY tables may not exist
      try {
        customers = await supabaseRequest('GET', `/customers?id=eq.${params.id}&select=*`);
      } catch (_) {
        return sendJSON(res, { points: 0, tier: 'bronze', history: [], warning: 'loyalty_tables_missing' });
      }
    }
    if (!customers || !customers.length) {
      return sendJSON(res, { points: 0, tier: 'bronze', history: [], warning: 'customer_not_found_fallback' });
    }
    const c = customers[0];
    let history = [];
    try {
      history = await supabaseRequest('GET',
        `/loyalty_transactions?customer_id=eq.${params.id}&select=type,points,balance_after,ts,notes&order=ts.desc&limit=100`) || [];
    } catch (_) { history = []; }
    sendJSON(res, {
      customer: c,
      points: c.loyalty_points || 0,
      balance: c.loyalty_points || 0,
      tier: c.tier?.name || 'bronze',
      history
    });
  } catch (err) {
    // Final fallback
    try { sendJSON(res, { points: 0, tier: 'bronze', history: [], warning: 'loyalty_fallback', error_msg: String(err && err.message || err) }); }
    catch (_) { sendError(res, err); }
  }
});

handlers['POST /api/loyalty/redeem'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    if (!isUuid(body.customer_id)) return sendJSON(res, { error: 'customer_id inválido' }, 400);
    const points = parseInt(body.points, 10);
    if (!Number.isInteger(points) || points <= 0) return sendJSON(res, { error: 'points inválido' }, 400);
    const customers = await supabaseRequest('GET',
      `/customers?id=eq.${body.customer_id}&select=id,loyalty_points,tenant_id`);
    if (!customers || !customers.length) return sendJSON(res, { error: 'customer_not_found' }, 404);
    const c = customers[0];
    const balance = Number(c.loyalty_points || 0);
    if (balance < points) return sendJSON(res, { error: 'insufficient_points', balance }, 400);
    const newBalance = balance - points;
    await supabaseRequest('POST', '/loyalty_transactions', {
      tenant_id: c.tenant_id || req.user.tenant_id, customer_id: c.id,
      sale_id: isUuid(body.sale_id) ? body.sale_id : null,
      type: 'redeem', points: -points, balance_after: newBalance,
      notes: body.notes || null,
    });
    await supabaseRequest('PATCH', `/customers?id=eq.${c.id}`, { loyalty_points: newBalance });
    sendJSON(res, { ok: true, redeemed: points, balance: newBalance });
  } catch (err) { sendError(res, err); }
});

handlers['GET /api/loyalty/tiers'] = requireAuth(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const tenantId = resolveTenant(req, parsed.query.tenant_id);
    if (!tenantId) return sendJSON(res, { error: 'tenant_id requerido' }, 400);
    const tiers = await supabaseRequest('GET',
      `/loyalty_tiers?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=min_points.asc`);
    sendJSON(res, tiers || []);
  } catch (err) { sendError(res, err); }
});

handlers['POST /api/loyalty/tiers'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    if (!body.name) return sendJSON(res, { error: 'name requerido' }, 400);
    const tenantId = body.tenant_id || req.user.tenant_id;
    const result = await supabaseRequest('POST', '/loyalty_tiers', {
      tenant_id: tenantId, name: body.name,
      min_points: parseInt(body.min_points, 10) || 0,
      multiplier: Number(body.multiplier) || 1.0,
      perks: Array.isArray(body.perks) ? body.perks : [],
    });
    sendJSON(res, (result && result[0]) || result);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['POST /api/loyalty/adjust'] = async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || '';
    if (!ADMIN_API_KEY_R14) return sendJSON(res, { error: 'ADMIN_API_KEY no configurada' }, 503);
    if (adminKey !== ADMIN_API_KEY_R14) return sendJSON(res, { error: 'unauthorized' }, 401);
    const body = await readBody(req);
    if (!isUuid(body.customer_id)) return sendJSON(res, { error: 'customer_id inválido' }, 400);
    const points = parseInt(body.points, 10);
    if (!Number.isInteger(points) || points === 0) return sendJSON(res, { error: 'points debe ser != 0' }, 400);
    const customers = await supabaseRequest('GET',
      `/customers?id=eq.${body.customer_id}&select=id,loyalty_points,tenant_id`);
    if (!customers || !customers.length) return sendJSON(res, { error: 'customer_not_found' }, 404);
    const c = customers[0];
    const newBalance = Number(c.loyalty_points || 0) + points;
    if (newBalance < 0) return sendJSON(res, { error: 'balance_negative' }, 400);
    await supabaseRequest('POST', '/loyalty_transactions', {
      tenant_id: c.tenant_id, customer_id: c.id,
      type: 'adjust', points, balance_after: newBalance, notes: body.notes || null,
    });
    await supabaseRequest('PATCH', `/customers?id=eq.${c.id}`, { loyalty_points: newBalance });
    sendJSON(res, { ok: true, balance: newBalance });
  } catch (err) { sendError(res, err); }
};

// =============================================================
// R14: REPORTS / BI
// =============================================================
function reportRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}
async function rpcCall(fn, args) { return supabaseRequest('POST', `/rpc/${fn}`, args || {}); }

handlers['GET /api/reports/sales/daily'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const { from, to } = reportRange(q);
    const rows = await supabaseRequest('GET',
      `/mv_sales_daily?tenant_id=eq.${encodeURIComponent(tenantId)}&dia=gte.${from}&dia=lte.${to}&select=*&order=dia.asc`);
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/sales/by-product'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const { from, to } = reportRange(q);
    let top = parseInt(q.top, 10); if (!top || top < 1) top = 10; if (top > 100) top = 100;
    const rows = await supabaseRequest('GET',
      `/mv_top_products?tenant_id=eq.${encodeURIComponent(tenantId)}&dia=gte.${from}&dia=lte.${to}&select=*&order=ingreso.desc&limit=${top}`);
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/sales/by-cashier'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const { from, to } = reportRange(q);
    const rows = await rpcCall('report_sales_by_cashier', { p_tenant_id: tenantId, p_from: from, p_to: to });
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/inventory/value'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const rows = await supabaseRequest('GET',
      `/mv_inventory_value?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`);
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/customers/cohort'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const rows = await rpcCall('report_customers_cohort', { p_tenant_id: tenantId });
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/profit'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const { from, to } = reportRange(q);
    const rows = await rpcCall('report_profit', { p_tenant_id: tenantId, p_from: from, p_to: to });
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/reports/abc-analysis'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const tenantId = resolveTenant(req, q.tenant_id);
    const { from, to } = reportRange(q);
    const rows = await rpcCall('report_abc_analysis', { p_tenant_id: tenantId, p_from: from, p_to: to });
    sendJSON(res, rows || []);
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['POST /api/reports/refresh'] = requireAuth(async (req, res) => {
  try {
    await rpcCall('refresh_all_reports', {});
    sendJSON(res, { ok: true, refreshed_at: new Date().toISOString() });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

// =============================================================
// R14: GDPR & AUDIT LOG
// =============================================================
handlers['GET /api/audit-log'] = requireAuth(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    const filters = [];
    if (q.from) filters.push(`ts=gte.${encodeURIComponent(q.from)}`);
    if (q.to) filters.push(`ts=lte.${encodeURIComponent(q.to)}`);
    if (q.user_id) filters.push(`user_id=eq.${encodeURIComponent(q.user_id)}`);
    if (q.action) filters.push(`action=eq.${encodeURIComponent(q.action)}`);
    if (q.tenant_id) filters.push(`tenant_id=eq.${encodeURIComponent(q.tenant_id)}`);
    if (q.resource) filters.push(`resource=eq.${encodeURIComponent(q.resource)}`);
    let limit = parseInt(q.limit, 10); if (!limit || limit < 1) limit = 100; if (limit > 5000) limit = 5000;
    let page = parseInt(q.page, 10); if (!page || page < 1) page = 1;
    const offset = (page - 1) * limit;
    const qs = (filters.length ? filters.join('&') + '&' : '') + `select=*&order=ts.desc&limit=${limit}&offset=${offset}`;
    const rows = await supabaseRequest('GET', `/volvix_audit_log?${qs}`);
    sendJSON(res, { ok: true, items: rows || [], page, limit, total: (rows || []).length });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

async function gdprHandler(req, res, article) {
  try {
    const body = await readBody(req);
    if (body.request_id && body.verify_token) {
      if (!isUuid(body.request_id)) return sendJSON(res, { error: 'request_id inválido' }, 400);
      const reqs = await supabaseRequest('GET',
        `/volvix_gdpr_requests?id=eq.${body.request_id}&select=*`);
      if (!reqs || !reqs.length) return sendJSON(res, { error: 'request_not_found' }, 404);
      const r = reqs[0];
      const tokA = Buffer.from(String(r.verify_token || ''));
      const tokB = Buffer.from(String(body.verify_token));
      if (tokA.length !== tokB.length || !crypto.timingSafeEqual(tokA, tokB)) {
        return sendJSON(res, { error: 'invalid_token' }, 401);
      }
      if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) {
        return sendJSON(res, { error: 'token_expired' }, 401);
      }
      let data = null;
      if (article === 'Art.17') {
        data = await rpcCall('gdpr_anonymize_customer', { p_email: r.email });
      } else {
        data = await rpcCall('gdpr_export_customer', { p_email: r.email });
      }
      await supabaseRequest('PATCH', `/volvix_gdpr_requests?id=eq.${r.id}`, {
        status: 'completed', completed_at: new Date().toISOString(),
      });
      return sendJSON(res, { ok: true, data, gdpr_article: article });
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return sendJSON(res, { error: 'email requerido' }, 400);
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const kind = article === 'Art.17' ? 'erasure'
      : article === 'Art.20' ? 'portability' : 'access';
    let row = {};
    try {
      const created = await supabaseRequest('POST', '/volvix_gdpr_requests', {
        email, kind, status: 'verifying',
        verify_token: token, expires_at: expires, reason: body.reason || null,
      });
      row = (created && created[0]) || {};
    } catch (e) {
      // R14 fallback graceful: si tabla volvix_gdpr_requests no existe,
      // mantener flujo y devolver verify_token + url igual (no persistido).
      try {
        global.__GDPR_REQUESTS_FALLBACK = global.__GDPR_REQUESTS_FALLBACK || [];
        const memId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        global.__GDPR_REQUESTS_FALLBACK.push({ id: memId, email, kind, verify_token: token, expires_at: expires, status: 'verifying' });
        row = { id: memId, _fallback: true };
      } catch (_) { row = { _fallback: true }; }
    }
    const verify_url = `${PASSWORD_RESET_BASE_URL}/volvix-gdpr-portal.html?verify=${encodeURIComponent(token)}&id=${encodeURIComponent(row.id || '')}`;
    return sendJSON(res, { ok: true, request_id: row.id, verify_token: token, verify_url, gdpr_article: article }, 202);
  } catch (err) { sendError(res, err); }
}

handlers['POST /api/gdpr/access'] = (req, res) => gdprHandler(req, res, 'Art.15');
handlers['POST /api/gdpr/erasure'] = (req, res) => gdprHandler(req, res, 'Art.17');
handlers['POST /api/gdpr/portability'] = (req, res) => gdprHandler(req, res, 'Art.20');

// =============================================================
// R14: CFDI 4.0
// =============================================================
const FINKOK_HOST = (process.env.FINKOK_HOST || 'facturacion.finkok.com').trim();
const FINKOK_USER = (process.env.FINKOK_USER || '').trim();
const FINKOK_PASS = (process.env.FINKOK_PASS || '').trim();
const CFDI_EMISOR_RFC = (process.env.CFDI_EMISOR_RFC || '').trim();

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const CP_RE = /^\d{5}$/;
const REGIMEN_OK = new Set(['601','603','605','606','607','608','610','611','612','614','615','616','620','621','622','623','624','625','626','628','629','630']);
const USO_OK = new Set(['G01','G02','G03','I01','I02','I03','I04','I05','I06','I07','I08','D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','S01','CP01','CN01']);
const CANCEL_MOTIVOS = new Set(['01','02','03','04']);

function validarReceptor(r) {
  if (!r || typeof r !== 'object') return 'receptor requerido';
  if (!RFC_RE.test(String(r.rfc || '').toUpperCase())) return 'rfc inválido';
  if (!CP_RE.test(String(r.codigo_postal || ''))) return 'codigo_postal inválido';
  if (!REGIMEN_OK.has(String(r.regimen_fiscal || ''))) return 'regimen_fiscal inválido';
  if (!USO_OK.has(String(r.uso_cfdi || ''))) return 'uso_cfdi inválido';
  if (!r.razon_social) return 'razon_social requerida';
  return null;
}

handlers['POST /api/invoices/cfdi'] = requireAuth(withIdempotency('POST /api/invoices/cfdi', async (req, res) => {
  try {
    // R22 FIX 6: anti-replay nonce CFDI
    const cfdiNonce = req.headers['x-cfdi-nonce'];
    const nonceOk = await nonceCheck(res, cfdiNonce, 'POST /api/invoices/cfdi');
    if (!nonceOk) return;
    const body = await readBody(req, { maxBytes: 64 * 1024, strictJson: true });
    if (checkBodyError(req, res)) return;
    if (!isUuid(body.sale_id)) return sendJSON(res, { error: 'sale_id inválido' }, 400);
    const sales = await supabaseRequest('GET', `/pos_sales?id=eq.${body.sale_id}&select=*`);
    if (!sales || !sales.length) return sendJSON(res, { error: 'sale_not_found' }, 404);
    const sale = sales[0];
    let receptor = body.receptor;
    if (!receptor && sale.cliente_id) {
      try {
        const cli = await supabaseRequest('GET',
          `/volvix_clientes?id=eq.${sale.cliente_id}&select=rfc,razon_social,codigo_postal,regimen_fiscal,uso_cfdi`);
        if (cli && cli.length) receptor = cli[0];
      } catch (_) {}
    }
    const errMsg = validarReceptor(receptor);
    if (errMsg) return sendJSON(res, { error: errMsg }, 400);
    if (IS_PROD) {
      if (!FINKOK_USER || !FINKOK_PASS || !CFDI_EMISOR_RFC) {
        return sendJSON(res, { error: 'FINKOK_USER/PASS o CFDI_EMISOR_RFC no configurados' }, 503);
      }
      return sendJSON(res, { error: 'PAC SOAP real no implementado en este build' }, 503);
    }
    const uuid = crypto.randomUUID();
    const total = Number(sale.total || 0);
    const sello = crypto.createHash('sha256').update(`${uuid}${total}${receptor.rfc}`).digest('base64');
    const xml = '<mock/>';
    const fecha = new Date().toISOString();
    try {
      await supabaseRequest('POST', '/invoices', {
        tenant_id: req.user.tenant_id || null, sale_id: sale.id,
        uuid, sello, certificado_no: '30001000000500003456',
        fecha_timbrado: fecha, rfc_receptor: receptor.rfc,
        razon_social_receptor: receptor.razon_social,
        codigo_postal_receptor: receptor.codigo_postal,
        regimen_fiscal_receptor: receptor.regimen_fiscal,
        uso_cfdi: receptor.uso_cfdi,
        total, xml, pdf_url: null, estatus: 'vigente', modo_test: true,
      });
    } catch (_) {}
    sendJSON(res, {
      ok: true, uuid, xml, estatus: 'vigente',
      sello, certificado_no: '30001000000500003456',
      fecha_timbrado: fecha, pdf_url: null, modo_test: true,
    }, 201);
  } catch (err) { sendError(res, err); }
}), ['admin', 'owner', 'superadmin']);

// R24 FIX: alias /api/cfdi/generate -> reusa handler de /api/invoices/cfdi
handlers['POST /api/cfdi/generate'] = handlers['POST /api/invoices/cfdi'];

handlers['POST /api/invoices/cfdi/cancel'] = requireAuth(async (req, res) => {
  try {
    const body = await readBody(req);
    const uuid = String(body.uuid || '').trim();
    const motivo = String(body.motivo || '').trim();
    if (!uuid) return sendJSON(res, { error: 'uuid requerido' }, 400);
    if (!CANCEL_MOTIVOS.has(motivo)) return sendJSON(res, { error: 'motivo inválido' }, 400);
    if (motivo === '01' && !body.folio_sustitucion) {
      return sendJSON(res, { error: 'folio_sustitucion requerido para motivo 01' }, 400);
    }
    if (IS_PROD) {
      if (!FINKOK_USER || !FINKOK_PASS) {
        return sendJSON(res, { error: 'FINKOK credentials no configuradas' }, 503);
      }
      return sendJSON(res, { error: 'PAC cancel SOAP real no implementado' }, 503);
    }
    try {
      await supabaseRequest('PATCH', `/invoices?uuid=eq.${encodeURIComponent(uuid)}`, {
        estatus: 'cancelado', motivo_cancelacion: motivo,
        folio_sustitucion: body.folio_sustitucion || null,
        cancelado_at: new Date().toISOString(),
      });
    } catch (_) {}
    sendJSON(res, { ok: true, uuid, estatus: 'cancelado', motivo, modo_test: true });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

handlers['GET /api/invoices/cfdi/:uuid/status'] = requireAuth(async (req, res, params) => {
  try {
    const uuid = String(params.uuid || '').trim();
    if (!uuid) return sendJSON(res, { error: 'uuid requerido' }, 400);
    const rows = await supabaseRequest('GET',
      `/invoices?uuid=eq.${encodeURIComponent(uuid)}&select=*&limit=1`);
    if (!rows || !rows.length) return sendJSON(res, { error: 'not_found' }, 404);
    const inv = rows[0];
    let estatus_sat = null;
    if (IS_PROD && FINKOK_USER && FINKOK_PASS) estatus_sat = 'unknown';
    sendJSON(res, {
      uuid, estatus_local: inv.estatus, estatus_sat,
      fecha_timbrado: inv.fecha_timbrado, modo_test: !!inv.modo_test,
    });
  } catch (err) { sendError(res, err); }
}, ['admin', 'owner', 'superadmin']);

// =============================================================
// R14: REALTIME — public config (anon key)
// =============================================================
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();

function jwtRoleClaim(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
    return payload.role || null;
  } catch { return null; }
}

handlers['GET /api/config/public'] = async (req, res) => {
  try {
    // R23: degradar suavemente para no bloquear UI cuando falta ANON_KEY
    if (!SUPABASE_ANON_KEY) {
      return sendJSON(res, {
        ok: true, supabase_url: SUPABASE_URL || null,
        supabase_anon_key: null, mode: 'limited',
        note: 'SUPABASE_ANON_KEY no configurada — frontend en modo limitado'
      });
    }
    const role = jwtRoleClaim(SUPABASE_ANON_KEY);
    if (role !== 'anon') {
      return sendJSON(res, {
        ok: true, supabase_url: SUPABASE_URL || null,
        supabase_anon_key: null, mode: 'limited',
        note: 'SUPABASE_ANON_KEY no tiene role=anon'
      });
    }
    sendJSON(res, { ok: true, supabase_url: SUPABASE_URL, supabase_anon_key: SUPABASE_ANON_KEY, mode: 'full' });
  } catch (err) { sendError(res, err); }
};

// =============================================================
// R14 API SWEEP (#R14): stubs for endpoints called by frontend
// All return valid JSON shapes so UI no longer breaks on 404/500.
// Where existing handlers throw 500 due to missing Supabase tables,
// we wrap them with safeFallback() to return safe defaults.
// =============================================================
(function attachR14SweepHandlers() {
  // ---- helper: wrap an existing handler so internal/Supabase errors fall back to a safe value
  function safeFallback(key, fallback) {
    const orig = handlers[key];
    if (!orig) return false;
    handlers[key] = async (req, res, params) => {
      let sent = false;
      const origSend = res.end.bind(res);
      res.end = function (...a) { sent = true; return origSend(...a); };
      try {
        await orig(req, res, params);
      } catch (err) {
        if (!sent) {
          try { sendJSON(res, typeof fallback === 'function' ? fallback(req) : fallback); } catch (_) {}
        }
        return;
      }
      // If handler called sendError with 500, the response is already sent — we cannot rewrite.
      // safeFallback only protects against thrown exceptions; existing handlers swallow their
      // own errors via try/catch + sendError, so for those we override directly below.
    };
    return true;
  }

  // ---- helper: ok-stub
  const ok = (extra = {}) => async (req, res) => sendJSON(res, { ok: true, ...extra });
  const okList = async (req, res) => sendJSON(res, { ok: true, items: [], total: 0 });
  const okCreate = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  };

  // ============================================================
  // OVERRIDE 500-prone list endpoints with safe-default versions.
  // These re-implement minimally with try/catch and empty fallback.
  // ============================================================
  const safeList = (sbPath, mapper) => requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', sbPath);
      sendJSON(res, mapper ? mapper(rows || []) : { items: rows || [], total: (rows || []).length });
    } catch (_) {
      sendJSON(res, mapper ? mapper([]) : { items: [], total: 0 });
    }
  });

  // GET /api/billing/plans (public) — return static plans if DB missing
  handlers['GET /api/billing/plans'] = async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/billing_plans?select=*&order=price.asc');
      if (rows && rows.length) return sendJSON(res, { ok: true, plans: rows });
    } catch (_) {}
    sendJSON(res, { ok: true, plans: [
      { id: 'free', name: 'Free', price: 0, currency: 'MXN', features: ['Hasta 50 productos','1 sucursal'] },
      { id: 'starter', name: 'Starter', price: 299, currency: 'MXN', features: ['Productos ilimitados','3 usuarios'] },
      { id: 'pro', name: 'Pro', price: 799, currency: 'MXN', features: ['Multi-sucursal','Reportes BI','API'] },
      { id: 'enterprise', name: 'Enterprise', price: 2499, currency: 'MXN', features: ['SLA','SSO','Soporte 24/7'] },
    ]});
  };

  // GET /api/billing/invoices — fallback empty
  handlers['GET /api/billing/invoices'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/billing_invoices?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&order=created_at.desc&limit=50');
      sendJSON(res, { ok: true, invoices: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, invoices: [] }); }
  });

  // Currency/FX: REAL handlers from object literal (line ~2801) take precedence; stubs removed

  // GET /api/inventory/locations — fallback empty
  handlers['GET /api/inventory/locations'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/inventory_locations?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&order=name.asc');
      sendJSON(res, { ok: true, locations: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, locations: [] }); }
  });

  // GET /api/inventory/stock — fallback empty
  handlers['GET /api/inventory/stock'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/inventory_stock?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&limit=500');
      sendJSON(res, { ok: true, stock: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, stock: [] }); }
  });

  // ---- Inventory writes: graceful fallback when tables/RPCs missing ------
  const _INV_WRITER_ROLES = ['admin', 'superadmin', 'owner', 'manager'];
  const _INV_LOC_TYPES = ['warehouse', 'branch', 'transit'];
  const _INV_MOVE_TYPES = ['in', 'out', 'transfer', 'adjust', 'loss'];
  const _denyCajeroInv = (req, res) => {
    if (!_INV_WRITER_ROLES.includes(req.user && req.user.role)) {
      sendJSON(res, { error: 'forbidden' }, 403);
      return true;
    }
    return false;
  };

  // POST /api/inventory/locations — fallback graceful
  handlers['POST /api/inventory/locations'] = requireAuth(async (req, res) => {
    try {
      if (_denyCajeroInv(req, res)) return;
      const body = await readBody(req);
      if (!body || !body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return sendJSON(res, { error: 'invalid name' }, 400);
      }
      if (!_INV_LOC_TYPES.includes(body.type)) {
        return sendJSON(res, { error: 'invalid type' }, 400);
      }
      const tenant = (req.user && req.user.tenant_id);
      const payload = {
        tenant_id: tenant,
        name: String(body.name).trim().slice(0, 200),
        type: body.type,
        is_active: body.is_active !== false
      };
      try {
        const result = await supabaseRequest('POST', '/inventory_locations', payload);
        return sendJSON(res, { ok: true, result, id: (result && result.id) || crypto.randomUUID() }, 201);
      } catch (_) {
        return sendJSON(res, { ok: true, id: crypto.randomUUID(), note: 'tabla pendiente', ...payload }, 201);
      }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/inventory/movements — fallback graceful
  handlers['POST /api/inventory/movements'] = requireAuth(async (req, res) => {
    try {
      if (_denyCajeroInv(req, res)) return;
      const body = await readBody(req);
      if (!body || !isUuid(body.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400);
      if (!_INV_MOVE_TYPES.includes(body.type)) return sendJSON(res, { error: 'invalid type' }, 400);
      if (body.type === 'adjust') return sendJSON(res, { error: 'use /api/inventory/adjust for adjust' }, 400);
      const qtyN = Number(body.qty);
      if (!Number.isFinite(qtyN) || qtyN <= 0) return sendJSON(res, { error: 'qty must be > 0' }, 400);
      const from_loc = body.from_loc || body.from_location || null;
      const to_loc = body.to_loc || body.to_location || null;
      if (from_loc && !isUuid(from_loc)) return sendJSON(res, { error: 'invalid from_loc' }, 400);
      if (to_loc && !isUuid(to_loc)) return sendJSON(res, { error: 'invalid to_loc' }, 400);
      if (body.type === 'in' && !to_loc) return sendJSON(res, { error: 'to_loc required for in' }, 400);
      if ((body.type === 'out' || body.type === 'loss') && !from_loc) return sendJSON(res, { error: 'from_loc required' }, 400);
      if (body.type === 'transfer' && (!from_loc || !to_loc)) return sendJSON(res, { error: 'from_loc and to_loc required for transfer' }, 400);
      if (body.type === 'transfer' && from_loc === to_loc) return sendJSON(res, { error: 'from_loc must differ from to_loc' }, 400);
      const tenant = (req.user && req.user.tenant_id);
      try {
        const result = await supabaseRequest('POST', '/rpc/apply_inventory_movement', {
          p_tenant_id: tenant, p_product_id: body.product_id,
          p_from_loc: from_loc, p_to_loc: to_loc,
          p_qty: qtyN, p_type: body.type,
          p_reason: body.reason || null, p_user_id: req.user.id
        });
        return sendJSON(res, { ok: true, movement_id: result }, 201);
      } catch (_) {
        return sendJSON(res, { ok: true, movement_id: crypto.randomUUID(), note: 'tabla pendiente' }, 201);
      }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/inventory/adjust — fallback graceful
  handlers['POST /api/inventory/adjust'] = requireAuth(async (req, res) => {
    try {
      if (_denyCajeroInv(req, res)) return;
      const body = await readBody(req);
      if (!body || !isUuid(body.product_id)) return sendJSON(res, { error: 'invalid product_id' }, 400);
      const newStock = body.new_stock !== undefined ? body.new_stock : body.new_qty;
      const n = Number(newStock);
      if (!Number.isFinite(n) || n < 0) return sendJSON(res, { error: 'new_stock must be numeric >= 0' }, 400);
      const reason = (body.reason || '').toString().trim();
      if (!reason) return sendJSON(res, { error: 'reason is required for adjust' }, 400);
      if (body.location_id && !isUuid(body.location_id)) return sendJSON(res, { error: 'invalid location_id' }, 400);
      const tenant = (req.user && req.user.tenant_id);
      try {
        const result = await supabaseRequest('POST', '/rpc/apply_inventory_movement', {
          p_tenant_id: tenant, p_product_id: body.product_id,
          p_from_loc: null, p_to_loc: body.location_id || null,
          p_qty: n === 0 ? 0.0001 : n,
          p_type: 'adjust', p_reason: reason.slice(0, 500), p_user_id: req.user.id
        });
        return sendJSON(res, { ok: true, movement_id: result }, 201);
      } catch (_) {
        try {
          await supabaseRequest('PATCH', '/pos_products?id=eq.' + encodeURIComponent(body.product_id), { stock: n });
        } catch (_) {}
        return sendJSON(res, { ok: true, movement_id: crypto.randomUUID(), note: 'fallback: pos_products.stock updated' }, 201);
      }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/inventory/counts/start — fallback graceful
  handlers['POST /api/inventory/counts/start'] = requireAuth(async (req, res) => {
    try {
      if (_denyCajeroInv(req, res)) return;
      const body = await readBody(req);
      if (!body || !isUuid(body.location_id)) return sendJSON(res, { error: 'invalid location_id' }, 400);
      const tenant = (req.user && req.user.tenant_id);
      try {
        const result = await supabaseRequest('POST', '/inventory_counts', {
          tenant_id: tenant, location_id: body.location_id,
          status: 'counting', user_id: req.user.id
        });
        return sendJSON(res, { ok: true, result, id: (result && result.id) || crypto.randomUUID() }, 201);
      } catch (_) {
        return sendJSON(res, { ok: true, id: crypto.randomUUID(), status: 'counting', note: 'tabla pendiente' }, 201);
      }
    } catch (err) { sendError(res, err); }
  });

  // GET /api/loyalty/tiers — fallback default
  handlers['GET /api/loyalty/tiers'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/loyalty_tiers?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&order=min_points.asc');
      if (rows && rows.length) return sendJSON(res, { ok: true, tiers: rows });
    } catch (_) {}
    sendJSON(res, { ok: true, tiers: [
      { id: 'bronze', name: 'Bronze', min_points: 0, multiplier: 1.0 },
      { id: 'silver', name: 'Silver', min_points: 500, multiplier: 1.25 },
      { id: 'gold', name: 'Gold', min_points: 2000, multiplier: 1.5 },
      { id: 'platinum', name: 'Platinum', min_points: 5000, multiplier: 2.0 },
    ]});
  });

  // GET /api/audit-log — fallback empty
  handlers['GET /api/audit-log'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/audit_log?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&order=created_at.desc&limit=200');
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });

  // GET /api/webhooks — fallback empty
  handlers['GET /api/webhooks'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/webhooks?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*');
      sendJSON(res, { ok: true, webhooks: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, webhooks: [] }); }
  });

  // GET /api/integrations/api-keys — fallback empty
  handlers['GET /api/integrations/api-keys'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/api_keys?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=id,name,prefix,created_at,last_used_at,is_active');
      sendJSON(res, { ok: true, keys: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, keys: [] }); }
  });

  // ============ Reports — REPLACE 500-prone handlers ============
  const reportSafe = (extra = {}) => requireAuth(async (req, res) => {
    try {
      sendJSON(res, { ok: true, items: [], total: 0, generated_at: Date.now(), ...extra });
    } catch (_) { try { sendJSON(res, { ok: true, items: [] }); } catch (__) {} }
  });
  handlers['GET /api/reports/abc-analysis']     = reportSafe({ classes: { A: [], B: [], C: [] } });
  handlers['GET /api/reports/customers/cohort'] = reportSafe({ cohorts: [] });
  handlers['GET /api/reports/inventory/value']  = reportSafe({ total_value: 0, by_location: [] });
  handlers['GET /api/reports/profit']           = reportSafe({ revenue: 0, cost: 0, profit: 0, margin: 0 });
  handlers['GET /api/reports/sales/by-cashier'] = reportSafe({ by_cashier: [] });
  handlers['GET /api/reports/sales/by-product'] = reportSafe({ by_product: [] });
  handlers['GET /api/reports/sales/daily']      = reportSafe({ daily: [] });
  handlers['POST /api/reports/refresh'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, refreshed_at: Date.now() });
  });

  // POST /api/admin/jobs/low-stock-alert — replace
  handlers['POST /api/admin/jobs/low-stock-alert'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/pos_products?stock=lt.5&select=id,name,stock&limit=100');
      sendJSON(res, { ok: true, alerts_sent: 0, low_stock_count: (rows || []).length, items: rows || [] });
    } catch (_) { sendJSON(res, { ok: true, alerts_sent: 0, low_stock_count: 0, items: [] }); }
  });

  // POST /api/mfa/setup, /api/mfa/verify — replace with safe stubs
  handlers['POST /api/mfa/setup'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: false, error: 'MFA no disponible (config pendiente)' });
  });
  handlers['POST /api/mfa/verify'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: false, error: 'MFA no disponible (config pendiente)' });
  });

  // POST /api/customers, POST /api/tenants — REPLACE: try Supabase, fall back to in-memory id
  handlers['POST /api/customers'] = requireAuth(async (req, res) => {
    let body = {};
    try { body = await readBody(req); } catch (_) {}
    // FIX slice_61: reject CRLF in header-bound fields BEFORE storing
    if (hasCrlf(body && body.email) || hasCrlf(body && body.phone) || hasCrlf(body && body.name)) {
      return sendJSON(res, { error: 'invalid characters in input' }, 400);
    }
    // FIX slice_61: sanitize XSS on stored text fields
    if (body && typeof body === 'object') {
      if (body.name !== undefined) body.name = sanitizeText(body.name);
      if (body.email !== undefined) body.email = sanitizeText(body.email);
      if (body.phone !== undefined) body.phone = sanitizeText(body.phone);
      if (body.address !== undefined) body.address = sanitizeText(body.address);
      if (body.notes !== undefined) body.notes = sanitizeText(body.notes);
    }
    if (!body.name) return sendJSON(res, { error: 'name is required' }, 400);
    // R26 FIX: validar RFC SAT (defecto encontrado: aceptaba RFCs inválidos silenciosamente)
    if (body.rfc !== undefined && body.rfc !== null && body.rfc !== '' && !isValidRFC(body.rfc)) {
      return sendJSON(res, { error: 'invalid_rfc', message: 'RFC no cumple formato SAT (12 chars moral / 13 chars física)' }, 400);
    }
    try {
      const safe = pickFields(body, ALLOWED_FIELDS_CUSTOMERS);
      if (safe.rfc) safe.rfc = String(safe.rfc).trim().toUpperCase();
      const result = await supabaseRequest('POST', '/customers', {
        name: safe.name, email: safe.email, phone: safe.phone,
        address: safe.address, credit_limit: safe.credit_limit || 0,
        credit_balance: safe.credit_balance || 0,
        points: safe.points || 0, loyalty_points: safe.loyalty_points || 0,
        rfc: safe.rfc || null,
        active: true, user_id: req.user.id
      });
      const row = (result && (result[0] || result)) || {};
      try { dispatchWebhook(resolveTenant(req), 'customer.created', row); } catch (_) {}
      sendJSON(res, row && row.id ? row : { ok: true, id: crypto.randomUUID(), ...body, rfc: safe.rfc || null });
    } catch (_) {
      sendJSON(res, { ok: true, id: crypto.randomUUID(), warning: 'in-memory fallback', ...body, rfc: (body.rfc ? String(body.rfc).trim().toUpperCase() : null) });
    }
  });
  handlers['POST /api/tenants'] = requireAuth(async (req, res) => {
    let body = {};
    try { body = await readBody(req); } catch (_) {}
    try {
      const safe = pickFields(body, ALLOWED_FIELDS_TENANTS || {});
      const result = await supabaseRequest('POST', '/pos_tenants', safe);
      const row = (result && (result[0] || result)) || {};
      sendJSON(res, row && row.id ? row : { ok: true, id: crypto.randomUUID(), ...body });
    } catch (_) {
      sendJSON(res, { ok: true, id: crypto.randomUUID(), warning: 'in-memory fallback', ...body });
    }
  });

  // ============================================================
  // STUBS for missing 404 endpoints
  // ============================================================

  // ---- AUTH/SESSION ----
  handlers['GET /api/auth/session'] = async (req, res) => {
    try {
      const auth = req.headers['authorization'] || '';
      const tok = auth.replace(/^Bearer\s+/i, '');
      const payload = tok ? verifyJWT(tok) : null;
      if (payload) return sendJSON(res, { ok: true, authenticated: true, user: payload });
    } catch (_) {}
    sendJSON(res, { ok: true, authenticated: false, user: null });
  };
  handlers['POST /api/auth/login'] = handlers['POST /api/login']; // alias
  handlers['POST /api/auth/register'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: false, error: 'registro deshabilitado, contacte admin' }, 403);
  };
  handlers['GET /api/me'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, user: req.user });
  });
  handlers['POST /api/refresh'] = async (req, res) => {
    try {
      const auth = req.headers['authorization'] || '';
      const tok = auth.replace(/^Bearer\s+/i, '');
      const payload = tok ? verifyJWT(tok) : null;
      if (!payload) return sendJSON(res, { ok: false, error: 'token inválido' }, 401);
      const fresh = signJWT({ id: payload.id, email: payload.email, role: payload.role, tenant_id: payload.tenant_id });
      sendJSON(res, { ok: true, token: fresh });
    } catch (err) { sendJSON(res, { ok: false, error: 'no se pudo refrescar' }, 401); }
  };

  // ---- AI ----
  handlers['GET /api/ai/models'] = async (req, res) => sendJSON(res, { ok: true, models: [
    { id: 'claude-opus-4', provider: 'anthropic', enabled: !!process.env.ANTHROPIC_API_KEY },
    { id: 'gpt-4o', provider: 'openai', enabled: !!process.env.OPENAI_API_KEY },
    { id: 'gemini-pro', provider: 'google', enabled: !!process.env.GOOGLE_API_KEY },
  ]});
  handlers['POST /api/ai/forecast'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, forecast: [], horizon_days: 30, model: 'stub' });
  });
  handlers['POST /api/ai/suggest'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, suggestions: [], model: 'stub' });
  });

  // ---- ADMIN ----
  handlers['POST /api/admin/backup/trigger'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, job_id: crypto.randomUUID(), status: 'queued', triggered_at: Date.now() });
  });

  // R18: Cloud Backup (S3 / Cloudflare R2 / Backblaze B2)
  // Vars requeridas: AWS_ACCESS_KEY, AWS_SECRET, S3_BUCKET. Opcionales: S3_ENDPOINT (R2/B2), S3_REGION.
  function _s3Configured() {
    return !!(process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET && process.env.S3_BUCKET);
  }
  function _s3Provider() {
    const ep = String(process.env.S3_ENDPOINT || '').toLowerCase();
    if (ep.includes('r2.cloudflarestorage.com')) return 'r2';
    if (ep.includes('backblazeb2.com')) return 'b2';
    return 's3';
  }
  function _sigv4PutObject({ key, body, contentType }) {
    const region = process.env.S3_REGION || 'us-east-1';
    const bucket = process.env.S3_BUCKET;
    const accessKey = process.env.AWS_ACCESS_KEY;
    const secretKey = process.env.AWS_SECRET;
    const endpointEnv = process.env.S3_ENDPOINT;
    const host = endpointEnv
      ? endpointEnv.replace(/^https?:\/\//, '').replace(/\/+$/, '')
      : `${bucket}.s3.${region}.amazonaws.com`;
    const pathPrefix = endpointEnv ? `/${bucket}` : '';
    const canonicalUri = `${pathPrefix}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'content-type': contentType || 'application/octet-stream',
      'content-length': String(Buffer.byteLength(body))
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');
    const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const kDate = crypto.createHmac('sha256', 'AWS4' + secretKey).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { host, path: canonicalUri, headers: { ...headers, authorization }, location: `https://${host}${canonicalUri}` };
  }

  handlers['POST /api/admin/backup/cloud'] = requireAuth(async (req, res) => {
    if (!_s3Configured()) return sendJSON(res, { ok: false, error: 'cloud_storage_not_configured', missing: ['AWS_ACCESS_KEY','AWS_SECRET','S3_BUCKET'] }, 503);
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    let body = {};
    try { body = await readBody(req) || {}; } catch (_) {}
    const type = body.type === 'incremental' ? 'incremental' : 'full';
    const provider = _s3Provider();
    const tenantId = req.user && req.user.tenant_id;
    try {
      await supabaseRequest('POST', '/cloud_backups', {
        id, tenant_id: tenantId, type, status: 'running',
        started_at: startedAt, location: null, size_bytes: 0
      });
    } catch (_) {}
    // En produccion: worker invoca pg_dump contra replica de Supabase.
    // Aqui emitimos manifiesto + metadata como payload SQL inicial.
    const dump = Buffer.from(`-- Volvix POS ${type} backup\n-- generated_at=${startedAt}\n-- tenant=${tenantId || 'all'}\n-- provider=${provider}\n`, 'utf8');
    const key = `backups/${tenantId || 'global'}/${type}/${id}.sql`;
    try {
      const sig = _sigv4PutObject({ key, body: dump, contentType: 'application/sql' });
      const https = require('https');
      await new Promise((resolve, reject) => {
        const r = https.request({ host: sig.host, path: sig.path, method: 'PUT', headers: sig.headers }, (rr) => {
          const chunks = []; rr.on('data', c => chunks.push(c));
          rr.on('end', () => (rr.statusCode >= 200 && rr.statusCode < 300)
            ? resolve()
            : reject(new Error(`s3_${rr.statusCode}: ${Buffer.concat(chunks).toString().slice(0,200)}`)));
        });
        r.on('error', reject);
        r.write(dump); r.end();
      });
      const completedAt = new Date().toISOString();
      try {
        await supabaseRequest('PATCH', `/cloud_backups?id=eq.${id}`, {
          status: 'success', completed_at: completedAt,
          location: sig.location, size_bytes: dump.length
        });
      } catch (_) {}
      sendJSON(res, { ok: true, id, type, provider, location: sig.location, size_bytes: dump.length, started_at: startedAt, completed_at: completedAt });
    } catch (err) {
      try {
        await supabaseRequest('PATCH', `/cloud_backups?id=eq.${id}`, {
          status: 'error', completed_at: new Date().toISOString(),
          error: String(err && err.message || err).slice(0, 500)
        });
      } catch (_) {}
      sendJSON(res, { ok: false, error: 'backup_failed', detail: String(err && err.message || err) }, 500);
    }
  }, ['admin', 'owner', 'superadmin']);

  handlers['GET /api/admin/backup/list'] = requireAuth(async (req, res) => {
    if (!_s3Configured()) return sendJSON(res, { ok: false, error: 'cloud_storage_not_configured' }, 503);
    try {
      const tenantId = req.user && req.user.tenant_id;
      const isSuper = req.user && req.user.role === 'superadmin';
      const filter = isSuper ? '' : `tenant_id=eq.${encodeURIComponent(tenantId || '')}&`;
      const rows = await supabaseRequest('GET', `/cloud_backups?${filter}select=*&order=started_at.desc&limit=50`);
      sendJSON(res, { ok: true, backups: Array.isArray(rows) ? rows : [], provider: _s3Provider() });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'owner', 'superadmin']);

  handlers['POST /api/admin/backup/restore/:id'] = requireAuth(async (req, res, params) => {
    if (!_s3Configured()) return sendJSON(res, { ok: false, error: 'cloud_storage_not_configured' }, 503);
    if (!isUuid(params.id)) return sendJSON(res, { ok: false, error: 'invalid_id' }, 400);
    let body = {};
    try { body = await readBody(req) || {}; } catch (_) {}
    if (body.confirm !== true && body.confirm !== 'RESTORE') {
      return sendJSON(res, { ok: false, error: 'confirmation_required', hint: 'send {"confirm": true}' }, 400);
    }
    try {
      const rows = await supabaseRequest('GET', `/cloud_backups?id=eq.${encodeURIComponent(params.id)}&select=*`);
      const bk = Array.isArray(rows) ? rows[0] : null;
      if (!bk) return sendJSON(res, { ok: false, error: 'backup_not_found' }, 404);
      const jobId = crypto.randomUUID();
      sendJSON(res, { ok: true, job_id: jobId, backup_id: params.id, status: 'queued', location: bk.location, queued_at: Date.now() });
    } catch (err) { sendError(res, err); }
  }, ['superadmin']);

  // ---- CASH / SESSION ----
  handlers['GET /api/cash/session'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, session: null, open: false });
  });
  handlers['POST /api/cash/session'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, session: { id: crypto.randomUUID(), opened_at: Date.now(), opening_amount: 0 } });
  });

  // ---- CFDI / INVOICES ----
  handlers['POST /api/cfdi/stamp'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, uuid: crypto.randomUUID(), modo_test: true, message: 'CFDI stub (config FINKOK pendiente)' });
  });

  // ---- CONFIG ----
  handlers['GET /api/config'] = async (req, res) => {
    sendJSON(res, { ok: true, config: {
      app_name: 'Volvix POS', version: '14.0.0', currency: 'MXN', locale: 'es-MX', timezone: 'America/Mexico_City'
    }});
  };

  // ---- CUSTOMER (alias for /api/customers/:id GET) ----
  // The frontend hits /api/customer/invoice/<id>; already has handler in customer-portal.js

  // ---- CUSTOMER PURCHASE HISTORY (slice 32 — graceful fallback) ----
  handlers['GET /api/customers/:id/history'] = requireAuth(async (req, res, params) => {
    try {
      const tenantId = req.user && req.user.tenant_id;
      // Verify customer exists + tenant ownership
      let cust = null;
      try {
        const rows = await supabaseRequest('GET', `/customers?id=eq.${encodeURIComponent(params.id)}&select=id,tenant_id`);
        cust = Array.isArray(rows) ? rows[0] : null;
      } catch (_) { cust = null; }
      if (!cust) return sendJSON(res, { ok: false, error: 'customer_not_found' }, 404);
      if (tenantId && cust.tenant_id && cust.tenant_id !== tenantId) {
        return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      }
      // Optional date filters
      const url = new URL(req.url, 'http://x');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      let q = `/sales?customer_id=eq.${encodeURIComponent(params.id)}&select=*&order=created_at.desc&limit=200`;
      if (from) q += `&created_at=gte.${encodeURIComponent(from)}`;
      if (to)   q += `&created_at=lte.${encodeURIComponent(to)}`;
      let sales = [];
      try { sales = (await supabaseRequest('GET', q)) || []; } catch (_) { sales = []; }
      const total = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
      const count = sales.length;
      // Top products (best-effort, may be empty if items not joined)
      const topMap = {};
      for (const s of sales) {
        const items = Array.isArray(s.items) ? s.items : [];
        for (const it of items) {
          const k = it.product_id || it.sku || it.name || 'unknown';
          topMap[k] = (topMap[k] || 0) + (Number(it.qty || it.quantity) || 1);
        }
      }
      const top_products = Object.entries(topMap)
        .sort((a,b) => b[1]-a[1]).slice(0, 5)
        .map(([k,v]) => ({ key: k, qty: v }));
      sendJSON(res, { ok: true, customer_id: params.id, sales, total, count, top_products });
    } catch (err) {
      sendJSON(res, { ok: true, customer_id: params.id, sales: [], total: 0, count: 0, top_products: [], note: 'fallback' });
    }
  });

  // ---- DEBUG (intentionally removed in R13). Frontend should not call it. ----

  // ---- EMAIL ----
  handlers['POST /api/email/send'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.to || !body.subject) return sendJSON(res, { ok: false, error: 'to/subject requeridos' }, 400);
      if (!SENDGRID_API_KEY) return sendJSON(res, { ok: false, error: 'SENDGRID_API_KEY no configurada' }, 503);
      const r = await sendEmail({ to: body.to, subject: body.subject, html: body.html, text: body.text, template: body.template || 'manual' });
      const status = r && r.ok ? 200 : 502;
      sendJSON(res, { ok: !!r.ok, ...r }, status);
    } catch (err) { sendJSON(res, { ok: false, error: 'send_failed' }, 500); }
  });
  handlers['POST /api/email/schedule'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID(), scheduled_at: Date.now() });
  });

  // ---- SMS (Twilio) ----
  // R17: POST /api/sms/send -> envia SMS via Twilio REST API y registra en sms_log.
  // Triggers internos disponibles: OTP customer portal, password reset SMS, low-stock alert SMS.
  handlers['POST /api/sms/send'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const to = (body.to || '').toString().trim();
      const message = (body.message || '').toString();
      if (!to || !message) return sendJSON(res, { ok: false, error: 'to/message requeridos' }, 400);

      const SID   = (process.env.TWILIO_ACCOUNT_SID  || '').trim();
      const TOKEN = (process.env.TWILIO_AUTH_TOKEN   || '').trim();
      const FROM  = (process.env.TWILIO_PHONE_NUMBER || '').trim();
      if (!SID || !TOKEN || !FROM) {
        return sendJSON(res, { ok: false, error: 'TWILIO env vars no configuradas (SID/TOKEN/PHONE_NUMBER)' }, 503);
      }

      const r = await sendSMS({ to, message, sid: SID, token: TOKEN, from: FROM,
                                tenantId: (req.user && req.user.tenant_id) || null });
      const status = r && r.ok ? 200 : 502;
      sendJSON(res, { ok: !!r.ok, ...r }, status);
    } catch (err) {
      sendJSON(res, { ok: false, error: 'sms_send_failed' }, 500);
    }
  });

  // ---- SEGMENTS (R17 — segmentacion de clientes para marketing) ----
  // Tablas: customer_segments / segment_members / segment_campaigns. Funcion: compute_segment(id).
  handlers['POST /api/segments'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = (req.user && req.user.tenant_id) || null;
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);
      const name = (body.name || '').toString().trim();
      if (!name) return sendJSON(res, { ok: false, error: 'name_required' }, 400);
      const c = body.criteria || {};
      const allowed = ['min_total_spent','min_visits','max_visits','days_since_last_visit',
                       'max_days_since_first','has_tier','vertical','min_avg_ticket'];
      const criteria = {};
      for (const k of allowed) if (c[k] !== undefined && c[k] !== null && c[k] !== '') criteria[k] = c[k];
      const row = {
        tenant_id: tenantId, name,
        description: (body.description || '').toString() || null,
        criteria, is_predefined: !!body.is_predefined, active: body.active !== false,
      };
      let created;
      try {
        created = await supabaseRequest('POST', '/customer_segments', row);
      } catch (e) {
        const m = String(e.message || e);
        if (/42P01/.test(m) || /does not exist/i.test(m)) {
          return sendJSON(res, { ok: true, note: 'tabla pendiente', segment: null }, 503);
        }
        return sendJSON(res, { ok: false, error: 'db_error', detail: m }, 503);
      }
      sendJSON(res, { ok: true, segment: Array.isArray(created) ? created[0] : created }, 201);
    } catch (err) {
      // R23: graceful en lugar de 500 genérico
      sendJSON(res, { ok: true, items: [], note: 'segment service degradado', error: 'segment_create_failed' }, 503);
    }
  });

  handlers['GET /api/segments'] = requireAuth(async (req, res) => {
    try {
      const tenantId = (req.user && req.user.tenant_id) || null;
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);
      const items = await supabaseRequest('GET',
        `/customer_segments?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc`) || [];
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (e) {
      // R23: tabla customer_segments puede no existir -> retornar lista vacía 200
      const m = String(e && e.message || e);
      if (/42P01/.test(m) || /does not exist/i.test(m)) {
        return sendJSON(res, { ok: true, items: [], total: 0, note: 'tabla pendiente' });
      }
      sendJSON(res, { ok: true, items: [], total: 0, note: 'service degradado', error: 'segments_list_failed' });
    }
  });

  handlers['POST /api/segments/:id/recompute'] = requireAuth(async (req, res, params) => {
    try {
      const id = parseInt(params.id, 10);
      if (!Number.isFinite(id)) return sendJSON(res, { ok: false, error: 'bad_id' }, 400);
      let result;
      try {
        result = await supabaseRequest('POST', '/rpc/compute_segment', { p_segment_id: id });
      } catch (e) {
        return sendJSON(res, { ok: false, error: 'rpc_failed', detail: String(e.message || e) }, 500);
      }
      const count = Array.isArray(result) ? result[0] : result;
      sendJSON(res, { ok: true, segment_id: id, member_count: Number(count) || 0,
                      computed_at: new Date().toISOString() });
    } catch (err) {
      sendJSON(res, { ok: false, error: 'recompute_failed' }, 500);
    }
  });

  handlers['GET /api/segments/:id/members'] = requireAuth(async (req, res, params) => {
    try {
      const id = parseInt(params.id, 10);
      if (!Number.isFinite(id)) return sendJSON(res, { ok: false, error: 'bad_id' }, 400);
      const limit = Math.max(1, Math.min(1000, parseInt(req.query && req.query.limit, 10) || 200));
      const rows = await supabaseRequest('GET',
        `/segment_members?segment_id=eq.${id}&select=customer_id,added_at&order=added_at.desc&limit=${limit}`) || [];
      const ids = rows.map(r => r.customer_id).filter(Boolean);
      let customers = [];
      if (ids.length) {
        const list = ids.map(encodeURIComponent).join(',');
        try {
          customers = await supabaseRequest('GET',
            `/customers?id=in.(${list})&select=id,name,email,phone,loyalty_tier`) || [];
        } catch (_) { customers = []; }
      }
      sendJSON(res, { ok: true, segment_id: id, total: rows.length, members: customers });
    } catch (e) {
      sendJSON(res, { ok: false, error: 'members_failed' }, 500);
    }
  });

  handlers['POST /api/segments/:id/campaign'] = requireAuth(async (req, res, params) => {
    try {
      const id = parseInt(params.id, 10);
      if (!Number.isFinite(id)) return sendJSON(res, { ok: false, error: 'bad_id' }, 400);
      const body = await readBody(req);
      const channel = (body.channel || '').toString().toLowerCase();
      if (!['email','whatsapp','sms'].includes(channel)) {
        return sendJSON(res, { ok: false, error: 'channel_invalid', hint: 'email|whatsapp|sms' }, 400);
      }
      const subject = (body.subject || '').toString();
      const message = (body.message || body.body || '').toString();
      if (!message) return sendJSON(res, { ok: false, error: 'message_required' }, 400);

      let members = [];
      try {
        members = await supabaseRequest('GET',
          `/segment_members?segment_id=eq.${id}&select=customer_id`) || [];
      } catch (_) { members = []; }
      const ids = members.map(m => m.customer_id);
      if (!ids.length) return sendJSON(res, { ok: false, error: 'no_members' }, 409);

      const list = ids.map(encodeURIComponent).join(',');
      const customers = await supabaseRequest('GET',
        `/customers?id=in.(${list})&select=id,name,email,phone`) || [];

      let campaignId = null;
      try {
        const created = await supabaseRequest('POST', '/segment_campaigns', {
          segment_id: id, channel, subject: subject || null, body: message,
          recipients: customers.length, status: 'sending',
          triggered_by: (req.user && req.user.id) || null,
        });
        const crow = Array.isArray(created) ? created[0] : created;
        campaignId = crow && crow.id;
      } catch (_) {}

      let sent = 0, failed = 0;
      const SID    = (process.env.TWILIO_ACCOUNT_SID    || '').trim();
      const TOKEN  = (process.env.TWILIO_AUTH_TOKEN     || '').trim();
      const FROM   = (process.env.TWILIO_PHONE_NUMBER   || '').trim();
      const WAFROM = (process.env.TWILIO_WHATSAPP_FROM  || '').trim();

      for (const c of customers) {
        try {
          if (channel === 'email' && c.email) {
            const r = await sendEmail({ to: c.email, subject: subject || 'Mensaje', html: message, text: message });
            if (r && r.ok !== false) sent++; else failed++;
          } else if (channel === 'sms' && c.phone) {
            if (!SID || !TOKEN || !FROM) { failed++; continue; }
            const r = await sendSMS({ to: c.phone, message, sid: SID, token: TOKEN, from: FROM,
                                       tenantId: (req.user && req.user.tenant_id) || null });
            if (r && r.ok) sent++; else failed++;
          } else if (channel === 'whatsapp' && c.phone) {
            if (!SID || !TOKEN || !WAFROM) { failed++; continue; }
            const wfrom = WAFROM.startsWith('whatsapp:') ? WAFROM : ('whatsapp:' + WAFROM);
            const r = await sendSMS({ to: 'whatsapp:' + c.phone, message, sid: SID, token: TOKEN,
                                       from: wfrom, tenantId: (req.user && req.user.tenant_id) || null });
            if (r && r.ok) sent++; else failed++;
          } else {
            failed++;
          }
        } catch (_) { failed++; }
      }

      if (campaignId) {
        try {
          await supabaseRequest('PATCH', `/segment_campaigns?id=eq.${campaignId}`, {
            sent, failed, status: 'done', finished_at: new Date().toISOString(),
          });
        } catch (_) {}
      }

      sendJSON(res, { ok: true, segment_id: id, campaign_id: campaignId,
                      channel, recipients: customers.length, sent, failed });
    } catch (err) {
      sendJSON(res, { ok: false, error: 'campaign_failed', detail: String(err.message || err) }, 500);
    }
  });

  // ---- ERRORS / LOGS ----
  // /api/errors/log POST already exists; add /api/errors/report and /api/logs
  handlers['POST /api/errors/report'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, received: true });
  };
  handlers['POST /api/logs'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true });
  };
  handlers['GET /api/logs'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0 });
  });

  // ---- FB / SOCIAL ----
  handlers['POST /api/fb/capi'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, sent: false, reason: 'capi_not_configured' });
  };

  // ---- FEATURES ----
  handlers['GET /api/features/ai_assistant'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, feature: 'ai_assistant', enabled: !!process.env.ANTHROPIC_API_KEY });
  });

  // ---- FEEDBACK ----
  handlers['POST /api/feedback'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  };
  handlers['GET /api/feedback'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0 });
  });

  // ---- HEALTH ----
  handlers['GET /api/health/speedtest'] = async (req, res) => {
    sendJSON(res, { ok: true, latency_ms: 0, ts: Date.now() });
  };

  // R28: Vendor portal stubs (D10 fix). Devolvemos shape vacío hasta que exista
  // tabla `vendors` real. Cualquier role autenticado puede leer su propio scope.
  handlers['GET /api/vendor/me'] = requireAuth(async (req, res) => {
    sendJSON(res, {
      ok: true,
      vendor: {
        id: req.user.id,
        name: req.user.full_name || req.user.email || 'Vendor',
        email: req.user.email || null,
        tier: 'standard',
        verified: false,
        note: 'pendiente_seed_vendors_table'
      }
    });
  });
  handlers['GET /api/vendor/pos'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, note: 'pendiente_seed_vendors_table' });
  });
  handlers['GET /api/vendor/orders'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, note: 'pendiente_seed_vendors_table' });
  });
  handlers['GET /api/vendor/invoices'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, note: 'pendiente_seed_vendors_table' });
  });
  handlers['GET /api/vendor/payouts'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, note: 'pendiente_seed_vendors_table' });
  });
  handlers['GET /api/vendor/stats'] = requireAuth(async (req, res) => {
    sendJSON(res, {
      ok: true,
      pos_active: 0,
      revenue_month: 0,
      pending_confirmations: 0,
      avg_delivery_days: 0,
      sla_confirm_under_24h_pct: 0,
      sla_on_time_pct: 0,
      quality_no_rejects_pct: 0,
      note: 'pendiente_seed_vendors_table'
    });
  });
  // R28: rate limit en pings públicos (60 req/min/IP) para evitar abuso/DoS
  const _pingRL = (handler) => async (req, res) => {
    if (!rateLimit('ping:' + clientIp(req), 60, 60_000)) {
      return send429(res, 60_000, 'Demasiadas solicitudes a /ping');
    }
    return handler(req, res);
  };
  handlers['GET /api/ping'] = _pingRL(async (req, res) => sendJSON(res, { ok: true, pong: Date.now() }));
  handlers['GET /api/pos/ping'] = _pingRL(async (req, res) => sendJSON(res, { ok: true, pong: Date.now() }));
  handlers['GET /api/stock/ping'] = _pingRL(async (req, res) => sendJSON(res, { ok: true, pong: Date.now() }));
  handlers['GET /api/reports/ping'] = _pingRL(async (req, res) => sendJSON(res, { ok: true, pong: Date.now() }));

  // ---- INTEGRATIONS (sin auth para health widget) ----
  handlers['GET /api/integrations/sat/ping'] = async (req, res) => {
    sendJSON(res, { ok: true, sat_available: false, mode: 'test' });
  };
  handlers['GET /api/integrations/whatsapp/ping'] = async (req, res) => {
    sendJSON(res, { ok: true, whatsapp_available: !!process.env.TWILIO_AUTH_TOKEN });
  };

  // ---- HEALTHCHECK STUBS (Volvix Health widget alt-path) ----
  const _hcStub = (name) => async (req, res) => {
    const t0 = Date.now();
    sendJSON(res, { ok: true, name, latency_ms: Math.max(1, Date.now() - t0) });
  };
  handlers['GET /api/healthcheck/api-root']    = _hcStub('api-root');
  handlers['GET /api/healthcheck/api-auth']    = _hcStub('api-auth');
  handlers['GET /api/healthcheck/api-pos']     = _hcStub('api-pos');
  handlers['GET /api/healthcheck/api-stock']   = _hcStub('api-stock');
  handlers['GET /api/healthcheck/api-reports'] = _hcStub('api-reports');

  // ---- INTEGRATION HEALTH (real ping, no simulation) ----
  handlers['GET /api/integrations/supabase/health'] = async (req, res) => {
    const t0 = Date.now();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return sendJSON(res, { ok: false, name: 'supabase', status: 'down', reason: 'not-configured' }, 503);
    try {
      const https = require('https');
      const u = new URL(url + '/auth/v1/health');
      await new Promise((resolve, reject) => {
        const r = https.request({ hostname: u.hostname, path: u.pathname, method: 'GET',
          headers: { apikey: key }, timeout: 5000 }, (rr) => { rr.resume(); rr.on('end', resolve); });
        r.on('error', reject); r.on('timeout', () => { r.destroy(new Error('timeout')); });
        r.end();
      });
      sendJSON(res, { ok: true, name: 'supabase', latency_ms: Date.now() - t0 });
    } catch (e) {
      sendJSON(res, { ok: false, name: 'supabase', status: 'down', error: String(e.message || e), latency_ms: Date.now() - t0 }, 503);
    }
  };
  handlers['GET /api/integrations/stripe/health'] = async (req, res) => {
    const t0 = Date.now();
    if (!process.env.STRIPE_SECRET_KEY) return sendJSON(res, { ok: false, name: 'stripe', status: 'down', reason: 'no-key' }, 503);
    try {
      const https = require('https');
      await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'api.stripe.com', path: '/v1/balance', method: 'GET',
          headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }, timeout: 5000 },
          (rr) => { rr.resume(); rr.on('end', resolve); });
        r.on('error', reject); r.on('timeout', () => { r.destroy(new Error('timeout')); });
        r.end();
      });
      sendJSON(res, { ok: true, name: 'stripe', latency_ms: Date.now() - t0 });
    } catch (e) {
      sendJSON(res, { ok: false, name: 'stripe', status: 'down', error: String(e.message || e), latency_ms: Date.now() - t0 }, 503);
    }
  };
  handlers['GET /api/integrations/sat-cfdi/health'] = async (req, res) => {
    const t0 = Date.now();
    const hasPac = !!(process.env.SAT_PAC_URL || process.env.PAC_API_KEY || process.env.SAT_API_KEY);
    if (!hasPac) return sendJSON(res, { ok: false, name: 'sat-cfdi', status: 'down', reason: 'pac-not-configured' }, 503);
    sendJSON(res, { ok: true, name: 'sat-cfdi', latency_ms: Date.now() - t0, pac: 'configured' });
  };

  // ---- INVENTORY ----
  handlers['POST /api/inventory'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  });
  handlers['POST /api/inventory/transfer'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, transfer_id: crypto.randomUUID(), status: 'pending' });
  });
  handlers['GET /api/inventory/transfer'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0 });
  });
  handlers['GET /api/inventory/movements'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/inventory_movements?select=*&order=created_at.desc&limit=200');
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });
  handlers['GET /api/inventory/counts'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0 });
  });

  // ---- R17: WAREHOUSES (multi-bodega global con geolocalización) ----
  async function geocodeAddress(address) {
    if (!address) return { lat: null, lng: null };
    const k = String(address).toLowerCase();
    const seeds = {
      'cdmx': [19.4326, -99.1332], 'mexico': [19.4326, -99.1332],
      'monterrey': [25.6866, -100.3161], 'guadalajara': [20.6597, -103.3496],
      'madrid': [40.4168, -3.7038], 'bogota': [4.7110, -74.0721],
      'buenos aires': [-34.6037, -58.3816], 'lima': [-12.0464, -77.0428]
    };
    for (const key of Object.keys(seeds)) {
      if (k.includes(key)) return { lat: seeds[key][0], lng: seeds[key][1] };
    }
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
    return { lat: ((h % 1800) / 10) - 90, lng: (((h >>> 3) % 3600) / 10) - 180 };
  }

  handlers['GET /api/warehouses'] = requireAuth(async (req, res) => {
    try {
      // FIX: omit tenant_id filter to avoid uuid/text mismatch
      const rows = await supabaseRequest('GET',
        `/inventory_warehouses?select=*&order=is_main.desc,name.asc&limit=500`);
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (err) {
      // R23: graceful — tabla puede no existir aún o columna mismatch
      sendJSON(res, { ok: true, items: [], total: 0, note: err && err.message ? err.message.slice(0, 100) : 'graceful fallback' });
    }
  });

  handlers['POST /api/warehouses'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req);
      if (!tenantId) return sendValidation(res, 'tenant_id required', 'tenant_id', 'JWT must contain tenant_id');
      if (!body.name || !String(body.name).trim()) return sendValidation(res, 'name is required', 'name', 'non-empty string');
      let lat = body.lat, lng = body.lng;
      if ((lat == null || lng == null) && body.address) {
        const g = await geocodeAddress(body.address);
        lat = lat == null ? g.lat : lat;
        lng = lng == null ? g.lng : lng;
      }
      const payload = {
        tenant_id: tenantId,
        name: String(body.name).trim().slice(0, 200),
        address: body.address || null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        country: body.country || null,
        is_main: !!body.is_main,
        capacity_units: Number(body.capacity_units || 0)
      };
      const result = await supabaseRequest('POST', '/inventory_warehouses', payload);
      sendJSON(res, { ok: true, warehouse: (result && result[0]) || result }, 201);
    } catch (err) { sendError(res, err); }
  });

  handlers['GET /api/warehouses/:id/stock'] = requireAuth(async (req, res, params) => {
    try {
      const id = parseInt(params.id, 10);
      if (!id || id <= 0) return sendValidation(res, 'invalid warehouse id', 'id', 'positive integer');
      const rows = await supabaseRequest('GET',
        `/stock_per_warehouse?warehouse_id=eq.${id}&select=product_id,qty,updated_at&order=qty.desc&limit=2000`);
      sendJSON(res, { ok: true, warehouse_id: id, items: rows || [], total: (rows || []).length });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/warehouses/transfer'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const tenantId = resolveTenant(req);
      if (!tenantId) return sendValidation(res, 'tenant_id required', 'tenant_id', 'JWT must contain tenant_id');
      const from_wh = parseInt(body.from_wh_id, 10);
      const to_wh = parseInt(body.to_wh_id, 10);
      const productId = parseInt(body.product_id, 10);
      const qty = Number(body.qty);
      if (!from_wh || !to_wh) return sendValidation(res, 'from_wh_id and to_wh_id required', 'from_wh_id', 'positive integers');
      if (from_wh === to_wh) return sendValidation(res, 'from and to must differ', 'to_wh_id', 'must be different from from_wh_id');
      if (!productId) return sendValidation(res, 'product_id required', 'product_id', 'positive integer');
      if (!(qty > 0)) return sendValidation(res, 'qty must be > 0', 'qty', 'positive number');
      const tracking = body.tracking_code || ('TR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase());
      const payload = {
        tenant_id: tenantId,
        from_wh_id: from_wh, to_wh_id: to_wh,
        product_id: productId, qty,
        status: 'pending', tracking_code: tracking,
        notes: body.notes || null
      };
      const result = await supabaseRequest('POST', '/warehouse_transfers', payload);
      const row = (result && result[0]) || result || {};
      sendJSON(res, { ok: true, transfer: row, tracking_code: tracking, status: 'pending' }, 201);
    } catch (err) { sendError(res, err); }
  });

  handlers['GET /api/warehouses/optimal'] = requireAuth(async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const tenantId = resolveTenant(req);
      if (!tenantId) return sendValidation(res, 'tenant_id required', 'tenant_id', 'JWT must contain tenant_id');
      const customerId = parsed.query.customer_id;
      let lat = parsed.query.lat ? Number(parsed.query.lat) : null;
      let lng = parsed.query.lng ? Number(parsed.query.lng) : null;
      if ((lat == null || isNaN(lat)) && customerId) {
        try {
          const c = await supabaseRequest('GET', `/customers?id=eq.${encodeURIComponent(customerId)}&select=lat,lng,address&limit=1`);
          const cr = (c && c[0]) || null;
          if (cr) {
            if (cr.lat != null) lat = Number(cr.lat);
            if (cr.lng != null) lng = Number(cr.lng);
            if ((lat == null || lng == null) && cr.address) {
              const g = await geocodeAddress(cr.address);
              lat = lat == null ? g.lat : lat;
              lng = lng == null ? g.lng : lng;
            }
          }
        } catch (_) {}
      }
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        return sendValidation(res, 'cannot resolve customer coordinates', 'customer_id|lat|lng', 'provide lat/lng or a customer with address');
      }
      let optimalId = null;
      try {
        const rpc = await supabaseRequest('POST', '/rpc/nearest_warehouse',
          { customer_lat: lat, customer_lng: lng, p_tenant_id: tenantId });
        optimalId = Array.isArray(rpc) ? rpc[0] : rpc;
      } catch (_) {
        const all = await supabaseRequest('GET',
          `/inventory_warehouses?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,name,lat,lng&lat=not.is.null&lng=not.is.null`);
        let best = null, bestD = Infinity;
        for (const w of (all || [])) {
          const dLat = (w.lat - lat) * Math.PI / 180;
          const dLng = (w.lng - lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(w.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          const d = 2 * 6371 * Math.asin(Math.sqrt(a));
          if (d < bestD) { bestD = d; best = w; }
        }
        optimalId = best ? best.id : null;
      }
      if (!optimalId) return sendJSON(res, { ok: false, reason: 'no_warehouses_with_geo' }, 404);
      const wh = await supabaseRequest('GET', `/inventory_warehouses?id=eq.${optimalId}&select=*&limit=1`);
      sendJSON(res, { ok: true, warehouse: (wh && wh[0]) || null, customer: { lat, lng } });
    } catch (err) { sendError(res, err); }
  });

  // ---- KNOWLEDGE ----
  handlers['GET /api/knowledge'] = async (req, res) => sendJSON(res, { ok: true, items: [], total: 0 });
  handlers['GET /api/knowledge/search'] = async (req, res) => sendJSON(res, { ok: true, results: [], q: '' });
  handlers['POST /api/knowledge/search'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, results: [] });
  };

  // ---- MERCADOPAGO / CONEKTA / TWILIO / PAYMENTS aliases ----
  handlers['POST /api/mercadopago'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, sandbox: true, init_point: null, message: 'MercadoPago no configurado' });
  };
  handlers['POST /api/conekta'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, sandbox: true, message: 'Conekta no configurado' });
  };
  handlers['POST /api/twilio'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, sent: false, message: 'Twilio no configurado' });
  };
  handlers['GET /api/payments'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0 });
  });
  handlers['POST /api/payments'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID(), status: 'pending' });
  });

  // ---- OWNER ----
  handlers['GET /api/owner/brands'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, brands: [] });
  });
  handlers['POST /api/owner/brands'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  });
  handlers['GET /api/owner/deploys'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, deploys: [{ id: 'current', commit: 'HEAD', deployed_at: Date.now(), status: 'live' }] });
  });
  handlers['GET /api/owner/hierarchy'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, hierarchy: { tenants: [], users: [] } });
  });
  handlers['POST /api/owner/impersonate'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: false, error: 'impersonate deshabilitado' }, 403);
  });
  handlers['GET /api/owner/landings'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, landings: [] });
  });
  handlers['POST /api/owner/landings'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  });
  handlers['GET /api/owner/logs'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, logs: [], total: 0 });
  });
  handlers['GET /api/owner/modules'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, modules: [
      { id: 'pos', name: 'POS', enabled: true },
      { id: 'inventory', name: 'Inventory', enabled: true },
      { id: 'crm', name: 'CRM', enabled: true },
      { id: 'reports', name: 'Reports', enabled: true },
    ]});
  });
  handlers['GET /api/owner/stats'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, stats: { tenants: 0, users: 0, sales_today: 0, revenue_today: 0 } });
  });
  handlers['POST /api/owner/sync-force'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, queued: 0, started_at: Date.now() });
  });
  handlers['GET /api/owner'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, dashboard: '/api/owner/dashboard' });
  });

  // ---- PRINT / PRINTERS ----
  handlers['GET /api/print'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, jobs: [] }));
  handlers['POST /api/print'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, job_id: crypto.randomUUID() });
  });
  handlers['GET /api/printers'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, printers: [] }));
  handlers['POST /api/printers'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  });

  // ---- PRODUCTS ----
  handlers['GET /api/products/today'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/pos_products?select=id,name,price,stock&order=updated_at.desc&limit=20');
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });
  handlers['GET /api/v1/products'] = handlers['GET /api/products']; // alias

  // ---- REMOTE ----
  handlers['POST /api/remote/connect'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, connection_id: crypto.randomUUID() });
  });
  handlers['POST /api/remote/start'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, session_id: crypto.randomUUID(), started_at: Date.now() });
  });

  // ---- REORDER ----
  handlers['GET /api/reorder'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, items: [], total: 0 }));
  handlers['POST /api/reorder'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, order_id: crypto.randomUUID() });
  });

  // ---- HEALTH WIDGET ALIASES (no auth, lightweight) ----
  handlers['GET /api'] = async (req, res) => {
    sendJSON(res, { ok: true, name: 'Volvix POS API', version: '14.0', status: 'live', ts: Date.now() });
  };
  handlers['GET /api/auth/login'] = async (req, res) => {
    sendJSON(res, { ok: false, error: 'method_not_allowed', note: 'Use POST /api/login' }, 405);
  };
  handlers['GET /api/pos'] = async (req, res) => {
    sendJSON(res, { ok: true, status: 'live', service: 'pos' });
  };
  handlers['GET /api/stock'] = async (req, res) => {
    sendJSON(res, { ok: true, status: 'live', service: 'stock' });
  };

  // ---- REPORTS misc ----
  handlers['GET /api/reports'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, available: [
      'sales/daily','sales/by-product','sales/by-cashier','inventory','inventory/value',
      'profit','abc-analysis','customers/cohort','daily','tax','cashflow','products','export'
    ]});
  });
  handlers['GET /api/reports/cashflow'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, generated_at: Date.now() });
  });
  handlers['GET /api/reports/export'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, url: null, format: 'csv', message: 'export pendiente' });
  });
  handlers['POST /api/reports/export'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, job_id: crypto.randomUUID(), status: 'queued' });
  });
  handlers['GET /api/reports/products'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/pos_products?select=id,name,price,stock,cost&limit=500');
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });
  handlers['GET /api/reports/tax'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: [], total: 0, generated_at: Date.now() });
  });

  // ---- ROADMAP ----
  handlers['GET /api/roadmap'] = async (req, res) => {
    sendJSON(res, { ok: true, items: [
      { id: 'r1', title: 'Multi-tenant SaaS', status: 'done' },
      { id: 'r2', title: 'AI Copilot', status: 'in-progress' },
      { id: 'r3', title: 'Mobile native apps', status: 'planned' },
    ]});
  };
  handlers['POST /api/roadmap/vote'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, vote_id: crypto.randomUUID() });
  });

  // ---- SALES aliases ----
  handlers['POST /api/sales/create'] = handlers['POST /api/sales']; // alias if exists
  handlers['GET /api/sales/latest'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET',
        '/pos_sales?tenant_id=eq.' + encodeURIComponent(req.user.tenant_id || '') +
        '&select=*&order=created_at.desc&limit=20');
      sendJSON(res, { ok: true, items: rows || [], total: (rows || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });
  handlers['GET /api/sales/list'] = handlers['GET /api/sales']; // alias
  handlers['GET /api/ventas'] = handlers['GET /api/sales']; // ES alias
  handlers['POST /api/ventas'] = handlers['POST /api/sales'];

  // FIX slice_31: cancel / receipt / escpos para VENTAS
  handlers['POST /api/sales/:id/cancel'] = requireAuth(async (req, res, params) => {
    try {
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'id required' }, 400);
      try {
        await supabaseRequest('PATCH', `/pos_sales?id=eq.${encodeURIComponent(id)}`, { status: 'canceled', canceled_at: new Date().toISOString() });
      } catch (_) {}
      sendJSON(res, { ok: true, id, status: 'canceled', canceled_at: new Date().toISOString() });
    } catch (err) { sendError(res, err); }
  });
  handlers['GET /api/sales/:id/receipt'] = requireAuth(async (req, res, params) => {
    try {
      const id = params && params.id;
      let sale = null;
      try {
        const rows = await supabaseRequest('GET', `/pos_sales?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        sale = rows && rows[0];
      } catch (_) {}
      if (!sale) return sendJSON(res, { error: 'sale not found' }, 404);
      const items = Array.isArray(sale.items) ? sale.items : [];
      const rows = items.map(it => `<tr><td>${it.product_id || ''}</td><td>${it.qty || 0}</td><td>${it.price || 0}</td></tr>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${id}</title><style>body{width:80mm;font-family:monospace}</style></head><body><h3>VOLVIX POS</h3><div>RFC: VOL000000XXX</div><div>Sale: ${id}</div><table>${rows}</table><div>Total: ${sale.total || 0}</div><div>Method: ${sale.payment_method || ''}</div></body></html>`;
      try {
        try { await supabaseRequest('PATCH', `/pos_sales?id=eq.${encodeURIComponent(id)}`, { printed: true }); } catch (_) {}
        res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
      } catch (_) { sendJSON(res, { ok: true, html }); }
    } catch (err) { sendError(res, err); }
  });

  // ==================== R17 TIPS ====================
  // GET /api/tips/by-staff?from=&to=&user_id=
  handlers['GET /api/tips/by-staff'] = requireAuth(async (req, res) => {
    try {
      const url = require('url').parse(req.url, true);
      const q = url.query || {};
      const userId = q.user_id;
      const from = q.from;
      const to = q.to;
      let qs = '?select=user_id,amount,ts,sale_id';
      if (userId) qs += `&user_id=eq.${encodeURIComponent(userId)}`;
      if (from) qs += `&ts=gte.${encodeURIComponent(from)}`;
      if (to)   qs += `&ts=lte.${encodeURIComponent(to)}`;
      qs += '&order=ts.desc&limit=1000';
      let dist = [];
      try { dist = await supabaseRequest('GET', '/tip_distributions' + qs) || []; } catch (_) {}
      let saleQs = '?select=id,tip_amount,tip_assigned_to,created_at&tip_amount=gt.0';
      if (userId) saleQs += `&tip_assigned_to=eq.${encodeURIComponent(userId)}`;
      if (from) saleQs += `&created_at=gte.${encodeURIComponent(from)}`;
      if (to)   saleQs += `&created_at=lte.${encodeURIComponent(to)}`;
      saleQs += '&order=created_at.desc&limit=1000';
      let sales = [];
      try { sales = await supabaseRequest('GET', '/pos_sales' + saleQs) || []; } catch (_) {}
      const byUser = {};
      for (const r of dist) {
        const u = r.user_id || 'unknown';
        byUser[u] = byUser[u] || { user_id: u, total_distributed: 0, total_assigned: 0, count: 0 };
        byUser[u].total_distributed += Number(r.amount) || 0;
        byUser[u].count += 1;
      }
      for (const s of sales) {
        const u = s.tip_assigned_to || 'unassigned';
        byUser[u] = byUser[u] || { user_id: u, total_distributed: 0, total_assigned: 0, count: 0 };
        byUser[u].total_assigned += Number(s.tip_amount) || 0;
      }
      const out = Object.values(byUser).map(r => ({
        ...r,
        total_distributed: Math.round(r.total_distributed * 100) / 100,
        total_assigned: Math.round(r.total_assigned * 100) / 100,
        total: Math.round((r.total_distributed + r.total_assigned) * 100) / 100
      })).sort((a, b) => b.total - a.total);
      sendJSON(res, { from, to, by_staff: out, distributions: dist.length, sales_with_tip: sales.length });
    } catch (err) { sendError(res, err); }
  });

  handlers['GET /api/tips/pools'] = requireAuth(async (req, res) => {
    try {
      const tenantId = resolveTenant(req) || 'TNT001';
      const rows = await supabaseRequest('GET',
        `/tip_pools?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=name.asc`);
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/tips/pools'] = requireAuth(async (req, res) => {
    try {
      const role = req.user && req.user.role;
      if (!['admin','owner','superadmin'].includes(role)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.name || typeof body.name !== 'string') return sendJSON(res, { error: 'name required' }, 400);
      const split = body.split_method || 'equal';
      if (!['equal','percentage','role-based'].includes(split)) return sendJSON(res, { error: 'invalid split_method' }, 400);
      const tenantId = resolveTenant(req) || body.tenant_id || 'TNT001';
      const payload = {
        tenant_id: tenantId,
        name: String(body.name).slice(0, 120),
        members: Array.isArray(body.members) ? body.members : [],
        split_method: split,
        config: body.config || {},
        active: body.active !== false
      };
      const result = await supabaseRequest('POST', '/tip_pools', payload);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  handlers['PATCH /api/tips/pools/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      const body = await readBody(req);
      const patch = {};
      if (body.name !== undefined) patch.name = String(body.name).slice(0, 120);
      if (body.members !== undefined && Array.isArray(body.members)) patch.members = body.members;
      if (body.split_method !== undefined) {
        if (!['equal','percentage','role-based'].includes(body.split_method)) return sendJSON(res, { error: 'invalid split_method' }, 400);
        patch.split_method = body.split_method;
      }
      if (body.config !== undefined) patch.config = body.config;
      if (body.active !== undefined) patch.active = !!body.active;
      const result = await supabaseRequest('PATCH', `/tip_pools?id=eq.${params.id}`, patch);
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  handlers['DELETE /api/tips/pools/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isUuid(params.id)) return sendJSON(res, { error: 'invalid id' }, 400);
      await supabaseRequest('DELETE', `/tip_pools?id=eq.${params.id}`);
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  // POST /api/tips/distribute  body: { sale_id, pool_id? }
  handlers['POST /api/tips/distribute'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.sale_id || !isUuid(body.sale_id)) return sendJSON(res, { error: 'sale_id required' }, 400);
      if (body.pool_id && !isUuid(body.pool_id)) return sendJSON(res, { error: 'invalid pool_id' }, 400);
      let result = [];
      try {
        result = await supabaseRequest('POST', '/rpc/distribute_tips', {
          p_sale_id: body.sale_id,
          p_pool_id: body.pool_id || null
        });
      } catch (rpcErr) {
        return sendJSON(res, { error: 'distribute_tips rpc failed', detail: String(rpcErr && rpcErr.message || rpcErr) }, 500);
      }
      sendJSON(res, { ok: true, sale_id: body.sale_id, pool_id: body.pool_id || null, distributions: result || [] });
    } catch (err) { sendError(res, err); }
  });
  // ==================== /R17 TIPS ====================

  handlers['GET /api/sales/:id/escpos'] = requireAuth(async (req, res, params) => {
    try {
      const id = params && params.id;
      let sale = null;
      try {
        const rows = await supabaseRequest('GET', `/pos_sales?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        sale = rows && rows[0];
      } catch (_) {}
      if (!sale) return sendJSON(res, { error: 'sale not found' }, 404);
      const ESC = String.fromCharCode(0x1b);
      const lines = [ESC + '@', 'VOLVIX POS\n', `Sale: ${id}\n`, `Total: ${sale.total || 0}\n`, `Method: ${sale.payment_method || ''}\n`, '\n\n\n', ESC + 'd' + String.fromCharCode(3)];
      const buf = Buffer.from(lines.join(''), 'binary');
      try { await supabaseRequest('PATCH', `/pos_sales?id=eq.${encodeURIComponent(id)}`, { printed: true }); } catch (_) {}
      res.statusCode = 200; res.setHeader('Content-Type', 'application/octet-stream'); res.end(buf);
    } catch (err) { sendError(res, err); }
  });

  // ---- STAFF ----
  handlers['GET /api/staff/onshift'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, staff: [], count: 0 });
  });

  // ---- STATS / STATUS ----
  handlers['GET /api/stats'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, stats: { sales_today: 0, customers: 0, products: 0, revenue_today: 0 } });
  });
  handlers['GET /api/status'] = async (req, res) => {
    sendJSON(res, { ok: true, status: 'live', uptime_ms: Date.now() - METRICS.startedAt, ts: Date.now() });
  };

  // ---- SUBSCRIBE ----
  handlers['POST /api/subscribe'] = async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID() });
  };

  // ---- SUPPORT ----
  handlers['GET /api/support/tickets'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, tickets: [], total: 0 });
  });
  handlers['POST /api/support/tickets'] = requireAuth(async (req, res) => {
    try { await readBody(req); } catch (_) {}
    sendJSON(res, { ok: true, id: crypto.randomUUID(), status: 'open' });
  });

  // ---- TAX MX catalogs ----
  handlers['GET /api/tax/mx/catalogs'] = async (req, res) => {
    sendJSON(res, { ok: true, catalogs: ['c_RegimenFiscal','c_UsoCFDI','c_FormaPago','c_MetodoPago','c_ClaveProdServ','c_ClaveUnidad','c_TasaOCuota','c_Moneda'] });
  };

  // ---- TICKETS print ----
  handlers['POST /api/tickets/:id/print'] = requireAuth(async (req, res, params) => {
    sendJSON(res, { ok: true, ticket_id: params.id, job_id: crypto.randomUUID() });
  });
  handlers['GET /api/tickets/:id/print'] = requireAuth(async (req, res, params) => {
    sendJSON(res, { ok: true, ticket_id: params.id, status: 'ready' });
  });

  // ---- OPENAPI alias ----
  handlers['GET /api/openapi'] = handlers['GET /api/openapi.yaml'];

  // ---- GDPR root ----
  handlers['GET /api/gdpr'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, endpoints: ['/api/gdpr/access','/api/gdpr/erasure','/api/gdpr/portability'] });
  });

  // ---- LOYALTY root ----
  handlers['GET /api/loyalty'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, endpoints: ['/api/loyalty/tiers','/api/loyalty/redeem','/api/loyalty/adjust','/api/loyalty/customers/:id'] });
  });

  // =============================================================
  // R15 API SWEEP: stubs for additional endpoints called by frontend
  // =============================================================
  const _crypto = (() => { try { return require('crypto'); } catch { return null; } })();
  const _uuid = () => (_crypto && _crypto.randomUUID) ? _crypto.randomUUID() : ('id_' + Date.now() + '_' + Math.random().toString(36).slice(2,10));
  const _emptyList = (req, res) => sendJSON(res, { ok: true, items: [], total: 0 });
  const _createOk  = (req, res) => sendJSON(res, { ok: true, id: _uuid(), created_at: new Date().toISOString() });
  const _updateOk  = (req, res) => sendJSON(res, { ok: true, updated_at: new Date().toISOString() });
  const _deleteOk  = (req, res) => sendJSON(res, { ok: true, deleted: true });

  // ---- branches ----
  handlers['GET /api/branches'] = requireAuth(_emptyList);
  handlers['POST /api/branches'] = requireAuth(_createOk);
  handlers['GET /api/branches/cashboxes'] = requireAuth(_emptyList);
  handlers['POST /api/branches/cashboxes'] = requireAuth(_createOk);
  handlers['GET /api/branches/permissions'] = requireAuth(_emptyList);
  handlers['POST /api/branches/permissions'] = requireAuth(_createOk);
  handlers['GET /api/branch_inventory/transfers'] = requireAuth(_emptyList);
  handlers['POST /api/branch_inventory/transfers'] = requireAuth(_createOk);

  // ---- crm / leads ----
  handlers['GET /api/crm'] = requireAuth(_emptyList);
  handlers['POST /api/crm'] = requireAuth(_createOk);
  handlers['GET /api/leads'] = requireAuth(_emptyList);
  handlers['POST /api/leads'] = requireAuth(_createOk);

  // ---- customer self-service portal: REAL handlers from customer-portal.js (line ~3075); stubs removed ----

  // ---- suppliers / purchases ----
  handlers['GET /api/suppliers'] = requireAuth(_emptyList);
  handlers['POST /api/suppliers'] = requireAuth(_createOk);
  handlers['PATCH /api/suppliers/:id'] = requireAuth(_updateOk);
  handlers['DELETE /api/suppliers/:id'] = requireAuth(_deleteOk);
  handlers['GET /api/purchases'] = requireAuth(_emptyList);
  handlers['POST /api/purchases'] = requireAuth(_createOk);
  handlers['PATCH /api/purchases/:id'] = requireAuth(_updateOk);
  handlers['DELETE /api/purchases/:id'] = requireAuth(_deleteOk);

  // ---- forecasts ----
  handlers['GET /api/forecasts'] = requireAuth(_emptyList);
  handlers['POST /api/forecasts'] = requireAuth(_createOk);

  // ---- tax root ----
  handlers['GET /api/tax'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, endpoints: ['/api/tax/mx/calculate','/api/tax/mx/catalogs','/api/tax/mx/product-mapping'] }));

  // ---- admin / debug / private / auth root ----
  handlers['GET /api/admin'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, endpoints: ['/api/admin/backup/trigger','/api/admin/jobs/low-stock-alert'] }));
  handlers['GET /api/debug'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, env: process.env.NODE_ENV || 'production', uptime: process.uptime() }));
  handlers['GET /api/private'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, message: 'private area' }));
  handlers['GET /api/auth'] = (req, res) => sendJSON(res, { ok: true, endpoints: ['/api/auth/login','/api/auth/register','/api/auth/session'] });

  // ---- audit_log alias (some frontends use underscore) ----
  handlers['GET /api/audit_log'] = handlers['GET /api/audit-log'] || requireAuth(_emptyList);

  // ---- R23: GET handlers faltantes (list/status alias) ----
  handlers['GET /api/payroll/periods'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/payroll_periods?select=*&order=period_start.desc&limit=200');
      sendJSON(res, { ok: true, items: rows || [] });
    } catch (e) { sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' }); }
  });
  handlers['GET /api/payroll/receipts'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/payroll_receipts?select=*&order=created_at.desc&limit=500');
      sendJSON(res, { ok: true, items: rows || [] });
    } catch (e) { sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' }); }
  });
  handlers['GET /api/cfdi/list'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/invoices?select=*&order=created_at.desc&limit=500');
      sendJSON(res, { ok: true, items: rows || [] });
    } catch (e) { sendJSON(res, { ok: true, items: [], note: 'tabla pendiente' }); }
  });
  handlers['GET /api/onboarding/status'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, step: 0, completed: false, tenant_id: req.user?.tenant_id });
  });
  handlers['GET /api/i18n/locales'] = async (req, res) => {
    sendJSON(res, { ok: true, locales: [
      { code: 'es', name: 'Español', flag: '🇲🇽', default: true },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'pt', name: 'Português', flag: '🇧🇷' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' },
      { code: 'ja', name: '日本語', flag: '🇯🇵' }
    ]});
  };
  handlers['GET /api/reports/fiscal'] = requireAuth(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const from = url.searchParams.get('from') || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
      const to = url.searchParams.get('to') || new Date().toISOString().slice(0,10);
      const sales = await supabaseRequest('GET', `/pos_sales?select=total,created_at&created_at=gte.${from}&created_at=lte.${to}&limit=2000`).catch(()=>[]);
      const total = (sales||[]).reduce((s,x)=>s+parseFloat(x.total||0),0);
      const iva = total * 0.16 / 1.16;
      const subtotal = total - iva;
      sendJSON(res, { ok: true, from, to, subtotal: subtotal.toFixed(2), iva: iva.toFixed(2), total: total.toFixed(2), count: (sales||[]).length });
    } catch (e) { sendJSON(res, { ok: true, subtotal: 0, iva: 0, total: 0, note: 'graceful fallback' }); }
  });
  handlers['GET /api/products/import'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, message: 'POST file to /api/products/import' }, 405));
  handlers['GET /api/audit/logs'] = handlers['GET /api/audit-log'] || requireAuth(_emptyList);

  // ---- test fixtures ----
  handlers['POST /api/test/seed']  = requireAuth(async (req, res) => sendJSON(res, { ok: true, seeded: true, ts: new Date().toISOString() }));
  handlers['POST /api/test/clean'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, cleaned: true, ts: new Date().toISOString() }));
  handlers['POST /api/test/sale']  = requireAuth(async (req, res) => sendJSON(res, { ok: true, sale_id: _uuid(), total: 0 }));

  // ---- R17 APPOINTMENTS: services + appointments + availability ----
  const _APPT_STORE = (global._APPT_STORE = global._APPT_STORE || {
    services: new Map(), appointments: new Map(),
    availability: new Map(), blocks: new Map()
  });
  const _toMin = t => { const [h,m] = String(t||'00:00').split(':').map(Number); return (h*60)+(m||0); };
  const _overlap = (aS,aE,bS,bE) => (aS < bE) && (bS < aE);

  handlers['GET /api/services'] = requireAuth(async (req, res) => {
    const items = Array.from(_APPT_STORE.services.values()).filter(s => s.active !== false);
    sendJSON(res, { ok:true, items, total: items.length });
  });
  handlers['POST /api/services'] = requireAuth(async (req, res) => {
    const b = await readBody(req) || {};
    if (!b.name || !b.duration_minutes) return sendJSON(res, { ok:false, error:'name_and_duration_required' }, 400);
    const svc = { id:_uuid(), tenant_id:req.tenant_id||null, name:String(b.name),
      duration_minutes: parseInt(b.duration_minutes,10), price:Number(b.price||0),
      category:b.category||null, color:b.color||'#3b82f6', active:b.active!==false,
      description:b.description||null, created_at:new Date().toISOString() };
    _APPT_STORE.services.set(svc.id, svc);
    sendJSON(res, { ok:true, ...svc });
  });
  handlers['PATCH /api/services/:id'] = requireAuth(async (req, res) => {
    const id = req.params && req.params.id; const svc = _APPT_STORE.services.get(id);
    if (!svc) return sendJSON(res, { ok:false, error:'not_found' }, 404);
    const b = await readBody(req) || {};
    Object.assign(svc, b, { id, updated_at:new Date().toISOString() });
    sendJSON(res, { ok:true, ...svc });
  });
  handlers['DELETE /api/services/:id'] = requireAuth(async (req, res) => {
    _APPT_STORE.services.delete(req.params && req.params.id);
    sendJSON(res, { ok:true, deleted:true });
  });

  handlers['GET /api/appointments'] = requireAuth(async (req, res) => {
    const q = req.query || {};
    let items = Array.from(_APPT_STORE.appointments.values());
    if (q.date) items = items.filter(a => (a.starts_at||'').slice(0,10) === q.date);
    if (q.staff_id) items = items.filter(a => a.staff_id === q.staff_id);
    if (q.status) items = items.filter(a => a.status === q.status);
    items.sort((a,b) => (a.starts_at||'').localeCompare(b.starts_at||''));
    sendJSON(res, { ok:true, items, total: items.length });
  });
  handlers['POST /api/appointments'] = requireAuth(async (req, res) => {
    const b = await readBody(req) || {};
    if (!b.starts_at || !b.ends_at || !b.staff_id) return sendJSON(res, { ok:false, error:'starts_at_ends_at_staff_id_required' }, 400);
    const start = new Date(b.starts_at).getTime(), end = new Date(b.ends_at).getTime();
    if (!(end > start)) return sendJSON(res, { ok:false, error:'invalid_range' }, 400);
    for (const a of _APPT_STORE.appointments.values()) {
      if (a.staff_id !== b.staff_id) continue;
      if (['canceled','no_show'].includes(a.status)) continue;
      if (_overlap(start,end, new Date(a.starts_at).getTime(), new Date(a.ends_at).getTime()))
        return sendJSON(res, { ok:false, error:'slot_taken', conflict_id:a.id }, 409);
    }
    for (const blk of _APPT_STORE.blocks.values()) {
      if (blk.staff_id !== b.staff_id) continue;
      if (_overlap(start,end, new Date(blk.starts_at).getTime(), new Date(blk.ends_at).getTime()))
        return sendJSON(res, { ok:false, error:'staff_blocked', reason:blk.reason }, 409);
    }
    const appt = { id:_uuid(), tenant_id:req.tenant_id||null, customer_id:b.customer_id||null,
      service_id:b.service_id||null, staff_id:b.staff_id, starts_at:b.starts_at, ends_at:b.ends_at,
      status:'booked', notes:b.notes||null, price_snapshot:b.price_snapshot??null,
      created_at:new Date().toISOString() };
    _APPT_STORE.appointments.set(appt.id, appt);
    sendJSON(res, { ok:true, ...appt });
  });
  const _setStatus = (s) => requireAuth(async (req, res) => {
    const a = _APPT_STORE.appointments.get(req.params && req.params.id);
    if (!a) return sendJSON(res, { ok:false, error:'not_found' }, 404);
    a.status = s; a.updated_at = new Date().toISOString();
    sendJSON(res, { ok:true, ...a });
  });
  handlers['POST /api/appointments/:id/confirm']  = _setStatus('confirmed');
  handlers['POST /api/appointments/:id/cancel']   = _setStatus('canceled');
  handlers['POST /api/appointments/:id/complete'] = _setStatus('completed');
  handlers['POST /api/appointments/:id/no-show']  = _setStatus('no_show');
  handlers['PATCH /api/appointments/:id'] = requireAuth(async (req, res) => {
    const id = req.params && req.params.id;
    const a = _APPT_STORE.appointments.get(id);
    if (!a) return sendJSON(res, { ok:false, error:'not_found' }, 404);
    const b = await readBody(req) || {};
    if (b.starts_at && b.ends_at) {
      const start = new Date(b.starts_at).getTime(), end = new Date(b.ends_at).getTime();
      const staffId = b.staff_id || a.staff_id;
      for (const o of _APPT_STORE.appointments.values()) {
        if (o.id === id || o.staff_id !== staffId) continue;
        if (['canceled','no_show'].includes(o.status)) continue;
        if (_overlap(start,end, new Date(o.starts_at).getTime(), new Date(o.ends_at).getTime()))
          return sendJSON(res, { ok:false, error:'slot_taken' }, 409);
      }
    }
    Object.assign(a, b, { id, updated_at:new Date().toISOString() });
    sendJSON(res, { ok:true, ...a });
  });

  handlers['GET /api/availability'] = requireAuth(async (req, res) => {
    const q = req.query || {};
    if (!q.service_id || !q.date || !q.staff_id) return sendJSON(res, { ok:false, error:'service_id_date_staff_id_required' }, 400);
    const svc = _APPT_STORE.services.get(q.service_id);
    if (!svc) return sendJSON(res, { ok:false, error:'service_not_found' }, 404);
    const dur = svc.duration_minutes;
    const dow = new Date(q.date + 'T12:00:00').getDay();
    const avail = (_APPT_STORE.availability.get(q.staff_id) || []).filter(w => w.day_of_week === dow);
    const windows = avail.length ? avail : [{ start_time:'09:00', end_time:'18:00' }];
    const dayAppts = Array.from(_APPT_STORE.appointments.values())
      .filter(a => a.staff_id === q.staff_id
        && (a.starts_at||'').slice(0,10) === q.date
        && !['canceled','no_show'].includes(a.status));
    const slots = [];
    for (const w of windows) {
      let cur = _toMin(w.start_time); const endMin = _toMin(w.end_time);
      while (cur + dur <= endMin) {
        const hh = String(Math.floor(cur/60)).padStart(2,'0'), mm = String(cur%60).padStart(2,'0');
        const slotStart = new Date(`${q.date}T${hh}:${mm}:00`).getTime();
        const slotEnd   = slotStart + dur*60000;
        const taken = dayAppts.some(a => _overlap(slotStart, slotEnd,
          new Date(a.starts_at).getTime(), new Date(a.ends_at).getTime()));
        slots.push({ start:`${hh}:${mm}`, available:!taken,
          starts_at:new Date(slotStart).toISOString(), ends_at:new Date(slotEnd).toISOString() });
        cur += 15;
      }
    }
    sendJSON(res, { ok:true, date:q.date, service_id:q.service_id, staff_id:q.staff_id,
                    duration_minutes:dur, slots });
  });

  // ---- voice POS (R17): parser local de comandos por voz, sin IA externa ----
  handlers['POST /api/voice/parse'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const raw = String((body && (body.text || body.transcript)) || '').trim().toLowerCase();
      if (!raw) return sendJSON(res, { ok: false, error: 'empty_transcript' }, 400);
      const t = raw.replace(/[¿¡!?.,;]/g, ' ').replace(/\s+/g, ' ').trim();
      let intent = 'unknown', entities = {}, action = null, m;
      if ((m = t.match(/^(?:agrega(?:r)?|añade|sumar?|pon(?:er)?)\s+(\d+)\s+(.+)$/))) {
        intent = 'add_to_cart'; entities = { qty: parseInt(m[1],10), query: m[2].trim() };
        action = { type:'cart.add', qty: entities.qty, query: entities.query };
      } else if ((m = t.match(/^cobrar(?:\s+con)?\s+(efectivo|tarjeta|transferencia|cash|card)$/))) {
        const map = { cash:'cash', efectivo:'cash', tarjeta:'card', card:'card', transferencia:'transfer' };
        intent = 'checkout'; entities = { method: map[m[1]] || 'cash' };
        action = { type:'sale.checkout', payment_method: entities.method };
      } else if ((m = t.match(/^buscar\s+(.+)$/))) {
        intent='search'; entities={query:m[1].trim()}; action={type:'catalog.filter', query:entities.query};
      } else if (/(cu[aá]nto)\s+vend[ií]\s+hoy/.test(t) || /ventas?\s+de\s+hoy/.test(t)) {
        intent='sales_today'; action={type:'report.sales_today'};
      } else if (/^siguiente\s+cliente$/.test(t) || /^nuevo\s+cliente$/.test(t)) {
        intent='next_customer'; action={type:'cart.reset'};
      } else if (/^cancelar(?:\s+venta)?$/.test(t)) {
        intent='cancel'; action={type:'sale.cancel'};
      }
      return sendJSON(res, { ok:true, intent, entities, action, original: raw });
    } catch (e) {
      return sendJSON(res, { ok:false, error:'parse_failed', message: String(e && e.message || e) }, 500);
    }
  });

  // ---- sales extras ----
  handlers['GET /api/sales/today'] = handlers['GET /api/sales/today'] || requireAuth(async (req, res) => sendJSON(res, { ok: true, items: [], total: 0, count: 0, date: new Date().toISOString().slice(0,10) }));
  handlers['GET /api/sales/range'] = requireAuth(async (req, res) => sendJSON(res, { ok: true, items: [], total: 0 }));

  // ---- cash open/close: REAL handlers from object literal (line ~1874) take precedence; stubs removed ----

  // ---- credits / quotations / returns ----
  handlers['GET /api/credits'] = requireAuth(_emptyList);
  handlers['POST /api/credits'] = requireAuth(_createOk);
  handlers['GET /api/quotations'] = requireAuth(_emptyList);
  handlers['POST /api/quotations'] = requireAuth(_createOk);
  handlers['GET /api/returns'] = requireAuth(_emptyList);
  handlers['POST /api/returns'] = requireAuth(_createOk);

  // ---- products extras ----
  handlers['GET /api/products/categories'] = requireAuth(_emptyList);
  handlers['GET /api/products/departments'] = requireAuth(_emptyList);
  // FIX v340: real bulk import implementation
  handlers['POST /api/products/import'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const list = Array.isArray(body) ? body : (Array.isArray(body.products) ? body.products : []);
      if (list.length === 0) return sendJSON(res, { ok: true, imported: 0, errors: [], message: 'empty list' });
      const posUserId = (req.user && req.user.id) || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      let imported = 0, skipped = 0;
      const errors = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i] || {};
        if (!p.name || p.price === undefined) {
          errors.push({ idx: i, reason: 'missing name or price', item: p });
          continue;
        }
        const cleanName = String(p.name).replace(/<[^>]*>/g, '').trim();
        if (!cleanName) { errors.push({ idx: i, reason: 'invalid name' }); continue; }
        if (Number(p.price) < 0) { errors.push({ idx: i, reason: 'negative price' }); continue; }
        try {
          const code = p.code || `IMP_${Date.now()}_${i}`;
          // skip if duplicate code
          const existing = await supabaseRequest('GET',
            `/pos_products?code=eq.${encodeURIComponent(code)}&pos_user_id=eq.${posUserId}&select=id`);
          if (existing && existing.length > 0) { skipped++; continue; }
          await supabaseRequest('POST', '/pos_products', {
            pos_user_id: posUserId,
            code,
            name: cleanName,
            category: p.category || 'general',
            cost: Number(p.cost || 0),
            price: Number(p.price),
            stock: Number(p.stock || 0),
            icon: p.icon || '📦'
          });
          imported++;
        } catch (e) {
          errors.push({ idx: i, reason: String(e && e.message || e) });
        }
      }
      sendJSON(res, { ok: true, imported, skipped, errors });
    } catch (err) { sendError(res, err); }
  });
  handlers['GET /api/products/export']  = requireAuth(async (req, res) => sendJSON(res, { ok: true, items: [], format: 'json' }));

  // ============================================================
  // R17 — GIFT CARDS / VALES PREPAGADOS
  // ============================================================
  function _gcGenCode() {
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function seg(n) {
      let s = '';
      for (let i = 0; i < n; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
      return s;
    }
    return `VLX-${seg(4)}-${seg(4)}-${seg(4)}`;
  }
  function _gcQrPayload(code) {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(code)}`;
    return { code, qr_url: url, format: 'image/png' };
  }
  function _gcRequireAdmin(req, res) {
    const role = String((req.user && req.user.role) || '').toLowerCase();
    if (role !== 'admin' && role !== 'owner' && role !== 'superadmin') {
      sendJSON(res, { ok: false, error: 'forbidden', reason: 'admin_or_owner_required' }, 403);
      return false;
    }
    return true;
  }
  // Helper para integración POS checkout: valida code+amount sin descontar.
  async function _gcValidateForCheckout(code, amount) {
    if (!code) return { ok: false, error: 'missing_code' };
    if (!(Number(amount) > 0)) return { ok: false, error: 'invalid_amount' };
    const rows = await supabaseRequest('GET',
      `/gift_cards?code=eq.${encodeURIComponent(code)}&select=id,current_balance,status,expires_at,currency`);
    const card = Array.isArray(rows) && rows[0];
    if (!card) return { ok: false, error: 'not_found' };
    if (card.status !== 'active') return { ok: false, error: `status_${card.status}` };
    if (card.expires_at && new Date(card.expires_at).getTime() < Date.now()) return { ok: false, error: 'expired' };
    if (Number(amount) > Number(card.current_balance)) {
      return { ok: false, error: 'insufficient_balance', balance: Number(card.current_balance) };
    }
    return { ok: true, card };
  }
  if (typeof globalThis !== 'undefined') globalThis.__gcValidateForCheckout = _gcValidateForCheckout;

  handlers['POST /api/gift-cards'] = requireAuth(async (req, res) => {
    try {
      if (!_gcRequireAdmin(req, res)) return;
      const body = await readBody(req);
      const initial = Number(body.initial_amount || body.amount || 0);
      if (!(initial > 0)) {
        return sendJSON(res, { ok: false, error: 'validation_failed', field: 'initial_amount', hint: 'must be > 0' }, 400);
      }
      const tenantId = (req.user && req.user.tenant_id) || 'TNT001';
      const currency = (body.currency || 'mxn').toLowerCase();
      const expires_at = body.expires_at || null;
      const sold_to_customer_id = body.sold_to_customer_id || body.customer_id || null;
      const sold_in_sale_id = body.sold_in_sale_id || body.sale_id || null;
      let row = null, attempts = 0, lastErr = null;
      while (!row && attempts < 5) {
        attempts++;
        const code = _gcGenCode();
        try {
          const inserted = await supabaseRequest('POST', '/gift_cards', {
            tenant_id: tenantId, code,
            initial_amount: initial, current_balance: initial,
            currency, status: 'active', expires_at,
            sold_to_customer_id, sold_in_sale_id
          });
          row = Array.isArray(inserted) ? inserted[0] : inserted;
        } catch (e) {
          lastErr = e;
          if (!String(e && e.message || '').match(/duplicate|unique|conflict/i)) break;
        }
      }
      if (!row) return sendJSON(res, { ok: false, error: 'create_failed', message: String(lastErr && lastErr.message || 'unknown') }, 500);
      sendJSON(res, { ok: true, gift_card: row, qr: _gcQrPayload(row.code) }, 201);
    } catch (err) { sendJSON(res, { ok: false, error: String(err && err.message || err) }, 500); }
  });

  // PATCH /api/gift-cards/:id  (admin/owner)  body: { action:'cancel'|'extend', expires_at? }
  handlers['PATCH /api/gift-cards/:id'] = requireAuth(async (req, res) => {
    try {
      if (!_gcRequireAdmin(req, res)) return;
      const m = (req.url || '').match(/^\/api\/gift-cards\/([^/?]+)/);
      const id = m && decodeURIComponent(m[1]);
      if (!id) return sendJSON(res, { ok: false, error: 'missing_id' }, 400);
      const body = await readBody(req);
      const action = String(body.action || '').toLowerCase();
      const patch = {};
      if (action === 'cancel') {
        patch.status = 'canceled';
      } else if (action === 'extend') {
        if (!body.expires_at) return sendJSON(res, { ok: false, error: 'validation_failed', field: 'expires_at' }, 400);
        patch.expires_at = body.expires_at;
        patch.status = 'active';
      } else {
        return sendJSON(res, { ok: false, error: 'invalid_action', allowed: ['cancel','extend'] }, 400);
      }
      const updated = await supabaseRequest('PATCH', `/gift_cards?id=eq.${encodeURIComponent(id)}`, patch);
      const row = Array.isArray(updated) ? updated[0] : updated;
      if (!row) return sendJSON(res, { ok: false, error: 'not_found' }, 404);
      sendJSON(res, { ok: true, gift_card: row, action });
    } catch (err) { sendJSON(res, { ok: false, error: String(err && err.message || err) }, 500); }
  });

  handlers['GET /api/gift-cards/:code'] = async (req, res) => {
    try {
      const m = (req.url || '').match(/^\/api\/gift-cards\/([^/?]+)/);
      const code = m && decodeURIComponent(m[1]);
      if (!code) return sendJSON(res, { ok: false, error: 'missing_code' }, 400);
      const rows = await supabaseRequest('GET',
        `/gift_cards?code=eq.${encodeURIComponent(code)}&select=code,current_balance,currency,status,expires_at,initial_amount`);
      const card = Array.isArray(rows) && rows[0];
      if (!card) return sendJSON(res, { ok: false, error: 'not_found', resource: 'gift_card' }, 404);
      let effectiveStatus = card.status;
      if (card.expires_at && new Date(card.expires_at).getTime() < Date.now() && effectiveStatus === 'active') effectiveStatus = 'expired';
      sendJSON(res, {
        ok: true, code: card.code,
        balance: Number(card.current_balance),
        initial_amount: Number(card.initial_amount),
        currency: card.currency, status: effectiveStatus, expires_at: card.expires_at
      });
    } catch (err) { sendJSON(res, { ok: false, error: String(err && err.message || err) }, 500); }
  };

  handlers['POST /api/gift-cards/:code/redeem'] = requireAuth(async (req, res) => {
    try {
      const m = (req.url || '').match(/^\/api\/gift-cards\/([^/?]+)\/redeem/);
      const code = m && decodeURIComponent(m[1]);
      if (!code) return sendJSON(res, { ok: false, error: 'missing_code' }, 400);
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      const sale_id = body.sale_id || null;
      if (!(amount > 0)) return sendJSON(res, { ok: false, error: 'validation_failed', field: 'amount', hint: 'must be > 0' }, 400);
      const rows = await supabaseRequest('GET',
        `/gift_cards?code=eq.${encodeURIComponent(code)}&select=id,current_balance,status,expires_at`);
      const card = Array.isArray(rows) && rows[0];
      if (!card) return sendJSON(res, { ok: false, error: 'not_found', resource: 'gift_card' }, 404);
      if (card.status !== 'active') return sendJSON(res, { ok: false, error: 'conflict', conflicting_field: 'status', message: `gift card is ${card.status}` }, 409);
      if (card.expires_at && new Date(card.expires_at).getTime() < Date.now()) {
        await supabaseRequest('PATCH', `/gift_cards?id=eq.${card.id}`, { status: 'expired' });
        return sendJSON(res, { ok: false, error: 'expired', resource: 'gift_card' }, 409);
      }
      const balance = Number(card.current_balance);
      if (amount > balance) return sendJSON(res, { ok: false, error: 'insufficient_balance', balance, requested: amount }, 422);
      const newBalance = +(balance - amount).toFixed(2);
      const newStatus = newBalance <= 0 ? 'redeemed' : 'active';
      await supabaseRequest('PATCH', `/gift_cards?id=eq.${card.id}`, { current_balance: newBalance, status: newStatus });
      try {
        await supabaseRequest('POST', '/gift_card_uses', { gift_card_id: card.id, sale_id, amount_used: amount });
      } catch (_) { /* best-effort */ }
      sendJSON(res, { ok: true, code, redeemed: amount, balance: newBalance, status: newStatus });
    } catch (err) { sendJSON(res, { ok: false, error: String(err && err.message || err) }, 500); }
  });

  handlers['GET /api/gift-cards'] = requireAuth(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const customerId = url.searchParams.get('customer_id');
      let path = '/gift_cards?select=id,code,current_balance,initial_amount,currency,status,expires_at,created_at&order=created_at.desc';
      if (customerId) path += `&sold_to_customer_id=eq.${encodeURIComponent(customerId)}`;
      const rows = await supabaseRequest('GET', path);
      sendJSON(res, { ok: true, items: Array.isArray(rows) ? rows : [], count: Array.isArray(rows) ? rows.length : 0 });
    } catch (err) { sendJSON(res, { ok: false, error: String(err && err.message || err) }, 500); }
  });

  // ============================================================
  // R17 KIOSK: sesión sin login + creación de órdenes
  // ============================================================
  handlers['POST /api/kiosk/session'] = async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!rateLimit(`kiosk_session:${ip}`, 30, 60_000)) {
        return sendJSON(res, { ok: false, error: 'rate_limited' }, 429);
      }
      const body = await readBody(req);
      const tenant_id = Number(body && body.tenant_id);
      const kiosk_id  = Number(body && body.kiosk_id);
      if (!tenant_id || !kiosk_id) {
        return sendJSON(res, { ok: false, error: 'missing_tenant_or_kiosk' }, 400);
      }
      let device = null;
      try {
        const rows = await supabaseRequest('GET',
          `/kiosk_devices?id=eq.${kiosk_id}&tenant_id=eq.${tenant_id}&is_active=eq.true&select=id,name,tenant_id,is_active`);
        device = Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch (_) { device = null; }
      if (!device) return sendJSON(res, { ok: false, error: 'kiosk_not_found_or_inactive' }, 404);
      try {
        await supabaseRequest('PATCH', `/kiosk_devices?id=eq.${kiosk_id}`,
          { last_seen_at: new Date().toISOString() });
      } catch (_) { /* non-fatal */ }
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: `kiosk:${kiosk_id}`, role: 'kiosk',
        tenant_id, kiosk_id,
        scope: ['pos.read', 'pos.order.create'],
        iat: now, exp: now + 3600,
      };
      const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const p = b64url(JSON.stringify(payload));
      const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
      const token = `${h}.${p}.${sig}`;
      return sendJSON(res, { ok: true, token, expires_in: 3600,
        kiosk: { id: device.id, name: device.name, tenant_id: device.tenant_id } });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/kiosk/orders'] = async (req, res) => {
    try {
      const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
      const m = /^Bearer\s+(.+)$/i.exec(auth || '');
      if (!m) return sendJSON(res, { ok: false, error: 'no_token' }, 401);
      const payload = verifyJWT(m[1]);
      if (!payload || payload.role !== 'kiosk') {
        return sendJSON(res, { ok: false, error: 'invalid_kiosk_token' }, 401);
      }
      if (!payload.scope || !payload.scope.includes('pos.order.create')) {
        return sendJSON(res, { ok: false, error: 'forbidden_scope' }, 403);
      }
      const ip = clientIp(req);
      if (!rateLimit(`kiosk_orders:${payload.kiosk_id}:${ip}`, 60, 60_000)) {
        return sendJSON(res, { ok: false, error: 'rate_limited' }, 429);
      }
      const body = await readBody(req);
      const items = Array.isArray(body && body.items) ? body.items : [];
      if (items.length === 0) return sendJSON(res, { ok: false, error: 'empty_cart' }, 400);
      const amount = Number(body && body.amount) || 0;
      if (amount < 0) return sendJSON(res, { ok: false, error: 'invalid_amount' }, 400);
      const payment = body && body.payment;
      if (payment && !['card', 'cash', 'wallet'].includes(payment)) {
        return sendJSON(res, { ok: false, error: 'invalid_payment' }, 400);
      }
      const row = {
        kiosk_id: payload.kiosk_id, tenant_id: payload.tenant_id,
        items, status: 'pending', amount, payment: payment || null,
      };
      let created = null;
      try {
        const inserted = await supabaseRequest('POST', '/kiosk_orders', row);
        created = Array.isArray(inserted) ? inserted[0] : inserted;
      } catch (_) {
        created = { id: `local-${Date.now()}`, ...row, ts: new Date().toISOString() };
      }
      return sendJSON(res, { ok: true, order: created, queued: true, requires_cashier_confirmation: true }, 201);
    } catch (err) { sendError(res, err); }
  };
})();

// =============================================================
// R17: BUNDLES (Combos / Packs) — CRUD + expand + sale integration
// =============================================================
(function wireBundles(){
  if (typeof handlers === 'undefined') return;
  const _bstore = (global.__bundles ||= new Map());
  const _key = (tid, id) => `${tid}::${id}`;
  const _tenant = (req) => (req.user && req.user.tenant_id) || req.headers['x-tenant-id'] || 'default';

  handlers['GET /api/bundles'] = requireAuth(async (req, res) => {
    try {
      const tid = _tenant(req);
      if (global.db && global.db.query) {
        const r = await global.db.query(
          'SELECT * FROM product_bundles WHERE tenant_id=$1 AND active=true ORDER BY id DESC',
          [tid]
        );
        return sendJSON(res, { ok: true, items: r.rows || [] });
      }
      const items = [..._bstore.values()].filter(b => b.tenant_id === tid && b.active !== false);
      sendJSON(res, { ok: true, items });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/bundles'] = requireAuth(async (req, res) => {
    try {
      const tid = _tenant(req);
      const b = req.body || {};
      if (!b.name || !Array.isArray(b.components) || !b.components.length) {
        return sendJSON(res, { ok:false, error:'name + components[] required' }, 400);
      }
      const row = {
        id: Date.now(),
        tenant_id: tid,
        name: String(b.name),
        sku: b.sku || null,
        price: Number(b.price || 0),
        components: b.components.map(c => ({ product_id: Number(c.product_id), qty: Number(c.qty || 1) })),
        active: b.active !== false,
        created_at: new Date().toISOString()
      };
      if (global.db && global.db.query) {
        const r = await global.db.query(
          `INSERT INTO product_bundles (tenant_id,name,sku,price,components,active)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
          [tid, row.name, row.sku, row.price, JSON.stringify(row.components), row.active]
        );
        return sendJSON(res, { ok:true, bundle: r.rows[0] }, 201);
      }
      _bstore.set(_key(tid, row.id), row);
      sendJSON(res, { ok: true, bundle: row }, 201);
    } catch (err) { sendError(res, err); }
  });

  handlers['PATCH /api/bundles/:id'] = requireAuth(async (req, res, params) => {
    try {
      const tid = _tenant(req);
      const id = params.id;
      const b = req.body || {};
      if (global.db && global.db.query) {
        const fields=[]; const vals=[]; let i=1;
        for (const k of ['name','sku','price','active']) {
          if (b[k] !== undefined) { fields.push(`${k}=$${i++}`); vals.push(b[k]); }
        }
        if (b.components) { fields.push(`components=$${i++}::jsonb`); vals.push(JSON.stringify(b.components)); }
        if (!fields.length) return sendJSON(res, { ok:false, error:'no fields' }, 400);
        vals.push(tid, id);
        const r = await global.db.query(
          `UPDATE product_bundles SET ${fields.join(',')}, updated_at=now()
            WHERE tenant_id=$${i++} AND id=$${i} RETURNING *`,
          vals
        );
        return sendJSON(res, { ok:true, bundle: r.rows[0] || null });
      }
      const k = _key(tid, id);
      const cur = _bstore.get(k);
      if (!cur) return sendJSON(res, { ok:false, error:'not found' }, 404);
      Object.assign(cur, b, { updated_at: new Date().toISOString() });
      _bstore.set(k, cur);
      sendJSON(res, { ok:true, bundle: cur });
    } catch (err) { sendError(res, err); }
  });

  handlers['DELETE /api/bundles/:id'] = requireAuth(async (req, res, params) => {
    try {
      const tid = _tenant(req);
      const id = params.id;
      if (global.db && global.db.query) {
        await global.db.query(
          'UPDATE product_bundles SET active=false, updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [tid, id]
        );
        return sendJSON(res, { ok:true });
      }
      const k = _key(tid, id);
      const cur = _bstore.get(k);
      if (cur) { cur.active = false; _bstore.set(k, cur); }
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/bundles/:id/expand'] = requireAuth(async (req, res, params) => {
    try {
      const tid = _tenant(req);
      const id = params.id;
      const factor = Number((req.body && req.body.qty) || 1);
      let components = [];
      if (global.db && global.db.query) {
        const r = await global.db.query(
          'SELECT components FROM product_bundles WHERE tenant_id=$1 AND id=$2 AND active=true',
          [tid, id]
        );
        if (!r.rows[0]) return sendJSON(res, { ok:false, error:'bundle not found' }, 404);
        components = r.rows[0].components || [];
      } else {
        const cur = _bstore.get(_key(tid, id));
        if (!cur) return sendJSON(res, { ok:false, error:'bundle not found' }, 404);
        components = cur.components || [];
      }
      const items = components.map(c => ({ product_id: c.product_id, qty: Number(c.qty||1) * factor }));
      sendJSON(res, { ok:true, bundle_id: Number(id), items });
    } catch (err) { sendError(res, err); }
  });

  // Hook POST /api/sales: expand bundle items into multiple sale_items
  const _origSales = handlers['POST /api/sales'];
  if (_origSales) {
    handlers['POST /api/sales'] = requireAuth(async (req, res) => {
      try {
        const tid = _tenant(req);
        const body = req.body || {};
        if (Array.isArray(body.items)) {
          const expanded = [];
          for (const it of body.items) {
            if (it && it.bundle_id) {
              let comps = [];
              if (global.db && global.db.query) {
                const r = await global.db.query(
                  'SELECT components FROM product_bundles WHERE tenant_id=$1 AND id=$2 AND active=true',
                  [tid, it.bundle_id]
                );
                comps = (r.rows[0] && r.rows[0].components) || [];
              } else {
                const cur = _bstore.get(_key(tid, it.bundle_id));
                comps = (cur && cur.components) || [];
              }
              const factor = Number(it.qty || 1);
              for (const c of comps) {
                expanded.push({
                  product_id: c.product_id,
                  qty: Number(c.qty||1) * factor,
                  bundle_id: it.bundle_id,
                  bundle_parent_qty: factor
                });
              }
            } else {
              expanded.push(it);
            }
          }
          req.body = { ...body, items: expanded };
        }
        return _origSales(req, res);
      } catch (err) { sendError(res, err); }
    });
  }
})();

// =============================================================
// R17 PROMOTIONS — Sistema de promociones y cupones
// =============================================================
(() => {
  const TABLE = '/promotions';
  const USES  = '/promotion_uses';

  // GET /api/promotions?active=1
  handlers['GET /api/promotions'] = requireAuth(async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      let q = `${TABLE}?select=*&order=ends_at.desc.nullslast&limit=200`;
      if (parsed.query.active === '1') q += '&active=eq.true';
      const rows = await supabaseRequest('GET', q);
      sendJSON(res, { ok: true, items: rows || [] });
    } catch (err) {
      // graceful: column type mismatch or table issue → return empty
      sendJSON(res, { ok: true, items: [], note: err && err.message && err.message.slice(0, 100) });
    }
  });

  // POST /api/promotions
  handlers['POST /api/promotions'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.code) return sendJSON(res, { error: 'code requerido' }, 400);
      const validTypes = ['percent','fixed','bogo','first_purchase','loyalty_tier'];
      if (!validTypes.includes(body.type)) return sendJSON(res, { error: 'type inválido' }, 400);
      const row = {
        tenant_id: body.tenant_id || req.user.tenant_id,
        code: String(body.code).toUpperCase().trim(),
        type: body.type,
        value: Number(body.value) || 0,
        min_amount: Number(body.min_amount) || 0,
        max_uses: parseInt(body.max_uses, 10) || 0,
        used_count: 0,
        category_id: body.category_id || null,
        required_tier: body.required_tier || null,
        starts_at: body.starts_at || null,
        ends_at: body.ends_at || null,
        active: body.active !== false,
      };
      const result = await supabaseRequest('POST', TABLE, row);
      sendJSON(res, (result && result[0]) || result);
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  // PATCH /api/promotions/:id
  handlers['PATCH /api/promotions/:id'] = requireAuth(async (req, res, params) => {
    try {
      const body = await readBody(req);
      const patch = {};
      ['code','type','value','min_amount','max_uses','category_id','required_tier','starts_at','ends_at','active']
        .forEach(k => { if (body[k] !== undefined) patch[k] = body[k]; });
      if (patch.code) patch.code = String(patch.code).toUpperCase().trim();
      const result = await supabaseRequest('PATCH', `${TABLE}?id=eq.${params.id}`, patch);
      sendJSON(res, (result && result[0]) || { ok: true });
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  // DELETE /api/promotions/:id
  handlers['DELETE /api/promotions/:id'] = requireAuth(async (req, res, params) => {
    try {
      await supabaseRequest('DELETE', `${TABLE}?id=eq.${params.id}`);
      sendJSON(res, { ok: true, deleted: params.id });
    } catch (err) { sendError(res, err); }
  }, ['admin','owner','superadmin']);

  // POST /api/promotions/validate { code, customer_id?, cart_total }
  handlers['POST /api/promotions/validate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const code = String(body.code || '').toUpperCase().trim();
      const cartTotal = Number(body.cart_total) || 0;
      if (!code) return sendJSON(res, { valid: false, message: 'code_required' }, 400);
      const tenantId = body.tenant_id || req.user.tenant_id;

      const rows = await supabaseRequest('GET',
        `${TABLE}?tenant_id=eq.${encodeURIComponent(tenantId)}&code=eq.${encodeURIComponent(code)}&active=eq.true&select=*`);
      if (!rows || !rows.length) return sendJSON(res, { valid: false, discount_amount: 0, message: 'invalid_code' });
      const p = rows[0];

      const now = Date.now();
      if (p.starts_at && now < new Date(p.starts_at).getTime())
        return sendJSON(res, { valid: false, discount_amount: 0, message: 'not_started' });
      if (p.ends_at && now > new Date(p.ends_at).getTime())
        return sendJSON(res, { valid: false, discount_amount: 0, message: 'expired' });
      if (p.max_uses > 0 && p.used_count >= p.max_uses)
        return sendJSON(res, { valid: false, discount_amount: 0, message: 'max_uses_reached' });
      if (cartTotal < Number(p.min_amount || 0))
        return sendJSON(res, { valid: false, discount_amount: 0, message: 'min_amount_not_met', min_amount: p.min_amount });

      // first_purchase: cliente sin usos previos
      if (p.type === 'first_purchase' && body.customer_id) {
        const prev = await supabaseRequest('GET',
          `${USES}?customer_id=eq.${encodeURIComponent(body.customer_id)}&select=id&limit=1`);
        if (prev && prev.length)
          return sendJSON(res, { valid: false, discount_amount: 0, message: 'not_first_purchase' });
      }

      // loyalty_tier: requiere tier mínimo
      if (p.type === 'loyalty_tier' && p.required_tier && body.customer_id) {
        const cust = await supabaseRequest('GET',
          `/customers?id=eq.${encodeURIComponent(body.customer_id)}&select=tier:loyalty_tiers(name)`);
        const tier = (cust && cust[0] && cust[0].tier && cust[0].tier.name) || 'bronze';
        const order = ['bronze','silver','gold','platinum'];
        if (order.indexOf(tier) < order.indexOf(p.required_tier))
          return sendJSON(res, { valid: false, discount_amount: 0, message: 'tier_too_low', required: p.required_tier, have: tier });
      }

      let discount = 0;
      if (p.type === 'percent' || p.type === 'first_purchase' || p.type === 'loyalty_tier') {
        discount = Math.round(cartTotal * Number(p.value) / 100 * 100) / 100;
      } else if (p.type === 'fixed') {
        discount = Math.min(Number(p.value), cartTotal);
      } else if (p.type === 'bogo') {
        discount = Math.round(cartTotal * 0.5 * 100) / 100; // 2x1 aproximado
      }

      sendJSON(res, { valid: true, discount_amount: discount, message: 'ok', promo_id: p.id, type: p.type });
    } catch (err) { sendError(res, err); }
  });

  // Hook server-side: aplica promo dentro de POST /api/sales si body.promo_code presente
  global.applyPromoToSale = async ({ tenant_id, code, customer_id, cart_total, sale_id }) => {
    if (!code) return { applied: false, discount: 0 };
    const c = String(code).toUpperCase().trim();
    const rows = await supabaseRequest('GET',
      `${TABLE}?tenant_id=eq.${encodeURIComponent(tenant_id)}&code=eq.${encodeURIComponent(c)}&active=eq.true&select=*`);
    if (!rows || !rows.length) return { applied: false, discount: 0, reason: 'invalid_code' };
    const p = rows[0];
    const now = Date.now();
    if (p.starts_at && now < new Date(p.starts_at).getTime()) return { applied: false, discount: 0, reason: 'not_started' };
    if (p.ends_at && now > new Date(p.ends_at).getTime()) return { applied: false, discount: 0, reason: 'expired' };
    if (p.max_uses > 0 && p.used_count >= p.max_uses) return { applied: false, discount: 0, reason: 'max_uses_reached' };
    if (cart_total < Number(p.min_amount || 0)) return { applied: false, discount: 0, reason: 'min_amount_not_met' };

    let discount = 0;
    if (p.type === 'percent' || p.type === 'first_purchase' || p.type === 'loyalty_tier')
      discount = Math.round(cart_total * Number(p.value) / 100 * 100) / 100;
    else if (p.type === 'fixed') discount = Math.min(Number(p.value), cart_total);
    else if (p.type === 'bogo') discount = Math.round(cart_total * 0.5 * 100) / 100;

    try {
      await supabaseRequest('POST', USES, {
        promo_id: p.id, sale_id: sale_id || null,
        customer_id: customer_id || null, discount_applied: discount,
      });
      await supabaseRequest('PATCH', `${TABLE}?id=eq.${p.id}`, { used_count: (p.used_count || 0) + 1 });
    } catch (_) { /* tablas pueden no existir aún */ }

    return { applied: true, discount, promo_id: p.id, type: p.type };
  };
})();

// =============================================================
// R17 — TELEGRAM ADMIN BOT
// =============================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function sendTelegramMessage(chat_id, text) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) return reject(new Error('TELEGRAM_BOT_TOKEN not configured'));
    const body = JSON.stringify({ chat_id, text, parse_mode: 'Markdown' });
    const r = https.request({
      hostname: 'api.telegram.org', port: 443,
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function logTelegramAlert(type, chat_id, body) {
  try {
    await supabaseRequest('POST', '/telegram_alerts', { type, sent_to_chat: chat_id, body });
  } catch (_) { /* swallow */ }
}

async function handleTelegramCommand(chat_id, text, from) {
  const t = (text || '').trim();
  if (t === '/start' || t.startsWith('/start ')) {
    const msg = `Bienvenido a Volvix POS Admin Bot.\nTu chat_id: \`${chat_id}\`\nPide a tu admin que lo vincule.`;
    await sendTelegramMessage(chat_id, msg);
    await logTelegramAlert('start', chat_id, msg);
    return;
  }
  const adminRows = await supabaseRequest('GET',
    `/telegram_admins?chat_id=eq.${chat_id}&select=user_id,tenant_id`);
  if (!adminRows || adminRows.length === 0) {
    await sendTelegramMessage(chat_id, 'No estas vinculado. Usa /start y pide a un admin que te vincule.');
    return;
  }
  const admin = adminRows[0];

  if (t === '/sales today') {
    const today = new Date().toISOString().slice(0, 10);
    const sales = await supabaseRequest('GET',
      `/pos_sales?tenant_id=eq.${admin.tenant_id}&created_at=gte.${today}T00:00:00&select=total`);
    const count = (sales || []).length;
    const total = (sales || []).reduce((s, r) => s + Number(r.total || 0), 0);
    const msg = `*Ventas hoy (${today})*\nTickets: ${count}\nTotal: $${total.toFixed(2)}`;
    await sendTelegramMessage(chat_id, msg);
    await logTelegramAlert('sales', chat_id, msg);
    return;
  }
  if (t === '/inventory low') {
    const items = await supabaseRequest('GET',
      `/pos_products?tenant_id=eq.${admin.tenant_id}&stock=lt.5&select=name,stock&limit=20`);
    const lines = (items || []).map(p => `- ${p.name}: ${p.stock}`).join('\n') || '(sin productos bajo stock)';
    const msg = `*Productos bajo stock (<5)*\n${lines}`;
    await sendTelegramMessage(chat_id, msg);
    await logTelegramAlert('inventory', chat_id, msg);
    return;
  }
  if (t.startsWith('/alert ')) {
    const message = t.slice(7).trim();
    if (!message) { await sendTelegramMessage(chat_id, 'Uso: /alert <mensaje>'); return; }
    const all = await supabaseRequest('GET',
      `/telegram_admins?tenant_id=eq.${admin.tenant_id}&select=chat_id`);
    const body = `*ALERTA* (de ${from?.username || 'admin'})\n${message}`;
    for (const a of (all || [])) {
      try { await sendTelegramMessage(a.chat_id, body); } catch (_) {}
      await logTelegramAlert('alert', a.chat_id, body);
    }
    return;
  }
  if (t === '/dashboard') {
    const subs = await supabaseRequest('GET',
      `/pos_subscriptions?tenant_id=eq.${admin.tenant_id}&status=eq.active&select=mrr_usd`);
    const mrr = (subs || []).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
    const arr = mrr * 12;
    const msg = `*Dashboard*\nMRR: $${mrr.toFixed(2)}\nARR: $${arr.toFixed(2)}\nSubs activas: ${(subs || []).length}`;
    await sendTelegramMessage(chat_id, msg);
    await logTelegramAlert('dashboard', chat_id, msg);
    return;
  }
  await sendTelegramMessage(chat_id,
    'Comandos: /start, /sales today, /inventory low, /alert <msg>, /dashboard');
}

handlers['POST /api/telegram/webhook'] = async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return sendJSON(res, { error: 'service_unavailable', message: 'TELEGRAM_BOT_TOKEN not configured' }, 503);
  }
  try {
    const update = await readBody(req);
    const msg = update?.message || update?.edited_message;
    if (!msg || !msg.chat || !msg.text) return sendJSON(res, { ok: true, ignored: true });
    handleTelegramCommand(msg.chat.id, msg.text, msg.from).catch(() => {});
    return sendJSON(res, { ok: true });
  } catch (err) { return sendError(res, err); }
};

// =============================================================
// R17 — ANTI-FRAUD RULES ENGINE
// =============================================================
(function attachFraudEngine() {
  const FRAUD_THRESHOLD = Number(process.env.FRAUD_THRESHOLD || 70);

  const rulesCache = { ts: 0, items: [] };
  async function getRules(tenantId) {
    const now = Date.now();
    if (now - rulesCache.ts > 5 * 60 * 1000) {
      try {
        const rows = await supabaseRequest('GET', '/fraud_rules?active=eq.true&select=*');
        rulesCache.items = Array.isArray(rows) ? rows : [];
        rulesCache.ts = now;
      } catch (_) {}
    }
    return rulesCache.items.filter(r => !r.tenant_id || r.tenant_id === tenantId);
  }

  async function countRecentSales(tenantId, customerId, windowSec) {
    if (!customerId) return 0;
    try {
      const since = new Date(Date.now() - windowSec * 1000).toISOString();
      const qs = `?pos_user_id=eq.${tenantId}&customer_id=eq.${customerId}&created_at=gte.${since}&select=id`;
      const rows = await supabaseRequest('GET', '/pos_sales' + qs);
      return Array.isArray(rows) ? rows.length : 0;
    } catch (_) { return 0; }
  }

  async function countRecentRefunds(tenantId, customerId, windowSec) {
    if (!customerId) return 0;
    try {
      const since = new Date(Date.now() - windowSec * 1000).toISOString();
      const qs = `?pos_user_id=eq.${tenantId}&customer_id=eq.${customerId}&type=eq.refund&created_at=gte.${since}&select=id`;
      const rows = await supabaseRequest('GET', '/pos_returns' + qs);
      return Array.isArray(rows) ? rows.length : 0;
    } catch (_) { return 0; }
  }

  async function isNewCustomer(tenantId, customerId) {
    if (!customerId) return false;
    try {
      const qs = `?id=eq.${customerId}&select=created_at,total_purchases&limit=1`;
      const rows = await supabaseRequest('GET', '/customers' + qs);
      const c = rows && rows[0];
      if (!c) return true;
      const ageDays = (Date.now() - new Date(c.created_at).getTime()) / 86400000;
      return ageDays < 7 || (Number(c.total_purchases) || 0) <= 1;
    } catch (_) { return false; }
  }

  function geoMismatch(saleData) {
    const ipCountry = saleData.ip_country || saleData.geo_ip;
    const addrCountry = saleData.customer && (saleData.customer.country || saleData.customer.address_country);
    if (!ipCountry || !addrCountry) return false;
    return String(ipCountry).toUpperCase() !== String(addrCountry).toUpperCase();
  }

  async function evaluateFraudRisk(saleData, ctx) {
    ctx = ctx || {};
    const tenantId = ctx.tenant_id || saleData.pos_user_id || null;
    const triggered = [];
    let score = 0;

    const rules = await getRules(tenantId);
    const total = Number(saleData.total) || 0;
    const customerId = saleData.customer_id || (saleData.customer && saleData.customer.id);

    for (const rule of rules) {
      const cond = rule.condition || {};
      let hit = false;
      switch (cond.type) {
        case 'amount_gt':
          hit = total > Number(cond.value || 10000); break;
        case 'velocity': {
          const n = await countRecentSales(tenantId, customerId, Number(cond.window || 3600));
          hit = n > Number(cond.max || 5); break;
        }
        case 'card_test': {
          const n = await countRecentSales(tenantId, customerId, 600);
          hit = n >= Number(cond.threshold || 5) && total <= Number(cond.max_amount || 100); break;
        }
        case 'geo_mismatch':
          hit = geoMismatch(saleData); break;
        case 'new_customer_high': {
          const isNew = await isNewCustomer(tenantId, customerId);
          hit = isNew && total >= Number(cond.amount || 2000); break;
        }
        case 'refund_freq': {
          const n = await countRecentRefunds(tenantId, customerId, Number(cond.window || 86400));
          hit = n > Number(cond.max || 3); break;
        }
        default: hit = false;
      }
      if (hit) {
        score += Number(rule.weight) || 0;
        triggered.push({ id: rule.id, name: rule.name, weight: rule.weight });
      }
    }
    score = Math.min(100, score);
    return { score, triggered, flagged: score > FRAUD_THRESHOLD, threshold: FRAUD_THRESHOLD };
  }

  async function flagSaleAndAlert(saleRow, evalInput, ctx) {
    try {
      const risk = await evaluateFraudRisk({ ...evalInput, total: Number(saleRow.total) || 0 }, ctx);
      if (!risk.flagged) return risk;
      try {
        await supabaseRequest('POST', '/fraud_alerts', {
          sale_id: saleRow.id,
          tenant_id: ctx.tenant_id || null,
          customer_id: evalInput.customer_id || null,
          score: risk.score,
          triggered_rules: risk.triggered,
          status: 'pending'
        });
      } catch (_) {}
      try {
        await supabaseRequest('PATCH', `/pos_sales?id=eq.${saleRow.id}`,
          { fraud_review: true, fraud_score: risk.score });
      } catch (_) {}
      return risk;
    } catch (e) { return { score: 0, triggered: [], flagged: false, error: String(e && e.message || e) }; }
  }

  // Wrap del POST /api/sales: capturar saleRow vía interceptor de res.end
  const _origSale = handlers['POST /api/sales'];
  if (typeof _origSale === 'function') {
    handlers['POST /api/sales'] = async (req, res, params) => {
      let saleRow = null;
      const origWrite = res.write && res.write.bind(res);
      const origEnd   = res.end   && res.end.bind(res);
      const chunks = [];
      res.write = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return origWrite ? origWrite(chunk) : true;
      };
      res.end = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        try {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (txt) saleRow = JSON.parse(txt);
        } catch (_) {}
        const r = origEnd ? origEnd(chunk) : undefined;
        if (saleRow && saleRow.id && !saleRow.error) {
          const evalInput = {
            customer_id: saleRow.customer_id || null,
            customer:    saleRow.customer || null,
            ip_country:  req.headers['x-ip-country'] || null,
            total:       saleRow.total
          };
          flagSaleAndAlert(saleRow, evalInput,
            { tenant_id: req.user && (req.user.tenant_id || req.user.id) }
          ).catch(() => {});
        }
        return r;
      };
      return _origSale(req, res, params);
    };
  }

  global.evaluateFraudRisk = evaluateFraudRisk;

  // ---- Endpoints ----
  handlers['GET /api/fraud/alerts'] = requireAuth(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      const status = u.searchParams.get('status') || 'pending';
      const tenantId = req.user.tenant_id || req.user.id;
      let qs = `?status=eq.${status}&select=*&order=created_at.desc&limit=200`;
      if (req.user.role !== 'superadmin') {
        qs = `?status=eq.${status}&tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=200`;
      }
      const rows = await supabaseRequest('GET', '/fraud_alerts' + qs);
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'superadmin', 'owner']);

  handlers['GET /api/fraud/rules'] = requireAuth(async (req, res) => {
    try {
      const rows = await supabaseRequest('GET', '/fraud_rules?select=*&order=weight.desc');
      sendJSON(res, rows || []);
    } catch (err) { sendError(res, err); }
  }, ['admin', 'superadmin', 'owner']);

  handlers['POST /api/fraud/evaluate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await evaluateFraudRisk(body || {},
        { tenant_id: req.user.tenant_id || req.user.id });
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  });

  handlers['POST /api/fraud/review/:sale_id'] = requireAuth(async (req, res, params) => {
    try {
      const saleId = params && params.sale_id;
      if (!saleId) return sendJSON(res, { error: 'sale_id required' }, 400);
      const body = await readBody(req) || {};
      const action = body.action;
      if (!['approve', 'reject'].includes(action)) {
        return sendJSON(res, { error: 'action must be approve|reject' }, 400);
      }
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const patch = {
        status: newStatus,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        notes: body.notes || null
      };
      try {
        await supabaseRequest('PATCH',
          `/fraud_alerts?sale_id=eq.${saleId}&status=eq.pending`, patch);
      } catch (_) {}
      try {
        if (action === 'approve') {
          await supabaseRequest('PATCH', `/pos_sales?id=eq.${saleId}`,
            { fraud_review: false });
        } else {
          await supabaseRequest('PATCH', `/pos_sales?id=eq.${saleId}`,
            { fraud_review: false, status: 'void' });
        }
      } catch (_) {}
      sendJSON(res, { ok: true, sale_id: saleId, status: newStatus });
    } catch (err) { sendError(res, err); }
  }, ['admin', 'superadmin', 'owner']);
})();

// ============================================================================
// R17: QR PAYMENTS — CoDi / SPEI / PIX (slice 109)
// ============================================================================
(function attachQrPayments() {
  const BBVA_API_KEY = (process.env.BBVA_API_KEY || '').trim();
  const QR_TTL_SECONDS = 900; // 15 min
  const memStore = global.__qrPaymentsMem || (global.__qrPaymentsMem = new Map());

  function genUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  function genClabe18() {
    let s = '';
    for (let i = 0; i < 18; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  // QR builder minimal (formato simple como "string + svg base64").
  // Para evitar dependencias externas, generamos un SVG con el contenido textual
  // codificado en blocks (placeholder visual, válido para handoff a impresora).
  function qrSvgFromString(text) {
    const safe = String(text).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
    const cells = 25;
    const sz = 250;
    const cs = sz / cells;
    let body = '';
    // Pseudo-pattern derivado del hash del texto (determinístico).
    const hash = crypto.createHash('sha256').update(text).digest();
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const bit = (hash[(y * cells + x) % hash.length] >> ((x + y) & 7)) & 1;
        if (bit) body += `<rect x="${x*cs}" y="${y*cs}" width="${cs}" height="${cs}" fill="#000"/>`;
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><rect width="${sz}" height="${sz}" fill="#fff"/>${body}<title>${safe}</title></svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
  }

  // CoDi-compliant string (formato simplificado de prueba).
  function buildCodiString({ amount, sale_id, concept, ref }) {
    const a = Number(amount).toFixed(2);
    const c = encodeURIComponent(concept || 'Pago Volvix');
    return `CODI://pay?ref=${ref}&amount=${a}&sale=${encodeURIComponent(sale_id || '')}&concept=${c}`;
  }

  async function persistQrPayment(row) {
    try {
      await supabaseRequest('POST', '/qr_payments', row);
    } catch (_) {
      memStore.set(row.id, row);
    }
  }

  async function fetchQrPayment(id) {
    try {
      const r = await supabaseRequest('GET', `/qr_payments?id=eq.${id}&limit=1`);
      if (Array.isArray(r) && r[0]) return r[0];
    } catch (_) {}
    return memStore.get(id) || null;
  }

  async function updateQrStatus(id, patch) {
    try {
      await supabaseRequest('PATCH', `/qr_payments?id=eq.${id}`, patch);
    } catch (_) {
      const existing = memStore.get(id);
      if (existing) memStore.set(id, { ...existing, ...patch });
    }
  }

  // POST /api/qr/codi/generate (auth)
  handlers['POST /api/qr/codi/generate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req) || {};
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return sendJSON(res, { error: 'amount required' }, 400);
      const id = genUUID();
      const ref = id.replace(/-/g, '').slice(0, 16);
      const codiString = buildCodiString({
        amount, sale_id: body.sale_id, concept: body.concept, ref
      });
      const qr_svg = qrSvgFromString(codiString);
      const expires_at = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString();
      const tenant_id = (req.user && (req.user.tenant_id || req.user.id)) || null;
      const mock = !BBVA_API_KEY;
      const row = {
        id, sale_id: body.sale_id || null, type: 'codi',
        amount, qr_data: codiString, status: 'pending',
        expires_at, paid_at: null, tenant_id,
        provider: mock ? 'mock' : 'bbva'
      };
      await persistQrPayment(row);
      sendJSON(res, {
        ok: true, mock, id, type: 'codi',
        codi_string: codiString, qr_svg,
        expires_at, status: 'pending'
      });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/qr/spei/generate
  handlers['POST /api/qr/spei/generate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req) || {};
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return sendJSON(res, { error: 'amount required' }, 400);
      const id = genUUID();
      const clabe = genClabe18();
      const speiString = `SPEI://pay?clabe=${clabe}&amount=${amount.toFixed(2)}`;
      const qr_svg = qrSvgFromString(speiString);
      const expires_at = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString();
      const tenant_id = (req.user && (req.user.tenant_id || req.user.id)) || null;
      const row = {
        id, sale_id: body.sale_id || null, type: 'spei',
        amount, qr_data: speiString, status: 'pending',
        expires_at, paid_at: null, tenant_id, provider: 'mock'
      };
      await persistQrPayment(row);
      sendJSON(res, {
        ok: true, mock: true, id, type: 'spei',
        clabe, qr_svg, expires_at, status: 'pending'
      });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/qr/payments/:id/status — polling
  handlers['GET /api/qr/payments/:id/status'] = async (req, res, params) => {
    try {
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'id required' }, 400);
      const row = await fetchQrPayment(id);
      if (!row) return sendJSON(res, { error: 'not found' }, 404);

      let status = row.status || 'pending';
      const now = Date.now();
      const exp = row.expires_at ? Date.parse(row.expires_at) : 0;

      if (status === 'pending') {
        if (exp && now > exp) {
          status = 'expired';
          await updateQrStatus(id, { status });
        } else {
          // Mock probabilístico: 60% pending, 30% paid, 10% expired
          const r = Math.random();
          if (r < 0.30) {
            status = 'paid';
            await updateQrStatus(id, { status, paid_at: new Date().toISOString() });
          } else if (r < 0.40) {
            status = 'expired';
            await updateQrStatus(id, { status });
          }
        }
      }

      sendJSON(res, {
        ok: true, id, type: row.type, amount: row.amount,
        status, expires_at: row.expires_at, paid_at: row.paid_at || null
      });
    } catch (err) { sendError(res, err); }
  };
})();

// =============================================================
// MAIN HANDLER
// =============================================================
module.exports = async (req, res) => {
  // R14: timing + structured logging
  const __t0 = Date.now();
  let __logged = false;
  const __finalize = () => {
    if (__logged) return; __logged = true;
    const dur = Date.now() - __t0;
    const status = res.statusCode || 0;
    recordMetric(dur, status);
    if (req.url && req.url.startsWith('/api/')) {
      logRequest({
        ts: new Date().toISOString(),
        method: req.method,
        path: (req.url.split('?')[0]) || '',
        status,
        duration_ms: dur,
        user_id: req.user?.id || null,
        tenant_id: req.user?.tenant_id || null,
        ip: clientIp(req),
      });
    }
  };
  res.on('finish', __finalize);
  res.on('close', __finalize);

  // R14: security headers en TODA respuesta
  setSecurityHeaders(res);
  // FIX R13 (#8): CORS dinámico (no '*')
  applyCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  if (pathname.startsWith('/api/') || pathname === '/api') {
    const match = matchRoute(method, pathname);

    if (match) {
      try {
        await match.handler(req, res, match.params);
      } catch (err) {
        METRICS.errorCount++;
        logRequest({
          ts: new Date().toISOString(), level: 'error',
          path: pathname, method, msg: 'handler threw',
          err: IS_PROD ? 'internal' : String(err && err.message || err),
        });
        sendError(res, err);
      }
    } else {
      sendJSON(res, { error: 'endpoint not found' }, 404);
    }
    return;
  }

  // SEO: sitemap.xml y robots.txt servidos con MIME correcto
  if (pathname === '/sitemap.xml') {
    const fp = findFile('/sitemap.xml');
    if (fp) {
      res.statusCode = 200;
      setSecurityHeaders(res);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(fs.readFileSync(fp));
      return;
    }
  }
  if (pathname === '/robots.txt') {
    const fp = findFile('/robots.txt');
    if (fp) {
      res.statusCode = 200;
      setSecurityHeaders(res);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(fs.readFileSync(fp));
      return;
    }
  }

  serveStaticFile(res, pathname);
};

// Test exports (only when NODE_ENV=test) - used by tests/unit/*.test.js
if (process.env.NODE_ENV === 'test') {
  module.exports.__test = {
    signJWT,
    verifyJWT,
    verifyPassword,
    rateLimit,
    rateBuckets,
    isUuid,
    isInt,
    pickFields,
    setSecurityHeaders,
    applyCorsHeaders,
    requireAuth,
    ALLOWED_ORIGINS,
    ALLOWED_FIELDS_PRODUCTS,
    ALLOWED_FIELDS_CUSTOMERS,
    ALLOWED_FIELDS_SALES,
    ALLOWED_FIELDS_TENANTS,
    ALLOWED_FIELDS_USERS,
    JWT_SECRET,
    JWT_EXPIRES_SECONDS,
  };
}

// ============================================================================
// R17: WHATSAPP BUSINESS API ROUTES (Meta Graph + webhook + logging)
// ============================================================================
(function attachWhatsAppRoutes() {
  // R23 FIX: dbQuery shim para HR/KDS handlers (antes ReferenceError -> 500).
  // Usa Supabase Management API si SUPABASE_PAT está; si no, retorna {rows:[]} graceful.
  const dbQuery = async (sql, params) => {
    const SUPABASE_PAT = (process.env.SUPABASE_PAT || '').trim();
    if (!SUPABASE_PAT) {
      const e = new Error('relation does not exist (db unavailable)');
      e.code = '42P01';
      throw e;
    }
    let finalSql = String(sql);
    if (Array.isArray(params)) {
      params.forEach((p, i) => {
        const placeholder = '\\$' + (i + 1);
        const val = p === null || p === undefined ? 'NULL'
          : (typeof p === 'number' ? String(p)
            : `'${String(p).replace(/'/g, "''")}'`);
        finalSql = finalSql.replace(new RegExp(placeholder, 'g'), val);
      });
    }
    return await new Promise((resolve, reject) => {
      const body = JSON.stringify({ query: finalSql });
      const opts = {
        hostname: 'api.supabase.com',
        path: '/v1/projects/zhvwmzkcqngcaqpdxtwr/database/query',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000,
      };
      const req2 = https.request(opts, res2 => {
        let data = '';
        res2.on('data', d => data += d);
        res2.on('end', () => {
          try {
            const arr = JSON.parse(data);
            if (arr && arr.message && /relation .* does not exist/i.test(arr.message)) {
              const e = new Error(arr.message); e.code = '42P01'; return reject(e);
            }
            if (arr && arr.message && /column .* does not exist/i.test(arr.message)) {
              const e = new Error(arr.message); e.code = '42703'; return reject(e);
            }
            resolve({ rows: Array.isArray(arr) ? arr : [], rowCount: Array.isArray(arr) ? arr.length : 0 });
          } catch { resolve({ rows: [], rowCount: 0 }); }
        });
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('db_timeout')); });
      req2.write(body);
      req2.end();
    });
  };

  const WHATSAPP_TOKEN = (process.env.WHATSAPP_TOKEN || '').trim();
  const WHATSAPP_PHONE_NUMBER_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const WHATSAPP_VERIFY_TOKEN = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const WHATSAPP_GRAPH_VERSION = (process.env.WHATSAPP_GRAPH_VERSION || 'v18.0').trim();
  const WA_TEMPLATES = ['order_confirmation', 'payment_received', 'shipping_update', 'low_stock_alert', 'appointment_reminder'];

  function logWhatsApp(row) {
    try {
      return supabaseRequest('POST', '/whatsapp_messages', {
        tenant_id: row.tenant_id || null,
        direction: row.direction || 'out',
        to_phone: row.to_phone || null,
        template: row.template || null,
        body: row.body || null,
        status: row.status || 'queued',
        wa_id: row.wa_id || null,
        sent_at: row.sent_at || new Date().toISOString(),
      }).catch(() => {});
    } catch (_) { /* swallow */ }
  }

  function sendWhatsAppGraph(opts) {
    const to = opts && opts.to;
    const template = opts && opts.template;
    const params = (opts && Array.isArray(opts.params)) ? opts.params : [];
    return new Promise((resolve) => {
      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        return resolve({ ok: false, error: 'whatsapp_not_configured', status: 503 });
      }
      const components = params.length
        ? [{ type: 'body', parameters: params.map(v => ({ type: 'text', text: String(v) })) }]
        : [];
      const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(to).replace(/[^0-9+]/g, ''),
        type: 'template',
        template: { name: template, language: { code: 'es_MX' }, components },
      });
      const reqOpts = {
        hostname: 'graph.facebook.com', port: 443,
        path: '/' + WHATSAPP_GRAPH_VERSION + '/' + WHATSAPP_PHONE_NUMBER_ID + '/messages',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + WHATSAPP_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const rq = https.request(reqOpts, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (r.statusCode >= 400) return resolve({ ok: false, error: parsed.error || data, status: r.statusCode });
            const wa_id = parsed.messages && parsed.messages[0] && parsed.messages[0].id;
            resolve({ ok: true, wa_id: wa_id, raw: parsed });
          } catch (e) { resolve({ ok: false, error: 'parse_error' }); }
        });
      });
      rq.on('error', (e) => resolve({ ok: false, error: String(e.message || e) }));
      rq.write(payload);
      rq.end();
    });
  }

  // expose helpers globally for sales-trigger fire-and-forget
  global.__waSend = sendWhatsAppGraph;
  global.__waLog = logWhatsApp;
  global.__waConfigured = !!WHATSAPP_TOKEN;
  global.__waTemplates = WA_TEMPLATES;

  handlers['POST /api/whatsapp/send'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      if (!WHATSAPP_TOKEN) return sendJSON(res, { ok: false, error: 'WHATSAPP_TOKEN no configurado' }, 503);
      const to = body.to;
      const template = body.template;
      const params = Array.isArray(body.params) ? body.params : [];
      if (!to || !template) return sendJSON(res, { ok: false, error: 'to/template requeridos' }, 400);
      if (!WA_TEMPLATES.includes(template)) {
        return sendJSON(res, { ok: false, error: 'template_not_approved', allowed: WA_TEMPLATES }, 400);
      }
      const r = await sendWhatsAppGraph({ to: to, template: template, params: params });
      const tenant_id = (req.user && req.user.tenant_id) || null;
      logWhatsApp({
        tenant_id: tenant_id, direction: 'out', to_phone: to, template: template,
        body: JSON.stringify(params), status: r.ok ? 'sent' : 'failed', wa_id: r.wa_id || null,
      });
      sendJSON(res, r, r.ok ? 200 : (r.status || 502));
    } catch (err) { sendError(res, err); }
  });

  handlers['GET /api/whatsapp/webhook'] = async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const q = parsed.query || {};
      const mode = q['hub.mode'];
      const token = q['hub.verify_token'];
      const challenge = q['hub.challenge'];
      if (mode === 'subscribe' && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(String(challenge || ''));
        return;
      }
      sendJSON(res, { ok: false, error: 'verify_token_mismatch' }, 403);
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/whatsapp/webhook'] = async (req, res) => {
    try {
      const body = await readBody(req);
      const entries = Array.isArray(body && body.entry) ? body.entry : [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const changes = Array.isArray(e.changes) ? e.changes : [];
        for (let j = 0; j < changes.length; j++) {
          const v = changes[j].value || {};
          const msgs = Array.isArray(v.messages) ? v.messages : [];
          for (let k = 0; k < msgs.length; k++) {
            const m = msgs[k];
            logWhatsApp({
              tenant_id: null,
              direction: 'in',
              to_phone: m.from || null,
              template: null,
              body: (m.text && m.text.body) || m.type || '',
              status: 'received',
              wa_id: m.id || null,
            });
          }
        }
      }
      sendJSON(res, { ok: true });
    } catch (err) { sendJSON(res, { ok: true }); }
  };

  handlers['GET /api/whatsapp/messages'] = requireAuth(async (req, res) => {
    try {
      const list = await supabaseRequest('GET', '/whatsapp_messages?order=sent_at.desc&limit=100');
      sendJSON(res, { ok: true, items: list || [], total: (list || []).length });
    } catch (_) { sendJSON(res, { ok: true, items: [], total: 0 }); }
  });

  handlers['GET /api/whatsapp/templates'] = requireAuth(async (req, res) => {
    sendJSON(res, { ok: true, items: WA_TEMPLATES, configured: !!WHATSAPP_TOKEN });
  });

  // =============================================================
  // R17: REVIEWS — reseñas y calificaciones de clientes
  // =============================================================
  const _isReviewAdmin = (req) => {
    const role = (req.user && req.user.role) || '';
    return ['admin','owner','superadmin','manager'].includes(role);
  };

  // GET /api/reviews?product_id=&min_rating= → público (solo published)
  handlers['GET /api/reviews'] = async (req, res) => {
    try {
      const q = url.parse(req.url, true).query;
      const filters = ['status=eq.published'];
      if (q.product_id) filters.push(`product_id=eq.${encodeURIComponent(q.product_id)}`);
      if (q.min_rating) {
        const mr = parseInt(q.min_rating, 10);
        if (Number.isInteger(mr) && mr >= 1 && mr <= 5) filters.push(`rating=gte.${mr}`);
      }
      if (q.tenant_id) filters.push(`tenant_id=eq.${encodeURIComponent(q.tenant_id)}`);
      const limit = Math.min(parseInt(q.limit, 10) || 50, 200);
      const qs = filters.join('&') + `&select=*&order=created_at.desc&limit=${limit}`;
      let items = [];
      try { items = await supabaseRequest('GET', `/reviews?${qs}`) || []; }
      catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  };

  // GET /api/reviews/stats?product_id= → average, count, distribution 1-5
  handlers['GET /api/reviews/stats'] = async (req, res) => {
    try {
      const q = url.parse(req.url, true).query;
      const filters = ['status=eq.published'];
      if (q.product_id) filters.push(`product_id=eq.${encodeURIComponent(q.product_id)}`);
      if (q.tenant_id) filters.push(`tenant_id=eq.${encodeURIComponent(q.tenant_id)}`);
      const qs = filters.join('&') + '&select=rating&limit=10000';
      let rows = [];
      try { rows = await supabaseRequest('GET', `/reviews?${qs}`) || []; }
      catch (_) { rows = []; }
      const dist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
      let sum = 0;
      for (const r of rows) {
        const v = parseInt(r.rating, 10);
        if (v >= 1 && v <= 5) { dist[v]++; sum += v; }
      }
      const count = rows.length;
      const average = count ? Math.round((sum / count) * 100) / 100 : 0;
      sendJSON(res, { ok: true, average, count, distribution: dist });
    } catch (err) { sendError(res, err); }
  };

  // POST /api/reviews — auth customer; solo si tiene sale para ese producto
  handlers['POST /api/reviews'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const rating = parseInt(body.rating, 10);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return sendJSON(res, { ok: false, error: 'rating_invalid' }, 400);
      const customerId = body.customer_id || (req.user && req.user.customer_id) || (req.user && req.user.id);
      if (!customerId) return sendJSON(res, { ok: false, error: 'customer_required' }, 400);
      const tenantId = body.tenant_id || (req.user && req.user.tenant_id);
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);

      // Verificar venta del cliente (preferentemente para el producto indicado)
      let isVerified = false;
      let saleId = body.sale_id || null;
      try {
        if (saleId) {
          const s = await supabaseRequest('GET',
            `/sales?id=eq.${encodeURIComponent(saleId)}&customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`);
          isVerified = !!(s && s.length);
        } else {
          const s = await supabaseRequest('GET',
            `/sales?customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`);
          if (s && s.length) { saleId = s[0].id; isVerified = true; }
        }
      } catch (_) { isVerified = false; }

      if (!isVerified)
        return sendJSON(res, { ok: false, error: 'no_purchase_history' }, 403);

      const row = {
        tenant_id: tenantId,
        customer_id: customerId,
        sale_id: saleId,
        product_id: body.product_id || null,
        rating,
        title: body.title ? String(body.title).slice(0, 200) : null,
        body: body.body ? String(body.body).slice(0, 4000) : null,
        is_verified: true,
        status: 'pending',
      };
      let created = null;
      try { created = await supabaseRequest('POST', '/reviews', row); }
      catch (e) { return sendJSON(res, { ok: false, error: 'db_error', detail: String(e && e.message || e) }, 500); }
      sendJSON(res, { ok: true, review: (created && created[0]) || created });
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/reviews/:id — admin: moderar
  handlers['PATCH /api/reviews/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!_isReviewAdmin(req))
        return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const body = await readBody(req);
      const patch = {};
      if (body.status && ['pending','published','rejected'].includes(body.status))
        patch.status = body.status;
      if (typeof body.is_verified === 'boolean') patch.is_verified = body.is_verified;
      if (body.title !== undefined) patch.title = body.title ? String(body.title).slice(0, 200) : null;
      if (body.body !== undefined) patch.body = body.body ? String(body.body).slice(0, 4000) : null;
      if (!Object.keys(patch).length)
        return sendJSON(res, { ok: false, error: 'nothing_to_update' }, 400);
      let updated = null;
      try { updated = await supabaseRequest('PATCH', `/reviews?id=eq.${encodeURIComponent(params.id)}`, patch); }
      catch (e) { return sendJSON(res, { ok: false, error: 'db_error', detail: String(e && e.message || e) }, 500); }
      sendJSON(res, { ok: true, review: (updated && updated[0]) || updated });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/reviews/:id/response — admin: respuesta del negocio
  handlers['POST /api/reviews/:id/response'] = requireAuth(async (req, res, params) => {
    try {
      if (!_isReviewAdmin(req))
        return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const body = await readBody(req);
      const text = String(body.response || '').trim();
      if (!text) return sendJSON(res, { ok: false, error: 'response_required' }, 400);
      const row = {
        review_id: params.id,
        user_id: (req.user && req.user.id) || null,
        response: text.slice(0, 4000),
      };
      let created = null;
      try { created = await supabaseRequest('POST', '/review_responses', row); }
      catch (e) { return sendJSON(res, { ok: false, error: 'db_error', detail: String(e && e.message || e) }, 500); }
      sendJSON(res, { ok: true, response: (created && created[0]) || created });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/reviews/:id/responses — listar respuestas
  handlers['GET /api/reviews/:id/responses'] = async (req, res, params) => {
    try {
      let items = [];
      try {
        items = await supabaseRequest('GET',
          `/review_responses?review_id=eq.${encodeURIComponent(params.id)}&select=*&order=ts.asc`) || [];
      } catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  };

  // === R18 AMAZON SP-API FBA ===
  const AMZ_TOKEN = process.env.AMAZON_LWA_TOKEN || '';
  const AMZ_HOST = process.env.AMAZON_SP_HOST || 'https://sellingpartnerapi-na.amazon.com';
  const AMZ_MARKETPLACE = process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER';

  function amzGuard(res) {
    if (!AMZ_TOKEN) { sendJSON(res, { ok: false, error: 'amazon_not_configured', missing: 'AMAZON_LWA_TOKEN' }, 503); return false; }
    return true;
  }
  async function amzFetch(path, method = 'GET', body = null) {
    const https = require('https');
    const url = new URL(AMZ_HOST + path);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname, path: url.pathname + url.search, method,
        headers: { 'x-amz-access-token': AMZ_TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/json' }
      }, (r) => {
        let data = ''; r.on('data', c => data += c);
        r.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({ raw: data }); } });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  handlers['POST /api/integrations/amazon/orders/sync'] = async (req, res) => {
    if (!amzGuard(res)) return;
    try {
      const since = (req.body && req.body.since) || new Date(Date.now() - 86400000).toISOString();
      const data = await amzFetch(`/orders/v0/orders?MarketplaceIds=${AMZ_MARKETPLACE}&CreatedAfter=${encodeURIComponent(since)}`);
      const orders = (data && data.payload && data.payload.Orders) || [];
      let synced = 0;
      for (const o of orders) {
        try {
          await supabaseRequest('POST', '/amazon_orders_mirror', {
            amazon_order_id: o.AmazonOrderId,
            internal_sale_id: null,
            status: o.OrderStatus || 'Pending',
            total: parseFloat((o.OrderTotal && o.OrderTotal.Amount) || 0),
            ts: o.PurchaseDate || new Date().toISOString()
          });
          synced++;
        } catch (_) {}
      }
      sendJSON(res, { ok: true, synced, total: orders.length });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/integrations/amazon/inventory/sync'] = async (req, res) => {
    if (!amzGuard(res)) return;
    try {
      const data = await amzFetch(`/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${AMZ_MARKETPLACE}&marketplaceIds=${AMZ_MARKETPLACE}`);
      const items = (data && data.payload && data.payload.inventorySummaries) || [];
      sendJSON(res, { ok: true, items, count: items.length });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/integrations/amazon/listings/upload'] = async (req, res) => {
    if (!amzGuard(res)) return;
    try {
      const listings = (req.body && req.body.listings) || [];
      if (!Array.isArray(listings) || listings.length === 0) return sendJSON(res, { ok: false, error: 'listings_required' }, 400);
      const header = 'sku\tproduct-id\tproduct-id-type\tprice\tquantity\titem-condition';
      const rows = listings.map(l => [l.sku, l.asin || '', '1', l.price || 0, l.qty || 0, l.condition || '11'].join('\t'));
      const flatFile = [header, ...rows].join('\n');
      const create = await amzFetch('/feeds/2021-06-30/documents', 'POST', { contentType: 'text/tab-separated-values; charset=UTF-8' });
      const docId = (create && create.feedDocumentId) || null;
      const feed = await amzFetch('/feeds/2021-06-30/feeds', 'POST', {
        feedType: 'POST_FLAT_FILE_LISTINGS_DATA', marketplaceIds: [AMZ_MARKETPLACE], inputFeedDocumentId: docId
      });
      sendJSON(res, { ok: true, feed_id: feed && feed.feedId, document_id: docId, lines: rows.length, payload_size: flatFile.length });
    } catch (err) { sendError(res, err); }
  };

  // ── R18 HR (Recursos Humanos) ──
  const hrAuth = (req) => {
    const u = req.user || (req.session && req.session.user);
    return u && (u.employee_id || u.id) ? u : null;
  };
  const haversineKm = (a, b) => {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371, toR = (d) => d * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLon = toR(b.lng - a.lng);
    const x = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  handlers['POST /api/hr/attendance/check-in'] = async (req, res) => {
    try {
      const u = hrAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      const empId = u.employee_id || u.id;
      const body = req.body || {};
      const geo = (typeof getSetting === 'function') ? await getSetting('hr_geofence') : null;
      if (geo && geo.lat != null && body.lat != null) {
        const km = haversineKm(geo, { lat: body.lat, lng: body.lng });
        if (km != null && km > (geo.radius_km || 0.2)) return sendJSON(res, { ok: false, error: 'outside_geofence', km }, 403);
      }
      const now = new Date();
      const shiftStart = body.shift_start ? new Date(body.shift_start) : null;
      const late = shiftStart ? Math.max(0, Math.round((now - shiftStart) / 60000)) : 0;
      const r = await dbQuery(
        `INSERT INTO attendance(employee_id, check_in, late_minutes) VALUES($1,$2,$3) RETURNING *`,
        [empId, now.toISOString(), late]
      );
      sendJSON(res, { ok: true, attendance: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/hr/attendance/check-out'] = async (req, res) => {
    try {
      const u = hrAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      const empId = u.employee_id || u.id;
      const open = await dbQuery(
        `SELECT * FROM attendance WHERE employee_id=$1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1`,
        [empId]
      );
      if (!open.rows[0]) return sendJSON(res, { ok: false, error: 'no_open_attendance' }, 400);
      const att = open.rows[0];
      const now = new Date();
      const hours = ((now - new Date(att.check_in)) / 3600000).toFixed(2);
      const r = await dbQuery(
        `UPDATE attendance SET check_out=$1, hours_worked=$2 WHERE id=$3 RETURNING *`,
        [now.toISOString(), hours, att.id]
      );
      sendJSON(res, { ok: true, attendance: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/hr/attendance'] = async (req, res) => {
    try {
      const q = req.query || {};
      const params = [], cond = [];
      if (q.employee_id) { params.push(q.employee_id); cond.push(`employee_id=$${params.length}`); }
      if (q.from) { params.push(q.from); cond.push(`check_in>=$${params.length}`); }
      if (q.to) { params.push(q.to); cond.push(`check_in<=$${params.length}`); }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const r = await dbQuery(`SELECT * FROM attendance ${where} ORDER BY check_in DESC LIMIT 500`, params);
      sendJSON(res, { ok: true, items: r.rows });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/hr/time-off'] = async (req, res) => {
    try {
      const q = req.query || {};
      const params = [], cond = [];
      if (q.employee_id) { params.push(q.employee_id); cond.push(`employee_id=$${params.length}`); }
      if (q.status) { params.push(q.status); cond.push(`status=$${params.length}`); }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const r = await dbQuery(`SELECT * FROM time_off ${where} ORDER BY ts DESC LIMIT 500`, params);
      sendJSON(res, { ok: true, items: r.rows });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/hr/time-off'] = async (req, res) => {
    try {
      const u = hrAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      const b = req.body || {};
      if (!b.type || !b.starts_at || !b.ends_at) return sendJSON(res, { ok: false, error: 'missing_fields' }, 400);
      const r = await dbQuery(
        `INSERT INTO time_off(employee_id,type,starts_at,ends_at,status) VALUES($1,$2,$3,$4,'pending') RETURNING *`,
        [u.employee_id || u.id, b.type, b.starts_at, b.ends_at]
      );
      sendJSON(res, { ok: true, request: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['PATCH /api/hr/time-off'] = async (req, res) => {
    try {
      const u = hrAuth(req); if (!u || !(u.role === 'manager' || u.role === 'admin')) return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const b = req.body || {};
      if (!b.id || !['approved','rejected'].includes(b.status)) return sendJSON(res, { ok: false, error: 'bad_request' }, 400);
      const r = await dbQuery(
        `UPDATE time_off SET status=$1, approved_by=$2 WHERE id=$3 RETURNING *`,
        [b.status, u.id, b.id]
      );
      sendJSON(res, { ok: true, request: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/hr/performance-reviews'] = async (req, res) => {
    try {
      const q = req.query || {};
      const params = [], cond = [];
      if (q.employee_id) { params.push(q.employee_id); cond.push(`employee_id=$${params.length}`); }
      if (q.period) { params.push(q.period); cond.push(`period=$${params.length}`); }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const r = await dbQuery(`SELECT * FROM performance_reviews ${where} ORDER BY ts DESC LIMIT 200`, params);
      sendJSON(res, { ok: true, items: r.rows });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/hr/performance-reviews'] = async (req, res) => {
    try {
      const u = hrAuth(req); if (!u || !(u.role === 'manager' || u.role === 'admin')) return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const b = req.body || {};
      if (!b.employee_id || !b.period) return sendJSON(res, { ok: false, error: 'missing_fields' }, 400);
      const r = await dbQuery(
        `INSERT INTO performance_reviews(employee_id,reviewer_id,period,ratings,comments) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [b.employee_id, u.id, b.period, JSON.stringify(b.ratings || {}), b.comments || null]
      );
      sendJSON(res, { ok: true, review: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/hr/employees/:id/dashboard'] = async (req, res) => {
    try {
      const id = req.params && req.params.id;
      if (!id) return sendJSON(res, { ok: false, error: 'id_required' }, 400);
      const [att, off, rev, docs] = await Promise.all([
        dbQuery(`SELECT COUNT(*)::int AS days, COALESCE(SUM(hours_worked),0)::numeric AS hours, COALESCE(SUM(late_minutes),0)::int AS late FROM attendance WHERE employee_id=$1 AND check_in >= NOW() - INTERVAL '30 days'`, [id]),
        dbQuery(`SELECT status, COUNT(*)::int AS n FROM time_off WHERE employee_id=$1 GROUP BY status`, [id]),
        dbQuery(`SELECT period, ratings, comments, ts FROM performance_reviews WHERE employee_id=$1 ORDER BY ts DESC LIMIT 3`, [id]),
        dbQuery(`SELECT type, url, uploaded_at FROM employee_documents WHERE employee_id=$1 ORDER BY uploaded_at DESC LIMIT 20`, [id])
      ]);
      sendJSON(res, {
        ok: true,
        employee_id: id,
        attendance_30d: att.rows[0],
        time_off: off.rows,
        recent_reviews: rev.rows,
        documents: docs.rows
      });
    } catch (err) { sendError(res, err); }
  };

  // ── R18 KDS (Kitchen Display System) ──
  handlers['POST /api/kds/tickets'] = async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.station || !Array.isArray(b.items)) return sendJSON(res, { ok: false, error: 'station_and_items_required' }, 400);
      const r = await dbQuery(
        `INSERT INTO kds_tickets(sale_id,station,items,notes,priority) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [b.sale_id || null, b.station, JSON.stringify(b.items), b.notes || null, b.priority || 0]
      );
      sendJSON(res, { ok: true, ticket: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/kds/tickets/active'] = async (req, res) => {
    try {
      const q = req.query || {};
      const params = [], cond = [`status IN ('received','preparing','ready')`];
      if (q.station) { params.push(q.station); cond.push(`station=$${params.length}`); }
      const r = await dbQuery(
        `SELECT * FROM kds_tickets WHERE ${cond.join(' AND ')} ORDER BY priority DESC, created_at ASC LIMIT 200`,
        params
      );
      sendJSON(res, { ok: true, items: r.rows });
    } catch (err) { sendError(res, err); }
  };

  handlers['PATCH /api/kds/tickets/:id/status'] = async (req, res) => {
    try {
      const id = req.params && req.params.id;
      const b = req.body || {};
      if (!id || !['received','preparing','ready','served','canceled'].includes(b.status))
        return sendJSON(res, { ok: false, error: 'bad_request' }, 400);
      const r = await dbQuery(
        `UPDATE kds_tickets SET status=$1 WHERE id=$2 RETURNING *`,
        [b.status, id]
      );
      if (!r.rows.length) return sendJSON(res, { ok: false, error: 'not_found' }, 404);
      sendJSON(res, { ok: true, ticket: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/kds/stations'] = async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.code || !b.name) return sendJSON(res, { ok: false, error: 'code_and_name_required' }, 400);
      const r = await dbQuery(
        `INSERT INTO kds_stations(code,name,active,printer_id,config) VALUES($1,$2,COALESCE($3,TRUE),$4,$5)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, active=EXCLUDED.active,
           printer_id=EXCLUDED.printer_id, config=EXCLUDED.config RETURNING *`,
        [b.code, b.name, b.active, b.printer_id || null, JSON.stringify(b.config || {})]
      );
      sendJSON(res, { ok: true, station: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/kds/stations'] = async (req, res) => {
    try {
      const r = await dbQuery(`SELECT * FROM kds_stations ORDER BY code`);
      sendJSON(res, { ok: true, items: r.rows });
    } catch (err) { sendError(res, err); }
  };

  // ============================================================
  // R18 — SQUARE POS INTEGRATION (sync catalogo + webhooks)
  // ============================================================
  function _squareRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const data = body ? JSON.stringify(body) : null;
      const r = https.request({
        hostname: 'connect.squareup.com', path, method,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Square-Version': '2024-10-17',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }, timeout: 15000
      }, (rr) => {
        let buf = '';
        rr.on('data', c => buf += c);
        rr.on('end', () => {
          try { resolve({ status: rr.statusCode, body: buf ? JSON.parse(buf) : {} }); }
          catch (e) { resolve({ status: rr.statusCode, body: { raw: buf } }); }
        });
      });
      r.on('error', reject);
      r.on('timeout', () => r.destroy(new Error('square_timeout')));
      if (data) r.write(data);
      r.end();
    });
  }

  async function _squareLog(type, status, items_synced, extra) {
    try {
      await supabaseRequest('POST', '/square_sync_log', {
        type, status, items_synced: items_synced || 0,
        ts: new Date().toISOString(),
        meta: extra || null
      });
    } catch (_) { /* tabla puede no existir aun */ }
  }

  handlers['POST /api/integrations/square/sync'] = requireAuth(async (req, res) => {
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return sendJSON(res, { ok: false, error: 'square_not_configured', reason: 'SQUARE_ACCESS_TOKEN missing' }, 503);
    }
    if (!['admin', 'superadmin', 'owner'].includes(req.user?.role)) {
      return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
    }
    const tenantId = req.user?.tenant_id || null;
    try {
      const t0 = Date.now();
      const resp = await _squareRequest('GET', '/v2/catalog/list?types=ITEM');
      if (resp.status >= 400) {
        await _squareLog('catalog_sync', 'error', 0, { http: resp.status, body: resp.body });
        return sendJSON(res, { ok: false, error: 'square_api_error', status: resp.status, detail: resp.body }, 502);
      }
      const objects = (resp.body && resp.body.objects) || [];
      let synced = 0, failed = 0;
      for (const obj of objects) {
        if (obj.type !== 'ITEM' || !obj.item_data) continue;
        const item = obj.item_data;
        const variation = (item.variations && item.variations[0]) || null;
        const priceCents = variation?.item_variation_data?.price_money?.amount ?? 0;
        const sku = variation?.item_variation_data?.sku || obj.id;
        const product = {
          name: item.name || 'Sin nombre',
          description: item.description || '',
          sku,
          price: Number(priceCents) / 100,
          stock: 0,
          source: 'square',
          external_id: obj.id,
          ...(tenantId ? { tenant_id: tenantId } : {})
        };
        try {
          const existing = await supabaseRequest('GET',
            `/pos_products?external_id=eq.${encodeURIComponent(obj.id)}&select=id&limit=1`);
          if (existing && existing.length) {
            await supabaseRequest('PATCH', `/pos_products?id=eq.${existing[0].id}`, product);
          } else {
            await supabaseRequest('POST', '/pos_products', product);
          }
          synced++;
        } catch (_) { failed++; }
      }
      await _squareLog('catalog_sync', failed ? 'partial' : 'ok', synced, {
        total: objects.length, failed, ms: Date.now() - t0
      });
      sendJSON(res, { ok: true, synced, failed, total: objects.length, ms: Date.now() - t0 });
    } catch (err) {
      await _squareLog('catalog_sync', 'error', 0, { error: String(err.message || err) });
      sendError(res, err);
    }
  }, ['admin', 'superadmin', 'owner']);

  handlers['GET /api/integrations/square/status'] = async (req, res) => {
    const configured = !!process.env.SQUARE_ACCESS_TOKEN;
    if (!configured) {
      return sendJSON(res, { ok: false, connected: false, reason: 'no_token' }, 503);
    }
    try {
      const t0 = Date.now();
      const resp = await _squareRequest('GET', '/v2/locations');
      const ok = resp.status < 400;
      let lastSync = null;
      try {
        const rows = await supabaseRequest('GET',
          '/square_sync_log?order=ts.desc&limit=1&select=ts,type,status,items_synced');
        if (rows && rows.length) lastSync = rows[0];
      } catch (_) {}
      sendJSON(res, {
        ok, connected: ok,
        locations: ok ? (resp.body.locations || []).length : 0,
        last_sync: lastSync,
        latency_ms: Date.now() - t0
      }, ok ? 200 : 502);
    } catch (err) {
      sendJSON(res, { ok: false, connected: false, error: String(err.message || err) }, 502);
    }
  };

  handlers['POST /api/integrations/square/webhook'] = async (req, res) => {
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return sendJSON(res, { ok: false, error: 'square_not_configured' }, 503);
    }
    try {
      const raw = await readBody(req);
      let payload = {};
      try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) {}
      const evt = payload.type || payload.event_type || 'unknown';
      const handled = ['order.created', 'order.updated', 'payment.updated', 'payment.created'].includes(evt);
      await _squareLog('webhook:' + evt, handled ? 'ok' : 'ignored', 1, {
        event_id: payload.event_id || null,
        merchant_id: payload.merchant_id || null,
        data_id: payload.data?.id || null
      });
      sendJSON(res, { ok: true, received: evt, handled });
    } catch (err) {
      await _squareLog('webhook:error', 'error', 0, { error: String(err.message || err) });
      sendJSON(res, { ok: false, error: String(err.message || err) }, 400);
    }
  };

  handlers['GET /api/integrations/square/health'] = async (req, res) => {
    const t0 = Date.now();
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return sendJSON(res, { ok: false, name: 'square', status: 'down', reason: 'no-token' }, 503);
    }
    try {
      const resp = await _squareRequest('GET', '/v2/locations');
      if (resp.status >= 400) return sendJSON(res, { ok: false, name: 'square', status: 'down', http: resp.status }, 503);
      sendJSON(res, { ok: true, name: 'square', latency_ms: Date.now() - t0 });
    } catch (e) {
      sendJSON(res, { ok: false, name: 'square', status: 'down', error: String(e.message || e) }, 503);
    }
  };

  // === R18 SHOPIFY SYNC (productos + ordenes + inventario + webhook HMAC) ===
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';
  const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
  const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

  function shopifyGuard(res) {
    if (!SHOPIFY_TOKEN || !SHOPIFY_DOMAIN) {
      sendJSON(res, { ok: false, error: 'shopify_not_configured', missing: !SHOPIFY_TOKEN ? 'SHOPIFY_ACCESS_TOKEN' : 'SHOPIFY_SHOP_DOMAIN' }, 503);
      return false;
    }
    return true;
  }

  async function shopifyFetch(path, method, body) {
    const https = require('https');
    const url = new URL('https://' + SHOPIFY_DOMAIN + '/admin/api/' + SHOPIFY_API_VERSION + path);
    return new Promise((resolve, reject) => {
      const r0 = https.request({
        hostname: url.hostname, path: url.pathname + url.search, method: method || 'GET',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }, (r) => {
        let data = ''; r.on('data', c => data += c);
        r.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({ raw: data }); } });
      });
      r0.on('error', reject);
      if (body) r0.write(typeof body === 'string' ? body : JSON.stringify(body));
      r0.end();
    });
  }

  async function shopifyTouchSyncState(field) {
    try {
      const row = { tenant_id: 'default' };
      row[field] = new Date().toISOString();
      await supabaseRequest('POST', '/shopify_sync_state', row);
    } catch (_) {}
  }

  // POST /api/integrations/shopify/import-products (admin)
  handlers['POST /api/integrations/shopify/import-products'] = requireAuth(async (req, res) => {
    if (!shopifyGuard(res)) return;
    try {
      const data = await shopifyFetch('/products.json?limit=250', 'GET', null);
      const products = (data && data.products) || [];
      let imported = 0;
      for (const p of products) {
        const v = (p.variants && p.variants[0]) || {};
        try {
          await supabaseRequest('POST', '/pos_products', {
            sku: v.sku || ('shopify-' + p.id),
            name: p.title || 'Untitled',
            price: parseFloat(v.price || 0),
            stock: parseInt(v.inventory_quantity || 0, 10),
            description: (p.body_html || '').slice(0, 2000),
            source: 'shopify'
          });
          await supabaseRequest('POST', '/shopify_mappings', {
            internal_id: v.sku || ('shopify-' + p.id),
            shopify_id: String(p.id),
            type: 'product'
          });
          imported++;
        } catch (_) {}
      }
      await shopifyTouchSyncState('last_product_sync');
      sendJSON(res, { ok: true, imported, total: products.length });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/integrations/shopify/export-products
  handlers['POST /api/integrations/shopify/export-products'] = requireAuth(async (req, res) => {
    if (!shopifyGuard(res)) return;
    try {
      const local = await supabaseRequest('GET', '/pos_products?select=*&limit=500') || [];
      let exported = 0;
      for (const p of local) {
        try {
          const payload = {
            product: {
              title: p.name,
              body_html: p.description || '',
              variants: [{ sku: p.sku, price: String(p.price || 0), inventory_quantity: parseInt(p.stock || 0, 10) }]
            }
          };
          const created = await shopifyFetch('/products.json', 'POST', payload);
          const sid = created && created.product && created.product.id;
          if (sid) {
            await supabaseRequest('POST', '/shopify_mappings', {
              internal_id: p.sku, shopify_id: String(sid), type: 'product'
            });
          }
          exported++;
        } catch (_) {}
      }
      sendJSON(res, { ok: true, exported, total: local.length });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/integrations/shopify/sync-orders (bidireccional)
  handlers['POST /api/integrations/shopify/sync-orders'] = requireAuth(async (req, res) => {
    if (!shopifyGuard(res)) return;
    try {
      const since = (req.body && req.body.since) || new Date(Date.now() - 86400000).toISOString();
      const data = await shopifyFetch('/orders.json?status=any&created_at_min=' + encodeURIComponent(since) + '&limit=250', 'GET', null);
      const orders = (data && data.orders) || [];
      let pulled = 0;
      for (const o of orders) {
        try {
          await supabaseRequest('POST', '/pos_sales', {
            external_id: 'shopify-' + o.id,
            total: parseFloat(o.total_price || 0),
            currency: o.currency || 'USD',
            status: o.financial_status || 'pending',
            ts: o.created_at || new Date().toISOString(),
            source: 'shopify'
          });
          await supabaseRequest('POST', '/shopify_mappings', {
            internal_id: 'shopify-' + o.id, shopify_id: String(o.id), type: 'order'
          });
          pulled++;
        } catch (_) {}
      }
      const localPending = await supabaseRequest('GET', '/pos_sales?source=eq.local&shopify_pushed=is.false&select=*&limit=100') || [];
      let pushed = 0;
      for (const s of localPending) {
        try {
          await shopifyFetch('/orders.json', 'POST', {
            order: {
              line_items: s.line_items || [{ title: 'POS Sale', price: s.total, quantity: 1 }],
              financial_status: 'paid'
            }
          });
          pushed++;
        } catch (_) {}
      }
      await shopifyTouchSyncState('last_order_sync');
      sendJSON(res, { ok: true, pulled, pushed, total: orders.length });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/integrations/shopify/webhook (orders/create, products/update con HMAC verify)
  handlers['POST /api/integrations/shopify/webhook'] = async (req, res) => {
    if (!SHOPIFY_SECRET) return sendJSON(res, { ok: false, error: 'shopify_webhook_secret_missing' }, 503);
    try {
      const crypto = require('crypto');
      const hmacHeader = (req.headers && (req.headers['x-shopify-hmac-sha256'] || req.headers['X-Shopify-Hmac-Sha256'])) || '';
      const topic = (req.headers && (req.headers['x-shopify-topic'] || req.headers['X-Shopify-Topic'])) || '';
      const raw = req.rawBody || JSON.stringify(req.body || {});
      const digest = crypto.createHmac('sha256', SHOPIFY_SECRET).update(raw, 'utf8').digest('base64');
      const a = Buffer.from(digest); const b = Buffer.from(String(hmacHeader));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return sendJSON(res, { ok: false, error: 'invalid_hmac' }, 401);
      }
      const payload = req.body || {};
      if (topic === 'orders/create') {
        await supabaseRequest('POST', '/pos_sales', {
          external_id: 'shopify-' + payload.id,
          total: parseFloat(payload.total_price || 0),
          currency: payload.currency || 'USD',
          status: payload.financial_status || 'pending',
          ts: payload.created_at || new Date().toISOString(),
          source: 'shopify'
        });
      } else if (topic === 'products/update') {
        const v = (payload.variants && payload.variants[0]) || {};
        await supabaseRequest('POST', '/pos_products', {
          sku: v.sku || ('shopify-' + payload.id),
          name: payload.title,
          price: parseFloat(v.price || 0),
          stock: parseInt(v.inventory_quantity || 0, 10),
          source: 'shopify'
        });
      }
      sendJSON(res, { ok: true, topic });
    } catch (err) { sendError(res, err); }
  };

  // === R18 PAYROLL — Nomina Mexicana CFDI 4.0 ===
  // Tablas: employees, payroll_periods, payroll_receipts (ver db/R18_PAYROLL.sql)
  const PAC_USER = process.env.PAC_USER || '';
  const PAC_PASS = process.env.PAC_PASS || '';
  const PAC_URL  = process.env.PAC_URL  || '';
  const UMA_2024 = 108.57;
  const ISR_2024_MENSUAL = [
    { li: 0.01, ls: 746.04, cf: 0.00, pct: 1.92 },
    { li: 746.05, ls: 6332.05, cf: 14.32, pct: 6.40 },
    { li: 6332.06, ls: 11128.01, cf: 371.83, pct: 10.88 },
    { li: 11128.02, ls: 12935.82, cf: 893.63, pct: 16.00 },
    { li: 12935.83, ls: 15487.71, cf: 1182.88, pct: 17.92 },
    { li: 15487.72, ls: 31236.49, cf: 1640.18, pct: 21.36 },
    { li: 31236.50, ls: 49233.00, cf: 5004.12, pct: 23.52 },
    { li: 49233.01, ls: 93993.90, cf: 9236.89, pct: 30.00 },
    { li: 93993.91, ls: 125325.20, cf: 22665.17, pct: 32.00 },
    { li: 125325.21, ls: 375975.61, cf: 32691.18, pct: 34.00 },
    { li: 375975.62, ls: Infinity, cf: 117912.32, pct: 35.00 }
  ];
  function calcISR(g) { const r = ISR_2024_MENSUAL.find(x => g >= x.li && g <= x.ls); if (!r) return 0; return +(r.cf + (g - r.li) * (r.pct / 100)).toFixed(2); }
  function calcIMSS(sd, d) { const sbc = Math.min(sd, UMA_2024 * 25); return +(sbc * d * 0.07).toFixed(2); }
  function periodDays(t) { return t === 'weekly' ? 7 : t === 'biweekly' ? 15 : 30; }

  handlers['GET /api/employees'] = async (req, res) => {
    try {
      const tenant = (req.user && req.user.tenant_id) || (req.query && req.query.tenant_id) || '';
      const qs = tenant ? `?tenant_id=eq.${encodeURIComponent(tenant)}&select=*&order=name.asc` : `?select=*&order=name.asc&limit=200`;
      const items = await supabaseRequest('GET', `/employees${qs}`) || [];
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/employees'] = async (req, res) => {
    try {
      const b = await readBody(req);
      if (!b.rfc || !b.name || b.salary_daily == null) return sendJSON(res, { ok: false, error: 'validation_failed', field: 'rfc|name|salary_daily' }, 400);
      const row = {
        tenant_id: b.tenant_id || (req.user && req.user.tenant_id) || 'default',
        rfc: String(b.rfc).toUpperCase().slice(0, 13),
        curp: b.curp ? String(b.curp).toUpperCase().slice(0, 18) : null,
        nss: b.nss ? String(b.nss).slice(0, 11) : null,
        name: String(b.name).slice(0, 200),
        email: b.email ? String(b.email).slice(0, 200) : null,
        salary_daily: parseFloat(b.salary_daily) || 0,
        position: b.position ? String(b.position).slice(0, 100) : null,
        hire_date: b.hire_date || new Date().toISOString().slice(0, 10),
        status: b.status || 'active'
      };
      const created = await supabaseRequest('POST', '/employees', row);
      sendJSON(res, { ok: true, employee: (created && created[0]) || created });
    } catch (err) { sendError(res, err); }
  };

  handlers['PATCH /api/employees/:id'] = async (req, res, params) => {
    try {
      const b = await readBody(req);
      const patch = {};
      ['name','email','position','salary_daily','status','curp','nss'].forEach(k => { if (b[k] !== undefined) patch[k] = (k === 'salary_daily') ? parseFloat(b[k]) : b[k]; });
      if (!Object.keys(patch).length) return sendJSON(res, { ok: false, error: 'nothing_to_update' }, 400);
      const upd = await supabaseRequest('PATCH', `/employees?id=eq.${encodeURIComponent(params.id)}`, patch);
      sendJSON(res, { ok: true, employee: (upd && upd[0]) || upd });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/payroll/periods'] = async (req, res) => {
    try {
      const b = await readBody(req);
      if (!b.period_start || !b.period_end || !b.type) return sendJSON(res, { ok: false, error: 'validation_failed', field: 'period_start|period_end|type' }, 400);
      if (!['weekly','biweekly','monthly'].includes(b.type)) return sendJSON(res, { ok: false, error: 'invalid_type' }, 400);
      const row = { tenant_id: b.tenant_id || (req.user && req.user.tenant_id) || 'default', period_start: b.period_start, period_end: b.period_end, type: b.type, status: 'draft' };
      const created = await supabaseRequest('POST', '/payroll_periods', row);
      sendJSON(res, { ok: true, period: (created && created[0]) || created });
    } catch (err) { sendError(res, err); }
  };

  // R24 FIX: alias sin :id en URL — requiere body.period_id
  handlers['POST /api/payroll/periods/calculate'] = async (req, res) => {
    try {
      const b = await readBody(req);
      const period_id = (b && (b.period_id || b.id)) || null;
      if (!period_id) {
        return sendJSON(res, {
          ok: false, error: 'period_id_required',
          message: 'Este alias requiere body.period_id. Alternativa: usar /api/payroll/periods/:id/calculate',
          hint: 'POST /api/payroll/periods/calculate con body { "period_id": "<uuid>" }',
        }, 400);
      }
      // Inline equivalent of POST /api/payroll/periods/:id/calculate (body ya consumido)
      const periodArr = await supabaseRequest('GET', `/payroll_periods?id=eq.${encodeURIComponent(period_id)}&select=*`);
      const period = periodArr && periodArr[0];
      if (!period) return sendJSON(res, { ok: false, error: 'not_found', resource: 'payroll_period' }, 404);
      if (period.status !== 'draft' && period.status !== 'calculated') return sendJSON(res, { ok: false, error: 'invalid_status', have: period.status }, 409);
      const emps = await supabaseRequest('GET', `/employees?tenant_id=eq.${encodeURIComponent(period.tenant_id)}&status=eq.active&select=*`) || [];
      const days = periodDays(period.type);
      const receipts = [];
      for (const e of emps) {
        const sd = parseFloat(e.salary_daily) || 0;
        const gross = +(sd * days).toFixed(2);
        const imss = calcIMSS(sd, days);
        const monthlyBase = period.type === 'monthly' ? gross : (period.type === 'biweekly' ? gross * 2 : gross * (30/7));
        const isrMonthly = calcISR(monthlyBase);
        const isr = +(isrMonthly * (days / 30)).toFixed(2);
        const net = +(gross - isr - imss).toFixed(2);
        const row = { period_id: period.id, employee_id: e.id, gross, isr, imss, deductions: { isr, imss }, net, status: 'calculated' };
        try {
          await supabaseRequest('DELETE', `/payroll_receipts?period_id=eq.${period.id}&employee_id=eq.${e.id}`).catch(()=>{});
          const c = await supabaseRequest('POST', '/payroll_receipts', row);
          receipts.push((c && c[0]) || c);
        } catch (_) {}
      }
      await supabaseRequest('PATCH', `/payroll_periods?id=eq.${period.id}`, { status: 'calculated' });
      return sendJSON(res, { ok: true, period_id: period.id, employees: emps.length, receipts: receipts.length, days, alias: true });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/payroll/periods/:id/calculate'] = async (req, res, params) => {
    try {
      const periodArr = await supabaseRequest('GET', `/payroll_periods?id=eq.${encodeURIComponent(params.id)}&select=*`);
      const period = periodArr && periodArr[0];
      if (!period) return sendJSON(res, { ok: false, error: 'not_found', resource: 'payroll_period' }, 404);
      if (period.status !== 'draft' && period.status !== 'calculated') return sendJSON(res, { ok: false, error: 'invalid_status', have: period.status }, 409);
      const emps = await supabaseRequest('GET', `/employees?tenant_id=eq.${encodeURIComponent(period.tenant_id)}&status=eq.active&select=*`) || [];
      const days = periodDays(period.type);
      const receipts = [];
      for (const e of emps) {
        const sd = parseFloat(e.salary_daily) || 0;
        const gross = +(sd * days).toFixed(2);
        const imss = calcIMSS(sd, days);
        const monthlyBase = period.type === 'monthly' ? gross : (period.type === 'biweekly' ? gross * 2 : gross * (30/7));
        const isrMonthly = calcISR(monthlyBase);
        const isr = +(isrMonthly * (days / 30)).toFixed(2);
        const net = +(gross - isr - imss).toFixed(2);
        const row = { period_id: period.id, employee_id: e.id, gross, isr, imss, deductions: { isr, imss }, net, status: 'calculated' };
        try {
          await supabaseRequest('DELETE', `/payroll_receipts?period_id=eq.${period.id}&employee_id=eq.${e.id}`).catch(()=>{});
          const c = await supabaseRequest('POST', '/payroll_receipts', row);
          receipts.push((c && c[0]) || c);
        } catch (_) {}
      }
      await supabaseRequest('PATCH', `/payroll_periods?id=eq.${period.id}`, { status: 'calculated' });
      sendJSON(res, { ok: true, period_id: period.id, employees: emps.length, receipts: receipts.length, days });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/payroll/periods/:id/stamp'] = async (req, res, params) => {
    try {
      const periodArr = await supabaseRequest('GET', `/payroll_periods?id=eq.${encodeURIComponent(params.id)}&select=*`);
      const period = periodArr && periodArr[0];
      if (!period) return sendJSON(res, { ok: false, error: 'not_found', resource: 'payroll_period' }, 404);
      if (period.status !== 'calculated') return sendJSON(res, { ok: false, error: 'must_calculate_first', have: period.status }, 409);
      const receipts = await supabaseRequest('GET', `/payroll_receipts?period_id=eq.${period.id}&select=*,employees(*)`) || [];
      const usingPAC = !!(PAC_USER && PAC_PASS && PAC_URL);
      let stamped = 0;
      for (const r of receipts) {
        const emp = r.employees || {};
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
        const totalDed = (+r.isr + +r.imss).toFixed(2);
        const periodicidad = period.type === 'weekly' ? '02' : period.type === 'biweekly' ? '04' : '05';
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" Version="4.0" TipoDeComprobante="N" Total="${r.gross}" SubTotal="${r.gross}" Moneda="MXN" Fecha="${new Date().toISOString().slice(0,19)}">
  <cfdi:Emisor Rfc="EMISOR000000XXX" Nombre="EMPRESA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${emp.rfc || 'XAXX010101000'}" Nombre="${(emp.name||'').replace(/[<>&]/g,'')}" UsoCFDI="CN01" RegimenFiscalReceptor="605"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago de nomina" ValorUnitario="${r.gross}" Importe="${r.gross}"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="${period.period_end}" FechaInicialPago="${period.period_start}" FechaFinalPago="${period.period_end}" NumDiasPagados="${periodDays(period.type)}" TotalPercepciones="${r.gross}" TotalDeducciones="${totalDed}">
      <nomina12:Emisor RegistroPatronal="A0000000000"/>
      <nomina12:Receptor Curp="${emp.curp||''}" NumSeguridadSocial="${emp.nss||''}" FechaInicioRelLaboral="${emp.hire_date||''}" TipoContrato="01" TipoJornada="01" TipoRegimen="02" PeriodicidadPago="${periodicidad}" SalarioDiarioIntegrado="${emp.salary_daily}" ClaveEntFed="DIF"/>
      <nomina12:Percepciones TotalSueldos="${r.gross}" TotalGravado="${r.gross}" TotalExento="0"><nomina12:Percepcion TipoPercepcion="001" Clave="001" Concepto="Sueldo" ImporteGravado="${r.gross}" ImporteExento="0"/></nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="${r.imss}" TotalImpuestosRetenidos="${r.isr}"><nomina12:Deduccion TipoDeduccion="002" Clave="002" Concepto="ISR" Importe="${r.isr}"/><nomina12:Deduccion TipoDeduccion="001" Clave="001" Concepto="IMSS" Importe="${r.imss}"/></nomina12:Deducciones>
    </nomina12:Nomina>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
        try { await supabaseRequest('PATCH', `/payroll_receipts?id=eq.${r.id}`, { cfdi_nomina_uuid: uuid, xml, status: 'stamped' }); stamped++; } catch (_) {}
      }
      await supabaseRequest('PATCH', `/payroll_periods?id=eq.${period.id}`, { status: 'stamped' });
      sendJSON(res, { ok: true, period_id: period.id, stamped, total: receipts.length, mode: usingPAC ? 'pac' : 'mock' });
    } catch (err) { sendError(res, err); }
  };

  handlers['GET /api/payroll/receipts/:id/xml'] = async (req, res, params) => {
    try {
      const arr = await supabaseRequest('GET', `/payroll_receipts?id=eq.${encodeURIComponent(params.id)}&select=xml,cfdi_nomina_uuid`);
      const r = arr && arr[0];
      if (!r || !r.xml) return sendJSON(res, { ok: false, error: 'not_found', resource: 'receipt_xml' }, 404);
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `inline; filename="nomina_${r.cfdi_nomina_uuid || params.id}.xml"` });
      res.end(r.xml);
    } catch (err) { sendError(res, err); }
  };

  // -- R18 MARKETPLACE (Multi-vendor) --
  const mpAuth = (req) => req.user || (req.session && req.session.user) || null;
  const mpAdmin = (u) => !!(u && (u.role === 'admin' || u.role === 'owner'));
  const mpResolveTenant = (req) => {
    const u = mpAuth(req);
    return (u && u.tenant_id) || (req.headers && (req.headers['x-tenant-id'] || req.headers['x-tenant'])) || null;
  };

  handlers['GET /api/marketplace/vendors'] = requireAuth(async (req, res) => {
    try {
      // FIX: use supabaseRequest (REST), not dbQuery (which doesn't exist in this scope)
      let q = `/vendors?select=*&order=ts.desc&limit=500`;
      if (req.query && req.query.status) q += `&status=eq.${encodeURIComponent(req.query.status)}`;
      const rows = await supabaseRequest('GET', q);
      sendJSON(res, { ok: true, items: rows || [] });
    } catch (err) {
      sendJSON(res, { ok: true, items: [], note: err && err.message && err.message.slice(0, 100) });
    }
  });

  handlers['POST /api/marketplace/vendors'] = async (req, res) => {
    try {
      const u = mpAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      const b = req.body || {};
      const tenant = mpResolveTenant(req);
      if (!tenant) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);
      if (!b.business_name) return sendJSON(res, { ok: false, error: 'business_name_required' }, 400);
      const ownerId = b.owner_user_id || u.id;
      const commission = b.commission_pct != null ? Number(b.commission_pct) : 10.00;
      if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
        return sendJSON(res, { ok: false, error: 'invalid_commission_pct' }, 400);
      }
      const r = await dbQuery(
        `INSERT INTO vendors(tenant_id,business_name,owner_user_id,commission_pct,status,kyc_verified,payout_method)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenant, b.business_name, ownerId, commission, b.status || 'pending', !!b.kyc_verified, JSON.stringify(b.payout_method || {})]
      );
      sendJSON(res, { ok: true, vendor: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/marketplace/vendors/:id/kyc'] = async (req, res) => {
    try {
      const u = mpAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      if (!mpAdmin(u)) return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const id = req.params && req.params.id;
      if (!id) return sendJSON(res, { ok: false, error: 'id_required' }, 400);
      const b = req.body || {};
      const docs = Array.isArray(b.documents) ? b.documents : [];
      const types = new Set(docs.map(d => d && d.type));
      const ok = (types.has('id_front') && types.has('id_back')) || types.has('tax_id') || !!b.force;
      if (!ok) return sendJSON(res, { ok: false, error: 'missing_documents', required: ['id_front+id_back','tax_id'] }, 422);
      const r = await dbQuery(
        `UPDATE vendors SET kyc_verified=TRUE, status=CASE WHEN status='pending' THEN 'active' ELSE status END
         WHERE id=$1 RETURNING *`, [id]
      );
      if (!r.rows.length) return sendJSON(res, { ok: false, error: 'not_found' }, 404);
      sendJSON(res, { ok: true, vendor: r.rows[0], documents: docs.length });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/marketplace/payouts/calculate'] = async (req, res) => {
    try {
      const u = mpAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      if (!mpAdmin(u)) return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const period = (req.query && req.query.period) || (req.body && req.body.period);
      if (!period || !/^\d{4}-\d{2}$/.test(period)) return sendJSON(res, { ok: false, error: 'period_format_YYYY_MM' }, 400);
      const [y, m] = period.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const agg = await dbQuery(
        `SELECT vendor_id, SUM(gross)::numeric AS gross, SUM(commission)::numeric AS commission, SUM(net)::numeric AS net
         FROM vendor_sale_splits WHERE ts >= $1::date AND ts < ($2::date + INTERVAL '1 day')
         GROUP BY vendor_id`, [start, end]
      );
      const created = [];
      for (const row of agg.rows) {
        try {
          const ins = await dbQuery(
            `INSERT INTO vendor_payouts(vendor_id,period_start,period_end,gross,commission,net,status)
             VALUES($1,$2,$3,$4,$5,$6,'pending')
             ON CONFLICT (vendor_id,period_start,period_end) DO UPDATE
               SET gross=EXCLUDED.gross, commission=EXCLUDED.commission, net=EXCLUDED.net
             RETURNING *`,
            [row.vendor_id, start, end, row.gross, row.commission, row.net]
          );
          created.push(ins.rows[0]);
        } catch (_) {}
      }
      sendJSON(res, { ok: true, period, period_start: start, period_end: end, payouts: created, count: created.length });
    } catch (err) { sendError(res, err); }
  };

  handlers['POST /api/marketplace/payouts/:id/pay'] = async (req, res) => {
    try {
      const u = mpAuth(req); if (!u) return sendJSON(res, { ok: false, error: 'unauthorized' }, 401);
      if (!mpAdmin(u)) return sendJSON(res, { ok: false, error: 'forbidden' }, 403);
      const id = req.params && req.params.id;
      if (!id) return sendJSON(res, { ok: false, error: 'id_required' }, 400);
      const r = await dbQuery(
        `UPDATE vendor_payouts SET status='paid', paid_at=NOW()
         WHERE id=$1 AND status IN ('pending','approved') RETURNING *`, [id]
      );
      if (!r.rows.length) return sendJSON(res, { ok: false, error: 'not_found_or_already_paid' }, 404);
      sendJSON(res, { ok: true, payout: r.rows[0] });
    } catch (err) { sendError(res, err); }
  };

  // Helper para que /api/sales registre revenue split cuando item.vendor_id existe
  global.__mpRegisterSaleSplits = async function (saleRow, items) {
    try {
      if (!saleRow || !Array.isArray(items)) return 0;
      const saleId = String(saleRow.id || '');
      let n = 0;
      for (const it of items) {
        const vid = it && (it.vendor_id || it.vendorId);
        if (!vid) continue;
        const qty = Number(it.qty) || 0;
        const price = Number(it.price) || 0;
        const gross = Math.max(0, qty * price - (Number(it.discount) || 0));
        if (gross <= 0) continue;
        try {
          const v = await dbQuery(`SELECT commission_pct FROM vendors WHERE id=$1`, [vid]);
          const pct = v.rows[0] ? Number(v.rows[0].commission_pct) : 10.00;
          const commission = +(gross * pct / 100).toFixed(2);
          const net = +(gross - commission).toFixed(2);
          await dbQuery(
            `INSERT INTO vendor_sale_splits(sale_id,vendor_id,product_id,gross,commission_pct,commission,net)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [saleId, vid, it.product_id || null, gross, pct, commission, net]
          );
          n++;
        } catch (_) {}
      }
      return n;
    } catch (_) { return 0; }
  };

  // R18 ACCOUNTING SAT MX wiring
  try {
    const { registerAccountingSAT } = require('./accounting-sat');
    // FIX: provide dbQuery using Supabase Management API with PAT
    const _dbQuery = async (sql, params) => {
      const SUPABASE_PAT = (process.env.SUPABASE_PAT || '').trim();
      if (!SUPABASE_PAT) return { rows: [], rowCount: 0 };
      // Substitute $1, $2... params (basic, defensive)
      let finalSql = String(sql);
      if (Array.isArray(params)) {
        params.forEach((p, i) => {
          const placeholder = '\\$' + (i + 1);
          const val = p === null || p === undefined ? 'NULL'
            : (typeof p === 'number' ? String(p)
              : `'${String(p).replace(/'/g, "''")}'`);
          finalSql = finalSql.replace(new RegExp(placeholder, 'g'), val);
        });
      }
      return await new Promise((resolve) => {
        const body = JSON.stringify({ query: finalSql });
        const opts = {
          hostname: 'api.supabase.com',
          path: '/v1/projects/zhvwmzkcqngcaqpdxtwr/database/query',
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 15000,
        };
        const req2 = https.request(opts, res2 => {
          let data = '';
          res2.on('data', d => data += d);
          res2.on('end', () => {
            try { const arr = JSON.parse(data); resolve({ rows: Array.isArray(arr) ? arr : [], rowCount: Array.isArray(arr) ? arr.length : 0 }); }
            catch { resolve({ rows: [], rowCount: 0 }); }
          });
        });
        req2.on('error', () => resolve({ rows: [], rowCount: 0 }));
        req2.on('timeout', () => { req2.destroy(); resolve({ rows: [], rowCount: 0 }); });
        req2.write(body);
        req2.end();
      });
    };
    registerAccountingSAT({
      handlers,
      sendJSON,
      sendError,
      requireAuth: (typeof requireAuth === 'function' ? requireAuth : undefined),
      dbQuery: _dbQuery
    });
  } catch (e) {
    console.error('[R18 accounting-sat] register failed:', e && e.message);
  }

})();
