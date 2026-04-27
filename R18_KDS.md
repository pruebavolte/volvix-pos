# R18 · Kitchen Display System (KDS)

## Resumen
Sistema KDS full-screen para restaurantes con tickets en columnas (Recibido / Preparando / Listo), drag & drop entre estados, auto-refresh, alerta sonora y timer con coloreo de urgencia.

## Componentes

### `volvix-kds.html`
- Tablero 3 columnas con grid responsive.
- Filtro por estación (grill / cold / bar / dessert).
- Drag & drop HTML5 nativo → `PATCH /status`.
- Auto-refresh cada **5 s** (`setInterval`).
- Reloj global + timer por ticket que recalcula cada segundo.
- Coloreo: normal → `warn` (>10 min, ámbar) → `urgent` (>15 min, rojo parpadeante).
- Alerta sonora al detectar IDs nuevos respecto al ciclo anterior (toggle ON/OFF).
- Indicador conexión: punto verde / rojo + texto.

### `db/R18_KDS.sql`
- `kds_stations(id, code UNIQUE, name, active, printer_id, config jsonb)` con seeds.
- `kds_tickets(id, sale_id, station, status, items jsonb, notes, priority, started_at, ready_at, served_at, created_at, updated_at)`.
- CHECKs en `station` y `status`.
- Índices: `status`, `station`, `sale_id` y parcial activos `(station,status,created_at)`.
- Trigger `kds_touch()` que rellena `started_at/ready_at/served_at` automáticamente al cambiar status.

### Endpoints (`api/index.js`)
| Método | Ruta | Función |
|---|---|---|
| POST  | `/api/kds/tickets` | Crear ticket (auto desde sale) |
| GET   | `/api/kds/tickets/active?station=` | Activos (received/preparing/ready) |
| PATCH | `/api/kds/tickets/:id/status` | Cambiar status |
| POST  | `/api/kds/stations` | Upsert config estación |
| GET   | `/api/kds/stations` | Listar estaciones |

## Flujo
Sale confirmada → POST `/api/kds/tickets` → KDS hace polling 5 s → cocinero arrastra a Preparando (started_at se setea) → Listo (ready_at) → Servido (served_at).
