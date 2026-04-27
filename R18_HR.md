# R18 — Recursos Humanos (HR)

## Resumen
Módulo de gestión de Recursos Humanos para Volvix POS: control de asistencia con geofence, solicitudes de vacaciones/permisos, evaluaciones de desempeño y repositorio de documentos del empleado.

## Esquema SQL (`db/R18_HR.sql`)
- **attendance** — Registros de check-in/check-out con `hours_worked` y `late_minutes`. Indexado por `(employee_id, check_in)`.
- **time_off** — Solicitudes (`vacation`/`sick`/`personal`) con flujo `pending` → `approved`/`rejected`. Aprobador trazable en `approved_by`.
- **performance_reviews** — Evaluaciones por período con `ratings` en JSONB (flexible por organización) y comentarios libres.
- **employee_documents** — Archivos del expediente (contratos, IDs, comprobantes) referenciados por URL.

## Endpoints (`api/index.js`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/hr/attendance/check-in` | Empleado autenticado; valida geofence si `hr_geofence` está configurado en settings; calcula `late_minutes` contra `shift_start` |
| POST | `/api/hr/attendance/check-out` | Cierra asistencia abierta más reciente y calcula `hours_worked` |
| GET | `/api/hr/attendance` | Filtros: `employee_id`, `from`, `to` (límite 500) |
| GET | `/api/hr/time-off` | Filtros: `employee_id`, `status` |
| POST | `/api/hr/time-off` | Crea solicitud en estado `pending` |
| PATCH | `/api/hr/time-off` | Solo manager/admin; aprueba o rechaza |
| GET | `/api/hr/performance-reviews` | Filtros: `employee_id`, `period` |
| POST | `/api/hr/performance-reviews` | Solo manager/admin; guarda ratings JSONB |
| GET | `/api/hr/employees/:id/dashboard` | Resumen: asistencia 30d, time-off agregado por status, últimas 3 reviews, últimos 20 documentos |

## Reglas de negocio
- **Geofence**: distancia haversine vs. setting `hr_geofence` (`lat`, `lng`, `radius_km`). Por defecto 200 m si no se especifica.
- **Tardanza**: minutos entre `shift_start` (body) y `check_in` real, nunca negativo.
- **Autorización**: empleado solo opera sobre sus propios registros; aprobaciones y altas de reviews requieren `role` manager o admin.

## Pendiente / siguientes iteraciones
- Webhook nómina al cerrar período.
- Exportación CSV de asistencia.
- Notificaciones push al cambiar estado de time_off.
