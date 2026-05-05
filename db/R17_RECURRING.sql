-- ─── R17 — Customer Recurring Subscriptions ──────────────────────────────────
-- Aplicar en Supabase Dashboard → SQL Editor
-- Suscripciones recurrentes para clientes (membresía gym, café mensual, etc).
-- Genera ventas periódicas vía cron / endpoint admin.

create extension if not exists "pgcrypto";

-- ─── Plan de suscripción del cliente ──────────────────────────────────────────
create table if not exists public.customer_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null,
  tenant_id       uuid not null,
  plan_name       text not null,
  amount          numeric(12,2) not null check (amount >= 0),
  currency        text not null default 'mxn',
  interval        text not null check (interval in ('weekly','monthly','yearly')),
  status          text not null default 'active'
                  check (status in ('active','paused','canceled','expired')),
  next_charge_at  timestamptz not null,
  started_at      timestamptz not null default now(),
  canceled_at     timestamptz,
  stripe_sub_id   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists customer_subs_customer_idx  on public.customer_subscriptions(customer_id);
create index if not exists customer_subs_tenant_idx    on public.customer_subscriptions(tenant_id);
create index if not exists customer_subs_status_idx    on public.customer_subscriptions(status);
create index if not exists customer_subs_next_idx      on public.customer_subscriptions(next_charge_at)
  where status = 'active';

-- ─── Histórico de cargos ──────────────────────────────────────────────────────
create table if not exists public.subscription_charges (
  id          uuid primary key default gen_random_uuid(),
  sub_id      uuid not null references public.customer_subscriptions(id) on delete cascade,
  sale_id     uuid,
  amount      numeric(12,2) not null,
  charged_at  timestamptz not null default now(),
  status      text not null default 'success'
              check (status in ('success','failed','pending','refunded')),
  error_msg   text,
  created_at  timestamptz not null default now()
);

create index if not exists sub_charges_sub_idx     on public.subscription_charges(sub_id);
create index if not exists sub_charges_sale_idx    on public.subscription_charges(sale_id);
create index if not exists sub_charges_charged_idx on public.subscription_charges(charged_at desc);

-- ─── Trigger updated_at ───────────────────────────────────────────────────────
create or replace function public.customer_subs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists customer_subs_updated_at on public.customer_subscriptions;
create trigger customer_subs_updated_at
  before update on public.customer_subscriptions
  for each row execute function public.customer_subs_set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.customer_subscriptions enable row level security;
alter table public.subscription_charges    enable row level security;

drop policy if exists customer_subs_tenant_rw on public.customer_subscriptions;
create policy customer_subs_tenant_rw on public.customer_subscriptions
  for all using (true) with check (true);

drop policy if exists sub_charges_rw on public.subscription_charges;
create policy sub_charges_rw on public.subscription_charges
  for all using (true) with check (true);
