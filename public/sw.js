/* Volvix POS Service Worker — 2026-05-15 DEBUG: SELF-UNREGISTER
 * To bypass all SW caching during raw-print debugging, this SW
 * clears all caches and unregisters itself immediately. The page
 * will fetch all resources from the network without SW interception.
 */
const VERSION = 'v0.0.0-debug-unregister';
console.log('[SW] ' + VERSION + ' loading, will self-unregister');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('[SW] cleared ' + keys.length + ' caches');
    } catch (e) { console.warn('[SW] cache clear failed:', e); }
    try {
      const clients = await self.clients.matchAll();
      await self.registration.unregister();
      console.log('[SW] unregistered, reloading ' + clients.length + ' clients');
      clients.forEach(c => {
        try { c.navigate(c.url); } catch (_) {}
      });
    } catch (e) { console.warn('[SW] unregister failed:', e); }
  })());
});
