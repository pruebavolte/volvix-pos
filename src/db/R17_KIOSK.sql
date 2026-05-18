-- R17_KIOSK.sql
-- Modo Kiosko: punto de auto-servicio para clientes (sin login)
-- Fecha: 2026-04-26

BEGIN;

-- ============================================================
-- 1. kiosk_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS kiosk_devices (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT      NOT NULL,
  name          TEXT        NOT NULL,
  location      TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kiosk_devices_tenant_name_uk UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_dev_tenant ON kiosk_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_dev_active ON kiosk_devices(is_active) WHERE is_active = TRUE;

-- ============================================================
-- 2. kiosk_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS kiosk_orders (
  id          BIGSERIAL PRIMARY KEY,
  kiosk_id    BIGINT      NOT NULL REFERENCES kiosk_devices(id) ON DELETE RESTRICT,
  tenant_id   BIGINT      NOT NULL,
  items       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','confirmed','canceled')),
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment     TEXT        CHECK (payment IN ('card','cash','wallet') OR payment IS NULL),
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by BIGINT,
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT kiosk_orders_amount_chk CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_ord_kiosk     ON kiosk_orders(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_ord_tenant    ON kiosk_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_ord_status    ON kiosk_orders(status);
CREATE INDEX IF NOT EXISTS idx_kiosk_ord_ts        ON kiosk_orders(ts DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_ord_pending   ON kiosk_orders(tenant_id, ts DESC)
  WHERE status = 'pending';

-- RLS opcional (alineado con R13)
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_orders  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_kiosk_dev_tenant_rw ON kiosk_devices;
CREATE POLICY p_kiosk_dev_tenant_rw ON kiosk_devices
  USING (tenant_id = COALESCE(current_setting('app.tenant_id', true)::BIGINT, tenant_id));

DROP POLICY IF EXISTS p_kiosk_ord_tenant_rw ON kiosk_orders;
CREATE POLICY p_kiosk_ord_tenant_rw ON kiosk_orders
  USING (tenant_id = COALESCE(current_setting('app.tenant_id', true)::BIGINT, tenant_id));

COMMIT;
