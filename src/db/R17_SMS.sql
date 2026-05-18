-- ============================================================
-- R17 · SMS LOG (Twilio)
-- Auditoria de envios SMS transaccionales
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.sms_log (
  id          uuid primary key default gen_random_uuid(),
  to_phone    text,
  body        text,
  status      text not null default 'queued'
              check (status in ('sent','failed','queued')),
  twilio_sid  text,
  error       text,
  sent_at     timestamptz not null default now(),
  tenant_id   uuid
);

-- Indice principal: consulta por fecha desc + status
create index if not exists idx_sms_log_sent_at_status
  on public.sms_log (sent_at desc, status);

-- Indices auxiliares
create index if not exists idx_sms_log_to_phone
  on public.sms_log (to_phone);
create index if not exists idx_sms_log_tenant
  on public.sms_log (tenant_id);
create index if not exists idx_sms_log_twilio_sid
  on public.sms_log (twilio_sid);

-- ============================================================
-- ROW LEVEL SECURITY: solo admin/superadmin/owner del tenant
-- ============================================================
alter table public.sms_log enable row level security;

-- Service role (API backend) hace bypass automatico de RLS.
-- Las policies abajo aplican a usuarios autenticados via JWT cliente.

drop policy if exists sms_log_admin_select on public.sms_log;
create policy sms_log_admin_select
  on public.sms_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pos_users u
      where u.id = auth.uid()
        and u.role in ('ADMIN','SUPERADMIN','OWNER')
        and (sms_log.tenant_id is null or sms_log.tenant_id = u.tenant_id)
    )
  );

drop policy if exists sms_log_admin_insert on public.sms_log;
create policy sms_log_admin_insert
  on public.sms_log
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
drop policy if exists sms_log_no_update on public.sms_log;
drop policy if exists sms_log_no_delete on public.sms_log;

comment on table public.sms_log is
  'R17: Audit log de SMS transaccionales enviados via Twilio. RLS admin-only.';
