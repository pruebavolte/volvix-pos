-- ============================================================================
-- R10a — NIVEL 1 REAL-TIME: 5 escenarios que TODO negocio enfrenta cada minuto
-- Idempotente. 5 fixes:
-- ============================================================================
--   FIX-N1-1: pos_payment_pending_reconciliation (banco aprueba, POS no recibe)
--   FIX-N1-2: doble-clic guard (frontend-only, no DB schema)
--   FIX-N1-3: pos_print_log paper_status + pos_print_queue
--   FIX-N1-4: reserve_product_atomic + release_product_atomic (FOR UPDATE)
--   FIX-N1-5: búsqueda venta accesible 1 click (frontend-only, no DB schema)
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r10a-nivel1-realtime.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- FIX-N1-1: pos_payment_pending_reconciliation
-- Cuando POST /api/sales con tarjeta hace timeout >10s sin respuesta del PSP,
-- registramos aquí en lugar de crear pos_sales. Cron reconcilia cada 60s.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_payment_pending_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sale_id TEXT,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL,
  terminal_ref TEXT,
  psp_provider TEXT,
  cart_payload JSONB DEFAULT '{}'::jsonb,
  cashier_id TEXT,
  cashier_email TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_check_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_pay_pending_status_check') THEN
    ALTER TABLE pos_payment_pending_reconciliation
      ADD CONSTRAINT pos_pay_pending_status_check
      CHECK (status IN ('pending','resolved_paid','resolved_failed','escalated','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pos_pay_pending_tenant_status_idx
  ON pos_payment_pending_reconciliation(tenant_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS pos_pay_pending_status_lastcheck_idx
  ON pos_payment_pending_reconciliation(status, last_check_at NULLS FIRST)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS pos_pay_pending_terminal_ref_idx
  ON pos_payment_pending_reconciliation(terminal_ref)
  WHERE terminal_ref IS NOT NULL;

ALTER TABLE pos_payment_pending_reconciliation ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_pay_pending_iso_select ON pos_payment_pending_reconciliation; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_pay_pending_iso_insert ON pos_payment_pending_reconciliation; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_pay_pending_iso_update ON pos_payment_pending_reconciliation; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_pay_pending_iso_select
  ON pos_payment_pending_reconciliation FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_pay_pending_iso_insert
  ON pos_payment_pending_reconciliation FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_pay_pending_iso_update
  ON pos_payment_pending_reconciliation FOR UPDATE
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

COMMENT ON TABLE pos_payment_pending_reconciliation IS
  'R10a FIX-N1-1: pagos con tarjeta cuya respuesta del PSP nunca llegó. Cron POST /api/payments/reconcile-pending revisa cada 60s. Si attempts>10 → status=escalated.';

-- ---------------------------------------------------------------------------
-- FIX-N1-3a: ALTER pos_print_log ADD paper_status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_print_log') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='pos_print_log' AND column_name='paper_status') THEN
      ALTER TABLE pos_print_log ADD COLUMN paper_status TEXT DEFAULT 'unknown';
      COMMENT ON COLUMN pos_print_log.paper_status IS
        'R10a: estado del papel reportado por la printer ESC/POS: ok|low|out|unknown';
    END IF;

    -- Drop pre-existing CHECK on paper_status (if any) and re-add.
    BEGIN
      ALTER TABLE pos_print_log DROP CONSTRAINT IF EXISTS pos_print_log_paper_status_check;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      ALTER TABLE pos_print_log
        ADD CONSTRAINT pos_print_log_paper_status_check
        CHECK (paper_status IN ('ok','low','out','unknown'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pos_print_log_paper_status_idx
  ON pos_print_log(tenant_id, paper_status, ts DESC);

-- ---------------------------------------------------------------------------
-- FIX-N1-3b: pos_print_queue
-- Cola de tickets que no se pudieron imprimir (sin papel, USB caído).
-- Cuando se repone papel y el test_print pasa, procesa la cola.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sale_id TEXT,
  ticket_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  printer_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ,
  printed_by TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_print_queue_status_check') THEN
    ALTER TABLE pos_print_queue
      ADD CONSTRAINT pos_print_queue_status_check
      CHECK (status IN ('queued','printing','printed','cancelled','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pos_print_queue_tenant_status_idx
  ON pos_print_queue(tenant_id, status, enqueued_at);
CREATE INDEX IF NOT EXISTS pos_print_queue_sale_idx
  ON pos_print_queue(sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE pos_print_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_print_queue_iso_select ON pos_print_queue; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_print_queue_iso_insert ON pos_print_queue; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_print_queue_iso_update ON pos_print_queue; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_print_queue_iso_delete ON pos_print_queue; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_print_queue_iso_select
  ON pos_print_queue FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_print_queue_iso_insert
  ON pos_print_queue FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_print_queue_iso_update
  ON pos_print_queue FOR UPDATE
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_print_queue_iso_delete
  ON pos_print_queue FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

COMMENT ON TABLE pos_print_queue IS
  'R10a FIX-N1-3: cola de tickets cuando la impresora falla (sin papel, USB caído). Cuando se repone, se procesa la cola.';

-- ---------------------------------------------------------------------------
-- FIX-N1-4: reserve_product_atomic + release_product_atomic
-- RPC con FOR UPDATE en pos_products. Resuelve race "el último Coca-Cola"
-- entre 2 cajeros simultáneos.
-- ---------------------------------------------------------------------------

-- Drop existing functions to avoid signature clashes on re-run
DROP FUNCTION IF EXISTS reserve_product_atomic(text, uuid, numeric);
DROP FUNCTION IF EXISTS reserve_product_atomic(text, text, numeric);
DROP FUNCTION IF EXISTS release_product_atomic(text, uuid, numeric);
DROP FUNCTION IF EXISTS release_product_atomic(text, text, numeric);

CREATE OR REPLACE FUNCTION reserve_product_atomic(
  p_tenant_id TEXT,
  p_product_id UUID,
  p_qty NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock NUMERIC;
  v_track_stock BOOLEAN := TRUE;
  v_has_track BOOLEAN := FALSE;
  v_new_stock NUMERIC;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY' USING ERRCODE = 'P0001', DETAIL = COALESCE(p_qty::text, 'null');
  END IF;

  -- Detect optional track_stock column to avoid breaking on legacy schemas.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pos_products' AND column_name='track_stock'
  ) INTO v_has_track;

  -- LOCK the product row to serialize concurrent reservations
  IF v_has_track THEN
    SELECT stock, COALESCE(track_stock, TRUE)
      INTO v_current_stock, v_track_stock
      FROM pos_products
      WHERE id = p_product_id
        AND (tenant_id IS NULL OR tenant_id::text = p_tenant_id::text)
      FOR UPDATE;
  ELSE
    SELECT stock
      INTO v_current_stock
      FROM pos_products
      WHERE id = p_product_id
        AND (tenant_id IS NULL OR tenant_id::text = p_tenant_id::text)
      FOR UPDATE;
    v_track_stock := TRUE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002', DETAIL = p_product_id::text;
  END IF;

  -- Products with track_stock=false (services, custom items) bypass stock check
  IF NOT v_track_stock THEN
    RETURN COALESCE(v_current_stock, 0);
  END IF;

  IF v_current_stock IS NULL THEN
    v_current_stock := 0;
  END IF;

  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'STOCK_INSUFFICIENT'
      USING ERRCODE = 'P0001',
            DETAIL = json_build_object(
              'product_id', p_product_id::text,
              'available', v_current_stock,
              'requested', p_qty
            )::text;
  END IF;

  v_new_stock := v_current_stock - p_qty;

  UPDATE pos_products
     SET stock = v_new_stock
   WHERE id = p_product_id;

  RETURN v_new_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_product_atomic(TEXT, UUID, NUMERIC) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION release_product_atomic(
  p_tenant_id TEXT,
  p_product_id UUID,
  p_qty NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT stock INTO v_current_stock
    FROM pos_products
    WHERE id = p_product_id
      AND (tenant_id IS NULL OR tenant_id::text = p_tenant_id::text)
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_new_stock := COALESCE(v_current_stock, 0) + p_qty;

  UPDATE pos_products
     SET stock = v_new_stock
   WHERE id = p_product_id;

  RETURN v_new_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION release_product_atomic(TEXT, UUID, NUMERIC) TO authenticated, anon, service_role;

COMMENT ON FUNCTION reserve_product_atomic(TEXT, UUID, NUMERIC) IS
  'R10a FIX-N1-4: reserva atómica con FOR UPDATE. Resuelve race condition entre cajeros vendiendo el último item.';
COMMENT ON FUNCTION release_product_atomic(TEXT, UUID, NUMERIC) IS
  'R10a FIX-N1-4: rollback de reserva atómica. Usado cuando un item posterior del cart falla.';

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
COMMIT;

NOTIFY pgrst, 'reload schema';
