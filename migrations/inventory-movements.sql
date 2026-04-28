-- ============================================================================
-- VOLVIX POS — Inventory Movements & Physical Counts
-- Migration: inventory-movements.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   inventory_movements    (every stock change: entrada/salida/ajuste/...)
--   inventory_counts       (physical-count session)
--   inventory_count_items  (per-product line in a physical count)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Inventory movements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,           -- B39: TEXT to match JWT slug "TNT001"
  product_id   UUID NOT NULL,
  type         TEXT NOT NULL CHECK (type IN
                  ('entrada','salida','ajuste','venta','devolucion','merma','traslado')),
  quantity     NUMERIC(12,3) NOT NULL,
  before_qty   NUMERIC(12,3),
  after_qty    NUMERIC(12,3),
  unit_cost    NUMERIC(12,2),
  unit_price   NUMERIC(12,2),
  user_id      UUID,
  sale_id      UUID,
  count_id     UUID,
  location_id  UUID,
  reason       TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- B39: defensive ALTERs in case table pre-existed with legacy schema (e.g. `qty`/`ts` cols).
-- Applied at runtime in B38; here for fresh DB compatibility.
DO $invmov_alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_movements' AND table_schema='public') THEN
    -- Convert tenant_id to TEXT if it was UUID (drop dependent policies first)
    PERFORM 1 FROM information_schema.columns WHERE table_name='inventory_movements' AND column_name='tenant_id' AND data_type='uuid';
    IF FOUND THEN
      EXECUTE 'DO $$ DECLARE r RECORD; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename=''inventory_movements'' LOOP EXECUTE format(''DROP POLICY IF EXISTS %I ON inventory_movements'', r.policyname); END LOOP; END $$';
      ALTER TABLE inventory_movements ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
    END IF;
    -- Add any missing columns (idempotent)
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3);
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS before_qty NUMERIC(12,3);
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS after_qty NUMERIC(12,3);
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS sale_id UUID;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS count_id UUID;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS location_id UUID;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS metadata JSONB;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    -- Backfill created_at from legacy `ts` column if it exists and created_at is null
    PERFORM 1 FROM information_schema.columns WHERE table_name='inventory_movements' AND column_name='ts';
    IF FOUND THEN
      UPDATE inventory_movements SET created_at = COALESCE(created_at, ts, now()) WHERE created_at IS NULL;
    END IF;
  END IF;
END
$invmov_alter$;

CREATE INDEX IF NOT EXISTS idx_invmov_tenant   ON inventory_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invmov_product  ON inventory_movements(tenant_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invmov_type     ON inventory_movements(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_invmov_created  ON inventory_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invmov_sale     ON inventory_movements(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invmov_count    ON inventory_movements(count_id) WHERE count_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Physical count sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_counts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  location_id           UUID,
  started_by            UUID,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  completed_by          UUID,
  total_items           INTEGER DEFAULT 0,
  total_discrepancies   INTEGER DEFAULT 0,
  total_value_diff      NUMERIC(14,2) DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','completed','cancelled','applied')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invcounts_tenant  ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invcounts_status  ON inventory_counts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invcounts_started ON inventory_counts(tenant_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Physical count line items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  count_id      UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL,
  system_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
  counted_qty   NUMERIC(12,3),
  discrepancy   NUMERIC(12,3) GENERATED ALWAYS AS (COALESCE(counted_qty,0) - system_qty) STORED,
  unit_cost     NUMERIC(12,2),
  notes         TEXT,
  counted_by    UUID,
  counted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_invcount_items_count   ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_invcount_items_tenant  ON inventory_count_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invcount_items_product ON inventory_count_items(tenant_id, product_id);

-- ---------------------------------------------------------------------------
-- 4. Optional FK from inventory_count_items.count_id to inventory_counts is in def.
--    Add FK from inventory_movements.count_id (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_invmov_count'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT fk_invmov_count
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 5. Trigger: when a movement of type 'venta' is inserted, decrement product.stock
--    (Best-effort: only if products table has a 'stock' column.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_inventory_movement() RETURNS TRIGGER AS $$
DECLARE
  v_has_stock BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'products' AND column_name = 'stock'
  ) INTO v_has_stock;

  IF v_has_stock THEN
    IF NEW.type IN ('venta','salida','merma','traslado') THEN
      EXECUTE format(
        'UPDATE products SET stock = COALESCE(stock,0) - %s WHERE id = %L',
        NEW.quantity, NEW.product_id
      );
    ELSIF NEW.type IN ('entrada','devolucion') THEN
      EXECUTE format(
        'UPDATE products SET stock = COALESCE(stock,0) + %s WHERE id = %L',
        NEW.quantity, NEW.product_id
      );
    ELSIF NEW.type = 'ajuste' THEN
      IF NEW.after_qty IS NOT NULL THEN
        EXECUTE format(
          'UPDATE products SET stock = %s WHERE id = %L',
          NEW.after_qty, NEW.product_id
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_inv_movement ON inventory_movements;
CREATE TRIGGER trg_apply_inv_movement
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();

-- ---------------------------------------------------------------------------
-- 6. Audit log (best-effort)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      COALESCE(NEW.user_id, OLD.user_id, NEW.started_by, OLD.started_by),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invmov_audit ON inventory_movements;
CREATE TRIGGER trg_invmov_audit
  AFTER INSERT OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_audit_trigger();

DROP TRIGGER IF EXISTS trg_invcount_audit ON inventory_counts;
CREATE TRIGGER trg_invcount_audit
  AFTER INSERT OR UPDATE OR DELETE ON inventory_counts
  FOR EACH ROW EXECUTE FUNCTION inventory_audit_trigger();

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invmov_iso_read"  ON inventory_movements;
DROP POLICY IF EXISTS "invmov_iso_write" ON inventory_movements;
CREATE POLICY "invmov_iso_read" ON inventory_movements
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "invmov_iso_write" ON inventory_movements
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN
        ('superadmin','owner','admin','manager','inventario','cajero')
  );

DROP POLICY IF EXISTS "invcount_iso_read"  ON inventory_counts;
DROP POLICY IF EXISTS "invcount_iso_write" ON inventory_counts;
CREATE POLICY "invcount_iso_read" ON inventory_counts
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "invcount_iso_write" ON inventory_counts
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN
        ('superadmin','owner','admin','manager','inventario')
  );

DROP POLICY IF EXISTS "invcountitem_iso_read"  ON inventory_count_items;
DROP POLICY IF EXISTS "invcountitem_iso_write" ON inventory_count_items;
CREATE POLICY "invcountitem_iso_read" ON inventory_count_items
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "invcountitem_iso_write" ON inventory_count_items
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN
        ('superadmin','owner','admin','manager','inventario')
  );

COMMIT;
