# R18 MARKETPLACE — Multi-vendor (un Volvix con varios sellers)

**Slice**: 209 · idx 3180-3200 · ts 2026-04-26

## Tablas (`db/R18_MARKETPLACE.sql`)
- **vendors**: `id, tenant_id, business_name, owner_user_id, commission_pct (0-100, def 10), status (pending|active|suspended|closed), kyc_verified, payout_method JSONB, ts`. Índices: `idx_vendors_tenant`, `idx_vendors_owner`.
- **vendor_products**: `vendor_id → vendors, product_id, custom_price?` con `UNIQUE(vendor_id,product_id)`.
- **vendor_payouts**: `vendor_id, period_start, period_end, gross, commission, net, status (pending|approved|paid|failed), paid_at` con `UNIQUE(vendor_id,period_start,period_end)` para idempotencia del cálculo.
- **vendor_sale_splits**: línea por item con `vendor_id` registrada al cerrar venta. Alimenta `payouts/calculate`.

## Endpoints (`api/index.js`)
| idx  | Método | Ruta | Auth | Notas |
|------|--------|------|------|-------|
| 3180 | GET    | /api/marketplace/vendors | tenant | filtros tenant_id, status |
| 3181 | POST   | /api/marketplace/vendors | user   | crea con commission_pct (def 10) |
| 3182 | POST   | /api/marketplace/vendors/:id/kyc | admin | docs[] requiere id_front+id_back o tax_id; activa si pending |
| 3183 | POST   | /api/marketplace/payouts/calculate?period=YYYY-MM | admin | agrega `vendor_sale_splits` del mes; UPSERT en payouts |
| 3184 | POST   | /api/marketplace/payouts/:id/pay | admin | marca paid + paid_at |

## Integración con ventas
En `POST /api/sales`, tras `dispatchWebhook('sale.created')` se llama a `global.__mpRegisterSaleSplits(saleRow, itemsIn)`. Por cada item con `vendor_id`: busca `commission_pct`, calcula `gross / commission / net` y graba en `vendor_sale_splits`. Falla silenciosa: nunca rompe la venta.

## Comisiones
`commission = gross * commission_pct / 100`, `net = gross - commission`. `gross` = `qty*price - discount` por línea.

## Próximos
Stripe Connect transfers, webhook `payout.paid`, estado `approved` intermedio con aprobación dual, Excel export por vendor.
