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
