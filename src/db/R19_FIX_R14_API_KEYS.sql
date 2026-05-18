-- R19 FIX: R14_API_KEYS.sql
-- Original error: column "revoked_at" does not exist
-- Cause: tabla api_keys ya existe SIN revoked_at; CREATE TABLE IF NOT EXISTS no
-- agrega columnas a tabla preexistente. Necesitamos ALTER TABLE ADD COLUMN.

-- Crear tenants stub si no existe (para FK)
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Default',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  name          text NOT NULL,
  key_prefix    text NOT NULL,
  key_hash      text NOT NULL UNIQUE,
  scopes        text[] NOT NULL DEFAULT ARRAY['read']::text[],
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT api_keys_scopes_check CHECK (scopes <@ ARRAY['read','write','admin']::text[])
);

-- Agregar columnas faltantes (idempotente)
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS revoked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes       text[] NOT NULL DEFAULT ARRAY['read']::text[],
  ADD COLUMN IF NOT EXISTS tenant_id    uuid,
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS key_prefix   text;

-- FK condicional a tenants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenants') THEN
    BEGIN
      ALTER TABLE api_keys
        ADD CONSTRAINT api_keys_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant       ON api_keys(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash         ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires      ON api_keys(expires_at) WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;
CREATE POLICY api_keys_tenant_isolation ON api_keys
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS api_keys_admin_only ON api_keys;
CREATE POLICY api_keys_admin_only ON api_keys
  FOR ALL
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND current_setting('app.role', true) IN ('admin','owner','superadmin')
  );

CREATE OR REPLACE FUNCTION touch_api_key(p_hash text)
RETURNS void LANGUAGE sql AS $$
  UPDATE api_keys SET last_used_at = now() WHERE key_hash = p_hash AND revoked_at IS NULL;
$$;
