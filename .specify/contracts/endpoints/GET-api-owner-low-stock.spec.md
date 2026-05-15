# Contrato: `GET /api/owner/low-stock`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/owner/low-stock`
- Método(s): GET
- Auth requerido: ✅ JWT
- Rol mínimo: admin, owner, o superadmin (enforced via `requireAuth(['admin','owner','superadmin'])`)

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body: N/A
- Query params: ninguno

## Response
- 200: array de productos con stock < 20
  ```json
  [
    {
      "id": "uuid",
      "code": "PROD-001",
      "name": "Café Americano",
      "stock": 5,
      "price": 35.00
    }
  ]
  ```
  (array vacío `[]` si todos los productos tienen stock >= 20)
- 401: token ausente/inválido
- 403: rol insuficiente (cajero no puede acceder)

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `pos_products` | SELECT | siempre; order=stock.asc limit=50 |

## Consumidores
- **POS** (`salvadorex-pos.html`):
  - El interceptor de flood-throttle (línea 114) throttlea esta ruta a 1 req/30s — indica que se llama con frecuencia (probablemente polling).
  - línea 13719: escucha `volvix:show-low-stock-tab` event — al dispararse aplica filtro de bajo stock en inventario.
  - El endpoint alimenta el badge/conteo de `low_stock_count` visible en dashboard (línea 16158).
- **PDC** (`paneldecontrol.html`):
  - También throttleado (línea 41) — indica uso desde el panel, probablemente widget de alerta en dashboard.

## Acoplamiento detectado
⚠️ El handler NO filtra por `tenant_id` — retorna todos los `pos_products` con stock < 20 SIN restricción de tenant. Si hay RLS en Supabase el filtrado es implícito (service role key lo bypasea). Riesgo: un owner podría ver productos de otro tenant si la RLS no está configurada correctamente.

⚠️ Threshold hardcodeado en `< 20` — no configurable por tenant ni por producto.

## Deudas
- **CRÍTICO**: ausencia de filtro `tenant_id` en la query. Si la service role key se usa (sin RLS activa en `pos_products`), todos los tenants ven todos los productos de bajo stock del sistema.
- `limit=50` hardcodeado — si hay más de 50 productos bajo stock, los primeros 50 por stock.asc son los más críticos, pero el resto se silencia.
- Umbral `< 20` debería ser configurable a nivel de producto o tenant.
- `pos_products` no es el nombre listado en CLAUDE.md (que menciona `volvix_productos`) — posible rename no documentado.
