/* ============================================================
   VOLVIX · WIRING LAYER
   ============================================================
   Conecta TODOS los botones del POS a la base de datos.
   Carga productos reales desde /api/products
   Guarda ventas, clientes, cortes en la base de datos.
   Funciona offline-first (localStorage) con sync al servidor.

   Se carga DESPUÉS del salvadorex-pos.html
============================================================ */
(function() {
  'use strict';

  const API_BASE = location.origin;
  const STORAGE_KEY = 'volvix:wiring:cache';
  const QUEUE_KEY = 'volvix:wiring:queue';

  console.log('%c[VOLVIX-WIRING]', 'background:#3B82F6;color:#fff;padding:2px 6px;border-radius:3px', 'Cableado activo - conectando al servidor');

  // =============================================================
  // STATE
  // =============================================================
  let session = null;
  let isOnline = navigator.onLine;
  let syncTimer = null;

  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
    } catch { session = null; }
    return session;
  }

  // =============================================================
  // API CLIENT
  // =============================================================
  // B41 fix: include Bearer token so queued offline sales actually authenticate
  // when synced. Previously the queue would silently 401 forever.
  function _getAuthToken() {
    try {
      // Preferred: VolvixAuth helper from auth-helper.js
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        const t = window.VolvixAuth.getToken();
        if (t) return t;
      }
      // Volvix.auth path
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getToken === 'function') {
        const t = window.Volvix.auth.getToken();
        if (t) return t;
      }
    } catch (_) {}
    return localStorage.getItem('volvix_token')
        || localStorage.getItem('volvixAuthToken')
        || localStorage.getItem('token')
        || '';
  }

  async function api(path, opts = {}) {
    const url = API_BASE + path;
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    };
    const tok = _getAuthToken();
    if (tok && !headers.Authorization && !headers.authorization) {
      headers.Authorization = 'Bearer ' + tok;
    }
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  // =============================================================
  // OFFLINE QUEUE
  // =============================================================
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function enqueue(item) {
    const q = loadQueue();
    q.push({ ...item, queued_at: Date.now() });
    saveQueue(q);
    console.log('%c[QUEUE]', 'background:#F59E0B;color:#fff;padding:2px 6px;border-radius:3px', `Pendiente sincronizar: ${item.type}`);
  }

  async function processQueue() {
    if (!isOnline) return;
    const q = loadQueue();
    if (q.length === 0) return;

    console.log('%c[SYNC]', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px', `Procesando ${q.length} items pendientes...`);

    const remaining = [];
    for (const item of q) {
      try {
        await api(item.endpoint, {
          method: item.method || 'POST',
          body: JSON.stringify(item.data)
        });
        console.log('  ✓ Sincronizado:', item.type);
      } catch (err) {
        console.warn('  ✗ Falló (reintentar):', item.type, err.message);
        remaining.push(item);
      }
    }
    saveQueue(remaining);
  }

  // =============================================================
  // CACHE LOCAL
  // =============================================================
  function loadCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveCache(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // =============================================================
  // PRODUCT LOADER (Desde la base de datos)
  // =============================================================
  async function loadProducts() {
    loadSession();
    const tenantId = session?.tenant_id || 'TNT001';

    try {
      const products = await api(`/api/products?tenant_id=${encodeURIComponent(tenantId)}`);
      const cache = loadCache();
      cache.products = products;
      cache.products_synced_at = Date.now();
      saveCache(cache);

      // Reemplazar CATALOG global con datos del servidor
      if (typeof window.CATALOG !== 'undefined') {
        window.CATALOG.length = 0;
        products.forEach(p => {
          window.CATALOG.push({
            code: p.code,
            name: p.name,
            price: p.price,
            cost: p.cost || 0,
            stock: p.stock || 0,
            id: p.id
          });
        });
        console.log(`%c[CATALOG]`, 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px', `${products.length} productos cargados desde la base de datos`);
      }
      return products;
    } catch (err) {
      console.warn('[CATALOG] No se pudo cargar desde servidor, usando cache local');
      const cache = loadCache();
      return cache.products || [];
    }
  }

  // =============================================================
  // SALES (Guardar venta)
  // =============================================================
  async function saveSale(saleData) {
    loadSession();
    const sale = {
      tenant_id: session?.tenant_id || 'TNT001',
      user_id: session?.user_id || 'USR001',
      cashier_email: session?.email || 'unknown',
      ...saleData,
    };

    if (isOnline) {
      try {
        const result = await api('/api/sales', {
          method: 'POST',
          body: JSON.stringify(sale)
        });
        console.log('%c[SALE SAVED]', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px', `Venta ${result.id} guardada en DB`);
        return result;
      } catch (err) {
        // Falló, guardar en queue
        enqueue({ type: 'sale', endpoint: '/api/sales', method: 'POST', data: sale });
        return { ...sale, id: 'LOCAL-' + Date.now(), pending: true };
      }
    } else {
      enqueue({ type: 'sale', endpoint: '/api/sales', method: 'POST', data: sale });
      return { ...sale, id: 'LOCAL-' + Date.now(), pending: true };
    }
  }

  // =============================================================
  // CUSTOMERS
  // =============================================================
  async function saveCustomer(customerData) {
    loadSession();
    const customer = {
      tenant_id: session?.tenant_id || 'TNT001',
      ...customerData,
    };

    if (isOnline) {
      try {
        const result = await api('/api/customers', {
          method: 'POST',
          body: JSON.stringify(customer)
        });
        console.log('[CUSTOMER]', 'Cliente guardado:', result.id);
        return result;
      } catch (err) {
        enqueue({ type: 'customer', endpoint: '/api/customers', method: 'POST', data: customer });
        return customer;
      }
    } else {
      enqueue({ type: 'customer', endpoint: '/api/customers', method: 'POST', data: customer });
      return customer;
    }
  }

  // =============================================================
  // PRODUCTS CRUD
  // =============================================================
  async function saveProduct(productData) {
    loadSession();
    const product = {
      tenant_id: session?.tenant_id || 'TNT001',
      ...productData,
    };

    if (isOnline) {
      try {
        const result = await api('/api/products', {
          method: 'POST',
          body: JSON.stringify(product)
        });
        console.log('[PRODUCT]', 'Producto guardado:', result.id);
        // Refresh catalog
        await loadProducts();
        return result;
      } catch (err) {
        enqueue({ type: 'product', endpoint: '/api/products', method: 'POST', data: product });
        return product;
      }
    } else {
      enqueue({ type: 'product', endpoint: '/api/products', method: 'POST', data: product });
      return product;
    }
  }

  // =============================================================
  // INTERCEPT POS FUNCTIONS
  // =============================================================
  function interceptPosFunctions() {
    // Wait for POS functions to be defined
    const tryIntercept = () => {
      // Override "Cobrar" / Checkout function
      if (typeof window.completeSale === 'function' && !window._volvixWired_completeSale) {
        const original = window.completeSale;
        window.completeSale = async function(...args) {
          const cart = window.CART || [];
          const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

          // Save to database
          const saved = await saveSale({
            items: cart.map(i => ({
              product_id: i.id,
              code: i.code,
              name: i.name,
              price: i.price,
              qty: i.qty,
              subtotal: i.price * i.qty
            })),
            total: total,
            payment_method: args[0] || 'efectivo',
            ticket_number: 'TKT-' + Date.now()
          });

          // Call original to maintain UI behavior
          const result = original.apply(this, args);

          if (typeof window.showToast === 'function') {
            window.showToast(`✓ Venta guardada en DB: ${saved.id}`);
          }
          return result;
        };
        window._volvixWired_completeSale = true;
        console.log('  ✓ completeSale wired');
      }

      // Refresh catalog every 60s when online
      if (!window._volvixSyncStarted) {
        window._volvixSyncStarted = true;
        setInterval(() => {
          if (isOnline) {
            processQueue();
          }
        }, 30000);
      }
    };

    // Try immediately and on DOM events
    tryIntercept();
    setTimeout(tryIntercept, 1000);
    setTimeout(tryIntercept, 3000);
  }

  // =============================================================
  // CONNECTION MONITORING
  // =============================================================
  window.addEventListener('online', () => {
    isOnline = true;
    console.log('%c[ONLINE]', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px', 'Conexión restaurada');
    processQueue();
    loadProducts();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    console.log('%c[OFFLINE]', 'background:#EF4444;color:#fff;padding:2px 6px;border-radius:3px', 'Sin conexión - operando con cache');
  });

  // =============================================================
  // EXPOSE GLOBAL API
  // =============================================================
  window.VolvixDB = {
    loadProducts,
    saveSale,
    saveCustomer,
    saveProduct,
    processQueue,
    getQueue: loadQueue,
    getSession: loadSession,
    getCache: loadCache,
    isOnline: () => isOnline,
    api,
  };

  // =============================================================
  // AUTO-INIT
  // =============================================================
  function init() {
    loadSession();
    if (!session) {
      console.log('[VOLVIX-WIRING] No hay sesión activa');
      return;
    }

    console.log(`[VOLVIX-WIRING] Sesión activa: ${session.email} (${session.role})`);

    // Load products from DB
    loadProducts().then(() => {
      // Re-render catalog if function exists
      if (typeof window.renderProducts === 'function') {
        window.renderProducts();
      }
    });

    // Process pending queue
    if (isOnline) {
      processQueue();
    }

    // Intercept POS functions
    interceptPosFunctions();
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init after login
  document.addEventListener('volvix:login', init);

})();
