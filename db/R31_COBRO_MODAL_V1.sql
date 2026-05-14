-- =============================================================================
-- R31 — Modal de Cobro v1 (adaptado a infraestructura Volvix existente)
-- Fecha: 2026-05-14
-- Idempotente. Usa IF NOT EXISTS en todo.
--
-- Mapping vs PROMPT_FIX_COBRO_MODAL_v1.md:
--   v1.tickets         → sales (existente)
--   v1.ticket_payments → payments (existente, con sale_id + raw:jsonb)
--   v1.cfdi_invoices   → cfdi_invoices (existente, extender)
--   v1.cash_sessions   → pos_cash_sessions (existente)
--   v1.customers       → customers (existente, extender)
--   v1.sync_queue      → sync_queue (existente, extender)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1.1 ENUM: payment_method_type (catálogo de métodos de pago México)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM (
    'EFECTIVO',
    'TARJETA_DEBITO',
    'TARJETA_CREDITO',
    'SPEI',
    'CODI',
    'MERCADO_PAGO',
    'CLIP',
    'VALE_DESPENSA',
    'VALE_RESTAURANTE',
    'MONEDERO_ELECTRONICO',
    'USD_EFECTIVO',
    'CHEQUE',
    'CREDITO_CLIENTE',
    'TRANSFERENCIA_INTL',
    'OTRO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 1.2 ENUM: sat_forma_pago (catálogo c_FormaPago CFDI 4.0)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE sat_forma_pago AS ENUM (
    '01','02','03','04','05','06','08','12','13','14','15',
    '17','23','24','25','26','27','28','29','30','31','99'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 1.3 EXTENDER sales (= tickets del v1)
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tip_amount               NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_percent              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS discount_reason          TEXT,
  ADD COLUMN IF NOT EXISTS discount_authorized_by   UUID,
  ADD COLUMN IF NOT EXISTS rounding_amount          NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_destination     TEXT,
  ADD COLUMN IF NOT EXISTS waiter_id                UUID,
  ADD COLUMN IF NOT EXISTS table_number             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS diners_count             INT,
  ADD COLUMN IF NOT EXISTS delivery_method          VARCHAR(20) DEFAULT 'PRINT',
  ADD COLUMN IF NOT EXISTS delivery_target          TEXT,
  ADD COLUMN IF NOT EXISTS suspended                BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_label          TEXT,
  ADD COLUMN IF NOT EXISTS cash_session_id          UUID,
  ADD COLUMN IF NOT EXISTS device_id                VARCHAR(100),
  ADD COLUMN IF NOT EXISTS app_version              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payment_methods_summary  TEXT;
  -- payment_methods_summary: "EFECTIVO+TARJETA" para queries rápidos sin JOIN a payments

CREATE INDEX IF NOT EXISTS idx_sales_suspended
  ON public.sales (suspended) WHERE suspended = TRUE;

CREATE INDEX IF NOT EXISTS idx_sales_cash_session
  ON public.sales (cash_session_id) WHERE cash_session_id IS NOT NULL;

COMMENT ON COLUMN public.sales.tip_amount IS 'Monto de propina ($MXN) — para restaurantes/bares/spas';
COMMENT ON COLUMN public.sales.delivery_method IS 'PRINT | EMAIL | WHATSAPP | NONE | PRINT_AND_EMAIL';
COMMENT ON COLUMN public.sales.suspended IS 'TRUE = ticket apartado (cliente regresa por cambio, etc.)';
COMMENT ON COLUMN public.sales.payment_methods_summary IS 'Resumen de métodos usados (e.g. "EFECTIVO+TARJETA") para reportes rápidos';

-- -----------------------------------------------------------------------------
-- 1.4 EXTENDER cfdi_invoices (CFDI 4.0 completo)
-- -----------------------------------------------------------------------------
ALTER TABLE public.cfdi_invoices
  ADD COLUMN IF NOT EXISTS receiver_zipcode         VARCHAR(5),
  ADD COLUMN IF NOT EXISTS receiver_fiscal_regime   VARCHAR(3),
  ADD COLUMN IF NOT EXISTS receiver_cfdi_use        VARCHAR(3),
  ADD COLUMN IF NOT EXISTS forma_pago               VARCHAR(2),
  ADD COLUMN IF NOT EXISTS metodo_pago              VARCHAR(3) DEFAULT 'PUE',
  ADD COLUMN IF NOT EXISTS moneda                   VARCHAR(3) DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS tipo_cambio              NUMERIC(8,4) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS subtotal                 NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS descuento                NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva                      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps                     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_retenido             NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_retenido             NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pac_provider             VARCHAR(30) DEFAULT 'FACTURAMA',
  ADD COLUMN IF NOT EXISTS xml_url                  TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url                  TEXT,
  ADD COLUMN IF NOT EXISTS cadena_original          TEXT,
  ADD COLUMN IF NOT EXISTS sello_sat                TEXT,
  ADD COLUMN IF NOT EXISTS sello_emisor             TEXT,
  ADD COLUMN IF NOT EXISTS folio_interno            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS error_message            TEXT,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion       VARCHAR(2),
  ADD COLUMN IF NOT EXISTS created_by               UUID,
  ADD COLUMN IF NOT EXISTS retry_count              INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cfdi_status_pending
  ON public.cfdi_invoices (status) WHERE status IN ('pending','error');

CREATE INDEX IF NOT EXISTS idx_cfdi_uuid_sat
  ON public.cfdi_invoices (uuid_sat) WHERE uuid_sat IS NOT NULL;

COMMENT ON COLUMN public.cfdi_invoices.metodo_pago IS 'PUE (Pago en una exhibición) | PPD (Pago en parcialidades o diferido)';
COMMENT ON COLUMN public.cfdi_invoices.forma_pago IS 'Código SAT c_FormaPago: 01=Efectivo, 03=Transferencia, 04=Tarjeta crédito, 28=Tarjeta débito, 99=Mixto';

-- -----------------------------------------------------------------------------
-- 1.5 EXTENDER customers (datos fiscales + monedero)
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS razon_social         TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal       VARCHAR(3),
  ADD COLUMN IF NOT EXISTS uso_cfdi_default     VARCHAR(3) DEFAULT 'G03',
  ADD COLUMN IF NOT EXISTS codigo_postal        VARCHAR(5),
  ADD COLUMN IF NOT EXISTS email_facturacion    TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS monedero_balance     NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_rfc
  ON public.customers (rfc) WHERE rfc IS NOT NULL AND rfc != '';

COMMENT ON COLUMN public.customers.regimen_fiscal IS 'Código SAT c_RegimenFiscal: 601=PM Régimen General, 612=PF Actividades Empresariales, 626=RESICO, etc.';
COMMENT ON COLUMN public.customers.uso_cfdi_default IS 'Default G03 (Gastos en general). G01=Adquisición mercancías, P01=Por definir, D01=Honorarios médicos';

-- -----------------------------------------------------------------------------
-- 1.6 EXTENDER sync_queue (prioridades + retry inteligente)
-- -----------------------------------------------------------------------------
ALTER TABLE public.sync_queue
  ADD COLUMN IF NOT EXISTS entity_type   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS priority      INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sync_queue_priority
  ON public.sync_queue (priority DESC, created_at ASC)
  WHERE status = 'pending';

COMMENT ON COLUMN public.sync_queue.entity_type IS 'sales | payments | cfdi_invoices | customers — para router de procesamiento';
COMMENT ON COLUMN public.sync_queue.priority IS '10=tickets, 8=CFDI, 5=email/whatsapp — mayor prioridad sale primero';

-- -----------------------------------------------------------------------------
-- 1.7 EXTENDER payments (campos específicos por método en columnas dedicadas)
-- Optional — raw:jsonb ya almacena esto, pero columnas dedicadas aceleran reportes
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method_type    payment_method_type,
  ADD COLUMN IF NOT EXISTS card_last4     VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_brand     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS auth_code      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS terminal_id    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_origin    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vale_provider  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS vale_folio     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS usd_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS usd_rate       NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cashier_id     UUID;

CREATE INDEX IF NOT EXISTS idx_payments_method_type
  ON public.payments (method_type) WHERE method_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_sale_id
  ON public.payments (sale_id);

COMMENT ON COLUMN public.payments.method_type IS 'Método de pago tipado (enum payment_method_type). raw:jsonb queda como fallback de auditoría';
COMMENT ON COLUMN public.payments.reference_number IS 'Referencia bancaria SPEI / CoDi / folio Transfer';

-- -----------------------------------------------------------------------------
-- 1.8 EXTENDER pos_cash_sessions con campos del v1
-- -----------------------------------------------------------------------------
ALTER TABLE public.pos_cash_sessions
  ADD COLUMN IF NOT EXISTS device_id      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS difference     NUMERIC(12,2) GENERATED ALWAYS AS (actual - expected) STORED;

COMMENT ON COLUMN public.pos_cash_sessions.difference IS 'Diferencia actual - expected (computed column)';

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr manual después de aplicar):
--
-- SELECT 'enums' AS check, count(*) FROM pg_type
--   WHERE typname IN ('payment_method_type','sat_forma_pago');  -- esperado: 2
--
-- SELECT 'sales_new_cols' AS check, count(*) FROM information_schema.columns
--   WHERE table_name='sales' AND column_name IN
--   ('tip_amount','rounding_amount','suspended','cash_session_id','delivery_method');  -- esperado: 5
--
-- SELECT 'cfdi_new_cols' AS check, count(*) FROM information_schema.columns
--   WHERE table_name='cfdi_invoices' AND column_name IN
--   ('receiver_zipcode','forma_pago','metodo_pago','pac_provider','xml_url','pdf_url');  -- esperado: 6
--
-- SELECT 'customers_new_cols' AS check, count(*) FROM information_schema.columns
--   WHERE table_name='customers' AND column_name IN
--   ('razon_social','regimen_fiscal','uso_cfdi_default','codigo_postal');  -- esperado: 4
--
-- SELECT 'payments_new_cols' AS check, count(*) FROM information_schema.columns
--   WHERE table_name='payments' AND column_name IN
--   ('method_type','card_last4','auth_code','vale_provider','usd_amount');  -- esperado: 5
-- =============================================================================
