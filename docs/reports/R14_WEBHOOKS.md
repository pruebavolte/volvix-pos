# R14 — Outbound Webhooks

Sistema de webhooks salientes para que cada tenant suscriba URLs externas y reciba eventos del POS firmados con HMAC-SHA256.

## Archivos

- `db/R14_WEBHOOKS.sql` — esquema (`webhook_endpoints`, `webhook_deliveries`) + índices + RLS por `tenant_id`.
- `api/index.js` — handlers REST + helper `dispatchWebhook()` + hooks en eventos.
- `volvix-webhooks-admin-wiring.js` — UI admin (lista, crear, deliveries, rotar secret, pausar, eliminar).

## Esquema SQL

### `webhook_endpoints`
| col | tipo |
|---|---|
| id | uuid PK |
| tenant_id | text NOT NULL |
| url | text NOT NULL |
| secret | text NOT NULL |
| events | text[] |
| active | boolean DEFAULT true |
| description | text |
| created_at / updated_at | timestamptz |

Índices: `(tenant_id)`, `(tenant_id, active)`, GIN sobre `events`.

### `webhook_deliveries`
| col | tipo |
|---|---|
| id | uuid PK |
| endpoint_id | uuid FK → webhook_endpoints (ON DELETE CASCADE) |
| tenant_id | text |
| event | text |
| payload | jsonb |
| status | text CHECK (`pending` / `sent` / `failed`) |
| status_code | integer |
| attempts | integer |
| last_error | text |
| ts | timestamptz |
| delivered_at | timestamptz |

RLS: ambos filtran por `tenant_id` salvo `owner` / `superadmin`.

## API REST (roles: `owner`, `admin`, `superadmin`)

| Método | Path | Descripción |
|---|---|---|
| GET    | `/api/webhooks` | Lista endpoints del tenant (secret enmascarado). |
| POST   | `/api/webhooks` | Crea endpoint. Body: `{ url, events:[...], active?, description? }`. Si no pasas `secret`, se genera `whsec_<48hex>`. |
| PATCH  | `/api/webhooks/:id` | Actualiza url / events / active / description. `regenerate_secret:true` rota el secret. |
| DELETE | `/api/webhooks/:id` | Elimina (cascada borra deliveries). |
| POST   | `/api/webhooks/:id/test` | Envía evento `webhook.test` y devuelve resultado. |
| GET    | `/api/webhooks/:id/deliveries` | Últimos 100 deliveries. |

Validaciones: `url` parseable con `new URL()`; `events` se filtran contra la lista permitida.

## Eventos soportados

```
sale.created
sale.refunded
customer.created
inventory.low_stock
payment.succeeded
payment.failed
```

## Helper `dispatchWebhook(tenantId, event, payload)`

- Fire-and-forget (`setImmediate`) — no bloquea el response del request original.
- Busca endpoints activos del tenant cuyo array `events` contenga el evento.
- Por cada endpoint:
  1. Inserta fila `webhook_deliveries` (`status=pending, attempts=0`).
  2. Firma `body` con HMAC-SHA256 usando `endpoint.secret`.
  3. POST con timeout **5 s**. Headers entregados:
     - `Content-Type: application/json`
     - `User-Agent: Volvix-Webhooks/1.0`
     - `X-Volvix-Signature: sha256=<hex>`
     - `X-Volvix-Timestamp: <ms epoch>`
  4. Retry exponencial: hasta **3 intentos** con backoff `1s → 2s → 4s`.
  5. Status final → `sent` (2xx) o `failed`; se persisten `status_code`, `attempts`, `last_error`, `delivered_at`.

Expuesto como `global.dispatchWebhook`.

## Payload firmado

```json
{
  "id": "<delivery uuid>",
  "event": "sale.created",
  "ts": "2026-04-26T12:34:56.000Z",
  "tenant_id": "TNT001",
  "data": { ... }
}
```

Verificación en el receptor (Node.js):
```js
const sig = req.headers['x-volvix-signature'];
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
```

## Hooks instalados en `api/index.js`

| Evento | Punto de disparo |
|---|---|
| `sale.created` | `POST /api/sales` después del INSERT |
| `customer.created` | `POST /api/customers` después del INSERT |
| `sale.refunded` | disponible para llamar desde flujo de devoluciones (`dispatchWebhook(tenant, 'sale.refunded', refundRow)`) |
| `inventory.low_stock` | disponible desde el job `POST /api/admin/jobs/low-stock-alert` y otros checks de stock |
| `payment.succeeded` / `payment.failed` | disponibles desde los webhooks de Stripe / Conekta / MercadoPago / PayPal entrantes |

> Para los eventos no auto-conectados, basta con añadir `try { dispatchWebhook(tenant, '<event>', payload); } catch(_) {}` justo después del insert/confirmación correspondiente. La función nunca lanza.

## UI admin

`volvix-webhooks-admin-wiring.js` se monta automáticamente sobre `<div id="webhooks-admin-root"></div>`. Exporta `window.VolvixWebhooksAdmin = { render, init }` para montaje manual. Funcionalidad:

- Tabla con URL / eventos / estado / secret enmascarado.
- Botones por fila: **Test**, **Deliveries**, **Rotar secret**, **Pausar/Activar**, **Eliminar**.
- Formulario inline para alta con checkboxes por evento.

Auth: usa `localStorage.volvix_jwt` (o `jwt`) y envía `Authorization: Bearer <token>`.

## Seguridad

- Secrets generados con `crypto.randomBytes(24)` (192 bits).
- En `GET /api/webhooks` el secret se enmascara (`primeros 8 chars + "..."`); el secret completo solo se devuelve al crear o regenerar.
- RLS por `tenant_id` en ambas tablas.
- Solo `owner` / `admin` / `superadmin` pueden gestionar; un cajero no.
- Timeout estricto de 5 s por POST evita que un endpoint receptor lento bloquee el dispatcher.
- Retries con backoff exponencial limitan la carga sobre receptores caídos.

## Pendientes opcionales

- Reintento manual de un delivery `failed`.
- TTL / purga automática de `webhook_deliveries` antiguas (> 30 días).
- Conectar `sale.refunded`, `inventory.low_stock`, `payment.succeeded/failed` en sus puntos respectivos cuando esos flujos existan.
