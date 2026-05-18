/* ============================================================
   VOLVIX · Service Worker (R14 — Offline-first robusto)
   ============================================================
   Estrategias:
   - HTML/CSS/JS estáticos    → Cache First + revalidate
   - Páginas HTML del POS     → Network First con fallback cache
   - GET /api/*               → Network First con fallback cache
   - POST/PATCH/DELETE /api/* → Network Only + queue offline en IndexedDB
   - Background Sync          → reintenta mutations cuando vuelve la red
   - Google Fonts / CDN       → Cache First
   - Fallback final           → /offline.html

   Versioning: cambia CACHE_VERSION para forzar refresh global.
============================================================ */

const CACHE_VERSION  = 'volvix-v8.1.0';
const CACHE_STATIC   = CACHE_VERSION + '-static';
const CACHE_PAGES    = CACHE_VERSION + '-pages';
const CACHE_API      = CACHE_VERSION + '-api';
const CACHE_FONTS    = CACHE_VERSION + '-fonts';

const PRECACHE_ASSETS = [
  '/',
  '/pos.html',
  '/login.html',
  '/offline.html',
  '/volvix-tokens.css',
  '/volvix-api.js',
  '/volvix-sync.js',
  '/volvix-sync-widget.js',
  '/volvix-pwa-prompt.js',
  '/auth-gate.js',
  '/config.js',
  '/manifest.json',
];

const PAGE_ROUTES = [
  '/pos.html', '/login.html', '/pos-inventario.html', '/pos-corte.html',
  '/pos-clientes.html', '/pos-reportes.html', '/pos-config.html',
  '/volvix_owner_panel_v7.html', '/owner.html', '/ai.html',
  '/inventario.html', '/soporte.html',
];

const STATIC_EXTENSIONS = [
  '.css', '.js', '.woff', '.woff2', '.ttf', '.otf',
  '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.json',
];

const NETWORK_TIMEOUT_MS = 4000;
const API_CACHE_MAX_AGE  = 5 * 60 * 1000; // 5 min

// ============================================================
// IndexedDB · Volvix.offlineQueue
// ============================================================
const DB_NAME    = 'Volvix';
const DB_VERSION = 1;
const STORE_NAME = 'offlineQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('endpoint',  'endpoint',  { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function queueAdd(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const r  = tx.objectStore(STORE_NAME).add(entry);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

async function queueAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const r  = tx.objectStore(STORE_NAME).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}

async function queueDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const r  = tx.objectStore(STORE_NAME).delete(id);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(
        PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' }))
      ).catch(err => console.warn('[SW] precache parcial:', err.message)))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => {
        const valid = [CACHE_STATIC, CACHE_PAGES, CACHE_API, CACHE_FONTS];
        return Promise.all(
          names.filter(n => !valid.includes(n))
               .map(n => caches.delete(n))
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        // Reintentar queue pendiente al activar
        if ('sync' in self.registration) {
          self.registration.sync.register('volvix-flush-queue').catch(() => {});
        } else {
          flushQueue();
        }
      })
  );
});

// ============================================================
// FETCH
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const isSameOrigin  = url.origin === self.location.origin;
  const isGoogleFonts = url.hostname.includes('fonts.googleapis.com') ||
                        url.hostname.includes('fonts.gstatic.com');
  const isCDN         = url.hostname.includes('cdn.jsdelivr.net');

  // Mutations a /api/* → Network only + queue offline
  if (isSameOrigin && url.pathname.startsWith('/api/') && request.method !== 'GET') {
    event.respondWith(networkOnlyWithQueue(request));
    return;
  }

  if (request.method !== 'GET') return;
  if (!isSameOrigin && !isGoogleFonts && !isCDN) return;

  // GET /api/* → Network First con fallback cache
  if (isSameOrigin && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  if (isGoogleFonts || isCDN) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  const ext = '.' + (url.pathname.split('.').pop() || '').toLowerCase();
  if (STATIC_EXTENSIONS.includes(ext)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  const isPage = PAGE_ROUTES.some(r => url.pathname === r || url.pathname === r + '/')
              || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isPage) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isSameOrigin) event.respondWith(networkFirstPage(request));
});

// ============================================================
// ESTRATEGIAS
// ============================================================
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // revalidate background
    fetch(request).then(r => {
      if (r && r.ok) caches.open(cacheName).then(c => c.put(request, r.clone()).catch(() => {}));
    }).catch(() => {});
    return cached;
  }
  try {
    const r = await fetch(request);
    if (r.ok) {
      const c = await caches.open(cacheName);
      c.put(request, r.clone()).catch(() => {});
    }
    return r;
  } catch {
    return offlineFallback(request);
  }
}

async function networkFirstPage(request) {
  try {
    const r = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (r.ok) {
      const c = await caches.open(CACHE_PAGES);
      c.put(request, r.clone()).catch(() => {});
    }
    return r;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/pos.html');
    if (fallback) return fallback;
    return offlineFallback(request);
  }
}

async function networkFirstAPI(request) {
  try {
    const r = await Promise.race([
      fetch(request.clone()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (r.ok) {
      const c = await caches.open(CACHE_API);
      const stamped = new Response(r.clone().body, {
        status: r.status,
        statusText: r.statusText,
        headers: { ...Object.fromEntries(r.headers.entries()), 'x-volvix-cached-at': Date.now().toString() },
      });
      c.put(request, stamped).catch(() => {});
    }
    return r;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const stampedAt = parseInt(cached.headers.get('x-volvix-cached-at') || '0', 10);
      const stale = Date.now() - stampedAt > API_CACHE_MAX_AGE;
      const headers = new Headers(cached.headers);
      headers.set('x-volvix-from-cache', '1');
      if (stale) headers.set('x-volvix-stale', '1');
      return new Response(cached.body, { status: cached.status, headers });
    }
    return new Response(
      JSON.stringify({ error: 'Sin conexión', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function networkOnlyWithQueue(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Persistir mutación
    let body = null;
    try { body = await request.clone().text(); } catch {}
    const entry = {
      endpoint:  request.url,
      method:    request.method,
      headers:   Object.fromEntries(request.headers.entries()),
      body,
      createdAt: Date.now(),
      attempts:  0,
    };
    try {
      const id = await queueAdd(entry);
      // pedir background sync
      if ('sync' in self.registration) {
        self.registration.sync.register('volvix-flush-queue').catch(() => {});
      }
      // notificar a las pestañas
      broadcast({ type: 'OFFLINE_QUEUED', id, endpoint: entry.endpoint });
      return new Response(
        JSON.stringify({ ok: true, queued: true, queueId: id, offline: true }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No se pudo encolar la operación', detail: String(e) }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}

async function offlineFallback(request) {
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    const off = await caches.match('/offline.html');
    if (off) return off;
  }
  return new Response('Offline', { status: 503 });
}

// ============================================================
// BACKGROUND SYNC · drenar la queue
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'volvix-flush-queue' || event.tag === 'volvix-sync-ventas') {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const items = await queueAll().catch(() => []);
  if (!items.length) return;

  for (const item of items) {
    try {
      const res = await fetch(item.endpoint, {
        method:  item.method,
        headers: item.headers,
        body:    item.body,
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // 4xx: no reintentamos (request inválido) → drop
        await queueDelete(item.id);
        broadcast({ type: 'OFFLINE_FLUSHED', id: item.id, status: res.status, endpoint: item.endpoint });
      }
    } catch {
      // Red sigue caída → dejar en queue
    }
  }
  // También avisar a las pestañas para que refresquen
  broadcast({ type: 'OFFLINE_QUEUE_DRAINED', remaining: (await queueAll().catch(() => [])).length });
}

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then(list => {
    list.forEach(c => c.postMessage(msg));
  });
}

// ============================================================
// MENSAJES desde la app
// ============================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  if (type === 'CLEAR_CACHE') {
    caches.keys().then(n => Promise.all(n.map(x => caches.delete(x))))
      .then(() => event.ports?.[0]?.postMessage({ ok: true }));
    return;
  }

  if (type === 'CACHE_ASSETS') {
    const assets = payload?.assets || [];
    caches.open(CACHE_STATIC).then(c => c.addAll(assets))
      .then(() => event.ports?.[0]?.postMessage({ ok: true, count: assets.length }))
      .catch(e => event.ports?.[0]?.postMessage({ ok: false, error: String(e) }));
    return;
  }

  if (type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
    return;
  }

  if (type === 'FLUSH_QUEUE') {
    flushQueue().then(() => event.ports?.[0]?.postMessage({ ok: true }));
    return;
  }

  if (type === 'GET_QUEUE') {
    queueAll().then(items => event.ports?.[0]?.postMessage({ ok: true, items }));
    return;
  }
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Volvix', body: event.data.text() }; }
  const options = {
    body:    data.body || 'Tienes una nueva notificación',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/pos.html' },
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Volvix POS', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/pos.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

console.log('[SW] Volvix', CACHE_VERSION, '· offline-first listo');
