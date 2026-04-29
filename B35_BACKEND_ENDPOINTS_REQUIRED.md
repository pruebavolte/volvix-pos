# B35 — Backend Endpoints Required

**Generated**: 2026-04-27
**Context**: After B35 multi-agent parallel work, the frontend now expects ~36 new endpoints.
**Status**: Frontend degrades gracefully with 404 → error toast, but data won't load until backend is implemented.

## Priority 1 — CRITICAL for Core POS (Phase 1)

### Cuts / Cortes de Caja
```
POST   /api/cuts/open               body: {opening_balance, opening_breakdown, notes}
POST   /api/cuts/close              body: {cut_id, closing_balance, closing_breakdown, counted_bills, counted_coins, notes}
GET    /api/cuts/:id/summary        returns: {opening, sales[], total, expected, counted, discrepancy}
GET    /api/cuts                    query: ?from=date&to=date&cashier=user_id
GET    /api/cuts/:id                detail of single cut
```

### Inventory Movements
```
POST   /api/inventory-movements     body: {product_id, type:entrada|salida|ajuste, quantity, reason}
GET    /api/inventory-movements     query: ?from=date&to=date&product=X&type=Y
POST   /api/inventory-counts        body: {items:[{product_id, counted_qty}], notes}
```

### Product CRUD
```
PATCH  /api/products/:id            body: {name, barcode, price, cost, stock, category, description}
DELETE /api/products/:id            soft-delete (mark deleted_at)
POST   /api/products/bulk           body: {products:[...]} for CSV import
```

### Reports (Phase 2)
```
GET    /api/reports/sales              query: ?from=date&to=date&group_by=day → [{date, total, qty, avg_ticket}]
GET    /api/reports/top-products       query: ?limit=20&from=date → [{product, qty_sold, revenue, margin}]
GET    /api/reports/top-customers      query: ?limit=20 → [{customer, total_spent, txn_count}]
GET    /api/reports/inventory-turnover query: ?category=X → [{product, days_in_stock, qty_sold}]
GET    /api/reports/profit             query: ?from=date&to=date → [{product, cost, sales, margin}]
GET    /api/reports/by-cashier         query: ?from=date&to=date → [{cashier, txns, total, avg_ticket}]
```

## Priority 2 — User & Feature Flag System (Phase 3)

### Users (per tenant)
```
GET    /api/users
POST   /api/users                   body: {name, email, password, role}
PATCH  /api/users/:id               body: {name?, email?, role?}
DELETE /api/users/:id               (soft-delete: disabled_at)
GET    /api/users/:id/permissions
PATCH  /api/users/:id/permissions   body: {modules: [{key, status}]}
```

### Roles (per tenant)
```
GET    /api/roles
POST   /api/roles                   body: {name, description}
GET    /api/roles/:role/permissions
PATCH  /api/roles/:role/permissions body: {modules: [{key, status}]}
```

### Feature Flags
```
GET    /api/feature-flags?user_id=X resolved features for user (resolution: user > role > tenant > module default)
GET    /api/feature-modules         all 25 modules with metadata
GET    /api/tenant/modules          tenant-level overrides
PATCH  /api/tenant/modules/:key     body: {status: enabled|disabled|coming-soon}
```

### Module Pricing (per tier)
```
GET    /api/module-pricing
PATCH  /api/module-pricing          body: {module_key, tier, price_monthly, price_annual}
```

## Priority 3 — Customer Credit (Phase 4)

```
GET    /api/customers/:id/payments     paginated, default limit 20
POST   /api/customers/:id/payments     body: {amount, method, date, notes}
```

## Priority 4 — Owner & Admin SaaS (Phase 5)

### Owner Panel actions (37 ghost buttons rescued)
```
POST   /api/owner/tenants              body: {name, vertical, plan} — create new sub-tenant
PATCH  /api/owner/tenants/:id          body: {plan?, features?, suspended?}
DELETE /api/owner/tenants/:id          soft-disable
POST   /api/owner/seats                body: {tenant_id, seat_count, plan} — emit seats
GET    /api/owner/deploys              list of deploys
POST   /api/owner/deploys              body: {env: prod|staging, branch} — trigger deploy
POST   /api/admin/feature-flags        body: {tenant_id?, key, status} — global override
POST   /api/admin/kill-switch          body: {feature, enabled, reason} — emergency disable
POST   /api/admin/maintenance-block    body: {tenant_id?, reason, until_date}
POST   /api/admin/restart-workers      body: {worker_pool}
GET    /api/admin/billing/invoices
PATCH  /api/admin/billing/invoices/:id
GET    /api/admin/audit-log            query: ?from=date&to=date&actor=X
```

## SQL Migration Required

Run `migrations/feature-flags.sql` before activating the User Management UI. It creates:
- `feature_modules` (25 seed rows)
- `module_pricing`
- `tenant_module_overrides`
- `role_module_permissions`
- `user_module_overrides`
- 2 PG functions: `resolve_feature_status()`, `resolve_features_for_user()`
- RLS policies on all mutable tables

## Cuts table migration (NOT IN MIGRATIONS YET — needs creation)

```sql
CREATE TABLE IF NOT EXISTS cuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cashier_id UUID NOT NULL,
  opening_balance NUMERIC NOT NULL,
  opening_breakdown JSONB,
  closing_balance NUMERIC,
  closing_breakdown JSONB,
  total_sales NUMERIC,
  expected_balance NUMERIC,
  discrepancy NUMERIC,
  notes_open TEXT,
  notes_close TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE cuts ENABLE ROW LEVEL SECURITY;
-- Add RLS: tenant_id = auth.jwt() ->> 'tenant_id'

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  type TEXT CHECK (type IN ('entrada','salida','ajuste')),
  quantity INTEGER NOT NULL,
  before_qty INTEGER,
  after_qty INTEGER,
  user_id UUID,
  reason TEXT,
  sale_id UUID REFERENCES sales(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  amount NUMERIC NOT NULL,
  method TEXT,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
```

## Implementation Order Recommendation

1. **Day 1**: SQL migrations (cuts, inventory_movements, customer_payments, feature-flags)
2. **Day 1**: Cuts + Inventory endpoints (Priority 1)
3. **Day 2**: Reports endpoints (Priority 1)
4. **Day 2**: Product CRUD + bulk import (Priority 1)
5. **Day 3**: Feature flags + Users + Roles (Priority 2)
6. **Day 4**: Customer payments (Priority 3)
7. **Day 4**: Owner panel actions (Priority 4)

## Testing Strategy

For each endpoint:
1. Add to `api/index.js` route table
2. Implement with JWT verification + tenant isolation via RLS
3. Add rate-limit per tenant (use existing pattern from B31)
4. Add to OpenAPI spec at `/api/openapi.json`
5. Add Playwright test that calls the endpoint with valid + invalid JWT
6. Verify cross-tenant isolation (TOK_A cannot see TENANT_B data)

## Frontend Compatibility

All UI is built to handle 404/501 gracefully:
- Loading spinner shown during fetch
- On error: toast displays backend's `error` message or generic "Funcionalidad próximamente"
- No silent failures
- Buttons re-enable after error (no zombie loading state)

This means the backend can be rolled out **incrementally** without breaking the UI.
