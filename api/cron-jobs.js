// api/cron-jobs.js
// Scheduled tasks invocables por Vercel Cron (o cualquier scheduler).
//
// Endpoints expuestos via register({ handlers, ... }):
//   POST /api/cron/daily-summary    — corre diario 8AM
//   POST /api/cron/weekly-report    — corre lunes 9AM
//   POST /api/cron/monthly-billing  — corre día 1 a las 10AM
//
// Seguridad: en producción Vercel envía el header
//   Authorization: Bearer <CRON_SECRET>.
// Si CRON_SECRET no está set, los endpoints aceptan cualquier llamada
// para facilitar pruebas locales (registra warning).

'use strict';

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') {
    return helpers.sendJSON(res, payload, status || 200);
  }
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isCronAuthorized(req) {
  // 2026-05 audit B-43: en PROD el CRON_SECRET es obligatorio. Antes si la
  // env no estaba seteada, devolvíamos true → cualquier visitor podía
  // disparar daily-summary y enviar emails masivos a todos los tenants.
  const expected = process.env.CRON_SECRET || '';
  const isProd = process.env.NODE_ENV === 'production';
  if (!expected) {
    if (isProd) return false; // fail-closed en prod
    return true; // dev mode — sigue libre
  }
  // Vercel Cron envía un header 'x-vercel-cron' además del Authorization.
  // Aceptamos cualquiera de los dos.
  const hdrV = req.headers && (req.headers['x-vercel-cron'] || req.headers['X-Vercel-Cron']);
  if (hdrV) return true;
  const hdr = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
  if (!hdr || typeof hdr !== 'string') return false;
  const parts = hdr.split(/\s+/);
  if (parts.length !== 2) return false;
  if (parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === expected;
}

function isoDayAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayUtcStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchTenantsList(supabaseRequest) {
  if (typeof supabaseRequest !== 'function') return [];
  try {
    const rows = await supabaseRequest('GET', '/pos_companies?select=id,tenant_id,name,owner_email&limit=10000');
    return Array.isArray(rows) ? rows : [];
  } catch (_) { return []; }
}

async function aggregateSalesPerTenant(supabaseRequest, sinceIso, untilIso) {
  if (typeof supabaseRequest !== 'function') return {};
  try {
    const qs =
      '/pos_sales?select=tenant_id,total,status,created_at' +
      '&created_at=gte.' + encodeURIComponent(sinceIso) +
      '&created_at=lt.' + encodeURIComponent(untilIso) +
      '&status=neq.void' +
      '&limit=50000';
    const rows = await supabaseRequest('GET', qs);
    const agg = {};
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const k = r.tenant_id || 'unknown';
      if (!agg[k]) agg[k] = { tenant_id: k, count: 0, total: 0 };
      agg[k].count++;
      agg[k].total += Number(r.total) || 0;
    }
    return agg;
  } catch (_) { return {}; }
}

async function deleteOldLogs(supabaseRequest, daysOlderThan) {
  if (typeof supabaseRequest !== 'function') return { deleted: 0 };
  const cutoff = isoDayAgo(daysOlderThan);
  let deleted = 0;
  // Tablas habituales con logs antiguos
  const tables = ['audit_logs', 'request_logs', 'fraud_alerts'];
  for (const t of tables) {
    try {
      // Solo intentamos en fraud_alerts si están "approved"/"rejected"; resto, todos
      const filter = (t === 'fraud_alerts')
        ? 'created_at=lt.' + encodeURIComponent(cutoff) + '&status=in.(approved,rejected)'
        : 'created_at=lt.' + encodeURIComponent(cutoff);
      await supabaseRequest('DELETE', '/' + t + '?' + filter);
      deleted++;
    } catch (_) { /* tabla puede no existir; ignorar */ }
  }
  return { deleted };
}

async function recalcFraudScores(supabaseRequest) {
  // Stub: marca alertas pending viejas como "stale" para revisión manual.
  if (typeof supabaseRequest !== 'function') return { recalculated: 0 };
  try {
    const cutoff = isoDayAgo(7);
    await supabaseRequest(
      'PATCH',
      '/fraud_alerts?status=eq.pending&created_at=lt.' + encodeURIComponent(cutoff),
      { status: 'stale', reviewed_at: new Date().toISOString() }
    );
    return { recalculated: 1 };
  } catch (_) { return { recalculated: 0 }; }
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildSummaryHtml(tenant, stats, periodLabel) {
  return [
    '<h2>Resumen ' + periodLabel + ' — ' + (tenant.name || 'Negocio') + '</h2>',
    '<ul>',
      '<li><strong>Ventas:</strong> ' + (stats.count || 0) + '</li>',
      '<li><strong>Total:</strong> ' + fmtMoney(stats.total) + '</li>',
      (stats.count > 0
        ? '<li><strong>Ticket promedio:</strong> ' + fmtMoney(stats.total / stats.count) + '</li>'
        : ''),
    '</ul>',
    '<p style="color:#888;font-size:12px">Generado automáticamente por Volvix.</p>'
  ].join('');
}

function register(deps) {
  const {
    handlers,
    supabaseRequest,
    sendJSON,
    sendError,
    sendEmail,
  } = deps || {};

  if (!handlers) throw new Error('cron-jobs: handlers required');
  const helpers = { sendJSON, sendError };

  // ============================================================
  // POST /api/cron/daily-summary
  // ============================================================
  // 2026-05 audit B-42: Vercel cron envía GET (no POST). Antes los handlers
  // solo respondían a POST → 404, los 3 jobs nunca corrían en producción.
  // Ahora ambos métodos quedan registrados.
  const _dailySummary = async (req, res) => {
    try {
      if (!isCronAuthorized(req)) {
        return send(res, { ok: false, error: 'unauthorized' }, 401, helpers);
      }
      const since = isoDayAgo(1);
      const until = todayUtcStart();
      const tenants = await fetchTenantsList(supabaseRequest);
      const agg = await aggregateSalesPerTenant(supabaseRequest, since, until);

      let mailed = 0;
      let failed = 0;
      for (const t of tenants) {
        const stats = agg[t.tenant_id] || agg[t.id] || { count: 0, total: 0 };
        if (!t.owner_email || stats.count === 0) continue;
        if (typeof sendEmail === 'function') {
          try {
            await sendEmail({
              to: t.owner_email,
              subject: 'Resumen diario — ' + (t.name || 'Tu negocio'),
              html: buildSummaryHtml(t, stats, 'diario'),
            });
            mailed++;
          } catch (_) { failed++; }
        }
      }

      const cleanup = await deleteOldLogs(supabaseRequest, 90);
      const fraud   = await recalcFraudScores(supabaseRequest);

      return send(res, {
        ok: true,
        period: { since, until },
        tenants_processed: tenants.length,
        emails_sent: mailed,
        emails_failed: failed,
        cleanup,
        fraud,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ============================================================
  // POST /api/cron/weekly-report
  // ============================================================
  handlers['GET /api/cron/daily-summary']  = _dailySummary;
  handlers['POST /api/cron/daily-summary'] = _dailySummary;

  const _weeklyReport = async (req, res) => {
    try {
      if (!isCronAuthorized(req)) {
        return send(res, { ok: false, error: 'unauthorized' }, 401, helpers);
      }
      const since = isoDayAgo(7);
      const until = todayUtcStart();
      const tenants = await fetchTenantsList(supabaseRequest);
      const agg = await aggregateSalesPerTenant(supabaseRequest, since, until);

      let mailed = 0;
      let failed = 0;
      for (const t of tenants) {
        const stats = agg[t.tenant_id] || agg[t.id] || { count: 0, total: 0 };
        if (!t.owner_email) continue;
        if (typeof sendEmail === 'function') {
          try {
            await sendEmail({
              to: t.owner_email,
              subject: 'Reporte semanal — ' + (t.name || 'Tu negocio'),
              html: buildSummaryHtml(t, stats, 'semanal'),
            });
            mailed++;
          } catch (_) { failed++; }
        }
      }
      return send(res, {
        ok: true,
        period: { since, until },
        tenants_processed: tenants.length,
        emails_sent: mailed,
        emails_failed: failed,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ============================================================
  // POST /api/cron/monthly-billing
  // ============================================================
  handlers['GET /api/cron/weekly-report']  = _weeklyReport;
  handlers['POST /api/cron/weekly-report'] = _weeklyReport;

  const _monthlyBilling = async (req, res) => {
    try {
      if (!isCronAuthorized(req)) {
        return send(res, { ok: false, error: 'unauthorized' }, 401, helpers);
      }
      const since = isoDayAgo(30);
      const until = todayUtcStart();
      const tenants = await fetchTenantsList(supabaseRequest);
      const agg = await aggregateSalesPerTenant(supabaseRequest, since, until);

      let invoicesGenerated = 0;
      const errors = [];
      for (const t of tenants) {
        const stats = agg[t.tenant_id] || agg[t.id] || { count: 0, total: 0 };
        const tenantId = t.tenant_id || t.id;
        if (!tenantId) continue;
        // Crear registro de billing en Supabase (best-effort)
        if (typeof supabaseRequest === 'function') {
          try {
            await supabaseRequest('POST', '/billing_invoices', {
              tenant_id: tenantId,
              period_start: since,
              period_end: until,
              sales_count: stats.count,
              sales_total: stats.total,
              status: 'pending',
              created_at: new Date().toISOString(),
            });
            invoicesGenerated++;
          } catch (e) {
            errors.push({ tenant_id: tenantId, err: String(e && e.message || e) });
          }
        }
        // Email al owner
        if (t.owner_email && typeof sendEmail === 'function') {
          try {
            await sendEmail({
              to: t.owner_email,
              subject: 'Estado de cuenta mensual — ' + (t.name || 'Tu negocio'),
              html: buildSummaryHtml(t, stats, 'mensual'),
            });
          } catch (_) { /* best-effort */ }
        }
      }
      return send(res, {
        ok: true,
        period: { since, until },
        tenants_processed: tenants.length,
        invoices_generated: invoicesGenerated,
        errors,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  handlers['GET /api/cron/monthly-billing']  = _monthlyBilling;
  handlers['POST /api/cron/monthly-billing'] = _monthlyBilling;

  return [
    'GET /api/cron/daily-summary',  'POST /api/cron/daily-summary',
    'GET /api/cron/weekly-report',  'POST /api/cron/weekly-report',
    'GET /api/cron/monthly-billing','POST /api/cron/monthly-billing',
  ];
}

module.exports = { register, isCronAuthorized };
