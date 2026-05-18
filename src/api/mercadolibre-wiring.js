/**
 * R18 · MercadoLibre (LATAM) — API wiring
 * Registra los handlers de MercadoLibre dentro del objeto `handlers` del API principal.
 * Uso desde api/index.js (o auto-loader):
 *
 *   require('./mercadolibre-wiring').register({
 *     handlers, supabaseRequest, sendJSON, sendError, readBody, requireAuth, https
 *   });
 *
 * Endpoints expuestos:
 *   POST /api/integrations/mercadolibre/oauth-callback
 *   POST /api/integrations/mercadolibre/sync-listings
 *   POST /api/integrations/mercadolibre/orders/webhook
 *   GET  /api/integrations/mercadolibre/orders
 *   GET  /api/integrations/mercadolibre/health
 */

'use strict';

const ML_APP_ID     = (process.env.MERCADOLIBRE_APP_ID || '').trim();
const ML_APP_SECRET = (process.env.MERCADOLIBRE_APP_SECRET || '').trim();
const ML_REDIRECT   = (process.env.MERCADOLIBRE_REDIRECT_URI || '').trim();
const ML_SITE       = (process.env.MERCADOLIBRE_SITE || 'MLM').trim(); // MLM=MX, MLA=AR, MLB=BR, MCO=CO, MLC=CL

function mlHttps(httpsLib, method, host, pathStr, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port: 443, path: pathStr, method, headers: headers || {} };
    const r = httpsLib.request(opts, (resp) => {
      let data = ''; resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, body: data ? JSON.parse(data) : null }); }
        catch (_) { resolve({ status: resp.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function register(ctx) {
  const {
    handlers, supabaseRequest, sendJSON, sendError, readBody, requireAuth, https,
  } = ctx;
  const httpsLib = https || require('https');

  async function getToken(tenantId) {
    const rows = await supabaseRequest('GET',
      `/ml_oauth_tokens?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&limit=1`) || [];
    return rows[0] || null;
  }

  // POST /api/integrations/mercadolibre/oauth-callback
  handlers['POST /api/integrations/mercadolibre/oauth-callback'] = requireAuth(async (req, res) => {
    try {
      if (!ML_APP_ID || !ML_APP_SECRET) {
        return sendJSON(res, { ok: false, error: 'ml_not_configured',
          hint: 'set MERCADOLIBRE_APP_ID / MERCADOLIBRE_APP_SECRET' }, 503);
      }
      const body = await readBody(req);
      const code = String(body.code || '').trim();
      const redirect = String(body.redirect_uri || ML_REDIRECT || '').trim();
      if (!code) return sendJSON(res, { ok: false, error: 'code_required' }, 400);
      const tenantId = (req.user && req.user.tenant_id) || body.tenant_id;
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);

      const form = [
        'grant_type=authorization_code',
        'client_id=' + encodeURIComponent(ML_APP_ID),
        'client_secret=' + encodeURIComponent(ML_APP_SECRET),
        'code=' + encodeURIComponent(code),
        'redirect_uri=' + encodeURIComponent(redirect),
      ].join('&');

      const r = await mlHttps(httpsLib, 'POST', 'api.mercadolibre.com', '/oauth/token',
        { 'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form), 'Accept': 'application/json' }, form);

      if (r.status >= 400 || !r.body || !r.body.access_token) {
        return sendJSON(res, { ok: false, error: 'oauth_exchange_failed',
          ml_status: r.status, ml_body: r.body }, 502);
      }
      const tk = r.body;
      const expiresAt = new Date(Date.now() + (Number(tk.expires_in || 21600) * 1000)).toISOString();
      const row = {
        tenant_id: tenantId,
        ml_user_id: tk.user_id ? String(tk.user_id) : null,
        access_token: tk.access_token,
        refresh_token: tk.refresh_token || null,
        token_type: tk.token_type || 'bearer',
        scope: tk.scope || null,
        site_id: ML_SITE,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };
      try { await supabaseRequest('DELETE',
        `/ml_oauth_tokens?tenant_id=eq.${encodeURIComponent(tenantId)}`); } catch (_) {}
      let saved = null;
      try { saved = await supabaseRequest('POST', '/ml_oauth_tokens', row); }
      catch (e) { return sendJSON(res, { ok: false, error: 'db_error',
        detail: String(e && e.message || e) }, 500); }

      sendJSON(res, { ok: true, connected: true, ml_user_id: row.ml_user_id,
        expires_at: expiresAt, token: (saved && saved[0]) || saved });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/integrations/mercadolibre/sync-listings
  handlers['POST /api/integrations/mercadolibre/sync-listings'] = requireAuth(async (req, res) => {
    try {
      const tenantId = (req.user && req.user.tenant_id);
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);
      const tk = await getToken(tenantId);
      if (!tk || !tk.access_token)
        return sendJSON(res, { ok: false, error: 'ml_not_connected',
          hint: 'POST /api/integrations/mercadolibre/oauth-callback first' }, 412);

      const body = await readBody(req);
      const ids = Array.isArray(body.product_ids) ? body.product_ids : null;
      let products = [];
      try {
        const filter = ids && ids.length
          ? `id=in.(${ids.map(encodeURIComponent).join(',')})`
          : `tenant_id=eq.${encodeURIComponent(tenantId)}&active=eq.true`;
        products = await supabaseRequest('GET',
          `/pos_products?${filter}&select=id,name,price,stock,sku,description,image_url&limit=50`) || [];
      } catch (_) { products = []; }

      const results = [];
      for (const p of products) {
        const item = {
          title: String(p.name || 'Producto').slice(0, 60),
          category_id: body.category_id || 'MLM1430',
          price: Number(p.price || 0),
          currency_id: body.currency_id || (ML_SITE === 'MLM' ? 'MXN'
            : ML_SITE === 'MLA' ? 'ARS'
            : ML_SITE === 'MLB' ? 'BRL'
            : ML_SITE === 'MLC' ? 'CLP'
            : ML_SITE === 'MCO' ? 'COP' : 'USD'),
          available_quantity: Number(p.stock || 0),
          buying_mode: 'buy_it_now',
          listing_type_id: body.listing_type_id || 'gold_special',
          condition: 'new',
          description: { plain_text: String(p.description || p.name || '').slice(0, 4000) },
          pictures: p.image_url ? [{ source: p.image_url }] : [],
        };
        const payload = JSON.stringify(item);
        // Crear: POST /sites/{site}/items   (Actualizar: PUT /items/{id})
        const r = await mlHttps(httpsLib, 'POST', 'api.mercadolibre.com',
          `/sites/${ML_SITE}/items?access_token=${encodeURIComponent(tk.access_token)}`,
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          payload);

        const ok = r.status >= 200 && r.status < 300 && r.body && r.body.id;
        const row = {
          tenant_id: tenantId,
          internal_id: String(p.id),
          ml_id: ok ? r.body.id : null,
          title: item.title,
          price: item.price,
          currency_id: item.currency_id,
          available_qty: item.available_quantity,
          status: ok ? (r.body.status || 'active') : 'error',
          permalink: ok ? (r.body.permalink || null) : null,
          category_id: item.category_id,
          listing_type_id: item.listing_type_id,
          last_sync: new Date().toISOString(),
          last_error: ok ? null : JSON.stringify(r.body || {}).slice(0, 1000),
        };
        try { await supabaseRequest('DELETE',
          `/ml_listings?tenant_id=eq.${encodeURIComponent(tenantId)}&internal_id=eq.${encodeURIComponent(p.id)}`); } catch (_) {}
        try { await supabaseRequest('POST', '/ml_listings', row); } catch (_) {}
        results.push({ internal_id: p.id, ml_id: row.ml_id, status: row.status, ml_status: r.status });
      }
      sendJSON(res, { ok: true, synced: results.length, results });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/integrations/mercadolibre/orders/webhook
  handlers['POST /api/integrations/mercadolibre/orders/webhook'] = async (req, res) => {
    try {
      const body = await readBody(req);
      const topic = String(body.topic || '');
      const resource = String(body.resource || '');
      const row = {
        tenant_id: null,
        ml_order_id: resource ? resource.split('/').pop() : null,
        buyer_nick: null,
        total_amount: null,
        currency_id: null,
        status: 'received',
        raw: body,
        received_at: new Date().toISOString(),
      };
      if (topic === 'orders_v2' && resource && body.user_id) {
        try {
          const tkRows = await supabaseRequest('GET',
            `/ml_oauth_tokens?ml_user_id=eq.${encodeURIComponent(body.user_id)}&select=*&limit=1`) || [];
          const tk = tkRows[0];
          if (tk) {
            row.tenant_id = tk.tenant_id;
            const r = await mlHttps(httpsLib, 'GET', 'api.mercadolibre.com',
              `${resource}?access_token=${encodeURIComponent(tk.access_token)}`,
              { 'Accept': 'application/json' }, null);
            if (r.body && r.body.id) {
              row.ml_order_id   = String(r.body.id);
              row.buyer_nick    = (r.body.buyer && r.body.buyer.nickname) || null;
              row.total_amount  = r.body.total_amount || null;
              row.currency_id   = r.body.currency_id || null;
              row.status        = r.body.status || 'received';
              row.raw           = r.body;
            }
          }
        } catch (_) {}
      }
      try { await supabaseRequest('POST', '/ml_orders', row); } catch (_) {}
      sendJSON(res, { ok: true, received: true });
    } catch (err) { sendError(res, err); }
  };

  // GET /api/integrations/mercadolibre/orders
  handlers['GET /api/integrations/mercadolibre/orders'] = requireAuth(async (req, res) => {
    try {
      const tenantId = (req.user && req.user.tenant_id);
      if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 400);
      let items = [];
      try {
        items = await supabaseRequest('GET',
          `/ml_orders?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=received_at.desc&limit=100`) || [];
      } catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/integrations/mercadolibre/health
  handlers['GET /api/integrations/mercadolibre/health'] = async (req, res) => {
    sendJSON(res, { ok: true,
      configured: !!(ML_APP_ID && ML_APP_SECRET),
      site: ML_SITE,
      app_id_set: !!ML_APP_ID });
  };
}

module.exports = { register };
