/**
 * volvix-shopify-wiring.js
 * Shopify integration client for Volvix POS.
 * Wraps /api/integrations/shopify/* endpoints (R18).
 * Exposes window.ShopifyAPI.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    apiBase: '/api/integrations/shopify',
    syncIntervalMs: 5 * 60_000, // 5 min
    timeout: 30_000,
  };

  const state = {
    apiBase: DEFAULTS.apiBase,
    authToken: null,
    syncTimer: null,
    listeners: new Map(), // event -> Set<fn>
    lastSync: { products: null, orders: null },
  };

  function log(...args) {
    if (global.SHOPIFY_DEBUG) console.log('[ShopifyAPI]', ...args);
  }

  function configure(opts) {
    if (!opts) return;
    if (opts.apiBase) state.apiBase = opts.apiBase;
    if (opts.authToken) state.authToken = opts.authToken;
  }

  function on(event, fn) {
    if (!state.listeners.has(event)) state.listeners.set(event, new Set());
    state.listeners.get(event).add(fn);
    return () => state.listeners.get(event).delete(fn);
  }

  function emit(event, payload) {
    const set = state.listeners.get(event);
    if (set) set.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  }

  async function request(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['Authorization'] = 'Bearer ' + state.authToken;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), DEFAULTS.timeout);
    try {
      const r = await fetch(state.apiBase + path, {
        method: (opts && opts.method) || 'POST',
        headers,
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        credentials: 'include',
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = new Error(json.error || ('http_' + r.status));
        err.status = r.status; err.detail = json;
        throw err;
      }
      return json;
    } finally { clearTimeout(tid); }
  }

  // Public API
  async function importProducts() {
    log('importProducts');
    const r = await request('/import-products', { method: 'POST' });
    state.lastSync.products = new Date().toISOString();
    emit('products:imported', r);
    return r;
  }

  async function exportProducts() {
    log('exportProducts');
    const r = await request('/export-products', { method: 'POST' });
    emit('products:exported', r);
    return r;
  }

  async function syncOrders(since) {
    log('syncOrders', since);
    const r = await request('/sync-orders', { method: 'POST', body: since ? { since } : null });
    state.lastSync.orders = new Date().toISOString();
    emit('orders:synced', r);
    return r;
  }

  function startAutoSync(intervalMs) {
    stopAutoSync();
    const ms = intervalMs || DEFAULTS.syncIntervalMs;
    state.syncTimer = setInterval(() => {
      syncOrders().catch(e => emit('error', e));
    }, ms);
    log('autoSync started', ms);
  }

  function stopAutoSync() {
    if (state.syncTimer) { clearInterval(state.syncTimer); state.syncTimer = null; }
  }

  async function status() {
    return {
      apiBase: state.apiBase,
      lastSync: { ...state.lastSync },
      autoSyncActive: !!state.syncTimer,
    };
  }

  global.ShopifyAPI = {
    configure,
    importProducts,
    exportProducts,
    syncOrders,
    startAutoSync,
    stopAutoSync,
    status,
    on,
  };
})(typeof window !== 'undefined' ? window : globalThis);
