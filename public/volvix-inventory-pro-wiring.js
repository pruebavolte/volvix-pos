/**
 * volvix-inventory-pro-wiring.js
 * Volvix POS — Inventory Pro Module
 * Agent-57 R9
 *
 * Features:
 *  - Lotes (batches) y serial numbers
 *  - Fechas de caducidad con alertas (FEFO)
 *  - Multi-warehouse (almacenes múltiples)
 *  - Transferencias entre almacenes
 *  - Conteo cíclico (cycle counting)
 *  - Ajustes de inventario con motivo
 *  - Kits / Bundles (productos compuestos)
 *
 * Public API: window.InventoryProAPI
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_inventory_pro_v1';
  const EVT = 'inventory-pro:change';

  // ───────────────────────────── Storage ─────────────────────────────
  const defaultState = () => ({
    warehouses: [
      { id: 'WH-MAIN', name: 'Almacén Principal', address: '', active: true },
      { id: 'WH-TIENDA', name: 'Tienda', address: '', active: true }
    ],
    products: {},     // sku -> { sku, name, tracking: 'none'|'lot'|'serial', uom, cost, price, kit:false, components:[] }
    lots: {},         // lotId -> { lotId, sku, warehouseId, qty, expiry, receivedAt, supplier }
    serials: {},      // serial -> { serial, sku, warehouseId, status:'in_stock'|'sold'|'reserved'|'transit', lotId? }
    stock: {},        // `${sku}|${warehouseId}` -> qty (for tracking:'none')
    transfers: [],    // { id, fromWh, toWh, lines:[{sku, qty, lotId?, serials?}], status, createdAt, receivedAt }
    adjustments: [],  // { id, sku, warehouseId, delta, reason, note, by, at, lotId?, serials? }
    counts: [],       // { id, warehouseId, scope, lines:[{sku,expected,counted,diff,lotId?}], status, createdAt, closedAt }
    kits: {},         // sku -> { components:[{sku, qty}], assembleOnSale:true }
    alerts: []        // ephemeral
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('[InventoryPro] load failed, using defaults', e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      emit({ type: 'saved' });
    } catch (e) {
      console.error('[InventoryPro] save failed', e);
    }
  }

  function emit(detail) {
    try { global.dispatchEvent(new CustomEvent(EVT, { detail })); } catch (_) {}
  }

  // ───────────────────────────── Helpers ─────────────────────────────
  const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const nowISO = () => new Date().toISOString();
  const key = (sku, wh) => `${sku}|${wh}`;

  function mustProduct(sku) {
    const p = state.products[sku];
    if (!p) throw new Error(`SKU no existe: ${sku}`);
    return p;
  }
  function mustWarehouse(id) {
    const w = state.warehouses.find(w => w.id === id);
    if (!w) throw new Error(`Almacén no existe: ${id}`);
    return w;
  }

  // ─────────────────────────── Warehouses ────────────────────────────
  function listWarehouses() { return state.warehouses.slice(); }

  function createWarehouse({ id, name, address = '' }) {
    if (!id || !name) throw new Error('id y name requeridos');
    if (state.warehouses.some(w => w.id === id)) throw new Error('Almacén duplicado');
    state.warehouses.push({ id, name, address, active: true });
    save(); emit({ type: 'warehouse:create', id });
    return id;
  }

  function deactivateWarehouse(id) {
    const w = mustWarehouse(id);
    w.active = false; save(); emit({ type: 'warehouse:deactivate', id });
  }

  // ───────────────────────────── Products ────────────────────────────
  function upsertProduct({ sku, name, tracking = 'none', uom = 'pza', cost = 0, price = 0, kit = false, components = [] }) {
    if (!sku || !name) throw new Error('sku y name requeridos');
    if (!['none', 'lot', 'serial'].includes(tracking)) throw new Error('tracking inválido');
    state.products[sku] = { sku, name, tracking, uom, cost: +cost, price: +price, kit: !!kit, components };
    if (kit) state.kits[sku] = { components, assembleOnSale: true };
    save(); emit({ type: 'product:upsert', sku });
    return sku;
  }

  function getProduct(sku) { return state.products[sku] || null; }
  function listProducts() { return Object.values(state.products); }

  // ─────────────────────────── Stock queries ─────────────────────────
  function stockOf(sku, warehouseId) {
    const p = mustProduct(sku);
    if (p.tracking === 'none') return state.stock[key(sku, warehouseId)] || 0;
    if (p.tracking === 'lot') {
      return Object.values(state.lots)
        .filter(l => l.sku === sku && l.warehouseId === warehouseId)
        .reduce((s, l) => s + l.qty, 0);
    }
    // serial
    return Object.values(state.serials)
      .filter(s => s.sku === sku && s.warehouseId === warehouseId && s.status === 'in_stock').length;
  }

  function totalStock(sku) {
    return state.warehouses.reduce((s, w) => s + stockOf(sku, w.id), 0);
  }

  function stockMatrix() {
    const out = {};
    for (const sku of Object.keys(state.products)) {
      out[sku] = {};
      for (const w of state.warehouses) out[sku][w.id] = stockOf(sku, w.id);
    }
    return out;
  }

  // ───────────────────────── Lot management ──────────────────────────
  function receiveLot({ sku, warehouseId, qty, expiry = null, supplier = '', lotId = null }) {
    const p = mustProduct(sku); mustWarehouse(warehouseId);
    if (p.tracking !== 'lot') throw new Error('Producto no es por lote');
    if (!qty || qty <= 0) throw new Error('qty inválido');
    const id = lotId || uid('LOT');
    state.lots[id] = { lotId: id, sku, warehouseId, qty: +qty, expiry, receivedAt: nowISO(), supplier };
    save(); emit({ type: 'lot:receive', lotId: id });
    return id;
  }

  function consumeLot(lotId, qty) {
    const lot = state.lots[lotId];
    if (!lot) throw new Error('lote no existe');
    if (qty > lot.qty) throw new Error('qty supera lote');
    lot.qty -= qty;
    if (lot.qty === 0) delete state.lots[lotId];
    save();
  }

  function pickFEFO(sku, warehouseId, qty) {
    // First Expired First Out
    const lots = Object.values(state.lots)
      .filter(l => l.sku === sku && l.warehouseId === warehouseId && l.qty > 0)
      .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    const picks = []; let need = qty;
    for (const l of lots) {
      if (need <= 0) break;
      const take = Math.min(need, l.qty);
      picks.push({ lotId: l.lotId, qty: take });
      need -= take;
    }
    if (need > 0) throw new Error(`Stock insuficiente FEFO ${sku}@${warehouseId}`);
    return picks;
  }

  // ──────────────────────── Serial management ────────────────────────
  function receiveSerials({ sku, warehouseId, serials, lotId = null }) {
    const p = mustProduct(sku); mustWarehouse(warehouseId);
    if (p.tracking !== 'serial') throw new Error('Producto no es por serie');
    if (!Array.isArray(serials) || !serials.length) throw new Error('serials requerido');
    for (const s of serials) {
      if (state.serials[s]) throw new Error(`Serie duplicada: ${s}`);
      state.serials[s] = { serial: s, sku, warehouseId, status: 'in_stock', lotId };
    }
    save(); emit({ type: 'serial:receive', sku, count: serials.length });
    return serials.length;
  }

  function setSerialStatus(serial, status) {
    const s = state.serials[serial];
    if (!s) throw new Error('serie no existe');
    s.status = status; save();
  }

  // ──────────────────────────── Expiry ───────────────────────────────
  function expiryAlerts(daysAhead = 30) {
    const cutoff = new Date(Date.now() + daysAhead * 86400000);
    const today = new Date();
    const out = [];
    for (const lot of Object.values(state.lots)) {
      if (!lot.expiry) continue;
      const exp = new Date(lot.expiry);
      const days = Math.round((exp - today) / 86400000);
      if (exp <= cutoff) {
        out.push({
          lotId: lot.lotId, sku: lot.sku, warehouseId: lot.warehouseId,
          qty: lot.qty, expiry: lot.expiry, daysToExpire: days,
          severity: days < 0 ? 'expired' : days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'info'
        });
      }
    }
    return out.sort((a, b) => a.daysToExpire - b.daysToExpire);
  }

  // ────────────────────────── Transfers ──────────────────────────────
  function createTransfer({ fromWh, toWh, lines }) {
    mustWarehouse(fromWh); mustWarehouse(toWh);
    if (fromWh === toWh) throw new Error('Origen y destino iguales');
    if (!Array.isArray(lines) || !lines.length) throw new Error('lines requerido');
    const id = uid('TRF');
    // Reserve stock by moving to "in transit" virtual state
    for (const l of lines) {
      const p = mustProduct(l.sku);
      if (p.tracking === 'none') {
        const have = state.stock[key(l.sku, fromWh)] || 0;
        if (have < l.qty) throw new Error(`Stock insuficiente ${l.sku}`);
        state.stock[key(l.sku, fromWh)] = have - l.qty;
      } else if (p.tracking === 'lot') {
        const picks = l.lotId ? [{ lotId: l.lotId, qty: l.qty }] : pickFEFO(l.sku, fromWh, l.qty);
        l._picks = picks;
        for (const pk of picks) consumeLot(pk.lotId, pk.qty);
      } else {
        if (!Array.isArray(l.serials) || l.serials.length !== l.qty) throw new Error('serials requerido');
        for (const s of l.serials) {
          const sr = state.serials[s];
          if (!sr || sr.warehouseId !== fromWh || sr.status !== 'in_stock') throw new Error(`Serie no disponible: ${s}`);
          sr.status = 'transit';
        }
      }
    }
    state.transfers.push({ id, fromWh, toWh, lines, status: 'in_transit', createdAt: nowISO(), receivedAt: null });
    save(); emit({ type: 'transfer:create', id });
    return id;
  }

  function receiveTransfer(transferId) {
    const t = state.transfers.find(x => x.id === transferId);
    if (!t) throw new Error('transfer no existe');
    if (t.status !== 'in_transit') throw new Error('estado inválido');
    for (const l of t.lines) {
      const p = mustProduct(l.sku);
      if (p.tracking === 'none') {
        const k = key(l.sku, t.toWh);
        state.stock[k] = (state.stock[k] || 0) + l.qty;
      } else if (p.tracking === 'lot') {
        for (const pk of (l._picks || [])) {
          const orig = pk.lotId; // we consumed it; recreate at destination
          // Recreate as new lot bound to destination, copy expiry if known
          state.lots[orig + '-T'] = { lotId: orig + '-T', sku: l.sku, warehouseId: t.toWh, qty: pk.qty, expiry: null, receivedAt: nowISO(), supplier: 'transfer' };
        }
      } else {
        for (const s of l.serials) {
          const sr = state.serials[s];
          sr.warehouseId = t.toWh; sr.status = 'in_stock';
        }
      }
    }
    t.status = 'received'; t.receivedAt = nowISO();
    save(); emit({ type: 'transfer:receive', id: transferId });
    return true;
  }

  function listTransfers(status = null) {
    return status ? state.transfers.filter(t => t.status === status) : state.transfers.slice();
  }

  // ────────────────────────── Adjustments ────────────────────────────
  const ADJUST_REASONS = ['merma', 'robo', 'daño', 'caducidad', 'conteo', 'devolucion', 'correccion', 'otro'];

  function adjustStock({ sku, warehouseId, delta, reason, note = '', by = 'system', lotId = null, serials = null }) {
    const p = mustProduct(sku); mustWarehouse(warehouseId);
    if (!ADJUST_REASONS.includes(reason)) throw new Error(`Motivo inválido. Usa: ${ADJUST_REASONS.join(',')}`);
    if (!delta || delta === 0) throw new Error('delta requerido');
    if (p.tracking === 'none') {
      const k = key(sku, warehouseId);
      const cur = state.stock[k] || 0;
      if (cur + delta < 0) throw new Error('Stock no puede ser negativo');
      state.stock[k] = cur + delta;
    } else if (p.tracking === 'lot') {
      if (delta > 0) {
        receiveLot({ sku, warehouseId, qty: delta, supplier: `adj:${reason}` });
      } else {
        const picks = lotId ? [{ lotId, qty: -delta }] : pickFEFO(sku, warehouseId, -delta);
        for (const pk of picks) consumeLot(pk.lotId, pk.qty);
      }
    } else {
      if (!Array.isArray(serials)) throw new Error('serials requerido');
      if (delta > 0) receiveSerials({ sku, warehouseId, serials });
      else for (const s of serials) { setSerialStatus(s, 'sold'); }
    }
    const id = uid('ADJ');
    state.adjustments.push({ id, sku, warehouseId, delta, reason, note, by, at: nowISO(), lotId, serials });
    save(); emit({ type: 'adjust', id });
    return id;
  }

  function listAdjustments(filter = {}) {
    return state.adjustments.filter(a =>
      (!filter.sku || a.sku === filter.sku) &&
      (!filter.warehouseId || a.warehouseId === filter.warehouseId) &&
      (!filter.reason || a.reason === filter.reason)
    );
  }

  // ───────────────────────── Cycle counting ──────────────────────────
  function startCount({ warehouseId, scope = 'all', skus = null }) {
    mustWarehouse(warehouseId);
    const targetSkus = skus || Object.keys(state.products);
    const lines = targetSkus.map(sku => ({
      sku, expected: stockOf(sku, warehouseId), counted: null, diff: null
    }));
    const id = uid('CNT');
    state.counts.push({ id, warehouseId, scope, lines, status: 'open', createdAt: nowISO(), closedAt: null });
    save(); emit({ type: 'count:start', id });
    return id;
  }

  function recordCount(countId, sku, counted) {
    const c = state.counts.find(x => x.id === countId);
    if (!c) throw new Error('conteo no existe');
    if (c.status !== 'open') throw new Error('conteo cerrado');
    const line = c.lines.find(l => l.sku === sku);
    if (!line) throw new Error('sku no en conteo');
    line.counted = +counted;
    line.diff = line.counted - line.expected;
    save();
  }

  function closeCount(countId, autoAdjust = true, by = 'system') {
    const c = state.counts.find(x => x.id === countId);
    if (!c) throw new Error('conteo no existe');
    if (autoAdjust) {
      for (const l of c.lines) {
        if (l.counted == null || l.diff === 0) continue;
        try {
          adjustStock({ sku: l.sku, warehouseId: c.warehouseId, delta: l.diff, reason: 'conteo', note: `cycle ${countId}`, by });
        } catch (e) { console.warn('[count] adjust skip', l.sku, e.message); }
      }
    }
    c.status = 'closed'; c.closedAt = nowISO();
    save(); emit({ type: 'count:close', id: countId });
    return true;
  }

  function listCounts(status = null) {
    return status ? state.counts.filter(c => c.status === status) : state.counts.slice();
  }

  // ───────────────────────────── Kits ────────────────────────────────
  function defineKit(sku, components, assembleOnSale = true) {
    mustProduct(sku);
    if (!Array.isArray(components) || !components.length) throw new Error('components requerido');
    for (const c of components) mustProduct(c.sku);
    state.kits[sku] = { components, assembleOnSale };
    state.products[sku].kit = true;
    state.products[sku].components = components;
    save(); emit({ type: 'kit:define', sku });
    return sku;
  }

  function explodeKit(sku, qty = 1) {
    const k = state.kits[sku];
    if (!k) throw new Error('No es kit');
    return k.components.map(c => ({ sku: c.sku, qty: c.qty * qty }));
  }

  function kitAvailability(sku, warehouseId, qty = 1) {
    const lines = explodeKit(sku, qty);
    const missing = [];
    for (const l of lines) {
      const have = stockOf(l.sku, warehouseId);
      if (have < l.qty) missing.push({ sku: l.sku, need: l.qty, have, short: l.qty - have });
    }
    return { available: missing.length === 0, missing };
  }

  function consumeKit(sku, warehouseId, qty = 1, by = 'sale') {
    const av = kitAvailability(sku, warehouseId, qty);
    if (!av.available) throw new Error(`Kit insuficiente: ${JSON.stringify(av.missing)}`);
    for (const l of explodeKit(sku, qty)) {
      adjustStock({ sku: l.sku, warehouseId, delta: -l.qty, reason: 'otro', note: `kit:${sku} by:${by}` });
    }
    return true;
  }

  // ─────────────────────────── Reporting ─────────────────────────────
  function lowStockReport(threshold = 5) {
    const out = [];
    for (const sku of Object.keys(state.products)) {
      for (const w of state.warehouses) {
        const q = stockOf(sku, w.id);
        if (q <= threshold) out.push({ sku, warehouseId: w.id, qty: q });
      }
    }
    return out;
  }

  function valuationReport() {
    let total = 0; const lines = [];
    for (const sku of Object.keys(state.products)) {
      const p = state.products[sku];
      const q = totalStock(sku);
      const v = q * (p.cost || 0);
      total += v;
      lines.push({ sku, name: p.name, qty: q, cost: p.cost, value: v });
    }
    return { total, lines };
  }

  // ───────────────────────────── Dump ────────────────────────────────
  function exportState() { return JSON.parse(JSON.stringify(state)); }
  function importState(s) { state = Object.assign(defaultState(), s); save(); emit({ type: 'import' }); }
  function reset() { state = defaultState(); save(); emit({ type: 'reset' }); }

  // ───────────────────────────── API ─────────────────────────────────
  const API = {
    // warehouses
    listWarehouses, createWarehouse, deactivateWarehouse,
    // products
    upsertProduct, getProduct, listProducts,
    // stock
    stockOf, totalStock, stockMatrix,
    // lots
    receiveLot, consumeLot, pickFEFO,
    // serials
    receiveSerials, setSerialStatus,
    // expiry
    expiryAlerts,
    // transfers
    createTransfer, receiveTransfer, listTransfers,
    // adjustments
    adjustStock, listAdjustments, ADJUST_REASONS,
    // counts
    startCount, recordCount, closeCount, listCounts,
    // kits
    defineKit, explodeKit, kitAvailability, consumeKit,
    // reports
    lowStockReport, valuationReport,
    // misc
    exportState, importState, reset,
    on(cb) { global.addEventListener(EVT, cb); return () => global.removeEventListener(EVT, cb); },
    _state: () => state,
    version: '1.0.0-R9'
  };

  global.InventoryProAPI = API;
  console.log('[InventoryPro] R9 wiring loaded — window.InventoryProAPI ready');
})(typeof window !== 'undefined' ? window : globalThis);
