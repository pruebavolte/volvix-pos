-- ============================================================================
-- R8a — HARDWARE RESILIENCE (Round 8a — Hardware/Conectividad)
-- Idempotente. 5 fixes:
-- ============================================================================
--   FIX-H1: localStorage cart draft + recovery (NO requiere DB)
--   FIX-H2: offline banner + queue counter (NO requiere DB)
--   FIX-H3: manual search fallback (audit en pos_audit_log existente)
--   FIX-H4: pos_print_log (sale_id, event, user_id, ts, error_msg, is_copy)
--   FIX-H5: pos_drawer_log + ALTER pos_users ADD drawer_pin_hash
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r8a-hardware-resilience.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- FIX-H4: pos_print_log
-- Cada intento/reimpresión/fallo de ticket queda registrado.
-- ---------------------------------------------------------------------------
create table if not exists pos_print_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  sale_id text,
  event text not null,        -- 'printed' | 'reprint' | 'failed' | 'retry'
  user_id text,
  cashier_email text,
  ts timestamptz not null default now(),
  error_msg text,
  is_copy boolean not null default false,
  attempt int not null default 1,
  printer_id text,
  reason text,
  ip_addr text,
  user_agent text,
  meta jsonb default '{}'::jsonb
);

create index if not exists pos_print_log_tenant_ts_idx
  on pos_print_log(tenant_id, ts desc);
create index if not exists pos_print_log_sale_idx
  on pos_print_log(sale_id);
create index if not exists pos_print_log_event_idx
  on pos_print_log(tenant_id, event, ts desc);

-- RLS por tenant
alter table pos_print_log enable row level security;

do $$
begin
  begin drop policy if exists pos_print_log_tenant_iso_select on pos_print_log; exception when others then null; end;
  begin drop policy if exists pos_print_log_tenant_iso_insert on pos_print_log; exception when others then null; end;
  begin drop policy if exists pos_print_log_tenant_iso_update on pos_print_log; exception when others then null; end;
  begin drop policy if exists pos_print_log_tenant_iso_delete on pos_print_log; exception when others then null; end;
end $$;

create policy pos_print_log_tenant_iso_select
  on pos_print_log for select
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_print_log_tenant_iso_insert
  on pos_print_log for insert
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_print_log_tenant_iso_update
  on pos_print_log for update
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  )
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_print_log_tenant_iso_delete
  on pos_print_log for delete
  using (
    (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

-- check on event
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_print_log_event_check'
  ) then
    alter table pos_print_log
      add constraint pos_print_log_event_check
      check (event in ('printed','reprint','failed','retry','queued'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FIX-H5a: pos_drawer_log
-- Cada intento de apertura del cajón (auto/manual/cancelado) queda registrado.
-- ---------------------------------------------------------------------------
create table if not exists pos_drawer_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  sale_id text,
  user_id text,
  cashier_email text,
  event text not null,           -- 'auto_opened' | 'auto_failed' | 'manual_opened' | 'cancelled' | 'denied'
  requested_at timestamptz not null default now(),
  opened_at timestamptz,
  manual_pin_used boolean not null default false,
  authorized_by text,            -- user_id del owner que autorizó si manual_pin_used=true
  reason text,
  error_msg text,
  printer_id text,
  ip_addr text,
  user_agent text,
  meta jsonb default '{}'::jsonb
);

create index if not exists pos_drawer_log_tenant_req_idx
  on pos_drawer_log(tenant_id, requested_at desc);
create index if not exists pos_drawer_log_sale_idx
  on pos_drawer_log(sale_id);
create index if not exists pos_drawer_log_event_idx
  on pos_drawer_log(tenant_id, event, requested_at desc);
create index if not exists pos_drawer_log_user_idx
  on pos_drawer_log(tenant_id, user_id, requested_at desc);

alter table pos_drawer_log enable row level security;

do $$
begin
  begin drop policy if exists pos_drawer_log_tenant_iso_select on pos_drawer_log; exception when others then null; end;
  begin drop policy if exists pos_drawer_log_tenant_iso_insert on pos_drawer_log; exception when others then null; end;
  begin drop policy if exists pos_drawer_log_tenant_iso_update on pos_drawer_log; exception when others then null; end;
  begin drop policy if exists pos_drawer_log_tenant_iso_delete on pos_drawer_log; exception when others then null; end;
end $$;

create policy pos_drawer_log_tenant_iso_select
  on pos_drawer_log for select
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_drawer_log_tenant_iso_insert
  on pos_drawer_log for insert
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_drawer_log_tenant_iso_update
  on pos_drawer_log for update
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  )
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_drawer_log_tenant_iso_delete
  on pos_drawer_log for delete
  using (
    (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_drawer_log_event_check'
  ) then
    alter table pos_drawer_log
      add constraint pos_drawer_log_event_check
      check (event in ('auto_opened','auto_failed','manual_opened','cancelled','denied','retry'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FIX-H5b: pos_users.drawer_pin_hash
-- PIN dedicado para apertura manual de cajón (separado del pin de login).
-- Sólo owners/admins lo setean.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables where table_name = 'pos_users'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_name = 'pos_users' and column_name = 'drawer_pin_hash'
    ) then
      alter table pos_users add column drawer_pin_hash text;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_name = 'pos_users' and column_name = 'drawer_pin_updated_at'
    ) then
      alter table pos_users add column drawer_pin_updated_at timestamptz;
    end if;
  end if;
end $$;

-- También en tabla `users` por si está allí (compat con estructuras heredadas)
do $$
begin
  if exists (
    select 1 from information_schema.tables where table_name = 'users'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_name = 'users' and column_name = 'drawer_pin_hash'
    ) then
      alter table users add column drawer_pin_hash text;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_name = 'users' and column_name = 'drawer_pin_updated_at'
    ) then
      alter table users add column drawer_pin_updated_at timestamptz;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- VIEW: pos_hardware_health (resumen últimas 24h por tenant)
-- ---------------------------------------------------------------------------
create or replace view pos_hardware_health_24h as
  select
    coalesce(p.tenant_id, d.tenant_id) as tenant_id,
    coalesce(pp.failed_count, 0) as print_failed_24h,
    coalesce(pp.total_count, 0) as print_total_24h,
    coalesce(pp.reprint_count, 0) as print_reprints_24h,
    coalesce(dd.auto_failed_count, 0) as drawer_auto_failed_24h,
    coalesce(dd.manual_count, 0) as drawer_manual_opens_24h,
    coalesce(dd.total_count, 0) as drawer_total_24h
  from
    (select distinct tenant_id from pos_print_log where ts > now() - interval '24 hours') p
  full outer join
    (select distinct tenant_id from pos_drawer_log where requested_at > now() - interval '24 hours') d
    on p.tenant_id = d.tenant_id
  left join lateral (
    select
      count(*) filter (where event='failed') as failed_count,
      count(*) as total_count,
      count(*) filter (where event='reprint') as reprint_count
    from pos_print_log
    where tenant_id = coalesce(p.tenant_id, d.tenant_id)
      and ts > now() - interval '24 hours'
  ) pp on true
  left join lateral (
    select
      count(*) filter (where event='auto_failed') as auto_failed_count,
      count(*) filter (where event='manual_opened') as manual_count,
      count(*) as total_count
    from pos_drawer_log
    where tenant_id = coalesce(p.tenant_id, d.tenant_id)
      and requested_at > now() - interval '24 hours'
  ) dd on true;

COMMIT;

-- ============================================================================
-- VERIFICATION (opcional, run después)
-- ============================================================================
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('pos_print_log','pos_drawer_log');
-- SELECT column_name FROM information_schema.columns WHERE table_name='pos_users' AND column_name LIKE '%drawer%';
-- SELECT * FROM pos_hardware_health_24h LIMIT 5;
