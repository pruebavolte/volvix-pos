/**
 * volvix-multistore-wiring.js
 * Volvix POS — Multi-Store Advanced Wiring
 * Agent-72 R9
 *
 * Features:
 *  - Precios por sucursal (per-store pricing)
 *  - Productos disponibles por tienda (per-store catalog availability)
 *  - Transferencias inter-tienda (stock transfers between stores)
 *  - Comparativas KPI (cross-store KPI comparisons)
 *  - Store performance ranking
 *
 * Public API: window.MultiStoreAPI
 */

(function (global) {
  'use strict';

  // ============================================================
  // CONFIG & STATE
  // ============================================================
  const CONFIG = {
    storageKey: 'volvix_multistore_v1',
    transferKey: 'volvix_transfers_v1',
    pricingKey: 'volvix_store_pricing_v1',
    availabilityKey: 'volvix_store_availability_v1',
    kpiKey: 'volvix_store_kpis_v1',
    apiBase: (global.VOLVIX_API_BASE || '/api'),
    debug: !!global.VOLVIX_DEBUG
  };

  const STATE = {
    stores: [],
    activeStoreId: null,
    pricing: {},        // { storeId: { productId: price } }
    availability: {},   // { storeId: { productId: { stock, enabled } } }
    transfers: [],      // [{ id, from, to, items, status, createdAt, completedAt }]
    kpis: {},           // { storeId: { sales, orders, ticket, margin, traffic } }
    listeners: {}
  };

  // ============================================================
  // UTILS
  // ============================================================
  const log = (...a) => CONFIG.debug && console.log('[MultiStore]', ...a);
  const warn = (...a) => console.warn('[MultiStore]', ...a);
  const err = (...a) => console.error('[MultiStore]', ...a);

  function uid(prefix = 'ms') {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function nowISO() { return new Date().toISOString(); }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function persist(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { warn('persist failed', key, e); }
  }

  function loadAll() {
    STATE.stores = safeParse(localStorage.getItem(CONFIG.storageKey), []);
    STATE.pricing = safeParse(localStorage.getItem(CONFIG.pricingKey), {});
    STATE.availability = safeParse(localStorage.getItem(CONFIG.availabilityKey), {});
    STATE.transfers = safeParse(localStorage.getItem(CONFIG.transferKey), []);
    STATE.kpis = safeParse(localStorage.getItem(CONFIG.kpiKey), {});
    STATE.activeStoreId = localStorage.getItem('volvix_active_store') || (STATE.stores[0] && STATE.stores[0].id) || null;
    log('loaded', { stores: STATE.stores.length, transfers: STATE.transfers.length });
  }

  function saveAll() {
    persist(CONFIG.storageKey, STATE.stores);
    persist(CONFIG.pricingKey, STATE.pricing);
    persist(CONFIG.availabilityKey, STATE.availability);
    persist(CONFIG.transferKey, STATE.transfers);
    persist(CONFIG.kpiKey, STATE.kpis);
    if (STATE.activeStoreId) localStorage.setItem('volvix_active_store', STATE.activeStoreId);
  }

  // ============================================================
  // EVENT BUS
  // ============================================================
  function on(event, fn) {
    (STATE.listeners[event] = STATE.listeners[event] || []).push(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const arr = STATE.listeners[event];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  function emit(event, payload) {
    log('emit', event, payload);
    (STATE.listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { err('listener error', event, e); }
    });
    try {
      global.dispatchEvent(new CustomEvent('multistore:' + event, { detail: payload }));
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  // STORE CRUD
  // ============================================================
  function listStores() { return STATE.stores.slice(); }

  function getStore(id) { return STATE.stores.find(s => s.id === id) || null; }

  function addStore(data) {
    const store = {
      id: data.id || uid('store'),
      name: data.name || 'Nueva sucursal',
      address: data.address || '',
      phone: data.phone || '',
      manager: data.manager || '',
      timezone: data.timezone || 'America/Mexico_City',
      currency: data.currency || 'MXN',
      taxRate: typeof data.taxRate === 'number' ? data.taxRate : 0.16,
      active: data.active !== false,
      createdAt: nowISO()
    };
    STATE.stores.push(store);
    STATE.pricing[store.id] = STATE.pricing[store.id] || {};
    STATE.availability[store.id] = STATE.availability[store.id] || {};
    STATE.kpis[store.id] = STATE.kpis[store.id] || emptyKPI();
    saveAll();
    emit('store:added', store);
    return store;
  }

  function updateStore(id, patch) {
    const s = getStore(id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: nowISO() });
    saveAll();
    emit('store:updated', s);
    return s;
  }

  function removeStore(id) {
    const idx = STATE.stores.findIndex(s => s.id === id);
    if (idx < 0) return false;
    const [removed] = STATE.stores.splice(idx, 1);
    delete STATE.pricing[id];
    delete STATE.availability[id];
    delete STATE.kpis[id];
    if (STATE.activeStoreId === id) STATE.activeStoreId = STATE.stores[0] ? STATE.stores[0].id : null;
    saveAll();
    emit('store:removed', removed);
    return true;
  }

  function setActiveStore(id) {
    if (!getStore(id)) { warn('store not found', id); return false; }
    STATE.activeStoreId = id;
    localStorage.setItem('volvix_active_store', id);
    emit('store:active-changed', id);
    return true;
  }

  function getActiveStore() { return getStore(STATE.activeStoreId); }

  // ============================================================
  // PER-STORE PRICING
  // ============================================================
  function setPrice(storeId, productId, price) {
    if (!getStore(storeId)) throw new Error('store not found: ' + storeId);
    if (typeof price !== 'number' || price < 0) throw new Error('invalid price');
    STATE.pricing[storeId] = STATE.pricing[storeId] || {};
    STATE.pricing[storeId][productId] = price;
    saveAll();
    emit('pricing:updated', { storeId, productId, price });
    return price;
  }

  function getPrice(storeId, productId, fallback) {
    const map = STATE.pricing[storeId];
    if (map && typeof map[productId] === 'number') return map[productId];
    return typeof fallback === 'number' ? fallback : null;
  }

  function bulkSetPrices(storeId, priceMap) {
    if (!getStore(storeId)) throw new Error('store not found');
    STATE.pricing[storeId] = Object.assign({}, STATE.pricing[storeId] || {}, priceMap);
    saveAll();
    emit('pricing:bulk-updated', { storeId, count: Object.keys(priceMap).length });
  }

  function comparePrices(productId) {
    return STATE.stores.map(s => ({
      storeId: s.id,
      storeName: s.name,
      price: getPrice(s.id, productId, null)
    }));
  }

  // ============================================================
  // AVAILABILITY (catalog + stock per store)
  // ============================================================
  function setAvailability(storeId, productId, payload) {
    if (!getStore(storeId)) throw new Error('store not found');
    STATE.availability[storeId] = STATE.availability[storeId] || {};
    const cur = STATE.availability[storeId][productId] || { stock: 0, enabled: true };
    STATE.availability[storeId][productId] = Object.assign(cur, payload);
    saveAll();
    emit('availability:updated', { storeId, productId, data: STATE.availability[storeId][productId] });
    return STATE.availability[storeId][productId];
  }

  function getAvailability(storeId, productId) {
    const m = STATE.availability[storeId];
    if (!m) return { stock: 0, enabled: false };
    return m[productId] || { stock: 0, enabled: false };
  }

  function listAvailableProducts(storeId) {
    const m = STATE.availability[storeId] || {};
    return Object.keys(m)
      .filter(pid => m[pid].enabled && m[pid].stock > 0)
      .map(pid => ({ productId: pid, ...m[pid] }));
  }

  function adjustStock(storeId, productId, delta, reason) {
    const cur = getAvailability(storeId, productId);
    const newStock = Math.max(0, (cur.stock || 0) + delta);
    setAvailability(storeId, productId, { stock: newStock });
    emit('stock:adjusted', { storeId, productId, delta, newStock, reason: reason || 'manual' });
    return newStock;
  }

  // ============================================================
  // INTER-STORE TRANSFERS
  // ============================================================
  function createTransfer({ from, to, items, note }) {
    if (from === to) throw new Error('from/to must differ');
    if (!getStore(from) || !getStore(to)) throw new Error('invalid store(s)');
    if (!Array.isArray(items) || !items.length) throw new Error('items required');

    // Validate stock at origin
    for (const it of items) {
      const av = getAvailability(from, it.productId);
      if (av.stock < it.qty) {
        throw new Error(`insufficient stock for ${it.productId} at ${from} (have ${av.stock}, need ${it.qty})`);
      }
    }

    const transfer = {
      id: uid('xfer'),
      from, to,
      items: items.map(i => ({ productId: i.productId, qty: i.qty })),
      note: note || '',
      status: 'pending',
      createdAt: nowISO(),
      completedAt: null,
      cancelledAt: null
    };
    STATE.transfers.unshift(transfer);

    // Reserve (deduct from origin immediately, mark in-transit)
    items.forEach(it => adjustStock(from, it.productId, -it.qty, 'transfer:reserve:' + transfer.id));

    saveAll();
    emit('transfer:created', transfer);
    return transfer;
  }

  function completeTransfer(transferId) {
    const t = STATE.transfers.find(x => x.id === transferId);
    if (!t) throw new Error('transfer not found');
    if (t.status !== 'pending') throw new Error('transfer not pending');
    t.items.forEach(it => adjustStock(t.to, it.productId, it.qty, 'transfer:receive:' + t.id));
    t.status = 'completed';
    t.completedAt = nowISO();
    saveAll();
    emit('transfer:completed', t);
    return t;
  }

  function cancelTransfer(transferId, reason) {
    const t = STATE.transfers.find(x => x.id === transferId);
    if (!t) throw new Error('transfer not found');
    if (t.status !== 'pending') throw new Error('only pending transfers can be cancelled');
    // Refund stock to origin
    t.items.forEach(it => adjustStock(t.from, it.productId, it.qty, 'transfer:cancel:' + t.id));
    t.status = 'cancelled';
    t.cancelledAt = nowISO();
    t.cancelReason = reason || '';
    saveAll();
    emit('transfer:cancelled', t);
    return t;
  }

  function listTransfers(filter = {}) {
    return STATE.transfers.filter(t => {
      if (filter.status && t.status !== filter.status) return false;
      if (filter.from && t.from !== filter.from) return false;
      if (filter.to && t.to !== filter.to) return false;
      return true;
    });
  }

  // ============================================================
  // KPIs
  // ============================================================
  function emptyKPI() {
    return {
      sales: 0, orders: 0, ticket: 0, margin: 0,
      traffic: 0, conversion: 0, returns: 0,
      updatedAt: null
    };
  }

  function setKPI(storeId, payload) {
    if (!getStore(storeId)) throw new Error('store not found');
    const cur = STATE.kpis[storeId] || emptyKPI();
    Object.assign(cur, payload, { updatedAt: nowISO() });
    if (cur.orders > 0) cur.ticket = +(cur.sales / cur.orders).toFixed(2);
    if (cur.traffic > 0) cur.conversion = +(cur.orders / cur.traffic).toFixed(4);
    STATE.kpis[storeId] = cur;
    saveAll();
    emit('kpi:updated', { storeId, kpi: cur });
    return cur;
  }

  function getKPI(storeId) { return STATE.kpis[storeId] || emptyKPI(); }

  function compareKPIs(metric = 'sales') {
    return STATE.stores.map(s => ({
      storeId: s.id,
      storeName: s.name,
      value: (STATE.kpis[s.id] || emptyKPI())[metric] || 0
    })).sort((a, b) => b.value - a.value);
  }

  function aggregateKPIs() {
    const totals = emptyKPI();
    let count = 0;
    STATE.stores.forEach(s => {
      const k = STATE.kpis[s.id]; if (!k) return;
      totals.sales += k.sales || 0;
      totals.orders += k.orders || 0;
      totals.margin += k.margin || 0;
      totals.traffic += k.traffic || 0;
      totals.returns += k.returns || 0;
      count++;
    });
    if (totals.orders > 0) totals.ticket = +(totals.sales / totals.orders).toFixed(2);
    if (totals.traffic > 0) totals.conversion = +(totals.orders / totals.traffic).toFixed(4);
    totals.storeCount = count;
    return totals;
  }

  // ============================================================
  // PERFORMANCE RANKING
  // ============================================================
  function computeRanking(opts = {}) {
    const weights = Object.assign({
      sales: 0.35, margin: 0.25, conversion: 0.15,
      ticket: 0.10, orders: 0.10, returnsPenalty: 0.05
    }, opts.weights || {});

    const data = STATE.stores.map(s => {
      const k = STATE.kpis[s.id] || emptyKPI();
      return { store: s, kpi: k };
    });

    if (!data.length) return [];

    // Find maxes for normalization
    const max = { sales: 1, margin: 1, conversion: 1, ticket: 1, orders: 1, returns: 1 };
    data.forEach(d => {
      max.sales = Math.max(max.sales, d.kpi.sales || 0);
      max.margin = Math.max(max.margin, d.kpi.margin || 0);
      max.conversion = Math.max(max.conversion, d.kpi.conversion || 0);
      max.ticket = Math.max(max.ticket, d.kpi.ticket || 0);
      max.orders = Math.max(max.orders, d.kpi.orders || 0);
      max.returns = Math.max(max.returns, d.kpi.returns || 0);
    });

    const ranked = data.map(d => {
      const k = d.kpi;
      const score =
        weights.sales * (k.sales / max.sales) +
        weights.margin * (k.margin / max.margin) +
        weights.conversion * (k.conversion / max.conversion) +
        weights.ticket * (k.ticket / max.ticket) +
        weights.orders * (k.orders / max.orders) -
        weights.returnsPenalty * (k.returns / max.returns);
      return {
        storeId: d.store.id,
        storeName: d.store.name,
        score: +(score * 100).toFixed(2),
        kpi: k
      };
    }).sort((a, b) => b.score - a.score);

    ranked.forEach((r, i) => { r.rank = i + 1; });
    emit('ranking:computed', ranked);
    return ranked;
  }

  function getTopStores(n = 3) { return computeRanking().slice(0, n); }
  function getBottomStores(n = 3) { return computeRanking().slice(-n).reverse(); }

  // ============================================================
  // REMOTE SYNC (best-effort)
  // ============================================================
  async function syncFromServer() {
    try {
      const res = await fetch(CONFIG.apiBase + '/multistore/snapshot', { credentials: 'include' });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (data.stores) STATE.stores = data.stores;
      if (data.pricing) STATE.pricing = data.pricing;
      if (data.availability) STATE.availability = data.availability;
      if (data.transfers) STATE.transfers = data.transfers;
      if (data.kpis) STATE.kpis = data.kpis;
      saveAll();
      emit('sync:completed', { source: 'server' });
      return true;
    } catch (e) {
      warn('sync failed', e.message);
      emit('sync:failed', { error: e.message });
      return false;
    }
  }

  async function pushToServer() {
    try {
      const payload = {
        stores: STATE.stores, pricing: STATE.pricing,
        availability: STATE.availability, transfers: STATE.transfers,
        kpis: STATE.kpis
      };
      const res = await fetch(CONFIG.apiBase + '/multistore/snapshot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('http ' + res.status);
      emit('push:completed');
      return true;
    } catch (e) {
      warn('push failed', e.message);
      emit('push:failed', { error: e.message });
      return false;
    }
  }

  // ============================================================
  // EXPORT / IMPORT
  // ============================================================
  function exportSnapshot() {
    return {
      version: 1,
      exportedAt: nowISO(),
      stores: STATE.stores,
      pricing: STATE.pricing,
      availability: STATE.availability,
      transfers: STATE.transfers,
      kpis: STATE.kpis
    };
  }

  function importSnapshot(snap) {
    if (!snap || snap.version !== 1) throw new Error('invalid snapshot');
    STATE.stores = snap.stores || [];
    STATE.pricing = snap.pricing || {};
    STATE.availability = snap.availability || {};
    STATE.transfers = snap.transfers || [];
    STATE.kpis = snap.kpis || {};
    saveAll();
    emit('snapshot:imported');
    return true;
  }

  // ============================================================
  // SEED (dev helper)
  // ============================================================
  function seedDemo() {
    if (STATE.stores.length) return false;
    const a = addStore({ name: 'Volvix Centro', address: 'Av. Reforma 100', manager: 'Ana' });
    const b = addStore({ name: 'Volvix Norte', address: 'Blvd. Industrial 250', manager: 'Beto' });
    const c = addStore({ name: 'Volvix Sur', address: 'Calz. del Sur 80', manager: 'Carmen' });
    [a, b, c].forEach((s, i) => {
      setKPI(s.id, {
        sales: 100000 + i * 35000,
        orders: 800 + i * 220,
        margin: 28000 + i * 9000,
        traffic: 3000 + i * 700,
        returns: 12 + i * 4
      });
    });
    setPrice(a.id, 'SKU-001', 199);
    setPrice(b.id, 'SKU-001', 209);
    setPrice(c.id, 'SKU-001', 195);
    setAvailability(a.id, 'SKU-001', { stock: 50, enabled: true });
    setAvailability(b.id, 'SKU-001', { stock: 30, enabled: true });
    setAvailability(c.id, 'SKU-001', { stock: 12, enabled: true });
    return true;
  }

  // ============================================================
  // INIT
  // ============================================================
  loadAll();

  const MultiStoreAPI = {
    // config
    config: CONFIG,
    // events
    on, off, emit,
    // stores
    listStores, getStore, addStore, updateStore, removeStore,
    setActiveStore, getActiveStore,
    // pricing
    setPrice, getPrice, bulkSetPrices, comparePrices,
    // availability
    setAvailability, getAvailability, listAvailableProducts, adjustStock,
    // transfers
    createTransfer, completeTransfer, cancelTransfer, listTransfers,
    // kpis
    setKPI, getKPI, compareKPIs, aggregateKPIs,
    // ranking
    computeRanking, getTopStores, getBottomStores,
    // sync
    syncFromServer, pushToServer,
    // snapshot
    exportSnapshot, importSnapshot,
    // dev
    seedDemo,
    _state: STATE
  };

  global.MultiStoreAPI = MultiStoreAPI;
  log('MultiStoreAPI ready');
  try { global.dispatchEvent(new CustomEvent('multistore:ready')); } catch (e) {}

})(typeof window !== 'undefined' ? window : globalThis);
