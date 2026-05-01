-- migrations/system-error-logs.sql
-- Pre-launch: tabla destinada a errores de sistema reportados por POST /api/errors/log
-- (separada de error_log existente). Permite triage operacional de errores 4xx/5xx
-- y de red sin spamear toasts al usuario.

CREATE TABLE IF NOT EXISTS system_error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text DEFAULT 'system',
  error_code text,
  error_message text,
  url text,
  user_agent text,
  tenant_id text,
  user_id uuid,
  stack text,
  ip_address text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sel_unresolved
  ON system_error_logs(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sel_tenant
  ON system_error_logs(tenant_id, created_at DESC);
