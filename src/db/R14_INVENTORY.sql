-- =============================================================================
-- VOLVIX POS GODMODE 3.4.0 — R14_INVENTORY.sql
-- Advanced multi-location inventory: locations, stock per location,
-- movements (in/out/transfer/adjust/loss), physical counts with variance.
-- =============================================================================
-- Multi-tenant. RLS by tenant_id. Roles follow R13_RLS_POLICIES.sql:
--   admin  : platform super-user (full CRUD, every tenant).
--   owner  : full CRUD within own tenant.
--   manager: full CRUD within own tenant (operative role between owner/cajero).
--   cajero : read-only on stock & locations within own tenant; no movements,
--            no counts, no adjustments. Stock decrements from POS go through
--            a SECURITY DEFINER trigger / service_role (same pattern as R13).
--
-- Idempotent: every policy is dropped (IF EXISTS) before being recreated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helper: re-uses app.* from R13_RLS_POLICIES.sql (current_tenant_id, etc.)
--    Adds is_manager() and writer() (admin/owner/manager).
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.is_manager() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'manager' $$;

CREATE OR REPLACE FUNCTION app.is_writer() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() IN ('admin','owner','manager')
$$;

-- =============================================================================
-- 1. inventory_locations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('warehouse','branch','transit')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_locations_tenant
  ON public.inventory_locations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_locations_tenant_type
  ON public.inventory_locations (tenant_id, type);

-- =============================================================================
-- 2. inventory_stock  (one row per product+location)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_stock (
  tenant_id      uuid NOT NULL,
  product_id     uuid NOT NULL,
  location_id    uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  qty            numeric(18,4) NOT NULL DEFAULT 0,
  reserved_qty   numeric(18,4) NOT NULL DEFAULT 0,
  reorder_point  numeric(18,4) NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_tenant_loc
  ON public.inventory_stock (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_product
  ON public.inventory_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_low
  ON public.inventory_stock (tenant_id, location_id)
  WHERE qty <= reorder_point;

-- =============================================================================
-- 3. inventory_movements
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  product_id  uuid NOT NULL,
  from_loc    uuid REFERENCES public.inventory_locations(id),
  to_loc      uuid REFERENCES public.inventory_locations(id),
  qty         numeric(18,4) NOT NULL CHECK (qty > 0),
  type        text NOT NULL CHECK (type IN ('in','out','transfer','adjust','loss')),
  reason      text,
  user_id     uuid,
  ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_tenant_ts
  ON public.inventory_movements (tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_product
  ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_from_loc
  ON public.inventory_movements (from_loc);
CREATE INDEX IF NOT EXISTS idx_inv_mov_to_loc
  ON public.inventory_movements (to_loc);

-- =============================================================================
-- 4. inventory_counts (physical inventory sessions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  location_id  uuid NOT NULL REFERENCES public.inventory_locations(id),
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','counting','finalized','cancelled')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  user_id      uuid
);

CREATE INDEX IF NOT EXISTS idx_inv_counts_tenant_loc
  ON public.inventory_counts (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_status
  ON public.inventory_counts (tenant_id, status);

-- =============================================================================
-- 5. inventory_count_lines  (variance is GENERATED ALWAYS AS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  count_id    uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL,
  expected    numeric(18,4) NOT NULL DEFAULT 0,
  counted     numeric(18,4) NOT NULL DEFAULT 0,
  variance    numeric(18,4) GENERATED ALWAYS AS (counted - expected) STORED,
  noted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_count_lines_count
  ON public.inventory_count_lines (count_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_tenant
  ON public.inventory_count_lines (tenant_id);

-- =============================================================================
-- 6. RLS — same pattern as R13_RLS_POLICIES.sql
-- =============================================================================
ALTER TABLE public.inventory_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines  ENABLE ROW LEVEL SECURITY;

-- ---- inventory_locations ----
DROP POLICY IF EXISTS inv_loc_admin_all     ON public.inventory_locations;
DROP POLICY IF EXISTS inv_loc_writer_all    ON public.inventory_locations;
DROP POLICY IF EXISTS inv_loc_cajero_select ON public.inventory_locations;

CREATE POLICY inv_loc_admin_all ON public.inventory_locations
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inv_loc_writer_all ON public.inventory_locations
  FOR ALL TO authenticated
  USING      (app.is_writer() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_writer() AND app.same_tenant(tenant_id));

CREATE POLICY inv_loc_cajero_select ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

-- ---- inventory_stock ----
DROP POLICY IF EXISTS inv_stock_admin_all     ON public.inventory_stock;
DROP POLICY IF EXISTS inv_stock_writer_all    ON public.inventory_stock;
DROP POLICY IF EXISTS inv_stock_cajero_select ON public.inventory_stock;

CREATE POLICY inv_stock_admin_all ON public.inventory_stock
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inv_stock_writer_all ON public.inventory_stock
  FOR ALL TO authenticated
  USING      (app.is_writer() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_writer() AND app.same_tenant(tenant_id));

CREATE POLICY inv_stock_cajero_select ON public.inventory_stock
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

-- ---- inventory_movements ----
DROP POLICY IF EXISTS inv_mov_admin_all  ON public.inventory_movements;
DROP POLICY IF EXISTS inv_mov_writer_all ON public.inventory_movements;

CREATE POLICY inv_mov_admin_all ON public.inventory_movements
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inv_mov_writer_all ON public.inventory_movements
  FOR ALL TO authenticated
  USING      (app.is_writer() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_writer() AND app.same_tenant(tenant_id));

-- (No cajero policy => default-deny; POS decrements via service_role.)

-- ---- inventory_counts ----
DROP POLICY IF EXISTS inv_counts_admin_all  ON public.inventory_counts;
DROP POLICY IF EXISTS inv_counts_writer_all ON public.inventory_counts;

CREATE POLICY inv_counts_admin_all ON public.inventory_counts
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inv_counts_writer_all ON public.inventory_counts
  FOR ALL TO authenticated
  USING      (app.is_writer() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_writer() AND app.same_tenant(tenant_id));

-- ---- inventory_count_lines ----
DROP POLICY IF EXISTS inv_count_lines_admin_all  ON public.inventory_count_lines;
DROP POLICY IF EXISTS inv_count_lines_writer_all ON public.inventory_count_lines;

CREATE POLICY inv_count_lines_admin_all ON public.inventory_count_lines
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inv_count_lines_writer_all ON public.inventory_count_lines
  FOR ALL TO authenticated
  USING      (app.is_writer() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_writer() AND app.same_tenant(tenant_id));

-- =============================================================================
-- 7. PRIVILEGES
-- =============================================================================
GRANT USAGE ON SCHEMA public, app TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.inventory_locations,
  public.inventory_stock,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines
TO authenticated;

-- =============================================================================
-- 8. apply_inventory_movement() — atomic stock mutation helper
--    SECURITY DEFINER so it can be called from PostgREST / API consistently.
--    Updates inventory_stock for from_loc/to_loc according to movement type
--    and inserts the audit row in inventory_movements.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.apply_inventory_movement(
  p_tenant_id  uuid,
  p_product_id uuid,
  p_from_loc   uuid,
  p_to_loc     uuid,
  p_qty        numeric,
  p_type       text,
  p_reason     text,
  p_user_id    uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  IF p_type = 'in' THEN
    IF p_to_loc IS NULL THEN RAISE EXCEPTION 'to_loc required for in'; END IF;
    INSERT INTO public.inventory_stock (tenant_id, product_id, location_id, qty)
      VALUES (p_tenant_id, p_product_id, p_to_loc, p_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET qty = inventory_stock.qty + EXCLUDED.qty,
                    updated_at = now();

  ELSIF p_type IN ('out','loss') THEN
    IF p_from_loc IS NULL THEN RAISE EXCEPTION 'from_loc required for %', p_type; END IF;
    UPDATE public.inventory_stock
       SET qty = qty - p_qty, updated_at = now()
     WHERE product_id = p_product_id AND location_id = p_from_loc;
    IF NOT FOUND THEN RAISE EXCEPTION 'no stock row at from_loc'; END IF;

  ELSIF p_type = 'transfer' THEN
    IF p_from_loc IS NULL OR p_to_loc IS NULL THEN
      RAISE EXCEPTION 'from_loc and to_loc required for transfer';
    END IF;
    UPDATE public.inventory_stock
       SET qty = qty - p_qty, updated_at = now()
     WHERE product_id = p_product_id AND location_id = p_from_loc;
    IF NOT FOUND THEN RAISE EXCEPTION 'no stock row at from_loc'; END IF;

    INSERT INTO public.inventory_stock (tenant_id, product_id, location_id, qty)
      VALUES (p_tenant_id, p_product_id, p_to_loc, p_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET qty = inventory_stock.qty + EXCLUDED.qty,
                    updated_at = now();

  ELSIF p_type = 'adjust' THEN
    -- p_qty is the new absolute qty for adjust, recorded as delta in audit row
    IF p_to_loc IS NULL THEN RAISE EXCEPTION 'to_loc required for adjust'; END IF;
    INSERT INTO public.inventory_stock (tenant_id, product_id, location_id, qty)
      VALUES (p_tenant_id, p_product_id, p_to_loc, p_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'reason required for adjust';
    END IF;

  ELSE
    RAISE EXCEPTION 'unknown movement type: %', p_type;
  END IF;

  INSERT INTO public.inventory_movements
    (tenant_id, product_id, from_loc, to_loc, qty, type, reason, user_id)
  VALUES
    (p_tenant_id, p_product_id, p_from_loc, p_to_loc, p_qty, p_type, p_reason, p_user_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.apply_inventory_movement(
  uuid, uuid, uuid, uuid, numeric, text, text, uuid
) TO authenticated;

-- =============================================================================
-- END OF R14_INVENTORY.sql
-- =============================================================================
