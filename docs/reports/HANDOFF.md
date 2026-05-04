# 🤝 HANDOFF.md — Estado completo Volvix POS

**Fecha:** 2026-05-01
**Sesión completada:** ~70 commits, ~40,000 líneas, 32 módulos backend + 7 nuevas migraciones aplicadas
**Repo:** `D:\volvix-pos-GITHUB-BACKUP-2026-04-29` → `github.com/pruebavolte/volvix-pos`
**Dominio canónico:** `https://systeminternational.app`
**Dominio legacy activo:** `https://salvadorexoficial.com`

---

## 🎯 Para qué sirve este sistema

Volvix POS / SalvadoreX es un SaaS multi-tenant de Punto de Venta para negocios mexicanos:
- Cliente llega a `/` → busca su giro → landing personalizada o generada con IA
- Se registra con **teléfono + contraseña** (3 pasos, OTP via SMS con auto-fill nativo)
- Recibe acceso al POS con datos demo
- Activa módulos (POS, Inventario, Recargas, etc.)
- Empieza a vender → cobra cuando alcanza usage threshold (no trial fijo)
- Tú (super-admin) controlas: módulos+botones por cliente, regalar días, bloquear morosos, impersonar

---

## ✅ QUÉ YA FUNCIONA (estado al 2026-05-01)

### Supabase — 7 nuevas migraciones aplicadas hoy

| Migración | Tablas creadas | Función |
|---|---|---|
| `giros-synonyms.sql` | `giros_synonyms` | 63 giros + sinónimos para autocomplete inteligente |
| `system-error-logs.sql` | `system_error_logs` | Tracking de errores de sistema (no se muestran al usuario) |
| `usage-billing.sql` | `tenant_usage_events`, `tenant_usage_summary`, `tenant_billing_overrides` | Usage-based billing + middleware 402 |
| `shop-orders.sql` | `shop_orders` | E-commerce del tenant |
| `status-monitor.sql` | `system_incidents`, `system_health_pings` | Monitor de uptime + incidentes |
| `2026_pos_leads_and_tour_progress.sql` | `pos_leads`, `volvix_user_tour_progress` | Lead capture + estado del tour de onboarding |
| `r45-tenant-button-control.sql` | `tenant_button_overrides`, `tenant_admin_notes`, `tenant_impersonation_log` | Control granular de botones por tenant + notas admin + log de impersonación |

### Backend (32 módulos en `api/`)

| Módulo | Endpoint | Status |
|---|---|---|
| `auth` | `/api/login`, `/api/auth/register-simple`, `/auth/verify-simple` | ✅ Live |
| `giros` | `/api/giros`, `/giros/search`, `/giros/autocomplete` (sinónimos) | ✅ Live |
| `payments-mercadopago` | `/api/payments/mercadopago/*` | ⚠️ Espera key |
| `payments-stp` | `/api/payments/stp/*` + CoDi QR | ⚠️ Espera convenio |
| `integrations-delivery` | 6 webhooks (Uber/DiDi/Rappi/SinDelantal/iFood/PedidosYa) | ⚠️ Partner approval |
| `ai-engine` | `/api/ai/chat`, `/forecast`, `/insights` | ⚠️ Espera OPENAI_API_KEY |
| `email-resend` | OTP + welcome + receipt + CFDI | ✅ RESEND_API_KEY set |
| `email-campaigns` | Drip campaigns + tracking | ✅ Listo |
| `email-drips` | Welcome 14d / cart 25h / re-engagement | ✅ Cron config |
| `recargas-servicios` | Telcel/Movistar/CFE/etc | ⚠️ Espera reseller key |
| `pdf-export` | 8 reportes PDF | ✅ Funciona |
| `cfdi-pac` | CFDI 4.0 stamping + cancel | ⚠️ Espera PAC keys |
| `labels` | ZPL/ESC-POS/PDF batch | ✅ Funciona |
| `customer-portal` | Mi cuenta cliente | ✅ Live |
| `vendor-portal` | Portal proveedores | ✅ Live |
| `gdpr` | ARCO completo | ✅ Live |
| `fraud-detection` | Reglas + alerts | ✅ Live |
| `status-monitor` | Uptime + incidents | ✅ Live |
| `remote-terminals` | Control remoto + sync | ✅ Live |
| `push-notifications` | Web Push subscribe/send | ⚠️ Espera VAPID keys |
| `newsletter` | Subscribe + drip | ✅ Live |
| `referrals` | Programa referidos + QR share | ✅ Live |
| `cron-jobs` | Daily/weekly/monthly summaries | ✅ Cron registrado |
| `abtest` | A/B testing + Wilson 95% CI | ✅ Live |
| `webhook-security` | HMAC-SHA256 + replay protection | ✅ Live |
| `rate-limit` | Sliding window 60/min/IP | ✅ Live |
| `backup` | Export/restore con encryption | ✅ Live |
| `geo-ip` | Audit enrichment | ✅ Live |
| `activity-feed` | Realtime activity stream | ✅ Live |
| `inventory-advanced` | Multi-warehouse + transfer + reorder | ✅ Live |
| `loyalty-advanced` | Bronze/Silver/Gold/Platinum + birthday | ✅ Live |
| `promotions-engine` | 5 tipos + coupons + flash + bundles | ✅ Live |
| `appointments` + `services-catalog` | Booking + waitlist + cron reminder | ✅ Live |
| `usage-billing` | Tracking + middleware 402 + lock/unlock | ✅ Live |
| `leads` | Capture + admin list | ✅ Live |

### Frontend
- 142 URLs activas (9 TIER 0, 9 TIER 1 POS, 8 TIER 2 Admin, 5 TIER 3 Portales, 50 landings de giros, etc.)
- POS principal: `salvadorex_web_v25.html`

### UI limpia (aplicado hoy)
- ✅ Sin floating buttons (notifications, health pill, sync widget, theme toggle, academy AI avatar)
- ✅ Language switch INLINE en header/nav/footer — no flotante
- ✅ Banner "🇲🇽 Hecho en México" auto-inject
- ✅ Errores de sistema NO se muestran al usuario → se logean a `system_error_logs`
- ✅ Errores de validación SÍ se muestran con mensaje claro

### Bugs corregidos hoy
- ✅ B4: `<title>` truncado en landing-taqueria.html
- ✅ B5: validation order en register-simple (business_name antes que phone)
- ✅ B6: Canonicals faltantes en registro.html y salvadorex_web_v25.html
- ✅ B7: `/api/admin/tenants` 404 — handler agregado
- ✅ B8: Sitemap regenerado (npm run sitemap → ahora refleja 142 URLs reales)

### Variables de entorno confirmadas en Vercel
- ✅ `RESEND_API_KEY`
- ✅ `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `JWT_SECRET`
- ✅ `ADMIN_API_KEY`

---

## 🚨 LO QUE FALTA (para 100% live)

### 1. Vercel deploy bloqueado — CRÍTICO
El commit `689b457` (el más reciente con todo el trabajo de hoy) **NO está en Production**.
El `deploy_marker` aún apunta a `9b82f90`.

**Acción:** Vercel Dashboard → proyecto `volvix-pos` → Deployments → buscar commit `689b457` → `⋯` → "Promote to Production"

Si no aparece o hay build error, verificar:
- Deployments tab → ver si hay error de build
- Settings → Git → confirmar que el branch es `main`
- Si hay "Ignored Build Step" activo: desactivarlo

### 2. API Keys pendientes (en orden de prioridad)

| Variable | Servicio | Sin ella... |
|---|---|---|
| `TWILIO_ACCOUNT_SID` + `AUTH_TOKEN` + `TWILIO_SMS_FROM` | SMS OTP | Registro falla (usa dev_code fallback) |
| `OPENAI_API_KEY` | IA chat/forecast | Páginas IA muestran "no configurado" |
| `MERCADO_PAGO_ACCESS_TOKEN` + `PUBLIC_KEY` | Pagos MX | Pagos en mock |
| `STRIPE_SECRET_KEY` + `PUBLISHABLE_KEY` | Pagos USD | Pagos en mock |
| `VOLVIX_GA_ID` | Google Analytics 4 | Sin tracking |
| `VOLVIX_FB_PIXEL_ID` | Meta Pixel | Sin tracking |

Agregar en: Vercel → Settings → Environment Variables → Import .env → pegar `.env.production.template`

### 3. Migraciones SQL restantes (~55 archivos de la serie r1-r12)

Las **7 críticas de hoy ya están aplicadas** (ver sección anterior).
Quedan pendientes las de la serie `r1` a `r12` (hardening, realtime, seguridad, etc.):

```
r1-pos-core-hardening.sql
r2-mv-sales-daily.sql
r3a-devoluciones-hardening.sql
r3b-promociones-priority.sql
r4a-inventario-hardening.sql
r4b-customers-hardening.sql
r4c-cortes-hardening.sql
r5a-kds-hardening.sql
r5b-perms-rt.sql
r5c-audit-rewrite.sql
r6a-auth-hardening.sql
r6c-quotations-pdf.sql
r7a-security-fixes.sql
r7c-canonicalize-status.sql
r8a-hardware-resilience.sql
r8b-recovery-server.sql
r8c-sales-search.sql
r8e-dr-feature-flags.sql
r8f-multi-sucursal.sql
r8g-approvals-fraud.sql
r9a-rls-cart-hardening.sql
r9b-security-hardening.sql
r10a-nivel1-realtime.sql
r10b-nivel2-daily.sql
r10c-a-schedule-anomaly.sql
r10d-a-multimoneda-impuestos.sql
r10e-a-payments-remote.sql
r11-final-hardening.sql
r12-dedupe-products.sql
r12-o-1-registro-otp.sql
r12-o-3a-messaging.sql
r12a-demo-data-pro.sql
r12b-arco-requests.sql
r12bug-fix-bootstrap.sql
```

Aplicar via Supabase Dashboard → SQL Editor → paste + run (todos son idempotentes con `IF NOT EXISTS`).

---

## 👤 USUARIOS DE PRUEBA

### Super Admin (TÚ)
```
Email:    admin@volvix.test
Password: Volvix2026!
Role:     superadmin
Tenant:   TNT001 (Abarrotes Don Chucho)
Acceso:   /volvix-admin-saas.html · /volvix-mega-dashboard.html · /internal/index.html · todo lo demás
```

### Owner (cliente dueño de negocio)
Registrarse fresh en `/registro.html`:
```
Phone:    8112345099 (ejemplo)
Tenant:   TNT-XXXXX (auto-generado)
Role:     owner
Acceso:   /volvix_owner_panel_v8.html · /salvadorex_web_v25.html · /mis-modulos.html
```

### Cajero (empleado del owner)
Owner crea via `/volvix-user-management.html`:
```
Role:     cajero
Acceso:   /salvadorex_web_v25.html · /pos-clientes.html · /pos-inventario.html (limitado)
```

### Cliente Final
```
Login:    Phone + OTP en /volvix-customer-portal.html
Acceso:   /volvix-shop.html?tenant=TNT-XXX · /volvix-booking.html
```

---

## 🔄 DEPLOY FLOW

- **Dominio canónico:** `systeminternational.app`
- **Branch:** `main` (NO master)
- **Auto-deploy:** push a `main` → Vercel deploya automáticamente como Production
- **Project ID:** `prj_2f9m0VwArnqlGvlBZtxchvQl1a2t`
- **Vercel team:** `grupo-volvixs-projects`
- **Supabase project:** `zhvwmzkcqngcaqpdxtwr`
- **Crons en vercel.json:**
  - `0 8 * * *` → `/api/cron/daily-summary`
  - `0 9 * * 1` → `/api/cron/weekly-report`
  - `0 10 1 * *` → `/api/cron/monthly-billing`
- **CSP configurada** para `systeminternational.app` en `vercel.json` headers

### Para promover deploy manualmente:
1. Vercel Dashboard → Deployments
2. Buscar commit `689b457`
3. `⋯` → "Promote to Production"

---

## 📊 ESTADO ACTUAL

| # | Item | Estado |
|---|---|---|
| 1 | 142 URLs renderizan | ✅ |
| 2 | 32 módulos backend listos | ✅ |
| 3 | 7 migraciones críticas aplicadas hoy | ✅ |
| 4 | UI limpia (sin botones flotantes, i18n inline) | ✅ |
| 5 | Bugs B4-B8 corregidos | ✅ |
| 6 | Email transaccional (Resend) funcional | ✅ |
| 7 | Vercel deploy commit 689b457 sin promover a Production | ❌ |
| 8 | TWILIO_* no configurado → registro sin SMS real | ❌ |
| 9 | OPENAI_API_KEY no configurada → IA desactivada | ❌ |
| 10 | MERCADO_PAGO / STRIPE no configurados → pagos en mock | ❌ |
| 11 | ~34 migraciones r1-r12 pendientes (hardening/security) | ⚠️ |
| 12 | DNS systeminternational.app sin configurar en Vercel domains | ⚠️ |
| 13 | Sitemap regenerado (npm run sitemap) | ✅ |
| 14 | Playwright E2E specs listos (5 specs) | ✅ |
| 15 | CSP headers configurados para systeminternational.app | ✅ |

---

## 🎯 PRÓXIMOS 3 PASOS (en orden)

### 1. Resolver Vercel deploy stuck
```
Vercel Dashboard → Deployments → commit 689b457 → Promote to Production
```
Sin esto, TODO el trabajo de hoy no está live.

### 2. Agregar Twilio keys
```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_SMS_FROM=+1xxxxxxxxxx
```
Sin Twilio, el registro usa `dev_code` (cualquier OTP funciona — inseguro en producción).

### 3. Aplicar migraciones r1-r12 restantes
Supabase Dashboard → SQL Editor → ejecutar en orden los 34 archivos `r1-r12`.
Son todos idempotentes. Cubren hardening de auth, RLS avanzado, multi-sucursal, auditoría.

---

## 🐛 ERROR LOGGING

Errores de sistema van a `system_error_logs` (tabla aplicada hoy). Consulta rápida:

```sql
SELECT type, error_code, error_message, tenant_id, count(*)
FROM system_error_logs
WHERE resolved_at IS NULL AND created_at > now() - interval '1 day'
GROUP BY 1,2,3,4
ORDER BY count DESC;
```

---

## 📦 Estructura del repo

```
volvix-pos-GITHUB-BACKUP-2026-04-29/
├── api/                  ← 32 módulos backend (index.js monolítico ~32k líneas)
├── migrations/           ← ~65 archivos SQL (7 críticos aplicados hoy, ~34 r1-r12 pendientes)
├── public/               ← HTML + assets (fallback Vercel)
├── (root .html)          ← 142 HTML servidos directamente
├── docs/                 ← 19 articles + VERCEL_ENV_SETUP.md
├── scripts/              ← generate-sitemap, update-domain, etc.
├── tests-e2e/            ← 5 specs Playwright
├── REPETIDOS/            ← 99 duplicados archivados (NO ELIMINAR)
├── internal/             ← 6 dev/QA tools (gate: rol superadmin)
├── .env.production.template ← 36 env vars para importar a Vercel
├── vercel.json           ← Routes + crons + CSP headers
└── package.json          ← scripts: start, sitemap, test:e2e, build:android, etc.
```

---

## 🔑 VARIABLES DE ENTORNO ACTUALES

| Variable | Estado |
|---|---|
| `RESEND_API_KEY` | ✅ Set |
| `SUPABASE_URL` / `SERVICE_KEY` / `ANON_KEY` | ✅ Set |
| `JWT_SECRET` / `ADMIN_API_KEY` | ✅ Set |
| `TWILIO_*` | ❌ Falta |
| `OPENAI_API_KEY` | ❌ Falta |
| `MERCADO_PAGO_ACCESS_TOKEN` / `PUBLIC_KEY` | ❌ Falta |
| `STRIPE_SECRET_KEY` / `PUBLISHABLE_KEY` | ❌ Falta |
| `VOLVIX_GA_ID` / `VOLVIX_FB_PIXEL_ID` | ❌ Falta |
| `CANONICAL_REDIRECT_ENABLED` | ⚠️ Desactivado intencional hasta DNS final |

Referencia completa: `docs/VERCEL_ENV_SETUP.md`

---

## 💬 Mensaje clave

> "Comparte el sitio. Pruébalo. Regístrate con tu teléfono."
>
> Eso es lo único que tenemos que poder decir cuando el cliente pregunte. Si el flow no funciona en 60 segundos, no estamos listos.

**Próxima sesión — contexto rápido:**
```bash
cat HANDOFF.md && cat PENDIENTES.md && curl -s https://systeminternational.app/api/payments/health | jq
```
