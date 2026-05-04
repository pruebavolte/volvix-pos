# R14 · Subscriptions (SaaS Billing) — Reporte

## Objetivo
Sistema de suscripciones por tenant con planes Free / Pro / Enterprise, integrado con Stripe, y enforcement de límites en runtime.

## Entregables

| Archivo | Descripción |
|---|---|
| `db/R14_SUBSCRIPTIONS.sql` | DDL + seed de 3 planes |
| `api/index.js` (bloque R14 BILLING) | Endpoints `/api/billing/*` y middleware `enforcePlanLimits` |
| `volvix-billing-wiring.js` | UI front: pricing table, gauge de uso, botón upgrade |
| `R14_SUBSCRIPTIONS.md` | Este reporte |

## Esquema SQL

- `subscription_plans(id, name UNIQUE, price_monthly_cents, price_yearly_cents, currency, features jsonb, limits jsonb, active, stripe_price_monthly, stripe_price_yearly, created_at)`
- `subscriptions(id, tenant_id UNIQUE, plan_id FK, status[trial/active/past_due/canceled], billing_cycle[monthly/yearly], current_period_start, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, created_at, updated_at)`
- `subscription_events(id, subscription_id FK, event, payload jsonb, ts)` — auditoría
- `subscription_invoices(id, subscription_id, tenant_id, stripe_invoice_id, number, amount_cents, currency, status, hosted_invoice_url, pdf_url, period_start, period_end, created_at)`

### Seed de planes (MXN)

| Plan | $/mes | $/año | max_users | max_products | max_locations | max_sales/mes | features |
|---|---:|---:|---:|---:|---:|---:|---|
| Free | $0 | $0 | 1 | 100 | 1 | 500 | community support |
| Pro | $299 | $2,990 | 5 | ∞ | 3 | ∞ | AI, advanced reports, backups, loyalty |
| Enterprise | $999 | $9,990 | ∞ | ∞ | ∞ | ∞ | priority support, SSO, SLA |

`-1` = ilimitado. Idempotente vía `ON CONFLICT (name) DO UPDATE`.

## Endpoints API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET  | `/api/billing/plans`        | pública  | Lista planes activos |
| GET  | `/api/billing/subscription` | owner    | Suscripción del tenant actual |
| POST | `/api/billing/subscribe`    | owner    | `{plan_id, billing_cycle}` — Free directo, Pago crea Stripe Customer + Subscription |
| POST | `/api/billing/cancel`       | owner    | `cancel_at_period_end=true` en Stripe + status='canceled' |
| POST | `/api/billing/upgrade`      | owner    | Cambia plan con prorrateo Stripe |
| POST | `/api/billing/downgrade`    | owner    | Igual con `proration_behavior=create_prorations` |
| GET  | `/api/billing/invoices`     | owner    | Lista facturas (subscription_invoices) |
| GET  | `/api/billing/usage`        | owner    | Cuenta uso actual vs límites del plan |

Todos los endpoints owner usan `requireAuth(handler, ['owner','superadmin'])`.

## Middleware `enforcePlanLimits(resource)`

Aplicado a:
- `POST /api/products`            → resource `products` (max_products)
- `POST /api/owner/users`         → resource `users` (max_users)
- `POST /api/inventory/locations` → resource `locations` (max_locations)
- `POST /api/sales`               → resource `sales` (max_sales_per_month)

Comportamiento:
1. Lee `subscriptions` del tenant.
2. Si status ∈ {`canceled`,`past_due`} → **402** `subscription_inactive`.
3. Si el límite del recurso es `-1` o ausente → permite.
4. Cuenta filas actuales del recurso. Si `current >= max` → **402** `plan_limit_exceeded` con `{resource, limit, current, plan, upgrade_url}`.
5. Caso contrario, ejecuta el handler original.

Falla silente si tablas no existen (no bloquea boot).

## Integración Stripe

- Usa `STRIPE_SECRET_KEY` env var.
- Cliente HTTP `stripeRequest()` minimal (form-urlencoded).
- En `subscribe`: crea `Customer` (con `metadata.tenant_id`) si no existe + `Subscription` con `items[0][price]` apuntando a `subscription_plans.stripe_price_{monthly|yearly}`.
- Upgrade: hace `GET /v1/subscriptions/:id` para obtener `items[0].id`, luego `POST` con nuevo price y `proration_behavior=create_prorations`.
- Cancel: `cancel_at_period_end=true` (no inmediato).
- Si Stripe falla, igual persiste estado local (no bloquea).

> Pendiente: webhook handler para `invoice.paid`, `customer.subscription.updated`, `invoice.payment_failed` que escriba en `subscription_invoices` y actualice `status`. No incluido en este sprint.

## UI (`volvix-billing-wiring.js`)

Auto-inicializa en DOMContentLoaded buscando:
- `#vx-pricing` → tabla de 3 planes con toggle mensual/anual y botones suscribir/upgrade.
- `#vx-usage`  → gauges (users, products, locations, sales_mtd) con código de color (verde <70%, naranja 70-89%, rojo ≥90%).
- Botón flotante "Mejorar plan" inyectado en bottom-right.

Auth: lee `localStorage.volvix_token` o `localStorage.token`. API base: `window.VOLVIX_API_BASE` (default same-origin).

## Variables de entorno requeridas

```
STRIPE_SECRET_KEY=sk_live_...        # nuevo
SUPABASE_SERVICE_KEY=...             # ya existía
JWT_SECRET=...                       # ya existía
```

Y en cada plan hay que poblar `stripe_price_monthly` / `stripe_price_yearly` con los `price_*` IDs del Stripe Dashboard tras crear los productos.

## Pasos de despliegue

1. `psql ... < db/R14_SUBSCRIPTIONS.sql`
2. Crear productos+precios en Stripe Dashboard, copiar IDs.
3. `UPDATE subscription_plans SET stripe_price_monthly='price_...', stripe_price_yearly='price_...' WHERE name='Pro';` (igual para Enterprise).
4. Setear `STRIPE_SECRET_KEY` en Vercel env.
5. Deploy.
6. En `billing.html` (pendiente) agregar `<div id="vx-pricing"></div><div id="vx-usage"></div>` + `<script src="/volvix-billing-wiring.js"></script>`.

## QA mínimo

- `GET /api/billing/plans` → 3 planes.
- `POST /api/billing/subscribe` con plan Free → status 'active', sin Stripe.
- `POST /api/billing/subscribe` con plan Pro → crea Stripe sub, status 'active'.
- Crear 101 productos en Free → al 101 retorna 402 `plan_limit_exceeded`.
- `POST /api/billing/cancel` → marca `cancel_at_period_end=true` en Stripe + status 'canceled'.
- `POST /api/billing/upgrade` Free→Pro → prorratea en Stripe.

## Notas / TODO

- Webhook Stripe (`/api/billing/webhook`) no incluido — necesario para `past_due` automático.
- `subscription_invoices` se llena solo cuando exista el webhook; mientras tanto, queda vacío.
- RLS policies de Supabase para `subscription_*` no incluidas (acceso vía service key desde API).
- Asume tabla `pos_users`, `pos_products`, `pos_sales`, `inventory_locations` con columna `tenant_id` (consistente con R13).
