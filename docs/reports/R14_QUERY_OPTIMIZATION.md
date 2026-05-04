# R14 — Query Optimization Report (Volvix POS)

Fuente analizada: `C:\Users\DELL\Downloads\verion 340\api\index.js` (v7.2.0)
Cliente: `supabaseRequest(method, path, body)` → PostgREST sobre Supabase.
Fecha: 2026-04-26

---

## 1. Inventario de llamadas a Supabase REST

| # | Endpoint API                          | Linea | Tabla               | Query string                                                                 |
|---|---------------------------------------|-------|---------------------|------------------------------------------------------------------------------|
| 1 | POST /api/login                       | 368   | pos_users           | `?email=eq.<email>&select=id,email,password_hash,role,plan,full_name,company_id,notes,is_active` |
| 2 | POST /api/login (last_login_at)       | 385   | pos_users           | `PATCH ?id=eq.<id>`                                                          |
| 3 | POST /api/login (login_event)         | 389   | pos_login_events    | `POST`                                                                       |
| 4 | GET  /api/health                      | 421   | pos_users           | `?limit=1&select=id`                                                         |
| 5 | GET  /api/tenants                     | 435   | pos_companies       | `?id=in.(...3 UUIDs hardcoded...)&select=*`                                  |
| 6 | POST /api/tenants                     | 445   | pos_companies       | `POST`                                                                       |
| 7 | PATCH /api/tenants/:id                | 458   | pos_companies       | `?id=eq.<id>`                                                                |
| 8 | DELETE /api/tenants/:id (soft)        | 466   | pos_companies       | `PATCH ?id=eq.<id>`                                                          |
| 9 | GET  /api/products                    | 480   | pos_products        | `?pos_user_id=eq.<id>&select=*&order=name.asc`  ← **sin limit**              |
| 10| POST /api/products                    | 495   | pos_products        | `POST`                                                                       |
| 11| PATCH /api/products/:id               | 510   | pos_products        | `?id=eq.<id>`                                                                |
| 12| DELETE /api/products/:id              | 518   | pos_products        | `?id=eq.<id>`                                                                |
| 13| GET  /api/sales                       | 530   | pos_sales           | `?[pos_user_id=eq.<id>&]select=*&order=created_at.desc&limit=100`           |
| 14| POST /api/sales                       | 539   | pos_sales           | `POST`                                                                       |
| 15| GET  /api/customers                   | 551   | customers           | `?select=*&order=created_at.desc&limit=100`  ← **sin filtro tenant**         |
| 16| POST /api/customers                   | 560   | customers           | `POST`                                                                       |
| 17| PATCH /api/customers/:id              | 576   | customers           | `?id=eq.<id>`                                                                |
| 18| DELETE /api/customers/:id (soft)      | 584   | customers           | `PATCH ?id=eq.<id>`                                                          |
| 19| GET  /api/owner/dashboard (5 paralelas)| 593-599 | pos_users, pos_companies, pos_sales, pos_products, customers | **TODAS sin limit, sin filtro de fecha** |
| 20| GET  /api/owner/tenants               | 635   | pos_companies       | `?select=*&order=created_at.desc`  ← **sin limit**                           |
| 21| GET  /api/owner/users                 | 642   | pos_users           | `?select=id,email,role,is_active,plan,full_name,phone,company_id,last_login_at,created_at&order=created_at.desc&limit=100` |
| 22| POST /api/owner/users                 | 658   | pos_users           | `POST`                                                                       |
| 23| GET  /api/owner/sales-report          | 671   | daily_sales_report  | `?select=*&order=sale_date.desc&limit=30`                                    |
| 24| GET  /api/owner/licenses              | 678   | licenses            | `?select=*&order=created_at.desc&limit=100`                                  |
| 25| POST /api/owner/licenses              | 686   | licenses            | `POST`                                                                       |
| 26| GET  /api/owner/domains               | 698   | domains             | `?select=*&order=created_at.desc`  ← **sin limit**                           |
| 27| GET  /api/owner/billing               | 705   | billing_configs     | `?select=*&order=created_at.desc&limit=100`                                  |
| 28| GET  /api/owner/low-stock             | 712   | pos_products        | `?select=id,code,name,stock,price&order=stock.asc&limit=50` (filtro <20 en JS) |
| 29| GET  /api/owner/sync-queue            | 721   | sync_queue          | `?select=*&order=created_at.desc&limit=100`                                  |
| 30| GET  /api/inventory                   | 860   | pos_products        | `?select=id,code,name,stock,cost,price&order=name.asc`  ← **sin limit**      |
| 31| POST /api/inventory/adjust            | 871   | pos_products        | `PATCH ?id=eq.<id>`                                                          |
| 32| GET  /api/reports/daily               | 880   | daily_sales_report  | `?select=*&order=sale_date.desc&limit=30`                                    |
| 33| GET  /api/reports/sales               | 887   | pos_sales           | `?select=*&order=created_at.desc&limit=200`                                  |
| 34| POST /api/sync (loop)                 | 898-913 | pos_sales, customers | **N+1 en loop por cada item del array `body.items`**                         |
| 35| GET  TOP10 blobs (x18 keys)           | 972   | generic_blobs       | `?pos_user_id=eq.<id>&key=eq.<k>&select=value&order=updated_at.desc&limit=1` |
| 36| POST TOP10 blobs (x18 keys)           | 960   | generic_blobs       | `POST` (siempre INSERT, **nunca UPSERT** — crece sin tope)                   |
| 37| GET  /api/search                      | 998   | pos_products        | `?or=(name.ilike.*<q>*,code.ilike.*<q>*)&limit=50`  ← **sin select, sin tenant** |
| 38| GET  /api/reports/inventory           | 1009  | pos_products        | `?select=id,name,stock,cost,price&order=stock.asc&limit=500`                 |
| 39| GET  /api/owner/settings              | 1025  | generic_blobs       | `?pos_user_id=eq.<id>&key=eq.owner_settings&select=value&limit=1`            |
| 40| POST /api/owner/settings              | 1017  | generic_blobs       | `POST` (no UPSERT)                                                           |

**Total: 40 patrones de query distintos.**

---

## 2. Tabla de problemas y fixes

| # | Endpoint | Problema | Fix recomendado | Indice sugerido | Ahorro estimado |
|---|----------|----------|-----------------|-----------------|-----------------|
| 1 | POST /api/login | `?email=eq.<email>&select=...` no es case-insensitive; sin indice unique | usar `email=ilike.<email>` o normalizar en JS; agregar UNIQUE INDEX | `idx_pos_users_email (lower(email))` UNIQUE | 95% (seq scan → index) |
| 4 | GET /api/health | OK | — | — | — |
| 5 | GET /api/tenants | UUIDs hardcoded en query → no escala multi-tenant | parametrizar via `req.user.tenant_id` o tabla mapping | — | semantica, no perf |
| 9 | GET /api/products | `select=*` + **sin limit** + filtro por `pos_user_id` que en realidad es hardcoded por TNT | (a) `select=id,code,name,category,price,cost,stock,icon`; (b) agregar `limit=500&offset=`; (c) usar tenant real | `idx_pos_products_user_name (pos_user_id, name)` | 70% payload + 90% latency en cuentas grandes |
| 13| GET /api/sales | `select=*` (items JSONB pesado) | `select=id,total,payment_method,created_at` para listing; cargar items solo en detalle | `idx_pos_sales_user_created_desc (pos_user_id, created_at DESC)` | 80% bytes |
| 15| GET /api/customers | **sin filtro tenant/user** → fuga cross-tenant + `select=*` + limit fijo sin paginacion | añadir `user_id=eq.<req.user.id>`; reemplazar `*` por columnas; aceptar `?page=&size=` | `idx_customers_user_created_desc (user_id, created_at DESC)` | 60% + fix de seguridad |
| 19| GET /api/owner/dashboard | **5 SELECT *** sin limit, escaneo full table; agregaciones en JS, no en SQL | crear vista/RPC `owner_metrics()` que devuelva todo agregado en 1 round-trip; usar `count=exact` head; sumas en SQL | indices de orden por created_at en cada tabla | 95% (de ~5 full scans a 1 query agregada) |
| 20| GET /api/owner/tenants | sin limit | `limit=200&offset=` o paginacion cursor | `idx_pos_companies_created_at_desc` | 50%+ en cuentas escaladas |
| 21| GET /api/owner/users | OK (ya tiene select y limit) | añadir paginacion offset/cursor | `idx_pos_users_created_at_desc` | 30% |
| 26| GET /api/owner/domains | sin limit | añadir `limit=200` | `idx_domains_created_at_desc` | 50% |
| 28| GET /api/owner/low-stock | filtra `<20` **en JS** despues de traer 50 ordenadas asc | filtrar en SQL: `stock=lt.20&limit=50` | `idx_pos_products_stock_asc (stock) WHERE stock<50` (parcial) | 40% (menos rows transferidos) |
| 30| GET /api/inventory | `select=*`-ish + **sin limit** + sin filtro tenant | añadir `pos_user_id=eq.<id>&limit=500`; ya tiene select acotado | `idx_pos_products_user_name` | 60% |
| 33| GET /api/reports/sales | trae 200 ventas y suma en JS | usar RPC `sum_sales(period)` o `?select=total&...` + agregacion server-side | `idx_pos_sales_created_at_desc` | 70% bytes; el sum es trivial |
| 34| POST /api/sync | **N+1 clasico**: `for (item of items) await supabaseRequest(...)` | bulk insert: agrupar `pos_sales` y `customers` y hacer **1 POST con array** (PostgREST acepta arrays) | (los mismos de sales/customers) | 90% latency en sync de 50+ items |
| 35| GET TOP10 blobs | 18 endpoints distintos, cada uno **una query**; UI puede pedir varios en paralelo | endpoint `/api/blobs?keys=k1,k2,...` que use `key=in.(...)` y devuelva mapa | `idx_generic_blobs_user_key_updated (pos_user_id, key, updated_at DESC)` | 80% round-trips |
| 36| POST TOP10 blobs | siempre INSERT → tabla crece infinito; `list()` solo lee `limit=1` por updated_at | usar UPSERT con `Prefer: resolution=merge-duplicates` y UNIQUE (pos_user_id, key) | UNIQUE (pos_user_id, key) | 99% storage; 50% read |
| 37| GET /api/search | `ilike.*q*` sin indice trigram = full scan; `select=*` implicito; sin filtro tenant | (a) GIN trgm; (b) `select=id,code,name,price,stock`; (c) filtrar por pos_user_id | `idx_pos_products_name_trgm`, `idx_pos_products_code_trgm` (gin pg_trgm) | 95% en >10k productos |
| 38| GET /api/reports/inventory | trae 500 productos sin filtro tenant | filtrar `pos_user_id=eq.`, paginar | `idx_pos_products_user_name` | 60% |
| 40| POST /api/owner/settings | INSERT-only sin upsert | UPSERT con `Prefer: resolution=merge-duplicates` | UNIQUE (pos_user_id, key) | dedupe rows |

---

## 3. Resumen de hallazgos criticos

### A) Anti-patrones detectados

1. **`select=*`** en 6 endpoints (productos, sales, customers, tenants, owner/tenants, domains, blobs config). Trae columnas pesadas (`items` JSONB, `notes`, `password_hash`) innecesarias.
2. **Listings sin `limit`** en 4 endpoints (#9 products, #20 owner/tenants, #26 owner/domains, #30 inventory). En cuenta con 10k+ rows = timeout.
3. **N+1 en `/api/sync`** (linea 898): bucle `for` con `await supabaseRequest` por item.
4. **Filtro en JS post-fetch** en `/api/owner/low-stock` (linea 714): trae 50 y filtra `<20` en memoria.
5. **5 queries paralelas full-table** en `/api/owner/dashboard` (line 593): cada una sin limit, agregaciones en Node.
6. **`generic_blobs` sin UPSERT**: cada POST inserta nueva fila; `list()` lee la mas reciente. Tabla crece infinito.
7. **Search ilike sin indice trgm** (#37): O(n) sobre `pos_products`.
8. **Falta filtro de tenant** en `/api/customers` (#15), `/api/search` (#37), `/api/inventory` (#30) → posible fuga cross-tenant Y tabla escaneada completa.
9. **Email login no case-insensitive** y sin UNIQUE INDEX (#1).

### B) Indices criticos a aplicar (orden de prioridad)

1. `idx_pos_users_email` UNIQUE on `lower(email)` — login (1 query/login)
2. `idx_pos_sales_user_created_desc (pos_user_id, created_at DESC)` — listing ventas
3. `idx_pos_products_user_name (pos_user_id, name)` — POS catalog
4. `idx_pos_products_name_trgm` + `idx_pos_products_code_trgm` GIN — search
5. `idx_generic_blobs_user_key_updated (pos_user_id, key, updated_at DESC)` + UNIQUE(pos_user_id, key) — TOP10 wiring
6. `idx_customers_user_created_desc (user_id, created_at DESC)` — CRM listing
7. `idx_pos_products_stock_asc` parcial WHERE stock<50 — low stock

Ver `db/R14_INDEXES.sql` para script completo idempotente.

### C) Quick wins (sin tocar SQL, solo api/index.js — para R15)

- Reemplazar `select=*` por columnas explicitas en los 6 endpoints listados.
- Añadir `&limit=200` (o param `?limit=`) en endpoints sin limit.
- En `/api/owner/low-stock`: cambiar a `?stock=lt.20&select=id,code,name,stock,price&order=stock.asc&limit=50`.
- En `/api/sync`: agrupar items por tipo y hacer 2 POSTs con array body.
- En `generic_blobs` POST: añadir header `Prefer: resolution=merge-duplicates,return=representation` y `?on_conflict=pos_user_id,key`.
- En `/api/customers` y `/api/search`: añadir `&user_id=eq.${req.user.id}` (o `pos_user_id`) — fix de seguridad + perf.
- En `/api/owner/dashboard`: crear RPC `owner_metrics()` en Supabase y reemplazar las 5 queries por 1 RPC call.

---

## 4. Estimacion global de impacto

| Metrica | Antes | Despues (post R14+R15) |
|---|---|---|
| Latencia media `/api/products` (1k rows) | ~400ms | ~80ms |
| Latencia `/api/owner/dashboard` (5 full scans) | ~2-5s | ~150ms (RPC) |
| Bytes payload listing ventas | ~250KB (con items) | ~25KB |
| Latencia `/api/sync` 50 items | ~50 × 80ms = 4s | ~150ms (bulk) |
| Latencia `/api/search` 10k productos | ~600ms (seq scan) | ~25ms (gin trgm) |
| Storage `generic_blobs` (1 mes uso) | ilimitado, crece | acotado por #keys |

**Ahorro promedio estimado: 70-90% latencia, 60% bytes, evita timeouts.**

---

## 5. Siguientes pasos sugeridos

1. Revisar y aplicar `db/R14_INDEXES.sql` en Supabase (puede correrse en prod, todos `IF NOT EXISTS`).
2. Tras aplicar indices: `EXPLAIN ANALYZE` sobre las queries top-5 para confirmar uso de index.
3. R15 (siguiente sesion): refactor de `api/index.js` aplicando los quick-wins de la seccion C.
4. R16: crear RPC `owner_metrics()` y `bulk_sync()` para mover agregaciones/loops a SQL.
