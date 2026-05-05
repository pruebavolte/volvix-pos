'use strict';

/**
 * backup.js — Volvix POS Backup / Restore system.
 *
 * Endpoints (admin-only):
 *   GET  /api/backup/export?format=json|sql      → descarga backup completo del tenant
 *   POST /api/backup/import                      → restore desde JSON
 *   GET  /api/backup/schedule                    → lee config auto-backup
 *   POST /api/backup/schedule                    → guarda config auto-backup
 *   GET  /api/backup/history                     → lista backups previos (volvix_backup_history)
 *
 * Compression: gzip (Accept-Encoding: gzip o ?gzip=1).
 * Encryption opcional con BACKUP_ENCRYPTION_KEY (AES-256-GCM).
 *
 * Tablas exportadas por tenant:
 *   - products
 *   - sales
 *   - customers
 *   - users (sin password_hash)
 *   - volvix_settings (settings genericos por tenant)
 *
 * Exporta: async function handleBackup(req, res, parsedUrl, ctx)
 *   ctx = { supabaseRequest, getAuthUser, sendJson, IS_PROD }
 */

const zlib = require('zlib');
const crypto = require('crypto');

const ENCRYPTION_KEY_RAW = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();

// ---------- helpers ----------

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendBuffer(res, status, contentType, buf, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  if (headers) {
    for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
  }
  res.end(buf);
}

async function readJsonBody(req, maxBytes) {
  const limit = maxBytes || 50 * 1024 * 1024; // 50MB
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > limit) { req.destroy(); reject(new Error('payload_too_large')); }
    });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function isAdmin(user) {
  if (!user) return false;
  const r = String(user.role || '').toLowerCase();
  return r === 'admin' || r === 'owner' || r === 'superadmin';
}

function deriveKey() {
  if (!ENCRYPTION_KEY_RAW) return null;
  return crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
}

function encryptBuffer(buf) {
  const key = deriveKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: VLBKP1 | iv (12) | tag (16) | ciphertext
  return Buffer.concat([Buffer.from('VLBKP1', 'ascii'), iv, tag, enc]);
}

function decryptBuffer(buf) {
  const key = deriveKey();
  if (!key) throw new Error('encryption_key_missing');
  if (buf.length < 6 + 12 + 16 || buf.slice(0, 6).toString('ascii') !== 'VLBKP1') {
    throw new Error('invalid_encrypted_payload');
  }
  const iv = buf.slice(6, 18);
  const tag = buf.slice(18, 34);
  const ct = buf.slice(34);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ---------- export ----------

async function fetchTenantTable(supabaseRequest, table, tenantId, selectFields) {
  // Try tenant_id filter first; if it fails (table without tenant_id), fall back unfiltered
  // but we keep this best-effort and never throw.
  try {
    const sel = selectFields ? `&select=${encodeURIComponent(selectFields)}` : '';
    const path = `/${table}?tenant_id=eq.${encodeURIComponent(tenantId)}${sel}&limit=100000`;
    const rows = await supabaseRequest('GET', path);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

async function buildBackupPayload(supabaseRequest, tenantId) {
  const [products, sales, customers, usersRaw, settings] = await Promise.all([
    fetchTenantTable(supabaseRequest, 'products', tenantId),
    fetchTenantTable(supabaseRequest, 'sales', tenantId),
    fetchTenantTable(supabaseRequest, 'customers', tenantId),
    fetchTenantTable(supabaseRequest, 'users', tenantId,
      'id,email,role,full_name,tenant_id,created_at,updated_at,active'),
    fetchTenantTable(supabaseRequest, 'volvix_settings', tenantId),
  ]);

  // Sanitize users — strip any password/secret-like fields just in case
  const users = (usersRaw || []).map((u) => {
    const c = Object.assign({}, u);
    delete c.password_hash;
    delete c.password;
    delete c.drawer_pin_hash;
    delete c.totp_secret;
    delete c.refresh_token;
    return c;
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    counts: {
      products: products.length,
      sales: sales.length,
      customers: customers.length,
      users: users.length,
      settings: settings.length,
    },
    data: { products, sales, customers, users, settings },
  };
}

function jsonToSql(payload) {
  // Basic SQL dump (INSERTs only). For a true round-trip we recommend the JSON format.
  const lines = [];
  lines.push('-- Volvix POS backup');
  lines.push(`-- generated_at: ${payload.generated_at}`);
  lines.push(`-- tenant_id: ${payload.tenant_id}`);
  lines.push('BEGIN;');

  const tables = ['products', 'customers', 'sales', 'users', 'settings'];
  for (const t of tables) {
    const rows = (payload.data && payload.data[t]) || [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    lines.push(`-- table: ${t} (${rows.length} rows)`);
    for (const r of rows) {
      const vals = cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO ${t === 'settings' ? 'volvix_settings' : t} (${cols.join(',')}) VALUES (${vals.join(',')});`);
    }
  }
  lines.push('COMMIT;');
  return lines.join('\n');
}

async function recordHistory(supabaseRequest, user, action, meta) {
  try {
    await supabaseRequest('POST', '/volvix_backup_history', {
      tenant_id: user.tenant_id || null,
      user_id: user.id || user.email || 'anon',
      action: String(action || '').slice(0, 32),
      meta: meta || {},
      ts: new Date().toISOString(),
    });
  } catch (_) { /* table may not exist; ignore */ }
}

async function handleExport(ctx, req, res, parsedUrl) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden', reason: 'admin_required' });
  if (!user.tenant_id) return send(res, 400, { error: 'tenant_required' });

  const q = (parsedUrl && parsedUrl.query) || {};
  const format = String(q.format || 'json').toLowerCase();
  if (format !== 'json' && format !== 'sql') {
    return send(res, 400, { error: 'invalid_format', allowed: ['json', 'sql'] });
  }

  const payload = await buildBackupPayload(ctx.supabaseRequest, user.tenant_id);

  let body;
  let contentType;
  if (format === 'sql') {
    body = Buffer.from(jsonToSql(payload), 'utf8');
    contentType = 'application/sql; charset=utf-8';
  } else {
    body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    contentType = 'application/json; charset=utf-8';
  }

  let encrypted = false;
  if (String(q.encrypt || '').toLowerCase() === '1' && deriveKey()) {
    body = encryptBuffer(body);
    contentType = 'application/octet-stream';
    encrypted = true;
  }

  const acceptEnc = String(req.headers['accept-encoding'] || '');
  const wantGzip = String(q.gzip || '') === '1' || /\bgzip\b/i.test(acceptEnc);
  const headers = {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let filename = `volvix-backup-${user.tenant_id}-${stamp}.${format}`;
  if (encrypted) filename += '.enc';

  if (wantGzip && !encrypted) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    filename += '.gz';
  }
  headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  headers['Cache-Control'] = 'no-store';

  await recordHistory(ctx.supabaseRequest, user, 'export', {
    format, encrypted, gzip: wantGzip && !encrypted, counts: payload.counts,
  });

  return sendBuffer(res, 200, contentType, body, headers);
}

// ---------- import ----------

async function restoreTable(supabaseRequest, table, rows, tenantId) {
  if (!Array.isArray(rows) || !rows.length) return { table, inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;
  // Force tenant_id on every row to prevent cross-tenant restore
  const safeRows = rows.map((r) => Object.assign({}, r, { tenant_id: tenantId }));
  // Insert in chunks of 200
  for (let i = 0; i < safeRows.length; i += 200) {
    const chunk = safeRows.slice(i, i + 200);
    try {
      await supabaseRequest('POST', `/${table}`, chunk);
      inserted += chunk.length;
    } catch (_) {
      skipped += chunk.length;
    }
  }
  return { table, inserted, skipped };
}

async function handleImport(ctx, req, res) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden', reason: 'admin_required' });
  if (!user.tenant_id) return send(res, 400, { error: 'tenant_required' });

  let body;
  try { body = await readJsonBody(req); } catch (e) {
    return send(res, 413, { error: String(e && e.message || 'payload_error') });
  }

  // Optional: { encrypted: true, payload: <base64> }
  if (body && body.encrypted && body.payload) {
    try {
      const dec = decryptBuffer(Buffer.from(body.payload, 'base64'));
      body = JSON.parse(dec.toString('utf8'));
    } catch (e) {
      return send(res, 400, { error: 'decrypt_failed', detail: String(e && e.message || e) });
    }
  }

  if (!body || typeof body !== 'object' || !body.data) {
    return send(res, 400, { error: 'invalid_payload', hint: 'expected { data: { products, sales, customers, users, settings } }' });
  }

  const tenantId = user.tenant_id;
  const data = body.data || {};
  const summary = [];

  const tableMap = [
    ['products', 'products'],
    ['customers', 'customers'],
    ['sales', 'sales'],
    ['users', 'users'],
    ['settings', 'volvix_settings'],
  ];

  for (const [key, table] of tableMap) {
    summary.push(await restoreTable(ctx.supabaseRequest, table, data[key], tenantId));
  }

  await recordHistory(ctx.supabaseRequest, user, 'import', { summary });

  return send(res, 200, { ok: true, tenant_id: tenantId, summary });
}

// ---------- schedule ----------

async function handleScheduleGet(ctx, req, res) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' });
  if (!user.tenant_id) return send(res, 400, { error: 'tenant_required' });

  let cfg = null;
  try {
    const rows = await ctx.supabaseRequest('GET',
      `/volvix_backup_schedule?tenant_id=eq.${encodeURIComponent(user.tenant_id)}&limit=1`);
    cfg = (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch (_) { /* table may not exist */ }

  return send(res, 200, {
    ok: true,
    schedule: cfg || { tenant_id: user.tenant_id, enabled: false, frequency: 'weekly', hour_utc: 3 },
  });
}

async function handleSchedulePost(ctx, req, res) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' });
  if (!user.tenant_id) return send(res, 400, { error: 'tenant_required' });

  let body;
  try { body = await readJsonBody(req, 64 * 1024); } catch { body = {}; }

  const row = {
    tenant_id: user.tenant_id,
    enabled: !!body.enabled,
    frequency: ['hourly', 'daily', 'weekly', 'monthly'].includes(String(body.frequency))
      ? String(body.frequency) : 'weekly',
    hour_utc: Number.isFinite(+body.hour_utc) ? Math.max(0, Math.min(23, +body.hour_utc)) : 3,
    keep_last: Number.isFinite(+body.keep_last) ? Math.max(1, Math.min(365, +body.keep_last)) : 30,
    notify_email: typeof body.notify_email === 'string' ? body.notify_email.slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  };

  try {
    await ctx.supabaseRequest('POST', '/volvix_backup_schedule', row);
  } catch (_) {
    try {
      await ctx.supabaseRequest('PATCH',
        `/volvix_backup_schedule?tenant_id=eq.${encodeURIComponent(user.tenant_id)}`, row);
    } catch (e2) {
      return send(res, 500, { error: 'schedule_save_failed', detail: String(e2 && e2.message || e2) });
    }
  }
  await recordHistory(ctx.supabaseRequest, user, 'schedule_update', row);
  return send(res, 200, { ok: true, schedule: row });
}

async function handleHistory(ctx, req, res) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' });
  if (!user.tenant_id) return send(res, 400, { error: 'tenant_required' });

  let rows = [];
  try {
    rows = await ctx.supabaseRequest('GET',
      `/volvix_backup_history?tenant_id=eq.${encodeURIComponent(user.tenant_id)}&order=ts.desc&limit=100`);
  } catch (_) { rows = []; }
  return send(res, 200, { ok: true, history: rows || [] });
}

// ---------- dispatcher ----------

module.exports = async function handleBackup(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  if (!pathname.startsWith('/api/backup')) return false;

  try {
    if (method === 'GET' && pathname === '/api/backup/export') {
      await handleExport(ctx, req, res, parsedUrl);
      return true;
    }
    if (method === 'POST' && pathname === '/api/backup/import') {
      await handleImport(ctx, req, res);
      return true;
    }
    if (method === 'GET' && pathname === '/api/backup/schedule') {
      await handleScheduleGet(ctx, req, res);
      return true;
    }
    if (method === 'POST' && pathname === '/api/backup/schedule') {
      await handleSchedulePost(ctx, req, res);
      return true;
    }
    if (method === 'GET' && pathname === '/api/backup/history') {
      await handleHistory(ctx, req, res);
      return true;
    }
    return false;
  } catch (e) {
    try { send(res, 500, { error: 'backup_internal_error', detail: ctx.IS_PROD ? 'internal' : String(e && e.message || e) }); } catch (_) {}
    return true;
  }
};

module.exports.buildBackupPayload = buildBackupPayload;
module.exports.encryptBuffer = encryptBuffer;
module.exports.decryptBuffer = decryptBuffer;
