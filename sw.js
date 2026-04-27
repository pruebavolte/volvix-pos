/* ============================================================
   Volvix POS — Service Worker
   Agent-12 / Ronda 6 Fibonacci
   Estrategias:
     - Static: cache-first con fallback a red
     - API:    network-first con fallback a cache (stale-while-revalidate)
     - Offline: página fallback
     - Background Sync: cola de operaciones offline
   ============================================================ */

// TODO(build-step): cuando se agregue build pipeline (esbuild/vite),
// reemplazar VERSION manual por hash generado del contenido de STATIC_FILES.
// Ej: const VERSION = '__BUILD_HASH__'; sustituido en build.
// Mientras tanto: bumpear VERSION manualmente en cada deploy con cambios.
const VERSION   = 'v1.2.0';
const CACHE     = `volvix-${VERSION}`;
const API_CACHE = `volvix-api-${VERSION}`;
const RT_CACHE  = `volvix-rt-${VERSION}`;

const STATIC_FILES = [
  // HTML principales
  '/',
  '/login.html',
  '/salvadorex_web_v25.html',
  '/volvix_owner_panel_v7.html',
  '/multipos_suite_v3.html',
  '/marketplace.html',
  '/landing_dynamic.html',
  '/etiqueta_designer.html',
  // CSS compartido
  '/volvix-shared.css',
  // Core / auth / catalogos
  '/auth-gate.js',
  '/giros_catalog_v2.js',
  '/volvix-api.js',
  '/volvix-sync.js',
  '/volvix-sync-widget.js',
  '/volvix-master-controller.js',
  // Wirings principales por panel
  '/volvix-wiring.js',
  '/volvix-pos-wiring.js',
  '/volvix-pos-extra-wiring.js',
  '/volvix-owner-wiring.js',
  '/volvix-owner-extra-wiring.js',
  '/volvix-multipos-wiring.js',
  '/volvix-multipos-extra-wiring.js',
  // Wirings transversales criticos (top 50)
  '/volvix-offline-wiring.js',
  '/volvix-offline-queue.js',
  '/volvix-pwa-wiring.js',
  '/volvix-pwa-install-prompt.js',
  '/volvix-i18n-wiring.js',
  '/volvix-theme-wiring.js',
  '/volvix-notifications-wiring.js',
  '/volvix-push-wiring.js',
  '/volvix-logger-wiring.js',
  '/volvix-reports-wiring.js',
  '/volvix-charts-wiring.js',
  '/volvix-backup-wiring.js',
  '/volvix-tests-wiring.js',
  '/volvix-onboarding-wiring.js',
  '/volvix-shortcuts-wiring.js',
  '/volvix-search-wiring.js',
  '/volvix-voice-wiring.js',
  '/volvix-gamification-wiring.js',
  '/volvix-perf-wiring.js',
  '/volvix-perf-monitor.js',
  '/volvix-email-wiring.js',
  '/volvix-webrtc-wiring.js',
  '/volvix-ai-real-wiring.js',
  '/volvix-ai-wiring.js',
  '/volvix-payments-wiring.js',
  '/volvix-calendar-wiring.js',
  '/volvix-cache-wiring.js',
  '/volvix-audit-wiring.js',
  '/volvix-a11y-wiring.js',
  '/volvix-categories-wiring.js',
  '/volvix-coupons-wiring.js',
  '/volvix-crm-wiring.js',
  '/volvix-currency-wiring.js',
  '/volvix-cashdrawer-wiring.js',
  '/volvix-barcode-wiring.js',
  '/volvix-bi-wiring.js',
  '/volvix-compliance-wiring.js',
  '/volvix-feedback-wiring.js',
  '/volvix-delivery-wiring.js',
  '/volvix-drinks-wiring.js',
  '/volvix-extras-wiring.js',
  '/volvix-cron-wiring.js',
  '/volvix-anomaly-wiring.js'
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

/* ---------- PUSH (R14 Web Push + VAPID) ---------- */
self.addEventListener('push', (event) => {
  let data = { title: 'Volvix POS', body: '' };
  if (event.data) {
    try { data = event.data.json(); }
    catch (_) {
      try { data = { title: 'Volvix POS', body: event.data.text() }; }
      catch (__) {}
    }
  }
  const title = data.title || 'Volvix POS';
  const opts = {
    body:  data.body  || '',
    icon:  data.icon  || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag:   data.tag   || 'volvix-notif',
    data:  { url: data.url || '/' },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

console.log(`[SW ${VERSION}] cargado`);
