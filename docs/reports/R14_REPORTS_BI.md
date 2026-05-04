# R14 — Reportes BI reales (Volvix POS)

Sustituye los charts/placeholders de `pos-reportes.html` por datos reales agregados desde Supabase.

## Entregables

| Archivo | Propósito |
|---|---|
| `db/R14_REPORTS_VIEWS.sql` | Materialized views + RPC functions de PostgreSQL |
| `server.js` (modificado) | 7 endpoints `/api/reports/*` + `/api/reports/refresh` |
| `public/volvix-reports-real-wiring.js` | Bindings Chart.js usando `Volvix.auth.fetch` |
| `R14_REPORTS_BI.md` | Este documento |

## Endpoints (admin / owner)

Todos requieren header `Authorization: Bearer <access_token>` (o `ADMIN_API_KEY` para server-to-server). El rol se resuelve desde `volvix_usuarios.rol`.

| Método | Endpoint | Query params |
|---|---|---|
| GET | `/api/reports/sales/daily` | `from`, `to`, `tenant_id` |
| GET | `/api/reports/sales/by-product` | `from`, `to`, `tenant_id`, `top` (default 10, max 100) |
| GET | `/api/reports/sales/by-cashier` | `from`, `to`, `tenant_id` |
| GET | `/api/reports/inventory/value` | `tenant_id` |
| GET | `/api/reports/customers/cohort` | `tenant_id` |
| GET | `/api/reports/profit` | `from`, `to`, `tenant_id` |
| GET | `/api/reports/abc-analysis` | `from`, `to`, `tenant_id` |
| POST | `/api/reports/refresh` | (refresca las 3 MVs) |

Defaults:
- `from` = ahora − 30 días; `to` = ahora
- `tenant_id` = el del usuario autenticado si se omite

## Materialized Views

| MV | Granularidad | Refresh sugerido |
|---|---|---|
| `mv_sales_daily` | tenant + día | cada 15 min (CONCURRENTLY) |
| `mv_top_products` | tenant + día + producto (jsonb expand) | cada 30 min |
| `mv_inventory_value` | tenant + categoría | cada 5 min |

Estrategia A — `pg_cron` (recomendada en Supabase):
```sql
create extension if not exists pg_cron;
select cron.schedule('refresh_mv_sales_daily',  '*/15 * * * *',
  $$ refresh materialized view concurrently mv_sales_daily $$);
select cron.schedule('refresh_mv_top_products', '*/30 * * * *',
  $$ refresh materialized view mv_top_products $$);
select cron.schedule('refresh_mv_inventory_value','*/5 * * * *',
  $$ refresh materialized view mv_inventory_value $$);
```

Estrategia B — manual / on-demand: `POST /api/reports/refresh` invoca `refresh_all_reports()`.

## RPC Functions (SQL)

| Función | Devuelve |
|---|---|
| `refresh_all_reports()` | void; refresca las 3 MVs |
| `report_sales_by_cashier(p_tenant_id, p_from, p_to)` | cajero, tickets, venta_total, ticket_promedio |
| `report_profit(p_tenant_id, p_from, p_to)` | día, ingreso, costo, utilidad, margen_pct |
| `report_abc_analysis(p_tenant_id, p_from, p_to)` | producto_id, nombre, unidades, ingreso, %, %_acum, clase A/B/C |
| `report_customers_cohort(p_tenant_id)` | cohorte_mes, clientes, retenidos 30/60/90, % |

## Lógica clave

- **ABC**: clase A = top 80% acumulado del ingreso; B = siguiente 15%; C = último 5%.
- **Profit**: costo unitario se toma de `items.costo` si existe en el JSON, si no se hace lookup contra `volvix_productos.costo` por `producto_id`.
- **Cohort**: como **no existe `volvix_clientes`**, se usa `volvix_ventas.cajero` como proxy del identificador de cliente. Si más adelante se agrega `volvix_clientes`, reemplazar `coalesce(cajero, 'anon')` por `cliente_id` en `report_customers_cohort`.
- **Filtros**: solo cuentan ventas con `estado = 'completada'`.

## Frontend wiring (`volvix-reports-real-wiring.js`)

Expone `window.VolvixReports` con:

- `init()` — auto-llamado al `DOMContentLoaded`; busca canvases con IDs `chartSalesDaily`, `chartTopProducts`, `chartByCashier`, `chartInventoryValue`, `chartCohort`, `chartProfit`, `chartABC`.
- `loadAll(from?, to?)` — refresca todos.
- Funciones individuales: `loadSalesDaily`, `loadTopProducts`, `loadByCashier`, `loadInventoryValue`, `loadCohort`, `loadProfit`, `loadABC`.
- KPIs textuales (si los `<span id>` existen): `kpiVentaTotal`, `kpiTickets`, `kpiTicketProm`, `kpiInventarioValor`, `kpiIngreso`, `kpiCosto`, `kpiUtilidad`, `kpiMargenPct`.
- Controles opcionales: `#btnRefreshReports`, `#rangeFrom`, `#rangeTo`, `#btnApplyRange`, `#tableABC`.

Integración en `pos-reportes.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="auth-gate.js" defer></script>
<script src="volvix-api.js" defer></script>
<script src="volvix-reports-real-wiring.js" defer></script>
```

## Despliegue

1. Ejecutar `db/R14_REPORTS_VIEWS.sql` en Supabase SQL editor.
2. (Opcional) Habilitar `pg_cron` y registrar los 3 jobs.
3. Reiniciar el servidor Node — los nuevos endpoints se exponen en `/api/reports/*`.
4. Incluir `volvix-reports-real-wiring.js` en `pos-reportes.html` y verificar que existan los canvases con los IDs esperados.

## Pendientes / observaciones

- **`api/index.js`** no existe en este repo (el backend es `server.js` Node-HTTP plano). Los endpoints se agregaron a `server.js`, que es el archivo real de producción.
- **`volvix_clientes`** no existe → cohort usa `cajero` como proxy. Decisión pendiente con auditor.
- `volvix_ventas.items` se asume con la forma `{producto_id|id, nombre, cantidad, precio, costo?}`. Si el schema real difiere, ajustar `mv_top_products` y `report_profit`.
