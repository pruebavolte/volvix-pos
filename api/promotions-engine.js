'use strict';

/**
 * api/promotions-engine.js
 * Volvix POS — Advanced promotions, coupons, flash sales & bundle deals.
 *
 * ROUTES
 * ------
 *   Promotions:
 *     POST   /api/promotions                 (admin) body: { tenant_id, code?, name, type, value, min_subtotal?, products?, buy_qty?, get_qty?, get_discount_pct?, threshold_amount?, reward_product_id?, reward_qty?, starts_at?, ends_at?, max_uses?, max_uses_per_customer? }
 *     GET    /api/promotions?tenant_id=X
 *     GET    /api/promotions/active?tenant_id=X
 *     PUT    /api/promotions/:id             (admin)
 *     DELETE /api/promotions/:id             (admin)
 *     POST   /api/promotions/validate        body: { code, cart:{tenant_id, items:[{product_id, qty, price}], subtotal}, customer_id? }
 *
 *   Coupons:
 *     POST   /api/coupons/generate           (admin) body: { tenant_id, promotion_id, count, prefix?, length? }
 *     GET    /api/coupons?tenant_id=X&promotion_id=Y
 *     POST   /api/coupons/redeem             body: { code, cart, customer_id? }
 *
 *   Flash sales:
 *     POST   /api/flash-sales                (admin) body: { tenant_id, name, products:[{product_id, sale_price}], discount_pct?, start_at, end_at }
 *     GET    /api/flash-sales?tenant_id=X
 *     GET    /api/flash-sales/active?tenant_id=X
 *     PUT    /api/flash-sales/:id            (admin)
 *     DELETE /api/flash-sales/:id            (admin)
 *
 *   Bundles:
 *     POST   /api/bundles                    (admin) body: { tenant_id, name, products:[product_id...], bundle_price, image_url? }
 *     GET    /api/bundles?tenant_id=X
 *     POST   /api/bundles/detect             body: { cart:{items:[{product_id, qty}]}, tenant_id }
 *     PUT    /api/bundles/:id                (admin)
 *     DELETE /api/bundles/:id                (admin)
 *
 *   Stats:
 *     GET    /api/promotions/stats?tenant_id=X
 *
 * DB TABLES (Supabase / PostgreSQL)
 * ---------------------------------
 *   create table if not exists promotions (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     code text,                              -- optional cupón principal (null = auto-aplica)
 *     name text not null,
 *     type text not null,                     -- percent_off | fixed_off | bogo | bundle | threshold
 *     value numeric default 0,                -- % o $ según type
 *     min_subtotal numeric default 0,
 *     products jsonb,                         -- array de product_id (scope opcional)
 *     buy_qty int,                            -- BOGO: comprar X
 *     get_qty int,                            -- BOGO: llevar Y
 *     get_discount_pct numeric,               -- BOGO: % desc en el "get" (100 = gratis)
 *     threshold_amount numeric,               -- gasta $X
 *     reward_product_id uuid,                 -- producto regalo en threshold
 *     reward_qty int default 1,
 *     starts_at timestamptz,
 *     ends_at timestamptz,
 *     max_uses int,
 *     max_uses_per_customer int,
 *     uses_count int default 0,
 *     revenue_impact numeric default 0,
 *     active boolean default true,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 *   create unique index if not exists promotions_code_tenant_uniq
 *     on promotions(tenant_id, lower(code)) where code is not null;
 *
 *   create table if not exists coupons (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     promotion_id uuid not null references promotions(id) on delete cascade,
 *     code text not null,
 *     redeemed_at timestamptz,
 *     redeemed_by uuid,
 *     created_at timestamptz default now()
 *   );
 *   create unique index if not exists coupons_code_uniq on coupons(tenant_id, code);
 *
 *   create table if not exists promotion_redemptions (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     promotion_id uuid not null,
 *     customer_id uuid,
 *     coupon_code text,
 *     order_id uuid,
 *     discount_amount numeric default 0,
 *     created_at timestamptz default now()
 *   );
 *
 *   create table if not exists flash_sales (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     name text not null,
 *     products jsonb not null,                -- [{product_id, sale_price, original_price?}]
 *     discount_pct numeric,
 *     start_at timestamptz not null,
 *     end_at timestamptz not null,
 *     active boolean default true,
 *     created_at timestamptz default now()
 *   );
 *
 *   create table if not exists bundles (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     name text not null,
 *     products jsonb not null,                -- array de product_id
 *     bundle_price numeric not null,
 *     image_url text,
 *     active boolean default true,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 */

const crypto = require('crypto');

// ---------- helpers ----------

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function err(res, status, code, message, extra) {
  return send(res, status, Object.assign({ error: message, code }, extra || {}));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let buf = '';
    let total = 0;
    const limit = 1024 * 1024;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { req.destroy(); return reject(new Error('body_too_large')); }
      buf += c;
    });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (_e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isAdmin(user) {
  if (!user) return false;
  const role = String(user.role || user.user_role || '').toLowerCase();
  return role === 'admin' || role === 'superadmin' || role === 'owner';
}

async function sb(ctx, method, path, body) {
  if (!ctx || typeof ctx.supabaseRequest !== 'function') {
    throw new Error('supabase_unavailable');
  }
  return ctx.supabaseRequest(method, path, body);
}

function pickId(pathname, prefix) {
  const rest = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  return rest.split('/')[0] || null;
}

function getUser(ctx, req) {
  if (ctx && typeof ctx.getAuthUser === 'function') return ctx.getAuthUser(req);
  return req.user || null;
}

function nowIso() { return new Date().toISOString(); }

const PROMO_TYPES = ['percent_off', 'fixed_off', 'bogo', 'bundle', 'threshold'];

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def == null ? null : def);
}

function intIn(v, min, max, def) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function randomCode(length, prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return (prefix ? String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) + '-' : '') + out;
}

// ---------- promotions CRUD ----------

async function createPromotion(ctx, req, res) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');

  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const tenantId = body.tenant_id || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');

  const type = String(body.type || '').toLowerCase();
  if (!PROMO_TYPES.includes(type)) return err(res, 400, 'bad_type', 'type_invalid', { valid: PROMO_TYPES });

  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return err(res, 400, 'bad_name', 'name_required');

  const row = {
    tenant_id: tenantId,
    code: body.code ? String(body.code).toUpperCase().trim().slice(0, 60) : null,
    name,
    type,
    value: num(body.value, 0),
    min_subtotal: num(body.min_subtotal, 0),
    products: Array.isArray(body.products) ? body.products.filter(isUuid) : null,
    buy_qty: body.buy_qty != null ? intIn(body.buy_qty, 1, 100, null) : null,
    get_qty: body.get_qty != null ? intIn(body.get_qty, 1, 100, null) : null,
    get_discount_pct: body.get_discount_pct != null ? num(body.get_discount_pct, 100) : null,
    threshold_amount: body.threshold_amount != null ? num(body.threshold_amount, 0) : null,
    reward_product_id: isUuid(body.reward_product_id) ? body.reward_product_id : null,
    reward_qty: body.reward_qty != null ? intIn(body.reward_qty, 1, 100, 1) : 1,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    max_uses: body.max_uses != null ? intIn(body.max_uses, 1, 1000000, null) : null,
    max_uses_per_customer: body.max_uses_per_customer != null ? intIn(body.max_uses_per_customer, 1, 1000, null) : null,
    active: body.active !== false,
  };

  // Type-specific validation
  if (type === 'percent_off' && (row.value <= 0 || row.value > 100)) return err(res, 400, 'bad_value', 'percent_must_be_1_100');
  if (type === 'fixed_off'   && row.value <= 0)                       return err(res, 400, 'bad_value', 'fixed_must_be_positive');
  if (type === 'bogo'        && (!row.buy_qty || !row.get_qty))       return err(res, 400, 'bad_bogo', 'buy_qty_and_get_qty_required');
  if (type === 'threshold'   && (!row.threshold_amount || row.threshold_amount <= 0)) return err(res, 400, 'bad_threshold', 'threshold_amount_required');

  const created = await sb(ctx, 'POST', '/promotions', row);
  return send(res, 201, { ok: true, promotion: Array.isArray(created) ? created[0] : created });
}

async function listPromotions(ctx, req, res, parsedUrl) {
  const user = getUser(ctx, req);
  if (!user) return err(res, 401, 'unauthorized', 'login_required');
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || user.tenant_id;
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const rows = await sb(ctx, 'GET', '/promotions?tenant_id=eq.' + tenantId + '&order=created_at.desc');
  return send(res, 200, { ok: true, promotions: rows || [] });
}

async function activePromotions(ctx, req, res, parsedUrl) {
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || (req.user && req.user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const now = encodeURIComponent(nowIso());
  const q = '/promotions?tenant_id=eq.' + tenantId + '&active=is.true' +
            '&or=(starts_at.is.null,starts_at.lte.' + now + ')' +
            '&order=created_at.desc';
  const rows = await sb(ctx, 'GET', q);
  // Filter ends_at server-side too (PostgREST OR is awkward for two ranges)
  const today = Date.now();
  const filtered = (rows || []).filter(r => !r.ends_at || new Date(r.ends_at).getTime() > today);
  return send(res, 200, { ok: true, promotions: filtered });
}

async function updatePromotion(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const patch = {};
  ['name', 'code', 'value', 'min_subtotal', 'starts_at', 'ends_at', 'max_uses',
   'max_uses_per_customer', 'active', 'products', 'buy_qty', 'get_qty',
   'get_discount_pct', 'threshold_amount', 'reward_product_id', 'reward_qty']
    .forEach(k => { if (k in body) patch[k] = body[k]; });
  patch.updated_at = nowIso();

  const updated = await sb(ctx, 'PATCH', '/promotions?id=eq.' + id, patch);
  return send(res, 200, { ok: true, promotion: Array.isArray(updated) ? updated[0] : updated });
}

async function deletePromotion(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  await sb(ctx, 'DELETE', '/promotions?id=eq.' + id);
  return send(res, 200, { ok: true });
}

// ---------- promotion validation engine ----------

function calcDiscount(promo, cart) {
  const subtotal = num(cart.subtotal, 0) || (cart.items || []).reduce((s, it) => s + (num(it.price, 0) * num(it.qty, 1)), 0);
  if (subtotal < num(promo.min_subtotal, 0)) {
    return { ok: false, reason: 'min_subtotal_not_met', required: promo.min_subtotal };
  }

  const items = Array.isArray(cart.items) ? cart.items : [];
  const scope = Array.isArray(promo.products) && promo.products.length
    ? items.filter(it => promo.products.includes(it.product_id))
    : items;
  const scopeSubtotal = scope.reduce((s, it) => s + (num(it.price, 0) * num(it.qty, 1)), 0);

  switch (promo.type) {
    case 'percent_off': {
      const d = scopeSubtotal * (num(promo.value, 0) / 100);
      return { ok: true, discount: round2(d), description: promo.value + '% off' };
    }
    case 'fixed_off': {
      const d = Math.min(num(promo.value, 0), subtotal);
      return { ok: true, discount: round2(d), description: '$' + promo.value + ' off' };
    }
    case 'bogo': {
      const buy = num(promo.buy_qty, 1), getQ = num(promo.get_qty, 1);
      const pct = num(promo.get_discount_pct, 100) / 100;
      // group eligible items by product
      const totalScopeQty = scope.reduce((s, it) => s + num(it.qty, 1), 0);
      if (totalScopeQty < buy + getQ) {
        return { ok: false, reason: 'bogo_min_qty_not_met', required: buy + getQ };
      }
      // Apply discount to cheapest items (the "get")
      const sorted = scope.slice().sort((a, b) => num(a.price, 0) - num(b.price, 0));
      let toDiscount = Math.floor(totalScopeQty / (buy + getQ)) * getQ;
      let discount = 0;
      for (const it of sorted) {
        if (toDiscount <= 0) break;
        const take = Math.min(num(it.qty, 1), toDiscount);
        discount += take * num(it.price, 0) * pct;
        toDiscount -= take;
      }
      return { ok: true, discount: round2(discount), description: 'BOGO ' + buy + '+' + getQ };
    }
    case 'threshold': {
      if (subtotal < num(promo.threshold_amount, 0)) {
        return { ok: false, reason: 'threshold_not_met', required: promo.threshold_amount };
      }
      return {
        ok: true,
        discount: 0,
        free_product: { product_id: promo.reward_product_id, qty: promo.reward_qty || 1 },
        description: 'Gasta $' + promo.threshold_amount + ' obtén regalo',
      };
    }
    case 'bundle': {
      // bundle promotions are detected via /api/bundles/detect, but fall through to flat % off scope
      const d = scopeSubtotal * (num(promo.value, 0) / 100);
      return { ok: true, discount: round2(d), description: 'Bundle' };
    }
    default:
      return { ok: false, reason: 'unknown_type' };
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

async function validatePromotion(ctx, req, res) {
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const code = String(body.code || '').toUpperCase().trim();
  if (!code) return err(res, 400, 'bad_code', 'code_required');

  const cart = body.cart || {};
  const tenantId = cart.tenant_id || body.tenant_id;
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');

  // First search promotions.code, then coupons table
  let rows = await sb(ctx, 'GET', '/promotions?tenant_id=eq.' + tenantId + '&code=eq.' + encodeURIComponent(code) + '&active=is.true');
  let coupon = null;
  let promo = (rows && rows[0]) || null;

  if (!promo) {
    const coup = await sb(ctx, 'GET', '/coupons?tenant_id=eq.' + tenantId + '&code=eq.' + encodeURIComponent(code) + '&redeemed_at=is.null');
    if (coup && coup[0]) {
      coupon = coup[0];
      const p = await sb(ctx, 'GET', '/promotions?id=eq.' + coupon.promotion_id + '&active=is.true');
      promo = (p && p[0]) || null;
    }
  }

  if (!promo) return err(res, 404, 'not_found', 'code_invalid_or_expired');

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return err(res, 400, 'not_started', 'promo_not_yet_active');
  if (promo.ends_at   && new Date(promo.ends_at).getTime()  < now) return err(res, 400, 'expired', 'promo_expired');
  if (promo.max_uses && (promo.uses_count || 0) >= promo.max_uses) return err(res, 400, 'maxed', 'max_uses_reached');

  const result = calcDiscount(promo, cart);
  if (!result.ok) return err(res, 400, 'cart_not_eligible', result.reason, { required: result.required });

  return send(res, 200, {
    ok: true,
    promotion_id: promo.id,
    type: promo.type,
    name: promo.name,
    discount: result.discount || 0,
    free_product: result.free_product || null,
    description: result.description,
    coupon_id: coupon ? coupon.id : null,
  });
}

// ---------- coupons ----------

async function generateCoupons(ctx, req, res) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');

  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const tenantId = body.tenant_id || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  if (!isUuid(body.promotion_id)) return err(res, 400, 'bad_promo', 'promotion_id_required');

  const count = intIn(body.count, 1, 5000, 100);
  const length = intIn(body.length, 6, 16, 8);
  const prefix = body.prefix ? String(body.prefix) : '';

  const rows = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    let code;
    do { code = randomCode(length, prefix); } while (seen.has(code));
    seen.add(code);
    rows.push({ tenant_id: tenantId, promotion_id: body.promotion_id, code });
  }

  // Insert in chunks of 500 to avoid payload limits
  const created = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const out = await sb(ctx, 'POST', '/coupons', chunk);
    if (Array.isArray(out)) created.push.apply(created, out);
  }
  return send(res, 201, { ok: true, generated: created.length, sample: created.slice(0, 5) });
}

async function listCoupons(ctx, req, res, parsedUrl) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  const q = parsedUrl.query || {};
  const tenantId = q.tenant_id || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  let path = '/coupons?tenant_id=eq.' + tenantId;
  if (isUuid(q.promotion_id)) path += '&promotion_id=eq.' + q.promotion_id;
  path += '&order=created_at.desc&limit=500';
  const rows = await sb(ctx, 'GET', path);
  return send(res, 200, { ok: true, coupons: rows || [] });
}

async function redeemCoupon(ctx, req, res) {
  // alias to validate + mark redeemed
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const tenantId = (body.cart && body.cart.tenant_id) || body.tenant_id;
  const code = String(body.code || '').toUpperCase().trim();
  if (!isUuid(tenantId) || !code) return err(res, 400, 'bad_input', 'tenant_and_code_required');

  const coup = await sb(ctx, 'GET', '/coupons?tenant_id=eq.' + tenantId + '&code=eq.' + encodeURIComponent(code) + '&redeemed_at=is.null');
  if (!coup || !coup[0]) return err(res, 404, 'not_found', 'coupon_invalid_or_used');
  const coupon = coup[0];

  const p = await sb(ctx, 'GET', '/promotions?id=eq.' + coupon.promotion_id + '&active=is.true');
  const promo = (p && p[0]) || null;
  if (!promo) return err(res, 400, 'inactive', 'promo_inactive');

  const result = calcDiscount(promo, body.cart || {});
  if (!result.ok) return err(res, 400, 'cart_not_eligible', result.reason);

  await sb(ctx, 'PATCH', '/coupons?id=eq.' + coupon.id, {
    redeemed_at: nowIso(),
    redeemed_by: body.customer_id || null,
  });
  await sb(ctx, 'POST', '/promotion_redemptions', {
    tenant_id: tenantId,
    promotion_id: promo.id,
    customer_id: body.customer_id || null,
    coupon_code: code,
    discount_amount: result.discount || 0,
  });
  // increment uses_count
  await sb(ctx, 'PATCH', '/promotions?id=eq.' + promo.id, { uses_count: (promo.uses_count || 0) + 1 });

  return send(res, 200, {
    ok: true,
    redeemed: true,
    discount: result.discount || 0,
    free_product: result.free_product || null,
    description: result.description,
  });
}

// ---------- flash sales ----------

async function createFlashSale(ctx, req, res) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const tenantId = body.tenant_id || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  if (!body.start_at || !body.end_at) return err(res, 400, 'bad_dates', 'start_and_end_required');
  if (!Array.isArray(body.products) || !body.products.length) return err(res, 400, 'bad_products', 'products_required');

  const row = {
    tenant_id: tenantId,
    name: String(body.name || 'Flash Sale').slice(0, 120),
    products: body.products,
    discount_pct: body.discount_pct != null ? num(body.discount_pct, 0) : null,
    start_at: body.start_at,
    end_at: body.end_at,
    active: body.active !== false,
  };
  const out = await sb(ctx, 'POST', '/flash_sales', row);
  return send(res, 201, { ok: true, flash_sale: Array.isArray(out) ? out[0] : out });
}

async function listFlashSales(ctx, req, res, parsedUrl) {
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || (req.user && req.user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const rows = await sb(ctx, 'GET', '/flash_sales?tenant_id=eq.' + tenantId + '&order=start_at.desc');
  return send(res, 200, { ok: true, flash_sales: rows || [] });
}

async function activeFlashSales(ctx, req, res, parsedUrl) {
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || (req.user && req.user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const now = encodeURIComponent(nowIso());
  const rows = await sb(ctx, 'GET', '/flash_sales?tenant_id=eq.' + tenantId +
    '&active=is.true&start_at=lte.' + now + '&end_at=gte.' + now + '&order=end_at.asc');
  return send(res, 200, { ok: true, flash_sales: rows || [] });
}

async function updateFlashSale(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }
  const patch = {};
  ['name', 'products', 'discount_pct', 'start_at', 'end_at', 'active']
    .forEach(k => { if (k in body) patch[k] = body[k]; });
  const out = await sb(ctx, 'PATCH', '/flash_sales?id=eq.' + id, patch);
  return send(res, 200, { ok: true, flash_sale: Array.isArray(out) ? out[0] : out });
}

async function deleteFlashSale(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  await sb(ctx, 'DELETE', '/flash_sales?id=eq.' + id);
  return send(res, 200, { ok: true });
}

// ---------- bundles ----------

async function createBundle(ctx, req, res) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }

  const tenantId = body.tenant_id || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  if (!Array.isArray(body.products) || body.products.length < 2) return err(res, 400, 'bad_products', 'min_2_products');
  if (!Number.isFinite(num(body.bundle_price)) || num(body.bundle_price) <= 0) return err(res, 400, 'bad_price', 'bundle_price_required');

  const row = {
    tenant_id: tenantId,
    name: String(body.name || 'Bundle').slice(0, 120),
    products: body.products.filter(isUuid),
    bundle_price: num(body.bundle_price),
    image_url: body.image_url || null,
    active: body.active !== false,
  };
  const out = await sb(ctx, 'POST', '/bundles', row);
  return send(res, 201, { ok: true, bundle: Array.isArray(out) ? out[0] : out });
}

async function listBundles(ctx, req, res, parsedUrl) {
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || (req.user && req.user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const rows = await sb(ctx, 'GET', '/bundles?tenant_id=eq.' + tenantId + '&active=is.true&order=created_at.desc');
  return send(res, 200, { ok: true, bundles: rows || [] });
}

async function detectBundles(ctx, req, res) {
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }
  const tenantId = body.tenant_id || (body.cart && body.cart.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');
  const items = (body.cart && Array.isArray(body.cart.items)) ? body.cart.items : [];
  if (!items.length) return send(res, 200, { ok: true, applicable: [] });

  const cartProductIds = new Set(items.map(it => it.product_id));
  const bundles = await sb(ctx, 'GET', '/bundles?tenant_id=eq.' + tenantId + '&active=is.true');
  const applicable = [];

  for (const b of (bundles || [])) {
    const reqIds = Array.isArray(b.products) ? b.products : [];
    if (reqIds.length && reqIds.every(id => cartProductIds.has(id))) {
      // calculate savings vs sum of cart prices
      const sum = items
        .filter(it => reqIds.includes(it.product_id))
        .reduce((s, it) => s + num(it.price, 0) * Math.min(num(it.qty, 1), 1), 0);
      const savings = round2(Math.max(0, sum - num(b.bundle_price, 0)));
      applicable.push({
        bundle_id: b.id,
        name: b.name,
        bundle_price: b.bundle_price,
        regular_total: round2(sum),
        savings,
      });
    }
  }
  return send(res, 200, { ok: true, applicable });
}

async function updateBundle(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', e.message); }
  const patch = {};
  ['name', 'products', 'bundle_price', 'image_url', 'active']
    .forEach(k => { if (k in body) patch[k] = body[k]; });
  patch.updated_at = nowIso();
  const out = await sb(ctx, 'PATCH', '/bundles?id=eq.' + id, patch);
  return send(res, 200, { ok: true, bundle: Array.isArray(out) ? out[0] : out });
}

async function deleteBundle(ctx, req, res, id) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'id_invalid');
  await sb(ctx, 'DELETE', '/bundles?id=eq.' + id);
  return send(res, 200, { ok: true });
}

// ---------- stats ----------

async function promoStats(ctx, req, res, parsedUrl) {
  const user = getUser(ctx, req);
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin_required');
  const tenantId = (parsedUrl.query && parsedUrl.query.tenant_id) || (user && user.tenant_id);
  if (!isUuid(tenantId)) return err(res, 400, 'bad_tenant', 'tenant_id_required');

  const promos = await sb(ctx, 'GET', '/promotions?tenant_id=eq.' + tenantId + '&select=id,name,type,uses_count,revenue_impact');
  const coupons = await sb(ctx, 'GET', '/coupons?tenant_id=eq.' + tenantId + '&select=id,redeemed_at');
  const redemptions = await sb(ctx, 'GET', '/promotion_redemptions?tenant_id=eq.' + tenantId + '&select=discount_amount,promotion_id');

  const totalRedeemed = (coupons || []).filter(c => c.redeemed_at).length;
  const totalIssued = (coupons || []).length;
  const revenueImpact = (redemptions || []).reduce((s, r) => s + num(r.discount_amount, 0), 0);
  const top = (promos || [])
    .slice()
    .sort((a, b) => num(b.uses_count, 0) - num(a.uses_count, 0))
    .slice(0, 10);

  return send(res, 200, {
    ok: true,
    stats: {
      total_promotions: (promos || []).length,
      total_coupons_issued: totalIssued,
      total_coupons_redeemed: totalRedeemed,
      redemption_rate: totalIssued ? round2(totalRedeemed / totalIssued * 100) : 0,
      total_revenue_impact: round2(revenueImpact),
      top_performing: top,
    },
  });
}

// ---------- dispatcher ----------

module.exports = async function handlePromotionsEngine(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  if (!pathname.startsWith('/api/promotions') &&
      !pathname.startsWith('/api/coupons') &&
      !pathname.startsWith('/api/flash-sales') &&
      !pathname.startsWith('/api/bundles')) {
    return false;
  }

  try {
    // Promotions
    if (pathname === '/api/promotions/active' && method === 'GET') {
      await activePromotions(ctx, req, res, parsedUrl); return true;
    }
    if (pathname === '/api/promotions/validate' && method === 'POST') {
      await validatePromotion(ctx, req, res); return true;
    }
    if (pathname === '/api/promotions/stats' && method === 'GET') {
      await promoStats(ctx, req, res, parsedUrl); return true;
    }
    if (pathname === '/api/promotions' && method === 'POST') {
      await createPromotion(ctx, req, res); return true;
    }
    if (pathname === '/api/promotions' && method === 'GET') {
      await listPromotions(ctx, req, res, parsedUrl); return true;
    }
    if (pathname.startsWith('/api/promotions/') && method === 'PUT') {
      await updatePromotion(ctx, req, res, pickId(pathname, '/api/promotions/')); return true;
    }
    if (pathname.startsWith('/api/promotions/') && method === 'DELETE') {
      await deletePromotion(ctx, req, res, pickId(pathname, '/api/promotions/')); return true;
    }

    // Coupons
    if (pathname === '/api/coupons/generate' && method === 'POST') {
      await generateCoupons(ctx, req, res); return true;
    }
    if (pathname === '/api/coupons/redeem' && method === 'POST') {
      await redeemCoupon(ctx, req, res); return true;
    }
    if (pathname === '/api/coupons' && method === 'GET') {
      await listCoupons(ctx, req, res, parsedUrl); return true;
    }

    // Flash sales
    if (pathname === '/api/flash-sales/active' && method === 'GET') {
      await activeFlashSales(ctx, req, res, parsedUrl); return true;
    }
    if (pathname === '/api/flash-sales' && method === 'POST') {
      await createFlashSale(ctx, req, res); return true;
    }
    if (pathname === '/api/flash-sales' && method === 'GET') {
      await listFlashSales(ctx, req, res, parsedUrl); return true;
    }
    if (pathname.startsWith('/api/flash-sales/') && method === 'PUT') {
      await updateFlashSale(ctx, req, res, pickId(pathname, '/api/flash-sales/')); return true;
    }
    if (pathname.startsWith('/api/flash-sales/') && method === 'DELETE') {
      await deleteFlashSale(ctx, req, res, pickId(pathname, '/api/flash-sales/')); return true;
    }

    // Bundles
    if (pathname === '/api/bundles/detect' && method === 'POST') {
      await detectBundles(ctx, req, res); return true;
    }
    if (pathname === '/api/bundles' && method === 'POST') {
      await createBundle(ctx, req, res); return true;
    }
    if (pathname === '/api/bundles' && method === 'GET') {
      await listBundles(ctx, req, res, parsedUrl); return true;
    }
    if (pathname.startsWith('/api/bundles/') && method === 'PUT') {
      await updateBundle(ctx, req, res, pickId(pathname, '/api/bundles/')); return true;
    }
    if (pathname.startsWith('/api/bundles/') && method === 'DELETE') {
      await deleteBundle(ctx, req, res, pickId(pathname, '/api/bundles/')); return true;
    }

    return false;
  } catch (e) {
    try { send(res, 500, { error: 'promotions_internal_error', detail: String(e && e.message || e) }); } catch (_) {}
    return true;
  }
};

module.exports.calcDiscount = calcDiscount;
module.exports.randomCode = randomCode;
