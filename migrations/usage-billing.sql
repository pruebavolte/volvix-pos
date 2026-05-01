-- =============================================================
-- Volvix · Usage-Based Billing
-- =============================================================
-- Modelo: cuenta abierta gratis sin trial; se cobra cuando el
-- consumo real (ventas/productos/clientes/dias activos) excede
-- thresholds configurables por mes calendario.
-- =============================================================

-- Eventos brutos de uso (append-only, retención larga).
CREATE TABLE IF NOT EXISTS tenant_usage_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   text NOT NULL,
  event_type  text NOT NULL,          -- sale_created, product_added, customer_added, report_generated, daily_login
  quantity    int  DEFAULT 1,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tue_tenant_created
  ON tenant_usage_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tue_tenant_type_created
  ON tenant_usage_events (tenant_id, event_type, created_at DESC);

-- Resumen agregado por tenant + periodo (1 fila por mes).
CREATE TABLE IF NOT EXISTS tenant_usage_summary (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           text NOT NULL,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  sales_count         int  DEFAULT 0,
  products_count      int  DEFAULT 0,
  customers_count     int  DEFAULT 0,
  reports_count       int  DEFAULT 0,
  active_days         int  DEFAULT 0,
  threshold_reached   boolean DEFAULT false,
  requires_payment    boolean DEFAULT false,
  payment_due_date    date,
  paid_at             timestamptz,
  amount_due          numeric(12,2) DEFAULT 0,
  last_event_at       timestamptz,
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_tus_requires_payment
  ON tenant_usage_summary (requires_payment, period_start DESC)
  WHERE requires_payment = true;

CREATE INDEX IF NOT EXISTS idx_tus_tenant_period
  ON tenant_usage_summary (tenant_id, period_start DESC);

-- Overrides administrativos (regalar dias, free tier, lock/unlock, descuento).
CREATE TABLE IF NOT EXISTS tenant_billing_overrides (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   text NOT NULL,
  type        text NOT NULL,          -- 'extend_days' | 'free_tier' | 'discount_pct' | 'lock' | 'unlock' | 'mark_paid' | 'set_threshold'
  value       jsonb,
  reason      text,
  granted_by  uuid,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tbo_tenant_type_created
  ON tenant_billing_overrides (tenant_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tbo_tenant_active
  ON tenant_billing_overrides (tenant_id, created_at DESC)
  WHERE expires_at IS NULL OR expires_at > now();
