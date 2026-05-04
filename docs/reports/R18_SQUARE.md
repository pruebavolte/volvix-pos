# R18 — Square POS Integration

## Resumen
Integracion completa con Square POS (https://connect.squareup.com) para
sincronizacion de catalogo de productos hacia `pos_products` y recepcion
de eventos de webhook (orders, payments).

## Variables de entorno
- `SQUARE_ACCESS_TOKEN` (obligatoria) — Bearer token de Square Developer
- Si falta → todos los endpoints retornan **503 square_not_configured**

## Endpoints API (`api/index.js`, IIFE)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/integrations/square/sync` | admin/superadmin/owner | Llama `GET /v2/catalog/list?types=ITEM` y upsertea cada item en `pos_products` (match por `external_id`) |
| GET  | `/api/integrations/square/status` | publica | Verifica conexion via `/v2/locations` + ultima sync |
| POST | `/api/integrations/square/webhook` | publica | Recibe eventos `order.created`, `order.updated`, `payment.created`, `payment.updated` y los persiste |
| GET  | `/api/integrations/square/health` | publica | Health widget Volvix |

### Mapeo Square → pos_products
- `item_data.name` → `name`
- `item_data.description` → `description`
- `variations[0].item_variation_data.sku` → `sku` (fallback: `obj.id`)
- `variations[0].item_variation_data.price_money.amount` → `price` (cents → MXN)
- `obj.id` → `external_id`
- constante `'square'` → `source`

## Base de datos (`db/R18_SQUARE_SYNC.sql`)
Crea tabla `square_sync_log(id UUID, type, status, items_synced, meta JSONB, ts, tenant_id)`,
indices y RLS (lectura solo admin/owner). Agrega `external_id` y `source` a `pos_products`.

## Cliente (`volvix-square-wiring.js`)
Inyecta widget en `#owner-integrations` con:
- Punto de estado (verde/rojo) + info de locations + ultima sync
- Boton "Importar de Square" → llama `POST /api/integrations/square/sync`
- Manejo de 503 con mensaje claro al owner

Expone `window.VolvixSquare = { fetchStatus, runSync, mount }`.

## Status
- API: 4 handlers registrados antes del cierre del IIFE
- SQL: lista para `psql` o Supabase SQL editor
- Cliente: vanilla JS, sin dependencias, auto-monta con MutationObserver
- Webhook: idempotente, registra todo evento (handled o ignored)
