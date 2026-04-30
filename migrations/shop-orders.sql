-- shop_orders: e-commerce checkout persistence (volvix-shop.html)
-- Apply via: supabase db push  OR  Supabase MCP apply_migration

CREATE TABLE IF NOT EXISTS shop_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_email text,
  customer_phone text,
  customer_name text,
  shipping_address jsonb,
  items jsonb NOT NULL,
  subtotal numeric,
  shipping numeric DEFAULT 0,
  total numeric NOT NULL,
  payment_provider text,
  payment_id text,
  status text DEFAULT 'pending',
  tracking_number text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_tenant ON shop_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_email  ON shop_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_shop_orders_track  ON shop_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);
