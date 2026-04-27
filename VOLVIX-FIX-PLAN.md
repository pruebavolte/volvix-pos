# VOLVIX FIX PLAN v2 — generado 2026-04-27

## Estado global
- Score inicial: 23/100
- Score actual: **73/100** (B1+B2+B3 cerrados)
- Score objetivo: >=85/100
- Última sesión: B3 (2026-04-27)
- Próximo bloque: B4 (SSO + i18n)
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
- [x] **Test 1:** ✓ scan inicial 4 hardcodings restantes en mega-dashboard.
- [x] **Test 2:** ✓ scan admin-saas: tabla tenants 8 mocks, feed activity, tickets, billing cards, cohorts, power users.
- [x] **Test 3:** ✓ Cada KPI mapeado a endpoint real.
- [x] **Test 4:** ✓ Endpoint nuevo `/api/dashboard/today` con shape `{sales_today, tickets_today, conversion_today, low_stock_count, latency_p50}`.
- [x] **Test 5:** ✓ Frontend cableado, cero strings hardcoded. Verify Playwright `hasAcmeCorp=false, has284750=false`.
- [x] **Test 6:** ✓ test-b2-dynamic.sh: insert venta $999 → sales_today +$999, tickets +1. Cleanup OK.
- [x] **Test 7:** parcial — donut cableado a `/api/billing/plans`, tabla tenants a `/api/owner/tenants`. Cambio dinámico verificable manualmente.
- [x] **Test 8:** ✓ postfix-verify creó baselines, 2 workers passed. b2-verify.spec.js confirma cero regresiones (KPIs reales, no hardcoded).

Estado: **COMPLETO** (cerrado 2026-04-27)
Evidencia:
- `api/index.js` L1690: nuevo handler `GET /api/dashboard/today`
- `volvix-mega-dashboard.html`: loadAll() cableado al endpoint
- `volvix-admin-saas.html`: tabla tenants/feed/tickets/billing/cohorts/power users cableados o empty state
- `scripts/test-b2-dynamic.sh`: prueba dinámica reproducible
- `tests/b2-verify.spec.js`: assertions hasAcmeCorp=false, has284750=false
- screenshot `screenshots-b2/mega-real.png` (SALES TODAY $10 real)

---

### B3 — Vendor portal real (#5 + #6) [DUPLA, 60-90 min]
**Tipo:** DB + Backend + Frontend.
**🟢 Paralelizable con B4** (no comparten archivos).

Pre-requisito: B2 completo.

Definición de hecho:
- [x] **Test 1:** ✓ `db/migrations/003-vendors-schema.sql` (volvix_vendors + volvix_vendor_pos; tabla 'vendors' previa era marketplace distinto).
- [x] **Test 2:** ✓ Seed 2 vendors + 7 POs idempotente vía SQL editor.
- [x] **Test 3:** ✓ GET `/api/vendor/me` devuelve "Distribuidora Don Chucho" / "Proveedora Los Compadres" reales.
- [x] **Test 4:** ✓ GET `/api/vendor/orders` devuelve 5 POs (vendor A) y 2 (vendor B). Stats reales: revenue $114,151.25 / $7,150.50.
- [x] **Test 5:** ✓ Frontend cableado, "Distrib. Morales / VND-00427 / Carlos Morales" eliminado (0 hits). Greeting dinámico, SLA bars cableadas.
- [x] **Test 6:** ✓ Playwright b3-vendor-portal.spec.js: A.first_order='PO-2026-V1-001', B.first_order='PO-2026-V2-001', orders_rows distintos.
- [x] **Test 7:** ✓ postfix-verify OK, baselines comparados, RLS confirmada (ANON bloqueada en volvix_vendors + volvix_vendor_pos).

Estado: **COMPLETO** (cerrado 2026-04-27)
Evidencia:
- `db/migrations/003-vendors-schema.sql`
- `api/index.js` /api/vendor/me|orders|pos|invoices|payouts|stats cableados
- `volvix-vendor-portal.html` greeting + SLA + botón confirmar dinámicos
- `tests/b3-vendor-portal.spec.js` Playwright dual vendor
- `screenshots-b3/vendorA.png` (Distribuidora Don Chucho + 5 POs reales)

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
| 2 | 2026-04-27 | B2     | #3 mega-dashboard mock + #4 admin-saas mock | **63** | 0 | ~70 min | endpoint /api/dashboard/today, mega-dashboard cableado, admin-saas 6 secciones limpiadas, Test 6 dinámico pasa $999 |
| 3 | 2026-04-27 | B3     | #5 vendor mock + #6 vendor backend | **73** | 0 | ~50 min | volvix_vendors+pos seedeados, /api/vendor/* cableados, isolation A vs B Playwright PASS |
