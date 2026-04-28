-- ============================================================================
-- VOLVIX POS — Rollback all migrations
-- ----------------------------------------------------------------------------
-- DANGER: This drops every table created by the migrations in this folder
-- and removes columns added to existing tables. Run only on dev/staging.
-- Order is reverse-dependency-safe.
-- ============================================================================

BEGIN;

-- Triggers and functions are dropped automatically with their tables (CASCADE).

-- owner-saas.sql
DROP TABLE IF EXISTS billing_invoices    CASCADE;
DROP TABLE IF EXISTS maintenance_blocks  CASCADE;
DROP TABLE IF EXISTS feature_kill_switch CASCADE;
DROP TABLE IF EXISTS deploys             CASCADE;
DROP TABLE IF EXISTS tenant_seats        CASCADE;
DROP TABLE IF EXISTS sub_tenants         CASCADE;
DROP FUNCTION IF EXISTS saas_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS saas_set_updated_at() CASCADE;

-- users-tenant.sql
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP FUNCTION IF EXISTS tenant_users_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS tenant_users_set_updated_at() CASCADE;

-- customer-payments.sql
DROP TABLE IF EXISTS customer_payments CASCADE;
DROP FUNCTION IF EXISTS apply_customer_payment() CASCADE;
DROP FUNCTION IF EXISTS custpay_audit_trigger() CASCADE;
-- column adds on customers (kept by default; uncomment if you want them gone)
-- ALTER TABLE customers DROP COLUMN IF EXISTS balance;
-- ALTER TABLE customers DROP COLUMN IF EXISTS credit_limit;

-- inventory-movements.sql
DROP TABLE IF EXISTS inventory_count_items CASCADE;
DROP TABLE IF EXISTS inventory_counts      CASCADE;
DROP TABLE IF EXISTS inventory_movements   CASCADE;
DROP FUNCTION IF EXISTS apply_inventory_movement() CASCADE;
DROP FUNCTION IF EXISTS inventory_audit_trigger() CASCADE;

-- cuts.sql
DROP TABLE IF EXISTS cuts_cash_movements CASCADE;
-- remove FK on sales first if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_sales_cut') THEN
    ALTER TABLE sales DROP CONSTRAINT fk_sales_cut;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'sales' AND column_name = 'cut_id') THEN
    ALTER TABLE sales DROP COLUMN cut_id;
  END IF;
END$$;
DROP TABLE IF EXISTS cuts CASCADE;
DROP FUNCTION IF EXISTS recalc_cut_totals(UUID) CASCADE;
DROP FUNCTION IF EXISTS cuts_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS cuts_set_updated_at() CASCADE;

-- feature-flags.sql is intentionally NOT rolled back here (already in production).

COMMIT;
