# R17 — BUNDLES (Combos / Packs de productos)

## Resumen
Sistema de combos: un "bundle" es un producto virtual cuya venta descuenta stock de varios productos físicos (componentes) en proporciones definidas.

## SQL — `db/R17_BUNDLES.sql`
- Tabla **`product_bundles`** (id, tenant_id, name, sku, price, components jsonb, active, timestamps).
- `components` es JSONB: `[{"product_id": 1, "qty": 2}, ...]`.
- RLS por `tenant_id` (`current_setting('app.tenant_id')`).
- Índices: `(tenant_id, active)` y GIN sobre `components`.
- Columna añadida: `sale_items.bundle_id` (FK opcional).
- Trigger **`fn_bundle_explode_stock`** (AFTER INSERT en `sale_items`):
  - Si `NEW.bundle_id` IS NOT NULL, expande los componentes y descuenta stock proporcional (`comp.qty * NEW.qty`) por cada `product_id`.
  - Escribe en `stock_movements` con `reason='bundle_sale'`.
- Trigger `fn_bundles_touch` mantiene `updated_at`.

## API — `api/index.js`
Bloque `(function wireBundles(){ ... })()` insertado entre el bloque de productos y el de promociones:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/bundles` | Lista combos activos del tenant |
| POST | `/api/bundles` | Crea combo `{name, sku?, price, components:[{product_id,qty}]}` |
| PATCH | `/api/bundles/:id` | Actualiza campos (incl. components) |
| DELETE | `/api/bundles/:id` | Soft delete (`active=false`) |
| POST | `/api/bundles/:id/expand` | Devuelve `items:[{product_id,qty}]` multiplicados por `body.qty` |

**Hook en `POST /api/sales`**: el handler original se envuelve. Si un item viene con `bundle_id`, se expande en múltiples sale_items (cada uno con `product_id`, `qty * factor`, y se preserva `bundle_id` para auditoría/trigger).

Aislamiento multi-tenant: `tenant_id` se extrae de `req.user.tenant_id` (JWT) con fallback a header `x-tenant-id`. Fallback de almacenamiento in-memory (`global.__bundles`) para entornos sin Postgres.

## Cliente — `volvix-bundles-wiring.js`
Script auto-cargable, patrón `volvix-*-wiring.js`:
- Pestaña **Combos** dentro del F3 Productos (auto-monta si detecta `[data-f3-tabs]`, `.f3-products-tabs`, o `#productsTabs`).
- API global: `window.VolvixBundles.open()` para invocación manual.
- Editor con dos columnas:
  - Lista de productos con búsqueda y `draggable`.
  - Drop-zone que acepta `dragover`/`drop`, agrupa duplicados sumando `qty`, permite editar cantidad por componente y eliminar.
- Campos: nombre, SKU, precio. Validación: nombre + ≥1 componente.
- Operaciones: nuevo / editar / soft-delete / refrescar.

## Integración con ventas
1. POS envía `POST /api/sales` con `items:[{bundle_id:X, qty:N}]`.
2. API expande server-side a múltiples sale_items.
3. Al insertarse en BD, el trigger descuenta stock por componente y registra `stock_movements`.

## Pendientes / Notas
- Migración `sale_items.bundle_id` debe correr antes de habilitar el trigger.
- El precio del combo se factura una sola vez (los componentes expandidos se generan con su `product_id` real para inventario, pero el cobro debe usar `price` del bundle — el handler de sales original deberá respetar esto si descuenta precios por línea).
- Reporte de margen por combo: pendiente para R18.
