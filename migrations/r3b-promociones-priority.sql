-- ============================================================================
-- VOLVIX POS — Round 3b: Promociones priority/concurrency hardening
-- Migration: r3b-promociones-priority.sql
--
-- Closes 5 GAPs in promotions module (score 55 -> 88+):
--   GAP-P1: priority + stackable -> deterministic resolver between 2+ promos
--   GAP-P2: deleted_at soft-delete -> in-flight sales preserved
--   GAP-P3: combinable_with_manual -> control manual discount + promo combo
--   GAP-P4: server-time enforcement (no schema change, handler-only)
--   GAP-P5: active_hours + active_days -> happy hour / day-of-week limits
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- GAP-P1: priority + stackable
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='priority') THEN
    ALTER TABLE promotions ADD COLUMN priority INT DEFAULT 100;
    COMMENT ON COLUMN promotions.priority IS
      'Lower number applies first. Default 100. Use 1-99 for high-prio promos.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='stackable') THEN
    ALTER TABLE promotions ADD COLUMN stackable BOOLEAN DEFAULT false;
    COMMENT ON COLUMN promotions.stackable IS
      'false = exclusive (only highest-priority applies). true = composes with others.';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- GAP-P3: combinable_with_manual
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='combinable_with_manual') THEN
    ALTER TABLE promotions ADD COLUMN combinable_with_manual BOOLEAN DEFAULT true;
    COMMENT ON COLUMN promotions.combinable_with_manual IS
      'If false, cashier cannot stack manual discount on top of this promo.';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- GAP-P2: soft-delete + restore
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='deleted_at') THEN
    ALTER TABLE promotions ADD COLUMN deleted_at TIMESTAMPTZ;
    COMMENT ON COLUMN promotions.deleted_at IS
      'Soft-delete timestamp. NULL = active record. NOT NULL = hidden from listings but historical sales preserve FK.';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_promo_active_not_deleted
  ON promotions(tenant_id, active)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- GAP-P5: active_hours + active_days (happy hour / day-of-week)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='active_hours') THEN
    ALTER TABLE promotions ADD COLUMN active_hours JSONB;
    COMMENT ON COLUMN promotions.active_hours IS
      'JSONB {"start":"HH:MM","end":"HH:MM"} server-tz window. NULL = always active.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='promotions' AND column_name='active_days') THEN
    ALTER TABLE promotions ADD COLUMN active_days INT[];
    COMMENT ON COLUMN promotions.active_days IS
      'Array of ISO weekday numbers 1=Mon..7=Sun. NULL or empty = all days.';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Audit: applied_promo_id on pos_sale_items (best-effort; fall back to metadata)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sale_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='pos_sale_items' AND column_name='applied_promo_id') THEN
      ALTER TABLE pos_sale_items ADD COLUMN applied_promo_id UUID;
      COMMENT ON COLUMN pos_sale_items.applied_promo_id IS
        'Promo applied to this line. May reference a soft-deleted promotion (deleted_at IS NOT NULL).';
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Reload PostgREST cache
-- ---------------------------------------------------------------------------
COMMIT;

NOTIFY pgrst, 'reload schema';
