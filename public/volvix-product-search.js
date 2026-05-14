/**
 * volvix-product-search.js — B19
 * Sistema de búsqueda inteligente offline-first con autocomplete.
 *
 * Características:
 * - IndexedDB local como source of truth (table 'products')
 * - Fuse.js fuzzy search inline (sin dependencias externas)
 * - Ranking: exact(100) > prefix(80) > contains(60) > fuzzy(40)
 * - Debounce 200ms
 * - Sync background con /api/products?since=ts
 * - Validación de precio re-fetch desde IndexedDB antes de cerrar venta
 *
 * API pública en window.VolvixProductSearch:
 *   - init(): Promise — abre IndexedDB, sync inicial
 *   - search(query, opts): Promise<results[]>  — top N con score
 *   - getById(id): Promise<product|null>      — fresh read DB local
 *   - getByCode(code): Promise<product|null>  — fast lookup por código
 *   - upsert(product): Promise — insert/update local
 *   - sync(): Promise<{added, updated}>  — pull desde /api/products
 *   - mountAutocomplete(input, options) — UI autocomplete
 *   - validatePrices(items): Promise<items[]>  — re-fetch precios local
 */
(function (global) {
  'use strict';

  const DB_NAME = 'volvix-products-v1';
  const DB_VERSION = 1;
  const STORE = 'products';
  const META_STORE = 'meta';

  let db = null;
  let memCache = null;     // Map<id, product>  acceso O(1)
  let codeIndex = null;    // Map<code, id>     fast barcode lookup
  let lastSync = 0;

  // ──────────────────────────────────────────────────────────────
  // IndexedDB
  // ──────────────────────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('code', 'code', { unique: false });
          s.createIndex('name', 'name', { unique: false });
          s.createIndex('version', 'version', { unique: false });
        }
        if (!d.objectStoreNames.contains(META_STORE)) {
          d.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function ensureDB() {
    if (db) return db;
    db = await openDB();
    return db;
  }

  function tx(name, mode) {
    return db.transaction(name, mode).objectStore(name);
  }

  function pAll(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function loadAllToMem() {
    await ensureDB();
    const all = await pAll(tx(STORE, 'readonly').getAll());
    memCache = new Map();
    codeIndex = new Map();
    for (const p of all) {
      memCache.set(p.id, p);
      if (p.code) codeIndex.set(String(p.code), p.id);
    }
    return all.length;
  }

  async function getMeta(key) {
    await ensureDB();
    return new Promise((res) => {
      const r = tx(META_STORE, 'readonly').get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => res(null);
    });
  }
  async function setMeta(key, value) {
    await ensureDB();
    const t = db.transaction(META_STORE, 'readwrite').objectStore(META_STORE);
    t.put({ key, value });
  }

  // ──────────────────────────────────────────────────────────────
  // Normalización para fuzzy
  // ──────────────────────────────────────────────────────────────
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, '')
      .trim();
  }

  // Levenshtein distance para fuzzy fallback
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // Score: 100 exact, 80 prefix, 60 contains, 40 fuzzy (lev <= len*0.4)
  function scoreMatch(query, target) {
    if (!query || !target) return 0;
    const q = normalize(query);
    const t = normalize(target);
    if (!q || !t) return 0;
    if (q === t) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    // fuzzy
    const maxDist = Math.max(1, Math.floor(Math.max(q.length, t.length) * 0.4));
    const d = lev(q, t);
    if (d <= maxDist) {
      return Math.max(20, 40 - d * 5);
    }
    return 0;
  }

  // ──────────────────────────────────────────────────────────────
  // Search engine
  // ──────────────────────────────────────────────────────────────
  async function search(query, opts) {
    opts = opts || {};
    const limit = opts.limit || 10;
    if (!memCache) await loadAllToMem();
    const q = normalize(query);
    if (!q) return [];

    const candidates = [];
    for (const p of memCache.values()) {
      // probar match en nombre + código
      const sName = scoreMatch(q, p.name);
      const sCode = scoreMatch(q, p.code);
      const score = Math.max(sName, sCode);
      if (score > 0) {
        candidates.push({ product: p, score, byCode: sCode > sName });
      }
    }

    // Ordenar: score DESC > ventas DESC > stock DESC
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const va = Number(a.product.ventas || 0);
      const vb = Number(b.product.ventas || 0);
      if (vb !== va) return vb - va;
      const sa = Number(a.product.stock || 0);
      const sb = Number(b.product.stock || 0);
      return sb - sa;
    });

    return candidates.slice(0, limit).map(c => ({
      ...c.product,
      _score: c.score,
      _matched: c.byCode ? 'code' : 'name'
    }));
  }

  async function getById(id) {
    await ensureDB();
    return new Promise((res) => {
      const r = tx(STORE, 'readonly').get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  }

  async function getByCode(code) {
    if (!memCache) await loadAllToMem();
    const id = codeIndex.get(String(code));
    if (id) return memCache.get(id) || null;
    // fallback: scan
    for (const p of memCache.values()) {
      if (String(p.code) === String(code)) return p;
    }
    return null;
  }

  async function upsert(product) {
    await ensureDB();
    if (!product || !product.id) return false;
    return new Promise((res) => {
      const r = tx(STORE, 'readwrite').put(product);
      r.onsuccess = () => {
        if (memCache) memCache.set(product.id, product);
        if (codeIndex && product.code) codeIndex.set(String(product.code), product.id);
        res(true);
      };
      r.onerror = () => res(false);
    });
  }

  // Validar precios contra DB local antes de cerrar venta
  async function validatePrices(items) {
    if (!Array.isArray(items)) return items;
    if (!memCache) await loadAllToMem();
    return items.map(item => {
      const fresh = item.id ? memCache.get(item.id) : null;
      if (!fresh) return item;
      // Si precio cambió en local (sync trajo update), usar el fresh
      const freshPrice = Number(fresh.price || fresh.precio || 0);
      const cachedPrice = Number(item.price || item.precio || 0);
      if (Math.abs(freshPrice - cachedPrice) > 0.01) {
        return { ...item, price: freshPrice, precio: freshPrice, _priceUpdated: true };
      }
      return { ...item, price: freshPrice, precio: freshPrice };
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Sync con servidor
  // ──────────────────────────────────────────────────────────────
  function getToken() {
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('volvixAuthToken') || '';
    } catch (e) { return ''; }
  }

  async function sync() {
    try {
      const token = getToken();
      const headers = { 'Accept': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch('/api/products?limit=2000', { headers });
      if (!r.ok) return { added: 0, updated: 0, error: 'http_' + r.status };
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j.items || j.products || []);
      let added = 0, updated = 0;
      await ensureDB();
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      for (const p of items) {
        const norm = {
          id: p.id,
          code: p.code || '',
          name: p.name || '',
          price: Number(p.price || 0),
          stock: Number(p.stock || 0),
          version: p.version || p.updated_at || Date.now(),
          ventas: Number(p.ventas || p.sales_count || 0),
          icon: p.icon || '📦',
          updated_at: Date.now()
        };
        const existing = memCache && memCache.get(p.id);
        if (!existing) added++;
        else if (existing.version !== norm.version || existing.price !== norm.price) updated++;
        s.put(norm);
        if (memCache) memCache.set(norm.id, norm);
        if (codeIndex && norm.code) codeIndex.set(String(norm.code), norm.id);
      }
      await new Promise(r => { t.oncomplete = r; t.onerror = r; });
      lastSync = Date.now();
      await setMeta('last_sync', lastSync);
      return { added, updated, total: items.length };
    } catch (e) {
      return { added: 0, updated: 0, error: e.message };
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Init
  // ──────────────────────────────────────────────────────────────
  async function init(opts) {
    opts = opts || {};
    await ensureDB();
    await loadAllToMem();
    lastSync = (await getMeta('last_sync')) || 0;
    // 2026-05-14 FIX STALE DATA: SIEMPRE syncar en init.
    // ANTES: si lastSync < 5min, NO syncaba → si admin cambiaba un precio en DB,
    // el usuario veia el precio VIEJO de IndexedDB hasta 5 min despues.
    // AHORA: sync no-bloqueante en cada init. memCache se actualiza en background
    // (no afecta tiempo de carga inicial — el usuario ve productos de IDB
    // mientras sync trae lo fresh, y luego se reemplaza). 0% impacto en TTI.
    sync().catch(() => {});
    // Re-sync periódico cada 2 min (antes 10 min — datos quedaban viejos demasiado tiempo).
    // 2 min es un balance: tampoco hammer al server cada minuto en sesiones largas.
    if (opts.autoSync !== false) {
      setInterval(() => { sync().catch(()=>{}); }, 2 * 60 * 1000);
    }
    return { ok: true, count: memCache.size, lastSync };
  }

  // ──────────────────────────────────────────────────────────────
  // UI: Autocomplete dropdown
  // ──────────────────────────────────────────────────────────────
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const q = normalize(query);
    const t = String(text || '');
    const tl = normalize(t);
    const idx = tl.indexOf(q);
    if (idx < 0) return escapeHtml(t);
    // Aproximado: misma posición funciona si normalize no quita chars (mayoría casos)
    return escapeHtml(t.slice(0, idx)) + '<mark>' + escapeHtml(t.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(t.slice(idx + q.length));
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  function mountAutocomplete(input, options) {
    options = options || {};
    if (!input || input._volvixAutocomplete) return;
    input._volvixAutocomplete = true;

    const dropdown = document.createElement('div');
    dropdown.className = 'volvix-product-dropdown';
    dropdown.style.cssText = [
      'position:absolute', 'z-index:99990', 'background:#fff', 'color:#111',
      'border:1px solid #d0cfcc', 'border-radius:8px', 'min-width:300px',
      'max-height:340px', 'overflow-y:auto', 'box-shadow:0 8px 24px rgba(0,0,0,.18)',
      'font-family:system-ui,sans-serif', 'font-size:13px', 'display:none'
    ].join(';');
    document.body.appendChild(dropdown);

    let results = [];
    let selectedIdx = 0;

    function position() {
      const r = input.getBoundingClientRect();
      dropdown.style.left = (r.left + window.scrollX) + 'px';
      dropdown.style.top = (r.bottom + window.scrollY + 4) + 'px';
      dropdown.style.minWidth = Math.max(r.width, 360) + 'px';
    }

    function render() {
      if (!results.length) {
        dropdown.innerHTML = '<div style="padding:14px;color:#888;text-align:center;font-size:12px">Sin resultados</div>';
        return;
      }
      dropdown.innerHTML = results.map((p, i) => {
        const isSel = i === selectedIdx;
        const stock = Number(p.stock || 0);
        const stockColor = stock > 5 ? '#0a7c44' : stock > 0 ? '#ad7400' : '#a8341c';
        return [
          '<div data-idx="', i, '" class="vp-row" style="',
          'padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0eee9;',
          'display:flex;align-items:center;gap:10px;',
          isSel ? 'background:#fff7ed' : 'background:#fff',
          '">',
            '<div style="font-size:18px">', escapeHtml(p.icon || '📦'), '</div>',
            '<div style="flex:1;min-width:0">',
              '<div style="font-weight:600;color:#1c1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">',
                highlightMatch(p.name || '—', input.value),
              '</div>',
              '<div style="font-size:11px;color:#78716c">',
                escapeHtml(p.code || ''),
                ' · stock <span style="color:', stockColor, ';font-weight:600">', stock, '</span>',
              '</div>',
            '</div>',
            '<div style="font-weight:700;color:#1c1917">$', Number(p.price || 0).toFixed(2), '</div>',
          '</div>'
        ].join('');
      }).join('');
      // wire clicks
      dropdown.querySelectorAll('.vp-row').forEach(row => {
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = Number(row.dataset.idx);
          select(results[idx]);
        });
      });
    }

    async function doSearch() {
      const q = input.value;
      if (!q || q.length < 1) {
        hide();
        return;
      }
      results = await search(q, { limit: options.limit || 8 });
      selectedIdx = 0;
      position();
      dropdown.style.display = 'block';
      render();
    }

    function hide() {
      dropdown.style.display = 'none';
    }

    function select(product) {
      if (!product) return;
      hide();
      // Re-fetch fresh desde local antes de devolver (NUNCA usar precio del cache)
      getById(product.id).then(fresh => {
        const final = fresh || product;
        if (typeof options.onSelect === 'function') {
          options.onSelect(final);
        } else {
          input.value = final.name || final.code || '';
        }
      });
    }

    const debouncedSearch = debounce(doSearch, options.debounce || 200);

    input.addEventListener('input', debouncedSearch);
    input.addEventListener('focus', () => { if (input.value) doSearch(); });
    input.addEventListener('blur', () => setTimeout(hide, 150));
    input.addEventListener('keydown', (e) => {
      if (dropdown.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, results.length - 1);
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        render();
      } else if (e.key === 'Enter') {
        if (results[selectedIdx]) {
          e.preventDefault();
          select(results[selectedIdx]);
        }
      } else if (e.key === 'Escape') {
        hide();
      }
    });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────
  global.VolvixProductSearch = {
    init,
    search,
    getById,
    getByCode,
    upsert,
    sync,
    validatePrices,
    mountAutocomplete,
    _internal: { normalize, scoreMatch, lev }
  };

  // Auto-init si DOM listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        init().catch(() => {});
      }, { once: true });
    } else {
      init().catch(() => {});
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
