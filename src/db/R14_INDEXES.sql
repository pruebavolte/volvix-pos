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
