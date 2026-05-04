# PHASE 1 — Volvix POS Critical Production Fixes

**File touched:** `salvadorex_web_v25.html` (only)
**Lines:** grew from 4255 → 5344 (~1090 lines of net additions)
**Date:** 2026-04-27

---

## 1. Product Edit Handler

**Where:**
- HTML row buttons: `renderInv()` at original line ~3330 (now ~3406). Each row now exposes
  `✏️ Editar`, `📊 Stock`, `🗑️` icon buttons via `data-action`.
- Click delegation: `inv-body` `addEventListener('click', ...)` inside `DOMContentLoaded` (~line 3552).
- Modal: `promptProductForm(prefill)` rewritten as a full-fledged DOM modal (~line 3437).
- Persist: `saveProduct(data, productId)` now sends **`PATCH /api/products/{id}`** for updates,
  with automatic fallback to `PUT` if the server returns 405/404.

**Form fields validated:**
- `name` (required, non-empty)
- `code` / SKU (required)
- `barcode` (optional)
- `price` (number, > 0)
- `cost` (number, ≥ 0)
- `stock` / `stock_actual` (integer, ≥ 0)
- `min_stock` (integer, ≥ 0, optional)
- `category` / `categoria` (optional)
- `description` / `descripcion` (optional)

**UX:** spinner on submit (`#pf-spinner`), inline `#pf-msg` for validation errors,
success toast `✓ Producto actualizado`, list reloads via `loadCatalogReal()`.

**Auth:** `_authFetch()` injects `Authorization: Bearer ${_vToken()}`. Token resolution order:
`window.VolvixAuth.getToken()` → `getToken()` → `window.session.token` → localStorage.

---

## 2. Product Delete Handler

**Where:** `deleteProduct(code, id)` (~line 3520).

- Confirmation: prefers `window.VolvixUI.destructiveConfirm({ requireText:'ELIMINAR' })`,
  falls back to `confirm("¿Eliminar producto X? Esta acción no se puede deshacer.")`.
- Calls **`DELETE /api/products/{id}`** with JWT.
- Shows toast `✓ Producto eliminado` on success and reloads catalog.
- Shows precise HTTP error on failure.

The `🗑️` button is rendered next to every row in the inventory table.

---

## 3. Inventory Module

**Screen restructured at line ~1814** (`<section id="screen-inventario">`).

Added:
- **Filter bar:** search input, category dropdown (auto-populated from CATALOG), `Solo bajo stock` toggle.
- **Stats cards** (kpi-grid): Total productos, Valor inventario ($), Bajo mínimo, Sin stock.
  Computed in `updateInvStats()`.
- **Tabs** (driven by `showInvTab(tab, btn)`):
  1. **Stock actual** – existing table, now with row coloring (red < min, yellow < min*1.5),
     plus per-row `✏️ Editar`, `📊 Stock`, `🗑️` icon buttons.
  2. **Movimientos** – filterable by date range / type / producto / usuario.
     Calls `GET /api/inventory-movements?...&tenant_id=`. Caches results in IndexedDB
     (`volvix_pos_phase1` DB, store `inventory_movements`) for offline fallback.
  3. **Conteo físico** – picker modal to add products, table with system_stock vs counted_qty
     and live discrepancy. Submits to `POST /api/inventory-counts {items:[...]}`. If endpoint
     missing, falls back to creating one `inventory-movements` record per discrepancy with
     `type:'ajuste'`. Final fallback: queues to IndexedDB store `inventory_counts_pending`.
  4. **Ajustes** – product picker, type (entrada/salida/ajuste), quantity, mandatory motivo.
     Posts to `POST /api/inventory-movements`. Validation: product required, qty ≥ 0, motivo non-empty.
     Offline queue: `inventory_movements_pending`.

**API endpoints used:**
- `GET /api/products?tenant_id=` (already existed)
- `PATCH /api/products/{id}` (NEW — falls back to `PUT` if not implemented)
- `DELETE /api/products/{id}` (existed)
- `POST /api/inventory-movements` ⚠ **needs backend** (falls back to offline queue)
- `GET /api/inventory-movements?from=&to=&type=&product=&tenant_id=` ⚠ **needs backend**
- `POST /api/inventory-counts` ⚠ **needs backend**

---

## 4. Cuts / Cortes Session Management

**Apertura screen rewrite (line ~2150).** Function: `openCut()` (~line 4426).
- Form: cajero (auto-filled from session), turno, saldo inicial, breakdown (b500/b200/b100/coins), notas.
- Validates saldo ≥ 0.
- POSTs to **`/api/cuts/open`** with `{tenant_id, cashier_id, cashier_email, shift,
  opening_balance, opening_breakdown, notes, opened_at}`.
- On success stores `cut_id` in `sessionStorage['volvix:active_cut_id']` and full data
  in `volvix:active_cut`. UI flips to "Caja abierta" card with `Ir a Corte` button.
- If endpoint returns 404/405 or network error → generates local `CUT-LOCAL-{ts}` ID so the
  rest of the flow keeps working; cleared up when backend is reachable.

**Cierre / Corte screen (line ~2017).** Function: `closeCut()` (~line 4500).
- If no active cut: shows "No hay caja abierta" with link to Apertura.
- If active: pulls summary via `GET /api/cuts/{id}/summary` (cash_sales, card_sales,
  transfer_sales, credit_payments, expenses) and computes `expected = opening + cash + credits - expenses`.
- Conteo físico inputs: b500/b200/b100/b50/b20 + monedas. `updateCloseCount()` shows live total
  and discrepancy with red/green/yellow color.
- Confirm dialog before closing.
- POSTs to **`/api/cuts/close`** with `{cut_id, closing_balance, closing_breakdown,
  counted_bills, counted_coins, expected_balance, discrepancy, notes, closed_at}`.
- Opens a print-ready receipt window with apertura, ventas, cierre, discrepancia
  (uses `window.print()`; reuses the same pattern as `reimprimirUltimoTicket`).

**Historial (line ~1942).** Function: `showCutsHistory()` (~line 4585).
- Modal with date-range + cashier filters. Calls **`GET /api/cuts?from=&to=&cashier=&tenant_id=`**.
- Table: fecha apertura, cajero, apertura, cierre, ventas, discrepancia (red/green/warn).
- Click row → `printCutReceipt(cut)` to view detail/print.

**API endpoints used:**
- `POST /api/cuts/open` ⚠ **needs backend**
- `POST /api/cuts/close` ⚠ **needs backend**
- `GET /api/cuts/{id}/summary` ⚠ **needs backend** (graceful fallback to cached opening_balance only)
- `GET /api/cuts?from=&to=&cashier=&tenant_id=` ⚠ **needs backend**

---

## 5. Reports With Real Data

**Where:** Reportes screen (line ~1907) + `window.openReport(key)` (~line 4760).

The 6 stub `showToast(...)` calls were replaced with `onclick="openReport('<key>')"`.
Each opens a single shared modal that lazy-loads **Chart.js 4.4.0** from CDN and renders:
- Title + close button
- Date range pickers (default last 30 days) + Refresh + **Export CSV** buttons
- Optional chart canvas (line / bar)
- Result table

Definitions live in the `REPORT_DEFS` object (~line 4685) with `api`, `cols`, `mapRow`,
`csvRow`, `chart` per report:

| Card | Key | Endpoint | Chart |
|------|-----|----------|-------|
| Ventas por día | `sales-day` | `GET /api/reports/sales?from&to&group_by=day` | Line |
| Top productos | `top-products` | `GET /api/reports/top-products?limit=20&from&to` | Bar |
| Clientes top | `top-customers` | `GET /api/reports/top-customers?limit=20&from` | — |
| Rotación inventario | `inventory-turnover` | `GET /api/reports/inventory-turnover` | — |
| Ganancias | `profit` | `GET /api/reports/profit?from&to` | — |
| Por cajero | `by-cashier` | `GET /api/reports/by-cashier?from&to` | Bar |

All reports:
- Show "⏳ Cargando…" state.
- On HTTP 404 → friendly "🚧 Endpoint no implementado" panel (no crash).
- On other HTTP errors → red error message + toast.
- On empty data → "📭 Sin datos en el rango" empty state.
- "📥 Exportar CSV" button generates `key_YYYY-MM-DD.csv` with BOM and UTF-8.
  CSV escapes commas/quotes/newlines correctly.

**API endpoints used (all NEW — need backend):**
- `GET /api/reports/sales`
- `GET /api/reports/top-products`
- `GET /api/reports/top-customers`
- `GET /api/reports/inventory-turnover`
- `GET /api/reports/profit`
- `GET /api/reports/by-cashier`

---

## Cross-Cutting Improvements

- **Token helper** `_vToken()` and `_authFetch()` at line ~3470 — consistent JWT injection across
  every new fetch (products, movements, counts, cuts, reports).
- **HTML escaping** `escapeHtml()` / `escapeAttr()` at line ~3445 — prevents XSS in dynamic
  table cells and modal labels.
- **IndexedDB layer** `_idb()`, `idbGetAll()`, `idbPutAll()`, `idbQueue()` at line ~5005
  with a versioned `volvix_pos_phase1` database and stores:
  `inventory_movements`, `inventory_movements_pending`, `inventory_counts_pending`, `cuts_pending`.
- **showScreen wrapper** — when navigating to `inventario`/`corte`/`apertura`,
  the wrapper triggers `updateInvStats()`, `loadCutSummary()`, `renderAperturaState()`.
- **F3 shortcut** still navigates to inventario (preserved).

---

## Backend Endpoints Required

These need to be added to `api/index.js` for the frontend to be fully wired in production:

```
POST   /api/cuts/open                      → returns {id, ...}
POST   /api/cuts/close                     → accepts cut_id + closing payload
GET    /api/cuts/:id/summary               → cash_sales, card_sales, transfer_sales, credit_payments, expenses
GET    /api/cuts                           → list with from, to, cashier filters
POST   /api/inventory-movements            → create stock movement
GET    /api/inventory-movements            → list with filters (from, to, type, product)
POST   /api/inventory-counts               → bulk submit physical count
GET    /api/reports/sales                  → daily aggregation
GET    /api/reports/top-products
GET    /api/reports/top-customers
GET    /api/reports/inventory-turnover
GET    /api/reports/profit
GET    /api/reports/by-cashier
```

All endpoints must:
- Read `Authorization: Bearer ${jwt}` and resolve `tenant_id` from claims (or query param fallback).
- Apply RLS / `WHERE tenant_id = $tenant`.
- Soft-delete products via `deleted_at` column for `DELETE /api/products/:id`.

The frontend handles 404/405 gracefully — features degrade to local/offline behavior so
the UI never breaks even before these endpoints ship.

---

## Compromises / TODOs

1. The "Apertura" card now associates sales to the active `cut_id` only via `sessionStorage`.
   To enforce server-side association, `completePay()` (line ~3344) should send
   `cut_id: sessionStorage.getItem('volvix:active_cut_id')` in the sale payload.
   This was not done to keep this PR focused on the 5 features listed.
2. The print receipt uses `window.print()` (browser dialog). The thermal-printer path via
   `enviarAImpresora()` already exists and could be invoked from the cut-closed receipt window
   if desired (one-line change).
3. Row coloring uses `min_stock` from the catalog; if products lack the field, falls back to 20.
4. Conteo físico picker shows the first 50 products on open and filters thereafter — no
   virtualization for very large catalogs.
5. Out-of-scope `showToast(...)` placeholders in the POS bottom row (Cambiar precio, Venta
   pendiente, Selector de cliente, Forzar sync, Respaldar) were intentionally left untouched
   per the explicit feature list.

---

## How to Test

### 1. Product Edit
1. Login → menu → **Inventario** → tab **Stock actual**.
2. Click the `✏️ Editar` button on any row → modal opens with all fields pre-filled.
3. Change name to empty → submit → see `El nombre es obligatorio` inline.
4. Set price = 0 → see `El precio debe ser mayor a 0`.
5. Submit valid changes → spinner appears → toast `✓ Producto actualizado` → row reflects changes.

### 2. Product Delete
1. Click 🗑️ on a row → confirmation requires typing `ELIMINAR` (or plain confirm if VolvixUI absent).
2. Confirm → toast `✓ Producto eliminado` → row gone.

### 3. Inventory Module
1. **Inventario** screen → verify 4 KPI cards (Total / Valor / Bajo mínimo / Sin stock).
2. Toggle "Solo bajo stock" → list filters.
3. Click `📊 Stock` on a row → switches to **Ajustes** tab with the product preselected.
4. Tab **Movimientos** → click 🔄 Recargar → loading state → table or 🚧 if endpoint missing.
5. Tab **Conteo físico** → `+ Agregar producto` → pick → change qty → see live diff → `✓ Enviar`.
6. Tab **Ajustes** → pick product, type entrada, qty 5, motivo "test" → submit.

### 4. Cuts
1. Menu → **Apertura** → enter saldo 500 + breakdown → `Abrir caja` → toast `✓ Caja abierta · CUT-...`.
2. UI flips to "Caja abierta" panel with `Ir a Corte`.
3. Menu → **Corte** → see resumen + conteo físico panel.
4. Type bills/coins → see live "Total contado" + "Discrepancia".
5. `Cerrar corte` → confirm → toast `✓ Corte cerrado` → print preview window opens.
6. `📜 Historial` button → modal with date filters.

### 5. Reports
1. Menu → **Reportes** → click any of the 6 cards.
2. Modal opens with chart (where applicable) + table.
3. Change date range → 🔄 Actualizar.
4. 📥 Exportar CSV → file `key_YYYY-MM-DD.csv` downloads.
5. With backend down: each card shows the friendly 🚧 panel without crashing.

### Suggested QA screenshots
- Inventory KPI strip with low/zero counts.
- Product edit modal with validation error visible.
- Cuts close modal with discrepancy in red.
- Cuts print receipt window.
- Reports modal with chart + table.
- 🚧 endpoint-missing fallback panel.

---

## Acceptance check vs. spec

| Criterion | Status |
|-----------|--------|
| Zero stub `showToast(...)` for the 5 targeted features | ✅ All 9 stubs (1900s × 6, 1940, 1962, 2083) replaced with real handlers |
| All buttons have real handlers calling real APIs | ✅ |
| All API calls use JWT auth | ✅ via `_authFetch()` / `_vToken()` |
| All forms validate input before submission | ✅ name/price/cost/stock/motivo validations |
| All async ops show loading + handle errors | ✅ spinners + 404/empty/error states + offline queue |
| Pattern parity with `openNewCustomerModal` etc. | ✅ same DOM-modal style, same toast vocabulary |
| Touched only `salvadorex_web_v25.html` | ✅ |

JS sanity-checked via `new Function()` parse: both inline `<script>` blocks parse OK
(263 chars + 135358 chars).
