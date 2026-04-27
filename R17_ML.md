# R17 — ML Inventory Predictions

## Endpoints (api/index.js)

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET  | `/api/ml/inventory/forecast?product_id=&days=30` | superadmin/admin/owner/manager | Demand forecast: 7-day moving avg + linear-regression trend + weekly seasonality factor. Returns per-day series, total, baseline, slope, confidence (1 - sd/(|baseline|+1)). |
| GET  | `/api/ml/inventory/reorder-suggestions`           | superadmin/admin/owner/manager | Lists products whose `stock / avg_daily_sales` < 14 days (or stock <= min_stock = high urgency). Suggests qty = `ceil(avg*14 - stock)`. |
| GET  | `/api/ml/sales/anomalies?days=7`                  | superadmin/admin/owner/manager | Z-score over last 60 days; flags days with `|z| > 2` as `spike` or `drop`. |
| POST | `/api/ml/products/cluster`                        | superadmin/admin/owner/manager | K-means k=3 (1-D, manual, ≤20 iter) on 30-day sales velocity. Labels A=fast, B=medium, C=slow. |

## Algorithms (pure JS, zero dependencies)

- `_mean`, `_stddev` — single-pass aggregates.
- `_movingAvg(series, 7)` — trailing 7-day window.
- `_linreg(ys)` — closed-form slope/intercept.
- `_seasonalityFactor` — average ratio of same-weekday samples vs overall mean.
- K-means k=3 — initialized at min/median/max velocity, ≤20 iterations or convergence < 1e-4.

## Database (db/R17_ML.sql)

Table `ml_predictions(id, tenant_id, product_id, type, value numeric, confidence, generated_at)`
with check constraint on `type ∈ {forecast,reorder,anomaly,cluster}`, RLS by tenant_id, and indices on tenant/product/type/generated_at.

`forecast` calls insert a row per request (tenant scoped) for retroactive accuracy review.

## Client (volvix-ml-wiring.js)

Exposes `window.VolvixML.{forecast, reorder, anomalies, cluster, refresh}`.
On `DOMContentLoaded` finds `#volvix-ml-widget` (or appends to `#dashboard`) and renders:
1. Reorder Suggestions (top 10).
2. Forecast summary for the most-urgent product.
3. Sales Anomalies (last 7d).

Auth: pulls `volvix_token` from local/sessionStorage and sends `Authorization: Bearer …`.

## Smoke

- `node -c api/index.js` → OK.
- All endpoints registered via `handlers['<METHOD> <path>']` and resolved by existing `matchRoute`.
- No new npm dependencies introduced.
