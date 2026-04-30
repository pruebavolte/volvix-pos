'use strict';

/**
 * recargas-servicios.js
 * Volvix POS — Phone recargas (top-ups) and payment of services.
 * Native fetch, no external deps.
 *
 * Exported: async function handleRecargasServicios(req, res, parsedUrl, ctx)
 *
 * ctx is expected to contain (provided by api/index.js):
 *   - db / pool: pg Pool with .query(text, params)
 *   - getAuthUser(req): returns { user_id, tenant_id, role, ... } or null
 *   - readJson(req): parses JSON body
 *   - sendJson(res, status, body)
 *   - logger (optional)
 */

const CARRIERS = [
  { code: 'TELCEL',       name: 'Telcel',        logo: '/logos/telcel.png',       amounts: [10, 20, 30, 50, 100, 150, 200, 300, 500] },
  { code: 'MOVISTAR',     name: 'Movistar',      logo: '/logos/movistar.png',     amounts: [10, 20, 30, 50, 100, 150, 200, 300, 500] },
  { code: 'ATT',          name: 'AT&T',          logo: '/logos/att.png',          amounts: [10, 30, 50, 100, 150, 200, 300, 500] },
  { code: 'UNEFON',       name: 'Unefon',        logo: '/logos/unefon.png',       amounts: [20, 30, 50, 100, 150, 200, 300] },
  { code: 'BAIT',         name: 'Bait',          logo: '/logos/bait.png',         amounts: [30, 50, 100, 150, 200, 300, 500] },
  { code: 'VIRGINMOBILE', name: 'Virgin Mobile', logo: '/logos/virgin.png',       amounts: [20, 30, 50, 100, 150, 200] },
  { code: 'FREEDOMPOP',   name: 'FreedomPop',    logo: '/logos/freedompop.png',   amounts: [30, 50, 100, 200] },
];

const SERVICE_PROVIDERS = [
  { code: 'CFE',         name: 'CFE Electricidad',     logo: '/logos/cfe.png',        category: 'utilities', requires_reference: true,  reference_label: 'No. de servicio (12 dígitos)' },
  { code: 'TELMEX',      name: 'Telmex',                logo: '/logos/telmex.png',     category: 'telecom',   requires_reference: true,  reference_label: 'Número de teléfono / cuenta' },
  { code: 'IZZI',        name: 'Izzi',                  logo: '/logos/izzi.png',       category: 'telecom',   requires_reference: true,  reference_label: 'No. de contrato' },
  { code: 'TOTALPLAY',   name: 'Totalplay',             logo: '/logos/totalplay.png',  category: 'telecom',   requires_reference: true,  reference_label: 'No. de contrato' },
  { code: 'AGUA-CDMX',   name: 'Agua CDMX (SACMEX)',    logo: '/logos/agua.png',       category: 'utilities', requires_reference: true,  reference_label: 'Cuenta del agua' },
  { code: 'GAS-NATURAL', name: 'Gas Natural',           logo: '/logos/gas.png',        category: 'utilities', requires_reference: true,  reference_label: 'No. de cliente' },
  { code: 'SKY',         name: 'Sky',                   logo: '/logos/sky.png',        category: 'streaming', requires_reference: true,  reference_label: 'Tarjeta Sky' },
  { code: 'DISH',        name: 'Dish',                  logo: '/logos/dish.png',       category: 'streaming', requires_reference: true,  reference_label: 'No. de cuenta' },
  { code: 'NETFLIX',     name: 'Netflix',               logo: '/logos/netflix.png',    category: 'streaming', requires_reference: true,  reference_label: 'Email de la cuenta' },
  { code: 'SPOTIFY',     name: 'Spotify',               logo: '/logos/spotify.png',    category: 'streaming', requires_reference: true,  reference_label: 'Email de la cuenta' },
];

const DEFAULT_RECARGAS_COMMISSION = 0.03; // 3%
const DEFAULT_SERVICES_COMMISSION = 0.02; // 2%
const REVERSAL_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ---------- helpers ----------

function send(ctx, res, status, body) {
  if (ctx && typeof ctx.sendJson === 'function') return ctx.sendJson(res, status, body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function err(ctx, res, status, code, message, extra) {
  return send(ctx, res, status, Object.assign({ error: message, code }, extra || {}));
}

async function readBody(ctx, req) {
  if (ctx && typeof ctx.readJson === 'function') return ctx.readJson(req);
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1024 * 256) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function getDb(ctx) {
  return ctx && (ctx.db || ctx.pool);
}

function log(ctx, level, msg, meta) {
  const l = ctx && ctx.logger;
  if (l && typeof l[level] === 'function') return l[level](msg, meta || {});
  // eslint-disable-next-line no-console
  (console[level] || console.log)(`[recargas-servicios] ${msg}`, meta || '');
}

function isMxPhone(p) {
  return typeof p === 'string' && /^\d{10}$/.test(p);
}

function minuteBucket(ts) {
  return Math.floor((ts || Date.now()) / 60000);
}

function buildIdempotencyKey(parts) {
  return parts.filter((p) => p !== undefined && p !== null).join('-');
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs || 15000);
  try {
    return await fetch(url, Object.assign({}, options, { signal: ac.signal }));
  } finally {
    clearTimeout(t);
  }
}

// One-time guard so we don't hammer ALTER TABLE.
let _settingsColumnsEnsured = false;
async function ensureTenantSettings(db) {
  if (_settingsColumnsEnsured || !db) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT PRIMARY KEY
      );
      ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS recargas_commission NUMERIC(5,4);
      ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS services_commission NUMERIC(5,4);
    `);
    _settingsColumnsEnsured = true;
  } catch (e) {
    // Non-fatal; we fall back to defaults.
    _settingsColumnsEnsured = true;
  }
}

async function getTenantCommission(db, tenantId, kind) {
  const def = kind === 'services' ? DEFAULT_SERVICES_COMMISSION : DEFAULT_RECARGAS_COMMISSION;
  if (!db || !tenantId) return def;
  try {
    await ensureTenantSettings(db);
    const col = kind === 'services' ? 'services_commission' : 'recargas_commission';
    const r = await db.query(`SELECT ${col} AS c FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
    if (r && r.rows && r.rows[0] && r.rows[0].c !== null && r.rows[0].c !== undefined) {
      const n = Number(r.rows[0].c);
      if (!Number.isNaN(n) && n >= 0 && n <= 0.5) return n;
    }
  } catch (_) { /* ignore */ }
  return def;
}

function authOrReject(ctx, req, res) {
  if (!ctx || typeof ctx.getAuthUser !== 'function') {
    err(ctx, res, 500, 'AUTH_NOT_AVAILABLE', 'Auth function not configured');
    return null;
  }
  const user = ctx.getAuthUser(req);
  if (!user || !user.tenant_id) {
    err(ctx, res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return user;
}

function findCarrier(code) {
  if (!code) return null;
  return CARRIERS.find((c) => c.code === String(code).toUpperCase()) || null;
}

function findServiceProvider(code) {
  if (!code) return null;
  return SERVICE_PROVIDERS.find((p) => p.code === String(code).toUpperCase()) || null;
}

// ---------- provider clients ----------

async function callRecargasProvider(payload) {
  const url = process.env.PROVIDER_RECARGAS_URL;
  const key = process.env.PROVIDER_RECARGAS_API_KEY;
  if (!url || !key) return { configured: false };

  const body = Object.assign({}, payload, {
    wallet_id: process.env.PROVIDER_RECARGAS_WALLET_ID || undefined,
  });

  let r;
  try {
    r = await fetchWithTimeout(url.replace(/\/$/, '') + '/recharge', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.idempotency_key,
      },
      body: JSON.stringify(body),
    }, 20000);
  } catch (e) {
    return { configured: true, ok: false, error: 'PROVIDER_TIMEOUT', message: String(e && e.message || e) };
  }
  let data = null;
  try { data = await r.json(); } catch (_) { data = null; }
  if (!r.ok) {
    return {
      configured: true,
      ok: false,
      status: r.status,
      error: (data && (data.code || data.error)) || 'PROVIDER_ERROR',
      message: (data && (data.message || data.error)) || `HTTP ${r.status}`,
      raw: data,
    };
  }
  return {
    configured: true,
    ok: true,
    external_ref: (data && (data.transaction_id || data.id || data.reference)) || null,
    status: (data && data.status) || 'completed',
    raw: data,
  };
}

async function pollRecargasProviderStatus(externalRef) {
  const url = process.env.PROVIDER_RECARGAS_URL;
  const key = process.env.PROVIDER_RECARGAS_API_KEY;
  if (!url || !key || !externalRef) return null;
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/recharge/${encodeURIComponent(externalRef)}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    }, 12000);
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return data;
  } catch (_) { return null; }
}

async function callServicesLookup(providerCode, reference) {
  const url = process.env.PROVIDER_SERVICES_URL;
  const key = process.env.PROVIDER_SERVICES_API_KEY;
  if (!url || !key) return { configured: false };
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/lookup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: providerCode, reference }),
    }, 15000);
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return { configured: true, ok: false, status: r.status, error: (data && (data.code || data.error)) || 'LOOKUP_ERROR', raw: data };
    }
    return { configured: true, ok: true, raw: data };
  } catch (e) {
    return { configured: true, ok: false, error: 'LOOKUP_TIMEOUT', message: String(e && e.message || e) };
  }
}

async function callServicesPay(payload) {
  const url = process.env.PROVIDER_SERVICES_URL;
  const key = process.env.PROVIDER_SERVICES_API_KEY;
  if (!url || !key) return { configured: false };
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/pay`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.idempotency_key,
      },
      body: JSON.stringify(payload),
    }, 25000);
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return {
        configured: true,
        ok: false,
        status: r.status,
        error: (data && (data.code || data.error)) || 'PROVIDER_ERROR',
        message: (data && (data.message || data.error)) || `HTTP ${r.status}`,
        raw: data,
      };
    }
    return {
      configured: true,
      ok: true,
      external_ref: (data && (data.transaction_id || data.id || data.reference)) || null,
      status: (data && data.status) || 'completed',
      raw: data,
    };
  } catch (e) {
    return { configured: true, ok: false, error: 'PROVIDER_TIMEOUT', message: String(e && e.message || e) };
  }
}

async function callServicesReverse(externalRef, reason) {
  const url = process.env.PROVIDER_SERVICES_URL;
  const key = process.env.PROVIDER_SERVICES_API_KEY;
  if (!url || !key || !externalRef) return { configured: false };
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/reverse`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ external_ref: externalRef, reason: reason || 'user_requested' }),
    }, 15000);
    const data = await r.json().catch(() => null);
    if (!r.ok) return { configured: true, ok: false, status: r.status, error: (data && (data.code || data.error)) || 'REVERSE_ERROR', raw: data };
    return { configured: true, ok: true, raw: data };
  } catch (e) {
    return { configured: true, ok: false, error: 'REVERSE_TIMEOUT', message: String(e && e.message || e) };
  }
}

// ---------- handlers: recargas ----------

async function handleCarriersList(ctx, req, res) {
  return send(ctx, res, 200, { carriers: CARRIERS });
}

async function handleRecargaBuy(ctx, req, res) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  let body;
  try { body = await readBody(ctx, req); }
  catch (_) { return err(ctx, res, 400, 'INVALID_JSON', 'Invalid JSON body'); }

  const tenant_id = body.tenant_id || user.tenant_id;
  if (tenant_id !== user.tenant_id && user.role !== 'admin') {
    return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot operate on a different tenant');
  }

  const carrier = findCarrier(body.carrier_code);
  if (!carrier) return err(ctx, res, 400, 'INVALID_CARRIER', 'Unknown carrier code');

  const phone = String(body.phone || '').replace(/\D/g, '');
  if (!isMxPhone(phone)) return err(ctx, res, 400, 'INVALID_PHONE', 'Phone must be 10 digits (MX)');

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err(ctx, res, 400, 'INVALID_AMOUNT', 'Invalid amount');
  if (!carrier.amounts.includes(amount)) {
    return err(ctx, res, 400, 'AMOUNT_NOT_ALLOWED', 'Amount not in carrier allowed list', { allowed: carrier.amounts });
  }

  const performed_by = body.performed_by || user.user_id || null;
  const commissionPct = await getTenantCommission(db, tenant_id, 'recargas');
  const comision = round2(amount * commissionPct);
  const total_charged = round2(amount + comision);
  const idempotency_key = buildIdempotencyKey([tenant_id, carrier.code, phone, amount, minuteBucket()]);

  log(ctx, 'info', 'recarga.buy.start', { tenant_id, carrier: carrier.code, phone, amount, performed_by });

  // Mock path when provider not configured.
  if (!process.env.PROVIDER_RECARGAS_API_KEY || !process.env.PROVIDER_RECARGAS_URL) {
    const externalRef = `MOCK-${Date.now()}`;
    try {
      const ins = await db.query(
        `INSERT INTO recargas
           (tenant_id, carrier_code, phone, amount, comision, status, external_ref, performed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
         RETURNING id, status, external_ref, amount, comision, created_at`,
        [tenant_id, carrier.code, phone, amount, comision, externalRef, performed_by]
      );
      const row = ins.rows[0];
      return send(ctx, res, 200, {
        id: row.id,
        status: row.status,
        external_ref: row.external_ref,
        amount: Number(row.amount),
        comision: Number(row.comision),
        total_charged,
        receipt: { mock: true, idempotency_key, carrier: carrier.code, phone, amount },
        mock: true,
        note: 'Provider credentials not configured; transaction recorded as pending.',
      });
    } catch (e) {
      log(ctx, 'error', 'recarga.buy.db_insert_mock_failed', { error: String(e && e.message || e) });
      return err(ctx, res, 500, 'DB_ERROR', 'Could not record recarga');
    }
  }

  // Real provider path.
  const provider = await callRecargasProvider({
    msisdn: phone,
    carrier: carrier.code,
    amount,
    idempotency_key,
  });

  if (provider.ok) {
    try {
      const ins = await db.query(
        `INSERT INTO recargas
           (tenant_id, carrier_code, phone, amount, comision, status, external_ref, performed_by, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, NOW(), NOW())
         RETURNING id, status, external_ref, amount, comision, created_at, completed_at`,
        [tenant_id, carrier.code, phone, amount, comision, provider.external_ref, performed_by]
      );
      const row = ins.rows[0];
      log(ctx, 'info', 'recarga.buy.completed', { tenant_id, id: row.id, external_ref: row.external_ref, performed_by });
      return send(ctx, res, 200, {
        id: row.id,
        status: row.status,
        external_ref: row.external_ref,
        amount: Number(row.amount),
        comision: Number(row.comision),
        total_charged,
        receipt: { idempotency_key, carrier: carrier.code, phone, amount, provider_raw: provider.raw },
      });
    } catch (e) {
      log(ctx, 'error', 'recarga.buy.db_insert_completed_failed', { error: String(e && e.message || e), external_ref: provider.external_ref });
      return err(ctx, res, 500, 'DB_ERROR', 'Recarga succeeded at provider but could not be recorded', { external_ref: provider.external_ref });
    }
  }

  // Failed at provider.
  try {
    const ins = await db.query(
      `INSERT INTO recargas
         (tenant_id, carrier_code, phone, amount, comision, status, external_ref, error_message, performed_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8, NOW())
       RETURNING id, status, external_ref, error_message`,
      [tenant_id, carrier.code, phone, amount, comision, provider.external_ref || null, provider.message || provider.error || 'unknown', performed_by]
    );
    const row = ins.rows[0];
    log(ctx, 'warn', 'recarga.buy.failed', { tenant_id, id: row.id, error: row.error_message, performed_by });
    return err(ctx, res, 502, 'RECARGA_FAILED', row.error_message || 'Provider rejected', {
      id: row.id, status: row.status, external_ref: row.external_ref,
    });
  } catch (e) {
    log(ctx, 'error', 'recarga.buy.db_insert_failed_failed', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not record failed recarga');
  }
}

async function handleRecargasHistory(ctx, req, res, parsedUrl) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  const q = (parsedUrl && parsedUrl.query) || {};
  const tenant_id = q.tenant_id || user.tenant_id;
  if (tenant_id !== user.tenant_id && user.role !== 'admin') {
    return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot view another tenant');
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const params = [tenant_id];
  let where = 'tenant_id = $1';
  if (q.from) { params.push(q.from); where += ` AND created_at >= $${params.length}`; }
  if (q.to)   { params.push(q.to);   where += ` AND created_at <= $${params.length}`; }
  if (q.status) { params.push(q.status); where += ` AND status = $${params.length}`; }
  if (q.carrier_code) { params.push(String(q.carrier_code).toUpperCase()); where += ` AND carrier_code = $${params.length}`; }

  try {
    const sql = `
      SELECT id, tenant_id, carrier_code, phone, amount, comision, status, external_ref,
             error_message, performed_by, created_at, completed_at
      FROM recargas
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const r = await db.query(sql, params);
    const totalR = await db.query(`SELECT COUNT(*)::int AS c FROM recargas WHERE ${where}`, params);
    return send(ctx, res, 200, {
      items: r.rows,
      pagination: { limit, offset, total: totalR.rows[0] ? totalR.rows[0].c : r.rows.length },
    });
  } catch (e) {
    log(ctx, 'error', 'recarga.history.db_error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not load history');
  }
}

async function handleRecargaStatus(ctx, req, res, id) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  try {
    const r = await db.query(`SELECT * FROM recargas WHERE id = $1 LIMIT 1`, [id]);
    if (!r.rows.length) return err(ctx, res, 404, 'NOT_FOUND', 'Recarga not found');
    const row = r.rows[0];
    if (row.tenant_id !== user.tenant_id && user.role !== 'admin') {
      return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot view this recarga');
    }

    if (row.status === 'pending' && row.external_ref && !String(row.external_ref).startsWith('MOCK-')) {
      const remote = await pollRecargasProviderStatus(row.external_ref);
      if (remote && remote.status) {
        const newStatus = String(remote.status).toLowerCase();
        if (newStatus === 'completed' || newStatus === 'success') {
          const upd = await db.query(
            `UPDATE recargas SET status = 'completed', completed_at = NOW(), error_message = NULL
             WHERE id = $1 RETURNING *`, [id]
          );
          return send(ctx, res, 200, { recarga: upd.rows[0], provider: remote });
        }
        if (newStatus === 'failed' || newStatus === 'error' || newStatus === 'rejected') {
          const upd = await db.query(
            `UPDATE recargas SET status = 'failed', error_message = $2 WHERE id = $1 RETURNING *`,
            [id, (remote.message || remote.error || 'failed')]
          );
          return send(ctx, res, 200, { recarga: upd.rows[0], provider: remote });
        }
      }
    }

    return send(ctx, res, 200, { recarga: row });
  } catch (e) {
    log(ctx, 'error', 'recarga.status.error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not get status');
  }
}

async function handleRecargaCancel(ctx, req, res, id) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  try {
    const r = await db.query(`SELECT * FROM recargas WHERE id = $1 LIMIT 1`, [id]);
    if (!r.rows.length) return err(ctx, res, 404, 'NOT_FOUND', 'Recarga not found');
    const row = r.rows[0];
    if (row.tenant_id !== user.tenant_id && user.role !== 'admin') {
      return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot cancel this recarga');
    }
    if (row.status === 'completed') return err(ctx, res, 409, 'ALREADY_COMPLETED', 'Cannot cancel a completed recarga');
    if (row.status === 'cancelled') return err(ctx, res, 409, 'ALREADY_CANCELLED', 'Already cancelled');
    if (row.status === 'failed') return err(ctx, res, 409, 'ALREADY_FAILED', 'Already failed');

    const upd = await db.query(
      `UPDATE recargas SET status = 'cancelled', completed_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    log(ctx, 'info', 'recarga.cancelled', { id, tenant_id: row.tenant_id, by: user.user_id });
    return send(ctx, res, 200, { recarga: upd.rows[0] });
  } catch (e) {
    log(ctx, 'error', 'recarga.cancel.error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not cancel recarga');
  }
}

// ---------- handlers: services ----------

async function handleServicesProviders(ctx, req, res) {
  return send(ctx, res, 200, { providers: SERVICE_PROVIDERS });
}

async function handleServicesLookup(ctx, req, res) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  let body;
  try { body = await readBody(ctx, req); }
  catch (_) { return err(ctx, res, 400, 'INVALID_JSON', 'Invalid JSON body'); }

  const provider = findServiceProvider(body.provider_code);
  if (!provider) return err(ctx, res, 400, 'INVALID_PROVIDER', 'Unknown service provider');

  const reference = String(body.reference || '').trim();
  if (provider.requires_reference && !reference) {
    return err(ctx, res, 400, 'INVALID_REFERENCE', `Reference required: ${provider.reference_label}`);
  }

  const remote = await callServicesLookup(provider.code, reference);
  if (!remote.configured) {
    return send(ctx, res, 200, {
      mock: true,
      provider: provider.code,
      reference,
      amount_due: 0,
      due_date: null,
      customer_name: null,
      statement_period: null,
      raw: null,
      note: 'Provider not configured; mock response.',
    });
  }
  if (!remote.ok) {
    return err(ctx, res, 502, remote.error || 'LOOKUP_ERROR', remote.message || 'Lookup failed', { raw: remote.raw });
  }
  const d = remote.raw || {};
  return send(ctx, res, 200, {
    provider: provider.code,
    reference,
    amount_due: Number(d.amount_due ?? d.amount ?? 0),
    due_date: d.due_date || d.dueDate || null,
    customer_name: d.customer_name || d.name || null,
    statement_period: d.statement_period || d.period || null,
    raw: d,
  });
}

async function handleServicesPay(ctx, req, res) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  let body;
  try { body = await readBody(ctx, req); }
  catch (_) { return err(ctx, res, 400, 'INVALID_JSON', 'Invalid JSON body'); }

  const tenant_id = body.tenant_id || user.tenant_id;
  if (tenant_id !== user.tenant_id && user.role !== 'admin') {
    return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot operate on a different tenant');
  }

  const provider = findServiceProvider(body.provider_code);
  if (!provider) return err(ctx, res, 400, 'INVALID_PROVIDER', 'Unknown service provider');

  const reference = String(body.reference || '').trim();
  if (provider.requires_reference && !reference) {
    return err(ctx, res, 400, 'INVALID_REFERENCE', `Reference required: ${provider.reference_label}`);
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err(ctx, res, 400, 'INVALID_AMOUNT', 'Invalid amount');

  const customer_phone = body.customer_phone ? String(body.customer_phone).replace(/\D/g, '') : null;
  if (customer_phone && !isMxPhone(customer_phone)) {
    return err(ctx, res, 400, 'INVALID_PHONE', 'Customer phone must be 10 digits (MX)');
  }
  const customer_email = body.customer_email ? String(body.customer_email).trim().toLowerCase() : null;
  if (customer_email && !/^\S+@\S+\.\S+$/.test(customer_email)) {
    return err(ctx, res, 400, 'INVALID_EMAIL', 'Invalid customer email');
  }

  const paid_by = body.paid_by || user.user_id || null;
  const commissionPct = await getTenantCommission(db, tenant_id, 'services');
  const comision = round2(amount * commissionPct);
  const idempotency_key = buildIdempotencyKey([tenant_id, provider.code, reference, amount, minuteBucket()]);

  log(ctx, 'info', 'service.pay.start', { tenant_id, provider: provider.code, reference, amount, paid_by });

  // Mock path when provider not configured.
  if (!process.env.PROVIDER_SERVICES_API_KEY || !process.env.PROVIDER_SERVICES_URL) {
    const externalRef = `MOCK-${Date.now()}`;
    try {
      const ins = await db.query(
        `INSERT INTO service_payments
           (tenant_id, provider_code, reference, amount, currency, status, customer_phone, customer_email,
            external_ref, receipt_data, comision, paid_by, paid_at)
         VALUES ($1, $2, $3, $4, 'MXN', 'pending', $5, $6, $7, $8::jsonb, $9, $10, NOW())
         RETURNING id, status, external_ref, amount, comision, paid_at`,
        [
          tenant_id, provider.code, reference, amount,
          customer_phone, customer_email, externalRef,
          JSON.stringify({ mock: true, idempotency_key }),
          comision, paid_by,
        ]
      );
      const row = ins.rows[0];
      return send(ctx, res, 200, {
        id: row.id,
        status: row.status,
        external_ref: row.external_ref,
        amount: Number(row.amount),
        comision: Number(row.comision),
        receipt: { mock: true, idempotency_key, provider: provider.code, reference, amount },
        mock: true,
        note: 'Provider credentials not configured; payment recorded as pending.',
      });
    } catch (e) {
      log(ctx, 'error', 'service.pay.db_mock_failed', { error: String(e && e.message || e) });
      return err(ctx, res, 500, 'DB_ERROR', 'Could not record service payment');
    }
  }

  const remote = await callServicesPay({
    provider: provider.code,
    reference,
    amount,
    currency: 'MXN',
    customer_phone,
    customer_email,
    idempotency_key,
  });

  if (remote.ok) {
    try {
      const ins = await db.query(
        `INSERT INTO service_payments
           (tenant_id, provider_code, reference, amount, currency, status, customer_phone, customer_email,
            external_ref, receipt_data, comision, paid_by, paid_at)
         VALUES ($1, $2, $3, $4, 'MXN', 'completed', $5, $6, $7, $8::jsonb, $9, $10, NOW())
         RETURNING id, status, external_ref, amount, comision, paid_at, receipt_data`,
        [
          tenant_id, provider.code, reference, amount,
          customer_phone, customer_email, remote.external_ref,
          JSON.stringify(remote.raw || {}),
          comision, paid_by,
        ]
      );
      const row = ins.rows[0];
      log(ctx, 'info', 'service.pay.completed', { tenant_id, id: row.id, external_ref: row.external_ref, paid_by });
      return send(ctx, res, 200, {
        id: row.id,
        status: row.status,
        external_ref: row.external_ref,
        amount: Number(row.amount),
        comision: Number(row.comision),
        receipt: row.receipt_data,
      });
    } catch (e) {
      log(ctx, 'error', 'service.pay.db_completed_failed', { error: String(e && e.message || e), external_ref: remote.external_ref });
      return err(ctx, res, 500, 'DB_ERROR', 'Payment succeeded at provider but could not be recorded', { external_ref: remote.external_ref });
    }
  }

  try {
    const ins = await db.query(
      `INSERT INTO service_payments
         (tenant_id, provider_code, reference, amount, currency, status, customer_phone, customer_email,
          external_ref, receipt_data, comision, paid_by, paid_at)
       VALUES ($1, $2, $3, $4, 'MXN', 'failed', $5, $6, $7, $8::jsonb, $9, $10, NOW())
       RETURNING id, status, external_ref`,
      [
        tenant_id, provider.code, reference, amount,
        customer_phone, customer_email, remote.external_ref || null,
        JSON.stringify({ error: remote.error || 'PROVIDER_ERROR', message: remote.message, raw: remote.raw || null }),
        comision, paid_by,
      ]
    );
    const row = ins.rows[0];
    log(ctx, 'warn', 'service.pay.failed', { tenant_id, id: row.id, error: remote.error });
    return err(ctx, res, 502, 'SERVICE_PAY_FAILED', remote.message || 'Provider rejected', {
      id: row.id, status: row.status, external_ref: row.external_ref,
    });
  } catch (e) {
    log(ctx, 'error', 'service.pay.db_failed_failed', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not record failed payment');
  }
}

async function handleServicesHistory(ctx, req, res, parsedUrl) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  const q = (parsedUrl && parsedUrl.query) || {};
  const tenant_id = q.tenant_id || user.tenant_id;
  if (tenant_id !== user.tenant_id && user.role !== 'admin') {
    return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot view another tenant');
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const params = [tenant_id];
  let where = 'tenant_id = $1';
  if (q.from) { params.push(q.from); where += ` AND paid_at >= $${params.length}`; }
  if (q.to)   { params.push(q.to);   where += ` AND paid_at <= $${params.length}`; }
  if (q.status) { params.push(q.status); where += ` AND status = $${params.length}`; }
  if (q.provider_code) { params.push(String(q.provider_code).toUpperCase()); where += ` AND provider_code = $${params.length}`; }

  try {
    const sql = `
      SELECT id, tenant_id, provider_code, reference, amount, currency, status,
             customer_phone, customer_email, external_ref, comision, paid_by, paid_at,
             reversed_at, reversal_reason
      FROM service_payments
      WHERE ${where}
      ORDER BY paid_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const r = await db.query(sql, params);
    const totalR = await db.query(`SELECT COUNT(*)::int AS c FROM service_payments WHERE ${where}`, params);
    return send(ctx, res, 200, {
      items: r.rows,
      pagination: { limit, offset, total: totalR.rows[0] ? totalR.rows[0].c : r.rows.length },
    });
  } catch (e) {
    log(ctx, 'error', 'service.history.db_error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not load history');
  }
}

async function handleServiceReceipt(ctx, req, res, id) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');
  try {
    const r = await db.query(`SELECT * FROM service_payments WHERE id = $1 LIMIT 1`, [id]);
    if (!r.rows.length) return err(ctx, res, 404, 'NOT_FOUND', 'Service payment not found');
    const row = r.rows[0];
    if (row.tenant_id !== user.tenant_id && user.role !== 'admin') {
      return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot view this receipt');
    }
    return send(ctx, res, 200, {
      id: row.id,
      provider_code: row.provider_code,
      reference: row.reference,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      external_ref: row.external_ref,
      comision: Number(row.comision || 0),
      paid_at: row.paid_at,
      reversed_at: row.reversed_at,
      reversal_reason: row.reversal_reason,
      customer_phone: row.customer_phone,
      customer_email: row.customer_email,
      receipt_data: row.receipt_data,
    });
  } catch (e) {
    log(ctx, 'error', 'service.receipt.error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not load receipt');
  }
}

async function handleServiceReverse(ctx, req, res, id) {
  const user = authOrReject(ctx, req, res); if (!user) return;
  const db = getDb(ctx);
  if (!db) return err(ctx, res, 500, 'DB_UNAVAILABLE', 'Database not available');

  let body = {};
  try { body = await readBody(ctx, req); } catch (_) { /* allow empty */ }
  const reason = (body && body.reason) ? String(body.reason).slice(0, 500) : 'user_requested';

  try {
    const r = await db.query(`SELECT * FROM service_payments WHERE id = $1 LIMIT 1`, [id]);
    if (!r.rows.length) return err(ctx, res, 404, 'NOT_FOUND', 'Service payment not found');
    const row = r.rows[0];
    if (row.tenant_id !== user.tenant_id && user.role !== 'admin') {
      return err(ctx, res, 403, 'FORBIDDEN_TENANT', 'Cannot reverse this payment');
    }
    if (row.reversed_at) return err(ctx, res, 409, 'ALREADY_REVERSED', 'Payment already reversed');
    if (row.status !== 'completed' && row.status !== 'pending') {
      return err(ctx, res, 409, 'NOT_REVERSIBLE', `Cannot reverse a ${row.status} payment`);
    }
    const paidAtMs = row.paid_at ? new Date(row.paid_at).getTime() : 0;
    if (Date.now() - paidAtMs > REVERSAL_WINDOW_MS) {
      return err(ctx, res, 409, 'REVERSAL_WINDOW_EXPIRED', 'Reversal window has expired');
    }

    if (row.external_ref && !String(row.external_ref).startsWith('MOCK-')
      && process.env.PROVIDER_SERVICES_API_KEY && process.env.PROVIDER_SERVICES_URL) {
      const remote = await callServicesReverse(row.external_ref, reason);
      if (!remote.ok) {
        return err(ctx, res, 502, remote.error || 'REVERSE_FAILED', remote.message || 'Provider rejected reversal', { raw: remote.raw });
      }
    }

    const upd = await db.query(
      `UPDATE service_payments
         SET status = 'reversed', reversed_at = NOW(), reversal_reason = $2
       WHERE id = $1
       RETURNING *`,
      [id, reason]
    );
    log(ctx, 'info', 'service.reversed', { id, tenant_id: row.tenant_id, by: user.user_id, reason });
    return send(ctx, res, 200, { service_payment: upd.rows[0] });
  } catch (e) {
    log(ctx, 'error', 'service.reverse.error', { error: String(e && e.message || e) });
    return err(ctx, res, 500, 'DB_ERROR', 'Could not reverse payment');
  }
}

// ---------- router ----------

function matchPath(pathname, pattern) {
  const a = pathname.replace(/\/+$/, '').split('/');
  const b = pattern.replace(/\/+$/, '').split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

module.exports = async function handleRecargasServicios(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  // Path guard: only handle /api/recargas/* and /api/services/* routes.
  if (!pathname.startsWith('/api/recargas') && !pathname.startsWith('/api/services')) {
    return false;
  }

  try {
    // Recargas
    if (method === 'GET'  && pathname === '/api/recargas/carriers')  return await handleCarriersList(ctx, req, res);
    if (method === 'POST' && pathname === '/api/recargas/buy')       return await handleRecargaBuy(ctx, req, res);
    if (method === 'GET'  && pathname === '/api/recargas/history')   return await handleRecargasHistory(ctx, req, res, parsedUrl);

    let m;
    if ((m = matchPath(pathname, '/api/recargas/:id/status')) && method === 'GET') {
      return await handleRecargaStatus(ctx, req, res, m.id);
    }
    if ((m = matchPath(pathname, '/api/recargas/:id/cancel')) && method === 'POST') {
      return await handleRecargaCancel(ctx, req, res, m.id);
    }

    // Services
    if (method === 'GET'  && pathname === '/api/services/providers') return await handleServicesProviders(ctx, req, res);
    if (method === 'POST' && pathname === '/api/services/lookup')    return await handleServicesLookup(ctx, req, res);
    if (method === 'POST' && pathname === '/api/services/pay')       return await handleServicesPay(ctx, req, res);
    if (method === 'GET'  && pathname === '/api/services/history')   return await handleServicesHistory(ctx, req, res, parsedUrl);

    if ((m = matchPath(pathname, '/api/services/:id/receipt')) && method === 'GET') {
      return await handleServiceReceipt(ctx, req, res, m.id);
    }
    if ((m = matchPath(pathname, '/api/services/:id/reverse')) && method === 'POST') {
      return await handleServiceReverse(ctx, req, res, m.id);
    }

    // No matching route under /api/recargas or /api/services — let next handler try
    return false;
  } catch (e) {
    log(ctx, 'error', 'unhandled', { error: String(e && e.stack || e) });
    return err(ctx, res, 500, 'INTERNAL_ERROR', 'Internal error');
  }
};

module.exports.CARRIERS = CARRIERS;
module.exports.SERVICE_PROVIDERS = SERVICE_PROVIDERS;
