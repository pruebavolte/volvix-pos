-- ============================================================================
-- VOLVIX POS — User & Module Feature Flag System
-- Migration: feature-flags.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   feature_modules            (catalog of all available modules)
--   module_pricing             (price per module per billing tier)
--   tenant_module_overrides    (tenant-wide on/off/coming-soon)
--   role_module_permissions    (per-role default within a tenant)
--   user_module_overrides      (per-user override, highest priority)
--   feature_flag_audit         (audit log of who changed what)
--
-- Resolution order (most specific wins):
--   user_override  >  role_permission  >  tenant_override  >  module.default_status
--
-- Status values: 'enabled' | 'disabled' | 'coming-soon'
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Module catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_modules (
  key             TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  icon            TEXT,
  dependencies    TEXT[] DEFAULT ARRAY[]::TEXT[],
  default_status  TEXT NOT NULL DEFAULT 'enabled'
                  CHECK (default_status IN ('enabled','disabled','coming-soon')),
  display_order   INT DEFAULT 100,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_modules_category ON feature_modules(category);

-- ---------------------------------------------------------------------------
-- 2. Per-tier pricing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS module_pricing (
  module_key     TEXT NOT NULL REFERENCES feature_modules(key) ON DELETE CASCADE,
  tier           TEXT NOT NULL,         -- 'basico' | 'pro' | 'enterprise' | custom
  price_monthly  NUMERIC(10,2) DEFAULT 0,
  price_annual   NUMERIC(10,2) DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'MXN',
  included       BOOLEAN DEFAULT FALSE, -- if TRUE: included in tier without extra cost
  updated_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (module_key, tier)
);

-- ---------------------------------------------------------------------------
-- 3. Tenant-wide override (set by platform owner or tenant admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_module_overrides (
  tenant_id   UUID NOT NULL,
  module_key  TEXT NOT NULL REFERENCES feature_modules(key) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('enabled','disabled','coming-soon')),
  set_by      UUID,
  set_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_overrides_tenant ON tenant_module_overrides(tenant_id);

-- ---------------------------------------------------------------------------
-- 4. Role-level default within a tenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_module_permissions (
  tenant_id   UUID NOT NULL,
  role        TEXT NOT NULL,            -- 'admin' | 'manager' | 'cajero' | 'inventario' | 'contador' | custom
  module_key  TEXT NOT NULL REFERENCES feature_modules(key) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('enabled','disabled','coming-soon')),
  set_by      UUID,
  set_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, role, module_key)
);

CREATE INDEX IF NOT EXISTS idx_role_module_perms_tenant_role
  ON role_module_permissions(tenant_id, role);

-- ---------------------------------------------------------------------------
-- 5. Per-user override (highest priority)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_module_overrides (
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  module_key  TEXT NOT NULL REFERENCES feature_modules(key) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('enabled','disabled','coming-soon')),
  reason      TEXT,
  set_by      UUID,
  set_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_module_overrides_user
  ON user_module_overrides(tenant_id, user_id);

-- ---------------------------------------------------------------------------
-- 6. Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('tenant','role','user')),
  scope_ref   TEXT NOT NULL,            -- role name or user_id (string)
  module_key  TEXT NOT NULL,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ DEFAULT now(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ff_audit_tenant_time
  ON feature_flag_audit(tenant_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Resolver function: returns effective status for (tenant, user, module)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_feature_status(
  p_tenant_id UUID,
  p_user_id   UUID,
  p_module    TEXT
) RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
  v_role   TEXT;
BEGIN
  -- 1) user override
  SELECT status INTO v_status
    FROM user_module_overrides
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND module_key = p_module
   LIMIT 1;
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

  -- 2) role permission (assumes you have a users table with column `role` and `tenant_id`)
  SELECT role INTO v_role FROM users WHERE id = p_user_id LIMIT 1;
  IF v_role IS NOT NULL THEN
    SELECT status INTO v_status
      FROM role_module_permissions
     WHERE tenant_id = p_tenant_id AND role = v_role AND module_key = p_module
     LIMIT 1;
    IF v_status IS NOT NULL THEN RETURN v_status; END IF;
  END IF;

  -- 3) tenant override
  SELECT status INTO v_status
    FROM tenant_module_overrides
   WHERE tenant_id = p_tenant_id AND module_key = p_module
   LIMIT 1;
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

  -- 4) module default
  SELECT default_status INTO v_status FROM feature_modules WHERE key = p_module LIMIT 1;
  RETURN COALESCE(v_status, 'enabled');
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 8. Bulk resolver: returns full feature map for a user as JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_features_for_user(
  p_tenant_id UUID,
  p_user_id   UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  r RECORD;
BEGIN
  FOR r IN SELECT key FROM feature_modules LOOP
    v_result := v_result || jsonb_build_object(
      r.key, resolve_feature_status(p_tenant_id, p_user_id, r.key)
    );
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 9. RLS Policies — Tenant isolation
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_module_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_module_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_overrides     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_audit        ENABLE ROW LEVEL SECURITY;

-- Helper: get tenant_id from JWT (Supabase pattern)
-- Adjust if your JWT structure differs.
DROP POLICY IF EXISTS "tenant_iso_read"  ON tenant_module_overrides;
DROP POLICY IF EXISTS "tenant_iso_write" ON tenant_module_overrides;
CREATE POLICY "tenant_iso_read" ON tenant_module_overrides
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "tenant_iso_write" ON tenant_module_overrides
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('admin','owner')
  );

DROP POLICY IF EXISTS "role_iso_read"  ON role_module_permissions;
DROP POLICY IF EXISTS "role_iso_write" ON role_module_permissions;
CREATE POLICY "role_iso_read" ON role_module_permissions
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "role_iso_write" ON role_module_permissions
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('admin','owner','manager')
  );

DROP POLICY IF EXISTS "user_iso_read"  ON user_module_overrides;
DROP POLICY IF EXISTS "user_iso_write" ON user_module_overrides;
CREATE POLICY "user_iso_read" ON user_module_overrides
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND (
      user_id::text = COALESCE((auth.jwt() ->> 'sub'), '')
      OR COALESCE((auth.jwt() ->> 'role'), '') IN ('admin','owner','manager')
    )
  );
CREATE POLICY "user_iso_write" ON user_module_overrides
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('admin','owner','manager')
  );

DROP POLICY IF EXISTS "audit_iso_read" ON feature_flag_audit;
CREATE POLICY "audit_iso_read" ON feature_flag_audit
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- ---------------------------------------------------------------------------
-- 10. Seed default module catalog (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO feature_modules (key, name, category, default_status, display_order, description) VALUES
  ('module.pos',           'Punto de Venta',     'ventas',     'enabled',     10,  'Caja, ticket y cobro'),
  ('module.credito',       'Crédito',            'ventas',     'enabled',     20,  'Ventas a crédito y cuentas por cobrar'),
  ('module.clientes',      'Clientes',           'ventas',     'enabled',     30,  'Catálogo de clientes y CRM básico'),
  ('module.inventario',    'Inventario',         'inventario', 'enabled',     40,  'Stock, mínimos, alertas'),
  ('module.kardex',        'Kardex',             'inventario', 'enabled',     50,  'Movimientos de inventario'),
  ('module.proveedores',   'Proveedores',        'inventario', 'enabled',     60,  'Catálogo de proveedores'),
  ('module.config',        'Configuración',      'sistema',    'enabled',     70,  'Configuración del sistema'),
  ('module.facturacion',   'Facturación CFDI',   'fiscal',     'enabled',     80,  'Timbrado CFDI 4.0 México'),
  ('module.corte',         'Corte de Caja',      'ventas',     'enabled',     90,  'Cierre y corte diario'),
  ('module.reportes',      'Reportes',           'analitica',  'enabled',     100, 'Reportes operativos y fiscales'),
  ('module.dashboard',     'Dashboard',          'analitica',  'enabled',     110, 'Tablero principal'),
  ('module.apertura',      'Apertura de Caja',   'ventas',     'enabled',     120, 'Apertura y fondo inicial'),
  ('module.cotizaciones',  'Cotizaciones',       'ventas',     'enabled',     130, 'Cotizaciones a clientes'),
  ('module.devoluciones',  'Devoluciones',       'ventas',     'enabled',     140, 'Notas de crédito y devolución'),
  ('module.ventas',        'Ventas',             'ventas',     'enabled',     150, 'Histórico de ventas'),
  ('module.usuarios',      'Usuarios',           'sistema',    'enabled',     160, 'Gestión de usuarios y permisos'),
  ('module.recargas',      'Recargas',           'servicios',  'enabled',     170, 'Tiempo aire y recargas'),
  ('module.servicios',     'Pago de Servicios',  'servicios',  'enabled',     180, 'CFE, agua, internet'),
  ('module.tarjetas',      'Tarjetas Virtuales', 'servicios',  'coming-soon', 190, 'Emisión de tarjetas virtuales'),
  ('module.promociones',   'Promociones',        'ventas',     'enabled',     200, 'Cupones y descuentos'),
  ('module.departamentos', 'Departamentos',      'inventario', 'enabled',     210, 'Categorización de productos'),
  ('module.sugeridas',     'Compras Sugeridas',  'inventario', 'coming-soon', 220, 'IA de sugerencia de compras'),
  ('module.actualizador',  'Actualizador',       'sistema',    'enabled',     230, 'Actualización del sistema'),
  ('module.marketplace',   'Marketplace',        'ventas',     'enabled',     240, 'Marketplace público'),
  ('module.kds',           'KDS Cocina',         'restaurante','coming-soon', 250, 'Pantalla de cocina')
ON CONFLICT (key) DO UPDATE SET
  name           = EXCLUDED.name,
  category       = EXCLUDED.category,
  description    = EXCLUDED.description,
  display_order  = EXCLUDED.display_order,
  updated_at     = now();

-- ---------------------------------------------------------------------------
-- 11. Seed default pricing tiers
-- ---------------------------------------------------------------------------
INSERT INTO module_pricing (module_key, tier, price_monthly, price_annual, included) VALUES
  ('module.pos',         'basico',     0,    0,     true),
  ('module.pos',         'pro',        0,    0,     true),
  ('module.pos',         'enterprise', 0,    0,     true),
  ('module.facturacion', 'basico',     199,  1999,  false),
  ('module.facturacion', 'pro',        0,    0,     true),
  ('module.facturacion', 'enterprise', 0,    0,     true),
  ('module.tarjetas',    'pro',        299,  2999,  false),
  ('module.tarjetas',    'enterprise', 0,    0,     true),
  ('module.kds',         'pro',        149,  1499,  false),
  ('module.kds',         'enterprise', 0,    0,     true)
ON CONFLICT (module_key, tier) DO NOTHING;

COMMIT;
