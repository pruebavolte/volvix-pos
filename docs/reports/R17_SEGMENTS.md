# R17_SEGMENTS — Segmentacion de clientes para marketing

**Fecha:** 2026-04-26
**Slice index:** 122 (range 2440-2460)

## 1. Objetivo

Permitir a cada tenant definir segmentos de clientes basados en criterios
declarativos (DSL JSONB), recomputarlos bajo demanda y disparar campañas
multi-canal (email / whatsapp / sms) sobre los miembros calculados.

## 2. Esquema de base de datos (`db/R17_SEGMENTS.sql`)

| Tabla / Funcion             | Proposito |
|-----------------------------|-----------|
| `customer_segments`         | Definicion del segmento (`tenant_id`, `name`, `criteria` JSONB, `member_count`, `last_computed_at`, `is_predefined`, `active`). UNIQUE `(tenant_id, name)`. Indice GIN sobre `criteria`. |
| `segment_members`           | Tabla puente `(segment_id, customer_id)` con timestamp `added_at`. PK compuesta. |
| `segment_campaigns`         | Auditoria de envios: canal, subject/body, `recipients/sent/failed`, `status` (queued, sending, done, failed). |
| `compute_segment(id)`       | Funcion `plpgsql` que evalua `criteria`, repobla `segment_members`, actualiza `member_count` + `last_computed_at`, y retorna el conteo. |
| `seed_predefined_segments(tenant_id)` | Inserta los 5 segmentos pre-definidos (idempotente via `ON CONFLICT`). |

## 3. DSL de criteria (JSONB)

| Campo                    | Tipo    | Significado |
|--------------------------|---------|-------------|
| `min_total_spent`        | numeric | Spent acumulado en ultimos 12 meses >= valor |
| `min_visits`             | int     | Numero de ventas >= valor |
| `max_visits`             | int     | Numero de ventas <= valor |
| `days_since_last_visit`  | int     | Ultima compra hace al menos N dias (o sin compras) |
| `max_days_since_first`   | int     | Primera compra hace como maximo N dias (clientes nuevos) |
| `has_tier`               | text    | `bronze` / `silver` / `gold` / `platinum` |
| `vertical`               | text    | Vertical del cliente (retail / restaurant / etc.) |
| `min_avg_ticket`         | numeric | Promedio por venta >= valor |

Todos los criterios se combinan con AND. Ausencia = sin filtro.

## 4. Endpoints (`api/index.js`)

| Metodo + ruta                              | Descripcion |
|--------------------------------------------|-------------|
| `POST /api/segments`                       | Crea un segmento (acepta `name`, `description`, `criteria`, `is_predefined`, `active`). |
| `GET /api/segments`                        | Lista segmentos del tenant del JWT, ordenados por `created_at desc`. |
| `POST /api/segments/:id/recompute`         | Llama RPC `compute_segment(id)` y devuelve `member_count`. |
| `GET /api/segments/:id/members`            | Devuelve hasta `?limit=` (default 200, max 1000) miembros con datos basicos del cliente. |
| `POST /api/segments/:id/campaign`          | Envia mensaje al canal solicitado a todos los miembros. Crea fila en `segment_campaigns`, actualiza `sent/failed/status` al finalizar. |

Todas requieren `requireAuth` y resuelven `tenant_id` del JWT.

## 5. Segmentos pre-definidos

| Nombre        | Criteria                              |
|---------------|---------------------------------------|
| VIP           | `{"min_total_spent":5000}`            |
| Inactive      | `{"days_since_last_visit":90}`        |
| New           | `{"max_days_since_first":30}`         |
| Big Spenders  | `{"min_avg_ticket":500}`              |
| Frequent      | `{"min_visits":10}`                   |

Se siembran via `SELECT seed_predefined_segments(<tenant_id>);`.

## 6. Canales soportados

- **email** → `sendEmail()` (helper interno R14 SMTP/Resend).
- **sms** → `sendSMS()` Twilio REST con `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER`.
- **whatsapp** → reutiliza `sendSMS()` con prefijo `whatsapp:` y `TWILIO_WHATSAPP_FROM`.

Si las env vars del canal no estan configuradas, el envio se cuenta como `failed` sin abortar la campaña.

## 7. Errores estandar (R15)

`tenant_required`, `name_required`, `bad_id`, `channel_invalid`, `message_required`,
`no_members` (409), `db_error`, `rpc_failed`, `segment_create_failed`,
`segments_list_failed`, `members_failed`, `recompute_failed`, `campaign_failed`.

## 8. Deploy

1. `psql ... -f db/R17_SEGMENTS.sql`
2. (Opcional por tenant) `SELECT seed_predefined_segments(<tenant>);`
3. Redeploy `api/index.js` (Vercel).
4. Smoke test: crear segmento → recompute → ver members → campaign email.
