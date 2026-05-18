-- ============================================================================
-- B43 — RECARGAS (mobile airtime) — backend foundation
-- Migration: b43-recargas.sql
-- ----------------------------------------------------------------------------
-- Idempotent: safe to run multiple times.
-- Uses /api/recargas/v2/* path; legacy /api/recargas remains the generic blob
-- store from attachTop10Handlers (no collision).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. airtime_carriers — catalog of supported carriers + valid amounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airtime_carriers (
  code           TEXT PRIMARY KEY,                  -- 'telcel', 'att', 'movistar', 'bait', 'unefon'
  name           TEXT NOT NULL,
  amounts        JSONB NOT NULL,                     -- [10, 20, 30, 50, 100, 150, 200, 500]
  active         BOOLEAN DEFAULT true,
  comision_pct   NUMERIC(5,2) DEFAULT 5
);

-- ---------------------------------------------------------------------------
-- 2. recargas — every airtime topup recorded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recargas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  carrier_code  TEXT REFERENCES airtime_carriers(code),
  phone         TEXT NOT NULL,
  amount        NUMERIC(8,2) NOT NULL,
  comision      NUMERIC(8,2),
  status        TEXT CHECK (status IN ('pending','success','failed','refunded')) DEFAULT 'pending',
  external_ref  TEXT,                                -- provider confirmation
  error_message TEXT,
  performed_by  UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 3. RLS — multi-tenant isolation via JWT tenant_id
-- ---------------------------------------------------------------------------
ALTER TABLE recargas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recargas_iso ON recargas;
CREATE POLICY recargas_iso ON recargas FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');

CREATE INDEX IF NOT EXISTS idx_recargas_tenant ON recargas(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recargas_carrier ON recargas(carrier_code);
CREATE INDEX IF NOT EXISTS idx_recargas_status ON recargas(status);

-- ---------------------------------------------------------------------------
-- 4. Seed common Mexican carriers
-- ---------------------------------------------------------------------------
INSERT INTO airtime_carriers(code, name, amounts, comision_pct) VALUES
  ('telcel',   'Telcel',         '[10,20,30,50,100,150,200,500]'::jsonb, 5),
  ('att',      'AT&T',           '[10,20,30,50,100,150,200,500]'::jsonb, 5),
  ('movistar', 'Movistar',       '[10,20,30,50,100,150,200,500]'::jsonb, 5),
  ('bait',     'Bait',           '[20,50,100,200]'::jsonb,               6),
  ('unefon',   'Unefon',         '[10,20,30,50,100,200]'::jsonb,         5),
  ('virgin',   'Virgin Mobile',  '[20,50,100,200]'::jsonb,               5)
ON CONFLICT (code) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
