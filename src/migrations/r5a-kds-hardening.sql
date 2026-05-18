-- ============================================================================
-- VOLVIX POS — Round 5a: KDS (Kitchen Display System) hardening
-- Migration: r5a-kds-hardening.sql
--
-- Closes 5 GAPs in KDS module (score 60 -> 88+):
--   GAP-K1: Auto-reasign by timeout. Adds reasigned_count column. The
--           started_at column already exists (R18). Adds 'needs_attention'
--           value to status check; auto-reasign endpoint flips status when
--           ticket has been 'preparing' too long without going 'ready'.
--   GAP-K2: Duplicate detection. Partial UNIQUE index on
--           (sale_id, station) WHERE status NOT IN ('served','canceled')
--           prevents two active tickets for the same sale+station. POST
--           handler also checks first and returns existing ticket if found
--           (was_existing=true). Idempotency-Key header reuses R1 table.
--   GAP-K3: Acceptance flow. Adds accepted_at TIMESTAMPTZ. Endpoint
--           POST /api/kds/tickets/:id/accept marks accepted_at=NOW().
--           POST /api/kds/check-unaccepted returns tickets older than
--           threshold without acceptance, so POS can flag kitchen_lag.
--   GAP-K4: Cross-tenant filter. Verified existing handler. This migration
--           adds idx_kds_tickets_tenant_status for fast per-tenant queries
--           and ensures tenant_id NOT NULL constraint (had DEFAULT 'TNT001'
--           since B42 fix).
--   GAP-K5: Delta sync. Adds updated_at index for fast since= filter; the
--           kds_touch trigger (R18) already maintains updated_at on every
--           UPDATE. Adds GET /api/kds/tickets?since=ISO endpoint in API.
--
-- Status state machine extended:
--   received -> preparing -> ready -> served
--                  |-> needs_attention -> preparing (after reasign)
--                  |-> canceled
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- GAP-K1: reasigned_count column + extend status check to include
--          'needs_attention'
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    -- reasigned_count: how many times this ticket has been auto-flagged for attention
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='kds_tickets' AND column_name='reasigned_count'
    ) THEN
      EXECUTE 'ALTER TABLE kds_tickets ADD COLUMN reasigned_count INT NOT NULL DEFAULT 0';
    END IF;

    -- accepted_at: cocina confirmed reception (GAP-K3)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='kds_tickets' AND column_name='accepted_at'
    ) THEN
      EXECUTE 'ALTER TABLE kds_tickets ADD COLUMN accepted_at TIMESTAMPTZ';
    END IF;

    -- last_reasigned_at: timestamp of latest auto-reasign for audit
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='kds_tickets' AND column_name='last_reasigned_at'
    ) THEN
      EXECUTE 'ALTER TABLE kds_tickets ADD COLUMN last_reasigned_at TIMESTAMPTZ';
    END IF;

  END IF;
END$$;

-- Extend status check constraint to include 'needs_attention' (separate DO block
-- because it needs DECLARE for the constraint-name loop, which is cleaner as a
-- standalone block).
DO $outer$
DECLARE
  cn TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    RETURN;
  END IF;
  -- Drop named check first
  BEGIN
    EXECUTE 'ALTER TABLE kds_tickets DROP CONSTRAINT IF EXISTS kds_tickets_status_check';
  EXCEPTION WHEN others THEN NULL;
  END;
  -- Drop any auto-named check that references status IN ('received',...)
  FOR cn IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'kds_tickets'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%received%'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE kds_tickets DROP CONSTRAINT %I', cn);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  -- Re-add with extended values (idempotent: name is deterministic)
  -- R7c CANONICALIZATION (2026-04-28): 'canceled' (americano) fue REPLACED por
  -- 'cancelled' (canonical) en migrations/r7c-canonicalize-status.sql.
  BEGIN
    EXECUTE 'ALTER TABLE kds_tickets ADD CONSTRAINT kds_tickets_status_check CHECK (status IN (''received'',''preparing'',''ready'',''served'',''cancelled'',''needs_attention''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$outer$;

-- ----------------------------------------------------------------------------
-- GAP-K2: Partial UNIQUE index — at most one active ticket per (sale_id,station)
--   Active = NOT IN ('served','canceled'). NULL sale_id is excluded (manual
--   tickets without an associated sale can repeat).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'uniq_kds_tickets_active_sale_station'
    ) THEN
      EXECUTE $idx$
        CREATE UNIQUE INDEX uniq_kds_tickets_active_sale_station
          ON kds_tickets (sale_id, station)
          WHERE sale_id IS NOT NULL
            AND status NOT IN ('served','canceled')
      $idx$;
    END IF;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- GAP-K3: Index on (tenant_id, accepted_at) WHERE accepted_at IS NULL —
--          fast lookup for "tickets pending acceptance" cron.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_kds_tickets_unaccepted'
    ) THEN
      EXECUTE $idx$
        CREATE INDEX idx_kds_tickets_unaccepted
          ON kds_tickets (tenant_id, created_at)
          WHERE accepted_at IS NULL
            AND status NOT IN ('served','canceled')
      $idx$;
    END IF;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- GAP-K4: tenant_id index for query performance + ensure NOT NULL
--   The B42 fix adds tenant_id with DEFAULT 'TNT001'; here we make it NOT NULL
--   if not already, and add the composite index for the per-tenant filter
--   that runs on every GET /api/kds/tickets/active call.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    -- Backfill any NULL tenant_id rows defensively (shouldn't happen post-B42)
    BEGIN
      EXECUTE 'UPDATE kds_tickets SET tenant_id = ''TNT001'' WHERE tenant_id IS NULL';
    EXCEPTION WHEN others THEN NULL;
    END;
    -- Then enforce NOT NULL if it's currently nullable
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='kds_tickets' AND column_name='tenant_id' AND is_nullable='YES'
    ) THEN
      BEGIN
        EXECUTE 'ALTER TABLE kds_tickets ALTER COLUMN tenant_id SET NOT NULL';
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;

    -- Composite index for per-tenant active-status queries
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_kds_tickets_tenant_status'
    ) THEN
      EXECUTE 'CREATE INDEX idx_kds_tickets_tenant_status ON kds_tickets (tenant_id, status, created_at)';
    END IF;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- GAP-K5: index on (tenant_id, updated_at) for delta-sync queries
--          (?since=ISO retrieves tickets modified after that timestamp)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kds_tickets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_kds_tickets_tenant_updated'
    ) THEN
      EXECUTE 'CREATE INDEX idx_kds_tickets_tenant_updated ON kds_tickets (tenant_id, updated_at DESC)';
    END IF;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- Helper view: kds_unaccepted_view — tickets older than 2 minutes without
-- acceptance. Used by /api/kds/check-unaccepted endpoint.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW kds_unaccepted_view AS
  SELECT
    id, tenant_id, sale_id, station, status, items, notes, priority,
    created_at, updated_at,
    EXTRACT(EPOCH FROM (NOW() - created_at))::INT AS pending_seconds
  FROM kds_tickets
  WHERE accepted_at IS NULL
    AND status NOT IN ('served','canceled')
    AND created_at < (NOW() - INTERVAL '2 minutes')
  ORDER BY created_at ASC;

-- ----------------------------------------------------------------------------
-- Helper function: kds_auto_reasign_stuck — flips 'preparing' tickets older
-- than threshold_minutes to 'needs_attention'. Returns affected ids.
-- Race-safe via SELECT ... FOR UPDATE SKIP LOCKED.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kds_auto_reasign_stuck(
  p_tenant_id TEXT,
  p_threshold_minutes INT DEFAULT 15
)
RETURNS TABLE (
  out_id UUID,
  out_sale_id UUID,
  out_station TEXT,
  out_started_at TIMESTAMPTZ,
  out_reasigned_count INT
) AS $func$
BEGIN
  RETURN QUERY
  UPDATE kds_tickets t
     SET status = 'needs_attention',
         reasigned_count = COALESCE(t.reasigned_count, 0) + 1,
         last_reasigned_at = NOW(),
         updated_at = NOW()
   WHERE t.id IN (
     SELECT k.id FROM kds_tickets k
      WHERE k.tenant_id = p_tenant_id
        AND k.status = 'preparing'
        AND k.started_at IS NOT NULL
        AND k.started_at < (NOW() - (p_threshold_minutes || ' minutes')::INTERVAL)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING t.id, t.sale_id, t.station, t.started_at, t.reasigned_count;
END;
$func$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- Smoke checks (uncomment to verify after apply)
-- ============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='kds_tickets'
--   AND column_name IN ('reasigned_count','accepted_at','last_reasigned_at','tenant_id','started_at');
-- SELECT indexname FROM pg_indexes WHERE tablename='kds_tickets';
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='kds_tickets'::regclass AND contype='c';
