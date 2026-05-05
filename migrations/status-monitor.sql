-- STATUS MONITOR — system_incidents + system_health_pings
-- Used by api/status-monitor.js for the public /status-page.html

CREATE TABLE IF NOT EXISTS system_incidents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service text NOT NULL,
  severity text DEFAULT 'minor',
  started_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  title text NOT NULL,
  message text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_incidents_started_at_idx ON system_incidents(started_at DESC);
CREATE INDEX IF NOT EXISTS system_incidents_service_idx ON system_incidents(service);
CREATE INDEX IF NOT EXISTS system_incidents_active_idx
  ON system_incidents(service) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS system_health_pings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service text NOT NULL,
  ok boolean DEFAULT true,
  latency_ms int,
  error text,
  checked_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_health_pings_service_at_idx
  ON system_health_pings(service, checked_at DESC);
