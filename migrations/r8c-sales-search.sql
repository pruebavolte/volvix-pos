-- ============================================================================
-- VOLVIX POS — Round 8c: SALES SEARCH + LATE INVOICING + REPRINT + CFDI CANCEL
-- Migration: r8c-sales-search.sql
--
-- Cierra 5 escenarios MUY comunes — cliente regresa días/semanas después y
-- necesita algo (factura, devolución, comprobante).
--
--   FIX-T1: GET /api/sales/search — búsqueda avanzada multi-criterio.
--           Crea índices sobre pos_sales para que las consultas con filtros
--           (fecha, total, customer_id/name/phone, payment_method, items->>name,
--           cashier) sean rápidas. GIN sobre items JSONB para items_contain.
--
--   FIX-T2: POST /api/sales/:id/invoice-late — factura posterior (CFDI tardío).
--           Permite emitir CFDI hasta 30 días post-venta cuando el cliente
--           regresa con su RFC. Reusa volvix_audit_log + idempotency_keys.
--           Marca pos_sales.cfdi_uuid + cfdi_invoiced_at + cfdi_invoiced_late.
--
--   FIX-T3: GET /api/sales/:id/reprint — reimpresión con audit COPIA vs ORIG.
--           pos_print_log ya existe (R8a FIX-H4). Extendemos con conteo
--           secuencial vía RPC count_reprints(sale_id) y SECURITY_ALERT cuando
--           reprints > 3.
--
--   FIX-T4: POST /api/sales/:id/cfdi/cancel + cfdi/refacturar — cancela y
--           re-emite CFDI con datos correctos (sustitución 04: por errores).
--           Agrega columnas cfdi_status, cfdi_cancel_reason, cfdi_substitute_of.
--
--   FIX-T5: search?approximate=true — fuzzy + tolerancia. Reusa los índices de
--           T1; no requiere DDL adicional. Confidence se calcula en el handler.
--
-- Idempotente: CREATE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS / DO $$.
-- Apply: supabase db query --linked < migrations/r8c-sales-search.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX-T1: Índices de búsqueda sobre pos_sales (NO altera datos)
-- ============================================================================

-- Por (tenant_id, created_at desc) — el filtro principal en /api/sales/search
-- pos_sales tiene tenant_id en algunas instalaciones; si no existe, este índice
-- igualmente cae sobre created_at (Postgres ignora la columna inexistente vía DO $$)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_sales' AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_created
             ON pos_sales (tenant_id, created_at DESC)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_created
             ON pos_sales (created_at DESC)';
  END IF;
END $$;

-- Por pos_user_id (cashier filter) + created_at — usado por GET /api/sales también
CREATE INDEX IF NOT EXISTS idx_pos_sales_user_created
  ON pos_sales (pos_user_id, created_at DESC);

-- Por customer_id (lookup de ventas históricas de un cliente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_sales' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_customer_id
             ON pos_sales (customer_id) WHERE customer_id IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_sales' AND column_name = 'cliente_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_cliente_id
             ON pos_sales (cliente_id) WHERE cliente_id IS NOT NULL';
  END IF;
END $$;

-- Por total (rango de monto + tolerancia ±5%)
CREATE INDEX IF NOT EXISTS idx_pos_sales_total
  ON pos_sales (total);

-- Por payment_method (filtro común)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_sales' AND column_name = 'payment_method'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_payment_method
             ON pos_sales (payment_method, created_at DESC)';
  END IF;
END $$;

-- GIN sobre items JSONB para items_contain (busca producto en cualquier sale)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_sales' AND column_name = 'items'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_items_gin
             ON pos_sales USING GIN (items jsonb_path_ops)';
  END IF;
END $$;

-- ============================================================================
-- FIX-T2 + FIX-T4: Columnas CFDI extendidas en pos_sales
-- ============================================================================
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_uuid TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_status TEXT
  DEFAULT NULL CHECK (cfdi_status IS NULL OR cfdi_status IN ('vigente','cancelled','pending','substituted'));
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_cancel_reason TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_substitute_of TEXT; -- UUID del CFDI que esta sale sustituye
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_invoiced_at TIMESTAMPTZ;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_invoiced_late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_pdf_url TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cfdi_xml_url TEXT;

-- Índice para búsquedas por uuid CFDI (lookup rápido de cancel/refacturar)
CREATE INDEX IF NOT EXISTS idx_pos_sales_cfdi_uuid
  ON pos_sales (cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;

-- Índice para identificar ventas con CFDI activo (estatus vigente o pending)
CREATE INDEX IF NOT EXISTS idx_pos_sales_cfdi_status
  ON pos_sales (cfdi_status) WHERE cfdi_status IS NOT NULL;

-- ============================================================================
-- FIX-T3: RPC count_reprints (para "Copia #N de N" + alerta >3)
-- ============================================================================
CREATE OR REPLACE FUNCTION count_reprints(p_sale_id TEXT, p_tenant_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM pos_print_log
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND event = 'reprint';
  RETURN COALESCE(v_count, 0);
END;
$$;

-- Helper: verifica si una sale tiene CFDI activo (no cancelado)
CREATE OR REPLACE FUNCTION sale_has_active_cfdi(p_sale_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uuid TEXT;
  v_status TEXT;
BEGIN
  SELECT cfdi_uuid, cfdi_status INTO v_uuid, v_status
  FROM pos_sales WHERE id = p_sale_id;
  IF v_uuid IS NULL THEN RETURN FALSE; END IF;
  IF v_status = 'cancelled' THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FIX-T1 + audit: tabla de búsquedas (anti-fraude — frecuencia alta señala
-- exploración de tickets ajenos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_sales_search_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  user_id         TEXT,
  cashier_email   TEXT,
  search_params   JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count    INTEGER NOT NULL DEFAULT 0,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_addr         TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_search_log_tenant_ts
  ON pos_sales_search_log (tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_search_log_user_ts
  ON pos_sales_search_log (tenant_id, user_id, ts DESC);

ALTER TABLE pos_sales_search_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_sales_search_log_tenant_select ON pos_sales_search_log; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_sales_search_log_tenant_insert ON pos_sales_search_log; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_sales_search_log_tenant_select
  ON pos_sales_search_log FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_sales_search_log_tenant_insert
  ON pos_sales_search_log FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

-- ============================================================================
-- pos_security_alerts: si no existe (R5c probablemente la creó), backstop
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_security_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  alert_type      TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  resource        TEXT,
  resource_id     TEXT,
  user_id         TEXT,
  details         JSONB DEFAULT '{}'::jsonb,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_tenant_ts
  ON pos_security_alerts (tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_type
  ON pos_security_alerts (tenant_id, alert_type, ts DESC);

ALTER TABLE pos_security_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_security_alerts_tenant_select ON pos_security_alerts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_security_alerts_tenant_insert ON pos_security_alerts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_security_alerts_tenant_update ON pos_security_alerts; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_security_alerts_tenant_select
  ON pos_security_alerts FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

CREATE POLICY pos_security_alerts_tenant_insert
  ON pos_security_alerts FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_security_alerts_tenant_update
  ON pos_security_alerts FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

COMMIT;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_pos_sales_tenant_created, idx_pos_sales_user_created,
--     idx_pos_sales_customer_id, idx_pos_sales_cliente_id, idx_pos_sales_total,
--     idx_pos_sales_payment_method, idx_pos_sales_items_gin,
--     idx_pos_sales_cfdi_uuid, idx_pos_sales_cfdi_status, idx_pos_sales_created;
--   ALTER TABLE pos_sales DROP COLUMN IF EXISTS cfdi_status,
--     DROP COLUMN IF EXISTS cfdi_cancel_reason, DROP COLUMN IF EXISTS cfdi_substitute_of,
--     DROP COLUMN IF EXISTS cfdi_invoiced_at, DROP COLUMN IF EXISTS cfdi_invoiced_late,
--     DROP COLUMN IF EXISTS cfdi_pdf_url, DROP COLUMN IF EXISTS cfdi_xml_url;
--   DROP FUNCTION IF EXISTS count_reprints(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS sale_has_active_cfdi(UUID);
--   DROP TABLE IF EXISTS pos_sales_search_log;
-- ============================================================================
