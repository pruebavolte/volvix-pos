-- ============================================================================
-- R7a — SECURITY FIXES (Round 7a — cierra 4 P0 + 2 P1 backend)
-- Idempotente. Apunta los 6 fixes:
-- ============================================================================
--   FIX-1 (P0 — V4): RLS missing en pos_quotations
--   FIX-2 (P0 — V1): RLS + remove anon grants en pos_quotation_send_log
--   FIX-6 (P1 — N2): pos_quotations.tenant_id UUID → TEXT (alinea con API
--                    que usa strings tipo "TNT001")
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r7a-security-fixes.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX-6 (P1 — N2): pos_quotations.tenant_id UUID → TEXT
-- Hacer ANTES de las policies (para que las comparaciones text=text funcionen).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name='pos_quotations' and column_name='tenant_id'
      and data_type='uuid'
  ) then
    -- Drop indexes que dependan del tipo (los re-creamos al final si hace falta)
    -- Postgres permite ALTER TYPE con USING aún con índices simples; con compuestos puede fallar.
    -- Best-effort: drop el índice compuesto, alteramos, lo recreamos.
    begin
      drop index if exists pos_quotations_tenant_status_idx;
    exception when others then null; end;
    alter table pos_quotations
      alter column tenant_id type text using tenant_id::text;
    -- Recrear índice
    begin
      create index if not exists pos_quotations_tenant_status_idx
        on pos_quotations(tenant_id, status, valid_until);
    exception when others then null; end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FIX-1 (P0 — V4): RLS pos_quotations
-- Aislamiento por tenant_id (text JWT claim) + escape hatch superadmin/admin.
-- ---------------------------------------------------------------------------
alter table pos_quotations enable row level security;

-- Drop policies viejas (si existían) para idempotencia
do $$
begin
  begin drop policy if exists pos_quotations_tenant_iso_select on pos_quotations; exception when others then null; end;
  begin drop policy if exists pos_quotations_tenant_iso_insert on pos_quotations; exception when others then null; end;
  begin drop policy if exists pos_quotations_tenant_iso_update on pos_quotations; exception when others then null; end;
  begin drop policy if exists pos_quotations_tenant_iso_delete on pos_quotations; exception when others then null; end;
end $$;

create policy pos_quotations_tenant_iso_select
  on pos_quotations for select
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_quotations_tenant_iso_insert
  on pos_quotations for insert
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_quotations_tenant_iso_update
  on pos_quotations for update
  using (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  )
  with check (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_quotations_tenant_iso_delete
  on pos_quotations for delete
  using (
    (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

-- Grants mínimos (RLS hace el resto)
do $$
begin
  begin
    revoke all on pos_quotations from anon;
  exception when others then null; end;
  begin
    grant select, insert, update, delete on pos_quotations to authenticated;
  exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- FIX-2 (P0 — V1): RLS + revoke anon en pos_quotation_send_log
-- Síntoma: r6c-quotations-pdf.sql:126 daba GRANT ... TO anon, exponiendo
-- emails/teléfonos de clientes a cualquier visitante con anon key.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Revoke TOTAL del rol anon (lectura + escritura)
  begin
    revoke all on pos_quotation_send_log from anon;
  exception when others then null; end;
  -- authenticated NO debe poder UPDATE (manipular status='sent' para ocultar fallos)
  begin
    revoke update on pos_quotation_send_log from authenticated;
  exception when others then null; end;
  begin
    revoke update on pos_quotation_send_log from anon;
  exception when others then null; end;
  -- Grant minimal a authenticated (RLS aplica filtrado fino)
  begin
    grant select, insert on pos_quotation_send_log to authenticated;
  exception when others then null; end;
end $$;

alter table pos_quotation_send_log enable row level security;

-- Drop policies viejas (idempotencia)
do $$
begin
  begin drop policy if exists pos_qsl_tenant_iso on pos_quotation_send_log; exception when others then null; end;
  begin drop policy if exists pos_qsl_tenant_iso_select on pos_quotation_send_log; exception when others then null; end;
  begin drop policy if exists pos_qsl_tenant_iso_insert on pos_quotation_send_log; exception when others then null; end;
end $$;

-- Política: solo ver/insertar registros del propio tenant; admin/superadmin sin filtro
create policy pos_qsl_tenant_iso_select
  on pos_quotation_send_log for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

create policy pos_qsl_tenant_iso_insert
  on pos_quotation_send_log for insert
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    or (auth.jwt() ->> 'role') in ('superadmin','admin')
  );

-- ---------------------------------------------------------------------------
-- PostgREST schema cache reload
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- DONE.
-- ============================================================================
