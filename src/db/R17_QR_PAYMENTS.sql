-- ─── R17 — QR PAYMENTS (CoDi MX / SPEI MX / PIX BR) ────────────────────────
-- Aplicar en Supabase Dashboard → SQL Editor.
-- Tabla para registro de pagos vía código QR generados por la API.
--
-- Tipos soportados:
--   codi  → Cobro Digital Banxico (México)  — CLABE/cell, expira en 15 min
--   spei  → SPEI tradicional      (México)  — CLABE 18 dígitos
--   pix   → PIX BR-Code           (Brasil)  — EMV QR, ISO 4217 = 986
--
-- Estados: pending → paid | expired | failed | refunded

create extension if not exists "pgcrypto";

create table if not exists public.qr_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid,
  type          text not null check (type in ('codi','spei','pix')),
  amount        numeric(14,2) not null check (amount > 0),
  qr_data       text not null,                            -- string compliant del estándar local
  status        text not null default 'pending'           -- pending|paid|expired|failed|refunded
                check (status in ('pending','paid','expired','failed','refunded')),
  expires_at    timestamptz,
  paid_at       timestamptz,
  tenant_id     uuid,                                       -- slice 109: aislamiento multi-tenant
  provider      text default 'mock',                        -- slice 109: 'mock' | 'bbva' | otro
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists qr_payments_sale_idx    on public.qr_payments(sale_id);
create index if not exists qr_payments_type_idx    on public.qr_payments(type);
create index if not exists qr_payments_status_idx  on public.qr_payments(status);
create index if not exists qr_payments_expires_idx on public.qr_payments(expires_at) where status = 'pending';
create index if not exists qr_payments_created_idx on public.qr_payments(created_at desc);

-- updated_at trigger
create or replace function public.qr_payments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_qr_payments_updated_at on public.qr_payments;
create trigger trg_qr_payments_updated_at
  before update on public.qr_payments
  for each row execute function public.qr_payments_set_updated_at();

-- FK opcional a volvix_ventas (si existe)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='volvix_ventas') then
    begin
      alter table public.qr_payments
        add constraint qr_payments_sale_fk
        foreign key (sale_id) references public.volvix_ventas(id) on delete set null;
    exception when duplicate_object then null;
             when others then null;
    end;
  end if;
end $$;

-- RLS
alter table public.qr_payments enable row level security;

drop policy if exists qr_payments_read_authenticated on public.qr_payments;
create policy qr_payments_read_authenticated on public.qr_payments
  for select to authenticated using (true);

drop policy if exists qr_payments_write_service on public.qr_payments;
create policy qr_payments_write_service on public.qr_payments
  for all to service_role using (true) with check (true);

-- slice 109: política RLS adicional por tenant (cuando JWT incluya tenant_id)
drop policy if exists qr_payments_tenant_isolation on public.qr_payments;
create policy qr_payments_tenant_isolation on public.qr_payments
  for select to authenticated
  using (
    tenant_id is null
    or tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    or coalesce(auth.jwt() ->> 'role', '') in ('superadmin','admin')
  );

create index if not exists qr_payments_tenant_idx
  on public.qr_payments(tenant_id, status, created_at desc);
