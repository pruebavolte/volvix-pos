# Contrato: `GET|POST /api/admin/tenant/:id/*`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta base: `/api/admin/tenant/:id/` (familia de sub-rutas)
- Sub-rutas documentadas:
  - `GET  /api/admin/tenant/:id/modules`
  - `POST /api/admin/tenant/:id/modules/:module_id/toggle`
  - `GET  /api/admin/tenant/:id/buttons`
  - `POST /api/admin/tenant/:id/buttons/:button_id/toggle`
  - `POST /api/admin/tenant/:id/impersonate`
  - `POST /api/admin/tenant/:id/impersonate/refresh`
  - `GET  /api/admin/tenant/:id/metrics`
  - `GET  /api/admin/tenant/:id/notes`
  - `POST /api/admin/tenant/:id/note`
  - `GET  /api/admin/tenant/:tid/flags`
  - `POST /api/admin/tenant/:tid/module`
  - `POST /api/admin/tenant/:tid/button`
  - `GET  /api/admin/tenant/:tid/audit`
  - `GET  /api/admin/tenant/:tid/user-overrides`
  - `GET  /api/admin/tenant/:tid/employees`
- Auth requerido: ✅ JWT
- Rol mínimo: superadmin (mayoría de sub-rutas via `requireSuper()`), platform_owner en algunos

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body (POST toggle): `{ "active": boolean }` o `{ "state": "enabled"|"hidden"|"disabled" }`
- Query params: ninguno

## Response
- `GET /modules` 200:
  ```json
  { "ok": true, "tenant_id": "TNT-XXX", "modules": [{"module_key":"pos","active":true,"updated_at":"..."}] }
  ```
- `POST toggle` 200:
  ```json
  { "ok": true, "tenant_id": "TNT-XXX", "module_id": "pos", "active": true }
  ```
- `GET /flags` 200:
  ```json
  { "ok": true, "modules": {...}, "buttons": {...}, "modulesState": {...}, "buttonsState": {...} }
  ```
- 401: token ausente
- 403: rol insuficiente
- 400: tenant_id / module_id faltante

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `pos_tenant_modules` | SELECT / PATCH / INSERT | GET/POST modules |
| `tenant_button_overrides` | SELECT / PATCH / INSERT | GET/POST buttons |
| `giros_modulos` | SELECT | GET /flags (módulos del giro base) |
| `giros_buttons` | SELECT | GET /flags (botones del giro base) |
| `pos_companies` | SELECT | impersonate (verificar tenants) |
| `pos_usuarios` | SELECT | impersonate (obtener usuario owner) |
| `audit_log` | INSERT | logAudit post-impersonate |

## Consumidores
- **POS** (`salvadorex-pos.html`):
  - línea 3449: `POST /api/admin/tenant/:id/impersonate/refresh` — refresco token al volver de impersonación
  - línea 3574: `GET /api/admin/tenant/:id/flags` — hidrata módulos/botones activos al bootstrap del POS bajo impersonación
  - línea 3606: `GET /api/admin/tenants` — lista tenants disponibles (menú superadmin)
- **PDC** (`paneldecontrol.html`):
  - línea 4442: `POST /api/admin/tenant/:id/module` — toggle módulo desde panel permisos
  - línea 4529: `GET /api/admin/tenants` — lista tenants
  - línea 4585: `GET /api/admin/tenant/:id/flags` — carga estado completo de módulos/botones
  - línea 4776/4799: `POST /api/admin/tenant/:id/module` y `button` — toggles
  - línea 5606: `POST /api/admin/tenant/:id/module` con body.state — 3-state toggle

## Acoplamiento detectado
⚠️ PDC usa endpoint `/api/admin/tenant/:tid/module` (singular, body con `state`), mientras hay también `/api/admin/tenant/:id/modules/:module_id/toggle` (plural, body con `active:bool`). Son dos handlers distintos — riesgo de inconsistencia de estado en DB si ambos se usan para el mismo módulo. PDC parece preferir el endpoint singular.

⚠️ El nodo en system-map es `api__api_admin_tenant_` (singular) que mapea a `/api/admin/tenant/` — puede conflictuar con la ruta plural `/api/admin/tenants` en el router si hay matching ambiguo.

## Deudas
- Dos familias paralelas de toggle (`:id/modules/:module_id/toggle` vs `:tid/module`) escriben en la misma tabla `pos_tenant_modules` — riesgo de race condition.
- `GET /api/admin/tenant/:tid/flags` no tiene tabla dedicada: hace múltiples joins en runtime sin caché.
- Impersonate endpoint emite JWT nuevo: auditoría en `audit_log` es best-effort (`.catch(() => {})`).
- La tabla `pos_tenant_modules` no aparece en el schema-truth documentado en CLAUDE.md — verificar existencia en Supabase.
