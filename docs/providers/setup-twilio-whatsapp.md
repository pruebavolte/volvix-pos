# Setup Twilio (WhatsApp Provider) — Volvix POS

> Provider robusto para enviar OTPs por WhatsApp. Más complejo que Wasender pero **production-grade**.

## Cuándo usar Twilio vs alternativas

- ✅ **Twilio**: si necesitas escalar > 1000 OTPs/día, compliance estricto, soporte 24/7.
- ⚠️ **Wasender**: setup más simple (5 min), ideal para arrancar (ver `setup-wasender-whatsapp.md`).
- ❌ **Meta WA Business directo**: solo si tienes Business Manager + dominio verificado + paciencia para el approval (semanas).

## Sandbox de Twilio (gratis, para testing)

Antes de comprar un número, Twilio te da un **sandbox** para probar.

### 1) Crear cuenta en Twilio
- https://www.twilio.com/try-twilio
- Te dan **$15 USD de crédito free** para probar.
- Verifica tu teléfono (1 min).

### 2) Activar sandbox de WhatsApp
- Console → "Messaging" → "Try it out" → "Send a WhatsApp message"
- Twilio te muestra un número (ej: `+1 415 523 8886`) y un código tipo `join brave-tiger`.
- Desde tu WhatsApp personal, enviar **al número de Twilio** el mensaje: `join brave-tiger`.
- Recibes confirmación: "✅ Joined sandbox"
- **Tu número está autorizado** para recibir mensajes desde el sandbox.

### 3) Test desde curl
Reemplaza `ACxxx`, `auth_token`, y los números:

```bash
curl 'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxx/Messages.json' -X POST \
  --data-urlencode 'To=whatsapp:+5215512345678' \
  --data-urlencode 'From=whatsapp:+14155238886' \
  --data-urlencode 'Body=Tu código Volvix es 123456' \
  -u ACxxxxxxx:tu_auth_token
```

Si llega WhatsApp → todo bien.

### 4) Configurar webhook (opcional para sandbox)
- Console → "Messaging" → "Sandbox Settings"
- "When a message comes in" → POST `https://volvix.com/api/webhooks/twilio-whatsapp`
- Solo necesario si quieres recibir respuestas (ej. el cliente envía "STOP").

## Variables de entorno

Agregar en Vercel:

```bash
vercel env add TWILIO_ACCOUNT_SID
# Valor: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (de Console → Account Info)

vercel env add TWILIO_AUTH_TOKEN
# Valor: el auth token (Console → Account Info, click "View")

vercel env add TWILIO_WHATSAPP_FROM
# Valor: whatsapp:+14155238886 (el número del sandbox)
```

Redeploy: `vercel --prod --yes`.

## Cómo el sistema detecta Twilio

Archivo: `api/index.js`:

```js
const hasWhatsAppProvider = !!(process.env.TWILIO_ACCOUNT_SID ||
                               process.env.WASENDER_API_KEY ||
                               process.env.WHATSAPP_TOKEN);
```

Cuando `TWILIO_ACCOUNT_SID` está set:
- Sistema deja de mostrar `otp_dev_visible` en response (si también hay email provider).
- Banner "Modo demo" desaparece de `/registro.html`.

## Para producción: comprar número WhatsApp Business

El sandbox solo funciona con números pre-registrados. Para producción:

### Opción A: Twilio Senders (Self-serve)
- Console → "Messaging" → "Senders" → "WhatsApp Senders" → "Create new sender"
- Necesitas:
  - Facebook Business Manager (gratis)
  - Display name aprobado por Meta (1-3 días)
  - Número de teléfono dedicado (no usado en otra cuenta WhatsApp)
- Costos: ~$0.005 por mensaje en USA, ~$0.04 a México.

### Opción B: Comprar número Twilio
- Console → "Phone Numbers" → "Buy a number"
- Filtra por capability "WhatsApp"
- Costo: $1-15/mes según país

## Limitaciones del free tier

- $15 USD crédito ≈ 300 mensajes a México.
- Sin verificación, solo puedes enviar a números que se unieron al sandbox.
- Para volumen real, agregar tarjeta y pagar por uso.

## Troubleshooting

- **"Recipient not in sandbox"**: el número del cliente no se unió enviando `join xxx-yyy`. Pídele que lo haga.
- **"Channel not approved"**: tu número de producción aún no aprobado por Meta. Espera el approval.
- **"63007 - WhatsApp number not registered"**: el `From` no es válido para WhatsApp Business.

## Costos estimados (volumen real)

| Volumen | Estimado mensual |
|---|---|
| 1,000 OTPs/mes | ~$40 USD |
| 10,000 OTPs/mes | ~$400 USD |
| 100,000 OTPs/mes | ~$3,500 USD (con descuento volume) |

Para volumen alto, considerar Wasender ($30/mes flat hasta 10K) o Meta WA Business directo (más barato pero más complejo).

## Siguiente paso

Ver `INDEX.md` para comparativa con Wasender y otros.
