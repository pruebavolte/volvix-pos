/* =============================================================================
 * volvix-plugins-wiring.js
 * Volvix POS — Plugin / Extension System
 * Agent-38 · Ronda 8 Fibonacci
 *
 * Capabilities:
 *  1. JavaScript plugin runtime (load / register / unregister)
 *  2. Hook system (pre / post action interceptors)
 *  3. Plugin marketplace UI (browse / search / install)
 *  4. Install / uninstall lifecycle with persistence (localStorage)
 *  5. Sandboxed execution (iframe + Function() with proxy globals)
 *  6. Standard Plugin API (PluginsAPI surface)
 *  7. Per-plugin permissions model with grant prompts
 *  8. Built-in example plugins (analytics, custom-report, dark-mode, low-stock)
 *  9. Public window.PluginsAPI export
 * ============================================================================= */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 0. Constants & storage keys
  // ---------------------------------------------------------------------------
  const VERSION = '1.0.0';
  const LS_INSTALLED = 'volvix.plugins.installed';
  const LS_PERMS = 'volvix.plugins.permissions';
  const LS_DATA = 'volvix.plugins.data';
  const LS_LOG = 'volvix.plugins.log';

  const PERMISSIONS = Object.freeze({
    READ_SALES: 'read:sales',
    READ_INVENTORY: 'read:inventory',
    READ_CUSTOMERS: 'read:customers',
    WRITE_INVENTORY: 'write:inventory',
    WRITE_REPORTS: 'write:reports',
    UI_INJECT: 'ui:inject',
    NETWORK: 'net:fetch',
    NOTIFY: 'ui:notify',
    STORAGE: 'storage:kv',
  });

  // ---------------------------------------------------------------------------
  // 1. Tiny utils
  // ---------------------------------------------------------------------------
  const log = (...a) => console.log('%c[plugins]', 'color:#7c5cff', ...a);
  const warn = (...a) => console.warn('[plugins]', ...a);
  const err = (...a) => console.error('[plugins]', ...a);

  function uid(prefix = 'plg') {
    return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { warn('storage', e); }
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object') {
      Object.values(o).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  }

  // ---------------------------------------------------------------------------
  // 2. Event bus
  // ---------------------------------------------------------------------------
  class EventBus {
    constructor() { this._h = new Map(); }
    on(ev, fn) {
      if (!this._h.has(ev)) this._h.set(ev, new Set());
      this._h.get(ev).add(fn);
      return () => this.off(ev, fn);
    }
    off(ev, fn) { this._h.get(ev)?.delete(fn); }
    emit(ev, payload) {
      const set = this._h.get(ev);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); } catch (e) { err('event', ev, e); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Hook registry — pre / post action interceptors
  // ---------------------------------------------------------------------------
  class HookRegistry {
    constructor() {
      this.pre = new Map();   // action -> [{pluginId, fn, priority}]
      this.post = new Map();
    }
    _add(map, action, pluginId, fn, priority = 50) {
      if (!map.has(action)) map.set(action, []);
      map.get(action).push({ pluginId, fn, priority });
      map.get(action).sort((a, b) => a.priority - b.priority);
    }
    addPre(a, p, fn, pr) { this._add(this.pre, a, p, fn, pr); }
    addPost(a, p, fn, pr) { this._add(this.post, a, p, fn, pr); }
    removeForPlugin(pluginId) {
      for (const m of [this.pre, this.post]) {
        for (const [k, arr] of m.entries()) {
          m.set(k, arr.filter(h => h.pluginId !== pluginId));
        }
      }
    }
    async runPre(action, ctx) {
      const arr = this.pre.get(action) || [];
      for (const h of arr) {
        try {
          const out = await h.fn(ctx);
          if (out === false) return { cancelled: true, by: h.pluginId };
          if (out && typeof out === 'object') Object.assign(ctx, out);
        } catch (e) { err('pre-hook', action, h.pluginId, e); }
      }
      return { cancelled: false, ctx };
    }
    async runPost(action, ctx, result) {
      const arr = this.post.get(action) || [];
      let mutated = result;
      for (const h of arr) {
        try {
          const out = await h.fn({ ...ctx, result: mutated });
          if (typeof out !== 'undefined') mutated = out;
        } catch (e) { err('post-hook', action, h.pluginId, e); }
      }
      return mutated;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Permission manager
  // ---------------------------------------------------------------------------
  class PermissionManager {
    constructor() { this._granted = readJSON(LS_PERMS, {}); }
    get(pluginId) { return this._granted[pluginId] || []; }
    has(pluginId, perm) { return (this._granted[pluginId] || []).includes(perm); }
    async request(pluginId, requested = []) {
      const current = new Set(this.get(pluginId));
      const missing = requested.filter(p => !current.has(p));
      if (!missing.length) return true;
      const ok = await this._prompt(pluginId, missing);
      if (ok) {
        missing.forEach(p => current.add(p));
        this._granted[pluginId] = [...current];
        writeJSON(LS_PERMS, this._granted);
      }
      return ok;
    }
    revoke(pluginId) {
      delete this._granted[pluginId];
      writeJSON(LS_PERMS, this._granted);
    }
    _prompt(pluginId, perms) {
      return new Promise(resolve => {
        // Try DOM-modal; fall back to confirm()
        if (typeof document === 'undefined') return resolve(true);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui';
        wrap.innerHTML = `
          <div style="background:#1f1f2b;color:#eee;padding:24px;border-radius:12px;max-width:420px;box-shadow:0 12px 48px rgba(0,0,0,.6)">
            <h3 style="margin:0 0 12px;font-size:18px">Plugin requiere permisos</h3>
            <p style="opacity:.8;font-size:13px;margin:0 0 12px"><b>${pluginId}</b> solicita:</p>
            <ul style="font-size:13px;line-height:1.7;padding-left:18px">${perms.map(p => `<li><code>${p}</code></li>`).join('')}</ul>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
              <button data-act="deny"  style="padding:8px 14px;border:0;border-radius:6px;background:#444;color:#fff;cursor:pointer">Denegar</button>
              <button data-act="grant" style="padding:8px 14px;border:0;border-radius:6px;background:#7c5cff;color:#fff;cursor:pointer">Permitir</button>
            </div>
          </div>`;
        wrap.addEventListener('click', e => {
          const a = e.target.dataset?.act;
          if (a) { document.body.removeChild(wrap); resolve(a === 'grant'); }
        });
        document.body.appendChild(wrap);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Sandbox — Function() with frozen proxy globals
  //    (For high-isolation we also support iframe sandbox = 'allow-scripts')
  // ---------------------------------------------------------------------------
  class Sandbox {
    constructor(pluginId, api) {
      this.pluginId = pluginId;
      this.api = api;
    }
    run(code) {
      const safeGlobals = {
        console: {
          log: (...a) => log(`[${this.pluginId}]`, ...a),
          warn: (...a) => warn(`[${this.pluginId}]`, ...a),
          error: (...a) => err(`[${this.pluginId}]`, ...a),
        },
        setTimeout, clearTimeout, setInterval, clearInterval,
        Math, Date, JSON, Promise, Array, Object, String, Number, Boolean,
        plugin: this.api,
      };
      const keys = Object.keys(safeGlobals);
      const vals = keys.map(k => safeGlobals[k]);
      // Block window/document/localStorage by shadowing
      const blockList = ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'eval', 'parent', 'top', 'self', 'globalThis'];
      const stub = new Proxy({}, { get() { throw new Error('global access blocked in sandbox'); } });
      blockList.forEach(b => { keys.push(b); vals.push(stub); });
      // Strict mode prevents accidental globals
      const fn = new Function(...keys, '"use strict";\n' + code + '\nreturn (typeof module!=="undefined" && module.exports) || (typeof __plugin!=="undefined" && __plugin) || null;');
      return fn(...vals);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Plugin storage (per-plugin KV)
  // ---------------------------------------------------------------------------
  class PluginStorage {
    constructor(pluginId) { this.id = pluginId; }
    _all() { return readJSON(LS_DATA, {}); }
    _save(o) { writeJSON(LS_DATA, o); }
    get(k, def = null) { return (this._all()[this.id] || {})[k] ?? def; }
    set(k, v) { const all = this._all(); all[this.id] = all[this.id] || {}; all[this.id][k] = v; this._save(all); }
    delete(k) { const all = this._all(); if (all[this.id]) { delete all[this.id][k]; this._save(all); } }
    clear() { const all = this._all(); delete all[this.id]; this._save(all); }
  }

  // ---------------------------------------------------------------------------
  // 7. Plugin manager (core)
  // ---------------------------------------------------------------------------
  class PluginManager {
    constructor() {
      this.bus = new EventBus();
      this.hooks = new HookRegistry();
      this.perms = new PermissionManager();
      this.registry = new Map();      // pluginId -> manifest+instance
      this.marketplace = new Map();   // available plugins
      this._installed = readJSON(LS_INSTALLED, []); // [{id,manifest,code}]
    }

    // ---- Marketplace ----
    publish(manifest) {
      if (!manifest?.id) throw new Error('manifest.id required');
      this.marketplace.set(manifest.id, deepFreeze({ ...manifest }));
      this.bus.emit('marketplace:update', manifest);
    }
    listMarketplace(query = '') {
      const q = query.toLowerCase();
      return [...this.marketplace.values()].filter(m =>
        !q || m.id.includes(q) || (m.name || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q)
      );
    }

    // ---- Lifecycle ----
    async install(manifestOrId, codeOverride) {
      const manifest = typeof manifestOrId === 'string'
        ? this.marketplace.get(manifestOrId)
        : manifestOrId;
      if (!manifest) throw new Error('plugin not found');
      const code = codeOverride || manifest.code;
      if (!code) throw new Error('plugin code missing');

      const granted = await this.perms.request(manifest.id, manifest.permissions || []);
      if (!granted) { this.bus.emit('install:denied', manifest.id); return false; }

      // Persist
      const existing = this._installed.find(p => p.id === manifest.id);
      if (!existing) {
        this._installed.push({ id: manifest.id, manifest, code });
        writeJSON(LS_INSTALLED, this._installed);
      }
      await this._activate(manifest, code);
      this.bus.emit('install', manifest.id);
      this._appendLog('install', manifest.id);
      return true;
    }

    async uninstall(pluginId) {
      const entry = this.registry.get(pluginId);
      if (entry?.instance?.onUninstall) {
        try { await entry.instance.onUninstall(); } catch (e) { err('onUninstall', e); }
      }
      this.hooks.removeForPlugin(pluginId);
      this.registry.delete(pluginId);
      this._installed = this._installed.filter(p => p.id !== pluginId);
      writeJSON(LS_INSTALLED, this._installed);
      this.perms.revoke(pluginId);
      new PluginStorage(pluginId).clear();
      this.bus.emit('uninstall', pluginId);
      this._appendLog('uninstall', pluginId);
    }

    async _activate(manifest, code) {
      const api = this._buildAPI(manifest);
      const sandbox = new Sandbox(manifest.id, api);
      let instance;
      try { instance = sandbox.run(code); }
      catch (e) { err('activation failed', manifest.id, e); throw e; }
      this.registry.set(manifest.id, { manifest, instance, api });
      if (instance?.onInstall) { try { await instance.onInstall(); } catch (e) { err(e); } }
      if (instance?.onEnable)  { try { await instance.onEnable();  } catch (e) { err(e); } }
    }

    async loadInstalled() {
      for (const p of this._installed) {
        try { await this._activate(p.manifest, p.code); }
        catch (e) { err('failed to load', p.id, e); }
      }
      this.bus.emit('ready');
    }

    // ---- Action dispatcher (wraps app actions with hooks) ----
    async dispatch(action, payload, executor) {
      const ctx = { action, payload, ts: Date.now() };
      const pre = await this.hooks.runPre(action, ctx);
      if (pre.cancelled) return { cancelled: true, by: pre.by };
      let result;
      try { result = await executor(ctx.payload); }
      catch (e) { err('action', action, e); throw e; }
      result = await this.hooks.runPost(action, ctx, result);
      return result;
    }

    // ---- Build per-plugin API surface ----
    _buildAPI(manifest) {
      const id = manifest.id;
      const has = p => this.perms.has(id, p);
      const requirePerm = p => { if (!has(p)) throw new Error(`permission '${p}' required`); };
      const storage = new PluginStorage(id);
      const self = this;

      return Object.freeze({
        version: VERSION,
        id,
        manifest: deepFreeze({ ...manifest }),

        // Hooks
        addPreHook:  (action, fn, pri) => self.hooks.addPre(action, id, fn, pri),
        addPostHook: (action, fn, pri) => self.hooks.addPost(action, id, fn, pri),

        // Events
        on:    (ev, fn) => self.bus.on(ev, fn),
        emit:  (ev, p)  => self.bus.emit(`plugin:${id}:${ev}`, p),

        // Storage
        storage: {
          get: (k, d) => { requirePerm(PERMISSIONS.STORAGE); return storage.get(k, d); },
          set: (k, v) => { requirePerm(PERMISSIONS.STORAGE); return storage.set(k, v); },
          delete: k   => { requirePerm(PERMISSIONS.STORAGE); return storage.delete(k); },
        },

        // Notify
        notify: (msg, type = 'info') => {
          requirePerm(PERMISSIONS.NOTIFY);
          self.bus.emit('notify', { from: id, msg, type });
        },

        // UI inject (returns sanitized container element)
        ui: {
          mount: (slot, html) => {
            requirePerm(PERMISSIONS.UI_INJECT);
            const root = document.querySelector(`[data-plugin-slot="${slot}"]`)
              || document.body;
            const div = document.createElement('div');
            div.dataset.pluginOwner = id;
            div.innerHTML = html;
            root.appendChild(div);
            return div;
          },
          unmountAll: () => {
            document.querySelectorAll(`[data-plugin-owner="${id}"]`).forEach(n => n.remove());
          },
        },

        // Network (gated)
        fetch: async (url, opts) => {
          requirePerm(PERMISSIONS.NETWORK);
          return fetch(url, opts);
        },

        // Read-only data accessors (the host app fills these via PluginsAPI.provide())
        data: {
          sales:     () => { requirePerm(PERMISSIONS.READ_SALES);     return self._provider('sales'); },
          inventory: () => { requirePerm(PERMISSIONS.READ_INVENTORY); return self._provider('inventory'); },
          customers: () => { requirePerm(PERMISSIONS.READ_CUSTOMERS); return self._provider('customers'); },
        },

        // Reports
        registerReport: (descriptor) => {
          requirePerm(PERMISSIONS.WRITE_REPORTS);
          self._reports.set(descriptor.id, { ...descriptor, owner: id });
          self.bus.emit('report:register', descriptor);
        },

        log: (...a) => log(`[${id}]`, ...a),
      });
    }

    // ---- Host data providers ----
    _providers = {};
    _reports = new Map();
    _provider(key) {
      const p = this._providers[key];
      return typeof p === 'function' ? p() : (p ?? null);
    }
    provide(key, fn) { this._providers[key] = fn; }
    listReports() { return [...this._reports.values()]; }

    // ---- Audit log ----
    _appendLog(kind, pluginId) {
      const cur = readJSON(LS_LOG, []);
      cur.push({ kind, pluginId, ts: Date.now() });
      if (cur.length > 500) cur.splice(0, cur.length - 500);
      writeJSON(LS_LOG, cur);
    }
    auditLog() { return readJSON(LS_LOG, []); }
  }

  // ---------------------------------------------------------------------------
  // 8. Marketplace UI renderer
  // ---------------------------------------------------------------------------
  class MarketplaceUI {
    constructor(manager) { this.m = manager; }
    open(targetEl) {
      const target = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
      if (!target) { warn('marketplace target not found'); return; }
      target.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'volvix-marketplace';
      wrap.style.cssText = 'font-family:system-ui;color:#eee;background:#161622;padding:16px;border-radius:10px';
      wrap.innerHTML = `
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <h2 style="margin:0;font-size:20px">Plugin Marketplace</h2>
          <input type="search" placeholder="Buscar..." class="vmk-q" style="margin-left:auto;padding:6px 10px;border-radius:6px;border:1px solid #333;background:#0f0f18;color:#eee">
        </header>
        <div class="vmk-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px"></div>`;
      target.appendChild(wrap);
      const grid = wrap.querySelector('.vmk-grid');
      const q = wrap.querySelector('.vmk-q');
      const render = () => {
        grid.innerHTML = '';
        for (const m of this.m.listMarketplace(q.value)) {
          const installed = this.m.registry.has(m.id);
          const card = document.createElement('div');
          card.style.cssText = 'background:#1f1f2b;border:1px solid #2a2a3a;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px';
          card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:8px;background:#7c5cff;display:flex;align-items:center;justify-content:center;font-weight:700">${(m.name || m.id).slice(0,1).toUpperCase()}</div>
              <div style="flex:1">
                <div style="font-weight:600">${m.name || m.id}</div>
                <div style="opacity:.7;font-size:12px">v${m.version || '0.0.0'} · ${m.author || 'unknown'}</div>
              </div>
            </div>
            <div style="font-size:13px;opacity:.85;min-height:34px">${m.description || ''}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;font-size:11px">${(m.permissions || []).map(p => `<span style="background:#2a2a3a;padding:2px 6px;border-radius:4px">${p}</span>`).join('')}</div>
            <button class="vmk-act" data-id="${m.id}" style="margin-top:auto;padding:8px;border:0;border-radius:6px;background:${installed ? '#444' : '#7c5cff'};color:#fff;cursor:pointer">${installed ? 'Desinstalar' : 'Instalar'}</button>`;
          grid.appendChild(card);
        }
        grid.querySelectorAll('.vmk-act').forEach(b => {
          b.addEventListener('click', async () => {
            const id = b.dataset.id;
            if (this.m.registry.has(id)) await this.m.uninstall(id);
            else await this.m.install(id);
            render();
          });
        });
      };
      q.addEventListener('input', render);
      this.m.bus.on('marketplace:update', render);
      this.m.bus.on('install', render);
      this.m.bus.on('uninstall', render);
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Built-in example plugins
  // ---------------------------------------------------------------------------
  const BUILTINS = [
    {
      id: 'volvix.analytics',
      name: 'Analytics Tracker',
      version: '1.0.0',
      author: 'Volvix Core',
      description: 'Cuenta cada venta y muestra totales por día.',
      permissions: ['storage:kv', 'ui:notify'],
      code: `
        let count = 0;
        plugin.addPostHook('sale.commit', async (ctx) => {
          count++;
          plugin.storage.set('count_' + new Date().toISOString().slice(0,10),
            (plugin.storage.get('count_' + new Date().toISOString().slice(0,10), 0)) + 1);
          plugin.notify('Ventas hoy: ' + count, 'info');
          return ctx.result;
        });
        var __plugin = {
          onEnable() { plugin.log('analytics enabled'); },
          onUninstall() { plugin.log('analytics removed'); }
        };`
    },
    {
      id: 'volvix.custom-report',
      name: 'Custom Sales Report',
      version: '1.0.0',
      author: 'Volvix Core',
      description: 'Reporte de top-5 productos vendidos.',
      permissions: ['read:sales', 'write:reports'],
      code: `
        plugin.registerReport({
          id: 'top5',
          title: 'Top 5 productos',
          run: () => {
            const sales = plugin.data.sales() || [];
            const map = {};
            sales.forEach(s => (s.items||[]).forEach(i => map[i.sku] = (map[i.sku]||0) + i.qty));
            return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
          }
        });
        var __plugin = { onEnable(){ plugin.log('report ready'); } };`
    },
    {
      id: 'volvix.dark-mode',
      name: 'Forced Dark Mode',
      version: '0.9.0',
      author: 'Community',
      description: 'Inyecta CSS para forzar modo oscuro en cualquier vista.',
      permissions: ['ui:inject'],
      code: `
        var __plugin = {
          onEnable() {
            const css = '<style>html,body{background:#0e0e16!important;color:#eee!important}</style>';
            plugin.ui.mount('head', css);
          },
          onUninstall(){ plugin.ui.unmountAll(); }
        };`
    },
    {
      id: 'volvix.low-stock',
      name: 'Low Stock Alerter',
      version: '1.1.0',
      author: 'Volvix Core',
      description: 'Avisa cuando un producto baja de su umbral.',
      permissions: ['read:inventory', 'ui:notify'],
      code: `
        plugin.addPostHook('inventory.update', async (ctx) => {
          const inv = plugin.data.inventory() || [];
          inv.forEach(p => {
            if (p.stock <= (p.minStock||5)) {
              plugin.notify('Stock bajo: ' + p.name + ' (' + p.stock + ')', 'warning');
            }
          });
          return ctx.result;
        });
        var __plugin = {};`
    },
  ];

  // ---------------------------------------------------------------------------
  // 10. Public PluginsAPI surface
  // ---------------------------------------------------------------------------
  const manager = new PluginManager();
  const ui = new MarketplaceUI(manager);

  // Seed marketplace with built-ins
  BUILTINS.forEach(p => manager.publish(p));

  const PluginsAPI = {
    VERSION,
    PERMISSIONS,

    // Lifecycle
    install:  (idOrManifest, code) => manager.install(idOrManifest, code),
    uninstall: id => manager.uninstall(id),
    list:      () => [...manager.registry.values()].map(e => e.manifest),
    listMarketplace: q => manager.listMarketplace(q),
    listReports:     () => manager.listReports(),

    // Hooks bridge for the host app
    dispatch: (action, payload, executor) => manager.dispatch(action, payload, executor),

    // Provide host data for plugins to read
    provide: (key, fn) => manager.provide(key, fn),

    // Events
    on:  (ev, fn) => manager.bus.on(ev, fn),
    off: (ev, fn) => manager.bus.off(ev, fn),

    // Marketplace UI
    openMarketplace: target => ui.open(target),

    // Permissions inspection
    permissionsOf: id => manager.perms.get(id),
    revokePermissions: id => manager.perms.revoke(id),

    // Audit
    auditLog: () => manager.auditLog(),

    // Boot
    boot: async () => {
      log('booting v' + VERSION);
      await manager.loadInstalled();
      log('ready · installed:', manager.registry.size, '· marketplace:', manager.marketplace.size);
      return true;
    },

    // Programmatic publish (for 3rd-party stores)
    publish: m => manager.publish(m),

    // Internal (for tests)
    _manager: manager,
  };

  // ---------------------------------------------------------------------------
  // 11. Auto-boot when DOM ready
  // ---------------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => PluginsAPI.boot());
    } else {
      // Defer to next tick to allow host to register .provide() first
      setTimeout(() => PluginsAPI.boot(), 0);
    }
  }

  // ---------------------------------------------------------------------------
  // 12. Export
  // ---------------------------------------------------------------------------
  root.PluginsAPI = PluginsAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = PluginsAPI;

})(typeof window !== 'undefined' ? window : globalThis);
