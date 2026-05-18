-- ============================================================================
-- B41 — Backups, Sync Queue, Inventory min_stock/expiry, Z-Report sequences
-- Migration: b41-backups.sql
-- ----------------------------------------------------------------------------
-- Idempotent: safe to run multiple times.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. backups — header table for backup operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  initiated_by    UUID,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','ready','failed','expired','restored')),
  scope           JSONB,                -- which tables/ranges were captured
  payload         JSONB,                -- the actual JSON snapshot (truncated for big ones)
  payload_size_b  BIGINT,
  rows_total      INTEGER DEFAULT 0,
  storage_url     TEXT,                 -- optional offsite URL (S3/Supabase Storage)
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  ready_at        TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backups_iso ON backups;
CREATE POLICY backups_iso ON backups FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- ---------------------------------------------------------------------------
-- 2. sync_sessions — offline queue replay sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  user_id         UUID,
  device_id       TEXT,
  total_ops       INTEGER DEFAULT 0,
  succeeded       INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','done','partial','error')),
  errors          JSONB,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_tenant ON sync_sessions(tenant_id, started_at DESC);

ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_iso ON sync_sessions;
CREATE POLICY sync_iso ON sync_sessions FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- ---------------------------------------------------------------------------
-- 3. z_report_sequences — daily Z-report sequential numbering per tenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS z_report_sequences (
  tenant_id   TEXT NOT NULL,
  z_number    INTEGER NOT NULL,
  cashier_id  UUID,
  for_date    DATE NOT NULL,
  cut_id      UUID,
  generated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, z_number)
);

CREATE INDEX IF NOT EXISTS idx_zreport_date ON z_report_sequences(tenant_id, for_date);

ALTER TABLE z_report_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zrep_iso ON z_report_sequences;
CREATE POLICY zrep_iso ON z_report_sequences FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- ---------------------------------------------------------------------------
-- 4. Add min_stock + expiry_date to pos_products (idempotent ALTERs)
-- ---------------------------------------------------------------------------
DO $b41_alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_products' AND table_schema='public') THEN
    ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
    ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS department TEXT;
  END IF;
END
$b41_alter$;

CREATE INDEX IF NOT EXISTS idx_pos_products_expiry ON pos_products(expiry_date) WHERE expiry_date IS NOT NULL;

COMMIT;
