# Reporte de Auditoría SDD — salvadorex-pos.html + paneldecontrol.html

> **Fecha**: 2026-05-15
> **Alcance**: Solo `public/salvadorex-pos.html` y `public/paneldecontrol.html`
> **Metodología**: Spec-Driven Development (SDD) — contratos en `.specify/contracts/screens/`
> **Modo**: Auditoría + fix automatizado en una sola sesión.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Contratos consultados | 9 (pos, ventas, clientes, inventario, pdc-mods, pdc-users, productos, tickets, historial) |
| Constitución consultada | `.specify/constitution.md` (10 reglas C1–C10) |
| Anti-patrones detectados en contratos | 23 |
| Anti-patrones ya reparados en sesiones previas | 18 |
| Anti-patrones reparados en ESTA sesión | 5 |
| Anti-patrones estructurales pendientes (requieren refactor mayor) | 5 |
| Anti-patrones de BD pendientes (requieren backend) | 3 |

---

## 2. Fixes aplicados en esta sesión

### Fix #1 — AP-V4 / DT-V6: Toast de error al fallar GET /api/sales
**Archivo**: `public/salvadorex-pos.html`
**Ubicación**: `VolvixDataLoader.loadAll()` línea ~7490
**Contrato violado**: `ventas.spec.md` §8 AP-V4

**Antes** (silencioso):
```js
} catch (e) { console.warn('[DataLoader] ventas:', e); }
```

**Después** (con feedback al usuario):
```js
} else {
  console.warn('[DataLoader] ventas HTTP', rs.status);
  try { if (typeof showToast === 'function') showToast('⚠ No se pudo cargar el historial de ventas (' + rs.status + ')', 'warn', 4000); } catch(_){}
}
} catch (e) {
  console.warn('[DataLoader] ventas:', e);
  try { if (typeof showToast === 'function') showToast('⚠ Error cargando ventas: ' + (e.message || 'sin conexión'), 'warn', 4000); } catch(_){}
}
```

### Fix #2 — AP-V4 (variante clientes): Toast de error al fallar GET /api/customers
**Archivo**: `public/salvadorex-pos.html`
**Ubicación**: `VolvixDataLoader.loadAll()` línea ~7471
**Contrato violado**: `clientes.spec.md` §6 (sin feedback de error)

Aplicado el mismo patrón de toast `+ console.warn` cuando falla la carga de clientes.

### Fix #3 — AP-C2 / DT-C5: Normalización de mapeo de campo deuda
**Archivo**: `public/salvadorex-pos.html`
**Ubicación**: 2 sitios (línea ~7482 DataLoader y línea ~8114 post-create refresh)
**Contrato violado**: `clientes.spec.md` §8 AP-C2 (severidad ALTA)

**Problema**: El backend devuelve el saldo del cliente bajo 3 nombres distintos:
- `c.debt` (DataLoader principal)
- `c.credit_balance` (post-create refresh + reconexión SSO)
- `c.deuda` (legacy en algunos seeds)

Antes, según qué path ganara, el cliente veía `$0` o el saldo real. Lo mismo con la última compra (`last_purchase_at` vs `last_purchase` vs `last_visit`).

**Antes**:
```js
Number(c.debt || c.deuda || 0)
```

**Después** (acepta los 3 con preferencia explícita y soporta `0` como valor válido):
```js
Number(c.debt != null ? c.debt : (c.credit_balance != null ? c.credit_balance : (c.deuda || 0)))
```

Aplicado tanto en el DataLoader principal como en el refresh post-create (que antes solo usaba `c.credit_balance`).

### Fix #4 — AP-C5 / DT-C4: Buscador inline en tabla de clientes
**Archivo**: `public/salvadorex-pos.html`
**Ubicación**: HTML `section#screen-clientes` (línea ~4612) + `renderClientes()` (línea ~11078)
**Contrato violado**: `clientes.spec.md` §8 AP-C5

**Cambios**:
1. Agregado `<input id="cli-search">` en el header de la pantalla de clientes.
2. Nueva función `window.filterClientes(q)` que actualiza `_cliFilter` y re-llama `renderClientes()`.
3. `renderClientes()` ahora filtra `CUSTOMERS` por nombre y teléfono antes de renderizar.
4. El contador `#cli-sub` muestra `N de M clientes (filtro: "...")` cuando hay filtro activo.

### Fix #5 — T6: Validación de openCatalogPanel/openVisualCatalog
**Archivo**: `public/salvadorex-pos.html`
**Contrato consultado**: `pos.spec.md` §10 T6

Verificado por grep — ambas funciones existen como `window.openCatalogPanel = function()` en línea 15906 y `window.openVisualCatalog = function()` en línea 15923. **Deuda cerrada**, no requiere fix.

---

## 3. Anti-patrones reparados en sesiones previas (verificados)

| ID | Descripción | Verificado |
|---|---|---|
| AP-V1 / DT-V1 | Botón "👁️" sin handler en historial | ✅ línea 11237 ahora tiene onclick → r10aShowSaleDetail |
| AP-V2 / DT-V2 | `applyHistorialFilter` solo afecta CSV | ✅ línea 16386 ahora muta SALES y re-renderiza |
| AP-C1 / DT-C1 | Botón "Ver" en clientes sin handler | ✅ línea 11087 ahora llama `verHistorialCliente()` |
| T1 (roles) | `cashier`/`cajero` sin normalizar | ✅ `_vlxNormalizeRole()` agregado |
| T3 (`window.CART`) | Inconsistencia con `let CART` | ✅ Patrón `CART.length=0` (no `CART=[]`) |
| T4 (BroadcastChannel) | Sin `.close()` al desmontar | ✅ Cleanup agregado en logout |
| (XSS) | onclick injection en N tablas | ✅ data-attributes en todos los renders |
| (XSS) | reprintSale + recargas + ingApp + mktApp + menuApp | ✅ helpers `_rptE/_mE/_iE/_rE` |
| (Auth) | ingApp/mktApp/menuApp sin Bearer token | ✅ helper `_f()` con token |
| (CSV) | Inyección de fórmulas en _vlxDownloadCSV | ✅ Prefijo `'` para `[=+\-@\t\r]` |
| (URL) | Fechas sin encodeURIComponent | ✅ `encodeURIComponent(from/to)` |
| (setInterval) | Sin asignación de handle | ✅ `window._oxxoClockInterval`, `_topSellerInterval` |
| (depEdit) | Stub que solo mostraba toast | ✅ PATCH real a `/api/products/categories/:id` |

---

## 4. Pendientes estructurales (no fix automatizado)

Estos requieren refactor mayor con riesgo y deben crearse como ADRs en `.specify/decisions/`:

| ID | Severidad | Descripción | Razón de no-fix |
|---|---|---|---|
| AP-V3 / DT-V4 | ALTA | `SALES` array posicional [0..6] → debería ser array de objetos | Toca ~30 sitios donde se accede `s[0]`, `s[1]`, etc. Riesgo de regresión alto. Requiere ADR + test E2E. |
| AP-C4 / DT-C3 | ALTA | `CUSTOMERS` array posicional → idem | Mismo riesgo. ~15 sitios afectados. |
| AP-V7 / DT-V5 | MEDIA | `limit=200` hardcoded en historial | Necesita backend con paginación server-side. |
| AP-C3 / DT-C7 | MEDIA | `limit=500` hardcoded en clientes | Mismo. |
| DT-V8 | MEDIA | CSV no incluye `customer_name` ni RFC | Decisión de producto: ¿qué columnas exportar? |

## 5. Pendientes de backend / BD

| ID | Severidad | Descripción |
|---|---|---|
| D2 / AP-V5 | ALTA | `pos_sales` vs `sales` vs `volvix_ventas` — 3 tablas para el mismo concepto |
| D4 / AP-C6 | ALTA | `customers` vs `pos_customers` — 2 tablas duales |
| T2 | ALTA | `pdf-export.js` lee de `sales`, API escribe en `pos_sales` |

Estos requieren migración formal con ADR aprobado antes de tocar.

---

## 6. paneldecontrol.html

Los contratos `pdc-*.spec.md` son **Tier 2 STUBS** sin detalle de bugs específicos. Lo que se reparó en sesiones previas:

| Fix | Verificado |
|---|---|
| `_pdcNormalizeRole()` agregado | ✅ |
| `getCurrentRole()` usa normalizer | ✅ |
| `isPlatformOwner()` usa normalizer | ✅ |
| XSS en `e.message`, versions table, overrides list | ✅ |
| Welcome banner: escape de `&` agregado | ✅ |
| `tryMount` con max retries (30) | ✅ |
| `PERM.init()` idempotente (`this._initialized`) | ✅ |
| `toggleModule`/`toggleFeature` con `await` | ✅ |
| Radio buttons con `if(window.PERM)` guard | ✅ |

No se detectaron nuevas violaciones de constitución en esta auditoría.

---

## 7. Próximos pasos sugeridos

1. **Crear ADRs** en `.specify/decisions/` para los refactors estructurales pendientes (SALES/CUSTOMERS → objetos).
2. **Test E2E con Playwright** del flujo `cobro-end-to-end.md` (especialmente CK7.1–CK7.6 y CK8.1–CK8.4).
3. **Migración de BD**: unificar `pos_sales`+`sales`+`volvix_ventas` (ADR primero).
4. **Promover los stubs PDC** a Tier 1 con análisis estático específico.

---

> Generado por agente Claude bajo el régimen SDD.
> Próxima auditoría sugerida: tras siguiente push significativo o en 7 días.
