-- Volvix POS · Facturama Multi-Emisor
-- Cada negocio (tenant) sube su propio CSD y emite CFDI a su nombre.
-- Sus clientes finales pueden auto-facturar via portal público.

CREATE TABLE IF NOT EXISTS tenant_facturama_credentials (
  tenant_id          text PRIMARY KEY,
  rfc                text NOT NULL,
  legal_name         text NOT NULL,
  fiscal_regime      text NOT NULL,           -- 601 PM, 612 PF, 626 RESICO, etc.
  zip_code           text NOT NULL,           -- código postal del lugar de expedición
  facturama_csd_id   text,                    -- id devuelto por POST /api/csd
  default_serie      text DEFAULT 'A',
  next_folio         integer DEFAULT 1,
  active             boolean DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tfc_rfc ON tenant_facturama_credentials(rfc);

CREATE TABLE IF NOT EXISTS cfdi_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  ticket_id       text,                       -- referencia al pos_sales.id
  customer_rfc    text NOT NULL,
  customer_name   text NOT NULL,
  customer_email  text,
  series          text,
  folio           text,
  uuid_sat        text,                       -- folio fiscal del SAT (timbrado)
  total           numeric(12,2),
  facturama_id    text,                       -- id en Facturama para PDF/XML download
  status          text DEFAULT 'issued',      -- issued | cancelled | mock
  issued_at       timestamptz DEFAULT now(),
  cancelled_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cfdi_tenant ON cfdi_invoices(tenant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfdi_ticket ON cfdi_invoices(tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_uuid ON cfdi_invoices(uuid_sat);

-- RLS: cada tenant solo ve sus propios CFDIs
ALTER TABLE tenant_facturama_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cfdi_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tfc_tenant_isolation ON tenant_facturama_credentials
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY cfdi_tenant_isolation ON cfdi_invoices
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Service role bypass (backend uses SUPABASE_SERVICE_KEY)
CREATE POLICY tfc_service_all ON tenant_facturama_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY cfdi_service_all ON cfdi_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
