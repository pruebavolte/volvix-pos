-- R18_MARKETPLACE.sql — Marketplace multi-vendor (un Volvix con varios sellers)
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  business_name TEXT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','closed')),
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payout_method JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendors_owner ON vendors(owner_user_id);

CREATE TABLE IF NOT EXISTS vendor_products (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  custom_price NUMERIC(12,2),
  ts TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_vendorprod_vendor ON vendor_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendorprod_product ON vendor_products(product_id);

CREATE TABLE IF NOT EXISTS vendor_payouts (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  net NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','failed')),
  paid_at TIMESTAMPTZ,
  ts TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_payouts_vendor ON vendor_payouts(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_period ON vendor_payouts(period_start, period_end);

-- Revenue split por línea de venta (alimenta payouts)
CREATE TABLE IF NOT EXISTS vendor_sale_splits (
  id BIGSERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id BIGINT,
  gross NUMERIC(14,2) NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL,
  commission NUMERIC(14,2) NOT NULL,
  net NUMERIC(14,2) NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_splits_vendor_ts ON vendor_sale_splits(vendor_id, ts);
CREATE INDEX IF NOT EXISTS idx_splits_sale ON vendor_sale_splits(sale_id);
