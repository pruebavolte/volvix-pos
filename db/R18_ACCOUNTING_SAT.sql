-- R18_ACCOUNTING_SAT.sql — Contabilidad SAT México automática
-- Catálogo de cuentas SAT (rango 100-800), pólizas (journal), gastos deducibles, trigger automático

-- 1) Catálogo de cuentas SAT (Anexo 24 — código agrupador SAT)
CREATE TABLE IF NOT EXISTS accounting_accounts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  codigo TEXT NOT NULL,                 -- ej. 101.01, 205.03, 401.01
  codigo_agrupador_sat TEXT NOT NULL,   -- código SAT Anexo 24
  nombre TEXT NOT NULL,
  naturaleza TEXT NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
  nivel INT NOT NULL DEFAULT 1,
  cuenta_padre TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  ts TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_acc_accounts_tenant ON accounting_accounts(tenant_id, activa);

-- Seed estandar SAT (rangos: 100=activo, 200=pasivo, 300=capital, 400=ingresos, 500=costos, 600=gastos, 700=resultado integral, 800=cuentas orden)
-- Inserción condicional por tenant en runtime (api). Aquí solo plantilla genérica para tenant_id=0 (template).
INSERT INTO accounting_accounts (tenant_id, codigo, codigo_agrupador_sat, nombre, naturaleza, nivel) VALUES
  (0,'101.01','101.01','Caja','deudora',2),
  (0,'102.01','102.01','Bancos nacionales','deudora',2),
  (0,'105.01','105.01','Clientes','deudora',2),
  (0,'115.01','115.01','Inventario mercancías','deudora',2),
  (0,'118.01','118.01','IVA acreditable','deudora',2),
  (0,'201.01','201.01','Proveedores','acreedora',2),
  (0,'208.01','208.01','IVA trasladado','acreedora',2),
  (0,'209.01','209.01','ISR por pagar','acreedora',2),
  (0,'301.01','301.01','Capital social','acreedora',2),
  (0,'401.01','401.01','Ventas / Ingresos','acreedora',2),
  (0,'501.01','501.01','Costo de ventas','deudora',2),
  (0,'601.01','601.01','Gastos generales','deudora',2),
  (0,'602.01','602.01','Gastos de venta','deudora',2),
  (0,'603.01','603.01','Sueldos y salarios','deudora',2),
  (0,'701.01','701.01','Resultado del ejercicio','acreedora',2)
ON CONFLICT (tenant_id, codigo) DO NOTHING;

-- 2) Libro diario (pólizas) - asientos contables
CREATE TABLE IF NOT EXISTS accounting_journal (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  poliza TEXT,                          -- ej. D-2026-04-0001 (diario), I-... (ingresos), E-... (egresos)
  tipo_poliza TEXT NOT NULL DEFAULT 'D' CHECK (tipo_poliza IN ('D','I','E')),
  concepto TEXT NOT NULL,
  cuenta TEXT NOT NULL,                 -- codigo de accounting_accounts
  debe NUMERIC(14,2) NOT NULL DEFAULT 0,
  haber NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_id BIGINT,
  expense_id BIGINT,
  cfdi_uuid TEXT,
  origen TEXT,                          -- 'auto_sale','auto_expense','manual','cfdi_import'
  ts TIMESTAMPTZ DEFAULT NOW(),
  CHECK (debe = 0 OR haber = 0)         -- una línea, o debe o haber
);
CREATE INDEX IF NOT EXISTS idx_journal_tenant_fecha ON accounting_journal(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_journal_sale ON accounting_journal(sale_id);
CREATE INDEX IF NOT EXISTS idx_journal_expense ON accounting_journal(expense_id);
CREATE INDEX IF NOT EXISTS idx_journal_cfdi ON accounting_journal(cfdi_uuid);

-- 3) Gastos / egresos (con CFDI proveedor)
CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL,         -- subtotal
  iva NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,         -- monto + iva
  rfc_emisor TEXT,
  razon_social_emisor TEXT,
  deducible BOOLEAN NOT NULL DEFAULT TRUE,
  categoria TEXT,                       -- 'renta','servicios','gasolina','sueldos','mercancia',etc.
  cuenta_contable TEXT,                 -- codigo cuenta destino (601.01, 603.01, etc.)
  metodo_pago TEXT,                     -- PUE, PPD
  forma_pago TEXT,                      -- 01 efectivo, 03 transferencia, 04 tarjeta credito, etc.
  cfdi_uuid TEXT,
  cfdi_xml_path TEXT,
  estatus TEXT NOT NULL DEFAULT 'registrado' CHECK (estatus IN ('registrado','pagado','cancelado')),
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_fecha ON expenses(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_expenses_rfc ON expenses(rfc_emisor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_cfdi ON expenses(tenant_id, cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;

-- 4) Trigger: cada venta inserta asiento doble en journal automaticamente
-- Asume tabla sales(id, tenant_id, total, subtotal, iva, fecha, cliente_rfc?)
CREATE OR REPLACE FUNCTION fn_after_sale_insert_journal() RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC(14,2);
  v_iva NUMERIC(14,2);
  v_total NUMERIC(14,2);
  v_fecha DATE;
  v_concepto TEXT;
BEGIN
  v_total := COALESCE(NEW.total, 0);
  v_subtotal := COALESCE(NEW.subtotal, ROUND(v_total/1.16, 2));
  v_iva := COALESCE(NEW.iva, ROUND(v_total - v_subtotal, 2));
  v_fecha := COALESCE(NEW.fecha::DATE, CURRENT_DATE);
  v_concepto := 'Venta POS #' || NEW.id::TEXT;

  -- Cargo a Caja/Bancos por el total
  INSERT INTO accounting_journal (tenant_id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, sale_id, origen)
  VALUES (NEW.tenant_id, v_fecha, 'I-' || TO_CHAR(v_fecha,'YYYY-MM') || '-' || LPAD(NEW.id::TEXT,5,'0'),
          'I', v_concepto, '101.01', v_total, 0, NEW.id, 'auto_sale');

  -- Abono a Ventas por subtotal
  INSERT INTO accounting_journal (tenant_id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, sale_id, origen)
  VALUES (NEW.tenant_id, v_fecha, 'I-' || TO_CHAR(v_fecha,'YYYY-MM') || '-' || LPAD(NEW.id::TEXT,5,'0'),
          'I', v_concepto, '401.01', 0, v_subtotal, NEW.id, 'auto_sale');

  -- Abono a IVA trasladado
  IF v_iva > 0 THEN
    INSERT INTO accounting_journal (tenant_id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, sale_id, origen)
    VALUES (NEW.tenant_id, v_fecha, 'I-' || TO_CHAR(v_fecha,'YYYY-MM') || '-' || LPAD(NEW.id::TEXT,5,'0'),
            'I', v_concepto, '208.01', 0, v_iva, NEW.id, 'auto_sale');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_sale_insert ON sales;
CREATE TRIGGER trg_after_sale_insert AFTER INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_after_sale_insert_journal();

-- 5) Vista helper saldo por cuenta (balance de comprobación)
CREATE OR REPLACE VIEW v_accounting_balance AS
SELECT
  j.tenant_id,
  j.cuenta,
  a.nombre,
  a.naturaleza,
  SUM(j.debe) AS total_debe,
  SUM(j.haber) AS total_haber,
  SUM(j.debe) - SUM(j.haber) AS saldo
FROM accounting_journal j
LEFT JOIN accounting_accounts a ON a.codigo = j.cuenta AND (a.tenant_id = j.tenant_id OR a.tenant_id = 0)
GROUP BY j.tenant_id, j.cuenta, a.nombre, a.naturaleza;
