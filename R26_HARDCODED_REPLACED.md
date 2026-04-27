# R26 — Hardcoded Replaced (3 archivos críticos)

## Archivos modificados

### 1. `volvix-customer-portal.html`
- **Eliminadas líneas 467-522** (`const DB = {...}` con 7 compras / 5 facturas / loyalty / 2 addresses / 5 notifs / credit history hardcoded). Total **~56 líneas de mock JSON** removidas.
- Reemplazado por `let DB = {...vacío...}` + `async function loadCustomerData()` que hace `Promise.all` de:
  - `GET /api/customer/me`
  - `GET /api/customer/orders` (poblamos `purchases` e `invoices`)
  - `GET /api/customer/loyalty` (puntos, tier, history, rewards)
  - `GET /api/customer/payment-methods`
- Auth via `Bearer ` con token en `localStorage.volvix_customer_token`.
- Hook en `enterApp()` y en `DOMContentLoaded`. `renderAll()` se llama tras carga.

### 2. `volvix-mega-dashboard.html`
- **Eliminadas líneas 480-493**: `MOCK.dashboard.sales_today=142850/tickets=387/conversion=24.6` + array `tenants` con 5 sucursales fijas + `health` 99.7%. Reemplazado por objeto vacío.
- **Eliminadas líneas 522-525**: array bar-chart `[Lun..Dom]` con `82,95,71,108,142,168,124`. `renderBars()` ahora hace `fetch('/api/reports/sales/daily?days=7')`. Si vacío → "Sin datos de ventas semanales".
- **Eliminadas líneas 538-541**: `Math.random()` en `renderLine()`. Ahora hace `fetch('/api/reports/sales/hourly')`. Si vacío → SVG vacío.
- `animateNum('m-sales')` muestra "Sin datos" si total=0 (en vez de `$0`).

### 3. `volvix_owner_panel_v7.html`
- KPIs ya estaban como `data-kpi="..."` con `--`. Faltaba el wiring → agregado en `volvix-real-data-loader.js`.
- **Eliminadas 9 líneas de hardcoded en device-cards** (líneas 1700-1751): `412/512 seats/$149`, `287/320/$199`, `192/240/$99`. Reemplazadas por `<span data-seat="web_inuse">--</span>`, `data-seat="web_sold"`, `data-plan-price="web"` (y windows/android).
- KPIs `$184,240` / `$312K` / `$28,400` revshare etc. ya no tenían valor hardcoded en el HTML — ahora se llenan desde API.

### 4. `volvix-real-data-loader.js` (extendido)
Nuevas funciones añadidas al loader global (que ya está incluido en owner-panel y mega-dashboard):
- `loadOwnerDashboard()` → `GET /api/owner/dashboard` → llena `mrr`, `mrr_trend`, `brands_total`, `active_tenants`, `devices_online`, `suite_*`, etc.
- `loadOwnerBilling()` → `GET /api/owner/billing` → `billing_invoiced`, `billing_collected`, `billing_revshare`, `billing_margin`.
- `loadBillingPlans()` → `GET /api/billing/plans` → llena `[data-plan-price="web|windows|android"]`.
- `loadOwnerSeats()` → `GET /api/owner/seats` → llena `data-seat` para sold/in_use por plataforma.

## Endpoints conectados (totales)

| Archivo | Endpoint |
|---|---|
| customer-portal | `/api/customer/me`, `/api/customer/orders`, `/api/customer/loyalty`, `/api/customer/payment-methods` |
| mega-dashboard | `/api/owner/dashboard`, `/api/tenants`, `/api/products`, `/api/sales`, `/api/customers`, `/api/health`, `/api/reports/sales/daily`, `/api/reports/sales/hourly` |
| owner-panel-v7 | `/api/owner/dashboard`, `/api/owner/billing`, `/api/billing/plans`, `/api/owner/seats` (+ los heredados del loader: `/api/products`, `/api/customers`, `/api/sales`, `/api/ai/tickets/stats`) |

## Validación de sintaxis

`node -e "new Function(<scripts>)"` sobre los 3 HTML + el JS:

```
volvix-customer-portal.html: OK (14969 chars)
volvix-mega-dashboard.html: OK (17840 chars)
volvix_owner_panel_v7.html: OK (81637 chars)
volvix-real-data-loader.js: OK (8018 chars)
```

## Deploy

Commit: `34279c6` — "R26: replace hardcoded mocks with real Supabase data wiring"

Producción Vercel:
- **URL**: https://volvix-pos.vercel.app
- **Deploy ID**: `dpl_9NfSc3gB4RPmzCZiPYQR8Nmt4Qn8`
- **Estado**: READY (13s)
- Inspect: https://vercel.com/grupo-volvixs-projects/volvix-pos/9NfSc3gB4RPmzCZiPYQR8Nmt4Qn8

## Comportamiento ante endpoints vacíos

- Customer-portal: arrays vacíos → secciones muestran su `<div class="empty">` ya existente.
- Mega-dashboard: `m-sales`/`m-tickets` → "Sin datos"; bar-chart → "Sin datos de ventas semanales"; line-chart vacío.
- Owner-panel: KPIs y seats permanecen con `--` hasta que la API responda. Precios seat: `--` si `/api/billing/plans` no devuelve datos.

## Notas

- No se tocaron los archivos `salvadorex_web_v25.html`, `volvix-vendor-portal.html`, `multipos_suite_v3.html` que también aparecen en R26_HARDCODED_FOUND.md (fuera del scope de esta tarea: 3 archivos críticos).
- El loader ya estaba referenciado desde `volvix_owner_panel_v7.html` línea 4330 y `volvix-mega-dashboard.html`. Sin necesidad de incluirlo manualmente.
- En customer-portal el script de carga es inline (no requiere include externo) porque maneja un token específico distinto al `Volvix.session.tenant_id`.
