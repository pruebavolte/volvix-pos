# R15 — Owner Panel Wiring (Supabase real)

## Objetivo
Reemplazar todos los handlers del Owner Panel que sólo persistían a `localStorage`
por llamadas reales contra el API (Supabase), usando `Volvix.auth.fetch` para
inyectar el JWT.

## Archivos modificados
- `volvix-owner-wiring.js` (reescrito completo, 408 líneas)

## Archivos NO tocados
- `api/index.js` — verificado con `node --check`, sin cambios.
- `volvix_owner_panel_v7.html` — la lógica vive en el wiring; los `onclick`
  existentes del HTML invocan funciones globales (`ownerCreateTenant`,
  `ctrlSetStatus`, etc.) que ahora están redefinidas/envueltas por el wiring.

## Botones cableados (antes → después)

| Acción | Antes | Después |
|--------|-------|---------|
| Crear tenant | `prompt` + `localStorage` | `POST /api/owner/tenants` |
| Editar tenant (nombre/marca) | `ctrlUpdateIdentity` → `localStorage` | wrap: original + `PATCH /api/owner/tenants/:id` |
| Pausar / activar tenant | `ctrlSetStatus` → `localStorage` | wrap: original + `PATCH /api/owner/tenants/:id { is_active, status }` |
| Cambiar plan | `ctrlUpdatePlan` → `localStorage` | wrap + `PATCH /api/owner/tenants/:id { plan }` |
| Invitar usuario | `prompt` (sin persistencia real) | `POST /api/owner/users` |
| Editar permisos / rol | no existía | `PATCH /api/owner/users/:id { role }` |
| Suspender usuario | no existía | `PATCH /api/owner/users/:id { is_active }` |
| Crear licencia | parcial | `POST /api/owner/licenses` |
| Refrescar métricas | sólo dashboard | `GET /api/owner/dashboard` + `GET /api/metrics` |
| Aplicar filtros | no existía | `GET /api/owner/tenants?…` + `GET /api/owner/users?…` |
| Exportar reporte | sólo cache | `GET /api/reports/:type` + descarga CSV |

## Carga inicial de tablas (sin arrays hardcoded)
`init()` ejecuta en paralelo:
- `loadDashboard()` → `GET /api/owner/dashboard` (popula KPIs y `[data-kpi]`)
- `loadTenants()`   → `GET /api/owner/tenants` (popula `#tenants-table tbody`)
- `loadUsers()`     → `GET /api/owner/users`   (popula `#users-table tbody`)

Las tablas se renderizan dinámicamente; cada fila inyecta los handlers
`ownerEditTenant`, `ownerToggleTenant`, `ownerChangePlan`,
`ownerEditUserPermissions`, `ownerToggleUser`.

## Métricas en vivo (30 s)
```js
function startLiveMetrics() {
  if (metricsTimer) clearInterval(metricsTimer);
  loadLiveMetrics().catch(()=>{});
  metricsTimer = setInterval(() => loadLiveMetrics().catch(()=>{}), 30000);
}
```
`loadLiveMetrics()` hace `GET /api/metrics` y actualiza todo elemento con
`data-live-metric="<key>"`, además de pintar `#live-metrics-updated` con la
hora del último refresh.

## Auth
Todas las llamadas pasan por `authFetch()` que delega en
`window.Volvix.auth.fetch` cuando existe (definido en `auth-helper.js`,
expone `Volvix.auth.fetch`, `getToken`, `isLoggedIn`). Si por alguna razón
no está cargado, hace fallback a `fetch` plano para no romper la página.

## Verificaciones
- `node --check api/index.js` → ✅ (sin tocar el archivo)
- `node --check volvix-owner-wiring.js` → ✅
- Slice `live_status/slice_46.json` (idx 540-580) escrito.

## Deploy
`vercel --prod --yes` ejecutado — ver salida del último deploy.
