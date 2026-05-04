# R17 — Devoluciones extendidas (workflow + restock)

## Alcance
Workflow completo de devoluciones con aprobación de manager, restock automático y stats.

## SQL: `db/R17_RETURNS_EXTENDED.sql`
- `pos_returns` extendido: `processed_by`, `original_payment_id`, `restock_qty bool default true`, `approved_by`, `approved_at`.
- Check `refund_method` = `cash|card|store_credit|gift_card`.
- Check `status` = `pending|approved|rejected|completed`.
- Trigger `trg_after_return_approved` -> al pasar a `approved`/`completed` con `restock_qty=true`, suma `qty` de cada item a `pos_products.stock`.
- Vista `v_returns_stats` (por dia y tenant: total, por status, refunded_total, top_reason).

## API: `api/index.js`
- `POST /api/returns`: valida `sale_id` existe en tenant, items son subset de la venta, qty <= original. Calcula refund. Crea con `status=pending`.
- `GET /api/returns?status=&customer=&from=&to=`: filtros server-side + fallback cliente para customer.
- `POST /api/returns/:id/approve`: requiere rol `manager+`. Si `refund_amount > 500` requiere `admin/superadmin`. Setea `approved_by/approved_at`.
- `POST /api/returns/:id/reject`: rol `manager+`. Permite `notes`.
- `GET /api/returns/stats?from=&to=`: tasa devoluciones (returns/sales), totales por status, refunded_total, top 5 reasons.

## Cliente: `public/volvix-returns-wiring.js`
- `VolvixReturns.render(container, saleId)`: trae venta, render checkbox por item + qty editable, dropdown razon (6 valores), dropdown metodo (4 valores), submit -> POST /api/returns.

## Validacion
- `node --check api/index.js` -> OK
- `node --check public/volvix-returns-wiring.js` -> OK
- SQL idempotente (uso de `if not exists`, drop dinamico de check antiguo).

## Slice
`live_status/slice_120.json` indices 2400-2420.
