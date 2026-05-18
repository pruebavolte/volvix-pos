-- Migration 02: Extender pos_customers con catálogo universal
-- Generado: 2026-05-18

BEGIN;

-- 2.1 Identidad extendida
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gps_lat DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS gps_lng DECIMAL(10,7);

-- 2.2 Comercial extendido
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS discount_applicable_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;

-- 2.3 Historial extendido (varios ya existen, agregar faltantes)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS purchase_frequency VARCHAR(20),
  ADD COLUMN IF NOT EXISTS avg_ticket DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS favorite_products JSONB DEFAULT '[]'::jsonb;

-- 2.4 Fiscal extendido
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS fiscal_address TEXT,
  ADD COLUMN IF NOT EXISTS cfdi_use_default VARCHAR(10),
  ADD COLUMN IF NOT EXISTS payment_method_preferred VARCHAR(20);

-- 2.5 Segmentación
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segment VARCHAR(30),
  ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES pos_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(15,4);

-- 2.6 Programas (loyalty)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS loyalty_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cashback_accumulated DECIMAL(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_subscription_id UUID;

-- 2.7 Comunicación
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS prefers_whatsapp BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS prefers_email BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prefers_sms BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS optin_promos BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- 2.8-2.11 NICHO específico (jsonb único para evitar 20+ columnas raramente usadas)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS niche_attributes JSONB DEFAULT '{}'::jsonb;
-- niche_attributes incluye:
--   medical: { record_id, allergies, conditions, clinical_history, emergency_contact }
--   veterinary: { pets, vaccinations, sterilization, chronic_conditions }
--   education: { level, parents_tutors, grades, attendance_pct }
--   hotel: { passport, ine, preferences, stay_history }

-- Index GIN sobre niche_attributes para queries rápidas
CREATE INDEX IF NOT EXISTS idx_pos_customers_niche_gin ON pos_customers USING GIN (niche_attributes);
CREATE INDEX IF NOT EXISTS idx_pos_customers_tags_gin ON pos_customers USING GIN (tags);

COMMIT;
