-- R19 FIX: R18_SHOP.sql
-- Original error: relation "pos_tenants" does not exist
-- Fix: pos_tenants creada en R19_PREFLIGHT.

ALTER TABLE pos_tenants
  ADD COLUMN IF NOT EXISTS shop_slug    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shop_logo    TEXT,
  ADD COLUMN IF NOT EXISTS shop_theme   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_name    TEXT,
  ADD COLUMN IF NOT EXISTS shop_about   TEXT,
  ADD COLUMN IF NOT EXISTS shop_currency TEXT DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS shop_contact_email TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_tenants_shop_slug
  ON pos_tenants (shop_slug)
  WHERE shop_enabled = TRUE;

-- Asegurar columnas necesarias en products / sales / customers para la vista
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tenant_id   uuid,
  ADD COLUMN IF NOT EXISTS tags        text[],
  ADD COLUMN IF NOT EXISTS is_active   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS shop_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address JSONB,
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pos';

CREATE OR REPLACE VIEW shop_public_products AS
SELECT
  p.id, p.tenant_id, p.sku, p.name, p.description,
  p.price, p.currency, p.image_url, p.category_id AS category, p.stock,
  p.barcode, p.tags, t.shop_slug
FROM products p
JOIN pos_tenants t ON t.id = p.tenant_id
WHERE t.shop_enabled = TRUE
  AND COALESCE(p.is_active, TRUE) = TRUE
  AND COALESCE(p.shop_visible, TRUE) = TRUE;

CREATE INDEX IF NOT EXISTS idx_sales_source_tenant
  ON sales (tenant_id, source) WHERE source = 'shop';
CREATE INDEX IF NOT EXISTS idx_sales_guest_email
  ON sales (guest_email) WHERE guest_email IS NOT NULL;

GRANT SELECT ON shop_public_products TO anon, authenticated;
