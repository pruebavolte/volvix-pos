-- =====================================================================
-- B40 — CFDI 4.0 (SAT México) — Comprobantes Fiscales Digitales
-- Tenant-isolated via TEXT tenant_id (slug); RLS enforced.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cfdi_documents (
  uuid              TEXT PRIMARY KEY,                  -- SAT UUID (32 hex chars + dashes)
  tenant_id         TEXT NOT NULL,
  sale_id           UUID,
  serie             TEXT,
  folio             INTEGER,
  customer_rfc      TEXT NOT NULL,
  customer_name     TEXT,
  customer_cp       TEXT,
  customer_use      TEXT,                              -- G01, G03, S01, P01, etc.
  customer_regimen  TEXT,                              -- 605, 612, 621, 626, etc.
  total             NUMERIC(12,2) NOT NULL,
  subtotal          NUMERIC(12,2),
  tax               NUMERIC(12,2),
  iva_rate          NUMERIC(5,4) DEFAULT 0.16,
  payment_method    TEXT,                              -- 01..99 SAT codes
  payment_form      TEXT,                              -- PUE / PPD
  use_cfdi          TEXT,                              -- G01, G03, etc.
  regimen_fiscal    TEXT,                              -- 612, 621, etc.
  status            TEXT CHECK (status IN ('draft','timbrado','cancelado','pending','error')) DEFAULT 'draft',
  xml_content       TEXT,                              -- raw XML (pre o post sello)
  xml_url           TEXT,                              -- download URL post-PAC
  pdf_url           TEXT,
  pac_provider      TEXT,                              -- facturama|finkok|satmex|mock
  pac_response      JSONB,                             -- raw PAC response for audit
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,                              -- 01..04 SAT motivo
  cancel_uuid       TEXT,                              -- replacement UUID si reason=01
  cancellation_xml  TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  timbrado_at       TIMESTAMPTZ
);

ALTER TABLE cfdi_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfdi_iso ON cfdi_documents;
CREATE POLICY cfdi_iso ON cfdi_documents
  FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));

CREATE INDEX IF NOT EXISTS idx_cfdi_tenant      ON cfdi_documents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfdi_sale        ON cfdi_documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_status      ON cfdi_documents(status);
CREATE INDEX IF NOT EXISTS idx_cfdi_customerrfc ON cfdi_documents(tenant_id, customer_rfc);

-- Folio counter per tenant/serie (atomic increments)
CREATE TABLE IF NOT EXISTS cfdi_folios (
  tenant_id   TEXT NOT NULL,
  serie       TEXT NOT NULL DEFAULT 'A',
  next_folio  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, serie)
);

ALTER TABLE cfdi_folios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfdi_folios_iso ON cfdi_folios;
CREATE POLICY cfdi_folios_iso ON cfdi_folios
  FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
