-- ============================================================================
-- R14_LOYALTY.sql — Programa de Lealtad Volvix POS
-- ----------------------------------------------------------------------------
-- Crea tablas de tiers, transacciones de puntos, extiende customers,
-- agrega función `recompute_customer_points` y trigger `after_sale_insert`.
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- 0. CUSTOMERS (si no existe en el esquema base)
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references volvix_tenants(id) on delete cascade,
  nombre          text not null,
  email           text,
  telefono        text,
  rfc             text,
  notas           text,
  activo          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists customers_tenant_idx on customers(tenant_id);
create index if not exists customers_email_idx  on customers(email);

-- ── Extender customers con campos de lealtad ────────────────────────────────
alter table customers
  add column if not exists loyalty_points  integer not null default 0,
  add column if not exists current_tier_id uuid,
  add column if not exists last_visit_at   timestamptz;

-- ============================================================================
-- 1. LOYALTY_TIERS — niveles configurables por tenant
-- ============================================================================
create table if not exists loyalty_tiers (
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
create index if not exists loyalty_tiers_tenant_idx
  on loyalty_tiers(tenant_id, min_points);

-- FK retrasada de customers.current_tier_id → loyalty_tiers.id
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_current_tier_fk'
  ) then
    alter table customers
      add constraint customers_current_tier_fk
      foreign key (current_tier_id) references loyalty_tiers(id) on delete set null;
  end if;
end$$;

-- ============================================================================
-- 2. LOYALTY_TRANSACTIONS — historial de puntos
-- ============================================================================
create table if not exists loyalty_transactions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references volvix_tenants(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  sale_id         uuid,                        -- volvix_ventas.id (sin FK dura)
  type            text not null check (type in ('earn','redeem','expire','adjust')),
  points          integer not null,            -- puede ser negativo (redeem/expire/adjust-)
  balance_after   integer not null,
  notes           text,
  ts              timestamptz not null default now()
);
create index if not exists loyalty_tx_customer_idx on loyalty_transactions(customer_id, ts desc);
create index if not exists loyalty_tx_sale_idx     on loyalty_transactions(sale_id);
create index if not exists loyalty_tx_tenant_idx   on loyalty_transactions(tenant_id, ts desc);

-- ============================================================================
-- 3. recompute_customer_points(customer_id) — recalcula desde el historial
-- ============================================================================
create or replace function recompute_customer_points(p_customer uuid)
returns integer
language plpgsql
as $$
declare
  v_total   integer;
  v_tier_id uuid;
  v_tenant  uuid;
begin
  select coalesce(sum(points), 0) into v_total
    from loyalty_transactions
   where customer_id = p_customer;

  select tenant_id into v_tenant from customers where id = p_customer;

  -- tier = el de mayor min_points ≤ total dentro del tenant
  select id into v_tier_id
    from loyalty_tiers
   where tenant_id = v_tenant
     and min_points <= v_total
   order by min_points desc
   limit 1;

  update customers
     set loyalty_points  = v_total,
         current_tier_id = v_tier_id,
         updated_at      = now()
   where id = p_customer;

  return v_total;
end;
$$;

-- ============================================================================
-- 4. Trigger after_sale_insert — devenga puntos automáticamente
-- ----------------------------------------------------------------------------
-- Convención: 1 punto por cada $1 (peso) del total, multiplicado por el
-- multiplier del tier actual del cliente. Se asume que volvix_ventas tiene
-- una columna `customer_id` (uuid). Si no existe, se agrega.
-- ============================================================================
alter table volvix_ventas
  add column if not exists customer_id uuid;

create or replace function loyalty_after_sale_insert()
returns trigger
language plpgsql
as $$
declare
  v_mult   numeric(5,2) := 1.00;
  v_points integer;
  v_bal    integer;
  v_tier   uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  -- multiplier según el tier vigente del cliente
  select t.multiplier, c.current_tier_id
    into v_mult, v_tier
    from customers c
    left join loyalty_tiers t on t.id = c.current_tier_id
   where c.id = new.customer_id;

  v_mult := coalesce(v_mult, 1.00);
  v_points := floor(coalesce(new.total, 0) * v_mult)::integer;

  if v_points <= 0 then
    return new;
  end if;

  select coalesce(loyalty_points, 0) + v_points into v_bal
    from customers where id = new.customer_id;

  insert into loyalty_transactions
    (tenant_id, customer_id, sale_id, type, points, balance_after, notes)
  values
    (new.tenant_id, new.customer_id, new.id, 'earn', v_points, v_bal,
     format('auto: total %s × mult %s', new.total, v_mult));

  update customers
     set loyalty_points = v_bal,
         last_visit_at  = now(),
         updated_at     = now()
   where id = new.customer_id;

  -- recompute para reasignar tier si subió de nivel
  perform recompute_customer_points(new.customer_id);

  return new;
end;
$$;

drop trigger if exists after_sale_insert on volvix_ventas;
create trigger after_sale_insert
  after insert on volvix_ventas
  for each row execute function loyalty_after_sale_insert();

-- ============================================================================
-- 5. SEED — tiers default para el tenant Demo (idempotente)
-- ============================================================================
insert into loyalty_tiers (tenant_id, name, min_points, multiplier, perks)
select t.id, x.name, x.min_points, x.mult, x.perks::jsonb
  from volvix_tenants t
  cross join (values
    ('Bronze',     0, 1.00, '["Acumula puntos en cada compra"]'),
    ('Silver',   500, 1.25, '["5% extra puntos","Promos exclusivas"]'),
    ('Gold',    1500, 1.50, '["10% descuento mensual","Soporte prioritario"]'),
    ('Platinum',5000, 2.00, '["20% descuento","Regalo de cumpleaños","VIP"]')
  ) as x(name, min_points, mult, perks)
 where t.nombre = 'Demo Volvix'
on conflict (tenant_id, name) do nothing;
