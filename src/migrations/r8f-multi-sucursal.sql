-- ============================================================================
-- VOLVIX POS — R8f Multi-sucursal Hardening
-- Migration: r8f-multi-sucursal.sql
-- ----------------------------------------------------------------------------
-- Goals:
--   * Re-shape pos_branches to support TEXT tenant slugs ("TNT001") + address + status
--   * Add branch_id to pos_users + tenant_users + pos_inventory + inventory_movements
--   * Indexes for branch-aware queries
--   * RLS basics (idempotent)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. pos_branches (legacy table; widen schema additively)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT,
  name        TEXT NOT NULL DEFAULT 'Sucursal Principal',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive ALTERs (idempotent) — schema may pre-exist with UUID tenant_id (R17_GEOFENCE)
DO $branches_alter$
BEGIN
  -- If tenant_id is UUID, convert to TEXT to match JWT slug format ("TNT001")
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pos_branches' AND column_name='tenant_id' AND data_type='uuid'
  ) THEN
    -- Drop dependent policies first (will be recreated below)
    EXECUTE 'DO $$ DECLARE r RECORD; BEGIN
       FOR r IN SELECT policyname FROM pg_policies WHERE tablename=''pos_branches'' LOOP
         EXECUTE format(''DROP POLICY IF EXISTS %I ON pos_branches'', r.policyname);
       END LOOP;
     END $$';
    ALTER TABLE public.pos_branches ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
  END IF;
END
$branches_alter$;

-- Add new columns idempotently
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS address     TEXT;
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS phone       TEXT;
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','archived','suspended'));
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS lat         DOUBLE PRECISION;
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS lng         DOUBLE PRECISION;
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS created_by  UUID;
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.pos_branches ADD COLUMN IF NOT EXISTS metadata    JSONB;

CREATE INDEX IF NOT EXISTS idx_pos_branches_tenant       ON public.pos_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_branches_status       ON public.pos_branches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_branches_active       ON public.pos_branches(tenant_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 2. pos_users — branch_id (nullable: not all users are branch-bound)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS branch_scope JSONB NULL;
-- branch_scope = JSON array of branch UUIDs the user can access. NULL = all branches.

CREATE INDEX IF NOT EXISTS idx_pos_users_branch
  ON public.pos_users(branch_id) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_users_tenant_branch
  ON public.pos_users(tenant_id, branch_id);

-- ---------------------------------------------------------------------------
-- 3. tenant_users — branch_id + branch_scope
-- ---------------------------------------------------------------------------
DO $tu_branch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_users') THEN
    EXECUTE 'ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS branch_id UUID NULL';
    EXECUTE 'ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS branch_scope JSONB NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tenant_users_branch ON public.tenant_users(tenant_id, branch_id)';
  END IF;
END
$tu_branch$;

-- ---------------------------------------------------------------------------
-- 4. pos_inventory — branch_id (nullable = stock global, available to all)
-- ---------------------------------------------------------------------------
DO $inv_branch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_inventory') THEN
    EXECUTE 'ALTER TABLE public.pos_inventory ADD COLUMN IF NOT EXISTS branch_id UUID NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_inventory_branch ON public.pos_inventory(branch_id) WHERE branch_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_inventory_tenant_branch ON public.pos_inventory(tenant_id, branch_id)';
  END IF;
END
$inv_branch$;

-- inventory_movements — branch tracking for transfers
DO $invmov_branch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_movements') THEN
    EXECUTE 'ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS branch_id UUID NULL';
    EXECUTE 'ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS branch_id_to UUID NULL';
    EXECUTE 'ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS transfer_id UUID NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invmov_branch ON public.inventory_movements(tenant_id, branch_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invmov_transfer ON public.inventory_movements(transfer_id) WHERE transfer_id IS NOT NULL';
  END IF;
END
$invmov_branch$;

-- ---------------------------------------------------------------------------
-- 5. pos_sales — branch_id (so reports can group by branch)
-- ---------------------------------------------------------------------------
DO $sales_branch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
    EXECUTE 'ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS branch_id UUID NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_branch ON public.pos_sales(tenant_id, branch_id, created_at DESC)';
  END IF;
END
$sales_branch$;

-- ---------------------------------------------------------------------------
-- 6. updated_at trigger for pos_branches
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_branches_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_branches_updated_at ON public.pos_branches;
CREATE TRIGGER trg_pos_branches_updated_at
  BEFORE UPDATE ON public.pos_branches
  FOR EACH ROW EXECUTE FUNCTION public.pos_branches_set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS — pos_branches read-by-tenant (best-effort; matches r1-pos-core pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pos_branches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_branches' AND policyname='pos_branches_tenant_select') THEN
    CREATE POLICY pos_branches_tenant_select ON public.pos_branches
      FOR SELECT TO authenticated
      USING (
        tenant_id IN (SELECT tenant_id::text FROM pos_users WHERE id::text = auth.uid()::text)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_branches' AND policyname='pos_branches_tenant_write') THEN
    CREATE POLICY pos_branches_tenant_write ON public.pos_branches
      FOR ALL TO authenticated
      USING (
        tenant_id IN (SELECT tenant_id::text FROM pos_users WHERE id::text = auth.uid()::text)
      )
      WITH CHECK (
        tenant_id IN (SELECT tenant_id::text FROM pos_users WHERE id::text = auth.uid()::text)
      );
  END IF;
  -- service_role bypass (server uses service key, RLS is best-effort UI hint)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_branches' AND policyname='pos_branches_service_role') THEN
    CREATE POLICY pos_branches_service_role ON public.pos_branches
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- SMOKE QUERIES (run manually to verify)
-- ----------------------------------------------------------------------------
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='pos_branches' AND table_schema='public'
--   ORDER BY ordinal_position;
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='pos_users' AND column_name IN ('branch_id','branch_scope');
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='pos_inventory' AND column_name='branch_id';
--
-- SELECT policyname FROM pg_policies WHERE tablename='pos_branches';
-- ============================================================================
