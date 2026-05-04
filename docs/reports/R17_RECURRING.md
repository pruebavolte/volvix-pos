# R17 — Customer Recurring Subscriptions

Suscripciones recurrentes para clientes finales (membresía gym, café mensual,
plan de mantenimiento, etc). Diferente a `subscriptions` (que es el plan SaaS
del tenant): aquí cada `tenant` cobra a sus propios `customers` de forma
periódica.

## 1. Esquema (`db/R17_RECURRING.sql`)

### `customer_subscriptions`
| columna          | tipo            | nota |
|------------------|-----------------|------|
| `id`             | uuid PK         | gen_random_uuid() |
| `customer_id`    | uuid NOT NULL   | FK lógico a `customers` |
| `tenant_id`      | uuid NOT NULL   | aislamiento por tenant |
| `plan_name`      | text NOT NULL   | "Membresía Gold", "Café diario", etc |
| `amount`         | numeric(12,2)   | precio por ciclo |
| `currency`       | text            | default `mxn` |
| `interval`       | text            | `weekly` / `monthly` / `yearly` |
| `status`         | text            | `active` / `paused` / `canceled` / `expired` |
| `next_charge_at` | timestamptz     | usado por el job diario |
| `started_at`     | timestamptz     | default now() |
| `canceled_at`    | timestamptz     | se setea al pasar a canceled |
| `stripe_sub_id`  | text            | opcional, si está enlazada a Stripe |
| `notes`          | text            | libre |

### `subscription_charges`
Histórico inmutable de cargos generados (1 row por intento).
| columna      | tipo           | nota |
|--------------|----------------|------|
| `id`         | uuid PK        | |
| `sub_id`     | uuid NOT NULL  | FK a `customer_subscriptions` (CASCADE) |
| `sale_id`    | uuid           | la venta creada en `pos_sales` |
| `amount`     | numeric(12,2)  | snapshot del monto cobrado |
| `charged_at` | timestamptz    | default now() |
| `status`     | text           | `success` / `failed` / `pending` / `refunded` |
| `error_msg`  | text           | si falló |

Índices: por tenant, customer, status, y un parcial sobre `next_charge_at`
filtrado por `status='active'` para acelerar el cron.

RLS: habilitado, política open por ahora (alinear con resto del sistema en R18).

## 2. Endpoints (`api/index.js`)

Todos requieren `requireAuth`. El `tenant_id` se resuelve vía `resolveTenant(req)`.

| método  | ruta                                          | propósito |
|---------|-----------------------------------------------|-----------|
| GET     | `/api/customer-subscriptions`                 | lista del tenant; filtros `customer_id`, `status` |
| POST    | `/api/customer-subscriptions`                 | crea (valida `customer_id`, `plan_name`, `amount`, `interval`) |
| PATCH   | `/api/customer-subscriptions/:id`             | edita campos seguros; `status=canceled` setea `canceled_at` |
| DELETE  | `/api/customer-subscriptions/:id`             | borra (hard delete) |
| POST    | `/api/customer-subscriptions/:id/charge`      | genera 1 cobro: crea `pos_sales` + row en `subscription_charges`, avanza `next_charge_at` |
| GET     | `/api/customer-subscriptions/due-today`       | suscripciones activas con `next_charge_at <= fin de hoy` (cron-friendly) |
| POST    | `/api/admin/jobs/process-recurring`           | itera todas las due y las cobra (owner/superadmin) |

### Flujo de cobro (`_recurringChargeOne`)
1. Verifica `status === 'active'`.
2. Crea row en `pos_sales` (`payment_method = 'recurring'` o `'stripe_sub'`).
3. Si hay `stripe_sub_id`, hace GET a `/v1/subscriptions/{id}` como sanity check.
4. Inserta `subscription_charges` con resultado.
5. Si éxito, avanza `next_charge_at` por el `interval`.

Tolerante a tablas inexistentes: devuelve `{ok:true, note:'tabla pendiente'}`
si Postgres responde `42P01` (mismo patrón que R14/R17 anteriores).

## 3. Cron / programación
Cualquier scheduler externo (Vercel Cron, GitHub Actions, etc) puede llamar:

```
POST https://<host>/api/admin/jobs/process-recurring
Authorization: Bearer <admin_jwt>
```

Recomendado: 1 vez al día, 03:00 hora del tenant principal.

## 4. UI cliente (`public/volvix-customer-subscriptions.js`)

Componente vanilla JS auto-mount. En la pantalla de detalle de cliente:

```html
<div id="customer-subscriptions-panel" data-customer-id="UUID-DEL-CLIENTE"></div>
<script src="/volvix-customer-subscriptions.js"></script>
```

Muestra tabla con plan, monto, intervalo, próximo cobro, estado, y botones:
- **Pausar / Reanudar** (active ↔ paused)
- **Cancelar** (con confirm)
- **Cobrar ahora** (POST `/charge`)
- **+ Nueva suscripción** (formulario inline)

API en `window.VolvixCustomerSubs.mount(el, customerId)` para integración manual.

## 5. Pendientes / siguiente iteración
- Webhook Stripe (`invoice.paid`, `invoice.payment_failed`) que actualice
  `subscription_charges` con el `payment_intent`.
- Notificación email/SMS al cliente N días antes del cobro (reusar R14_EMAIL).
- Política RLS estricta `tenant_id = current_setting('request.jwt.claim.tenant_id')`.
- Reporte de MRR / churn por tenant (vista materializada).
