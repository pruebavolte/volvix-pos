-- B39 Migration: Tables for Notifications + Pending Sales + MultiPOS modules
-- All tenant_id TEXT to match JWT format ("TNT001"), idempotent

BEGIN;

-- ============================================================
-- 1. NOTIFICATIONS (from Agent M — SalvadoreX bell)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id UUID,                         -- target user (null = tenant-wide)
  title TEXT NOT NULL,
  body TEXT,
  level TEXT CHECK (level IN ('info','warn','error','success')) DEFAULT 'info',
  url TEXT,                              -- click target
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_iso_read ON notifications;
DROP POLICY IF EXISTS notif_iso_write ON notifications;
CREATE POLICY notif_iso_read ON notifications FOR SELECT
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE POLICY notif_iso_write ON notifications FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_notif_tenant_user ON notifications(tenant_id, user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(tenant_id, created_at DESC);

-- ============================================================
-- 2. PENDING SALES (Agent M — venta pendiente F6)
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id UUID,                          -- cashier who saved it
  reference TEXT,                        -- human-readable code (PND-001)
  items JSONB,                           -- cart items
  customer_id UUID,
  customer_name TEXT,
  total NUMERIC(12,2),
  notes TEXT,
  expires_at TIMESTAMPTZ,                -- auto-cleanup after 7 days
  restored_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pending_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pendsales_iso_read ON pending_sales;
DROP POLICY IF EXISTS pendsales_iso_write ON pending_sales;
CREATE POLICY pendsales_iso_read ON pending_sales FOR SELECT
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE POLICY pendsales_iso_write ON pending_sales FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_pendsales_tenant ON pending_sales(tenant_id, restored_at, cancelled_at);

-- ============================================================
-- 3. RESERVATIONS (Agent L — Comandera/MultiPOS)
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_id UUID,
  party_size INTEGER NOT NULL DEFAULT 1,
  table_id UUID,
  table_label TEXT,
  reserved_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 90,
  status TEXT CHECK (status IN ('pending','confirmed','seated','no-show','cancelled')) DEFAULT 'pending',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reserv_iso_read ON reservations;
DROP POLICY IF EXISTS reserv_iso_write ON reservations;
CREATE POLICY reserv_iso_read ON reservations FOR SELECT
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE POLICY reserv_iso_write ON reservations FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_reserv_tenant_when ON reservations(tenant_id, reserved_at);
CREATE INDEX IF NOT EXISTS idx_reserv_status ON reservations(tenant_id, status);

-- ============================================================
-- 4. KITCHEN ORDERS (Agent L — KDS)
-- ============================================================
CREATE TABLE IF NOT EXISTS kitchen_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sale_id UUID,
  table_id UUID,
  table_label TEXT,
  station TEXT,                          -- 'cocina','barra','postres'
  items JSONB NOT NULL,                  -- [{name, qty, modifiers, notes}]
  status TEXT CHECK (status IN ('pending','preparing','ready','served','cancelled')) DEFAULT 'pending',
  priority INTEGER DEFAULT 0,            -- 0=normal, 1=urgent
  notes TEXT,
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kitchen_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kitch_iso_read ON kitchen_orders;
DROP POLICY IF EXISTS kitch_iso_write ON kitchen_orders;
CREATE POLICY kitch_iso_read ON kitchen_orders FOR SELECT
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE POLICY kitch_iso_write ON kitchen_orders FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_kitch_tenant_status ON kitchen_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_kitch_station ON kitchen_orders(tenant_id, station, status);

-- ============================================================
-- 5. KITCHEN NOTIFICATIONS (Agent L — notify-waiter)
-- ============================================================
CREATE TABLE IF NOT EXISTS kitchen_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  order_id UUID,
  type TEXT CHECK (type IN ('ready','delayed','urgent','cancelled')),
  message TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kitchen_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kitchnotif_iso ON kitchen_notifications;
CREATE POLICY kitchnotif_iso ON kitchen_notifications FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_kitchnotif_tenant ON kitchen_notifications(tenant_id, acknowledged_at);

-- ============================================================
-- 6. DEVICE PAIRINGS (Agent L — KDS/CDS pairing)
-- ============================================================
CREATE TABLE IF NOT EXISTS device_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('kds','cds','printer','scanner')),
  device_name TEXT,
  pair_code TEXT NOT NULL,               -- 6-digit code shown to user
  station TEXT,
  paired_by UUID,
  paired_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  unpaired_at TIMESTAMPTZ,
  metadata JSONB
);
ALTER TABLE device_pairings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devpair_iso ON device_pairings;
CREATE POLICY devpair_iso ON device_pairings FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_devpair_code ON device_pairings(pair_code) WHERE unpaired_at IS NULL;

-- ============================================================
-- 7. PRINTERS REGISTRY (Agent L — POS printers list)
-- ============================================================
CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('thermal','laser','inkjet','label')) DEFAULT 'thermal',
  station TEXT,                          -- 'cobranza','cocina','barra'
  ip_address TEXT,
  port INTEGER,
  paper_width_mm INTEGER DEFAULT 58,
  enabled BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE printers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS print_iso ON printers;
CREATE POLICY print_iso ON printers FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));

-- ============================================================
-- 8. PURCHASE ORDERS (Agent L — manager mp purchases)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  vendor_id UUID,
  vendor_name TEXT,
  reference TEXT,                        -- PO-2026-001
  items JSONB,                           -- [{product, qty, unit_cost}]
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  total NUMERIC(12,2),
  status TEXT CHECK (status IN ('draft','sent','partial','received','cancelled')) DEFAULT 'draft',
  expected_date DATE,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS po_iso ON purchase_orders;
CREATE POLICY po_iso ON purchase_orders FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), ''));
CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON purchase_orders(tenant_id, status);

COMMIT;
