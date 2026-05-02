'use strict';

const crypto = require('crypto');

const MP_API = 'https://api.mercadopago.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature, X-Request-Id');
}

async function mpFetch(method, path, body, accessToken) {
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`MP ${res.status}: ${text}`);
    err.status = res.status;
    err.mpBody = json;
    throw err;
  }
  return json;
}

async function ensurePaymentGatewaysTable(supabaseRequest) {
  await supabaseRequest('POST', '/rpc/exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS payment_gateways (
        id uuid DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        provider text NOT NULL,
        config jsonb NOT NULL DEFAULT '{}',
        use_owner_account boolean NOT NULL DEFAULT true,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (tenant_id, provider)
      );
    `
  }).catch(() => {
    // Table may already exist — Supabase RPC may not be available; swallow.
  });
}

async function getTenantToken(supabaseRequest, tenant_id) {
  const rows = await supabaseRequest(
    'GET',
    `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.mercado_pago&active=eq.true&limit=1`,
    null
  ).catch(() => []);
  if (!rows || !rows.length) return null;
  const row = rows[0];
  if (row.use_owner_account) return process.env.MERCADO_PAGO_ACCESS_TOKEN || null;
  return row.config?.access_token || null;
}

function resolveToken(tenantToken) {
  return tenantToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || null;
}

function noToken(sendJson, res) {
  cors(res);
  sendJson(res, 503, { error: 'Mercado Pago no configurado' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function broadcastPaymentUpdate(supabaseUrl, supabaseKey, payload) {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'payment_updates',
        event: 'payment_updated',
        payload,
      }),
    });
  } catch {
    // Non-critical; best-effort
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleCreatePreference(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;
  const user = await getAuthUser(req);
  if (!user) { cors(res); return sendJson(res, 401, { error: 'No autenticado' }); }

  let body;
  try { body = await parseBody(req); } catch {
    cors(res); return sendJson(res, 400, { error: 'JSON inválido' });
  }

  const { sale_id, amount, description, tenant_id, items, payer_email } = body;
  if (!sale_id || !amount || !tenant_id) {
    cors(res); return sendJson(res, 400, { error: 'sale_id, amount, tenant_id requeridos' });
  }

  const token = resolveToken(await getTenantToken(supabaseRequest, tenant_id));
  if (!token) return noToken(sendJson, res);

  const preferencePayload = {
    items: Array.isArray(items) && items.length ? items : [{
      title: description || `Venta ${sale_id}`,
      quantity: 1,
      unit_price: Number(amount),
      currency_id: 'MXN',
    }],
    payer: payer_email ? { email: payer_email } : undefined,
    external_reference: sale_id,
    notification_url: `${process.env.API_BASE_URL || ''}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${process.env.FRONTEND_URL || ''}/payment/success`,
      failure: `${process.env.FRONTEND_URL || ''}/payment/failure`,
      pending: `${process.env.FRONTEND_URL || ''}/payment/pending`,
    },
    auto_return: 'approved',
  };

  let mpResponse;
  try {
    mpResponse = await mpFetch('POST', '/checkout/preferences', preferencePayload, token);
  } catch (e) {
    cors(res);
    return sendJson(res, e.status || 502, { error: e.message, detail: e.mpBody });
  }

  const amountCents = Math.round(Number(amount) * 100);
  try {
    await supabaseRequest('POST', '/payments', {
      sale_id,
      provider: 'mercado_pago',
      provider_payment_id: mpResponse.id,
      status: 'pending',
      amount_cents: amountCents,
      currency: 'MXN',
      tenant_id,
      raw: mpResponse,
    });
  } catch (e) {
    // Log but don't fail — preference already created
    console.error('[MP] Error saving preference to payments:', e.message);
  }

  cors(res);
  sendJson(res, 201, {
    preference_id: mpResponse.id,
    init_point: mpResponse.init_point,
    sandbox_init_point: mpResponse.sandbox_init_point,
  });
}

async function handleCreateSubscription(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;
  const user = await getAuthUser(req);
  if (!user) { cors(res); return sendJson(res, 401, { error: 'No autenticado' }); }

  let body;
  try { body = await parseBody(req); } catch {
    cors(res); return sendJson(res, 400, { error: 'JSON inválido' });
  }

  const { tenant_id, payer_email, amount, description, frequency = 1, frequency_type = 'months' } = body;
  if (!tenant_id || !payer_email || !amount) {
    cors(res); return sendJson(res, 400, { error: 'tenant_id, payer_email, amount requeridos' });
  }

  const token = resolveToken(await getTenantToken(supabaseRequest, tenant_id));
  if (!token) return noToken(sendJson, res);

  const now = new Date();
  const startDate = new Date(now.getTime() + 60_000).toISOString().replace(/\.\d+Z$/, '.000Z');

  const subPayload = {
    reason: description || `Suscripción Volvix POS — ${tenant_id}`,
    auto_recurring: {
      frequency: Number(frequency),
      frequency_type,
      transaction_amount: Number(amount),
      currency_id: 'MXN',
      start_date: startDate,
    },
    payer_email,
    notification_url: `${process.env.API_BASE_URL || ''}/api/webhooks/mercadopago`,
    status: 'authorized',
  };

  let mpResponse;
  try {
    mpResponse = await mpFetch('POST', '/preapproval', subPayload, token);
  } catch (e) {
    cors(res);
    return sendJson(res, e.status || 502, { error: e.message, detail: e.mpBody });
  }

  try {
    await supabaseRequest('POST', '/payments', {
      sale_id: null,
      provider: 'mercado_pago_subscription',
      provider_payment_id: mpResponse.id,
      status: mpResponse.status || 'authorized',
      amount_cents: Math.round(Number(amount) * 100),
      currency: 'MXN',
      tenant_id,
      raw: mpResponse,
    });
  } catch (e) {
    console.error('[MP] Error saving subscription to payments:', e.message);
  }

  cors(res);
  sendJson(res, 201, { subscription_id: mpResponse.id, status: mpResponse.status, init_point: mpResponse.init_point });
}

async function handleWebhook(req, res, ctx) {
  const { supabaseRequest, sendJson } = ctx;

  let rawBody = '';
  await new Promise((resolve, reject) => {
    req.on('data', c => { rawBody += c; });
    req.on('end', resolve);
    req.on('error', reject);
  });

  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-signature'] || '';
    const requestId = req.headers['x-request-id'] || '';

    // MP signature format: ts=<timestamp>,v1=<hmac>
    const tsMatch = signature.match(/ts=([^,]+)/);
    const v1Match = signature.match(/v1=([^,]+)/);

    if (!tsMatch || !v1Match) {
      cors(res); return sendJson(res, 400, { error: 'Firma inválida' });
    }

    const ts = tsMatch[1];
    const v1 = v1Match[1];
    // 2026-05 audit B-28: manifest spec MP es id:<dataId>;request-id:<requestId>;ts:<ts>;
    // ANTES usábamos requestId en lugar de dataId en el primer slot → la firma
    // nunca validaba con secret real.
    let dataIdForManifest = '';
    try {
      // Intentar obtener data.id del query string o body raw. Si no, usamos requestId como fallback.
      const u = require('url');
      const parsed = u.parse(req.url, true);
      dataIdForManifest = String((parsed.query && (parsed.query['data.id'] || parsed.query.id)) || '');
      if (!dataIdForManifest && rawBody) {
        try {
          const b = JSON.parse(rawBody);
          dataIdForManifest = String((b && b.data && b.data.id) || (b && b.id) || '');
        } catch (_) {}
      }
    } catch (_) {}
    const manifest = `id:${dataIdForManifest};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    // Validación segura: ambos buffers deben ser de igual largo y hex válidos.
    let valid = false;
    try {
      const a = Buffer.from(v1, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length === b.length && a.length > 0) {
        valid = crypto.timingSafeEqual(a, b);
      }
    } catch (_) { valid = false; }
    if (!valid) {
      cors(res); return sendJson(res, 401, { error: 'Firma incorrecta' });
    }
  }

  let notification;
  try {
    notification = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    cors(res); return sendJson(res, 400, { error: 'JSON inválido' });
  }

  const action = notification.action || '';
  const dataId = notification.data?.id;

  if (!['payment.created', 'payment.updated'].includes(action) || !dataId) {
    cors(res);
    return sendJson(res, 200, { received: true });
  }

  // Fetch fresh payment from MP using owner token (webhook comes from MP platform)
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    cors(res); return sendJson(res, 503, { error: 'Token no configurado' });
  }

  let mpPayment;
  try {
    mpPayment = await mpFetch('GET', `/v1/payments/${dataId}`, null, token);
  } catch (e) {
    cors(res); return sendJson(res, 502, { error: `No se pudo obtener pago de MP: ${e.message}` });
  }

  const saleId = mpPayment.external_reference || null;
  const mpStatus = mpPayment.status;
  const amountCents = Math.round((mpPayment.transaction_amount || 0) * 100);

  // 2026-05 audit B-27: idempotency. Antes el upsert no detectaba si el evento
  // ya había sido procesado completamente; cualquier reenvío de MP (frecuente)
  // disparaba broadcast + PATCH a pos_payment_verifications de nuevo.
  // Ahora si el row existe con MISMO status, salimos temprano con 200 ack.
  let alreadyProcessed = false;
  try {
    const existing = await supabaseRequest(
      'GET',
      `/payments?provider_payment_id=eq.${encodeURIComponent(String(dataId))}&select=id,status,amount_cents&limit=1`,
      null
    );

    if (existing && existing.length) {
      const prev = existing[0];
      if (prev.status === mpStatus && prev.amount_cents === amountCents) {
        // Evento idéntico ya procesado → ack sin re-disparar side-effects.
        alreadyProcessed = true;
      } else {
        await supabaseRequest(
          'PATCH',
          `/payments?provider_payment_id=eq.${encodeURIComponent(String(dataId))}`,
          { status: mpStatus, raw: mpPayment, amount_cents: amountCents }
        );
      }
    } else {
      await supabaseRequest('POST', '/payments', {
        sale_id: saleId,
        provider: 'mercado_pago',
        provider_payment_id: String(dataId),
        status: mpStatus,
        amount_cents: amountCents,
        currency: mpPayment.currency_id || 'MXN',
        tenant_id: null,
        raw: mpPayment,
      });
    }
  } catch (e) {
    console.error('[MP Webhook] Error updating payments table:', e.message);
  }
  if (alreadyProcessed) {
    cors(res); return sendJson(res, 200, { ok: true, idempotent: true, status: mpStatus });
  }

  if (mpStatus === 'approved' && saleId) {
    try {
      await supabaseRequest(
        'PATCH',
        `/pos_payment_verifications?sale_id=eq.${encodeURIComponent(saleId)}&status=neq.confirmed`,
        { status: 'confirmed' }
      );
    } catch (e) {
      console.error('[MP Webhook] Error updating pos_payment_verifications:', e.message);
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    await broadcastPaymentUpdate(supabaseUrl, supabaseKey, {
      sale_id: saleId,
      provider_payment_id: String(dataId),
      status: mpStatus,
      amount_cents: amountCents,
    });
  }

  cors(res);
  sendJson(res, 200, { received: true });
}

async function handlePaymentStatus(req, res, paymentId, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;
  const user = await getAuthUser(req);
  if (!user) { cors(res); return sendJson(res, 401, { error: 'No autenticado' }); }

  if (!paymentId) { cors(res); return sendJson(res, 400, { error: 'payment_id requerido' }); }

  // Determine token: try to find payment in DB to get tenant_id
  let token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    try {
      const rows = await supabaseRequest(
        'GET',
        `/payments?provider_payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`,
        null
      );
      if (rows && rows.length && rows[0].tenant_id) {
        token = resolveToken(await getTenantToken(supabaseRequest, rows[0].tenant_id));
      }
    } catch {}
  }

  if (!token) return noToken(sendJson, res);

  let mpPayment;
  try {
    mpPayment = await mpFetch('GET', `/v1/payments/${paymentId}`, null, token);
  } catch (e) {
    cors(res);
    return sendJson(res, e.status || 502, { error: e.message });
  }

  cors(res);
  sendJson(res, 200, {
    payment_id: mpPayment.id,
    status: mpPayment.status,
    status_detail: mpPayment.status_detail,
    amount: mpPayment.transaction_amount,
    currency: mpPayment.currency_id,
    external_reference: mpPayment.external_reference,
    date_approved: mpPayment.date_approved,
    payment_method_id: mpPayment.payment_method_id,
    payment_type_id: mpPayment.payment_type_id,
  });
}

async function handleConfigure(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;
  const user = await getAuthUser(req);
  if (!user) { cors(res); return sendJson(res, 401, { error: 'No autenticado' }); }

  let body;
  try { body = await parseBody(req); } catch {
    cors(res); return sendJson(res, 400, { error: 'JSON inválido' });
  }

  const { access_token, public_key, use_owner_account = true } = body;
  const tenant_id = user.tenant_id || user.id;
  if (!tenant_id) { cors(res); return sendJson(res, 400, { error: 'tenant_id no disponible' }); }

  await ensurePaymentGatewaysTable(supabaseRequest);

  const config = {};
  if (!use_owner_account && access_token) config.access_token = access_token;
  if (public_key) config.public_key = public_key;

  try {
    const existing = await supabaseRequest(
      'GET',
      `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.mercado_pago&limit=1`,
      null
    );

    if (existing && existing.length) {
      await supabaseRequest(
        'PATCH',
        `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.mercado_pago`,
        { config, use_owner_account, active: true, updated_at: new Date().toISOString() }
      );
    } else {
      await supabaseRequest('POST', '/payment_gateways', {
        tenant_id,
        provider: 'mercado_pago',
        config,
        use_owner_account,
        active: true,
      });
    }
  } catch (e) {
    cors(res);
    return sendJson(res, 500, { error: `Error guardando configuración: ${e.message}` });
  }

  cors(res);
  sendJson(res, 200, { ok: true, use_owner_account });
}

async function handleGetConfig(req, res, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx;
  const user = await getAuthUser(req);
  if (!user) { cors(res); return sendJson(res, 401, { error: 'No autenticado' }); }

  const tenant_id = user.tenant_id || user.id;
  if (!tenant_id) { cors(res); return sendJson(res, 400, { error: 'tenant_id no disponible' }); }

  let rows;
  try {
    rows = await supabaseRequest(
      'GET',
      `/payment_gateways?tenant_id=eq.${encodeURIComponent(tenant_id)}&provider=eq.mercado_pago&limit=1`,
      null
    );
  } catch {
    rows = [];
  }

  if (!rows || !rows.length) {
    cors(res);
    return sendJson(res, 200, {
      configured: false,
      use_owner_account: true,
      has_owner_token: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    });
  }

  const row = rows[0];
  const config = { ...row.config };
  if (config.access_token) {
    const t = config.access_token;
    config.access_token = t.slice(0, 8) + '****' + t.slice(-4);
  }

  cors(res);
  sendJson(res, 200, {
    configured: true,
    use_owner_account: row.use_owner_account,
    active: row.active,
    has_owner_token: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    public_key: config.public_key || null,
    access_token_preview: config.access_token || null,
    updated_at: row.updated_at,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

module.exports = async function handleMercadoPago(req, res, parsedUrl, ctx) {
  const { sendJson } = ctx;
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Path guard: only handle MP and MP-webhook routes
  if (!pathname.startsWith('/api/payments/mercadopago') &&
      !pathname.startsWith('/api/webhooks/mercadopago')) {
    return false;
  }

  if (method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // POST /api/payments/mercadopago/preference
  if (method === 'POST' && pathname === '/api/payments/mercadopago/preference') {
    await handleCreatePreference(req, res, ctx);
    return true;
  }

  // POST /api/payments/mercadopago/subscription
  if (method === 'POST' && pathname === '/api/payments/mercadopago/subscription') {
    await handleCreateSubscription(req, res, ctx);
    return true;
  }

  // POST /api/webhooks/mercadopago (no auth)
  if (method === 'POST' && pathname === '/api/webhooks/mercadopago') {
    await handleWebhook(req, res, ctx);
    return true;
  }

  // GET /api/payments/mercadopago/status/:payment_id
  const statusMatch = pathname.match(/^\/api\/payments\/mercadopago\/status\/([^/]+)$/);
  if (method === 'GET' && statusMatch) {
    await handlePaymentStatus(req, res, statusMatch[1], ctx);
    return true;
  }

  // POST /api/payments/mercadopago/configure
  if (method === 'POST' && pathname === '/api/payments/mercadopago/configure') {
    await handleConfigure(req, res, ctx);
    return true;
  }

  // GET /api/payments/mercadopago/config
  if (method === 'GET' && pathname === '/api/payments/mercadopago/config') {
    await handleGetConfig(req, res, ctx);
    return true;
  }

  return false;
};
