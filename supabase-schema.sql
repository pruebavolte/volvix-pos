-- Volvix POS — Supabase Schema (tablas con prefijo volvix_)
-- Ejecutar en: https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new

-- TENANTS (negocios Volvix)
create table if not exists volvix_tenants (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_negocio text default 'retail',
  email text,
  telefono text,
  direccion text,
  logo_url text,
  activo boolean default true,
  plan text default 'starter',
  features_activos jsonb default '[]',
  ai_ultimo_analisis timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PRODUCTOS
create table if not exists volvix_productos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio numeric(10,2) default 0,
  costo numeric(10,2) default 0,
  stock integer default 0,
  stock_min integer default 5,
  categoria text,
  codigo text,
  imagen_url text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists volvix_productos_tenant_idx on volvix_productos(tenant_id);
create index if not exists volvix_productos_codigo_idx on volvix_productos(codigo);

-- VENTAS
create table if not exists volvix_ventas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete cascade,
  items jsonb not null default '[]',
  subtotal numeric(10,2) default 0,
  iva numeric(10,2) default 0,
  descuento numeric(10,2) default 0,
  total numeric(10,2) default 0,
  metodo_pago text default 'efectivo',
  recibido numeric(10,2) default 0,
  cambio numeric(10,2) default 0,
  estado text default 'completada',
  cajero text,
  notas text,
  created_at timestamptz default now()
);
create index if not exists volvix_ventas_tenant_idx on volvix_ventas(tenant_id);
create index if not exists volvix_ventas_fecha_idx on volvix_ventas(created_at desc);

-- FEATURES (activados por IA por tenant)
create table if not exists volvix_features (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete cascade,
  feature text not null,
  activo boolean default true,
  activado_por text default 'manual',
  datos_uso jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, feature)
);
create index if not exists volvix_features_tenant_idx on volvix_features(tenant_id);

-- LICENCIAS
create table if not exists volvix_licencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete cascade,
  clave text unique not null default encode(gen_random_bytes(16), 'hex'),
  plan text default 'starter',
  activo boolean default true,
  fecha_inicio timestamptz default now(),
  fecha_vencimiento timestamptz default (now() + interval '30 days'),
  max_productos integer default 100,
  max_usuarios integer default 3,
  created_at timestamptz default now()
);

-- TICKETS (soporte)
create table if not exists volvix_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete set null,
  asunto text not null,
  descripcion text,
  prioridad text default 'media' check (prioridad in ('baja','media','alta','critica')),
  estado text default 'abierto' check (estado in ('abierto','en_proceso','resuelto','cerrado')),
  categoria text default 'tecnico',
  asignado_a text,
  resolucion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists volvix_tickets_estado_idx on volvix_tickets(estado);
create index if not exists volvix_tickets_prioridad_idx on volvix_tickets(prioridad);

-- USUARIOS (empleados por tenant)
create table if not exists volvix_usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references volvix_tenants(id) on delete cascade,
  nombre text not null,
  email text,
  rol text default 'cajero' check (rol in ('admin','supervisor','cajero')),
  activo boolean default true,
  created_at timestamptz default now()
);

-- TRIGGER: updated_at automático
create or replace function volvix_update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists volvix_tenants_updated_at on volvix_tenants;
create trigger volvix_tenants_updated_at before update on volvix_tenants
  for each row execute function volvix_update_updated_at();

drop trigger if exists volvix_productos_updated_at on volvix_productos;
create trigger volvix_productos_updated_at before update on volvix_productos
  for each row execute function volvix_update_updated_at();

drop trigger if exists volvix_features_updated_at on volvix_features;
create trigger volvix_features_updated_at before update on volvix_features
  for each row execute function volvix_update_updated_at();

drop trigger if exists volvix_tickets_updated_at on volvix_tickets;
create trigger volvix_tickets_updated_at before update on volvix_tickets
  for each row execute function volvix_update_updated_at();

-- DATOS DE EJEMPLO
insert into volvix_tenants (nombre, tipo_negocio, email, activo)
values ('Demo Volvix', 'retail', 'demo@volvix.mx', true)
on conflict do nothing;
