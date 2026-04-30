/**
 * payments-stp.js — STP (Sistema de Transferencias y Pagos México) integration
 * for Volvix POS.
 *
 * Solves "triangulación": cashier no longer calls the owner to verify wire
 * arrivals. STP assigns a unique numeric reference per sale; a webhook fires
 * when funds land; Supabase Realtime pushes ✅ to the POS in real-time.
 *
 * Export signature (matches other payments-*.js modules):
 *   module.exports = async function handleSTP(req, res, parsedUrl, ctx)
 *   Returns true if the request was handled, false otherwise.
 *
 * Endpoints:
 *   POST /api/payments/stp/generate-reference
 *   POST /api/webhooks/stp
 *   GET  /api/payments/stp/verify/:reference
 *   POST /api/payments/stp/qr-codi
 *   POST /api/payments/stp/configure
 *   GET  /api/payments/stp/pending/:tenant_id
 *
 * Phase 1: all transfers land in STP_OWNER_CLABE (owner's master account).
 * Phase 2: when use_owner_account=false the tenant's own CLABE is used.
 *
 * Zero external dependencies — native Node.js only.
 */

'use strict';

const crypto = require('crypto');

// ─────────────────────────── ENV ───────────────────────────
const STP_ENTERPRISE_KEY = (process.env.STP_ENTERPRISE_KEY || '').trim();
const STP_CLABE_PREFIX   = (process.env.STP_CLABE_PREFIX || '').trim();
const STP_WEBHOOK_SECRET = (process.env.STP_WEBHOOK_SECRET || '').trim();
const STP_OWNER_CLABE    = (process.env.STP_OWNER_CLABE || '').trim();
const SUPABASE_URL       = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

// ─────────────────────────── helpers ───────────────────────

/**
 * Read the request body as a parsed JSON object.
 * Handles both Buffer and string body pre-parsed by the host framework.
 */
async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString() || '{}');
    return req.body;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/**
 * Read the raw request body as a Buffer (needed for HMAC validation).
 */
async function readRawBody(req) {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Generate a 6-digit numeric reference unique enough for a sale.
 * Format: last-3-digits-of-epoch-seconds + 3 random digits.
 * Collisions are handled by the UNIQUE constraint on the DB column.
 */
function generateNumericReference() {
  const ts  = Math.floor(Date.now() / 1000) % 1000;  // 0-999
  const rnd = Math.floor(Math.random() * 1000);        // 0-999
  return String(ts).padStart(3, '0') + String(rnd).padStart(3, '0');
}

/**
 * Verify STP webhook HMAC-SHA256 signature.
 * Header: X-STP-Signature = hmac-sha256=<hex>
 */
function verifyStpSignature(rawBody, header) {
  if (!STP_WEBHOOK_SECRET) return false;
  const expected = 'hmac-sha256=' +
    crypto.createHmac('sha256', STP_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Minimal SVG-based QR placeholder (deterministic hash-based pattern).
 * Replace with a real QR library for production.
 */
function buildQrDataUri(text) {
  const sz   = 25;
  const cell = 8;
  const h    = crypto.createHash('sha256').update(String(text)).digest();
  let rects  = '';
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const i = y * sz + x;
      if ((h[i % h.length] >> (i % 8)) & 1) {
        rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
      }
    }
  }
  const w   = sz * cell;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">` +
              `<rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Build a CoDi payment string (simplified — production needs STP cert + signed JWT).
 */
function buildCodiPayload({ amount, sale_id, reference, clabe, concept }) {
  const a = Number(amount).toFixed(2);
  return [
    'CoDi|v=1.0',
    `clabe=${clabe || STP_OWNER_CLABE || '000000000000000000'}`,
    `amt=${a}`,
    `cur=MXN`,
    `ref=${reference}`,
    `cpt=${encodeURIComponent(concept || 'Pago Volvix POS')}`,
    `sid=${sale_id || ''}`,
  ].join('|');
}

/**
 * Broadcast to Supabase Realtime channel via REST API.
 * Uses the Realtime Broadcast endpoint (no WS needed server-side).
 */
async function broadcastToRealtime(channel, event, payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  const url = `${SUPABASE_URL}/realtime/v1/api/broadcast`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic: channel, event, payload }],
      }),
    });
  } catch (err) {
    console.error('[STP] Realtime broadcast failed:', err.message);
  }
}

// ─────────────────────────── route handlers ────────────────

/**
 * POST /api/payments/stp/generate-reference
 * Body: { sale_id, amount, tenant_id, cashier_id, expires_minutes? }
 * Returns: { reference, clabe, amount, expires_at, verification_id }
 */
async function generateReference(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;

  let user;
  try { user = await getAuthUser(req); }
  catch { return sendJson(res, 401, { error: 'unauthorized' }); }

  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'invalid_json' }); }

  const { sale_id, amount, tenant_id, cashier_id, expires_minutes = 30 } = body || {};

  if (!sale_id)  return sendJson(res, 400, { error: 'sale_id required' });
  if (!tenant_id) return sendJson(res, 400, { error: 'tenant_id required' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return sendJson(res, 400, { error: 'amount must be > 0' });

  // Resolve CLABE: prefer tenant's own (Phase 2) or owner's fallback (Phase 1)
  let clabe = STP_OWNER_CLABE;
  let useOwner = true;
  try {
    const [cfg] = await supabaseRequest(
      'GET',
      `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.stp&select=config&limit=1`
    );
    if (cfg && cfg.config) {
      const c = typeof cfg.config === 'string' ? JSON.parse(cfg.config) : cfg.config;
      if (c.use_owner_account === false && c.clabe) {
        clabe    = c.clabe;
        useOwner = false;
      }
    }
  } catch { /* no config — stay on Phase 1 */ }

  // Generate a collision-resistant 6-digit reference
  let reference;
  let attempts = 0;
  while (attempts < 5) {
    reference = generateNumericReference();
    // Check uniqueness
    try {
      const existing = await supabaseRequest(
        'GET',
        `/pos_payment_verifications?reference=eq.${reference}&status=eq.pending&select=id&limit=1`
      );
      if (!existing || existing.length === 0) break;
    } catch { break; } // DB error — proceed optimistically
    attempts++;
  }

  const expires_at = new Date(Date.now() + expires_minutes * 60 * 1000).toISOString();
  const now        = new Date().toISOString();

  const row = {
    id: crypto.randomUUID(),
    tenant_id,
    sale_id,
    payment_method: 'transferencia_stp',
    amount: amt,
    reference,
    status: 'pending',
    cashier_id:    cashier_id  || null,
    cashier_email: user?.email || null,
    created_at:    now,
    updated_at:    now,
    meta: JSON.stringify({
      clabe,
      use_owner_account: useOwner,
      expires_at,
      stp_enabled: Boolean(STP_ENTERPRISE_KEY || !useOwner),
    }),
  };

  let verification_id;
  try {
    const inserted = await supabaseRequest('POST', '/pos_payment_verifications', row);
    const rec = Array.isArray(inserted) ? inserted[0] : inserted;
    verification_id = rec?.id || row.id;
  } catch (err) {
    console.error('[STP] insert pos_payment_verifications:', err.message);
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }

  return sendJson(res, 200, {
    reference,
    clabe,
    amount: amt,
    expires_at,
    verification_id,
    manual_flow: !STP_ENTERPRISE_KEY && useOwner,
  });
}

/**
 * POST /api/webhooks/stp
 * No user auth. Validates X-STP-Signature header (HMAC-SHA256).
 * STP payload: { clave_rastreo, monto, referencia_numerica, nombre_ordenante, banco_ordenante, ... }
 */
async function webhookStp(req, res, ctx) {
  const { supabaseRequest, sendJson } = ctx;

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch { return sendJson(res, 400, { error: 'cannot_read_body' }); }

  // Signature validation (skip if secret not configured — dev mode)
  if (STP_WEBHOOK_SECRET) {
    const sig = (req.headers['x-stp-signature'] || '').trim();
    if (!sig) return sendJson(res, 401, { error: 'missing_signature' });
    if (!verifyStpSignature(rawBody, sig)) return sendJson(res, 401, { error: 'invalid_signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString()); }
  catch { return sendJson(res, 400, { error: 'invalid_json' }); }

  const {
    clave_rastreo,
    monto,
    referencia_numerica,
    nombre_ordenante,
    banco_ordenante,
    fecha_operacion,
    concepto,
  } = payload;

  if (!referencia_numerica) return sendJson(res, 400, { error: 'referencia_numerica required' });

  const ref = String(referencia_numerica);
  const amt = Number(monto);

  // Find matching pending verification
  let verification;
  try {
    const rows = await supabaseRequest(
      'GET',
      `/pos_payment_verifications?reference=eq.${ref}&status=eq.pending&limit=1`
    );
    verification = rows?.[0];
  } catch (err) {
    console.error('[STP] lookup verification:', err.message);
    return sendJson(res, 500, { error: 'db_error' });
  }

  if (!verification) {
    // Not found or already processed — acknowledge to prevent STP retries
    console.warn(`[STP] webhook: no pending verification for ref=${ref}`);
    return sendJson(res, 200, { ok: true, matched: false });
  }

  const now = new Date().toISOString();

  // Update verification to confirmed
  const metaUpdate = Object.assign(
    {},
    typeof verification.meta === 'string' ? JSON.parse(verification.meta || '{}') : (verification.meta || {}),
    {
      clave_rastreo,
      nombre_ordenante,
      banco_ordenante,
      fecha_operacion,
      concepto,
      stp_monto:       amt,
      webhook_received: now,
    }
  );

  try {
    await supabaseRequest(
      'PATCH',
      `/pos_payment_verifications?id=eq.${verification.id}`,
      {
        status:      'confirmed',
        verified_at: now,
        updated_at:  now,
        meta:        JSON.stringify(metaUpdate),
      }
    );
  } catch (err) {
    console.error('[STP] update verification:', err.message);
    return sendJson(res, 500, { error: 'db_update_error' });
  }

  // Insert into payments table
  try {
    await supabaseRequest('POST', '/payments', {
      id:                  crypto.randomUUID(),
      sale_id:             verification.sale_id,
      provider:            'stp',
      provider_payment_id: clave_rastreo || ref,
      status:              'confirmed',
      amount_cents:        Math.round(amt * 100),
      currency:            'MXN',
      tenant_id:           verification.tenant_id,
      raw:                 JSON.stringify(payload),
    });
  } catch (err) {
    // Non-fatal — verification already updated
    console.error('[STP] insert payments:', err.message);
  }

  // Broadcast to Supabase Realtime → POS picks up via channel subscription
  await broadcastToRealtime('pos_payment_updates', 'payment_confirmed', {
    sale_id:   verification.sale_id,
    status:    'confirmed',
    amount:    amt,
    method:    'stp',
    reference: ref,
    clave_rastreo,
    tenant_id: verification.tenant_id,
    confirmed_at: now,
  });

  return sendJson(res, 200, { ok: true, matched: true, sale_id: verification.sale_id });
}

/**
 * GET /api/payments/stp/verify/:reference
 * Poll endpoint for cashier to check if a specific reference was confirmed.
 */
async function verifyReference(req, res, parsedUrl, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;

  try { await getAuthUser(req); }
  catch { return sendJson(res, 401, { error: 'unauthorized' }); }

  const parts = parsedUrl.pathname.split('/');
  const reference = parts[parts.length - 1];
  if (!reference || reference === 'verify') {
    return sendJson(res, 400, { error: 'reference required' });
  }

  let rows;
  try {
    rows = await supabaseRequest(
      'GET',
      `/pos_payment_verifications?reference=eq.${encodeURIComponent(reference)}&select=status,amount,verified_at,meta&limit=1`
    );
  } catch (err) {
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }

  if (!rows || rows.length === 0) {
    return sendJson(res, 404, { error: 'not_found' });
  }

  const rec  = rows[0];
  const meta = typeof rec.meta === 'string' ? JSON.parse(rec.meta || '{}') : (rec.meta || {});

  return sendJson(res, 200, {
    status:        rec.status,
    amount:        rec.amount,
    confirmed_at:  rec.verified_at || null,
    clave_rastreo: meta.clave_rastreo || null,
  });
}

/**
 * POST /api/payments/stp/qr-codi
 * Generate a CoDi QR code for a sale.
 * Body: { sale_id, amount, tenant_id, concept? }
 */
async function generateCodiQr(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;

  try { await getAuthUser(req); }
  catch { return sendJson(res, 401, { error: 'unauthorized' }); }

  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'invalid_json' }); }

  const { sale_id, amount, tenant_id, concept } = body || {};

  if (!sale_id)   return sendJson(res, 400, { error: 'sale_id required' });
  if (!tenant_id) return sendJson(res, 400, { error: 'tenant_id required' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return sendJson(res, 400, { error: 'amount must be > 0' });

  // Resolve CLABE (same Phase 1/2 logic)
  let clabe = STP_OWNER_CLABE;
  try {
    const [cfg] = await supabaseRequest(
      'GET',
      `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.stp&select=config&limit=1`
    );
    if (cfg && cfg.config) {
      const c = typeof cfg.config === 'string' ? JSON.parse(cfg.config) : cfg.config;
      if (c.use_owner_account === false && c.clabe) clabe = c.clabe;
    }
  } catch { /* fallback */ }

  const reference = generateNumericReference();
  const now        = new Date().toISOString();
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const payment_id = crypto.randomUUID();

  const qr_data = buildCodiPayload({ amount: amt, sale_id, reference, clabe, concept });
  const qr_image_url = buildQrDataUri(qr_data);

  try {
    await supabaseRequest('POST', '/qr_payments', {
      id:         payment_id,
      sale_id,
      type:       'codi',
      amount:     amt,
      qr_data,
      status:     'pending',
      expires_at,
      tenant_id,
      provider:   'stp',
    });
  } catch (err) {
    console.error('[STP] insert qr_payments:', err.message);
    // Non-fatal — return QR even if persistence failed
  }

  return sendJson(res, 200, {
    qr_data,
    qr_image_url,
    payment_id,
    reference,
    clabe,
    expires_at,
    placeholder: !STP_ENTERPRISE_KEY,
    note: !STP_ENTERPRISE_KEY
      ? 'Production CoDi requires STP certificate and signed JWT. Configure STP_ENTERPRISE_KEY.'
      : undefined,
  });
}

/**
 * POST /api/payments/stp/configure
 * Save or update tenant STP configuration in payment_gateways table.
 * Body: { clabe?, enterprise_key?, use_owner_account, stp_owner_clabe? }
 */
async function configureStp(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson, IS_PROD } = ctx;

  let user;
  try { user = await getAuthUser(req); }
  catch { return sendJson(res, 401, { error: 'unauthorized' }); }

  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'invalid_json' }); }

  const { tenant_id, clabe, enterprise_key, use_owner_account = true, stp_owner_clabe } = body || {};
  if (!tenant_id) return sendJson(res, 400, { error: 'tenant_id required' });

  // Ensure payment_gateways table exists (idempotent DDL via Supabase RPC or raw SQL)
  // We attempt CREATE TABLE IF NOT EXISTS via the rest API.  On hosted Supabase the
  // service key has the necessary permissions.  Errors here are non-fatal.
  const createDdl = `
    CREATE TABLE IF NOT EXISTS payment_gateways (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   text NOT NULL,
      provider    text NOT NULL,
      enabled     boolean NOT NULL DEFAULT false,
      config      jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, provider)
    );
  `;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_ddl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql: createDdl }),
    });
  } catch { /* table may already exist */ }

  const now    = new Date().toISOString();
  const config = JSON.stringify({
    clabe:              clabe || null,
    enterprise_key:     IS_PROD ? '[REDACTED]' : (enterprise_key || null),
    use_owner_account:  Boolean(use_owner_account),
    stp_owner_clabe:    stp_owner_clabe || STP_OWNER_CLABE || null,
  });

  // Store enterprise_key separately (never expose it after save)
  const sensitiveConfig = JSON.stringify({
    clabe,
    enterprise_key:    enterprise_key || null,
    use_owner_account: Boolean(use_owner_account),
    stp_owner_clabe:   stp_owner_clabe || STP_OWNER_CLABE || null,
  });

  try {
    // Upsert using POST + Prefer: resolution=merge-duplicates
    await supabaseRequest(
      'POST',
      '/payment_gateways?on_conflict=tenant_id,provider',
      {
        tenant_id,
        provider:   'stp',
        enabled:    true,
        config:     sensitiveConfig,
        updated_at: now,
      },
      { 'Prefer': 'resolution=merge-duplicates' }
    );
  } catch (err) {
    console.error('[STP] upsert payment_gateways:', err.message);
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }

  return sendJson(res, 200, {
    ok: true,
    tenant_id,
    provider: 'stp',
    use_owner_account: Boolean(use_owner_account),
    clabe_configured: Boolean(clabe),
    phase: use_owner_account ? 1 : 2,
  });
}

/**
 * GET /api/payments/stp/pending/:tenant_id
 * List pending transfer verifications for a tenant (cashier dashboard).
 */
async function listPending(req, res, parsedUrl, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;

  try { await getAuthUser(req); }
  catch { return sendJson(res, 401, { error: 'unauthorized' }); }

  const parts     = parsedUrl.pathname.split('/');
  const tenant_id = parts[parts.length - 1];
  if (!tenant_id || tenant_id === 'pending') {
    return sendJson(res, 400, { error: 'tenant_id required' });
  }

  let rows;
  try {
    rows = await supabaseRequest(
      'GET',
      `/pos_payment_verifications?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.pending&payment_method=eq.transferencia_stp&order=created_at.desc&limit=50`
    );
  } catch (err) {
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }

  const result = (rows || []).map(r => {
    const meta = typeof r.meta === 'string' ? JSON.parse(r.meta || '{}') : (r.meta || {});
    return {
      id:          r.id,
      sale_id:     r.sale_id,
      amount:      r.amount,
      reference:   r.reference,
      cashier_id:  r.cashier_id,
      clabe:       meta.clabe || STP_OWNER_CLABE || null,
      expires_at:  meta.expires_at || null,
      created_at:  r.created_at,
    };
  });

  return sendJson(res, 200, result);
}

// ─────────────────────────── router ────────────────────────

/**
 * Main export — called by index.js for every request.
 * Returns true if handled, false to pass through.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 * @param {URL}                            parsedUrl
 * @param {{ supabaseRequest, getAuthUser, sendJson, IS_PROD }} ctx
 */
module.exports = async function handleSTP(req, res, parsedUrl, ctx) {
  const { pathname } = parsedUrl;
  const method       = req.method || 'GET';

  // ── generate-reference ──────────────────────────────────
  if (method === 'POST' && pathname === '/api/payments/stp/generate-reference') {
    await generateReference(req, res, ctx);
    return true;
  }

  // ── STP webhook (no auth) ────────────────────────────────
  if (method === 'POST' && pathname === '/api/webhooks/stp') {
    await webhookStp(req, res, ctx);
    return true;
  }

  // ── verify/:reference ────────────────────────────────────
  if (method === 'GET' && pathname.startsWith('/api/payments/stp/verify/')) {
    await verifyReference(req, res, parsedUrl, ctx);
    return true;
  }

  // ── qr-codi ──────────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/payments/stp/qr-codi') {
    await generateCodiQr(req, res, ctx);
    return true;
  }

  // ── configure ────────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/payments/stp/configure') {
    await configureStp(req, res, ctx);
    return true;
  }

  // ── pending/:tenant_id ───────────────────────────────────
  if (method === 'GET' && pathname.startsWith('/api/payments/stp/pending/')) {
    await listPending(req, res, parsedUrl, ctx);
    return true;
  }

  return false; // not handled
};
