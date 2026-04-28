-- ============================================================================
-- VOLVIX POS — R8g Approvals & Fraud Detection
-- Migration: r8g-approvals-fraud.sql
-- ----------------------------------------------------------------------------
-- Goals (FIX-AP1..AP5):
--   * pos_price_change_approvals  (workflow para deltas > 10% sin role mgmt)
--   * trigger pos_sales_block_post_z  (immutable post-Z; sealed sales)
--   * fraud_scan() RPC  (cron-friendly fraud detection con 5 patrones)
--   * Reuse pos_security_alerts (R8c) for detected alerts
--   * Indexes + RLS idempotente
-- ----------------------------------------------------------------------------
-- Idempotente: re-correr no falla.
-- ----------------------------------------------------------------------------
-- DOCS RELACIONADOS (R9c FIX-9c-2):
--   * docs/pos-sales-state-machine.md  — diagrama y reglas de transicion
--     entre los 7 status de pos_sales (incluye trigger pos_sales_block_post_z
--     y la RPC update_sale_with_post_z_bypass introducida en R9b).
--   * docs/api-routes-conventions.md   — convenciones /api/admin vs /api/owner
--     (los handlers fraud-* estan aliados en R9c).
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. pos_price_change_approvals  (FIX-AP1)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.pos_price_change_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  sale_id           UUID,
  line_id           TEXT,
  product_id        UUID,
  original_price    NUMERIC(12,2) NOT NULL,
  requested_price   NUMERIC(12,2) NOT NULL,
  delta             NUMERIC(12,2) GENERATED ALWAYS AS (requested_price - original_price) STORED,
  delta_pct         NUMERIC(8,4),
  requested_by      UUID,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  decision_reason   TEXT,
  reason            TEXT,
  meta              JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pca_tenant_status
  ON public.pos_price_change_approvals (tenant_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_pca_sale
  ON public.pos_price_change_approvals (sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pca_pending
  ON public.pos_price_change_approvals (tenant_id, requested_at DESC) WHERE status = 'pending';

ALTER TABLE public.pos_price_change_approvals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pca_tenant_select ON public.pos_price_change_approvals; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pca_tenant_insert ON public.pos_price_change_approvals; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pca_tenant_update ON public.pos_price_change_approvals; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pca_tenant_select ON public.pos_price_change_approvals FOR SELECT
  USING (
    tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );
CREATE POLICY pca_tenant_insert ON public.pos_price_change_approvals FOR INSERT
  WITH CHECK (
    tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );
CREATE POLICY pca_tenant_update ON public.pos_price_change_approvals FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );


-- ===========================================================================
-- 2. pos_sales: extend status state machine para 'reversed' (FIX-AP3)
-- ===========================================================================
DO $$
BEGIN
  -- Drop old check si existe
  BEGIN
    ALTER TABLE public.pos_sales DROP CONSTRAINT IF EXISTS pos_sales_status_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Re-create con 'reversed' + 'partially_refunded' (legacy)
  BEGIN
    ALTER TABLE public.pos_sales
      ADD CONSTRAINT pos_sales_status_check
      CHECK (status IN ('pending','printed','paid','cancelled','refunded','reversed','partially_refunded'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- Columnas para reversal trace
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_sales' AND column_name='reversed_at'
  ) THEN
    ALTER TABLE public.pos_sales ADD COLUMN reversed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_sales' AND column_name='reversed_by'
  ) THEN
    ALTER TABLE public.pos_sales ADD COLUMN reversed_by UUID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_sales' AND column_name='reversal_reason'
  ) THEN
    ALTER TABLE public.pos_sales ADD COLUMN reversal_reason TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_sales' AND column_name='reversal_return_id'
  ) THEN
    ALTER TABLE public.pos_sales ADD COLUMN reversal_return_id UUID;
  END IF;
END $$;


-- ===========================================================================
-- 3. Trigger pos_sales_block_post_z   (FIX-AP2)
-- Si una venta tiene cut_id en cuts.status='closed' y closed_at IS NOT NULL,
-- la venta queda sealed: no se permite cambiar campos críticos.
-- Whitelist: campos de print/audit/reverse pueden mutar.
-- Bypass: contexto que setee app.allow_post_z = 'true' (compensaciones server-side).
-- ===========================================================================
-- NOTE: el trigger DEBE evitar referenciar campos que no existen en la fila
-- (PL/pgSQL planea las referencias a NEW/OLD). En este schema pos_sales NO
-- tiene cut_id, así que usamos sólo (created_at + tenant_id) para hacer match
-- contra cuts, sin tocar cut_id directamente.
CREATE OR REPLACE FUNCTION public.pos_sales_block_post_z()
RETURNS TRIGGER AS $$
DECLARE
  sealing_cut_id UUID;
  allow_flag TEXT;
BEGIN
  -- Bypass via session GUC (server-side compensaciones la setean)
  BEGIN
    allow_flag := current_setting('app.allow_post_z', true);
  EXCEPTION WHEN OTHERS THEN allow_flag := NULL;
  END;
  IF allow_flag = 'true' THEN
    RETURN NEW;
  END IF;

  -- Match por tenant + rango de tiempo
  SELECT c.id INTO sealing_cut_id
    FROM public.cuts c
   WHERE c.tenant_id::text = COALESCE(NEW.tenant_id::text, OLD.tenant_id::text)
     AND c.status IN ('closed','reconciled')
     AND c.closed_at IS NOT NULL
     AND NEW.created_at >= c.opened_at
     AND NEW.created_at <= c.closed_at
   ORDER BY c.closed_at DESC
   LIMIT 1;

  IF sealing_cut_id IS NOT NULL THEN
    -- Whitelist: permitir cambios append-only (CFDI tardío, prints, reverse-trace)
    IF
      OLD.total IS DISTINCT FROM NEW.total
      OR OLD.items IS DISTINCT FROM NEW.items
      OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
      OR (OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status NOT IN ('reversed','refunded','partially_refunded','cancelled'))
    THEN
      RAISE EXCEPTION 'Sale is sealed by closed Z (cut_id=%). Use compensation flow (POST /api/sales/:id/reverse).', sealing_cut_id
        USING ERRCODE = 'P0001', HINT = 'SALE_SEALED_BY_Z';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop+recreate trigger idempotente
DROP TRIGGER IF EXISTS trg_pos_sales_block_post_z ON public.pos_sales;

CREATE TRIGGER trg_pos_sales_block_post_z
  BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_sales_block_post_z();


-- ===========================================================================
-- 4. fraud_scan(p_tenant_id) — RPC  (FIX-AP4)
-- Detecta 5 patrones y retorna alertas (no las inserta — el endpoint las guarda).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fraud_scan(p_tenant_id TEXT)
RETURNS TABLE (
  pattern         TEXT,
  severity        TEXT,
  user_id         UUID,
  resource        TEXT,
  resource_id     TEXT,
  details         JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Patrón 1: cashier con > 5 cancels/devoluciones en 1 hora
  RETURN QUERY
    SELECT
      'cashier_high_cancels'::TEXT,
      'high'::TEXT,
      s.canceled_by,
      'pos_sales'::TEXT,
      NULL::TEXT,
      jsonb_build_object(
        'cancel_count', COUNT(*),
        'window_min', 60,
        'tenant_id', p_tenant_id
      )
    FROM public.pos_sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.status = 'cancelled'
      AND s.canceled_at >= now() - interval '1 hour'
      AND s.canceled_by IS NOT NULL
    GROUP BY s.canceled_by
    HAVING COUNT(*) > 5;

  -- Patrón 2: cashier con descuentos > 20% en > 10 ventas/día (via pos_price_overrides)
  RETURN QUERY
    SELECT
      'cashier_high_discounts'::TEXT,
      'medium'::TEXT,
      po.user_id,
      'pos_price_overrides'::TEXT,
      NULL::TEXT,
      jsonb_build_object(
        'override_count', COUNT(*),
        'avg_delta_pct', ROUND(AVG((po.original_price - po.new_price) / NULLIF(po.original_price, 0))::numeric, 4),
        'window_h', 24
      )
    FROM public.pos_price_overrides po
    WHERE po.tenant_id = p_tenant_id
      AND po.ts >= now() - interval '24 hours'
      AND po.original_price > 0
      AND ((po.original_price - po.new_price) / po.original_price) > 0.20
    GROUP BY po.user_id
    HAVING COUNT(*) > 10;

  -- Patrón 3: ventas a las 23:00-04:00 con monto > $1000
  RETURN QUERY
    SELECT
      'late_night_high_value'::TEXT,
      'medium'::TEXT,
      s.pos_user_id,
      'pos_sales'::TEXT,
      s.id::TEXT,
      jsonb_build_object(
        'total', s.total,
        'created_at', s.created_at,
        'hour', EXTRACT(HOUR FROM s.created_at)
      )
    FROM public.pos_sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.created_at >= now() - interval '1 hour'
      AND COALESCE(s.total, 0) > 1000
      AND (EXTRACT(HOUR FROM s.created_at) >= 23 OR EXTRACT(HOUR FROM s.created_at) < 4);

  -- Patrón 4: > 3 reimpresiones del mismo ticket (R8c print history)
  -- Si tabla pos_sale_prints existe, contar; si no, skip
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sale_prints') THEN
    RETURN QUERY
      SELECT
        'excessive_reprints'::TEXT,
        'low'::TEXT,
        NULL::UUID,
        'pos_sale_prints'::TEXT,
        sp.sale_id::TEXT,
        jsonb_build_object(
          'reprint_count', COUNT(*),
          'sale_id', sp.sale_id
        )
      FROM public.pos_sale_prints sp
      WHERE sp.tenant_id = p_tenant_id
        AND sp.printed_at >= now() - interval '1 hour'
      GROUP BY sp.sale_id
      HAVING COUNT(*) > 3;
  END IF;

  -- Patrón 5: usuario con > 5 lockout intentos (R6a auth)
  -- Si tabla pos_auth_failures / login_attempts existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_auth_failures') THEN
    RETURN QUERY
      SELECT
        'auth_lockout_exceeded'::TEXT,
        'high'::TEXT,
        NULL::UUID,
        'pos_auth_failures'::TEXT,
        af.email,
        jsonb_build_object(
          'fail_count', COUNT(*),
          'window_min', 15,
          'email', af.email
        )
      FROM public.pos_auth_failures af
      WHERE af.tenant_id = p_tenant_id
        AND af.ts >= now() - interval '15 minutes'
      GROUP BY af.email
      HAVING COUNT(*) >= 5;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fraud_scan(TEXT) TO authenticated, service_role;


-- ===========================================================================
-- 5. pos_security_alerts: extender schema (idempotente)
--    Versión legacy (R5c) tiene: id, user_id, tenant_id, alert_type, ip,
--    prev_ip, ts, meta, acknowledged_at.
--    Necesitamos: severity, resource, resource_id, details, resolved_at,
--    resolved_by, resolution_note.
-- ===========================================================================
DO $sec$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='severity') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'medium'
      CHECK (severity IN ('low','medium','high','critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resource') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resource TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resource_id') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resource_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='details') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN details JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resolved_at') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resolved_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resolved_by') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resolved_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resolution_note') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resolution_note TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='status') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN status TEXT NOT NULL DEFAULT 'unread'
      CHECK (status IN ('unread','investigating','resolved','dismissed'));
  END IF;
END
$sec$;

CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_severity
  ON public.pos_security_alerts (tenant_id, severity, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_status
  ON public.pos_security_alerts (tenant_id, status, ts DESC);

-- ===========================================================================
-- 5b. v_security_kpi_24h — vista para FIX-AP5 dashboard
-- ===========================================================================
CREATE OR REPLACE VIEW public.v_security_kpi_24h AS
SELECT
  tenant_id,
  COUNT(*) AS total_24h,
  COUNT(*) FILTER (WHERE severity = 'high')     AS high_count,
  COUNT(*) FILTER (WHERE severity = 'medium')   AS medium_count,
  COUNT(*) FILTER (WHERE severity = 'low')      AS low_count,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE COALESCE(status,'unread') = 'unread')        AS unread,
  COUNT(*) FILTER (WHERE COALESCE(status,'unread') = 'resolved')      AS resolved,
  COUNT(*) FILTER (WHERE COALESCE(status,'unread') = 'investigating') AS investigating
FROM public.pos_security_alerts
WHERE ts >= now() - interval '24 hours'
GROUP BY tenant_id;


-- ===========================================================================
-- 6. SMOKE QUERIES (manuales, no se ejecutan en migration)
-- ===========================================================================
-- SELECT pattern, severity, COUNT(*) FROM fraud_scan('TNT001') GROUP BY 1,2;
-- SELECT * FROM pos_price_change_approvals WHERE tenant_id='TNT001' AND status='pending';
-- SELECT * FROM v_security_kpi_24h WHERE tenant_id='TNT001';

COMMIT;

-- ============================================================================
-- END OF r8g-approvals-fraud.sql
-- ============================================================================
