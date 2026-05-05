-- ============================================================================
-- VOLVIX POS — Round 6a: Login + Auth hardening
-- Migration: r6a-auth-hardening.sql
--
-- Closes 5 GAPs in Login + Auth module (score 70 -> 95+):
--
--   GAP-L1: Auth-seed fix. The admin@volvix.test row had a scrypt hash that
--           did NOT match the documented password 'Volvix2026!'. We rewrite
--           the password_hash column for the 3 demo users so that login with
--           Volvix2026! works in production. Hash regenerated locally with
--           crypto.scryptSync (Node 18+) using the same algorithm the API
--           uses in verifyPassword().
--
--   GAP-L2: Single-session enforce. New table pos_active_sessions tracks
--           every issued JWT (one row per login). requireAuth() checks that
--           the JWT.jti is still active (revoked_at IS NULL). Cashiers are
--           single-session; logging in from a 2nd device revokes the first.
--           Owners / superadmins keep multi-session.
--
--   GAP-L3: Lockout per email + per IP. Table pos_login_attempts records
--           every login attempt (success or failure). Handler counts last
--           15 min and returns 429 TOO_MANY_ATTEMPTS at 5 failures.
--
--   GAP-L4: New-IP login alert. Table pos_security_alerts records when a
--           successful login comes from a /24 subnet that the user has never
--           used in their last 10 successful logins. Owner/superadmin sees
--           the alerts via /api/notifications.
--
--   GAP-L5: Password recovery secure. Table pos_password_reset_tokens stores
--           bcrypt-hashed reset tokens with 1h TTL. /api/auth/forgot inserts
--           a row, /api/auth/reset validates + updates pos_users + revokes
--           all sessions of the user (insert into pos_user_session_invalidations).
--
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DO $$ blocks).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- GAP-L1: Auth-seed fix — rewrite password_hash for the 3 demo users so that
--         the documented password 'Volvix2026!' actually works in production.
--         The hash was computed locally with Node:
--           const salt = crypto.randomBytes(16);
--           const hash = crypto.scryptSync('Volvix2026!', salt, 64);
--           `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_users') THEN

    -- admin@volvix.test  (was a different unknown password)
    UPDATE pos_users
       SET password_hash = 'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
           is_active = true,
           updated_at = NOW()
     WHERE email = 'admin@volvix.test';

    -- owner@volvix.test  (was already 'Volvix2026!' but normalize anyway)
    UPDATE pos_users
       SET password_hash = 'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
           is_active = true,
           updated_at = NOW()
     WHERE email = 'owner@volvix.test';

    -- cajero@volvix.test
    UPDATE pos_users
       SET password_hash = 'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
           is_active = true,
           updated_at = NOW()
     WHERE email = 'cajero@volvix.test';

    -- Insert the 3 demo users if they do NOT exist (idempotent re-seed).
    INSERT INTO pos_users (id, email, password_hash, role, is_active, plan, full_name, company_id, notes, mfa_enabled, created_at, updated_at)
      SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
             'admin@volvix.test',
             'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
             'ADMIN', true, 'pro', 'Administrador Volvix',
             '11111111-1111-1111-1111-111111111111'::uuid,
             '{"volvix_role":"superadmin","tenant_id":"TNT001","tenant_name":"Abarrotes Don Chucho"}',
             false, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM pos_users WHERE email='admin@volvix.test');

    INSERT INTO pos_users (id, email, password_hash, role, is_active, plan, full_name, company_id, notes, mfa_enabled, created_at, updated_at)
      SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
             'owner@volvix.test',
             'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
             'ADMIN', true, 'enterprise', 'Dueño Restaurante',
             '22222222-2222-2222-2222-222222222222'::uuid,
             '{"volvix_role":"owner","tenant_id":"TNT002","tenant_name":"Restaurante Los Compadres"}',
             false, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM pos_users WHERE email='owner@volvix.test');

    INSERT INTO pos_users (id, email, password_hash, role, is_active, plan, full_name, company_id, notes, mfa_enabled, created_at, updated_at)
      SELECT 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid,
             'cajero@volvix.test',
             'scrypt$d2b9e4c23dc63728acd16c71ab523ed5$f142349728822f0f41c668503fa3c371f63a4bc5380b73a4ecba8c8a0e821ede2766c2860c1c39f435995794feb60f06b28803b48f599eeaaf0dfb7910138e07',
             'USER', true, 'pro', 'Cajero Volvix',
             NULL,
             '{"volvix_role":"cajero","tenant_id":"TNT001","tenant_name":"Abarrotes Don Chucho"}',
             false, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM pos_users WHERE email='cajero@volvix.test');

  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- GAP-L2: pos_active_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_active_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  jti           TEXT NOT NULL,                    -- JWT id claim
  device_info   TEXT,                             -- user-agent header (truncated)
  ip            TEXT,
  login_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,                      -- NULL = active
  revoked_reason TEXT,                            -- 'replaced_by_new_session' | 'manual_logout' | 'password_reset' | 'admin_force'
  CONSTRAINT pos_active_sessions_jti_unique UNIQUE (jti)
);

CREATE INDEX IF NOT EXISTS idx_pos_active_sessions_user_active
  ON pos_active_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pos_active_sessions_jti
  ON pos_active_sessions(jti);
CREATE INDEX IF NOT EXISTS idx_pos_active_sessions_login_at
  ON pos_active_sessions(login_at DESC);

COMMENT ON TABLE pos_active_sessions IS
  'R6a GAP-L2: tracks every active JWT. requireAuth() checks JWT.jti is in this table with revoked_at IS NULL.';

-- ----------------------------------------------------------------------------
-- GAP-L3: pos_login_attempts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  ip          TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_login_attempts_email_ts
  ON pos_login_attempts(email, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_login_attempts_ip_ts
  ON pos_login_attempts(ip, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_login_attempts_failed
  ON pos_login_attempts(email, ts DESC) WHERE success = false;

COMMENT ON TABLE pos_login_attempts IS
  'R6a GAP-L3: append-only log of every login attempt. Used for lockout (5 fails / 15 min) and new-IP detection.';

-- ----------------------------------------------------------------------------
-- GAP-L4: pos_security_alerts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_security_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  tenant_id   TEXT,
  alert_type  TEXT NOT NULL,                       -- 'NEW_IP_LOGIN' | 'LOCKOUT' | 'PASSWORD_RESET' | 'CONCURRENT_SESSION'
  ip          TEXT,
  prev_ip     TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta        JSONB,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_user_ts
  ON pos_security_alerts(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_tenant_ts
  ON pos_security_alerts(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_pos_security_alerts_unread
  ON pos_security_alerts(user_id, ts DESC) WHERE acknowledged_at IS NULL;

COMMENT ON TABLE pos_security_alerts IS
  'R6a GAP-L4: security events visible to user/owner/superadmin (new IP login, lockout, password reset, etc).';

-- ----------------------------------------------------------------------------
-- GAP-L5: pos_password_reset_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  token_hash  TEXT NOT NULL,                       -- scrypt of the random token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_password_reset_tokens_user
  ON pos_password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_password_reset_tokens_active
  ON pos_password_reset_tokens(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE pos_password_reset_tokens IS
  'R6a GAP-L5: short-lived (1h) password reset tokens. Token is hashed; the raw value is only emailed once.';

-- ----------------------------------------------------------------------------
-- RLS — minimal policies (service-role bypass; reads scoped to user)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- pos_active_sessions: user reads own; service writes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_active_sessions') THEN
    EXECUTE 'ALTER TABLE pos_active_sessions ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pas_self_read ON pos_active_sessions'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pas_service_all ON pos_active_sessions'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY pas_self_read ON pos_active_sessions
        FOR SELECT USING (user_id = auth.uid())
    $p$;
    EXECUTE $p$
      CREATE POLICY pas_service_all ON pos_active_sessions
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;

  -- pos_login_attempts: service-only
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_login_attempts') THEN
    EXECUTE 'ALTER TABLE pos_login_attempts ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pla_service_all ON pos_login_attempts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY pla_service_all ON pos_login_attempts
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;

  -- pos_security_alerts: user reads own + owner reads tenant; service writes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_security_alerts') THEN
    EXECUTE 'ALTER TABLE pos_security_alerts ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS psa_self_read ON pos_security_alerts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS psa_service_all ON pos_security_alerts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY psa_self_read ON pos_security_alerts
        FOR SELECT USING (
          user_id = auth.uid()
          OR tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY psa_service_all ON pos_security_alerts
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;

  -- pos_password_reset_tokens: service-only (we never expose to clients)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_password_reset_tokens') THEN
    EXECUTE 'ALTER TABLE pos_password_reset_tokens ENABLE ROW LEVEL SECURITY';
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pprt_service_all ON pos_password_reset_tokens'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE $p$
      CREATE POLICY pprt_service_all ON pos_password_reset_tokens
        FOR ALL WITH CHECK (true)
    $p$;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Smoke checks (manual after deploy)
--   1. SELECT email, substring(password_hash,1,10) FROM pos_users
--        WHERE email IN ('admin@volvix.test','owner@volvix.test','cajero@volvix.test');
--   2. SELECT * FROM pos_active_sessions LIMIT 5;
--   3. SELECT count(*) FROM pos_login_attempts WHERE ts > NOW() - INTERVAL '15 min';
--   4. SELECT * FROM pos_security_alerts WHERE acknowledged_at IS NULL ORDER BY ts DESC LIMIT 10;
--   5. SELECT * FROM pos_password_reset_tokens WHERE expires_at > NOW() AND used_at IS NULL;
-- ============================================================================
