-- R17 BUNDLES: Combos / Packs de productos
-- Permite vender combos compuestos de varios productos (descuento de stock por componente)

CREATE TABLE IF NOT EXISTS product_bundles (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  sku          TEXT,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  components   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{"product_id":1,"qty":2}, ...]
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_bundles_tenant_active
  ON product_bundles (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_bundles_components_gin
  ON product_bundles USING GIN (components);

-- RLS
ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bundles_tenant_isolation ON product_bundles;
CREATE POLICY bundles_tenant_isolation ON product_bundles
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Trigger: al insertar sale_item con bundle_id => descontar stock por cada component
CREATE OR REPLACE FUNCTION fn_bundle_explode_stock()
RETURNS TRIGGER AS $$
DECLARE
  comp JSONB;
  pid  BIGINT;
  q    NUMERIC;
BEGIN
  IF NEW.bundle_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR comp IN
    SELECT jsonb_array_elements(components)
    FROM product_bundles
    WHERE id = NEW.bundle_id
  LOOP
    pid := (comp->>'product_id')::BIGINT;
    q   := COALESCE((comp->>'qty')::NUMERIC, 1) * NEW.qty;

    UPDATE products
       SET stock = stock - q,
           updated_at = now()
     WHERE id = pid;

    INSERT INTO stock_movements (tenant_id, product_id, delta, reason, ref_type, ref_id, created_at)
    VALUES (NEW.tenant_id, pid, -q, 'bundle_sale', 'sale_item', NEW.id, now());
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asegura columna bundle_id en sale_items
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS bundle_id BIGINT REFERENCES product_bundles(id);

DROP TRIGGER IF EXISTS trg_bundle_explode_stock ON sale_items;
CREATE TRIGGER trg_bundle_explode_stock
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION fn_bundle_explode_stock();

-- updated_at touch
CREATE OR REPLACE FUNCTION fn_bundles_touch()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bundles_touch ON product_bundles;
CREATE TRIGGER trg_bundles_touch
  BEFORE UPDATE ON product_bundles
  FOR EACH ROW EXECUTE FUNCTION fn_bundles_touch();
