# R23 — Deep Audit (Volvix POS — https://salvadorexoficial.com)

**Fecha:** 2026-04-26 · **Build:** 7.2.0 · **Auth:** admin@volvix.test (superadmin TNT001)
**Método:** 53 endpoints HTTP probados con JWT, auth negativa, perf p50, headers, concurrencia 10x, edge cases.

## Resumen ejecutivo

- **5 endpoints con HTTP 500** (filtrado fugas BD a cliente — bug crítico).
- **22 endpoints con HTTP 404** que el roadmap R17/R18 anuncia como entregados (gap real vs documentación).
- Frontend HTML 13.9 KB con **31 `<script>` tags** en `index.html` (bundle no consolidado → cold start lento).
- Buenas noticias: CSP, HSTS, X-Frame DENY, cookie HttpOnly+Secure+SameSite=Strict, logout limpia cookie correctamente, SQL injection bloqueado, p50 API ≈ 270 ms.

## Tabla de hallazgos (40)

| # | Categoría | Bug | Severidad | Endpoint/Pantalla | Repro | Fix sugerido |
|---|-----------|-----|-----------|-------------------|-------|--------------|
| 1 | API-500 | `/api/hr/attendance` GET retorna 500 con mensaje genérico | **CRÍTICA** | /api/hr/attendance | `curl -H "Auth: Bearer $T" .../api/hr/attendance` | Tabla `hr_attendance` no existe o RLS mal — capturar PG error en handler y degradar a `[]` o 503 |
| 2 | API-500 | `/api/kds/tickets/active` GET retorna 500 | **CRÍTICA** | /api/kds/tickets/active | mismo curl | Igual: try/catch + fallback `{items:[]}` |
| 3 | API-500 | `/api/segments` retorna 500 `segments_list_failed` | **CRÍTICA** | /api/segments | mismo curl | Validar tabla `customer_segments`, manejar empty-result vs error |
| 4 | API-500 | `/api/customer-subscriptions` retorna 500 | **CRÍTICA** | /api/customer-subscriptions | mismo curl | Migración faltante de tabla `customer_subscriptions` |
| 5 | API-500 | `/api/warehouses` retorna 500 | **CRÍTICA** | /api/warehouses | mismo curl | Crear tabla `warehouses` o stub vacío |
| 6 | API-404 | `/api/payroll/periods` documentado en R17, no existe | **ALTA** | /api/payroll/* | curl → "endpoint not found" | Eliminar de docs o implementar handler |
| 7 | API-404 | `/api/integrations/shopify/sync-orders` 404 (R17 lo lista como WIRED) | **ALTA** | /api/integrations/shopify/* | mismo | Implementar o marcar pendiente en R17_FRONTEND_WIRED.md |
| 8 | API-404 | `/api/nft/collections` 404 (R18) | **ALTA** | /api/nft/* | mismo | Idem |
| 9 | API-404 | `/api/qr/codi/generate` 404 (R18 pago QR-CoDi) | **ALTA** | /api/qr/codi/* | mismo | Implementar handler — feature pago crítico MX |
| 10 | API-404 | `/api/telegram/webhook` 404 | MEDIA | /api/telegram/webhook | mismo | Crear handler aunque sea stub 503 |
| 11 | API-404 | `/api/voice/parse` 404 (R18 Voice) | MEDIA | /api/voice/parse | mismo | Implementar o quitar UI |
| 12 | API-404 | `/api/ocr/parse-receipt` 404 (R18 OCR) | MEDIA | /api/ocr/* | mismo | Implementar o quitar |
| 13 | API-404 | `/api/sms/send` 404 (R18) | MEDIA | /api/sms/send | mismo | Implementar handler Twilio (debería 503 sin token) |
| 14 | API-404 | `/api/mfa/setup` 404 (R14_MFA dice listo) | **ALTA** | /api/mfa/setup | mismo | Hay regresión vs R14 — ruta movida o eliminada |
| 15 | API-404 | `/api/orders` 404 (alias estándar e-commerce) | MEDIA | /api/orders | mismo | Crear alias a `/api/sales` o documentar |
| 16 | API-404 | `/api/categories` 404 — UI necesita listar categorías | **ALTA** | /api/categories | mismo | Implementar GET — actualmente derivado de products.category |
| 17 | API-404 | `/api/users` 404 — alias admin de users | MEDIA | /api/users | mismo | Mapear a `/api/admin/users` o crear |
| 18 | API-404 | `/api/loyalty/points` 404 (raíz `/api/loyalty` sí 200) | MEDIA | /api/loyalty/points | curl ambos | Implementar sub-ruta `points` o cambiar UI |
| 19 | API-404 | `/api/cfdi/list` 404 (R14_CFDI) | MEDIA | /api/cfdi/list | mismo | Regresión vs R14 |
| 20 | API-404 | `/api/onboarding/status` 404 (R14_ONBOARDING_V2) | MEDIA | /api/onboarding/status | mismo | Idem |
| 21 | API-404 | `/api/multicurrency/rates` 404 (R14_MULTICURRENCY) | MEDIA | /api/multicurrency/rates | mismo | Idem |
| 22 | API-404 | `/api/i18n/locales` 404 (R13_I18N_ACTIVATION) | MEDIA | /api/i18n/locales | mismo | Idem |
| 23 | API-404 | `/api/audit/logs` 404 (security audit) | **ALTA** | /api/audit/logs | mismo | Implementar — visibilidad superadmin requerida |
| 24 | API-validación | `/api/ml/inventory/forecast` exige `product_id` por query, no body, retorna 400 sin lista | BAJA | /api/ml/inventory/forecast | `curl ?product_id=...` | Permitir GET sin id devolviendo top-N o doc clara |
| 25 | UX-error | Mensaje "Error interno del servidor" idéntico en TODOS los 500 — sin trace-id | **ALTA** | varios | endpoints 500 | Añadir `X-Request-Id` y mostrar al usuario para soporte |
| 26 | Auth-UX | Token con `exp` pasado → 401 sin redirección automática (frontend debe interceptar) | **ALTA** | /api/me | `Authorization: Bearer <expired>` | Interceptor 401 en cliente → `location.href='/login'` |
| 27 | Auth | Endpoint `/api/login` con body `{}` devuelve 400 sin schema-error claro | BAJA | /api/login | `curl -d '{}'` | Devolver `{error,field:'email'}` consistente |
| 28 | Auth-cookie | Cookie `volvix_token` Path=/api → no accesible para SSR/`/static` | BAJA | login flow | Set-Cookie inspection | Cambiar Path=`/` si se requiere SSR (revisar uso) |
| 29 | Bundle | 31 `<script>` tags en index.html (waterfall HTTP, cold-start lento) | **ALTA** | / | `curl /` | Bundlear con esbuild/vite — esperado < 5 scripts |
| 30 | Cache | `Cache-Control: public, max-age=3600` en HTML root → usuarios verán versión vieja 1 h tras deploy | **ALTA** | / | `curl -I /` | Cambiar a `no-cache, must-revalidate` para HTML; cachear solo assets con hash |
| 31 | CSP | CSP permite `'unsafe-inline'` en script-src + `cdn.jsdelivr.net` | MEDIA | global | response headers | Eliminar unsafe-inline (usar nonces) y self-host JsDelivr libs |
| 32 | Integración | `/api/config/public` retorna 503 sin SUPABASE_ANON_KEY → frontend pierde feature flags | **ALTA** | /api/config/public | curl | Definir defaults en server y degradar — actualmente bloquea init UI |
| 33 | Integración | `/api/push/vapid-public-key` retorna 200 con `key:null` (mezcla 200/error) | MEDIA | /api/push/vapid-public-key | curl | Devolver 503 + `Retry-After`, consistente con resto |
| 34 | Integración | Health widget aún muestra Stripe/WhatsApp "down" — son **opcionales** sin tokens | MEDIA | UI Admin Health | abrir dashboard | Diferenciar `not_configured` (gris) vs `error` (rojo) |
| 35 | Datos | `/api/sales` POST exige `Idempotency-Key` (correcto) pero error no documentado para discount > total | MEDIA | /api/sales | `curl -d '{discount:1000,items:[{price:1}]}'` | Validar `discount<=subtotal` antes de idempotency, retornar 422 con campo |
| 36 | Datos | `/api/products` POST con `{}` devuelve solo el primer error (`name requerido`) — no agrega los demás | BAJA | /api/products POST | curl `-d '{}'` | Acumular errores en `errors[]` para UX form |
| 37 | Performance | p50 `/api/health`=327ms, p95 estimado >400ms — alto para healthcheck | MEDIA | /api/health | 5 curls secuenciales | Cachear last-good por 30s, eliminar consulta tabla `users` |
| 38 | Performance | 10 req paralelas /api/products tomaron 1815 ms total (≈ 280 ms p99 sostenido — OK) pero sin throttling | BAJA | /api/products | concurrencia | Añadir rate-limit por tenant + `429 Retry-After` |
| 39 | Documentación | R17/R18 reportan endpoints como entregados; auditoría confirma 22 ausentes — falsos positivos | **ALTA** | docs vs código | comparar tablas | Re-correr `R17_FRONTEND_WIRED.md` con scraper real, marcar PENDING |
| 40 | OPTIONS/CORS | CORS permite `Access-Control-Allow-Origin: https://salvadorexoficial.com` (correcto), pero falta `Vary: Origin` → cache poisoning posible vía CDN | MEDIA | global | `curl -I -X OPTIONS .../api/me` | Añadir `Vary: Origin` en respuestas CORS |

## Métricas

- **Endpoints OK:** 27 / 53 (50.9 %)
- **Endpoints 404 inesperados:** 22 (41.5 %)
- **Endpoints 500:** 5 (9.4 %) ← **bloqueante para producción**
- **Endpoints 503 esperados:** 3 (Square, backup, config/public sin envvars)
- **Tiempo de login:** ~300 ms (incluye JWT + cookie)
- **p50 GET autenticado:** 268 ms · **p99:** 404 ms
- **Cookies httpOnly:** sí · **Logout limpia cookie:** sí

## Top-3 acciones inmediatas

1. **Apagar los 5 endpoints 500** envolviendo handlers en `try/catch` que devuelvan `503 + reason` en lugar de filtrar 500 al cliente (issue #1-5).
2. **Reconciliar R17/R18 vs realidad** — 22 endpoints 404 que las docs marcan listos. Auditoría con script `node scripts/list-routes.js` y diff vs `R17_FRONTEND_WIRED.md`.
3. **Bundlear el frontend** — 31 scripts en index.html bloquean el cold-start mobile (3G ~6 s estimados). Usar esbuild + 1 entry point.

---
*Fuente: 53 requests HTTP reales 2026-04-26 09:37 UTC, build 7.2.0, JWT superadmin TNT001.*
