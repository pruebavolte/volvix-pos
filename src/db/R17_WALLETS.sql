-- ─── R17 — Wallet Payments (Apple Pay / Google Pay / Stripe wallets) ───────
-- Aplicar en Supabase Dashboard → SQL Editor
-- Tabla específica para tokens de pago vía wallets digitales (Web Payment Request API).
-- Stripe enruta Apple/Google Pay hacia PaymentIntents normales; aquí guardamos el token
-- crudo del wallet por si el backend necesita re-confirmar o auditar.

create extension if not exists "pgcrypto";

create table if not exists public.wallet_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid,
  provider      text not null check (provider in ('apple','google','stripe')),
  token_data    jsonb,                                  -- token cifrado del wallet (apple payment.token / google paymentMethodData)
  status        text not null default 'pending',        -- pending|authorized|captured|failed|refunded
  amount_cents  bigint not null check (amount_cents >= 0),
  currency      text not null default 'mxn',
  ts            timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists wallet_payments_sale_idx       on public.wallet_payments(sale_id);
create index if not exists wallet_payments_provider_idx   on public.wallet_payments(provider);
create index if not exists wallet_payments_status_idx     on public.wallet_payments(status);
create index if not exists wallet_payments_ts_idx         on public.wallet_payments(ts desc);

-- updated_at trigger
create or replace function public.wallet_payments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_wallet_payments_updated_at on public.wallet_payments;
create trigger trg_wallet_payments_updated_at
  before update on public.wallet_payments
  for each row execute function public.wallet_payments_set_updated_at();

-- FK opcional a volvix_ventas
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='volvix_ventas') then
    begin
      alter table public.wallet_payments
        add constraint wallet_payments_sale_fk
        foreign key (sale_id) references public.volvix_ventas(id) on delete set null;
    exception when duplicate_object then null;
             when others then null;
    end;
  end if;
end $$;

-- RLS
alter table public.wallet_payments enable row level security;

drop policy if exists wallet_payments_read_authenticated on public.wallet_payments;
create policy wallet_payments_read_authenticated on public.wallet_payments
  for select to authenticated using (true);

drop policy if exists wallet_payments_write_service on public.wallet_payments;
create policy wallet_payments_write_service on public.wallet_payments
  for all to service_role using (true) with check (true);
