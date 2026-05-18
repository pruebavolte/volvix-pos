-- =============================================================================
-- R1 — POS CORE HARDENING (Round 1 / Fibonacci)
-- Cubre los GAPS:
--   GAP-1: typo tolerance (extensiones unaccent / pg_trgm para búsquedas server-side)
--   GAP-2: cart_tokens (server-side multi-tab race lock)
--   GAP-3: idempotency_keys (cache de respuestas POST)
--   GAP-4: pos_price_overrides (audit de cambios manuales de precio en línea)
--   GAP-5: pos_sales status state machine extendido + columnas de cancel
--
-- Aplicar con:
--   supabase db query --linked < migrations/r1-pos-core-hardening.sql
-- Re-ejecutable: usa CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GAP-1: Extensiones para búsqueda server-side con typo tolerance
-- (El path en JS hace fallback en memoria; estas extensiones permiten upgrade
--  futuro a similarity() / unaccent() en queries directas.)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indices trigram para acelerar ilike/similarity en pos_products
CREATE INDEX IF NOT EXISTS idx_pos_products_name_trgm
  ON pos_products USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pos_products_code_trgm
  ON pos_products USING gin (lower(code) gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- GAP-2: cart_tokens — server-side cart lock para evitar doble cobro multi-tab
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_tokens (
  token       TEXT PRIMARY KEY,
  user_id     UUID,
  tenant_id   TEXT,
  status      TEXT NOT NULL DEFAULT 'consumed' CHECK (status IN ('consumed','released')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_tokens_user
  ON cart_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_cart_tokens_created
  ON cart_tokens (created_at);

-- TTL: limpiar tokens > 24h (los carritos abiertos no deberían vivir más)
-- Stored function para purga manual / cron
CREATE OR REPLACE FUNCTION purge_old_cart_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cart_tokens
  WHERE created_at < (now() - INTERVAL '24 hours');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- GAP-3: idempotency_keys — cache de respuestas para POST idempotentes
-- (Ya referenciada por idempotencyCheck() en api/index.js, pero faltaba la tabla.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key            TEXT PRIMARY KEY,
  user_id        UUID,
  endpoint       TEXT NOT NULL,
  response_body  JSONB,
  status_code    INTEGER NOT NULL DEFAULT 200,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user
  ON idempotency_keys (user_id);

-- Purga periódica
CREATE OR REPLACE FUNCTION purge_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- GAP-4: pos_price_overrides — audit de cambios manuales de precio
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_price_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID,
  line_id         TEXT,
  product_id      UUID,
  original_price  NUMERIC(12,2) NOT NULL,
  new_price       NUMERIC(12,2) NOT NULL,
  delta           NUMERIC(12,2) NOT NULL,
  user_id         UUID,
  tenant_id       TEXT,
  reason          TEXT,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_price_overrides_sale
  ON pos_price_overrides (sale_id);

CREATE INDEX IF NOT EXISTS idx_pos_price_overrides_user_ts
  ON pos_price_overrides (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_pos_price_overrides_tenant_ts
  ON pos_price_overrides (tenant_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_pos_price_overrides_product
  ON pos_price_overrides (product_id);


-- -----------------------------------------------------------------------------
-- GAP-5: pos_sales status state machine + columnas de cancel
-- Estados: 'pending' | 'printed' | 'paid' | 'cancelled' | 'refunded'
-- -----------------------------------------------------------------------------
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by   UUID,
  ADD COLUMN IF NOT EXISTS printed_at    TIMESTAMPTZ;

-- Si la columna status no existía antes (schema legacy), créala con default 'paid'.
-- No tocamos un check existente si ya está creado; sólo añadimos uno laxo si falta.
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';

-- Drop old CHECK si existía con valores incompatibles, y crear el nuevo
-- R7c CANONICALIZATION (2026-04-28): este check fue REPLACED en
-- migrations/r7c-canonicalize-status.sql — solo 'cancelled' (no 'canceled').
-- Si re-corres r1 aislado, ejecuta también r7c después.
DO $$
BEGIN
  -- Intentar eliminar un check viejo si existe (nombre típico)
  BEGIN
    ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  -- Añadir el nuevo (R7c: dropped 'canceled' americano)
  BEGIN
    ALTER TABLE pos_sales
      ADD CONSTRAINT pos_sales_status_check
      CHECK (status IN ('pending','printed','paid','cancelled','refunded'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_sales_status
  ON pos_sales (status);

CREATE INDEX IF NOT EXISTS idx_pos_sales_canceled_at
  ON pos_sales (canceled_at)
  WHERE canceled_at IS NOT NULL;


-- -----------------------------------------------------------------------------
-- RLS (Row-Level Security) baseline para las tablas nuevas.
-- Seguimos el patrón del resto del schema: el service-key bypassa RLS, y el
-- frontend usa endpoints en /api/* que ya filtran por tenant en JS.
-- Habilitamos RLS y dejamos las policies abiertas al service_role; cualquier
-- consulta directa con anon_key sólo verá su propio tenant.
-- -----------------------------------------------------------------------------
ALTER TABLE cart_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_price_overrides ENABLE ROW LEVEL SECURITY;

-- Policies: service_role siempre puede; usuarios autenticados sólo ven sus propias rows.
-- auth.uid() retorna UUID — casteamos a text para evitar mismatch con columnas TEXT.
DO $$
BEGIN
  -- cart_tokens
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cart_tokens' AND policyname='cart_tokens_owner') THEN
    CREATE POLICY cart_tokens_owner ON cart_tokens
      FOR ALL TO authenticated
      USING (user_id::text = auth.uid()::text)
      WITH CHECK (user_id::text = auth.uid()::text);
  END IF;
  -- idempotency_keys
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='idempotency_keys' AND policyname='idempotency_keys_owner') THEN
    CREATE POLICY idempotency_keys_owner ON idempotency_keys
      FOR ALL TO authenticated
      USING (user_id::text = auth.uid()::text)
      WITH CHECK (user_id::text = auth.uid()::text);
  END IF;
  -- pos_price_overrides
  -- Nota: pos_users.tenant_id es UUID en este schema; pos_price_overrides.tenant_id es TEXT
  -- (el código JS guarda strings como "TNT001" además de UUIDs). Casteamos ambos a text.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_price_overrides' AND policyname='pos_price_overrides_tenant') THEN
    CREATE POLICY pos_price_overrides_tenant ON pos_price_overrides
      FOR SELECT TO authenticated
      USING (
        tenant_id IN (SELECT tenant_id::text FROM pos_users WHERE id::text = auth.uid()::text)
        OR user_id::text = auth.uid()::text
      );
  END IF;
END $$;


-- =============================================================================
-- SMOKE QUERIES (no-op, ejecutar manualmente para verificar):
--   SELECT count(*) FROM cart_tokens;
--   SELECT count(*) FROM idempotency_keys;
--   SELECT count(*) FROM pos_price_overrides;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='pos_sales' AND column_name IN ('cancel_reason','canceled_at','canceled_by','printed_at','status');
-- =============================================================================
