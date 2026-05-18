-- ============================================================================
-- VOLVIX POS — Owner Panel PATCH 503 schema fix — B43 backend megafix
-- Migration: b43-owner-panel-fix.sql
-- ----------------------------------------------------------------------------
-- PATCH /api/owner/tenants/:id was returning 503 because the handler at
-- api/index.js:12918 attempts to PATCH columns that did not exist on
-- sub_tenants in production:
--   - updated_at      (missing — handler indirectly via trigger / direct set)
--   - disabled_at     (used by DELETE handler at line 12958)
--   - owner_user_id   (used by POST /api/owner/tenants inline owner creation
--                      best-effort PATCH at line 12867)
--
-- Adds the missing columns idempotently. After this migration:
--   * PATCH /api/owner/tenants/:id with body {plan, suspended, features} works
--   * DELETE /api/owner/tenants/:id (soft delete) works
--   * POST /api/owner/tenants with owner_email/owner_password persists the
--     owner_user_id link on the new sub_tenant.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='sub_tenants' AND column_name='updated_at') THEN
    ALTER TABLE sub_tenants ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='sub_tenants' AND column_name='disabled_at') THEN
    ALTER TABLE sub_tenants ADD COLUMN disabled_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='sub_tenants' AND column_name='owner_user_id') THEN
    ALTER TABLE sub_tenants ADD COLUMN owner_user_id UUID;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_subtenants_owner_user ON sub_tenants(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION sub_tenants_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sub_tenants_updated_at ON sub_tenants;
CREATE TRIGGER trg_sub_tenants_updated_at
  BEFORE UPDATE ON sub_tenants
  FOR EACH ROW EXECUTE FUNCTION sub_tenants_set_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
