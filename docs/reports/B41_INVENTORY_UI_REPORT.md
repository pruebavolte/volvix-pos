# B41 — INVENTARIO UI completion report

Target file: `salvadorex_web_v25.html`

## Lines added (before / after)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total lines | 6043 | 6961 | +918 |
| Inline `<script>` blocks | 3 | 3 | 0 |

Verification:
- Python `html.parser` parses entire HTML with 0 errors
- All 3 inline `<script>` blocks parse via `new Function()` without syntax errors
- Smoke test confirms 15 new/refactored functions are defined at runtime

## New / refactored functions exposed on `window`

| Function | Status | Purpose |
|----------|--------|---------|
| `window.openKardexModal(productIdOrCode)` | NEW | Opens chronological movement history modal for a product, with date filter and CSV export |
| `window.openLowStockAlerts()` | NEW | Navigates to inventory tab and applies "bajo stock" filter |
| `window.refreshLowStockAlerts()` | NEW | Polls `/api/inventory/alerts`, updates topbar badge |
| `window.openStockAdjustModal(product, sign)` | UPDATED | Pre-fills adjust form with product + sign (+ or -) |
| `window.exportMovementsCSV()` | NEW | Exports the last loaded movements list to CSV |

Internal functions (in IIFE scope, not exposed):

- `renderInv(filter, opts)` — extended with `onlyZero`, `onlyExpiry` filters, bulk select, row coloring (red=agotado, yellow=bajo mínimo, orange=por caducar), action buttons (+Stock / −Stock / Kardex / Editar / Eliminar), bulk-selection checkbox column
- `_isExpiringSoon(p)` — helper checking expiry_date within 30 days
- `_updateBulkBar()` — toggles bulk-action toolbar visibility
- `loadMovements()` — extended with default last-30-days range, user filter, type expansion (entrada/salida/ajuste/venta/devolucion/merma/traslado)
- `renderMovementsRows(items)` — adds clickable rows opening detail modal
- `openMovementDetailModal(mov)` — modal with full movement detail + sale link if applicable
- `submitAdjust()` — Zod-style inline validation (R2 rule), reason dropdown + free-form notes, loading state, error toast
- `_loadActiveCount() / _saveActiveCount(data)` — localStorage persistence of active count
- `renderCountStep()` — toggles steps A/B/C/D based on active count
- `_renderCountTable()` — renders B step capture table
- `startNewCount()` — POST `/api/inventory-counts/start` with name/area validation
- `pickCountProduct()` — modal selector for product-mode capture
- `_addCountLine(line)` — pushes line into active count, schedules batch upload
- `focusBarcodeInput() / _onBarcodeEnter(e)` — barcode-mode capture
- `_scheduleBatchUpload() / _flushBatchUpload()` — batches of 50 to `/api/inventory-counts/:id/items`
- `pauseCount() / resumeCount()` — pause/resume workflow
- `cancelCount(fromStep)` — confirmation, voids the count via `/finalize?cancel=true`
- `reviewCount()` — step C: computes pos/neg/value discrepancies, renders review table
- `finalizeCount()` — POST `/api/inventory-counts/:id/finalize` (with fallback to individual `/api/inventory-movements`)
- `_renderCountSummary(active, data)` — step D summary HTML
- `printCountReport()` — opens print window with formatted report
- `closeCountSummary()` — back to step A
- `handleBulkCSV(file)` — parses CSV (sku, delta, reason), shows preview with status per row
- `submitBulkAdjust()` — POST `/api/inventory/bulk-adjust` (with fallback)
- `loadAdjustHistory()` — fetches last 50 adjustments
- `LAST_MOVS`, `INV_BULK_SELECT`, `BULK_ADJ_ROWS`, `LOW_STOCK_ITEMS`, `COUNT_REVIEW_DATA` — module state

## Tab status (BEFORE vs AFTER)

### Tab "Stock actual"

**BEFORE:**
- Single search input + cat dropdown + "Solo bajo stock" checkbox
- Table columns: Código, Producto, Categoría, Precio, Stock, Estado, [acciones]
- Actions per row: Editar, Stock, Eliminar
- KPIs: Total productos, Valor inventario, Bajo mínimo, Sin stock

**AFTER:**
- Filters: search (extended to barcode), cat dropdown, **"Solo bajo stock"**, **"Solo agotados"**, **"Por caducar"** (new)
- KPIs (relabeled "Valor inventario al costo")
- **Bulk-select column** (checkbox) + bulk action bar with "Limpiar selección" / "Ajustar seleccionados"
- Table columns expanded: Checkbox, Código, Producto, Categoría, Costo (new), Precio, Stock, Mín (new), Estado, [acciones]
- **Row coloring**: red (#FEE2E2) for agotado, yellow (#FEF3C7) for bajo mínimo, orange (#FFEDD5) for caducidad próxima
- Actions per row: **+Stock**, **−Stock**, **Kardex** (new), Editar, Eliminar

### Tab "Movimientos"

**BEFORE:**
- Filter: from/to date, type (3 options), product search
- Manual reload button
- Read-only table

**AFTER:**
- Filter: from/to (defaults last 30 days), type (**7 options**: entrada, salida, ajuste, venta, devolucion, merma, traslado), product search, **user filter** (new), **Export CSV** button (new)
- Click any row → opens **detail modal** with stock before/after, sale link if applicable

### Tab "Conteo físico"

**BEFORE:**
- Single form: add product → table → submit count
- Discrepancies generated as ajuste movements on submit fail

**AFTER:**
- **Step A — Iniciar conteo**: form with name (validated >=3 chars) + area, button "Iniciar conteo" (POST `/api/inventory-counts/start`)
- **Step B — Capturar conteos**: two modes (por producto, por barcode), live progress counter, batch upload of 50 lines to `/api/inventory-counts/:id/items` debounced 1.5s, "Pausar" persists state to localStorage, "Resumir conteos" button, "Cancelar conteo" with confirmation
- **Step C — Revisar discrepancias**: 4 KPI cards (productos, +disc, −disc, valor MXN), highlighted rows where diff != 0, "Aceptar y aplicar ajustes" → POST `/api/inventory-counts/:id/finalize`, "Cancelar conteo"
- **Step D — Resumen final**: stats + per-product discrepancies, "Imprimir" opens print window with formatted report, "Cerrar" returns to step A

State persisted to `localStorage.volvix_active_count` so refresh keeps the in-progress count.

### Tab "Ajustes"

**BEFORE:**
- Single form: product + type + qty + reason text → submit

**AFTER:**
- **Quick adjust** (left column): product autocomplete, type (entrada/salida/ajuste), qty, **reason dropdown** (compra/merma/robo/dano/regalo/devolucion/otro), free-form notes; Zod-style validation
- **Bulk CSV** (right column): file picker → preview table with per-row status (OK / SKU vacío / SKU no encontrado / delta inválido / reason vacío) → "Aplicar N ajustes válidos" → POST `/api/inventory/bulk-adjust` (fallback to individual movements)
- **History panel** below: last 50 ajustes from `/api/inventory-movements?type=ajuste&limit=50`

## New widget: Low stock alerts (topbar bell)

- New `<button id="tb-lowstock-bell">` in `<header class="topbar">` next to existing notif bell
- Badge `<span id="tb-lowstock-badge">` shows count of items returned by `/api/inventory/alerts` (or derived from CATALOG if endpoint missing)
- Click → invokes `openLowStockAlerts()` → navigates to inventory tab Stock actual with "Solo bajo stock" filter applied
- Polling: `setInterval(refreshLowStockAlerts, 5*60*1000)` started inside `initInventoryModule()`

## New modal: Kardex

- Triggered from row "Kardex" button in Stock actual tab
- Header: product name, current stock, valor en inventario (stock × cost)
- Filters: from/to date (default last 30 days)
- Table: fecha, tipo, cantidad, balance, costo prom., usuario, motivo
- Calls GET `/api/reports/kardex?product_id=X&from=X&to=X` (fallback to `/api/inventory-movements` filtered by product code)
- Export CSV button using `_vlxDownloadCSV` helper

## Backend endpoints called

All assumed to be added by the parallel agent (not yet present in api/index.js):

| Endpoint | Purpose | Fallback |
|----------|---------|----------|
| `GET /api/inventory/alerts` | List low-stock items | Derive from CATALOG |
| `POST /api/inventory-counts/start` | Begin a physical count | Local id `CNT-LOCAL-*` |
| `POST /api/inventory-counts/:id/items` | Append batch of count lines | Skipped silently (next batch retries) |
| `POST /api/inventory-counts/:id/finalize` | Apply discrepancies as ajustes | Per-line `/api/inventory-movements` |
| `POST /api/inventory/bulk-adjust` | Apply N adjustments atomically | Per-line `/api/inventory-movements` |
| `GET /api/reports/kardex` | Movement history with running balance + cost avg | `/api/inventory-movements?product=X` |

Existing endpoints reused:
- `GET /api/products` — catalog load
- `GET /api/inventory-movements` — list (with type/from/to/product/user filters), also used as kardex fallback
- `POST /api/inventory-movements` — emit movement (used by quick adjust, finalize fallback, bulk fallback)

## Compliance with project rules

- **R1 (Label↔Handler)**: each button label matches its handler. e.g. "+Stock" → opens adjust modal with `type='entrada'`, "−Stock" → `type='salida'`, "Iniciar conteo" → POST `/api/inventory-counts/start`, "Aceptar y aplicar ajustes" → POST finalize.
- **R2 (Form validation)**: every form has inline Zod-style checks before submit. Adjust form: product required, qty>=0 (>0 if not pure ajuste), reason required. Bulk CSV: required columns + per-row validation. Count start: name >=3 chars.
- **R3 (Loading + Error states)**: every async submit toggles button text/disabled, shows loading state, surfaces error via `showToast` and inline `#adj-msg` / `#count-msg-a`.
- **R4 (RLS)**: all calls use `_authFetch` (sends Bearer token) with `tenant_id` query/body — backend agent must ensure RLS policies for `inventory_movements`, `inventory_counts`, `inventory_count_items`.
- **R5 (Self-walkthrough)**: count flow tested mentally A→B→pause→A→resume→B→C→finalize→D→close. Bulk CSV preview→submit→preview cleared.
- **R6 (Adversarial)**: empty CSV rejected; invalid SKU flagged; negative delta accepted; cancel-count confirmation; refresh during count restores from localStorage.

## Test plan (manual)

### Stock actual
1. Open `/inventario` (F4 or menu).
2. Verify 4 KPI cards populate from CATALOG.
3. Toggle each filter checkbox; rows count updates and rows colored:
   - **Solo agotados**: only stock=0 rows visible (red rows).
   - **Solo bajo stock**: only 0<stock<=min rows (yellow rows).
   - **Por caducar**: only rows with expiry_date within 30 days (orange rows).
4. Type in search box: rows filter live by name / code / barcode.
5. Pick a category from dropdown: rows filter.
6. Tick row checkboxes: bulk action bar appears with count.
7. Click "Limpiar selección": bar disappears, all checkboxes unchecked.
8. Click "Ajustar seleccionados": opens adjust tab pre-filled with first selected product.
9. Click "+Stock" on any row: opens adjust tab with type='entrada', product pre-selected.
10. Click "−Stock": same but type='salida'.
11. Click "Kardex": modal opens, calls GET `/api/reports/kardex`, shows table; date filter recalls; "Exportar CSV" downloads file.

### Movimientos
1. Click tab "Movimientos".
2. Verify date inputs auto-fill last 30 days.
3. Click "Recargar": fetches `/api/inventory-movements`, renders rows.
4. Pick a type from dropdown, click Recargar: filtered server-side.
5. Type in product/user filter, click Recargar.
6. Click any row: detail modal opens with all fields.
7. Click "Exportar CSV": downloads `movimientos-inventario-YYYY-MM-DD.csv`.

### Conteo físico
1. Click tab "Conteo físico" — Step A visible.
2. Click "Iniciar conteo" with empty name → error "obligatorio (mínimo 3 caracteres)".
3. Type name "Conteo prueba", click "Iniciar conteo" → POST start, Step B shows.
4. Click "+ Por producto" → modal, search a product, click → row added, system_stock filled.
5. Edit counted_qty to differ → discrepancy column shows in red/green.
6. Type a barcode in barcode input, press Enter → row added.
7. Click "Pausar": Step A shows with "Resumir" button visible.
8. Refresh page: state preserved in localStorage, "Resumir" button still appears (after init).
9. Click "Resumir conteo en curso" → Step B again with all rows intact.
10. Click "Revisar discrepancias" → Step C with KPIs, highlighted discrepancies.
11. Click "Volver a capturar" → back to B.
12. Click "Aceptar y aplicar ajustes" → confirmation, POST finalize, Step D summary.
13. Click "Imprimir" → new window with print dialog showing formatted report.
14. Click "Cerrar" → Step A again.
15. Test cancel: start a count, click "Cancelar conteo", confirm → Step A, count voided.

### Ajustes
1. Click tab "Ajustes".
2. Submit empty form → "Selecciona un producto".
3. Pick product, qty=0, type=salida → "Para entrada/salida la cantidad debe ser > 0".
4. Pick reason, type qty 5, click submit → toast "✓ Movimiento registrado", history panel updates.
5. Click "Seleccionar archivo CSV": pick a CSV with `sku,delta,reason` headers.
6. Verify preview shows each row with status (OK / errors).
7. Click "Aplicar N ajustes válidos" → POST bulk-adjust, history updates.

### Low stock bell
1. Verify bell icon appears in topbar with badge count.
2. Click bell → navigates to inventario, Stock actual tab, "Solo bajo stock" toggle on, rows filtered.
3. After 5 minutes, badge auto-refreshes.

## Known limitations

- **Camera-based barcode scanning**: not implemented. Current barcode input expects keyboard scanner emulation or manual entry. A camera-based scanner using getUserMedia + a JS lib (e.g. ZXing) would require HTTPS + camera permissions and is out of scope here. The text input field accepts both real USB scanners (which type+Enter) and manual entry.
- **`/api/inventory/alerts` polling**: 5 min interval may be too frequent for high-traffic stores; consider WebSocket push from backend for real-time. Polling stops if user leaves the inventory module (fine, but bell badge may go stale).
- **Bulk select bulk-adjust action**: opens the single-product adjust form with the first selected product. True multi-product UI would need an additional modal listing all selected SKUs. Workaround documented to user via toast.
- **Print report**: opens a new window — popup blockers may interfere. Falls back to `window.print()` of the parent doc if blocked.
- **Offline queue**: count operations queued to IndexedDB store `inventory_counts_pending`. There is no automatic flush UI yet — relies on existing `volvix-offline-queue.js` to drain pending items.
- **Expiry date field**: assumes products carry `expiry_date` / `caducidad` / `expires_at`; if not present in `/api/products` payload, "Por caducar" filter shows zero results (graceful fallback).
- **Cost average column** in Kardex: depends on `cost_avg` / `avg_cost` field returned by `/api/reports/kardex`; falls back to `—` if absent.

## Files modified

- `salvadorex_web_v25.html` (only)

No changes to:
- `api/index.js` (parallel agent)
- `volvix-feature-flags.js`, `volvix-uplift-wiring.js`, `auth-gate.js`
- `volvix_owner_panel_v7.html`, `volvix-admin-saas.html`
