-- 2026-05-14 — R27: Completar modulos faltantes a nivel arquitectura ERP/POS.
--
-- AUDIT: 22 modulos solicitados vs 368 tablas en DB.
-- Resultado: 23/28 ya estan completos. Esta migracion agrega los 5 ultimos.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- Cada tabla tiene tenant_id para multi-tenant + RLS-ready.

-- =============================================================
-- 1. PRODUCT_LOTS — Lotes por producto (caducidades multiples)
-- =============================================================
CREATE TABLE IF NOT EXISTS product_lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  product_id   uuid NOT NULL,
  lot_number   text NOT NULL,
  qty          numeric(12,3) NOT NULL DEFAULT 0,
  expiry_date  date,
  received_at  timestamptz DEFAULT now(),
  cost         numeric(12,2),
  supplier_id  uuid,
  notes        text,
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_lots_tenant ON product_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_expiry ON product_lots(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_lots_tenant_product_lot ON product_lots(tenant_id, product_id, lot_number);

-- =============================================================
-- 2. PRODUCT_SERIALS — Series/IMEI por unidad
-- =============================================================
CREATE TABLE IF NOT EXISTS product_serials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  product_id     uuid NOT NULL,
  serial_number  text NOT NULL,
  imei           text,
  status         text NOT NULL DEFAULT 'available', -- available|sold|reserved|returned|defective
  sale_id        uuid,
  cost           numeric(12,2),
  notes          text,
  received_at    timestamptz DEFAULT now(),
  sold_at        timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_serials_tenant ON product_serials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_serials_product ON product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_serials_status ON product_serials(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_serials_tenant_serial ON product_serials(tenant_id, serial_number);

-- =============================================================
-- 3. TAX_RATES — Impuestos configurables (no hardcoded)
-- =============================================================
CREATE TABLE IF NOT EXISTS tax_rates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  code         text NOT NULL,     -- ej. IVA16, IVA8, IEPS, EXENTO, NEGATIVO
  name         text NOT NULL,
  rate_pct     numeric(6,4) NOT NULL DEFAULT 0,  -- 16.0000, 8.0000, 0.0000
  type         text NOT NULL DEFAULT 'trasladado', -- trasladado|retenido|exento
  is_default   boolean DEFAULT false,
  active       boolean DEFAULT true,
  sat_code     text,
  description  text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rates_tenant_code ON tax_rates(tenant_id, code);

-- =============================================================
-- 4. AIRTIME_PURCHASES — Recargas telefonia
-- =============================================================
CREATE TABLE IF NOT EXISTS airtime_purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  carrier       text NOT NULL,        -- telcel|movistar|att|unefon|virgin
  phone_number  text NOT NULL,
  amount        numeric(8,2) NOT NULL,
  cost          numeric(8,2),
  commission    numeric(8,2),
  reference     text,                 -- ID de la transaccion con el carrier
  authorization text,
  status        text NOT NULL DEFAULT 'pending', -- pending|completed|failed|reversed
  user_id       uuid,
  cashier_id    uuid,
  sale_id       uuid,
  created_at    timestamptz DEFAULT now(),
  completed_at  timestamptz,
  failed_reason text
);
CREATE INDEX IF NOT EXISTS idx_airtime_tenant ON airtime_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_airtime_status ON airtime_purchases(status);
CREATE INDEX IF NOT EXISTS idx_airtime_phone ON airtime_purchases(phone_number);

-- =============================================================
-- 5. POS_FEATURES — Feature flags por tenant (toggle modulos)
-- Permite activar/desactivar modulos enteros por negocio.
-- =============================================================
CREATE TABLE IF NOT EXISTS pos_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  feature_key text NOT NULL,          -- 'lots'|'serials'|'recharges'|'restaurant_mode'|'pharmacy_mode'|'cfdi'|'multi_branch'|...
  enabled     boolean DEFAULT false,
  config      jsonb,                  -- opciones especificas por feature
  enabled_by  uuid,                   -- user_id que activo
  enabled_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_features_tenant_key ON pos_features(tenant_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_pos_features_enabled ON pos_features(tenant_id, enabled);

-- =============================================================
-- 6. COLUMNAS FALTANTES en tablas existentes
-- =============================================================

-- pos_products: precios diferenciados + flags de tracking
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS price_wholesale numeric(12,2);
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS price_special numeric(12,2);
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS uses_lots boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS uses_serials boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS tax_rate_id uuid;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS visible_pos boolean DEFAULT true;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS is_service boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS is_combo boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS is_recipe boolean DEFAULT false;

-- customers: campos CRM avanzado
ALTER TABLE customers ADD COLUMN IF NOT EXISTS points numeric(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_balance numeric(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit numeric(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_days int DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_purchases numeric(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avg_ticket numeric(10,2) DEFAULT 0;

-- pos_sales: campos financieros + facturacion
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS profit_total numeric(12,2);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cost_total numeric(12,2);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS currency text DEFAULT 'MXN';
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) DEFAULT 1;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS tip numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS is_invoiced boolean DEFAULT false;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS invoice_id uuid;

-- =============================================================
-- 7. GRANTS
-- =============================================================
DO $$
BEGIN
  FOR t IN SELECT unnest(ARRAY['product_lots','product_serials','tax_rates','airtime_purchases','pos_features']) LOOP
    BEGIN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO authenticated', t);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO service_role', t);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- =============================================================
-- 8. SEED defaults: tax_rates MX (IVA 16%, IVA 8%, 0%, EXENTO)
-- Solo para tenants nuevos sin tax_rates configurados.
-- =============================================================
-- Nota: requiere ejecutar manualmente o via endpoint /api/admin/setup-defaults
-- al provisionar nuevo tenant.

-- =============================================================
-- FIN R27
-- Verificacion: SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('product_lots','product_serials','tax_rates','airtime_purchases','pos_features');
-- Esperado: 5 filas.
-- =============================================================
