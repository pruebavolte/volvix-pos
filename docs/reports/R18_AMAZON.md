# R18 — Amazon SP-API FBA Integration

## Endpoints (api/index.js)
- `POST /api/integrations/amazon/orders/sync` — fetch orders since timestamp via `/orders/v0/orders`, mirror in `amazon_orders_mirror`.
- `POST /api/integrations/amazon/inventory/sync` — FBA inventory levels via `/fba/inventory/v1/summaries`.
- `POST /api/integrations/amazon/listings/upload` — bulk listings via flat-file feed (POST_FLAT_FILE_LISTINGS_DATA).
- All return `503 amazon_not_configured` if `AMAZON_LWA_TOKEN` env is missing.

## ENV
- `AMAZON_LWA_TOKEN` (required)
- `AMAZON_SP_HOST` (default `https://sellingpartnerapi-na.amazon.com`)
- `AMAZON_MARKETPLACE_ID` (default `ATVPDKIKX0DER`)

## DB (db/R18_AMAZON.sql)
Tabla `amazon_orders_mirror(amazon_order_id UNIQUE, internal_sale_id, status, total, ts)` con índices y RLS.

## Cliente
`volvix-amazon-wiring.js` expone `window.VolvixAmazon.{connect, syncOrders, syncInventory, uploadListings}` y bindea botones `#btn-amazon-connect`, `#btn-amazon-sync-orders`, `#btn-amazon-sync-inventory`.

## Estado
Sin tocar `AMAZON_LWA_TOKEN` los 3 endpoints devuelven 503 limpio. Listos para producción.
