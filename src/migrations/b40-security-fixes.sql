-- B40 SECURITY FIXES per adversarial review
-- S4: cfdi_folios needs WITH CHECK
-- S5/A4: observability + analytics need WITH CHECK
-- A5: prevent caller-controlled tenant_id from satisfying RLS

BEGIN;

-- ========================================
-- 1. observability_events — add WITH CHECK
-- ========================================
DROP POLICY IF EXISTS obs_iso ON observability_events;
CREATE POLICY obs_iso_read ON observability_events FOR SELECT
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), 'no-match-' || gen_random_uuid()::text)
  );
CREATE POLICY obs_iso_write ON observability_events FOR INSERT
  WITH CHECK (
    -- Only authenticated users can insert; tenant_id MUST match JWT or be NULL (anon)
    tenant_id IS NULL
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), 'no-match')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- ========================================
-- 2. analytics_events — add WITH CHECK
-- ========================================
DROP POLICY IF EXISTS analytics_iso ON analytics_events;
CREATE POLICY analytics_iso_read ON analytics_events FOR SELECT
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), 'no-match-' || gen_random_uuid()::text)
  );
CREATE POLICY analytics_iso_write ON analytics_events FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), 'no-match')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
