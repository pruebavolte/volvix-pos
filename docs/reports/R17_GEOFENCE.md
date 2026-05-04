# R17 — Geofencing: auto check-in cajeros (slice_111)

## Objetivo
Detectar automáticamente cuándo un cajero entra a la zona de un branch (radio 100 m)
y registrar el check-in sin intervención manual.

## Componentes entregados

### 1. API (`api/index.js`)
- `GET  /api/geofence/check?lat=&lng=` — devuelve `{ nearest, distance_m, inside }`
  calculando Haversine en JS contra `pos_branches`. No persiste.
- `POST /api/geofence/checkin` — body `{ lat, lng, accuracy }`. Si la distancia al
  branch más cercano ≤ 100 m, inserta fila en `cashier_checkins` y responde
  `{ ok:true, branch, distance_m, checkin }`. Si no, `{ ok:false, reason:'out_of_range' }`.
- Auth requerida (`requireAuth`); `user_id` viene del JWT, nunca del body.
- Tolera tabla ausente (`42P01` → no rompe el endpoint).

### 2. SQL (`db/R17_GEOFENCE.sql`)
- Tabla `cashier_checkins(id, user_id, branch_id, lat, lng, distance_m, accuracy_m, ts)`.
- Índices `(user_id, ts DESC)` y `(branch_id, ts DESC)`.
- Columnas `lat`/`lng` añadidas a `pos_branches` (idempotente).
- Función `haversine_distance(lat1,lng1,lat2,lng2) RETURNS double precision`.
- Vista `cashier_last_checkin` con DISTINCT ON.
- RLS: cada cajero ve/inserta solo sus propios check-ins.

### 3. Cliente (`volvix-geofence-wiring.js`)
- Extiende `GeofenceAPI` (v1.1.0) con:
  - `startAutoCheckin()` / `stopAutoCheckin()` / `autoCheckinOnce()`.
  - Polling cada **5 min** posteando a `/api/geofence/checkin`.
  - Render de chip `📍 <branch> (<dist>m)` en el header (`#volvix-current-branch`).
  - Auto-start al disparar evento `volvix:login` con `role=cashier|cajero`.
- JWT leído de `localStorage.volvix_jwt` (fallback `jwt`).
- `getCurrentBranch()` expone el último branch detectado.

## Flujo end-to-end
1. Cajero hace login → app dispara `volvix:login {role:'cashier'}`.
2. Wiring pide permiso geolocation y llama `autoCheckinOnce()` inmediatamente.
3. Cada 5 min repite: lee GPS → `POST /api/geofence/checkin`.
4. API calcula nearest branch; si ≤100 m, inserta fila y devuelve branch.
5. Cliente actualiza chip del header con nombre del branch + distancia.

## Pruebas manuales sugeridas
- `curl -H "Authorization: Bearer <jwt>" "$API/api/geofence/check?lat=19.43&lng=-99.13"`
- `curl -X POST $API/api/geofence/checkin -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"lat":19.43,"lng":-99.13,"accuracy":15}'`
- En consola del navegador: `GeofenceAPI.autoCheckinOnce()`.

## Notas
- El cálculo Haversine se duplica intencionalmente (JS + SQL) para que el endpoint
  funcione aun sin la función SQL desplegada.
- `accuracy_m` es opcional; útil para descartar lecturas con precisión >100 m.
- Fence radio (100 m) hardcoded; mover a `pos_branches.geofence_radius_m` si se
  requiere por sucursal.
