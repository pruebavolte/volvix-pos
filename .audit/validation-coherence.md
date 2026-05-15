# Validación Wave 3.5 — Coherencia bidireccional

> Generado por Wave 3 Agent · 2026-05-15
> Metodología: Para cada screen Tier 1, se cruzan los endpoints que declara consumir contra los contratos en `.specify/contracts/endpoints/`. Se verifica si el contrato del endpoint menciona de vuelta a la screen como consumidor.

---

## Endpoints con contrato existente

| Archivo contrato | Endpoint clave |
|---|---|
| `GET-api-app-config.spec.md` | `GET /api/app/config` |
| `GET-api-owner-low-stock.spec.md` | `GET /api/owner/low-stock` |
| `GET-api-users-me.spec.md` | `GET /api/users/me` |
| `GET-api-pos-app-orders.spec.md` | `GET /api/pos/app-orders` |
| `POST-api-log-client.spec.md` | `POST /api/log/client` |
| `GET-api-admin-tenants.spec.md` | `GET /api/admin/tenants` |
| `GET-POST-api-admin-tenant.spec.md` | `GET|POST /api/admin/tenant/:id/*` |
| `GET-api-admin-giros.spec.md` | `GET /api/admin/giros` |

**Total contratos de endpoint: 8**

---

## Resultados por screen

### pos

Endpoints declarados en `pos.spec.md` (sección 6, "Endpoints API que consume"):

| Endpoint | ¿Contrato existe? | ¿Menciona pos como consumidor? |
|---|---|---|
| `GET /api/products?limit=2000` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/productos?...` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/owner/products/lookup` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/customers?limit=500` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/giro/config` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales?limit=1` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales/{id}` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/sales` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/sales/{id}/print-history` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/printer/raw` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/drawer/log` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/drawer/manual-open` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/search/log` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/audit/manual-search` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cart/draft` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cart/draft/clear` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/pos/app-orders` | ✓ `GET-api-pos-app-orders.spec.md` | ✓ Menciona POS (línea 2539) |
| `GET /api/print-log/paper-status` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/print-queue` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales/pending` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/sales/pending/{id}` | ⚠️ No hay contrato | ❌ N/A |

**Resumen pos:**
- Total endpoints declarados: 21
- Con contrato de endpoint: 1 (`/api/pos/app-orders`)
- Contrato menciona pos como consumidor: 1 ✓
- Sin contrato: 20 ⚠️

---

### corte

Endpoints declarados en `corte.spec.md` (sección 5, "Endpoints"):

| Endpoint | ¿Contrato existe? | ¿Menciona corte como consumidor? |
|---|---|---|
| `POST /api/cuts/open` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/cuts/{id}/summary` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/cuts/{id}/check-pending` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/cuts/{id}/adjustments` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cuts/{id}/adjustment` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cuts/{id}/adjustment/{adjId}/approve` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cuts/{id}/adjustment/{adjId}/reject` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cuts/{id}/reopen` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/cuts/close` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/cuts` | ⚠️ No hay contrato | ❌ N/A |

**Resumen corte:**
- Total endpoints declarados: 10
- Con contrato de endpoint: 0
- Contrato menciona corte: 0 ✓
- Sin contrato: 10 ⚠️

---

### inventario

Endpoints declarados en `inventario.spec.md` (sección 5, "Endpoints"):

| Endpoint | ¿Contrato existe? | ¿Menciona inventario como consumidor? |
|---|---|---|
| `GET /api/products?tenant_id={tid}` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/products?search={q}` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/products` | ⚠️ No hay contrato | ❌ N/A |
| `PATCH /api/products/{id}` | ⚠️ No hay contrato | ❌ N/A |
| `DELETE /api/products/{id}` | ⚠️ No hay contrato | ❌ N/A |
| `DELETE /api/products?code={code}` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/products/import` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/products/next-barcode` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/products/check-barcode` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/products/seed-from-giro` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory/dedupe` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/inventory-movements` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory-movements` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory/bulk-adjust` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/inventory/alerts` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory-counts/start` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/inventory-counts/{id}/lines` | ⚠️ No hay contrato | ❌ N/A |
| `PATCH /api/inventory-counts/{id}/lines` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory-counts/{id}/pause` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/inventory-counts/{id}/resume` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/admin/tenants` | ✓ `GET-api-admin-tenants.spec.md` | ⚠️ Menciona POS (line 3606) pero no inventario explícitamente — mismo archivo HTML, contexto superadmin |

**Resumen inventario:**
- Total endpoints declarados: 21
- Con contrato de endpoint: 1 (`/api/admin/tenants`)
- Contrato menciona inventario como consumidor: ⚠️ Solo referencia indirecta (POS superadmin — mismo archivo)
- Sin contrato: 20 ⚠️

---

### clientes

Endpoints declarados en `clientes.spec.md` (sección 5, "Endpoints API"):

| Endpoint | ¿Contrato existe? | ¿Menciona clientes como consumidor? |
|---|---|---|
| `GET /api/customers?limit=500` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/customers?tenant_id=X` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/customers?search=Q` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/customers` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/customers` | ⚠️ No hay contrato | ❌ N/A |

**Resumen clientes:**
- Total endpoints declarados: 5
- Con contrato de endpoint: 0
- Sin contrato: 5 ⚠️

---

### ventas

Endpoints declarados en `ventas.spec.md` (sección 5, "Endpoints API"):

| Endpoint | ¿Contrato existe? | ¿Menciona ventas como consumidor? |
|---|---|---|
| `GET /api/sales?limit=200` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales?tenant_id=X` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales?limit=1000` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales?limit=1` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales/:id` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales/search?...` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/sales/:id/print-history` | ⚠️ No hay contrato | ❌ N/A |
| `GET /api/sales/:id/reprint` | ⚠️ No hay contrato | ❌ N/A |
| `POST /api/sales/:id/invoice-late` | ⚠️ No hay contrato | ❌ N/A |

**Resumen ventas:**
- Total endpoints declarados: 9
- Con contrato de endpoint: 0
- Sin contrato: 9 ⚠️

---

## Score de coherencia

| Screen | Total endpoints | Con contrato | Bidireccionales ✓ | Una vía ⚠️ | Sin contrato ❌ |
|---|---|---|---|---|---|
| pos | 21 | 1 | 1 | 0 | 20 |
| corte | 10 | 0 | 0 | 0 | 10 |
| inventario | 21 | 1 | 0 | 1 | 20 |
| clientes | 5 | 0 | 0 | 0 | 5 |
| ventas | 9 | 0 | 0 | 0 | 9 |
| **TOTAL** | **66** | **2** | **1** | **1** | **64** |

**Score: 1/66 relaciones son plenamente bidireccionales (1.5%)**

- Total relaciones esperadas: 66
- Recíprocas ✓: 1 (`pos` ↔ `/api/pos/app-orders`)
- Una vía ⚠️: 1 (`inventario` → `/api/admin/tenants`, contrato menciona POS no inventario directamente)
- Sin contrato de endpoint ❌: 64

---

## Inconsistencias encontradas

### INC-1 (ALTA): 64 de 66 endpoints de screens Tier 1 no tienen contrato de endpoint
Las 5 screens Tier 1 más importantes del sistema declaran 66 llamadas API en total. Solo 2 de esas llamadas tienen un contrato de endpoint correspondiente en `.specify/contracts/endpoints/`. El 97% de las relaciones screen→endpoint están **indocumentadas**.

Endpoints críticos sin contrato:
- `POST /api/sales` — el endpoint más crítico del sistema (cobro de ventas)
- `GET|POST /api/products` y familia — catálogo completo (21 variantes sin contrato)
- `GET|POST /api/customers` — CRM clientes
- Toda la familia `/api/cuts/*` — corte de caja (10 endpoints sin contrato)
- Toda la familia `/api/inventory-movements` y `/api/inventory-counts/*`

### INC-2 (MEDIA): Contrato de `/api/admin/tenants` menciona "POS línea 3606" pero inventario.spec.md lo usa para el tenant-switcher
El contrato del endpoint referencia `salvadorex-pos.html línea 3606` (superadmin general), pero `inventario.spec.md` lo consume específicamente para el `#inv-tenant-switcher`. La referencia es correcta en origen (mismo archivo HTML) pero el contexto de uso (screen inventario) no está documentado como consumidor separado en el contrato.

### INC-3 (BAJA): Endpoints de `/api/giro/config` y `/api/owner/products/lookup` sin contrato alguno
Estos dos endpoints son usados por `pos.spec.md` pero no existen en el directorio de contratos ni están documentados en `system-map.json`. Son endpoints de bajo conocimiento en el sistema.

### INC-4 (BAJA): system-map.json lista 121 endpoints en POS pero solo 8 tienen contrato
De los 121 endpoints detectados por el generador de system-map en `salvadorex-pos.html`, únicamente 8 tienen un contrato formal (6.6% de cobertura de contratos de endpoint).

---

## Nota metodológica
Los 8 contratos de endpoint existentes cubren principalmente los endpoints **compartidos** entre POS y PDC (el system-map reportó 8 compartidos). Los endpoints exclusivos del POS (113 en system-map) y del PDC (18) no tienen contrato alguno aún. La Wave 2B debería priorizar los endpoints de mayor tráfico/riesgo para documentar primero.
