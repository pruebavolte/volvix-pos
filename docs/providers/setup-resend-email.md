# Setup Resend (Email Provider) — Volvix POS

> Recomendado como **provider de email principal** para enviar OTPs y notificaciones.

## Por qué Resend > SendGrid

| Criterio | Resend | SendGrid |
|---|---|---|
| Setup | 5 min | 30+ min (verificación domain compleja) |
| Tier gratis | 3,000 emails/mes | 100/día (3,000/mes) |
| DKIM/SPF/DMARC | Automático al verificar dominio | Manual |
| Developer DX | Excelente (API limpia, docs claras) | Legacy (overkill para casos simples) |
| Dashboard | Moderno, métricas en tiempo real | Pesado, lento |
| Logs | 7 días free / 30 días pro | 7 días free |
| Soporte | Discord activo + email | Email lento |

**Conclusión**: para enviar OTPs (volumen bajo), Resend gana en simplicidad y costos.

## Step by step (5 minutos)

### 1) Crear cuenta gratis
- Ir a https://resend.com/signup
- Registrarse con email corporativo (preferible)
- Verificar email (1 click en link)

### 2) Verificar dominio (recomendado para producción)
- Dashboard → "Domains" → "Add Domain"
- Ingresar dominio: `volvix.com` (o el tuyo)
- Resend te da 3 records DNS:
  - **TXT** (SPF): `v=spf1 include:amazonses.com ~all`
  - **CNAME** (DKIM): `resend._domainkey.volvix.com → resend._domainkey.amazonses.com`
  - **TXT** (DMARC): `_dmarc.volvix.com → v=DMARC1; p=none;`
- Agregar en tu DNS provider (Cloudflare, GoDaddy, Vercel DNS, etc.)
- Volver a Resend, click "Verify DNS Records" — espera 1-15 min

> **Atajo para testing**: usa `onboarding@resend.dev` como remitente (sin verificar dominio). Útil para QA inicial; cambia a tu dominio antes de producción.

### 3) Generar API key
- Dashboard → "API Keys" → "Create API Key"
- Permission: **"Sending access"**
- Domain: tu dominio verificado (o "All domains")
- Copiar el key: `re_xxxxxxxxxxxxxxxxxxxx`
- **NO commitear**. Guardar solo en Vercel env vars.

### 4) Agregar a Vercel
```bash
vercel env add RESEND_API_KEY
# Pegar el key cuando lo pida
# Seleccionar: Production, Preview, Development
```

O vía dashboard: Vercel → Project → Settings → Environment Variables → `RESEND_API_KEY = re_xxx`.

### 5) Redeploy
```bash
vercel --prod --yes
```

El sistema detectará automáticamente `process.env.RESEND_API_KEY` y dejará de mostrar `otp_dev_visible` en el response (ya enviará por email real).

## Test con curl

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Volvix POS <noreply@volvix.com>",
    "to": "tu-email@gmail.com",
    "subject": "Test OTP",
    "html": "<p>Tu código es: <strong>123456</strong></p>"
  }'
```

Si responde `{"id":"..."}` → funciona. Revisa tu inbox.

## Cómo el sistema detecta el provider

Archivo: `api/index.js` (handler `POST /api/auth/register-tenant`).

```js
const hasEmailProvider = !!(process.env.SENDGRID_API_KEY ||
                            process.env.RESEND_API_KEY ||
                            process.env.SMTP_HOST);
```

Cuando `hasEmailProvider === true`:
- Response NO incluye `otp_dev_visible`.
- El banner "Modo demo" no se muestra en `/registro.html`.
- El sistema intenta enviar email real (siguiente fase: integrar Resend SDK).

## Costos

- **Free tier**: 3,000 emails/mes, 100/día. OK para arranque.
- **Pro $20/mes**: 50,000 emails/mes. Para crecer.
- **Scale**: pricing por volumen.

## Troubleshooting

- **"DNS not verified"**: espera hasta 30 min, valida records con `dig TXT volvix.com`.
- **"Email goes to spam"**: verifica DMARC esté configurado, usa dominio propio (no `resend.dev` en prod).
- **"Rate limit hit"**: free tier limita 100/día; ya pasaste a Pro.

## Siguiente paso

Ver también:
- `setup-twilio-whatsapp.md` — para enviar OTPs por WhatsApp
- `setup-wasender-whatsapp.md` — alternativa simple a Twilio
- `INDEX.md` — comparativa completa de providers
