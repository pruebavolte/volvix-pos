-- Migration 04: Extender volvix_vendors (proveedores) con catálogo universal
-- Generado: 2026-05-18

BEGIN;

-- 3.1 Identidad extendida (algunos campos pueden ya existir)
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS rfc VARCHAR(13),
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(80),
  ADD COLUMN IF NOT EXISTS state VARCHAR(80);

-- 3.2 Comercial
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS products_supplied JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50),
  ADD COLUMN IF NOT EXISTS credit_days INTEGER,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS discount_volume_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS discount_prompt_pay_pct DECIMAL(5,2);

-- 3.3 Logística
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS restock_frequency VARCHAR(20),
  ADD COLUMN IF NOT EXISTS restock_day_of_week VARCHAR(10),
  ADD COLUMN IF NOT EXISTS avg_delivery_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS min_purchase_amount DECIMAL(15,4);

-- 3.4 Historial
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avg_purchase_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS total_purchased_annual DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS last_price_by_product JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(2,1),
  ADD COLUMN IF NOT EXISTS delivery_rating DECIMAL(2,1);

-- 3.5 Fiscal
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS fiscal_business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cfdi_emitido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_method_preferred VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(30),
  ADD COLUMN IF NOT EXISTS clabe VARCHAR(18),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- 3.6 Documentos
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS contracts_pdf JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_invoices JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_receipts JSONB DEFAULT '[]'::jsonb;

-- 3.7 Notas
ALTER TABLE volvix_vendors
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS alerts TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_volvix_vendors_tags_gin ON volvix_vendors USING GIN (tags);

COMMIT;
