// no-op: se desactivó el SW de "ocultar railway".
// Custom domain (negocio.international) ya está configurado en Railway nativamente.
// Este SW se auto-desregistra para limpiar instalaciones previas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    })
  );
});
