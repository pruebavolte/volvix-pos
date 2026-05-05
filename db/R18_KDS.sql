-- ============================================================
-- R18_KDS.sql · Kitchen Display System
-- ============================================================

CREATE TABLE IF NOT EXISTS kds_stations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,        -- grill / cold / bar / dessert
  name         TEXT NOT NULL,
  active       BOOLEAN DEFAULT TRUE,
  printer_id   TEXT,
  config       JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO kds_stations(code,name) VALUES
 ('grill','Parrilla'),('cold','Fríos'),('bar','Bar'),('dessert','Postres')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS kds_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id      UUID,
  station      TEXT NOT NULL CHECK (station IN ('grill','cold','bar','dessert')),
  status       TEXT NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','preparing','ready','served','canceled')),
  items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes        TEXT,
  priority     INT DEFAULT 0,
  started_at   TIMESTAMPTZ,        -- preparing
  ready_at     TIMESTAMPTZ,        -- ready
  served_at    TIMESTAMPTZ,        -- served
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kds_tickets_status_idx  ON kds_tickets(status);
CREATE INDEX IF NOT EXISTS kds_tickets_station_idx ON kds_tickets(station);
CREATE INDEX IF NOT EXISTS kds_tickets_sale_idx    ON kds_tickets(sale_id);
CREATE INDEX IF NOT EXISTS kds_tickets_active_idx
  ON kds_tickets(station, status, created_at)
  WHERE status IN ('received','preparing','ready');

CREATE OR REPLACE FUNCTION kds_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status='preparing' AND NEW.started_at IS NULL THEN NEW.started_at = NOW(); END IF;
  IF NEW.status='ready'     AND NEW.ready_at   IS NULL THEN NEW.ready_at   = NOW(); END IF;
  IF NEW.status='served'    AND NEW.served_at  IS NULL THEN NEW.served_at  = NOW(); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kds_tickets_touch ON kds_tickets;
CREATE TRIGGER kds_tickets_touch BEFORE UPDATE ON kds_tickets
  FOR EACH ROW EXECUTE FUNCTION kds_touch();
