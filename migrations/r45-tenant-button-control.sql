-- =============================================================
-- R45 — Tenant Button & Module Control (Super-Admin granular)
-- =============================================================
-- Permite al super-admin (TÚ) bloquear botones específicos y
-- guardar notas internas por tenant. Los módulos ya viven en
-- pos_tenant_modules; aquí solo agregamos overrides de botones.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Botones controlables por tenant ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_button_overrides (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   text NOT NULL,
  button_id   text NOT NULL,
  is_enabled  boolean DEFAULT true,
  reason      text,
  set_by      uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (tenant_id, button_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_button_overrides_tenant
  ON tenant_button_overrides(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_button_overrides_disabled
  ON tenant_button_overrides(tenant_id) WHERE is_enabled = false;

-- ─── Notas internas del super-admin sobre el tenant ─────────────────────────
CREATE TABLE IF NOT EXISTS tenant_admin_notes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   text NOT NULL,
  note        text NOT NULL,
  author_id   uuid,
  author_name text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_admin_notes_tenant
  ON tenant_admin_notes(tenant_id, created_at DESC);

-- ─── Auditoría de impersonation (quién entró como qué tenant) ───────────────
CREATE TABLE IF NOT EXISTS tenant_impersonation_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  super_admin_id uuid,
  super_admin_email text,
  tenant_id     text NOT NULL,
  reason        text,
  jti           text,
  expires_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_impersonation_log_tenant
  ON tenant_impersonation_log(tenant_id, created_at DESC);
