# Contrato Tier 1: Screen `ventas`
> Generado por Wave 2A · 2026-05-15 · SalvadoreX SDD

---

## 1. Identidad

| Campo | Valor |
|---|---|
| `showScreen()` key | `ventas` |
| `section#id` en HTML | `screen-ventas` |
| Archivo | `public/salvadorex-pos.html` |
| Título visible | "Historial de ventas y devoluciones" |
| Rol mínimo requerido | `cashier` (lectura + devolver), `manager` (exportar, filtrar) |
| Módulo habilitador | implícito (siempre habilitado para roles con acceso a POS) |
| Parent módulo | `mod_pos` (system-map nodo `screen_pos_ventas`) |
| Acceso secundario | Botón "Ventas y devoluciones del día" en bottombar POS (`onclick="showScreen('ventas')"`) |

---

## 2. Responsabilidades

1. **Historial de transacciones** — lista paginada (hasta 200 en memoria) de ventas procesadas con ticket/folio, fecha, cliente, cajero, método de pago, total y estado (Completada/Devuelta).
2. **Buscar venta específica** — modal `r10aOpenFindSale()` (búsqueda por monto, fecha, últimos 4 dígitos de tarjeta, nombre/teléfono de cliente) via endpoint `GET /api/sales/search`.
3. **Filtrar por rango de fechas** — `openHistorialDateFilter()` persiste filtro en `sessionStorage` (`vlx:hist:from`, `vlx:hist:to`).
4. **Exportar a CSV** — `exportHistorialCSV()` llama `GET /api/sales?limit=1000` con filtros de fecha activos.
5. **Iniciar devolución** — botón "↩️ Devolver" por fila (solo ventas con `status='completed'`) invoca `startDevolucionFromSale(saleId)` que delega a `screen-devoluciones` prefillando el wizard.
6. **Reimprimir último ticket** — accesible desde el bottombar del POS (`reimprimirUltimoTicket()`), no desde la tabla de historial directamente.

---

## 3. UI Principal

### Estructura HTML (líneas 4648–4670)
```
section#screen-ventas.screen-pad.hidden
  └─ .page-head
       ├─ h1 "Historial de ventas y devoluciones" + p.page-sub "Últimas ventas procesadas"
       └─ .btn-row
            ├─ button.btn.primary [onclick=r10aOpenFindSale()] "Buscar venta"
            ├─ button.btn [onclick=openHistorialDateFilter()] "📅 Filtrar fecha"
            └─ button.btn [onclick=exportHistorialCSV()] "📤 Exportar"
  └─ .card > .tbl-wrap > table.tbl
       └─ thead: Ticket | Fecha | Cliente | Cajero | Pago | Total | Estado | (acciones)
       └─ tbody#vnt-body [renderizado por renderVentas()]
```

### Columnas renderizadas (`renderVentas()`, línea 11108)
| Índice SALES | Columna visual | Tipo |
|---|---|---|
| `s[0]` | Ticket (folio) | monospace bold, escapado con `htmlEsc()` |
| `s[1]` | Fecha | texto gris 11px, escapado |
| `s[2]` | Cliente | texto primary, escapado |
| `s[3]` | Cajero | texto gris, escapado |
| `s[4]` | Pago (método) | chip, escapado |
| `s[5]` | Total ($) | número bold `fmt()` |
| `s[6]` | Estado | chip `ok` (Completada) o `warn` (Devuelta) |

### Botones de acción por fila
- `btn.sm "👁️"` — sin handler definido (GAP: botón visible sin acción).
- `btn.sm "↩️ Devolver"` — solo si `s[6]==='completed'` → `startDevolucionFromSale(sIdAttr)`.

---

## 4. Estado en Memoria

| Variable | Scope | Descripción |
|---|---|---|
| `SALES` | global `let` | Array de arrays posicionales [folio, fecha, cliente, cajero, metodo_pago, total, status] |
| `sessionStorage['vlx:hist:from']` | sessionStorage | Filtro de fecha inicio (YYYY-MM-DD) |
| `sessionStorage['vlx:hist:to']` | sessionStorage | Filtro de fecha fin (YYYY-MM-DD) |

### Fuentes de llenado de `SALES`:
1. **DataLoader principal** (`VolvixDataLoader.loadAll()`, línea 7485): `GET /api/sales?limit=200` → mapea `s.folio|s.id, s.created_at|s.fecha, s.customer_name|s.cliente, s.cashier|s.cajero, s.payment_method|s.metodo, s.total, s.status`.
2. **Path alternativo de reconexión** (línea 7867): `GET /api/sales?tenant_id=X` → misma estructura de mapeo.
3. **Custom event** `volvix:sales-loaded` disparado después de carga exitosa.
4. **Recarga por filtro de fecha**: evento `vlx:historial:filter` → `showScreen('ventas')` (reinicia la pantalla, no recarga SALES del server directamente — GAP: el filtro solo aplica en export, no en la tabla en memoria).

---

## 5. Endpoints API

| Método | Endpoint | Cuándo | Notas |
|---|---|---|---|
| `GET` | `/api/sales?limit=200` | Boot (DataLoader) | Devuelve `{ sales: [...] }` o array directo |
| `GET` | `/api/sales?tenant_id=X` | Reconexión SSO | Path secundario |
| `GET` | `/api/sales?limit=1000[&from=X&to=Y]` | `exportHistorialCSV()` | Respeta filtros de sessionStorage |
| `GET` | `/api/sales?limit=1` | `reimprimirUltimoTicket()` | Obtiene la venta más reciente |
| `GET` | `/api/sales/:id` | `r10aShowSaleDetail()` | Detalle completo de una venta con items |
| `GET` | `/api/sales/search?...` | `r10aDoFindSale()` | Query: `approximate, total_min, total_max, date_from, date_to, card_last4, q` |
| `GET` | `/api/sales/:id` | Reimpresión | Recupera sale completo para generar vista previa |
| `POST` | `/api/sales/:id/print-history` | Audit de impresión | Loguea evento `reprint` |
| `GET` | `/api/sales/:id/reprint` | `reprintSale()` en R8c modal | Reimpresión con marca COPIA |
| `POST` | `/api/sales/:id/invoice-late` | `invoiceLate()` en R8c modal | CFDI tardío para venta ya cerrada |

### Tablas Supabase involucradas (schema-truth)
- Primaria: `pos_sales` (24x API) — `id, tenant_id, user_id, customer_id, total, status ('paid'|'cancelled'|'pending'), payment_method, cancel_reason, canceled_at, cut_id, printed_at, created_at`
- Ambigua: `sales` (pdf-export.js), `volvix_ventas` (migraciones) — Deuda D2 schema-truth (ALTA)
- Auditoría: `volvix_audit_log` — logs de reimpresión y búsqueda manual
- Print queue: `print-queue` endpoint (hardware térmico)

---

## 6. Flujo Principal

### 6a. Carga inicial
```
showScreen('ventas')
  └─ [SALES ya lleno por DataLoader] → renderVentas() → pinta #vnt-body
  └─ [SALES vacío] → tabla vacía
       └─ VolvixDataLoader dispara GET /api/sales?limit=200
            └─ OK → SALES.push(...) → renderVentas()
            └─ ERROR → console.warn, tabla vacía sin feedback al usuario
```

### 6b. Buscar venta (r10aOpenFindSale)
```
[Usuario: Buscar venta]
  └─ r10aOpenFindSale() → abre modal genérico r10aShowModal
       └─ Formulario: monto, tolerancia($5 default), fecha(hoy), últimos 4 tarjeta, nombre cliente
       └─ [Buscar] → r10aDoFindSale()
            └─ Construye QS: ?approximate=true&limit=20[&total_min&total_max&date_from&date_to&card_last4&q]
            └─ GET /api/sales/search + QS
                 ├─ items.length > 0 → tabla de resultados con botón "Ver" por fila
                 │    └─ [Ver] → r10aShowSaleDetail(saleId)
                 │         └─ GET /api/sales/:id
                 │              └─ Modal con detalle: items, totales, método pago, acciones
                 └─ items.length = 0 → mensaje amarillo "No tengo registro de esa venta. Llama al gerente."
```

### 6c. Devolver desde historial
```
[Usuario: ↩️ Devolver en fila completed]
  └─ startDevolucionFromSale(saleId)
       └─ showScreen('devoluciones')
       └─ Poll cada 50ms (max 1.5s): espera que screen-devoluciones sea visible
            └─ openNewReturnModal()
            └─ Poll cada 50ms: espera #nr-search-input
                 └─ input.value = saleId
                 └─ dispatchEvent('input') → newReturnSearchSales()
```

### 6d. Filtrar por fecha
```
[Usuario: 📅 Filtrar fecha]
  └─ openHistorialDateFilter() → modal inline con inputs date from/to
       └─ [Aplicar] → applyHistorialFilter()
            └─ sessionStorage['vlx:hist:from'] = from
            └─ sessionStorage['vlx:hist:to'] = to
            └─ dispatchEvent('vlx:historial:filter') (ningún listener activo sobre SALES)
            └─ showScreen('ventas') → re-render con SALES en memoria (SIN filtro aplicado a los datos)
```

### 6e. Exportar CSV
```
[Usuario: 📤 Exportar]
  └─ exportHistorialCSV()
       └─ Lee sessionStorage filtros
       └─ GET /api/sales?limit=1000[&from&to]
       └─ Descarga CSV: id, fecha, total, metodo, items(count), cajero
```

---

## 7. Invariantes

1. `SALES` SIEMPRE es un array de arrays de 7 elementos. `renderVentas()` accede por índice `s[0]..s[6]` — reordenamiento rompe display.
2. El botón "↩️ Devolver" SOLO aparece si `s[6] === 'completed'`. Ventas con status `'devuelta'` o `'cancelled'` no tienen botón de devolución.
3. `htmlEsc()` DEBE aplicarse a todos los campos antes de insertar en innerHTML (fix N2 adversarial: previene XSS via sale_id o customer_name maliciosos).
4. `startDevolucionFromSale()` es idempotente en el saleId — si el modal no abre en 1.5s, aborta con `console.warn` sin crash.
5. El filtro de fechas de `openHistorialDateFilter()` persiste en `sessionStorage`, NO en localStorage — se pierde al cerrar pestaña. Solo afecta el export CSV, no la tabla en pantalla.

---

## 8. Anti-Patrones Conocidos

| # | Anti-patrón | Severidad | Descripción |
|---|---|---|---|
| AP-V1 | Botón "👁️" sin handler | MEDIA | `renderVentas()` genera botón de detalle sin onclick. No abre nada. |
| AP-V2 | Filtro de fecha no filtra la tabla en memoria | ALTA | `applyHistorialFilter()` guarda filtro y re-renderiza `SALES` sin filtrar — la tabla sigue mostrando las 200 ventas originales. Solo el export CSV respeta el filtro. |
| AP-V3 | `SALES` array posicional frágil | ALTA | Misma deuda que CUSTOMERS — índices posicionales en lugar de campos nombrados. |
| AP-V4 | Sin feedback de error al cargar ventas | MEDIA | DataLoader captura la excepción con `console.warn` pero no muestra toast ni placeholder en la UI. |
| AP-V5 | Tres tablas para ventas (D2) | ALTA | `pos_sales` (API principal), `sales` (pdf-export), `volvix_ventas` (migraciones) — RLS y datos pueden divergir. |
| AP-V6 | Polling con setInterval frágil en `startDevolucionFromSale` | BAJA | 30 intentos × 50ms = 1.5s máximo. En dispositivos lentos o con conexión lenta puede fallar silenciosamente. |
| AP-V7 | `GET /api/sales?limit=200` fijo | MEDIA | Tenants con >200 ventas recientes no las ven todas en pantalla. |

---

## 9. Deudas Técnicas

| ID | Descripción | Origen |
|---|---|---|
| DT-V1 | Botón "👁️" sin funcionalidad de detalle de venta | Código no implementado |
| DT-V2 | Filtro de fecha debe filtrar la tabla en memoria (no solo el export) | Bug AP-V2 |
| DT-V3 | Unificar `pos_sales` + `sales` + `volvix_ventas` | schema-truth D2 (severidad ALTA) |
| DT-V4 | Migrar `SALES` de array posicional a array de objetos | Fragilidad estructural |
| DT-V5 | Paginación server-side para historial (limit 200 es arbitrario) | Escalabilidad |
| DT-V6 | Toast de error cuando `GET /api/sales` falla | UX gap |
| DT-V7 | Reemplazar polling con Promise/MutationObserver en `startDevolucionFromSale` | Fragilidad de setTimeout |
| DT-V8 | El CSV no incluye `customer_name` ni RFC — incompleto para contabilidad | Funcionalidad faltante |

---

## 10. Checklist R9

- [x] Bloque HTML `section#screen-ventas` identificado y analizado
- [x] Funciones JS principales documentadas (`renderVentas`, `r10aOpenFindSale`, `r10aDoFindSale`, `r10aShowSaleDetail`, `openHistorialDateFilter`, `exportHistorialCSV`, `startDevolucionFromSale`)
- [x] Array global `SALES` — estructura y fuentes de llenado documentadas
- [x] Endpoints API listados con método, path y parámetros
- [x] Tablas Supabase mapeadas (`pos_sales`, `sales`, `volvix_ventas`)
- [x] Flujos principales documentados (6a-6e)
- [x] Invariantes definidas (5)
- [x] Anti-patrones identificados (7)
- [x] Deudas técnicas registradas (8)
- [ ] Validación en producción (pendiente — análisis estático únicamente)
- [ ] Test E2E cubriendo: cargar historial, buscar venta por monto, devolver venta, exportar CSV

---

> Tier 1 · Wave 2A · 2026-05-15 · Generado por agente Wave 2A (SalvadoreX SDD)
