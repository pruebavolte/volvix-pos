-- =============================================================
-- 2026_pos_leads_and_tour_progress.sql
-- Adds:
--   1) pos_leads          — landing-page lead capture pipeline
--   2) volvix_user_tour_progress — cross-device tour progress sync
-- =============================================================

-- ---------- 1) pos_leads ----------
CREATE TABLE IF NOT EXISTS pos_leads (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text,
  email         text,
  phone         text,
  giro          text,
  message       text,
  source        text DEFAULT 'web',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  status        text DEFAULT 'new',
  notes         text,
  assigned_to   uuid,
  ip            text,
  user_agent    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_leads_status_ts
  ON pos_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_leads_email
  ON pos_leads (email);
CREATE INDEX IF NOT EXISTS idx_pos_leads_giro
  ON pos_leads (giro);

-- updated_at trigger
CREATE OR REPLACE FUNCTION pos_leads_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_leads_updated ON pos_leads;
CREATE TRIGGER trg_pos_leads_updated
  BEFORE UPDATE ON pos_leads
  FOR EACH ROW EXECUTE FUNCTION pos_leads_set_updated_at();

-- RLS: writes via service role only; reads via service role.
ALTER TABLE pos_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_leads_service_all ON pos_leads;
CREATE POLICY pos_leads_service_all ON pos_leads
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

-- ---------- 2) volvix_user_tour_progress ----------
CREATE TABLE IF NOT EXISTS volvix_user_tour_progress (
  user_id     text PRIMARY KEY,
  tour_id     text NOT NULL DEFAULT 'grand-tour',
  step        int  NOT NULL DEFAULT 0,
  completed   boolean NOT NULL DEFAULT false,
  steps_json  jsonb,
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_progress_updated
  ON volvix_user_tour_progress (updated_at DESC);

ALTER TABLE volvix_user_tour_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_progress_service_all ON volvix_user_tour_progress;
CREATE POLICY tour_progress_service_all ON volvix_user_tour_progress
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);
