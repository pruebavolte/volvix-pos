-- Migration 05: Crear tabla giros_terminologias (NUEVA)
-- Generado: 2026-05-18
--
-- Esta tabla es el corazón del sistema multi-giro:
-- - Define qué módulos están activos por giro
-- - Define qué terminologías reemplazar (cliente→paciente para dental, etc.)
-- - Permite override per-tenant (un tenant dental puede preferir "cliente" en vez de "paciente")

BEGIN;

CREATE TABLE IF NOT EXISTS giros_terminologias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_slug         VARCHAR(50) NOT NULL,         -- "navaja", "comandero", "discreto", etc.
  giro_name         VARCHAR(255),                  -- nombre humano "Barbería", "Restaurante"
  tenant_id         UUID,                          -- NULL = template global, UUID = override per-tenant
  terminologias     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"cliente":"paciente","producto":"servicio",...}
  modulos_activos   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["core","inventory","appointments",...]
  modulos_inactivos JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["kitchen","medical",...]
  campos_visibles   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"product":{"price_wholesale":false,...}}
  scian_code        VARCHAR(10),                   -- código SCIAN del INEGI
  version           INTEGER DEFAULT 1,
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT giros_terminologias_unique_per_tenant
    UNIQUE (giro_slug, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_giros_term_slug ON giros_terminologias(giro_slug);
CREATE INDEX IF NOT EXISTS idx_giros_term_tenant ON giros_terminologias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_giros_term_term_gin ON giros_terminologias USING GIN (terminologias);
CREATE INDEX IF NOT EXISTS idx_giros_term_modules_gin ON giros_terminologias USING GIN (modulos_activos);

-- Seed con los 30 giros prioritarios (basado en TERMINOLOGIAS.json)
-- NOTA: La carga completa la hace un script Node después de aprobar esta migration.
-- INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos) VALUES ...

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_giros_terminologias_updated_at ON giros_terminologias;
CREATE TRIGGER update_giros_terminologias_updated_at
  BEFORE UPDATE ON giros_terminologias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Para llenar después de la migration:
-- node .audit/scripts/seed-giros-terminologias.js (usa TERMINOLOGIAS.json)
