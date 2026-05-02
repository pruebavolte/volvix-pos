-- Volvix POS · Granular per-tenant module + button flags
-- Permite al superadmin (dueño del SaaS) controlar QUÉ módulos y QUÉ botones
-- ve cada cliente. 3 estados:
--   'enabled' = funciona normal
--   'hidden'  = se REMUEVE del DOM (cambia el layout)
--   'locked'  = visible pero con candado + modal con mensaje custom

CREATE TABLE IF NOT EXISTS tenant_module_flags (
  tenant_id     text NOT NULL,
  module_key    text NOT NULL,                      -- ej. 'whatsapp', 'inventario', 'ventas', 'reportes'
  state         text NOT NULL DEFAULT 'enabled',    -- 'enabled' | 'hidden' | 'locked'
  enabled       boolean NOT NULL DEFAULT true,      -- mirror de state='enabled' (back-compat)
  paid          boolean NOT NULL DEFAULT false,     -- ¿el cliente pagó este módulo?
  lock_message  text,                               -- mensaje custom cuando state='locked' (ej "Suscríbete")
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, module_key),
  CONSTRAINT tenant_module_state_chk CHECK (state IN ('enabled', 'hidden', 'locked'))
);

CREATE INDEX IF NOT EXISTS idx_tmf_tenant ON tenant_module_flags(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_button_flags (
  tenant_id     text NOT NULL,
  button_key    text NOT NULL,                      -- ej. 'ventas.refund', 'reportes.export-csv', 'pos.discount'
  state         text NOT NULL DEFAULT 'enabled',
  enabled       boolean NOT NULL DEFAULT true,
  lock_message  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, button_key),
  CONSTRAINT tenant_button_state_chk CHECK (state IN ('enabled', 'hidden', 'locked'))
);

CREATE INDEX IF NOT EXISTS idx_tbf_tenant ON tenant_button_flags(tenant_id);

-- RLS: cada tenant solo ve SUS propias flags. Superadmin (service_role) ve todo.
ALTER TABLE tenant_module_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_button_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tmf_tenant_isolation ON tenant_module_flags FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tbf_tenant_isolation ON tenant_button_flags FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Service role bypass (backend usa SUPABASE_SERVICE_KEY)
CREATE POLICY tmf_service_all ON tenant_module_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tbf_service_all ON tenant_button_flags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger updated_at automático
CREATE OR REPLACE FUNCTION _tmf_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tmf_updated_at ON tenant_module_flags;
CREATE TRIGGER trg_tmf_updated_at BEFORE UPDATE ON tenant_module_flags
  FOR EACH ROW EXECUTE FUNCTION _tmf_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tbf_updated_at ON tenant_button_flags;
CREATE TRIGGER trg_tbf_updated_at BEFORE UPDATE ON tenant_button_flags
  FOR EACH ROW EXECUTE FUNCTION _tmf_touch_updated_at();
