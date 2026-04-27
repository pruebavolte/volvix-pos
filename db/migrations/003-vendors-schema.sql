-- ============================================================
-- B3 — Vendor portal: schema + seed idempotente
-- ============================================================
-- Tablas:
--   vendors                 — proveedor (1:1 con pos_users.role='vendor')
--   vendor_purchase_orders  — POs emitidas por tenants a un vendor
-- Idempotente: CREATE IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.volvix_vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES public.pos_users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  legal_name    text,
  rfc           text,
  contact_email text,
  contact_phone text,
  tier          text DEFAULT 'standard',
  verified      boolean DEFAULT false,
  payment_terms text DEFAULT '30 dias netos',
  bank_account  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_volvix_vendors_user ON public.volvix_vendors(user_id);

CREATE TABLE IF NOT EXISTS public.volvix_vendor_pos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       text UNIQUE NOT NULL,
  vendor_id       uuid REFERENCES public.volvix_vendors(id) ON DELETE CASCADE,
  buyer_company_id uuid REFERENCES public.pos_companies(id) ON DELETE SET NULL,
  buyer_name      text,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending',
  status_label    text,
  delivery_date   date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vvpo_vendor_id ON public.volvix_vendor_pos(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vvpo_status   ON public.volvix_vendor_pos(status);

-- RLS hardening (igual que B1)
ALTER TABLE public.volvix_vendors ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.volvix_vendors FROM anon;

ALTER TABLE public.volvix_vendor_pos ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.volvix_vendor_pos FROM anon;

-- ─── SEED idempotente ───
-- vendor_1 = admin@volvix.test (USER_A)
INSERT INTO public.volvix_vendors (id, user_id, name, legal_name, rfc, contact_email, tier, verified, payment_terms, bank_account)
VALUES
  ('11110000-1111-1111-1111-aaaaaaaaaaa1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Distribuidora Don Chucho',
   'Distribuidora Don Chucho SA de CV',
   'DCH940101AB1',
   'admin@volvix.test',
   'gold',
   true,
   '30 dias netos',
   'BBVA · ****4521'),
  ('22220000-2222-2222-2222-bbbbbbbbbbb1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'Proveedora Los Compadres',
   'Proveedora Los Compadres SA de CV',
   'LCM950505XY3',
   'owner@volvix.test',
   'standard',
   false,
   '15 dias netos',
   'Santander · ****8814')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  legal_name = EXCLUDED.legal_name,
  contact_email = EXCLUDED.contact_email,
  tier = EXCLUDED.tier,
  verified = EXCLUDED.verified,
  updated_at = now();

-- POs de vendor_1 (Don Chucho)
INSERT INTO public.volvix_vendor_pos (po_number, vendor_id, buyer_company_id, buyer_name, amount, status, status_label, delivery_date)
VALUES
  ('PO-2026-V1-001', '11110000-1111-1111-1111-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Sucursal Norte',  24580.00, 'pending',   'Pendiente',  CURRENT_DATE + 1),
  ('PO-2026-V1-002', '11110000-1111-1111-1111-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Sucursal Centro',  8140.50, 'transit',   'En tránsito', CURRENT_DATE - 1),
  ('PO-2026-V1-003', '11110000-1111-1111-1111-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Sucursal Sur',    15920.00, 'delivered', 'Entregado',  CURRENT_DATE - 3),
  ('PO-2026-V1-004', '11110000-1111-1111-1111-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'CEDIS',           62300.00, 'invoiced',  'Facturado',  CURRENT_DATE - 5),
  ('PO-2026-V1-005', '11110000-1111-1111-1111-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Sucursal Norte',   3210.75, 'rejected',  'Rechazado',  CURRENT_DATE - 6)
ON CONFLICT (po_number) DO UPDATE SET
  amount = EXCLUDED.amount, status = EXCLUDED.status, status_label = EXCLUDED.status_label, updated_at = now();

-- POs de vendor_2 (Los Compadres) — solo 2 POs distintas
INSERT INTO public.volvix_vendor_pos (po_number, vendor_id, buyer_company_id, buyer_name, amount, status, status_label, delivery_date)
VALUES
  ('PO-2026-V2-001', '22220000-2222-2222-2222-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'Restaurante Centro', 5300.00, 'pending', 'Pendiente', CURRENT_DATE + 2),
  ('PO-2026-V2-002', '22220000-2222-2222-2222-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'Cocina principal',   1850.50, 'delivered', 'Entregado', CURRENT_DATE - 2)
ON CONFLICT (po_number) DO UPDATE SET
  amount = EXCLUDED.amount, status = EXCLUDED.status, updated_at = now();
