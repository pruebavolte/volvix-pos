'use strict';

/**
 * activity-feed.js — Live activity feed para el dashboard del tenant.
 *
 * Endpoint:
 *   GET /api/activity?since=<iso>&type=<a,b>&user_id=<id>&limit=<n>
 *     - filtra por tenant_id del usuario autenticado (admin sees own tenant)
 *     - lee de volvix_audit_log y mapea cada row a un evento "amigable"
 *
 * Tipos soportados (filtro client-side por substring):
 *   sale, login, edit, delete, insert, update, payment, customer, product, settings
 *
 * Devuelve:
 *   { ok: true, items: [{ id, ts, type, user_id, icon, title, summary, details }], total }
 *
 * Exporta: async function handleActivity(req, res, parsedUrl, ctx)
 */

const url = require('url');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function classify(action, resource, semantic) {
  const a = String(action || '').toUpperCase();
  const r = String(resource || '').toLowerCase();
  const s = String(semantic || '').toLowerCase();

  if (s.includes('login') || r === 'auth' || s.includes('signin')) {
    return { type: 'login', icon: '🔐', title: 'Inicio de sesión' };
  }
  if (s.includes('logout')) {
    return { type: 'login', icon: '🚪', title: 'Cierre de sesión' };
  }
  if (r.includes('sale') || s.includes('sale') || s.includes('venta')) {
    return { type: 'sale', icon: '🛒', title: 'Venta registrada' };
  }
  if (r.includes('payment') || s.includes('payment') || s.includes('pago')) {
    return { type: 'payment', icon: '💳', title: 'Pago' };
  }
  if (r.includes('customer') || s.includes('customer') || s.includes('cliente')) {
    return { type: 'customer', icon: '👤', title: 'Cliente' };
  }
  if (r.includes('product') || s.includes('product') || s.includes('producto')) {
    return { type: 'product', icon: '📦', title: 'Producto' };
  }
  if (r.includes('user') || s.includes('user')) {
    return { type: 'user', icon: '👥', title: 'Usuario' };
  }
  if (r.includes('setting') || s.includes('setting') || s.includes('config')) {
    return { type: 'settings', icon: '⚙️', title: 'Configuración' };
  }
  if (a === 'DELETE' || s.includes('delete') || s.includes('removed')) {
    return { type: 'delete', icon: '🗑️', title: 'Eliminación' };
  }
  if (a === 'UPDATE' || s.includes('update') || s.includes('edit')) {
    return { type: 'edit', icon: '✏️', title: 'Edición' };
  }
  if (a === 'INSERT' || s.includes('create') || s.includes('added')) {
    return { type: 'insert', icon: '➕', title: 'Creación' };
  }
  return { type: 'other', icon: '📌', title: 'Actividad' };
}

function buildSummary(row, semantic) {
  const parts = [];
  if (row.resource) parts.push(String(row.resource));
  if (row.resource_id) parts.push(`#${String(row.resource_id).slice(0, 8)}`);
  if (semantic) parts.push(semantic);
  return parts.join(' · ').slice(0, 200);
}

function mapRow(row) {
  const after = (row && row.after && typeof row.after === 'object') ? row.after : {};
  const semantic = after._semantic || '';
  const c = classify(row.action, row.resource, semantic);
  return {
    id: row.id || null,
    ts: row.ts || row.created_at || null,
    type: c.type,
    icon: c.icon,
    title: c.title,
    user_id: row.user_id || null,
    resource: row.resource || null,
    resource_id: row.resource_id || null,
    summary: buildSummary(row, semantic),
    country: row.country || (row.geo && row.geo.country_code) || null,
    city: row.city || (row.geo && row.geo.city) || null,
    ip: row.ip || null,
    details: {
      action: row.action || null,
      semantic,
      before: row.before || null,
      after,
      geo: row.geo || null,
    },
  };
}

async function handleActivity(ctx, req, res, parsedUrl) {
  const user = ctx.getAuthUser ? ctx.getAuthUser() : req.user;
  if (!user) return send(res, 401, { error: 'unauthorized' });

  const q = (parsedUrl && parsedUrl.query) || url.parse(req.url || '', true).query || {};
  const limit = Math.min(parseInt(q.limit, 10) || 100, 500);
  const tenantId = user.tenant_id;
  if (!tenantId) return send(res, 400, { error: 'tenant_required' });

  const params = [
    'select=*',
    'order=ts.desc',
    `limit=${limit}`,
    `tenant_id=eq.${encodeURIComponent(tenantId)}`,
  ];

  if (q.since) {
    params.push(`ts=gte.${encodeURIComponent(String(q.since))}`);
  }
  if (q.user_id) {
    params.push(`user_id=eq.${encodeURIComponent(String(q.user_id))}`);
  }

  let rows = [];
  try {
    rows = await ctx.supabaseRequest('GET', `/volvix_audit_log?${params.join('&')}`);
    if (!Array.isArray(rows)) rows = [];
  } catch (_) { rows = []; }

  let items = rows.map(mapRow);

  // Type filter (client-side over the mapped events)
  if (q.type) {
    const wanted = String(q.type).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (wanted.length) {
      items = items.filter((it) => wanted.includes(it.type));
    }
  }

  return send(res, 200, { ok: true, items, total: items.length });
}

module.exports = async function handleActivityModule(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  if (!pathname.startsWith('/api/activity')) return false;

  try {
    if (method === 'GET' && (pathname === '/api/activity' || pathname === '/api/activity/')) {
      await handleActivity(ctx, req, res, parsedUrl);
      return true;
    }
    return false;
  } catch (e) {
    try { send(res, 500, { error: 'activity_internal_error', detail: ctx.IS_PROD ? 'internal' : String(e && e.message || e) }); } catch (_) {}
    return true;
  }
};

module.exports.mapRow = mapRow;
module.exports.classify = classify;
