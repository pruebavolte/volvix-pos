-- =====================================================================
-- R14_AUDIT_GDPR.sql — Audit Log Inmutable + Cumplimiento GDPR
-- Volvix POS — Release 14
-- Ejecutar en: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new
-- =====================================================================

-- Requerido para digest() en gdpr_anonymize_customer
create extension if not exists pgcrypto;

-- ─── 1. AUDIT LOG (inmutable) ────────────────────────────────────────
create table if not exists volvix_audit_log (
  id            bigserial primary key,
  ts            timestamptz not null default now(),
  user_id       text,
  tenant_id     uuid,
  action        text not null check (action in ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','ANONYMIZE','GDPR_REQUEST')),
  resource      text not null,           -- nombre de la tabla / endpoint
  resource_id   text,                    -- pk del registro afectado
  before        jsonb,
  after         jsonb,
  ip            text,
  user_agent    text
);
create index if not exists volvix_audit_ts_idx       on volvix_audit_log(ts desc);
create index if not exists volvix_audit_user_idx     on volvix_audit_log(user_id);
create index if not exists volvix_audit_tenant_idx   on volvix_audit_log(tenant_id);
create index if not exists volvix_audit_action_idx   on volvix_audit_log(action);
create index if not exists volvix_audit_resource_idx on volvix_audit_log(resource, resource_id);

-- ─── INMUTABILIDAD — bloquea UPDATE y DELETE en audit_log ────────────
create or replace function volvix_audit_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'volvix_audit_log es inmutable: % no permitido', tg_op;
end;
$$;

drop trigger if exists volvix_audit_no_update on volvix_audit_log;
create trigger volvix_audit_no_update
  before update on volvix_audit_log
  for each row execute function volvix_audit_block_mutation();

drop trigger if exists volvix_audit_no_delete on volvix_audit_log;
create trigger volvix_audit_no_delete
  before delete on volvix_audit_log
  for each row execute function volvix_audit_block_mutation();

-- ─── TRIGGER GENÉRICO de auditoría para tablas críticas ──────────────
create or replace function volvix_audit_trigger()
returns trigger language plpgsql as $$
declare
  v_user    text := coalesce(current_setting('volvix.user_id',     true), 'system');
  v_tenant  uuid;
  v_ip      text := coalesce(current_setting('volvix.client_ip',   true), null);
  v_ua      text := coalesce(current_setting('volvix.user_agent',  true), null);
  v_rid     text;
  v_before  jsonb;
  v_after   jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
    v_rid    := (to_jsonb(old)->>'id');
    v_tenant := nullif(to_jsonb(old)->>'tenant_id','')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_rid    := (to_jsonb(new)->>'id');
    v_tenant := nullif(to_jsonb(new)->>'tenant_id','')::uuid;
  else  -- INSERT
    v_before := null;
    v_after  := to_jsonb(new);
    v_rid    := (to_jsonb(new)->>'id');
    v_tenant := nullif(to_jsonb(new)->>'tenant_id','')::uuid;
  end if;

  insert into volvix_audit_log(user_id, tenant_id, action, resource, resource_id, before, after, ip, user_agent)
  values (v_user, v_tenant, tg_op, tg_table_name, v_rid, v_before, v_after, v_ip, v_ua);

  return coalesce(new, old);
end;
$$;

-- ─── Aplicar trigger a tablas críticas (UPDATE/DELETE) ───────────────
do $$
declare
  t text;
  tables text[] := array[
    'volvix_tenants',
    'volvix_productos',
    'volvix_ventas',
    'volvix_features',
    'volvix_licencias',
    'volvix_tickets',
    'volvix_usuarios'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on %I
         for each row execute function volvix_audit_trigger()',
      t, t
    );
  end loop;
end$$;

-- =====================================================================
-- 2. GDPR REQUESTS
-- =====================================================================
create table if not exists volvix_gdpr_requests (
  id            uuid primary key default gen_random_uuid(),
  customer_id   text not null,                          -- email o identificador del cliente
  type          text not null check (type in ('access','erasure','portability')),
  status        text not null default 'pending'
                check (status in ('pending','verifying','processing','completed','rejected')),
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  verify_token  text,
  verify_expires timestamptz,
  payload       jsonb default '{}'::jsonb,
  ip            text,
  user_agent    text
);
create index if not exists volvix_gdpr_customer_idx on volvix_gdpr_requests(customer_id);
create index if not exists volvix_gdpr_status_idx   on volvix_gdpr_requests(status);
create index if not exists volvix_gdpr_type_idx     on volvix_gdpr_requests(type);

-- =====================================================================
-- 3. EXPORT — derecho de acceso (Art. 15) y portabilidad (Art. 20)
-- =====================================================================
create or replace function gdpr_export_customer(p_customer_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'customer_id', p_customer_id,
    'exported_at', now(),
    'gdpr_articles', jsonb_build_array('Art.15','Art.20'),
    'usuarios',  coalesce((select jsonb_agg(to_jsonb(u))
                            from volvix_usuarios u where u.email = p_customer_id), '[]'::jsonb),
    'tenants',   coalesce((select jsonb_agg(to_jsonb(t))
                            from volvix_tenants t where t.email = p_customer_id), '[]'::jsonb),
    'tickets',   coalesce((select jsonb_agg(to_jsonb(tk))
                            from volvix_tickets tk
                           where tk.descripcion ilike '%' || p_customer_id || '%'
                              or tk.asignado_a = p_customer_id), '[]'::jsonb),
    'ventas',    coalesce((select jsonb_agg(to_jsonb(v))
                            from volvix_ventas v
                           where v.cajero = p_customer_id
                              or v.notas ilike '%' || p_customer_id || '%'), '[]'::jsonb),
    'gdpr_requests', coalesce((select jsonb_agg(to_jsonb(g))
                                from volvix_gdpr_requests g
                               where g.customer_id = p_customer_id), '[]'::jsonb)
  ) into result;

  insert into volvix_audit_log(user_id, action, resource, resource_id, after)
  values (p_customer_id, 'EXPORT', 'gdpr_export', p_customer_id,
          jsonb_build_object('size_bytes', octet_length(result::text)));

  return result;
end;
$$;

-- =====================================================================
-- 4. ANONYMIZE — derecho al olvido (Art. 17)
-- =====================================================================
-- Reemplaza PII con hash determinista (SHA-256 truncado a 16 hex chars).
-- Mantiene integridad referencial y datos agregados (ventas, métricas).
create or replace function gdpr_anonymize_customer(p_customer_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_hash       text := substr(encode(digest(p_customer_id, 'sha256'), 'hex'), 1, 16);
  v_anon_email text := 'anon_' || v_hash || '@anon.invalid';
  v_anon_name  text := 'Anonimizado-' || v_hash;
  v_affected   jsonb := '{}'::jsonb;
  v_count      int;
begin
  -- volvix_usuarios
  update volvix_usuarios
     set nombre = v_anon_name,
         email  = v_anon_email,
         activo = false
   where email = p_customer_id;
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_usuarios', v_count);

  -- volvix_tenants (si el customer es contacto de un tenant)
  update volvix_tenants
     set email     = v_anon_email,
         telefono  = null,
         direccion = null
   where email = p_customer_id;
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_tenants', v_count);

  -- volvix_tickets
  update volvix_tickets
     set asignado_a  = v_anon_name,
         descripcion = regexp_replace(coalesce(descripcion,''), p_customer_id, v_anon_email, 'gi')
   where asignado_a = p_customer_id
      or descripcion ilike '%' || p_customer_id || '%';
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_tickets', v_count);

  -- volvix_ventas (preserva agregados, anonimiza cajero/notas)
  update volvix_ventas
     set cajero = v_anon_name,
         notas  = regexp_replace(coalesce(notas,''), p_customer_id, v_anon_email, 'gi')
   where cajero = p_customer_id
      or notas ilike '%' || p_customer_id || '%';
  get diagnostics v_count = row_count;
  v_affected := v_affected || jsonb_build_object('volvix_ventas', v_count);

  -- Marcar requests gdpr como completadas
  update volvix_gdpr_requests
     set status       = 'completed',
         completed_at = now()
   where customer_id = p_customer_id
     and type = 'erasure'
     and status <> 'completed';

  -- Audit
  insert into volvix_audit_log(user_id, action, resource, resource_id, before, after)
  values ('gdpr', 'ANONYMIZE', 'gdpr_anonymize', p_customer_id,
          jsonb_build_object('original_id', p_customer_id),
          jsonb_build_object('hash', v_hash, 'affected', v_affected));

  return jsonb_build_object(
    'ok', true,
    'customer_id_hash', v_hash,
    'anonymized_email', v_anon_email,
    'affected_rows', v_affected,
    'completed_at', now()
  );
end;
$$;

-- =====================================================================
-- 5. RLS — solo admin lee audit_log y gdpr_requests
-- =====================================================================
alter table volvix_audit_log     enable row level security;
alter table volvix_gdpr_requests enable row level security;

drop policy if exists volvix_audit_admin_read on volvix_audit_log;
create policy volvix_audit_admin_read on volvix_audit_log
  for select using (auth.role() = 'service_role');

drop policy if exists volvix_audit_service_insert on volvix_audit_log;
create policy volvix_audit_service_insert on volvix_audit_log
  for insert with check (true);

drop policy if exists volvix_gdpr_service on volvix_gdpr_requests;
create policy volvix_gdpr_service on volvix_gdpr_requests
  for all using (auth.role() = 'service_role') with check (true);

-- =====================================================================
-- FIN R14_AUDIT_GDPR.sql
-- =====================================================================
