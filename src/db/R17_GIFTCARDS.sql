-- ─── R17 — Gift Cards / Vales prepagados ──────────────────────────────────
-- Aplicar en Supabase Dashboard → SQL Editor.
-- Tabla principal de gift cards + tabla de redenciones por venta + generador de códigos.

create extension if not exists "pgcrypto";

-- ─── gift_cards ─────────────────────────────────────────────────────────────
create table if not exists public.gift_cards (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null default 'TNT001',
  code                text not null unique,
  initial_amount      numeric(14,2) not null check (initial_amount >= 0),
  current_balance     numeric(14,2) not null check (current_balance >= 0),
  currency            text not null default 'mxn',
  status              text not null default 'active'
                        check (status in ('active','redeemed','expired','canceled')),
  expires_at          timestamptz,
  sold_to_customer_id uuid,
  sold_in_sale_id     uuid,
  created_at          timestamptz not null default now()
);

-- Backfill columns if table existed with old shape
alter table public.gift_cards
  add column if not exists sold_in_sale_id uuid;

-- Relax old status check to include 'canceled'
do $$
begin
  begin
    alter table public.gift_cards drop constraint gift_cards_status_check;
  exception when undefined_object then null;
  end;
  alter table public.gift_cards
    add constraint gift_cards_status_check
    check (status in ('active','redeemed','expired','canceled'));
exception when others then null;
end $$;

create index if not exists gift_cards_tenant_idx     on public.gift_cards(tenant_id);
create index if not exists gift_cards_status_idx     on public.gift_cards(status);
create index if not exists gift_cards_customer_idx   on public.gift_cards(sold_to_customer_id);
create index if not exists gift_cards_expires_idx    on public.gift_cards(expires_at);
create index if not exists gift_cards_code_idx       on public.gift_cards(code);

-- ─── gift_card_uses ─────────────────────────────────────────────────────────
create table if not exists public.gift_card_uses (
  id            uuid primary key default gen_random_uuid(),
  gift_card_id  uuid not null references public.gift_cards(id) on delete cascade,
  sale_id       uuid,
  amount_used   numeric(14,2) not null check (amount_used > 0),
  used_at       timestamptz not null default now()
);

-- Backfill used_at on legacy schemas that used `ts`
alter table public.gift_card_uses
  add column if not exists used_at timestamptz not null default now();

create index if not exists gift_card_uses_card_idx on public.gift_card_uses(gift_card_id);
create index if not exists gift_card_uses_sale_idx on public.gift_card_uses(sale_id);
create index if not exists gift_card_uses_used_idx on public.gift_card_uses(used_at desc);

-- FK opcional a volvix_ventas (si existe la tabla)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='volvix_ventas') then
    begin
      alter table public.gift_card_uses
        add constraint gift_card_uses_sale_fk
        foreign key (sale_id) references public.volvix_ventas(id) on delete set null;
    exception when duplicate_object then null;
             when others then null;
    end;
  end if;
end $$;

-- ─── Generador de código formato VLX-XXXX-XXXX-XXXX ────────────────────────
create or replace function public.gift_card_generate_code()
returns text
language plpgsql
as $$
declare
  alphabet  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  segment   text;
  candidate text;
  attempt   int := 0;
begin
  loop
    attempt := attempt + 1;
    candidate := 'VLX';
    for s in 1..3 loop
      segment := '';
      for i in 1..4 loop
        segment := segment ||
          substr(alphabet,
                 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      candidate := candidate || '-' || segment;
    end loop;
    exit when not exists (select 1 from public.gift_cards where code = candidate);
    if attempt > 12 then
      raise exception 'gift_card_generate_code: too many collisions';
    end if;
  end loop;
  return candidate;
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.gift_cards     enable row level security;
alter table public.gift_card_uses enable row level security;

drop policy if exists gift_cards_read_authenticated on public.gift_cards;
create policy gift_cards_read_authenticated on public.gift_cards
  for select to authenticated using (true);

drop policy if exists gift_cards_write_service on public.gift_cards;
create policy gift_cards_write_service on public.gift_cards
  for all to service_role using (true) with check (true);

-- Lookup público por code (status + balance) lo resuelve el backend con service_role,
-- la policy de authenticated cubre lectura interna.

drop policy if exists gift_card_uses_read_authenticated on public.gift_card_uses;
create policy gift_card_uses_read_authenticated on public.gift_card_uses
  for select to authenticated using (true);

drop policy if exists gift_card_uses_write_service on public.gift_card_uses;
create policy gift_card_uses_write_service on public.gift_card_uses
  for all to service_role using (true) with check (true);
