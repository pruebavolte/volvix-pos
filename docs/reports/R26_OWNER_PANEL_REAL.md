# R26 · Owner Panel · Datos reales (eliminación de mock)

**Archivo:** `volvix_owner_panel_v7.html`
**Fecha:** 2026-04-27
**Objetivo:** Eliminar valores hardcodeados/mock y conectar el panel a los endpoints reales del API.

---

## 1. Secciones modificadas

### a) KPIs por sección (todos los `<div class="kpi-value">$184,240</div>` etc.)
Se reemplazó el valor literal con `data-kpi="<clave>"` y placeholder `--`. El wiring existente (`volvix-owner-wiring.js` líneas 147-150) hace `document.querySelectorAll('[data-kpi]')` y rellena cada elemento con `metrics[<clave>]` desde `GET /api/owner/dashboard`.

| Sección | Claves `data-kpi` agregadas |
|---|---|
| Overview principal | `mrr`, `mrr_trend`, `brands_total`, `brands_breakdown`, `active_tenants`, `tenants_growth`, `devices_online`, `devices_sync_pct` |
| Suite (POS/KDS) | `suite_tenants`, `suite_tenants_growth`, `suite_devices_active`, `suite_devices_breakdown`, `suite_orders_day`, `suite_mrr` |
| AI Engine | `ai_features_total`, `ai_features_new`, `ai_activations`, `ai_activations_sub`, `ai_extensions`, `ai_savings` |
| AI Support | `ai_avg_time`, `ai_remote_sessions`, `ai_support_savings` (más los `ai_tickets_*` ya existentes) |
| AI Academy | `academy_videos`, `academy_pdfs`, `academy_reuses`, `academy_dup_cost` |
| Jerarquía | `hier_level_0`, `hier_level_1`, `hier_level_1_names`, `hier_level_2`, `hier_level_2_names`, `hier_level_3` |
| Etiquetas | `labels_clients`, `labels_clients_breakdown`, `labels_printed_month`, `labels_templates`, `labels_mrr` |
| Sync | `sync_clients`, `sync_clients_pct`, `sync_ops_per_min`, `sync_ops_peak`, `sync_latency_avg`, `sync_latency_p99`, `sync_conflicts_today` |
| Facturación | `billing_invoiced`, `billing_collected`, `billing_revshare`, `billing_margin` |

### b) Tablas (arrays JS literales eliminados)
Las constantes `BRANDS`, `TENANTS`, `DEVICES`, `DEPLOYS`, `LIVE`, `SYNC_LOG` quedaban hardcodeadas con datos de demo (Don Chucho, Barbería Luisita, Estética Pluz, etc.). Se reemplazaron por `let X = []` + función `loadXFromAPI()` async que hace `fetch` y luego llama al `renderX()` original. Cada `renderX()` ahora muestra "Cargando..." si el array está vacío.

### c) Charts (`mrrChart`, `syncChart`, `billingChart`)
Antes traían `labels:['Nov','Dic',...]` y `data:[18,21,23,...]` hardcodeados. Ahora se inicializan vacíos y se hidratan desde `GET /api/reports/{mrr-by-brand,sync-by-platform,billing-trend}` con formato `{ labels:[], series:[{label,data,color}] }`.

---

## 2. Datos eliminados (hardcoded)

- KPIs: `$184,240` MRR · `247` tenants · `891/1024` dispositivos · `$39,200` MRR suite · `247` features IA · `1,843` activaciones · `$312K` ahorro IA · `52 seg` tiempo promedio · `342` sesiones remotas · `$186K` ahorro soporte · `187` videos · `94` PDFs · `12,486` reusos · `47` clientes etiquetas · `28.4K` etiquetas · `156` plantillas · `$7,003` MRR labels · `891` clients sync · `3,420` ops/min · `84ms` latencia · `12` conflictos · `$184,240` facturado · `$162,180` cobrado · `$28,400` revshare · `$133,780` margen · niveles de jerarquía 1/5/14/8.
- 14 marcas demo en `BRANDS` (BarberPro, FarmaciasPro, RestaurantMan, EsteticaPluz, SalvadoreX, RentaFácil, etc.)
- 13 tenants demo en `TENANTS` (Barbería Luisita Centro/Sur, Estética Pluz Polanco, Farmacia San Miguel, Don Chucho 1/2/3, etc.)
- 8 devices demo en `DEVICES` (WEB-a3f9c2, WIN-7b8d4f, etc.)
- 6 deploys demo en `DEPLOYS` (v2.1.4 stable, v2.2.0-beta, etc.)
- 7 eventos en `LIVE` y 8 en `SYNC_LOG` con timestamps fijos
- 18 datasets de chart (MRR, sync, billing) con números mensuales falsos.

---

## 3. Endpoints conectados

| Endpoint | Consumido por |
|---|---|
| `GET /api/owner/dashboard` | Todos los `[data-kpi]` (loop existente en `volvix-owner-wiring.js:147`) |
| `GET /api/owner/brands` | `loadBrandsFromAPI()` → `renderBrands()` |
| `GET /api/owner/tenants` | `loadTenantsFromAPI()` (mapea a estructura local: name/brand/mods/web/win/and/mrr/status). El wiring antiguo también pinta `#tenants-table tbody`; ambos coexisten. |
| `GET /api/owner/devices` | `loadDevicesFromAPI()` → `renderDevices()` |
| `GET /api/owner/deploys` | `loadDeploysFromAPI()` → `renderDeploys()` |
| `GET /api/owner/live-events` | `loadLiveFromAPI()` → `renderLive()` |
| `GET /api/owner/sync-log` | `loadSyncLogFromAPI()` → `renderSyncLog()` |
| `GET /api/reports/mrr-by-brand` | Chart `mrrChart` |
| `GET /api/reports/sync-by-platform` | Chart `syncChart` |
| `GET /api/reports/billing-trend` | Chart `billingChart` |

Todas las llamadas usan `Volvix.auth.fetch` (JWT) si está disponible y caen a `fetch` plano si no.

---

## 4. Comportamiento UX

- Estado inicial: tablas y KPIs muestran `--` o `Cargando...`.
- Si el endpoint falla (offline / 4xx): se conserva el placeholder y se imprime `console.warn` (no romper UI).
- Lógica de UI (charts, tabs, layouts, filtros) intacta: solo cambió la **fuente** de datos.

---

## 5. Validación

- Sintaxis JS validada con `new Function()` sobre el bloque inline (81 KB) — OK.
- `grep 'kpi-value">[\\$\\d]'` → 0 coincidencias (no quedan números hardcoded).
- Init en `DOMContentLoaded` invoca primero `renderX()` (placeholders) y a los 200 ms los `loadXFromAPI()` para hidratar.

---

**Estado:** Listo para deploy. Backend debe exponer los 10 endpoints listados.
