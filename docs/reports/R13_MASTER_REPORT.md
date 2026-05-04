# R13 — MASTER REPORT EJECUTIVO

**Proyecto:** Volvix POS / SaaS multi-tenant (`verion 340`)
**Fecha:** 2026-04-26
**Versión auditada:** v7.1.0 (`api/index.js`)
**Target productivo:** https://salvadorexoficial.com
**Stack:** Vercel serverless + Supabase (`zhvwmzkcqngcaqpdxtwr`) + Anthropic Claude
**Agentes lanzados:** 12 — Reportes consolidados: 9

---

## 1. RESUMEN EJECUTIVO

### Score de salud del sistema: **38 / 100**

| Dimensión | Score | Estado |
|---|---:|---|
| Seguridad | 10/100 | CRÍTICO — sistema abierto a internet |
| Wiring real (Supabase) | 15/100 | CRÍTICO — solo 4/271 archivos conectados |
| API correctness | 35/100 | ALTO — mocks, mass-assignment, sin tenant scoping |
| Performance | 55/100 | MEDIO — fan-out 250+ scripts/página |
| i18n | 20/100 | ALTO — motor presente, adopción 0% |
| HTTP/Deploy | 60/100 | MEDIO — 3 archivos confidenciales expuestos |
| Hardcoded data | 30/100 | ALTO — ~45 archivos con datos de negocio embebidos |
| Compliance / monitoreo | 25/100 | ALTO — sin Sentry, alertas, RLS verificado |

### Top 5 RIESGOS (acción inmediata)

1. **Service-role key Supabase hardcodeada** (`api/index.js:15` + `TASKS_FOR_NEXT_AI.md:23-24`) — bypass total de RLS, válida hasta 2035. Compromete TODA la base.
2. **API sin autenticación** — 0/43 endpoints validan token. `curl` directo lee productos/ventas/clientes/MRR de cualquier tenant. Probado físicamente con token falso → 200 OK.
3. **Passwords en texto plano** — `pos_users.password_hash` se compara con `===` literal. Tres usuarios con `Volvix2026!` plaintext en `server.js:103-107`.
4. **CORS `*` + endpoint `/api/debug` expuesto** — cualquier sitio web puede invocar la API; `/api/debug` filtra `SUPABASE_URL` y emails admin sin protección.
5. **Sin aislamiento multi-tenant** — `/api/sales`, `/api/customers`, `/api/inventory`, `/api/reports/*` listan datos de TODOS los tenants. `/api/products` mapea solo TNT001/TNT002.

### Top 5 LOGROS

1. **Motor i18n robusto** (`volvix-i18n-wiring.js`, 637 líneas): 3 idiomas, MutationObserver, `Intl` formatters listos.
2. **Service Worker bien diseñado**: cache-first/network-first correcto, Background+Periodic Sync, IndexedDB queue.
3. **Login funcional** end-to-end: 3/3 usuarios autentican (200 OK, ~400ms) contra Supabase real.
4. **97% scripts con `defer/async`** — buena base de carga no bloqueante.
5. **Endpoints reales contra Supabase** para CRUD core (productos, ventas, clientes, dashboard owner) — el cableado existe, solo falta auth + scoping.

---

## 2. TABLA CONSOLIDADA DE HALLAZGOS

| # | Severidad | Categoría | Descripción | Archivo / Línea | Fix propuesto | Estado |
|---|---|---|---|---|---|---|
| F01 | CRITICAL | Security | Service-role JWT hardcodeada (válida hasta 2035) | `api/index.js:15` | Quitar fallback + rotar key + env var Vercel | pending |
| F02 | CRITICAL | Security | Service+Anon key en repo en texto plano | `TASKS_FOR_NEXT_AI.md:23-24` | Borrar líneas + rotar + gitleaks pre-commit | pending |
| F03 | CRITICAL | Auth | API completa sin middleware de auth (43 endpoints) | `api/index.js:753` | Middleware JWT HS256 + verifyJWT antes de matchRoute | pending |
| F04 | CRITICAL | Auth | Passwords plaintext (`password_hash !== password`) | `api/index.js:196,448` | bcrypt cost 12 + script migración + force reset | pending |
| F05 | CRITICAL | Auth | "Sesión" devuelta sin firmar, cliente puede inventar role=superadmin | `api/index.js:213-220` | Emitir JWT firmado con HMAC + httpOnly cookie | pending |
| F06 | CRITICAL | Hardcoded | 3 usuarios admin con password en claro (`Volvix2026!`) | `server.js:103-107` | Migrar a `auth.users` Supabase + eliminar constante | pending |
| F07 | HIGH | API | Sin tenant scoping: `/api/sales`,`/api/customers`,`/api/inventory`,`/api/reports/*` | `api/index.js` | Forzar `tenant_id` desde JWT, ignorar query | pending |
| F08 | HIGH | API | `/api/products` mapeo hardcoded a TNT001/TNT002 | `api/index.js:283-284` | Lookup dinámico tabla `tenant_user_map` | pending |
| F09 | HIGH | API | Mass-assignment en todos los PATCH (body crudo a Supabase) | `api/index.js` (tenants/products/customers) | Allowlist de columnas por endpoint | pending |
| F10 | HIGH | API | `/api/owner/*` sin validación de rol (MRR/ARR público) | `api/index.js:389-513` | requireRole('superadmin'\|'owner') | pending |
| F11 | HIGH | Security | CORS `*` global con datos sensibles | `api/index.js:121,169,754` | Whitelist `ALLOWED_ORIGINS` env + Vary:Origin | pending |
| F12 | HIGH | Security | `/api/debug` expone SUPABASE_URL + emails admin | `api/index.js:699-710` | Borrar en prod o requireRole('superadmin') | pending |
| F13 | HIGH | Security | Inyección PostgREST via `eq.${userId}` sin sanitizar | `api/index.js:282,329,651,etc` | Regex UUID + encodeURIComponent | pending |
| F14 | HIGH | HTTP | 3 archivos confidenciales accesibles 200 OK públicos | `volvix-qa-scenarios.html`,`BITACORA_LIVE.html`,`status.json` | `vercel.json` rewrites→404 + `.vercelignore` | pending |
| F15 | HIGH | Hardcoded | Bases completas en `salvadorex_web_v25.html` (PRODUCTS/CUSTOMERS/SALES/USERS) | líneas 2420-2518 | Migrar a Supabase tablas reales | pending |
| F16 | HIGH | Hardcoded | KDS tickets + menú hardcoded | `multipos_suite_v3.html:1579-1601` | Migrar a `kds_tickets`+`menu_items` | pending |
| F17 | HIGH | Hardcoded | ~25 verticales con `DEFAULT_*`/`CATALOGO_*` embebidos | `volvix-vertical-*.js` | Tabla `vertical_catalog_template` JSONB | pending |
| F18 | HIGH | Wiring | Solo 4/271 archivos JS conectan a Supabase real | (`api/index.js`,`volvix-health/realtime/tables`) | Migración progresiva — ver Roadmap Fase 2 | pending |
| F19 | HIGH | Performance | Fan-out 193-259 scripts por HTML | top HTMLs | Bundle (esbuild) + dynamic `import()` | pending |
| F20 | HIGH | i18n | Adopción 0%: motor existe pero ningún HTML lo carga | `volvix-i18n-wiring.js` huérfano | Incluir en HTMLs + migrar `[data-i18n]` | pending |
| F21 | MEDIUM | API | Endpoints mock 100%: `/features`,`/tickets`,`/ai/decisions` | `api/index.js:517-608` | Reemplazar por queries reales a tablas dedicadas | pending |
| F22 | MEDIUM | API | `POST /features/request` y `/tickets` no persisten | `api/index.js` | Insert tras Claude response | pending |
| F23 | MEDIUM | API | `POST /api/sync` no transaccional | `api/index.js` | Wrap en RPC Supabase + 4xx en payload inválido | pending |
| F24 | MEDIUM | API | Sin rate limit en endpoints AI (Anthropic $) | `/api/ai/*`,`/features/request` | Vercel KV counter + `Retry-After` | pending |
| F25 | MEDIUM | API | `error: err.message` filtra esquemas Supabase | múltiples catch | `{error:'Internal',code:'E500'}` + log interno | pending |
| F26 | MEDIUM | Security | XSS potencial: 113 `innerHTML` en 30 archivos | top: salvadorex,multipos,owner_panel | DOMPurify + textContent + CSP estricta | pending |
| F27 | MEDIUM | Security | `auth-gate.js` valida solo localStorage (falsificable) | `auth-gate.js:28-42` | Solo UX hint; auth real server-side | pending |
| F28 | MEDIUM | Security | RLS posiblemente desactivado en tablas (`pos_*`) | Supabase | Activar RLS + policies por `tenant_id = auth.jwt()` | pending |
| F29 | MEDIUM | Performance | SW precachea solo 12 recursos vs 260 cargados | `sw.js` | Precache list desde build + cache versionado por hash | pending |
| F30 | MEDIUM | Performance | CSS duplicado inline en 24 HTMLs | (todos) | Extraer `volvix.css` externo cacheable | pending |
| F31 | MEDIUM | i18n | BD sin columnas multi-idioma | `db/volvix.db.json` | `name_i18n JSONB` en products/categories/templates | pending |
| F32 | LOW | Security | Headers seguridad ausentes (HSTS/CSP/XFO) | `api/index.js`,`vercel.json` | Helmet-style middleware o `vercel.json` headers | pending |
| F33 | LOW | API | `license_key`/`ticketId` con `Date.now()`/`Math.random()` | `api/index.js` | `crypto.randomUUID()` | pending |
| F34 | LOW | API | Hard delete `/api/products/:id` (inconsistente) | `api/index.js` | Soft delete (`is_active=false`) | pending |
| F35 | LOW | Login | `expires_at` calculado pero no verificado | `api/index.js` | Validar en middleware JWT | pending |
| F36 | LOW | Login | `ip:'serverless'` literal en `pos_login_events` | `api/index.js` | Leer `x-forwarded-for` | pending |
| F37 | LOW | Hardcoded | `/api/tenants` filtra a 3 UUIDs hardcoded | `api/index.js:247` | Query abierto + filtro por rol | pending |
| F38 | LOW | Performance | `volvix_owner_panel_v7.html` 214KB con `<style>` inline | (archivo) | Mover CSS externo (~30-40KB ahorro) | pending |
| F39 | LOW | Deploy | `*.zip`, `server.log`, `BITACORA_*` incluidos en deploy | raíz | `.vercelignore` | pending |
| F40 | LOW | i18n | Polling `setInterval(translateAll,3000)` desperdicia CPU | `volvix-i18n-wiring.js:610` | Solo MutationObserver | pending |

---

## 3. ROADMAP PRIORIZADO

### **FASE 1 — Seguridad (24 h, BLOQUEANTE para producción)**

Objetivo: cerrar la API y rotar credenciales comprometidas.

1. **Rotar `SUPABASE_SERVICE_KEY` y `SUPABASE_ANON_KEY`** en dashboard (las actuales = públicas).
2. **Eliminar fallback hardcoded** `api/index.js:14-16` y líneas 23-24 de `TASKS_FOR_NEXT_AI.md`.
3. **Configurar env vars en Vercel**: `SUPABASE_SERVICE_KEY`, `JWT_SECRET` (32 bytes random), `ALLOWED_ORIGINS`.
4. **Implementar `signJWT/verifyJWT`** (HS256) y middleware de auth en `api/index.js` antes de `matchRoute`.
5. **bcrypt para passwords**: instalar `bcryptjs`, reescribir login + create user, script de force-reset.
6. **Borrar usuarios demo** de `server.js:103-107` y `salvadorex_web_v25.html:2463-2468`.
7. **Proteger/borrar `/api/debug`** y `/api/owner/*` con `requireRole`.
8. **CORS whitelist** vía env var `ALLOWED_ORIGINS`.
9. **Bloquear archivos confidenciales** (`vercel.json` rewrites + `.vercelignore`).
10. **Activar RLS** en todas las tablas `pos_*` con policy `tenant_id = auth.jwt()->>'tenant_id'`.

Criterio de éxito: `curl` sin Bearer → 401 en todo `/api/*` excepto `login`/`health`/`status`. SSL Labs ≥ A.

### **FASE 2 — Wiring real Supabase (1 semana)**

Objetivo: que los 271 archivos JS dejen de operar sobre `localStorage` y datos demo.

1. **Tenant scoping universal**: `tenant_id` siempre desde JWT, eliminar `TENANT_USER_MAP` hardcodeado.
2. **Mass-assignment fix**: allowlist por endpoint para PATCH.
3. **Persistir endpoints híbridos** (`/features/request`, `/tickets`): tablas `features_catalog`, `support_tickets`.
4. **Reemplazar mocks** (`/features`, `/ai/decisions`, `/tickets` GET) por queries reales.
5. **Migrar bases hardcoded core**: `salvadorex_web_v25.html` (PRODUCTS/CUSTOMERS/SALES) → tablas Supabase + fetch por API.
6. **KDS y menú**: `multipos_suite_v3.html:1579-1601` → `kds_tickets`+`menu_items`.
7. **Catálogos transversales**: loyalty_tiers, modifiers, crm_stages, donation_causes → tablas dedicadas.
8. **Verticales**: tabla `vertical_catalog_template` JSONB; onboarding clona a tenant.
9. **Sync transaccional** (`/api/sync`): RPC Supabase atómico.
10. **Rate limit** vía Vercel KV en `/api/login`, `/api/ai/*`, `/features/request`.

Criterio de éxito: ≥90% archivos wiring leen/escriben Supabase. Cero `DEFAULT_*` arrays como fuente de verdad.

### **FASE 3 — i18n + Performance (2 semanas)**

i18n:
1. Incluir `<script src="/volvix-i18n-wiring.js" defer>` en los 25 HTMLs productivos.
2. Migrar top-5 HTMLs a `[data-i18n]` (multipos, owner_panel, salvadorex, hub-landing, grand-tour).
3. Reemplazar literales JS por `t('key')` en master-controller, pos-*, workflows, verticales.
4. **Multi-idioma BD**: columnas `name_i18n JSONB` en `products`, `categories`, `email_templates`, `onboarding_steps`.
5. QA con revisor nativo `en`/`pt`.

Performance:
1. **Bundle wirings** con esbuild → 3-5 chunks vs 127 archivos.
2. **Code-splitting**: `import()` dinámico por feature.
3. **Precache SW completo** generado en build, cache por hash.
4. **Extraer `volvix.css`** común externo.
5. **CSP estricta** + DOMPurify para XSS (113 innerHTML).

Criterio: Lighthouse ≥90, JS inicial < 500KB, cobertura i18n ≥80%.

### **FASE 4 — Compliance + Monitoreo (1 mes)**

1. **Sentry SDK** integrado en `api/index.js` con source maps + alertas (5xx>0.5%, p95>2s).
2. **Hotjar** activo con `HOTJAR_SITE_ID`.
3. **Uptime externo** (BetterStack / UptimeRobot) sobre `/api/health` + `status.volvix.com`.
4. **Log Drain** (Datadog/Axiom) con PII redaction.
5. **PITR Supabase** + dump semanal offsite + test restore mensual.
6. **DPA firmado** Supabase + Anthropic.
7. **Aviso privacidad + T&C + cookie banner** publicados.
8. **Rollback plan**: tag releases, snapshot pre-deploy, runbook <5min.
9. **OWASP ZAP baseline** scan en CI.
10. **Headers seguridad** (HSTS preload, CSP, XFO, nosniff, Referrer-Policy).

Criterio: SOC2-ready básico. MTTR documentado. SLA 99.9% medible.

---

## 4. MÉTRICAS FINALES R13

| Métrica | Valor |
|---|---:|
| Agentes paralelos lanzados | 12 |
| Reportes consolidados | 9 |
| Archivos auditados (totales en proyecto) | 327 |
| Archivos `.js` analizados (wiring) | 271 |
| Archivos `.html` analizados | 25 |
| Líneas analizadas (estimado) | ~120 000 |
| Endpoints API auditados | 43 |
| Tablas Supabase referenciadas | ~30 |
| **Hallazgos CRITICAL** | **6** |
| **Hallazgos HIGH** | **14** |
| **Hallazgos MEDIUM** | **11** |
| **Hallazgos LOW** | **9** |
| **TOTAL hallazgos** | **40** |
| Archivos con datos hardcoded a migrar | ~45 |
| Archivos JS conectados a Supabase real | 4 / 271 (1.5%) |
| Cobertura i18n efectiva | 0% |
| Strings ES hardcoded (heurística) | 1 652 (en 25 HTMLs) |
| Console.log en producción | 136 archivos |
| TODO/FIXME pendientes | 12 archivos |
| Endpoints sin auth | 42 / 43 |
| Endpoints mock (sin DB) | 6 |
| Tamaño total HTML | 1.29 MB |
| Tamaño total JS raíz | 4.16 MB |
| Scripts cargados por HTML top | 193-259 |
| Tiempo login medido | 324-415 ms |
| Login OK (3 usuarios) | 3/3 |
| Endpoints que aceptan token falso | 5/5 (probados) |
| Archivos confidenciales expuestos públicamente | 3 |

---

## 5. ANEXO — Reportes individuales

Todos en `C:\Users\DELL\Downloads\verion 340\`:

1. [`R13_HARDCODED_AUDIT.md`](./R13_HARDCODED_AUDIT.md) — 327 archivos, ~45 con datos de negocio embebidos; mapeo a tablas Supabase.
2. [`R13_API_AUDIT.md`](./R13_API_AUDIT.md) — 43 endpoints de `api/index.js` v7.1.0; 15 bugs críticos.
3. [`R13_LOGIN_PHYSICAL_TEST.md`](./R13_LOGIN_PHYSICAL_TEST.md) — Pruebas físicas en `salvadorexoficial.com` con curl real.
4. [`R13_HTTP_AUDIT.md`](./R13_HTTP_AUDIT.md) — Status HTTP de páginas públicas y archivos confidenciales.
5. [`R13_WIRING_AUDIT.md`](./R13_WIRING_AUDIT.md) — Tabla de 271 archivos JS: Supabase / Demo / TODOs / Console / Fetch.
6. [`R13_SECURITY_AUDIT.md`](./R13_SECURITY_AUDIT.md) — 13 issues seguridad clasificados CRITICAL→LOW con fixes.
7. [`R13_PERFORMANCE_AUDIT.md`](./R13_PERFORMANCE_AUDIT.md) — HTML/JS sizes, SW, lazy-loading, recomendaciones P0-P3.
8. [`R13_I18N_AUDIT.md`](./R13_I18N_AUDIT.md) — Motor i18n + adopción 0% + plan migración 30-50h.
9. [`R13_DEPLOY_CHECKLIST.md`](./R13_DEPLOY_CHECKLIST.md) — 80+ items pre-producción Vercel/Supabase/Anthropic.

---

## VEREDICTO FINAL

El sistema tiene **arquitectura ambiciosa y módulos bien diseñados** (i18n, SW, 271 wirings de features) pero **NO ESTÁ LISTO PARA PRODUCCIÓN REAL CON DATOS DE CLIENTES**.

Los 6 hallazgos CRITICAL convierten a la API en un sistema **de facto público sin autenticación** con la base de datos completa accesible vía service-role key embebida en el repo. Cualquier actor con el zip puede leer/escribir/borrar todo.

**Recomendación:** ejecutar Fase 1 completa (24h) ANTES de aceptar cualquier tenant real adicional. Las claves actuales deben tratarse como comprometidas y rotarse hoy mismo.

Score post-Fase 1 estimado: **62/100**
Score post-Fase 4 estimado: **88/100** (production-ready SOC2-básico)

---

_Generado: 2026-04-26 — R13 Master Report — Volvix POS v7.1.0_
