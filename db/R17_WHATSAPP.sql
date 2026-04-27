-- =====================================================================
-- R17 WHATSAPP BUSINESS API — schema
-- Tablas: whatsapp_messages, whatsapp_subscribers
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NULL,
  direction     text NOT NULL CHECK (direction IN ('in', 'out')),
  to_phone      text NOT NULL,
  template      text NULL,
  body          text NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  wa_id         text NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_tenant     ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_phone      ON whatsapp_messages(to_phone);
CREATE INDEX IF NOT EXISTS idx_wa_msg_template   ON whatsapp_messages(template);
CREATE INDEX IF NOT EXISTS idx_wa_msg_sent_at    ON whatsapp_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id      ON whatsapp_messages(wa_id);

CREATE TABLE IF NOT EXISTS whatsapp_subscribers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  tenant_id     uuid NULL,
  customer_id   uuid NULL,
  opt_in_at     timestamptz NOT NULL DEFAULT now(),
  opt_out_at    timestamptz NULL,
  source        text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_subs_tenant   ON whatsapp_subscribers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_subs_customer ON whatsapp_subscribers(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_subs_active   ON whatsapp_subscribers(phone) WHERE opt_out_at IS NULL;

-- RLS opcional (tenant isolation). Activar manualmente cuando RLS global esté ON.
-- ALTER TABLE whatsapp_messages    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_subscribers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY wa_msg_tenant_isolation ON whatsapp_messages
--   USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- CREATE POLICY wa_subs_tenant_isolation ON whatsapp_subscribers
--   USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
