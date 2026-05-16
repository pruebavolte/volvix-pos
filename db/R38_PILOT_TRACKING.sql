-- R38_PILOT_TRACKING.sql — Tracking de clientes piloto + feedback

-- ============================================================
-- 1. Columnas de tracking en pos_tenants
-- ============================================================
ALTER TABLE public.pos_tenants ADD COLUMN IF NOT EXISTS is_pilot BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pos_tenants ADD COLUMN IF NOT EXISTS pilot_started_at TIMESTAMPTZ;
ALTER TABLE public.pos_tenants ADD COLUMN IF NOT EXISTS pilot_converted_at TIMESTAMPTZ;
ALTER TABLE public.pos_tenants ADD COLUMN IF NOT EXISTS pilot_feedback_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pos_tenants_pilots
  ON public.pos_tenants(is_pilot) WHERE is_pilot = TRUE;

-- ============================================================
-- 2. Tabla de feedback de pilotos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pilot_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  user_id         TEXT,
  type            TEXT NOT NULL CHECK (type IN ('bug','sugerencia','pregunta')),
  description     TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('poco_importante','importante','urgente')) DEFAULT 'importante',
  screenshot_url  TEXT,
  page_url        TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_pilot_feedback_tenant ON public.pilot_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_unresolved
  ON public.pilot_feedback(created_at DESC) WHERE resolved_at IS NULL;

-- RLS
ALTER TABLE public.pilot_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot_feedback_own_or_admin" ON public.pilot_feedback;
CREATE POLICY "pilot_feedback_own_or_admin" ON public.pilot_feedback FOR ALL
  USING (
    tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

-- ============================================================
-- 3. Trigger para autoincrementar feedback_count en tenant
-- ============================================================
CREATE OR REPLACE FUNCTION public.bump_pilot_feedback_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pos_tenants
  SET pilot_feedback_count = pilot_feedback_count + 1
  WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_feedback_count ON public.pilot_feedback;
CREATE TRIGGER trg_bump_feedback_count
  AFTER INSERT ON public.pilot_feedback
  FOR EACH ROW EXECUTE FUNCTION public.bump_pilot_feedback_count();

COMMENT ON TABLE public.pilot_feedback IS 'AGENTE V4 (Fase 2.5): feedback de clientes piloto vía boton flotante en POS.';
