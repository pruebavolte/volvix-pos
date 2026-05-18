-- R14_PRINTERS.sql — Configuración de impresoras térmicas por tenant
-- Ejecutar en Supabase SQL editor.

create table if not exists printer_configs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('bluetooth','usb','network','fallback')),
  address       text,                 -- IP (network), MAC/ID (bluetooth), vendor/product (usb)
  port          int  default 9100,
  paper_width   int  default 80,      -- mm: 58 o 80
  default_for   jsonb default '{}'::jsonb,  -- {"receipts":true,"kitchen":false,"reports":false}
  active        boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_printer_configs_tenant on printer_configs(tenant_id);
create index if not exists idx_printer_configs_active on printer_configs(tenant_id, active) where active = true;

-- Log de auditoría de impresión (no contiene buffer raw, solo metadata)
create table if not exists printer_audit_log (
  id            bigserial primary key,
  tenant_id     uuid references tenants(id) on delete set null,
  user_id       uuid,
  printer_id    uuid references printer_configs(id) on delete set null,
  type          text,            -- bluetooth/usb/network
  ip            text,
  port          int,
  bytes         int,
  status        text,            -- ok/failed/audit_only
  ip_origin     inet,
  user_agent    text,
  created_at    timestamptz default now()
);
create index if not exists idx_printer_audit_tenant on printer_audit_log(tenant_id, created_at desc);

-- RLS
alter table printer_configs enable row level security;
alter table printer_audit_log enable row level security;

drop policy if exists printer_configs_tenant_iso on printer_configs;
create policy printer_configs_tenant_iso on printer_configs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists printer_audit_tenant_iso on printer_audit_log;
create policy printer_audit_tenant_iso on printer_audit_log
  for select using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- updated_at trigger
create or replace function trg_printer_configs_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_printer_configs_upd on printer_configs;
create trigger trg_printer_configs_upd before update on printer_configs
  for each row execute function trg_printer_configs_updated();
