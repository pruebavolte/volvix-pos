# R17 — Multi-Warehouse / Multi-Bodega Global con Geolocalización

**Fecha:** 2026-04-26
**Slice:** 104 (idx 2080-2100)
**Extiende:** R14_INVENTORY

## Resumen

Soporte multi-bodega global por tenant con geolocalización (lat/lng), zonas
internas (storage, picking, shipping, returns), stock por bodega, transferencias
con tracking, y recomendación de la bodega más cercana mediante fórmula
Haversine 100% en SQL.

## Entregables

| Archivo | Tipo | Estado |
|---|---|---|
| `db/R17_WAREHOUSES.sql` | DDL Postgres | nuevo |
| `api/index.js` | 5 endpoints añadidos | parcheado |
| `volvix-warehouses-wiring.js` | Cliente + mapa Leaflet (CDN) | nuevo |
| `R17_WAREHOUSES.md` | este reporte | nuevo |
| `live_status/slice_104.json` | snapshot | nuevo |

## Modelo de datos

### `inventory_warehouses`
Bodegas del tenant con coordenadas, país, capacidad y bandera `is_main`
(unique parcial: una sola main por tenant). Constraints CHECK en lat/lng/cap.

### `warehouse_zones`
Zonas internas; `type` restringido a `storage | picking | shipping | returns`.
Único por (warehouse_id, code).

### `stock_per_warehouse`
PK compuesta `(product_id, warehouse_id)`. `qty NUMERIC(14,3) >= 0`.

### `warehouse_transfers`
Auditoría de transferencias entre bodegas: status (`pending|in_transit|received|cancelled`),
`tracking_code`, FK a inventory_warehouses, CHECK from <> to.

### `nearest_warehouse(lat, lng, p_tenant_id?)`
PL/pgSQL stable. Haversine puro (radio 6371 km). Filtra bodegas con coords
no nulas y opcionalmente por tenant. Devuelve `BIGINT` (id) o NULL.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET  | `/api/warehouses` | Bodegas del tenant (orden is_main desc, name asc) |
| POST | `/api/warehouses` | Crea bodega; auto-geocode address si faltan coords (placeholder) |
| GET  | `/api/warehouses/:id/stock` | Stock por producto en una bodega |
| POST | `/api/warehouses/transfer` | Crea transferencia + tracking_code |
| GET  | `/api/warehouses/optimal?customer_id=…` | Recomienda bodega más cercana |

Todas pasan por `requireAuth`, usan `resolveTenant(req)` (R13 hardening,
nunca confía en query/body), y respetan helpers `sendValidation` /
`sendError` (R15 4xx schema). El endpoint `optimal` invoca la RPC SQL
`nearest_warehouse`; si no está instalada cae a fallback Haversine en JS.

### Geocoder
`geocodeAddress` es un **placeholder** determinístico con seeds para CDMX,
Monterrey, GDL, Madrid, Bogotá, BA, Lima. Para producción intercambiar
por Google Geocoding / Mapbox / Nominatim antes del lanzamiento global.

## Cliente (`volvix-warehouses-wiring.js`)

`window.VolvixWarehouses` expone: `list`, `create`, `stock`, `transfer`,
`optimal`, `mountMap(elId)`. `mountMap` carga Leaflet 1.9.4 desde unpkg
(CDN), pinta tiles OSM, hace `fitBounds` sobre los pins de bodegas,
y popup con botón "Ver stock". Token JWT desde localStorage
(`volvix_token` o `token`).

## Plan de pruebas

1. Aplicar `db/R17_WAREHOUSES.sql` (idempotente: usa IF NOT EXISTS).
2. `POST /api/warehouses` con `{name:"WH-CDMX",address:"CDMX",is_main:true,capacity_units:5000}`.
3. `GET /api/warehouses` → debe regresar la nueva bodega con lat≈19.43.
4. `POST /api/warehouses/transfer` entre dos bodegas → status `pending` + `tracking_code`.
5. `GET /api/warehouses/optimal?lat=20.66&lng=-103.35` → recomienda la más cercana.

## Compatibilidad

- No rompe R14_INVENTORY: tablas nuevas en su propio namespace.
- No interfiere con `inventory_movements` ni `pos_products`.
- RLS pendiente: aplicar políticas tenant en R17 vía `R16_RLS_HARDENING.sql`.

## Pendientes (futuro)

- Activar RLS por `tenant_id` en las 4 tablas nuevas (R18).
- Reemplazar `geocodeAddress` placeholder por proveedor real.
- UI de transferencias y vista de stock por bodega.
- Webhook al cambiar `status` de transferencia.
