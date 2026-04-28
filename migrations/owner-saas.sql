-- ============================================================================
-- VOLVIX POS — Owner Panel & Admin SaaS Tables
-- Migration: owner-saas.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   sub_tenants            (a tenant's child sub-tenants)
--   tenant_seats           (seats issued to a tenant under a plan)
--   deploys                (platform deploy log)
--   feature_kill_switch    (platform-wide feature kill-switch)
--   maintenance_blocks     (planned maintenance windows)
--   billing_invoices       (invoices issued to tenants)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Sub-tenants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sub_tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id  UUID NOT NULL,
  name              TEXT NOT NULL,
  vertical          TEXT,
  plan              TEXT NOT NULL DEFAULT 'basic',
  seat_count        INTEGER NOT NULL DEFAULT 1 CHECK (seat_count >= 0),
  features          JSONB,
  suspended_at      TIMESTAMPTZ,
  suspended_reason  TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtenants_parent  ON sub_tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_subtenants_plan    ON sub_tenants(plan);
CREATE INDEX IF NOT EXISTS idx_subtenants_active  ON sub_tenants(parent_tenant_id) WHERE suspended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Tenant seats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_seats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  seat_count   INTEGER NOT NULL CHECK (seat_count > 0),
  plan         TEXT NOT NULL,
  emitted_at   TIMESTAMPTZ DEFAULT now(),
  emitted_by   UUID,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  revoked_by   UUID,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_seats_tenant   ON tenant_seats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seats_plan     ON tenant_seats(tenant_id, plan);
-- Was: WHERE ... expires_at > now() — non-IMMUTABLE function in partial index.
-- Replaced with non-temporal predicate; app filters by expires_at at query time.
-- Defensive ALTER in case tenant_seats pre-existed without revoked_at column.
DO $tseats_alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_seats' AND table_schema='public') THEN
    ALTER TABLE tenant_seats ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
    ALTER TABLE tenant_seats ADD COLUMN IF NOT EXISTS revoked_by UUID;
    ALTER TABLE tenant_seats ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE tenant_seats ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  END IF;
END
$tseats_alter$;
CREATE INDEX IF NOT EXISTS idx_seats_active   ON tenant_seats(tenant_id, expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Deploys log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deploys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID,
  env            TEXT NOT NULL CHECK (env IN ('prod','staging','dev')),
  branch         TEXT,
  commit_sha     TEXT,
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','success','failed','rolled-back')),
  triggered_by   UUID,
  triggered_at   TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  log_url        TEXT,
  metadata       JSONB
);

CREATE INDEX IF NOT EXISTS idx_deploys_tenant   ON deploys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deploys_env      ON deploys(env, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploys_status   ON deploys(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploys_recent   ON deploys(triggered_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Feature kill-switch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_kill_switch (
  feature       TEXT PRIMARY KEY,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  reason        TEXT,
  toggled_at    TIMESTAMPTZ DEFAULT now(),
  toggled_by    UUID
);

-- ---------------------------------------------------------------------------
-- 5. Maintenance blocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID,
  reason       TEXT NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  until_date   TIMESTAMPTZ NOT NULL,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CHECK (until_date > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_maint_tenant ON maintenance_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maint_window ON maintenance_blocks(starts_at, until_date);
-- Was: WHERE until_date > now() — non-IMMUTABLE function rejected by Postgres.
-- App filters by until_date at query time.
CREATE INDEX IF NOT EXISTS idx_maint_active ON maintenance_blocks(until_date);

-- ---------------------------------------------------------------------------
-- 6. Billing invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  invoice_number      TEXT UNIQUE NOT NULL,
  amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'MXN',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('draft','pending','paid','overdue','cancelled','refunded')),
  due_date            DATE,
  paid_at             TIMESTAMPTZ,
  payment_method      TEXT,
  stripe_invoice_id   TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant   ON billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON billing_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due      ON billing_invoices(due_date) WHERE status IN ('pending','overdue');
CREATE INDEX IF NOT EXISTS idx_invoices_stripe   ON billing_invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saas_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subtenants_updated_at ON sub_tenants;
CREATE TRIGGER trg_subtenants_updated_at
  BEFORE UPDATE ON sub_tenants
  FOR EACH ROW EXECUTE FUNCTION saas_set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON billing_invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION saas_set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Audit log (best-effort) for sensitive SaaS tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saas_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(
        (CASE WHEN TG_TABLE_NAME = 'sub_tenants' THEN COALESCE(NEW.parent_tenant_id, OLD.parent_tenant_id) END),
        (CASE WHEN TG_TABLE_NAME <> 'sub_tenants' THEN COALESCE(NEW.tenant_id, OLD.tenant_id) END)
      ),
      TG_TABLE_NAME,
      COALESCE(NEW.id::text, OLD.id::text, NEW.feature, OLD.feature),
      TG_OP,
      COALESCE(NEW.created_by, OLD.created_by, NEW.toggled_by, OLD.toggled_by, NEW.triggered_by, OLD.triggered_by, NEW.emitted_by, OLD.emitted_by),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subtenants_audit ON sub_tenants;
CREATE TRIGGER trg_subtenants_audit
  AFTER INSERT OR UPDATE OR DELETE ON sub_tenants
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

DROP TRIGGER IF EXISTS trg_seats_audit ON tenant_seats;
CREATE TRIGGER trg_seats_audit
  AFTER INSERT OR UPDATE OR DELETE ON tenant_seats
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

DROP TRIGGER IF EXISTS trg_deploys_audit ON deploys;
CREATE TRIGGER trg_deploys_audit
  AFTER INSERT OR UPDATE ON deploys
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

DROP TRIGGER IF EXISTS trg_killswitch_audit ON feature_kill_switch;
CREATE TRIGGER trg_killswitch_audit
  AFTER INSERT OR UPDATE OR DELETE ON feature_kill_switch
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

DROP TRIGGER IF EXISTS trg_maintenance_audit ON maintenance_blocks;
CREATE TRIGGER trg_maintenance_audit
  AFTER INSERT OR UPDATE OR DELETE ON maintenance_blocks
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

DROP TRIGGER IF EXISTS trg_invoices_audit ON billing_invoices;
CREATE TRIGGER trg_invoices_audit
  AFTER INSERT OR UPDATE OR DELETE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION saas_audit_trigger();

-- ---------------------------------------------------------------------------
-- 9. RLS — Tenant isolation + superadmin bypass
-- ---------------------------------------------------------------------------
ALTER TABLE sub_tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_seats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_kill_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices    ENABLE ROW LEVEL SECURITY;

-- sub_tenants: parent_tenant_id matches JWT, OR superadmin
DROP POLICY IF EXISTS "subtenants_iso_read"  ON sub_tenants;
DROP POLICY IF EXISTS "subtenants_iso_write" ON sub_tenants;
CREATE POLICY "subtenants_iso_read" ON sub_tenants
  FOR SELECT USING (
    parent_tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "subtenants_iso_write" ON sub_tenants
  FOR ALL USING (
    (parent_tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
       AND COALESCE((auth.jwt() ->> 'role'), '') IN ('owner','admin'))
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- tenant_seats: tenant_id matches JWT, OR superadmin (only superadmin writes)
DROP POLICY IF EXISTS "seats_iso_read"  ON tenant_seats;
DROP POLICY IF EXISTS "seats_iso_write" ON tenant_seats;
CREATE POLICY "seats_iso_read" ON tenant_seats
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "seats_iso_write" ON tenant_seats
  FOR ALL USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- deploys: tenant scope OR null tenant_id (platform-wide) for superadmin
DROP POLICY IF EXISTS "deploys_iso_read"  ON deploys;
DROP POLICY IF EXISTS "deploys_iso_write" ON deploys;
CREATE POLICY "deploys_iso_read" ON deploys
  FOR SELECT USING (
    (tenant_id IS NOT NULL AND tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), ''))
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "deploys_iso_write" ON deploys
  FOR ALL USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- feature_kill_switch: read for everyone authenticated, write only superadmin
DROP POLICY IF EXISTS "killswitch_read"  ON feature_kill_switch;
DROP POLICY IF EXISTS "killswitch_write" ON feature_kill_switch;
CREATE POLICY "killswitch_read" ON feature_kill_switch
  FOR SELECT USING (auth.jwt() IS NOT NULL);
CREATE POLICY "killswitch_write" ON feature_kill_switch
  FOR ALL USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- maintenance_blocks: read by tenant or platform-wide; write superadmin
DROP POLICY IF EXISTS "maintenance_read"  ON maintenance_blocks;
DROP POLICY IF EXISTS "maintenance_write" ON maintenance_blocks;
CREATE POLICY "maintenance_read" ON maintenance_blocks
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "maintenance_write" ON maintenance_blocks
  FOR ALL USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

-- billing_invoices: tenant read for owner/admin; write superadmin
DROP POLICY IF EXISTS "invoices_iso_read"  ON billing_invoices;
DROP POLICY IF EXISTS "invoices_iso_write" ON billing_invoices;
CREATE POLICY "invoices_iso_read" ON billing_invoices
  FOR SELECT USING (
    (tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
       AND COALESCE((auth.jwt() ->> 'role'), '') IN ('owner','admin','contador'))
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );
CREATE POLICY "invoices_iso_write" ON billing_invoices
  FOR ALL USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

COMMIT;
