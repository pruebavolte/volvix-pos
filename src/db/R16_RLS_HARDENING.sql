-- ============================================================================
-- R16_RLS_HARDENING.sql — Volvix POS GODMODE 3.4.0
-- Patches tenant-leak policies discovered in audit of R14_ALL_COMBINED.sql
-- ----------------------------------------------------------------------------
-- Findings vs. R13_RLS_POLICIES.sql baseline (all clean):
--
--   [LEAK-1] public.payments  → policy `payments_read_authenticated`
--            FOR SELECT TO authenticated USING (true)
--            Effect: any authenticated user (any tenant, any role) reads
--                    every payment row across all tenants.
--            Fix:    replace with tenant-scoped policy using
--                    app.current_tenant_id() helper.
--
--   [LEAK-2] public.error_log → policy `error_log_admin_read`
--            FOR SELECT TO authenticated USING (true)
--            Effect: cashier from tenant A sees error rows tagged with
--                    tenant_id of tenant B (PII / business intel leak).
--            Fix:    restrict to admin OR same-tenant owner.
--
-- Globally-scoped USING(true) policies INTENTIONALLY left as-is:
--   - currencies_read / fx_rates_read   → reference data, non-tenant
--   - *_service_all (service_role)      → service_role bypasses RLS anyway
--
-- Idempotent: every policy is dropped before recreation. Safe to re-run.
-- Run inside Supabase Dashboard → SQL Editor.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Sanity: helpers must already exist (defined in R13_RLS_POLICIES.sql)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'current_tenant_id'
  ) THEN
    RAISE EXCEPTION 'app.current_tenant_id() missing — run R13_RLS_POLICIES.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- [LEAK-1] payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_read_authenticated ON public.payments;

-- Re-create with strict tenant + role gating identical to R13 model.
DROP POLICY IF EXISTS payments_admin_read         ON public.payments;
DROP POLICY IF EXISTS payments_owner_read         ON public.payments;
DROP POLICY IF EXISTS payments_cajero_read        ON public.payments;

CREATE POLICY payments_admin_read ON public.payments
  FOR SELECT TO authenticated
  USING (app.is_admin());

CREATE POLICY payments_owner_read ON public.payments
  FOR SELECT TO authenticated
  USING (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY payments_cajero_read ON public.payments
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- [LEAK-2] error_log
-- ---------------------------------------------------------------------------
-- error_log.tenant_id is TEXT in current schema (R14_ERROR_LOG.sql) — cast for
-- comparison with app.current_tenant_id() which returns uuid.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "error_log_admin_read"     ON public.error_log;
DROP POLICY IF EXISTS  error_log_admin_read      ON public.error_log;
DROP POLICY IF EXISTS  error_log_owner_read      ON public.error_log;

CREATE POLICY error_log_admin_read ON public.error_log
  FOR SELECT TO authenticated
  USING (app.is_admin());

CREATE POLICY error_log_owner_read ON public.error_log
  FOR SELECT TO authenticated
  USING (
    app.is_owner()
    AND tenant_id IS NOT NULL
    AND tenant_id = app.current_tenant_id()::text
  );

-- (cashiers: default-deny — they have no business reading the error log)

-- ---------------------------------------------------------------------------
-- Verification (informational — visible in SQL Editor output)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT count(*) INTO bad_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('payments','error_log')
    AND roles @> ARRAY['authenticated']::name[]
    AND qual = 'true';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'R16: % residual USING(true) policies on payments/error_log', bad_count;
  END IF;

  RAISE NOTICE 'R16_RLS_HARDENING applied — payments + error_log are tenant-scoped.';
END $$;

COMMIT;

-- ============================================================================
-- END OF R16_RLS_HARDENING.sql
-- ============================================================================
