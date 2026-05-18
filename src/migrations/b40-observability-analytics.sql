-- B40: Observability + Analytics tables
BEGIN;

-- ========================================
-- 1. OBSERVABILITY EVENTS
-- ========================================
CREATE TABLE IF NOT EXISTS observability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  user_id UUID,
  session_id TEXT,
  type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('debug','info','warning','error','fatal')) DEFAULT 'error',
  message TEXT,
  stack_trace TEXT,
  payload JSONB,
  breadcrumbs JSONB,
  user_agent TEXT,
  url TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obs_type_time ON observability_events(type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_tenant ON observability_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_session ON observability_events(session_id);
ALTER TABLE observability_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obs_iso ON observability_events;
CREATE POLICY obs_iso ON observability_events FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

-- ========================================
-- 2. ANALYTICS EVENTS
-- ========================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB,
  url TEXT,
  referrer TEXT,
  user_agent TEXT,
  country_code TEXT,
  tenant_id TEXT,
  user_id UUID,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant ON analytics_events(tenant_id, occurred_at DESC);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_iso ON analytics_events;
CREATE POLICY analytics_iso ON analytics_events FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin'
    OR tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
