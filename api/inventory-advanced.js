'use strict';

/**
 * api/inventory-advanced.js
 * Volvix POS — Multi-warehouse inventory, transfers, cycle counts, smart reorder.
 *
 * Routes:
 *   POST  /api/warehouses                       (admin)  body: { tenant_id, name, code, address?, is_default? }
 *   GET   /api/warehouses?tenant_id=X
 *   PUT   /api/warehouses/:id                   body: { name?, code?, address?, is_default? }
 *   DELETE /api/warehouses/:id
 *
 *   POST  /api/inventory/transfer               body: { tenant_id, from_warehouse, to_warehouse, items:[{product_id, qty}], note? }
 *   GET   /api/inventory/by-warehouse?warehouse_id=X
 *   POST  /api/inventory/cycle-count            body: { warehouse_id, counts:[{product_id, counted_qty}], note? }
 *   POST  /api/inventory/reorder-suggest        body: { tenant_id, lead_time_days?:7, safety_pct?:0.2, days?:30 }
 *
 * Exported: async function handleInventoryAdvanced(req, res, parsedUrl, ctx)
 *   ctx = { supabaseRequest, getAuthUser, sendJson, IS_PROD }
 *
 * DB tables (Supabase / PostgreSQL):
 *   -- warehouses
 *   create table if not exists warehouses (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     name text not null,
 *     code text,
 *     address text,
 *     is_default boolean default false,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 *
 *   -- inventory_by_warehouse (stock per product per warehouse)
 *   create table if not exists inventory_by_warehouse (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     warehouse_id uuid not null references warehouses(id) on delete cascade,
 *     product_id uuid not null,
 *     qty numeric not null default 0,
 *     reorder_point numeric,
 *     safety_stock numeric,
 *     lead_time_days int,
 *     updated_at timestamptz default now(),
 *     unique (warehouse_id, product_id)
 *   );
 *
 *   -- inventory_transfers
 *   create table if not exists inventory_transfers (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     from_warehouse uuid not null references warehouses(id),
 *     to_warehouse uuid not null references warehouses(id),
 *     items jsonb not null,
 *     note text,
 *     status text default 'completed',
 *     created_by uuid,
 *     created_at timestamptz default now()
 *   );
 *
 *   -- inventory_cycle_counts
 *   create table if not exists inventory_cycle_counts (
 *     id uuid primary key default gen_random_uuid(),
 *     tenant_id uuid not null,
 *     warehouse_id uuid not null references warehouses(id),
 *     counts jsonb not null,
 *     adjustments jsonb,
 *     note text,
 *     created_by uuid,
 *     created_at timestamptz default now()
 *   );
 */

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
      try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('invalid_json')); }
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

// ---------- warehouses CRUD ----------

async function listWarehouses(ctx, req, res, parsedUrl) {
  const tenantId = parsedUrl.query && parsedUrl.query.tenant_id;
  if (!tenantId) return err(res, 400, 'missing_tenant_id', 'tenant_id requerido');
  try {
    const rows = await sb(ctx, 'GET', `/warehouses?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc`);
    return send(res, 200, { ok: true, warehouses: rows || [] });
  } catch (e) {
    return err(res, 500, 'list_failed', String(e.message || e));
  }
}

async function createWarehouse(ctx, req, res) {
  const user = ctx.getAuthUser && ctx.getAuthUser();
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin required');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', String(e.message || e)); }
  const { tenant_id, name, code, address, is_default } = body || {};
  if (!tenant_id || !name) return err(res, 400, 'missing_fields', 'tenant_id y name requeridos');
  try {
    const row = {
      tenant_id, name, code: code || null, address: address || null,
      is_default: !!is_default, created_at: new Date().toISOString(),
    };
    const created = await sb(ctx, 'POST', '/warehouses', row);
    return send(res, 201, { ok: true, warehouse: Array.isArray(created) ? created[0] : created });
  } catch (e) {
    return err(res, 500, 'create_failed', String(e.message || e));
  }
}

async function updateWarehouse(ctx, req, res, id) {
  const user = ctx.getAuthUser && ctx.getAuthUser();
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'invalid warehouse id');
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', String(e.message || e)); }
  const patch = {};
  ['name', 'code', 'address', 'is_default'].forEach((k) => {
    if (body && Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
  });
  patch.updated_at = new Date().toISOString();
  try {
    const updated = await sb(ctx, 'PATCH', `/warehouses?id=eq.${encodeURIComponent(id)}`, patch);
    return send(res, 200, { ok: true, warehouse: Array.isArray(updated) ? updated[0] : updated });
  } catch (e) {
    return err(res, 500, 'update_failed', String(e.message || e));
  }
}

async function deleteWarehouse(ctx, req, res, id) {
  const user = ctx.getAuthUser && ctx.getAuthUser();
  if (!isAdmin(user)) return err(res, 403, 'forbidden', 'admin required');
  if (!isUuid(id)) return err(res, 400, 'bad_id', 'invalid warehouse id');
  try {
    await sb(ctx, 'DELETE', `/warehouses?id=eq.${encodeURIComponent(id)}`);
    return send(res, 200, { ok: true, deleted: id });
  } catch (e) {
    return err(res, 500, 'delete_failed', String(e.message || e));
  }
}

// ---------- transfer between warehouses ----------

async function inventoryTransfer(ctx, req, res) {
  const user = ctx.getAuthUser && ctx.getAuthUser();
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', String(e.message || e)); }
  const { tenant_id, from_warehouse, to_warehouse, items, note } = body || {};
  if (!tenant_id || !from_warehouse || !to_warehouse) {
    return err(res, 400, 'missing_fields', 'tenant_id, from_warehouse, to_warehouse requeridos');
  }
  if (from_warehouse === to_warehouse) {
    return err(res, 400, 'same_warehouse', 'from y to deben ser distintos');
  }
  if (!Array.isArray(items) || items.length === 0) {
    return err(res, 400, 'no_items', 'items vacio');
  }

  const adjustments = [];
  try {
    for (const it of items) {
      const pid = it && it.product_id;
      const qty = Number(it && it.qty);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;

      // decrement from origin
      const fromRows = await sb(ctx, 'GET',
        `/inventory_by_warehouse?warehouse_id=eq.${encodeURIComponent(from_warehouse)}&product_id=eq.${encodeURIComponent(pid)}&select=id,qty`);
      const fromRow = Array.isArray(fromRows) ? fromRows[0] : fromRows;
      const fromQty = Number(fromRow && fromRow.qty) || 0;
      if (fromQty < qty) {
        return err(res, 409, 'insufficient_stock', `producto ${pid} stock=${fromQty} < ${qty}`);
      }
      if (fromRow && fromRow.id) {
        await sb(ctx, 'PATCH', `/inventory_by_warehouse?id=eq.${encodeURIComponent(fromRow.id)}`,
          { qty: fromQty - qty, updated_at: new Date().toISOString() });
      }

      // increment destination (upsert pattern)
      const toRows = await sb(ctx, 'GET',
        `/inventory_by_warehouse?warehouse_id=eq.${encodeURIComponent(to_warehouse)}&product_id=eq.${encodeURIComponent(pid)}&select=id,qty`);
      const toRow = Array.isArray(toRows) ? toRows[0] : toRows;
      if (toRow && toRow.id) {
        await sb(ctx, 'PATCH', `/inventory_by_warehouse?id=eq.${encodeURIComponent(toRow.id)}`,
          { qty: (Number(toRow.qty) || 0) + qty, updated_at: new Date().toISOString() });
      } else {
        await sb(ctx, 'POST', '/inventory_by_warehouse', {
          tenant_id, warehouse_id: to_warehouse, product_id: pid, qty,
          updated_at: new Date().toISOString(),
        });
      }
      adjustments.push({ product_id: pid, qty });
    }

    const transfer = {
      tenant_id, from_warehouse, to_warehouse,
      items: adjustments,
      note: note || null,
      status: 'completed',
      created_by: user && user.id ? user.id : null,
      created_at: new Date().toISOString(),
    };
    const created = await sb(ctx, 'POST', '/inventory_transfers', transfer);
    return send(res, 201, { ok: true, transfer: Array.isArray(created) ? created[0] : created, adjustments });
  } catch (e) {
    return err(res, 500, 'transfer_failed', String(e.message || e));
  }
}

// ---------- view stock by warehouse ----------

async function inventoryByWarehouse(ctx, req, res, parsedUrl) {
  const wid = parsedUrl.query && parsedUrl.query.warehouse_id;
  if (!wid) return err(res, 400, 'missing_warehouse_id', 'warehouse_id requerido');
  try {
    const rows = await sb(ctx, 'GET',
      `/inventory_by_warehouse?warehouse_id=eq.${encodeURIComponent(wid)}&order=updated_at.desc`);
    return send(res, 200, { ok: true, warehouse_id: wid, items: rows || [] });
  } catch (e) {
    return err(res, 500, 'fetch_failed', String(e.message || e));
  }
}

// ---------- cycle count (partial) ----------

async function cycleCount(ctx, req, res) {
  const user = ctx.getAuthUser && ctx.getAuthUser();
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', String(e.message || e)); }
  const { warehouse_id, counts, note, tenant_id } = body || {};
  if (!warehouse_id || !Array.isArray(counts) || counts.length === 0) {
    return err(res, 400, 'missing_fields', 'warehouse_id y counts requeridos');
  }

  const adjustments = [];
  try {
    for (const c of counts) {
      const pid = c && c.product_id;
      const counted = Number(c && c.counted_qty);
      if (!pid || !Number.isFinite(counted)) continue;

      const rows = await sb(ctx, 'GET',
        `/inventory_by_warehouse?warehouse_id=eq.${encodeURIComponent(warehouse_id)}&product_id=eq.${encodeURIComponent(pid)}&select=id,qty,tenant_id`);
      const row = Array.isArray(rows) ? rows[0] : rows;
      const prevQty = Number(row && row.qty) || 0;
      const delta = counted - prevQty;

      if (row && row.id) {
        await sb(ctx, 'PATCH', `/inventory_by_warehouse?id=eq.${encodeURIComponent(row.id)}`,
          { qty: counted, updated_at: new Date().toISOString() });
      } else {
        await sb(ctx, 'POST', '/inventory_by_warehouse', {
          tenant_id: tenant_id || (row && row.tenant_id) || null,
          warehouse_id, product_id: pid, qty: counted,
          updated_at: new Date().toISOString(),
        });
      }
      adjustments.push({ product_id: pid, prev: prevQty, counted, delta });
    }

    const record = {
      tenant_id: tenant_id || null,
      warehouse_id,
      counts,
      adjustments,
      note: note || null,
      created_by: user && user.id ? user.id : null,
      created_at: new Date().toISOString(),
    };
    const created = await sb(ctx, 'POST', '/inventory_cycle_counts', record);
    return send(res, 201, { ok: true, cycle_count: Array.isArray(created) ? created[0] : created, adjustments });
  } catch (e) {
    return err(res, 500, 'cycle_count_failed', String(e.message || e));
  }
}

// ---------- smart reorder suggestion ----------
//
// avg_daily_sales (last N days) * lead_time_days + safety_stock
// safety_stock = avg_daily_sales * lead_time_days * safety_pct
// Suggested order = max(0, reorder_point + lead_time_demand - current_stock)

async function reorderSuggest(ctx, req, res) {
  let body;
  try { body = await readJson(req); } catch (e) { return err(res, 400, 'bad_body', String(e.message || e)); }
  const tenant_id = body && body.tenant_id;
  if (!tenant_id) return err(res, 400, 'missing_tenant_id', 'tenant_id requerido');

  const days = Math.max(1, Math.min(365, parseInt(body.days || 30, 10)));
  const defaultLeadTime = Math.max(1, Math.min(180, parseInt(body.lead_time_days || 7, 10)));
  const defaultSafety = Math.max(0, Math.min(2, Number(body.safety_pct || 0.2)));

  try {
    // 1. fetch stock rows for tenant (across warehouses, aggregated)
    const stockRows = await sb(ctx, 'GET',
      `/inventory_by_warehouse?tenant_id=eq.${encodeURIComponent(tenant_id)}&select=product_id,warehouse_id,qty,lead_time_days,safety_stock,reorder_point`);
    const stockByProduct = new Map();
    (stockRows || []).forEach((r) => {
      const k = r.product_id;
      const cur = stockByProduct.get(k) || { qty: 0, lead_time_days: null, safety_stock: null, reorder_point: null };
      cur.qty += Number(r.qty) || 0;
      if (r.lead_time_days != null) cur.lead_time_days = Number(r.lead_time_days);
      if (r.safety_stock != null) cur.safety_stock = Number(r.safety_stock);
      if (r.reorder_point != null) cur.reorder_point = Number(r.reorder_point);
      stockByProduct.set(k, cur);
    });

    // 2. fetch sales of last N days. Try sale_items joined to sales.
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    let salesRows = [];
    try {
      salesRows = await sb(ctx, 'GET',
        `/sale_items?select=product_id,qty,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`);
    } catch (_) {
      try {
        salesRows = await sb(ctx, 'GET',
          `/sales_items?select=product_id,quantity,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`);
      } catch (__) { salesRows = []; }
    }

    const soldByProduct = new Map();
    (salesRows || []).forEach((r) => {
      const pid = r.product_id;
      if (!pid) return;
      const q = Number(r.qty != null ? r.qty : r.quantity) || 0;
      soldByProduct.set(pid, (soldByProduct.get(pid) || 0) + q);
    });

    // 3. compute reorder list
    const suggestions = [];
    stockByProduct.forEach((s, pid) => {
      const sold = soldByProduct.get(pid) || 0;
      const avgDaily = sold / days;
      const leadTime = s.lead_time_days || defaultLeadTime;
      const safetyStock = s.safety_stock != null
        ? s.safety_stock
        : Math.ceil(avgDaily * leadTime * defaultSafety);
      const reorderPoint = s.reorder_point != null
        ? s.reorder_point
        : Math.ceil(avgDaily * leadTime + safetyStock);
      const leadTimeDemand = Math.ceil(avgDaily * leadTime);
      const suggestedOrder = Math.max(0, Math.ceil(reorderPoint + leadTimeDemand - s.qty));
      const needsReorder = s.qty <= reorderPoint;

      if (needsReorder && suggestedOrder > 0) {
        suggestions.push({
          product_id: pid,
          current_stock: s.qty,
          avg_daily_sales: Number(avgDaily.toFixed(3)),
          lead_time_days: leadTime,
          safety_stock: safetyStock,
          reorder_point: reorderPoint,
          suggested_order: suggestedOrder,
          days_of_stock_left: avgDaily > 0 ? Number((s.qty / avgDaily).toFixed(1)) : null,
        });
      }
    });

    suggestions.sort((a, b) => {
      const da = a.days_of_stock_left == null ? Infinity : a.days_of_stock_left;
      const db = b.days_of_stock_left == null ? Infinity : b.days_of_stock_left;
      return da - db;
    });

    return send(res, 200, {
      ok: true,
      tenant_id,
      window_days: days,
      defaults: { lead_time_days: defaultLeadTime, safety_pct: defaultSafety },
      count: suggestions.length,
      suggestions,
    });
  } catch (e) {
    return err(res, 500, 'reorder_failed', String(e.message || e));
  }
}

// ---------- dispatcher ----------

module.exports = async function handleInventoryAdvanced(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  if (!pathname.startsWith('/api/warehouses') && !pathname.startsWith('/api/inventory/')) {
    return false;
  }

  try {
    // /api/warehouses
    if (pathname === '/api/warehouses') {
      if (method === 'GET') { await listWarehouses(ctx, req, res, parsedUrl); return true; }
      if (method === 'POST') { await createWarehouse(ctx, req, res); return true; }
    }
    if (pathname.startsWith('/api/warehouses/')) {
      const id = pickId(pathname, '/api/warehouses/');
      if (method === 'PUT' || method === 'PATCH') { await updateWarehouse(ctx, req, res, id); return true; }
      if (method === 'DELETE') { await deleteWarehouse(ctx, req, res, id); return true; }
    }

    // /api/inventory/*
    if (method === 'POST' && pathname === '/api/inventory/transfer') {
      await inventoryTransfer(ctx, req, res); return true;
    }
    if (method === 'GET' && pathname === '/api/inventory/by-warehouse') {
      await inventoryByWarehouse(ctx, req, res, parsedUrl); return true;
    }
    if (method === 'POST' && pathname === '/api/inventory/cycle-count') {
      await cycleCount(ctx, req, res); return true;
    }
    if (method === 'POST' && pathname === '/api/inventory/reorder-suggest') {
      await reorderSuggest(ctx, req, res); return true;
    }

    return false;
  } catch (e) {
    try { send(res, 500, { error: 'inventory_advanced_internal', detail: String(e && e.message || e) }); } catch (_) {}
    return true;
  }
};

module.exports.reorderSuggest = reorderSuggest;
module.exports.inventoryTransfer = inventoryTransfer;
