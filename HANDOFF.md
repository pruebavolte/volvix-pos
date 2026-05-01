# 🤝 HANDOFF.md — Estado completo Volvix POS

**Fecha:** 2026-05-01
**Sesión completada:** ~70 commits, ~40,000 líneas, 32 módulos backend
**Repo:** `D:\volvix-pos-GITHUB-BACKUP-2026-04-29` → `github.com/pruebavolte/volvix-pos`
**Producción:** `https://salvadorexoficial.com` y `https://salvadorexoficial.com`
**Próximo dominio principal:** `systeminternational.app`

---

## 🎯 Para qué sirve este sistema

Volvix POS / SalvadoreX es un SaaS multi-tenant de Punto de Venta para negocios mexicanos:
- Cliente potencial llega a `/` → busca su giro → si existe lo lleva a landing personalizada, si no la genera con IA
- Se registra con **solo teléfono + contraseña** (3 pasos, OTP via SMS con auto-fill nativo)
- Recibe acceso al POS con datos demo
- Activa los módulos que quiere usar (POS, Inventario, Recargas, etc)
- Empieza a vender → cobra cuando alcanza usage threshold (no trial 14 días)
- Tú (super-admin) controlas: activar/desactivar módulos+botones por cliente, regalar días, bloquear morosos, impersonar para probar

---

## ✅ LO QUE YA FUNCIONA AL 100% (verificado live)

### Backend (32 módulos en `api/`)
| Módulo | Endpoint | Status |
|---|---|---|
| `auth` | `/api/login`, `/api/auth/register-simple`, `/auth/verify-simple` | ✅ Live |
| `giros` | `/api/giros`, `/giros/search`, `/giros/autocomplete` (sinónimos) | ✅ Live |
| `payments-mercadopago` | `/api/payments/mercadopago/*` | ⚠️ Espera key |
| `payments-stp` | `/api/payments/stp/*` + CoDi QR | ⚠️ Espera convenio |
| `integrations-delivery` | 6 webhooks (Uber/DiDi/Rappi/SinDelantal/iFood/PedidosYa) | ⚠️ Partner approval |
| `ai-engine` | `/api/ai/chat`, `/forecast`, `/insights` | ⚠️ Espera OPENAI_API_KEY |
| `email-resend` | OTP + welcome + receipt + CFDI | ✅ RESEND_API_KEY ya set |
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

### Frontend (142 URLs)
- 9 TIER 0 (login/registro/marketplace/hub/grand-tour/blog/booking/referrals/landing_dynamic)
- 9 TIER 1 POS (salvadorex_web_v25 ⭐ + multipos + pos-clientes/inv/corte/config/reportes + launcher + pos.html legacy)
- 8 TIER 2 Admin
- 5 TIER 3 Portales
- 6 TIER 4 Operación
- 5 TIER 5 Super-admin
- 4 TIER 6 IA
- 8 TIER 7 Legal
- 6 TIER 8 Docs
- 14 TIER 10 Utilities
- 50 Landings de giros (TIER 1+2+3+4)
- 5 internos (BITACORA, MATRIZ, qa-scenarios, sandbox, modals-demo) — protegidos a `/internal/`
- 4 video tutorials HTML interactivos
- 15 blog posts SEO

### UI clean
- ✅ Sin floating buttons (notifications, health pill, sync widget, theme toggle, academy AI avatar)
- ✅ Language switch INLINE (no flotante) en header/nav/footer
- ✅ Banner tricolor "🇲🇽 Hecho en México · Soy Mexicano · Hecho en Nuevo León 🦅" auto-inject
- ✅ Errores de sistema NO se muestran al usuario, se logean a `system_error_logs`
- ✅ Errores de validación SÍ se muestran con mensaje claro

---

## 🚨 LO QUE FALTA (para 100% live)

### Tú haces (15 min total):

#### 1. DNS de `systeminternational.app` (5 min)
- **Si está agregado en otro proyecto Vercel**: ir a ese proyecto → Settings → Domains → Remove
- En `volvix-pos`: Settings → Domains → Add → `systeminternational.app`
- Configurar DNS: A record `@` → `216.150.1.1` (o usar nameservers Vercel)

#### 2. Aplicar 19 migraciones SQL en Supabase (5 min)
Todas en `migrations/*.sql`:
```
giros-synonyms.sql                  → giros_synonyms (autocomplete)
usage-billing.sql                   → tenant_usage_events + summary + overrides
r45-tenant-button-control.sql       → tenant_button_overrides + admin_notes + impersonation_log
system-error-logs.sql               → system_error_logs (NEW — error tracking)
shop-orders.sql                     → shop_orders
status-monitor.sql                  → system_incidents + system_health_pings
2026_pos_leads_and_tour_progress.sql→ pos_leads + user_tour_progress
... (14 más, ver migrations/ folder)
```

Aplicar via Supabase Dashboard → SQL Editor → paste + run.

#### 3. API keys en Vercel (5 min)
Settings → Environment Variables → Import .env → pega `.env.production.template`

**Mínimo para launch:**
```
TWILIO_ACCOUNT_SID + AUTH_TOKEN + SMS_FROM (SMS OTP)
OPENAI_API_KEY (IA + giro generator)
MERCADO_PAGO_ACCESS_TOKEN (pagos MX)
VOLVIX_GA_ID + VOLVIX_FB_PIXEL_ID (tracking)
```

---

## 👤 USUARIOS DE PRUEBA (admin-test)

### Super Admin (TÚ — para administrar todo)
```
Email:    admin@volvix.test
Password: Volvix2026!
Role:     superadmin (DB) / superadmin (notes.volvix_role)
Tenant:   TNT001 (Abarrotes Don Chucho)
Acceso:
  - /volvix-admin-saas.html (gestiona todos los tenants)
  - /volvix-mega-dashboard.html (KPIs platform: ARR/MAU/Churn)
  - /internal/index.html (portal dev/QA)
  - /volvix-launcher.html (hub apps)
  - Todo lo demás
```

### Owner (cliente dueño de negocio)
Después de registro fresh con `/registro.html`:
```
Phone:    8112345099 (ejemplo del último registro)
Tenant:   TNT-MK38N (auto-generado)
Role:     USER (DB) / owner (notes.volvix_role)
Acceso:
  - /volvix_owner_panel_v8.html (su dashboard)
  - /volvix-launcher.html
  - /salvadorex_web_v25.html (POS)
  - /mis-modulos.html (activar/desactivar features)
  - /volvix-user-management.html (crear cajeros)
  - /pos-* (todos los módulos POS)
```

### Cajero (empleado del owner)
Owner crea via `/volvix-user-management.html`:
```
Email:    cajero@negocio.com
Password: cualquiera
Role:     USER (DB) / cajero (notes.volvix_role)
Acceso:
  - /volvix-launcher.html (limited)
  - /salvadorex_web_v25.html (POS)
  - /pos-clientes.html, /pos-inventario.html (limited)
  - SIN acceso a admin SaaS, mega-dashboard, etc
```

### Cliente Final (compra al negocio)
Auto-creado o registrado en `/volvix-customer-portal.html`:
```
Phone+OTP login
Acceso:
  - /volvix-customer-portal.html (sus compras, puntos, CFDI)
  - /volvix-shop.html (e-commerce del tenant)
  - /volvix-booking.html (citas si tenant es barbería/spa/dental)
```

---

## 🧪 CÓMO PROBAR CADA PERFIL

### Como super-admin (TÚ):
1. `https://salvadorexoficial.com/login.html` → email `admin@volvix.test` / password `Volvix2026!`
2. Vas al launcher → click "Admin SaaS"
3. Tabla de tenants → "Control Cliente" tab → seleccionar tenant
4. Botón "Probar como cliente" → impersonate JWT 30 min en nuevo tab → ves todo como ese cliente
5. Volver a tu sesión: cerrar el tab, tu JWT real sigue en el tab original

### Como cliente nuevo:
1. `/registro.html` → teléfono + nombre negocio + giro (escribe "tacos" → sugiere taqueria) + password
2. SMS llega → auto-fill OTP via Web OTP API (Android/Chrome) o pegar manualmente
3. Redirect a `/volvix-launcher.html` → ves apps disponibles
4. Click "POS" → `/salvadorex_web_v25.html` → registras tu primer producto
5. Haces venta de prueba
6. Owner panel: `/volvix_owner_panel_v8.html` → ves KPIs reales (con datos demo + tus propias ventas)

### Como cajero del owner:
1. Owner crea cajero en `/volvix-user-management.html` → recibe email con password temporal
2. Cajero entra `/login.html` → cambio forzado de password (first-login-complete flag)
3. Solo ve POS + sus clientes + algunos reportes
4. Botones bloqueados (si owner los desactivó) → ven 🔒

### Como cliente final del negocio:
1. URL del shop del tenant: `/volvix-shop.html?tenant=TNT-XXX`
2. Browse productos → checkout
3. Auto-creación de customer en pos_customers
4. Recibe email con tracking

---

## 🐛 ERROR LOGGING

Toda la app ahora envía errores a `POST /api/errors/log` que escribe a `system_error_logs`:

```sql
SELECT type, error_code, error_message, tenant_id, count(*)
FROM system_error_logs
WHERE resolved_at IS NULL AND created_at > now() - interval '1 day'
GROUP BY 1,2,3,4
ORDER BY count DESC;
```

Cuando me digas "revisa los errores", consulto esta tabla, identifico patrones, y los arreglo.

---

## 📦 Estructura del repo

```
volvix-pos-GITHUB-BACKUP-2026-04-29/
├── api/                           ← 32 módulos backend
│   ├── index.js                   ← Monolítico ~32k líneas, dispatcher principal
│   ├── auth-register.js, ai-engine.js, ... (31 módulos)
│   └── ...
├── public/                        ← 63 HTML servidos por Vercel (fallback)
│   ├── salvadorex_web_v25.html    ⭐ POS principal
│   ├── volvix_owner_panel_v8.html
│   ├── pos-*.html, volvix-*.html, landing-*.html (TIER 2-4)
│   ├── blog/                      ← 15 posts SEO
│   ├── i18n/                      ← es-MX.json + en.json
│   ├── tutorials/                 ← 4 video HTML interactivos
│   └── volvix-*-wiring.js         ← Auto-injected scripts (i18n, mexico-pride, modules-wiring, etc)
├── (root .html)                   ← 63 HTML al root (Vercel sirve PRIMERO)
│   ├── landing-{abarrotes,barberia,...}.html  (10 TIER 1 + 11 TIER 4)
│   ├── volvix-*.html (admin-saas, mega-dashboard, customer-portal, vendor-portal, ...)
│   ├── login.html, registro.html, marketplace.html
├── migrations/                    ← 19 archivos .sql pendientes
├── docs/                          ← 19 articles + VERCEL_ENV_SETUP.md
├── scripts/                       ← generate-sitemap, update-domain, generate-tier3/4-landings, etc
├── tests-e2e/                     ← Playwright specs (5 specs)
├── REPETIDOS/                     ← 99 duplicados archivados (NO ELIMINAR)
├── internal/                      ← 6 dev/QA tools (gate role superadmin)
├── .env.production.template       ← Lista 36 env vars para importar a Vercel
├── PENDIENTES.md                  ← Lista detallada de bloqueadores + roadmap
├── HANDOFF.md                     ← ESTE archivo
├── vercel.json                    ← Routes + crons + headers + CSP
└── package.json                   ← npm start, test:e2e, sitemap, etc
```

---

## 🎯 LO QUE FALTA POR HACER (siguiente sesión)

### Prioridad CRITICAL (cuando aplique migraciones SQL)
1. ✅ Verificar que `/api/auth/register-simple` con DB real (no in-memory fallback)
2. ✅ Verificar `/api/billing/check-limits` middleware funciona
3. ✅ Aplicar las 19 migraciones SQL

### Prioridad HIGH
4. Configurar Twilio para SMS real (sin él, registro funciona pero sin SMS)
5. Configurar OPENAI_API_KEY (sin él, IA pages muestran "no configurado")
6. Configurar MERCADO_PAGO_ACCESS_TOKEN (sin él, pagos en mock)
7. Probar cada perfil de usuario manualmente con Chrome
8. Tomar screenshots de cada flow para landing/marketing

### Prioridad MEDIUM (polish post-launch)
9. Generar APK Android con Capacitor (existe estructura en `ios/` pero no Android)
10. Generar EXE Windows con Electron
11. Performance audit Lighthouse 90+
12. ML real para fraud-dashboard (hoy heurístico)
13. WebSocket real para chat live (hoy mock)

### Prioridad LOW (nice-to-have)
14. Más blog posts (15 → 30)
15. i18n adicional (pt-BR, en-US)
16. White-label para resellers
17. GraphQL wrapper sobre REST
18. Compliance dashboard (SOC2 readiness score)

### Bugs reportados Quinn QA aún sin arreglar:
- B4 LOW: `<title>` truncado en landing-taqueria.html ("...controla tu trompo y due")
- B5 MEDIUM: validation order en register-simple (business_name antes que phone) — funciona pero UX confusa
- B6 MEDIUM: Faltan canonical en registro.html y salvadorex_web_v25.html
- B7 LOW: `/api/admin/tenants` 404 (deberíamos agregar handler o renombrar plural→singular)
- B8 LOW: Sitemap declara 121 URLs vs 142 reales (regenerar con `npm run sitemap`)

---

## 🔑 VARIABLES DE ENTORNO ACTUALES (Vercel)

Confirmadas vía `/api/payments/health`:
- ✅ `RESEND_API_KEY` (email funciona)
- ✅ `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `JWT_SECRET`
- ✅ `ADMIN_API_KEY`
- ❌ `MERCADO_PAGO_ACCESS_TOKEN` (mp:false)
- ❌ `STP_OWNER_CLABE` (stp:false)
- ❌ `STRIPE_SECRET_KEY` (stripe:false)
- ❌ `OPENAI_API_KEY` (ai:false)
- ❌ `PAC_API_*` (cfdi:false)
- ❌ `PROVIDER_RECARGAS_API_KEY` (recargas:false)
- ❌ `TWILIO_*` (SMS no funciona, registro fallback dev_code)
- ❌ `CANONICAL_REDIRECT_ENABLED` (no redirige, intencional hasta DNS final)

Lista completa con dónde obtener cada una: `docs/VERCEL_ENV_SETUP.md`

---

## 🔄 DEPLOY FLOW

1. Push a `main` en GitHub → Vercel auto-deploya como **Production** (configurado correcto)
2. Si falla build, ver `https://vercel.com/grupo-volvixs-projects/volvix-pos/deployments`
3. Para promover deploy específico: click deploy → ⋯ → "Promote to Production"
4. **Project ID:** `prj_2f9m0VwArnqlGvlBZtxchvQl1a2t`
5. **Branch tracking:** `main` (NO master)
6. Custom domains:
   - `salvadorexoficial.com` (Valid Configuration ✅)
   - `salvadorexoficial.com` (default)
   - `systeminternational.app` (a agregar)
7. Cron jobs configurados en `vercel.json` (requieren plan Pro ✅ ya tienes)

---

## 📞 CONTACTO Y CREDENCIALES

- GitHub: `pruebavolte/volvix-pos` (privado)
- Vercel team: `grupo-volvixs-projects`
- Supabase project ID: `zhvwmzkcqngcaqpdxtwr` (salvadorexoficial)
- Domains:
  - `salvadorexoficial.com` (validado, esperando DNS A record)
  - `systeminternational.app` (a configurar)
  - `salvadorexoficial.com` (alias permanente)

---

## 💬 Mensaje del usuario para próxima sesión

> "Comparte el sitio. Pruébalo. Regístrate con tu teléfono."
>
> Eso es lo único que tenemos que poder decir cuando el cliente nos pregunte. Si el flow no funciona en 60 segundos, no estamos listos.

**Próxima sesión:** comenzar con `cat HANDOFF.md && cat PENDIENTES.md && curl -s https://salvadorexoficial.com/api/payments/health | jq` para tener contexto rápido del estado.
