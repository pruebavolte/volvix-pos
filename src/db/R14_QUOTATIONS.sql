-- ============================================================================
-- R14_QUOTATIONS.sql — Cotizaciones
-- Idempotente.
-- ============================================================================
create table if not exists pos_quotations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  customer_id   uuid,
  user_id       uuid,
  items         jsonb not null default '[]',
  subtotal      numeric(14,2) not null default 0,
  tax           numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  valid_until   date,
  status        text not null default 'draft'
                check (status in ('draft','sent','accepted','expired','converted')),
  converted_sale_id uuid,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pos_quotations_tenant_idx   on pos_quotations(tenant_id, created_at desc);
create index if not exists pos_quotations_customer_idx on pos_quotations(customer_id, created_at desc);
create index if not exists pos_quotations_status_idx   on pos_quotations(status, valid_until);
