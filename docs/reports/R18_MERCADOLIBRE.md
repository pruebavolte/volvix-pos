# R18 · MercadoLibre Integration (LATAM)

**Fecha:** 2026-04-26
**Sites soportados:** MLM (MX), MLA (AR), MLB (BR), MCO (CO), MLC (CL)
**Default site:** MLM (`MERCADOLIBRE_SITE`)

## Variables de entorno

| Var | Requerida | Descripción |
|---|---|---|
| `MERCADOLIBRE_APP_ID` | sí | App ID de la aplicación ML |
| `MERCADOLIBRE_APP_SECRET` | sí | Secret de la aplicación ML |
| `MERCADOLIBRE_REDIRECT_URI` | sí | URL del callback OAuth (debe coincidir con la registrada en ML) |
| `MERCADOLIBRE_SITE` | no | MLM por default |

## Endpoints API (`api/index.js` + `api/mercadolibre-wiring.js`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/integrations/mercadolibre/oauth-callback` | JWT | Canjea `code` por `access_token` + `refresh_token` (POST a `api.mercadolibre.com/oauth/token`) y los persiste en `ml_oauth_tokens`. |
| POST | `/api/integrations/mercadolibre/sync-listings` | JWT | Toma `pos_products` (todos los `active=true` o sólo `product_ids` enviados) y los publica en ML vía `POST /sites/{site}/items`. Persiste cada resultado en `ml_listings` con `status` (`active` / `error`) y `last_sync`. |
| POST | `/api/integrations/mercadolibre/orders/webhook` | público | Recibe notificaciones ML (`topic=orders_v2`). Si tenemos token del `user_id` enriquecemos con `GET {resource}`; persistimos en `ml_orders`. |
| GET | `/api/integrations/mercadolibre/orders` | JWT | Lista las últimas 100 órdenes ML del tenant (desc por `received_at`). |
| GET | `/api/integrations/mercadolibre/health` | público | `{ configured, site, app_id_set }` |

## Esquema SQL (`db/R18_MERCADOLIBRE.sql`)

- `ml_oauth_tokens(tenant_id UNIQUE, ml_user_id, access_token, refresh_token, expires_at, site_id, ...)`
- `ml_listings(tenant_id, internal_id → pos_products.id, ml_id, status, last_sync, last_error, ...)` con UNIQUE `(tenant_id, internal_id)`
- `ml_orders(ml_order_id UNIQUE, tenant_id, buyer_nick, total_amount, currency_id, status, raw JSONB)`

## Flujo OAuth (LATAM)

1. Owner pulsa `#btn-mercadolibre-connect` → redirige a `auth.mercadolibre.com.{tld}/authorization?response_type=code&client_id=…&redirect_uri=…`.
2. ML redirige con `?code=…&state=mercadolibre` al frontend.
3. `volvix-mercadolibre-wiring.js` detecta `state=mercadolibre`, hace `POST /oauth-callback`.
4. Backend canjea `code` por tokens y guarda en `ml_oauth_tokens` (UPSERT por `tenant_id`).

## Cliente (owner panel)

`volvix-mercadolibre-wiring.js` expone `window.VolvixMercadoLibre` y vincula 3 botones del panel:
- `#btn-mercadolibre-connect` → inicia OAuth
- `#btn-mercadolibre-sync` → POST sync-listings
- `#btn-mercadolibre-orders` → GET orders

## Wiring del backend

El módulo es auto-loadable (sigue patrón R17). Para registrarlo desde `api/index.js`:

```js
require('./mercadolibre-wiring').register({
  handlers, supabaseRequest, sendJSON, sendError, readBody, requireAuth, https
});
```

Si el master-controller tiene auto-loader de wirings, basta con dejar el archivo en `api/`.

## Pendientes / siguientes iteraciones

- Refresh token automático cuando `expires_at` está vencido (usar `/oauth/token` con `grant_type=refresh_token`).
- Subir imágenes (POST `/pictures`) antes de crear el item para items con múltiples fotos.
- Reverso: `pos_sales` ← `ml_orders` (crear venta interna automáticamente).
- Validar `category_id` correcto por producto (predictor `/sites/{site}/category_predictor/predict`).
