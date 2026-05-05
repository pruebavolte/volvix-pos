-- ============================================================================
-- R14_RETURNS.sql — Devoluciones / reembolsos
-- Idempotente.
-- ============================================================================
create table if not exists pos_returns (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  sale_id         uuid,
  user_id         uuid,
  items_returned  jsonb not null default '[]',
  refund_amount   numeric(14,2) not null default 0,
  refund_method   text default 'efectivo',
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','refunded')),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists pos_returns_tenant_idx on pos_returns(tenant_id, created_at desc);
create index if not exists pos_returns_sale_idx   on pos_returns(sale_id);
create index if not exists pos_returns_status_idx on pos_returns(status, created_at desc);
