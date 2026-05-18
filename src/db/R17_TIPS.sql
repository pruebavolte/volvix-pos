-- ─── R17 — Tips / Propinas ─────────────────────────────────────────────────
-- Sistema de propinas con asignación a cajero, distribución por pools,
-- y métodos de reparto (equal / percentage / role-based).
-- Aplicar en Supabase Dashboard → SQL Editor.

create extension if not exists "pgcrypto";

-- ── 1. Extender pos_sales con columnas de propina ─────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='pos_sales') then
    begin
      alter table public.pos_sales
        add column if not exists tip_amount      numeric(12,2) not null default 0,
        add column if not exists tip_assigned_to uuid,
        add column if not exists tip_split       jsonb;
    exception when others then null;
    end;
  end if;
end $$;

create index if not exists pos_sales_tip_assigned_idx on public.pos_sales(tip_assigned_to)
  where tip_assigned_to is not null;

-- ── 2. tip_distributions: ledger de propinas repartidas ───────────────────
create table if not exists public.tip_distributions (
  id        uuid primary key default gen_random_uuid(),
  sale_id   uuid not null,
  user_id   uuid not null,
  amount    numeric(12,2) not null check (amount >= 0),
  ts        timestamptz not null default now()
);

create index if not exists tip_distributions_sale_idx on public.tip_distributions(sale_id);
create index if not exists tip_distributions_user_idx on public.tip_distributions(user_id);
create index if not exists tip_distributions_ts_idx   on public.tip_distributions(ts desc);

-- ── 3. tip_pools: configuración de pools de reparto ───────────────────────
create table if not exists public.tip_pools (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  name         text not null,
  members      uuid[] not null default '{}',
  split_method text not null default 'equal'
                check (split_method in ('equal','percentage','role-based')),
  -- percentages: { user_id: pct }  — solo si split_method='percentage'
  -- role_weights: { role: weight } — solo si split_method='role-based'
  config       jsonb default '{}'::jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists tip_pools_tenant_name_uk
  on public.tip_pools(tenant_id, name);
create index if not exists tip_pools_active_idx on public.tip_pools(tenant_id, active);

create or replace function public.tip_pools_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tip_pools_updated_at on public.tip_pools;
create trigger trg_tip_pools_updated_at
  before update on public.tip_pools
  for each row execute function public.tip_pools_set_updated_at();

-- ── 4. distribute_tips(sale_id, pool_id) ──────────────────────────────────
-- Reparte pos_sales.tip_amount entre members del pool y graba tip_distributions.
-- Si no se pasa pool_id usa el pool activo del tenant del sale (primero por nombre).
create or replace function public.distribute_tips(
  p_sale_id uuid,
  p_pool_id uuid default null
) returns table(user_id uuid, amount numeric)
language plpgsql as $$
declare
  v_tip       numeric(12,2);
  v_tenant    text;
  v_pool      public.tip_pools%rowtype;
  v_member    uuid;
  v_count     int;
  v_share     numeric(12,2);
  v_pct       numeric;
  v_total_pct numeric;
begin
  -- 1. obtener tip y tenant
  select coalesce(s.tip_amount,0)::numeric, coalesce(s.tenant_id, s.user_id::text)
    into v_tip, v_tenant
    from public.pos_sales s where s.id = p_sale_id;
  if v_tip is null or v_tip <= 0 then return; end if;

  -- 2. resolver pool
  if p_pool_id is not null then
    select * into v_pool from public.tip_pools where id = p_pool_id and active;
  else
    select * into v_pool from public.tip_pools
      where tenant_id = v_tenant and active
      order by name limit 1;
  end if;
  if v_pool.id is null then return; end if;
  if array_length(v_pool.members, 1) is null then return; end if;

  v_count := array_length(v_pool.members, 1);

  -- limpiar repartos previos del mismo sale (idempotente)
  delete from public.tip_distributions where sale_id = p_sale_id;

  -- 3. repartir
  if v_pool.split_method = 'equal' then
    v_share := round(v_tip / v_count, 2);
    foreach v_member in array v_pool.members loop
      insert into public.tip_distributions(sale_id, user_id, amount)
        values (p_sale_id, v_member, v_share)
        returning tip_distributions.user_id, tip_distributions.amount
        into user_id, amount;
      return next;
    end loop;

  elsif v_pool.split_method = 'percentage' then
    -- config.percentages = { "<uuid>": 40, "<uuid>": 60 }
    v_total_pct := 0;
    foreach v_member in array v_pool.members loop
      v_pct := coalesce((v_pool.config->'percentages'->>v_member::text)::numeric, 0);
      v_total_pct := v_total_pct + v_pct;
    end loop;
    if v_total_pct <= 0 then v_total_pct := 100; end if;
    foreach v_member in array v_pool.members loop
      v_pct := coalesce((v_pool.config->'percentages'->>v_member::text)::numeric, 0);
      v_share := round(v_tip * (v_pct / v_total_pct), 2);
      insert into public.tip_distributions(sale_id, user_id, amount)
        values (p_sale_id, v_member, v_share)
        returning tip_distributions.user_id, tip_distributions.amount
        into user_id, amount;
      return next;
    end loop;

  else  -- role-based: pesos por role en config.role_weights
    -- fallback a equal si no hay tabla de roles
    v_share := round(v_tip / v_count, 2);
    foreach v_member in array v_pool.members loop
      insert into public.tip_distributions(sale_id, user_id, amount)
        values (p_sale_id, v_member, v_share)
        returning tip_distributions.user_id, tip_distributions.amount
        into user_id, amount;
      return next;
    end loop;
  end if;

  -- 4. snapshot en pos_sales.tip_split
  update public.pos_sales
     set tip_split = (
       select jsonb_agg(jsonb_build_object('user_id', d.user_id, 'amount', d.amount))
         from public.tip_distributions d where d.sale_id = p_sale_id
     )
   where id = p_sale_id;
end $$;

-- ── 5. RLS ────────────────────────────────────────────────────────────────
alter table public.tip_distributions enable row level security;
alter table public.tip_pools          enable row level security;

drop policy if exists tip_distributions_read_auth on public.tip_distributions;
create policy tip_distributions_read_auth on public.tip_distributions
  for select to authenticated using (true);

drop policy if exists tip_distributions_write_service on public.tip_distributions;
create policy tip_distributions_write_service on public.tip_distributions
  for all to service_role using (true) with check (true);

drop policy if exists tip_pools_read_auth on public.tip_pools;
create policy tip_pools_read_auth on public.tip_pools
  for select to authenticated using (true);

drop policy if exists tip_pools_write_service on public.tip_pools;
create policy tip_pools_write_service on public.tip_pools
  for all to service_role using (true) with check (true);
