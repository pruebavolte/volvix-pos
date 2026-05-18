-- =============================================================
-- R14_WEBHOOKS.sql — Outbound webhook subscriptions per tenant
-- =============================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  url         text NOT NULL,
  secret      text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant
  ON webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_active
  ON webhook_endpoints(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events_gin
  ON webhook_endpoints USING gin (events);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  tenant_id    text NOT NULL,
  event        text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
  status_code  integer,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  ts           timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON webhook_deliveries(endpoint_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant
  ON webhook_deliveries(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status) WHERE status <> 'sent';

-- RLS
ALTER TABLE webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON webhook_endpoints;
CREATE POLICY webhook_endpoints_tenant_isolation ON webhook_endpoints
  USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
         OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin'));

DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation ON webhook_deliveries;
CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries
  USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
         OR current_setting('request.jwt.claims', true)::json->>'role' IN ('owner','superadmin'));
