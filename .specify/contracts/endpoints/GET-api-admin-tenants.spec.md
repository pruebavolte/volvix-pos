# Contrato: `GET /api/admin/tenants`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/admin/tenants`
- Método(s): GET
- Auth requerido: ✅ JWT
- Rol mínimo: superadmin o platform_owner

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body: N/A
- Query params: ninguno (paginación no implementada)

## Response
- 200:
  ```json
  {
    "ok": true,
    "items": [
      {
        "id": "uuid",
        "tenant_id": "TNT-XXXXX",
        "name": "Cafetería El Sol",
        "business_type": "cafeteria",
        "plan": "starter",
        "is_active": true,
        "status": "active",
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "total": 42
  }
  ```
- 401: token ausente/inválido
- 403: `{ "ok": false, "error": "forbidden" }` — rol no es superadmin ni platform_owner
- 500: `{ "ok": false, "error": "db_error" }`

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `pos_companies` | SELECT | siempre; order=created_at.desc limit=500 |

## Consumidores
- **POS** (`salvadorex-pos.html` línea 3606): lo llama bajo impersonación para mostrar menú de tenants disponibles al superadmin. Si falla (403) no muestra el menú.
- **PDC** (`paneldecontrol.html` línea 4529): bootstrap del panel de Permisos v14. Si retorna 403 oculta la tab de permisos (`#permv14-section`).

## Acoplamiento detectado
✓ Ambos consumen el mismo shape `{ ok, items[], total }`. POS usa `items` para poblar selector; PDC lo usa para tabla de tenants en panel. Compatible.

## Deudas
- `limit=500` hardcodeado — sin paginación real. Con más de 500 tenants la lista se trunca silenciosamente.
- No hay filtro por `status` o `is_active` — retorna todos los tenants incluyendo inactivos/cancelados.
- `total` se calcula como `items.length` (ya filtrado por limit) — no refleja el total real en DB.
- Tabla `pos_companies` no figura con ese nombre exacto en el schema-truth del CLAUDE.md (que lista `volvix_tenants`). Posible rename no documentado — verificar.
