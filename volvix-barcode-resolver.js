/**
 * volvix-barcode-resolver.js — B19
 * Resolución de códigos de barras en cascada:
 *   1. localSearch  → IndexedDB (instantáneo)
 *   2. centralSearch → /api/products?code=XXX (BD central)
 *   3. externalSearch → OpenFoodFacts + UPCitemDB (en paralelo, timeout 1.5s c/u)
 *
 * Si se encuentra en API pública: NUNCA usa precio externo, abre modal para captura.
 *
 * API pública en window.VolvixBarcodeResolver:
 *   - resolve(barcode): Promise<{found, source, product}>
 *   - registerSource(name, fn): agregar APIs adicionales en runtime
 */
(function (global) {
  'use strict';

  const SRC = {
    LOCAL: 'local',
    CENTRAL: 'central',
    OPEN_FOOD_FACTS: 'openfoodfacts',
    UPCITEMDB: 'upcitemdb',
    EAN_SEARCH: 'ean_search',
  };

  const TIMEOUT_MS = 1500;
  const externalSources = [];   // [{name, fn(barcode)→Promise<{nombre,marca,imagen,codigo_barras}>}]
  const externalCache = new Map();  // code → result (TTL 24h)

  // ──────────────────────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────────────────────
  function isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
  }

  function getToken() {
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('volvixAuthToken') || '';
    } catch (e) { return ''; }
  }

  function normalizeBarcode(b) {
    return String(b || '').replace(/\D/g, '');
  }

  function normalizeProduct(raw, source, code) {
    if (!raw) return null;
    return {
      nombre: raw.nombre || raw.name || raw.product_name || raw.title || '',
      marca: raw.marca || raw.brand || raw.brands || '',
      imagen: raw.imagen || raw.image || raw.image_url || raw.images?.[0] || '',
      codigo_barras: code,
      _source: source,
      _fetched_at: Date.now()
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Source: OpenFoodFacts
  // ──────────────────────────────────────────────────────────────
  async function fetchOpenFoodFacts(barcode) {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const r = await withTimeout(fetch(url, { headers: { 'Accept': 'application/json' }}), TIMEOUT_MS);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    return normalizeProduct({
      nombre: p.product_name || p.product_name_es || p.product_name_en,
      marca: p.brands,
      imagen: p.image_url || p.image_front_url
    }, SRC.OPEN_FOOD_FACTS, barcode);
  }

  // ──────────────────────────────────────────────────────────────
  // Source: UPCitemDB (sin key — endpoint trial)
  // ──────────────────────────────────────────────────────────────
  async function fetchUPCitemDB(barcode) {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`;
    const r = await withTimeout(fetch(url, { headers: { 'Accept': 'application/json' }}), TIMEOUT_MS);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.items || !j.items.length) return null;
    const p = j.items[0];
    return normalizeProduct({
      nombre: p.title,
      marca: p.brand,
      imagen: p.images && p.images[0]
    }, SRC.UPCITEMDB, barcode);
  }

  // ──────────────────────────────────────────────────────────────
  // Source: backend proxy /api/products/external-lookup (CORS-safe)
  // ──────────────────────────────────────────────────────────────
  async function fetchViaProxy(barcode) {
    try {
      const r = await withTimeout(
        fetch(`/api/products/external-lookup?barcode=${encodeURIComponent(barcode)}`, {
          headers: getToken() ? { 'Authorization': 'Bearer ' + getToken() } : {}
        }),
        2500 // proxy es más confiable que externos directos
      );
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok || !j.product) return null;
      return normalizeProduct(j.product, j.product._source || 'proxy', barcode);
    } catch (e) {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Cascade
  // ──────────────────────────────────────────────────────────────
  async function localSearch(barcode) {
    if (!global.VolvixProductSearch) return null;
    try {
      const p = await global.VolvixProductSearch.getByCode(barcode);
      return p || null;
    } catch (e) { return null; }
  }

  async function centralSearch(barcode) {
    try {
      const tk = getToken();
      const headers = tk ? { 'Authorization': 'Bearer ' + tk } : {};
      const r = await withTimeout(
        fetch(`/api/products?code=${encodeURIComponent(barcode)}&limit=1`, { headers }),
        TIMEOUT_MS
      );
      if (!r.ok) return null;
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j.items || j.products || []);
      const exact = items.find(p => String(p.code) === String(barcode));
      return exact || items[0] || null;
    } catch (e) { return null; }
  }

  async function externalSearch(barcode) {
    if (!isOnline()) return null;
    // cache 24h
    const cached = externalCache.get(barcode);
    if (cached && (Date.now() - cached._cachedAt) < 24*60*60*1000) {
      return cached;
    }

    // 1. Intentar via proxy backend (más rápido, sin CORS)
    const viaProxy = await fetchViaProxy(barcode).catch(() => null);
    if (viaProxy && viaProxy.nombre) {
      viaProxy._cachedAt = Date.now();
      externalCache.set(barcode, viaProxy);
      return viaProxy;
    }

    // 2. Fallback: invocar APIs externas directamente (puede fallar por CORS)
    const sources = [
      { name: SRC.OPEN_FOOD_FACTS, fn: fetchOpenFoodFacts },
      { name: SRC.UPCITEMDB, fn: fetchUPCitemDB },
      ...externalSources
    ];
    const results = await Promise.allSettled(
      sources.map(s => s.fn(barcode).catch(() => null))
    );
    const found = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(p => p && p.nombre);
    if (!found.length) return null;
    // Priorizar: nombre válido + imagen + marca
    found.sort((a, b) => {
      const sa = (a.nombre ? 3 : 0) + (a.imagen ? 2 : 0) + (a.marca ? 1 : 0);
      const sb = (b.nombre ? 3 : 0) + (b.imagen ? 2 : 0) + (b.marca ? 1 : 0);
      return sb - sa;
    });
    const best = found[0];
    best._cachedAt = Date.now();
    externalCache.set(barcode, best);
    return best;
  }

  // ──────────────────────────────────────────────────────────────
  // Modal de captura de precio
  // ──────────────────────────────────────────────────────────────
  function showCaptureModal(externalProduct, onSave) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = [
        'position:fixed','inset:0','background:rgba(0,0,0,0.6)','z-index:99999',
        'display:flex','align-items:center','justify-content:center',
        'font-family:system-ui,sans-serif'
      ].join(';');
      modal.innerHTML = `
        <div style="background:#fff;color:#1c1917;padding:28px;border-radius:14px;max-width:480px;width:92%;box-shadow:0 30px 80px rgba(0,0,0,.4)">
          <h2 style="font-size:18px;margin:0 0 6px">Producto encontrado</h2>
          <p style="color:#78716c;font-size:12px;margin:0 0 18px">
            Origen: <b>${escapeHtml(externalProduct._source || 'externo')}</b> · Código: <code>${escapeHtml(externalProduct.codigo_barras)}</code>
          </p>
          ${externalProduct.imagen ? `<img src="${escapeHtml(externalProduct.imagen)}" style="max-width:120px;max-height:120px;border-radius:8px;margin-bottom:14px" onerror="this.style.display='none'">` : ''}
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:11px;color:#57534e;margin-bottom:4px;text-transform:uppercase">Nombre</label>
            <input id="vbr-nombre" type="text" value="${escapeHtml(externalProduct.nombre || '')}"
              style="width:100%;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px">
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:11px;color:#57534e;margin-bottom:4px;text-transform:uppercase">Marca</label>
            <input id="vbr-marca" type="text" value="${escapeHtml(externalProduct.marca || '')}"
              style="width:100%;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
            <div>
              <label style="display:block;font-size:11px;color:#57534e;margin-bottom:4px;text-transform:uppercase">Precio venta *</label>
              <input id="vbr-precio" type="number" step="0.01" min="0" autofocus required
                style="width:100%;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px;font-weight:700">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:#57534e;margin-bottom:4px;text-transform:uppercase">Costo (opcional)</label>
              <input id="vbr-costo" type="number" step="0.01" min="0"
                style="width:100%;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px">
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="vbr-cancel" style="padding:10px 18px;border:1px solid #d6d3d1;background:#fff;color:#57534e;border-radius:8px;cursor:pointer;font-weight:600">Cancelar</button>
            <button id="vbr-save" style="padding:10px 18px;border:0;background:#ea580c;color:#fff;border-radius:8px;cursor:pointer;font-weight:700">Guardar producto</button>
          </div>
          <p style="font-size:10px;color:#a8a29e;margin:14px 0 0;text-align:center">
            ⚠ Volvix nunca usa precio de APIs públicas — debes capturarlo manualmente
          </p>
        </div>
      `;
      document.body.appendChild(modal);
      setTimeout(() => modal.querySelector('#vbr-precio').focus(), 100);

      const cleanup = () => modal.remove();
      modal.querySelector('#vbr-cancel').onclick = () => { cleanup(); resolve(null); };
      modal.querySelector('#vbr-save').onclick = async () => {
        const nombre = modal.querySelector('#vbr-nombre').value.trim();
        const marca = modal.querySelector('#vbr-marca').value.trim();
        const precio = parseFloat(modal.querySelector('#vbr-precio').value);
        const costo = parseFloat(modal.querySelector('#vbr-costo').value) || 0;
        if (!nombre) { alert('Nombre es obligatorio'); return; }
        if (!precio || precio <= 0) { alert('Precio venta es obligatorio (> 0)'); return; }
        const newProduct = {
          name: nombre,
          brand: marca,
          code: externalProduct.codigo_barras,
          price: precio,
          cost: costo,
          stock: 0,
          icon: '🆕',
          source: 'publico',
          external_image: externalProduct.imagen || null,
          version: Date.now()
        };
        cleanup();
        if (typeof onSave === 'function') {
          try {
            const saved = await onSave(newProduct);
            resolve(saved || newProduct);
          } catch (e) {
            resolve(newProduct);
          }
        } else {
          resolve(newProduct);
        }
      };
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ──────────────────────────────────────────────────────────────
  // Persist en BD local + central
  // ──────────────────────────────────────────────────────────────
  async function saveProductBoth(productData) {
    // 1. Local IndexedDB
    if (global.VolvixProductSearch) {
      const localProduct = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
        ...productData,
        _localOnly: true
      };
      await global.VolvixProductSearch.upsert(localProduct);
    }
    // 2. Central via API (si hay token)
    const tk = getToken();
    if (tk) {
      try {
        const r = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json' },
          body: JSON.stringify(productData)
        });
        if (r.ok) {
          const saved = await r.json();
          // Update local con el ID real del servidor
          if (saved && saved.id && global.VolvixProductSearch) {
            await global.VolvixProductSearch.upsert({ ...productData, id: saved.id, _localOnly: false });
            return saved;
          }
        }
      } catch (e) { /* sin conexión, queda solo local */ }
    }
    return productData;
  }

  // ──────────────────────────────────────────────────────────────
  // Main: resolve(barcode)
  // ──────────────────────────────────────────────────────────────
  async function resolve(barcodeRaw) {
    const barcode = normalizeBarcode(barcodeRaw);
    if (!barcode || barcode.length < 4) {
      return { found: false, source: null, product: null, error: 'invalid_barcode' };
    }

    // 1. local
    let p = await localSearch(barcode);
    if (p) return { found: true, source: SRC.LOCAL, product: p };

    // 2. central
    p = await centralSearch(barcode);
    if (p) {
      // Persistir en local para próxima búsqueda offline
      if (global.VolvixProductSearch) {
        global.VolvixProductSearch.upsert(p).catch(() => {});
      }
      return { found: true, source: SRC.CENTRAL, product: p };
    }

    // 3. APIs externas
    if (!isOnline()) {
      return { found: false, source: null, product: null, error: 'offline_no_match' };
    }
    const ext = await externalSearch(barcode);
    if (ext) {
      // Devolver con flag needsPriceCapture para que UI abra modal
      return { found: true, source: ext._source, product: ext, needsPriceCapture: true };
    }

    return { found: false, source: null, product: null, error: 'not_found' };
  }

  // Helper para flujo POS típico: scan → resolve → si externo, modal → save
  async function scan(barcodeRaw) {
    const result = await resolve(barcodeRaw);
    if (!result.found) return result;
    if (result.needsPriceCapture) {
      const newProduct = await showCaptureModal(result.product, saveProductBoth);
      if (newProduct) {
        return { found: true, source: 'external_captured', product: newProduct };
      }
      return { found: false, source: null, product: null, error: 'user_cancelled' };
    }
    return result;
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────
  global.VolvixBarcodeResolver = {
    resolve,
    scan,
    showCaptureModal,
    registerSource(name, fn) {
      externalSources.push({ name, fn });
    },
    _cache: externalCache,
    SRC
  };

})(typeof window !== 'undefined' ? window : globalThis);
