# R26 — Hardcoded / Mock Data Audit

Path: `C:\Users\DELL\Downloads\verion 340\` (Sin auditor).
Excluido: `node_modules/`, `tests/`, `*.bak`, `MATRIZ_PRUEBAS_LOCAL_v1_backup.html`, fallbacks legítimos del API server.

## Hallazgos críticos (deben venir de Supabase)

| # | Archivo | Línea | Tipo | Severidad | Debería venir de |
|---|---|---|---|---|---|
| 1 | `volvix-customer-portal.html` | 467-560 | `const DB = {...}` mock COMPLETO del portal cliente: `user`, `purchases[7]`, `invoices[5]`, `loyalty.history[5]`, `loyalty.rewards[6]`, `addresses[2]`, `notifs[5]`, `credit{...}` | **CRITICAL** | `/api/customer/me`, `/api/customer/purchases`, `/api/customer/invoices`, `/api/loyalty/history`, `/api/loyalty/rewards`, `/api/customer/addresses`, `/api/notifications`, `/api/customer/credit` |
| 2 | `volvix-mega-dashboard.html` | 480-493 | `const MOCK = {...}` con `dashboard.sales_today=142850`, `tickets=387`, `tenants[5]` (Volvix Centro/Norte/Sur/Plaza/Express con sales y tickets fijos), `health` | **CRITICAL** | `/api/owner/dashboard`, `/api/tenants` (ya hace fetch pero usa MOCK como fallback visible si API cae) |
| 3 | `volvix-mega-dashboard.html` | 522-525 | Array bar-chart `[Lun..Dom]` con valores `82,95,71,108,142,168,124` hardcoded | **HIGH** | `/api/owner/sales-by-day` |
| 4 | `volvix-mega-dashboard.html` | 538-541 | Line-chart generado con `Math.random()` | **HIGH** | `/api/owner/sales-hourly` |
| 5 | `volvix_owner_panel_v7.html` | 853, 1188, 1233, 1342, 1840-1843, 1963-1965 | KPIs hardcoded: `$184,240`, `$39,200`, `$312K`, `$186K`, `$162,180 cobrado`, `$28,400 revshare`, módulos×precio | **CRITICAL** | `/api/owner/billing`, `/api/owner/revenue`, `/api/owner/modules` |
| 6 | `volvix_owner_panel_v7.html` | 1709, 1730, 1751 | Precios seat hardcoded `$149/mo`, `$199/mo`, `$99/mo` | **HIGH** | `/api/billing/plans` |
| 7 | `salvadorex_web_v25.html` | 1724-1739, 1803, 1887-1902, 2022 | KPIs caja: tickets 18, prom $267.78, crédito $890, top-3 productos (Pan dulce/Leche/Arroz), conteo billetes $500/$200/$100 | **CRITICAL** | `/api/cash-register/today`, `/api/sales/top-products`, `/api/credit/summary` |
| 8 | `volvix-vendor-portal.html` | 605, 635-894, 923 | KPIs $487,290 + 10+ filas tabla órdenes (PO-2026-04766 etc.) con montos hardcoded | **CRITICAL** | `/api/vendor/orders`, `/api/vendor/dashboard` |
| 9 | `multipos_suite_v3.html` | 691-1334 | Stats demo: $288 prom, tickets $576.52 / $324 / $418.20, propinas $420, ticket prom $175, tacos $178, arrachera $259, plan "Pro $599/mes" | **CRITICAL** | `/api/sales/today`, `/api/tickets/recent`, `/api/products` |
| 10 | `volvix-modals-demo.html` | 218 | `var DB = ['Coca Cola','Pepsi',...]` 10 productos hardcoded para autocomplete demo | **MEDIUM** | `/api/products/search` (es archivo demo de modales, probablemente OK) |
| 11 | `volvix-vertical-joyeria.js` | 52 | `const DB = {...}` semilla productos joyería | **MEDIUM** (vertical seed) | `/api/products?category=jewelry` |
| 12 | `volvix-donations-wiring.js` | 51 | Lista ONGs con RFC `BAM900101XXX` placeholder | **MEDIUM** | `/api/donations/charities` |
| 13 | `volvix-onboarding-v2.html` | 157-158 | `<option>Básico — $499/mes</option>`, `Pro — $999/mes` | **HIGH** | `/api/billing/plans` |
| 14 | `landing_dynamic.html` | 506-525, 541, 595 | Mock cards "$24,839 Hoy", "$169 Avg", lista productos café/croissant/sandwich precios fijos, "$890M Procesados/año" | **HIGH** (es landing, puede ser intencional pero confunde) | `/api/landing/stats` o marcado como demo |
| 15 | `volvix-grand-tour.html` | varios | KPIs y precios para tour interactivo | **MEDIUM** (tour-mode aceptable, pero debe etiquetarse) | hardcoded OK si label `[DEMO TOUR]` visible |

## Credenciales / tokens hardcoded

| Archivo | Línea | Hallazgo |
|---|---|---|
| `api/index.js` | 16 | `SUPABASE_URL` con default `https://zhvwmzkcqngcaqpdxtwr.supabase.co` (fallback aceptable, viene de env). **No es secreto**. |

No se encontraron JWT (`eyJ...`) ni `sk_live_*` / `sk_test_*` embebidos en HTML/JS de cliente. Limpio.

## TODO/FIXME relevantes (no node_modules ni tests)

| Archivo | Línea | Nota |
|---|---|---|
| `volvix-error-tracker.js` | 124 | `TODO: integrate source-map.js once a /sourcemaps/ manifest is published` — pendiente integración |
| `sw.js` | 11 | `TODO(build-step): cuando se agregue build pipeline (esbuild/vite)` — pendiente build |

Sin FIXME/HACK/XXX-bandera en código de producción.

## Console.log con datos demo

| Archivo | Línea | Texto |
|---|---|---|
| `volvix-hr-wiring.js` | 468 | `console.log('[HR] demo seeded')` — **MEDIUM**, indica que hay seeding demo activo en HR |

## Resumen ejecutivo

- **CRITICAL (6 archivos)**: portales y dashboards completos cargan datos fake antes de tocar API. Si `/api/...` falla o no existe, usuario ve montos/clientes/tickets falsos creíbles → confusión grave.
- **Pieza más urgente**: `volvix-customer-portal.html` (167 líneas de mock JSON) y `volvix-mega-dashboard.html` (objeto MOCK).
- **Limpio**: secretos/JWT, hay 2 TODO menores y 1 `[HR] demo seeded`.
- **Total hallazgos**: 15 archivos con datos hardcoded relevantes.
