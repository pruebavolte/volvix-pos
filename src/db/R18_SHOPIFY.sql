-- R18_SHOPIFY.sql — Shopify sync state + entity mappings
-- Tablas auxiliares para sincronizacion productos/ordenes/inventario con Shopify Admin API 2024-01

CREATE TABLE IF NOT EXISTS shopify_sync_state (
  tenant_id           TEXT PRIMARY KEY DEFAULT 'default',
  last_product_sync   TIMESTAMPTZ,
  last_order_sync     TIMESTAMPTZ,
  last_inventory_sync TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- type IN ('product', 'order', 'inventory_item', 'customer')
CREATE TABLE IF NOT EXISTS shopify_mappings (
  id          BIGSERIAL PRIMARY KEY,
  internal_id TEXT NOT NULL,
  shopify_id  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('product','order','inventory_item','customer','variant')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, shopify_id),
  UNIQUE (type, internal_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_mappings_internal ON shopify_mappings(internal_id);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_shopify  ON shopify_mappings(shopify_id);

-- Trigger para mantener updated_at en sync_state
CREATE OR REPLACE FUNCTION touch_shopify_sync_state() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shopify_sync_state_updated ON shopify_sync_state;
CREATE TRIGGER trg_shopify_sync_state_updated
  BEFORE UPDATE ON shopify_sync_state
  FOR EACH ROW EXECUTE FUNCTION touch_shopify_sync_state();

-- RLS opcional (admin-only)
ALTER TABLE shopify_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_mappings   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_shopify_sync_admin ON shopify_sync_state;
CREATE POLICY p_shopify_sync_admin ON shopify_sync_state
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_shopify_map_admin ON shopify_mappings;
CREATE POLICY p_shopify_map_admin ON shopify_mappings
  USING (true) WITH CHECK (true);

-- Seed default tenant row
INSERT INTO shopify_sync_state(tenant_id) VALUES ('default')
  ON CONFLICT (tenant_id) DO NOTHING;
