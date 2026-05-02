# Twilio + OTP — qué pegar en Vercel

El registro envía SMS via Twilio. Mientras NO configures las llaves, el sistema NO te bloquea: te muestra el código en pantalla (banner amarillo en `/registro.html`) para que puedas completar el flujo. Una vez que pegues las llaves, el SMS sale solo y el banner deja de aparecer.

## Variables que necesita Vercel (Settings → Environment Variables)

| Nombre exacto         | De dónde sale en Twilio                                    | Empieza con          |
|-----------------------|------------------------------------------------------------|----------------------|
| `TWILIO_ACCOUNT_SID`  | console.twilio.com → Account → API keys & tokens           | `AC` + 32 hex chars  |
| `TWILIO_AUTH_TOKEN`   | console.twilio.com → Account → API keys & tokens           | (32 hex chars)       |
| `TWILIO_SMS_FROM`     | console.twilio.com → Phone Numbers → Active numbers        | `+1XXX…` o `+52XXX…` |
| `OTP_BOUND_DOMAIN`    | tu dominio (sin protocolo)                                  | `systeminternational.app` |

> **Importante**: usa el formato E.164 en `TWILIO_SMS_FROM` (con `+` y código de país). Twilio sin esto rechaza el envío con `http_400`.

## Pasos exactos

1. https://vercel.com/grupo-volvixs-projects/volvix-pos/settings/environment-variables
2. **Add New** por cada variable. Marca **Production + Preview + Development**. Save.
3. **Deployments → ... → Redeploy** el último build (sin "use existing build cache").
4. Espera 1 min. En `/registro.html` registra un teléfono nuevo. Si las llaves quedaron bien, llega SMS y el banner amarillo NO aparece.

## Verificación

```
GET https://systeminternational.app/api/payments/health
```

(El endpoint reporta el estado de varios proveedores; busca `sms` o `twilio` en la respuesta.)

Si después de configurar Twilio sigue sin enviar, mira la respuesta de `register-simple`: ahora incluye `sms_error` cuando Twilio rechaza algo. Errores comunes:

| `sms_error`                        | Qué significa                                                      |
|------------------------------------|--------------------------------------------------------------------|
| `http_401 Authentication Error`    | `TWILIO_AUTH_TOKEN` mal copiado.                                    |
| `http_400 …Invalid 'From'…`        | `TWILIO_SMS_FROM` no es número activo / no E.164.                  |
| `http_400 …unverified…`            | Trial Twilio: solo permite enviar a números **verificados** en la consola. Verifica el destino o pasa a producción. |
| `http_403 …region…`                | Geo-permission MX desactivada. Habilita en Twilio: Messaging → Settings → Geo Permissions → México. |
| `timeout`                          | Twilio API caída o problema de red en Vercel. Reintentar.           |

## "Este teléfono ya está registrado" — cómo recuperar

Antes te bloqueaba si reusabas un número. Ahora:

- Si el OTP nunca fue verificado (registro abandonado) → te deja **continuar** y reemite OTP.
- Solo bloquea si el teléfono pertenece a una cuenta **activa** (ya hizo login al menos una vez).

Para empezar de cero un teléfono que sí completó OTP, hay que borrarlo de la BD. Lo más rápido (consola Supabase SQL):

```sql
-- Borra todo lo asociado a un teléfono dado, idempotente
WITH u AS (DELETE FROM pos_users    WHERE phone = '+525588990077' RETURNING id, notes)
DELETE FROM pos_companies WHERE owner_user_id IN (SELECT id FROM u);
DELETE FROM pos_otp_verifications WHERE phone = '+525588990077';
```

Cambia el número por el que necesites resetear.
