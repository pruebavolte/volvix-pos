/**
 * R18 — PUBLIC STOREFRONT (e-commerce checkout)
 * Inyectado en handlers de api/index.js (mismo patrón que qr-payments).
 *
 * Endpoints (todos PUBLICOS — sin requireAuth):
 *   GET  /api/shop/:slug/products            ?q=&category=&limit=
 *   GET  /api/shop/:slug/info                tenant config publica
 *   POST /api/shop/checkout                  body: {tenant_id|slug, items, shipping, payment_method, customer_info, promo_code?, gift_card?}
 *   GET  /api/shop/orders/:id                ?email=  (gating por correo del comprador)
 *
 * Sales se crean con source='shop' y role 'guest_checkout'.
 */
'use strict';

function register(deps) {
  const {
    handlers,
    supabaseRequest, readBody,
    sendJSON, sendError,
  } = deps;

  // ───── helpers ────────────────────────────────────────────────
  async function tenantBySlug(slug) {
    if (!slug) return null;
    const rows = await supabaseRequest(
      'GET',
      `/pos_tenants?shop_slug=eq.${encodeURIComponent(slug)}&shop_enabled=eq.true&select=id,shop_slug,shop_name,shop_logo,shop_theme,shop_about,shop_currency,shop_contact_email&limit=1`
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }

  // ───── GET /api/shop/:slug/info ───────────────────────────────
  handlers['GET /api/shop/:slug/info'] = async (req, res, params) => {
    try {
      const t = await tenantBySlug(params.slug);
      if (!t) return sendError(res, 404, { code: 'shop_not_found', message: 'Tienda no disponible', resource: 'shop', id: params.slug });
      sendJSON(res, 200, { ok: true, shop: t });
    } catch (e) {
      sendError(res, 500, { code: 'shop_info_failed', message: String(e && e.message || e) });
    }
  };

  // ───── GET /api/shop/:slug/products ───────────────────────────
  handlers['GET /api/shop/:slug/products'] = async (req, res, params) => {
    try {
      const t = await tenantBySlug(params.slug);
      if (!t) return sendError(res, 404, { code: 'shop_not_found', message: 'Tienda no disponible', resource: 'shop', id: params.slug });

      const u = new URL(req.url, 'http://x');
      const q = (u.searchParams.get('q') || '').trim();
      const cat = (u.searchParams.get('category') || '').trim();
      const limit = Math.min(200, Math.max(1, n(u.searchParams.get('limit'), 60)));

      let qs = `tenant_id=eq.${t.id}&is_active=eq.true&shop_visible=eq.true&select=id,sku,name,description,price,currency,image_url,category,stock,tags&order=name.asc&limit=${limit}`;
      if (q)   qs += `&or=(name.ilike.*${encodeURIComponent(q)}*,sku.ilike.*${encodeURIComponent(q)}*,description.ilike.*${encodeURIComponent(q)}*)`;
      if (cat) qs += `&category=eq.${encodeURIComponent(cat)}`;

      const items = await supabaseRequest('GET', `/products?${qs}`);
      sendJSON(res, 200, { ok: true, products: Array.isArray(items) ? items : [], shop: { id: t.id, slug: t.shop_slug, name: t.shop_name, currency: t.shop_currency || 'MXN' } });
    } catch (e) {
      sendError(res, 500, { code: 'shop_products_failed', message: String(e && e.message || e) });
    }
  };

  // ───── POST /api/shop/checkout ────────────────────────────────
  handlers['POST /api/shop/checkout'] = async (req, res) => {
    try {
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return sendError(res, 400, { code: 'empty_cart', message: 'Carrito vacío', field: 'items' });

      // Resolve tenant
      let tenant = null;
      if (body.tenant_id)      tenant = await (async () => {
        const r = await supabaseRequest('GET', `/pos_tenants?id=eq.${encodeURIComponent(body.tenant_id)}&shop_enabled=eq.true&select=id,shop_slug,shop_currency&limit=1`);
        return Array.isArray(r) ? r[0] : null;
      })();
      else if (body.shop_slug) tenant = await tenantBySlug(body.shop_slug);
      if (!tenant) return sendError(res, 404, { code: 'shop_not_found', message: 'Tienda no encontrada', field: 'tenant_id' });

      const ci = body.customer_info || {};
      if (!ci.email || !ci.name) return sendError(res, 400, { code: 'customer_required', message: 'Nombre y email requeridos', field: 'customer_info' });

      const shipping     = body.shipping || null;
      const paymentMethod= String(body.payment_method || 'card').toLowerCase();
      if (!['card','stripe','codi','spei','transfer','cash_on_delivery'].includes(paymentMethod))
        return sendError(res, 400, { code: 'bad_payment_method', message: 'Método no soportado', field: 'payment_method' });

      // Validate items + recompute totals server-side from DB
      const ids = items.map(i => i.product_id).filter(Boolean);
      if (!ids.length) return sendError(res, 400, { code: 'invalid_items', message: 'product_id requerido por item', field: 'items' });
      const prodList = await supabaseRequest('GET',
        `/products?tenant_id=eq.${tenant.id}&id=in.(${ids.map(encodeURIComponent).join(',')})&shop_visible=eq.true&is_active=eq.true&select=id,name,price,sku,stock`);
      const byId = new Map((prodList || []).map(p => [p.id, p]));

      let subtotal = 0;
      const lineItems = [];
      for (const it of items) {
        const p = byId.get(it.product_id);
        if (!p) return sendError(res, 400, { code: 'item_unavailable', message: `Producto no disponible`, field: 'items', id: it.product_id });
        const qty = Math.max(1, n(it.quantity, 1));
        const lineTotal = +(p.price * qty).toFixed(2);
        subtotal += lineTotal;
        lineItems.push({ product_id: p.id, sku: p.sku, name: p.name, quantity: qty, unit_price: p.price, total: lineTotal });
      }

      // Promo code (lookup if exists)
      let discount = 0, promoApplied = null;
      if (body.promo_code) {
        try {
          const promos = await supabaseRequest('GET',
            `/promotions?tenant_id=eq.${tenant.id}&code=eq.${encodeURIComponent(body.promo_code)}&active=eq.true&select=id,code,type,value&limit=1`);
          const promo = Array.isArray(promos) ? promos[0] : null;
          if (promo) {
            discount = promo.type === 'percent'
              ? +(subtotal * (n(promo.value, 0) / 100)).toFixed(2)
              : Math.min(subtotal, n(promo.value, 0));
            promoApplied = promo.code;
          }
        } catch (_) { /* swallow */ }
      }

      // Gift card (deduct from balance)
      let giftCardApplied = 0, giftCardId = null;
      if (body.gift_card) {
        try {
          const gcs = await supabaseRequest('GET',
            `/gift_cards?tenant_id=eq.${tenant.id}&code=eq.${encodeURIComponent(body.gift_card)}&select=id,code,balance,active&limit=1`);
          const gc = Array.isArray(gcs) ? gcs[0] : null;
          if (gc && gc.active && n(gc.balance, 0) > 0) {
            giftCardApplied = Math.min(subtotal - discount, n(gc.balance, 0));
            giftCardId = gc.id;
          }
        } catch (_) { /* swallow */ }
      }

      const tax   = +(Math.max(0, subtotal - discount - giftCardApplied) * 0.16).toFixed(2);
      const ship  = shipping && n(shipping.cost, 0) > 0 ? n(shipping.cost, 0) : 0;
      const total = +(subtotal - discount - giftCardApplied + tax + ship).toFixed(2);

      // Upsert customer (guest)
      let customerId = null;
      try {
        const existing = await supabaseRequest('GET',
          `/customers?tenant_id=eq.${tenant.id}&email=eq.${encodeURIComponent(ci.email)}&select=id&limit=1`);
        if (Array.isArray(existing) && existing[0]) {
          customerId = existing[0].id;
        } else {
          const created = await supabaseRequest('POST', '/customers', {
            tenant_id: tenant.id,
            name: ci.name, email: ci.email, phone: ci.phone || null,
            source: 'shop',
          });
          customerId = Array.isArray(created) && created[0] ? created[0].id : (created && created.id);
        }
      } catch (e) { /* keep nullable */ }

      // Create sale (role='guest_checkout' / source='shop')
      const sale = await supabaseRequest('POST', '/sales', {
        tenant_id: tenant.id,
        customer_id: customerId,
        guest_email: ci.email,
        items: lineItems,
        subtotal, discount, tax, total,
        currency: tenant.shop_currency || 'MXN',
        payment_method: paymentMethod,
        status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'awaiting_payment',
        source: 'shop',
        shipping_address: shipping || null,
        meta: { role: 'guest_checkout', promo: promoApplied, gift_card_applied: giftCardApplied, gift_card_id: giftCardId },
      });
      const saleRow = Array.isArray(sale) && sale[0] ? sale[0] : sale;

      // Decrement gift card balance (best-effort)
      if (giftCardId && giftCardApplied > 0) {
        try {
          await supabaseRequest('PATCH', `/gift_cards?id=eq.${giftCardId}`, {
            balance_delta: -giftCardApplied,
          });
        } catch (_) {}
      }

      // Build payment intent shell
      const intent = {
        method: paymentMethod,
        sale_id: saleRow && saleRow.id,
        amount: total,
        currency: tenant.shop_currency || 'MXN',
      };
      if (paymentMethod === 'card' || paymentMethod === 'stripe') {
        intent.next = { type: 'stripe_redirect', client_secret: null, hint: 'Configura STRIPE_SECRET_KEY para client_secret real' };
      } else if (paymentMethod === 'codi' || paymentMethod === 'spei') {
        intent.next = { type: 'qr', endpoint: `/api/qr/${paymentMethod}/generate`, body: { amount: total, sale_id: saleRow && saleRow.id } };
      } else if (paymentMethod === 'transfer') {
        intent.next = { type: 'manual_transfer', reference: `VOLVIX-${(saleRow && saleRow.id ? String(saleRow.id).slice(0,8) : 'XXXXXXXX')}` };
      } else {
        intent.next = { type: 'cod', message: 'Pago contra entrega' };
      }

      sendJSON(res, 201, {
        ok: true,
        order: { id: saleRow && saleRow.id, total, subtotal, discount, tax, shipping: ship, gift_card_applied: giftCardApplied, currency: intent.currency, status: saleRow && saleRow.status },
        intent,
      });
    } catch (e) {
      sendError(res, 500, { code: 'checkout_failed', message: String(e && e.message || e) });
    }
  };

  // ───── GET /api/shop/orders/:id ───────────────────────────────
  handlers['GET /api/shop/orders/:id'] = async (req, res, params) => {
    try {
      const u = new URL(req.url, 'http://x');
      const email = (u.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) return sendError(res, 400, { code: 'email_required', message: 'Email del comprador requerido', field: 'email' });

      const rows = await supabaseRequest('GET',
        `/sales?id=eq.${encodeURIComponent(params.id)}&source=eq.shop&guest_email=eq.${encodeURIComponent(email)}&select=id,total,subtotal,discount,tax,currency,status,payment_method,items,shipping_address,created_at&limit=1`);
      const order = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!order) return sendError(res, 404, { code: 'order_not_found', message: 'Pedido no encontrado o email no coincide', resource: 'order', id: params.id });
      sendJSON(res, 200, { ok: true, order });
    } catch (e) {
      sendError(res, 500, { code: 'order_lookup_failed', message: String(e && e.message || e) });
    }
  };
}

module.exports = { register };
