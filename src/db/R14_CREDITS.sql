-- ============================================================================
-- R14_CREDITS.sql — Créditos a clientes
-- Idempotente.
-- ============================================================================
create table if not exists pos_credits (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  customer_id  uuid,
  sale_id      uuid,
  amount       numeric(14,2) not null default 0,
  balance      numeric(14,2) not null default 0,
  due_date     date,
  status       text not null default 'active' check (status in ('active','paid','overdue')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pos_credits_tenant_idx   on pos_credits(tenant_id, created_at desc);
create index if not exists pos_credits_customer_idx on pos_credits(customer_id, status);
create index if not exists pos_credits_status_idx   on pos_credits(status, due_date);

create table if not exists pos_credit_payments (
  id          uuid primary key default gen_random_uuid(),
  credit_id   uuid not null,
  amount      numeric(14,2) not null,
  method      text default 'efectivo',
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists pos_credit_payments_credit_idx on pos_credit_payments(credit_id, created_at desc);
