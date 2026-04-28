-- ============================================================================
-- R11 — FINAL HARDENING (post auditoría adversarial #3)
--
-- Cierra fallas residuales detectadas tras R10e:
--   FIX-R11-1: reserve_product_atomic / release_product_atomic — NULL tenant guard
--              Si p_tenant_id es NULL/empty → RAISE TENANT_REQUIRED.
--              Elimina cláusula `tenant_id IS NULL OR ...` del WHERE para evitar
--              que un caller con tenant=NULL matchee rows huérfanas de OTROS tenants.
--   FIX-R11-7: pos_payment_verifications UPDATE policy — strict tenant + role.
--              Solo owner/manager del MISMO tenant (o superadmin/admin global)
--              puede mover status. Cierra IDOR cross-tenant en verificación.
--   FIX-R11-9: pos_payment_pending_reconciliation — CHECK attempts<100 + trigger
--              auto-escalation cuando attempts>=10 → status='escalated'.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- FIX-R11-1: reserve_product_atomic NULL tenant guard
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS reserve_product_atomic(text, uuid, numeric);
DROP FUNCTION IF EXISTS reserve_product_atomic(text, text, numeric);

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
  -- R11-1: tenant es OBLIGATORIO. Sin esto un caller NULL leaktea rows huérfanas.
  IF p_tenant_id IS NULL OR LENGTH(TRIM(p_tenant_id::text)) < 3 THEN
    RAISE EXCEPTION 'TENANT_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'reserve_product_atomic rejects null/empty tenant';
  END IF;

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
  -- R11-1: tenant_id::text = p_tenant_id::text estricto (sin OR NULL)
  IF v_has_track THEN
    SELECT stock, COALESCE(track_stock, TRUE)
      INTO v_current_stock, v_track_stock
      FROM pos_products
      WHERE id = p_product_id
        AND tenant_id::text = p_tenant_id::text
      FOR UPDATE;
  ELSE
    SELECT stock
      INTO v_current_stock
      FROM pos_products
      WHERE id = p_product_id
        AND tenant_id::text = p_tenant_id::text
      FOR UPDATE;
    v_track_stock := TRUE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002', DETAIL = p_product_id::text;
  END IF;

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

-- ---------------------------------------------------------------------------
-- FIX-R11-1 (cont): release_product_atomic — mismo guard
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS release_product_atomic(text, uuid, numeric);
DROP FUNCTION IF EXISTS release_product_atomic(text, text, numeric);

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
  -- R11-1: tenant guard
  IF p_tenant_id IS NULL OR LENGTH(TRIM(p_tenant_id::text)) < 3 THEN
    RAISE EXCEPTION 'TENANT_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'release_product_atomic rejects null/empty tenant';
  END IF;

  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT stock INTO v_current_stock
    FROM pos_products
    WHERE id = p_product_id
      AND tenant_id::text = p_tenant_id::text
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
  'R11-1: reserva atómica con FOR UPDATE y guard estricto tenant_id. Rechaza tenant NULL/empty.';
COMMENT ON FUNCTION release_product_atomic(TEXT, UUID, NUMERIC) IS
  'R11-1: rollback de reserva. Guard estricto tenant_id (no NULL/empty).';

-- ---------------------------------------------------------------------------
-- FIX-R11-7: pos_payment_verifications UPDATE policy — strict tenant + role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_pay_verif_iso_update ON pos_payment_verifications;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS payment_verifications_update ON pos_payment_verifications;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY payment_verifications_update
  ON pos_payment_verifications FOR UPDATE
  USING (
    (
      tenant_id::text = (auth.jwt() ->> 'tenant_id')
      AND (auth.jwt() ->> 'role') IN ('owner','manager')
    )
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  )
  WITH CHECK (
    (
      tenant_id::text = (auth.jwt() ->> 'tenant_id')
      AND (auth.jwt() ->> 'role') IN ('owner','manager')
    )
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

COMMENT ON POLICY payment_verifications_update ON pos_payment_verifications IS
  'R11-7: UPDATE solo por owner/manager del MISMO tenant_id, o superadmin/admin globales. Cierra IDOR cross-tenant en verificación de pagos.';

-- ---------------------------------------------------------------------------
-- FIX-R11-9: pos_payment_pending_reconciliation — attempts overflow + escalate
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_attempts_max'
  ) THEN
    ALTER TABLE pos_payment_pending_reconciliation
      ADD CONSTRAINT chk_attempts_max CHECK (attempts < 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trg_escalate_high_attempts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.attempts >= 10 AND NEW.status = 'pending' THEN
    NEW.status := 'escalated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ppr_escalate ON pos_payment_pending_reconciliation;

CREATE TRIGGER ppr_escalate
  BEFORE UPDATE ON pos_payment_pending_reconciliation
  FOR EACH ROW EXECUTE FUNCTION trg_escalate_high_attempts();

COMMENT ON FUNCTION trg_escalate_high_attempts() IS
  'R11-9: si attempts>=10 y status=pending → auto-escalate. Evita loop infinito de reconciliation cron.';

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
