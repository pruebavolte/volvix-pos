-- =============================================================
-- R14 — CUSTOMER PORTAL AUTH
-- Tabla customer_otps + índice de expiración
-- Rol JWT 'customer' se emite desde la API (no requiere DB enum)
-- =============================================================

CREATE TABLE IF NOT EXISTS customer_otps (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  code_hash   TEXT        NOT NULL,            -- SHA-256(otp + email)
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_otps_email      ON customer_otps (email);
CREATE INDEX IF NOT EXISTS idx_customer_otps_expires_at ON customer_otps (expires_at);

-- Limpieza periódica (>24h) — ejecutar vía cron / pg_cron
-- DELETE FROM customer_otps WHERE expires_at < NOW() - INTERVAL '24 hours';

-- =============================================================
-- Tabla mínima de clientes self-service (si no existe ya).
-- Si tu schema usa otra tabla, ignora este bloque.
-- =============================================================
CREATE TABLE IF NOT EXISTS portal_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  phone           TEXT,
  tenant_id       TEXT,
  loyalty_points  INTEGER NOT NULL DEFAULT 0,
  password_hash   TEXT,                     -- opcional (cambio de password)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_customers_email ON portal_customers (email);

-- Notas:
-- 1. El JWT cliente lleva role='customer'. requireAuth([... 'customer']) lo permite.
-- 2. Las RLS deben filtrar customer_id = current_setting('request.jwt.claim.id').
