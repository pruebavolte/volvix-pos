// Service Worker para interceptar y reescribir URLs que contienen railway.app
const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';
const DOMINIO_TARGET = 'negocio.international';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Si la URL contiene railway.app, reescribir
  if (url.hostname === RAILWAY_DOMAIN) {
    // Reescribir hostname a negocio.international
    url.hostname = DOMINIO_TARGET;
    url.protocol = 'https:';

    // Intentar fetch a dominio target
    event.respondWith(
      fetch(new Request(url.toString(), {
        method: event.request.method,
        headers: event.request.headers,
        body: event.request.body,
        mode: 'cors',
        credentials: 'include'
      })).catch(err => {
        // Si falla, servir desde railway (fallback)
        return fetch(event.request);
      })
    );
  }
});
