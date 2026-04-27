# VOLVIX FIX PLAN v2 — generado 2026-04-27

## Estado global
- Score inicial: 23/100
- Score actual: **43/100** (B1 cerrado, +20 por bloqueante de seguridad cross-tenant verificado)
- Score objetivo: >=85/100
- Última sesión: B1 (2026-04-27)
- Próximo bloque: B2
- SYSTEM-INVENTORY: vigente (regenerar si pasan >7 días)

## Reglas de ejecución v2 (no negociables)

### Antes de cada bloque
- Correr `bash scripts/preflight.sh` — si falla, abortar
- Crear rama git: `fix/B<n>-<short-name>`

### Durante el bloque
- UN solo agente. Sin spawn de subagentes para fixing.
- Paralelización SOLO en: Playwright (4 workers), grep, smoke tests.
- Cada checklist item debe tener un test ejecutable que lo verifica.
- Después de cada fix individual: correr `bash scripts/postfix-verify.sh <fixed_url> <changed_file> <regr1> <regr2> <regr3>`. Si falla, auto-rollback (git checkout HEAD -- archivo) y reintentar UNA vez. Si falla otra vez: para.

### Al cerrar el bloque
- Todos los checks tachados con evidencia (screenshot/test pass)
- Score recalculado (basado en bugs DEMOSTRADAMENTE arreglados)
- Commit con mensaje convencional: `fix(B<n>): <resumen>`
- Merge de la rama a main
- Deploy a Vercel y verificación pública con Playwright
- Bitácora actualizada en este archivo

### Reglas de oro
- Score solo sube por bugs verificados visualmente en producción
- Si un fix introduce regresión: PARA, anota, no intentes arreglar en la misma sesión
- "Deployed" no cuenta hasta que Playwright lo confirme contra URL pública

## Bloques de trabajo

### B1 — Cross-tenant security (#12) [SOLO, 60-90 min]
**Tipo:** Backend + DB. Crítico de seguridad.
**Por qué solo:** toca middlewares y RLS, requiere atención completa.
**No paralelizable con otro bloque.**

Pre-requisito: ninguno. Es el primero porque es seguridad.

Definición de hecho (cada uno con test ejecutable):
- [x] **Test 1:** ✓ `scripts/seed-tenant-b.sh` idempotente. user_A→TENANT_A (Don Chucho), user_B→TENANT_B (Los Compadres), 1 venta seed en TENANT_B.
- [x] **Test 2:** ✓ TOK_A GET /api/sales → 17/17 ventas con pos_user_id=USER_A.
- [x] **Test 3:** ✓ TOK_A ?tenant_id=TENANT_B → 17 ventas USER_A (query string ignorado, NO fuga).
- [x] **Test 4:** ✓ TOK_B GET /api/sales → 1/1 venta con pos_user_id=USER_B. ?tenant_id=TENANT_A no devuelve datos de A.
- [x] **Test 5:** ✓ Playwright dual login: KPIs distintos (A: 17 ventas / B: $100), `isolated=true`. evidence: `C:/qa-playwright/screenshots-b1/dual-result.json`
- [x] **Test 6:** ✓ RLS hardened en 18 tablas via SQL editor + Management API. ANON blocked en pos_companies/pos_sales/pos_products/customers/pos_users/+13 más. service_role bypass OK. backend `/api/sales`,`/api/customers`,`/api/products` siguen funcionando.

Estado: **COMPLETO** (cerrado 2026-04-27)
Evidencia:
- `scripts/seed-tenant-b.sh` (idempotente)
- `scripts/test-cross-tenant.sh` (Tests 2-4b reproducibles)
- `tests/b1-dual-login.spec.js` Playwright
- `db/migrations/002-rls-harden-b1.sql` aplicada via Management API
- `screenshots-b1/dual-result.json` (KPIs A vs B)

---

### B2 — Dashboards mock → real (#3 + #4) [DUPLA, 90-120 min]
**Tipo:** Frontend + Backend. Mismo patrón.
**Paralelizable con:** ninguno (toca api/index.js).

Pre-requisito: B1 completo.

Definición de hecho:
- [ ] **Test 1:** Listar TODOS los KPIs hardcoded restantes en mega-dashboard.
- [ ] **Test 2:** Listar TODOS los datos hardcoded en admin-saas (gráfica MRR + donut).
- [ ] **Test 3:** Cada KPI mapeado a endpoint real (existente o nuevo).
- [ ] **Test 4:** Endpoint nuevo `/api/dashboard/today` devuelve JSON con shape correcto: `{sales_today, tickets_today, conversion_today, latency_p50}`.
- [ ] **Test 5:** Frontend hace fetch + DOM update. Cero strings hardcoded en HTML (`grep -E '\$\d{3,}|99\.\d%|142ms' --include=*.html -r .` debe devolver 0).
- [ ] **Test 6:** **Prueba de cambio dinámico:** insertar venta de $999 vía PAT, refresh mega-dashboard, "Ventas hoy" cambia de $X a $X+999. Screenshot ANTES/DESPUÉS.
- [ ] **Test 7:** Idem para admin-saas (insertar plan_subscription, refresh, donut cambia).
- [ ] **Test 8:** `postfix-verify.sh` 4 workers: owner-panel + vendor-portal + customer-portal + salvadorex. Cero regresiones visuales >5%.

Estado: PENDIENTE

---

### B3 — Vendor portal real (#5 + #6) [DUPLA, 60-90 min]
**Tipo:** DB + Backend + Frontend.
**🟢 Paralelizable con B4** (no comparten archivos).

Pre-requisito: B2 completo.

Definición de hecho:
- [ ] **Test 1:** Tabla `vendors` creada en Supabase con schema documentado en `db/migrations/001-vendors.sql` (idempotente, DROP IF EXISTS opcional).
- [ ] **Test 2:** Seed de 3-5 vendors via SQL idempotente (`db/seeds/vendors.sql`).
- [ ] **Test 3:** GET `/api/vendor/me` devuelve vendor real (no `note:"pendiente_seed_vendors_table"`).
- [ ] **Test 4:** GET `/api/vendor/orders` devuelve POs reales del vendor logueado.
- [ ] **Test 5:** Frontend tabla POs cablea de API, no del HTML hardcoded (`grep "PO-2026-04781" volvix-vendor-portal.html` = 0 hits).
- [ ] **Test 6:** Playwright: login como vendor_1, ve solo SUS POs (no las de vendor_2). Login vendor_2 → ve solo las suyas.
- [ ] **Test 7:** `postfix-verify.sh` sobre 4 sub-sistemas no tocados.

Estado: PENDIENTE

---

### B4 — SSO consolidación + i18n strings críticos (#8 + #2) [DUPLA, 90-120 min]
**Tipo:** Frontend + i18n.
**🟢 Paralelizable con B3** (no comparten archivos).

Pre-requisito: B2 completo.

Definición de hecho:
- [ ] **Test 1:** `grep -lE '<form[^>]*login' --include="*.html" -r .` devuelve **1 solo archivo** (`login.html`).
- [ ] **Test 2:** SalvadoreX y customer-portal SIN form fallback, solo IIFE ssoCheck con redirect a `/login.html?redirect=`.
- [ ] **Test 3:** Diccionario `es:` cubre los strings de mega-dashboard (script `scripts/check-i18n-coverage.sh` extrae strings y compara).
- [ ] **Test 4:** Diccionario `en.json` igual.
- [ ] **Test 5:** Playwright: switch idioma EN en mega-dashboard → todos los KPIs traducidos (Sales today, Tickets, Active tenants…). Screenshot.
- [ ] **Test 6:** Sin texto invisible en ningún tema (axe-core ejecutado, contraste mínimo 4.5:1).

Estado: PENDIENTE

---

### B5 — Tema + i18n grande (#1 + #15) [DUPLA, 90-120 min]
**Tipo:** CSS + i18n masivo.
**No paralelizable** (B6 depende de este).

Pre-requisito: B3 + B4 completos.

Definición de hecho:
- [ ] **Test 1:** mega-dashboard.css + admin-saas.css + salvadorex.css usan `var(--vlx-bg)` con fallback. `grep -E '#[0-9a-fA-F]{6}' --include="*.css" *.html` devuelve solo dentro de `var(--vlx-..., #fallback)`.
- [ ] **Test 2:** Switch tema → screenshot diff visual >30% en mega-dashboard (cambia visiblemente claro vs oscuro).
- [ ] **Test 3:** Cobertura i18n >70% (script automatizado `scripts/check-i18n-coverage.sh`).
- [ ] **Test 4:** axe-core sin violaciones de contraste en ambos temas.
- [ ] **Test 5:** `postfix-verify.sh` completo en 4 sub-sistemas.

Estado: PENDIENTE

---

### B6 — Limpieza final (#7, #9, #10, #11, #13, #14) [BATCH, 60-90 min]
**Tipo:** Mixto, bugs menores.
**No paralelizable** (último bloque, verifica todo).

Pre-requisito: B5 completo.

Definición de hecho:
- [ ] **Test 1:** Modal "Novedades 3.4.0" no reaparece tras dismiss (localStorage flag `volvix_changelog_seen_version`).
- [ ] **Test 2:** Toast "Stock bajo" oculto en marketplace público (auto-monitor detenido en pantallas públicas — verificar con `grep "Stock bajo" en página marketplace`).
- [ ] **Test 3:** Badge "US" tiene tooltip o se reemplaza por bandera SVG.
- [ ] **Test 4:** Kiosko: seed de productos asociados (catálogo no aparece "Catálogo no disponible" cuando hay seed).
- [ ] **Test 5:** AI Engine/Academy/Support: smoke test funcional (cargar, click en al menos un botón, no crashea), no solo verificar título.
- [ ] **Test 6:** Cookie banner persiste en localStorage tras un click "Aceptar todo" (verificar con segunda visita).
- [ ] **Test 7:** Auditoría final ux-logic-audit completa contra prod. Score >=85.

Estado: PENDIENTE

## Bitácora

| # | Fecha | Bloque | Bugs cerrados | Score post | Regresiones | Tiempo real | Notas |
|---|-------|--------|---------------|-----------|-------------|-------------|-------|
| 0 | 2026-04-27 | setup  | -             | 23        | -           | -           | infraestructura lista |
| 1 | 2026-04-27 | B1     | #12 cross-tenant | **43** | 0 | ~75 min | seed user_B, dual login, 18 tablas RLS hardened, ANON blocked, backend OK |
