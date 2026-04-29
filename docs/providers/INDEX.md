# Providers de Email + WhatsApp — Volvix POS

> Guía maestra para escoger e instalar providers de OTP y notificaciones.

## TL;DR — Recomendación según etapa

| Etapa | Email | WhatsApp |
|---|---|---|
| **Testing/QA** | Resend (free tier) | Twilio sandbox (free $15) |
| **Launch (0-1K usuarios)** | Resend free | Wasender Starter ($30/mes) |
| **Growth (1K-10K)** | Resend Pro ($20) | Wasender Pro ($99) o Twilio |
| **Scale (10K+)** | AWS SES o Resend Scale | Twilio + Meta WA Business |

## Estado actual del sistema

Cuando **NINGÚN** provider está configurado:
- Endpoint `POST /api/auth/register-tenant` retorna `providers_offline: true` y `otp_dev_visible: '123456'` en el response.
- `/registro.html` muestra banner ámbar visible con el código + auto-fill UX-friendly.
- Endpoint admin `GET /api/admin/otp/recent` permite a superadmin ver últimos OTPs y `POST /api/admin/otp/resend/:tenant_id` regenera bajo demanda.

Esto es **modo demo** — sirve para validar flow sin gastar 1 dolar, pero NO es producción.

## Comparativa Email Providers

| Provider | Setup | Free | Paid | DKIM auto | Dashboard | Recomendado para |
|---|---|---|---|---|---|---|
| **Resend** | 5 min | 3K/mes | $20/50K | ✅ | Excelente | Default |
| **SendGrid** | 30 min | 100/día | $20/40K | Manual | Pesado | Legacy / enterprise |
| **AWS SES** | 1 hora | 200/día (de EC2) | $0.10/1K | Manual | Limitado | Volumen masivo (>1M/mes) |
| **Postmark** | 10 min | 100/mes | $15/10K | ✅ | Excelente | Transactional only |
| **Mailgun** | 20 min | 5K/3-meses | $35/50K | Manual | OK | Si ya lo tienes |

**Ganador para Volvix POS**: **Resend**. Setup más rápido, DX superior, free tier generoso, DKIM auto.

Ver: `setup-resend-email.md`.

## Comparativa WhatsApp Providers

| Provider | Setup | Aprob. Meta | Costo arranque | Volumen | Compliance |
|---|---|---|---|---|---|
| **Wasender** | 5 min | ❌ No | $30/mes flat | 10K/mes | Medio |
| **Twilio Sandbox** | 10 min | ❌ No | $0 ($15 crédito) | Limitado a numeros enrolados | Solo testing |
| **Twilio Producción** | 1-3 días | ✅ Sí | ~$0.04/msg México | Ilimitado | Alto |
| **Meta WA Business directo** | 1-4 semanas | ✅ Sí (estricto) | ~$0.02/msg | Ilimitado | Máximo |
| **MessageBird / 360dialog** | 3-7 días | ✅ Sí | ~$0.03/msg | Ilimitado | Alto |

**Ganador para arranque**: **Wasender** (rapidez).
**Ganador para producción seria**: **Twilio**.

Ver: `setup-wasender-whatsapp.md`, `setup-twilio-whatsapp.md`.

## Detección automática del sistema

`api/index.js` — handler `POST /api/auth/register-tenant`:

```js
const hasEmailProvider = !!(
  process.env.SENDGRID_API_KEY ||
  process.env.RESEND_API_KEY ||
  process.env.SMTP_HOST
);
const hasWhatsAppProvider = !!(
  process.env.TWILIO_ACCOUNT_SID ||
  process.env.WASENDER_API_KEY ||
  process.env.WHATSAPP_TOKEN
);
const providersOffline = !hasEmailProvider && !hasWhatsAppProvider;
```

**Comportamiento**:
- `providersOffline === true` Y (`NODE_ENV !== 'production'` O `ALLOW_OTP_DEV_VISIBLE === '1'` por default) → response incluye `otp_dev_visible: '123456'`.
- Si **al menos uno** está configurado → no se expone código en respuesta.
- Banner ámbar en `/registro.html` solo aparece en modo demo.

## Variables de entorno

### Email
- `RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx` (recomendado)
- `SENDGRID_API_KEY=SG.xxxxxxxx` (legacy)
- `SMTP_HOST=smtp.gmail.com` + `SMTP_USER` + `SMTP_PASS` (fallback genérico)

### WhatsApp
- `WASENDER_API_KEY=wsk_live_xxxx` (más simple)
- `TWILIO_ACCOUNT_SID=ACxxx` + `TWILIO_AUTH_TOKEN=xxx` + `TWILIO_WHATSAPP_FROM=whatsapp:+1...`
- `WHATSAPP_TOKEN=EAAxxx` (Meta directo)

### Control de modo demo
- `ALLOW_OTP_DEV_VISIBLE=0` (default es '1' / ausente → permite expose) — solo úsalo para forzar **NO** exponer código aunque providers offline (ej. compliance test).

## Plan de implementación recomendado

### Día 1 (HOY) — Modo demo
- [x] Sistema retorna `otp_dev_visible` cuando providers offline (FIX-1).
- [x] Banner ámbar en `/registro.html` (FIX-2).
- [x] Endpoints admin para soporte humano (FIX-3).
- [x] Documentación lista (FIX-4 = este archivo).

### Día 2-7 — Email real con Resend
- [ ] Crear cuenta Resend.
- [ ] Verificar dominio `volvix.com`.
- [ ] Agregar `RESEND_API_KEY` a Vercel.
- [ ] Implementar SDK call dentro de `sendOtpNotifications()` en `api/index.js`.
- [ ] Test E2E: registro → llega email real → OTP funciona.

### Semana 2 — WhatsApp con Wasender
- [ ] Cuenta Wasender + número WhatsApp Business dedicado.
- [ ] Conectar QR.
- [ ] Agregar `WASENDER_API_KEY` a Vercel.
- [ ] Implementar SDK call (HTTP POST).
- [ ] Test E2E.

### Mes 2+ — Migración a Twilio (si volumen > 5K/mes)
- [ ] Aplicar a Twilio WhatsApp Business.
- [ ] Aprobación Meta (1-3 días).
- [ ] Switchover gradual: nuevo registro → Twilio; existing → Wasender.
- [ ] Decommission Wasender después de 30 días sin issues.

## Soporte humano mientras providers offline

Si un cliente reporta "no me llegó el código":

1. Superadmin entra al panel admin.
2. Llama `GET /api/admin/otp/recent` → ve últimos 50 OTPs.
3. Encuentra al tenant del cliente, copia `otp_code`.
4. Lo comparte por canal seguro (llamada, otro WhatsApp, etc.).

O alternativamente:
1. `POST /api/admin/otp/resend/:tenant_id` → genera nuevo OTP.
2. Response incluye el código nuevo en plain text.
3. Compartirlo con el cliente.

## Seguridad

- ⚠️ **Nunca exponer `otp_dev_visible` en producción real con providers configurados** — solo es safety net para modo demo.
- ⚠️ Setear `ALLOW_OTP_DEV_VISIBLE=0` cuando vayas a producción Y tengas providers — para forzar que el código NUNCA aparezca en respuesta.
- ⚠️ Endpoint `/api/admin/otp/recent` requiere role `superadmin` — auditado en `pos_audit_log`.
- ⚠️ El OTP en DB tiene TTL de 10 min y max 5 intentos — eso no cambia.

## Archivos relacionados

- `setup-resend-email.md` — instalación de Resend
- `setup-twilio-whatsapp.md` — instalación de Twilio (sandbox + producción)
- `setup-wasender-whatsapp.md` — instalación de Wasender (más simple)
- `../../api/index.js` — handler register-tenant + verify-otp + admin endpoints
- `../../registro.html` — UI con banner modo demo
