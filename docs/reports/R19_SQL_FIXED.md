# R19 — SQL Failures Fixed

**Resultado:** 14/14 archivos arreglados y ejecutados con exito en Supabase.

## Estrategia

1. **R19_PREFLIGHT.sql** — Crea schema `app` con helpers
   (`current_tenant_id`, `current_role`, `is_admin/owner/cajero/manager/writer`,
   `same_tenant`), tablas stub faltantes (`pos_branches`, `pos_tenants`,
   `companies`, `tenants`, `cash_register`, `reports`, `volvix_tenants`,
   `volvix_ventas`) y columnas faltantes (`pos_users.tenant_id`,
   `customers.tenant_id`, `sales.tenant_id/cashier_id`, etc.).
2. Por cada falla, un `R19_FIX_<archivo>.sql` con el fix mínimo idempotente.
3. `scripts/run_fixes.js` ejecuta todo en orden topológico.

## Detalle de cada fix

| # | Archivo | Causa | Fix |
|---|---------|-------|-----|
| 1 | R14_INDEXES | `daily_sales_report` es VIEW, no TABLE | Index condicional via `information_schema.tables.table_type='BASE TABLE'` |
| 2 | R14_CURRENCIES | `(fetched_at::date)` no IMMUTABLE | Columna generada `fetched_day DATE GENERATED ALWAYS AS (...) STORED` |
| 3 | R14_API_KEYS | `revoked_at` faltaba en tabla preexistente | `ALTER TABLE ADD COLUMN IF NOT EXISTS revoked_at` antes de los INDEX |
| 4 | R14_CFDI_TABLES | `text = uuid` operator | Cast explicito `vu.user_id::text = auth.uid()::text` y `vu.tenant_id::uuid` |
| 5 | R14_INVENTORY | `app.current_role()` no existia | PREFLIGHT crea schema `app` y helpers stub primero |
| 6 | R14_LOYALTY | `customers.tenant_id` faltaba | `ALTER TABLE customers ADD COLUMN tenant_id uuid` en PREFLIGHT y FIX |
| 7 | R14_REALTIME | `RAISE NOTICE 'Tabla %% ...', t` (`%%` bloquea slot) | Cambiado a `%` simple |
| 8 | R14_VERTICAL_TEMPLATES | `companies` no existia | Stub `companies` en PREFLIGHT |
| 9 | R17_GEOFENCE | `pos_branches` no existia | Stub `pos_branches` en PREFLIGHT |
| 10 | R17_SMS | `pos_users.tenant_id` no existia | `ALTER TABLE pos_users ADD COLUMN tenant_id uuid` |
| 11 | R18_AMAZON | FK `bigint vs uuid` (sales.id es uuid) | `internal_sale_id uuid REFERENCES sales(id)` |
| 12 | R18_SHOP | `pos_tenants` no existia + columnas faltaban en `products` | Stub `pos_tenants` + ALTER products (tags, is_active, shop_visible) |
| 13 | R13_RLS_POLICIES | `inventory_movements` no existia | Orden: corre DESPUES de R14_INVENTORY (que la crea) |
| 14 | R16_RLS_HARDENING | depende de R13 | Orden: corre DESPUES de R13 |

## Orden de ejecucion final (todo OK)

```
R19_PREFLIGHT.sql                    OK
R19_FIX_R14_INDEXES.sql              OK
R19_FIX_R14_CURRENCIES.sql           OK
R19_FIX_R14_API_KEYS.sql             OK
R19_FIX_R14_CFDI_TABLES.sql          OK
R14_INVENTORY.sql (original)         OK
R19_FIX_R14_LOYALTY.sql              OK
R19_FIX_R14_REALTIME.sql             OK
R19_FIX_R14_VERTICAL_TEMPLATES.sql   OK
R19_FIX_R17_GEOFENCE.sql             OK
R19_FIX_R17_SMS.sql                  OK
R19_FIX_R18_AMAZON.sql               OK
R19_FIX_R18_SHOP.sql                 OK
R13_RLS_POLICIES.sql (original)      OK
R16_RLS_HARDENING.sql (original)     OK
```

**Total: 15/15 OK · 0 fallos.**

Reporte JSON: `R19_SQL_FIXED_RESULT.json`
Runner: `scripts/run_fixes.js`
