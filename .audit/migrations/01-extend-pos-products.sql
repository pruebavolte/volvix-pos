-- Migration 01: Extender pos_products con catálogo universal
-- Generado: 2026-05-18 por Claude Code session autónoma
-- IMPORTANTE: NO ejecutar antes del pitch. Revisar primero.
--
-- Estrategia:
-- - Hard columns para los ~30 campos más usados (queries directas + indexes)
-- - JSONB `attributes` para los ~93 campos restantes (por giro específico)
--
-- BACKWARD COMPATIBLE: usa ADD COLUMN IF NOT EXISTS. Cero downtime.

BEGIN;

-- 1.2 PRECIOS extendidos
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS price_wholesale DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS price_retail DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS cashback_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS price_min_allowed DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS price_max_allowed DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS requires_authorization_below DECIMAL(15,4);

-- 1.3 INVENTARIO extendido (los campos físicos comunes)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS max_stock DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS dim_height_cm DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS dim_width_cm DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS dim_length_cm DECIMAL(8,2);

-- 1.4 VARIANTES (flag y jsonb)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variants_grid JSONB DEFAULT '[]'::jsonb;

-- 1.5 RECETAS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_recipe BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recipe_ingredients JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recipe_waste_pct DECIMAL(5,2);

-- 1.6 KITS / COMBOS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_kit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kit_components JSONB DEFAULT '[]'::jsonb;

-- 1.7 SERVICIOS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS service_requires_appointment BOOLEAN DEFAULT FALSE;

-- 1.8 SUSCRIPCIONES
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_periodicity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS subscription_auto_renewal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_free_trial_days INTEGER;

-- 1.9 IMPUESTOS extendidos
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS tax_ieps_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS sat_unit_key VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cfdi_4_clave VARCHAR(20);

-- 1.10 SERIALIZACIÓN
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS serial_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS serial_auto_generate BOOLEAN DEFAULT FALSE;

-- 1.11 LOTES / CADUCIDAD
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS lot_tracking BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER;

-- 1.12 GARANTÍAS
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS warranty_has BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_duration_months INTEGER,
  ADD COLUMN IF NOT EXISTS warranty_type VARCHAR(20);

-- JSONB CATCH-ALL para campos específicos por giro
-- (kitchen, médico, automotriz, rentas, hotel, educación, gimnasios, eventos,
--  activos, multisucursal, marketplace, ecommerce, permisos, blockchain, etc.)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_modules JSONB DEFAULT '[]'::jsonb;

-- INDEXES para queries en JSONB
CREATE INDEX IF NOT EXISTS idx_pos_products_attrs_gin
  ON pos_products USING GIN (attributes);

CREATE INDEX IF NOT EXISTS idx_pos_products_modules_gin
  ON pos_products USING GIN (active_modules);

-- INDEXES en columnas hard nuevas más usadas
CREATE INDEX IF NOT EXISTS idx_pos_products_is_service ON pos_products(tenant_id, is_service);
CREATE INDEX IF NOT EXISTS idx_pos_products_is_subscription ON pos_products(tenant_id, is_subscription);
CREATE INDEX IF NOT EXISTS idx_pos_products_serial_required ON pos_products(tenant_id, serial_required);
CREATE INDEX IF NOT EXISTS idx_pos_products_lot_tracking ON pos_products(tenant_id, lot_tracking);

COMMIT;

-- VERIFICACIÓN post-migration:
-- SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'pos_products';
-- Debe ser >= 60 columnas tras esta migration (+ las que ya existen)
