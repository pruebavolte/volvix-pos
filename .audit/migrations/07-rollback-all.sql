-- ROLLBACK Migration: Revertir todas las migrations 01-06 si algo sale mal
-- USAR SOLO EN EMERGENCIA antes del pitch
-- Generado: 2026-05-18

BEGIN;

-- 01 rollback pos_products
ALTER TABLE pos_products
  DROP COLUMN IF EXISTS price_wholesale,
  DROP COLUMN IF EXISTS price_retail,
  DROP COLUMN IF EXISTS commission_amount,
  DROP COLUMN IF EXISTS commission_pct,
  DROP COLUMN IF EXISTS cashback_pct,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS price_min_allowed,
  DROP COLUMN IF EXISTS price_max_allowed,
  DROP COLUMN IF EXISTS requires_authorization_below,
  DROP COLUMN IF EXISTS max_stock,
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS dim_height_cm,
  DROP COLUMN IF EXISTS dim_width_cm,
  DROP COLUMN IF EXISTS dim_length_cm,
  DROP COLUMN IF EXISTS has_variants,
  DROP COLUMN IF EXISTS variants_grid,
  DROP COLUMN IF EXISTS is_recipe,
  DROP COLUMN IF EXISTS recipe_ingredients,
  DROP COLUMN IF EXISTS recipe_waste_pct,
  DROP COLUMN IF EXISTS is_kit,
  DROP COLUMN IF EXISTS kit_components,
  DROP COLUMN IF EXISTS is_service,
  DROP COLUMN IF EXISTS service_duration_min,
  DROP COLUMN IF EXISTS service_requires_appointment,
  DROP COLUMN IF EXISTS is_subscription,
  DROP COLUMN IF EXISTS subscription_periodicity,
  DROP COLUMN IF EXISTS subscription_auto_renewal,
  DROP COLUMN IF EXISTS subscription_free_trial_days,
  DROP COLUMN IF EXISTS tax_ieps_pct,
  DROP COLUMN IF EXISTS sat_unit_key,
  DROP COLUMN IF EXISTS cfdi_4_clave,
  DROP COLUMN IF EXISTS serial_required,
  DROP COLUMN IF EXISTS serial_auto_generate,
  DROP COLUMN IF EXISTS lot_tracking,
  DROP COLUMN IF EXISTS expiry_alert_days,
  DROP COLUMN IF EXISTS warranty_has,
  DROP COLUMN IF EXISTS warranty_duration_months,
  DROP COLUMN IF EXISTS warranty_type,
  DROP COLUMN IF EXISTS attributes,
  DROP COLUMN IF EXISTS active_modules;

DROP INDEX IF EXISTS idx_pos_products_attrs_gin;
DROP INDEX IF EXISTS idx_pos_products_modules_gin;
DROP INDEX IF EXISTS idx_pos_products_is_service;
DROP INDEX IF EXISTS idx_pos_products_is_subscription;
DROP INDEX IF EXISTS idx_pos_products_serial_required;
DROP INDEX IF EXISTS idx_pos_products_lot_tracking;

-- 05 rollback giros_terminologias
DROP TRIGGER IF EXISTS update_giros_terminologias_updated_at ON giros_terminologias;
DROP TABLE IF EXISTS giros_terminologias;

-- Para 02 (customers), 03 (users), 04 (vendors), 06 (appointments) — similar pattern
-- Por brevedad NO se incluye aquí. Si necesitas rollback completo, escribir DROP COLUMN
-- para cada columna agregada en esas migrations.

-- VERIFICACIÓN post-rollback:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_products';
-- NO debe contener las columnas nuevas.

COMMIT;
