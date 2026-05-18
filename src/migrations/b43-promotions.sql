-- ============================================================================
-- VOLVIX POS — Promotions schema fix — B43 backend megafix
-- Migration: b43-promotions.sql
-- ----------------------------------------------------------------------------
-- The existing promotions table has tenant_id BIGINT and id BIGINT, which is
-- incompatible with the rest of the system (TEXT tenant slugs "TNT001",
-- UUID ids). The IIFE at api/index.js:9460 inserts tenant_id as TEXT into
-- BIGINT → INSERT fails.
--
-- This migration:
--   1. Converts tenant_id BIGINT → TEXT
--   2. Adds spec columns: name, applies_to, product_id, min_purchase,
--      start_date (alias for starts_at), end_date (alias for ends_at),
--      coupon_code (alias for code), usage_count (alias for used_count),
--      created_by.
--   3. Re-applies RLS isolation (TEXT tenant_id).
--   4. Adds indices.
-- ============================================================================

BEGIN;

-- 1. tenant_id BIGINT → TEXT (idempotent, drops policies first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='promotions'
       AND column_name='tenant_id'
       AND data_type='bigint'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS promotions_iso ON promotions';
    EXECUTE 'DROP POLICY IF EXISTS promotions_iso_read  ON promotions';
    EXECUTE 'DROP POLICY IF EXISTS promotions_iso_write ON promotions';
    -- Drop dependent views (none expected, but be defensive)
    BEGIN
      EXECUTE 'ALTER TABLE promotions ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not alter promotions.tenant_id type: %', SQLERRM;
    END;
  END IF;
END$$;

-- 2. Add spec-expected columns idempotently
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='name') THEN
    ALTER TABLE promotions ADD COLUMN name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='applies_to') THEN
    ALTER TABLE promotions ADD COLUMN applies_to TEXT DEFAULT 'all'
      CHECK (applies_to IN ('all','category','product','cart_total'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='product_id') THEN
    ALTER TABLE promotions ADD COLUMN product_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='min_purchase') THEN
    ALTER TABLE promotions ADD COLUMN min_purchase NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='created_by') THEN
    ALTER TABLE promotions ADD COLUMN created_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='coupon_code') THEN
    ALTER TABLE promotions ADD COLUMN coupon_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='usage_count') THEN
    -- Alias for used_count; keep both for backward compat
    ALTER TABLE promotions ADD COLUMN usage_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='start_date') THEN
    ALTER TABLE promotions ADD COLUMN start_date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promotions' AND column_name='end_date') THEN
    ALTER TABLE promotions ADD COLUMN end_date TIMESTAMPTZ;
  END IF;
  -- Loosen type check to include all spec values
  BEGIN
    EXECUTE 'ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_type_check';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  EXECUTE 'ALTER TABLE promotions ADD CONSTRAINT promotions_type_check
    CHECK (type IN (''percent'',''fixed'',''amount'',''bogo'',''combo'',''free_shipping'',''first_purchase'',''loyalty_tier''))';
END$$;

-- 3. RLS
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotions_iso ON promotions;
CREATE POLICY promotions_iso ON promotions FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');

-- 4. Indices
CREATE INDEX IF NOT EXISTS idx_promo_tenant_active
  ON promotions(tenant_id, active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promo_coupon_code
  ON promotions(tenant_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_coupon_alt
  ON promotions(tenant_id, coupon_code) WHERE coupon_code IS NOT NULL;

-- 5. promotion_uses also needs tenant_id TEXT alignment if it has the column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='promotion_uses' AND column_name='tenant_id' AND data_type='bigint') THEN
    EXECUTE 'DROP POLICY IF EXISTS promotion_uses_iso ON promotion_uses';
    EXECUTE 'ALTER TABLE promotion_uses ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text';
  END IF;
END$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
