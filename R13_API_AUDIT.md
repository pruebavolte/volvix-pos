# R13 — Auditoría API (`api/index.js` v7.1.0)

## Configuración global

- **Supabase URL/Key**: hardcodeados como fallback en líneas 14-15. **Service key expuesto en código** — riesgo crítico de seguridad si el repo es público.
- **CORS**: `Access-Control-Allow-Origin: *` global (línea 754) + repetido en `sendJSON` y `serveStaticFile`. Permisivo total — aceptable para API pública, riesgoso si hay datos sensibles.
- **Auth/rol**: NINGÚN endpoint valida token de sesión, JWT, header `Authorization`, ni rol del usuario. El `/api/login` devuelve una "sesión" pero nunca se verifica después. **Toda la API está abierta sin autenticación.**
- **Manejo de errores**: patrón uniforme `try/catch → sendJSON({error: err.message}, 500)`. Funciona, pero filtra mensajes internos de Supabase al cliente (info disclosure).

## Tabla de endpoints

| # | Método | Ruta | Supabase real / Mock | Valida auth/rol | Errores OK | CORS OK | Bugs / Observaciones |
|---|--------|------|----------------------|-----------------|------------|---------|----------------------|
| 1 | POST | `/api/login` | Real (`pos_users`) | N/A (es el login) | Sí | Sí | **CRÍTICO: compara `password_hash` en texto plano (`user.password_hash !== password`)**. No hay bcrypt/scrypt. No emite JWT/token; el cliente solo recibe objeto `session` no firmado → trivial de falsificar. |
| 2 | POST | `/api/logout` | Mock (no-op) | No | Trivial | Sí | Stub: no invalida nada en el server. |
| 3 | GET | `/api/health` | Real (ping `pos_users`) | No | Sí | Sí | OK. |
| 4 | GET | `/api/tenants` | Real, pero **filtra por 3 UUIDs hardcodeados** (línea 247) | No | Sí | Sí | Bug: lista de companies fijada a 3 IDs demo, ignora el resto. |
| 5 | POST | `/api/tenants` | Real (`pos_companies`) | No | Sí | Sí | Sin validación de campos. Cualquiera puede crear tenants. |
| 6 | PATCH | `/api/tenants/:id` | Real | No | Sí | Sí | **Pasa `body` crudo a Supabase** → permite cambiar cualquier columna (incluyendo `owner_user_id`, `plan`). Mass-assignment. |
| 7 | DELETE | `/api/tenants/:id` | Real (soft delete `is_active=false`) | No | Sí | Sí | OK semánticamente, pero sin auth. |
| 8 | GET | `/api/products` | Real, pero **mapea `tenant_id → pos_user_id` hardcodeado** (líneas 283-284) | No | Sí | Sí | Bug grave: solo conoce `TNT001` y `TNT002`; otros tenants reciben productos de TNT001 por defecto. |
| 9 | POST | `/api/products` | Real | No | Sí | Sí | `pos_user_id` por defecto a UUID hardcodeado. |
| 10 | PATCH | `/api/products/:id` | Real | No | Sí | Sí | Mass-assignment (body crudo). |
| 11 | DELETE | `/api/products/:id` | Real (hard delete) | No | Sí | Sí | Hard delete sin confirmación ni soft-delete. |
| 12 | GET | `/api/sales` | Real (`pos_sales`) | No | Sí | Sí | Sin filtro por tenant; cualquier `user_id` puede listar otras ventas. |
| 13 | POST | `/api/sales` | Real | No | Sí | Sí | `pos_user_id` fallback a UUID demo. No valida items vs stock. |
| 14 | GET | `/api/customers` | Real | No | Sí | Sí | Sin filtro por tenant; **expone clientes de todos**. |
| 15 | POST | `/api/customers` | Real | No | Sí | Sí | Sin validación. |
| 16 | PATCH | `/api/customers/:id` | Real | No | Sí | Sí | Mass-assignment. |
| 17 | DELETE | `/api/customers/:id` | Real (soft delete) | No | Sí | Sí | OK. |
| 18 | GET | `/api/owner/dashboard` | Real (5 queries paralelas) | **No (debería ser owner-only)** | Sí | Sí | Riesgo alto: cualquiera ve métricas globales (MRR, ARR, total ventas). |
| 19 | GET | `/api/owner/tenants` | Real | No | Sí | Sí | Idem. |
| 20 | GET | `/api/owner/users` | Real | No | Sí | Sí | **Lista todos los usuarios** (sin password_hash, pero con email/role). |
| 21 | POST | `/api/owner/users` | Real | No | Sí | Sí | **Permite crear usuarios sin auth**. Password en texto plano (`changeme`). |
| 22 | GET | `/api/owner/sales-report` | Real (vista `daily_sales_report`) | No | Sí | Sí | Sin filtro tenant. |
| 23 | GET | `/api/owner/licenses` | Real | No | Sí | Sí | OK. |
| 24 | POST | `/api/owner/licenses` | Real | No | Sí | Sí | `license_key` autogenerada con `Date.now()` → predecible/colisionable. |
| 25 | GET | `/api/owner/domains` | Real | No | Sí | Sí | OK. |
| 26 | GET | `/api/owner/billing` | Real | No | Sí | Sí | OK. |
| 27 | GET | `/api/owner/low-stock` | Real | No | Sí | Sí | OK; umbral hardcodeado <20. |
| 28 | GET | `/api/owner/sync-queue` | Real | No | Sí | Sí | OK. |
| 29 | GET | `/api/features` | **MOCK hardcodeado** (líneas 517-526) | No | Trivial | Sí | Stub: 8 features fijas. |
| 30 | POST | `/api/features/request` | Híbrido: llama a Claude (real si key), pero **NO persiste** | No | Sí | Sí | La feature creada no se guarda en DB. `JSON.parse(aiResp.content)` sin validar formato → puede fallar silenciosamente (catch vacío). |
| 31 | POST | `/api/features/activate` | **MOCK** (solo eco) | No | Trivial | Sí | Stub: no toca DB. |
| 32 | POST | `/api/ai/decide` | Real (Anthropic) o simulado si falta key | No | Sí | Sí | Sin rate limit; cualquiera consume tokens de Claude. |
| 33 | POST | `/api/ai/support` | Real (Anthropic) o simulado | No | Sí | Sí | Idem rate-limit. |
| 34 | GET | `/api/ai/decisions` | **MOCK hardcodeado** (líneas 597-600) | No | Trivial | Sí | Stub: 2 decisiones fijas. |
| 35 | GET | `/api/tickets` | **MOCK hardcodeado** (líneas 605-608) | No | Trivial | Sí | Stub. |
| 36 | POST | `/api/tickets` | Híbrido: Claude real, **no persiste** | No | Sí | Sí | ID aleatorio `Math.random()` → colisiones posibles. `JSON.parse(aiResp.content)` puede tirar excepción si Claude no responde JSON puro. |
| 37 | GET | `/api/inventory` | Real (`pos_products`) | No | Sí | Sí | Sin filtro tenant. |
| 38 | POST | `/api/inventory/adjust` | Real | No | Sí | Sí | Sin auditoría del ajuste. |
| 39 | GET | `/api/reports/daily` | Real | No | Sí | Sí | Duplica #22. |
| 40 | GET | `/api/reports/sales` | Real | No | Sí | Sí | Sin filtro tenant. |
| 41 | POST | `/api/sync` | Real (loop POST a `pos_sales`/`customers`) | No | Parcial | Sí | Si `body` no es JSON, `readBody` devuelve `{}` y el loop se salta — pero si `items` no es array no responde error. **No es transaccional**: fallos parciales dejan datos inconsistentes. |
| 42 | GET | `/api/debug` | Real | **No (debería estar deshabilitado en prod)** | Sí | Sí | **Filtra `SUPABASE_URL` y emails de admins**. Endpoint de debug expuesto sin protección. |
| 43 | GET | `/api/status` | Lee archivo `status.json` local | No | Sí | Sí | OK. |

## Endpoints con datos hardcodeados / stubs (resumen)

| Endpoint | Tipo |
|----------|------|
| `GET /api/features` | Mock 100% (array literal) |
| `GET /api/ai/decisions` | Mock 100% |
| `GET /api/tickets` | Mock 100% |
| `POST /api/features/activate` | Stub (solo eco, no DB) |
| `POST /api/features/request` | Híbrido — IA real pero no persiste |
| `POST /api/tickets` | Híbrido — IA real pero no persiste |
| `POST /api/logout` | No-op |
| `GET /api/tenants` | Filtro hardcodeado a 3 UUIDs |
| `GET /api/products` | Mapeo tenant→user hardcodeado (TNT001/TNT002) |

## Bugs / problemas críticos

1. **Sin autenticación en ningún endpoint** salvo el propio `/api/login`. La "sesión" devuelta no se verifica jamás. Cualquier cliente puede llamar `POST /api/owner/users`, `DELETE /api/products/:id`, etc.
2. **Passwords en texto plano** (`pos_users.password_hash` se compara con `===` literal contra `password` recibido).
3. **Service key de Supabase hardcodeada** en el código fuente (línea 15) — bypass total de RLS.
4. **Mass-assignment** en todos los `PATCH` (`/tenants/:id`, `/products/:id`, `/customers/:id`): se reenvía `body` crudo a Supabase.
5. **Sin aislamiento multi-tenant**: `/api/sales`, `/api/customers`, `/api/inventory`, `/api/reports/*` listan datos de todos los tenants.
6. **`/api/debug` expuesto en producción** filtra config y usuarios admin.
7. **Endpoints `/api/owner/*` sin rol**: cualquiera ve dashboard MRR/ARR y crea usuarios.
8. **`JSON.parse(aiResp.content)` sin guard**: en `/features/request` y `/tickets` la respuesta de Claude puede no ser JSON puro → `catch {}` silencia el error pero deja `decision`/`aiResult` con valores por defecto inesperados.
9. **`POST /api/sync` no es transaccional** y no devuelve 4xx si `items` está malformado.
10. **`license_key` y `ticketId`** generados con `Date.now()` / `Math.random()` → no únicos garantizados.
11. **Hard delete** en `/api/products/:id` (a diferencia de tenants/customers que hacen soft delete) — inconsistencia.
12. **CORS `*` con credenciales implícitas**: si se añadieran cookies, sería vulnerable.
13. **Sin rate limiting** en endpoints que llaman a Anthropic (`/api/ai/*`, `/features/request`, `/tickets`) → riesgo de costos elevados.
14. **`error: err.message` al cliente**: filtra detalles internos de Supabase (esquemas, tablas).
15. **`/api/products` ignora tenants nuevos**: solo TNT001/TNT002 mapeados; cualquier otro tenant ve los productos de TNT001.

## Recomendaciones prioritarias

1. Añadir middleware de auth (verificar JWT/sesión firmada) antes del `matchRoute`.
2. Mover `SUPABASE_SERVICE_KEY` a env var obligatoria; eliminar fallback hardcodeado.
3. Hashear passwords con bcrypt; firmar la sesión con HMAC.
4. Filtrar columnas permitidas en cada PATCH (allowlist).
5. Aislar queries por `tenant_id`/`company_id` en todos los GET de datos.
6. Deshabilitar `/api/debug` en producción (o protegerlo con rol owner).
7. Persistir features y tickets en DB (tablas dedicadas).
8. Implementar rate limiting en endpoints AI.
9. Reemplazar mocks (`/features`, `/tickets`, `/ai/decisions`) por queries reales.
