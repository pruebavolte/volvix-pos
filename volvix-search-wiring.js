/**
 * volvix-search-wiring.js
 * ============================================================================
 * VOLVIX POS — Búsqueda Universal estilo Cmd+K (Spotlight)
 * Agent-18 / Ronda 7 Fibonacci
 * ----------------------------------------------------------------------------
 * Modal central con input que busca en múltiples fuentes:
 *   - Productos       (/api/products)
 *   - Clientes        (/api/customers)
 *   - Ventas          (/api/sales)
 *   - Tenants         (/api/tenants)
 *   - Acciones        (crear venta, ir a inventario, etc.)
 *   - Atajos          (definidos localmente)
 *
 * Características:
 *   - Resultados agrupados por categoría
 *   - Navegación con flechas + Enter
 *   - Highlight de matches
 *   - Recientes en localStorage
 *   - Sugerencias inteligentes (frecuencia + contexto)
 *   - Debounce, cancelación de fetch, caching corto
 *   - Atajo global: Ctrl/Cmd + K  (Esc para cerrar)
 * ============================================================================
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Configuración
  // -------------------------------------------------------------------------
  const CFG = {
    HOTKEY: { key: 'k', ctrl: true },
    DEBOUNCE_MS: 180,
    CACHE_TTL_MS: 30_000,
    MAX_PER_GROUP: 5,
    MAX_RECENT: 8,
    LS_RECENT: 'volvix.search.recent',
    LS_FREQ: 'volvix.search.freq',
    ENDPOINTS: {
      products: '/api/products?q=',
      customers: '/api/customers?q=',
      sales: '/api/sales?q=',
      tenants: '/api/tenants?q=',
    },
    GROUPS: [
      { id: 'recent', label: 'Recientes', icon: '🕘' },
      { id: 'suggestions', label: 'Sugerencias', icon: '✨' },
      { id: 'actions', label: 'Acciones', icon: '⚡' },
      { id: 'shortcuts', label: 'Atajos', icon: '⌨️' },
      { id: 'products', label: 'Productos', icon: '📦' },
      { id: 'customers', label: 'Clientes', icon: '👤' },
      { id: 'sales', label: 'Ventas', icon: '🧾' },
      { id: 'tenants', label: 'Tenants', icon: '🏢' },
    ],
  };

  // -------------------------------------------------------------------------
  // 2. Acciones y Atajos estáticos
  // -------------------------------------------------------------------------
  const STATIC_ACTIONS = [
    { id: 'act-new-sale', group: 'actions', title: 'Crear venta nueva', subtitle: 'Abrir POS y empezar ticket', keywords: 'venta nueva ticket pos cobro', run: () => navTo('/pos/new') },
    { id: 'act-new-product', group: 'actions', title: 'Crear producto', subtitle: 'Agregar al inventario', keywords: 'producto nuevo inventario sku', run: () => navTo('/inventory/new') },
    { id: 'act-new-customer', group: 'actions', title: 'Crear cliente', subtitle: 'Agregar a la base', keywords: 'cliente nuevo registrar contacto', run: () => navTo('/customers/new') },
    { id: 'act-cash-cut', group: 'actions', title: 'Hacer corte de caja', subtitle: 'Cerrar turno actual', keywords: 'corte caja cierre turno', run: () => navTo('/cashcut') },
    { id: 'act-import-products', group: 'actions', title: 'Importar productos (CSV)', subtitle: 'Carga masiva', keywords: 'importar csv carga masiva productos', run: () => navTo('/inventory/import') },
    { id: 'act-export-sales', group: 'actions', title: 'Exportar ventas', subtitle: 'Descargar CSV/Excel', keywords: 'exportar ventas reporte excel csv', run: () => navTo('/reports/sales/export') },
    { id: 'act-switch-tenant', group: 'actions', title: 'Cambiar de tenant', subtitle: 'Seleccionar otra sucursal', keywords: 'tenant sucursal cambiar empresa', run: () => openTenantSwitcher() },
    { id: 'act-logout', group: 'actions', title: 'Cerrar sesión', subtitle: 'Salir del sistema', keywords: 'logout salir cerrar sesion', run: () => doLogout() },
  ];

  const STATIC_SHORTCUTS = [
    { id: 'sc-dashboard', group: 'shortcuts', title: 'Ir a Dashboard', subtitle: 'Pantalla principal', keywords: 'inicio home dashboard panel', hotkey: 'g d', run: () => navTo('/dashboard') },
    { id: 'sc-pos', group: 'shortcuts', title: 'Ir a Punto de Venta', subtitle: 'POS', keywords: 'pos venta ticket', hotkey: 'g p', run: () => navTo('/pos') },
    { id: 'sc-inventory', group: 'shortcuts', title: 'Ir a Inventario', subtitle: 'Productos y stock', keywords: 'inventario productos stock', hotkey: 'g i', run: () => navTo('/inventory') },
    { id: 'sc-customers', group: 'shortcuts', title: 'Ir a Clientes', subtitle: 'Base de clientes', keywords: 'clientes contactos', hotkey: 'g c', run: () => navTo('/customers') },
    { id: 'sc-reports', group: 'shortcuts', title: 'Ir a Reportes', subtitle: 'Analíticas y KPIs', keywords: 'reportes kpi analitica', hotkey: 'g r', run: () => navTo('/reports') },
    { id: 'sc-settings', group: 'shortcuts', title: 'Ajustes', subtitle: 'Configuración del sistema', keywords: 'ajustes configuracion settings', hotkey: 'g s', run: () => navTo('/settings') },
    { id: 'sc-help', group: 'shortcuts', title: 'Ayuda y atajos', subtitle: 'Lista de hotkeys', keywords: 'ayuda atajos hotkeys help', hotkey: '?', run: () => navTo('/help') },
  ];

  // -------------------------------------------------------------------------
  // 3. Helpers
  // -------------------------------------------------------------------------
  function navTo(url) {
    if (global.volvixRouter && typeof global.volvixRouter.push === 'function') {
      global.volvixRouter.push(url);
    } else {
      global.location.href = url;
    }
  }
  function openTenantSwitcher() {
    if (typeof global.openTenantSwitcher === 'function') return global.openTenantSwitcher();
    navTo('/tenants');
  }
  function doLogout() {
    if (typeof global.volvixLogout === 'function') return global.volvixLogout();
    navTo('/logout');
  }
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const tokens = query.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!tokens.length) return safe;
    const re = new RegExp('(' + tokens.join('|') + ')', 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  }
  function lsGet(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }

  // -------------------------------------------------------------------------
  // 4. Recientes y frecuencia
  // -------------------------------------------------------------------------
  function getRecent() { return lsGet(CFG.LS_RECENT, []); }
  function pushRecent(item) {
    const slim = { id: item.id, group: item.group, title: item.title, subtitle: item.subtitle, url: item.url };
    const cur = getRecent().filter(x => x.id !== slim.id);
    cur.unshift(slim);
    lsSet(CFG.LS_RECENT, cur.slice(0, CFG.MAX_RECENT));
  }
  function getFreq() { return lsGet(CFG.LS_FREQ, {}); }
  function bumpFreq(id) {
    const f = getFreq();
    f[id] = (f[id] || 0) + 1;
    lsSet(CFG.LS_FREQ, f);
  }
  function suggestionScore(item) {
    return (getFreq()[item.id] || 0);
  }

  // -------------------------------------------------------------------------
  // 5. Cache simple para fetches
  // -------------------------------------------------------------------------
  const fetchCache = new Map();
  function cacheGet(key) {
    const e = fetchCache.get(key);
    if (!e) return null;
    if (Date.now() - e.t > CFG.CACHE_TTL_MS) { fetchCache.delete(key); return null; }
    return e.v;
  }
  function cacheSet(key, v) { fetchCache.set(key, { t: Date.now(), v }); }

  let inflight = null;
  async function fetchGroup(group, query) {
    const url = CFG.ENDPOINTS[group] + encodeURIComponent(query);
    const cached = cacheGet(url);
    if (cached) return cached;
    try {
      const r = await fetch(url, { credentials: 'include', signal: inflight?.signal });
      if (!r.ok) return [];
      const data = await r.json();
      const list = Array.isArray(data) ? data : (data.items || data.data || []);
      const mapped = list.slice(0, CFG.MAX_PER_GROUP).map(o => mapRow(group, o));
      cacheSet(url, mapped);
      return mapped;
    } catch { return []; }
  }
  function mapRow(group, o) {
    switch (group) {
      case 'products':
        return { id: 'prod-' + (o.id ?? o.sku), group, title: o.name || o.title || o.sku, subtitle: 'SKU ' + (o.sku || '—') + ' · $' + (o.price ?? '0'), url: '/inventory/' + (o.id ?? o.sku) };
      case 'customers':
        return { id: 'cust-' + (o.id ?? o.email), group, title: o.name || o.fullName || o.email, subtitle: o.email || o.phone || '', url: '/customers/' + (o.id ?? '') };
      case 'sales':
        return { id: 'sale-' + (o.id ?? o.folio), group, title: 'Venta ' + (o.folio || o.id), subtitle: (o.date || '') + ' · $' + (o.total ?? '0'), url: '/sales/' + (o.id ?? '') };
      case 'tenants':
        return { id: 'tnt-' + (o.id ?? o.slug), group, title: o.name || o.slug, subtitle: o.plan || o.region || '', url: '/tenants/' + (o.id ?? o.slug) };
      default:
        return { id: o.id, group, title: o.title || o.name || '(sin título)', subtitle: '', url: '#' };
    }
  }

  // -------------------------------------------------------------------------
  // 6. Filtrado local de acciones / atajos
  // -------------------------------------------------------------------------
  function localMatch(items, query) {
    if (!query) return items.slice(0, CFG.MAX_PER_GROUP);
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return items
      .map(it => {
        const hay = (it.title + ' ' + (it.subtitle || '') + ' ' + (it.keywords || '')).toLowerCase();
        const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        return { it, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CFG.MAX_PER_GROUP)
      .map(x => x.it);
  }

  // -------------------------------------------------------------------------
  // 7. Búsqueda agregada
  // -------------------------------------------------------------------------
  async function runSearch(query) {
    if (inflight) inflight.abort?.();
    inflight = new AbortController();

    const results = {};
    const q = (query || '').trim();

    if (!q) {
      results.recent = getRecent();
      const all = [...STATIC_ACTIONS, ...STATIC_SHORTCUTS];
      results.suggestions = all
        .map(it => ({ it, s: suggestionScore(it) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, CFG.MAX_PER_GROUP)
        .map(x => x.it);
      results.actions = STATIC_ACTIONS.slice(0, CFG.MAX_PER_GROUP);
      results.shortcuts = STATIC_SHORTCUTS.slice(0, CFG.MAX_PER_GROUP);
      return results;
    }

    results.actions = localMatch(STATIC_ACTIONS, q);
    results.shortcuts = localMatch(STATIC_SHORTCUTS, q);

    const remoteGroups = ['products', 'customers', 'sales', 'tenants'];
    const remote = await Promise.all(remoteGroups.map(g => fetchGroup(g, q)));
    remoteGroups.forEach((g, i) => { results[g] = remote[i]; });

    return results;
  }

  // -------------------------------------------------------------------------
  // 8. UI — estilos y DOM
  // -------------------------------------------------------------------------
  const STYLES = `
  .vx-search-overlay{position:fixed;inset:0;background:rgba(10,12,20,.55);backdrop-filter:blur(4px);z-index:99998;display:none;align-items:flex-start;justify-content:center;padding-top:10vh}
  .vx-search-overlay.open{display:flex}
  .vx-search-modal{width:min(640px,92vw);background:#11141c;color:#e8ecf3;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;border:1px solid #232838;font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
  .vx-search-input-wrap{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #1d2230}
  .vx-search-input-wrap svg{width:18px;height:18px;opacity:.6}
  .vx-search-input{flex:1;background:transparent;border:0;outline:0;color:inherit;font-size:16px}
  .vx-kbd{font-size:11px;padding:2px 6px;border:1px solid #2a3045;border-radius:4px;color:#9aa3b8;background:#161a25}
  .vx-results{max-height:60vh;overflow:auto;padding:6px 0}
  .vx-group-label{padding:8px 16px 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7a8499}
  .vx-item{display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer}
  .vx-item:hover,.vx-item.active{background:#1a2030}
  .vx-item-icon{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:#222a3d;font-size:14px}
  .vx-item-body{flex:1;min-width:0}
  .vx-item-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vx-item-sub{color:#8a93a8;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vx-item mark{background:rgba(255,206,84,.25);color:#ffd66b;padding:0 1px;border-radius:2px}
  .vx-empty{padding:24px;text-align:center;color:#8a93a8}
  .vx-footer{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;border-top:1px solid #1d2230;color:#8a93a8;font-size:12px}
  `;

  function injectStyles() {
    if (document.getElementById('vx-search-styles')) return;
    const s = document.createElement('style');
    s.id = 'vx-search-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function buildDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'vx-search-overlay';
    overlay.innerHTML = `
      <div class="vx-search-modal" role="dialog" aria-label="Búsqueda Volvix">
        <div class="vx-search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="vx-search-input" type="text" placeholder="Buscar productos, clientes, ventas, acciones…" autocomplete="off" spellcheck="false" />
          <span class="vx-kbd">Esc</span>
        </div>
        <div class="vx-results" role="listbox"></div>
        <div class="vx-footer">
          <span><span class="vx-kbd">↑</span> <span class="vx-kbd">↓</span> navegar · <span class="vx-kbd">Enter</span> abrir</span>
          <span><span class="vx-kbd">Ctrl</span>+<span class="vx-kbd">K</span></span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  // -------------------------------------------------------------------------
  // 9. Render + estado
  // -------------------------------------------------------------------------
  let overlayEl, inputEl, resultsEl;
  let flat = [];
  let activeIdx = 0;
  let lastQuery = '';

  function render(grouped, query) {
    flat = [];
    let html = '';
    let count = 0;

    for (const def of CFG.GROUPS) {
      const items = grouped[def.id] || [];
      if (!items.length) continue;
      html += `<div class="vx-group" data-group="${def.id}"><div class="vx-group-label">${def.icon} ${def.label}</div>`;
      for (const it of items) {
        const idx = flat.length;
        flat.push(it);
        html += `
          <div class="vx-item" role="option" data-idx="${idx}">
            <div class="vx-item-icon">${def.icon}</div>
            <div class="vx-item-body">
              <div class="vx-item-title">${highlight(it.title || '', query)}</div>
              <div class="vx-item-sub">${highlight(it.subtitle || '', query)}</div>
            </div>
            ${it.hotkey ? `<span class="vx-kbd">${escapeHtml(it.hotkey)}</span>` : ''}
          </div>`;
        count++;
      }
      html += `</div>`;
    }

    if (!count) {
      html = `<div class="vx-empty">Sin resultados para “${escapeHtml(query)}”.</div>`;
    }
    resultsEl.innerHTML = html;
    activeIdx = 0;
    paintActive();

    resultsEl.querySelectorAll('.vx-item').forEach(el => {
      el.addEventListener('mouseenter', () => { activeIdx = +el.dataset.idx; paintActive(); });
      el.addEventListener('click', () => activate(+el.dataset.idx));
    });
  }
  function paintActive() {
    resultsEl.querySelectorAll('.vx-item').forEach(el => {
      el.classList.toggle('active', +el.dataset.idx === activeIdx);
      if (+el.dataset.idx === activeIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }
  function activate(idx) {
    const item = flat[idx];
    if (!item) return;
    bumpFreq(item.id);
    pushRecent(item);
    close();
    if (typeof item.run === 'function') return item.run();
    if (item.url) navTo(item.url);
  }

  // -------------------------------------------------------------------------
  // 10. Open/close + eventos
  // -------------------------------------------------------------------------
  const debouncedSearch = debounce(async (q) => {
    lastQuery = q;
    const grouped = await runSearch(q);
    if (q !== lastQuery) return;
    render(grouped, q);
  }, CFG.DEBOUNCE_MS);

  function open() {
    overlayEl.classList.add('open');
    inputEl.value = '';
    inputEl.focus();
    debouncedSearch('');
  }
  function close() {
    overlayEl.classList.remove('open');
    if (inflight) inflight.abort?.();
  }
  function toggle() { overlayEl.classList.contains('open') ? close() : open(); }

  function bind() {
    document.addEventListener('keydown', (e) => {
      const isHotkey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === CFG.HOTKEY.key;
      if (isHotkey) { e.preventDefault(); toggle(); return; }
      if (!overlayEl.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(flat.length - 1, activeIdx + 1); paintActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); paintActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(activeIdx); }
    });
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
    inputEl.addEventListener('input', (e) => debouncedSearch(e.target.value));
  }

  // -------------------------------------------------------------------------
  // 11. Init
  // -------------------------------------------------------------------------
  function init() {
    if (global.__volvixSearchInited) return;
    global.__volvixSearchInited = true;
    injectStyles();
    overlayEl = buildDOM();
    inputEl = overlayEl.querySelector('.vx-search-input');
    resultsEl = overlayEl.querySelector('.vx-results');
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // -------------------------------------------------------------------------
  // 12. API pública
  // -------------------------------------------------------------------------
  global.VolvixSearch = {
    open, close, toggle,
    registerAction(action) {
      if (!action || !action.id) return;
      action.group = action.group || 'actions';
      STATIC_ACTIONS.push(action);
    },
    registerShortcut(sc) {
      if (!sc || !sc.id) return;
      sc.group = 'shortcuts';
      STATIC_SHORTCUTS.push(sc);
    },
    clearRecent() { lsSet(CFG.LS_RECENT, []); },
    clearFreq() { lsSet(CFG.LS_FREQ, {}); },
    _internal: { runSearch, CFG },
  };
})(typeof window !== 'undefined' ? window : globalThis);
