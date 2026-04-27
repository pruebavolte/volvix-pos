-- ─── R18 — Nómina Mexicana (CFDI 4.0 Nómina) ─────────────────────────────
-- Empleados, periodos de nómina y recibos timbrados con ISR + IMSS.
-- Aplicar en Supabase Dashboard → SQL Editor.

create extension if not exists "pgcrypto";

-- ── 1. employees ──────────────────────────────────────────────────────────
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  rfc           text not null,
  curp          text,
  nss           text,
  name          text not null,
  email         text,
  salary_daily  numeric(12,2) not null check (salary_daily >= 0),
  position      text,
  hire_date     date not null default current_date,
  status        text not null default 'active'
                check (status in ('active','suspended','terminated')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists employees_tenant_rfc_uk
  on public.employees(tenant_id, rfc);
create index if not exists employees_tenant_status_idx
  on public.employees(tenant_id, status);

-- ── 2. payroll_periods ────────────────────────────────────────────────────
create table if not exists public.payroll_periods (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  period_start date not null,
  period_end   date not null,
  type         text not null check (type in ('weekly','biweekly','monthly')),
  status       text not null default 'draft'
                check (status in ('draft','calculated','stamped','paid')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists payroll_periods_tenant_idx
  on public.payroll_periods(tenant_id, period_start desc);
create index if not exists payroll_periods_status_idx
  on public.payroll_periods(tenant_id, status);

-- ── 3. payroll_receipts ───────────────────────────────────────────────────
create table if not exists public.payroll_receipts (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete restrict,
  gross            numeric(12,2) not null default 0 check (gross >= 0),
  isr              numeric(12,2) not null default 0 check (isr >= 0),
  imss             numeric(12,2) not null default 0 check (imss >= 0),
  deductions       jsonb not null default '{}'::jsonb,
  net              numeric(12,2) not null default 0,
  cfdi_nomina_uuid text,
  xml              text,
  status           text not null default 'pending'
                    check (status in ('pending','calculated','stamped','paid','cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists payroll_receipts_period_emp_uk
  on public.payroll_receipts(period_id, employee_id);
create index if not exists payroll_receipts_emp_idx
  on public.payroll_receipts(employee_id);
create index if not exists payroll_receipts_uuid_idx
  on public.payroll_receipts(cfdi_nomina_uuid)
  where cfdi_nomina_uuid is not null;

-- ── 4. updated_at triggers ────────────────────────────────────────────────
create or replace function public.payroll_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at before update on public.employees
  for each row execute function public.payroll_set_updated_at();

drop trigger if exists trg_payroll_periods_updated_at on public.payroll_periods;
create trigger trg_payroll_periods_updated_at before update on public.payroll_periods
  for each row execute function public.payroll_set_updated_at();

drop trigger if exists trg_payroll_receipts_updated_at on public.payroll_receipts;
create trigger trg_payroll_receipts_updated_at before update on public.payroll_receipts
  for each row execute function public.payroll_set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────
alter table public.employees         enable row level security;
alter table public.payroll_periods   enable row level security;
alter table public.payroll_receipts  enable row level security;

drop policy if exists employees_read_auth on public.employees;
create policy employees_read_auth on public.employees
  for select to authenticated using (true);
drop policy if exists employees_write_service on public.employees;
create policy employees_write_service on public.employees
  for all to service_role using (true) with check (true);

drop policy if exists payroll_periods_read_auth on public.payroll_periods;
create policy payroll_periods_read_auth on public.payroll_periods
  for select to authenticated using (true);
drop policy if exists payroll_periods_write_service on public.payroll_periods;
create policy payroll_periods_write_service on public.payroll_periods
  for all to service_role using (true) with check (true);

drop policy if exists payroll_receipts_read_auth on public.payroll_receipts;
create policy payroll_receipts_read_auth on public.payroll_receipts
  for select to authenticated using (true);
drop policy if exists payroll_receipts_write_service on public.payroll_receipts;
create policy payroll_receipts_write_service on public.payroll_receipts
  for all to service_role using (true) with check (true);
