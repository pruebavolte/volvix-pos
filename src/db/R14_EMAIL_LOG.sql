-- ============================================================
-- R14 · EMAIL LOG
-- Auditoria de envios transaccionales (SendGrid)
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  to_email     text,
  subject      text,
  template     text,
  status       text not null check (status in ('sent','failed','queued')),
  provider_id  text,
  error        text
);

-- Indice principal: consulta por fecha desc + status
create index if not exists idx_email_log_ts_status
  on public.email_log (ts desc, status);

-- Indices auxiliares utiles
create index if not exists idx_email_log_to
  on public.email_log (to_email);
create index if not exists idx_email_log_template
  on public.email_log (template);

-- ============================================================
-- ROW LEVEL SECURITY: solo admin/superadmin/owner
-- ============================================================
alter table public.email_log enable row level security;

-- Service role (API backend) hace bypass automatico de RLS.
-- Las policies abajo aplican a usuarios autenticados via JWT cliente.

drop policy if exists email_log_admin_select on public.email_log;
create policy email_log_admin_select
  on public.email_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

drop policy if exists email_log_admin_insert on public.email_log;
create policy email_log_admin_insert
  on public.email_log
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
    )
  );

-- update / delete: bloqueado para clientes (solo service role).
drop policy if exists email_log_no_update on public.email_log;
drop policy if exists email_log_no_delete on public.email_log;

comment on table public.email_log is
  'R14: Audit log de emails transaccionales enviados via SendGrid. RLS admin-only.';
