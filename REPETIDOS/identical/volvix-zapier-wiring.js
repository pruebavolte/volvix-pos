/* ============================================================================
 * volvix-zapier-wiring.js
 * Zapier integration layer for Volvix POS
 * Triggers, Actions, Zap configurators, Volvix hooks
 * Exposes: window.ZapierAPI
 * ============================================================================ */
(function (global) {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  const CONFIG = {
    apiBase: 'https://hooks.zapier.com/hooks/catch',
    storageKey: 'volvix_zapier_config_v1',
    historyKey: 'volvix_zapier_history_v1',
    maxHistory: 200,
    defaultTimeout: 15000,
    retryAttempts: 3,
    retryDelay: 1500,
    debug: false
  };

  // --------------------------------------------------------------------------
  // Internal state
  // --------------------------------------------------------------------------
  const state = {
    zaps: {},               // id -> zap definition
    triggers: {},           // event -> [zapId]
    listeners: {},          // event -> [callback]
    hooks: {},              // hookName -> [callback]
    history: [],
    enabled: true
  };

  // --------------------------------------------------------------------------
  // Logger
  // --------------------------------------------------------------------------
  function log(...args) {
    if (CONFIG.debug) console.log('[ZapierAPI]', ...args);
  }
  function warn(...args) { console.warn('[ZapierAPI]', ...args); }
  function err(...args)  { console.error('[ZapierAPI]', ...args); }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------
  function persist() {
    try {
      const dump = { zaps: state.zaps, triggers: state.triggers, enabled: state.enabled };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(dump));
      localStorage.setItem(CONFIG.historyKey, JSON.stringify(state.history.slice(-CONFIG.maxHistory)));
    } catch (e) { warn('persist failed', e); }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        state.zaps = data.zaps || {};
        state.triggers = data.triggers || {};
        state.enabled = data.enabled !== false;
      }
      const hist = localStorage.getItem(CONFIG.historyKey);
      if (hist) state.history = JSON.parse(hist) || [];
    } catch (e) { warn('restore failed', e); }
  }

  // --------------------------------------------------------------------------
  // History tracking
  // --------------------------------------------------------------------------
  function recordHistory(entry) {
    state.history.push(Object.assign({ timestamp: Date.now() }, entry));
    if (state.history.length > CONFIG.maxHistory) {
      state.history = state.history.slice(-CONFIG.maxHistory);
    }
    persist();
  }

  // --------------------------------------------------------------------------
  // HTTP helper with retry
  // --------------------------------------------------------------------------
  async function httpPost(url, payload, attempt = 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.defaultTimeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { ok: true, status: res.status, data };
    } catch (e) {
      clearTimeout(timer);
      if (attempt < CONFIG.retryAttempts) {
        await new Promise(r => setTimeout(r, CONFIG.retryDelay * attempt));
        return httpPost(url, payload, attempt + 1);
      }
      return { ok: false, error: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // Zap definition / registration
  // --------------------------------------------------------------------------
  function registerZap(zap) {
    if (!zap || !zap.id || !zap.trigger || !zap.webhook) {
      throw new Error('Zap requires {id, trigger, webhook}');
    }
    state.zaps[zap.id] = {
      id: zap.id,
      name: zap.name || zap.id,
      trigger: zap.trigger,
      webhook: zap.webhook,
      filter: zap.filter || null,
      transform: zap.transform || null,
      action: zap.action || 'webhook',
      enabled: zap.enabled !== false,
      createdAt: Date.now()
    };
    if (!state.triggers[zap.trigger]) state.triggers[zap.trigger] = [];
    if (!state.triggers[zap.trigger].includes(zap.id)) {
      state.triggers[zap.trigger].push(zap.id);
    }
    persist();
    log('zap registered', zap.id);
    return state.zaps[zap.id];
  }

  function removeZap(id) {
    const z = state.zaps[id];
    if (!z) return false;
    delete state.zaps[id];
    if (state.triggers[z.trigger]) {
      state.triggers[z.trigger] = state.triggers[z.trigger].filter(x => x !== id);
    }
    persist();
    return true;
  }

  function listZaps() { return Object.values(state.zaps); }

  function toggleZap(id, enabled) {
    if (!state.zaps[id]) return false;
    state.zaps[id].enabled = enabled !== undefined ? !!enabled : !state.zaps[id].enabled;
    persist();
    return state.zaps[id].enabled;
  }

  // --------------------------------------------------------------------------
  // Trigger firing
  // --------------------------------------------------------------------------
  async function fireTrigger(event, payload = {}) {
    if (!state.enabled) { log('disabled, skip', event); return []; }
    const ids = state.triggers[event] || [];
    if (!ids.length) { log('no zaps for', event); return []; }

    const results = [];
    for (const id of ids) {
      const zap = state.zaps[id];
      if (!zap || !zap.enabled) continue;

      // Filter
      if (typeof zap.filter === 'function') {
        try { if (!zap.filter(payload)) { log('filtered out', id); continue; } }
        catch (e) { warn('filter error', id, e); continue; }
      }

      // Transform
      let body = payload;
      if (typeof zap.transform === 'function') {
        try { body = zap.transform(payload) || payload; }
        catch (e) { warn('transform error', id, e); }
      }

      const enriched = {
        zap_id: id,
        zap_name: zap.name,
        event,
        timestamp: new Date().toISOString(),
        source: 'volvix-pos',
        data: body
      };

      const result = await httpPost(zap.webhook, enriched);
      recordHistory({ zapId: id, event, ok: result.ok, error: result.error });
      results.push({ zapId: id, ...result });
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Internal event listeners (for pages that want to react locally)
  // --------------------------------------------------------------------------
  function on(event, cb) {
    if (!state.listeners[event]) state.listeners[event] = [];
    state.listeners[event].push(cb);
    return () => off(event, cb);
  }
  function off(event, cb) {
    if (!state.listeners[event]) return;
    state.listeners[event] = state.listeners[event].filter(f => f !== cb);
  }
  function emitLocal(event, data) {
    (state.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { warn('listener error', e); }
    });
  }

  // --------------------------------------------------------------------------
  // Volvix hooks - integration points with the POS app
  // --------------------------------------------------------------------------
  const VOLVIX_HOOKS = [
    'sale.completed',
    'sale.refunded',
    'sale.voided',
    'inventory.low_stock',
    'inventory.adjusted',
    'product.created',
    'product.updated',
    'customer.registered',
    'customer.updated',
    'shift.opened',
    'shift.closed',
    'cash.deposit',
    'cash.withdrawal',
    'invoice.generated',
    'invoice.paid',
    'employee.clock_in',
    'employee.clock_out',
    'discount.applied',
    'report.daily_close',
    'sync.error'
  ];

  function registerHook(name, cb) {
    if (!state.hooks[name]) state.hooks[name] = [];
    state.hooks[name].push(cb);
    return () => {
      state.hooks[name] = (state.hooks[name] || []).filter(f => f !== cb);
    };
  }

  async function trigger(name, payload = {}) {
    log('hook triggered', name, payload);
    emitLocal(name, payload);
    (state.hooks[name] || []).forEach(cb => {
      try { cb(payload); } catch (e) { warn('hook cb error', name, e); }
    });
    return await fireTrigger(name, payload);
  }

  // --------------------------------------------------------------------------
  // Zap configurator helpers (used by UI)
  // --------------------------------------------------------------------------
  const Configurator = {
    availableTriggers() { return VOLVIX_HOOKS.slice(); },

    sampleData(event) {
      const samples = {
        'sale.completed':       { saleId: 'S-001', total: 1250.00, items: 3, customer: 'Juan Perez' },
        'sale.refunded':        { saleId: 'S-001', amount: 1250.00, reason: 'damaged' },
        'inventory.low_stock':  { sku: 'SKU-42', name: 'Producto X', stock: 2, threshold: 5 },
        'product.created':      { sku: 'SKU-99', name: 'Nuevo', price: 99.99 },
        'customer.registered':  { id: 'C-1', name: 'Maria Lopez', email: 'maria@example.com' },
        'shift.closed':         { shiftId: 'SH-7', cashier: 'Pedro', total: 12340.50 },
        'invoice.generated':    { invoiceId: 'F-2025-001', amount: 5000, customer: 'Acme SA' }
      };
      return samples[event] || { event, demo: true };
    },

    buildZap({ id, name, trigger, webhook, filterExpr, transformExpr }) {
      const zap = { id, name, trigger, webhook };
      if (filterExpr) {
        try { zap.filter = new Function('data', 'return (' + filterExpr + ')'); }
        catch (e) { throw new Error('Invalid filter: ' + e.message); }
      }
      if (transformExpr) {
        try { zap.transform = new Function('data', 'return (' + transformExpr + ')'); }
        catch (e) { throw new Error('Invalid transform: ' + e.message); }
      }
      return registerZap(zap);
    },

    async testZap(id) {
      const zap = state.zaps[id];
      if (!zap) return { ok: false, error: 'zap not found' };
      const sample = Configurator.sampleData(zap.trigger);
      const res = await httpPost(zap.webhook, {
        zap_id: id, event: zap.trigger, test: true,
        timestamp: new Date().toISOString(), data: sample
      });
      recordHistory({ zapId: id, event: zap.trigger, ok: res.ok, test: true });
      return res;
    },

    validateWebhook(url) {
      if (typeof url !== 'string') return false;
      return /^https:\/\/hooks\.zapier\.com\/hooks\/catch\/\d+\/[A-Za-z0-9]+\/?$/.test(url);
    },

    exportConfig() {
      return JSON.stringify({ zaps: state.zaps, triggers: state.triggers }, null, 2);
    },

    importConfig(jsonStr) {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.zaps) state.zaps = obj.zaps;
        if (obj.triggers) state.triggers = obj.triggers;
        persist();
        return { ok: true, count: Object.keys(state.zaps).length };
      } catch (e) { return { ok: false, error: e.message }; }
    }
  };

  // --------------------------------------------------------------------------
  // Stats / introspection
  // --------------------------------------------------------------------------
  function stats() {
    const total = state.history.length;
    const ok = state.history.filter(h => h.ok).length;
    return {
      zaps: Object.keys(state.zaps).length,
      triggers: Object.keys(state.triggers).length,
      enabled: state.enabled,
      historyTotal: total,
      historyOk: ok,
      historyFail: total - ok,
      lastEvent: state.history[state.history.length - 1] || null
    };
  }

  function clearHistory() {
    state.history = [];
    persist();
  }

  // --------------------------------------------------------------------------
  // Auto-wiring with Volvix global events (if available)
  // --------------------------------------------------------------------------
  function autoWire() {
    if (global.VolvixEvents && typeof global.VolvixEvents.on === 'function') {
      VOLVIX_HOOKS.forEach(h => {
        global.VolvixEvents.on(h, (data) => trigger(h, data));
      });
      log('auto-wired to VolvixEvents');
    }
    if (global.addEventListener) {
      global.addEventListener('volvix:event', (e) => {
        if (e && e.detail && e.detail.name) trigger(e.detail.name, e.detail.payload || {});
      });
    }
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------
  restore();
  autoWire();

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  global.ZapierAPI = {
    // configuration
    config: CONFIG,
    setDebug: (v) => { CONFIG.debug = !!v; },
    enable:  () => { state.enabled = true;  persist(); },
    disable: () => { state.enabled = false; persist(); },

    // zap management
    registerZap,
    removeZap,
    listZaps,
    toggleZap,
    getZap: (id) => state.zaps[id] || null,

    // triggers / hooks
    trigger,
    fireTrigger,
    registerHook,
    on, off,
    availableHooks: () => VOLVIX_HOOKS.slice(),

    // configurator
    Configurator,

    // diagnostics
    stats,
    history: () => state.history.slice(),
    clearHistory
  };

  log('ZapierAPI loaded, hooks:', VOLVIX_HOOKS.length, 'zaps:', Object.keys(state.zaps).length);
})(typeof window !== 'undefined' ? window : globalThis);
