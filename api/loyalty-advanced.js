// api/loyalty-advanced.js
// Programa de lealtad avanzado: tiers Bronze/Silver/Gold/Platinum,
// auto-promote por compras anuales, earn/redeem, catálogo de rewards,
// birthday automation cron.
//
// Endpoints (registrados via register({ handlers, ... })):
//   POST /api/loyalty/earn                      (auth)
//   POST /api/loyalty/redeem-reward             (auth)   [reward_id-based; R14 /redeem stays for raw points]
//   GET  /api/loyalty/customer/:id              (auth)
//   GET  /api/loyalty/rewards-catalog           (auth)   ?tenant_id=...
//   POST /api/loyalty/rewards                   (admin)  CRUD rewards
//   PATCH /api/loyalty/rewards/:id              (admin)
//   DELETE /api/loyalty/rewards/:id             (admin)
//   GET  /api/loyalty/tiers-config              (auth)   ?tenant_id=...
//   POST /api/loyalty/tiers-config              (admin)  upsert tier config
//   GET  /api/loyalty/top-customers             (admin)  ?tenant_id=...&limit=
//   GET  /api/loyalty/stats                     (admin)  ?tenant_id=...
//   GET  /api/loyalty/share-link                (auth)   referral share link
//   POST /api/cron/birthday-rewards             (cron)   diario
//
// Tablas DB esperadas (Supabase / Postgres):
//
// CREATE TABLE loyalty_tier_config (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id uuid NOT NULL,
//   tier text NOT NULL,                         -- bronze|silver|gold|platinum
//   min_annual_spend numeric NOT NULL DEFAULT 0,
//   points_per_dollar numeric NOT NULL DEFAULT 1,
//   perks jsonb DEFAULT '[]'::jsonb,
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(tenant_id, tier)
// );
//
// CREATE TABLE loyalty_rewards (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id uuid NOT NULL,
//   name text NOT NULL,
//   description text,
//   reward_type text NOT NULL,                  -- discount_pct|free_product|cashback|physical_gift
//   value numeric NOT NULL DEFAULT 0,           -- pct (0-100) | currency | product_id ref
//   points_cost integer NOT NULL,
//   tier_required text,                         -- null = todos
//   stock integer,                              -- null = ilimitado
//   active boolean DEFAULT true,
//   created_at timestamptz DEFAULT now()
// );
//
// CREATE TABLE loyalty_transactions (             -- ya usada en R14
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id uuid,
//   customer_id uuid NOT NULL,
//   type text NOT NULL,                         -- earn|redeem|adjust|birthday
//   points integer NOT NULL,
//   balance_after integer,
//   source text,                                -- sale|birthday|manual|reward:<id>
//   reward_id uuid,
//   sale_id uuid,
//   notes text,
//   ts timestamptz DEFAULT now()
// );
//
// Columnas extra esperadas en customers:
//   loyalty_points integer DEFAULT 0
//   tier text DEFAULT 'bronze'
//   annual_spend numeric DEFAULT 0
//   birthday date
//   email text
//   tenant_id uuid

'use strict';

const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

const DEFAULT_TIER_THRESHOLDS = {
  bronze:   { min_annual_spend: 0,     points_per_dollar: 1,   perks: [] },
  silver:   { min_annual_spend: 5000,  points_per_dollar: 1.25, perks: ['priority_support'] },
  gold:     { min_annual_spend: 20000, points_per_dollar: 1.5,  perks: ['priority_support', 'free_shipping'] },
  platinum: { min_annual_spend: 50000, points_per_dollar: 2,    perks: ['priority_support', 'free_shipping', 'personal_advisor'] },
};

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') {
    return helpers.sendJSON(res, payload, status || 200);
  }
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBodySafe(req, helpers) {
  if (helpers && typeof helpers.readBody === 'function') return helpers.readBody(req);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return ['admin', 'owner', 'superadmin'].includes(role);
}

function isUuidLike(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isCronAuthorized(req) {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const hdr = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
  if (!hdr || typeof hdr !== 'string') return false;
  const parts = hdr.split(/\s+/);
  if (parts.length !== 2) return false;
  if (parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === expected;
}

function tenantOf(req, fallback) {
  return (req.user && (req.user.tenant_id || req.user.tenantId)) || fallback || null;
}

// Compute tier given annual spend + tier thresholds map { tier: {min_annual_spend} }
function computeTier(annualSpend, thresholds) {
  const spend = Number(annualSpend || 0);
  let result = 'bronze';
  for (const t of TIERS) {
    const th = (thresholds && thresholds[t]) || DEFAULT_TIER_THRESHOLDS[t];
    if (spend >= Number(th.min_annual_spend || 0)) result = t;
  }
  return result;
}

async function loadTierThresholds(supabaseRequest, tenantId) {
  if (typeof supabaseRequest !== 'function' || !tenantId) {
    return Object.assign({}, DEFAULT_TIER_THRESHOLDS);
  }
  try {
    const rows = await supabaseRequest('GET',
      `/loyalty_tier_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`);
    const merged = JSON.parse(JSON.stringify(DEFAULT_TIER_THRESHOLDS));
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const t = String(r.tier || '').toLowerCase();
        if (TIERS.includes(t)) {
          merged[t] = {
            min_annual_spend: Number(r.min_annual_spend || 0),
            points_per_dollar: Number(r.points_per_dollar || 1),
            perks: Array.isArray(r.perks) ? r.perks : [],
          };
        }
      }
    }
    return merged;
  } catch (_) {
    return Object.assign({}, DEFAULT_TIER_THRESHOLDS);
  }
}

function nextTier(currentTier) {
  const i = TIERS.indexOf(String(currentTier || 'bronze').toLowerCase());
  if (i < 0 || i >= TIERS.length - 1) return null;
  return TIERS[i + 1];
}

function register(deps) {
  const {
    handlers,
    supabaseRequest,
    readBody,
    requireAuth,
    sendJSON,
    sendError,
    sendEmail,
  } = deps || {};

  if (!handlers) throw new Error('loyalty-advanced: handlers required');
  const helpers = { sendJSON, sendError, readBody };
  const auth = requireAuth || ((fn) => fn);

  async function loadCustomer(customerId) {
    if (typeof supabaseRequest !== 'function') return null;
    try {
      const rows = await supabaseRequest('GET',
        `/customers?id=eq.${encodeURIComponent(customerId)}&select=id,tenant_id,name,email,loyalty_points,tier,annual_spend,birthday`);
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    } catch (_) { return null; }
  }

  async function recordTransaction(row) {
    if (typeof supabaseRequest !== 'function') return null;
    try {
      const r = await supabaseRequest('POST', '/loyalty_transactions',
        Object.assign({ ts: new Date().toISOString() }, row));
      return Array.isArray(r) ? r[0] : r;
    } catch (_) { return null; }
  }

  async function refreshTierIfNeeded(c, thresholds) {
    const newTier = computeTier(c.annual_spend, thresholds);
    if (newTier !== String(c.tier || 'bronze').toLowerCase()) {
      try {
        await supabaseRequest('PATCH',
          `/customers?id=eq.${encodeURIComponent(c.id)}`,
          { tier: newTier });
        return newTier;
      } catch (_) { /* ignore */ }
    }
    return c.tier || newTier;
  }

  // -------- POST /api/loyalty/earn --------
  handlers['POST /api/loyalty/earn'] = auth(async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const customerId = String((body && body.customer_id) || '').trim();
      const points = parseInt(body && body.points, 10);
      const source = String((body && body.source) || 'manual').trim().slice(0, 64);
      const saleId = body && body.sale_id ? String(body.sale_id) : null;
      const amount = Number((body && body.amount) || 0); // optional: $ amount of the sale

      if (!customerId || !isUuidLike(customerId)) {
        return send(res, { ok: false, error: 'customer_id_invalid' }, 400, helpers);
      }
      if (!Number.isInteger(points) || points <= 0) {
        return send(res, { ok: false, error: 'points_invalid' }, 400, helpers);
      }

      const c = await loadCustomer(customerId);
      if (!c) return send(res, { ok: false, error: 'customer_not_found' }, 404, helpers);

      const tenantId = c.tenant_id || tenantOf(req);
      const thresholds = await loadTierThresholds(supabaseRequest, tenantId);

      // Apply tier multiplier if amount provided
      const tierKey = String(c.tier || 'bronze').toLowerCase();
      const ppDollar = (thresholds[tierKey] || DEFAULT_TIER_THRESHOLDS[tierKey] || {}).points_per_dollar || 1;
      const finalPoints = amount > 0 ? Math.floor(amount * ppDollar) : points;
      const newBalance = Number(c.loyalty_points || 0) + finalPoints;
      const newAnnualSpend = Number(c.annual_spend || 0) + Math.max(0, amount);

      await recordTransaction({
        tenant_id: tenantId,
        customer_id: c.id,
        type: 'earn',
        points: finalPoints,
        balance_after: newBalance,
        source,
        sale_id: saleId,
      });

      try {
        await supabaseRequest('PATCH',
          `/customers?id=eq.${encodeURIComponent(c.id)}`,
          { loyalty_points: newBalance, annual_spend: newAnnualSpend });
      } catch (_) { /* ignore */ }

      const updated = Object.assign({}, c, { annual_spend: newAnnualSpend, loyalty_points: newBalance });
      const promotedTier = await refreshTierIfNeeded(updated, thresholds);

      return send(res, {
        ok: true,
        customer_id: c.id,
        earned: finalPoints,
        balance: newBalance,
        tier: promotedTier,
        annual_spend: newAnnualSpend,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- POST /api/loyalty/redeem-reward --------
  // Redeems by reward_id (advanced; R14 plain /redeem still works for raw points)
  handlers['POST /api/loyalty/redeem-reward'] = auth(async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const customerId = String((body && body.customer_id) || '').trim();
      const rewardId = String((body && body.reward_id) || '').trim();

      if (!isUuidLike(customerId)) return send(res, { ok: false, error: 'customer_id_invalid' }, 400, helpers);
      if (!isUuidLike(rewardId))   return send(res, { ok: false, error: 'reward_id_invalid' }, 400, helpers);

      const c = await loadCustomer(customerId);
      if (!c) return send(res, { ok: false, error: 'customer_not_found' }, 404, helpers);

      let reward = null;
      try {
        const rows = await supabaseRequest('GET',
          `/loyalty_rewards?id=eq.${encodeURIComponent(rewardId)}&select=*`);
        reward = Array.isArray(rows) && rows.length ? rows[0] : null;
      } catch (_) { reward = null; }
      if (!reward || reward.active === false) {
        return send(res, { ok: false, error: 'reward_not_available' }, 404, helpers);
      }

      const cost = parseInt(reward.points_cost, 10) || 0;
      const balance = Number(c.loyalty_points || 0);
      if (balance < cost) {
        return send(res, { ok: false, error: 'insufficient_points', balance, cost }, 400, helpers);
      }

      // tier gating
      if (reward.tier_required) {
        const reqTierIdx = TIERS.indexOf(String(reward.tier_required).toLowerCase());
        const userTierIdx = TIERS.indexOf(String(c.tier || 'bronze').toLowerCase());
        if (reqTierIdx > userTierIdx) {
          return send(res, { ok: false, error: 'tier_too_low', required: reward.tier_required }, 403, helpers);
        }
      }

      // stock check
      if (reward.stock !== null && reward.stock !== undefined && Number(reward.stock) <= 0) {
        return send(res, { ok: false, error: 'out_of_stock' }, 409, helpers);
      }

      const newBalance = balance - cost;

      await recordTransaction({
        tenant_id: c.tenant_id || tenantOf(req),
        customer_id: c.id,
        type: 'redeem',
        points: -cost,
        balance_after: newBalance,
        source: 'reward:' + reward.id,
        reward_id: reward.id,
      });

      try {
        await supabaseRequest('PATCH',
          `/customers?id=eq.${encodeURIComponent(c.id)}`,
          { loyalty_points: newBalance });
      } catch (_) { /* ignore */ }

      // decrement stock
      if (reward.stock !== null && reward.stock !== undefined) {
        try {
          await supabaseRequest('PATCH',
            `/loyalty_rewards?id=eq.${encodeURIComponent(reward.id)}`,
            { stock: Math.max(0, Number(reward.stock) - 1) });
        } catch (_) { /* ignore */ }
      }

      return send(res, {
        ok: true,
        redeemed: { reward_id: reward.id, name: reward.name, type: reward.reward_type, value: reward.value },
        balance: newBalance,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/customer/:id --------
  handlers['GET /api/loyalty/customer/:id'] = auth(async (req, res, params) => {
    try {
      const id = params && params.id;
      if (!isUuidLike(id)) return send(res, { ok: false, error: 'invalid_id' }, 400, helpers);

      const c = await loadCustomer(id);
      if (!c) return send(res, { ok: false, error: 'customer_not_found' }, 404, helpers);

      let history = [];
      try {
        history = await supabaseRequest('GET',
          `/loyalty_transactions?customer_id=eq.${encodeURIComponent(id)}&select=type,points,balance_after,source,reward_id,sale_id,notes,ts&order=ts.desc&limit=100`) || [];
      } catch (_) { history = []; }

      const thresholds = await loadTierThresholds(supabaseRequest, c.tenant_id);
      const currentTier = String(c.tier || computeTier(c.annual_spend, thresholds)).toLowerCase();
      const next = nextTier(currentTier);
      const nextTh = next ? (thresholds[next] || DEFAULT_TIER_THRESHOLDS[next]) : null;
      const progress = next ? {
        next_tier: next,
        current_spend: Number(c.annual_spend || 0),
        required_spend: Number(nextTh.min_annual_spend || 0),
        remaining: Math.max(0, Number(nextTh.min_annual_spend || 0) - Number(c.annual_spend || 0)),
      } : { next_tier: null, message: 'max_tier_reached' };

      return send(res, {
        ok: true,
        customer: { id: c.id, name: c.name, email: c.email, birthday: c.birthday },
        balance: Number(c.loyalty_points || 0),
        tier: currentTier,
        annual_spend: Number(c.annual_spend || 0),
        progress,
        perks: (thresholds[currentTier] || {}).perks || [],
        history,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/rewards-catalog --------
  handlers['GET /api/loyalty/rewards-catalog'] = auth(async (req, res) => {
    try {
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const tenantId = String(parsed.query.tenant_id || tenantOf(req) || '').trim();
      if (!tenantId) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);

      let rewards = [];
      try {
        rewards = await supabaseRequest('GET',
          `/loyalty_rewards?tenant_id=eq.${encodeURIComponent(tenantId)}&active=eq.true&select=*&order=points_cost.asc`) || [];
      } catch (_) { rewards = []; }

      return send(res, { ok: true, rewards }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- POST /api/loyalty/rewards (admin) --------
  handlers['POST /api/loyalty/rewards'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const body = await readBodySafe(req, helpers);
      const name = String((body && body.name) || '').trim();
      const type = String((body && body.reward_type) || '').trim();
      const validTypes = ['discount_pct', 'free_product', 'cashback', 'physical_gift'];
      if (!name) return send(res, { ok: false, error: 'name_required' }, 400, helpers);
      if (!validTypes.includes(type)) return send(res, { ok: false, error: 'invalid_reward_type' }, 400, helpers);

      const row = {
        tenant_id: body.tenant_id || tenantOf(req),
        name,
        description: body.description || null,
        reward_type: type,
        value: Number(body.value || 0),
        points_cost: parseInt(body.points_cost, 10) || 0,
        tier_required: body.tier_required && TIERS.includes(String(body.tier_required).toLowerCase())
          ? String(body.tier_required).toLowerCase() : null,
        stock: (body.stock === null || body.stock === undefined || body.stock === '') ? null : parseInt(body.stock, 10),
        active: body.active !== false,
      };
      if (!row.tenant_id) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);

      const r = await supabaseRequest('POST', '/loyalty_rewards', row);
      const saved = Array.isArray(r) ? r[0] : r;
      return send(res, { ok: true, reward: saved }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- PATCH /api/loyalty/rewards/:id (admin) --------
  handlers['PATCH /api/loyalty/rewards/:id'] = auth(async (req, res, params) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const id = params && params.id;
      if (!isUuidLike(id)) return send(res, { ok: false, error: 'invalid_id' }, 400, helpers);
      const body = await readBodySafe(req, helpers);
      const allowed = ['name', 'description', 'reward_type', 'value', 'points_cost', 'tier_required', 'stock', 'active'];
      const patch = {};
      for (const k of allowed) if (k in (body || {})) patch[k] = body[k];
      if (Object.keys(patch).length === 0) return send(res, { ok: false, error: 'no_fields' }, 400, helpers);
      const r = await supabaseRequest('PATCH',
        `/loyalty_rewards?id=eq.${encodeURIComponent(id)}`, patch);
      return send(res, { ok: true, reward: Array.isArray(r) ? r[0] : r }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- DELETE /api/loyalty/rewards/:id (admin) --------
  handlers['DELETE /api/loyalty/rewards/:id'] = auth(async (req, res, params) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const id = params && params.id;
      if (!isUuidLike(id)) return send(res, { ok: false, error: 'invalid_id' }, 400, helpers);
      // Soft delete (deactivate) preferred:
      await supabaseRequest('PATCH',
        `/loyalty_rewards?id=eq.${encodeURIComponent(id)}`, { active: false });
      return send(res, { ok: true, id, soft_deleted: true }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/tiers-config --------
  handlers['GET /api/loyalty/tiers-config'] = auth(async (req, res) => {
    try {
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const tenantId = String(parsed.query.tenant_id || tenantOf(req) || '').trim();
      if (!tenantId) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);
      const thresholds = await loadTierThresholds(supabaseRequest, tenantId);
      return send(res, { ok: true, tiers: thresholds }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- POST /api/loyalty/tiers-config (admin) — upsert --------
  handlers['POST /api/loyalty/tiers-config'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const body = await readBodySafe(req, helpers);
      const tenantId = body.tenant_id || tenantOf(req);
      if (!tenantId) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);
      const tier = String((body && body.tier) || '').toLowerCase();
      if (!TIERS.includes(tier)) return send(res, { ok: false, error: 'invalid_tier' }, 400, helpers);

      const row = {
        tenant_id: tenantId,
        tier,
        min_annual_spend: Number(body.min_annual_spend || 0),
        points_per_dollar: Number(body.points_per_dollar || 1),
        perks: Array.isArray(body.perks) ? body.perks : [],
      };
      // Upsert: try update first, then insert
      let result;
      try {
        const existing = await supabaseRequest('GET',
          `/loyalty_tier_config?tenant_id=eq.${encodeURIComponent(tenantId)}&tier=eq.${encodeURIComponent(tier)}&select=id`);
        if (Array.isArray(existing) && existing.length) {
          result = await supabaseRequest('PATCH',
            `/loyalty_tier_config?id=eq.${encodeURIComponent(existing[0].id)}`, row);
        } else {
          result = await supabaseRequest('POST', '/loyalty_tier_config', row);
        }
      } catch (e) {
        return send(res, { ok: false, error: 'upsert_failed', detail: String(e.message || e) }, 500, helpers);
      }
      return send(res, { ok: true, tier_config: Array.isArray(result) ? result[0] : result }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/top-customers (admin) --------
  handlers['GET /api/loyalty/top-customers'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const tenantId = String(parsed.query.tenant_id || tenantOf(req) || '').trim();
      const limit = Math.min(200, Math.max(1, parseInt(parsed.query.limit, 10) || 50));
      if (!tenantId) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);

      let rows = [];
      try {
        rows = await supabaseRequest('GET',
          `/customers?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,name,email,loyalty_points,tier,annual_spend&order=loyalty_points.desc&limit=${limit}`) || [];
      } catch (_) { rows = []; }
      return send(res, { ok: true, top: rows }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/stats (admin) --------
  handlers['GET /api/loyalty/stats'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const tenantId = String(parsed.query.tenant_id || tenantOf(req) || '').trim();
      if (!tenantId) return send(res, { ok: false, error: 'tenant_required' }, 400, helpers);

      let customers = [];
      try {
        customers = await supabaseRequest('GET',
          `/customers?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,loyalty_points,tier&limit=10000`) || [];
      } catch (_) { customers = []; }

      const totalOutstanding = customers.reduce((s, c) => s + Number(c.loyalty_points || 0), 0);
      const dist = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
      for (const c of customers) {
        const t = String(c.tier || 'bronze').toLowerCase();
        if (dist[t] !== undefined) dist[t]++;
      }

      // Redeemed last 30d
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      let redeemed30d = 0;
      try {
        const tx = await supabaseRequest('GET',
          `/loyalty_transactions?tenant_id=eq.${encodeURIComponent(tenantId)}&type=eq.redeem&ts=gte.${encodeURIComponent(since)}&select=points&limit=10000`) || [];
        redeemed30d = tx.reduce((s, t) => s + Math.abs(Number(t.points || 0)), 0);
      } catch (_) { redeemed30d = 0; }

      return send(res, {
        ok: true,
        total_points_outstanding: totalOutstanding,
        redeemed_last_30d: redeemed30d,
        tier_distribution: dist,
        customers_count: customers.length,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- GET /api/loyalty/share-link (referral) --------
  handlers['GET /api/loyalty/share-link'] = auth(async (req, res) => {
    try {
      const u = req.user || {};
      const userId = u.id || u.user_id || u.email || 'anon';
      const base = process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app';
      const link = base + '/volvix-loyalty-customer.html?ref=' + encodeURIComponent(userId);
      return send(res, {
        ok: true,
        link,
        share_text: 'Únete al programa de lealtad y gana puntos en cada compra: ' + link,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // -------- POST /api/cron/birthday-rewards --------
  handlers['POST /api/cron/birthday-rewards'] = async (req, res) => {
    try {
      if (!isCronAuthorized(req)) return send(res, { ok: false, error: 'unauthorized' }, 401, helpers);
      if (typeof supabaseRequest !== 'function') {
        return send(res, { ok: false, error: 'no_db' }, 503, helpers);
      }

      const today = new Date();
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(today.getUTCDate()).padStart(2, '0');

      // Pull all customers with a birthday set; filter by month/day client-side
      // (Postgres has extract; without a helper RPC we filter client-side.)
      let customers = [];
      try {
        customers = await supabaseRequest('GET',
          `/customers?birthday=not.is.null&select=id,tenant_id,name,email,birthday,loyalty_points&limit=10000`) || [];
      } catch (_) { customers = []; }

      const todays = customers.filter((c) => {
        if (!c.birthday) return false;
        const parts = String(c.birthday).slice(0, 10).split('-'); // YYYY-MM-DD
        return parts.length === 3 && parts[1] === mm && parts[2] === dd;
      });

      const BIRTHDAY_BONUS = parseInt(process.env.LOYALTY_BIRTHDAY_BONUS || '100', 10);
      let granted = 0;
      let mailed = 0;
      let failed = 0;

      for (const c of todays) {
        // Idempotency: skip if already a birthday tx today
        try {
          const since = new Date(); since.setUTCHours(0, 0, 0, 0);
          const existing = await supabaseRequest('GET',
            `/loyalty_transactions?customer_id=eq.${encodeURIComponent(c.id)}&type=eq.birthday&ts=gte.${encodeURIComponent(since.toISOString())}&select=id&limit=1`);
          if (Array.isArray(existing) && existing.length) continue;
        } catch (_) { /* if check fails, proceed */ }

        const newBalance = Number(c.loyalty_points || 0) + BIRTHDAY_BONUS;
        try {
          await supabaseRequest('POST', '/loyalty_transactions', {
            tenant_id: c.tenant_id,
            customer_id: c.id,
            type: 'birthday',
            points: BIRTHDAY_BONUS,
            balance_after: newBalance,
            source: 'birthday',
            ts: new Date().toISOString(),
          });
          await supabaseRequest('PATCH',
            `/customers?id=eq.${encodeURIComponent(c.id)}`,
            { loyalty_points: newBalance });
          granted++;
        } catch (_) { failed++; continue; }

        if (c.email && typeof sendEmail === 'function') {
          try {
            await sendEmail({
              to: c.email,
              subject: 'Feliz cumpleaños ' + (c.name || '') + '!',
              html: `<h1>Feliz cumpleaños${c.name ? ', ' + c.name : ''}!</h1>
                     <p>Te regalamos <strong>${BIRTHDAY_BONUS} puntos</strong> de lealtad como regalo.</p>
                     <p>Tu nuevo saldo: <strong>${newBalance} puntos</strong>.</p>
                     <p>Disfruta tu día!</p>`,
            });
            mailed++;
          } catch (_) { /* email failure is non-fatal */ }
        }
      }

      return send(res, {
        ok: true,
        date: `${today.getUTCFullYear()}-${mm}-${dd}`,
        candidates: todays.length,
        granted,
        emails_sent: mailed,
        failed,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  return [
    'POST /api/loyalty/earn',
    'POST /api/loyalty/redeem-reward',
    'GET /api/loyalty/customer/:id',
    'GET /api/loyalty/rewards-catalog',
    'POST /api/loyalty/rewards',
    'PATCH /api/loyalty/rewards/:id',
    'DELETE /api/loyalty/rewards/:id',
    'GET /api/loyalty/tiers-config',
    'POST /api/loyalty/tiers-config',
    'GET /api/loyalty/top-customers',
    'GET /api/loyalty/stats',
    'GET /api/loyalty/share-link',
    'POST /api/cron/birthday-rewards',
  ];
}

module.exports = {
  register,
  computeTier,
  nextTier,
  TIERS,
  DEFAULT_TIER_THRESHOLDS,
};
