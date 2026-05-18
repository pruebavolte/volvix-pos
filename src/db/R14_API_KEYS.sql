-- =============================================================
-- R14_API_KEYS.sql
-- API keys for third-party integrations (Zapier / Make / n8n).
-- Keys are stored hashed (sha256). Plain key (vlx_xxx) returned ONCE on creation.
-- =============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_prefix    text NOT NULL,                 -- first 12 chars (vlx_xxxxxx) for display
  key_hash      text NOT NULL UNIQUE,          -- sha256(plain_key) hex
  scopes        text[] NOT NULL DEFAULT ARRAY['read']::text[],  -- subset of {read,write,admin}
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid REFERENCES pos_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT api_keys_scopes_check CHECK (
    scopes <@ ARRAY['read','write','admin']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant       ON api_keys(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash         ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires      ON api_keys(expires_at) WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- RLS
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

-- Helper: log usage
CREATE OR REPLACE FUNCTION touch_api_key(p_hash text)
RETURNS void LANGUAGE sql AS $$
  UPDATE api_keys SET last_used_at = now() WHERE key_hash = p_hash AND revoked_at IS NULL;
$$;

COMMENT ON TABLE  api_keys IS 'R14: API keys for Zapier/Make/n8n integrations';
COMMENT ON COLUMN api_keys.scopes IS 'Subset of {read,write,admin}. Validated by API middleware.';
