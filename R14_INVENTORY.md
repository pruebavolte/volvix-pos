# R14 — Inventario avanzado (multi-ubicación)

Fecha: 2026-04-26
Stack target: `C:\Users\DELL\Downloads\verion 340\` (NO `D:\github\volvix-pos`)

## 1. Resumen ejecutivo

Se construyó un módulo de inventario multi-ubicación encima del POS Volvix
existente (R13). Cubre catálogo de ubicaciones, stock por (producto, ubicación),
auditoría completa de movimientos (entrada / salida / transferencia / ajuste /
merma) y conteos físicos con varianza calculada.

Toda la capa de datos respeta el patrón RLS de R13 (`tenant_id`,
`app.is_admin/owner/cajero/manager`). Los cajeros tienen acceso de solo lectura
a stock y ubicaciones; movimientos y ajustes requieren `admin / owner / manager`.

## 2. Archivos entregados

| Archivo | Propósito |
|---|---|
| `db/R14_INVENTORY.sql` | Esquema, índices, RLS, función `app.apply_inventory_movement()` |
| `api/index.js` (modificado) | 9 endpoints REST nuevos bajo `/api/inventory/*` |
| `volvix-inventory-advanced-wiring.js` | Helpers UI (fetch + render básico) |
| `R14_INVENTORY.md` | Este reporte |

## 3. Esquema SQL (`db/R14_INVENTORY.sql`)

Tablas creadas (todas con `tenant_id` + RLS habilitado):

- **`inventory_locations`** — `id uuid pk`, `tenant_id`, `name`, `type` ∈
  {`warehouse`, `branch`, `transit`}, `is_active`, `created_at`. Índices:
  `(tenant_id)`, `(tenant_id, type)`.

- **`inventory_stock`** — `(product_id, location_id)` PK, `tenant_id`, `qty`,
  `reserved_qty`, `reorder_point`, `updated_at`. Índices: `(tenant_id, location_id)`,
  `(product_id)`, índice parcial `WHERE qty <= reorder_point` para low-stock.

- **`inventory_movements`** — `id uuid pk`, `tenant_id`, `product_id`,
  `from_loc`, `to_loc`, `qty (>0)`, `type` ∈ {`in`,`out`,`transfer`,`adjust`,`loss`},
  `reason`, `user_id`, `ts`. Índices: `(tenant_id, ts DESC)`, `(product_id)`,
  `(from_loc)`, `(to_loc)`.

- **`inventory_counts`** — `id`, `tenant_id`, `location_id`, `status` ∈
  {`open`,`counting`,`finalized`,`cancelled`}, `started_at`, `finished_at`,
  `user_id`. Índices: `(tenant_id, location_id)`, `(tenant_id, status)`.

- **`inventory_count_lines`** — `id`, `tenant_id`, `count_id` (FK CASCADE),
  `product_id`, `expected`, `counted`,
  `variance numeric GENERATED ALWAYS AS (counted - expected) STORED`,
  `noted_at`, `UNIQUE(count_id, product_id)`.

### RLS

Sigue el patrón de `db/R13_RLS_POLICIES.sql`:

- `admin`  : ALL en cualquier tenant.
- `owner`  : ALL dentro del propio tenant (vía `app.is_writer()`).
- `manager`: ALL dentro del propio tenant (rol nuevo, helper `app.is_manager()`).
- `cajero` : SELECT en `inventory_locations` y `inventory_stock`. Sin acceso a
  movimientos / counts (default-deny). Decrementos por venta deben pasar por
  `service_role` o un trigger `SECURITY DEFINER`, igual que R13.

### Helper SQL — `app.apply_inventory_movement(...)` (`SECURITY DEFINER`)

Encapsula la mutación atómica:

- `in`        → `+qty` en `to_loc` (UPSERT).
- `out`/`loss`→ `-qty` en `from_loc` (falla si no hay fila).
- `transfer`  → `-qty` en `from_loc` y `+qty` en `to_loc`.
- `adjust`    → fija `qty` absoluta en `to_loc`. **Exige `reason` no vacío.**
- Inserta siempre la fila de auditoría en `inventory_movements`.

## 4. Endpoints API (`api/index.js`)

Inyectados vía IIFE `attachInventoryAdvanced()` después del bloque
`attachTop10Handlers()` (línea ~1206). Todos detrás de `requireAuth`. Los
escritores requieren rol ∈ {`admin`, `superadmin`, `owner`, `manager`} —
cualquier otro rol (incluido `cajero`) recibe **403** en escritura. Lectura
sigue las reglas de RLS del JWT.

| Método | Ruta | Rol | Validación |
|---|---|---|---|
| GET   | `/api/inventory/locations` | auth | filtro opcional `?type=` |
| POST  | `/api/inventory/locations` | writer | `name` no vacío, `type` ∈ enum |
| PATCH | `/api/inventory/locations/:id` | writer | UUID, campos whitelisted |
| GET   | `/api/inventory/stock` | auth | UUIDs, `low_stock=true` filtra `qty <= reorder_point` |
| POST  | `/api/inventory/movements` | writer | UUID `product_id`, `type` ∈ {in,out,transfer,loss}, `qty>0`, locs según tipo |
| POST  | `/api/inventory/adjust` | writer | UUID product+location, `new_qty>=0`, **`reason` obligatorio** |
| POST  | `/api/inventory/counts/start` | writer | UUID `location_id` |
| POST  | `/api/inventory/counts/:id/lines` | writer | acepta `{lines:[…]}` o línea única; UUIDs y números válidos |
| POST  | `/api/inventory/counts/:id/finalize` | writer | aplica varianza vía `apply_inventory_movement(adjust)`, marca `status='finalized'` |

Las mutaciones de stock pasan siempre por la RPC `apply_inventory_movement` —
el endpoint no toca `inventory_stock` directamente, evitando estados
inconsistentes entre stock y la bitácora de movimientos.

> Nota: existía un `POST /api/inventory/adjust` legacy (línea 924) que
> sobrescribía `pos_products.stock` directamente. La nueva versión lo
> **reemplaza** asignándose después en `handlers[...]`, manteniendo la URL
> compatible pero exigiendo ahora `location_id` y `reason`.

## 5. Frontend wiring (`volvix-inventory-advanced-wiring.js`)

Expone `window.VolvixInventory` con:

- `listLocations / createLocation / updateLocation`
- `getStock({location_id, product_id, lowStock})`
- `moveIn / moveOut / moveTransfer / moveLoss / adjust`
- `startCount / addCountLines / finalizeCount`
- Render helpers: `renderLocations(el)`, `renderStock(el, {lowStock})`,
  `renderMovementForm(el, defaults)`

Lee el JWT desde `localStorage.volvix_token` (mismo patrón que `auth-helper.js`
del proyecto).

## 6. Validación

```bash
$ node --check api/index.js                              # OK
$ node --check volvix-inventory-advanced-wiring.js       # OK
```

## 7. Pendientes / próximos pasos sugeridos

1. Ejecutar `db/R14_INVENTORY.sql` en Supabase del tenant target.
2. Migrar el `pos_products.stock` legacy a filas de `inventory_stock`
   (warehouse default por tenant) — no incluido aquí.
3. Trigger `SECURITY DEFINER` para que `pos_sales` decremente
   `inventory_stock` automáticamente al cobrar (hoy lo hacía sobre
   `pos_products.stock`).
4. Agregar el rol `manager` a la enumeración de roles si aún no existe en
   `pos_users`.
