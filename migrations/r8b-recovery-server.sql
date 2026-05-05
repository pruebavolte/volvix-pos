-- ============================================================================
-- VOLVIX POS — Round 8b: RECOVERY SERVER-SIDE
-- Migration: r8b-recovery-server.sql
--
-- Closes 4 GAPs in Recovery / Continuity (R8a localStorage -> R8b server-side):
--
--   FIX-R1: pos_active_carts — server-side cart draft que sobrevive a cambios
--           de dispositivo. PATCH /api/cart/draft hace UPSERT por (user_id,
--           tenant_id) WHERE status='active'. GET retorna draft activo.
--           POST /api/cart/draft/clear marca status='cleared' tras venta.
--           Reusa idem_seed para que R1 idempotency_keys haga dedup si la
--           venta ya se cobró desde otro dispositivo.
--
--   FIX-R2: heartbeat + zombie sweep. ALTER pos_active_sessions: la columna
--           last_seen_at YA EXISTE desde R6a (DEFAULT NOW()). Agregamos
--           RPC sweep_zombie_sessions() que marca como revoked_at=NOW() las
--           sesiones con last_seen_at < NOW() - 5 min. Un trigger NOTIFY
--           publica session_revoked para que el cliente reciba el evento.
--
--   FIX-R3: tenant_settings.session_timeout_min para inactivity timeout
--           configurable por tenant (default 15 min). Owner puede subir a
--           60 o desactivar (=0). Cliente lee este valor en login.
--
--   FIX-R4: pos_event_stream — eventos broadcastable para multi-device sync.
--           cart_updated | sale_completed | permissions_changed | cut_closed.
--           Polling endpoint GET /api/events/poll?since=<ISO> filtra por
--           user_id + tenant_id + ts > since. TTL 24h.
--
-- Idempotente: usa CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO $$.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX-R1: pos_active_carts — server-side cart drafts (cross-device recovery)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_active_carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  tenant_id         TEXT NOT NULL,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count        INTEGER NOT NULL DEFAULT 0,
  idem_seed         TEXT,                              -- preserves R1 idempotency seed
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','cleared','expired')),
  device_info       TEXT,
  ticket_number     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_modified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at        TIMESTAMPTZ
);

-- Solo UN draft activo por (user_id, tenant_id). UPSERT compatible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_active_carts_user_active
  ON pos_active_carts(user_id, tenant_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_pos_active_carts_tenant
  ON pos_active_carts(tenant_id, last_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_active_carts_user
  ON pos_active_carts(user_id, last_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_active_carts_active
  ON pos_active_carts(status, last_modified_at DESC) WHERE status = 'active';

COMMENT ON TABLE pos_active_carts IS
  'R8b FIX-R1: server-side cart drafts. Sobrevive cambio dispositivo. UPSERT por (user_id, tenant_id) WHERE status=active.';

-- TTL housekeeping function: drafts >30 min sin actividad → expired
CREATE OR REPLACE FUNCTION purge_stale_cart_drafts()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE pos_active_carts
     SET status = 'expired'
   WHERE status = 'active'
     AND last_modified_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  -- Hard delete drafts >7 days
  DELETE FROM pos_active_carts
   WHERE status IN ('cleared','expired')
     AND COALESCE(cleared_at, last_modified_at) < NOW() - INTERVAL '7 days';
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- FIX-R2: heartbeat + zombie sweep on pos_active_sessions (R6a table)
-- ============================================================================

-- last_seen_at ya existe en r6a-auth-hardening.sql. Garantizamos por idempotencia:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pos_active_sessions' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE pos_active_sessions
      ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_active_sessions_last_seen
  ON pos_active_sessions(last_seen_at DESC) WHERE revoked_at IS NULL;

-- Sweep RPC: revoca sesiones zombies (sin heartbeat >5 min)
CREATE OR REPLACE FUNCTION sweep_zombie_sessions(timeout_min INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
  swept_count INTEGER;
BEGIN
  UPDATE pos_active_sessions
     SET revoked_at = NOW(),
         revoked_reason = 'zombie_timeout'
   WHERE revoked_at IS NULL
     AND last_seen_at < NOW() - (timeout_min || ' minutes')::INTERVAL;
  GET DIAGNOSTICS swept_count = ROW_COUNT;
  RETURN swept_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sweep_zombie_sessions(INTEGER) IS
  'R8b FIX-R2: marca como revoked_at las sesiones sin heartbeat reciente. Llamar desde cron cada 5 min.';


-- ============================================================================
-- FIX-R3: tenant_settings.session_timeout_min — inactivity timeout config
-- ============================================================================
DO $$
BEGIN
  -- Asegurar que tenant_settings exista (tabla de settings por tenant)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_settings') THEN
    CREATE TABLE tenant_settings (
      tenant_id              TEXT PRIMARY KEY,
      tax_rate               NUMERIC(6,4) NOT NULL DEFAULT 0.16,
      currency               TEXT NOT NULL DEFAULT 'MXN',
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  -- Agregar la columna si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='tenant_settings' AND column_name='session_timeout_min'
  ) THEN
    ALTER TABLE tenant_settings
      ADD COLUMN session_timeout_min INTEGER NOT NULL DEFAULT 15
        CHECK (session_timeout_min >= 0 AND session_timeout_min <= 480);
  END IF;

  -- Owner-tier override: timeout más laxo para sesiones owner
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='tenant_settings' AND column_name='session_timeout_owner_min'
  ) THEN
    ALTER TABLE tenant_settings
      ADD COLUMN session_timeout_owner_min INTEGER NOT NULL DEFAULT 60
        CHECK (session_timeout_owner_min >= 0 AND session_timeout_owner_min <= 1440);
  END IF;
END $$;

COMMENT ON COLUMN tenant_settings.session_timeout_min IS
  'R8b FIX-R3: minutos de inactividad antes de auto-logout en cliente. 0 = desactivado. Default 15.';


-- ============================================================================
-- FIX-R4: pos_event_stream — broadcastable events para multi-device sync
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_event_stream (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,                         -- NULL = broadcast to all users in tenant
  tenant_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL
                 CHECK (event_type IN (
                   'cart_updated','sale_completed','permissions_changed',
                   'cut_closed','cut_opened','session_revoked',
                   'inventory_updated','customer_updated','price_updated'
                 )),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_jti   TEXT,                         -- jti del dispositivo que emitió el evento (para no eco)
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_pos_event_stream_user_ts
  ON pos_event_stream(user_id, ts DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_event_stream_tenant_ts
  ON pos_event_stream(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_event_stream_expires
  ON pos_event_stream(expires_at);
CREATE INDEX IF NOT EXISTS idx_pos_event_stream_tenant_user_ts
  ON pos_event_stream(tenant_id, user_id, ts DESC);

COMMENT ON TABLE pos_event_stream IS
  'R8b FIX-R4: stream de eventos para multi-device sync. user_id NULL = broadcast tenant. Polling GET /api/events/poll?since=<ISO>. TTL 24h.';

-- TTL purge
CREATE OR REPLACE FUNCTION purge_expired_event_stream()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM pos_event_stream WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- RLS — minimal policies (service-role bypass; tenant-scoped reads)
-- ============================================================================
DO $$
BEGIN
  -- pos_active_carts: user reads own; service writes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_active_carts') THEN
    EXECUTE 'ALTER TABLE pos_active_carts ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_self_read ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_service_all ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY pac_self_read ON pos_active_carts
        FOR SELECT USING (
          user_id = auth.uid()
          OR tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY pac_service_all ON pos_active_carts
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;

  -- pos_event_stream: user reads own + tenant-broadcast; service writes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_event_stream') THEN
    EXECUTE 'ALTER TABLE pos_event_stream ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_self_read ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_service_all ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY pes_self_read ON pos_event_stream
        FOR SELECT USING (
          user_id = auth.uid()
          OR (user_id IS NULL AND tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id'))
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY pes_service_all ON pos_event_stream
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;

  -- tenant_settings: tenant-scoped read + owner write
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_settings') THEN
    EXECUTE 'ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_self_read ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_service_all ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY ts_self_read ON tenant_settings
        FOR SELECT USING (
          tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY ts_service_all ON tenant_settings
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;
END $$;


-- ============================================================================
-- Trigger: auto-update last_modified_at en pos_active_carts
-- ============================================================================
CREATE OR REPLACE FUNCTION pos_active_carts_set_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pos_active_carts_modified'
  ) THEN
    CREATE TRIGGER trg_pos_active_carts_modified
    BEFORE UPDATE ON pos_active_carts
    FOR EACH ROW EXECUTE FUNCTION pos_active_carts_set_modified();
  END IF;
END $$;


COMMIT;

-- ============================================================================
-- Smoke checks (manual after deploy):
--   1. PATCH /api/cart/draft with body {items:[{code:'X',name:'Y',price:10,qty:1}],total:10}
--      → SELECT * FROM pos_active_carts WHERE user_id=<u> AND status='active';
--   2. SELECT sweep_zombie_sessions(5);  -- should mark zombies as revoked
--   3. INSERT INTO tenant_settings (tenant_id) VALUES ('TNT001') ON CONFLICT DO NOTHING;
--      SELECT session_timeout_min FROM tenant_settings WHERE tenant_id='TNT001';  -- 15
--   4. INSERT INTO pos_event_stream (tenant_id, event_type, payload)
--        VALUES ('TNT001','cart_updated','{"qty":3}');
--      SELECT * FROM pos_event_stream WHERE tenant_id='TNT001' ORDER BY ts DESC;
--   5. SELECT purge_expired_event_stream();  -- cron-friendly
-- ============================================================================
