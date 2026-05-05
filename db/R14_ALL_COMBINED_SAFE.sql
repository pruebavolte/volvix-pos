-- ============================================================================
-- R14_ALL_COMBINED_SAFE.sql
-- Idempotent + safe version of R14_ALL_COMBINED.sql
-- Generated: 2026-04-26
--
-- Hardening applied vs original:
--   1. Removed DROP TABLE...CASCADE on invoice tables (data preserving).
--   2. CREATE TABLE/INDEX for invoices/invoice_lines/invoice_log → IF NOT EXISTS.
--   3. Replaced TRUNCATE vertical_templates with UNIQUE(vertical, sku) +
--      ON CONFLICT DO NOTHING re-seed.
--   4. Added SECURITY DEFINER + SET search_path on PostgREST-exposed funcs
--      (convert, seed_vertical_for_tenant, touch_api_key).
--
-- Run inside Supabase Dashboard → SQL Editor. Wrapped in transaction so any
-- failure rolls back the entire batch (no partial state).
-- ============================================================================

BEGIN;

-- ============================================
-- FILE: R14_INDEXES.sql
-- ============================================
-- =============================================================
-- R14_INDEXES.sql — Volvix POS Query Optimization
-- Generado: 2026-04-26
-- Aplicar en Supabase SQL Editor (orden no critico, IF NOT EXISTS)
-- =============================================================

-- ─────────────────────────────────────────────
-- pos_users  (login, owner panel listings)
-- ─────────────────────────────────────────────
-- Login: WHERE email = ?  (lookup unico)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_users_email
  ON pos_users (lower(email));

-- Owner panel: ORDER BY created_at DESC LIMIT 100
CREATE INDEX IF NOT EXISTS idx_pos_users_created_at_desc
  ON pos_users (created_at DESC);

-- Filtros por company / role
CREATE INDEX IF NOT EXISTS idx_pos_users_company_id
  ON pos_users (company_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_is_active
  ON pos_users (is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────
-- pos_products  (catalogo, busqueda, inventario)
-- ─────────────────────────────────────────────
-- GET /api/products: WHERE pos_user_id = ? ORDER BY name
CREATE INDEX IF NOT EXISTS idx_pos_products_user_name
  ON pos_products (pos_user_id, name);

-- SKU/code lookup (POS scan)
CREATE INDEX IF NOT EXISTS idx_pos_products_user_code
  ON pos_products (pos_user_id, code);

-- Low stock (ORDER BY stock ASC LIMIT 50)
CREATE INDEX IF NOT EXISTS idx_pos_products_stock_asc
  ON pos_products (stock ASC) WHERE stock < 50;

-- Busqueda full-text por nombre/codigo (ilike)
CREATE INDEX IF NOT EXISTS idx_pos_products_name_trgm
  ON pos_products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pos_products_code_trgm
  ON pos_products USING gin (code gin_trgm_ops);
-- (requiere: CREATE EXTENSION IF NOT EXISTS pg_trgm;)

-- Si el schema migra a multi-tenant correcto:
-- CREATE INDEX IF NOT EXISTS idx_pos_products_tenant_sku
--   ON pos_products (tenant_id, sku);

-- ─────────────────────────────────────────────
-- pos_sales  (reportes, dashboard, listing)
-- ─────────────────────────────────────────────
-- GET /api/sales: WHERE pos_user_id = ? ORDER BY created_at DESC LIMIT 100
CREATE INDEX IF NOT EXISTS idx_pos_sales_user_created_desc
  ON pos_sales (pos_user_id, created_at DESC);

-- Reportes globales: ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_pos_sales_created_at_desc
  ON pos_sales (created_at DESC);

-- Dashboard agregados (sumas por fecha)
CREATE INDEX IF NOT EXISTS idx_pos_sales_created_total
  ON pos_sales (created_at DESC, total);

-- ─────────────────────────────────────────────
-- pos_companies  (tenants)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_companies_created_at_desc
  ON pos_companies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_companies_active
  ON pos_companies (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pos_companies_owner
  ON pos_companies (owner_user_id);

-- ─────────────────────────────────────────────
-- customers  (CRM)
-- ─────────────────────────────────────────────
-- GET /api/customers: ORDER BY created_at DESC LIMIT 100
CREATE INDEX IF NOT EXISTS idx_customers_user_created_desc
  ON customers (user_id, created_at DESC);

-- Lookups por email/telefono
CREATE INDEX IF NOT EXISTS idx_customers_email
  ON customers (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON customers (active) WHERE active = true;

-- ─────────────────────────────────────────────
-- pos_login_events  (auditoria)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_login_events_user_created
  ON pos_login_events (pos_user_id, created_at DESC);

-- ─────────────────────────────────────────────
-- generic_blobs  (TOP10 wiring K/V)
-- ─────────────────────────────────────────────
-- GET: WHERE pos_user_id = ? AND key = ? ORDER BY updated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_generic_blobs_user_key_updated
  ON generic_blobs (pos_user_id, key, updated_at DESC);

-- GIN sobre JSONB value para queries internas (si aplica)
CREATE INDEX IF NOT EXISTS idx_generic_blobs_value_gin
  ON generic_blobs USING gin (value);

-- ─────────────────────────────────────────────
-- licenses / domains / billing_configs / sync_queue
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_licenses_created_at_desc
  ON licenses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licenses_key
  ON licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_active
  ON licenses (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_domains_created_at_desc
  ON domains (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_configs_created_at_desc
  ON billing_configs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at_desc
  ON sync_queue (created_at DESC);

-- ─────────────────────────────────────────────
-- daily_sales_report (vista materializada o tabla)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_sales_report_date_desc
  ON daily_sales_report (sale_date DESC);

-- ─────────────────────────────────────────────
-- audit_log (si existe, JSONB GIN)
-- ─────────────────────────────────────────────
-- CREATE INDEX IF NOT EXISTS idx_audit_log_payload_gin
--   ON audit_log USING gin (payload);
-- CREATE INDEX IF NOT EXISTS idx_audit_log_created_desc
--   ON audit_log (created_at DESC);

-- ─────────────────────────────────────────────
-- inventory_movements (si existe)
-- ─────────────────────────────────────────────
-- CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
--   ON inventory_movements (product_id, created_at DESC);

-- =============================================================
-- EXTENSIONES REQUERIDAS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =============================================================
-- POST-INSTALL: ANALYZE para refrescar stats del planner
-- =============================================================
ANALYZE pos_users;
ANALYZE pos_products;
ANALYZE pos_sales;
ANALYZE pos_companies;
ANALYZE customers;
ANALYZE generic_blobs;

--- next file ---

-- ============================================
-- FILE: R14_INVENTORY.sql
-- ============================================
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

--- next file ---

-- ============================================
-- FILE: R14_LOYALTY.sql
-- ============================================
-- ============================================================================
-- R14_LOYALTY.sql — Programa de Lealtad Volvix POS
-- ----------------------------------------------------------------------------
-- Crea tablas de tiers, transacciones de puntos, extiende customers,
-- agrega función `recompute_customer_points` y trigger `after_sale_insert`.
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- 0. CUSTOMERS (si no existe en el esquema base)
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references volvix_tenants(id) on delete cascade,
  nombre          text not null,
  email           text,
  telefono        text,
  rfc             text,
  notas           text,
  activo          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists customers_tenant_idx on customers(tenant_id);
create index if not exists customers_email_idx  on customers(email);

-- ── Extender customers con campos de lealtad ────────────────────────────────
alter table customers
  add column if not exists loyalty_points  integer not null default 0,
  add column if not exists current_tier_id uuid,
  add column if not exists last_visit_at   timestamptz;

-- ============================================================================
-- 1. LOYALTY_TIERS — niveles configurables por tenant
-- ============================================================================
create table if not exists loyalty_tiers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references volvix_tenants(id) on delete cascade,
  name        text not null,
  min_points  integer not null default 0,
  multiplier  numeric(5,2) not null default 1.00,
  perks       jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (tenant_id, name)
);
create index if not exists loyalty_tiers_tenant_idx
  on loyalty_tiers(tenant_id, min_points);

-- FK retrasada de customers.current_tier_id → loyalty_tiers.id
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_current_tier_fk'
  ) then
    alter table customers
      add constraint customers_current_tier_fk
      foreign key (current_tier_id) references loyalty_tiers(id) on delete set null;
  end if;
end$$;

-- ============================================================================
-- 2. LOYALTY_TRANSACTIONS — historial de puntos
-- ============================================================================
create table if not exists loyalty_transactions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references volvix_tenants(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  sale_id         uuid,                        -- volvix_ventas.id (sin FK dura)
  type            text not null check (type in ('earn','redeem','expire','adjust')),
  points          integer not null,            -- puede ser negativo (redeem/expire/adjust-)
  balance_after   integer not null,
  notes           text,
  ts              timestamptz not null default now()
);
create index if not exists loyalty_tx_customer_idx on loyalty_transactions(customer_id, ts desc);
create index if not exists loyalty_tx_sale_idx     on loyalty_transactions(sale_id);
create index if not exists loyalty_tx_tenant_idx   on loyalty_transactions(tenant_id, ts desc);

-- ============================================================================
-- 3. recompute_customer_points(customer_id) — recalcula desde el historial
-- ============================================================================
create or replace function recompute_customer_points(p_customer uuid)
returns integer
language plpgsql
as $$
declare
  v_total   integer;
  v_tier_id uuid;
  v_tenant  uuid;
begin
  select coalesce(sum(points), 0) into v_total
    from loyalty_transactions
   where customer_id = p_customer;

  select tenant_id into v_tenant from customers where id = p_customer;

  -- tier = el de mayor min_points ≤ total dentro del tenant
  select id into v_tier_id
    from loyalty_tiers
   where tenant_id = v_tenant
     and min_points <= v_total
   order by min_points desc
   limit 1;

  update customers
     set loyalty_points  = v_total,
         current_tier_id = v_tier_id,
         updated_at      = now()
   where id = p_customer;

  return v_total;
end;
$$;

-- ============================================================================
-- 4. Trigger after_sale_insert — devenga puntos automáticamente
-- ----------------------------------------------------------------------------
-- Convención: 1 punto por cada $1 (peso) del total, multiplicado por el
-- multiplier del tier actual del cliente. Se asume que volvix_ventas tiene
-- una columna `customer_id` (uuid). Si no existe, se agrega.
-- ============================================================================
alter table volvix_ventas
  add column if not exists customer_id uuid;

create or replace function loyalty_after_sale_insert()
returns trigger
language plpgsql
as $$
declare
  v_mult   numeric(5,2) := 1.00;
  v_points integer;
  v_bal    integer;
  v_tier   uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  -- multiplier según el tier vigente del cliente
  select t.multiplier, c.current_tier_id
    into v_mult, v_tier
    from customers c
    left join loyalty_tiers t on t.id = c.current_tier_id
   where c.id = new.customer_id;

  v_mult := coalesce(v_mult, 1.00);
  v_points := floor(coalesce(new.total, 0) * v_mult)::integer;

  if v_points <= 0 then
    return new;
  end if;

  select coalesce(loyalty_points, 0) + v_points into v_bal
    from customers where id = new.customer_id;

  insert into loyalty_transactions
    (tenant_id, customer_id, sale_id, type, points, balance_after, notes)
  values
    (new.tenant_id, new.customer_id, new.id, 'earn', v_points, v_bal,
     format('auto: total %s × mult %s', new.total, v_mult));

  update customers
     set loyalty_points = v_bal,
         last_visit_at  = now(),
         updated_at     = now()
   where id = new.customer_id;

  -- recompute para reasignar tier si subió de nivel
  perform recompute_customer_points(new.customer_id);

  return new;
end;
$$;

drop trigger if exists after_sale_insert on volvix_ventas;
create trigger after_sale_insert
  after insert on volvix_ventas
  for each row execute function loyalty_after_sale_insert();

-- ============================================================================
-- 5. SEED — tiers default para el tenant Demo (idempotente)
-- ============================================================================
insert into loyalty_tiers (tenant_id, name, min_points, multiplier, perks)
select t.id, x.name, x.min_points, x.mult, x.perks::jsonb
  from volvix_tenants t
  cross join (values
    ('Bronze',     0, 1.00, '["Acumula puntos en cada compra"]'),
    ('Silver',   500, 1.25, '["5% extra puntos","Promos exclusivas"]'),
    ('Gold',    1500, 1.50, '["10% descuento mensual","Soporte prioritario"]'),
    ('Platinum',5000, 2.00, '["20% descuento","Regalo de cumpleaños","VIP"]')
  ) as x(name, min_points, mult, perks)
 where t.nombre = 'Demo Volvix'
on conflict (tenant_id, name) do nothing;

--- next file ---

-- ============================================
-- FILE: R14_PAYMENTS.sql
-- ============================================
-- ─── R14 — Payments (Stripe + futuros providers) ───────────────────────────
-- Aplicar en Supabase Dashboard → SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid,
  provider              text not null,                       -- 'stripe', 'mercadopago', etc.
  provider_payment_id   text,                                -- ej: pi_xxx (Stripe PaymentIntent)
  status                text not null default 'pending',     -- pending|requires_action|processing|succeeded|failed|canceled
  amount_cents          bigint not null check (amount_cents >= 0),
  currency              text not null default 'mxn',
  raw                   jsonb,                               -- payload completo del provider (último estado)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists payments_sale_id_idx              on public.payments(sale_id);
create index if not exists payments_provider_payment_id_idx  on public.payments(provider, provider_payment_id);
create index if not exists payments_status_idx               on public.payments(status);
create index if not exists payments_created_at_idx           on public.payments(created_at desc);

-- updated_at trigger
create or replace function public.payments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.payments_set_updated_at();

-- FK opcional a volvix_ventas (si existe id uuid)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='volvix_ventas') then
    begin
      alter table public.payments
        add constraint payments_sale_fk
        foreign key (sale_id) references public.volvix_ventas(id) on delete set null;
    exception when duplicate_object then null;
             when others then null;
    end;
  end if;
end $$;

-- RLS
alter table public.payments enable row level security;

-- Service role bypass automático. Política de lectura para usuarios autenticados:
drop policy if exists payments_read_authenticated on public.payments;
create policy payments_read_authenticated on public.payments
  for select to authenticated using (true);

-- Inserciones/updates: solo service_role (server-side desde /api/payments/*)
drop policy if exists payments_write_service on public.payments;
create policy payments_write_service on public.payments
  for all to service_role using (true) with check (true);

--- next file ---

-- ============================================
-- FILE: R14_CFDI_TABLES.sql
-- ============================================
-- ============================================================================
-- R14_CFDI_TABLES.sql — Esquema CFDI 4.0 (Volvix POS)
-- ----------------------------------------------------------------------------
-- Tablas para facturación electrónica México:
--   invoices       : cabecera CFDI con UUID SAT, sello, certificado, XML, PDF
--   invoice_lines  : conceptos / partidas
--   invoice_log    : bitácora de operaciones (timbrado, cancelación, consulta)
--
-- Diseñado para Supabase (Postgres). Compatible con tenants multi-empresa.
-- ============================================================================

-- ─── SAFE: NO DROP CASCADE — preserve existing data ────────────────────────
-- Original used DROP TABLE...CASCADE which destroys all invoice data on re-run.
-- SAFE version uses CREATE TABLE IF NOT EXISTS for true idempotency.

-- ─── INVOICES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid REFERENCES public.volvix_tenants(id) ON DELETE CASCADE,
  sale_id                  uuid REFERENCES public.volvix_ventas(id)  ON DELETE SET NULL,

  -- Identificadores SAT
  uuid                     text UNIQUE NOT NULL,                 -- UUID timbre fiscal digital (SAT)
  serie                    text DEFAULT 'A',
  folio                    text,
  version                  text DEFAULT '4.0',
  tipo_comprobante         text DEFAULT 'I'  CHECK (tipo_comprobante IN ('I','E','T','N','P')),

  -- Emisor
  rfc_emisor               text NOT NULL,
  razon_social_emisor      text,
  regimen_fiscal_emisor    text,

  -- Receptor
  rfc_receptor             text NOT NULL,
  razon_social_receptor    text NOT NULL,
  uso_cfdi                 text NOT NULL,
  regimen_fiscal_receptor  text NOT NULL,
  codigo_postal_receptor   text NOT NULL CHECK (codigo_postal_receptor ~ '^[0-9]{5}$'),

  -- Importes
  subtotal                 numeric(14,2) NOT NULL,
  descuento                numeric(14,2) DEFAULT 0,
  total                    numeric(14,2) NOT NULL,
  moneda                   text DEFAULT 'MXN',
  tipo_cambio              numeric(14,6) DEFAULT 1,

  -- Pago
  metodo_pago              text DEFAULT 'PUE',                   -- PUE / PPD
  forma_pago               text DEFAULT '01',                    -- catálogo c_FormaPago
  condiciones_pago         text,

  -- Timbrado
  sello                    text,                                 -- SelloCFD del emisor
  sello_sat                text,                                 -- SelloSAT del PAC
  certificado_no           text,                                 -- NoCertificadoSAT
  certificado              text,                                 -- certificado base64 (opcional)
  rfc_prov_certif          text,                                 -- PAC
  fecha_emision            timestamptz NOT NULL DEFAULT now(),
  fecha_timbrado           timestamptz,
  lugar_expedicion         text,

  -- Documentos
  xml                      text,                                 -- XML CFDI completo
  pdf_url                  text,                                 -- URL al PDF (storage)

  -- Estatus
  estatus                  text NOT NULL DEFAULT 'borrador'
                              CHECK (estatus IN ('borrador','vigente','cancelada','rechazada','en_proceso_cancelacion')),
  motivo_cancelacion       text  CHECK (motivo_cancelacion IS NULL OR motivo_cancelacion IN ('01','02','03','04')),
  folio_sustitucion        text,
  fecha_cancelacion        timestamptz,

  -- Meta
  modo_test                boolean DEFAULT true,
  pac_response             jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant      ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale        ON public.invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_uuid        ON public.invoices(uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_rfc_recep   ON public.invoices(rfc_receptor);
CREATE INDEX IF NOT EXISTS idx_invoices_estatus     ON public.invoices(estatus);
CREATE INDEX IF NOT EXISTS idx_invoices_fecha_tim   ON public.invoices(fecha_timbrado DESC);

-- ─── INVOICE_LINES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  linea                    int  NOT NULL,
  clave_prod_serv          text NOT NULL DEFAULT '01010101',
  no_identificacion        text,
  cantidad                 numeric(14,4) NOT NULL CHECK (cantidad > 0),
  clave_unidad             text NOT NULL DEFAULT 'H87',
  unidad                   text,
  descripcion              text NOT NULL,
  precio_unitario          numeric(14,4) NOT NULL CHECK (precio_unitario >= 0),
  importe                  numeric(14,2) NOT NULL,
  descuento                numeric(14,2) DEFAULT 0,
  objeto_imp               text DEFAULT '02',
  iva                      numeric(14,2) DEFAULT 0,
  ieps                     numeric(14,2) DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, linea)
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

-- ─── INVOICE_LOG ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_log (
  id            bigserial PRIMARY KEY,
  invoice_id    uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  uuid          text,
  accion        text NOT NULL CHECK (accion IN ('timbrado','cancelacion','consulta','reenvio','error')),
  resultado     text NOT NULL CHECK (resultado IN ('ok','aceptada','rechazada','en_proceso','error')),
  detalle       text,
  pac           text DEFAULT 'finkok',
  request_xml   text,
  response_xml  text,
  http_status   int,
  user_id       uuid,
  ip            text,
  ts            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_log_invoice ON public.invoice_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_log_uuid    ON public.invoice_log(uuid);
CREATE INDEX IF NOT EXISTS idx_invoice_log_accion  ON public.invoice_log(accion);
CREATE INDEX IF NOT EXISTS idx_invoice_log_ts      ON public.invoice_log(ts DESC);

-- ─── Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_invoices_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoices_updated_at();

-- ─── RLS (Row Level Security) ───────────────────────────────────────────────
ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_log   ENABLE ROW LEVEL SECURITY;

-- Acceso por tenant (asume claim jwt 'tenant_id' o tabla volvix_usuarios).
DROP POLICY IF EXISTS invoices_tenant_isolation ON public.invoices;
CREATE POLICY invoices_tenant_isolation ON public.invoices
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS invoice_lines_tenant_isolation ON public.invoice_lines;
CREATE POLICY invoice_lines_tenant_isolation ON public.invoice_lines
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS invoice_log_tenant_isolation ON public.invoice_log;
CREATE POLICY invoice_log_tenant_isolation ON public.invoice_log
  USING (
    invoice_id IS NULL OR invoice_id IN (
      SELECT id FROM public.invoices
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
      )
    )
  );

-- Service role bypass: el backend usa SUPABASE_SERVICE_ROLE_KEY que ignora RLS.

-- ─── Comentarios ────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.invoices      IS 'Cabeceras CFDI 4.0 timbradas (México)';
COMMENT ON TABLE  public.invoice_lines IS 'Conceptos/partidas de cada CFDI';
COMMENT ON TABLE  public.invoice_log   IS 'Bitácora de operaciones contra el PAC (timbrado, cancelación, consulta)';
COMMENT ON COLUMN public.invoices.uuid          IS 'UUID del Timbre Fiscal Digital asignado por el SAT';
COMMENT ON COLUMN public.invoices.sello         IS 'SelloCFD generado por el emisor con su CSD';
COMMENT ON COLUMN public.invoices.sello_sat     IS 'SelloSAT devuelto por el PAC tras timbrar';
COMMENT ON COLUMN public.invoices.certificado_no IS 'NoCertificadoSAT (20 dígitos) usado para timbrar';
COMMENT ON COLUMN public.invoices.modo_test     IS 'true cuando el CFDI fue generado en sandbox/test (no producción)';

--- next file ---

-- ============================================
-- FILE: R14_REPORTS_VIEWS.sql
-- ============================================
-- =====================================================================
-- Volvix POS — R14 Reports BI: Materialized Views + RPC Functions
-- Ejecutar en: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new
-- =====================================================================
-- Requiere las tablas: volvix_ventas, volvix_productos, volvix_tenants
-- Las MVs se filtran por tenant_id en el query (no requiere parámetros).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) MV_SALES_DAILY  — Ventas agregadas por día y tenant
-- ---------------------------------------------------------------------
drop materialized view if exists mv_sales_daily cascade;
create materialized view mv_sales_daily as
select
  v.tenant_id,
  date_trunc('day', v.created_at)::date as dia,
  count(*)               as tickets,
  sum(v.total)           as venta_total,
  sum(v.subtotal)        as subtotal_total,
  sum(v.iva)             as iva_total,
  sum(v.descuento)       as descuento_total,
  avg(v.total)           as ticket_promedio,
  min(v.total)           as ticket_min,
  max(v.total)           as ticket_max
from volvix_ventas v
where coalesce(v.estado,'completada') = 'completada'
group by v.tenant_id, date_trunc('day', v.created_at)::date;

create unique index if not exists mv_sales_daily_idx
  on mv_sales_daily(tenant_id, dia);

-- ---------------------------------------------------------------------
-- 2) MV_TOP_PRODUCTS  — Top productos por unidades e ingresos
--    Expande items jsonb: cada item esperado con {producto_id, nombre, cantidad, precio}
-- ---------------------------------------------------------------------
drop materialized view if exists mv_top_products cascade;
create materialized view mv_top_products as
select
  v.tenant_id,
  date_trunc('day', v.created_at)::date as dia,
  coalesce(item->>'producto_id', item->>'id') as producto_id,
  coalesce(item->>'nombre', 'desconocido')    as nombre,
  sum( coalesce((item->>'cantidad')::numeric, 1) ) as unidades,
  sum( coalesce((item->>'cantidad')::numeric, 1)
       * coalesce((item->>'precio')::numeric, 0) ) as ingreso,
  sum( coalesce((item->>'cantidad')::numeric, 1)
       * coalesce((item->>'costo')::numeric, 0) )  as costo
from volvix_ventas v,
     lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
where coalesce(v.estado,'completada') = 'completada'
group by v.tenant_id, date_trunc('day', v.created_at)::date,
         coalesce(item->>'producto_id', item->>'id'),
         coalesce(item->>'nombre', 'desconocido');

create index if not exists mv_top_products_idx
  on mv_top_products(tenant_id, dia, producto_id);

-- ---------------------------------------------------------------------
-- 3) MV_INVENTORY_VALUE  — Valor de inventario por categoría
-- ---------------------------------------------------------------------
drop materialized view if exists mv_inventory_value cascade;
create materialized view mv_inventory_value as
select
  p.tenant_id,
  coalesce(p.categoria, 'sin_categoria') as categoria,
  count(*)                                as skus,
  sum(p.stock)                            as unidades_total,
  sum(p.stock * p.costo)                  as valor_costo,
  sum(p.stock * p.precio)                 as valor_venta,
  sum(p.stock * (p.precio - p.costo))     as margen_potencial
from volvix_productos p
where coalesce(p.activo, true) = true
group by p.tenant_id, coalesce(p.categoria, 'sin_categoria');

create index if not exists mv_inventory_value_idx
  on mv_inventory_value(tenant_id, categoria);

-- =====================================================================
-- REFRESH STRATEGY
-- ---------------------------------------------------------------------
-- Recomendación:
--   * mv_sales_daily       → cada 15 min (CONCURRENTLY, requiere unique idx)
--   * mv_top_products      → cada 30 min
--   * mv_inventory_value   → cada 5 min (cambia con cada venta y compra)
--
-- Opción A — pg_cron (Supabase soporta extensión pg_cron):
--   create extension if not exists pg_cron;
--   select cron.schedule('refresh_mv_sales_daily',  '*/15 * * * *',
--     $$ refresh materialized view concurrently mv_sales_daily $$);
--   select cron.schedule('refresh_mv_top_products', '*/30 * * * *',
--     $$ refresh materialized view mv_top_products $$);
--   select cron.schedule('refresh_mv_inventory_value','*/5 * * * *',
--     $$ refresh materialized view mv_inventory_value $$);
--
-- Opción B — invocar refresh desde el backend Node tras cada venta/upsert
--   (POST /api/reports/refresh — sólo admin/owner).
-- =====================================================================

-- Función helper para refrescar todo (usada por endpoint admin)
create or replace function refresh_all_reports() returns void as $$
begin
  refresh materialized view concurrently mv_sales_daily;
  refresh materialized view mv_top_products;
  refresh materialized view mv_inventory_value;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 4) RPC: report_sales_by_cashier
-- ---------------------------------------------------------------------
create or replace function report_sales_by_cashier(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '30 days'),
  p_to        timestamptz default now()
) returns table (
  cajero          text,
  tickets         bigint,
  venta_total     numeric,
  ticket_promedio numeric
) as $$
  select
    coalesce(v.cajero, 'sin_cajero') as cajero,
    count(*)::bigint                  as tickets,
    sum(v.total)::numeric             as venta_total,
    avg(v.total)::numeric             as ticket_promedio
  from volvix_ventas v
  where v.tenant_id = p_tenant_id
    and v.created_at between p_from and p_to
    and coalesce(v.estado,'completada') = 'completada'
  group by coalesce(v.cajero, 'sin_cajero')
  order by venta_total desc nulls last;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 5) RPC: report_profit  (margen bruto = ingreso - costo)
-- ---------------------------------------------------------------------
create or replace function report_profit(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '30 days'),
  p_to        timestamptz default now()
) returns table (
  dia          date,
  ingreso      numeric,
  costo        numeric,
  utilidad     numeric,
  margen_pct   numeric
) as $$
  with line_items as (
    select
      date_trunc('day', v.created_at)::date as dia,
      coalesce((item->>'cantidad')::numeric, 1) as qty,
      coalesce((item->>'precio')::numeric, 0)   as pu,
      coalesce(
        (item->>'costo')::numeric,
        (select p.costo from volvix_productos p
          where p.id::text = coalesce(item->>'producto_id', item->>'id')
          limit 1),
        0
      ) as cu
    from volvix_ventas v,
         lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
    where v.tenant_id = p_tenant_id
      and v.created_at between p_from and p_to
      and coalesce(v.estado,'completada') = 'completada'
  )
  select
    dia,
    sum(qty * pu)::numeric                             as ingreso,
    sum(qty * cu)::numeric                             as costo,
    (sum(qty * pu) - sum(qty * cu))::numeric           as utilidad,
    case when sum(qty * pu) > 0
         then ((sum(qty * pu) - sum(qty * cu)) / sum(qty * pu) * 100)::numeric(10,2)
         else 0 end                                    as margen_pct
  from line_items
  group by dia
  order by dia;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 6) RPC: report_abc_analysis
--    Clase A: top 80% del ingreso, B: siguiente 15%, C: último 5%
-- ---------------------------------------------------------------------
create or replace function report_abc_analysis(
  p_tenant_id uuid,
  p_from      timestamptz default (now() - interval '90 days'),
  p_to        timestamptz default now()
) returns table (
  producto_id   text,
  nombre        text,
  unidades      numeric,
  ingreso       numeric,
  pct_ingreso   numeric,
  pct_acumulado numeric,
  clase         text
) as $$
  with prod as (
    select
      coalesce(item->>'producto_id', item->>'id') as producto_id,
      coalesce(item->>'nombre', 'desconocido')    as nombre,
      sum(coalesce((item->>'cantidad')::numeric, 1)) as unidades,
      sum(coalesce((item->>'cantidad')::numeric, 1)
        * coalesce((item->>'precio')::numeric, 0)) as ingreso
    from volvix_ventas v,
         lateral jsonb_array_elements(coalesce(v.items, '[]'::jsonb)) as item
    where v.tenant_id = p_tenant_id
      and v.created_at between p_from and p_to
      and coalesce(v.estado,'completada') = 'completada'
    group by 1, 2
  ),
  total as (select nullif(sum(ingreso),0) as t from prod),
  ranked as (
    select
      p.*,
      (p.ingreso / t.t * 100)::numeric(10,2) as pct_ingreso,
      (sum(p.ingreso) over (order by p.ingreso desc) / t.t * 100)::numeric(10,2)
        as pct_acumulado
    from prod p, total t
    where t.t is not null
  )
  select
    producto_id, nombre, unidades, ingreso, pct_ingreso, pct_acumulado,
    case
      when pct_acumulado <= 80  then 'A'
      when pct_acumulado <= 95  then 'B'
      else 'C'
    end as clase
  from ranked
  order by ingreso desc;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 7) RPC: report_customers_cohort
--    Retención 30/60/90 días basada en `cajero` como proxy de cliente
--    (no hay tabla volvix_clientes; si existe, reemplazar v.cajero por v.cliente_id).
-- ---------------------------------------------------------------------
create or replace function report_customers_cohort(
  p_tenant_id uuid
) returns table (
  cohorte_mes   date,
  clientes      bigint,
  retenidos_30  bigint,
  retenidos_60  bigint,
  retenidos_90  bigint,
  ret_30_pct    numeric,
  ret_60_pct    numeric,
  ret_90_pct    numeric
) as $$
  with first_seen as (
    select
      coalesce(cajero, 'anon') as cliente_key,
      min(created_at)          as primera_compra
    from volvix_ventas
    where tenant_id = p_tenant_id
      and coalesce(estado,'completada') = 'completada'
    group by coalesce(cajero, 'anon')
  ),
  cohorts as (
    select
      cliente_key,
      date_trunc('month', primera_compra)::date as cohorte_mes,
      primera_compra
    from first_seen
  ),
  activity as (
    select
      c.cohorte_mes,
      c.cliente_key,
      max(case when v.created_at between c.primera_compra + interval '1 day'
                                     and c.primera_compra + interval '30 days'
               then 1 else 0 end) as r30,
      max(case when v.created_at between c.primera_compra + interval '31 days'
                                     and c.primera_compra + interval '60 days'
               then 1 else 0 end) as r60,
      max(case when v.created_at between c.primera_compra + interval '61 days'
                                     and c.primera_compra + interval '90 days'
               then 1 else 0 end) as r90
    from cohorts c
    left join volvix_ventas v
      on v.tenant_id = p_tenant_id
     and coalesce(v.cajero,'anon') = c.cliente_key
    group by c.cohorte_mes, c.cliente_key
  )
  select
    cohorte_mes,
    count(*)::bigint                            as clientes,
    sum(r30)::bigint                            as retenidos_30,
    sum(r60)::bigint                            as retenidos_60,
    sum(r90)::bigint                            as retenidos_90,
    (sum(r30)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_30_pct,
    (sum(r60)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_60_pct,
    (sum(r90)::numeric / nullif(count(*),0) * 100)::numeric(5,2) as ret_90_pct
  from activity
  group by cohorte_mes
  order by cohorte_mes;
$$ language sql stable;

-- =====================================================================
-- FIN R14_REPORTS_VIEWS.sql
-- =====================================================================

--- next file ---

-- ============================================
-- FILE: R14_REALTIME.sql
-- ============================================
-- R14_REALTIME.sql
-- Habilita Supabase Realtime sobre las tablas de Volvix POS.
-- Ejecutar en el SQL editor de Supabase con un rol con privilegios sobre la
-- publicación `supabase_realtime` (normalmente postgres).
--
-- NOTA: el spec original menciona `sales, customers, products`. En este
-- proyecto las tablas reales llevan el prefijo `volvix_`. Se usan los nombres
-- reales del esquema. Si en el futuro se renombran, actualizar este archivo.

BEGIN;

-- Asegurar que la publicación existe (Supabase la crea por defecto, pero
-- ejecutar este script en una DB nueva no debe fallar).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Añadir tablas a la publicación (idempotente: ignora si ya están).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['volvix_ventas', 'volvix_productos', 'volvix_tenants', 'volvix_usuarios']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        RAISE NOTICE 'Tabla %% añadida a supabase_realtime', t;
      ELSE
        RAISE NOTICE 'Tabla %% ya estaba en supabase_realtime', t;
      END IF;
    ELSE
      RAISE NOTICE 'Tabla %% no existe — omitida', t;
    END IF;
  END LOOP;
END $$;

-- Replica identity FULL: necesario para recibir filas `old` en UPDATE/DELETE
-- y para que los filtros server-side por tenant_id trabajen sobre la fila
-- previa también.
ALTER TABLE IF EXISTS public.volvix_ventas    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_productos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_tenants   REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_usuarios  REPLICA IDENTITY FULL;

COMMIT;

-- Verificación:
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;

--- next file ---

-- ============================================
-- FILE: R14_EMAIL_LOG.sql
-- ============================================
-- ============================================================
-- R14 · EMAIL LOG
-- Auditoria de envios transaccionales (SendGrid)
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  to_email     text,
  subject      text,
  template     text,
  status       text not null check (status in ('sent','failed','queued')),
  provider_id  text,
  error        text
);

-- Indice principal: consulta por fecha desc + status
create index if not exists idx_email_log_ts_status
  on public.email_log (ts desc, status);

-- Indices auxiliares utiles
create index if not exists idx_email_log_to
  on public.email_log (to_email);
create index if not exists idx_email_log_template
  on public.email_log (template);

-- ============================================================
-- ROW LEVEL SECURITY: solo admin/superadmin/owner
-- ============================================================
alter table public.email_log enable row level security;

-- Service role (API backend) hace bypass automatico de RLS.
-- Las policies abajo aplican a usuarios autenticados via JWT cliente.

drop policy if exists email_log_admin_select on public.email_log;
create policy email_log_admin_select
  on public.email_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

drop policy if exists email_log_admin_insert on public.email_log;
create policy email_log_admin_insert
  on public.email_log
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

-- update / delete: bloqueado para clientes (solo service role).
drop policy if exists email_log_no_update on public.email_log;
drop policy if exists email_log_no_delete on public.email_log;

comment on table public.email_log is
  'R14: Audit log de emails transaccionales enviados via SendGrid. RLS admin-only.';

--- next file ---

-- ============================================
-- FILE: R14_ERROR_LOG.sql
-- ============================================
-- =====================================================================
-- R14 · ERROR LOG TABLE
-- Capture client + server errors for observability.
-- Idempotent: safe to run multiple times.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.error_log (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type         TEXT NOT NULL DEFAULT 'unknown',          -- window.onerror | unhandledrejection | server | manual
  message      TEXT NOT NULL,
  stack        TEXT,
  source       TEXT,                                     -- file URL where error occurred
  line_no      INTEGER,
  col_no       INTEGER,
  url          TEXT,                                     -- page URL
  user_agent   TEXT,
  ip           TEXT,
  pos_user_id  UUID,                                     -- nullable (anon errors)
  tenant_id    TEXT,
  meta         JSONB                                     -- arbitrary client context
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at  ON public.error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_type        ON public.error_log (type);
CREATE INDEX IF NOT EXISTS idx_error_log_pos_user    ON public.error_log (pos_user_id);
CREATE INDEX IF NOT EXISTS idx_error_log_tenant      ON public.error_log (tenant_id);

-- RLS: service role bypasses; restrict client reads if RLS enabled elsewhere.
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_log_service_all" ON public.error_log;
CREATE POLICY "error_log_service_all" ON public.error_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Owner/admin read-only via authenticated role (optional; tighten to your auth model)
DROP POLICY IF EXISTS "error_log_admin_read" ON public.error_log;
CREATE POLICY "error_log_admin_read" ON public.error_log
  FOR SELECT TO authenticated
  USING (true);

-- Optional: retention helper. Run via pg_cron if available.
-- DELETE FROM public.error_log WHERE created_at < NOW() - INTERVAL '90 days';

COMMENT ON TABLE public.error_log IS 'R14 observability — captures client (volvix-error-tracker.js) + server errors.';

--- next file ---

-- ============================================
-- FILE: R14_AUDIT_GDPR.sql
-- ============================================
-- =====================================================================
-- R14_AUDIT_GDPR.sql — Audit Log Inmutable + Cumplimiento GDPR
-- Volvix POS — Release 14
-- Ejecutar en: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new
-- =====================================================================

-- Requerido para digest() en gdpr_anonymize_customer
create extension if not exists pgcrypto;

-- ─── 1. AUDIT LOG (inmutable) ────────────────────────────────────────
create table if not exists volvix_audit_log (
  id            bigserial primary key,
  ts            timestamptz not null default now(),
  user_id       text,
  tenant_id     uuid,
  action        text not null check (action in ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','ANONYMIZE','GDPR_REQUEST')),
  resource      text not null,           -- nombre de la tabla / endpoint
  resource_id   text,                    -- pk del registro afectado
  before        jsonb,
  after         jsonb,
  ip            text,
  user_agent    text
);
create index if not exists volvix_audit_ts_idx       on volvix_audit_log(ts desc);
create index if not exists volvix_audit_user_idx     on volvix_audit_log(user_id);
create index if not exists volvix_audit_tenant_idx   on volvix_audit_log(tenant_id);
create index if not exists volvix_audit_action_idx   on volvix_audit_log(action);
create index if not exists volvix_audit_resource_idx on volvix_audit_log(resource, resource_id);

-- ─── INMUTABILIDAD — bloquea UPDATE y DELETE en audit_log ────────────
create or replace function volvix_audit_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'volvix_audit_log es inmutable: % no permitido', tg_op;
end;
$$;

drop trigger if exists volvix_audit_no_update on volvix_audit_log;
create trigger volvix_audit_no_update
  before update on volvix_audit_log
  for each row execute function volvix_audit_block_mutation();

drop trigger if exists volvix_audit_no_delete on volvix_audit_log;
create trigger volvix_audit_no_delete
  before delete on volvix_audit_log
  for each row execute function volvix_audit_block_mutation();

-- ─── TRIGGER GENÉRICO de auditoría para tablas críticas ──────────────
create or replace function volvix_audit_trigger()
returns trigger language plpgsql as $$
declare
  v_user    text := coalesce(current_setting('volvix.user_id',     true), 'system');
  v_tenant  uuid;
  v_ip      text := coalesce(current_setting('volvix.client_ip',   true), null);
  v_ua      text := coalesce(current_setting('volvix.user_agent',  true), null);
  v_rid     text;
  v_before  jsonb;
  v_after   jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
    v_rid    := (to_jsonb(old)->>'id');
    v_tenant := nullif(to_jsonb(old)->>'tenant_id','')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_rid    := (to_jsonb(new)->>'id');
    v_tenant := nullif(to_jsonb(new)->>'tenant_id','')::uuid;
  else  -- INSERT
    v_before := null;
    v_after  := to_jsonb(new);
    v_rid    := (to_jsonb(new)->>'id');
    v_tenant := nullif(to_jsonb(new)->>'tenant_id','')::uuid;
  end if;

  insert into volvix_audit_log(user_id, tenant_id, action, resource, resource_id, before, after, ip, user_agent)
  values (v_user, v_tenant, tg_op, tg_table_name, v_rid, v_before, v_after, v_ip, v_ua);

  return coalesce(new, old);
end;
$$;

-- ─── Aplicar trigger a tablas críticas (UPDATE/DELETE) ───────────────
do $$
declare
  t text;
  tables text[] := array[
    'volvix_tenants',
    'volvix_productos',
    'volvix_ventas',
    'volvix_features',
    'volvix_licencias',
    'volvix_tickets',
    'volvix_usuarios'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on %I
         for each row execute function volvix_audit_trigger()',
      t, t
    );
  end loop;
end$$;

-- =====================================================================
-- 2. GDPR REQUESTS
-- =====================================================================
create table if not exists volvix_gdpr_requests (
  id            uuid primary key default gen_random_uuid(),
  customer_id   text not null,                          -- email o identificador del cliente
  type          text not null check (type in ('access','erasure','portability')),
  status        text not null default 'pending'
                check (status in ('pending','verifying','processing','completed','rejected')),
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  verify_token  text,
  verify_expires timestamptz,
  payload       jsonb default '{}'::jsonb,
  ip            text,
  user_agent    text
);
create index if not exists volvix_gdpr_customer_idx on volvix_gdpr_requests(customer_id);
create index if not exists volvix_gdpr_status_idx   on volvix_gdpr_requests(status);
create index if not exists volvix_gdpr_type_idx     on volvix_gdpr_requests(type);

-- =====================================================================
-- 3. EXPORT — derecho de acceso (Art. 15) y portabilidad (Art. 20)
-- =====================================================================
create or replace function gdpr_export_customer(p_customer_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'customer_id', p_customer_id,
    'exported_at', now(),
    'gdpr_articles', jsonb_build_array('Art.15','Art.20'),
    'usuarios',  coalesce((select jsonb_agg(to_jsonb(u))
                            from volvix_usuarios u where u.email = p_customer_id), '[]'::jsonb),
    'tenants',   coalesce((select jsonb_agg(to_jsonb(t))
                            from volvix_tenants t where t.email = p_customer_id), '[]'::jsonb),
    'tickets',   coalesce((select jsonb_agg(to_jsonb(tk))
                            from volvix_tickets tk
                           where tk.descripcion ilike '%' || p_customer_id || '%'
                              or tk.asignado_a = p_customer_id), '[]'::jsonb),
    'ventas',    coalesce((select jsonb_agg(to_jsonb(v))
                            from volvix_ventas v
                           where v.cajero = p_customer_id
                              or v.notas ilike '%' || p_customer_id || '%'), '[]'::jsonb),
    'gdpr_requests', coalesce((select jsonb_agg(to_jsonb(g))
                                from volvix_gdpr_requests g
                               where g.customer_id = p_customer_id), '[]'::jsonb)
  ) into result;

  insert into volvix_audit_log(user_id, action, resource, resource_id, after)
  values (p_customer_id, 'EXPORT', 'gdpr_export', p_customer_id,
          jsonb_build_object('size_bytes', octet_length(result::text)));

  return result;
end;
$$;

-- =====================================================================
-- 4. ANONYMIZE — derecho al olvido (Art. 17)
-- =====================================================================
-- Reemplaza PII con hash determinista (SHA-256 truncado a 16 hex chars).
-- Mantiene integridad referencial y datos agregados (ventas, métricas).
create or replace function gdpr_anonymize_customer(p_customer_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_hash       text := substr(encode(digest(p_customer_id, 'sha256'), 'hex'), 1, 16);
  v_anon_email text := 'anon_' || v_hash || '@anon.invalid';
  v_anon_name  text := 'Anonimizado-' || v_hash;
  v_affected   jsonb := '{}'::jsonb;
  v_count      int;
begin
  -- volvix_usuarios
  update volvix_usuarios
     set nombre = v_anon_name,
         email  = v_anon_email,
         activo = false
   where email = p_customer_id;
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_usuarios', v_count);

  -- volvix_tenants (si el customer es contacto de un tenant)
  update volvix_tenants
     set email     = v_anon_email,
         telefono  = null,
         direccion = null
   where email = p_customer_id;
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_tenants', v_count);

  -- volvix_tickets
  update volvix_tickets
     set asignado_a  = v_anon_name,
         descripcion = regexp_replace(coalesce(descripcion,''), p_customer_id, v_anon_email, 'gi')
   where asignado_a = p_customer_id
      or descripcion ilike '%' || p_customer_id || '%';
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_tickets', v_count);

  -- volvix_ventas (preserva agregados, anonimiza cajero/notas)
  update volvix_ventas
     set cajero = v_anon_name,
         notas  = regexp_replace(coalesce(notas,''), p_customer_id, v_anon_email, 'gi')
   where cajero = p_customer_id
      or notas ilike '%' || p_customer_id || '%';
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_ventas', v_count);

  -- Marcar requests gdpr como completadas
  update volvix_gdpr_requests
     set status       = 'completed',
         completed_at = now()
   where customer_id = p_customer_id
     and type = 'erasure'
     and status <> 'completed';

  -- Audit
  insert into volvix_audit_log(user_id, action, resource, resource_id, before, after)
  values ('gdpr', 'ANONYMIZE', 'gdpr_anonymize', p_customer_id,
          jsonb_build_object('original_id', p_customer_id),
          jsonb_build_object('hash', v_hash, 'affected', v_affected));

  return jsonb_build_object(
    'ok', true,
    'customer_id_hash', v_hash,
    'anonymized_email', v_anon_email,
    'affected_rows', v_affected,
    'completed_at', now()
  );
end;
$$;

-- =====================================================================
-- 5. RLS — solo admin lee audit_log y gdpr_requests
-- =====================================================================
alter table volvix_audit_log     enable row level security;
alter table volvix_gdpr_requests enable row level security;

drop policy if exists volvix_audit_admin_read on volvix_audit_log;
create policy volvix_audit_admin_read on volvix_audit_log
  for select using (auth.role() = 'service_role');

drop policy if exists volvix_audit_service_insert on volvix_audit_log;
create policy volvix_audit_service_insert on volvix_audit_log
  for insert with check (true);

drop policy if exists volvix_gdpr_service on volvix_gdpr_requests;
create policy volvix_gdpr_service on volvix_gdpr_requests
  for all using (auth.role() = 'service_role') with check (true);

-- =====================================================================
-- FIN R14_AUDIT_GDPR.sql
-- =====================================================================

--- next file ---

-- ============================================
-- FILE: R14_CURRENCIES.sql
-- ============================================
-- R14_CURRENCIES.sql — Multi-currency + FX rates
-- Volvix POS

BEGIN;

-- ─── Currencies catalog ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currencies (
    code     CHAR(3)     PRIMARY KEY,
    name     TEXT        NOT NULL,
    symbol   TEXT        NOT NULL,
    decimals SMALLINT    NOT NULL DEFAULT 2,
    active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO currencies (code, name, symbol, decimals) VALUES
    ('MXN', 'Peso Mexicano',    '$',  2),
    ('USD', 'US Dollar',        'US$',2),
    ('EUR', 'Euro',             '€',  2),
    ('COP', 'Peso Colombiano',  'COL$',2),
    ('ARS', 'Peso Argentino',   'AR$',2),
    ('BRL', 'Real Brasileño',   'R$', 2),
    ('GBP', 'Libra Esterlina',  '£',  2),
    ('CAD', 'Dolar Canadiense', 'CA$',2)
ON CONFLICT (code) DO NOTHING;

-- ─── FX rates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
    id          BIGSERIAL PRIMARY KEY,
    base_code   CHAR(3)   NOT NULL REFERENCES currencies(code),
    quote_code  CHAR(3)   NOT NULL REFERENCES currencies(code),
    rate        NUMERIC(20,10) NOT NULL CHECK (rate > 0),
    source      TEXT      NOT NULL DEFAULT 'exchangerate.host',
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fx_rates_daily
    ON fx_rates (base_code, quote_code, (fetched_at::date));

CREATE INDEX IF NOT EXISTS ix_fx_rates_lookup
    ON fx_rates (base_code, quote_code, fetched_at DESC);

-- ─── Conversion function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION convert(
    p_amount    NUMERIC,
    p_from_code CHAR(3),
    p_to_code   CHAR(3)
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rate NUMERIC;
    v_inv  NUMERIC;
BEGIN
    IF p_from_code = p_to_code THEN
        RETURN p_amount;
    END IF;

    -- direct
    SELECT rate INTO v_rate
      FROM fx_rates
     WHERE base_code = p_from_code AND quote_code = p_to_code
     ORDER BY fetched_at DESC
     LIMIT 1;
    IF v_rate IS NOT NULL THEN
        RETURN p_amount * v_rate;
    END IF;

    -- inverse
    SELECT rate INTO v_inv
      FROM fx_rates
     WHERE base_code = p_to_code AND quote_code = p_from_code
     ORDER BY fetched_at DESC
     LIMIT 1;
    IF v_inv IS NOT NULL AND v_inv > 0 THEN
        RETURN p_amount / v_inv;
    END IF;

    -- triangulate via MXN
    DECLARE
        v_from_to_mxn NUMERIC;
        v_mxn_to_to   NUMERIC;
    BEGIN
        SELECT rate INTO v_from_to_mxn
          FROM fx_rates
         WHERE base_code = p_from_code AND quote_code = 'MXN'
         ORDER BY fetched_at DESC LIMIT 1;
        SELECT rate INTO v_mxn_to_to
          FROM fx_rates
         WHERE base_code = 'MXN' AND quote_code = p_to_code
         ORDER BY fetched_at DESC LIMIT 1;
        IF v_from_to_mxn IS NOT NULL AND v_mxn_to_to IS NOT NULL THEN
            RETURN p_amount * v_from_to_mxn * v_mxn_to_to;
        END IF;
    END;

    RAISE EXCEPTION 'No FX rate available for % -> %', p_from_code, p_to_code;
END;
$$;

-- ─── Extend pos_products & pos_sales ─────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_products') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_products' AND column_name='currency_code') THEN
            ALTER TABLE pos_products
                ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'MXN'
                REFERENCES currencies(code);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_sales' AND column_name='currency_code') THEN
            ALTER TABLE pos_sales
                ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'MXN'
                REFERENCES currencies(code);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_sales' AND column_name='fx_rate_to_base') THEN
            ALTER TABLE pos_sales
                ADD COLUMN fx_rate_to_base NUMERIC(20,10) NOT NULL DEFAULT 1.0;
        END IF;
    END IF;
END $$;

-- ─── RLS (read-public, write-admin) ──────────────────────────────────
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currencies_read ON currencies;
CREATE POLICY currencies_read ON currencies FOR SELECT USING (true);

DROP POLICY IF EXISTS fx_rates_read ON fx_rates;
CREATE POLICY fx_rates_read ON fx_rates FOR SELECT USING (true);

COMMIT;

--- next file ---

-- ============================================
-- FILE: R14_PUSH_SUBS.sql
-- ============================================
-- ============================================================
-- R14 · WEB PUSH SUBSCRIPTIONS
-- Suscripciones de Web Push (VAPID) por usuario / tenant.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  tenant_id   uuid,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  ua          text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subs_user
  on public.push_subscriptions (user_id);
create index if not exists idx_push_subs_tenant
  on public.push_subscriptions (tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY: cada user solo ve/gestiona sus propias subs.
-- service_role (backend) bypassea RLS automaticamente.
-- ============================================================
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_owner_select on public.push_subscriptions;
create policy push_subs_owner_select
  on public.push_subscriptions
  for select
  to authenticated
  using ( user_id = auth.uid() );

drop policy if exists push_subs_owner_insert on public.push_subscriptions;
create policy push_subs_owner_insert
  on public.push_subscriptions
  for insert
  to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists push_subs_owner_delete on public.push_subscriptions;
create policy push_subs_owner_delete
  on public.push_subscriptions
  for delete
  to authenticated
  using ( user_id = auth.uid() );

-- Admin/owner pueden listar todo (para enviar broadcast).
drop policy if exists push_subs_admin_select on public.push_subscriptions;
create policy push_subs_admin_select
  on public.push_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

comment on table public.push_subscriptions is
  'R14: Web Push subscriptions (VAPID). RLS owner-only, admin select-all.';

--- next file ---

-- ============================================
-- FILE: R14_PRINTERS.sql
-- ============================================
-- R14_PRINTERS.sql — Configuración de impresoras térmicas por tenant
-- Ejecutar en Supabase SQL editor.

create table if not exists printer_configs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('bluetooth','usb','network','fallback')),
  address       text,                 -- IP (network), MAC/ID (bluetooth), vendor/product (usb)
  port          int  default 9100,
  paper_width   int  default 80,      -- mm: 58 o 80
  default_for   jsonb default '{}'::jsonb,  -- {"receipts":true,"kitchen":false,"reports":false}
  active        boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_printer_configs_tenant on printer_configs(tenant_id);
create index if not exists idx_printer_configs_active on printer_configs(tenant_id, active) where active = true;

-- Log de auditoría de impresión (no contiene buffer raw, solo metadata)
create table if not exists printer_audit_log (
  id            bigserial primary key,
  tenant_id     uuid references tenants(id) on delete set null,
  user_id       uuid,
  printer_id    uuid references printer_configs(id) on delete set null,
  type          text,            -- bluetooth/usb/network
  ip            text,
  port          int,
  bytes         int,
  status        text,            -- ok/failed/audit_only
  ip_origin     inet,
  user_agent    text,
  created_at    timestamptz default now()
);
create index if not exists idx_printer_audit_tenant on printer_audit_log(tenant_id, created_at desc);

-- RLS
alter table printer_configs enable row level security;
alter table printer_audit_log enable row level security;

drop policy if exists printer_configs_tenant_iso on printer_configs;
create policy printer_configs_tenant_iso on printer_configs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists printer_audit_tenant_iso on printer_audit_log;
create policy printer_audit_tenant_iso on printer_audit_log
  for select using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- updated_at trigger
create or replace function trg_printer_configs_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_printer_configs_upd on printer_configs;
create trigger trg_printer_configs_upd before update on printer_configs
  for each row execute function trg_printer_configs_updated();

--- next file ---

-- ============================================
-- FILE: R14_AI_LOG.sql
-- ============================================
-- R14_AI_LOG.sql
-- Tabla de tracking de costos del AI Assistant (Claude API)
-- Permite calcular gasto por usuario/mes, tokens consumidos y modelo usado.

CREATE TABLE IF NOT EXISTS ai_chat_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model TEXT NOT NULL DEFAULT 'claude-3-5-haiku-20241022'
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_log_user_ts ON ai_chat_log (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_log_ts      ON ai_chat_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_log_model   ON ai_chat_log (model);

-- RLS: solo el dueño y admins pueden leer su log
ALTER TABLE ai_chat_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chat_log_select_own ON ai_chat_log;
CREATE POLICY ai_chat_log_select_own ON ai_chat_log
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM pos_users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin', 'superadmin', 'owner', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS ai_chat_log_insert_service ON ai_chat_log;
CREATE POLICY ai_chat_log_insert_service ON ai_chat_log
    FOR INSERT
    WITH CHECK (true);

-- Vista de costo estimado mensual (precios Haiku 3.5: $0.80 / 1M input, $4.00 / 1M output)
CREATE OR REPLACE VIEW ai_chat_cost_monthly AS
SELECT
    date_trunc('month', ts) AS month,
    user_id,
    model,
    SUM(prompt_tokens) AS total_input_tokens,
    SUM(completion_tokens) AS total_output_tokens,
    ROUND(
        (SUM(prompt_tokens)::numeric * 0.80 / 1000000.0)
      + (SUM(completion_tokens)::numeric * 4.00 / 1000000.0)
    , 4) AS estimated_cost_usd
FROM ai_chat_log
GROUP BY 1, 2, 3;

--- next file ---

-- ============================================
-- FILE: R14_SAT_CATALOGS.sql
-- ============================================
-- ============================================================
-- VOLVIX · R14 · Catálogos SAT México (CFDI 4.0)
-- Tablas para claveProdServ, claveUnidad, formaPago, metodoPago,
-- usoCFDI, regimenFiscal y mapping productos -> claves SAT.
-- ============================================================

-- ───────── c_ClaveProdServ (subset, top 200) ─────────
CREATE TABLE IF NOT EXISTS sat_clave_prodserv (
  clave           VARCHAR(8) PRIMARY KEY,
  descripcion     TEXT NOT NULL,
  incluye_ieps    BOOLEAN DEFAULT FALSE,
  ieps_categoria  TEXT,
  iva_default     NUMERIC(4,4) DEFAULT 0.16,
  vigente_desde   DATE DEFAULT '2022-01-01',
  vigente_hasta   DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sat_prodserv_desc ON sat_clave_prodserv USING gin(to_tsvector('spanish', descripcion));

INSERT INTO sat_clave_prodserv(clave, descripcion, iva_default) VALUES
  ('01010101','No existe en el catálogo',0.16),
  ('50202306','Comida preparada',0.16),
  ('90101501','Servicio de restaurante',0.16),
  ('90101502','Servicio de cafetería',0.16),
  ('90101503','Servicio de bar',0.16),
  ('50192100','Pan',0.00),
  ('50161509','Café tostado',0.16),
  ('50202203','Pizzas',0.16),
  ('50202209','Hamburguesas',0.16),
  ('50202205','Tacos',0.16),
  ('50202207','Sushi',0.16),
  ('50171550','Refrescos',0.16),
  ('50202310','Agua embotellada',0.16),
  ('50202311','Cerveza',0.16),
  ('50202312','Vinos',0.16),
  ('50202313','Licores destilados',0.16),
  ('50171500','Productos lácteos',0.00),
  ('50112000','Carnes frescas',0.00),
  ('50112004','Pollo',0.00),
  ('50112005','Res',0.00),
  ('50121500','Pescados y mariscos',0.00),
  ('50131600','Frutas frescas',0.00),
  ('50131700','Verduras frescas',0.00),
  ('50161510','Azúcar',0.00),
  ('50161800','Aceites comestibles',0.00),
  ('50181900','Cereales',0.00),
  ('50192300','Galletas',0.16),
  ('50202100','Confitería y dulces',0.16),
  ('50202400','Botanas',0.16),
  ('53131500','Productos higiene personal',0.16),
  ('53131608','Shampoo',0.16),
  ('53131626','Pasta dental',0.16),
  ('53131628','Jabón',0.16),
  ('53131643','Papel higiénico',0.16),
  ('53131649','Toallas femeninas',0.16),
  ('53131653','Pañales',0.16),
  ('47131500','Productos limpieza',0.16),
  ('47131502','Cloro',0.16),
  ('53102500','Ropa hombre',0.16),
  ('53102600','Ropa mujer',0.16),
  ('53102700','Ropa niños',0.16),
  ('53111600','Calzado',0.16),
  ('43211503','Laptops',0.16),
  ('43211507','Tablets',0.16),
  ('43211508','Smartphones',0.16),
  ('43211706','Impresoras',0.16),
  ('52161500','Televisores',0.16),
  ('52161512','Audífonos',0.16),
  ('52141501','Refrigeradores',0.16),
  ('52141505','Lavadoras',0.16),
  ('56101700','Muebles sala',0.16),
  ('56101800','Muebles recámara',0.16),
  ('14111500','Papel',0.16),
  ('44121500','Útiles escolares',0.16),
  ('27112000','Herramientas manuales',0.16),
  ('51100000','Medicamentos',0.00),
  ('25172500','Neumáticos',0.16),
  ('25174000','Aceites lubricantes',0.16),
  ('15101506','Gasolina magna',0.16),
  ('15101507','Gasolina premium',0.16),
  ('15101508','Diésel',0.16),
  ('80101500','Servicios consultoría',0.16),
  ('80111600','Honorarios profesionales',0.16),
  ('80131500','Arrendamiento bienes raíces',0.16),
  ('81111500','Servicios software',0.16),
  ('90111500','Hospedaje',0.16),
  ('85101500','Servicios médicos',NULL),
  ('86101700','Servicios educativos',NULL),
  ('60141000','Juguetes',0.16),
  ('49161500','Artículos deportivos',0.16)
ON CONFLICT (clave) DO NOTHING;

-- IEPS por clave
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='cerveza'                     WHERE clave='50202311';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='bebidas_alcoholicas_14a20'    WHERE clave='50202312';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='bebidas_alcoholicas_mas20'    WHERE clave='50202313';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='alimentos_alta_densidad'      WHERE clave IN ('50202400','50202100','50192300');
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='combustibles_fosiles'         WHERE clave IN ('15101506','15101507','15101508');

-- ───────── c_ClaveUnidad ─────────
CREATE TABLE IF NOT EXISTS sat_clave_unidad (
  clave        VARCHAR(3) PRIMARY KEY,
  nombre       TEXT NOT NULL,
  simbolo      TEXT,
  descripcion  TEXT,
  vigente_desde DATE DEFAULT '2017-01-01',
  vigente_hasta DATE
);
INSERT INTO sat_clave_unidad(clave,nombre,simbolo) VALUES
  ('PIE','Pieza','pieza'),('KGM','Kilogramo','kg'),('GRM','Gramo','g'),
  ('LTR','Litro','L'),('MLT','Mililitro','mL'),('MTR','Metro','m'),
  ('CMT','Centímetro','cm'),('MTK','Metro cuadrado','m²'),('MTQ','Metro cúbico','m³'),
  ('H87','Pieza','pza'),('EA','Cada uno','ea'),('ACT','Actividad','act'),
  ('BX','Caja','caja'),('PR','Par','par'),('SET','Juego','set'),
  ('XBX','Caja','caja'),('XPK','Paquete','pack'),('KT','Kit','kit'),
  ('HUR','Hora','h'),('DAY','Día','d'),('MON','Mes','mes'),
  ('E48','Servicio','svc'),('ZZ','Mutuamente definido',NULL)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_FormaPago ─────────
CREATE TABLE IF NOT EXISTS sat_forma_pago (
  clave        VARCHAR(2) PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  bancarizado  BOOLEAN DEFAULT FALSE,
  vigente_desde DATE DEFAULT '2017-01-01'
);
INSERT INTO sat_forma_pago(clave, descripcion, bancarizado) VALUES
  ('01','Efectivo',FALSE),('02','Cheque nominativo',TRUE),
  ('03','Transferencia electrónica de fondos',TRUE),
  ('04','Tarjeta de crédito',TRUE),('05','Monedero electrónico',TRUE),
  ('06','Dinero electrónico',TRUE),('08','Vales de despensa',FALSE),
  ('12','Dación en pago',FALSE),('13','Pago por subrogación',FALSE),
  ('14','Pago por consignación',FALSE),('15','Condonación',FALSE),
  ('17','Compensación',FALSE),('23','Novación',FALSE),
  ('24','Confusión',FALSE),('25','Remisión de deuda',FALSE),
  ('26','Prescripción o caducidad',FALSE),('27','A satisfacción del acreedor',FALSE),
  ('28','Tarjeta de débito',TRUE),('29','Tarjeta de servicios',TRUE),
  ('30','Aplicación de anticipos',FALSE),('31','Intermediario pagos',TRUE),
  ('99','Por definir',FALSE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_MetodoPago ─────────
CREATE TABLE IF NOT EXISTS sat_metodo_pago (
  clave        VARCHAR(3) PRIMARY KEY,
  descripcion  TEXT NOT NULL
);
INSERT INTO sat_metodo_pago(clave,descripcion) VALUES
  ('PUE','Pago en una sola exhibición'),
  ('PPD','Pago en parcialidades o diferido')
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_UsoCFDI (extendido CFDI 4.0) ─────────
CREATE TABLE IF NOT EXISTS sat_uso_cfdi (
  clave           VARCHAR(4) PRIMARY KEY,
  descripcion     TEXT NOT NULL,
  aplica_pf       BOOLEAN DEFAULT TRUE,
  aplica_pm       BOOLEAN DEFAULT TRUE,
  regimenes_pf    TEXT[],
  regimenes_pm    TEXT[],
  vigente_desde   DATE DEFAULT '2022-01-01'
);
INSERT INTO sat_uso_cfdi(clave,descripcion,aplica_pf,aplica_pm) VALUES
  ('G01','Adquisición de mercancías',TRUE,TRUE),
  ('G02','Devoluciones, descuentos o bonificaciones',TRUE,TRUE),
  ('G03','Gastos en general',TRUE,TRUE),
  ('I01','Construcciones',TRUE,TRUE),
  ('I02','Mobiliario y equipo de oficina por inversiones',TRUE,TRUE),
  ('I03','Equipo de transporte',TRUE,TRUE),
  ('I04','Equipo de cómputo y accesorios',TRUE,TRUE),
  ('I05','Dados, troqueles, moldes, matrices y herramental',TRUE,TRUE),
  ('I06','Comunicaciones telefónicas',TRUE,TRUE),
  ('I07','Comunicaciones satelitales',TRUE,TRUE),
  ('I08','Otra maquinaria y equipo',TRUE,TRUE),
  ('D01','Honorarios médicos, dentales y gastos hospitalarios',TRUE,FALSE),
  ('D02','Gastos médicos por incapacidad o discapacidad',TRUE,FALSE),
  ('D03','Gastos funerales',TRUE,FALSE),
  ('D04','Donativos',TRUE,FALSE),
  ('D05','Intereses reales por créditos hipotecarios (casa habitación)',TRUE,FALSE),
  ('D06','Aportaciones voluntarias al SAR',TRUE,FALSE),
  ('D07','Primas por seguros de gastos médicos',TRUE,FALSE),
  ('D08','Gastos de transportación escolar obligatoria',TRUE,FALSE),
  ('D09','Depósitos en cuentas para el ahorro, primas planes de pensiones',TRUE,FALSE),
  ('D10','Pagos por servicios educativos (colegiaturas)',TRUE,FALSE),
  ('CP01','Pagos',TRUE,TRUE),
  ('S01','Sin efectos fiscales',TRUE,TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_RegimenFiscal ─────────
CREATE TABLE IF NOT EXISTS sat_regimen_fiscal (
  clave        VARCHAR(3) PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  aplica_pf    BOOLEAN DEFAULT FALSE,
  aplica_pm    BOOLEAN DEFAULT FALSE
);
INSERT INTO sat_regimen_fiscal(clave,descripcion,aplica_pf,aplica_pm) VALUES
  ('601','General de Ley Personas Morales',FALSE,TRUE),
  ('603','Personas Morales con Fines no Lucrativos',FALSE,TRUE),
  ('605','Sueldos y Salarios e Ingresos Asimilados a Salarios',TRUE,FALSE),
  ('606','Arrendamiento',TRUE,FALSE),
  ('607','Régimen de Enajenación o Adquisición de Bienes',TRUE,FALSE),
  ('608','Demás ingresos',TRUE,FALSE),
  ('610','Residentes en el Extranjero sin Establecimiento Permanente',TRUE,TRUE),
  ('611','Ingresos por Dividendos (socios y accionistas)',TRUE,FALSE),
  ('612','Personas Físicas con Actividades Empresariales y Profesionales',TRUE,FALSE),
  ('614','Ingresos por intereses',TRUE,FALSE),
  ('615','Régimen de los ingresos por obtención de premios',TRUE,FALSE),
  ('616','Sin obligaciones fiscales',TRUE,FALSE),
  ('620','Sociedades Cooperativas de Producción',FALSE,TRUE),
  ('621','Incorporación Fiscal',TRUE,FALSE),
  ('622','Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',FALSE,TRUE),
  ('623','Opcional para Grupos de Sociedades',FALSE,TRUE),
  ('624','Coordinados',FALSE,TRUE),
  ('625','Régimen Plataformas Tecnológicas',TRUE,FALSE),
  ('626','Régimen Simplificado de Confianza (RESICO)',TRUE,TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── product_sat_mapping ─────────
CREATE TABLE IF NOT EXISTS product_sat_mapping (
  id              BIGSERIAL PRIMARY KEY,
  product_id      UUID,
  product_code    TEXT,
  tenant_id       UUID,
  clave_prodserv  VARCHAR(8) NOT NULL REFERENCES sat_clave_prodserv(clave),
  clave_unidad    VARCHAR(3) NOT NULL REFERENCES sat_clave_unidad(clave),
  iva_tipo        VARCHAR(10) DEFAULT '16',  -- '16'|'8'|'0'|'exento'
  ieps_categoria  TEXT,
  objeto_imp      VARCHAR(2) DEFAULT '02',   -- 01 no objeto, 02 sí objeto, 03 sí objeto no obligado, 04 no obligado IEPS
  source          TEXT DEFAULT 'manual',     -- 'auto'|'manual'|'imported'
  confidence      NUMERIC(3,2) DEFAULT 1.0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id),
  UNIQUE(tenant_id, product_code)
);
CREATE INDEX IF NOT EXISTS idx_psm_product   ON product_sat_mapping(product_id);
CREATE INDEX IF NOT EXISTS idx_psm_tenant    ON product_sat_mapping(tenant_id);
CREATE INDEX IF NOT EXISTS idx_psm_prodserv  ON product_sat_mapping(clave_prodserv);

-- RLS
ALTER TABLE product_sat_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS psm_tenant_isolation ON product_sat_mapping;
CREATE POLICY psm_tenant_isolation ON product_sat_mapping
  USING (tenant_id IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_psm_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS psm_updated_at ON product_sat_mapping;
CREATE TRIGGER psm_updated_at BEFORE UPDATE ON product_sat_mapping
  FOR EACH ROW EXECUTE FUNCTION trg_psm_updated();

--- next file ---

-- ============================================
-- FILE: R14_WEBHOOKS.sql
-- ============================================
-- =============================================================
-- R14_WEBHOOKS.sql — Outbound webhook subscriptions per tenant
-- =============================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  url         text NOT NULL,
  secret      text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant
  ON webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_active
  ON webhook_endpoints(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events_gin
  ON webhook_endpoints USING gin (events);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  tenant_id    text NOT NULL,
  event        text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
  status_code  integer,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  ts           timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON webhook_deliveries(endpoint_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant
  ON webhook_deliveries(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status) WHERE status <> 'sent';

-- RLS
ALTER TABLE webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON webhook_endpoints;
CREATE POLICY webhook_endpoints_tenant_isolation ON webhook_endpoints
  USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
         OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin'));

DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation ON webhook_deliveries;
CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries
  USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
         OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin'));

--- next file ---

-- ============================================
-- FILE: R14_MFA.sql
-- ============================================
-- =============================================================
-- R14: MFA (TOTP + backup codes)
-- =============================================================

-- 1) Extender pos_users
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret  text,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes text[] NOT NULL DEFAULT '{}';

-- 2) Tabla de intentos para rate-limit / auditoría
CREATE TABLE IF NOT EXISTS mfa_attempts (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES pos_users(id) ON DELETE CASCADE,
  ts        timestamptz NOT NULL DEFAULT now(),
  ip        text,
  success   boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_ts
  ON mfa_attempts (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_attempts_ip_ts
  ON mfa_attempts (ip, ts DESC);

-- 3) Vista helper: intentos fallidos en últimos 15 min
CREATE OR REPLACE VIEW mfa_recent_failures AS
SELECT user_id, count(*) AS failures
FROM mfa_attempts
WHERE ts > now() - interval '15 minutes'
  AND success = false
GROUP BY user_id;

--- next file ---

-- ============================================
-- FILE: R14_SUBSCRIPTIONS.sql
-- ============================================
-- =============================================================
-- R14 · SUBSCRIPTIONS (SaaS multi-tenant billing)
-- Planes Free / Pro / Enterprise
-- =============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents  INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'MXN',
  features            JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits              JSONB NOT NULL DEFAULT '{}'::jsonb,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_price_monthly TEXT,
  stripe_price_yearly  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  status                  TEXT NOT NULL DEFAULT 'trial'
                          CHECK (status IN ('trial','active','past_due','canceled')),
  billing_cycle           TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  stripe_subscription_id  TEXT,
  stripe_customer_id      TEXT,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_events_sub ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_ts  ON subscription_events(ts DESC);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL,
  stripe_invoice_id  TEXT,
  number             TEXT,
  amount_cents       INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'MXN',
  status             TEXT NOT NULL DEFAULT 'open',
  hosted_invoice_url TEXT,
  pdf_url            TEXT,
  period_start       TIMESTAMPTZ,
  period_end         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_tenant ON subscription_invoices(tenant_id);

-- =============================================================
-- SEED: 3 planes base
-- =============================================================
INSERT INTO subscription_plans (name, price_monthly_cents, price_yearly_cents, currency, features, limits, active)
VALUES
  ('Free',
    0, 0, 'MXN',
    '{"support":"community","ai":false,"reports":"basic","backups":false}'::jsonb,
    '{"max_users":1,"max_products":100,"max_locations":1,"max_sales_per_month":500}'::jsonb,
    TRUE),
  ('Pro',
    29900, 299000, 'MXN',
    '{"support":"email","ai":true,"reports":"advanced","backups":true,"loyalty":true}'::jsonb,
    '{"max_users":5,"max_products":-1,"max_locations":3,"max_sales_per_month":-1}'::jsonb,
    TRUE),
  ('Enterprise',
    99900, 999000, 'MXN',
    '{"support":"priority","ai":true,"reports":"advanced","backups":true,"loyalty":true,"sso":true,"sla":true}'::jsonb,
    '{"max_users":-1,"max_products":-1,"max_locations":-1,"max_sales_per_month":-1}'::jsonb,
    TRUE)
ON CONFLICT (name) DO UPDATE
  SET price_monthly_cents = EXCLUDED.price_monthly_cents,
      price_yearly_cents  = EXCLUDED.price_yearly_cents,
      features            = EXCLUDED.features,
      limits              = EXCLUDED.limits,
      active              = EXCLUDED.active;

--- next file ---

-- ============================================
-- FILE: R14_VERTICAL_TEMPLATES.sql
-- ============================================
-- =====================================================================
-- R14_VERTICAL_TEMPLATES.sql
-- Plantillas de productos seed por vertical para Onboarding v2
-- Tenant placeholder: reemplazar :tenant_id antes de ejecutar
-- =====================================================================

-- Tabla auxiliar (idempotente) para templates reutilizables
CREATE TABLE IF NOT EXISTS vertical_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical    text NOT NULL,
  name        text NOT NULL,
  sku         text,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  stock       int NOT NULL DEFAULT 0,
  barcode     text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vertical_templates_vertical ON vertical_templates(vertical);

-- Asegurar que companies tenga marca de onboarded
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS vertical text,
  ADD COLUMN IF NOT EXISTS branding jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_config jsonb;

-- SAFE: idempotent re-seed via UNIQUE(vertical, sku) + ON CONFLICT
-- Original used TRUNCATE which destroys customer-added templates on re-run.
CREATE UNIQUE INDEX IF NOT EXISTS ux_vertical_templates_vertical_sku
  ON vertical_templates(vertical, sku);

-- ===== FARMACIA =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('farmacia','Paracetamol 500mg 20 tabs','FAR-001',35,50),
  ('farmacia','Ibuprofeno 400mg 10 tabs','FAR-002',42,40),
  ('farmacia','Alcohol 70% 250ml','FAR-003',28,30),
  ('farmacia','Cubrebocas KN95 (pack 5)','FAR-004',60,20),
  ('farmacia','Vitamina C 1g 30 tabs','FAR-005',95,25),
  ('farmacia','Naproxeno 250mg 30 tabs','FAR-006',85,30),
  ('farmacia','Loratadina 10mg 20 tabs','FAR-007',55,25)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== RESTAURANTE =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('restaurante','Refresco 600ml','RES-001',25,100),
  ('restaurante','Hamburguesa clasica','RES-002',95,0),
  ('restaurante','Orden de papas','RES-003',45,0),
  ('restaurante','Agua natural 600ml','RES-004',18,80),
  ('restaurante','Cerveza 355ml','RES-005',40,60),
  ('restaurante','Ensalada cesar','RES-006',120,0),
  ('restaurante','Postre del dia','RES-007',65,0)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== GYM =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('gym','Mensualidad estandar','GYM-001',599,0),
  ('gym','Inscripcion','GYM-002',300,0),
  ('gym','Proteina whey 1kg','GYM-003',750,15),
  ('gym','Botella shaker','GYM-004',120,25),
  ('gym','Pase diario','GYM-005',80,0),
  ('gym','Membresia anual','GYM-006',5990,0)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== SALON =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('salon','Corte de cabello dama','SAL-001',250,0),
  ('salon','Corte caballero','SAL-002',150,0),
  ('salon','Tinte completo','SAL-003',650,0),
  ('salon','Manicure','SAL-004',180,0),
  ('salon','Shampoo profesional 500ml','SAL-005',320,12),
  ('salon','Pedicure','SAL-006',220,0)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== FERRETERIA =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('ferreteria','Martillo 16oz','FER-001',180,20),
  ('ferreteria','Desarmador plano 6"','FER-002',75,30),
  ('ferreteria','Cinta de aislar negra','FER-003',28,100),
  ('ferreteria','Tornillos 1/2" (100pz)','FER-004',95,40),
  ('ferreteria','Pintura blanca 1 galon','FER-005',480,15),
  ('ferreteria','Cable calibre 12 (m)','FER-006',22,200)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== PAPELERIA =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('papeleria','Cuaderno profesional 100h','PAP-001',65,50),
  ('papeleria','Boligrafo azul (paq 4)','PAP-002',35,80),
  ('papeleria','Lapiz #2 (paq 12)','PAP-003',45,60),
  ('papeleria','Hojas blancas carta (100)','PAP-004',90,40),
  ('papeleria','Tijeras escolares','PAP-005',55,35),
  ('papeleria','Pegamento blanco 250ml','PAP-006',48,30)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== ABARROTES =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('abarrotes','Refresco 2L','ABA-001',38,80),
  ('abarrotes','Pan de caja grande','ABA-002',52,25),
  ('abarrotes','Leche 1L','ABA-003',28,60),
  ('abarrotes','Huevo (kg)','ABA-004',60,30),
  ('abarrotes','Frijol negro 1kg','ABA-005',45,40),
  ('abarrotes','Arroz blanco 1kg','ABA-006',38,50),
  ('abarrotes','Aceite vegetal 1L','ABA-007',55,30)
ON CONFLICT (vertical, sku) DO NOTHING;

-- ===== CAFETERIA =====
INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('cafeteria','Espresso sencillo','CAF-001',35,0),
  ('cafeteria','Capuchino','CAF-002',55,0),
  ('cafeteria','Latte','CAF-003',60,0),
  ('cafeteria','Croissant','CAF-004',45,0),
  ('cafeteria','Te helado','CAF-005',40,0),
  ('cafeteria','Sandwich jamon y queso','CAF-006',75,0)
ON CONFLICT (vertical, sku) DO NOTHING;

-- =====================================================================
-- Helper: copiar plantilla a un tenant
-- USO:  SELECT seed_vertical_for_tenant('farmacia', 'TENANT-UUID-HERE');
-- =====================================================================
CREATE OR REPLACE FUNCTION seed_vertical_for_tenant(p_vertical text, p_tenant uuid)
RETURNS int LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO products (name, sku, price, stock, barcode, tenant_id)
  SELECT name, sku, price, stock, barcode, p_tenant
  FROM vertical_templates
  WHERE vertical = p_vertical;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

--- next file ---

-- ============================================
-- FILE: R14_API_KEYS.sql
-- ============================================
-- =============================================================
-- R14_API_KEYS.sql
-- API keys for third-party integrations (Zapier / Make / n8n).
-- Keys are stored hashed (sha256). Plain key (vlx_xxx) returned ONCE on creation.
-- =============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_prefix    text NOT NULL,                 -- first 12 chars (vlx_xxxxxx) for display
  key_hash      text NOT NULL UNIQUE,          -- sha256(plain_key) hex
  scopes        text[] NOT NULL DEFAULT ARRAY['read']::text[],  -- subset of {read,write,admin}
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid REFERENCES pos_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT api_keys_scopes_check CHECK (
    scopes <@ ARRAY['read','write','admin']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant       ON api_keys(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash         ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires      ON api_keys(expires_at) WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;
CREATE POLICY api_keys_tenant_isolation ON api_keys
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS api_keys_admin_only ON api_keys;
CREATE POLICY api_keys_admin_only ON api_keys
  FOR ALL
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND current_setting('app.role', true) IN ('admin','owner','superadmin')
  );

-- Helper: log usage
CREATE OR REPLACE FUNCTION touch_api_key(p_hash text)
RETURNS void LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE api_keys SET last_used_at = now() WHERE key_hash = p_hash AND revoked_at IS NULL;
$$;

COMMENT ON TABLE  api_keys IS 'R14: API keys for Zapier/Make/n8n integrations';
COMMENT ON COLUMN api_keys.scopes IS 'Subset of {read,write,admin}. Validated by API middleware.';

--- next file ---

-- ============================================
-- FILE: R14_CUSTOMER_AUTH.sql
-- ============================================
-- =============================================================
-- R14 — CUSTOMER PORTAL AUTH
-- Tabla customer_otps + índice de expiración
-- Rol JWT 'customer' se emite desde la API (no requiere DB enum)
-- =============================================================

CREATE TABLE IF NOT EXISTS customer_otps (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  code_hash   TEXT        NOT NULL,            -- SHA-256(otp + email)
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_otps_email      ON customer_otps (email);
CREATE INDEX IF NOT EXISTS idx_customer_otps_expires_at ON customer_otps (expires_at);

-- Limpieza periódica (>24h) — ejecutar vía cron / pg_cron
-- DELETE FROM customer_otps WHERE expires_at < NOW() - INTERVAL '24 hours';

-- =============================================================
-- Tabla mínima de clientes self-service (si no existe ya).
-- Si tu schema usa otra tabla, ignora este bloque.
-- =============================================================
CREATE TABLE IF NOT EXISTS portal_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  phone           TEXT,
  tenant_id       TEXT,
  loyalty_points  INTEGER NOT NULL DEFAULT 0,
  password_hash   TEXT,                     -- opcional (cambio de password)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_customers_email ON portal_customers (email);

-- Notas:
-- 1. El JWT cliente lleva role='customer'. requireAuth([... 'customer']) lo permite.
-- 2. Las RLS deben filtrar customer_id = current_setting('request.jwt.claim.id').

--- next file ---

-- ============================================
-- FILE: R13_RLS_POLICIES.sql
-- ============================================
-- =============================================================================
-- VOLVIX POS GODMODE 3.4.0 — R13_RLS_POLICIES.sql
-- Row Level Security policies for Supabase / PostgreSQL
-- =============================================================================
-- Multi-tenant model:
--   * Each business-data row carries a tenant_id (FK -> tenants.id)
--   * Roles:
--       - admin   : platform super-user. Full read/write across all tenants.
--       - owner   : tenant administrator. Full read/write within own tenant.
--       - cajero  : cashier. POS-only access (sales, sale_items, payments,
--                   read products/customers, own cash_register shift) within
--                   own tenant. No access to reports / inventory adjustments
--                   / users management.
--
-- Tables covered:
--   tenants, users, products, customers, sales, sale_items, payments,
--   inventory_movements, cash_register, reports
--
-- Idempotent: every policy is dropped (IF EXISTS) before being recreated.
-- Safe to re-run on every migration / deploy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
-- Centralised JWT-claim readers. Supabase puts custom claims under
-- auth.jwt() -> 'app_metadata'. We expose them as STABLE SQL functions so
-- policies stay readable and the planner can inline them.
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app;

-- Returns the tenant_id stored in the caller's JWT (NULL for anon).
CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.tenant_id', true),
      (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    ),
    ''
  )::uuid;
$$;

-- Returns the role stored in the caller's JWT ('admin' | 'owner' | 'cajero').
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.role', true),
    (auth.jwt() -> 'app_metadata' ->> 'role')
  );
$$;

CREATE OR REPLACE FUNCTION app.is_admin()  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'admin' $$;
CREATE OR REPLACE FUNCTION app.is_owner()  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'owner' $$;
CREATE OR REPLACE FUNCTION app.is_cajero() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'cajero' $$;

-- Convenience: same tenant as caller (and caller has any tenant set).
CREATE OR REPLACE FUNCTION app.same_tenant(t uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT t IS NOT NULL AND t = app.current_tenant_id();
$$;

-- =============================================================================
-- 1. ENABLE RLS ON EVERY TABLE
-- =============================================================================
ALTER TABLE public.tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports              ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners during dev (admins go through service_role
-- which BYPASSES RLS automatically — no need for FORCE here).

-- =============================================================================
-- 2. tenants
-- =============================================================================
-- admin : full CRUD on every tenant.
-- owner : SELECT/UPDATE only the row that matches their JWT tenant_id.
-- cajero: SELECT only their own tenant (read-only profile).
-- =============================================================================

DROP POLICY IF EXISTS tenants_admin_all       ON public.tenants;
DROP POLICY IF EXISTS tenants_owner_select    ON public.tenants;
DROP POLICY IF EXISTS tenants_owner_update    ON public.tenants;
DROP POLICY IF EXISTS tenants_cajero_select   ON public.tenants;

CREATE POLICY tenants_admin_all     ON public.tenants
  FOR ALL    TO authenticated USING (app.is_admin())                            WITH CHECK (app.is_admin());

CREATE POLICY tenants_owner_select  ON public.tenants
  FOR SELECT TO authenticated USING (app.is_owner() AND id = app.current_tenant_id());

CREATE POLICY tenants_owner_update  ON public.tenants
  FOR UPDATE TO authenticated USING (app.is_owner() AND id = app.current_tenant_id())
                              WITH CHECK (app.is_owner() AND id = app.current_tenant_id());

CREATE POLICY tenants_cajero_select ON public.tenants
  FOR SELECT TO authenticated USING (app.is_cajero() AND id = app.current_tenant_id());

-- =============================================================================
-- 3. users
-- =============================================================================
-- admin : full CRUD.
-- owner : full CRUD on users of own tenant (cannot escalate role to 'admin').
-- cajero: SELECT only own row (id = auth.uid()).
-- =============================================================================

DROP POLICY IF EXISTS users_admin_all          ON public.users;
DROP POLICY IF EXISTS users_owner_select       ON public.users;
DROP POLICY IF EXISTS users_owner_insert       ON public.users;
DROP POLICY IF EXISTS users_owner_update       ON public.users;
DROP POLICY IF EXISTS users_owner_delete       ON public.users;
DROP POLICY IF EXISTS users_cajero_select_self ON public.users;

CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY users_owner_select ON public.users
  FOR SELECT TO authenticated
  USING (app.is_owner() AND app.same_tenant(tenant_id));

-- Owner cannot create platform admins.
CREATE POLICY users_owner_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id) AND role IN ('owner','cajero'));

CREATE POLICY users_owner_update ON public.users
  FOR UPDATE TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id) AND role IN ('owner','cajero'));

CREATE POLICY users_owner_delete ON public.users
  FOR DELETE TO authenticated
  USING (app.is_owner() AND app.same_tenant(tenant_id) AND role <> 'admin');

CREATE POLICY users_cajero_select_self ON public.users
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND id = auth.uid());

-- =============================================================================
-- 4. products
-- =============================================================================
-- admin : full CRUD anywhere.
-- owner : full CRUD within own tenant.
-- cajero: SELECT only (POS needs the catalog to ring up sales).
-- =============================================================================

DROP POLICY IF EXISTS products_admin_all     ON public.products;
DROP POLICY IF EXISTS products_owner_all     ON public.products;
DROP POLICY IF EXISTS products_cajero_select ON public.products;

CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY products_owner_all ON public.products
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY products_cajero_select ON public.products
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

-- =============================================================================
-- 5. customers
-- =============================================================================
-- admin : full CRUD.
-- owner : full CRUD within own tenant.
-- cajero: SELECT + INSERT (cashier can register a new walk-in customer at POS)
--         within own tenant. No update/delete.
-- =============================================================================

DROP POLICY IF EXISTS customers_admin_all     ON public.customers;
DROP POLICY IF EXISTS customers_owner_all     ON public.customers;
DROP POLICY IF EXISTS customers_cajero_select ON public.customers;
DROP POLICY IF EXISTS customers_cajero_insert ON public.customers;

CREATE POLICY customers_admin_all ON public.customers
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY customers_owner_all ON public.customers
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY customers_cajero_select ON public.customers
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

CREATE POLICY customers_cajero_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (app.is_cajero() AND app.same_tenant(tenant_id));

-- =============================================================================
-- 6. sales
-- =============================================================================
-- admin : full CRUD.
-- owner : full CRUD within own tenant (refunds, voids, audits).
-- cajero: SELECT + INSERT within own tenant. The created sale must be
--         attributed to the cashier (cashier_id = auth.uid()).
--         No UPDATE / DELETE — refunds are a separate flow handled by owner.
-- =============================================================================

DROP POLICY IF EXISTS sales_admin_all     ON public.sales;
DROP POLICY IF EXISTS sales_owner_all     ON public.sales;
DROP POLICY IF EXISTS sales_cajero_select ON public.sales;
DROP POLICY IF EXISTS sales_cajero_insert ON public.sales;

CREATE POLICY sales_admin_all ON public.sales
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY sales_owner_all ON public.sales
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY sales_cajero_select ON public.sales
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

CREATE POLICY sales_cajero_insert ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (app.is_cajero() AND app.same_tenant(tenant_id) AND cashier_id = auth.uid());

-- =============================================================================
-- 7. sale_items
-- =============================================================================
-- Visibility derives from the parent sale: a row is visible iff the user can
-- see its sale. We re-check tenant_id directly for performance and as defence
-- in depth.
-- admin : full CRUD.
-- owner : full CRUD within own tenant.
-- cajero: SELECT + INSERT within own tenant; insert only into a sale created
--         by the same cashier (prevents tampering with peers' tickets).
-- =============================================================================

DROP POLICY IF EXISTS sale_items_admin_all     ON public.sale_items;
DROP POLICY IF EXISTS sale_items_owner_all     ON public.sale_items;
DROP POLICY IF EXISTS sale_items_cajero_select ON public.sale_items;
DROP POLICY IF EXISTS sale_items_cajero_insert ON public.sale_items;

CREATE POLICY sale_items_admin_all ON public.sale_items
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY sale_items_owner_all ON public.sale_items
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY sale_items_cajero_select ON public.sale_items
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

CREATE POLICY sale_items_cajero_insert ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_cajero()
    AND app.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.tenant_id  = sale_items.tenant_id
        AND s.cashier_id = auth.uid()
    )
  );

-- =============================================================================
-- 8. payments
-- =============================================================================
-- admin : full CRUD.
-- owner : full CRUD within own tenant.
-- cajero: SELECT + INSERT within own tenant; insert only into sales they own.
--         No UPDATE / DELETE — payments are immutable from the cashier's POV.
-- =============================================================================

DROP POLICY IF EXISTS payments_admin_all     ON public.payments;
DROP POLICY IF EXISTS payments_owner_all     ON public.payments;
DROP POLICY IF EXISTS payments_cajero_select ON public.payments;
DROP POLICY IF EXISTS payments_cajero_insert ON public.payments;

CREATE POLICY payments_admin_all ON public.payments
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY payments_owner_all ON public.payments
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY payments_cajero_select ON public.payments
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id));

CREATE POLICY payments_cajero_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_cajero()
    AND app.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND s.tenant_id  = payments.tenant_id
        AND s.cashier_id = auth.uid()
    )
  );

-- =============================================================================
-- 9. inventory_movements
-- =============================================================================
-- admin : full CRUD.
-- owner : full CRUD within own tenant (manual adjustments, transfers, POs).
-- cajero: NO ACCESS. Stock decrements caused by a sale are written by a
--         SECURITY DEFINER trigger / RPC running as service_role, NOT by the
--         cashier role directly. This keeps inventory tamper-proof at POS.
-- =============================================================================

DROP POLICY IF EXISTS inventory_movements_admin_all ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_owner_all ON public.inventory_movements;

CREATE POLICY inventory_movements_admin_all ON public.inventory_movements
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY inventory_movements_owner_all ON public.inventory_movements
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

-- (No cajero policy => default-deny for cashiers.)

-- =============================================================================
-- 10. cash_register
-- =============================================================================
-- One row per shift (open/close, opening_amount, closing_amount, cashier_id).
-- admin : full CRUD.
-- owner : full CRUD within own tenant (audits, force-close).
-- cajero: SELECT + INSERT + UPDATE within own tenant, ONLY rows where
--         cashier_id = auth.uid() (open / close own shift).
-- =============================================================================

DROP POLICY IF EXISTS cash_register_admin_all     ON public.cash_register;
DROP POLICY IF EXISTS cash_register_owner_all     ON public.cash_register;
DROP POLICY IF EXISTS cash_register_cajero_select ON public.cash_register;
DROP POLICY IF EXISTS cash_register_cajero_insert ON public.cash_register;
DROP POLICY IF EXISTS cash_register_cajero_update ON public.cash_register;

CREATE POLICY cash_register_admin_all ON public.cash_register
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY cash_register_owner_all ON public.cash_register
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

CREATE POLICY cash_register_cajero_select ON public.cash_register
  FOR SELECT TO authenticated
  USING (app.is_cajero() AND app.same_tenant(tenant_id) AND cashier_id = auth.uid());

CREATE POLICY cash_register_cajero_insert ON public.cash_register
  FOR INSERT TO authenticated
  WITH CHECK (app.is_cajero() AND app.same_tenant(tenant_id) AND cashier_id = auth.uid());

CREATE POLICY cash_register_cajero_update ON public.cash_register
  FOR UPDATE TO authenticated
  USING      (app.is_cajero() AND app.same_tenant(tenant_id) AND cashier_id = auth.uid())
  WITH CHECK (app.is_cajero() AND app.same_tenant(tenant_id) AND cashier_id = auth.uid());

-- =============================================================================
-- 11. reports
-- =============================================================================
-- Persisted / scheduled reports (sales summaries, P&L, inventory snapshots).
-- admin : full CRUD.
-- owner : full CRUD within own tenant.
-- cajero: NO ACCESS. Cashiers do not see consolidated reports.
-- =============================================================================

DROP POLICY IF EXISTS reports_admin_all ON public.reports;
DROP POLICY IF EXISTS reports_owner_all ON public.reports;

CREATE POLICY reports_admin_all ON public.reports
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY reports_owner_all ON public.reports
  FOR ALL TO authenticated
  USING      (app.is_owner() AND app.same_tenant(tenant_id))
  WITH CHECK (app.is_owner() AND app.same_tenant(tenant_id));

-- (No cajero policy => default-deny for cashiers.)

-- =============================================================================
-- 12. PRIVILEGES
-- =============================================================================
-- RLS only filters rows; you still need table-level GRANTs for the role to
-- reach the policy check at all. service_role bypasses RLS.
-- =============================================================================

GRANT USAGE ON SCHEMA public, app TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.tenants,
  public.users,
  public.products,
  public.customers,
  public.sales,
  public.sale_items,
  public.payments,
  public.inventory_movements,
  public.cash_register,
  public.reports
TO authenticated;

-- =============================================================================
-- END OF R13_RLS_POLICIES.sql
-- =============================================================================

--- next file ---

COMMIT;

-- ============================================================================
-- END R14_ALL_COMBINED_SAFE.sql — verify with selects in R14_RUN_INSTRUCTIONS.md
-- ============================================================================
