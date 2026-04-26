/* ============================================================
   Volvix POS — Service Worker
   Agent-12 / Ronda 6 Fibonacci
   Estrategias:
     - Static: cache-first con fallback a red
     - API:    network-first con fallback a cache (stale-while-revalidate)
     - Offline: página fallback
     - Background Sync: cola de operaciones offline
   ============================================================ */

const VERSION   = 'v1.0.0';
const CACHE     = `volvix-${VERSION}`;
const API_CACHE = `volvix-api-${VERSION}`;
const RT_CACHE  = `volvix-rt-${VERSION}`;

const STATIC_FILES = [
  '/',
  '/login.html',
  '/salvadorex_web_v25.html',
  '/volvix_owner_panel_v7.html',
  '/multipos_suite_v3.html',
  '/marketplace.html',
  '/landing_dynamic.html',
  '/etiqueta_designer.html',
  '/auth-gate.js',
  '/volvix-wiring.js',
  '/volvix-offline-wiring.js',
  '/giros_catalog_v2.js'
];

const ALL_CACHES = [CACHE, API_CACHE, RT_CACHE];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  console.log(`[SW ${VERSION}] install`);
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // addAll falla si UNO falla; lo hacemos tolerante
      return Promise.all(
        STATIC_FILES.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] no pude cachear ${url}:`, err.message)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  console.log(`[SW ${VERSION}] activate`);
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => {
              console.log('[SW] borrando cache vieja:', k);
              return caches.delete(k);
            })
        )
      ),
      self.clients.claim()
    ])
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignorar extensiones de Chrome y schemes raros
  if (!url.protocol.startsWith('http')) return;

  // API: network-first con stale-while-revalidate
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // HTML: network-first (para ver updates)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(htmlStrategy(req));
    return;
  }

  // Estáticos: cache-first
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Refresh en background
    fetch(req).then((res) => {
      if (res && res.ok) {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone));
    }
    return res;
  } catch (e) {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(API_CACHE).then((c) => c.put(req, clone));
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) {
      console.log('[SW] API offline, sirviendo cache:', req.url);
      return cached;
    }
    return new Response(
      JSON.stringify({ ok: false, offline: true, error: 'sin conexion' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function htmlStrategy(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone));
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fallback = await caches.match('/login.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

/* ---------- BACKGROUND SYNC ---------- */
self.addEventListener('sync', (event) => {
  console.log('[SW] sync event:', event.tag);
  if (event.tag === 'volvix-sync' || event.tag === 'volvix-queue') {
    event.waitUntil(processSyncQueue());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'volvix-periodic') {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  console.log('[SW] procesando cola offline...');
  const db = await openDB();
  if (!db) return;

  const tx = db.transaction(['queue'], 'readwrite');
  const store = tx.objectStore('queue');
  const all = await idbGetAll(store);

  let ok = 0, fail = 0;
  for (const item of all) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(item.headers || {}) },
        body: item.data ? JSON.stringify(item.data) : undefined
      });
      if (res.ok) {
        const delTx = db.transaction(['queue'], 'readwrite');
        delTx.objectStore('queue').delete(item.id);
        ok++;
      } else {
        fail++;
      }
    } catch (e) {
      fail++;
    }
  }

  console.log(`[SW] sync: ${ok} ok, ${fail} fail`);

  // Notificar a clientes
  const clients = await self.clients.matchAll();
  clients.forEach((c) =>
    c.postMessage({ type: 'sync-complete', ok, fail })
  );
}

function openDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open('volvix-db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache'))
        db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function idbGetAll(store) {
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/* ---------- MESSAGE (auto-update) ---------- */
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: VERSION });
  }
  if (type === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    );
  }
  if (type === 'TRIGGER_SYNC') {
    processSyncQueue();
  }
});

/* ---------- PUSH (placeholder) ---------- */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Volvix', body: 'Notificacion' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Volvix POS', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag || 'volvix-notif'
    })
  );
});

console.log(`[SW ${VERSION}] cargado`);
