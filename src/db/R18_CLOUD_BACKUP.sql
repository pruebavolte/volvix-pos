-- R18 Cloud Backup: tabla de auditoria de backups a S3/R2/B2
-- Idempotente: usa IF NOT EXISTS

CREATE TABLE IF NOT EXISTS cloud_backups (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  type TEXT NOT NULL CHECK (type IN ('full', 'incremental')),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_backups_tenant ON cloud_backups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_backups_started ON cloud_backups(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_backups_status ON cloud_backups(status);

-- RLS: cada tenant ve sus backups; superadmin ve todo.
ALTER TABLE cloud_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cloud_backups_tenant_select ON cloud_backups;
CREATE POLICY cloud_backups_tenant_select ON cloud_backups
  FOR SELECT
  USING (
    tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid
    OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'superadmin'
  );

DROP POLICY IF EXISTS cloud_backups_admin_insert ON cloud_backups;
CREATE POLICY cloud_backups_admin_insert ON cloud_backups
  FOR INSERT
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IN ('admin','owner','superadmin')
  );

DROP POLICY IF EXISTS cloud_backups_admin_update ON cloud_backups;
CREATE POLICY cloud_backups_admin_update ON cloud_backups
  FOR UPDATE
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IN ('admin','owner','superadmin')
  );

COMMENT ON TABLE cloud_backups IS 'R18: registro de backups subidos a S3/R2/B2';
COMMENT ON COLUMN cloud_backups.location IS 'URL https publica/firmada del objeto remoto';
COMMENT ON COLUMN cloud_backups.type IS 'full = dump completo; incremental = WAL/diff desde ultimo full';
