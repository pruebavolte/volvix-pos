# Volvix POS — Environment Variables Reference

Tabla maestra de **TODAS** las variables de entorno usadas por el backend (`api/index.js`).

> **Cómo leer la tabla:**
> - **Crítica** = sin esta variable el sistema no arranca o un módulo entero queda apagado.
> - **Opcional** = si no se define, hay un fallback razonable o el feature simplemente no se ofrece.
> - **Formato** = ejemplo o regex esperado.
> - El endpoint `GET /api/admin/providers/health` (superadmin) reporta cuáles están configuradas en runtime, sin revelar el valor.

---

## 1) Core / Auth / DB (críticas)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `SUPABASE_URL` | Sí | URL completa | `https://xxxx.supabase.co` | Dashboard Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Sí | JWT (eyJhb...) | `eyJhbGciOi...` | Dashboard Supabase → Project Settings → API → `service_role` |
| `SUPABASE_ANON_KEY` | Opcional | JWT | `eyJhbGciOi...` | Dashboard Supabase → API → `anon` (solo cliente público) |
| `JWT_SECRET` | Sí | string >= 32 chars | random 64 hex | Genera con `openssl rand -hex 32` |
| `NODE_ENV` | Opcional | `production` \| `development` | `production` | Vercel lo setea automático en deploy |
| `ALLOWED_ORIGINS` | Opcional | CSV de orígenes | `https://volvix-pos.vercel.app,https://app.volvix.com` | Dominios que pueden hacer CORS |
| `CRON_SECRET` | Opcional | string secreto | random 32 hex | Necesario si activas crons (retry, anchor, reconcile) |
| `VERCEL_CRON_SECRET` | Opcional | (alias) | — | Vercel lo provee automáticamente para cron jobs |
| `ADMIN_API_KEY` | Opcional | random 32+ chars | `vlx_admin_xxx` | Para llamadas server-to-server con permisos elevados |
| `EXPOSE_RESET_TOKEN` | Opcional | `0` \| `1` | `0` | DEV ONLY — expone token de reset en respuesta |
| `ALLOW_OTP_DEV_VISIBLE` | Opcional | `0` \| `1` | `1` | Si providers offline, expone OTP en response (NO en prod) |

---

## 2) Email Providers (al menos uno requerido para registro/OTP)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla / Link |
|---|---|---|---|---|
| `RESEND_API_KEY` | **Recomendada** | `re_xxx` | `re_AbC123...` | https://resend.com → API Keys |
| `RESEND_FROM_EMAIL` | Opcional | email | `noreply@volvix.com` | Domain verificado en Resend (default: `onboarding@resend.dev` gratis) |
| `RESEND_FROM_NAME` | Opcional | string | `Volvix POS` | Display name del remitente |
| `SENDGRID_API_KEY` | Alternativa | `SG.xxx` | `SG.AbC...` | https://sendgrid.com → Settings → API Keys |
| `SENDGRID_FROM_EMAIL` / `SENDGRID_FROM` | Opcional | email | `no-reply@volvix-pos.app` | Verified Sender en SendGrid |
| `SENDGRID_FROM_NAME` | Opcional | string | `Volvix POS` | Display name |
| `SMTP_HOST` | Alternativa | hostname | `smtp.gmail.com` | Si quieres usar SMTP genérico |
| `SMTP_PORT` | Opcional | `587`/`465` | `587` | Estándar SMTP |
| `SMTP_USER` | Opcional | string | `apikey` o usuario | Credencial SMTP |
| `SMTP_PASS` | Opcional | string | password | Credencial SMTP |
| `SMTP_FROM_EMAIL` | Opcional | email | `noreply@volvix.com` | Remitente SMTP |

**Fallback chain de email**: `RESEND_API_KEY` → `SENDGRID_API_KEY` → `SMTP_*` → log only.

---

## 3) SMS Provider (Twilio)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla / Link |
|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | Para SMS | `AC...` 34 chars | `ACxxxxxxxxxxxxxxxx` | https://console.twilio.com → Account Info |
| `TWILIO_AUTH_TOKEN` | Para SMS | string 32 chars | (oculto) | Console Twilio → Auth Token |
| `TWILIO_SMS_FROM` | Para SMS | `+1XXX...` E.164 | `+15551234567` | Twilio → Phone Numbers → Compré uno |
| `TWILIO_PHONE_NUMBER` | Alternativa | (alias de SMS_FROM) | `+15551234567` | Mismo número compatibilidad legacy |
| `TWILIO_FROM` | Alternativa | (alias) | `+15551234567` | Compatibilidad legacy |

---

## 4) WhatsApp Provider (uno de tres)

### 4a) Twilio WhatsApp (recomendado)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | Sí | `AC...` | (mismo que SMS) | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Sí | 32 chars | (mismo que SMS) | Twilio Console |
| `TWILIO_WHATSAPP_FROM` | Sí | `+1...` E.164 sin prefijo `whatsapp:` | `+14155238886` | Twilio Sandbox o número aprobado |

### 4b) Wasender API

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `WASENDER_API_KEY` | Sí | string | `wasender_xxx` | https://wasenderapi.com → Dashboard → API Keys |
| `WASENDER_HOST` | Opcional | hostname | `wasenderapi.com` | Default: `wasenderapi.com` |
| `WASENDER_PATH` | Opcional | path | `/api/send-message` | Default: `/api/send-message` |

### 4c) Meta WhatsApp Cloud API

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `WHATSAPP_TOKEN` | Sí | EAA... long token | `EAAxxx` | https://developers.facebook.com → WhatsApp → System User Token |
| `WHATSAPP_PHONE_NUMBER_ID` | Sí | numérico | `100123456789012` | WhatsApp Manager → Phone numbers |
| `WHATSAPP_VERIFY_TOKEN` | Para webhook | random string | `vlx_verify_xxx` | Tú la inventas y la pones en config webhook |
| `WHATSAPP_GRAPH_VERSION` | Opcional | `vXX.0` | `v18.0` | Default `v18.0` |
| `WHATSAPP_APP_SECRET` | Para webhook | hex secret | (oculto) | Meta App → Settings → Basic → App Secret |

**Fallback chain WhatsApp**: `TWILIO` → `WASENDER` → `META` → log only.

---

## 5) Stripe (Pagos)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Para pagos | `sk_live_xxx` / `sk_test_xxx` | `sk_test_AbC...` | https://dashboard.stripe.com → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Para pagos | `pk_live_xxx` / `pk_test_xxx` | `pk_test_AbC...` | Mismo dashboard, key pública |
| `STRIPE_WEBHOOK_SECRET` | Para webhooks | `whsec_xxx` | `whsec_AbC...` | Stripe → Webhooks → Signing secret |
| `APPLE_MERCHANT_ID` | Para Apple Pay | `merchant.com.tld` | `merchant.com.volvix` | Apple Developer → Identifiers |
| `APPLE_PAY_MERCHANT_CERT_PATH` | Para Apple Pay | filepath | `/etc/secrets/applepay.pem` | Apple Pay merchant cert |
| `APPLE_PAY_MERCHANT_KEY_PATH` | Para Apple Pay | filepath | `/etc/secrets/applepay.key` | Apple Pay private key |
| `GOOGLE_MERCHANT_ID` | Para Google Pay | string | `BCR2DN4...` | Google Pay & Wallet Console |

---

## 6) AI Providers (al menos uno para asistente IA)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Recomendada | `sk-ant-xxx` | `sk-ant-AbC...` | https://console.anthropic.com → API Keys |
| `OPENAI_API_KEY` | Alternativa | `sk-xxx` | `sk-AbC...` | https://platform.openai.com → API keys |
| `GOOGLE_API_KEY` | Alternativa | `AIza...` | `AIzaSyAbC...` | https://aistudio.google.com → Get API key |

---

## 7) Storage (S3 / R2 compatible)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `AWS_ACCESS_KEY` | Para uploads | `AKIA...` | `AKIAIOSFODNN7...` | AWS IAM → Access keys |
| `AWS_SECRET` | Para uploads | secret | (oculto) | Mismo IAM |
| `S3_BUCKET` | Para uploads | bucket name | `volvix-uploads` | AWS S3 → Create bucket |
| `S3_REGION` | Opcional | region code | `us-east-1` | Default `us-east-1` |
| `S3_ENDPOINT` | Opcional | URL | `https://r2.cloudflarestorage.com/xxx` | Para R2/MinIO/etc |

---

## 8) Push Notifications (Web Push VAPID)

| Variable | Crítica | Formato | Ejemplo | Cómo obtenerla |
|---|---|---|---|---|
| `VAPID_PUBLIC_KEY` | Para push web | base64url | `BAxx...` | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Para push web | base64url | (oculto) | Mismo generador |
| `VAPID_SUBJECT` | Para push web | `mailto:` | `mailto:admin@volvix-pos.app` | Tu email contacto |

---

## 9) Mobile App

| Variable | Crítica | Formato | Ejemplo |
|---|---|---|---|
| `MOBILE_APP_VERSION` | Opcional | semver | `1.0.0` |
| `MOBILE_MIN_SUPPORTED` | Opcional | semver | `1.0.0` |
| `MOBILE_FORCE_UPDATE` | Opcional | `true`/`false` | `false` |

---

## 10) Facturación SAT México (Finkok / PAC)

| Variable | Crítica | Formato | Ejemplo |
|---|---|---|---|
| `FINKOK_HOST` | Para CFDI | hostname | `facturacion.finkok.com` |
| `FINKOK_USER` | Para CFDI | email | `usuario@finkok.com` |
| `FINKOK_PASS` | Para CFDI | password | (oculto) |
| `CFDI_EMISOR_RFC` | Para CFDI | RFC mexicano | `XAXX010101000` |
| `PAC_USER` / `PAC_PASS` / `PAC_URL` | Alternativa | — | — |
| `SAT_PAC_URL` / `SAT_API_KEY` | Alternativa | — | — |

---

## 11) Marketplaces / Integraciones externas

| Variable | Para qué |
|---|---|
| `AMAZON_LWA_TOKEN` / `AMAZON_SP_HOST` / `AMAZON_MARKETPLACE_ID` | Amazon SP-API |
| `SHOPIFY_ACCESS_TOKEN` / `SHOPIFY_SHOP_DOMAIN` / `SHOPIFY_WEBHOOK_SECRET` / `SHOPIFY_API_VERSION` | Shopify |
| `SQUARE_ACCESS_TOKEN` | Square |
| `BBVA_API_KEY` | Bancomer |

---

## 12) Telegram / Notificaciones internas

| Variable | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot Telegram para alertas internas |

---

## 13) Otros (servicios secundarios)

| Variable | Para qué |
|---|---|
| `BLOCKCHAIN_ANCHOR_MIN_USD` | Threshold mínimo para anclar venta a blockchain (default 100) |
| `FRAUD_THRESHOLD` | Score mínimo para flag fraud (default 70) |
| `PSP_CHECK_URL` / `PSP_API_KEY` | Payment Service Provider check |
| `BANK_RECONCILE_URL` / `BANK_API_KEY` | Reconciliación bancaria |
| `REMOTE_SESSION_SECRET` | Firma de remote sessions |
| `SERVICE_AGGREGATOR_PROVIDER` | Provider de servicios (recargas) |
| `AIRTIME_PROVIDER` | Provider recargas aire |
| `SUPABASE_PAT` | Personal access token (admin tools) |
| `PASSWORD_RESET_BASE_URL` | URL base para link de reset password |

---

## Verificación rápida en runtime

Como **superadmin** logueado puedes consultar:

```bash
curl https://your-app.vercel.app/api/admin/providers/health \
  -H "Authorization: Bearer <JWT_SUPERADMIN>"
```

Respuesta de ejemplo:

```json
{
  "ok": true,
  "email":     { "configured": true,  "provider": "resend",   "missing_env_vars": [] },
  "sms":       { "configured": false, "provider": null,       "missing_env_vars": ["TWILIO_ACCOUNT_SID", ...] },
  "whatsapp":  { "configured": false, "provider": null,       "missing_env_vars": [...] },
  "stripe":    { "configured": true,  "missing_env_vars": [] },
  "ai":        { "configured": true,  "provider": "anthropic" },
  "core":      { "configured": true,  "missing_env_vars": [] },
  "overall_health_pct": 67
}
```

**El endpoint NUNCA devuelve los valores de las keys** — solo `true/false` y nombres de variables faltantes.

---

## Endpoints de prueba (superadmin)

| Endpoint | Método | Body |
|---|---|---|
| `/api/admin/providers/health` | GET | — |
| `/api/admin/providers/test/email` | POST | `{ "to": "tu@email.com" }` (default: email del admin) |
| `/api/admin/providers/test/sms` | POST | `{ "to": "+52XXXXXXXXXX" }` |
| `/api/admin/providers/test/whatsapp` | POST | `{ "to": "+52XXXXXXXXXX" }` |

Cada test envía un mensaje real al destino y reporta `ok: true/false` + `provider_msg_id`.

---

## Setup en Vercel

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Agrega las variables anteriores como `Production` + `Preview`
3. Redeploy (`vercel --prod --yes`)
4. Verifica con `GET /api/admin/providers/health`

---

## Setup en local (.env.local)

```env
# Core
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
JWT_SECRET=<openssl rand -hex 32>

# Email (mínimo uno)
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=onboarding@resend.dev

# SMS + WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_SMS_FROM=+15551234567
TWILIO_WHATSAPP_FROM=+14155238886

# AI
ANTHROPIC_API_KEY=sk-ant-xxx

# Stripe (opcional)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```
