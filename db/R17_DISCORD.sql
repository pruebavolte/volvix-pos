-- =============================================================
-- R17_DISCORD.sql - Discord webhooks per tenant
-- Reusa estructura de webhooks pero especifico Discord (sin secret HMAC)
-- =============================================================

CREATE TABLE IF NOT EXISTS discord_webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  name        text NOT NULL DEFAULT 'Discord',
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discord_webhooks_url_chk
    CHECK (url ~* '^https://(canary\.|ptb\.)?discord(app)?\.com/api/webhooks/.+')
);

CREATE INDEX IF NOT EXISTS idx_discord_webhooks_tenant
  ON discord_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discord_webhooks_tenant_active
  ON discord_webhooks(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_discord_webhooks_events_gin
  ON discord_webhooks USING gin (events);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_discord_webhooks_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS discord_webhooks_updated ON discord_webhooks;
CREATE TRIGGER discord_webhooks_updated
  BEFORE UPDATE ON discord_webhooks
  FOR EACH ROW EXECUTE FUNCTION trg_discord_webhooks_updated();

-- RLS - aislamiento por tenant
ALTER TABLE discord_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discord_webhooks_tenant_isolation ON discord_webhooks;
CREATE POLICY discord_webhooks_tenant_isolation ON discord_webhooks
  USING (
    tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin')
  )
  WITH CHECK (
    tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin')
  );

COMMENT ON TABLE discord_webhooks IS
  'R17 - Webhooks de Discord por tenant. Eventos soportados: sale.created (>$1000), low_stock, new_user, error_critical';
