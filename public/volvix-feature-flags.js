/**
 * VOLVIX FEATURE FLAGS
 * Global feature-flag system with 3-state resolution per module:
 *   'enabled'      -> module fully usable
 *   'disabled'     -> hidden from DOM (display:none)
 *   'coming-soon'  -> grayed out, click blocked, "Próximamente" tooltip
 *
 * Resolution order (most-specific wins):
 *   user_override > role_permission > tenant_override > module.default_status
 *
 * Usage in HTML:
 *   <button data-feature="module.pos">POS</button>
 *
 * Usage in JS:
 *   if (window.VolvixFeatures.has('module.pos')) { ... }
 *   const status = window.VolvixFeatures.status('module.pos'); // 'enabled' | 'disabled' | 'coming-soon'
 *
 * Auto-injects CSS for .vlx-coming-soon and .vlx-feature-hidden if /volvix-feature-flags.css missing.
 */
(function () {
  'use strict';
  if (window.__volvixFeatureFlagsLoaded) return;
  window.__volvixFeatureFlagsLoaded = true;

  // ---------- CONFIG ----------
  var STORAGE_KEY = 'volvix_feature_flags_v1';
  var STORAGE_VERSION = 1;
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
  var API_BASE = (window.VOLVIX_API_BASE || '');
  var ENDPOINT = API_BASE + '/api/feature-flags';

  // ---------- AUTH HELPERS ----------
  function getToken() {
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        return window.VolvixAuth.getToken();
      }
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getToken === 'function') {
        return window.Volvix.auth.getToken();
      }
      return localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || null;
    } catch (e) { return null; }
  }
  function getUser() {
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.getUser === 'function') {
        return window.VolvixAuth.getUser();
      }
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getUser === 'function') {
        return window.Volvix.auth.getUser();
      }
      var jwt = getToken();
      if (!jwt) return null;
      var parts = jwt.split('.');
      if (parts.length < 2) return null;
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { id: payload.user_id || payload.sub, tenant_id: payload.tenant_id, role: payload.role };
    } catch (e) { return null; }
  }

  // ---------- DEFAULT MODULES (used if API unavailable) ----------
  // These keys MUST match data-feature attributes throughout the app.
  var DEFAULT_MODULES = {
    'module.pos':           { name: 'Punto de Venta',     default_status: 'enabled' },
    'module.credito':       { name: 'Crédito',            default_status: 'enabled' },
    'module.clientes':      { name: 'Clientes',           default_status: 'enabled' },
    'module.inventario':    { name: 'Inventario',         default_status: 'enabled' },
    'module.kardex':        { name: 'Kardex',             default_status: 'enabled' },
    'module.proveedores':   { name: 'Proveedores',        default_status: 'enabled' },
    'module.config':        { name: 'Configuración',      default_status: 'enabled' },
    'module.facturacion':   { name: 'Facturación CFDI',   default_status: 'enabled' },
    'module.corte':         { name: 'Corte de Caja',      default_status: 'enabled' },
    'module.reportes':      { name: 'Reportes',           default_status: 'enabled' },
    'module.dashboard':     { name: 'Dashboard',          default_status: 'enabled' },
    'module.apertura':      { name: 'Apertura de Caja',   default_status: 'enabled' },
    'module.cotizaciones':  { name: 'Cotizaciones',       default_status: 'enabled' },
    'module.devoluciones':  { name: 'Devoluciones',       default_status: 'enabled' },
    'module.ventas':        { name: 'Ventas',             default_status: 'enabled' },
    'module.usuarios':      { name: 'Usuarios',           default_status: 'enabled' },
    'module.recargas':      { name: 'Recargas',           default_status: 'enabled' },
    'module.servicios':     { name: 'Pago de Servicios',  default_status: 'enabled' },
    'module.tarjetas':      { name: 'Tarjetas Virtuales', default_status: 'coming-soon' },
    'module.promociones':   { name: 'Promociones',        default_status: 'enabled' },
    'module.departamentos': { name: 'Departamentos',      default_status: 'enabled' },
    'module.sugeridas':     { name: 'Compras Sugeridas',  default_status: 'coming-soon' },
    'module.actualizador':  { name: 'Actualizador',       default_status: 'enabled' },
    'module.marketplace':   { name: 'Marketplace',        default_status: 'enabled' },
    'module.kds':           { name: 'KDS Cocina',         default_status: 'coming-soon' },
    // 2026-05-12: módulos verticales (rentas + reservaciones). Disponibles
    // por default para todos los giros — el platform owner puede desactivar
    // por tenant en /paneldecontrol.html#permisos > Verticales.
    'module.rentas':        { name: 'Renta de Equipo',    default_status: 'enabled' },
    'module.reservaciones': { name: 'Reservaciones',      default_status: 'enabled' },
    // 2026-05-13: motor visual de distribución (layout builder universal)
    'module.mapa':          { name: 'Mapa del lugar',     default_status: 'enabled' }
  };

  function defaultMap() {
    var m = {};
    Object.keys(DEFAULT_MODULES).forEach(function (k) { m[k] = DEFAULT_MODULES[k].default_status; });
    return m;
  }

  // ---------- CACHE ----------
  function loadCache() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.version !== STORAGE_VERSION) return null;
      if (!data.fetched_at || (Date.now() - data.fetched_at) > CACHE_TTL_MS) return data; // stale-but-usable
      return data;
    } catch (e) { return null; }
  }
  function saveCache(map, userId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        fetched_at: Date.now(),
        user_id: userId || null,
        flags: map
      }));
    } catch (e) {}
  }

  // ---------- CSS INJECTION ----------
  function injectCSS() {
    if (document.getElementById('vlx-feature-flags-css')) return;
    // Try external stylesheet first
    var hasExternal = !!document.querySelector('link[href*="volvix-feature-flags.css"]');
    if (hasExternal) return;
    var s = document.createElement('style');
    s.id = 'vlx-feature-flags-css';
    s.textContent = [
      '.vlx-feature-hidden { display: none !important; }',
      '.vlx-coming-soon {',
      '  position: relative !important;',
      '  opacity: 0.45 !important;',
      '  cursor: not-allowed !important;',
      '  pointer-events: auto !important;',
      '  filter: grayscale(0.6);',
      '}',
      '.vlx-coming-soon * { pointer-events: none !important; }',
      '.vlx-coming-soon:hover::after {',
      '  content: "Próximamente";',
      '  position: absolute;',
      '  top: -28px; left: 50%;',
      '  transform: translateX(-50%);',
      '  background: #1f2937;',
      '  color: #fff;',
      '  padding: 4px 10px;',
      '  border-radius: 6px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  white-space: nowrap;',
      '  z-index: 10000;',
      '  pointer-events: none;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.25);',
      '}',
      '.vlx-coming-soon::before {',
      '  content: "Pronto";',
      '  position: absolute;',
      '  top: 4px; right: 4px;',
      '  background: #f59e0b;',
      '  color: #fff;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  padding: 2px 6px;',
      '  border-radius: 8px;',
      '  letter-spacing: 0.4px;',
      '  text-transform: uppercase;',
      '  z-index: 5;',
      '  pointer-events: none;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------- APPLY RULES ----------
  function applyToElement(el, status) {
    if (!el || !el.classList) return;
    if (status === 'disabled') {
      el.classList.add('vlx-feature-hidden');
      el.classList.remove('vlx-coming-soon');
      el.setAttribute('aria-hidden', 'true');
    } else if (status === 'coming-soon') {
      el.classList.add('vlx-coming-soon');
      el.classList.remove('vlx-feature-hidden');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', 'Próximamente disponible');
      // Block click without removing handler
      if (!el._vlxClickBlocker) {
        el._vlxClickBlocker = function (e) {
          if (el.classList.contains('vlx-coming-soon')) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            try {
              if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
                window.VolvixUI.toast({ type: 'info', message: 'Esta función estará disponible próximamente.' });
              }
            } catch (_) {}
            return false;
          }
        };
        el.addEventListener('click', el._vlxClickBlocker, true);
      }
    } else { // enabled
      el.classList.remove('vlx-feature-hidden');
      el.classList.remove('vlx-coming-soon');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('aria-disabled');
    }
  }

  function applyAll() {
    var map = (window.VolvixFeatures && window.VolvixFeatures._map) || defaultMap();
    try {
      var nodes = document.querySelectorAll('[data-feature]');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute('data-feature');
        if (!key) continue;
        var status = map[key] || 'enabled';
        applyToElement(nodes[i], status);
      }
    } catch (e) { console.warn('[feature-flags] applyAll err', e); }
  }

  // ---------- FETCH FROM API ----------
  function fetchFlags() {
    var user = getUser();
    var token = getToken();
    if (!token || !user || !user.id) {
      // No auth -> use defaults
      return Promise.resolve(defaultMap());
    }
    var url = ENDPOINT + '?user_id=' + encodeURIComponent(user.id);
    return fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
      credentials: 'same-origin'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      // Expected: { flags: { 'module.pos': 'enabled', ... } }
      var map = (data && data.flags) ? data.flags : (data || {});
      // Merge with defaults so unknown keys fallback to default
      var merged = defaultMap();
      Object.keys(map).forEach(function (k) { merged[k] = map[k]; });
      return merged;
    }).catch(function (err) {
      console.warn('[feature-flags] fetch failed, using cache/defaults:', err.message);
      var cache = loadCache();
      return (cache && cache.flags) ? cache.flags : defaultMap();
    });
  }

  // ---------- PUBLIC API ----------
  var API = {
    _map: defaultMap(),
    _ready: false,
    _readyCallbacks: [],

    has: function (key) {
      return this.status(key) === 'enabled';
    },
    status: function (key) {
      return this._map[key] || 'enabled';
    },
    all: function () {
      return Object.assign({}, this._map);
    },
    onReady: function (cb) {
      if (typeof cb !== 'function') return;
      if (this._ready) cb(this._map);
      else this._readyCallbacks.push(cb);
    },
    refresh: function () {
      var self = this;
      return fetchFlags().then(function (map) {
        self._map = map;
        saveCache(map, (getUser() || {}).id);
        applyAll();
        return map;
      });
    },
    /** Manually override a flag locally (for testing or live updates from owner). */
    setLocal: function (key, status) {
      if (['enabled', 'disabled', 'coming-soon'].indexOf(status) === -1) return;
      this._map[key] = status;
      saveCache(this._map, (getUser() || {}).id);
      applyAll();
      try { localStorage.setItem('volvix_feature_flags_sync', String(Date.now())); } catch (_) {}
    },
    /** Force re-apply rules to DOM (e.g., after dynamic insert). */
    apply: applyAll
  };

  window.VolvixFeatures = API;

  // ---------- BOOT ----------
  function boot() {
    injectCSS();
    // Try cache first for instant render
    var cache = loadCache();
    if (cache && cache.flags) {
      API._map = cache.flags;
      applyAll();
    } else {
      applyAll(); // applies defaults
    }
    // Then refresh from API
    API.refresh().then(function () {
      API._ready = true;
      API._readyCallbacks.forEach(function (cb) { try { cb(API._map); } catch (_) {} });
      API._readyCallbacks = [];
    }).catch(function () {
      API._ready = true;
    });

    // MutationObserver: re-apply to dynamically added elements
    try {
      var mo = new MutationObserver(function (muts) {
        var dirty = false;
        for (var i = 0; i < muts.length && !dirty; i++) {
          var m = muts[i];
          if (m.addedNodes && m.addedNodes.length) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1 && (n.matches && n.matches('[data-feature]')) || (n.querySelector && n.querySelector('[data-feature]'))) {
                dirty = true; break;
              }
            }
          }
        }
        if (dirty) applyAll();
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    // Cross-tab sync
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY || e.key === 'volvix_feature_flags_sync') {
        var c = loadCache();
        if (c && c.flags) {
          API._map = c.flags;
          applyAll();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
