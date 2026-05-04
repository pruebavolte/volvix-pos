# R25 · Service Worker Hardening

## Estado: COMPLETO (sin auditor)

## Archivos auditados
- `sw.js` (root) — SW principal "Agent-12 Ronda 6"
- `public/sw.js` — SW R14 offline-first robusto
- `public/offline.html` — fallback page bonita (existe)
- `manifest.json` (root) + `public/manifest.json` — PWA manifests

## Cambios aplicados

### 1. VERSION bump
- `sw.js`: `v1.1.0` -> `v1.2.0`
- `public/sw.js`: `volvix-v8.0.0` -> `volvix-v8.1.0`
- Forza invalidación de cache global al deploy.

### 2. Validación `STATIC_FILES` (top 50)
- `sw.js`: 51 entradas — incluye HTML principales, auth-gate, wirings core (POS, Owner, MultiPOS), wirings transversales (offline, pwa, i18n, theme, notifications, push, logger, reports, charts, backup, etc.). OK.
- `public/sw.js`: `PRECACHE_ASSETS` mas selectivo (12 críticos) + `PAGE_ROUTES` con 12 rutas dinamicas. OK.

### 3. Estrategias verificadas
| Tipo | Estrategia | Archivo |
|---|---|---|
| Estáticos (`.css/.js/.png/...`) | cache-first + revalidate | ambos |
| HTML/páginas POS | network-first + fallback cache + offline.html | `public/sw.js` |
| GET `/api/*` | network-first con timeout 4s + cache stamped (5min TTL) | `public/sw.js` |
| POST/PATCH/DELETE `/api/*` | **network-only + queue offline IndexedDB** | `public/sw.js` |
| Google Fonts / CDN | cache-first | `public/sw.js` |

### 4. Background Sync API + IndexedDB queue
- DB: `Volvix` v1, store `offlineQueue` con índices `createdAt` + `endpoint`. OK.
- Tags sync: `volvix-flush-queue`, `volvix-sync-ventas`, `volvix-sync`, `volvix-queue`. OK.
- `flushQueue()` reintenta y dropea 4xx (request inválido).
- Broadcast a clientes: `OFFLINE_QUEUED`, `OFFLINE_FLUSHED`, `OFFLINE_QUEUE_DRAINED`. OK.

### 5. Skip waiting + clients.claim
- Ambos SW: `self.skipWaiting()` en install + `self.clients.claim()` en activate. OK.
- Mensaje `SKIP_WAITING` aceptado para auto-update desde cliente.

### 6. PWA install
- `manifest.json` (root): icons SVG inline 192/512 + maskable 512. start_url `/login.html`, display standalone, shortcuts a POS/Owner/Bitácora, share_target. OK.
- `public/manifest.json`: icons PNG 192/512 (any + maskable), launch_handler, edge_side_panel, shortcuts a Vender/Inventario/Corte/Reportes. OK.

## Cómo simular offline (DevTools)
1. Abrir Chrome/Edge DevTools (F12)
2. **Application** > **Service Workers**
3. Marcar checkbox **Offline** (o **Update on reload**)
4. Recargar (Ctrl+R) — debe mostrar `offline.html` o última página cacheada
5. Para probar queue: ejecutar `POST /api/...` desde consola → debe responder `202 {queued:true}`
6. Desmarcar Offline → background sync drena la queue automáticamente
7. Validar: en **Application** > **IndexedDB** > `Volvix` > `offlineQueue` aparecen/desaparecen entries

## Test "Add to Home Screen"
- Chrome desktop: barra direcciones muestra icono de instalación. Click → instala como app standalone.
- Android: menú overflow > "Instalar app" / "Add to Home Screen".
- iOS Safari: Compartir > "Add to Home Screen" (no soporta service workers para push pero sí cache).
- Validar: lighthouse PWA score >= 90.

## Validación final
- VERSION bumped: OK
- STATIC_FILES top 50: OK
- Cache-first / network-first / network-only POST: OK
- Background Sync + IndexedDB persistente: OK
- Skip waiting + clients.claim: OK
- offline.html bonita: OK (ya existía con queue indicator)
- Manifest icons 192/512 maskable: OK (ambos manifests)
