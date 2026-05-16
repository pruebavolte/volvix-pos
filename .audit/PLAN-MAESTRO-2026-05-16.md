# PLAN MAESTRO CONSOLIDADO — Volvix POS / Panel
> **Fecha**: 2026-05-16
> **Alcance**: salvadorex-pos.html + paneldecontrol.html
> **Sustenta a**: este documento reemplaza la lectura de los 12 reportes individuales. Todo lo que vimos hoy está aquí.

---

## 0. Contexto en una pantalla

Hoy ejecutamos 4 metodologías de auditoría distintas sobre los mismos 2 archivos:

| Reporte (en `.audit/`) | Metodología | Defectos | Status |
|---|---|---|---|
| REPORTE-SDD-2026-05-15.md | Spec-Driven Dev. vs contratos | 5 deudas reparadas | Cerrado |
| SUGERENCIAS-COMPARATIVAS-2026-05-15.md | Cross-screen UX | 6 anti-patrones + 47 sugerencias | 4 Quick Wins aplicados |
| VERIFICACION-FISICA-2026-05-15.md | Chrome MCP + screenshots | Confirma 6 fixes vivos | Cerrado |
| AUDITORIA-ADVERSARIAL-2026-05-16.md | Adversarial + descubrimiento (3 anexos) | 37 + 47 defectos | **Score POS 22/100 · Panel 15/100 · NO-GO** |

5 ADRs propuestos en `.specify/decisions/`. 13 commits en producción hoy (de `12dc870` a `3d23c5d`).

---

## 1. Lo que YA SE HIZO hoy (verificable por commit)

### Capa 1 — Seguridad inmediata (sin riesgo)
- ✅ XSS fixes: `renderIngredientes`, `renderRecetas`, `renderPosts`, `reprintSale`, `recargas`, `menuApp`, `cargarProductosSel`
- ✅ Auth headers `_f()` helper en ingApp/mktApp/menuApp
- ✅ CSV injection prefix en `_vlxDownloadCSV`
- ✅ `encodeURIComponent` en fechas de export
- ✅ `setInterval` con handles asignados (`_oxxoClockInterval`, `_topSellerInterval`)
- ✅ `depEdit()` con PATCH real

### Capa 2 — UX correcciones (verificadas físicamente)
- ✅ Buscador inline en `screen-clientes` con filtro N de M
- ✅ Historial default últimas 24h + botón "Ver todas"
- ✅ Recargar/Exportar agregados a clientes y ventas
- ✅ Imprimir corte / Exportar corte / Imprimir apertura
- ✅ Chip MAYOREO visible cuando F11 activo
- ✅ Placeholder #barcode-input "Escanear código O escribir nombre"
- ✅ Normalización debt/credit_balance/deuda en clientes

### Capa 3 — Infraestructura SDD instalada
- ✅ `.specify/` con constitución, dominio, 40+ contratos por pantalla, flows
- ✅ `.claude/skills/` con verify-schema, sst-validator, flow-audit
- ✅ `prompts-sdd/` con auditoría sistémica + nuevo módulo
- ✅ 5 ADRs documentales (001-005)

### Capa 4 — Documentación honesta
- ✅ Auditoría adversarial con 3 anexos (cuerpo + Anexo I + Anexo II + Anexo III)
- ✅ Confesión explícita de overpromises y muestreo

---

## 2. Lo que NO SE HIZO y SIGUE PENDIENTE (consolidado de todos los reportes)

### A. 4 BLOQUEANTES del POS (cuerpo adversarial)

| # | Defecto | Por qué importa | Estado |
|---|---|---|---|
| B-POS-1 | `updateTotals()` no aplica IVA | No-compliant SAT. Tickets sin impuesto. | **0% atacado** |
| B-POS-2 | Stock local no se decrementa post-venta | Sobreventa posible, cliente engañado | **0% atacado** |
| B-POS-3 | Pago mixto sin validar suma === total | Se cobra menos/más sin alerta | **0% atacado** |
| B-POS-4 | Duplicate state CATALOG vs PRODUCTS_REAL | UI muestra 1000 vs 5 simultáneamente | Parche superficial, ADR-001 sin ejecutar |

### B. 6 BLOQUEANTES adicionales del Anexo II (cross + panel)

| # | Defecto | Severidad cliente | Estado |
|---|---|---|---|
| B-X-1 | Toggle "ventas" off → cliente sigue trabajando (cache stale + JWT vivo) | Pierde control sobre TODOS los clientes | **0% atacado** |
| B-X-2 | Toggle feature "pos.cobrar" off → endpoint sigue aceptando | Permiso solo cosmético | **0% atacado** |
| B-X-3 | Suspender tenant no invalida JWT | Cliente suspendido cobra hasta 7 días | **0% atacado** |
| B-PNL-4 | Impersonation sin banner visible en POS | Privacidad/legal | **0% atacado** |
| B-PNL-5 | Impersonation sin notificación al cliente | Privacidad/legal | **0% atacado** |
| B-PNL-6 | platform_owner sin 2FA UI / IP allowlist / sesiones activas | Credenciales robadas = control total | **0% atacado** |

### C. 17 Críticos (selección de Anexos I y II)

C-1 a C-17 — desde override en localStorage hasta folio client-side. Detalle en `AUDITORIA-ADVERSARIAL-2026-05-16.md` tabla central. **0% atacados.**

### D. 13 Altos + 7 Medios/Bajos

Acciones destructivas con `confirm()` browser, IVA hardcoded, UPCitemDB sin caché, debouncing faltante, etc. **0% atacados.**

### E. 5 ADRs sin ejecutar

| ADR | Tema | Estimado |
|---|---|---|
| 001 | Unificar CATALOG / PRODUCTS_REAL en VolvixState | 8h |
| 002 | SALES/CUSTOMERS array → objetos híbridos | 2h |
| 003 | 6 sistemas tabs → VolvixTabs.activate | 4h |
| 004 | Canonizar pos_*, DROP de tablas legacy | 6h |
| 005 | Validar diagrama state-machine de pago | 1h |

### F. 15 verificaciones experimentales pendientes (Anexo III)

Las 7 más críticas (probar BLOQUEANTES de inferencia → comprobación):
1. ¿Token tenant B puede leer datos de tenant A?
2. ¿Cliente suspendido sigue cobrando?
3. ¿`/api/sales` rechaza si feature deshabilitada?
4. ¿Override aplica al instante?
5. ¿Token impersonación es read-only?
6. ¿JWT platform_owner accede a endpoints no-superadmin?
7. ¿Token impersonación se invalida al cerrar pestaña?

### G. 47 sugerencias de UX por pantalla (cross-screen audit)

Cosas como: filtros estado/método en historial, salud auto-refresh, dashboard rango real, sandbox preview para módulos lockeados, etc.

### H. Overpromises hechos hoy (Anexo I) que necesitan corrección

- Dashboard filtro Hoy/Semana/Mes: cosmético — KPIs hardcoded
- Aperturas anteriores: solo navega, no muestra historial real
- Feature flag plataformas: default visible, no hay toggle en config
- Varios fixes sin verificación física: printCorteSummary, exportCorteCSV, chips ventas, auto-refresh salud

---

## 3. PLAN MAESTRO de ejecución — en orden de impacto

> Regla guía: **una falla del panel afecta a TODOS los clientes** → panel primero. **Una falla del POS afecta a un cliente** → POS después.

### FASE 0 — Verificación experimental (1 sesión, 2-3 horas) ⚡ **MUY ALTA PRIORIDAD**

**Por qué primero**: distingue "potencialmente vulnerable" de "comprobadamente vulnerable". Sin esto, los Bloqueantes son inferidos.

**Tareas**:
1. Crear 2 tenants de prueba en producción (T_A y T_B).
2. Obtener JWT de T_A. Intentar `GET /api/admin/tenants/T_B_id` → confirmar 403.
3. Suspender T_A en panel. Verificar que sesión activa NO siga cobrando.
4. Deshabilitar módulo "ventas" en T_A. Intentar `POST /api/sales` con su JWT → confirmar 403.
5. Crear override en panel. Verificar que aplica al instante (sin re-login).
6. Generar token impersonación. Intentar `POST /api/sales` → confirmar rechazo (read-only).
7. Cerrar pestaña impersonada. Verificar que token queda invalidado.

**Output**: tabla de 7 filas con resultado pasa/falla → confirma o descarta cada Bloqueante.

---

### FASE 1 — Bloqueantes del PANEL (1-2 semanas)

**Por qué**: comprometen el negocio entero, no a un cliente.

#### Sprint 1.1 — Hardening de credenciales platform_owner (3-5 días)
- B-PNL-6a: Tab "Seguridad" en panel con 2FA via OTP (backend ya tiene)
- B-PNL-6b: GET /api/admin/my-sessions + UI para listar y revocar sesiones propias
- B-PNL-6c: Tabla `admin_ip_allowlist` + middleware `enforceIpAllowlist` en endpoints /api/admin/*
- B-PNL-6d: Alerta por email cuando nueva IP intenta login

#### Sprint 1.2 — Impersonation segura (2-3 días)
- B-PNL-4: Banner amarillo grande "MODO IMPERSONACIÓN" en POS con `imp_*` params
- B-PNL-5: Email + entrada en `pos_user_security_log` del cliente al impersonarlo
- C-16: Server emite JWT con `scope='impersonate_read_only'`, middleware en endpoints write rechaza
- C-27: Botón "Salir de impersonación" + countdown 30 min de auto-expiración

---

### FASE 2 — Bloqueantes CROSS-archivo (1 semana)

#### Sprint 2.1 — Enforcement real de toggles
- B-X-2: Middleware `requireFeature('pos.cobrar')` en handler POST /api/sales
- B-X-1: Cliente poll `/api/app/config?since=<timestamp>` cada 60s + BroadcastChannel para invalidar caché
- B-X-3: Tabla `revoked_tokens` + check en `requireAuth`; PATCH /api/admin/tenant/:id/suspend ahora revoca activos

---

### FASE 3 — Bloqueantes del POS (1 semana, fiscal-crítico)

#### Sprint 3.1 — IVA y cálculos correctos
- B-POS-1: Refactor `updateTotals()` con IVA configurable por giro/categoría
- ADR-001 ejecutar (Fase 1): crear `window.VolvixState` con setProducts/setSales/setCustomers + listeners

#### Sprint 3.2 — Stock y pago consistentes
- B-POS-2: Decrementar `CATALOG[i].stock` en `_postSaleCleanup` post-venta exitosa
- B-POS-3: Validación `Σ pagos === total` antes de `POST /api/sales`
- B-POS-4: ADR-001 Fase 2-3 — eliminar dualidad CATALOG/PRODUCTS_REAL

---

### FASE 4 — Críticos del panel (3-5 días)
- C-11: Eliminar lectura de `localStorage` para overrides — solo server-side
- C-12: Server NO debe servir HTML/JS de módulos deshabilitados (true hide)
- C-13/14: Modales con `tipear: SUSPENDER` / `tipear: ELIMINAR <nombre>` para confirmación robusta
- C-17: Rollback de UI en `toggleModule`/`toggleFeature` cuando API falla
- C-32: Tabla `bulk_operations_log` con botón "Revertir últimas 5 min"
- C-37: POST /api/auth/logout → invalida JWT server-side

---

### FASE 5 — Críticos cross-archivo (1 día)
- C-20: Interceptor global de fetch detecta 401 → `location.href='/login.html'`

---

### FASE 6 — Críticos del POS (5-7 días)
- C-18: F12 Cobrar `disabled` cuando CART.length === 0
- C-19: Folio retornado por server en POST /api/sales (no cliente lo asigna)
- C-21: `addToCart` rechaza si stock <= 0 (con override por owner)
- C-22: Re-fetch cupón post-POST + decrementar usage_count local
- C-23: Lista "Ventas pendientes" en sidebar con botón recuperar
- C-24: Audit completa de innerHTML en print window — escape uniforme

---

### FASE 7 — ADRs estructurales (2 semanas opcional)
- ADR-002 (2h) ejecutar — arrays → objetos híbridos
- ADR-003 (4h) ejecutar — `VolvixTabs.activate()` unificado
- ADR-004 (6h + migración SQL) ejecutar — DROP de tablas legacy
- ADR-005 (1h) ejecutar — diagrama mermaid validado con código

---

### FASE 8 — Altos / Medios / Bajos (incremental, 1 semana)
20+ items: confirms robustos, IVA configurable, debouncing, empty states, sin loaders, tooltips faltantes, etc. Se atacan en sprints pequeños conforme se tocan los archivos.

---

### FASE 9 — Honestidad ya pendiente (1-2 días)
- Dashboard filtro Hoy/Semana/Mes: wire al backend real `GET /api/dashboard/summary?range=`
- Aperturas anteriores: render real de historial de aperturas (no solo navegar)
- Feature flag plataformas: toggle UI en config
- Verificación física post-deploy de todos los Quick Wins declarados ayer

---

## 4. Timeline consolidado

| Fase | Trabajo | Estimado | Acumulado |
|---|---|---|---|
| 0 | Verificación experimental | 2-3 horas | 0.5 día |
| 1 | Bloqueantes panel | 5-8 días | 1.5 sem |
| 2 | Bloqueantes cross | 4-5 días | 2.5 sem |
| 3 | Bloqueantes POS | 5-7 días | 3.5 sem |
| 4 | Críticos panel | 3-5 días | 4.5 sem |
| 5 | Críticos cross | 1 día | 4.5 sem |
| 6 | Críticos POS | 5-7 días | 5.5 sem |
| 7 | ADRs estructurales | 2 semanas opt | 7.5 sem |
| 8 | Altos/Medios/Bajos | 1 sem | 8.5 sem |
| 9 | Cierre de overpromises | 1-2 días | 8.7 sem |

**Total realista: ~9 semanas de trabajo enfocado para llegar a PRODUCTION-READY.**

Con un solo developer + IA. Acelera si se paraleliza el panel y el POS.

---

## 5. Definición de "HECHO" (DoD) por defecto

Antes de declarar cualquier Bloqueante/Crítico como reparado, debe pasar las 3 condiciones de la constitución C10:

1. **BD**: query directo via MCP confirma el cambio en Supabase
2. **UI**: screenshot o test Playwright confirma el cambio visible sin recargar
3. **Flujo**: el flow end-to-end correspondiente corre verde de punta a punta

Sin las 3, **no está hecho**. Reportar como pendiente, no como completo.

---

## 6. Métricas de salida

| Métrica | Hoy | Objetivo (post-Fase 6) |
|---|---|---|
| Score POS | 22/100 | ≥ 75/100 |
| Score Panel | 15/100 | ≥ 80/100 |
| Veredicto | NO-GO | NEEDS-WORK → PRODUCTION-READY |
| Bloqueantes | 10 abiertos | 0 abiertos |
| Críticos | 17 abiertos | ≤ 3 abiertos |
| ADRs ejecutados | 0 / 5 | ≥ 4 / 5 |
| Verificaciones experimentales | 0 / 15 | 15 / 15 |
| Overpromises declarados sin corregir | 19 items | 0 items |

---

## 7. Decisiones que necesito de ti AHORA

Tres opciones de arranque. **Solo elige una:**

| Opción | Qué hago | Tiempo hoy |
|---|---|---|
| **A — Verificación primero** | Ejecutar FASE 0 (7 pruebas experimentales) → reporte de confirmación | 2-3 horas |
| **B — Bloqueante más crítico** | Empezar FASE 1 Sprint 1.1 (hardening platform_owner — 2FA + sesiones) | 4-6 horas |
| **C — Fix fiscal urgente** | Saltar a FASE 3 (IVA en updateTotals) porque es no-compliant SAT | 3-4 horas |

**Mi recomendación profesional**: **Opción A**. Sin las pruebas experimentales no sabemos si los Bloqueantes son reales o inferidos. Es la inversión de 2 horas que decide si los siguientes 60 días los invertimos en lo correcto.

---

## 8. Anexo — Referencia rápida a los 12 reportes consolidados aquí

| Archivo | Para qué consultarlo |
|---|---|
| `.audit/AUDITORIA-ADVERSARIAL-2026-05-16.md` | Lista completa de 84 defectos (37 cuerpo + 47 Anexo II), severidad por uno |
| `.audit/SUGERENCIAS-COMPARATIVAS-2026-05-15.md` | 47 sugerencias UX por pantalla |
| `.audit/REPORTE-SDD-2026-05-15.md` | 5 deudas SDD reparadas con rationale |
| `.audit/VERIFICACION-FISICA-2026-05-15.md` | Screenshots Chrome MCP de los fixes vivos |
| `.audit/validation-coherence.md` | Auditoría de coherencia screens ↔ endpoints |
| `.audit/validation-endpoints.md` | Inventario de 75 endpoints admin |
| `.audit/validation-orphans.md` | Funciones/endpoints huérfanos |
| `.audit/validation-schema.md` | Estado del schema vs código |
| `.audit/validation-screens.md` | 34 pantallas auditadas |
| `.audit/wave-3-summary.md` | Resumen ola anterior |
| `.audit/final-report.md` | Reporte previo (pre-SDD) |
| `.specify/decisions/ADR-001..005.md` | Decisiones arquitectónicas con plan de migración |

---

**Fin del Plan Maestro. Total: ~9 semanas si se trabaja en serio. Decide arriba qué opción ejecutamos hoy.**
