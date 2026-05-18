-- R19 FIX: R14_LOYALTY.sql
-- Original error: column "tenant_id" does not exist
-- Cause: customers existing table no tiene tenant_id; ALTER TABLE add it.
-- (R19_PREFLIGHT.sql ya añade customers.tenant_id, pero lo reforzamos.)

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS customers_email_idx  ON customers(email);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS loyalty_points  integer not null default 0,
  ADD COLUMN IF NOT EXISTS current_tier_id uuid,
  ADD COLUMN IF NOT EXISTS last_visit_at   timestamptz;

-- Stub volvix_tenants si falta
CREATE TABLE IF NOT EXISTS public.volvix_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT 'Default',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references volvix_tenants(id) on delete cascade,
  name        text not null,
  min_points  integer not null default 0,
  multiplier  numeric(5,2) not null default 1.00,
  perks       jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS loyalty_tiers_tenant_idx
  ON loyalty_tiers(tenant_id, min_points);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_current_tier_fk'
  ) THEN
    BEGIN
      ALTER TABLE customers
        ADD CONSTRAINT customers_current_tier_fk
        FOREIGN KEY (current_tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references volvix_tenants(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  sale_id         uuid,
  type            text not null check (type in ('earn','redeem','expire','adjust')),
  points          integer not null,
  balance_after   integer not null,
  notes           text,
  ts              timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS loyalty_tx_customer_idx ON loyalty_transactions(customer_id, ts desc);
CREATE INDEX IF NOT EXISTS loyalty_tx_sale_idx     ON loyalty_transactions(sale_id);
CREATE INDEX IF NOT EXISTS loyalty_tx_tenant_idx   ON loyalty_transactions(tenant_id, ts desc);

CREATE OR REPLACE FUNCTION recompute_customer_points(p_customer uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_total integer; v_tier_id uuid; v_tenant uuid;
BEGIN
  SELECT coalesce(sum(points), 0) INTO v_total FROM loyalty_transactions WHERE customer_id = p_customer;
  SELECT tenant_id INTO v_tenant FROM customers WHERE id = p_customer;
  SELECT id INTO v_tier_id FROM loyalty_tiers
    WHERE tenant_id = v_tenant AND min_points <= v_total
    ORDER BY min_points DESC LIMIT 1;
  UPDATE customers SET loyalty_points = v_total, current_tier_id = v_tier_id, updated_at = now()
   WHERE id = p_customer;
  RETURN v_total;
END;
$$;

ALTER TABLE volvix_ventas
  ADD COLUMN IF NOT EXISTS customer_id uuid;

CREATE OR REPLACE FUNCTION loyalty_after_sale_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mult numeric(5,2) := 1.00; v_points integer; v_bal integer; v_tier uuid;
BEGIN
  IF new.customer_id IS NULL THEN RETURN new; END IF;
  SELECT t.multiplier, c.current_tier_id INTO v_mult, v_tier
    FROM customers c LEFT JOIN loyalty_tiers t ON t.id = c.current_tier_id
   WHERE c.id = new.customer_id;
  v_mult := coalesce(v_mult, 1.00);
  v_points := floor(coalesce(new.total, 0) * v_mult)::integer;
  IF v_points <= 0 THEN RETURN new; END IF;
  SELECT coalesce(loyalty_points, 0) + v_points INTO v_bal FROM customers WHERE id = new.customer_id;
  INSERT INTO loyalty_transactions (tenant_id, customer_id, sale_id, type, points, balance_after, notes)
    VALUES (new.tenant_id, new.customer_id, new.id, 'earn', v_points, v_bal,
            format('auto: total %s × mult %s', new.total, v_mult));
  UPDATE customers SET loyalty_points = v_bal, last_visit_at = now(), updated_at = now()
   WHERE id = new.customer_id;
  PERFORM recompute_customer_points(new.customer_id);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS after_sale_insert ON volvix_ventas;
CREATE TRIGGER after_sale_insert
  AFTER INSERT ON volvix_ventas
  FOR EACH ROW EXECUTE FUNCTION loyalty_after_sale_insert();

INSERT INTO loyalty_tiers (tenant_id, name, min_points, multiplier, perks)
SELECT t.id, x.name, x.min_points, x.mult, x.perks::jsonb
  FROM volvix_tenants t
  CROSS JOIN (VALUES
    ('Bronze',     0, 1.00, '["Acumula puntos en cada compra"]'),
    ('Silver',   500, 1.25, '["5% extra puntos","Promos exclusivas"]'),
    ('Gold',    1500, 1.50, '["10% descuento mensual","Soporte prioritario"]'),
    ('Platinum',5000, 2.00, '["20% descuento","Regalo de cumpleaños","VIP"]')
  ) AS x(name, min_points, mult, perks)
 WHERE t.nombre = 'Demo Volvix'
ON CONFLICT (tenant_id, name) DO NOTHING;
