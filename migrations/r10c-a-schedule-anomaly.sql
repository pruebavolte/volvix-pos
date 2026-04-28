-- ============================================================================
-- R10c-A — NIVEL 3 BACKEND: schedule + anomaly + cleanup
-- Idempotente. 3 fixes:
-- ============================================================================
--   FIX-N3-1: business_hours schedule (block sales fuera de horario)
--   FIX-N3-2: pos_login_fingerprints (prestar cuenta detection)
--   FIX-N3-3: cleanup_abandoned_carts() (carritos zombies)
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r10c-a-schedule-anomaly.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- FIX-N3-1: business_hours en tenant_settings + per-user override
-- ---------------------------------------------------------------------------

-- Asegurar que tenant_settings existe (idempotente)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ALTER tenant_settings ADD business_hours JSONB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tenant_settings' AND column_name = 'business_hours'
  ) THEN
    ALTER TABLE tenant_settings
      ADD COLUMN business_hours JSONB DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN tenant_settings.business_hours IS
  'R10c-A FIX-N3-1: horario laboral. Formato: {"timezone":"America/Mexico_City","schedule":{"mon":{"open":"08:00","close":"22:00"},"tue":{...},"wed":{...},"thu":{...},"fri":{...},"sat":{...},"sun":null}}. NULL = 24/7 sin restricción.';

-- ALTER pos_users ADD allowed_hours_override JSONB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pos_users' AND column_name = 'allowed_hours_override'
  ) THEN
    ALTER TABLE pos_users
      ADD COLUMN allowed_hours_override JSONB DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN pos_users.allowed_hours_override IS
  'R10c-A FIX-N3-1: override per-user del business_hours del tenant. Mismo formato. NULL = usa tenant default.';

-- ---------------------------------------------------------------------------
-- FIX-N3-2: pos_login_fingerprints (anomaly detection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_login_fingerprints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  tenant_id          TEXT,
  fingerprint_hash   TEXT NOT NULL,        -- sha256(ip|ua|screen|tz)
  ip                 TEXT,
  user_agent         TEXT,
  screen_resolution  TEXT,
  timezone_offset    INTEGER,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  login_count        INTEGER NOT NULL DEFAULT 1
);

-- UNIQUE(user_id, fingerprint_hash)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'pos_login_fingerprints' AND indexname = 'uq_pos_login_fingerprints_user_hash'
  ) THEN
    CREATE UNIQUE INDEX uq_pos_login_fingerprints_user_hash
      ON pos_login_fingerprints(user_id, fingerprint_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_login_fingerprints_user_lastseen
  ON pos_login_fingerprints(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_login_fingerprints_tenant
  ON pos_login_fingerprints(tenant_id, last_seen_at DESC);

COMMENT ON TABLE pos_login_fingerprints IS
  'R10c-A FIX-N3-2: huellas digitales de sesion (ip+ua+screen+tz). Detecta cuenta compartida (>3 fingerprints/hora = LIKELY_SHARED_ACCOUNT).';

-- RLS
ALTER TABLE pos_login_fingerprints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_login_fp_iso_select ON pos_login_fingerprints; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_login_fp_iso_insert ON pos_login_fingerprints; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_login_fp_iso_update ON pos_login_fingerprints; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_login_fp_iso_select
  ON pos_login_fingerprints FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR user_id::text = (auth.jwt() ->> 'sub')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

CREATE POLICY pos_login_fp_iso_insert
  ON pos_login_fingerprints FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR user_id::text = (auth.jwt() ->> 'sub')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

CREATE POLICY pos_login_fp_iso_update
  ON pos_login_fingerprints FOR UPDATE
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR user_id::text = (auth.jwt() ->> 'sub')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner')
  );

-- ---------------------------------------------------------------------------
-- FIX-N3-3: cleanup_abandoned_carts()
-- Marca carts > 1 hora sin update como 'abandoned' y libera reservas atomicas.
-- ---------------------------------------------------------------------------

-- CHECK constraint expandido para 'abandoned' (idempotente)
DO $$
BEGIN
  -- Drop old check si solo permitia ('active','cleared','expired')
  BEGIN
    ALTER TABLE pos_active_carts DROP CONSTRAINT IF EXISTS pos_active_carts_status_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Re-add con 'abandoned'
  BEGIN
    ALTER TABLE pos_active_carts
      ADD CONSTRAINT pos_active_carts_status_check
      CHECK (status IN ('active','cleared','expired','abandoned'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Funcion principal: cleanup_abandoned_carts() SECURITY DEFINER
CREATE OR REPLACE FUNCTION cleanup_abandoned_carts(
  p_idle_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  cleaned_count INTEGER,
  released_items INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart RECORD;
  v_item JSONB;
  v_cleaned INTEGER := 0;
  v_released INTEGER := 0;
  v_qty NUMERIC;
  v_pid UUID;
  v_tnt TEXT;
  v_ok BOOLEAN;
  v_audit_rows JSONB := '[]'::jsonb;
BEGIN
  IF p_idle_minutes IS NULL OR p_idle_minutes < 5 THEN
    p_idle_minutes := 60;
  END IF;

  -- Iterar carts activos > N minutos sin update
  FOR v_cart IN
    SELECT id, user_id, tenant_id, items
      FROM pos_active_carts
     WHERE status = 'active'
       AND last_modified_at < NOW() - (p_idle_minutes || ' minutes')::INTERVAL
     ORDER BY last_modified_at ASC
     LIMIT 500
  LOOP
    v_tnt := v_cart.tenant_id;

    -- Liberar cada item reservado (best-effort)
    IF v_cart.items IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_cart.items)
      LOOP
        BEGIN
          v_pid := NULL;
          v_qty := COALESCE((v_item->>'qty')::NUMERIC, 0);
          IF (v_item->>'id') IS NOT NULL AND (v_item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_pid := (v_item->>'id')::UUID;
          END IF;
          IF v_pid IS NOT NULL AND v_qty > 0 AND v_tnt IS NOT NULL THEN
            -- call release_product_atomic (R10a)
            BEGIN
              PERFORM release_product_atomic(v_tnt, v_pid, v_qty);
              v_released := v_released + 1;
            EXCEPTION WHEN OTHERS THEN
              -- fail-open: si la funcion no existe o el producto fue eliminado, seguir
              NULL;
            END;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END LOOP;
    END IF;

    -- Marcar cart como 'abandoned'
    UPDATE pos_active_carts
       SET status     = 'abandoned',
           cleared_at = NOW()
     WHERE id = v_cart.id;
    v_cleaned := v_cleaned + 1;

    -- Acumular audit
    v_audit_rows := v_audit_rows || jsonb_build_object(
      'cart_id', v_cart.id,
      'user_id', v_cart.user_id,
      'tenant_id', v_cart.tenant_id,
      'item_count', COALESCE(jsonb_array_length(v_cart.items), 0)
    );

    -- Audit log (best-effort: si la tabla no existe, ignorar)
    BEGIN
      INSERT INTO pos_audit_log (tenant_id, user_id, action, resource, meta, ts)
      VALUES (
        v_cart.tenant_id,
        v_cart.user_id,
        'cart.abandoned_cleanup',
        'pos_active_carts',
        jsonb_build_object(
          'cart_id', v_cart.id,
          'idle_minutes', p_idle_minutes,
          'item_count', COALESCE(jsonb_array_length(v_cart.items), 0)
        ),
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Probar con volvix_audit_log
      BEGIN
        INSERT INTO volvix_audit_log (tenant_id, user_id, action, resource, meta, ts)
        VALUES (
          v_cart.tenant_id,
          v_cart.user_id,
          'cart.abandoned_cleanup',
          'pos_active_carts',
          jsonb_build_object(
            'cart_id', v_cart.id,
            'idle_minutes', p_idle_minutes,
            'item_count', COALESCE(jsonb_array_length(v_cart.items), 0)
          ),
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END LOOP;

  RETURN QUERY SELECT v_cleaned, v_released, jsonb_build_object('rows', v_audit_rows, 'idle_minutes', p_idle_minutes);
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_abandoned_carts(INTEGER) TO authenticated, anon, service_role;

COMMENT ON FUNCTION cleanup_abandoned_carts(INTEGER) IS
  'R10c-A FIX-N3-3: marca carts inactivos >N minutos como abandoned, libera reservas atomicas (R10a) y registra audit. Cron-able.';

COMMIT;
