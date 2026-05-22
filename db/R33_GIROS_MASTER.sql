-- =====================================================================
-- R33 · GIROS MASTER (Single Source of Truth)
-- Migra giros-ecosystem.json (static file en repo) + INDUSTRY_PROFILES
-- + INDUSTRY_LABELS + GIRO_CATEGORIES (hardcoded en HTML) a una sola tabla.
-- El panel paneldecontrol.html#permisos pasa a leer 100% de Supabase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.volvix_giros_master (
  slug                     TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  emoji                    TEXT,                            -- "🌮", "☕", etc.
  category                 TEXT,                            -- "Comida & Bebida", "Servicios"
  que_vende                TEXT,
  tipo_operacion           TEXT,
  regulacion               JSONB,
  cadena_valor             JSONB,                           -- {proveedores:[], clientes_finales:[]}
  competidores_sector      JSONB,                           -- POS/ERP rivales con URLs
  funcionalidades_criticas JSONB,                           -- features que el POS DEBE tener
  problemas_evitar         JSONB,                           -- pain points sector
  terminologia             JSONB,                           -- generico → giro
  productos_plantilla      JSONB,                           -- top 10 productos con imagen
  modules_enabled          JSONB,                           -- {inventario:true, kardex:false,...}
  landing_url              TEXT,
  landing_type             TEXT,                            -- 'fisica' | 'template' | 'llm_generated'
  source                   TEXT DEFAULT 'ecosystem',        -- 'ecosystem' | 'hardcoded' | 'llm_generated'
  is_active                BOOLEAN DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_giros_master_category   ON public.volvix_giros_master (category);
CREATE INDEX IF NOT EXISTS idx_giros_master_updated_at ON public.volvix_giros_master (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_giros_master_source     ON public.volvix_giros_master (source);
CREATE INDEX IF NOT EXISTS idx_giros_master_active     ON public.volvix_giros_master (is_active) WHERE is_active = true;

-- Trigger para auto-actualizar updated_at en cualquier UPDATE
CREATE OR REPLACE FUNCTION public._volvix_giros_master_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_giros_master_touch ON public.volvix_giros_master;
CREATE TRIGGER trg_giros_master_touch
  BEFORE UPDATE ON public.volvix_giros_master
  FOR EACH ROW
  EXECUTE FUNCTION public._volvix_giros_master_touch_updated_at();

-- RLS: service_role escribe (server-side seed + admin); authenticated lee
ALTER TABLE public.volvix_giros_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "giros_master_service_all" ON public.volvix_giros_master;
CREATE POLICY "giros_master_service_all" ON public.volvix_giros_master
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "giros_master_public_read" ON public.volvix_giros_master;
CREATE POLICY "giros_master_public_read" ON public.volvix_giros_master
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

COMMENT ON TABLE public.volvix_giros_master IS
  'V13.31 SSOT - Single Source of Truth para giros. Migra giros-ecosystem.json + INDUSTRY_PROFILES + INDUSTRY_LABELS + GIRO_CATEGORIES a Supabase. Panel paneldecontrol.html lee de aquí en lugar de archivo estático.';
