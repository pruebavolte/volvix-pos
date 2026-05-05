-- R18 Amazon SP-API FBA mirror
CREATE TABLE IF NOT EXISTS amazon_orders_mirror (
  id BIGSERIAL PRIMARY KEY,
  amazon_order_id TEXT UNIQUE NOT NULL,
  internal_sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amzom_status ON amazon_orders_mirror(status);
CREATE INDEX IF NOT EXISTS idx_amzom_ts ON amazon_orders_mirror(ts DESC);
CREATE INDEX IF NOT EXISTS idx_amzom_internal ON amazon_orders_mirror(internal_sale_id);

ALTER TABLE amazon_orders_mirror ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amzom_all ON amazon_orders_mirror;
CREATE POLICY amzom_all ON amazon_orders_mirror FOR ALL USING (true) WITH CHECK (true);
