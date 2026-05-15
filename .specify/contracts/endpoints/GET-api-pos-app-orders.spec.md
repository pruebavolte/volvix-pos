# Contrato: `GET /api/pos/app-orders`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/pos/app-orders`
- Método(s): GET
- Auth requerido: ✅ JWT
- Rol mínimo: cualquier rol autenticado con `tenant_id` en el token

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body: N/A
- Query params:
  - `status` (string, opcional): filtrar por estado — ej. `nuevo`, `aceptado`, `en_preparacion`, `entregado`, `cancelado`
  - `since` (ISO string, opcional): filtrar orders creadas después de esta fecha
  - `limit` (number, opcional): máximo de resultados, default 50, máximo 200

## Response
- 200:
  ```json
  {
    "ok": true,
    "items": [
      {
        "id": 1,
        "tenant_id": "TNT-XXXXX",
        "client_email": "cliente@example.com",
        "status": "nuevo",
        "created_at": "2026-05-15T10:00:00Z",
        "notes": "...",
        "updated_at": "..."
      }
    ],
    "server_time": "2026-05-15T10:01:00Z"
  }
  ```
- 400: `{ "error": "tenant_required" }` — token no tiene `tenant_id`
- 401: token ausente/inválido

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `pos_app_orders` | SELECT | siempre; filtrado por `tenant_id` del token |

## Consumidores
- **POS** (`salvadorex-pos.html`):
  - línea 2539 (comentario): polling con modal rojo + sonido cuando hay órdenes nuevas con Ticket 1 vacío. El módulo `volvix-platform-orders.js` hace polling cada 30s.
  - Usa `status=nuevo` y `since=<last_poll>` para obtener solo órdenes recientes.
- **PDC** (`paneldecontrol.html`):
  - línea 2463 (comentario): referencia al módulo `volvix-platform-orders.js` que hace polling cada 30s a este endpoint también desde el panel de control.

## Acoplamiento detectado
✓ Ambos usan el mismo módulo externo `volvix-platform-orders.js` para hacer polling. El shape de respuesta es idéntico. Compatible.

⚠️ El handler incluye `server_time` en la respuesta — esto es útil para sincronizar el `since` param en el próximo poll. Verificar que ambos consumidores lo usen para evitar gaps o duplicados.

## Deudas
- El select es `*` (todos los campos de `pos_app_orders`) — no hay proyección explícita. Si la tabla crece con campos grandes (ej. `items` JSON array), el payload se vuelve pesado en cada poll.
- No hay WebSocket/Realtime — el polling cada 30s tiene latencia de hasta 30s para notificaciones urgentes.
- `pos_app_orders` no figura en el schema-truth del CLAUDE.md — verificar existencia y RLS en Supabase.
- Roles permitidos no están restringidos — cualquier `cajero` puede ver todas las órdenes del tenant (puede ser intencional).
