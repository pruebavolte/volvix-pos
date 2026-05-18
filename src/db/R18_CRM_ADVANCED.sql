-- R18_CRM_ADVANCED.sql — CRM avanzado con pipeline de ventas (B2B)

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages(tenant_id, "order");

-- Stages por defecto (insert solo si no existen)
INSERT INTO pipeline_stages (tenant_id, name, "order", probability)
SELECT 1, n, ord, prob FROM (VALUES
  ('Lead', 1, 10.00),
  ('Qualified', 2, 25.00),
  ('Proposal', 3, 50.00),
  ('Negotiation', 4, 75.00),
  ('Closed Won', 5, 100.00),
  ('Closed Lost', 6, 0.00)
) AS d(n, ord, prob)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE tenant_id=1 AND name=d.n);

CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT,
  value_estimated NUMERIC(14,2) DEFAULT 0,
  stage_id BIGINT REFERENCES pipeline_stages(id),
  owner_user_id BIGINT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  notes TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_stage ON leads(tenant_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_user_id, status);

CREATE TABLE IF NOT EXISTS crm_activities (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','note')),
  summary TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  user_id BIGINT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(lead_id, ts DESC);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  segment_id BIGINT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','push')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','paused')),
  sent_at TIMESTAMPTZ,
  opened INT DEFAULT 0,
  clicked INT DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns(status);

-- Log de cambios de stage para auditoría / forecast histórico
CREATE TABLE IF NOT EXISTS crm_stage_log (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id BIGINT,
  to_stage_id BIGINT,
  user_id BIGINT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_stage_log_lead ON crm_stage_log(lead_id, ts DESC);
