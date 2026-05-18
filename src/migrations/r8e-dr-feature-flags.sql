-- ============================================================================
-- VOLVIX POS — Round 8e: DISASTER RECOVERY / CONTINGENCY
-- Migration: r8e-dr-feature-flags.sql
--
-- Closes 5 fixes in Disaster Recovery (FIX-DR1..DR5):
--
--   FIX-DR1: status-page.html public — sin auth, consume /api/health/full y
--            muestra estado de subsistemas (Supabase / API / Audit / Memory).
--            Front-only en este round; el HTML se sirve estáticamente desde
--            api/index.js -> serveStaticFile().
--
--   FIX-DR2: backup-restore drill (script bash + runbook) — supabase db dump
--            + sha256 + verificación de INSERT count. Runbook documenta RTO
--            <30 min y RPO 1h, pasos de restore, checklist post-restore.
--
--   FIX-DR3: emergency mode UI (volvix-emergency-mode.html) — ventas en cash
--            offline con IndexedDB. Header X-Emergency-Mode: true al
--            sincronizar cuando vuelve la conexión. Backend wiring queda para
--            futuro round (R8c lo implementará en api/index.js).
--
--   FIX-DR4: pos_feature_flags — togglable rollback sin redeploy. Tabla
--            (key, enabled, scope, scope_id, payload). Seed inicial 4 flags:
--            emergency_mode, readonly_mode, disable_promotions, disable_kds.
--            Admin/owner puede flippear via SQL directo si la API está caída.
--
--   FIX-DR5: pos_emergency_mode_log — bitácora de activaciones/desactivaciones
--            del modo emergencia. (activated_by, reason, activated_at,
--            deactivated_at, deactivated_by). Permite auditoría regulatoria.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING / DO $$.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX-DR4: pos_feature_flags — runtime toggles para rollback sin redeploy
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_feature_flags (
  key             TEXT PRIMARY KEY,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  scope           TEXT NOT NULL DEFAULT 'global'
                    CHECK (scope IN ('global', 'tenant', 'user', 'role')),
  scope_id        TEXT,                                     -- NULL si scope='global'
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  description     TEXT,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

-- INDEX: lookup rápido por scope + key (lectura caliente del runtime)
CREATE INDEX IF NOT EXISTS idx_pos_feature_flags_scope
  ON pos_feature_flags(scope, scope_id, key)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_pos_feature_flags_key_enabled
  ON pos_feature_flags(key) WHERE enabled = TRUE;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION pos_feature_flags_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_feature_flags_updated_at ON pos_feature_flags;
CREATE TRIGGER trg_pos_feature_flags_updated_at
  BEFORE UPDATE ON pos_feature_flags
  FOR EACH ROW EXECUTE FUNCTION pos_feature_flags_set_updated_at();

-- Seed inicial: 4 flags de DR. ON CONFLICT DO NOTHING preserva runtime values.
INSERT INTO pos_feature_flags (key, enabled, scope, payload, description) VALUES
  ('emergency_mode',      FALSE, 'global', '{}'::jsonb,
   'Activa modo emergencia: solo cash, sin DB, IndexedDB local'),
  ('readonly_mode',       FALSE, 'global', '{}'::jsonb,
   'Bloquea writes en POS — solo lectura (mantenimiento)'),
  ('disable_promotions',  FALSE, 'global', '{}'::jsonb,
   'Deshabilita motor de promociones (rollback ante bugs)'),
  ('disable_kds',         FALSE, 'global', '{}'::jsonb,
   'Deshabilita Kitchen Display System (rollback realtime)')
ON CONFLICT (key) DO NOTHING;

-- RLS: lectura abierta autenticada, write solo admin/owner/superadmin
ALTER TABLE pos_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_feature_flags_select ON pos_feature_flags;
CREATE POLICY pol_feature_flags_select ON pos_feature_flags
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pol_feature_flags_write ON pos_feature_flags;
CREATE POLICY pol_feature_flags_write ON pos_feature_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- ============================================================================
-- FIX-DR5: pos_emergency_mode_log — bitácora de activación/desactivación DR
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_emergency_mode_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activated_by    UUID,                                     -- pos_users.id
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT NOT NULL,                            -- "DB caída", "test", etc.
  scope           TEXT NOT NULL DEFAULT 'global'
                    CHECK (scope IN ('global', 'tenant', 'register')),
  scope_id        TEXT,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID,
  notes           TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_emergency_log_active
  ON pos_emergency_mode_log(activated_at DESC)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emergency_log_scope
  ON pos_emergency_mode_log(scope, scope_id, activated_at DESC);

ALTER TABLE pos_emergency_mode_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_emergency_log_select ON pos_emergency_mode_log;
CREATE POLICY pol_emergency_log_select ON pos_emergency_mode_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'owner', 'manager', 'superadmin')
    )
  );

DROP POLICY IF EXISTS pol_emergency_log_insert ON pos_emergency_mode_log;
CREATE POLICY pol_emergency_log_insert ON pos_emergency_mode_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'owner', 'manager', 'superadmin')
    )
  );

DROP POLICY IF EXISTS pol_emergency_log_update ON pos_emergency_mode_log;
CREATE POLICY pol_emergency_log_update ON pos_emergency_mode_log
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- ============================================================================
-- FIX-DR3 helper: pos_emergency_sync_queue — cola de ventas creadas en
-- emergency mode, pendientes de sincronizar al backend cuando vuelva la red.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_emergency_sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid     TEXT UNIQUE NOT NULL,                     -- IndexedDB row id
  tenant_id       TEXT,
  user_id         UUID,
  payload         JSONB NOT NULL,                           -- venta completa
  emergency_log_id UUID REFERENCES pos_emergency_mode_log(id),
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  processed_status TEXT
                    CHECK (processed_status IN ('pending','ok','failed','duplicate')),
  error_msg       TEXT
);

CREATE INDEX IF NOT EXISTS idx_emergency_sync_pending
  ON pos_emergency_sync_queue(received_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emergency_sync_tenant
  ON pos_emergency_sync_queue(tenant_id, received_at DESC);

ALTER TABLE pos_emergency_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_emergency_sync_select ON pos_emergency_sync_queue;
CREATE POLICY pol_emergency_sync_select ON pos_emergency_sync_queue
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM pos_users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin','owner','manager','superadmin'))
  );

DROP POLICY IF EXISTS pol_emergency_sync_insert ON pos_emergency_sync_queue;
CREATE POLICY pol_emergency_sync_insert ON pos_emergency_sync_queue
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- Helper RPC: is_feature_enabled(key, [tenant_id]) — atajo para front
-- ============================================================================
CREATE OR REPLACE FUNCTION is_feature_enabled(
  p_key TEXT,
  p_tenant TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- Tenant scope wins over global
  IF p_tenant IS NOT NULL THEN
    SELECT enabled INTO v_enabled
      FROM pos_feature_flags
      WHERE key = p_key AND scope = 'tenant' AND scope_id = p_tenant
      LIMIT 1;
    IF v_enabled IS NOT NULL THEN RETURN v_enabled; END IF;
  END IF;

  -- Global default
  SELECT enabled INTO v_enabled
    FROM pos_feature_flags
    WHERE key = p_key AND scope = 'global'
    LIMIT 1;

  RETURN COALESCE(v_enabled, FALSE);
END;
$$;

COMMENT ON TABLE pos_feature_flags
  IS 'R8e DR4: runtime toggles para rollback sin redeploy. Lectura abierta autenticada.';
COMMENT ON TABLE pos_emergency_mode_log
  IS 'R8e DR5: bitácora de activación/desactivación de modo emergencia.';
COMMENT ON TABLE pos_emergency_sync_queue
  IS 'R8e DR3: cola de ventas creadas en emergency mode pendientes de sync.';

COMMIT;

-- ============================================================================
-- Smoke verification (run-after-apply):
--   SELECT key, enabled FROM pos_feature_flags ORDER BY key;     -- 4 rows
--   SELECT is_feature_enabled('emergency_mode');                 -- false
--   SELECT COUNT(*) FROM pos_emergency_mode_log;                 -- 0
--   SELECT COUNT(*) FROM pos_emergency_sync_queue;               -- 0
-- ============================================================================
