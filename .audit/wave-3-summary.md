# Wave 3 — Consolidación de Validadores

> Generado por Wave 3 Agent (Agente 3.5) · 2026-05-15
> Rama: `claude/mystifying-raman-33a025`

---

## Estado de validators

| Validator | Archivo esperado | Estado |
|---|---|---|
| 3.1 — Schema | `.audit/validation-schema.md` | ⚠️ No generado (agente 3.1 no corrió) |
| 3.2 — Endpoints | `.audit/validation-endpoints.md` | ⚠️ No generado (agente 3.2 no corrió) |
| 3.3 — Screens | `.audit/validation-screens.md` | ⚠️ No generado (agente 3.3 no corrió) |
| 3.4 — Orphans | `.audit/validation-orphans.md` | ⚠️ No generado (agente 3.4 no corrió) |
| 3.5 — Coherencia | `.audit/validation-coherence.md` | ✓ Generado |
| Previo — System Map | `.audit/system-map.report.md` | ✓ Existía (Wave 2) |

**Validators corridos: 1/5** (3.5 completado; 3.1–3.4 pendientes)

---

## Resumen de deudas detectadas

Las deudas a continuación se consolidan de:
- `validation-coherence.md` (este wave, análisis de 5 screens Tier 1 y 8 contratos de endpoint)
- `system-map.report.md` (Wave 2 — análisis estático de 22919 líneas POS + 9097 PDC)
- Contratos de screen Tier 1: `pos.spec.md`, `corte.spec.md`, `inventario.spec.md`, `clientes.spec.md`, `ventas.spec.md`
- Contratos de endpoint: 8 archivos en `.specify/contracts/endpoints/`

---

### CRITICAS (seguridad / data leak)

1. **`GET /api/owner/low-stock` no filtra `tenant_id`**
   - El handler consulta `pos_products` sin WHERE tenant_id — si la service role key bypasea RLS, cualquier owner autenticado puede ver productos de bajo stock de TODOS los tenants del sistema. Contrato: `GET-api-owner-low-stock.spec.md`.

2. **`GET /api/users/me` devuelve JWT sin query a DB**
   - Un usuario desactivado en `pos_usuarios` mantiene JWT válido hasta expiración. No hay verificación de estado activo en DB. Contrato: `GET-api-users-me.spec.md`.

3. **`GET /api/app/config` es público (sin auth)**
   - Cualquier persona con un `tenant_id` válido obtiene nombre, teléfono, ciudad, configuración de módulos y branding del negocio. No hay auth requerido. Contrato: `GET-api-app-config.spec.md`.

4. **`POST /api/sales` sin contrato de endpoint — 24 menciones en API sin spec formal**
   - El endpoint de mayor criticidad del sistema (cobro de ventas) no tiene contrato documentado. Riesgo: implementación diverge entre lo que la screen espera y lo que el backend entrega. Detectado en `pos.spec.md` deuda T2 y `ventas.spec.md` deuda DT-V3.

5. **Tabla `pos_sales` vs `sales` vs `volvix_ventas` — triple ambigüedad**
   - `POST /api/sales` escribe en `pos_sales` (24x), pero `pdf-export.js` lee de `sales` y hay migraciones en `volvix_ventas`. RLS puede diferir entre tablas. Si `sales` tiene RLS menos estricta, un actor malicioso podría acceder a ventas de otros tenants via `pdf-export.js`. Severidad: ALTA (deuda D2 en schema-truth).

---

### ALTAS (correctitud / bugs activos)

6. **`CUSTOMERS` array posicional frágil — índice [0..5] accedido sin nombres**
   - `clientes.spec.md` AP-C4: cualquier reordenamiento silencia errores. Afecta directamente al cobro (POS lee `CUSTOMERS` para asignar cliente al ticket). Bug activo.

7. **`SALES` array posicional frágil — índice [0..6]**
   - `ventas.spec.md` AP-V3: misma deuda que CUSTOMERS. Afecta historial y módulo de devoluciones.

8. **Filtro de fecha en historial de ventas no filtra la tabla en memoria**
   - `ventas.spec.md` AP-V2: `applyHistorialFilter()` guarda filtro pero re-renderiza las 200 ventas sin filtrar. Solo el CSV de export respeta el filtro. Bug visible para usuarios.

9. **Tres campos de mapeo inconsistentes en `CUSTOMERS`**
   - `clientes.spec.md` AP-C2: `c.debt` / `c.credit_balance` / `c.deuda` mapean el mismo concepto según el path de carga. Puede mostrar saldo $0 incorrectamente.

10. **`cuts` vs `pos_cortes` — tabla ambigua con RLS potencialmente divergente**
    - `corte.spec.md` deuda DT-C1: la API llama ambas tablas. Sin contrato de endpoint para ningún `/api/cuts/*`. Riesgo de RLS incorrecta en el corte de caja.

11. **`pos_products` vs `products` vs `volvix_productos` — triple ambigüedad en inventario**
    - `inventario.spec.md` DT-I1: `pos_products` (API, 19 menciones), `products` (pdf-export), `volvix_productos` (CLAUDE.md). Verificar cuál tiene datos reales y RLS.

12. **`customers` vs `pos_customers` — dos tablas para clientes**
    - `clientes.spec.md` AP-C6 / deuda D4: posible divergencia de RLS entre ambas tablas.

13. **Botón "Ver" en ventas sin handler (`btn.sm "👁️"`)**
    - `ventas.spec.md` AP-V1: botón visible en producción sin acción. Bug UX activo.

14. **Botón "Ver" en clientes sin handler**
    - `clientes.spec.md` AP-C1: `renderClientes()` genera `<button>Ver</button>` sin onclick.

15. **`#r4c-reopen-bar` (reabrir corte) sin guard de rol en HTML**
    - `corte.spec.md` DT-C4: visibilidad depende de JS. Si JS falla, botón de reabrir corte queda visible para todos los roles.

---

### BAJAS (deuda técnica / naming)

16. **97% de endpoints de screens Tier 1 sin contrato de endpoint**
    - Coherencia score: 1/66 (1.5%). Solo `/api/pos/app-orders` tiene relación bidireccional documentada. Todos los demás endpoints críticos (`/api/sales`, `/api/products`, `/api/customers`, `/api/cuts/*`) sin spec formal.

17. **`window.CART` vs `CART` — alias inconsistente**
    - `pos.spec.md` T3: `CART` es `let` en scope de módulo; `window.CART` se asigna solo tras clearCart/completePay. Módulos externos pueden leer estado stale.

18. **BroadcastChannel `'volvix-cart-sync'` sin `.close()` garantizado**
    - `pos.spec.md` T4 + system-map.report.md: dos BroadcastChannels sin cierre en desmontaje.

19. **`system-map.json` desactualizado para screen corte e inventario**
    - `corte.spec.md` DT-C2: system-map reporta `endpoints_propios: []` para `screen_pos_corte`. Los 9 endpoints reales no están mapeados.
    - `inventario.spec.md` DT-I3: solo lista `/api/admin/tenants` cuando hay 20+ endpoints reales.

20. **`GET /api/app/config` — 7+ queries paralelas a Supabase sin caché**
    - Latencia acumulada en cada bootstrap. Contrato: `GET-api-app-config.spec.md`.

21. **`GET /api/admin/tenants` — `total` reporta `items.length` no el total real en DB**
    - Con >500 tenants el sistema reporta `total: 500` incorrecto. Contrato: `GET-api-admin-tenants.spec.md`.

22. **Dos familias de toggle en PDC (`/modules/:id/toggle` vs `:tid/module`) escriben en la misma tabla**
    - `GET-POST-api-admin-tenant.spec.md`: riesgo de race condition y estado inconsistente.

23. **Impresión ticket Z (`printZ()`) sin contrato ni fallback documentado**
    - `corte.spec.md` DT-C3: depende de `/api/printer/raw` pero sin spec. Sin fallback si impresora no disponible.

24. **Roles no normalizados: coexisten `"cashier"` y `"cajero"`**
    - system-map.report.md + `pos.spec.md` T1: deuda global del sistema.

25. **`pos_app_orders`, `client_errors`, `pos_app_branding`, `pos_app_media` no figuran en schema-truth**
    - Tablas usadas por endpoints con contrato pero no documentadas en CLAUDE.md. Verificar existencia en Supabase.

---

## Métricas

| Métrica | Valor |
|---|---|
| Screens Tier 1 con contrato | 5 / 29 (17%) |
| Screens Tier 2 con contrato (stub) | ~29 / 29 (stubs disponibles) |
| Contratos de endpoint | 8 / ~139 (5.8%) |
| Tablas documentadas en schema-truth | 7 (CLAUDE.md) vs ~20+ detectadas en código |
| Endpoints en POS (system-map) | 121 |
| Endpoints en PDC (system-map) | 26 |
| Endpoints compartidos | 8 |
| Score de coherencia bidireccional | 1 / 66 (1.5%) |
| Relaciones con contrato de endpoint | 2 / 66 (3%) |
| Relaciones bidireccionales plenas | 1 / 66 (1.5%) |

---

## Top 10 deudas a atacar mañana (ordenadas por impacto/riesgo)

| # | Deuda | Severidad | Acción |
|---|---|---|---|
| 1 | `GET /api/owner/low-stock` no filtra tenant_id | CRÍTICA | Agregar `WHERE tenant_id = req.user.tenant_id` en handler + verificar RLS en `pos_products` |
| 2 | `POST /api/sales` sin contrato de endpoint | CRÍTICA | Crear `.specify/contracts/endpoints/POST-api-sales.spec.md` con shape completo (request, response 200/409/50x, idempotency, tabla) |
| 3 | Triple tabla ventas (`pos_sales` / `sales` / `volvix_ventas`) | CRÍTICA | Confirmar en Supabase cuál tiene RLS activa; deprecar las otras dos o agregar views |
| 4 | `GET /api/app/config` público — expone config de cualquier tenant | CRÍTICA | Evaluar si `tenant` (nombre, teléfono) debe ser público; al menos quitar campos internos (modulesState, terminology) de respuesta no-autenticada |
| 5 | `GET /api/users/me` no verifica DB | CRÍTICA | Agregar query `SELECT is_active FROM pos_usuarios WHERE id = req.user.id` en el handler para bloquear usuarios desactivados |
| 6 | `CUSTOMERS` array posicional → migrar a array de objetos | ALTA | Refactorizar `CUSTOMERS[]` de `[nombre, telefono, ...]` a `{id, name, phone, credit_limit, debt, last_purchase_at}` en DataLoader y en renderClientes/openCustomerSelector |
| 7 | Tres campos de mapeo inconsistentes en CUSTOMERS (`debt` / `credit_balance`) | ALTA | Normalizar en los 3 paths de carga de `/api/customers` a un campo único `balance_owed` |
| 8 | Filtro fecha en historial ventas no filtra tabla en memoria (AP-V2) | ALTA | Implementar filtrado de `SALES` por `sessionStorage['vlx:hist:from']` / `to` en `renderVentas()` |
| 9 | Contratos de endpoint para familia `/api/cuts/*` (10 endpoints sin contrato) | ALTA | Crear `POST-GET-api-cuts.spec.md` cubriendo open, close, summary, check-pending, adjustments, reopen |
| 10 | `#r4c-reopen-bar` sin guard de rol en HTML | ALTA | Agregar `data-requires-role="OWNER SUPERADMIN"` en el elemento HTML o agregar `.hidden` por defecto con guard JS antes de render |

---

## Notas para Wave 4

- Los validators 3.1 (schema), 3.2 (endpoints), 3.3 (screens Tier 2) y 3.4 (orphans) no fueron ejecutados en este blitz. Se recomienda correrlos en Wave 4 antes de generar contratos de los endpoints de mayor riesgo.
- La prioridad máxima para contratos de endpoint es: `/api/sales`, `/api/products`, `/api/customers`, `/api/cuts/close`.
- El score de coherencia bidireccional (1.5%) es la métrica más importante a mejorar: actualmente el 97% de las relaciones screen→endpoint son de una sola vía (la screen documenta que usa el endpoint, pero el endpoint no documenta quién lo consume).

---

> Wave 3 completada · Agente 3.5 · 2026-05-15
