-- ============================================================================
-- VOLVIX POS — Cuts / Cortes de Caja
-- Migration: cuts.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   cuts                  (cash register sessions: open/close)
--   cuts_cash_movements   (cash in/out movements during a cut)
--
-- Status flow: open → closed → reconciled (or voided)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Main cuts table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  cashier_id            UUID NOT NULL,
  station_id            TEXT,
  opening_balance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_breakdown     JSONB,
  closing_balance       NUMERIC(12,2),
  closing_breakdown     JSONB,
  total_sales           NUMERIC(12,2) DEFAULT 0,
  total_cash_sales      NUMERIC(12,2) DEFAULT 0,
  total_card_sales      NUMERIC(12,2) DEFAULT 0,
  total_transfer_sales  NUMERIC(12,2) DEFAULT 0,
  total_other_sales     NUMERIC(12,2) DEFAULT 0,
  expected_balance      NUMERIC(12,2),
  discrepancy           NUMERIC(12,2),
  cash_in               NUMERIC(12,2) DEFAULT 0,
  cash_out              NUMERIC(12,2) DEFAULT 0,
  notes_open            TEXT,
  notes_close           TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','reconciled','voided')),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ,
  reconciled_at         TIMESTAMPTZ,
  reconciled_by         UUID,
  voided_at             TIMESTAMPTZ,
  voided_by             UUID,
  void_reason           TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuts_tenant         ON cuts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cuts_cashier        ON cuts(tenant_id, cashier_id);
CREATE INDEX IF NOT EXISTS idx_cuts_status         ON cuts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cuts_opened_at      ON cuts(tenant_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cuts_station        ON cuts(tenant_id, station_id) WHERE station_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cuts_open_per_user  ON cuts(tenant_id, cashier_id) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 2. Cash movements during a cut (entradas / salidas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuts_cash_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  cut_id        UUID NOT NULL REFERENCES cuts(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('in','out')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason        TEXT,
  reference     TEXT,
  user_id       UUID,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuts_movements_cut    ON cuts_cash_movements(cut_id);
CREATE INDEX IF NOT EXISTS idx_cuts_movements_tenant ON cuts_cash_movements(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Add cut_id to existing sales table (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'sales' AND column_name = 'cut_id'
    ) THEN
      ALTER TABLE sales ADD COLUMN cut_id UUID;
      ALTER TABLE sales
        ADD CONSTRAINT fk_sales_cut
        FOREIGN KEY (cut_id) REFERENCES cuts(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sales_cut_id ON sales(cut_id) WHERE cut_id IS NOT NULL;
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cuts_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cuts_updated_at ON cuts;
CREATE TRIGGER trg_cuts_updated_at
  BEFORE UPDATE ON cuts
  FOR EACH ROW EXECUTE FUNCTION cuts_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Function to recalculate totals on a cut from its sales
--    Call this from the app when closing a cut.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_cut_totals(p_cut_id UUID) RETURNS VOID AS $$
DECLARE
  v_total       NUMERIC(12,2) := 0;
  v_cash        NUMERIC(12,2) := 0;
  v_card        NUMERIC(12,2) := 0;
  v_transfer    NUMERIC(12,2) := 0;
  v_other       NUMERIC(12,2) := 0;
  v_in          NUMERIC(12,2) := 0;
  v_out         NUMERIC(12,2) := 0;
  v_opening     NUMERIC(12,2) := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales') THEN
    EXECUTE format('
      SELECT
        COALESCE(SUM(total),0),
        COALESCE(SUM(CASE WHEN payment_method = ''efectivo''      THEN total ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN payment_method = ''tarjeta''       THEN total ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN payment_method = ''transferencia'' THEN total ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN payment_method NOT IN (''efectivo'',''tarjeta'',''transferencia'') THEN total ELSE 0 END),0)
      FROM sales WHERE cut_id = %L', p_cut_id)
      INTO v_total, v_cash, v_card, v_transfer, v_other;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'in'  THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)
   INTO v_in, v_out
   FROM cuts_cash_movements WHERE cut_id = p_cut_id;

  SELECT opening_balance INTO v_opening FROM cuts WHERE id = p_cut_id;

  UPDATE cuts SET
    total_sales          = v_total,
    total_cash_sales     = v_cash,
    total_card_sales     = v_card,
    total_transfer_sales = v_transfer,
    total_other_sales    = v_other,
    cash_in              = v_in,
    cash_out             = v_out,
    expected_balance     = v_opening + v_cash + v_in - v_out,
    discrepancy          = COALESCE(closing_balance,0) - (v_opening + v_cash + v_in - v_out),
    updated_at           = now()
   WHERE id = p_cut_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. Audit log (best-effort; only if volvix_audit_log exists)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cuts_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      'cuts',
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      COALESCE(NEW.cashier_id, OLD.cashier_id),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cuts_audit ON cuts;
CREATE TRIGGER trg_cuts_audit
  AFTER INSERT OR UPDATE OR DELETE ON cuts
  FOR EACH ROW EXECUTE FUNCTION cuts_audit_trigger();

-- ---------------------------------------------------------------------------
-- 7. RLS — Tenant isolation
-- ---------------------------------------------------------------------------
ALTER TABLE cuts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuts_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuts_iso_read"  ON cuts;
DROP POLICY IF EXISTS "cuts_iso_write" ON cuts;
CREATE POLICY "cuts_iso_read" ON cuts
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "cuts_iso_write" ON cuts
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager','cajero')
  );

DROP POLICY IF EXISTS "cuts_mov_iso_read"  ON cuts_cash_movements;
DROP POLICY IF EXISTS "cuts_mov_iso_write" ON cuts_cash_movements;
CREATE POLICY "cuts_mov_iso_read" ON cuts_cash_movements
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "cuts_mov_iso_write" ON cuts_cash_movements
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager','cajero')
  );

COMMIT;
