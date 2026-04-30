/**
 * R19 · Delivery Platform Integrations
 * Uber Eats · DiDi Food · Rappi · Sin Delantal · iFood · PedidosYa
 *
 * Usage from api/index.js:
 *   const handleDelivery = require('./integrations-delivery');
 *   // in the request handler (after parseUrl):
 *   if (await handleDelivery(req, res, parsedUrl, { supabaseRequest, sendJson })) return;
 *
 * Webhook endpoints:
 *   POST /api/webhooks/ubereats
 *   POST /api/webhooks/didi
 *   POST /api/webhooks/rappi
 *   POST /api/webhooks/sinDelantal
 *   POST /api/webhooks/ifood
 *   POST /api/webhooks/pedidosya
 *
 * Auth-protected endpoints:
 *   GET  /api/integrations/delivery/orders
 *   POST /api/integrations/delivery/orders/:id/accept
 *   POST /api/integrations/delivery/orders/:id/ready
 *   POST /api/integrations/delivery/configure
 *   GET  /api/integrations/delivery/config
 */

'use strict';

const crypto = require('crypto');

// ─── Env vars ────────────────────────────────────────────────────────────────
const UBEREATS_WEBHOOK_SECRET  = (process.env.UBEREATS_WEBHOOK_SECRET  || '').trim();
const DIDI_WEBHOOK_SECRET      = (process.env.DIDI_WEBHOOK_SECRET      || '').trim();
const RAPPI_WEBHOOK_SECRET     = (process.env.RAPPI_WEBHOOK_SECRET     || '').trim();
const SINDELANTAL_WEBHOOK_SEC  = (process.env.SINDELANTAL_WEBHOOK_SECRET || '').trim();
const IFOOD_WEBHOOK_SECRET     = (process.env.IFOOD_WEBHOOK_SECRET     || '').trim();
const PEDIDOSYA_WEBHOOK_SECRET = (process.env.PEDIDOSYA_WEBHOOK_SECRET || '').trim();

const SUPABASE_URL  = (process.env.SUPABASE_URL         || '').trim();
const SUPABASE_KEY  = (process.env.SUPABASE_SERVICE_KEY || '').trim();

// ─── One-time table bootstrap ─────────────────────────────────────────────────
let _tablesEnsured = false;

async function ensureDeliveryTables(supabaseRequest) {
  if (_tablesEnsured) return;
  _tablesEnsured = true; // optimistic — avoid re-entry on concurrent requests

  const ddlOrders = `
    CREATE TABLE IF NOT EXISTS delivery_platform_orders (
      id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      tenant_id           text NOT NULL,
      platform            text NOT NULL,
      platform_order_id   text NOT NULL,
      status              text DEFAULT 'new',
      raw                 jsonb,
      normalized          jsonb,
      total               numeric,
      currency            text DEFAULT 'MXN',
      customer_name       text,
      customer_phone      text,
      items               jsonb,
      estimated_pickup_at timestamptz,
      created_at          timestamptz DEFAULT now(),
      updated_at          timestamptz DEFAULT now(),
      UNIQUE(platform, platform_order_id)
    );
  `;

  const ddlIntegrations = `
    CREATE TABLE IF NOT EXISTS delivery_integrations (
      id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      tenant_id          text NOT NULL,
      platform           text NOT NULL,
      api_key            text,
      webhook_secret     text,
      store_id           text,
      active             boolean DEFAULT false,
      use_owner_account  boolean DEFAULT true,
      owner_api_key_ref  text,
      created_at         timestamptz DEFAULT now(),
      updated_at         timestamptz DEFAULT now(),
      UNIQUE(tenant_id, platform)
    );
  `;

  try {
    // Use Supabase REST RPC if available, otherwise raw SQL endpoint
    await supabaseRequest('POST', '/rest/v1/rpc/exec_sql', { sql: ddlOrders }).catch(() => null);
    await supabaseRequest('POST', '/rest/v1/rpc/exec_sql', { sql: ddlIntegrations }).catch(() => null);
  } catch (_) {
    // Tables may already exist or exec_sql RPC not present — non-fatal
  }
}

// ─── HMAC-SHA256 signature validation ────────────────────────────────────────
function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Returns true if signature is valid.
 * If secret is empty, logs a warning and returns true (dev mode).
 */
function validateSignature(secret, rawBody, receivedSig, platform) {
  if (!secret) {
    console.warn(`[delivery] WARN: No webhook secret configured for ${platform} — accepting without validation`);
    return true;
  }
  if (!receivedSig) return false;
  const expected = hmacSha256Hex(secret, rawBody);
  // Some platforms prefix with 'sha256='
  const normalized = receivedSig.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(normalized, 'hex'),
    );
  } catch (_) {
    return false;
  }
}

// ─── Normalization functions (per platform) ──────────────────────────────────

function normalizeUberEats(body) {
  // Uber Eats sends order under body.order or body directly
  const o = body.order || body;
  const items = (o.cart?.items || []).map(i => ({
    name:        i.title || i.name || '',
    qty:         i.quantity || 1,
    unit_price:  parseFloat(i.price?.unit_price?.total_price?.amount || 0),
    modifiers:   (i.selected_modifier_groups || []).flatMap(g =>
      (g.selected_items || []).map(m => ({ name: m.title, price: parseFloat(m.price?.total_price?.amount || 0) }))
    ),
  }));

  return {
    order_id:                  o.id || o.order_id,
    customer: {
      name:  o.eater?.first_name ? `${o.eater.first_name} ${o.eater.last_name || ''}`.trim() : '',
      phone: o.eater?.phone_number || '',
    },
    items,
    total:                     parseFloat(o.payment?.charges?.total_charge?.amount || 0),
    subtotal:                  parseFloat(o.payment?.charges?.sub_total?.amount || 0),
    delivery_fee:              parseFloat(o.payment?.charges?.delivery_fee?.amount || 0),
    platform_fee:              parseFloat(o.payment?.charges?.uber_eats_fee?.amount || 0),
    estimated_pickup_minutes:  o.estimated_ready_for_pickup_in || null,
    special_instructions:      o.special_instructions || '',
    payment_method:            o.payment?.payment_method_details?.payment_method_type || 'unknown',
  };
}

function normalizeDidi(body) {
  const o = body.orderInfo || body;
  const items = (o.productList || []).map(i => ({
    name:        i.productName || '',
    qty:         i.quantity || 1,
    unit_price:  parseFloat(i.price || 0),
    modifiers:   (i.skuList || []).map(m => ({ name: m.skuName, price: parseFloat(m.price || 0) })),
  }));

  return {
    order_id:                  String(o.orderId || o.orderNo || ''),
    customer: {
      name:  o.userInfo?.userName || o.receiverName || '',
      phone: o.userInfo?.userPhone || o.receiverPhone || '',
    },
    items,
    total:                     parseFloat(o.totalPrice || o.orderAmount || 0),
    subtotal:                  parseFloat(o.foodAmount || 0),
    delivery_fee:              parseFloat(o.deliveryFee || 0),
    platform_fee:              parseFloat(o.serviceFee || 0),
    estimated_pickup_minutes:  o.estimatedPickupTime || null,
    special_instructions:      o.remark || '',
    payment_method:            o.payType === 1 ? 'online' : 'cash',
  };
}

function normalizeRappi(body) {
  const o = body.order || body;
  const items = (o.details || o.products || []).map(i => ({
    name:        i.name || i.product_name || '',
    qty:         i.units || i.quantity || 1,
    unit_price:  parseFloat(i.unit_price || i.price || 0),
    modifiers:   (i.topping_detail || i.toppings || []).map(m => ({
      name:  m.name,
      price: parseFloat(m.unit_price || m.price || 0),
    })),
  }));

  return {
    order_id:                  String(o.id || o.order_id || ''),
    customer: {
      name:  o.user?.name || o.client_name || '',
      phone: o.user?.phone || o.client_phone || '',
    },
    items,
    total:                     parseFloat(o.total_value || o.total || 0),
    subtotal:                  parseFloat(o.products_total || o.subtotal || 0),
    delivery_fee:              parseFloat(o.delivery_cost || 0),
    platform_fee:              parseFloat(o.commission || 0),
    estimated_pickup_minutes:  o.estimated_cooking_time || null,
    special_instructions:      o.special_instructions || o.observation || '',
    payment_method:            o.payment_method || 'unknown',
  };
}

function normalizeSinDelantal(body) {
  const o = body.order || body;
  const items = (o.products || o.items || []).map(i => ({
    name:        i.name || '',
    qty:         i.quantity || 1,
    unit_price:  parseFloat(i.unit_price || i.price || 0),
    modifiers:   (i.modifiers || []).map(m => ({ name: m.name, price: parseFloat(m.price || 0) })),
  }));

  return {
    order_id:                  String(o.id || o.order_id || ''),
    customer: {
      name:  o.customer?.name || o.customer_name || '',
      phone: o.customer?.phone || o.customer_phone || '',
    },
    items,
    total:                     parseFloat(o.total || 0),
    subtotal:                  parseFloat(o.subtotal || 0),
    delivery_fee:              parseFloat(o.delivery_fee || 0),
    platform_fee:              parseFloat(o.platform_fee || 0),
    estimated_pickup_minutes:  o.estimated_pickup_minutes || null,
    special_instructions:      o.notes || o.special_instructions || '',
    payment_method:            o.payment_method || 'unknown',
  };
}

function normalizeIFood(body) {
  // iFood sends order creation under body.fullCode / body.events array or directly
  const o = body.order || body;
  const items = (o.items || []).map(i => ({
    name:        i.name || '',
    qty:         i.quantity || 1,
    unit_price:  parseFloat(i.unitPrice || i.unit_price || 0),
    modifiers:   (i.options || []).map(m => ({
      name:  m.name,
      price: parseFloat(m.unitPrice || m.price || 0),
    })),
  }));

  const delivery = o.delivery || {};
  const totalObj = o.total || o.totalPrice || {};

  return {
    order_id:                  o.id || o.orderId || '',
    customer: {
      name:  o.customer?.name || '',
      phone: o.customer?.phone || '',
    },
    items,
    total:                     parseFloat(totalObj.orderAmount || o.totalPrice || 0),
    subtotal:                  parseFloat(totalObj.subTotal || 0),
    delivery_fee:              parseFloat(delivery.deliveryFee || o.deliveryFee || 0),
    platform_fee:              parseFloat(o.platformFee || 0),
    estimated_pickup_minutes:  o.preparationTime || null,
    special_instructions:      o.observations || '',
    payment_method:            (o.payments?.methods || [{ method: 'unknown' }])[0]?.method || 'unknown',
  };
}

function normalizePedidosYa(body) {
  const o = body.order || body;
  const items = (o.details || o.orderDetails || []).map(i => ({
    name:        i.product?.name || i.name || '',
    qty:         i.amount || i.quantity || 1,
    unit_price:  parseFloat(i.unitPrice || i.price || 0),
    modifiers:   (i.options || []).map(m => ({ name: m.name, price: parseFloat(m.price || 0) })),
  }));

  return {
    order_id:                  String(o.id || o.orderId || ''),
    customer: {
      name:  o.user?.name || o.customer?.name || '',
      phone: o.user?.phone || o.customer?.phone || '',
    },
    items,
    total:                     parseFloat(o.amount || o.totalAmount || 0),
    subtotal:                  parseFloat(o.subTotal || 0),
    delivery_fee:              parseFloat(o.shippingAmount || 0),
    platform_fee:              parseFloat(o.platformFee || 0),
    estimated_pickup_minutes:  o.estimatedPickupTime || null,
    special_instructions:      o.notes || '',
    payment_method:            o.paymentType || 'unknown',
  };
}

const NORMALIZERS = {
  ubereats:     normalizeUberEats,
  didi:         normalizeDidi,
  rappi:        normalizeRappi,
  sinDelantal:  normalizeSinDelantal,
  ifood:        normalizeIFood,
  pedidosya:    normalizePedidosYa,
};

// ─── Supabase realtime broadcast (best-effort) ───────────────────────────────
async function broadcastDeliveryOrder(record) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{
          topic:   `delivery_orders:${record.tenant_id}`,
          event:   'new_order',
          payload: record,
        }],
      }),
    });
  } catch (e) {
    console.warn('[delivery] broadcast failed:', e.message);
  }
}

// ─── Platform-specific callback (confirm order) ──────────────────────────────
async function confirmWithPlatform(platform, tenantId, platformOrderId, supabaseRequest) {
  try {
    const rows = await supabaseRequest('GET',
      `/delivery_integrations?tenant_id=eq.${encodeURIComponent(tenantId)}&platform=eq.${encodeURIComponent(platform)}&select=*&limit=1`,
    ) || [];
    const cfg = rows[0];
    if (!cfg || !cfg.active || !cfg.api_key) return; // no credentials → skip silently

    if (platform === 'ubereats') {
      await fetch(`https://api.uber.com/v2/eats/orders/${platformOrderId}/acceptPosOrder`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${cfg.api_key}`,
        },
        body: JSON.stringify({ reason: 'accepted' }),
      });
    }
    // DiDi / Rappi callbacks can be wired here when official API credentials obtained
  } catch (e) {
    console.warn(`[delivery] confirmWithPlatform error (${platform}):`, e.message);
  }
}

// ─── Helper: read raw request body ───────────────────────────────────────────
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── Helper: derive tenant_id from webhook ────────────────────────────────────
// Platforms usually pass it in the URL, query string, or body.
// We try multiple locations: query ?tenant_id=, body.tenant_id, body.restaurant.external_id.
function extractTenantId(parsedUrl, body) {
  const qs = parsedUrl.query || {};
  return (
    qs.tenant_id ||
    body?.tenant_id ||
    body?.order?.restaurant?.external_id ||
    body?.restaurant?.external_id ||
    body?.storeId ||
    'unknown'
  );
}

// ─── Generic webhook handler ──────────────────────────────────────────────────
async function handleWebhook(platform, secret, sigHeader, req, res, parsedUrl, ctx) {
  const { supabaseRequest, sendJson } = ctx;
  await ensureDeliveryTables(supabaseRequest);

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (_) {
    return sendJson(res, 200, { ok: true }); // always 200
  }

  const signature = req.headers[sigHeader] || req.headers['x-signature'] || '';

  if (!validateSignature(secret, rawBody, signature, platform)) {
    console.warn(`[delivery] Invalid signature for ${platform} — rejecting`);
    return sendJson(res, 200, { ok: true, error: 'invalid_signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return sendJson(res, 200, { ok: true, error: 'invalid_json' });
  }

  const tenantId = extractTenantId(parsedUrl, body);
  const normalize = NORMALIZERS[platform];
  let normalized = null;
  try {
    normalized = normalize(body);
  } catch (e) {
    console.warn(`[delivery] normalization failed for ${platform}:`, e.message);
  }

  const platformOrderId = normalized?.order_id || String(body?.id || body?.order?.id || Date.now());
  const total           = normalized?.total || 0;
  const customerName    = normalized?.customer?.name || '';
  const customerPhone   = normalized?.customer?.phone || '';
  const items           = normalized?.items || null;
  const pickupMins      = normalized?.estimated_pickup_minutes;
  const estimatedPickup = pickupMins
    ? new Date(Date.now() + pickupMins * 60000).toISOString()
    : null;

  const record = {
    tenant_id:           tenantId,
    platform,
    platform_order_id:   platformOrderId,
    status:              'new',
    raw:                 body,
    normalized:          normalized || body,
    total,
    currency:            'MXN',
    customer_name:       customerName,
    customer_phone:      customerPhone,
    items:               items ? JSON.stringify(items) : null,
    estimated_pickup_at: estimatedPickup,
    updated_at:          new Date().toISOString(),
  };

  try {
    await supabaseRequest('POST', '/delivery_platform_orders?on_conflict=platform,platform_order_id', {
      ...record,
      // Prefer method: upsert
    }, { Prefer: 'resolution=merge-duplicates' });
  } catch (e) {
    console.error(`[delivery] upsert error (${platform}):`, e.message);
  }

  try {
    await broadcastDeliveryOrder({ ...record, id: platformOrderId });
  } catch (_) {}

  return sendJson(res, 200, { ok: true });
}

// ─── JWT extraction (re-use existing pattern from main index) ─────────────────
function extractBearerToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

async function getTenantFromJwt(token, supabaseRequest) {
  if (!token) return null;
  try {
    // Decode payload (no verify — relying on Supabase RLS; index.js does the same pattern)
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.tenant_id || payload.sub || null;
  } catch (_) {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
module.exports = async function handleDelivery(req, res, parsedUrl, ctx) {
  const { supabaseRequest, sendJson } = ctx;
  const method   = req.method || 'GET';
  const pathname = parsedUrl.pathname || '';

  // ── Webhook routes ──────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/webhooks/ubereats') {
    await handleWebhook('ubereats', UBEREATS_WEBHOOK_SECRET, 'x-uber-signature', req, res, parsedUrl, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/webhooks/didi') {
    await handleWebhook('didi', DIDI_WEBHOOK_SECRET, 'x-didi-signature', req, res, parsedUrl, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/webhooks/rappi') {
    await handleWebhook('rappi', RAPPI_WEBHOOK_SECRET, 'x-rappi-signature', req, res, parsedUrl, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/webhooks/sinDelantal') {
    await handleWebhook('sinDelantal', SINDELANTAL_WEBHOOK_SEC, 'x-sindelantal-signature', req, res, parsedUrl, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/webhooks/ifood') {
    await handleWebhook('ifood', IFOOD_WEBHOOK_SECRET, 'x-ifood-signature', req, res, parsedUrl, ctx);
    return true;
  }

  if (method === 'POST' && pathname === '/api/webhooks/pedidosya') {
    await handleWebhook('pedidosya', PEDIDOSYA_WEBHOOK_SECRET, 'x-pedidosya-signature', req, res, parsedUrl, ctx);
    return true;
  }

  // ── Auth-gated routes ───────────────────────────────────────────────────────

  if (!pathname.startsWith('/api/integrations/delivery')) return false;

  const token    = extractBearerToken(req);
  const tenantId = await getTenantFromJwt(token, supabaseRequest);

  if (!tenantId) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }

  await ensureDeliveryTables(supabaseRequest);

  // GET /api/integrations/delivery/orders
  if (method === 'GET' && pathname === '/api/integrations/delivery/orders') {
    const qs       = parsedUrl.query || {};
    const page     = Math.max(1, parseInt(qs.page || '1', 10));
    const limit    = Math.min(100, Math.max(1, parseInt(qs.limit || '50', 10)));
    const offset   = (page - 1) * limit;
    const platform = qs.platform ? `&platform=eq.${encodeURIComponent(qs.platform)}` : '';

    try {
      const rows = await supabaseRequest('GET',
        `/delivery_platform_orders?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&status=not.in.(delivered,cancelled)` +
        platform +
        `&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`,
      ) || [];
      sendJson(res, 200, { data: rows, page, limit });
    } catch (e) {
      sendJson(res, 500, { error: 'db_error', detail: e.message });
    }
    return true;
  }

  // POST /api/integrations/delivery/orders/:id/accept
  const acceptMatch = pathname.match(/^\/api\/integrations\/delivery\/orders\/([^/]+)\/accept$/);
  if (method === 'POST' && acceptMatch) {
    const orderId = acceptMatch[1];
    try {
      const updated = await supabaseRequest('PATCH',
        `/delivery_platform_orders?id=eq.${encodeURIComponent(orderId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { status: 'accepted', updated_at: new Date().toISOString() },
        { Prefer: 'return=representation' },
      ) || [];
      const row = updated[0];
      if (!row) { sendJson(res, 404, { error: 'not_found' }); return true; }
      // Best-effort platform callback
      confirmWithPlatform(row.platform, tenantId, row.platform_order_id, supabaseRequest).catch(() => {});
      sendJson(res, 200, { ok: true, order: row });
    } catch (e) {
      sendJson(res, 500, { error: 'db_error', detail: e.message });
    }
    return true;
  }

  // POST /api/integrations/delivery/orders/:id/ready
  const readyMatch = pathname.match(/^\/api\/integrations\/delivery\/orders\/([^/]+)\/ready$/);
  if (method === 'POST' && readyMatch) {
    const orderId = readyMatch[1];
    try {
      const updated = await supabaseRequest('PATCH',
        `/delivery_platform_orders?id=eq.${encodeURIComponent(orderId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { status: 'ready', updated_at: new Date().toISOString() },
        { Prefer: 'return=representation' },
      ) || [];
      const row = updated[0];
      if (!row) { sendJson(res, 404, { error: 'not_found' }); return true; }
      sendJson(res, 200, { ok: true, order: row });
    } catch (e) {
      sendJson(res, 500, { error: 'db_error', detail: e.message });
    }
    return true;
  }

  // POST /api/integrations/delivery/configure
  if (method === 'POST' && pathname === '/api/integrations/delivery/configure') {
    let body;
    try {
      const raw = await readRawBody(req);
      body = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      sendJson(res, 400, { error: 'invalid_json' });
      return true;
    }

    const { platform, api_key, store_id, active, webhook_secret } = body;
    const VALID_PLATFORMS = ['ubereats', 'didi', 'rappi', 'sinDelantal', 'ifood', 'pedidosya'];
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      sendJson(res, 400, { error: 'invalid_platform', valid: VALID_PLATFORMS });
      return true;
    }

    const upsertPayload = {
      tenant_id:   tenantId,
      platform,
      active:      !!active,
      updated_at:  new Date().toISOString(),
    };
    if (api_key       !== undefined) upsertPayload.api_key       = api_key;
    if (store_id      !== undefined) upsertPayload.store_id      = store_id;
    if (webhook_secret !== undefined) upsertPayload.webhook_secret = webhook_secret;

    try {
      await supabaseRequest('POST',
        '/delivery_integrations?on_conflict=tenant_id,platform',
        upsertPayload,
        { Prefer: 'resolution=merge-duplicates,return=representation' },
      );
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: 'db_error', detail: e.message });
    }
    return true;
  }

  // GET /api/integrations/delivery/config
  if (method === 'GET' && pathname === '/api/integrations/delivery/config') {
    try {
      const rows = await supabaseRequest('GET',
        `/delivery_integrations?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`,
      ) || [];

      // Redact api_key — show only last 4 chars
      const redacted = rows.map(r => ({
        ...r,
        api_key:        r.api_key ? `${'*'.repeat(Math.max(0, r.api_key.length - 4))}${r.api_key.slice(-4)}` : null,
        webhook_secret: r.webhook_secret ? '***' : null,
      }));

      sendJson(res, 200, { data: redacted });
    } catch (e) {
      sendJson(res, 500, { error: 'db_error', detail: e.message });
    }
    return true;
  }

  return false; // not our route
};
