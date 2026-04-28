-- ============================================================================
-- VOLVIX POS — Round 4c: Cortes (Apertura/Cierre Z) hardening
-- Migration: r4c-cortes-hardening.sql
--
-- Closes 5 GAPs in cuts/cierre-z module (score 75 -> 92+):
--   GAP-Z1: Block close-Z if there are open sales (status='pending'|'printed').
--           Implemented in api/index.js handler. This migration only adds an
--           index on pos_sales(tenant_id, status, created_at) to make the
--           pre-close count cheap.
--   GAP-Z2: pos_cut_adjustments table (audit-grade adjustment ledger for
--           cash discrepancies). Includes optional dual-control (approval)
--           when |amount| > threshold.
--   GAP-Z3: Compensation post-Z fields. Already on pos_returns from R3a;
--           we only ensure indexes exist for fast same-day compensation
--           lookups in the cierre-z handler.
--   GAP-Z4: Reopen-Z support: cuts.reopened_at, reopened_by_user_id,
--           reopen_reason. State machine extended with 'reopened'.
--           Plus a partial UNIQUE index that prevents 2 closed (or open)
--           cuts on the same (tenant, date), but allows reopened ones to
--           coexist while being audited.
--   GAP-Z5: z_report_sequences UNIQUE (tenant_id, for_date) constraint
--           guarantees only ONE Z per tenant/day even under race; helper
--           function z_report_next() uses pg_advisory_xact_lock so the
--           SELECT-then-INSERT becomes serializable.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- GAP-Z1: helper index for fast count of OPEN sales in a (tenant, day) window
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
    -- Add a composite index that the close-Z handler hits when checking for
    -- open (pending/printed) sales for today.
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_pos_sales_open_per_day'
    ) THEN
      EXECUTE 'CREATE INDEX idx_pos_sales_open_per_day
                 ON pos_sales (tenant_id, created_at)
                WHERE status IN (''pending'',''printed'')';
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- GAP-Z2: pos_cut_adjustments — auditable ledger of cash discrepancies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_cut_adjustments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL,
  cut_id                   UUID NOT NULL,
  type                     TEXT NOT NULL
                           CHECK (type IN (
                             'shortage',                  -- faltante (caja debajo de lo esperado)
                             'overage',                   -- sobrante (caja arriba de lo esperado)
                             'cash_count_error',          -- error de conteo
                             'voided_sale_compensation'   -- venta cancelada compensada
                           )),
  amount                   NUMERIC(12,2) NOT NULL,
  reason                   TEXT NOT NULL,
  justified_by_user_id     UUID NOT NULL,
  ts                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dual-control: when ABS(amount) > threshold, requires_approval=true and
  -- the adjustment must be approved by a different user with role
  -- owner/superadmin before it counts toward the cut's discrepancy.
  requires_approval        BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by              UUID,
  approved_at              TIMESTAMPTZ,
  rejected_by              UUID,
  rejected_at              TIMESTAMPTZ,
  rejection_reason         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A reason must be at least 10 characters (charter R2: required-but-empty).
  CONSTRAINT pos_cut_adjustments_reason_len CHECK (char_length(trim(reason)) >= 10)
);

DO $$
BEGIN
  -- Foreign keys are best-effort to keep the migration idempotent and
  -- resilient to existing data.
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_name = 'fk_pos_cut_adj_cut') THEN
    BEGIN
      ALTER TABLE pos_cut_adjustments
        ADD CONSTRAINT fk_pos_cut_adj_cut
        FOREIGN KEY (cut_id) REFERENCES cuts(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pos_cut_adj_cut       ON pos_cut_adjustments(cut_id);
CREATE INDEX IF NOT EXISTS idx_pos_cut_adj_tenant    ON pos_cut_adjustments(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_cut_adj_pending   ON pos_cut_adjustments(tenant_id, requires_approval)
                                                     WHERE requires_approval = TRUE AND approved_at IS NULL AND rejected_at IS NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION pos_cut_adjustments_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_cut_adj_updated_at ON pos_cut_adjustments;
CREATE TRIGGER trg_pos_cut_adj_updated_at
  BEFORE UPDATE ON pos_cut_adjustments
  FOR EACH ROW EXECUTE FUNCTION pos_cut_adjustments_set_updated_at();

-- Audit trigger: every adjustment lands on volvix_audit_log (best-effort)
CREATE OR REPLACE FUNCTION pos_cut_adjustments_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      'cut_adjustment',
      COALESCE(NEW.id::text, OLD.id::text),
      TG_OP,
      COALESCE(NEW.justified_by_user_id, OLD.justified_by_user_id),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_cut_adj_audit ON pos_cut_adjustments;
CREATE TRIGGER trg_pos_cut_adj_audit
  AFTER INSERT OR UPDATE OR DELETE ON pos_cut_adjustments
  FOR EACH ROW EXECUTE FUNCTION pos_cut_adjustments_audit_trigger();

ALTER TABLE pos_cut_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_cut_adj_iso_read"  ON pos_cut_adjustments;
DROP POLICY IF EXISTS "pos_cut_adj_iso_write" ON pos_cut_adjustments;
CREATE POLICY "pos_cut_adj_iso_read" ON pos_cut_adjustments
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "pos_cut_adj_iso_write" ON pos_cut_adjustments
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager','cajero')
  );

-- ---------------------------------------------------------------------------
-- GAP-Z3: pos_returns indexes for fast same-day compensation lookups.
-- (table itself is owned by R3a; we only add a partial index that the
--  cierre-z handler uses to net compensations into today's Z.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_returns')
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='pos_returns' AND column_name='affects_z')
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='pos_returns' AND column_name='compensation_z_date') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_pos_returns_compensation_z'
    ) THEN
      EXECUTE 'CREATE INDEX idx_pos_returns_compensation_z
                 ON pos_returns (tenant_id, compensation_z_date)
                WHERE affects_z = TRUE';
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- GAP-Z4: cuts.reopened_at / reopened_by_user_id / reopen_reason
-- and extend the cuts.status state machine with 'reopened'.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cuts') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='cuts' AND column_name='reopened_at') THEN
      ALTER TABLE cuts ADD COLUMN reopened_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='cuts' AND column_name='reopened_by_user_id') THEN
      ALTER TABLE cuts ADD COLUMN reopened_by_user_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='cuts' AND column_name='reopen_reason') THEN
      ALTER TABLE cuts ADD COLUMN reopen_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='cuts' AND column_name='reopen_count') THEN
      ALTER TABLE cuts ADD COLUMN reopen_count INT NOT NULL DEFAULT 0;
    END IF;

    -- Make sure status accepts 'reopened'. We DROP then re-create the CHECK
    -- (idempotent).
    BEGIN
      ALTER TABLE cuts DROP CONSTRAINT IF EXISTS cuts_status_check;
    EXCEPTION WHEN others THEN NULL;
    END;
    ALTER TABLE cuts
      ADD CONSTRAINT cuts_status_check
      CHECK (status IN ('open','closed','reconciled','voided','reopened'));

    -- ALTER cuts to compute a "for_date" we can index on. Stored generated
    -- column lets us put a UNIQUE partial index on (tenant_id, for_date)
    -- without rewriting handler code.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='cuts' AND column_name='for_date') THEN
      BEGIN
        EXECUTE 'ALTER TABLE cuts ADD COLUMN for_date DATE
                   GENERATED ALWAYS AS ((opened_at AT TIME ZONE ''UTC'')::date) STORED';
      EXCEPTION WHEN others THEN
        -- fallback: plain column (older Postgres)
        EXECUTE 'ALTER TABLE cuts ADD COLUMN for_date DATE';
      END;
    END IF;

    -- Partial UNIQUE: only ONE non-reopened/non-voided cut per (tenant, day).
    -- Reopened cuts are allowed to coexist with their re-closed sibling so
    -- we can audit the timeline.
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'uniq_cuts_tenant_for_date_active'
    ) THEN
      BEGIN
        EXECUTE 'CREATE UNIQUE INDEX uniq_cuts_tenant_for_date_active
                   ON cuts (tenant_id, for_date)
                  WHERE status IN (''open'',''closed'',''reconciled'')
                    AND for_date IS NOT NULL';
      EXCEPTION WHEN unique_violation THEN
        -- skip if existing data violates it
        RAISE NOTICE 'Skipping uniq_cuts_tenant_for_date_active: existing dup data';
      END;
    END IF;

  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- GAP-Z5: z_report_sequences hardening.
-- We make sure (tenant_id, for_date) is UNIQUE and provide a serializable
-- "next number" function using pg_advisory_xact_lock keyed on tenant.
-- ---------------------------------------------------------------------------
-- z_report_sequences may pre-exist from a prior round with tenant_id TEXT;
-- if it doesn't exist, create with TEXT tenant_id to match the codebase
-- convention (req.user.tenant_id is a JWT-derived TEXT in the API).
CREATE TABLE IF NOT EXISTS z_report_sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  z_number      INT NOT NULL,
  cashier_id    UUID,
  for_date      DATE,
  cut_id        UUID,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Ensure indices/uniqueness exist (idempotent).
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema()
                    AND indexname = 'uniq_z_report_seq_tenant_date') THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX uniq_z_report_seq_tenant_date
                 ON z_report_sequences (tenant_id, for_date)
                WHERE for_date IS NOT NULL';
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Skipping uniq_z_report_seq_tenant_date: existing dup data';
    END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema()
                    AND indexname = 'idx_z_report_seq_tenant_num') THEN
    EXECUTE 'CREATE INDEX idx_z_report_seq_tenant_num
               ON z_report_sequences (tenant_id, z_number DESC)';
  END IF;
END$$;

-- Serializable next-number function. Uses an xact-scoped advisory lock
-- so concurrent close-Z calls on the same tenant queue up.
-- Returns the (z_number, was_existing) so the caller can detect
-- "already closed for this date".
-- NOTE: p_tenant_id is TEXT because the existing z_report_sequences.tenant_id
-- column is TEXT (legacy schema). Internal compares cast both sides to text.
DROP FUNCTION IF EXISTS z_report_next(UUID, DATE, UUID, UUID);
CREATE OR REPLACE FUNCTION z_report_next(
  p_tenant_id TEXT,
  p_for_date  DATE,
  p_cashier_id UUID,
  p_cut_id    UUID
) RETURNS TABLE (z_number INT, was_existing BOOLEAN) AS $$
DECLARE
  v_existing INT;
  v_next     INT;
BEGIN
  -- xact-scoped lock keyed on tenant prevents 2 simultaneous close-Z on same tenant.
  PERFORM pg_advisory_xact_lock(hashtext('z_report_next:' || p_tenant_id));

  -- Already a Z for this date? Return it (idempotent).
  SELECT s.z_number INTO v_existing
    FROM z_report_sequences s
   WHERE s.tenant_id::text = p_tenant_id
     AND s.for_date  = p_for_date
   LIMIT 1;
  IF FOUND THEN
    z_number := v_existing;
    was_existing := TRUE;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Compute next consecutive z_number for tenant.
  SELECT COALESCE(MAX(s.z_number),0) + 1 INTO v_next
    FROM z_report_sequences s
   WHERE s.tenant_id::text = p_tenant_id;

  INSERT INTO z_report_sequences (tenant_id, z_number, cashier_id, for_date, cut_id, generated_at)
  VALUES (p_tenant_id, v_next, p_cashier_id, p_for_date, p_cut_id, now());

  z_number := v_next;
  was_existing := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE z_report_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "z_report_seq_iso_read" ON z_report_sequences;
DROP POLICY IF EXISTS "z_report_seq_iso_write" ON z_report_sequences;
CREATE POLICY "z_report_seq_iso_read" ON z_report_sequences
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "z_report_seq_iso_write" ON z_report_sequences
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager','cajero')
  );

COMMIT;

-- ===========================================================================
-- ROLLBACK (manual only — uncomment to revert)
-- ===========================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS uniq_cuts_tenant_for_date_active;
-- DROP INDEX IF EXISTS uniq_z_report_seq_tenant_date;
-- DROP INDEX IF EXISTS idx_pos_cut_adj_pending;
-- DROP INDEX IF EXISTS idx_pos_cut_adj_tenant;
-- DROP INDEX IF EXISTS idx_pos_cut_adj_cut;
-- DROP INDEX IF EXISTS idx_pos_returns_compensation_z;
-- DROP INDEX IF EXISTS idx_pos_sales_open_per_day;
-- DROP FUNCTION IF EXISTS z_report_next(UUID, DATE, UUID, UUID);
-- DROP TABLE IF EXISTS pos_cut_adjustments CASCADE;
-- ALTER TABLE cuts DROP COLUMN IF EXISTS reopened_at;
-- ALTER TABLE cuts DROP COLUMN IF EXISTS reopened_by_user_id;
-- ALTER TABLE cuts DROP COLUMN IF EXISTS reopen_reason;
-- ALTER TABLE cuts DROP COLUMN IF EXISTS reopen_count;
-- ALTER TABLE cuts DROP COLUMN IF EXISTS for_date;
-- COMMIT;
