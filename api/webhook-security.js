/**
 * Volvix · Webhook Security Helper
 *
 * Shared HMAC-SHA256 signature verification + replay protection for all
 * incoming webhooks (Mercado Pago, Stripe, STP, delivery platforms, etc.).
 *
 * Usage:
 *   const { readRawBody, verifyHmacSha256, extractSignature, checkReplay,
 *           recordWebhookDelivery } = require('./webhook-security');
 *
 *   const raw = await readRawBody(req);
 *   const sig = extractSignature(req.headers, 'x-signature'); // -> { ts, v1 } if Stripe-style
 *   if (!verifyHmacSha256(raw, sig.v1, secret)) return reject;
 *   if (!checkReplay(sig.ts, 300)) return reject;
 */

'use strict';

const crypto = require('crypto');

/* -------------------------------------------------------------------- *
 * Read raw request body as Buffer (required for HMAC validation).      *
 * -------------------------------------------------------------------- */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* -------------------------------------------------------------------- *
 * HMAC-SHA256 verification (timing-safe).                              *
 * Accepts hex or base64 signatures, with optional "sha256=" prefix.    *
 * Returns boolean.                                                     *
 * -------------------------------------------------------------------- */
function verifyHmacSha256(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const expectedHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Strip common prefixes
  let sig = String(signature).trim()
    .replace(/^sha256=/i, '')
    .replace(/^hmac-sha256=/i, '');

  // Try hex first
  try {
    if (sig.length === expectedHex.length && /^[0-9a-fA-F]+$/.test(sig)) {
      const a = Buffer.from(expectedHex, 'hex');
      const b = Buffer.from(sig.toLowerCase(), 'hex');
      if (a.length === b.length) return crypto.timingSafeEqual(a, b);
    }
  } catch (_) { /* fall through */ }

  // Try base64
  try {
    const expectedB64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');
    if (sig.length === expectedB64.length) {
      const a = Buffer.from(expectedB64);
      const b = Buffer.from(sig);
      if (a.length === b.length) return crypto.timingSafeEqual(a, b);
    }
  } catch (_) { /* fall through */ }

  return false;
}

/* -------------------------------------------------------------------- *
 * Parse Stripe-style signature header: "t=<ts>,v1=<hex>[,v0=<hex>]".   *
 * Falls back to a single value if no kv pairs.                         *
 * -------------------------------------------------------------------- */
function extractSignature(headers, headerName) {
  if (!headers) return { raw: '', ts: null, v1: null };
  const name = String(headerName || '').toLowerCase();
  const raw = String(headers[name] || headers[name.replace(/-/g, '_')] || '').trim();
  if (!raw) return { raw: '', ts: null, v1: null };

  // No commas → assume bare signature
  if (raw.indexOf(',') === -1 && raw.indexOf('=') === -1) {
    return { raw, ts: null, v1: raw };
  }

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const out = { raw, ts: null, v1: null, v0: null };
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k === 't' || k === 'ts' || k === 'timestamp') out.ts = v;
    else if (k === 'v1') out.v1 = v;
    else if (k === 'v0') out.v0 = v;
    else out[k] = v;
  }
  // If header was just "sha256=..."
  if (!out.v1 && raw.toLowerCase().startsWith('sha256=')) {
    out.v1 = raw.slice(7);
  }
  return out;
}

/* -------------------------------------------------------------------- *
 * Replay protection. timestamp may be seconds or millis.               *
 * tolerance defaults to 300s (5 min).                                  *
 * Returns boolean (true = within tolerance).                           *
 * -------------------------------------------------------------------- */
function checkReplay(timestamp, toleranceSec) {
  const tol = (toleranceSec == null ? 300 : toleranceSec) * 1000;
  if (!timestamp) return false;
  let ts = Number(timestamp);
  if (!isFinite(ts) || ts <= 0) return false;
  // Heuristic: < 1e12 → seconds
  if (ts < 1e12) ts = ts * 1000;
  const drift = Math.abs(Date.now() - ts);
  return drift <= tol;
}

/* -------------------------------------------------------------------- *
 * Record a webhook delivery for debugging / audit.                     *
 * Best-effort — never throws.                                          *
 * -------------------------------------------------------------------- */
async function recordWebhookDelivery(supabaseRequest, entry) {
  if (typeof supabaseRequest !== 'function') return;
  const row = {
    endpoint_id:  entry.endpoint_id || null,
    event:        entry.event       || entry.platform || 'webhook',
    direction:    entry.direction   || 'inbound',
    method:       entry.method      || 'POST',
    url:          entry.url         || null,
    status_code:  entry.status_code != null ? entry.status_code : null,
    request_headers: entry.request_headers || null,
    request_body:    entry.request_body    || null,
    response_body:   entry.response_body   || null,
    error:        entry.error || null,
    signature_valid: entry.signature_valid != null ? !!entry.signature_valid : null,
    created_at:   new Date().toISOString(),
  };
  try {
    await supabaseRequest('POST', '/webhook_deliveries', row);
  } catch (_) {
    // table may not exist or insert may fail; non-fatal
  }
}

/* -------------------------------------------------------------------- *
 * Wrapper: full inbound-webhook check (signature + replay).            *
 * opts: { rawBody, headers, secret, signatureHeader, tolerance,        *
 *         signatureFormat: 'plain' | 'stripe' | 'mp' }                 *
 * Returns { ok: bool, reason?: string, parsed?: object }.              *
 * -------------------------------------------------------------------- */
function verifyWebhook(opts) {
  const {
    rawBody, headers, secret,
    signatureHeader, tolerance,
    signatureFormat = 'plain',
    requestId,
  } = opts || {};

  if (!secret) return { ok: false, reason: 'missing_secret' };
  const parsed = extractSignature(headers, signatureHeader);

  if (signatureFormat === 'mp') {
    // Mercado Pago manifest: id:<requestId>;request-id:<requestId>;ts:<ts>;
    if (!parsed.ts || !parsed.v1) return { ok: false, reason: 'malformed_signature' };
    if (tolerance && !checkReplay(parsed.ts, tolerance)) return { ok: false, reason: 'replay', parsed };
    const rid = requestId || (headers && (headers['x-request-id'] || headers['X-Request-Id'])) || '';
    const manifest = `id:${rid};request-id:${rid};ts:${parsed.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(parsed.v1, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true, parsed };
    } catch (_) {}
    return { ok: false, reason: 'invalid_signature', parsed };
  }

  if (signatureFormat === 'stripe') {
    if (!parsed.ts || !parsed.v1) return { ok: false, reason: 'malformed_signature' };
    if (tolerance && !checkReplay(parsed.ts, tolerance)) return { ok: false, reason: 'replay', parsed };
    const signed = `${parsed.ts}.${(rawBody || '').toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(parsed.v1, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true, parsed };
    } catch (_) {}
    return { ok: false, reason: 'invalid_signature', parsed };
  }

  // Plain HMAC over raw body (delivery platforms, STP, etc.)
  const sigVal = parsed.v1 || parsed.raw;
  if (!sigVal) return { ok: false, reason: 'missing_signature' };
  if (!verifyHmacSha256(rawBody, sigVal, secret)) return { ok: false, reason: 'invalid_signature', parsed };
  return { ok: true, parsed };
}

module.exports = {
  readRawBody,
  verifyHmacSha256,
  extractSignature,
  checkReplay,
  recordWebhookDelivery,
  verifyWebhook,
};
