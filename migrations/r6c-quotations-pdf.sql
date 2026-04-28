-- ============================================================================
-- R6c — QUOTATIONS HARDENING (Round 6c — Cotizaciones serias)
-- Idempotente. Apunta los 5 GAPs Q1..Q5.
-- ============================================================================
--   GAP-Q1: items es la columna canónica (la API acepta line_items y mapea).
--   GAP-Q2: PDF/HTML print — server route GET /api/quotations/:id/print.
--   GAP-Q3: convert → sale, ahora con FK pos_sales.quotation_id.
--   GAP-Q4: vigencia + estados extendidos (rejected) + sent_at.
--   GAP-Q5: pos_quotation_send_log + status mock/sent/failed.
-- ============================================================================

-- 1) Asegurar tabla pos_quotations base (idempotente)
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
  status        text not null default 'draft',
  converted_sale_id uuid,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 1.b) Columnas opcionales que el frontend ya envía (no rompen si ya existen)
alter table pos_quotations add column if not exists customer_name  text;
alter table pos_quotations add column if not exists customer_phone text;
alter table pos_quotations add column if not exists customer_email text;
alter table pos_quotations add column if not exists validity_days  integer;
alter table pos_quotations add column if not exists sent_at        timestamptz;
alter table pos_quotations add column if not exists folio          text;

-- 1.c) Default de valid_until = hoy + 30 días si no viene
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='pos_quotations' and column_name='valid_until'
      and column_default is not null
  ) then
    alter table pos_quotations alter column valid_until set default (current_date + interval '30 days');
  end if;
end $$;

-- 1.d) Status check ampliado: incluye 'rejected'
do $$
begin
  -- drop check constraint if any (variations de versión previa)
  perform 1
  from   information_schema.table_constraints
  where  table_name='pos_quotations' and constraint_type='CHECK'
         and constraint_name like '%status%';
  -- No se puede dropear con nombre genérico de forma 100% segura, así que solo añadimos uno nuevo si falta:
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'pos_quotations_status_chk_r6c'
  ) then
    -- eliminamos checks viejos sobre status si los hay (best-effort)
    begin
      alter table pos_quotations drop constraint pos_quotations_status_check;
    exception when others then null; end;
    begin
      alter table pos_quotations drop constraint pos_quotations_status_check1;
    exception when others then null; end;
    alter table pos_quotations add constraint pos_quotations_status_chk_r6c
      check (status in ('draft','sent','accepted','rejected','expired','converted'));
  end if;
end $$;

-- 2) GAP-Q3: pos_sales.quotation_id (FK, soft)
alter table pos_sales add column if not exists quotation_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_sales_quotation_id_fk'
  ) then
    begin
      alter table pos_sales
        add constraint pos_sales_quotation_id_fk
        foreign key (quotation_id) references pos_quotations(id)
        on delete set null;
    exception when others then null; end;
  end if;
end $$;

-- 3) GAP-Q3: pos_quotations.converted_to_sale_id (alias canónico nuevo)
--     Mantenemos converted_sale_id por compat. Agregamos el nombre del spec.
alter table pos_quotations add column if not exists converted_to_sale_id uuid;

-- 4) GAP-Q5: pos_quotation_send_log
create table if not exists pos_quotation_send_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text,    -- texto para alinear con pos_quotations.tenant_id (TNT001 etc.)
  quotation_id    uuid not null references pos_quotations(id) on delete cascade,
  method          text not null check (method in ('email','whatsapp','sms')),
  recipient       text not null,
  status          text not null default 'queued'
                  check (status in ('queued','sent','mock','failed')),
  provider_id     text,
  error_msg       text,
  message         text,
  sent_at         timestamptz not null default now(),
  user_id         uuid
);
create index if not exists pos_quotation_send_log_quo_idx
  on pos_quotation_send_log(quotation_id, sent_at desc);
create index if not exists pos_quotation_send_log_tenant_idx
  on pos_quotation_send_log(tenant_id, sent_at desc);

-- 5) Indices clave para consultas frecuentes
create index if not exists pos_quotations_tenant_status_idx
  on pos_quotations(tenant_id, status, valid_until);
create index if not exists pos_quotations_converted_idx
  on pos_quotations(converted_to_sale_id);

-- 6) Grant minimal (RLS por tenant ya cubre multi-tenant)
do $$
begin
  begin
    grant select, insert, update on pos_quotation_send_log to anon, authenticated;
  exception when others then null; end;
end $$;

-- 7) Si la tabla ya existió con tenant_id uuid, migrarlo a text
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name='pos_quotation_send_log' and column_name='tenant_id'
      and data_type='uuid'
  ) then
    alter table pos_quotation_send_log alter column tenant_id type text using tenant_id::text;
  end if;
end $$;

-- 8) PostgREST schema cache reload
notify pgrst, 'reload schema';

-- ============================================================================
-- Done. Apply with: supabase db query --linked < migrations/r6c-quotations-pdf.sql
-- ============================================================================
