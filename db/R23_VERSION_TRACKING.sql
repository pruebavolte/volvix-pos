-- ============================================================================
-- R23_VERSION_TRACKING.sql · 2026-05-11
-- Tablas para control de versiones de apps (.exe / .apk / PWA)
-- + estadísticas de descargas desde la landing
-- ============================================================================

-- Tabla principal: versión actual instalada por (tenant, plataforma)
CREATE TABLE IF NOT EXISTS volvix_app_versions (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT,                         -- NULL si la PWA reporta sin sesión
  platform    TEXT NOT NULL,                -- 'windows' | 'android' | 'pwa' | 'ios'
  version     TEXT NOT NULL,                -- semver: '1.0.157'
  user_agent  TEXT,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform)
);

-- Índices para consultas frecuentes del panel admin
CREATE INDEX IF NOT EXISTS idx_app_versions_platform     ON volvix_app_versions(platform);
CREATE INDEX IF NOT EXISTS idx_app_versions_version      ON volvix_app_versions(version);
CREATE INDEX IF NOT EXISTS idx_app_versions_last_seen    ON volvix_app_versions(last_seen DESC);

-- Mantener `first_seen` al insertar, actualizar `last_seen` en upsert
CREATE OR REPLACE FUNCTION upd_app_version_timestamp() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_seen := COALESCE(NEW.first_seen, NOW());
    NEW.last_seen  := NOW();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.first_seen := OLD.first_seen;
    NEW.last_seen  := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_versions_ts ON volvix_app_versions;
CREATE TRIGGER trg_app_versions_ts
  BEFORE INSERT OR UPDATE ON volvix_app_versions
  FOR EACH ROW EXECUTE FUNCTION upd_app_version_timestamp();

-- ============================================================================
-- Estadísticas de descargas (botones de la landing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS volvix_download_stats (
  id        BIGSERIAL PRIMARY KEY,
  type      TEXT NOT NULL,    -- 'exe' | 'apk' | 'apk-cliente' | 'pwa'
  platform  TEXT,             -- 'windows' | 'android' | 'web'
  ip        TEXT,
  referrer  TEXT,
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dl_stats_type      ON volvix_download_stats(type);
CREATE INDEX IF NOT EXISTS idx_dl_stats_ts        ON volvix_download_stats(ts DESC);

-- ============================================================================
-- Vista resumen para el dashboard: cuántos están al día vs desactualizados
-- ============================================================================
CREATE OR REPLACE VIEW v_volvix_version_summary AS
SELECT
  platform,
  version,
  COUNT(*) AS install_count,
  MAX(last_seen) AS last_seen_any
FROM volvix_app_versions
GROUP BY platform, version
ORDER BY platform, version DESC;

-- ============================================================================
-- RLS: solo superadmins ven los datos crudos
-- (los endpoints del API usan SERVICE_ROLE_KEY que bypassa RLS)
-- ============================================================================
ALTER TABLE volvix_app_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_download_stats ENABLE ROW LEVEL SECURITY;

-- Política: lectura solo para service_role (el API)
DROP POLICY IF EXISTS p_app_versions_service  ON volvix_app_versions;
CREATE POLICY p_app_versions_service ON volvix_app_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_dl_stats_service ON volvix_download_stats;
CREATE POLICY p_dl_stats_service ON volvix_download_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Cómo ejecutar:
--   psql "$DATABASE_URL" -f db/R23_VERSION_TRACKING.sql
--   o pegarlo en Supabase SQL Editor
-- ============================================================================
