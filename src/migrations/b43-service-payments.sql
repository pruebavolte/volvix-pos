-- ============================================================================
-- B43 — SERVICIOS (utility bill payments) — backend foundation
-- Migration: b43-service-payments.sql
-- ----------------------------------------------------------------------------
-- Idempotent: safe to run multiple times.
-- Uses /api/service-payments/* path to avoid R17 collision with /api/services
-- (which is the appointments module).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. service_providers — catalog of supported utility/service providers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_providers (
  code            TEXT PRIMARY KEY,                  -- e.g. 'cfe', 'telmex', 'megacable'
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('luz','agua','gas','telefono','internet','tv','seguros','otros')),
  ref_pattern     TEXT,                              -- regex for reference validation
  ref_min_length  INTEGER,
  ref_max_length  INTEGER,
  active          BOOLEAN DEFAULT true,
  config          JSONB
);

-- ---------------------------------------------------------------------------
-- 2. service_payments — every payment recorded against a provider
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  provider_code   TEXT REFERENCES service_providers(code),
  reference       TEXT NOT NULL,                     -- account/contract number
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT DEFAULT 'MXN',
  status          TEXT CHECK (status IN ('pending','verified','paid','failed','reversed')) DEFAULT 'pending',
  customer_phone  TEXT,
  customer_email  TEXT,
  external_ref    TEXT,                              -- aggregator confirmation code
  receipt_data    JSONB,
  comision        NUMERIC(8,2),
  paid_by         UUID,
  paid_at         TIMESTAMPTZ DEFAULT NOW(),
  reversed_at     TIMESTAMPTZ,
  reversal_reason TEXT
);

-- ---------------------------------------------------------------------------
-- 3. RLS — multi-tenant isolation via JWT tenant_id (superadmin sees all)
-- ---------------------------------------------------------------------------
ALTER TABLE service_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spay_iso ON service_payments;
CREATE POLICY spay_iso ON service_payments FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');

CREATE INDEX IF NOT EXISTS idx_spay_tenant ON service_payments(tenant_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_spay_status ON service_payments(status);
CREATE INDEX IF NOT EXISTS idx_spay_provider ON service_payments(provider_code);

-- ---------------------------------------------------------------------------
-- 4. Seed common Mexican providers
-- ---------------------------------------------------------------------------
INSERT INTO service_providers(code, name, category, ref_pattern, ref_min_length, ref_max_length) VALUES
  ('cfe', 'CFE - Comisión Federal de Electricidad', 'luz', '^[0-9]{12}$', 12, 12),
  ('telmex', 'Telmex', 'telefono', '^[0-9]{7,12}$', 7, 12),
  ('megacable', 'Megacable', 'internet', '^[0-9]{8,12}$', 8, 12),
  ('izzi', 'Izzi Telecom', 'internet', '^[0-9]{8,12}$', 8, 12),
  ('totalplay', 'Totalplay', 'internet', '^[0-9]{8,12}$', 8, 12),
  ('sky', 'Sky', 'tv', '^[0-9]{8,12}$', 8, 12),
  ('dish', 'Dish', 'tv', '^[0-9]{8,12}$', 8, 12),
  ('gas-natural', 'Gas Natural Fenosa', 'gas', '^[0-9]{8,12}$', 8, 12),
  ('cospel', 'Cospel', 'agua', '^[0-9]{8,12}$', 8, 12)
ON CONFLICT (code) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
