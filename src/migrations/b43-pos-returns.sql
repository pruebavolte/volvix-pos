-- ============================================================================
-- VOLVIX POS — Returns (Devoluciones) — B43 backend megafix
-- Migration: b43-pos-returns.sql
-- ----------------------------------------------------------------------------
-- pos_returns already exists with legacy UUID-typed tenant_id.
-- This migration:
--   1. Converts tenant_id from UUID to TEXT (matches the rest of the system —
--      JWT tenant_id is "TNT001" / "TNT002" slug, not uuid).
--   2. Adds missing columns expected by spec: items, total, rejected_by,
--      rejected_at, rejection_reason, created_by, updated_at.
--   3. Re-applies RLS isolation policy with TEXT comparison.
--   4. Adds indices for the 3 common queries (tenant, sale, status).
--   5. Adds updated_at trigger.
-- ============================================================================

BEGIN;

-- 1. tenant_id UUID → TEXT (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_returns'
       AND column_name='tenant_id'
       AND data_type='uuid'
  ) THEN
    -- Drop policies that depend on the column type before altering
    EXECUTE 'DROP POLICY IF EXISTS pos_returns_iso ON pos_returns';
    EXECUTE 'DROP POLICY IF EXISTS pos_returns_iso_read  ON pos_returns';
    EXECUTE 'DROP POLICY IF EXISTS pos_returns_iso_write ON pos_returns';
    -- v_returns_stats depends on the column — drop, alter, recreate.
    EXECUTE 'DROP VIEW IF EXISTS v_returns_stats';
    EXECUTE 'ALTER TABLE pos_returns ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text';
  END IF;
END$$;

-- Recreate v_returns_stats (TEXT tenant_id)
CREATE OR REPLACE VIEW v_returns_stats AS
SELECT
  tenant_id,
  date_trunc('day', created_at) AS day,
  count(*) AS total_returns,
  count(*) FILTER (WHERE status = 'approved') AS approved_count,
  count(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  count(*) FILTER (WHERE status = 'completed') AS completed_count,
  COALESCE(sum(refund_amount) FILTER (WHERE status IN ('approved','completed')), 0::numeric) AS refunded_total,
  mode() WITHIN GROUP (ORDER BY reason) AS top_reason
FROM pos_returns r
GROUP BY tenant_id, date_trunc('day', created_at);

-- 2. Defensive ADD COLUMNs for spec-required fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='items') THEN
    ALTER TABLE pos_returns ADD COLUMN items JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='total') THEN
    ALTER TABLE pos_returns ADD COLUMN total NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='customer_id') THEN
    ALTER TABLE pos_returns ADD COLUMN customer_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='rejected_by') THEN
    ALTER TABLE pos_returns ADD COLUMN rejected_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='rejected_at') THEN
    ALTER TABLE pos_returns ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='rejection_reason') THEN
    ALTER TABLE pos_returns ADD COLUMN rejection_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='created_by') THEN
    ALTER TABLE pos_returns ADD COLUMN created_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_returns' AND column_name='updated_at') THEN
    ALTER TABLE pos_returns ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  -- Loosen status check (idempotent)
  BEGIN
    EXECUTE 'ALTER TABLE pos_returns DROP CONSTRAINT IF EXISTS pos_returns_status_check';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  EXECUTE 'ALTER TABLE pos_returns ADD CONSTRAINT pos_returns_status_check CHECK (status IN (''pending'',''approved'',''rejected'',''completed'',''cancelled''))';
  -- Make items_returned nullable (we have items JSONB now)
  BEGIN
    EXECUTE 'ALTER TABLE pos_returns ALTER COLUMN items_returned DROP NOT NULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- refund_amount nullable (allow returns with items+total to skip the legacy field)
  BEGIN
    EXECUTE 'ALTER TABLE pos_returns ALTER COLUMN refund_amount DROP NOT NULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END$$;

-- 3. RLS
ALTER TABLE pos_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_returns_iso ON pos_returns;
CREATE POLICY pos_returns_iso ON pos_returns FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');

-- 4. Indices
CREATE INDEX IF NOT EXISTS idx_returns_tenant ON pos_returns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_sale   ON pos_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON pos_returns(tenant_id, status);

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION pos_returns_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_returns_updated_at ON pos_returns;
CREATE TRIGGER trg_pos_returns_updated_at
  BEFORE UPDATE ON pos_returns
  FOR EACH ROW EXECUTE FUNCTION pos_returns_set_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
