/* ============================================================
   VOLVIX · Service Worker
   ============================================================
   PWA offline-first para el POS. Estrategias:

   - Archivos del sistema (JS, CSS, fuentes):
       Cache First → sirve desde cache, actualiza en background

   - Páginas HTML del POS (pos.html, login.html, etc.):
       Network First → intenta red, fallback a cache

   - API calls (/api/*):
       Network Only → nunca cachear datos de negocio
       (el offline de datos lo maneja volvix-sync.js)

   - Google Fonts:
       Cache First (stale-while-revalidate)

   Versioning: cambia CACHE_VERSION al hacer deploy para
   forzar que todos los clientes descarguen los nuevos assets.
============================================================ */

const CACHE_VERSION  = 'volvix-v7.0.0';
const CACHE_STATIC   = CACHE_VERSION + '-static';
const CACHE_PAGES    = CACHE_VERSION + '-pages';
const CACHE_FONTS    = CACHE_VERSION + '-fonts';

// ── Archivos que se pre-cachean al instalar el SW ──
// Solo los críticos para que el POS arranque sin internet.
const PRECACHE_ASSETS = [
  '/',
  '/pos.html',
  '/login.html',
  '/volvix-tokens.css',
  '/volvix-api.js',
  '/volvix-sync.js',
  '/volvix-sync-widget.js',
  '/auth-gate.js',
  '/config.js',
];

// ── Páginas que se cachean on-the-fly (Network First) ──
const PAGE_ROUTES = [
  '/pos.html',
  '/login.html',
  '/pos-inventario.html',
  '/pos-corte.html',
  '/pos-clientes.html',
  '/pos-reportes.html',
  '/pos-config.html',
  '/volvix_owner_panel_v7.html',
  '/volvix_ai_engine.html',
  '/volvix_ai_support.html',
  '/volvix_ai_academy.html',
  '/volvix_remote.html',
  '/marketplace.html',
  '/landing_dynamic.html',
  '/multipos_suite_v3.html',
  '/etiqueta_designer.html',
  '/salvadorex_web_v25.html',
];

// ── Archivos estáticos que se sirven desde cache (Cache First) ──
const STATIC_EXTENSIONS = [
  '.css', '.js', '.woff', '.woff2', '.ttf', '.otf',
  '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp',
  '.json',
];

// ── Tiempo máximo de espera para red en Network First (ms) ──
const NETWORK_TIMEOUT_MS = 4000;

// ============================================================
// INSTALL · pre-cachear assets críticos
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        return cache.addAll(
          PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' }))
        ).catch((err) => {
          // Si algún asset falla, no bloquear la instalación
          console.warn('[SW] Pre-cache parcial (algunos assets no disponibles):', err.message);
        });
      })
      .then(() => {
        console.log('[SW] Instalado · versión:', CACHE_VERSION);
        // Activar inmediatamente sin esperar a que se cierre la pestaña
        return self.skipWaiting();
      })
  );
});

// ============================================================
// ACTIVATE · limpiar caches viejos
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const validCaches = [CACHE_STATIC, CACHE_PAGES, CACHE_FONTS];
        return Promise.all(
          cacheNames
            .filter(name => !validCaches.includes(name))
            .map(name => {
              console.log('[SW] Eliminando cache viejo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activado · tomando control de todos los clientes');
        // Tomar control de todas las pestañas abiertas inmediatamente
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH · interceptar requests
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Solo interceptar GET (POST/PATCH/DELETE van directo al server)
  if (request.method !== 'GET') return;

  // 2. Solo interceptar requests del mismo origen + Google Fonts
  const isSameOrigin  = url.origin === self.location.origin;
  const isGoogleFonts = url.hostname.includes('fonts.googleapis.com') ||
                        url.hostname.includes('fonts.gstatic.com');
  const isCDN         = url.hostname.includes('cdn.jsdelivr.net');

  if (!isSameOrigin && !isGoogleFonts && !isCDN) return;

  // 3. API → Network Only (datos siempre frescos)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 4. Google Fonts → Cache First (con stale-while-revalidate)
  if (isGoogleFonts) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // 5. Archivos estáticos (.js, .css, fuentes, imágenes) → Cache First
  const ext = url.pathname.split('.').pop()?.toLowerCase();
  if (STATIC_EXTENSIONS.includes('.' + ext)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 6. Páginas HTML → Network First con timeout
  const isPage = PAGE_ROUTES.some(route => url.pathname === route || url.pathname === route + '/')
    || url.pathname === '/'
    || url.pathname.endsWith('.html');

  if (isPage) {
    event.respondWith(networkFirst(request, CACHE_PAGES));
    return;
  }

  // 7. Cualquier otra cosa del mismo origen → Network First
  if (isSameOrigin) {
    event.respondWith(networkFirst(request, CACHE_STATIC));
  }
});

// ============================================================
// ESTRATEGIAS
// ============================================================

// Network Only — sin cache
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Sin conexión · API no disponible offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Cache First — sirve cache, si no hay va a red y guarda
async function cacheFirst(request, cacheName) {
  try {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.status < 400) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlinePage();
  }
}

// Network First con timeout — intenta red, si falla usa cache
async function networkFirst(request, cacheName) {
  try {
    // Race entre la red y un timeout
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)
      ),
    ]);

    if (response.ok && response.status < 400) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    // Red falló → buscar en cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // No hay cache → fallback a pos.html (para SPAs)
    const fallback = await caches.match('/pos.html');
    if (fallback) return fallback;

    return offlinePage();
  }
}

// Página offline de emergencia (si ni siquiera pos.html está cacheado)
function offlinePage() {
  return new Response(
    `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sin conexión · Volvix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Segoe UI', sans-serif;
      background: #0A0A0A;
      color: #FAFAF9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
    }
    .card {
      max-width: 380px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 40px 32px;
    }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    p  { font-size: 14px; color: #78716C; line-height: 1.6; margin-bottom: 20px; }
    button {
      background: #FBBF24;
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .tip {
      margin-top: 20px;
      font-size: 12px;
      color: #52524E;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      padding: 12px 16px;
      text-align: left;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📶</div>
    <h1>Sin conexión</h1>
    <p>Volvix no pudo cargar esta página.<br>Verifica tu conexión a internet.</p>
    <button onclick="location.reload()">↻ Reintentar</button>
    <div class="tip">
      💡 <strong>¿Ya registraste ventas?</strong><br>
      No te preocupes. Volvix guarda todo localmente y sincroniza automáticamente cuando se recupere la conexión.
    </div>
  </div>
</body>
</html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

// ============================================================
// MENSAJES desde la app (para forzar updates, limpiar cache, etc.)
// ============================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') {
    // La app pide activar el nuevo SW inmediatamente
    self.skipWaiting();
    return;
  }

  if (type === 'CLEAR_CACHE') {
    // La app pide limpiar el cache
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => {
        event.ports?.[0]?.postMessage({ ok: true, msg: 'Cache limpiado' });
      });
    return;
  }

  if (type === 'CACHE_ASSETS') {
    // La app pide pre-cachear assets adicionales
    const assets = payload?.assets || [];
    caches.open(CACHE_STATIC).then(cache => cache.addAll(assets))
      .then(() => {
        event.ports?.[0]?.postMessage({ ok: true, msg: `${assets.length} assets cacheados` });
      });
    return;
  }

  if (type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
    return;
  }
});

// ============================================================
// PUSH NOTIFICATIONS (base, para cuando se implemente)
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title:'Volvix', body: event.data.text() }; }

  const options = {
    body:    data.body || 'Tienes una nueva notificación',
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/pos.html' },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Volvix POS', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/pos.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una pestaña abierta, enfocarla
        const existingClient = clientList.find(c => c.url.includes(self.location.origin));
        if (existingClient) return existingClient.focus();
        // Si no, abrir una nueva
        return clients.openWindow(url);
      })
  );
});

// ============================================================
// BACKGROUND SYNC (para cuando la API lo soporte)
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'volvix-sync-ventas') {
    // El navegador llama esto cuando recupera conexión
    // volvix-sync.js ya maneja esto desde el frontend,
    // pero este es el fallback de nivel SW.
    event.waitUntil(
      clients.matchAll().then(clientList => {
        clientList.forEach(client => {
          client.postMessage({ type: 'SW_SYNC_TRIGGER', tag: event.tag });
        });
      })
    );
  }
});

console.log('[SW] Script cargado · versión:', CACHE_VERSION);