# R17 — REVIEWS (Reseñas y calificaciones)

## Resumen
Sistema de reseñas verificadas por compra con moderación admin y respuestas
del negocio. Integra estadísticas (promedio, distribución 1–5) y trigger de
invitación por email tras la compra.

## DB (`db/R17_REVIEWS.sql`)

| Tabla | Campos clave |
|-------|--------------|
| `reviews` | `id, tenant_id, customer_id, sale_id, product_id?, rating(1-5), title, body, is_verified, status[pending/published/rejected], created_at` |
| `review_responses` | `id, review_id, user_id, response, ts` |

Índices: `tenant_id`, `product_id`, `customer_id`, `status`, `rating`,
parcial `(product_id,status) WHERE status='published'`.

RLS habilitada, política de aislamiento por `app.tenant_id`.

## API (`api/index.js`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/reviews?product_id=&min_rating=&tenant_id=&limit=` | público | sólo `status='published'` |
| GET | `/api/reviews/stats?product_id=` | público | `{average, count, distribution}` |
| POST | `/api/reviews` | customer | exige venta previa del cliente; `is_verified=true`; status inicial `pending` |
| PATCH | `/api/reviews/:id` | admin | moderar (status / is_verified / title / body) |
| POST | `/api/reviews/:id/response` | admin | respuesta del negocio |
| GET | `/api/reviews/:id/responses` | público | listar respuestas |

Roles admin aceptados: `admin`, `owner`, `superadmin`, `manager`.

Reglas de validación:
- `rating` entero entre 1 y 5
- `title` ≤ 200, `body` ≤ 4000 chars
- POST falla con `403 no_purchase_history` si el cliente no tiene venta

## Cliente (`volvix-reviews-wiring.js`)

API global expuesta: `window.VolvixReviews`
- `buildStarsInput(container, {value, size, onChange})` — input de estrellas accesible (teclado + click).
- `renderProductReviews(productId, mountEl, {limit})` — pinta resumen
  (avg, breakdown 5→1) + lista de reseñas con badge "Compra verificada".
- `submitReview(payload)` — POST `/api/reviews`.
- `triggerPostPurchaseInvite(saleId, {to, products})` — usa `/api/email/send`
  con plantilla `review_invite`. Auto-disparado en `volvix:sale:completed`.
- `autoMount()` — hidrata elementos con:
  - `data-volvix-reviews="<product_id>"` → reviews del producto
  - `data-volvix-stars-input` → input de estrellas

## Smoke test rápido
```bash
curl $API/api/reviews/stats?product_id=PID
curl -X POST $API/api/reviews -H 'Authorization: Bearer T' \
  -d '{"product_id":"PID","rating":5,"title":"Genial","body":"..."}'
curl -X PATCH $API/api/reviews/RID -H 'Authorization: Bearer ADMIN' \
  -d '{"status":"published"}'
```

## Estado
- SQL idempotente listo
- Handlers integrados en IIFE de handlers de `api/index.js`
- Wiring cliente con auto-mount y export global
- Trigger email post-compra delegado a `/api/email/send` (degrada silencioso)
