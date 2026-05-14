-- R16_REMOTE_SUPPORT.sql
-- 2026-05-13 — Persistencia de sesiones de control remoto en Supabase.
-- Antes estaba en memoria (global.__VOLVIX_RSS Map) y se perdia entre invocaciones
-- de Vercel serverless: cada lambda tenia su propio Map, asi que cuando el viewer
-- poleaba /status, pegaba una lambda distinta y la sesion "no existia".

-- Ejecutar UNA VEZ en el SQL editor de Supabase.

CREATE TABLE IF NOT EXISTS volvix_remote_sessions (
  id                       TEXT PRIMARY KEY,
  code                     TEXT NOT NULL,
  requester_email          TEXT NOT NULL,
  requester_id             TEXT,
  target_email             TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending',
  consent_text             TEXT,
  code_attempts            INTEGER DEFAULT 0,
  expired_reason           TEXT,
  quicksupport_requested   BOOLEAN DEFAULT FALSE,
  quicksupport_provider    TEXT,
  client_platform_os       TEXT,
  client_platform_browser  TEXT,
  client_platform_pwa      BOOLEAN DEFAULT FALSE,
  client_platform_ua       TEXT,
  created_at               BIGINT NOT NULL,
  updated_at               BIGINT NOT NULL,
  accepted_at              BIGINT,
  verified_at              BIGINT,
  rejected_at              BIGINT,
  ended_at                 BIGINT
);

-- Idempotent: agregar columnas si la tabla ya existia sin platform info
ALTER TABLE volvix_remote_sessions ADD COLUMN IF NOT EXISTS client_platform_os TEXT;
ALTER TABLE volvix_remote_sessions ADD COLUMN IF NOT EXISTS client_platform_browser TEXT;
ALTER TABLE volvix_remote_sessions ADD COLUMN IF NOT EXISTS client_platform_pwa BOOLEAN DEFAULT FALSE;
ALTER TABLE volvix_remote_sessions ADD COLUMN IF NOT EXISTS client_platform_ua TEXT;

CREATE INDEX IF NOT EXISTS idx_remote_sessions_target
  ON volvix_remote_sessions(target_email, status);

CREATE INDEX IF NOT EXISTS idx_remote_sessions_updated
  ON volvix_remote_sessions(updated_at);

-- Cola de mensajes de signaling WebRTC (offer/answer/ice/quicksupport).
-- El admin POSTea con to_role=client, el cliente POSTea con to_role=admin.
-- GET drena los mensajes pendientes (consumed_at IS NULL) para el rol.
CREATE TABLE IF NOT EXISTS volvix_remote_signals (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  to_role     TEXT NOT NULL CHECK (to_role IN ('admin','client')),
  message     JSONB NOT NULL,
  created_at  BIGINT NOT NULL,
  consumed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_remote_signals_pending
  ON volvix_remote_signals(session_id, to_role)
  WHERE consumed_at IS NULL;

-- RLS — solo el service role accede (las llamadas pasan por backend)
ALTER TABLE volvix_remote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_remote_signals ENABLE ROW LEVEL SECURITY;

-- No policies needed because we only access via service-role key from backend.
