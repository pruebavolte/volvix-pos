-- ============================================================================
-- R19_PREFLIGHT.sql — Crea schemas/tables/columns que faltaban antes de R14+.
-- Idempotente. Debe correr ANTES de los archivos arreglados.
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 1. Schema app + helpers (R13_RLS_POLICIES.sql crea esto al final del orden,
--    pero R14_INVENTORY los necesita ANTES). Stubs seguros si no hay JWT.
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.tenant_id', true),
      ''
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.role', true),
    'authenticated'
  );
$$;

CREATE OR REPLACE FUNCTION app.is_admin()  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'admin'  $$;
CREATE OR REPLACE FUNCTION app.is_owner()  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'owner'  $$;
CREATE OR REPLACE FUNCTION app.is_cajero() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'cajero' $$;
CREATE OR REPLACE FUNCTION app.is_manager() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'manager' $$;
CREATE OR REPLACE FUNCTION app.is_writer() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_role() IN ('admin','owner','manager') $$;
CREATE OR REPLACE FUNCTION app.same_tenant(t uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT t IS NOT NULL AND t = app.current_tenant_id() $$;

-- 2. Stub tables que algunos R17/R18 esperan
-- pos_branches (R17_GEOFENCE)
CREATE TABLE IF NOT EXISTS public.pos_branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  name        text NOT NULL DEFAULT 'Default Branch',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- pos_tenants (R18_SHOP) → vista/alias compatible con tenants
CREATE TABLE IF NOT EXISTS public.pos_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Default Tenant',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- companies (R14_VERTICAL_TEMPLATES)
CREATE TABLE IF NOT EXISTS public.companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Default Company',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- inventory_movements: NO stub aquí — R14_INVENTORY la crea con full schema
-- (from_loc, to_loc, etc.) y R13 corre DESPUÉS de R14_INVENTORY en el runner.
-- Si una corrida previa creó una tabla incompleta, dropearla:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='inventory_movements'
       AND table_type='BASE TABLE'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='from_loc'
  ) THEN
    DROP TABLE public.inventory_movements CASCADE;
  END IF;
END $$;

-- cash_register (R13 espera) - stub
CREATE TABLE IF NOT EXISTS public.cash_register (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  cashier_id  uuid,
  status      text NOT NULL DEFAULT 'closed',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- reports (R13 espera) - stub
CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  name        text NOT NULL DEFAULT 'unnamed',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Columnas faltantes en tablas existentes
-- pos_users.tenant_id (R17_SMS join)
ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- customers.tenant_id (R14_LOYALTY)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- sale_items / payments precisan tenant_id si R13 los usa
ALTER TABLE IF EXISTS public.sale_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.sales
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_id uuid;
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid;
