# R17 · SMS via Twilio

## Resumen
Endpoint serverless para enviar SMS transaccionales mediante Twilio REST API,
con auditoria completa en `public.sms_log` (Supabase).

## Endpoint

`POST /api/sms/send` (auth requerida)

### Request body
```json
{
  "to":      "+5215512345678",
  "message": "Tu codigo OTP es 123456"
}
```

### Respuestas
| Codigo | Caso |
|--------|------|
| 200    | Enviado. `{ ok:true, twilio_sid, status:201 }` |
| 400    | `to` o `message` ausentes |
| 401    | Sin auth |
| 502    | Twilio devolvio error (mensaje en `error`) |
| 503    | Falta env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| 500    | Error interno (`sms_send_failed`) |

## Variables de entorno

| Var                     | Descripcion                                |
|-------------------------|--------------------------------------------|
| `TWILIO_ACCOUNT_SID`    | SID de la cuenta Twilio                    |
| `TWILIO_AUTH_TOKEN`     | Auth Token (Basic Auth)                    |
| `TWILIO_PHONE_NUMBER`   | Numero `From` en formato E.164 (ej `+1...`)|

Si **alguna** falta -> `503` con `error: "TWILIO env vars no configuradas"`.

## Flujo Twilio

- **URL**: `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`
- **Method**: `POST`
- **Auth**: `Basic base64(SID:TOKEN)`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body**: `To`, `From`, `Body` (URL-encoded)

## Auditoria - tabla `sms_log`

Definida en `db/R17_SMS.sql`:

```sql
sms_log(
  id          uuid pk,
  to_phone    text,
  body        text,
  status      text check ('sent'|'failed'|'queued'),
  twilio_sid  text,
  error       text,
  sent_at     timestamptz default now(),
  tenant_id   uuid
)
```

Indices en `(sent_at desc, status)`, `to_phone`, `tenant_id`, `twilio_sid`.
RLS habilitado: SELECT/INSERT solo `ADMIN/SUPERADMIN/OWNER`. UPDATE/DELETE
bloqueado para clientes (solo service role del backend).

Cada llamada al endpoint inserta una fila:
- exito  -> `status='sent'`,  `twilio_sid` poblado
- fallo  -> `status='failed'`, `error` con mensaje legible

## Triggers automaticos (consumidores internos)

El helper `sendSMS({to, message, sid, token, from, tenantId})` esta listo
para reusarse desde otros handlers. Casos previstos:

1. **OTP customer portal** - `customer-portal.js` puede invocarlo cuando
   se solicite codigo de verificacion por SMS.
2. **Password reset SMS** - alternativa al email para `/api/auth/password-reset/request`
   cuando el usuario tenga telefono verificado y no email.
3. **Low-stock alert SMS** - cron de inventario que detecta `stock <= reorder_point`
   notifica al ADMIN/OWNER del tenant via SMS.

(Los disparadores concretos quedan a cargo de cada modulo; el endpoint y el
helper estan disponibles globalmente.)

## Archivos modificados

| Archivo            | Cambio                                          |
|--------------------|-------------------------------------------------|
| `api/index.js`     | + handler `POST /api/sms/send`, helper `sendSMS`, `logSMS` |
| `db/R17_SMS.sql`   | nueva tabla `sms_log` + RLS                     |
| `R17_SMS.md`       | este documento                                  |

## Deploy

1. `psql $SUPABASE_DB_URL -f db/R17_SMS.sql`
2. Configurar env vars en Vercel: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER`.
3. Redeploy.
4. Smoke: `curl -X POST $API/api/sms/send -H "Authorization: Bearer $JWT"
   -H "Content-Type: application/json" -d '{"to":"+52...","message":"test"}'`.
