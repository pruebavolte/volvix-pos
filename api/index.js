// ─── Volvix POS — Stripe Payments API ────────────────────────────────────────
// Endpoints servidos via http nativo. Usa solo `https` core (sin npm stripe).
// Montar desde server.js:  require('./api').handleStripe(req, res, method, pathname, parsed)

const https = require('https');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const STRIPE_SECRET_KEY      = process.env.STRIPE_SECRET_KEY      || '';
const STRIPE_WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET  || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const SUPABASE_URL           = process.env.SUPABASE_URL || '';
const SUPABASE_KEY           = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ─── helpers ─────────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', d => {
      chunks.push(d);
      total += d.length;
      if (total > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function configured() {
  return !!STRIPE_SECRET_KEY;
}

function notConfigured(res, missing = 'STRIPE_SECRET_KEY') {
  return json(res, 503, {
    error: 'Stripe no configurado',
    detail: `Falta variable de entorno: ${missing}. Configura en Vercel → Settings → Environment Variables. Ver R14_STRIPE.md`,
    test_mode: true,
  });
}

// ─── Stripe REST via https.request (form-encoded) ────────────────────────────
function stripeForm(obj, prefix = '') {
  const out = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === 'object') {
      out.push(stripeForm(v, key));
    } else {
      out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
    }
  }
  return out.filter(Boolean).join('&');
}

function stripeCall(method, path, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? stripeForm(payload) : '';
    const req = https.request({
      hostname: 'api.stripe.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2024-06-20',
      },
    }, (resp) => {
      const chunks = [];
      resp.on('data', d => chunks.push(d));
      resp.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        if (resp.statusCode >= 200 && resp.statusCode < 300) resolve(parsed);
        else reject(Object.assign(new Error(parsed?.error?.message || 'Stripe error'), { status: resp.statusCode, body: parsed }));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Verificación firma webhook (algoritmo Stripe v1) ────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const signedPayload = `${t}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch { return false; }
  if (!ok) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
  return age <= toleranceSec;
}

// ─── Handler principal ───────────────────────────────────────────────────────
async function handleStripe(req, res, method, pathname /*, parsed */) {
  // POST /api/payments/stripe/intent
  if (pathname === '/api/payments/stripe/intent' && method === 'POST') {
    if (!configured()) return notConfigured(res, 'STRIPE_SECRET_KEY');
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      return json(res, 400, { error: 'JSON inválido' });
    }
    const amount   = parseInt(body.amount, 10);
    const currency = (body.currency || 'mxn').toLowerCase();
    const saleId   = body.sale_id || body.metadata?.sale_id || null;

    if (!Number.isInteger(amount) || amount <= 0) {
      return json(res, 400, { error: 'amount (entero en centavos > 0) requerido' });
    }
    if (!saleId) {
      return json(res, 400, { error: 'sale_id requerido' });
    }

    try {
      const intent = await stripeCall('POST', '/v1/payment_intents', {
        amount,
        currency,
        'automatic_payment_methods': { enabled: true },
        'metadata': { sale_id: String(saleId) },
      });

      // Registrar en payments (estado pending)
      if (supabase) {
        await supabase.from('payments').insert({
          sale_id: saleId,
          provider: 'stripe',
          provider_payment_id: intent.id,
          status: intent.status || 'requires_payment_method',
          amount_cents: amount,
          currency,
          raw: intent,
        }).select().single().then(() => {}, () => {});
      }

      return json(res, 200, {
        ok: true,
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
        publishable_key: STRIPE_PUBLISHABLE_KEY || null,
      });
    } catch (err) {
      console.error('[stripe.intent]', err.message, err.body || '');
      return json(res, err.status || 500, { error: err.message });
    }
  }

  // POST /api/payments/stripe/webhook
  if (pathname === '/api/payments/stripe/webhook' && method === 'POST') {
    if (!configured() || !STRIPE_WEBHOOK_SECRET) return notConfigured(res, 'STRIPE_WEBHOOK_SECRET');

    let raw;
    try { raw = await readBody(req); }
    catch { return json(res, 400, { error: 'cuerpo inválido' }); }

    const sig = req.headers['stripe-signature'];
    if (!verifyStripeSignature(raw, sig, STRIPE_WEBHOOK_SECRET)) {
      return json(res, 400, { error: 'firma inválida' });
    }

    let event;
    try { event = JSON.parse(raw.toString('utf8')); }
    catch { return json(res, 400, { error: 'JSON inválido' }); }

    const obj = event?.data?.object || {};
    const pid = obj.id;
    let newStatus = null;

    switch (event.type) {
      case 'payment_intent.succeeded':       newStatus = 'succeeded'; break;
      case 'payment_intent.payment_failed':  newStatus = 'failed';    break;
      case 'payment_intent.canceled':        newStatus = 'canceled';  break;
      case 'payment_intent.processing':      newStatus = 'processing';break;
      case 'payment_intent.requires_action': newStatus = 'requires_action'; break;
      default: newStatus = null;
    }

    if (newStatus && pid && supabase) {
      const { error } = await supabase
        .from('payments')
        .update({ status: newStatus, raw: obj, updated_at: new Date().toISOString() })
        .eq('provider_payment_id', pid)
        .eq('provider', 'stripe');
      if (error) console.error('[stripe.webhook] update error:', error.message);
    }

    return json(res, 200, { received: true, type: event.type, status: newStatus });
  }

  // GET /api/payments/:id/status
  const m = pathname.match(/^\/api\/payments\/([^/]+)\/status$/);
  if (m && method === 'GET') {
    if (!supabase) return json(res, 503, { error: 'Supabase no configurado' });
    const id = m[1];
    const { data, error } = await supabase
      .from('payments')
      .select('id, sale_id, provider, provider_payment_id, status, amount_cents, currency, created_at, updated_at')
      .or(`id.eq.${id},provider_payment_id.eq.${id},sale_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json(res, 500, { error: error.message });
    if (!data)  return json(res, 404, { error: 'pago no encontrado' });
    return json(res, 200, data);
  }

  return false; // not handled here
}

// ============================================================================
// LOYALTY API — programa de lealtad (R14_LOYALTY)
// ----------------------------------------------------------------------------
// Endpoints:
//   GET  /api/loyalty/customers/:id   → saldo + historial
//   POST /api/loyalty/redeem          → { customer_id, sale_id?, points, notes? }
//   GET  /api/loyalty/tiers           → list (?tenant_id=)
//   POST /api/loyalty/tiers           → create tier
//   POST /api/loyalty/adjust          → admin (header x-admin-key): { customer_id, points, notes? }
// Montar desde server.js:  await require('./api').handleLoyalty(req, res, method, pathname, parsed)
// Devuelve true si manejó la ruta, false si no.
// ============================================================================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

async function readJSON(req) {
  const raw = await readBody(req);
  try { return JSON.parse(raw.toString('utf8') || '{}'); }
  catch { return null; }
}

async function fetchCustomerWithTier(id) {
  if (!supabase) return null;
  const { data: c } = await supabase
    .from('customers')
    .select('id, tenant_id, nombre, loyalty_points, current_tier_id, last_visit_at')
    .eq('id', id)
    .maybeSingle();
  if (!c) return null;
  let tier = null;
  if (c.current_tier_id) {
    const { data: t } = await supabase
      .from('loyalty_tiers')
      .select('id, name, min_points, multiplier, perks')
      .eq('id', c.current_tier_id)
      .maybeSingle();
    tier = t || null;
  }
  return { ...c, tier };
}

async function loyaltyInsertTx({ tenant_id, customer_id, sale_id, type, points, notes }) {
  const { data: cust } = await supabase
    .from('customers').select('loyalty_points, tenant_id').eq('id', customer_id).maybeSingle();
  if (!cust) return { error: 'customer_not_found' };
  const balance_after = (cust.loyalty_points || 0) + points;
  const { data, error } = await supabase.from('loyalty_transactions').insert({
    tenant_id: tenant_id || cust.tenant_id,
    customer_id, sale_id: sale_id || null, type, points, balance_after,
    notes: notes || null,
  }).select().single();
  if (error) return { error: error.message };
  await supabase.rpc('recompute_customer_points', { p_customer: customer_id });
  return { ok: true, tx: data, balance_after };
}

async function handleLoyalty(req, res, method, pathname, parsed) {
  if (!pathname.startsWith('/api/loyalty/')) return false;
  if (!supabase) { json(res, 503, { error: 'Supabase no configurado' }); return true; }

  // GET /api/loyalty/customers/:id
  const mc = pathname.match(/^\/api\/loyalty\/customers\/([0-9a-f-]{36})$/i);
  if (mc && method === 'GET') {
    const customer = await fetchCustomerWithTier(mc[1]);
    if (!customer) { json(res, 404, { error: 'customer_not_found' }); return true; }
    const { data: history, error } = await supabase
      .from('loyalty_transactions')
      .select('id, type, points, balance_after, sale_id, notes, ts')
      .eq('customer_id', mc[1])
      .order('ts', { ascending: false })
      .limit(100);
    if (error) { json(res, 500, { error: error.message }); return true; }
    json(res, 200, { customer, balance: customer.loyalty_points || 0, history: history || [] });
    return true;
  }

  // POST /api/loyalty/redeem
  if (pathname === '/api/loyalty/redeem' && method === 'POST') {
    const body = await readJSON(req);
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    const customer_id = body.customer_id;
    const points      = parseInt(body.points, 10);
    if (!customer_id || !Number.isInteger(points) || points <= 0) {
      json(res, 400, { error: 'customer_id y points (>0) requeridos' }); return true;
    }
    const cust = await fetchCustomerWithTier(customer_id);
    if (!cust) { json(res, 404, { error: 'customer_not_found' }); return true; }
    if ((cust.loyalty_points || 0) < points) {
      json(res, 400, { error: 'insufficient_points', balance: cust.loyalty_points || 0 });
      return true;
    }
    const r = await loyaltyInsertTx({
      tenant_id: cust.tenant_id, customer_id,
      sale_id: body.sale_id || null,
      type: 'redeem', points: -points,
      notes: body.notes || `Canje en venta ${body.sale_id || 'manual'}`,
    });
    if (r.error) { json(res, 400, { error: r.error }); return true; }
    json(res, 200, { ok: true, redeemed: points, balance: r.balance_after });
    return true;
  }

  // GET / POST /api/loyalty/tiers
  if (pathname === '/api/loyalty/tiers') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('loyalty_tiers').select('*').order('min_points', { ascending: true });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) { json(res, 500, { error: error.message }); return true; }
      json(res, 200, data || []);
      return true;
    }
    if (method === 'POST') {
      const body = await readJSON(req);
      if (!body || !body.tenant_id || !body.name) {
        json(res, 400, { error: 'tenant_id y name requeridos' }); return true;
      }
      const payload = {
        tenant_id:  body.tenant_id,
        name:       String(body.name).slice(0, 60),
        min_points: parseInt(body.min_points || 0, 10),
        multiplier: Number(body.multiplier || 1),
        perks:      Array.isArray(body.perks) ? body.perks : [],
      };
      const { data, error } = await supabase.from('loyalty_tiers').insert(payload).select().single();
      if (error) { json(res, 400, { error: error.message }); return true; }
      json(res, 201, data);
      return true;
    }
  }

  // POST /api/loyalty/adjust  (admin)
  if (pathname === '/api/loyalty/adjust' && method === 'POST') {
    const adminKey = req.headers['x-admin-key'] || '';
    if (!ADMIN_API_KEY || adminKey !== ADMIN_API_KEY) {
      json(res, 401, { error: 'unauthorized' }); return true;
    }
    const body = await readJSON(req);
    const points = parseInt(body?.points, 10);
    if (!body?.customer_id || !Number.isInteger(points) || points === 0) {
      json(res, 400, { error: 'customer_id y points (≠0) requeridos' }); return true;
    }
    const cust = await fetchCustomerWithTier(body.customer_id);
    if (!cust) { json(res, 404, { error: 'customer_not_found' }); return true; }
    const r = await loyaltyInsertTx({
      tenant_id: cust.tenant_id, customer_id: body.customer_id,
      type: 'adjust', points, notes: body.notes || 'Ajuste manual admin',
    });
    if (r.error) { json(res, 400, { error: r.error }); return true; }
    json(res, 200, { ok: true, adjusted: points, balance: r.balance_after });
    return true;
  }

  json(res, 404, { error: 'loyalty endpoint not found' });
  return true;
}

module.exports = { handleStripe, handleLoyalty, configured, verifyStripeSignature };

// =====================================================================
// R14 — AUDIT LOG + GDPR (Art. 15 / 17 / 20)
// =====================================================================
// `crypto` ya está importado al inicio del archivo (línea 6).
let _supabase = null;
function _sb() {
  if (_supabase) return _supabase;
  const { createClient } = require('@supabase/supabase-js');
  const URL = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  _supabase = createClient(URL, KEY);
  return _supabase;
}
// ADMIN_API_KEY ya declarado arriba (sección Loyalty).
const GDPR_VERIFY_TTL_MIN = parseInt(process.env.GDPR_VERIFY_TTL_MIN || '60');

function _ip(req)  { return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'; }
function _ua(req)  { return req.headers['user-agent'] || ''; }
function _send(res, st, obj) { res.statusCode = st; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }
function _readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let d=''; req.on('data', c=>{ d+=c; if (d.length>1e6) req.destroy(); });
    req.on('end', ()=>{ try { resolve(d?JSON.parse(d):{});} catch(e){reject(e);} });
    req.on('error', reject);
  });
}
function _sanitize(b) {
  if (!b || typeof b !== 'object') return b;
  const c = { ...b };
  for (const k of ['password','password_hash','token','api_key','secret','clave','tarjeta','cvv']) {
    if (k in c) c[k] = '***REDACTED***';
  }
  return c;
}
function _resourceMap(p) {
  const parts = p.replace(/^\/+/,'').split('/').filter(Boolean);
  if (parts[0] !== 'api') return { resource: p };
  const m = {
    tenants:'volvix_tenants', productos:'volvix_productos', ventas:'volvix_ventas',
    features:'volvix_features', licencias:'volvix_licencias', tickets:'volvix_tickets',
    usuarios:'volvix_usuarios', gdpr:'volvix_gdpr_requests',
  };
  return { resource: m[parts[1]] || `endpoint:${parts.slice(1).join('/')}`, resource_id: parts[2] || null };
}
function _action(m) {
  if (m === 'POST') return 'INSERT';
  if (m === 'DELETE') return 'DELETE';
  return 'UPDATE';
}
function _isMutation(m) { return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE'; }
function _requireAdmin(req) {
  const k = req.headers['x-admin-key'] || (req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  return ADMIN_API_KEY && k === ADMIN_API_KEY;
}

// ─── Middleware ────────────────────────────────────────────────────
function auditMiddleware(req, res, next) {
  if (!_isMutation(req.method) || !req.url.startsWith('/api/') || req.url.startsWith('/api/admin/audit-log')) {
    return next ? next() : undefined;
  }
  const meta = _resourceMap(req.url.split('?')[0]);
  const userId   = req.headers['x-user-id'] || req.user?.id || 'anonymous';
  const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id || null;
  const startBody = req.body;

  const origEnd = res.end.bind(res);
  res.end = function(chunk, enc) {
    const r = origEnd(chunk, enc);
    setImmediate(async () => {
      try {
        await _sb().from('volvix_audit_log').insert({
          user_id:   userId,
          tenant_id: (tenantId && /^[0-9a-f-]{36}$/i.test(tenantId)) ? tenantId : null,
          action:    _action(req.method),
          resource:  meta.resource,
          resource_id: meta.resource_id || (req.body?.id ?? null),
          before:    null,
          after:     _sanitize(startBody || req.body),
          ip:        _ip(req),
          user_agent: _ua(req),
        });
      } catch (e) { console.error('[audit] insert fallo:', e.message); }
    });
    return r;
  };
  if (next) next();
}

// ─── GET /api/admin/audit-log ──────────────────────────────────────
async function handleAuditLog(req, res) {
  if (!_requireAdmin(req)) return _send(res, 401, { ok:false, error:'admin key requerida' });
  const u = new URL(req.url, 'http://x');
  const { from, to, user_id, action, tenant_id, resource, limit } = Object.fromEntries(u.searchParams);
  let q = _sb().from('volvix_audit_log').select('*').order('ts', { ascending: false });
  if (from)      q = q.gte('ts', from);
  if (to)        q = q.lte('ts', to);
  if (user_id)   q = q.eq('user_id', user_id);
  if (action)    q = q.eq('action', action);
  if (tenant_id) q = q.eq('tenant_id', tenant_id);
  if (resource)  q = q.eq('resource', resource);
  q = q.limit(Math.min(parseInt(limit||'500'), 5000));
  const { data, error } = await q;
  if (error) return _send(res, 500, { ok:false, error: error.message });
  return _send(res, 200, { ok:true, count: data.length, data });
}

// ─── GDPR ──────────────────────────────────────────────────────────
async function _createGdprReq(body, req, type) {
  const customer_id = (body.customer_id || body.email || '').trim().toLowerCase();
  if (!customer_id || !/^[^@]+@[^@]+\.[^@]+$/.test(customer_id)) {
    return { status: 400, body: { ok:false, error:'email inválido' } };
  }
  const verify_token = crypto.randomBytes(24).toString('hex');
  const verify_expires = new Date(Date.now() + GDPR_VERIFY_TTL_MIN*60_000).toISOString();
  const { data, error } = await _sb().from('volvix_gdpr_requests').insert({
    customer_id, type, status:'verifying',
    verify_token, verify_expires,
    ip:_ip(req), user_agent:_ua(req),
    payload: { reason: body.reason || null },
  }).select().single();
  if (error) return { status:500, body:{ ok:false, error:error.message } };
  await _sb().from('volvix_audit_log').insert({
    user_id: customer_id, action:'GDPR_REQUEST',
    resource:'volvix_gdpr_requests', resource_id: data.id,
    after: { type, status:'verifying' }, ip:_ip(req), user_agent:_ua(req),
  });
  return { status:202, body:{
    ok:true, request_id:data.id, type,
    message:'Solicitud registrada. Verifica tu email para confirmar.',
    verify_url:`/volvix-gdpr-portal.html?verify=${verify_token}&id=${data.id}`,
    verify_token_dev: verify_token,
  }};
}

async function _verifyExec(body, req, expectedType) {
  const { request_id, verify_token } = body;
  if (!request_id || !verify_token)
    return { status:400, body:{ ok:false, error:'request_id y verify_token requeridos' } };
  const { data: r, error } = await _sb().from('volvix_gdpr_requests')
    .select('*').eq('id', request_id).single();
  if (error || !r) return { status:404, body:{ ok:false, error:'solicitud no encontrada' } };
  if (r.type !== expectedType) return { status:400, body:{ ok:false, error:'tipo no coincide' } };
  if (r.verify_token !== verify_token) return { status:401, body:{ ok:false, error:'token inválido' } };
  if (new Date(r.verify_expires) < new Date()) return { status:401, body:{ ok:false, error:'token expirado' } };
  if (r.status === 'completed') return { status:200, body:{ ok:true, already_done:true, payload:r.payload } };

  await _sb().from('volvix_gdpr_requests').update({ status:'processing' }).eq('id', request_id);

  let payload;
  if (expectedType === 'erasure') {
    const { data, error: e2 } = await _sb().rpc('gdpr_anonymize_customer', { p_customer_id: r.customer_id });
    if (e2) return { status:500, body:{ ok:false, error:e2.message } };
    payload = data;
  } else {
    const { data, error: e2 } = await _sb().rpc('gdpr_export_customer', { p_customer_id: r.customer_id });
    if (e2) return { status:500, body:{ ok:false, error:e2.message } };
    payload = data;
  }

  await _sb().from('volvix_gdpr_requests').update({
    status:'completed', completed_at:new Date().toISOString(),
    payload, verify_token:null,
  }).eq('id', request_id);

  return { status:200, body:{
    ok:true, type:expectedType, customer_id:r.customer_id, data:payload,
    gdpr_article: expectedType==='erasure' ? 'Art.17'
                : expectedType==='portability' ? 'Art.20' : 'Art.15',
  }};
}

async function handleGdprAccess(req, res) {
  const body = await _readBody(req).catch(()=>({}));
  const out = body.verify_token
    ? await _verifyExec(body, req, 'access')
    : await _createGdprReq(body, req, 'access');
  return _send(res, out.status, out.body);
}
async function handleGdprErasure(req, res) {
  const body = await _readBody(req).catch(()=>({}));
  const out = body.verify_token
    ? await _verifyExec(body, req, 'erasure')
    : await _createGdprReq(body, req, 'erasure');
  return _send(res, out.status, out.body);
}
async function handleGdprPortability(req, res) {
  const body = await _readBody(req).catch(()=>({}));
  const out = body.verify_token
    ? await _verifyExec(body, req, 'portability')
    : await _createGdprReq(body, req, 'portability');
  return _send(res, out.status, out.body);
}

// Router compatible con server.js (devuelve true si manejó)
async function handleAuditGdpr(req, res, method, pathname) {
  if (method === 'GET'  && pathname === '/api/admin/audit-log')   { await handleAuditLog(req, res);       return true; }
  if (method === 'POST' && pathname === '/api/gdpr/access')       { await handleGdprAccess(req, res);     return true; }
  if (method === 'POST' && pathname === '/api/gdpr/erasure')      { await handleGdprErasure(req, res);    return true; }
  if (method === 'POST' && pathname === '/api/gdpr/portability')  { await handleGdprPortability(req, res); return true; }
  return false;
}

Object.assign(module.exports, {
  auditMiddleware,
  handleAuditLog,
  handleGdprAccess,
  handleGdprErasure,
  handleGdprPortability,
  handleAuditGdpr,
});

// ============================================================================
// CFDI 4.0 API — Facturación electrónica México (R14_CFDI)
// ----------------------------------------------------------------------------
// Endpoints (todos requireAuth con rol owner|admin):
//   POST /api/invoices/cfdi                -> genera CFDI vía Finkok PAC
//                                             (mock con sello Test si NODE_ENV!=='production')
//   POST /api/invoices/cfdi/cancel         -> cancela CFDI ante SAT
//   GET  /api/invoices/cfdi/:uuid/status   -> consulta estatus
//
// Auth: lee Bearer token del header Authorization, valida contra Supabase Auth
// y consulta volvix_usuarios para extraer rol y tenant_id. Si la sesión no
// tiene rol owner|admin -> 403.
//
// PAC: en producción se llama a Finkok por SOAP/HTTPS (https.request, sin libs
// externas). En no-producción se devuelve un CFDI mock con UUID de
// crypto.randomUUID() y sello SHA-256 derivado.
// Reusa: `https` (línea 5), `crypto` (línea 6), `supabase` (línea 15-17),
//        `json` (línea 20), `readJSON` (línea 256).
// ============================================================================
const FINKOK_HOST    = process.env.FINKOK_HOST    || 'facturacion.finkok.com';
const FINKOK_USER    = process.env.FINKOK_USER    || '';
const FINKOK_PASS    = process.env.FINKOK_PASS    || '';
const CFDI_EMISOR_RFC     = process.env.CFDI_EMISOR_RFC     || 'XAXX010101000';
const CFDI_EMISOR_NOMBRE  = process.env.CFDI_EMISOR_NOMBRE  || 'EMISOR DEMO';
const CFDI_EMISOR_REGIMEN = process.env.CFDI_EMISOR_REGIMEN || '601';
const CFDI_IS_PROD        = process.env.NODE_ENV === 'production';

const RFC_FISICA   = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
const RFC_MORAL    = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
const CP_REGEX     = /^[0-9]{5}$/;
const REGIMENES    = new Set(['601','603','605','606','607','608','610','611','612','614','615','616','620','621','622','623','624','625','626','628','629','630']);
const USOS_CFDI    = new Set(['G01','G02','G03','I01','I02','I03','I04','I05','I06','I07','I08','D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','S01','CP01','CN01']);
const MOTIVOS_CANCEL = new Set(['01','02','03','04']);

function cfdiValidateRFC(rfc) {
  const r = String(rfc || '').toUpperCase().trim();
  return r === 'XAXX010101000' || r === 'XEXX010101000' || RFC_MORAL.test(r) || RFC_FISICA.test(r);
}
function cfdiValidateReceptor(rec) {
  if (!rec || typeof rec !== 'object') return 'receptor requerido';
  if (!cfdiValidateRFC(rec.rfc)) return 'rfc inválido';
  if (!CP_REGEX.test(String(rec.codigo_postal || ''))) return 'codigo_postal inválido';
  if (!REGIMENES.has(String(rec.regimen_fiscal || ''))) return 'regimen_fiscal inválido';
  if (!USOS_CFDI.has(String(rec.uso_cfdi || '').toUpperCase())) return 'uso_cfdi inválido';
  if (!rec.razon_social || String(rec.razon_social).trim().length < 2) return 'razon_social requerida';
  return null;
}
function cfdiEscapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function finkokRequest(soapAction, xmlBody, pathName) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(xmlBody, 'utf8');
    const req = https.request({
      host: FINKOK_HOST,
      path: pathName || '/servicios/soap/stamp.wsdl',
      method: 'POST',
      headers: {
        'Content-Type':   'text/xml; charset=utf-8',
        'SOAPAction':     soapAction,
        'Content-Length': data.length
      },
      timeout: 30_000,
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end',  () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(new Error('finkok timeout')); });
    req.write(data); req.end();
  });
}

function buildMockCFDI({ uuid, emisor, receptor, conceptos, total, subtotal, fecha }) {
  const sello = crypto.createHash('sha256')
    .update(uuid + total + (receptor.rfc || '')).digest('base64');
  const certNo = '30001000000500003456';
  const conceptosXml = conceptos.map(c =>
    `<cfdi:Concepto ClaveProdServ="${c.clave_prod_serv || '01010101'}" Cantidad="${c.cantidad}" ` +
    `ClaveUnidad="${c.clave_unidad || 'H87'}" Descripcion="${cfdiEscapeXml(c.descripcion)}" ` +
    `ValorUnitario="${c.precio_unitario.toFixed(2)}" Importe="${(c.cantidad * c.precio_unitario).toFixed(2)}" ` +
    `ObjetoImp="02"/>`
  ).join('');
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="${Date.now()}"
  Fecha="${fecha}" SubTotal="${subtotal.toFixed(2)}" Total="${total.toFixed(2)}"
  Moneda="MXN" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" FormaPago="01"
  LugarExpedicion="${emisor.cp || '00000'}" Sello="${sello}" NoCertificado="${certNo}">
  <cfdi:Emisor Rfc="${emisor.rfc}" Nombre="${cfdiEscapeXml(emisor.nombre)}" RegimenFiscal="${emisor.regimen}"/>
  <cfdi:Receptor Rfc="${receptor.rfc}" Nombre="${cfdiEscapeXml(receptor.razon_social)}"
    DomicilioFiscalReceptor="${receptor.codigo_postal}" RegimenFiscalReceptor="${receptor.regimen_fiscal}"
    UsoCFDI="${String(receptor.uso_cfdi).toUpperCase()}"/>
  <cfdi:Conceptos>${conceptosXml}</cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1"
      UUID="${uuid}" FechaTimbrado="${fecha}" RfcProvCertif="SAT970701NN3"
      SelloCFD="${sello}" NoCertificadoSAT="${certNo}" SelloSAT="${sello}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
  return { xml, sello, certificado_no: certNo, fecha_timbrado: fecha, uuid };
}

async function requireAuthCFDI(req, roles) {
  if (!supabase) return { ok: false, status: 503, error: 'Supabase no configurado' };
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, status: 401, error: 'Token requerido' };

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return { ok: false, status: 401, error: 'Token inválido' };

  const { data: vu } = await supabase
    .from('volvix_usuarios')
    .select('rol, tenant_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  const rol = vu?.rol || 'owner';
  if (Array.isArray(roles) && !roles.includes(rol)) {
    return { ok: false, status: 403, error: 'Rol insuficiente' };
  }
  return {
    ok: true,
    session: { user_id: userData.user.id, email: userData.user.email, rol, tenant_id: vu?.tenant_id || null }
  };
}

async function handleCFDI(req, res, method, pathname /*, parsed */) {
  // POST /api/invoices/cfdi
  if (pathname === '/api/invoices/cfdi' && method === 'POST') {
    const auth = await requireAuthCFDI(req, ['owner', 'admin']);
    if (!auth.ok) { json(res, auth.status, { error: auth.error }); return true; }

    const body = await readJSON(req);
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }

    const { sale_id, receptor: receptorIn } = body;
    if (!sale_id) { json(res, 400, { error: 'sale_id requerido' }); return true; }

    const { data: venta, error: errVenta } = await supabase
      .from('volvix_ventas').select('*').eq('id', sale_id).single();
    if (errVenta || !venta) { json(res, 404, { error: 'Venta no encontrada' }); return true; }

    let receptor = receptorIn;
    if (!receptor && venta.cliente_id) {
      const { data: cli } = await supabase
        .from('volvix_clientes').select('*').eq('id', venta.cliente_id).maybeSingle();
      if (cli) receptor = {
        rfc: cli.rfc, razon_social: cli.razon_social || cli.nombre,
        codigo_postal: cli.codigo_postal, regimen_fiscal: cli.regimen_fiscal,
        uso_cfdi: cli.uso_cfdi || 'G03'
      };
    }
    const errR = cfdiValidateReceptor(receptor);
    if (errR) { json(res, 400, { error: 'Receptor inválido', detail: errR }); return true; }

    const conceptos = Array.isArray(venta.items) && venta.items.length
      ? venta.items.map(it => ({
          descripcion: it.nombre || it.descripcion || 'Producto',
          cantidad: Number(it.cantidad || 1),
          precio_unitario: Number(it.precio || it.precio_unitario || 0),
          clave_prod_serv: it.clave_prod_serv || '01010101',
          clave_unidad: it.clave_unidad || 'H87'
        }))
      : [{ descripcion: 'Venta', cantidad: 1, precio_unitario: Number(venta.total),
           clave_prod_serv: '01010101', clave_unidad: 'H87' }];

    const subtotal = conceptos.reduce((s, c) => s + c.cantidad * c.precio_unitario, 0);
    const total    = Number(venta.total);
    const fecha    = new Date().toISOString().slice(0, 19);
    const uuid     = crypto.randomUUID().toUpperCase();
    const emisor   = { rfc: CFDI_EMISOR_RFC, nombre: CFDI_EMISOR_NOMBRE, regimen: CFDI_EMISOR_REGIMEN, cp: '00000' };

    let timbre;
    try {
      const cfdiBase = buildMockCFDI({ uuid, emisor, receptor, conceptos, total, subtotal, fecha });
      if (!CFDI_IS_PROD) {
        timbre = cfdiBase;
      } else {
        const soap =
`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:apps="apps.services.soap.core.views">
 <soapenv:Body>
  <apps:stamp>
   <apps:xml><![CDATA[${cfdiBase.xml}]]></apps:xml>
   <apps:username>${cfdiEscapeXml(FINKOK_USER)}</apps:username>
   <apps:password>${cfdiEscapeXml(FINKOK_PASS)}</apps:password>
  </apps:stamp>
 </soapenv:Body>
</soapenv:Envelope>`;
        const r = await finkokRequest('"stamp"', soap);
        if (r.status >= 400) throw new Error('Finkok HTTP ' + r.status);
        const mUuid = r.body.match(/<UUID>([^<]+)<\/UUID>/i);
        const sello = (r.body.match(/<SelloCFD>([^<]+)<\/SelloCFD>/i) || [])[1] || cfdiBase.sello;
        const cert  = (r.body.match(/<NoCertificadoSAT>([^<]+)<\/NoCertificadoSAT>/i) || [])[1] || cfdiBase.certificado_no;
        timbre = {
          xml: r.body, sello, certificado_no: cert, fecha_timbrado: fecha,
          uuid: mUuid ? mUuid[1] : uuid
        };
      }
    } catch (err) {
      console.error('[cfdi.stamp]', err.message);
      json(res, 502, { error: 'Error al timbrar', detail: err.message });
      return true;
    }

    const finalUuid = timbre.uuid || uuid;
    const tenantId  = auth.session?.tenant_id || venta.tenant_id;

    const { data: inv, error: errIns } = await supabase.from('invoices').insert({
      tenant_id: tenantId,
      sale_id,
      uuid: finalUuid,
      rfc_emisor: CFDI_EMISOR_RFC,
      rfc_receptor: receptor.rfc,
      razon_social_receptor: receptor.razon_social,
      uso_cfdi: receptor.uso_cfdi,
      regimen_fiscal_receptor: receptor.regimen_fiscal,
      codigo_postal_receptor: receptor.codigo_postal,
      subtotal, total, moneda: 'MXN',
      sello: timbre.sello,
      certificado_no: timbre.certificado_no,
      fecha_timbrado: timbre.fecha_timbrado,
      xml: timbre.xml,
      pdf_url: null,
      estatus: 'vigente',
      modo_test: !CFDI_IS_PROD
    }).select().single();
    if (errIns) {
      console.error('[cfdi.insert]', errIns.message);
      json(res, 500, { error: 'Error guardando CFDI', detail: errIns.message });
      return true;
    }

    const lineas = conceptos.map((c, i) => ({
      invoice_id: inv.id, linea: i + 1,
      descripcion: c.descripcion, cantidad: c.cantidad,
      precio_unitario: c.precio_unitario, importe: c.cantidad * c.precio_unitario,
      clave_prod_serv: c.clave_prod_serv, clave_unidad: c.clave_unidad
    }));
    await supabase.from('invoice_lines').insert(lineas);
    await supabase.from('invoice_log').insert({
      invoice_id: inv.id, uuid: finalUuid, accion: 'timbrado',
      resultado: 'ok', detalle: CFDI_IS_PROD ? 'finkok' : 'mock'
    });

    json(res, 201, {
      ok: true, uuid: finalUuid,
      sello: timbre.sello,
      certificado_no: timbre.certificado_no,
      fecha_timbrado: timbre.fecha_timbrado,
      xml: timbre.xml,
      pdf_url: null,
      modo_test: !CFDI_IS_PROD
    });
    return true;
  }

  // POST /api/invoices/cfdi/cancel
  if (pathname === '/api/invoices/cfdi/cancel' && method === 'POST') {
    const auth = await requireAuthCFDI(req, ['owner', 'admin']);
    if (!auth.ok) { json(res, auth.status, { error: auth.error }); return true; }

    const body = await readJSON(req);
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    const { uuid, motivo, folio_sustitucion } = body;
    if (!uuid)                       { json(res, 400, { error: 'uuid requerido' });           return true; }
    if (!MOTIVOS_CANCEL.has(motivo)) { json(res, 400, { error: 'motivo inválido (01-04)' }); return true; }
    if (motivo === '01' && !folio_sustitucion) {
      json(res, 400, { error: 'motivo 01 requiere folio_sustitucion' });
      return true;
    }

    let resultado = 'aceptada', detalle = 'mock';
    try {
      if (CFDI_IS_PROD) {
        const soap =
`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:apps="apps.services.soap.core.views">
 <soapenv:Body>
  <apps:cancel>
   <apps:UUIDS><apps:UUID><apps:UUID>${cfdiEscapeXml(uuid)}</apps:UUID><apps:Motivo>${motivo}</apps:Motivo>${
     folio_sustitucion ? `<apps:FolioSustitucion>${cfdiEscapeXml(folio_sustitucion)}</apps:FolioSustitucion>` : ''
   }</apps:UUID></apps:UUIDS>
   <apps:username>${cfdiEscapeXml(FINKOK_USER)}</apps:username>
   <apps:password>${cfdiEscapeXml(FINKOK_PASS)}</apps:password>
   <apps:taxpayer_id>${cfdiEscapeXml(CFDI_EMISOR_RFC)}</apps:taxpayer_id>
  </apps:cancel>
 </soapenv:Body>
</soapenv:Envelope>`;
        const r = await finkokRequest('"cancel"', soap, '/servicios/soap/cancel.wsdl');
        detalle = `finkok HTTP ${r.status}`;
        if (r.status >= 400) throw new Error(detalle);
      }
    } catch (err) {
      resultado = 'rechazada';
      console.error('[cfdi.cancel]', err.message);
      await supabase.from('invoice_log').insert({
        uuid, accion: 'cancelacion', resultado, detalle: err.message
      });
      json(res, 502, { error: 'Error en cancelación', detail: err.message });
      return true;
    }

    await supabase.from('invoices')
      .update({
        estatus: 'cancelada',
        motivo_cancelacion: motivo,
        folio_sustitucion: folio_sustitucion || null,
        fecha_cancelacion: new Date().toISOString()
      })
      .eq('uuid', uuid);
    await supabase.from('invoice_log').insert({
      uuid, accion: 'cancelacion', resultado, detalle
    });

    json(res, 200, { ok: true, uuid, estatus: 'cancelada', motivo, modo_test: !CFDI_IS_PROD });
    return true;
  }

  // GET /api/invoices/cfdi/:uuid/status
  const m = pathname.match(/^\/api\/invoices\/cfdi\/([^/]+)\/status$/);
  if (m && method === 'GET') {
    const auth = await requireAuthCFDI(req, ['owner', 'admin']);
    if (!auth.ok) { json(res, auth.status, { error: auth.error }); return true; }
    const uuid = decodeURIComponent(m[1]);

    const { data: inv } = await supabase.from('invoices')
      .select('uuid, estatus, fecha_timbrado, fecha_cancelacion, motivo_cancelacion, total, rfc_receptor, modo_test')
      .eq('uuid', uuid).maybeSingle();
    if (!inv) { json(res, 404, { error: 'CFDI no encontrado' }); return true; }

    let estatus_sat = inv.estatus;
    if (CFDI_IS_PROD) {
      try {
        const soap =
`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:apps="apps.services.soap.core.views">
 <soapenv:Body><apps:get_sat_status><apps:uuid>${cfdiEscapeXml(uuid)}</apps:uuid></apps:get_sat_status></soapenv:Body>
</soapenv:Envelope>`;
        const r = await finkokRequest('"get_sat_status"', soap, '/servicios/soap/utilities.wsdl');
        const em = r.body.match(/<estado>([^<]+)<\/estado>/i);
        if (em) estatus_sat = em[1];
      } catch (err) {
        console.error('[cfdi.status]', err.message);
      }
    }

    json(res, 200, {
      ok: true, uuid: inv.uuid,
      estatus_local: inv.estatus, estatus_sat,
      fecha_timbrado: inv.fecha_timbrado,
      fecha_cancelacion: inv.fecha_cancelacion,
      motivo_cancelacion: inv.motivo_cancelacion,
      total: inv.total, rfc_receptor: inv.rfc_receptor,
      modo_test: inv.modo_test
    });
    return true;
  }

  return false;
}

Object.assign(module.exports, {
  handleCFDI,
  cfdiValidateRFC,
  cfdiValidateReceptor,
});
