# R18 — CRM Avanzado (B2B Pipeline)

## Resumen
Sistema CRM B2B con pipeline de ventas tipo Kanban, gestión de leads, actividades, campañas multicanal y forecast ponderado por probabilidad de cada etapa.

## Componentes entregados

### SQL — `db/R18_CRM_ADVANCED.sql`
- `pipeline_stages` (tenant_id, name, order, probability) con seed por defecto: Lead 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Closed Won 100%, Closed Lost 0%.
- `leads` (tenant_id, contacto, company, source, value_estimated, stage_id, owner_user_id, status open/won/lost, notes).
- `crm_activities` (lead_id, type call/email/meeting/note, summary, scheduled_at, completed_at, user_id).
- `crm_campaigns` (segment_id, channel email/sms/whatsapp/push, status, sent_at, opened, clicked).
- `crm_stage_log` para auditoria de transiciones (alimenta forecast histórico).

### API — `api/crm-advanced.js`
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/crm/leads` | Lista filtrada por stage/status/owner |
| POST | `/api/crm/leads` | Crear lead |
| PATCH | `/api/crm/leads/:id` | Actualizar campos |
| DELETE | `/api/crm/leads/:id` | Eliminar lead |
| POST | `/api/crm/leads/:id/move-stage` | Mueve stage + log + auto-status (won/lost al cerrar) |
| GET/POST | `/api/crm/activities` | Listado/registro de actividades |
| GET | `/api/crm/pipeline-view` | Kanban data agrupado por stage |
| GET | `/api/crm/forecast` | Forecast ponderado: SUM(value × probability/100) por stage |

Montaje: `require('./crm-advanced').register(app, { db, auth });`

### Cliente — `public/volvix-crm-kanban.js`
- Kanban drag&drop nativo HTML5 entre columnas (stages).
- Auto-render en cualquier `[data-volvix-crm-kanban]`.
- Cards muestran nombre, empresa y valor estimado.
- Totales por columna y forecast global en `#vx-crm-forecast`.
- API expuesta: `VolvixCRMKanban.loadPipeline(containerId)`.

## Flujo de uso B2B
1. Captura de lead (web form / manual) → entra en stage **Lead**.
2. Vendedor califica → drag a **Qualified**, registra `crm_activities` (call/meeting).
3. Envío de propuesta → **Proposal** (50%).
4. Negociación → **Negotiation** (75%).
5. Cierre → **Closed Won** (status=won) o **Closed Lost** (status=lost).
6. `crm_stage_log` registra cada movimiento; forecast recalcula en tiempo real.

## Estado
Componentes listos. Pendiente integración con segments existentes (`R17_SEGMENTS.sql`) para campañas dirigidas.
