-- =============================================================================
-- R3a — DEVOLUCIONES HARDENING (Round 3a / Fibonacci serial)
-- Cubre los GAPS:
--   GAP-D1: items shape mismatch (items vs items_returned) — backend, idempotente
--   GAP-D2: devoluciones post-Cierre Z (compensación)
--           → ALTER pos_returns ADD COLUMN affects_z BOOLEAN DEFAULT false
--           → ALTER pos_returns ADD COLUMN compensation_z_date DATE
--   GAP-D3: anti-fraude customer_id matching — backend, sin schema change
--   GAP-D4: respeta unit_price (con promo aplicada) — backend, sin schema change
--   GAP-D5: pos_sales.status = 'partially_refunded' | 'refunded' al cerrar
--           → DROP CONSTRAINT pos_sales_status_check (Round 1) + recreate con
--             nuevo valor 'partially_refunded'
--
-- Aplicar con:
--   supabase db query --linked < migrations/r3a-devoluciones-hardening.sql
-- Re-ejecutable: usa ADD COLUMN IF NOT EXISTS / DO $$ BEGIN … guards.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- GAP-D2: pos_returns nuevas columnas
--   - affects_z: si la devolución compensa un día con corte Z firmado
--   - compensation_z_date: fecha del Z donde se asienta la compensación
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_returns' AND column_name='affects_z'
  ) THEN
    ALTER TABLE pos_returns ADD COLUMN affects_z BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_returns' AND column_name='compensation_z_date'
  ) THEN
    ALTER TABLE pos_returns ADD COLUMN compensation_z_date DATE;
  END IF;
END$$;

-- Index para localizar rápido las devoluciones que compensan un Z dado
CREATE INDEX IF NOT EXISTS idx_returns_compensation_z
  ON pos_returns (compensation_z_date)
  WHERE compensation_z_date IS NOT NULL;

-- Index reforzado por sale_id (ya existe en b43 — repetimos defensivo y
-- agregamos uno por (sale_id, status) para acelerar el cálculo de
-- "qty ya devuelto" antes de aceptar otra devolución).
CREATE INDEX IF NOT EXISTS idx_returns_sale ON pos_returns (sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_status
  ON pos_returns (sale_id, status);


-- -----------------------------------------------------------------------------
-- GAP-D5: pos_sales.status — extender state machine de Round 1 con
--   'partially_refunded'. Round 1 dejó:
--   ('pending','printed','paid','cancelled','canceled','refunded')
--   Ahora añadimos 'partially_refunded'.
--
-- R7c CANONICALIZATION (2026-04-28): este check se DROP+RECREATE en
--   migrations/r7c-canonicalize-status.sql — solo 'cancelled' (no 'canceled').
--   Si re-corres r3a aislado puede recrear el dual; correr r7c después.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Drop existing check (de Round 1)
  BEGIN
    ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_status_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Recreate con el nuevo valor
  -- R7c canonicalizó: 'cancelled' única (sin 'canceled' americano).
  BEGIN
    ALTER TABLE pos_sales
      ADD CONSTRAINT pos_sales_status_check
      CHECK (status IN (
        'pending',
        'printed',
        'paid',
        'cancelled',
        'refunded',
        'partially_refunded'
      ));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

-- Index parcial para queries de "ventas con devoluciones parciales"
CREATE INDEX IF NOT EXISTS idx_pos_sales_partially_refunded
  ON pos_sales (id)
  WHERE status = 'partially_refunded';


-- -----------------------------------------------------------------------------
-- VISTA: v_returns_compensation — devoluciones que afectan un Z viejo,
-- agrupadas por compensation_z_date. Usado por reportes / cuadre.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_returns_compensation AS
SELECT
  tenant_id,
  compensation_z_date,
  count(*) AS compensation_count,
  COALESCE(sum(refund_amount), 0::numeric) AS compensation_total
FROM pos_returns
WHERE affects_z = true
  AND compensation_z_date IS NOT NULL
  AND status IN ('approved','completed','pending')
GROUP BY tenant_id, compensation_z_date;


COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- SMOKE QUERIES (no-op, ejecutar manualmente para verificar):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--     WHERE table_name='pos_returns'
--       AND column_name IN ('affects_z','compensation_z_date');
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname='pos_sales_status_check';
--   SELECT * FROM v_returns_compensation LIMIT 5;
-- =============================================================================
