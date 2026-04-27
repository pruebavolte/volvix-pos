-- ============================================================================
-- R14_CASH_SESSIONS.sql — Apertura/Corte de caja
-- Idempotente.
-- ============================================================================
create table if not exists pos_cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  user_id         uuid,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opening_amount  numeric(14,2) not null default 0,
  closing_amount  numeric(14,2),
  expected        numeric(14,2),
  actual          numeric(14,2),
  variance        numeric(14,2),
  status          text not null default 'open' check (status in ('open','closed')),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists pos_cash_sessions_tenant_idx on pos_cash_sessions(tenant_id, opened_at desc);
create index if not exists pos_cash_sessions_user_idx   on pos_cash_sessions(user_id, opened_at desc);
create index if not exists pos_cash_sessions_status_idx on pos_cash_sessions(tenant_id, status);
