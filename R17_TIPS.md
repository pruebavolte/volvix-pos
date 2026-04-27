# R17 — Sistema de Propinas (Tips)

## Resumen
Sistema completo de propinas: captura en checkout, asignación a cajero, distribución automática mediante pools configurables y reporting por staff.

## Componentes entregados

### 1. Schema (db/R17_TIPS.sql)
- **pos_sales** extendida con: `tip_amount numeric`, `tip_assigned_to uuid`, `tip_split jsonb`.
- **tip_distributions**(id, sale_id, user_id, amount, ts) — ledger histórico.
- **tip_pools**(id, tenant_id, name, members uuid[], split_method, config jsonb, active).
  - `split_method ∈ {equal, percentage, role-based}`.
  - `config.percentages = { "<uuid>": pct }` para split percentage.
  - Unique (tenant_id, name); index activo.
- **distribute_tips(p_sale_id, p_pool_id default null)** — reparte el `tip_amount` del sale entre los members del pool, persiste en tip_distributions y guarda snapshot en `pos_sales.tip_split`. Idempotente (borra repartos previos del sale antes de insertar).
- RLS: SELECT a authenticated; ALL a service_role.

### 2. API (api/index.js)
- `ALLOWED_FIELDS_SALES` extendido con tip_amount/tip_assigned_to/tip_split.
- `POST /api/sales` ahora persiste `tip_amount` + `tip_assigned_to`; el total final incluye la propina.
- `GET /api/tips/by-staff?from=&to=&user_id=` — agrega total_distributed (de tip_distributions) y total_assigned (de pos_sales.tip_assigned_to) por usuario.
- `GET /api/tips/pools` — lista pools del tenant del JWT.
- `POST /api/tips/pools` (admin/owner/superadmin) — crea pool.
- `PATCH /api/tips/pools/:id` (admin) — actualiza members/split_method/config/active.
- `DELETE /api/tips/pools/:id` (admin).
- `POST /api/tips/distribute` body `{sale_id, pool_id?}` — invoca RPC distribute_tips.

### 3. Cliente (volvix-pos-wiring.js)
- `window.posAskTip(subtotal)` → Promise con UI modal: presets 10/15/20% calculados sobre subtotal + input custom + botón "Sin propina". Devuelve `{tip_amount, tip_assigned_to}` o `null`. Asigna automáticamente al cajero de la sesión actual.

## Flujo de uso
1. Checkout: cliente acepta propina → frontend incluye `tip_amount` y `tip_assigned_to` en POST /api/sales.
2. Backend graba sale con propina (total = items + tip).
3. Cierre de turno (admin): `POST /api/tips/distribute {sale_id}` → reparte según pool activo del tenant.
4. Reporte: `GET /api/tips/by-staff?from=2026-04-01&to=2026-04-30` para nómina.

## Tests rápidos
```bash
# Crear pool
curl -X POST $API/api/tips/pools -H "Authorization: Bearer $JWT" \
  -d '{"name":"Sala A","members":["uuid-1","uuid-2"],"split_method":"equal"}'

# Venta con propina
curl -X POST $API/api/sales -H "Authorization: Bearer $JWT" \
  -d '{"items":[{"qty":1,"price":100}],"tip_amount":15,"tip_assigned_to":"uuid-1"}'

# Distribuir
curl -X POST $API/api/tips/distribute -H "Authorization: Bearer $JWT" \
  -d '{"sale_id":"<sale-uuid>"}'

# Reporte
curl "$API/api/tips/by-staff?from=2026-04-01&to=2026-04-30" -H "Authorization: Bearer $JWT"
```

## Deploy
1. Ejecutar `db/R17_TIPS.sql` en Supabase SQL Editor.
2. Redeploy de api/index.js (Vercel).
3. Verificar que `posAskTip` se invoca en el flujo de checkout existente.
