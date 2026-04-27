-- ============================================================================
-- R17_OCR.sql — Tabla para escaneos OCR de tickets/recibos (Volvix POS)
-- Ejecutar en Supabase SQL editor (idempotente).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ocr_scans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  tenant_id    text,
  raw_text     text,
  parsed       jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url    text,
  purchase_id  uuid,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','linked','rejected','error')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_scans_user      ON public.ocr_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_tenant    ON public.ocr_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_created   ON public.ocr_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_purchase  ON public.ocr_scans(purchase_id);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_parsed_gin ON public.ocr_scans USING gin (parsed);

-- RLS: cada usuario solo ve sus escaneos (alineado a R13/R16 hardening)
ALTER TABLE public.ocr_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ocr_scans_select_own ON public.ocr_scans;
CREATE POLICY ocr_scans_select_own ON public.ocr_scans
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ocr_scans_insert_own ON public.ocr_scans;
CREATE POLICY ocr_scans_insert_own ON public.ocr_scans
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ocr_scans_update_own ON public.ocr_scans;
CREATE POLICY ocr_scans_update_own ON public.ocr_scans
  FOR UPDATE USING (user_id = auth.uid());

COMMENT ON TABLE public.ocr_scans IS 'R17 OCR de tickets MX: raw_text + parsed{total,date,rfc,items[]}';
