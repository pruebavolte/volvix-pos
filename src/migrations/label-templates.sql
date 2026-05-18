-- ============================================================================
-- VOLVIX POS — Label Templates (Etiqueta Designer)
-- Migration: label-templates.sql
-- ----------------------------------------------------------------------------
-- Stores label/etiqueta designs created by users in etiqueta_designer.html.
-- Each row represents a saved canvas (elements + dimensions + paper config).
--
-- Notes:
--   * tenant_id is TEXT (matches the system convention, e.g. "TNT001").
--   * Soft-delete via deleted_at column.
--   * RLS enforces tenant isolation through auth.jwt() ->> 'tenant_id'.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Main table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS label_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  user_id         UUID,
  name            TEXT NOT NULL,
  notes           TEXT,
  elements        JSONB NOT NULL DEFAULT '[]'::jsonb,
  canvas_w        INTEGER NOT NULL DEFAULT 300,
  canvas_h        INTEGER NOT NULL DEFAULT 200,
  paper_size      TEXT,
  printer_target  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT label_templates_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT label_templates_canvas_w CHECK (canvas_w BETWEEN 1 AND 4000),
  CONSTRAINT label_templates_canvas_h CHECK (canvas_h BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS idx_label_templates_tenant
  ON label_templates(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_label_templates_user
  ON label_templates(tenant_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_label_templates_updated
  ON label_templates(tenant_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_label_templates_name
  ON label_templates(tenant_id, lower(name))
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION label_templates_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_label_templates_updated_at ON label_templates;
CREATE TRIGGER trg_label_templates_updated_at
  BEFORE UPDATE ON label_templates
  FOR EACH ROW EXECUTE FUNCTION label_templates_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Audit log (best-effort — only if volvix_audit_log exists)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION label_templates_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      'label_templates',
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      COALESCE(NEW.user_id, OLD.user_id),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_label_templates_audit ON label_templates;
CREATE TRIGGER trg_label_templates_audit
  AFTER INSERT OR UPDATE OR DELETE ON label_templates
  FOR EACH ROW EXECUTE FUNCTION label_templates_audit_trigger();

-- ---------------------------------------------------------------------------
-- 4. RLS — Tenant isolation (TEXT tenant_id pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE label_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "label_templates_iso_read"  ON label_templates;
DROP POLICY IF EXISTS "label_templates_iso_write" ON label_templates;
DROP POLICY IF EXISTS "label_templates_iso_admin" ON label_templates;

-- Read: members of tenant can see non-deleted rows of their tenant
CREATE POLICY "label_templates_iso_read" ON label_templates
  FOR SELECT USING (
    tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND deleted_at IS NULL
  );

-- Write: members can insert/update/delete only inside their tenant
CREATE POLICY "label_templates_iso_write" ON label_templates
  FOR ALL USING (
    tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN ('superadmin','owner','admin','manager','cajero','cashier')
  )
  WITH CHECK (
    tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- Superadmin: cross-tenant read for support
CREATE POLICY "label_templates_iso_admin" ON label_templates
  FOR SELECT USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
  );

COMMIT;
