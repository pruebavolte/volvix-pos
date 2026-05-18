-- ============================================================================
-- R10b — NIVEL 2 (escenarios diarios)
-- Cierra los 5 escenarios que TODO negocio enfrenta CADA DÍA:
--   N2-1: Proveedor manda productos duplicados (detección antes de INSERT)
--   N2-2: Recepción parcial de mercancía (purchase orders + receive endpoint)
--   N2-3: Multi-barcode por producto (1 producto -> N códigos)
--   N2-4: Trazabilidad cambio costo + cambio proveedor (cost history)
--   N2-5: Vender bajo costo guard (margin negativo requiere aprobación)
--
-- Reusa: pos_security_alerts (R8c) + pos_price_change_approvals (R8g)
--        + idempotency_keys + volvix_audit_log
--
-- Idempotente: todas las operaciones usan IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================================

BEGIN;

-- Asegurar pgcrypto/extension uuid disponible (Supabase ya lo tiene normalmente)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================================================
-- 1. pos_purchase_orders + pos_purchase_order_items (FIX-N2-2)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.pos_purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  vendor_id       UUID,
  vendor_name     TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','partial','received','cancelled')),
  ordered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_at     TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_by      UUID,
  total_cost      NUMERIC(14,2) DEFAULT 0,
  notes           TEXT,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_tenant_status
  ON public.pos_purchase_orders (tenant_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_vendor
  ON public.pos_purchase_orders (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_pending
  ON public.pos_purchase_orders (tenant_id, expected_at)
  WHERE status IN ('open','partial');

CREATE TABLE IF NOT EXISTS public.pos_purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES public.pos_purchase_orders(id) ON DELETE CASCADE,
  product_id      UUID,
  product_code    TEXT,
  product_name    TEXT,
  ordered_qty     NUMERIC(14,3) NOT NULL CHECK (ordered_qty > 0),
  received_qty    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  pending_qty     NUMERIC(14,3) GENERATED ALWAYS AS (ordered_qty - received_qty) STORED,
  unit_cost       NUMERIC(12,4) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_po
  ON public.pos_purchase_order_items (po_id);
CREATE INDEX IF NOT EXISTS idx_poi_product
  ON public.pos_purchase_order_items (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poi_pending
  ON public.pos_purchase_order_items (po_id) WHERE received_qty < ordered_qty;

ALTER TABLE public.pos_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_purchase_order_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS po_tenant_select ON public.pos_purchase_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS po_tenant_insert ON public.pos_purchase_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS po_tenant_update ON public.pos_purchase_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS po_tenant_delete ON public.pos_purchase_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS poi_tenant_select ON public.pos_purchase_order_items; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS poi_tenant_insert ON public.pos_purchase_order_items; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS poi_tenant_update ON public.pos_purchase_order_items; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY po_tenant_select ON public.pos_purchase_orders FOR SELECT
  USING (
    tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );
CREATE POLICY po_tenant_insert ON public.pos_purchase_orders FOR INSERT
  WITH CHECK (
    tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );
CREATE POLICY po_tenant_update ON public.pos_purchase_orders FOR UPDATE
  USING (
    tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );
CREATE POLICY po_tenant_delete ON public.pos_purchase_orders FOR DELETE
  USING ((auth.jwt() ->> 'role') IN ('superadmin','admin','owner'));

CREATE POLICY poi_tenant_select ON public.pos_purchase_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_purchase_orders po
       WHERE po.id = pos_purchase_order_items.po_id
         AND (po.tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id','')
              OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner'))
    )
  );
CREATE POLICY poi_tenant_insert ON public.pos_purchase_order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pos_purchase_orders po
       WHERE po.id = pos_purchase_order_items.po_id
         AND (po.tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id','')
              OR (auth.jwt() ->> 'role') IN ('superadmin','admin'))
    )
  );
CREATE POLICY poi_tenant_update ON public.pos_purchase_order_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_purchase_orders po
       WHERE po.id = pos_purchase_order_items.po_id
         AND (po.tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id','')
              OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager'))
    )
  );

-- ===========================================================================
-- 2. pos_product_barcodes (FIX-N2-3)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.pos_product_barcodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL,
  tenant_id        TEXT,
  barcode          TEXT NOT NULL,
  qty_multiplier   NUMERIC(10,3) NOT NULL DEFAULT 1
                    CHECK (qty_multiplier > 0),
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  label            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ppb_product_barcode
  ON public.pos_product_barcodes (product_id, barcode);
CREATE INDEX IF NOT EXISTS idx_ppb_barcode
  ON public.pos_product_barcodes (barcode);
CREATE INDEX IF NOT EXISTS idx_ppb_tenant_barcode
  ON public.pos_product_barcodes (tenant_id, barcode) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppb_primary_per_product
  ON public.pos_product_barcodes (product_id) WHERE is_primary = true;

ALTER TABLE public.pos_product_barcodes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS ppb_tenant_select ON public.pos_product_barcodes; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS ppb_tenant_insert ON public.pos_product_barcodes; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS ppb_tenant_update ON public.pos_product_barcodes; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS ppb_tenant_delete ON public.pos_product_barcodes; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY ppb_tenant_select ON public.pos_product_barcodes FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );
CREATE POLICY ppb_tenant_insert ON public.pos_product_barcodes FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );
CREATE POLICY ppb_tenant_update ON public.pos_product_barcodes FOR UPDATE
  USING (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );
CREATE POLICY ppb_tenant_delete ON public.pos_product_barcodes FOR DELETE
  USING (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

-- Migrar data existente: por cada producto con barcode/code, INSERT en pos_product_barcodes
-- Nota: usamos pos_products.code como barcode si existe (legacy de v340)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pos_products' AND column_name='barcode'
  ) THEN
    INSERT INTO public.pos_product_barcodes (product_id, tenant_id, barcode, qty_multiplier, is_primary, label)
    SELECT p.id,
           NULL::text,
           p.barcode,
           1,
           true,
           'primary (migrated)'
      FROM public.pos_products p
     WHERE p.barcode IS NOT NULL
       AND length(trim(p.barcode)) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.pos_product_barcodes b
          WHERE b.product_id = p.id AND b.barcode = p.barcode
       );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- También migrar desde pos_products.code como fallback (si no hay barcode column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pos_products' AND column_name='barcode'
  ) THEN
    INSERT INTO public.pos_product_barcodes (product_id, tenant_id, barcode, qty_multiplier, is_primary, label)
    SELECT p.id,
           NULL::text,
           p.code,
           1,
           true,
           'primary (migrated from code)'
      FROM public.pos_products p
     WHERE p.code IS NOT NULL
       AND length(trim(p.code)) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.pos_product_barcodes b
          WHERE b.product_id = p.id
       );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ===========================================================================
-- 3. pos_product_cost_history (FIX-N2-4)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.pos_product_cost_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL,
  tenant_id        TEXT,
  old_cost         NUMERIC(12,4),
  new_cost         NUMERIC(12,4),
  old_vendor_id    UUID,
  new_vendor_id    UUID,
  delta            NUMERIC(12,4) GENERATED ALWAYS AS (COALESCE(new_cost,0) - COALESCE(old_cost,0)) STORED,
  delta_pct        NUMERIC(8,4),
  reason           TEXT,
  changed_by       UUID,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta             JSONB
);

CREATE INDEX IF NOT EXISTS idx_pch_product_changed
  ON public.pos_product_cost_history (product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pch_tenant_changed
  ON public.pos_product_cost_history (tenant_id, changed_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pch_high_delta
  ON public.pos_product_cost_history (tenant_id, changed_at DESC)
  WHERE abs(delta_pct) > 20;

ALTER TABLE public.pos_product_cost_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pch_tenant_select ON public.pos_product_cost_history; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pch_tenant_insert ON public.pos_product_cost_history; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pch_tenant_select ON public.pos_product_cost_history FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );
CREATE POLICY pch_tenant_insert ON public.pos_product_cost_history FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE(auth.jwt() ->> 'tenant_id', '')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );

-- Trigger sobre pos_products: si cambia cost o vendor_id → INSERT en cost_history.
-- Solo se ejecuta si pos_products tiene la columna cost (siempre la tiene en v340).
CREATE OR REPLACE FUNCTION public.fn_pos_products_cost_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant TEXT;
  v_old_vendor UUID;
  v_new_vendor UUID;
  v_changed BOOLEAN := false;
  v_pct NUMERIC;
BEGIN
  -- vendor_id puede no existir (schema legacy); detectar via to_jsonb
  v_old_vendor := NULLIF(to_jsonb(OLD)->>'vendor_id','')::uuid;
  v_new_vendor := NULLIF(to_jsonb(NEW)->>'vendor_id','')::uuid;
  v_tenant := NULLIF(to_jsonb(NEW)->>'tenant_id','');

  IF (COALESCE(OLD.cost,0) <> COALESCE(NEW.cost,0))
     OR (v_old_vendor IS DISTINCT FROM v_new_vendor) THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    IF COALESCE(OLD.cost,0) > 0 THEN
      v_pct := ((COALESCE(NEW.cost,0) - COALESCE(OLD.cost,0)) / OLD.cost) * 100;
    ELSE
      v_pct := NULL;
    END IF;

    INSERT INTO public.pos_product_cost_history
      (product_id, tenant_id, old_cost, new_cost, old_vendor_id, new_vendor_id, delta_pct, reason, meta)
    VALUES
      (NEW.id, v_tenant,
       OLD.cost, NEW.cost,
       v_old_vendor, v_new_vendor,
       v_pct,
       'auto_trigger_pos_products_update',
       jsonb_build_object('source','trigger','operation',TG_OP));

    -- Si delta_pct > 20% → alert al owner via pos_security_alerts
    IF v_pct IS NOT NULL AND abs(v_pct) > 20 THEN
      BEGIN
        INSERT INTO public.pos_security_alerts
          (tenant_id, alert_type, severity, resource, resource_id, meta)
        VALUES
          (v_tenant, 'PRODUCT_COST_CHANGE_HIGH', 'high', 'pos_products', NEW.id::text,
           jsonb_build_object('old_cost', OLD.cost, 'new_cost', NEW.cost, 'delta_pct', v_pct));
      EXCEPTION WHEN OTHERS THEN NULL; -- never block update if alerts table differs
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pos_products_cost_audit ON public.pos_products;
CREATE TRIGGER trg_pos_products_cost_audit
  AFTER UPDATE ON public.pos_products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pos_products_cost_audit();

-- ===========================================================================
-- 4. RPC helper: detectar duplicados fuzzy (FIX-N2-1)
-- Usa similarity de pg_trgm si está disponible; fallback lower+exact.
-- ===========================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.fn_find_duplicate_products(
  p_pos_user_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_price NUMERIC,
  p_threshold NUMERIC DEFAULT 0.85
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  price NUMERIC,
  cost NUMERIC,
  match_type TEXT,
  confidence NUMERIC
) AS $$
BEGIN
  -- Match exact por code (SKU) — match_type='sku_exact', confidence=1.0
  RETURN QUERY
    SELECT p.id, p.code, p.name, p.price, p.cost,
           'sku_exact'::text AS match_type,
           1.0::numeric AS confidence
      FROM public.pos_products p
     WHERE p.pos_user_id = p_pos_user_id
       AND p.code IS NOT NULL
       AND p_code IS NOT NULL
       AND lower(trim(p.code)) = lower(trim(p_code))
     LIMIT 5;

  -- Match fuzzy por nombre + price similar (±10%)
  RETURN QUERY
    SELECT p.id, p.code, p.name, p.price, p.cost,
           'name_fuzzy'::text AS match_type,
           similarity(lower(p.name), lower(p_name))::numeric AS confidence
      FROM public.pos_products p
     WHERE p.pos_user_id = p_pos_user_id
       AND p.name IS NOT NULL
       AND p_name IS NOT NULL
       AND similarity(lower(p.name), lower(p_name)) >= p_threshold
       AND (p_price IS NULL OR p.price IS NULL
            OR abs(p.price - p_price) / NULLIF(GREATEST(p.price, p_price),0) <= 0.10)
     ORDER BY similarity(lower(p.name), lower(p_name)) DESC
     LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ===========================================================================
-- 5. pos_security_alerts: garantizar columnas mínimas (idempotente)
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_security_alerts') THEN
    CREATE TABLE public.pos_security_alerts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT,
      user_id     UUID,
      alert_type  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'medium',
      resource    TEXT,
      resource_id TEXT,
      ip          TEXT,
      prev_ip     TEXT,
      meta        JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE public.pos_security_alerts ENABLE ROW LEVEL SECURITY;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='severity') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resource') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resource TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_security_alerts' AND column_name='resource_id') THEN
    ALTER TABLE public.pos_security_alerts ADD COLUMN resource_id TEXT;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-DEPLOY VERIFY (manual)
-- ============================================================================
-- SELECT count(*) FROM public.pos_purchase_orders;
-- SELECT count(*) FROM public.pos_purchase_order_items;
-- SELECT count(*) FROM public.pos_product_barcodes;
-- SELECT count(*) FROM public.pos_product_cost_history;
-- SELECT proname FROM pg_proc WHERE proname='fn_find_duplicate_products';
-- SELECT tgname FROM pg_trigger WHERE tgname='trg_pos_products_cost_audit';
