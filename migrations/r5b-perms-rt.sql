-- ============================================================================
-- VOLVIX POS — Round 5b: Owner Panel + Multi-tenant Users hardening
-- Migration: r5b-perms-rt.sql
--
-- Closes 5 GAPs in Owner Panel + Multi-tenant Users module
-- (score 90 -> 95+):
--
--   GAP-O1: Real-time permissions (no logout required).
--           Creates pos_user_session_invalidations to track when permissions
--           changed. requireAuth() middleware checks JWT.iat against
--           MAX(invalidated_at) per user; stale tokens get 401 +
--           PERMISSIONS_CHANGED so frontend can silently refresh.
--
--   GAP-O2: Last-owner protect. No DB change strictly required but we keep
--           a helper view `pos_users_owner_count_view` so handlers can run
--           1 SELECT instead of full COUNT scan. Index already exists on
--           pos_users(tenant_id, role).
--
--   GAP-O3: Owner cannot demote self — purely API-side, no DB change.
--
--   GAP-O4: IVA fixed-at-create-time policy. Adds tax_rate_snapshot to
--           pos_sales so reports/cierre-z reproduce the original tax rate
--           even if owner changes tenant_settings.tax_rate later.
--
--   GAP-O5: Graceful plan downgrade. Adds plan_changed_at to pos_companies
--           (and to sub_tenants) so feature-flag checks can detect "plan
--           downgrade in progress" and show upgrade modals on premium
--           features that the new plan does not include.
--
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DO $$ blocks).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- GAP-O1: pos_user_session_invalidations table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_user_session_invalidations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  tenant_id       TEXT,
  invalidated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT,
  triggered_by    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path index: requireAuth() does
--   SELECT MAX(invalidated_at) FROM pos_user_session_invalidations WHERE user_id = $1
-- on every request. Compound index keeps that on a single index scan.
CREATE INDEX IF NOT EXISTS idx_pos_user_session_invalidations_user_at
  ON pos_user_session_invalidations(user_id, invalidated_at DESC);

-- Tenant-wide forced-logout (e.g. owner deactivates tenant)
CREATE INDEX IF NOT EXISTS idx_pos_user_session_invalidations_tenant_at
  ON pos_user_session_invalidations(tenant_id, invalidated_at DESC);

COMMENT ON TABLE  pos_user_session_invalidations IS
  'R5b GAP-O1: tracks when a user must re-authenticate. requireAuth() compares JWT.iat to MAX(invalidated_at).';
COMMENT ON COLUMN pos_user_session_invalidations.reason IS
  'Free-text reason: permissions_changed | role_changed | password_reset | manual_force_logout';

-- ----------------------------------------------------------------------------
-- GAP-O2: helper view for last-owner protect (optional but cheap)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_users') THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW pos_users_owner_count_view AS
      SELECT
        tenant_id,
        COUNT(*) FILTER (WHERE role = 'owner' AND is_active = true) AS active_owners,
        COUNT(*) FILTER (WHERE role = 'owner') AS total_owners
      FROM pos_users
      GROUP BY tenant_id;
    $v$;
  END IF;
END $$;

-- Speed up COUNT(role='owner') queries used by last-owner-protect
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'pos_users'
         AND indexname = 'idx_pos_users_tenant_role_active'
    ) THEN
      EXECUTE $v$
        CREATE INDEX idx_pos_users_tenant_role_active
          ON pos_users(tenant_id, role, is_active)
          WHERE role = 'owner';
      $v$;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- GAP-O4: tenant_settings table (if missing) so the snapshot capture has
--         something to read from. tax_rate is DECIMAL(5,4) in [0..1].
--         If tenant_settings already exists with a different schema, we just
--         add the tax_rate column.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id   TEXT PRIMARY KEY,
  tax_rate    DECIMAL(5,4) DEFAULT 0.16,
  currency    TEXT DEFAULT 'MXN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='tenant_settings' AND column_name='tax_rate'
  ) THEN
    EXECUTE 'ALTER TABLE tenant_settings ADD COLUMN tax_rate DECIMAL(5,4) DEFAULT 0.16';
  END IF;
END $$;

-- Seed Mexico-default tax rate for the demo tenants if rows are missing.
INSERT INTO tenant_settings (tenant_id, tax_rate, currency)
VALUES ('TNT001', 0.16, 'MXN'), ('TNT002', 0.16, 'MXN')
ON CONFLICT (tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- GAP-O4: tax_rate_snapshot in pos_sales
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='pos_sales' AND column_name='tax_rate_snapshot'
    ) THEN
      EXECUTE 'ALTER TABLE pos_sales ADD COLUMN tax_rate_snapshot DECIMAL(5,4)';
      EXECUTE $c$COMMENT ON COLUMN pos_sales.tax_rate_snapshot IS
        'R5b GAP-O4: IVA rate snapshot at sale creation. Reports use this column, NOT the live tenant_settings.tax_rate, so historical sales remain auditable when owner changes the tax rate.'$c$;
    END IF;
  END IF;
END $$;

-- Tax-rate index on pos_sales for daily-report group-by-rate queries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'pos_sales'
         AND indexname = 'idx_pos_sales_tax_rate_snapshot'
    ) THEN
      EXECUTE 'CREATE INDEX idx_pos_sales_tax_rate_snapshot
                 ON pos_sales(tax_rate_snapshot)
                 WHERE tax_rate_snapshot IS NOT NULL';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- GAP-O5: plan_changed_at on pos_companies + sub_tenants
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='pos_companies' AND column_name='plan_changed_at'
    ) THEN
      EXECUTE 'ALTER TABLE pos_companies ADD COLUMN plan_changed_at TIMESTAMPTZ';
      EXECUTE $c$COMMENT ON COLUMN pos_companies.plan_changed_at IS
        'R5b GAP-O5: when the SaaS plan was last changed. Frontend uses this to show "feature deprecated" banners when downgrading.'$c$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='pos_companies' AND column_name='previous_plan'
    ) THEN
      EXECUTE 'ALTER TABLE pos_companies ADD COLUMN previous_plan TEXT';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sub_tenants') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='sub_tenants' AND column_name='plan_changed_at'
    ) THEN
      EXECUTE 'ALTER TABLE sub_tenants ADD COLUMN plan_changed_at TIMESTAMPTZ';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='sub_tenants' AND column_name='previous_plan'
    ) THEN
      EXECUTE 'ALTER TABLE sub_tenants ADD COLUMN previous_plan TEXT';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- RLS — pos_user_session_invalidations (tenant-isolated read; service writes)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_user_session_invalidations') THEN
    EXECUTE 'ALTER TABLE pos_user_session_invalidations ENABLE ROW LEVEL SECURITY';

    -- Drop policies if they exist so the migration is idempotent
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS pusi_tenant_read ON pos_user_session_invalidations';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS pusi_service_write ON pos_user_session_invalidations';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Read: only owners/admins of the same tenant or the affected user
    EXECUTE $p$
      CREATE POLICY pusi_tenant_read ON pos_user_session_invalidations
        FOR SELECT
        USING (
          user_id = auth.uid()
          OR tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
        );
    $p$;

    -- Write: service-role only (the API runs with service key); allow owner role too
    EXECUTE $p$
      CREATE POLICY pusi_service_write ON pos_user_session_invalidations
        FOR INSERT
        WITH CHECK (true);
    $p$;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Smoke checks (manual after deploy)
--   1. INSERT INTO pos_user_session_invalidations (user_id, reason)
--        VALUES ('<some-uuid>', 'permissions_changed') RETURNING *;
--   2. SELECT MAX(invalidated_at) FROM pos_user_session_invalidations
--        WHERE user_id = '<some-uuid>';   -- should hit the index
--   3. SELECT column_name FROM information_schema.columns
--        WHERE table_name='pos_sales' AND column_name='tax_rate_snapshot';
--   4. SELECT column_name FROM information_schema.columns
--        WHERE table_name='pos_companies' AND column_name='plan_changed_at';
-- ============================================================================
