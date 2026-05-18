-- ============================================================================
-- VOLVIX POS — Tenant-Scoped User Management
-- Migration: users-tenant.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   tenant_users   (tenant-scoped users with roles & local password hash)
--
-- Notes:
--   * password_hash uses scrypt (computed in app code, never plain).
--   * UNIQUE(tenant_id, email) lets the same email exist across tenants.
--   * disabled_at is soft-delete; never hard-delete a user.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tenant_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  user_id              UUID NOT NULL,
  email                TEXT NOT NULL,
  display_name         TEXT,
  role                 TEXT NOT NULL DEFAULT 'cajero'
                       CHECK (role IN ('superadmin','owner','admin','manager','cajero','inventario','contador')),
  password_hash        TEXT,
  password_salt        TEXT,
  password_updated_at  TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT FALSE,
  last_login_at        TIMESTAMPTZ,
  last_login_ip        TEXT,
  failed_login_count   INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  disabled_at          TIMESTAMPTZ,
  disabled_by          UUID,
  disabled_reason      TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant   ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user     ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email    ON tenant_users(tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_tenant_users_role     ON tenant_users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_tenant_users_active   ON tenant_users(tenant_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_users_locked   ON tenant_users(tenant_id) WHERE locked_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tenant_users_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    NEW.password_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_users_updated_at ON tenant_users;
CREATE TRIGGER trg_tenant_users_updated_at
  BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION tenant_users_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Audit log (best-effort, never log password hashes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tenant_users_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    v_payload := to_jsonb(COALESCE(NEW, OLD))
                  - 'password_hash' - 'password_salt';
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      'tenant_users',
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      COALESCE(NEW.disabled_by, OLD.disabled_by),
      v_payload
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_users_audit ON tenant_users;
CREATE TRIGGER trg_tenant_users_audit
  AFTER INSERT OR UPDATE OR DELETE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION tenant_users_audit_trigger();

-- ---------------------------------------------------------------------------
-- 4. RLS — Tenant isolation + role-based read/write
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tu_iso_read_self"  ON tenant_users;
DROP POLICY IF EXISTS "tu_iso_read_admin" ON tenant_users;
DROP POLICY IF EXISTS "tu_iso_write"      ON tenant_users;

-- A user can read its own row in its tenant
CREATE POLICY "tu_iso_read_self" ON tenant_users
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND user_id::text = COALESCE((auth.jwt() ->> 'sub'), '')
  );

-- Owner / admin can read all rows in tenant
CREATE POLICY "tu_iso_read_admin" ON tenant_users
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager')
  );

-- Only owner / admin can write
CREATE POLICY "tu_iso_write" ON tenant_users
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin')
  );

COMMIT;
