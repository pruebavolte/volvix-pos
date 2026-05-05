-- =============================================================
-- R14: MFA (TOTP + backup codes)
-- =============================================================

-- 1) Extender pos_users
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret  text,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes text[] NOT NULL DEFAULT '{}';

-- 2) Tabla de intentos para rate-limit / auditoría
CREATE TABLE IF NOT EXISTS mfa_attempts (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES pos_users(id) ON DELETE CASCADE,
  ts        timestamptz NOT NULL DEFAULT now(),
  ip        text,
  success   boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_ts
  ON mfa_attempts (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_attempts_ip_ts
  ON mfa_attempts (ip, ts DESC);

-- 3) Vista helper: intentos fallidos en últimos 15 min
CREATE OR REPLACE VIEW mfa_recent_failures AS
SELECT user_id, count(*) AS failures
FROM mfa_attempts
WHERE ts > now() - interval '15 minutes'
  AND success = false
GROUP BY user_id;
