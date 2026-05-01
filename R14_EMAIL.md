# R14 · Emails transaccionales (SendGrid)

Implementacion de envio de emails transaccionales via SendGrid HTTP API
(`POST https://api.sendgrid.com/v3/mail/send`) sin dependencias npm.

## Archivos

- `api/index.js` — helper `sendEmail()`, triggers, endpoints nuevos.
- `api/email-templates.js` — `welcomeTemplate`, `receiptTemplate`,
  `lowStockTemplate`, `passwordResetTemplate`. Layout responsive con tabla,
  logo placeholder, escape HTML.
- `db/R14_EMAIL_LOG.sql` — tabla `email_log` + indice `(ts desc, status)` + RLS admin.

## Triggers automaticos

| Evento | Endpoint origen | Plantilla |
|---|---|---|
| Crear usuario | `POST /api/owner/users` | `welcome` |
| Crear venta con `customer.email` o `customer_email` | `POST /api/sales` | `receipt` |
| Reset password | `POST /api/auth/password-reset/request` | `password_reset` |
| Job de stock bajo | `POST /api/admin/jobs/low-stock-alert` | `low_stock` |

Todos los envios son **fire-and-forget** (no bloquean la respuesta HTTP) y
quedan registrados en `email_log` con status `sent` o `failed`.

## Endpoints nuevos

### `POST /api/auth/password-reset/request`  (publico, rate-limit 5/15min/IP)
Body: `{ "email": "user@x.com" }`
- Genera JWT corto (15 min, `purpose: pwd_reset`).
- Envia email con link `${PASSWORD_RESET_BASE_URL}/reset-password.html?token=...`.
- Respuesta generica anti-enumeration (no revela si el email existe).

### `POST /api/auth/password-reset/confirm`  (publico, rate-limit 10/15min/IP)
Body: `{ "token": "...", "new_password": "min8chars" }`
- Valida JWT, hashea con scrypt, actualiza `password_hash`.

### `POST /api/admin/jobs/low-stock-alert`  (auth admin/owner/superadmin)
Body opcional: `{ "recipients": ["a@x.com", ...] }`
- Busca productos con `stock <= reorder_point` (default 20 si null).
- Si no se pasan `recipients`, busca emails de usuarios `role=ADMIN, is_active=true`.
- Siempre incluye al usuario que dispara el job.
- Manda email con tabla resumen.

## Configuracion: variables de entorno

Anadir a Vercel / `.env`:

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM=no-reply@tu-dominio.com
SENDGRID_FROM_NAME=Volvix POS
PASSWORD_RESET_BASE_URL=https://salvadorexoficial.com
```

Si `SENDGRID_API_KEY` falta: el helper escribe `warn` en stdout, registra
`failed` en `email_log` y devuelve `{ ok: false }`. **No rompe el boot.**

## Setup SendGrid (paso a paso)

### 1. Crear cuenta + API key
1. Sign up en https://signup.sendgrid.com
2. Settings -> API Keys -> Create API Key
3. Permission: **Restricted Access** -> habilitar solo "Mail Send"
4. Guardar la key (se muestra una sola vez). Pegarla en `SENDGRID_API_KEY`.

### 2. Verificar el dominio remitente (Sender Authentication)
Sin esto, los emails caen en spam.

1. Settings -> Sender Authentication -> **Authenticate Your Domain**
2. DNS Host: tu proveedor (Cloudflare, GoDaddy, etc.)
3. Domain: `tu-dominio.com`
4. SendGrid genera 3 registros CNAME que debes anadir al DNS:

```
CNAME   em####.tu-dominio.com         ->  u#####.wl###.sendgrid.net
CNAME   s1._domainkey.tu-dominio.com  ->  s1.domainkey.u#####.wl###.sendgrid.net
CNAME   s2._domainkey.tu-dominio.com  ->  s2.domainkey.u#####.wl###.sendgrid.net
```

(Los valores reales los da SendGrid en su panel; los `s1._domainkey` /
`s2._domainkey` son los registros **DKIM**.)

### 3. SPF
Si tu dominio aun no tiene SPF, anadir un TXT en el root:

```
TXT  @  "v=spf1 include:sendgrid.net ~all"
```

Si ya tienes SPF, **no crear otro** — fusionar con el existente:

```
TXT  @  "v=spf1 include:_spf.google.com include:sendgrid.net ~all"
```

(Solo puede haber un registro SPF por dominio.)

### 4. DMARC (recomendado)
Politica minima de monitoreo:

```
TXT  _dmarc.tu-dominio.com  "v=DMARC1; p=none; rua=mailto:dmarc@tu-dominio.com"
```

Cuando confirmes que todo el correo legitimo pasa SPF+DKIM, sube a `p=quarantine` y luego `p=reject`.

### 5. Verificar
- En SendGrid: Settings -> Sender Authentication -> Verify (click).
- Test: `curl -X POST https://api.sendgrid.com/v3/mail/send ...` o disparar
  el flujo welcome creando un user de prueba.
- Comprobar `email_log` en Supabase: debe haber un row con `status='sent'`.

### 6. Link Branding (opcional)
Settings -> Sender Authentication -> Link Branding. Anade 2 CNAMEs mas
para que los links de tracking salgan con tu dominio en lugar de
`sendgrid.net`. Mejora reputacion.

## Tabla `email_log`

```sql
email_log(
  id          uuid pk,
  ts          timestamptz default now(),
  to_email    text,
  subject     text,
  template    text,                       -- welcome | receipt | low_stock | password_reset
  status      text check in (sent|failed|queued),
  provider_id text,                       -- X-Message-Id de SendGrid
  error       text
)
```

- Indice principal: `(ts desc, status)`.
- RLS: select/insert solo para `pos_users.role in (ADMIN,SUPERADMIN,OWNER)`.
- El backend opera con `service_role` y bypasea RLS automaticamente.

## Validacion sintactica

```bash
node --check api/index.js
node --check api/email-templates.js
```

Ambos pasan sin errores.

## Notas operativas

- Helper **nunca lanza**: si SendGrid falla, devuelve `{ok:false}` y registra
  en `email_log` para auditoria.
- `sendEmail()` se llama con `.catch(()=>{})` desde los triggers para no
  romper la transaccion principal.
- Rate limits aplicados a endpoints publicos para prevenir abuso.
- Reset token usa `JWT_SECRET` ya existente y valida `purpose: pwd_reset`
  para evitar reuso de tokens de login.
