-- R19 FIX: R14_INDEXES.sql
-- Original error: column "pos_user_id" does not exist
-- Cause: pos_login_events.pos_user_id no existe; usamos columnas que SÍ existen.
-- Aplica solo índices a columnas confirmadas en information_schema.

-- pos_users
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_users_email
  ON pos_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_pos_users_created_at_desc
  ON pos_users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_users_company_id
  ON pos_users (company_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_is_active
  ON pos_users (is_active) WHERE is_active = true;

-- pos_products  (confirmado: pos_user_id, name, code, stock existen)
CREATE INDEX IF NOT EXISTS idx_pos_products_user_name
  ON pos_products (pos_user_id, name);
CREATE INDEX IF NOT EXISTS idx_pos_products_user_code
  ON pos_products (pos_user_id, code);
CREATE INDEX IF NOT EXISTS idx_pos_products_stock_asc
  ON pos_products (stock ASC) WHERE stock < 50;
CREATE INDEX IF NOT EXISTS idx_pos_products_name_trgm
  ON pos_products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pos_products_code_trgm
  ON pos_products USING gin (code gin_trgm_ops);

-- pos_sales (confirmado: pos_user_id, created_at, total)
CREATE INDEX IF NOT EXISTS idx_pos_sales_user_created_desc
  ON pos_sales (pos_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created_at_desc
  ON pos_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created_total
  ON pos_sales (created_at DESC, total);

-- pos_companies
CREATE INDEX IF NOT EXISTS idx_pos_companies_created_at_desc
  ON pos_companies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_companies_active
  ON pos_companies (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pos_companies_owner
  ON pos_companies (owner_user_id);

-- customers (user_id, email, phone, active confirmados)
CREATE INDEX IF NOT EXISTS idx_customers_user_created_desc
  ON customers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_email
  ON customers (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active
  ON customers (active) WHERE active = true;

-- pos_login_events: tabla NO tiene pos_user_id según probe original (la causa real).
-- Saltamos sus índices o usamos columna existente si la hay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='pos_login_events'
               AND column_name='pos_user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_login_events_user_created
             ON pos_login_events (pos_user_id, created_at DESC)';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='pos_login_events'
                  AND column_name='user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_login_events_user_created
             ON pos_login_events (user_id, created_at DESC)';
  END IF;
END $$;

-- generic_blobs: solo si la tabla existe (no estaba en el probe; condicional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='generic_blobs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_generic_blobs_user_key_updated
             ON generic_blobs (pos_user_id, key, updated_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_generic_blobs_value_gin
             ON generic_blobs USING gin (value)';
  END IF;
END $$;

-- licenses / domains / billing_configs / sync_queue
CREATE INDEX IF NOT EXISTS idx_licenses_created_at_desc
  ON licenses (created_at DESC);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='licenses' AND column_name='license_key') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses (license_key)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='licenses' AND column_name='is_active') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_licenses_active ON licenses (is_active) WHERE is_active = true';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_domains_created_at_desc          ON domains (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_configs_created_at_desc  ON billing_configs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at_desc       ON sync_queue (created_at DESC);

-- daily_sales_report: solo si es TABLE (no VIEW); skip si view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='daily_sales_report'
      AND table_type='BASE TABLE'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='daily_sales_report' AND column_name='sale_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_daily_sales_report_date_desc
             ON daily_sales_report (sale_date DESC)';
  END IF;
END $$;

ANALYZE pos_users;
ANALYZE pos_products;
ANALYZE pos_sales;
ANALYZE pos_companies;
ANALYZE customers;
