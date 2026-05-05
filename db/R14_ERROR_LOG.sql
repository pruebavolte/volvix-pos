-- =====================================================================
-- R14 · ERROR LOG TABLE
-- Capture client + server errors for observability.
-- Idempotent: safe to run multiple times.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.error_log (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type         TEXT NOT NULL DEFAULT 'unknown',          -- window.onerror | unhandledrejection | server | manual
  message      TEXT NOT NULL,
  stack        TEXT,
  source       TEXT,                                     -- file URL where error occurred
  line_no      INTEGER,
  col_no       INTEGER,
  url          TEXT,                                     -- page URL
  user_agent   TEXT,
  ip           TEXT,
  pos_user_id  UUID,                                     -- nullable (anon errors)
  tenant_id    TEXT,
  meta         JSONB                                     -- arbitrary client context
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at  ON public.error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_type        ON public.error_log (type);
CREATE INDEX IF NOT EXISTS idx_error_log_pos_user    ON public.error_log (pos_user_id);
CREATE INDEX IF NOT EXISTS idx_error_log_tenant      ON public.error_log (tenant_id);

-- RLS: service role bypasses; restrict client reads if RLS enabled elsewhere.
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_log_service_all" ON public.error_log;
CREATE POLICY "error_log_service_all" ON public.error_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Owner/admin read-only via authenticated role (optional; tighten to your auth model)
DROP POLICY IF EXISTS "error_log_admin_read" ON public.error_log;
CREATE POLICY "error_log_admin_read" ON public.error_log
  FOR SELECT TO authenticated
  USING (true);

-- Optional: retention helper. Run via pg_cron if available.
-- DELETE FROM public.error_log WHERE created_at < NOW() - INTERVAL '90 days';

COMMENT ON TABLE public.error_log IS 'R14 observability — captures client (volvix-error-tracker.js) + server errors.';
