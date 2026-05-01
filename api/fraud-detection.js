// api/fraud-detection.js
// Deteccion de fraude — scoring heuristico (no ML).
//
// Endpoints expuestos via register(handlers, deps):
//   GET  /api/fraud/alerts?limit=50&status=pending
//   POST /api/fraud/review/:sale_id   body { action: 'approve'|'reject', notes }
//   POST /api/fraud/score              body { sale: {...} }   (helper / test)
//
// Reglas (score 0-1):
//   high (>=0.8): venta > 3x avg ticket, >5 ventas en 60s del mismo cajero,
//                 ticket sin items
//   med  (>=0.5): descuento > 20%, refund mismo dia / misma venta
//   low  (>=0.2): ticket alejado del normal del cajero (>2x o <0.3x)

'use strict';

const RULES = {
  HIGH_NO_ITEMS:        { id: 'no_items',         weight: 1.00, severity: 'high' },
  HIGH_TICKET_3X_AVG:   { id: 'ticket_3x_avg',    weight: 0.85, severity: 'high' },
  HIGH_VELOCITY_5_60S:  { id: 'velocity_5_per_60s', weight: 0.80, severity: 'high' },
  MED_DISCOUNT_20:      { id: 'discount_gt_20',   weight: 0.55, severity: 'medium' },
  MED_SAMEDAY_REFUND:   { id: 'sameday_refund',   weight: 0.60, severity: 'medium' },
  LOW_TICKET_ANOMALY:   { id: 'ticket_anomaly',   weight: 0.25, severity: 'low' },
};

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def === undefined ? 0 : def);
}

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') return helpers.sendJSON(res, payload, status || 200);
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBodySafe(req, helpers) {
  if (typeof helpers.readBody === 'function') return helpers.readBody(req);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/**
 * Calcula score de fraude para una venta dado un contexto.
 * @param {object} sale  { id, total, items, discount, cashier_id, created_at, refund_of }
 * @param {object} ctx   { avg_ticket, cashier_avg_ticket, cashier_recent_sales, sameday_refund }
 * @returns {{score: number, rules: Array, severity: string}}
 */
function scoreSale(sale, ctx) {
  const triggered = [];
  ctx = ctx || {};
  const total = num(sale && sale.total, 0);
  const itemsCount = Array.isArray(sale && sale.items) ? sale.items.length : num(sale && sale.items_count, 0);
  const discountPct = num(sale && sale.discount_pct, 0);
  const avg = num(ctx.avg_ticket, 0);
  const cAvg = num(ctx.cashier_avg_ticket, avg);
  const recent = num(ctx.cashier_recent_sales, 0);

  // HIGH
  if (itemsCount === 0 && total > 0) triggered.push({ ...RULES.HIGH_NO_ITEMS });
  if (avg > 0 && total > 3 * avg)    triggered.push({ ...RULES.HIGH_TICKET_3X_AVG, detail: { total, avg } });
  if (recent > 5)                    triggered.push({ ...RULES.HIGH_VELOCITY_5_60S, detail: { recent } });

  // MEDIUM
  if (discountPct > 20)              triggered.push({ ...RULES.MED_DISCOUNT_20, detail: { discountPct } });
  if (ctx.sameday_refund)            triggered.push({ ...RULES.MED_SAMEDAY_REFUND });

  // LOW
  if (cAvg > 0 && (total > 2 * cAvg || total < 0.3 * cAvg)) {
    triggered.push({ ...RULES.LOW_TICKET_ANOMALY, detail: { total, cAvg } });
  }

  // Score = max weight (no se suma; evita falsos positivos compuestos)
  const score = triggered.reduce((m, r) => Math.max(m, r.weight), 0);
  let severity = 'none';
  if (score >= 0.8) severity = 'high';
  else if (score >= 0.5) severity = 'medium';
  else if (score >= 0.2) severity = 'low';
  return { score: Number(score.toFixed(2)), rules: triggered, severity };
}

// ============ STORE ADAPTER ============

function makeStore(supabaseRequest) {
  if (typeof supabaseRequest === 'function') {
    return {
      async listAlerts(status, limit) {
        const lim = Math.min(Math.max(num(limit, 50), 1), 500);
        const qs = `?status=eq.${encodeURIComponent(status || 'pending')}&select=*&order=created_at.desc&limit=${lim}`;
        try { return await supabaseRequest('GET', `/fraud_alerts${qs}`) || []; }
        catch (e) { return { _error: String(e && e.message || e) }; }
      },
      async reviewSale(saleId, action, notes, reviewer) {
        const patch = {
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewer || null,
          review_notes: notes || null,
        };
        try {
          await supabaseRequest('PATCH', `/fraud_alerts?sale_id=eq.${encodeURIComponent(saleId)}&status=eq.pending`, patch);
          if (action === 'reject') {
            try { await supabaseRequest('PATCH', `/pos_sales?id=eq.${encodeURIComponent(saleId)}`, { status: 'void', fraud_review: false }); }
            catch (_) {}
          } else {
            try { await supabaseRequest('PATCH', `/pos_sales?id=eq.${encodeURIComponent(saleId)}`, { fraud_review: false }); }
            catch (_) {}
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      },
    };
  }
  // Fallback en-memoria
  const alerts = [];
  return {
    async listAlerts(status) { return alerts.filter(a => a.status === (status || 'pending')); },
    async reviewSale(saleId, action) {
      let n = 0;
      for (const a of alerts) {
        if (a.sale_id === saleId && a.status === 'pending') {
          a.status = action === 'approve' ? 'approved' : 'rejected';
          n++;
        }
      }
      return { ok: n > 0, updated: n };
    },
    _push(a) { alerts.push(a); },
  };
}

// ============ HANDLERS ============

function buildHandlers(deps) {
  const helpers = { sendJSON: deps.sendJSON, sendError: deps.sendError, readBody: deps.readBody };
  const requireAuth = deps.requireAuth || ((fn) => fn);
  const store = makeStore(deps.supabaseRequest);

  // GET /api/fraud/alerts
  const getAlerts = requireAuth(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status') || 'pending';
      const limit = url.searchParams.get('limit') || '50';
      const rows = await store.listAlerts(status, limit);
      if (rows && rows._error) return send(res, { ok: false, error: rows._error }, 500, helpers);
      return send(res, Array.isArray(rows) ? rows : [], 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // POST /api/fraud/review/:sale_id
  const postReview = requireAuth(async (req, res, params) => {
    try {
      const saleId = params && params.sale_id;
      if (!saleId) return send(res, { ok: false, error: 'sale_id_required' }, 400, helpers);
      const body = await readBodySafe(req, helpers);
      const action = String(body && body.action || '').toLowerCase();
      if (!['approve', 'reject'].includes(action)) {
        return send(res, { ok: false, error: 'invalid_action', allowed: ['approve','reject'] }, 400, helpers);
      }
      const reviewer = req.user && (req.user.id || req.user.email) || null;
      const r = await store.reviewSale(saleId, action, body.notes, reviewer);
      if (!r.ok) return send(res, { ok: false, error: r.error || 'review_failed' }, 500, helpers);
      return send(res, { ok: true, sale_id: saleId, action }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // POST /api/fraud/score  (debug helper)
  const postScore = requireAuth(async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const result = scoreSale(body && body.sale || {}, body && body.ctx || {});
      return send(res, { ok: true, ...result }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  return {
    'GET /api/fraud/alerts':            getAlerts,
    'POST /api/fraud/review/:sale_id':  postReview,
    'POST /api/fraud/score':            postScore,
  };
}

function register(handlers, deps) {
  const own = buildHandlers(deps || {});
  for (const k of Object.keys(own)) {
    if (!handlers[k]) handlers[k] = own[k]; // no pisa los del index.js si ya existen
  }
  return Object.keys(own);
}

module.exports = { register, buildHandlers, scoreSale, RULES };
