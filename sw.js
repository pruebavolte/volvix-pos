/* ============================================================
   Volvix POS — Service Worker
   Agent-12 / Ronda 6 Fibonacci → Round 6b PWA HARDENING
   Estrategias:
     - Static: cache-first con fallback a red
     - API:    network-first con fallback a cache (stale-while-revalidate)
     - Offline: página fallback
     - Background Sync: cola de operaciones offline con Idempotency-Key + X-Cart-Token
     - Memory leak prevention: limpieza periodica de API_CACHE > 24h
     - Auto-refresh nightly cuando SW lleva > 24h sin actualizar
   ============================================================ */

// R6b: VERSION bumpeada para invalidar todos los caches viejos y forzar
// que clientes carguen los fixes acumulados de R1-R6a.
// Cuando exista build pipeline (esbuild/vite), reemplazar por hash generado.
// Mientras tanto: bumpear VERSION manualmente en cada deploy con cambios.
const VERSION   = 'v1.12.3-r6b';
const CACHE     = `volvix-${VERSION}`;
const API_CACHE = `volvix-api-${VERSION}`;
const RT_CACHE  = `volvix-rt-${VERSION}`;
const BUILD_TS  = Date.now(); // para auto-refresh nightly check

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
  '/volvix-error-reporter.js',
  '/volvix-uplift-wiring.js',
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
  '/volvix-anomaly-wiring.js',
  // B41 perf: critical assets for salvadorex POS that were missing from cache.
  // These are referenced from salvadorex_web_v25.html and load on every page render.
  '/volvix-feature-flags.js',
  '/volvix-feature-flags.css',
  '/volvix-modals.js',
  '/volvix-modals.css',
  '/volvix-product-search.js',
  '/volvix-barcode-resolver.js',
  '/auth-helper.js',
  '/volvix-ai-assistant.js',
  // R5b/R5c/R6a: nuevos wirings de seguridad / sesiones / permisos / KDS / promos / devoluciones
  '/volvix-permissions-wiring.js',
  '/volvix-mfa-wiring.js',
  '/volvix-pin-wiring.js',
  '/volvix-security-scan.js',
  '/volvix-error-tracker.js',
  '/volvix-promotions-wiring.js',
  '/volvix-returns-wiring.js',
  '/volvix-kds-wiring.js',
  '/volvix-indexeddb-wiring.js'
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
      // R6b GAP-S4: limpiar entradas API_CACHE > 24h (memory leak prevention)
      pruneStaleApiCache(),
      self.clients.claim()
    ])
  );
});

/* ---------- R6b GAP-S4: Memory-leak prevention ---------- */
const STALE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas
const SW_NIGHTLY_REFRESH_AGE = 24 * 60 * 60 * 1000; // 24 horas

async function pruneStaleApiCache() {
  try {
    const cache = await caches.open(API_CACHE);
    const requests = await cache.keys();
    const now = Date.now();
    let pruned = 0;
    for (const req of requests) {
      try {
        const res = await cache.match(req);
        if (!res) continue;
        // Si la respuesta tiene header Date, validar contra 24h
        const dateHdr = res.headers.get('date');
        const ts = dateHdr ? Date.parse(dateHdr) : 0;
        if (ts && (now - ts) > STALE_MAX_AGE) {
          await cache.delete(req);
          pruned++;
        }
      } catch (_) { /* ignorar */ }
    }
    if (pruned > 0) console.log(`[SW] prune API_CACHE: ${pruned} entradas > 24h eliminadas`);
  } catch (e) {
    console.warn('[SW] prune cache fail:', e.message);
  }
}

// Periodic cleanup interno cada hora mientras SW vivo
setInterval(() => { pruneStaleApiCache().catch(()=>{}); }, 60 * 60 * 1000);

// Notify clients to refresh si SW lleva > 24h sin update
setInterval(async () => {
  const age = Date.now() - BUILD_TS;
  if (age > SW_NIGHTLY_REFRESH_AGE) {
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'NEED_REFRESH', reason: 'sw_age_24h', ageMs: age }));
  }
}, 60 * 60 * 1000);

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

/* R6b GAP-S2: Robust queue sync with conflict resolution + auth handling */
const RETRY_BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000]; // exp backoff
const QUEUE_STATUS = {
  PENDING: 'pending',
  SKIPPED: 'skipped',          // 409 cart_already_consumed
  BLOCKED_AUTH: 'blocked_auth' // 401 SESSION_REVOKED / PERMISSIONS_CHANGED
};

function pickBackoffMs(retries) {
  return RETRY_BACKOFFS[Math.min(retries, RETRY_BACKOFFS.length - 1)];
}

async function processSyncQueue() {
  console.log('[SW] procesando cola offline...');
  const db = await openDB();
  if (!db) return;

  const tx = db.transaction(['queue'], 'readwrite');
  const store = tx.objectStore('queue');
  const all = await idbGetAll(store);

  let ok = 0, fail = 0, skipped = 0, blocked = 0;
  const now = Date.now();

  for (const item of all) {
    // Skip si está marcado como bloqueado o saltado
    if (item.status === QUEUE_STATUS.SKIPPED || item.status === QUEUE_STATUS.BLOCKED_AUTH) {
      continue;
    }
    // Backoff: respetar nextAttemptAt si existe
    if (item.nextAttemptAt && item.nextAttemptAt > now) continue;

    try {
      // Construir headers con Idempotency-Key (R1) y X-Cart-Token (R1)
      const headers = {
        'Content-Type': 'application/json',
        ...(item.headers || {})
      };

      // Idempotency-Key: usar el guardado o el client_uuid del item
      const idemKey = item.idempotency_key || item.headers?.['Idempotency-Key'] || item.client_uuid;
      if (idemKey && !headers['Idempotency-Key']) {
        headers['Idempotency-Key'] = idemKey;
      }

      // X-Cart-Token: solo para POST /api/sales si existe en item
      const isSalePost = (item.method || 'POST').toUpperCase() === 'POST'
        && /\/api\/sales(\?|$)/.test(item.endpoint || '');
      if (isSalePost && item.cart_token && !headers['X-Cart-Token']) {
        headers['X-Cart-Token'] = item.cart_token;
      }

      // Auth: usar token guardado en el item (capturado al encolar)
      if (item.auth_token && !headers['Authorization']) {
        headers['Authorization'] = 'Bearer ' + item.auth_token;
      }

      const res = await fetch(item.endpoint, {
        method: item.method || 'POST',
        headers,
        body: item.data ? JSON.stringify(item.data) : undefined
      });

      // 2xx: éxito → eliminar de queue
      if (res.ok) {
        const delTx = db.transaction(['queue'], 'readwrite');
        delTx.objectStore('queue').delete(item.id);
        ok++;
        continue;
      }

      // 409: cart_already_consumed → marcar skipped (no duplicar)
      if (res.status === 409) {
        let body = {};
        try { body = await res.clone().json(); } catch (_) {}
        if (body.error === 'cart_already_consumed' || body.error_code === 'CART_ALREADY_CONSUMED') {
          item.status = QUEUE_STATUS.SKIPPED;
          item.skip_reason = 'cart_already_consumed';
          item.last_response = body;
          const upTx = db.transaction(['queue'], 'readwrite');
          upTx.objectStore('queue').put(item);
          skipped++;
          continue;
        }
        // 409 idempotency replay: response cacheada del server R1 → tratar como ok
        if (body.idempotent_replay === true || body.error_code === 'IDEMPOTENT_REPLAY') {
          const delTx2 = db.transaction(['queue'], 'readwrite');
          delTx2.objectStore('queue').delete(item.id);
          ok++;
          continue;
        }
        // Otros 409: contar fail con backoff
      }

      // 401: SESSION_REVOKED / PERMISSIONS_CHANGED → bloquear hasta re-login
      if (res.status === 401) {
        let body = {};
        try { body = await res.clone().json(); } catch (_) {}
        const code = body.error_code || body.error || '';
        if (code === 'SESSION_REVOKED' || code === 'PERMISSIONS_CHANGED' || code === 'TOKEN_EXPIRED') {
          item.status = QUEUE_STATUS.BLOCKED_AUTH;
          item.block_reason = code;
          item.last_response = body;
          const upTx = db.transaction(['queue'], 'readwrite');
          upTx.objectStore('queue').put(item);
          blocked++;
          // Notificar clientes para que pidan re-login
          const cls = await self.clients.matchAll();
          cls.forEach((c) => c.postMessage({ type: 'auth-required', code, queueItemId: item.id }));
          continue;
        }
      }

      // 4xx no recuperable (400, 403, 422...): drop después de 3 intentos
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        item.retries = (item.retries || 0) + 1;
        if (item.retries >= 3) {
          // Mover a dead-letter (mantener pero marcar)
          item.status = 'dead';
          item.last_response = { status: res.status };
          const upTx = db.transaction(['queue'], 'readwrite');
          upTx.objectStore('queue').put(item);
        } else {
          item.nextAttemptAt = now + pickBackoffMs(item.retries);
          const upTx = db.transaction(['queue'], 'readwrite');
          upTx.objectStore('queue').put(item);
        }
        fail++;
        continue;
      }

      // 5xx / 408 / 429: retry con backoff exponencial
      item.retries = (item.retries || 0) + 1;
      item.nextAttemptAt = now + pickBackoffMs(item.retries);
      const upTx = db.transaction(['queue'], 'readwrite');
      upTx.objectStore('queue').put(item);
      fail++;
    } catch (e) {
      // Network error → backoff
      item.retries = (item.retries || 0) + 1;
      item.last_error = String(e && e.message || e);
      item.nextAttemptAt = now + pickBackoffMs(item.retries);
      try {
        const upTx = db.transaction(['queue'], 'readwrite');
        upTx.objectStore('queue').put(item);
      } catch (_) {}
      fail++;
    }
  }

  console.log(`[SW] sync: ${ok} ok, ${fail} fail, ${skipped} skipped, ${blocked} blocked`);

  // Calcular si quedan pendientes "vivos" (no skipped ni blocked ni dead)
  const remaining = await idbGetAll(db.transaction(['queue'], 'readonly').objectStore('queue'));
  const livePending = remaining.filter(x =>
    x.status !== QUEUE_STATUS.SKIPPED &&
    x.status !== QUEUE_STATUS.BLOCKED_AUTH &&
    x.status !== 'dead'
  ).length;

  // Notificar a clientes
  const clients = await self.clients.matchAll();
  clients.forEach((c) =>
    c.postMessage({
      type: 'sync-complete',
      ok, fail, skipped, blocked,
      livePending,
      // GAP-S3: indicar cuándo la cola está limpia para destrabar cierre Z
      online_clean: livePending === 0
    })
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
  // FIX-N5-C1 (R10e-C): force refresh requested by VolvixRecovery
  if (type === 'FORCE_REFRESH') {
    const scope = (event.data && event.data.payload && event.data.payload.scope) || 'all';
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys();
        // 'all' borra todo; 'products'/'api' borra solo el caché de API
        const targets = (scope === 'all')
          ? keys
          : keys.filter(k => k.startsWith('volvix-api-') || k.startsWith('volvix-rt-'));
        await Promise.all(targets.map(k => caches.delete(k)));
        // Notifica clientes para que recarguen estado
        const cls = await self.clients.matchAll();
        cls.forEach(c => c.postMessage({ type: 'CACHE_REFRESHED', scope, cleared: targets.length }));
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true, cleared: targets.length });
        }
      } catch (err) {
        console.warn('[SW] FORCE_REFRESH fail:', err.message);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: false, error: err.message });
        }
      }
    })());
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
