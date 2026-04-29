# Phase 4 Report — Export/Import + Customer Credit modules

## Files created

| File | Purpose |
|------|---------|
| `volvix-export-import.js` | Self-contained module: hooks export/import buttons (products, customers, kardex, reports) and wires CSV/XLSX downloads + CSV imports. |
| `volvix-customer-credit.js` | Self-contained module: hooks "+ Registrar abono" button, opens payment modal with customer autocomplete + balance validation, adds "Ver historial de abonos" link with paginated history table. |
| `volvix-import-export.css` | Shared styles for modal overlays, form fields, file dropzones, progress bars, CSV preview tables, customer search & history. All `.vlx-*` namespaced. |
| `volvix-export-import-api.md` | Full API contract documentation: request/response shapes, query params, RLS policy templates. |
| `PHASE4_REPORT.md` | This report. |

## Files modified

| File | Change |
|------|--------|
| `volvix-uplift-wiring.js` | Added the two new JS modules to `ESSENTIAL_WIRINGS`, plus a new `ALWAYS_LOAD` array (loads them even on light pages where the heuristic skips other wirings) and `ALWAYS_LOAD_CSS` to inject the stylesheet. |

## DO NOT TOUCH list — respected
`salvadorex_web_v25.html`, `volvix_owner_panel_v7.html`, `volvix-admin-saas.html`, `landing-*.html`, `volvix-user-management.html`, `volvix-feature-flags.js` — none touched.

---

## How modules hook into existing buttons (selector strategy)

Both modules run on `DOMContentLoaded`, then re-run on:
1. `MutationObserver` on `document.body` (debounced 300ms) — re-hooks when DOM changes (modals open, tabs switch).
2. A bounded `setInterval` (10 retries, 1s apart) for late-rendered UI.
3. Each hooked button is marked with `data-vlx-export-import-hooked="1"` (or `data-vlx-credit-hooked`) to ensure idempotence — never double-attached.
4. Buttons that previously got `data-vlx-rescued` from the ghost-button rescuer have that attribute removed once the real handler attaches.

### Selectors used in `volvix-export-import.js`

| Feature | Strategy |
|---------|----------|
| Export products | `#btn-export-prod` (id) |
| Import products | `#btn-import-prod` (id) |
| Export customers | All `<button>` whose text matches `/Exportar/i` AND contains `📤` or `⬇`, then walked up to find an ancestor whose text contains `Clientes` (max 6 hops, 4000-char cap to avoid root match). |
| Filter kardex date | `<button>` with text matching `/Filtrar fecha/i`. |
| Export kardex | `<button>` with text `/Exportar/i` whose ancestor text contains `kardex`. |
| Export all reports | `<button>` with text `/Exportar todo/i`. |

### Selectors used in `volvix-customer-credit.js`

| Feature | Strategy |
|---------|----------|
| Register payment | `<button>` or `<a>` whose text matches `/Registrar abono/i`. |
| History link | Inserted as a sibling of the register-payment button (only if no `.vlx-history-link` already exists in the parent). |

The history link reads `window.currentCustomerId` or `window.currentCustomer.id` if exposed; otherwise falls back to its own customer search inside the history modal.

---

## API endpoints required

Documented in `volvix-export-import-api.md`. Quick summary:

- `GET /api/products?limit=&offset=&search=&category=` — paginated.
- `POST /api/products/bulk` — upsert by `(tenant_id, sku)`, returns `{inserted, updated, errors}`.
- `GET /api/customers?limit=&offset=&search=` — autocomplete + export source.
- `GET /api/customers/:id` — preselect on payment modal.
- `POST /api/customers/:id/payments` — body `{amount, method, date, notes}`, server validates `amount <= balance`, returns row with `balance_after`.
- `GET /api/customers/:id/payments?limit=&offset=` — history.
- `GET /api/inventory-movements?from=&to=&product=&type=&limit=&offset=` — kardex.
- `GET /api/reports/{sales|top-products|top-customers|profit|by-cashier}?from=&to=` — XLSX export source.

All require `Authorization: Bearer <jwt>` from `window.Volvix.auth.getToken()` (with fallback to `window.VolvixAuth.getToken()`).

---

## Test plan (manual, end-to-end)

### Setup
1. Open https://volvix-pos.vercel.app and log in with valid Volvix credentials.
2. Open DevTools → Console; verify `window.VolvixExportImport` and `window.VolvixCustomerCredit` are defined.
3. Verify `<link rel="stylesheet" href="/volvix-import-export.css">` is in `<head>`.

### A. Export products (CSV)
1. Navigate to **Productos** section.
2. Click `#btn-export-prod`.
3. Expected: toast "Exportando productos...", then "Exportados N productos".
4. CSV downloads as `productos-{tenant}-YYYYMMDD.csv`.
5. Open in Excel/Sheets — header row matches: `id,sku,barcode,name,description,price,cost,stock,category,brand,tax_rate,created_at`. UTF-8 BOM ensures accents render.

### B. Import products (CSV)
1. Use the sample CSV below.
2. Click `#btn-import-prod` → file picker opens.
3. Select the CSV → preview modal shows: total read, valid count, errors count, preview of 10 rows.
4. Click "Importar N productos" → progress modal appears, batches of 100 stream in.
5. On success: toast + product list reloads.
6. **Negative tests**:
   - Empty `name` column → row appears under errors.
   - Negative `price` → flagged.
   - Duplicate `sku` in same file → flagged.

### C. Export customers (CSV)
1. Navigate to **Clientes** section.
2. Click the "📤 Exportar" button near it.
3. CSV downloads as `clientes-{tenant}-YYYYMMDD.csv`.

### D. Filter kardex by date
1. Navigate to **Kardex / Inventario**.
2. Click "📅 Filtrar fecha".
3. Modal opens with current month preselected.
4. Submit → URL gets `?from=&to=&product=&type=`, custom event `volvix:kardex:filter` fires.

### E. Export kardex
1. Navigate to kardex view (with optional URL filters from D).
2. Click "📤 Exportar".
3. CSV downloads as `kardex-{tenant}-YYYYMMDD.csv`.

### F. Export all reports (XLSX)
1. Navigate to **Reportes**.
2. Click "📥 Exportar todo".
3. Modal: select date range + checkboxes for sales/top-products/top-customers/profit/by-cashier (all checked by default).
4. Submit → SheetJS loads from CDN, builds `.xlsx` with one sheet per report, downloads as `reportes-{tenant}-YYYYMMDD.xlsx`.

### G. Register customer payment
1. Open a customer's profile (so `window.currentCustomer` is set), or any view with a "+ Registrar abono" button.
2. Click "+ Registrar abono".
3. Modal opens. If preselected: balance shows in blue card.
4. Otherwise: type 2+ chars in customer search → debounced fetch shows results with name/phone/balance.
5. Click a result → balance card updates, `max` on amount input is set to current balance.
6. **Negative tests**:
   - Submit with no customer → error "Selecciona un cliente."
   - Amount = 0 → error.
   - Amount > balance → error "El monto no puede exceder el adeudo actual ($X)."
7. Valid submit → POST to `/api/customers/:id/payments`, modal closes, success toast, `volvix:customer:payment` event fires.

### H. Payment history
1. Click "Ver historial de abonos" (sibling of register button).
2. Modal opens. If a current customer exists: history loads; otherwise search bar.
3. Table columns: fecha, monto, método, balance después, notas, acciones.
4. "Imprimir" per row → opens print dialog with formatted receipt.
5. "Cargar más" appears if more pages exist.

### I. Accessibility
- All modals: focus trapped (Tab cycles inside), Esc closes, click on backdrop closes, focus returns to trigger button.
- All inputs have `<label>`, `aria-label`, or `aria-labelledby`.
- Error messages have `role="alert" aria-live="polite"`.
- Buttons have visible focus rings (yellow `#fbbf24`, from CSS).

### J. Auth & multi-tenant
- Without JWT (logged out): every action shows "No estás autenticado".
- All `fetch` calls include `Authorization: Bearer <token>`.
- RLS on Supabase isolates by `tenant_id`; cross-tenant data must NEVER appear (verify with two test tenants).

---

## Sample CSV format (products import)

```csv
sku,barcode,name,description,price,cost,stock,category,brand,tax_rate
SKU-001,7501234567890,Coca Cola 600ml,Refresco embotellado,18.50,12.00,150,Bebidas,Coca-Cola,0.16
```

- Required: `name`, `price`.
- `tax_rate` is decimal (0.16 = 16%).
- File must be UTF-8 (BOM accepted, no BOM also fine — PapaParse handles both).

---

## TODOs / known follow-ups

1. **Server-side validation**: ensure `POST /api/products/bulk` enforces `(tenant_id, sku)` UPSERT and returns the documented `{inserted, updated, errors}` shape.
2. **Server-side `POST /api/customers/:id/payments`**: must reject `amount > balance` server-side and write `customer_payments` row + decrement `customers.balance` in one transaction.
3. **XLSX import** (currently CSV only): SheetJS is already used for export — the import path could be extended via `accept=".csv,.xlsx"` and `XLSX.read(...)`. Marked as optional in the spec; not implemented here to keep import deterministic.
4. **Drag-and-drop**: CSS for `.vlx-dropzone` is in place but the import currently uses a simple file picker. A future iteration can wire drag-and-drop on top.
5. **Receipt print template**: minimal opt-in print preview window. Brand-customizable via a future template hook.
6. **CSV mapping wizard**: if the user uploads a CSV with non-matching headers, they currently see those rows as "Nombre requerido". A column-mapping UI would be a UX win.
7. **i18n**: strings are Spanish-only. If `window.t()` exists, hook it.
8. **Confirm RLS policies** (`products`, `customers`, `customer_payments`, `inventory_movements`) exist for `tenant_id = auth.jwt().tenant_id`. Templates in `volvix-export-import-api.md`.

---

## Self-walkthrough verification (per CLAUDE.md R5)

1. User opens página → uplift-wiring fires → injects CSS + loads `volvix-export-import.js` + `volvix-customer-credit.js` → both run `init()` → both hook buttons + start MutationObserver. ✓
2. User llena form de abono → blur on amount triggers HTML5 `min`/`max` validation; on submit, our handler revalidates and shows inline error in `#vlx-pay-err` (role=alert). ✓
3. User clicks "Registrar abono" → submit button shows "Procesando...", disabled; on response: toast (success or error), modal closes (success only). ✓
4. User refreshes → modules re-init from scratch; URL params (kardex filters) survive via `history.replaceState`. ✓

## Adversarial pass (per CLAUDE.md R6)

- **Saboteur**: huge CSV (50k rows) → batched in 100s, progress bar, modal cancellable. ✓
- **New Hire naming**: button "Exportar productos" → handler `exportProducts()` literally fetches `/api/products` and downloads CSV. Coherence ✓.
- **Security**: no secrets in client; all calls go through `Authorization: Bearer`. CSV cell escaping wraps `"`/`,`/newlines. Customer notes are escaped against `<`/`>` before insertion in history table. RLS responsibility on server. ✓
