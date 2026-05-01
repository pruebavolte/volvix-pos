'use strict';

/**
 * Volvix · Usage-Based Billing
 * ----------------------------
 * Cuenta abierta gratis (sin trial). Se cobra cuando el consumo real del mes
 * excede thresholds configurables. Si el tenant no usa, no paga.
 *
 * Tablas (ver migrations/usage-billing.sql):
 *   tenant_usage_events       — eventos crudos (append-only)
 *   tenant_usage_summary      — agregado mensual por tenant
 *   tenant_billing_overrides  — extend_days / free_tier / lock / unlock / mark_paid
 *
 * Endpoints expuestos:
 *   POST /api/billing/track-usage           (interno, idealmente best-effort)
 *   GET  /api/billing/usage/me              (cliente, ve su consumo del mes)
 *   GET  /api/billing/usage/:tenant_id      (admin)
 *   POST /api/billing/lock-tenant           (admin)
 *   POST /api/billing/unlock-tenant         (admin)
 *   POST /api/billing/extend-days           (admin)
 *   POST /api/billing/threshold             (admin)
 *   POST /api/billing/mark-paid             (admin)
 *   GET  /api/billing/check-limits          (público con auth, middleware-friendly)
 *   GET  /api/billing/admin/list            (admin, lista tenants con uso)
 *   POST /api/billing/admin/bulk-lock       (admin)
 *
 * El módulo expone tanto la factory `build(ctx)` (estilo solicitado) como un
 * dispatcher por defecto compatible con el patrón usado por api/index.js
 * (`await handleModule(req, res, parsed, ctx)` retorna true si manejó la ruta).
 */

const crypto = require('crypto');

// =============================================================
// Config
// =============================================================
const CFG = {
  freeSalesPerMonth:    intEnv('BILLING_FREE_SALES_PER_MONTH', 50),
  freeProducts:         intEnv('BILLING_FREE_PRODUCTS', 100),
  freeCustomers:        intEnv('BILLING_FREE_CUSTOMERS', 200),
  freeDaysPerMonth:     intEnv('BILLING_FREE_DAYS_PER_MONTH', 30),
  graceDays:            intEnv('BILLING_GRACE_DAYS_AFTER_THRESHOLD', 7),
  amountDueCents:       intEnv('BILLING_AMOUNT_DUE_CENTS', 49900), // 499.00
};

const EXEMPT_PREFIXES = ['/api/health', '/api/billing/', '/api/auth/', '/api/login', '/api/logout'];
const PAYMENT_REDIRECT = '/billing/payment-required.html';

function intEnv(name, def) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

// =============================================================
// HTTP helpers (default; usan ctx.sendJSON cuando disponible)
// =============================================================
function send(res, status, body) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined) return req.body;
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) data = ''; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function periodFor(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end   = new Date(Date.UTC(y, m + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return role === 'superadmin' || role === 'admin' || role === 'owner';
}

function escapePg(v) { return encodeURIComponent(String(v)); }

// =============================================================
// Core: emit event + recompute summary
// =============================================================

async function trackEventCore(supabaseRequest, { tenant_id, event_type, quantity, metadata }) {
  if (!tenant_id || !event_type) {
    const err = new Error('tenant_id and event_type required');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const qty = Number.isFinite(+quantity) && +quantity > 0 ? Math.min(+quantity, 1000) : 1;

  // daily_login: dedup por dia.
  if (event_type === 'daily_login') {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const since = today.toISOString();
    const existing = await supabaseRequest('GET',
      `/tenant_usage_events?tenant_id=eq.${escapePg(tenant_id)}` +
      `&event_type=eq.daily_login&created_at=gte.${escapePg(since)}` +
      `&select=id&limit=1`).catch(() => []);
    if (Array.isArray(existing) && existing.length) {
      return { ok: true, deduped: true };
    }
  }

  const inserted = await supabaseRequest('POST', '/tenant_usage_events', {
    tenant_id: String(tenant_id),
    event_type: String(event_type),
    quantity: qty,
    metadata: metadata || null,
  }).catch((e) => { return { __err: e }; });

  if (inserted && inserted.__err) {
    return { ok: false, error: 'insert_failed', detail: String(inserted.__err.message || inserted.__err) };
  }

  const summary = await recomputeSummary(supabaseRequest, tenant_id).catch(() => null);
  return { ok: true, summary };
}

async function recomputeSummary(supabaseRequest, tenant_id) {
  const period = periodFor(new Date());
  const since = `${period.start}T00:00:00Z`;
  const until = `${period.end}T23:59:59Z`;

  const events = await supabaseRequest('GET',
    `/tenant_usage_events?tenant_id=eq.${escapePg(tenant_id)}` +
    `&created_at=gte.${escapePg(since)}` +
    `&created_at=lte.${escapePg(until)}` +
    `&select=event_type,quantity,created_at&limit=10000`).catch(() => []);

  const counters = {
    sale_created: 0, product_added: 0, customer_added: 0,
    report_generated: 0, daily_login: 0,
  };
  const activeDays = new Set();
  let lastEventAt = null;

  (events || []).forEach((ev) => {
    const t = String(ev.event_type || '');
    const q = Number.isFinite(+ev.quantity) ? +ev.quantity : 1;
    if (counters[t] != null) counters[t] += q;
    if (ev.created_at) {
      activeDays.add(String(ev.created_at).slice(0, 10));
      if (!lastEventAt || ev.created_at > lastEventAt) lastEventAt = ev.created_at;
    }
  });

  const thresholds = await effectiveThresholds(supabaseRequest, tenant_id);
  const thresholdReached =
    counters.sale_created     >= thresholds.freeSalesPerMonth ||
    counters.product_added    >= thresholds.freeProducts ||
    counters.customer_added   >= thresholds.freeCustomers ||
    activeDays.size           >= thresholds.freeDaysPerMonth;

  // requires_payment: threshold + grace expired (simple version: same as threshold reached for now)
  const requiresPayment = thresholdReached;

  const dueDate = thresholdReached
    ? new Date(Date.now() + thresholds.graceDays * 86400000).toISOString().slice(0, 10)
    : null;

  const row = {
    tenant_id: String(tenant_id),
    period_start: period.start,
    period_end: period.end,
    sales_count: counters.sale_created,
    products_count: counters.product_added,
    customers_count: counters.customer_added,
    reports_count: counters.report_generated,
    active_days: activeDays.size,
    threshold_reached: thresholdReached,
    requires_payment: requiresPayment,
    payment_due_date: dueDate,
    amount_due: thresholdReached ? (CFG.amountDueCents / 100) : 0,
    last_event_at: lastEventAt,
    updated_at: new Date().toISOString(),
  };

  // Upsert por (tenant_id, period_start)
  const existing = await supabaseRequest('GET',
    `/tenant_usage_summary?tenant_id=eq.${escapePg(tenant_id)}` +
    `&period_start=eq.${escapePg(period.start)}&select=id,paid_at&limit=1`).catch(() => []);

  if (Array.isArray(existing) && existing.length) {
    if (existing[0].paid_at) {
      row.paid_at = existing[0].paid_at;
      row.requires_payment = false; // ya pago este periodo
    }
    await supabaseRequest('PATCH',
      `/tenant_usage_summary?id=eq.${escapePg(existing[0].id)}`, row).catch(() => null);
  } else {
    await supabaseRequest('POST', '/tenant_usage_summary', row).catch(() => null);
  }

  return row;
}

async function effectiveThresholds(supabaseRequest, tenant_id) {
  const base = {
    freeSalesPerMonth: CFG.freeSalesPerMonth,
    freeProducts: CFG.freeProducts,
    freeCustomers: CFG.freeCustomers,
    freeDaysPerMonth: CFG.freeDaysPerMonth,
    graceDays: CFG.graceDays,
  };
  const overrides = await supabaseRequest('GET',
    `/tenant_billing_overrides?tenant_id=eq.${escapePg(tenant_id)}` +
    `&type=eq.set_threshold&select=value&order=created_at.desc&limit=1`).catch(() => []);
  if (Array.isArray(overrides) && overrides.length && overrides[0].value && typeof overrides[0].value === 'object') {
    Object.assign(base, overrides[0].value);
  }
  return base;
}

// =============================================================
// check-limits: respuesta normalizada para middleware
// =============================================================
async function checkLimitsCore(supabaseRequest, tenant_id) {
  if (!tenant_id) return { blocked: false, requires_payment: false };

  // 1) lock activo?
  const locks = await supabaseRequest('GET',
    `/tenant_billing_overrides?tenant_id=eq.${escapePg(tenant_id)}` +
    `&type=in.(lock,unlock)&select=type,created_at,expires_at` +
    `&order=created_at.desc&limit=5`).catch(() => []);

  let isLocked = false;
  if (Array.isArray(locks) && locks.length) {
    const latest = locks[0];
    if (latest.type === 'lock') {
      if (!latest.expires_at || new Date(latest.expires_at).getTime() > Date.now()) {
        isLocked = true;
      }
    }
  }
  if (isLocked) {
    return {
      blocked: true,
      requires_payment: true,
      message: 'Cuenta bloqueada por falta de pago. Contacta soporte.',
      cta_url: PAYMENT_REDIRECT,
    };
  }

  // 2) free tier?
  const free = await supabaseRequest('GET',
    `/tenant_billing_overrides?tenant_id=eq.${escapePg(tenant_id)}` +
    `&type=eq.free_tier&select=expires_at&order=created_at.desc&limit=1`).catch(() => []);
  if (Array.isArray(free) && free.length) {
    const exp = free[0].expires_at;
    if (!exp || new Date(exp).getTime() > Date.now()) {
      return { blocked: false, requires_payment: false, free_tier: true };
    }
  }

  // 3) summary del mes
  const period = periodFor(new Date());
  const rows = await supabaseRequest('GET',
    `/tenant_usage_summary?tenant_id=eq.${escapePg(tenant_id)}` +
    `&period_start=eq.${escapePg(period.start)}&select=*&limit=1`).catch(() => []);
  const sum = (Array.isArray(rows) && rows[0]) || null;
  if (!sum) return { blocked: false, requires_payment: false };

  if (sum.paid_at) {
    return { blocked: false, requires_payment: false, paid_at: sum.paid_at };
  }

  if (sum.requires_payment) {
    const dueTs = sum.payment_due_date ? new Date(sum.payment_due_date + 'T23:59:59Z').getTime() : 0;
    if (dueTs && Date.now() > dueTs) {
      return {
        blocked: true,
        requires_payment: true,
        amount_due: sum.amount_due,
        payment_due_date: sum.payment_due_date,
        message: 'Tu periodo de gracia expiró. Paga para continuar usando Volvix.',
        cta_url: PAYMENT_REDIRECT,
      };
    }
    return {
      blocked: false,
      requires_payment: true,
      amount_due: sum.amount_due,
      payment_due_date: sum.payment_due_date,
      soft_warning: 'Has alcanzado tu uso del mes. Paga antes del ' + (sum.payment_due_date || '') + ' para evitar interrupciones.',
      cta_url: PAYMENT_REDIRECT,
    };
  }

  return { blocked: false, requires_payment: false };
}

// =============================================================
// Endpoints
// =============================================================

function buildHandlers(ctx) {
  const supabaseRequest = ctx.supabaseRequest;
  const sendJSON = ctx.sendJSON || ctx.sendJson || send;
  const sendError = ctx.sendError || ((res, err) => sendJSON(res, { error: 'internal', detail: String(err && err.message || err) }, 500));
  const requireAuth = ctx.requireAuth || ((h) => h);

  // POST /api/billing/track-usage   (interno)
  async function trackUsage(req, res) {
    try {
      const body = await readBody(req);
      const tenantId = body.tenant_id || (req.user && (req.user.tenant_id || req.user.id));
      const result = await trackEventCore(supabaseRequest, {
        tenant_id: tenantId,
        event_type: body.event_type,
        quantity: body.quantity,
        metadata: body.metadata,
      });
      sendJSON(res, result);
    } catch (err) {
      if (err && err.code === 'BAD_REQUEST') return sendJSON(res, { error: err.message }, 400);
      sendError(res, err);
    }
  }

  // GET /api/billing/usage/me
  async function myUsage(req, res) {
    try {
      const tenantId = req.user && (req.user.tenant_id || req.user.id);
      if (!tenantId) return sendJSON(res, { error: 'tenant_required' }, 400);
      const data = await usageReport(supabaseRequest, tenantId);
      sendJSON(res, data);
    } catch (err) { sendError(res, err); }
  }

  // GET /api/billing/usage/:tenant_id  (admin)
  async function adminUsage(req, res, params) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const tid = params && params.tenant_id;
      if (!tid) return sendJSON(res, { error: 'tenant_id required' }, 400);
      const data = await usageReport(supabaseRequest, tid);
      sendJSON(res, data);
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/lock-tenant
  async function lockTenant(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.tenant_id) return sendJSON(res, { error: 'tenant_id required' }, 400);
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'lock',
        value: { until: body.until || null },
        reason: body.reason || null,
        granted_by: (req.user && req.user.id) || null,
        expires_at: body.until || null,
      });
      // Soft signal: pos_tenants.is_active=false (best effort, no critical)
      try {
        await supabaseRequest('PATCH',
          `/pos_tenants?id=eq.${escapePg(body.tenant_id)}`,
          { is_active: false });
      } catch (_) {}
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/unlock-tenant
  async function unlockTenant(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.tenant_id) return sendJSON(res, { error: 'tenant_id required' }, 400);
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'unlock',
        reason: body.reason || null,
        granted_by: (req.user && req.user.id) || null,
      });
      try {
        await supabaseRequest('PATCH',
          `/pos_tenants?id=eq.${escapePg(body.tenant_id)}`,
          { is_active: true });
      } catch (_) {}
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/extend-days
  async function extendDays(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.tenant_id) return sendJSON(res, { error: 'tenant_id required' }, 400);
      const days = Math.max(1, Math.min(parseInt(body.days, 10) || 0, 365));
      if (!days) return sendJSON(res, { error: 'days required (1..365)' }, 400);
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'extend_days',
        value: { days },
        reason: body.reason || null,
        granted_by: (req.user && req.user.id) || null,
        expires_at: expires,
      });
      // Tambien free_tier hasta esa fecha: que no requiera pago en el periodo.
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'free_tier',
        value: { granted_days: days },
        reason: body.reason || `Extend +${days} days`,
        granted_by: (req.user && req.user.id) || null,
        expires_at: expires,
      });
      sendJSON(res, { ok: true, expires_at: expires });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/threshold
  async function setThreshold(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.tenant_id) return sendJSON(res, { error: 'tenant_id required' }, 400);
      const value = {};
      ['freeSalesPerMonth','freeProducts','freeCustomers','freeDaysPerMonth','graceDays'].forEach((k) => {
        if (body[k] != null) value[k] = parseInt(body[k], 10);
      });
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'set_threshold',
        value,
        reason: body.reason || null,
        granted_by: (req.user && req.user.id) || null,
      });
      const summary = await recomputeSummary(supabaseRequest, body.tenant_id).catch(() => null);
      sendJSON(res, { ok: true, summary });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/mark-paid
  async function markPaid(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      if (!body.tenant_id) return sendJSON(res, { error: 'tenant_id required' }, 400);
      const period = body.period_start || periodFor(new Date()).start;
      const now = new Date().toISOString();
      await supabaseRequest('PATCH',
        `/tenant_usage_summary?tenant_id=eq.${escapePg(body.tenant_id)}&period_start=eq.${escapePg(period)}`,
        { paid_at: now, requires_payment: false });
      await supabaseRequest('POST', '/tenant_billing_overrides', {
        tenant_id: String(body.tenant_id),
        type: 'mark_paid',
        value: { period_start: period, amount: body.amount || null },
        reason: body.reason || null,
        granted_by: (req.user && req.user.id) || null,
      });
      sendJSON(res, { ok: true, paid_at: now });
    } catch (err) { sendError(res, err); }
  }

  // GET /api/billing/check-limits
  async function checkLimits(req, res) {
    try {
      const tenantId = req.user && (req.user.tenant_id || req.user.id);
      if (!tenantId) return sendJSON(res, { blocked: false, requires_payment: false });
      const result = await checkLimitsCore(supabaseRequest, tenantId);
      sendJSON(res, result);
    } catch (err) { sendError(res, err); }
  }

  // GET /api/billing/admin/list
  async function adminList(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const u = new URL(req.url, 'http://x');
      const onlyUnpaid = u.searchParams.get('only_unpaid') === '1';
      const period = periodFor(new Date()).start;
      let qs = `?period_start=eq.${escapePg(period)}&select=*&order=requires_payment.desc,sales_count.desc&limit=500`;
      if (onlyUnpaid) qs = `?period_start=eq.${escapePg(period)}&requires_payment=eq.true&paid_at=is.null&select=*&order=sales_count.desc&limit=500`;
      const rows = await supabaseRequest('GET', '/tenant_usage_summary' + qs).catch(() => []);
      sendJSON(res, { ok: true, period_start: period, items: rows || [] });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/billing/admin/bulk-lock
  async function bulkLock(req, res) {
    try {
      if (!isAdminUser(req.user)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      const olderThan = Math.max(1, parseInt(body.older_than_days, 10) || 30);
      const cutoff = new Date(Date.now() - olderThan * 86400000).toISOString().slice(0, 10);
      const rows = await supabaseRequest('GET',
        `/tenant_usage_summary?requires_payment=eq.true&paid_at=is.null` +
        `&payment_due_date=lte.${escapePg(cutoff)}&select=tenant_id&limit=1000`).catch(() => []);
      let locked = 0;
      for (const r of (rows || [])) {
        try {
          await supabaseRequest('POST', '/tenant_billing_overrides', {
            tenant_id: r.tenant_id, type: 'lock',
            reason: `bulk_lock>${olderThan}d`,
            granted_by: (req.user && req.user.id) || null,
          });
          await supabaseRequest('PATCH', `/pos_tenants?id=eq.${escapePg(r.tenant_id)}`, { is_active: false }).catch(()=>null);
          locked++;
        } catch (_) {}
      }
      sendJSON(res, { ok: true, locked });
    } catch (err) { sendError(res, err); }
  }

  return {
    'POST /api/billing/track-usage':       trackUsage,
    'GET /api/billing/usage/me':           requireAuth(myUsage),
    'GET /api/billing/usage/:tenant_id':   requireAuth(adminUsage),
    'POST /api/billing/lock-tenant':       requireAuth(lockTenant),
    'POST /api/billing/unlock-tenant':     requireAuth(unlockTenant),
    'POST /api/billing/extend-days':       requireAuth(extendDays),
    'POST /api/billing/threshold':         requireAuth(setThreshold),
    'POST /api/billing/mark-paid':         requireAuth(markPaid),
    'GET /api/billing/check-limits':       requireAuth(checkLimits),
    'GET /api/billing/admin/list':         requireAuth(adminList),
    'POST /api/billing/admin/bulk-lock':   requireAuth(bulkLock),
  };
}

async function usageReport(supabaseRequest, tenant_id) {
  const summary = await recomputeSummary(supabaseRequest, tenant_id);
  const thresholds = await effectiveThresholds(supabaseRequest, tenant_id);
  const limits = await checkLimitsCore(supabaseRequest, tenant_id);
  return { ok: true, tenant_id, summary, thresholds, limits };
}

// =============================================================
// Module factory (estilo solicitado por el spec)
// =============================================================
function build(ctx) {
  return buildHandlers(ctx);
}

// =============================================================
// Default dispatcher (compat con api/index.js pattern)
// =============================================================
async function dispatcher(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const pathname = (parsedUrl && parsedUrl.pathname) || (req.url || '').split('?')[0];
  if (!pathname.startsWith('/api/billing/')) return false;

  const method = String(req.method || 'GET').toUpperCase();
  const handlers = buildHandlers({
    supabaseRequest: ctx.supabaseRequest,
    sendJSON: ctx.sendJson || ctx.sendJSON,
    sendError: ctx.sendError,
    requireAuth: ctx.requireAuth || ((h) => h),
  });

  // Asegura que req.user este resuelto si el host paso ctx.getAuthUser
  if (!req.user && typeof ctx.getAuthUser === 'function') {
    try { req.user = ctx.getAuthUser(); } catch (_) {}
  }

  // Rutas con :tenant_id
  for (const key of Object.keys(handlers)) {
    const [m, route] = key.split(' ');
    if (m !== method) continue;
    if (route.includes(':')) {
      const re = new RegExp('^' + route.replace(/:[^/]+/g, '([^/]+)') + '$');
      const match = pathname.match(re);
      if (match) {
        const params = {};
        const names = (route.match(/:[^/]+/g) || []).map((s) => s.slice(1));
        names.forEach((n, i) => { params[n] = match[i + 1]; });
        await handlers[key](req, res, params);
        return true;
      }
    } else if (route === pathname) {
      await handlers[key](req, res, {});
      return true;
    }
  }
  return false;
}

// =============================================================
// Best-effort tracker (used from hot paths, never throws)
// =============================================================
function safeTrack(supabaseRequest, payload) {
  setImmediate(() => {
    trackEventCore(supabaseRequest, payload).catch(() => null);
  });
}

// =============================================================
// Middleware (called from api/index.js BEFORE dispatch)
// =============================================================
async function billingMiddleware(req, res, ctx) {
  try {
    const pathname = (req.url || '').split('?')[0];
    if (EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return false;
    if (!pathname.startsWith('/api/')) return false;

    const user = (typeof ctx.getAuthUser === 'function' && ctx.getAuthUser()) || req.user;
    const tenantId = user && (user.tenant_id || user.id);
    if (!tenantId) return false; // unauthenticated → no decision aqui

    const result = await checkLimitsCore(ctx.supabaseRequest, tenantId);
    if (result.blocked) {
      send(res, 402, {
        error: 'payment_required',
        message: result.message,
        amount_due: result.amount_due || null,
        cta_url: result.cta_url || PAYMENT_REDIRECT,
      });
      return true;
    }
    if (result.requires_payment && res && typeof res.setHeader === 'function') {
      res.setHeader('X-Volvix-Billing-Warning', '1');
      if (result.amount_due) res.setHeader('X-Volvix-Amount-Due', String(result.amount_due));
    }
    return false;
  } catch (_) {
    return false;
  }
}

module.exports = dispatcher;
module.exports.build = build;
module.exports.buildHandlers = buildHandlers;
module.exports.middleware = billingMiddleware;
module.exports.trackEvent = trackEventCore;
module.exports.safeTrack = safeTrack;
module.exports.checkLimits = checkLimitsCore;
module.exports.recomputeSummary = recomputeSummary;
module.exports.CFG = CFG;
module.exports.EXEMPT_PREFIXES = EXEMPT_PREFIXES;
