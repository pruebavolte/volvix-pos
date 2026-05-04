# R18 — Shopify Sync (productos + ordenes + inventario + webhook HMAC)

## Resumen
Integracion bidireccional con Shopify Admin API 2024-01. Permite importar productos a `pos_products`, exportar inventario local hacia Shopify, sincronizar ordenes en ambas direcciones y recibir eventos en tiempo real via webhooks con verificacion HMAC.

## Endpoints (api/index.js)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/integrations/shopify/import-products` | admin | GET `/admin/api/2024-01/products.json` -> mapea a `pos_products` + `shopify_mappings` |
| POST | `/api/integrations/shopify/export-products` | admin | Push `pos_products` -> Shopify (POST `/products.json`) |
| POST | `/api/integrations/shopify/sync-orders` | auth  | Pull ordenes Shopify desde `since` + push ordenes locales pendientes |
| POST | `/api/integrations/shopify/webhook` | HMAC | Recibe `orders/create`, `products/update` con verify SHA256 timing-safe |

Si faltan `SHOPIFY_ACCESS_TOKEN` o `SHOPIFY_SHOP_DOMAIN` se devuelve 503 con `{error:"shopify_not_configured", missing:"..."}`. El webhook devuelve 503 si falta `SHOPIFY_WEBHOOK_SECRET`, y 401 si el HMAC no valida.

## Variables de entorno

```
SHOPIFY_ACCESS_TOKEN=shpat_xxx        # Admin API token (privado)
SHOPIFY_SHOP_DOMAIN=mi-tienda.myshopify.com
SHOPIFY_WEBHOOK_SECRET=xxxxxxxxxxxx   # Para verificar X-Shopify-Hmac-Sha256
SHOPIFY_API_VERSION=2024-01           # Opcional (default 2024-01)
```

## Schema SQL (db/R18_SHOPIFY.sql)

- `shopify_sync_state(tenant_id, last_product_sync, last_order_sync, last_inventory_sync, updated_at)`
- `shopify_mappings(internal_id, shopify_id, type)` con UNIQUE(type, shopify_id) y UNIQUE(type, internal_id)
- Trigger `touch_shopify_sync_state` para mantener `updated_at`
- RLS habilitado, seed `tenant_id='default'`

## Cliente JS (volvix-shopify-wiring.js)

`window.ShopifyAPI` expone:
- `configure({apiBase, authToken})`
- `importProducts()` / `exportProducts()`
- `syncOrders(since?)`
- `startAutoSync(ms)` / `stopAutoSync()`
- `status()` -> `{apiBase, lastSync, autoSyncActive}`
- `on(event, fn)` -> eventos: `products:imported`, `products:exported`, `orders:synced`, `error`

## Verificacion HMAC (webhook)

```js
const digest = crypto.createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
  .update(rawBody, 'utf8').digest('base64');
crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerHmac));
```

Topicos soportados: `orders/create` (inserta en `pos_sales`), `products/update` (upsert en `pos_products`).

## Mapping Shopify -> POS

| Shopify | POS | Nota |
|---------|-----|------|
| `product.id` | `shopify_mappings.shopify_id` | `type='product'` |
| `variant.sku` | `pos_products.sku` | fallback `shopify-{id}` |
| `variant.price` | `pos_products.price` | parseFloat |
| `variant.inventory_quantity` | `pos_products.stock` | parseInt |
| `order.id` | `pos_sales.external_id` | prefijo `shopify-` |
| `order.total_price` | `pos_sales.total` | |
| `order.financial_status` | `pos_sales.status` | |

## Pruebas manuales

```bash
# 503 si falta env
curl -X POST localhost:3000/api/integrations/shopify/import-products
# {"ok":false,"error":"shopify_not_configured","missing":"SHOPIFY_ACCESS_TOKEN"}

# Configurado
SHOPIFY_ACCESS_TOKEN=shpat_xxx SHOPIFY_SHOP_DOMAIN=demo.myshopify.com node api/index.js
curl -X POST -H "Authorization: Bearer admin_jwt" \
  localhost:3000/api/integrations/shopify/import-products
```

## Estado
- Endpoints: 4/4 implementados
- 503 guard: ok
- HMAC verify: timing-safe (crypto.timingSafeEqual)
- Bidireccional: pull (Shopify -> POS) + push (POS -> Shopify)
- Webhook: orders/create + products/update
