# R25 — Error Tracking (Sin Auditor)

## Cambios

### `volvix-error-tracker.js` (v3)
- Contexto enriquecido: `url`, `viewport`, `screen` (dpr), `user_agent`, `language`, `online`, `referrer`, `user_id`, `tenant_id`, `jwt_exp` (decodificado de JWT en localStorage).
- Console history ring buffer: últimas 50 entradas de `console.log/info/warn/error/debug` (truncado a 1000 chars c/u) en `meta.console`.
- `sourceMapResolution(stack)` placeholder async — engancha `window.VOLVIX_SOURCEMAP_RESOLVER(stack) -> Promise<string>` para futuras source-maps.
- Auto-batch: flush cada 30s o cada 10 errores en cola (ya existía, conservado).
- `POST /api/errors/log` con `Authorization: Bearer <token>` opcional; fallback `sendBeacon` en `pagehide`/`beforeunload`.
- Badge dev visual: si `NODE_ENV !== 'production'` o hostname `localhost`/`127.0.0.1`/`*.local`/`*.test`/LAN, inyecta píldora roja fija bottom-left con contador y click→flush manual. Override con `window.VOLVIX_DEV = true|false`.
- API pública extendida: `VolvixErrorTracker.consoleHistory()`, `capturedCount()`, `isDev()`.

### `api/index.js`
- `POST /api/errors/log` ya existía y persiste en `error_log` con fallback a `console.warn` si Supabase falla.
- Añadido `GET /api/errors/recent` (admin/owner/superadmin) que devuelve últimos 100 (param `?limit=` 1-500) ordenados `created_at desc`.
- `GET /api/errors` legacy mantenido.

### Schema
- `db/R14_ERROR_LOG.sql` ya define la tabla `public.error_log` con columnas pedidas (`id`, `created_at`, `type`, `message`, `stack`, `url`, `user_agent`, `meta jsonb`, `pos_user_id`, `tenant_id`), índices y RLS — no se requirió migración nueva.

## Validación
- `node --check volvix-error-tracker.js` → OK
- `node --check api/index.js` → OK
- IDs de ruta sin colisión con `GET /api/errors` previo (router exacto por path).

## Deploy
Push del repo dispara Vercel auto-deploy (vercel.json existente). Tabla ya creada en producción; nada que migrar.

## Pendiente
- Implementar resolver real de source-maps (manifest `/sourcemaps/*.map`) — placeholder operativo.
- Dashboard admin que consuma `/api/errors/recent` (visor `volvix-audit-viewer.html` candidato).
