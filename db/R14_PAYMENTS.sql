-- ─── R14 — Payments (Stripe + futuros providers) ───────────────────────────
-- Aplicar en Supabase Dashboard → SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid,
  provider              text not null,                       -- 'stripe', 'mercadopago', etc.
  provider_payment_id   text,                                -- ej: pi_xxx (Stripe PaymentIntent)
  status                text not null default 'pending',     -- pending|requires_action|processing|succeeded|failed|canceled
  amount_cents          bigint not null check (amount_cents >= 0),
  currency              text not null default 'mxn',
  raw                   jsonb,                               -- payload completo del provider (último estado)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists payments_sale_id_idx              on public.payments(sale_id);
create index if not exists payments_provider_payment_id_idx  on public.payments(provider, provider_payment_id);
create index if not exists payments_status_idx               on public.payments(status);
create index if not exists payments_created_at_idx           on public.payments(created_at desc);

-- updated_at trigger
create or replace function public.payments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.payments_set_updated_at();

-- FK opcional a volvix_ventas (si existe id uuid)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='volvix_ventas') then
    begin
      alter table public.payments
        add constraint payments_sale_fk
        foreign key (sale_id) references public.volvix_ventas(id) on delete set null;
    exception when duplicate_object then null;
             when others then null;
    end;
  end if;
end $$;

-- RLS
alter table public.payments enable row level security;

-- Service role bypass automático. Política de lectura para usuarios autenticados:
drop policy if exists payments_read_authenticated on public.payments;
create policy payments_read_authenticated on public.payments
  for select to authenticated using (true);

-- Inserciones/updates: solo service_role (server-side desde /api/payments/*)
drop policy if exists payments_write_service on public.payments;
create policy payments_write_service on public.payments
  for all to service_role using (true) with check (true);
