# R13 — DEPLOY CHECKLIST PRE-PRODUCCIÓN (Volvix SaaS v7.1.0)

Checklist profesional pre-producción para `api/index.js` desplegado en Vercel con Supabase + Anthropic.
Marca cada item antes del go-live. Comandos asumen `bash` desde la raíz del proyecto.

Stack detectado:
- Runtime: `@vercel/node` (Node >=18) — `vercel.json`
- Backend: Supabase REST (`zhvwmzkcqngcaqpdxtwr.supabase.co`)
- IA: Anthropic Messages API (`claude-sonnet-4-5-20250929`)
- Static: HTML/JS servidos vía `api/index.js` (`serveStaticFile`)

---

## 1. Variables de entorno requeridas (Vercel → Project → Settings → Environment Variables)

> Las claves hardcodeadas en `api/index.js` líneas 14-16 DEBEN moverse a env vars antes del deploy productivo. Ver Sección 11 (rotación).

- [ ] **`SUPABASE_URL`** — URL del proyecto Supabase (`https://zhvwmzkcqngcaqpdxtwr.supabase.co`).  
  Verificar: `vercel env ls production | grep SUPABASE_URL`
- [ ] **`SUPABASE_SERVICE_KEY`** — Service role key (JWT). NUNCA exponer al cliente.  
  Verificar: `vercel env ls production | grep SUPABASE_SERVICE_KEY`
- [ ] **`ANTHROPIC_API_KEY`** — Clave Anthropic con cuota suficiente.  
  Verificar: `curl -s -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/messages -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}' -H "Content-Type: application/json"`
- [ ] **`NODE_ENV=production`** — Ya configurada en `vercel.json`. Confirmar no override.  
  Verificar: `vercel env ls production | grep NODE_ENV`
- [ ] **`SUPABASE_ANON_KEY`** (opcional cliente) — Si frontend necesita lectura directa.
- [ ] **`SENTRY_DSN`** — DSN de Sentry para captura de errores serverless.  
  URL: https://sentry.io/settings/projects/<proj>/keys/
- [ ] **`SENTRY_ENVIRONMENT=production`**
- [ ] **`HOTJAR_SITE_ID`** — Para tracking UX si se inyecta en HTML.
- [ ] **`LOG_LEVEL=info`** — Para `volvix-logger-wiring.js`.
- [ ] **`RATE_LIMIT_RPM=60`** — Requests por minuto por IP en `volvix-ratelimit-wiring.js`.
- [ ] **`ALLOWED_ORIGINS`** — Reemplazar `Access-Control-Allow-Origin: *` (línea 121, 754) por lista blanca.
- [ ] **`SESSION_SECRET`** — Para firmar tokens (actualmente sólo `expires_at` plano, línea 218).
- [ ] **`BACKUP_WEBHOOK_URL`** — Endpoint para alertas de backup fallido.
- [ ] Confirmar que NINGUNA env var está en `Preview`/`Development` apuntando a producción.  
  Verificar: `vercel env ls preview` y `vercel env ls development`

---

## 2. DNS / Dominio

- [ ] **Dominio principal apuntado a Vercel** (`A 76.76.21.21` o `CNAME cname.vercel-dns.com`).  
  Verificar: `dig +short volvix.com` y `dig +short www.volvix.com`
- [ ] **Subdominio `api.volvix.com`** configurado si se separa API (opcional).  
  Verificar: `dig +short api.volvix.com CNAME`
- [ ] **Registros MX preservados** (no romper email).  
  Verificar: `dig +short volvix.com MX`
- [ ] **TXT SPF/DKIM/DMARC** intactos.  
  Verificar: `dig +short volvix.com TXT`
- [ ] **CAA record** que permita Let's Encrypt / DigiCert.  
  Verificar: `dig +short volvix.com CAA`
- [ ] **Redirect www → apex** (o viceversa) configurado en Vercel Domains.  
  URL: https://vercel.com/<team>/<project>/settings/domains
- [ ] **TTL razonable** (300-3600s) durante migración, luego subir.

---

## 3. SSL / TLS

- [ ] **Certificado SSL emitido por Vercel** (auto Let's Encrypt).  
  Verificar: `curl -vI https://volvix.com 2>&1 | grep -E "subject|issuer|expire"`
- [ ] **HTTPS redirect activo** (HTTP → HTTPS 308).  
  Verificar: `curl -sI http://volvix.com | grep -i location`
- [ ] **HSTS header** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.  
  Añadir a `sendJSON`/`serveStaticFile` en `api/index.js`.  
  Verificar: `curl -sI https://volvix.com | grep -i strict-transport`
- [ ] **TLS 1.2+ únicamente** (default Vercel).  
  Verificar: `nmap --script ssl-enum-ciphers -p 443 volvix.com`
- [ ] **SSL Labs A+ score**.  
  URL: https://www.ssllabs.com/ssltest/analyze.html?d=volvix.com
- [ ] **Cert renewal automático** confirmado en panel Vercel.

---

## 4. Headers de seguridad

- [ ] **`Content-Security-Policy`** definido (nada de `*` en `script-src`).
- [ ] **`X-Frame-Options: DENY`** (excepto `volvix-customer-portal.html` si se embeda).
- [ ] **`X-Content-Type-Options: nosniff`**.
- [ ] **`Referrer-Policy: strict-origin-when-cross-origin`**.
- [ ] **`Permissions-Policy`** restringiendo geolocation/camera salvo donde se use.
- [ ] **CORS específico** — reemplazar `Access-Control-Allow-Origin: *` (líneas 121, 169, 754) por `ALLOWED_ORIGINS`.  
  Verificar: `curl -sI -H "Origin: https://evil.com" https://volvix.com/api/health | grep -i access-control`

---

## 5. Monitoreo (Sentry / Hotjar / Uptime)

- [ ] **Sentry SDK Node integrado** en `api/index.js` (wrap `module.exports`).  
  URL: https://docs.sentry.io/platforms/javascript/guides/node/
- [ ] **Source maps subidos** a Sentry para stack traces legibles.
- [ ] **Sentry release tag** = `git rev-parse --short HEAD`.  
  Verificar: `curl -s "https://sentry.io/api/0/projects/<org>/<proj>/releases/" -H "Authorization: Bearer $SENTRY_TOKEN"`
- [ ] **Hotjar instalado** vía `volvix-hotjar-wiring.js` con `HOTJAR_SITE_ID`.
- [ ] **Sentry alert: error rate > 1%** configurada.
- [ ] **Sentry alert: p95 latency > 2s** configurada.
- [ ] **Uptime monitor externo** (UptimeRobot / BetterStack) sobre `/api/health`.  
  URL: https://uptimerobot.com/dashboard
- [ ] **Status page pública** (`status.volvix.com` o BetterStack).
- [ ] **Synthetic check** sobre `/api/login` con credentials de prueba.

---

## 6. Backups Supabase

- [ ] **PITR (Point-in-Time Recovery) activado** — plan Pro requerido.  
  URL: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/database/backups
- [ ] **Backup diario verificado** (último <24h).
- [ ] **Test de restore mensual** documentado en runbook.
- [ ] **Dump manual semanal** a S3/storage offsite.  
  Comando: `pg_dump "$SUPABASE_DB_URL" | gzip > backup_$(date +%F).sql.gz`
- [ ] **Retención >=30 días** confirmada.
- [ ] **Backup de Storage buckets** (si se usan) — no incluido en PITR de Postgres.
- [ ] **RLS policies exportadas** y versionadas en `db/`.  
  Comando: `supabase db dump --schema public > db/schema_$(date +%F).sql`
- [ ] **Webhook de fallo de backup** apunta a `BACKUP_WEBHOOK_URL`.

---

## 7. Rate limiting

- [ ] **Rate limit en `/api/login`** — máx 5 intentos/min/IP (anti brute-force).
  Actualmente `POST /api/login` (línea 183) NO tiene throttle.
- [ ] **Rate limit en `/api/ai/decide` y `/api/ai/support`** — proteger cuota Anthropic ($).
- [ ] **Rate limit en `/api/features/request`** — invoca Claude por request.
- [ ] **Vercel Edge Config / KV** para contador distribuido.
  URL: https://vercel.com/docs/storage/edge-config
- [ ] **Cloudflare WAF rules** si Cloudflare está delante.
- [ ] **Bloqueo de IPs abusivas** documentado (Vercel Firewall).
- [ ] **Header `Retry-After`** en respuestas 429.
- [ ] **Test de carga**: `ab -n 1000 -c 50 https://volvix.com/api/health`

---

## 8. CDN / Cache

- [ ] **Vercel Edge Cache activo** para estáticos. Actualmente `Cache-Control: public, max-age=3600` en línea 170.
- [ ] **`Cache-Control: no-store`** en endpoints `/api/*` (línea 122 OK).
- [ ] **`s-maxage` y `stale-while-revalidate`** ajustados para HTML públicos (`landing_dynamic.html`, `marketplace.html`).
- [ ] **Assets versionados** (hash en filename) para invalidación.
- [ ] **Compression Brotli/Gzip** activa (default Vercel).  
  Verificar: `curl -sI -H "Accept-Encoding: br" https://volvix.com/login.html | grep -i content-encoding`
- [ ] **Image Optimization** activada para `manifest.json` icons.
- [ ] **`vercel.json` `includeFiles`** revisado — actualmente `**/*.html, **/*.js, **/*.json, db/**` (puede inflar bundle, ver `files (2).zip`/`files (3).zip` accidentalmente incluidos).  
  Verificar tamaño: `vercel inspect <deployment-url>`
- [ ] **`.vercelignore` creado** excluyendo `*.zip`, `*.log`, `BITACORA_*`, `TASKS_FOR_NEXT_AI.md`, `server.log`.

---

## 9. Logs

- [ ] **Vercel Logs habilitados** (nivel runtime).  
  URL: https://vercel.com/<team>/<project>/logs
- [ ] **Log Drain configurado** a Datadog / Logtail / Axiom.  
  URL: https://vercel.com/<team>/<project>/settings/log-drains
- [ ] **`console.error` con contexto** en cada `catch` de `api/index.js` (actualmente sólo `err.message` al cliente).
- [ ] **Request ID propagado** (`x-vercel-id` en respuestas).
- [ ] **PII redaction**: NUNCA loggear `password`, `password_hash`, `SUPABASE_SERVICE_KEY`.
- [ ] **Retención de logs >=30 días**.
- [ ] **`server.log` excluido del deploy** (existe en raíz).

---

## 10. Alertas

- [ ] **Alerta: 5xx rate > 0.5% en 5min** → Slack/PagerDuty.
- [ ] **Alerta: `/api/health` DOWN** → SMS al on-call.
- [ ] **Alerta: Supabase connection fail** (línea 239 `supabase_connected: false`).
- [ ] **Alerta: Anthropic 429/529** → degradación a modo simulación documentada.
- [ ] **Alerta: gasto Anthropic > $X/día**.
- [ ] **Alerta: gasto Vercel function invocations > umbral**.
- [ ] **Alerta: Supabase row count anomaly** (deletion masivo).
- [ ] **Alerta: SSL cert expira <14 días**.
- [ ] **Alerta: dominio expira <30 días** (en registrar).
- [ ] **Runbook de respuesta** documentado por cada alerta.
- [ ] **On-call rotation** definida.

---

## 11. Seguridad pre-deploy

- [ ] **Rotar `SUPABASE_SERVICE_KEY`** — actualmente hardcodeada en `api/index.js:15`.  
  URL: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/settings/api
- [ ] **Eliminar fallback hardcodeado** en líneas 14-16 (sólo leer de env).
- [ ] **`password_hash` real (bcrypt/argon2)** — actualmente comparación plaintext en línea 196 (`user.password_hash !== password`). CRÍTICO.
- [ ] **JWT firmado** para sesiones — actualmente sólo objeto plano (línea 213-220).
- [ ] **RLS policies** revisadas en cada tabla `pos_*`, `customers`, `licenses`.
- [ ] **Auditoría `npm audit`** — `npm audit --production`.
- [ ] **Secrets scanning** (gitleaks).  
  Comando: `gitleaks detect --source . --no-git`
- [ ] **Verificar `.git` no se incluye en deploy** (Vercel lo excluye por default).

---

## 12. Verificación post-deploy

- [ ] **Smoke test `/api/health`**.  
  Comando: `curl -s https://volvix.com/api/health | jq`
- [ ] **Smoke test login**.  
  Comando: `curl -s -X POST https://volvix.com/api/login -H "Content-Type: application/json" -d '{"email":"admin@volvix.test","password":"..."}'`
- [ ] **Smoke test `/api/debug`** y luego DESHABILITARLO en producción (línea 699 expone schema).
- [ ] **Lighthouse score >=90** en `login.html`, `landing_dynamic.html`.  
  Comando: `npx lighthouse https://volvix.com --view`
- [ ] **OWASP ZAP baseline scan**.  
  Comando: `docker run -t owasp/zap2docker-stable zap-baseline.py -t https://volvix.com`
- [ ] **Service Worker (`sw.js`) sirve correctamente** y no cachea API.

---

## 13. Rollback plan

- [ ] **Promote previous deployment** disponible en 1 click.  
  URL: https://vercel.com/<team>/<project>/deployments  
  Comando: `vercel rollback <deployment-url> --yes`
- [ ] **Tag de release en git** antes de deploy: `git tag v7.1.0 && git push --tags`.
- [ ] **Snapshot Supabase pre-deploy** (PITR marker o dump).  
  Comando: `pg_dump "$SUPABASE_DB_URL" | gzip > pre_deploy_$(date +%F-%H%M).sql.gz`
- [ ] **Migration script reversible** (`db/down_*.sql` por cada `up_*.sql`).
- [ ] **Feature flag** para nuevo código (kill switch vía env `FEATURE_X=off`).
- [ ] **Comunicación pre-deploy** al equipo (Slack #deploys).
- [ ] **Ventana de mantenimiento** anunciada en `status.volvix.com`.
- [ ] **Procedimiento de rollback documentado** con tiempos esperados (<5 min).
- [ ] **Test de rollback en staging** ejecutado en últimos 30 días.
- [ ] **DNS TTL bajo** (300s) durante 24h post-deploy.
- [ ] **Contacto Supabase support** y **Vercel support** identificado para incidente P0.

---

## 14. Compliance / Legal

- [ ] **Aviso de privacidad** publicado y enlazado desde `login.html`.
- [ ] **Términos y condiciones** vigentes.
- [ ] **Cookie banner** si se usa Hotjar/GA en EU.
- [ ] **Procesador de datos firmado** con Supabase y Anthropic (DPA).
- [ ] **Logs de acceso** retenidos según política.

---

## 15. Performance

- [ ] **Cold start `<1s`** en función serverless (medir con `vercel logs --follow`).
- [ ] **`pos_users.email` indexado** en Supabase (login query línea 191).  
  Comando: `create index if not exists idx_pos_users_email on pos_users(email);`
- [ ] **Connection pooling** en Supabase (PgBouncer).
- [ ] **Promise.all en `/api/owner/dashboard`** (línea 389) — OK.
- [ ] **Bundle size función** <50MB (Vercel hard limit).  
  Verificar: `vercel inspect <url>`

---

**Total: 80+ items.** Marcar todos antes del go-live. Re-verificar items críticos (1, 3, 6, 11, 13) cada release.

_Generado: 2026-04-26 — versión R13 — fuentes: `vercel.json`, `package.json`, `api/index.js` v7.1.0._
