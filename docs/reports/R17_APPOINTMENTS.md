# R17 — Sistema de Reservaciones / Citas

**Slice**: 113 (idx 2260-2280)
**Verticales**: salón, spa, dental, gym, mecánica, barbería
**Estado**: Implementado (in-memory store + REST + UI calendario)

## Componentes

### 1. SQL — `db/R17_APPOINTMENTS.sql`
Tablas multi-tenant con RLS habilitado:
- **services**: catálogo (id, tenant_id, name, duration_minutes, price, category, color, active).
- **appointments**: reservas (id, tenant_id, customer_id, service_id, staff_id, starts_at, ends_at, status, notes, price_snapshot). CHECK ends_at > starts_at. Status enum: `booked|confirmed|canceled|completed|no_show`.
- **staff_availability**: horario semanal recurrente (staff_id, day_of_week 0-6, start_time, end_time).
- **appointment_blocks**: vacaciones / breaks (staff_id, starts_at, ends_at, reason).
- Índices por (tenant_id, starts_at), (staff_id, starts_at), (tenant_id, status).
- Vista `v_agenda_today`. Trigger `fn_appt_touch_updated` para `updated_at`.
- RLS por `current_setting('app.tenant_id')`.

### 2. API — `api/index.js`
Insertado antes del bloque `voice POS (R17)` (~línea 5910). In-memory store `_APPT_STORE`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/services` | Lista servicios activos |
| POST | `/api/services` | Crea servicio |
| PATCH/DELETE | `/api/services/:id` | Edita/borra |
| GET | `/api/appointments?date=&staff_id=&status=` | Lista filtrada |
| POST | `/api/appointments` | Crea con validación de overlap (409 si `slot_taken` o `staff_blocked`) |
| PATCH | `/api/appointments/:id` | Reschedule (revalida slot) |
| POST | `/api/appointments/:id/{confirm,cancel,complete,no-show}` | Cambia status |
| GET | `/api/availability?service_id=&date=&staff_id=` | Slots libres del día (grid 15 min, ventana 09-18 default o `staff_availability`) |

### 3. Cliente — `volvix-appointments-wiring.js`
Reescrito para R17. Expone `window.AppointmentsAPI`:
- `Services`, `Appointments` (CRUD + status transitions + `availability`).
- `renderWeekView(container, opts)`: calendario semana custom-grid (sin deps), columnas Dom-Sáb 08-21, slots 1h con appts posicionados absolutamente por minuto.
- **Drag & drop**: `dragstart` en evento, `drop` en celda → `PATCH /api/appointments/:id` con nuevos `starts_at/ends_at`. Reload tras éxito; alerta si conflict.
- **Color por status** vía `STATUS_COLORS` (booked=azul, confirmed=verde, canceled=rojo, completed=índigo, no_show=ámbar).
- Toolbar Prev/Hoy/Next, `onSlotClick`/`onApptClick` callbacks.

## Test rápido
```js
await AppointmentsAPI.Services.create({ name:'Corte', duration_minutes:30, price:200 });
AppointmentsAPI.renderWeekView('#calendar', { staffId:'staff-1' });
```

## Pendiente (futuro slice)
- Migrar `_APPT_STORE` a Postgres usando `R17_APPOINTMENTS.sql`.
- Recordatorios SMS/email (cron + plantillas R14).
- Lista de espera / waitlist promotion automática al cancelar.
