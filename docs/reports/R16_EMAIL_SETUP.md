# R16 · SendGrid Setup + DKIM/SPF/DMARC

Domain: `salvadorexoficial.com` · Sender: `no-reply@volvix-pos.app`
Endpoint: `POST /api/email/send` (auth required) · Helper: `sendEmail()` en `api/index.js:3127`

---

## 1. Vercel env vars

```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM=no-reply@volvix-pos.app
SENDGRID_FROM_NAME=Volvix POS
PASSWORD_RESET_BASE_URL=https://salvadorexoficial.com
```

Vercel Dashboard → Project → Settings → Environment Variables → add for `Production`, `Preview`, `Development`. Después: **Redeploy** (las env se leen al boot).

API Key con scopes mínimos: `mail.send`, `templates.read`, `stats.read`, `suppressions.read`. Crear en SendGrid → Settings → API Keys → Restricted Access.

---

## 2. Authenticate Domain (DKIM)

SendGrid → Settings → Sender Authentication → **Authenticate Your Domain** → dominio `volvix-pos.app` (NO `vercel.app`, no podemos publicar DNS ahí).

Genera 3 CNAME (ejemplos, los reales los devuelve SG):

| Host | Target |
|---|---|
| `em1234.volvix-pos.app` | `u1234567.wl.sendgrid.net` |
| `s1._domainkey.volvix-pos.app` | `s1.domainkey.u1234567.wl.sendgrid.net` |
| `s2._domainkey.volvix-pos.app` | `s2.domainkey.u1234567.wl.sendgrid.net` |

Publicar en el DNS del dominio (Cloudflare / registrar). TTL 3600. Click **Verify** en SendGrid.

---

## 3. SPF (TXT)

```
volvix-pos.app  TXT  "v=spf1 include:sendgrid.net ~all"
```

Si ya existe SPF, fusionar — un solo registro v=spf1 por dominio. Máx 10 lookups DNS.

---

## 4. DMARC (TXT)

```
_dmarc.volvix-pos.app  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@volvix-pos.app; ruf=mailto:dmarc@volvix-pos.app; fo=1; adkim=s; aspf=s; pct=100"
```

Empezar con `p=none` 2 semanas, monitorear `rua`, escalar a `quarantine` y luego `reject`.

---

## 5. Link Branding

SendGrid → Sender Auth → **Link Branding** → 2 CNAMEs adicionales:

```
url1234.volvix-pos.app   CNAME  sendgrid.net
1234.volvix-pos.app      CNAME  sendgrid.net
```

Reemplaza los `*.sendgrid.net` redirect URLs de tracking por `volvix-pos.app` propio → mejora deliverability + branding.

---

## 6. Verificación curl

```bash
SENDGRID_API_BASE=https://api.sendgrid.com
curl -sS -X POST $SENDGRID_API_BASE/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations":[{"to":[{"email":"test@example.com"}]}],
    "from":{"email":"no-reply@volvix-pos.app","name":"Volvix POS"},
    "subject":"DKIM/SPF check",
    "content":[{"type":"text/plain","value":"hello"}]
  }' -i | head -20
```

Esperado: `HTTP/2 202` + header `x-message-id`.

Verificar DNS:
```bash
dig +short TXT volvix-pos.app | grep spf
dig +short TXT _dmarc.volvix-pos.app
dig +short CNAME s1._domainkey.volvix-pos.app
```

Verificar entrega real con [mail-tester.com](https://www.mail-tester.com): apuntar a 10/10 (DKIM + SPF + DMARC alineados, sin spam triggers).

---

## 7. Deep test del endpoint

```bash
# (a) sin SENDGRID_API_KEY → 503
curl -sS -X POST https://salvadorexoficial.com/api/email/send \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"to":"x@y.com","subject":"t"}' -i

# (b) sin auth → 401 (NOTA: 401 precede a 503; ver findings R16)
curl -sS -X POST https://salvadorexoficial.com/api/email/send \
  -H "Content-Type: application/json" \
  -d '{"to":"x@y.com","subject":"t"}' -i
```

---

## 8. Findings de auditoría (sendEmail helper)

| # | Issue | Sev |
|---|---|---|
| 1 | `https.request` no tiene `setTimeout(10000)` — puede colgarse | medium |
| 2 | No hay retry en 5xx/timeouts; un fallo es definitivo | medium |
| 3 | HTML no sanitizado server-side (riesgo spam triggers + XSS si llega a webview) | medium |
| 4 | 503 sólo se alcanza tras pasar `requireAuth` → unauth gets 401, no 503 | low |
| 5 | `/api/email/send` no tiene rate-limit dedicado (solo el global de login) | low |

OK: payload SendGrid v3 correcto · log a tabla `email_log` (sent/failed/provider_id) · captura `x-message-id` · no expone `SENDGRID_API_KEY` al cliente.
