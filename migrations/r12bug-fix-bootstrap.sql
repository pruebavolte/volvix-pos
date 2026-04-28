-- ============================================================
-- R12-BUG — Fix bootstrap: dedup productos + UNIQUE INDEX por owner
-- ============================================================
-- BUG-T2: tenant nuevo recibía productos de TODOS los giros (causa real:
--         bootstrap silently failing porque insertaba a columnas
--         inexistentes — schema usa pos_user_id, no tenant_id).
-- BUG-T3: productos duplicados (3x Aceite Barba, 4x Aceite Capullo).
--
-- Esta migración:
--   0) Asegura columnas de soft-delete (idempotente, ya existen del R12).
--   1) Soft-deletea duplicados por (pos_user_id, LOWER(TRIM(name))).
--   2) UNIQUE INDEX por (pos_user_id, name) — bloquea duplicados futuros.
--
-- Idempotente: se puede correr múltiples veces.
-- ============================================================

BEGIN;

-- 0) Asegurar columnas de soft-delete (idempotente)
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason     TEXT;

-- 1) DEDUPE — soft-delete copias por (pos_user_id, LOWER(TRIM(name))) — BUG-T3
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(pos_user_id::text, 'global'),
                   LOWER(TRIM(name))
      ORDER BY
        -- prioriza el que tiene code real (SKU)
        CASE WHEN code IS NOT NULL AND TRIM(code) <> '' THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id::text ASC
    ) AS rn
  FROM pos_products
  WHERE deleted_at IS NULL
)
UPDATE pos_products
   SET deleted_at     = NOW(),
       deleted_reason = 'r12bug_auto_dedupe_owner_duplicates'
 WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2) UNIQUE INDEX — anti-future-duplicates (solo activos)
-- (NOTA: Ya existe uniq_pos_products_active del R12; este lo refuerza si no existe.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pos_products_owner_name_active
   ON pos_products (COALESCE(pos_user_id::text, ''), LOWER(TRIM(name)))
WHERE deleted_at IS NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VERIFY (manual, no transaccional):
--   SELECT pos_user_id, name, COUNT(*)
--     FROM pos_products
--    WHERE deleted_at IS NULL
--    GROUP BY pos_user_id, LOWER(TRIM(name))
--   HAVING COUNT(*) > 1;
--   -- esperado: 0 filas
-- ────────────────────────────────────────────────────────────
