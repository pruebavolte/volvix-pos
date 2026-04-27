# R18 — E-COMMERCE STOREFRONT (Volvix Shop)

## Resumen
Storefront público (sin login) que permite a clientes finales navegar el catálogo de un tenant, agregar al carrito y hacer checkout como invitado. Las ventas se registran en `sales` con `source='shop'` y `meta.role='guest_checkout'`.

## Archivos
- `volvix-shop.html` — Cliente UI (vanilla, sin build). Catálogo, filtros, mini-cart con localStorage, modal checkout, lookup de pedidos.
- `api/shop.js` — Módulo registrado en handlers de `api/index.js`.
- `db/R18_SHOP.sql` — Migración: `pos_tenants.shop_*`, `products.shop_visible`, `sales.source/guest_email/shipping_address`, vista `shop_public_products`.

## Endpoints (todos públicos, sin auth)
| Method | Path                              | Descripción                                            |
|--------|-----------------------------------|--------------------------------------------------------|
| GET    | `/api/shop/:slug/info`            | Config pública del tenant (logo, theme, currency)      |
| GET    | `/api/shop/:slug/products`        | Lista de productos `shop_visible=true`. Filtros `q`, `category`, `limit`. |
| POST   | `/api/shop/checkout`              | Crea customer (si no existe) + sale + emite `intent`   |
| GET    | `/api/shop/orders/:id?email=…`    | Lookup gated por email del comprador                   |

### POST /api/shop/checkout — body
```json
{
  "tenant_id": "uuid",        // o "shop_slug"
  "items": [{ "product_id": "uuid", "quantity": 2 }],
  "customer_info": { "name": "Ada", "email": "a@b.mx", "phone": "+52..." },
  "shipping":      { "address": "...", "city": "...", "zip": "...", "cost": 99 },
  "payment_method": "card | stripe | codi | spei | transfer | cash_on_delivery",
  "promo_code": "BLACKFRI",
  "gift_card":  "GC-1234"
}
```

Respuesta incluye `order` (totales recalculados servidor-side) e `intent` con `next` orientando al cliente: `stripe_redirect`, `qr` (apuntando a `/api/qr/{codi|spei}/generate`), `manual_transfer` o `cod`.

## Seguridad
- Server recalcula `subtotal/discount/tax/total` desde `products` — el cliente no decide precios.
- `shop_enabled=false` ⇒ tienda 404. RLS recomendada: solo `shop_visible=true` expuesto por `shop_public_products`.
- Lookup de pedido requiere `id` + `email` exacto (`guest_email`).
- Items validados: `product_id` debe pertenecer al tenant y estar activo.

## URL pública de cliente
`https://<host>/volvix-shop.html?tenant=TNT001&shop_slug=mi-tienda`

## Pendientes / Nota de integración
- Stripe `client_secret` real requiere wiring posterior con `STRIPE_SECRET_KEY`.
- Decremento de gift card usa `balance_delta` (asume trigger SQL); si no existe, hacer fetch+UPDATE.
- Agregar webhook de Stripe que mueva `sales.status` `awaiting_payment → paid`.
