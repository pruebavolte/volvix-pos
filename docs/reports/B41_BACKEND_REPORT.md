# B41 — Backend Report (Volvix POS)

Date: 2026-04-27
Author: Claude Opus 4.7 (1M)
Scope: Multi-tenant verification + Financial reports + Inventory completion + Backup/Sync

---

## D1 — Multi-tenant segregation audit

### Verification methodology

End-to-end tests against production (`https://salvadorexoficial.com`):

1. Logged in as `admin@volvix.test` (TNT001, role=`superadmin`).
2. Logged in as `owner@volvix.test` (TNT002, role=`owner`).
3. For each priority endpoint, fetched the data with both tokens and inspected the returned IDs / `tenant_id` / `pos_user_id` fields for cross-leakage.
4. For owner, attempted query-param override (`?tenant_id=TNT001`) to verify it is ignored.

### Endpoints audited

| Endpoint | Filter strategy | Admin (TNT001 / superadmin) | Owner (TNT002) | Cross-tenant leak? | Verdict |
|---|---|---|---|---|---|
| `GET /api/customers` | superadmin → no filter; others → `tenant_id=eq.${user.tenant_id}` (line 1695) | 5+ rows; tenant_id=null on legacy seed; `user_id` belongs to seed user | `[]` | NO | OK (already correct) |
| `GET /api/customers/:id/payments` | `tenant_id=eq.${tnt}` AND ownership check (line 12669) | OK | OK | NO | OK |
| `GET /api/customers/:id/history` | tenant ownership check + 403 on mismatch (line 7609) | OK | OK | NO | OK |
| `GET /api/products` | `pos_user_id=eq.${resolvePosUserId(req,tnt)}` (line 1361) | 283 rows tenant_id=TNT001 | 0 rows | NO | OK |
| `GET /api/sales` | `pos_user_id=eq.${resolvePosUserId(req,tnt)}` (line 1548) | 100 rows pos_user_id=aaaa…1 | 1 row pos_user_id=bbbb…1 | NO | OK |
| `GET /api/cuts` | `tenant_id=eq.${tnt}` (line 11748) | 1 row tenant_id=TNT001 | 0 rows | NO | OK |
| `GET /api/cuts/:id` | tenant ownership check + 404 on mismatch (line 11774) | OK | OK | NO | OK |
| `GET /api/inventory-movements` | `tenant_id=eq.${tnt}` (line 11897) | 0 rows | 0 rows | NO | OK |
| `GET /api/notifications` | `tenant_id=eq.${tnt}` (line 13361) | 0 rows | 0 rows | NO | OK |
| `GET /api/users` | `tenant_id=eq.${tnt}` for non-superadmin (line 12235) | 0 rows | 0 rows | NO | OK |

### Cross-tenant attack tests

```
GET /api/cuts?tenant_id=TNT001  with OWNER token (TNT002)
→ {"ok":true,"cuts":[],"count":0}     ← override IGNORED
```
The query parameter is honored ONLY when `req.user.role === 'superadmin'` (per `b36IsSuperadmin` check in line 11758-11760). For non-superadmin roles the JWT `tenant_id` always wins.

### Conclusion D1

NO multi-tenant leaks found. All 10 priority endpoints already enforce tenant isolation through one of:

- `tenant_id=eq.${req.user.tenant_id}` filter when the table has `tenant_id`.
- `pos_user_id=eq.${resolvePosUserId(req, tenant_id)}` for legacy `pos_products`/`pos_sales` (a 1:1 user-per-tenant mapping enforced via `resolvePosUserId`).
- Explicit tenant ownership check (`existing[0].tenant_id !== tnt → 404`) on detail/PATCH/DELETE handlers.

NO code changes were required for D1. Existing code already had defense-in-depth.

---

## D2 — Financial reports

All endpoints attached via `attachB41Handlers` IIFE in `api/index.js` lines ~14055–14625.

### `GET /api/reports/cierre-z`

Query params: `date=YYYY-MM-DD` (default: today), `cashier_id=UUID` (optional), `tenant_id=...` (superadmin only).
Auth: `owner | admin | superadmin`.
Returns: opening_balance, sales_breakdown_by_method, gross_total, sales_count, tips_total, total_cash_in, total_cash_out, expected_balance, counted_balance, discrepancy, top_5_products, refunds, voids, **z_number** (sequential `Z-0001` per tenant via `z_report_sequences`), opened_at, closed_at.

Sample call:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/reports/cierre-z?date=2026-04-27"
```

### `GET /api/reports/libro-ventas`

Query: `from`, `to`, `format=json|csv`.
Auth: `owner+`.
Returns per-sale: folio, fecha, RFC (default `XAXX010101000` para público en general), cliente, subtotal, IVA (16% deriv. si no almacenado), total, payment_method, cancelado_at.
CSV: SAT-compatible with proper escaping + `Content-Disposition: attachment`.

Sample:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/reports/libro-ventas?from=2026-04-01&to=2026-04-30&format=csv" \
  -o libro-ventas.csv
```

### `GET /api/reports/kardex`

Query: `product_id=UUID` (required), `from`, `to`.
Auth: `inventario | manager | owner+`.
Returns chronological movements: fecha, tipo, qty, before_stock, after_stock, unit_cost, **cost_avg (running weighted-average)**, inv_value, sale_id, user_id, reason. Includes `running_avg_cost`, `ending_stock`, `ending_inv_value`.

Sample:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/reports/kardex?product_id=2ceba2fb-b669-4154-a405-d1ec8e9fedaf&from=2026-01-01"
```

### `GET /api/reports/estado-resultados`

Query: `from`, `to`.
Auth: `owner+`.
Returns: ingresos_por_ventas, costo_mercancia_vendida (from sale items' cost), utilidad_bruta, gastos_operativos, nomina, **utilidad_neta**, margen_bruto_pct, margen_neto_pct, **por_departamento** (array sorted by ingresos desc).

Sample:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/reports/estado-resultados?from=2026-04-01&to=2026-04-30"
```

### `GET /api/reports/sales-by-hour`

Query: `from`, `to`.
Auth: `owner+`.
Returns 7×24 grid (weekday × hour, UTC) with `{count, total}` per cell + best_hour. Useful for staffing.

Sample:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/reports/sales-by-hour?from=2026-03-27"
```

---

## D3 — Inventory endpoints

### Stock alerts

- `GET /api/inventory/alerts` — products where `stock <= min_stock`, sorted by stock asc. Returns severity (`critical` if 0, `high` if < min/2, `medium`).
- `GET /api/inventory/expiring?days=30` — products with `expiry_date <= now+N days`. Status field: `expired | critical | warning | ok`.
- `POST /api/inventory/min-stock-bulk` body `{updates:[{product_id, min_stock}]}` — bulk update with tenant ownership check + audit log.

### Physical counts (full lifecycle)

- `POST /api/inventory-counts/start` body `{name?, area?, location_id?}` → creates new open count session (with idempotency).
- `POST /api/inventory-counts/:id/items` body `{items:[{product_id, counted_qty}]}` → upserts count items, captures `system_qty` from `pos_products.stock` and `unit_cost`.
- `POST /api/inventory-counts/:id/finalize` → for every item with `counted_qty != system_qty`, creates an `ajuste` movement, updates `pos_products.stock`, marks count `completed`, returns `total_discrepancies`, `adjustments_applied`, `total_value_diff`.
- `GET /api/inventory-counts?status=open|completed&limit=50` — list past counts.
- `GET /api/inventory-counts/:id` — header + items detail.

### Bulk adjust

- `POST /api/inventory/bulk-adjust` body `{adjustments:[{product_id, delta, reason}]}` — idempotent; rejects negative-stock outcomes; creates `ajuste` movement for each.

All endpoints enforce tenant ownership via `pos_user_id == resolvePosUserId(req, tnt)` (non-superadmin) or `tenant_id` filter where applicable.

Sample:
```bash
curl -H "Authorization: Bearer $TOK" \
  "https://salvadorexoficial.com/api/inventory/alerts"

curl -H "Authorization: Bearer $TOK" -H "Idempotency-Key: bulk-$(date +%s)" \
  -X POST https://salvadorexoficial.com/api/inventory/bulk-adjust \
  -d '{"adjustments":[{"product_id":"<UUID>","delta":-3,"reason":"merma"}]}' \
  -H "Content-Type: application/json"
```

---

## D4 — Backup & Offline queue

### Backup

- `POST /api/admin/backup/trigger` (`owner+`) → captures (best-effort, in-process) snapshots of `products`, `customers`, `sales (last 90d)`, `cuts`, `inventory_movements`, `users` (sanitized: no `password_hash`). Persists header in `backups` table; payload as JSONB if ≤ 1MB else marker `_truncated`. Rate-limit: 5/hour/tenant. Idempotent.
- `GET /api/admin/backup/status/:id` → poll header (status, rows_total, payload_size_b, ready_at, expires_at).
- `GET /api/admin/backup/list` → list backups for tenant (most recent 50).
- `POST /api/admin/backup/restore` (`superadmin only`) body `{backup_id, dry_run:true|false, confirm:"RESTAURAR"}`:
  - `dry_run:true` (default) → returns counts of what would be written.
  - Real run requires `confirm:"RESTAURAR"` (typed-word challenge). Marks backup `restored`. Real DML must be applied via SQL maintenance window — frontend must surface that warning. Rate-limit: 3/hour/tenant.

Sample:
```bash
curl -H "Authorization: Bearer $TOK" -H "Idempotency-Key: bk-$(date +%s)" \
  -X POST https://salvadorexoficial.com/api/admin/backup/trigger
# → {"ok":true,"backup_id":"<uuid>","status":"ready","rows_total":284, ...}

curl -H "Authorization: Bearer $TOK" \
  https://salvadorexoficial.com/api/admin/backup/list
```

### Offline sync queue

- `POST /api/sync/queue` body `{operations:[{op_type, endpoint, method, body, idempotency_key, queued_at}], device_id?}`:
  - Whitelisted endpoints: `POST /api/sales`, `POST /api/customers`, `POST /api/customer_payments`, `POST /api/inventory-movements`, `POST /api/sales/pending`, `POST /api/notifications/:id/read`.
  - Server-side replay with tenant scoping forced from JWT.
  - Idempotency keys deduplicated within the batch.
  - Persists session header in `sync_sessions` (`processing | done | partial | error`) with `succeeded`/`failed`/`errors`.
- `GET /api/sync/status?session_id=UUID` → poll status. Without `session_id` returns last 20 sessions for tenant.

Sample:
```bash
curl -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  https://salvadorexoficial.com/api/sync/queue \
  -d '{"operations":[{"endpoint":"/api/sales","method":"POST","body":{"items":[{"id":"<UUID>","qty":1,"price":50}]},"idempotency_key":"sale-1234","queued_at":"2026-04-27T12:00:00Z"}]}'
```

---

## SQL migrations

### Required: `migrations/b41-backups.sql`

Adds tables:

- `backups` (header for snapshots) with RLS by `tenant_id`.
- `sync_sessions` (offline queue replay sessions) with RLS by `tenant_id`.
- `z_report_sequences` (composite PK `tenant_id+z_number`) for fiscal Z-report numbering.

Adds columns (idempotent ALTERs) to `pos_products`:

- `min_stock INTEGER DEFAULT 0`
- `expiry_date DATE`
- `department TEXT`

Plus index on `expiry_date` for fast `expiring` lookups.

Apply:
```bash
psql $DATABASE_URL -f migrations/b41-backups.sql
```

---

## Required env vars

No NEW env vars required. Reuses existing:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` (already required).
- `STRIPE_SECRET_KEY`, `SMTP_HOST` (optional, for B40 endpoints kept untouched).

Optional for future S3 offsite backup (mentioned in `backups.storage_url`):
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (NOT used yet — payload stored inline in JSONB).

---

## Verification

```
$ node --check api/index.js
OK   (no syntax errors)
```

File grew from 14054 → 15562 lines (+1508 lines for B41).
All B41 handlers attached via single IIFE `attachB41Handlers` at file tail (lines 14055–15562).

### What I changed

- Appended one IIFE block at end of `api/index.js` containing 18 new handlers across D2 + D3 + D4.
- Created `migrations/b41-backups.sql` with three new tables + three idempotent ALTERs on `pos_products`.

### What I did NOT change

- No HTML files touched.
- `volvix-feature-flags.js`, `volvix-uplift-wiring.js`, `auth-gate.js` untouched.
- Existing handlers in `handlers` map at module scope (lines 1054–10086) and earlier IIFEs (B36/B37/B40) untouched.
- D1 audit found NO violations, so NO multi-tenant fix code was required.

---

## Next steps (for the deployment team)

1. Apply `migrations/b41-backups.sql` to Supabase.
2. Deploy `api/index.js` via `vercel --prod`.
3. Smoke-test each new endpoint in production with admin and owner tokens (template curls above).
4. Front-end: wire up new endpoints to `volvix-launcher.html` reports + inventory panels.
5. Optional: configure S3 credentials and extend `/api/admin/backup/trigger` to upload payload to offsite when > 1MB (current implementation stores inline JSONB up to ~1MB, then truncates).
