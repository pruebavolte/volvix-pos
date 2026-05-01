/**
 * Volvix · A/B Testing API
 *
 * Routes (all under /api/abtest/*):
 *   POST  /api/abtest/assign            { experiment_id, user_id, variants? } → { variant }
 *   POST  /api/abtest/event             { experiment_id, variant, user_id, event_type, metadata? }
 *   GET   /api/abtest/experiments       (admin)  → list of active experiments
 *   GET   /api/abtest/results/:exp_id   (admin)  → conversion rate per variant + 95% CI
 *
 * Tables required (auto-created on first request when exec_sql RPC available):
 *   abtest_experiments(id, name, description, variants jsonb, traffic_split jsonb,
 *                      status, start_date, end_date)
 *   abtest_events(id, experiment_id, variant, user_id, event_type,
 *                 metadata jsonb, created_at)
 *
 * Usage from api/index.js:
 *   const handleAbtest = require('./abtest');
 *   if (await handleAbtest(req, res, parsedUrl, ctx)) return;
 */

'use strict';

/* ---------- helpers ---------- */

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, maxBytes) {
  const max = maxBytes || 64 * 1024;
  const buf = await readRawBody(req);
  if (buf.length > max) throw new Error('payload_too_large');
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch (_) { throw new Error('invalid_json'); }
}

/**
 * FNV-1a 32-bit. Deterministic hash for sticky assignment.
 * Returns an unsigned int.
 */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Pick variant deterministically from `variants` weighted by `weights` (or equal).
 * `seed` should be `${user_id}:${experiment_id}`.
 */
function pickVariant(seed, variants, weights) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const h = fnv1a(seed);
  const bucket = h % 10000; // 0..9999

  let totals = Array.isArray(weights) && weights.length === variants.length
    ? weights.map(n => Math.max(0, Number(n) || 0))
    : variants.map(() => 1);
  const sum = totals.reduce((a, b) => a + b, 0) || variants.length;
  // Normalize to /10000
  totals = totals.map(w => Math.floor((w / sum) * 10000));
  // Fix rounding so they total 10000
  const rem = 10000 - totals.reduce((a, b) => a + b, 0);
  if (rem > 0) totals[totals.length - 1] += rem;

  let acc = 0;
  for (let i = 0; i < variants.length; i++) {
    acc += totals[i];
    if (bucket < acc) return variants[i];
  }
  return variants[variants.length - 1];
}

/**
 * Wilson 95% confidence interval for a proportion.
 * Returns { low, high } in [0,1].
 */
function wilsonCI(successes, total) {
  if (!total) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return {
    low:  Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/* ---------- table bootstrap ---------- */

let _tablesEnsured = false;
async function ensureAbtestTables(supabaseRequest) {
  if (_tablesEnsured) return;
  _tablesEnsured = true;
  const ddl1 = `
    CREATE TABLE IF NOT EXISTS abtest_experiments (
      id            text PRIMARY KEY,
      name          text,
      description   text,
      variants      jsonb,
      traffic_split jsonb,
      status        text DEFAULT 'active',
      start_date    timestamptz DEFAULT now(),
      end_date      timestamptz
    );
  `;
  const ddl2 = `
    CREATE TABLE IF NOT EXISTS abtest_events (
      id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      experiment_id  text,
      variant        text,
      user_id        text,
      event_type     text,
      metadata       jsonb,
      created_at     timestamptz DEFAULT now()
    );
  `;
  const ddl3 = `CREATE INDEX IF NOT EXISTS abtest_events_exp_idx ON abtest_events(experiment_id, event_type);`;
  try { await supabaseRequest('POST', '/rpc/exec_sql', { sql: ddl1 }).catch(() => null); } catch (_) {}
  try { await supabaseRequest('POST', '/rpc/exec_sql', { sql: ddl2 }).catch(() => null); } catch (_) {}
  try { await supabaseRequest('POST', '/rpc/exec_sql', { sql: ddl3 }).catch(() => null); } catch (_) {}
}

/* ---------- auth helper ---------- */

const crypto = require('crypto');
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();

function decodeJwtUnsafe(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (_) { return null; }
}

function verifyJwtIfPossible(token) {
  if (!token) return null;
  if (!JWT_SECRET) return decodeJwtUnsafe(token); // best-effort decode if no secret configured
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const data = parts[0] + '.' + parts[1];
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
    if (expectedSig !== parts[2]) {
      // try base64 (some libs use base64 not base64url)
      const altSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      if (altSig !== parts[2]) return null;
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (_) { return null; }
}

function getAdminUser(req, ctx) {
  let u = req.user || null;
  if (!u && ctx && typeof ctx.getAuthUser === 'function') {
    try { u = ctx.getAuthUser(); } catch (_) { u = null; }
  }
  if (!u) {
    // Try to parse Bearer JWT inline
    const auth = req.headers && req.headers['authorization'] || '';
    const m = String(auth).match(/^Bearer\s+(.+)$/i);
    if (m) u = verifyJwtIfPossible(m[1]);
  }
  if (!u) return null;
  const role = String(u.role || '').toLowerCase();
  if (['admin', 'superadmin', 'owner'].indexOf(role) === -1) return null;
  return u;
}

/* ---------- handlers ---------- */

async function handleAssign(req, res, ctx) {
  const { supabaseRequest, sendJson } = ctx;
  await ensureAbtestTables(supabaseRequest);

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, 400, { error: e.message || 'invalid_json' }); }

  const expId  = String(body.experiment_id || '').slice(0, 80);
  const userId = String(body.user_id || '').slice(0, 120);
  if (!expId || !userId) return sendJson(res, 400, { error: 'experiment_id_and_user_id_required' });

  // Try to load experiment config; fall back to caller-provided variants
  let variants = Array.isArray(body.variants) ? body.variants.map(String) : null;
  let weights  = null;

  try {
    const rows = await supabaseRequest('GET',
      `/abtest_experiments?id=eq.${encodeURIComponent(expId)}&select=*&limit=1`);
    const exp = rows && rows[0];
    if (exp) {
      if (exp.status && exp.status !== 'active') {
        return sendJson(res, 200, { variant: null, reason: 'experiment_not_active' });
      }
      if (Array.isArray(exp.variants) && exp.variants.length) {
        variants = exp.variants.map(String);
      }
      if (Array.isArray(exp.traffic_split) && exp.traffic_split.length === (variants ? variants.length : -1)) {
        weights = exp.traffic_split.map(Number);
      }
    }
  } catch (_) { /* best-effort */ }

  if (!variants || variants.length === 0) variants = ['A', 'B'];

  const variant = pickVariant(`${userId}:${expId}`, variants, weights);

  // Track impression (best-effort)
  try {
    await supabaseRequest('POST', '/abtest_events', {
      experiment_id: expId,
      variant,
      user_id: userId,
      event_type: 'impression',
      metadata: body.metadata || null,
    });
  } catch (_) { /* ignore */ }

  return sendJson(res, 200, { experiment_id: expId, user_id: userId, variant, variants });
}

async function handleEvent(req, res, ctx) {
  const { supabaseRequest, sendJson } = ctx;
  await ensureAbtestTables(supabaseRequest);

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, 400, { error: e.message || 'invalid_json' }); }

  const expId   = String(body.experiment_id || '').slice(0, 80);
  const variant = body.variant != null ? String(body.variant).slice(0, 40) : null;
  const userId  = String(body.user_id || '').slice(0, 120);
  const event   = String(body.event_type || body.event || '').slice(0, 60).toLowerCase();
  const ALLOWED = new Set(['impression', 'click', 'conversion', 'view', 'engagement']);

  if (!expId || !userId || !event) {
    return sendJson(res, 400, { error: 'experiment_id_user_id_and_event_required' });
  }
  if (!ALLOWED.has(event)) {
    return sendJson(res, 400, { error: 'invalid_event_type', allowed: Array.from(ALLOWED) });
  }

  try {
    await supabaseRequest('POST', '/abtest_events', {
      experiment_id: expId,
      variant: variant || null,
      user_id: userId,
      event_type: event,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
    });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { error: 'db_error', detail: String(e && e.message || e) });
  }
}

async function handleListExperiments(req, res, ctx) {
  const { supabaseRequest, sendJson } = ctx;
  if (!getAdminUser(req, ctx)) return sendJson(res, 403, { error: 'forbidden' });
  await ensureAbtestTables(supabaseRequest);
  try {
    const rows = await supabaseRequest('GET',
      '/abtest_experiments?select=*&order=start_date.desc&limit=500') || [];
    return sendJson(res, 200, { data: rows });
  } catch (e) {
    return sendJson(res, 200, { data: [], note: 'table_unavailable' });
  }
}

async function handleResults(req, res, parsedUrl, ctx, expIdParam) {
  const { supabaseRequest, sendJson } = ctx;
  if (!getAdminUser(req, ctx)) return sendJson(res, 403, { error: 'forbidden' });
  await ensureAbtestTables(supabaseRequest);

  const expId = String(expIdParam || '').slice(0, 80);
  if (!expId) return sendJson(res, 400, { error: 'experiment_id_required' });

  let events = [];
  try {
    events = await supabaseRequest('GET',
      `/abtest_events?experiment_id=eq.${encodeURIComponent(expId)}` +
      `&select=variant,event_type,user_id&limit=100000`) || [];
  } catch (_) { events = []; }

  // Aggregate per variant
  const byVariant = new Map();
  function bucketFor(v) {
    const k = v == null ? '_null' : String(v);
    if (!byVariant.has(k)) byVariant.set(k, {
      variant: v, impressions: 0, clicks: 0, conversions: 0,
      uniqueUsers: new Set(), uniqueConverters: new Set(),
    });
    return byVariant.get(k);
  }

  for (const e of events) {
    const b = bucketFor(e.variant);
    if (e.user_id) b.uniqueUsers.add(e.user_id);
    if (e.event_type === 'impression') b.impressions++;
    else if (e.event_type === 'click') b.clicks++;
    else if (e.event_type === 'conversion') {
      b.conversions++;
      if (e.user_id) b.uniqueConverters.add(e.user_id);
    }
  }

  const variants = Array.from(byVariant.values()).map(b => {
    const exposures = b.uniqueUsers.size || b.impressions;
    const conv = b.uniqueConverters.size || b.conversions;
    const rate = exposures ? conv / exposures : 0;
    const ci = wilsonCI(conv, exposures);
    return {
      variant: b.variant,
      impressions: b.impressions,
      clicks: b.clicks,
      conversions: b.conversions,
      unique_users: b.uniqueUsers.size,
      unique_converters: b.uniqueConverters.size,
      conversion_rate: rate,
      conversion_rate_ci_low: ci.low,
      conversion_rate_ci_high: ci.high,
    };
  });

  // Statistical winner: variant with highest CI low > best other CI low (non-overlapping)
  let winner = null;
  if (variants.length >= 2) {
    const sorted = variants.slice().sort((a, b) => b.conversion_rate - a.conversion_rate);
    const top = sorted[0];
    const second = sorted[1];
    if (top && second && top.conversion_rate_ci_low > second.conversion_rate_ci_high) {
      winner = top.variant;
    }
  }

  return sendJson(res, 200, {
    experiment_id: expId,
    variants,
    winner,
    total_events: events.length,
  });
}

/* ---------- main export ---------- */

module.exports = async function handleAbtest(req, res, parsedUrl, ctx) {
  const method   = req.method || 'GET';
  const pathname = (parsedUrl && parsedUrl.pathname) || '';

  if (!pathname.startsWith('/api/abtest')) return false;
  if (!ctx || typeof ctx.supabaseRequest !== 'function' || typeof ctx.sendJson !== 'function') {
    return false;
  }

  if (method === 'POST' && pathname === '/api/abtest/assign') {
    await handleAssign(req, res, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/abtest/event') {
    await handleEvent(req, res, ctx);
    return true;
  }

  if (method === 'GET' && pathname === '/api/abtest/experiments') {
    await handleListExperiments(req, res, ctx);
    return true;
  }

  const m = pathname.match(/^\/api\/abtest\/results\/([^/]+)\/?$/);
  if (method === 'GET' && m) {
    await handleResults(req, res, parsedUrl, ctx, decodeURIComponent(m[1]));
    return true;
  }

  return false;
};

// Test exports
module.exports._internal = { fnv1a, pickVariant, wilsonCI };
