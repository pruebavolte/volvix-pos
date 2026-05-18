-- =====================================================================
-- B40 — WhatsApp Business — mensajería transaccional + opt-in
-- Tenant-isolated via TEXT tenant_id (slug); RLS enforced.
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  direction            TEXT CHECK (direction IN ('inbound','outbound')) NOT NULL,
  phone                TEXT NOT NULL,
  customer_id          UUID,
  template_name        TEXT,
  template_params      JSONB,
  body                 TEXT,
  media_url            TEXT,
  status               TEXT CHECK (status IN ('queued','sent','delivered','read','failed','received')) DEFAULT 'queued',
  provider             TEXT,                  -- meta|twilio|messagebird|360dialog|mock
  provider_message_id  TEXT,
  error_code           TEXT,
  error_message        TEXT,
  occurred_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_iso ON whatsapp_messages;
CREATE POLICY wa_iso ON whatsapp_messages
  FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));

CREATE INDEX IF NOT EXISTS idx_wa_tenant_phone ON whatsapp_messages(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_wa_status       ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_wa_occurred     ON whatsapp_messages(tenant_id, occurred_at DESC);

-- Opt-in flags on customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_optin       BOOLEAN     DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_optin_date  TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_phone       TEXT;

-- Approved templates registry (Meta requires pre-approval per WABA)
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  language     TEXT DEFAULT 'es_MX',
  category     TEXT,                          -- TRANSACTIONAL|MARKETING|UTILITY|AUTHENTICATION
  status       TEXT DEFAULT 'pending',        -- pending|approved|rejected
  body         TEXT,
  variables    JSONB,
  provider_id  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, name, language)
);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_tpl_iso ON whatsapp_templates;
CREATE POLICY wa_tpl_iso ON whatsapp_templates
  FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
