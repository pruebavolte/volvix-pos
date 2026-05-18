-- ============================================================
-- R12 — Dedupe pos_products + UNIQUE INDEX (FIX-G1)
-- ============================================================
-- Problema: seeds (seed-via-api.js, products.sql) ejecutados >1 vez
-- en producción crearon copias de "Latte Vainilla" y otros productos.
-- Algunos productos quedaron con code (SKU) NULL/''.
--
-- Esta migración:
--   0) Agrega columnas de soft-delete si no existen
--      (deleted_at, deleted_by_user_id, deleted_reason).
--   1) Soft-deletea duplicados por (pos_user_id, LOWER(TRIM(name))),
--      manteniendo el registro con code real (si existe) y created_at más antiguo.
--   2) Crea UNIQUE INDEX para impedir futuros duplicados activos.
--   3) Asigna code (SKU) autogenerado a productos cuyo code sea NULL/''.
--
-- Idempotente: se puede correr varias veces sin efecto si ya está limpio.
--
-- NOTA: en este schema, el "tenant" se modela vía pos_user_id (no hay tenant_id).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 0) Soft-delete columns (idempotente)
-- ────────────────────────────────────────────────────────────
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason     TEXT;

-- ────────────────────────────────────────────────────────────
-- 1) DEDUPE — soft-delete copias por (pos_user_id, name)
-- ────────────────────────────────────────────────────────────
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(pos_user_id::text, 'global'),
                   LOWER(TRIM(name))
      ORDER BY
        -- prioriza el que sí tiene code real (SKU)
        CASE WHEN code IS NOT NULL AND TRIM(code) <> '' THEN 0 ELSE 1 END,
        -- luego el más antiguo
        created_at ASC NULLS LAST,
        id::text ASC
    ) AS rn
  FROM pos_products
  WHERE deleted_at IS NULL
)
UPDATE pos_products
   SET deleted_at         = NOW(),
       deleted_by_user_id = NULL,
       deleted_reason     = 'r12_auto_dedupe_duplicates'
 WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- ────────────────────────────────────────────────────────────
-- 2) UNIQUE INDEX — anti-future-duplicates (solo activos)
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pos_products_active
   ON pos_products (COALESCE(pos_user_id::text, ''), LOWER(TRIM(name)))
WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3) Code (SKU) autogenerado para productos sin code
-- ────────────────────────────────────────────────────────────
UPDATE pos_products
   SET code = 'AUTO-' || SUBSTRING(MD5(id::text || COALESCE(name, '')), 1, 8)
 WHERE (code IS NULL OR TRIM(code) = '')
   AND deleted_at IS NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VERIFY (manual, no transaccional):
--   SELECT COUNT(*) FROM pos_products WHERE name='Latte Vainilla' AND deleted_at IS NULL;
--   -- esperado: 1 por pos_user_id
--
--   SELECT COUNT(*) FROM pos_products WHERE (code IS NULL OR code='') AND deleted_at IS NULL;
--   -- esperado: 0
-- ────────────────────────────────────────────────────────────
