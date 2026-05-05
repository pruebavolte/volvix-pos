-- ============================================================================
-- R14_CFDI_TABLES.sql — Esquema CFDI 4.0 (Volvix POS)
-- ----------------------------------------------------------------------------
-- Tablas para facturación electrónica México:
--   invoices       : cabecera CFDI con UUID SAT, sello, certificado, XML, PDF
--   invoice_lines  : conceptos / partidas
--   invoice_log    : bitácora de operaciones (timbrado, cancelación, consulta)
--
-- Diseñado para Supabase (Postgres). Compatible con tenants multi-empresa.
-- ============================================================================

-- ─── Limpieza idempotente (orden inverso por FKs) ───────────────────────────
DROP TABLE IF EXISTS public.invoice_log   CASCADE;
DROP TABLE IF EXISTS public.invoice_lines CASCADE;
DROP TABLE IF EXISTS public.invoices      CASCADE;

-- ─── INVOICES ───────────────────────────────────────────────────────────────
CREATE TABLE public.invoices (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid REFERENCES public.volvix_tenants(id) ON DELETE CASCADE,
  sale_id                  uuid REFERENCES public.volvix_ventas(id)  ON DELETE SET NULL,

  -- Identificadores SAT
  uuid                     text UNIQUE NOT NULL,                 -- UUID timbre fiscal digital (SAT)
  serie                    text DEFAULT 'A',
  folio                    text,
  version                  text DEFAULT '4.0',
  tipo_comprobante         text DEFAULT 'I'  CHECK (tipo_comprobante IN ('I','E','T','N','P')),

  -- Emisor
  rfc_emisor               text NOT NULL,
  razon_social_emisor      text,
  regimen_fiscal_emisor    text,

  -- Receptor
  rfc_receptor             text NOT NULL,
  razon_social_receptor    text NOT NULL,
  uso_cfdi                 text NOT NULL,
  regimen_fiscal_receptor  text NOT NULL,
  codigo_postal_receptor   text NOT NULL CHECK (codigo_postal_receptor ~ '^[0-9]{5}$'),

  -- Importes
  subtotal                 numeric(14,2) NOT NULL,
  descuento                numeric(14,2) DEFAULT 0,
  total                    numeric(14,2) NOT NULL,
  moneda                   text DEFAULT 'MXN',
  tipo_cambio              numeric(14,6) DEFAULT 1,

  -- Pago
  metodo_pago              text DEFAULT 'PUE',                   -- PUE / PPD
  forma_pago               text DEFAULT '01',                    -- catálogo c_FormaPago
  condiciones_pago         text,

  -- Timbrado
  sello                    text,                                 -- SelloCFD del emisor
  sello_sat                text,                                 -- SelloSAT del PAC
  certificado_no           text,                                 -- NoCertificadoSAT
  certificado              text,                                 -- certificado base64 (opcional)
  rfc_prov_certif          text,                                 -- PAC
  fecha_emision            timestamptz NOT NULL DEFAULT now(),
  fecha_timbrado           timestamptz,
  lugar_expedicion         text,

  -- Documentos
  xml                      text,                                 -- XML CFDI completo
  pdf_url                  text,                                 -- URL al PDF (storage)

  -- Estatus
  estatus                  text NOT NULL DEFAULT 'borrador'
                              CHECK (estatus IN ('borrador','vigente','cancelada','rechazada','en_proceso_cancelacion')),
  motivo_cancelacion       text  CHECK (motivo_cancelacion IS NULL OR motivo_cancelacion IN ('01','02','03','04')),
  folio_sustitucion        text,
  fecha_cancelacion        timestamptz,

  -- Meta
  modo_test                boolean DEFAULT true,
  pac_response             jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_tenant      ON public.invoices(tenant_id);
CREATE INDEX idx_invoices_sale        ON public.invoices(sale_id);
CREATE INDEX idx_invoices_uuid        ON public.invoices(uuid);
CREATE INDEX idx_invoices_rfc_recep   ON public.invoices(rfc_receptor);
CREATE INDEX idx_invoices_estatus     ON public.invoices(estatus);
CREATE INDEX idx_invoices_fecha_tim   ON public.invoices(fecha_timbrado DESC);

-- ─── INVOICE_LINES ──────────────────────────────────────────────────────────
CREATE TABLE public.invoice_lines (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  linea                    int  NOT NULL,
  clave_prod_serv          text NOT NULL DEFAULT '01010101',
  no_identificacion        text,
  cantidad                 numeric(14,4) NOT NULL CHECK (cantidad > 0),
  clave_unidad             text NOT NULL DEFAULT 'H87',
  unidad                   text,
  descripcion              text NOT NULL,
  precio_unitario          numeric(14,4) NOT NULL CHECK (precio_unitario >= 0),
  importe                  numeric(14,2) NOT NULL,
  descuento                numeric(14,2) DEFAULT 0,
  objeto_imp               text DEFAULT '02',
  iva                      numeric(14,2) DEFAULT 0,
  ieps                     numeric(14,2) DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, linea)
);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

-- ─── INVOICE_LOG ────────────────────────────────────────────────────────────
CREATE TABLE public.invoice_log (
  id            bigserial PRIMARY KEY,
  invoice_id    uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  uuid          text,
  accion        text NOT NULL CHECK (accion IN ('timbrado','cancelacion','consulta','reenvio','error')),
  resultado     text NOT NULL CHECK (resultado IN ('ok','aceptada','rechazada','en_proceso','error')),
  detalle       text,
  pac           text DEFAULT 'finkok',
  request_xml   text,
  response_xml  text,
  http_status   int,
  user_id       uuid,
  ip            text,
  ts            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_log_invoice ON public.invoice_log(invoice_id);
CREATE INDEX idx_invoice_log_uuid    ON public.invoice_log(uuid);
CREATE INDEX idx_invoice_log_accion  ON public.invoice_log(accion);
CREATE INDEX idx_invoice_log_ts      ON public.invoice_log(ts DESC);

-- ─── Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_invoices_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoices_updated_at();

-- ─── RLS (Row Level Security) ───────────────────────────────────────────────
ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_log   ENABLE ROW LEVEL SECURITY;

-- Acceso por tenant (asume claim jwt 'tenant_id' o tabla volvix_usuarios).
DROP POLICY IF EXISTS invoices_tenant_isolation ON public.invoices;
CREATE POLICY invoices_tenant_isolation ON public.invoices
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS invoice_lines_tenant_isolation ON public.invoice_lines;
CREATE POLICY invoice_lines_tenant_isolation ON public.invoice_lines
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS invoice_log_tenant_isolation ON public.invoice_log;
CREATE POLICY invoice_log_tenant_isolation ON public.invoice_log
  USING (
    invoice_id IS NULL OR invoice_id IN (
      SELECT id FROM public.invoices
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.volvix_usuarios WHERE user_id = auth.uid()
      )
    )
  );

-- Service role bypass: el backend usa SUPABASE_SERVICE_ROLE_KEY que ignora RLS.

-- ─── Comentarios ────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.invoices      IS 'Cabeceras CFDI 4.0 timbradas (México)';
COMMENT ON TABLE  public.invoice_lines IS 'Conceptos/partidas de cada CFDI';
COMMENT ON TABLE  public.invoice_log   IS 'Bitácora de operaciones contra el PAC (timbrado, cancelación, consulta)';
COMMENT ON COLUMN public.invoices.uuid          IS 'UUID del Timbre Fiscal Digital asignado por el SAT';
COMMENT ON COLUMN public.invoices.sello         IS 'SelloCFD generado por el emisor con su CSD';
COMMENT ON COLUMN public.invoices.sello_sat     IS 'SelloSAT devuelto por el PAC tras timbrar';
COMMENT ON COLUMN public.invoices.certificado_no IS 'NoCertificadoSAT (20 dígitos) usado para timbrar';
COMMENT ON COLUMN public.invoices.modo_test     IS 'true cuando el CFDI fue generado en sandbox/test (no producción)';
