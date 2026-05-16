-- R34_PANEL_HARDENING.sql v2 — adaptado a esquema real de tenant_impersonation_log

-- ============================================================
-- 2FA secrets por admin
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_2fa_secrets (
  admin_user_id     TEXT PRIMARY KEY,
  totp_secret_enc   TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT false,
  recovery_codes    TEXT[],
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- IP allowlist global para acceso al panel
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_ip_allowlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_or_cidr      TEXT NOT NULL,
  label           TEXT,
  added_by        TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled         BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_ip_allowlist_ip_uniq ON public.admin_ip_allowlist(ip_or_cidr);

-- ============================================================
-- Sesiones activas de platform_owner
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  jti             TEXT PRIMARY KEY,
  admin_user_id   TEXT NOT NULL,
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON public.admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_revoked_idx ON public.admin_sessions(revoked_at);

-- ============================================================
-- Vista pos_impersonation_log adaptada al esquema REAL de tenant_impersonation_log
-- Esquema real: id, super_admin_id, super_admin_email, tenant_id, reason, jti, expires_at, created_at
-- ============================================================
CREATE OR REPLACE VIEW public.pos_impersonation_log AS
SELECT
  id,
  super_admin_id AS admin_user_id,
  super_admin_email AS admin_email,
  tenant_id AS impersonated_tenant,
  NULL::text AS impersonated_email,
  reason,
  created_at AS started_at,
  expires_at AS ended_at,
  NULL::text AS ip,
  NULL::text AS user_agent
FROM public.tenant_impersonation_log;

-- RLS
ALTER TABLE public.admin_2fa_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only_2fa" ON public.admin_2fa_secrets;
CREATE POLICY "admin_only_2fa" ON public.admin_2fa_secrets FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner'));

DROP POLICY IF EXISTS "admin_only_ip" ON public.admin_ip_allowlist;
CREATE POLICY "admin_only_ip" ON public.admin_ip_allowlist FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner'));

DROP POLICY IF EXISTS "admin_own_sessions" ON public.admin_sessions;
CREATE POLICY "admin_own_sessions" ON public.admin_sessions FOR SELECT
  USING (
    admin_user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

COMMENT ON TABLE public.admin_2fa_secrets IS 'AGENTE 4: 2FA TOTP secrets para platform_owner.';
COMMENT ON TABLE public.admin_ip_allowlist IS 'AGENTE 4: IP allowlist para acceso al panel.';
COMMENT ON TABLE public.admin_sessions IS 'AGENTE 4: sesiones activas visibles para auto-revocacion.';
COMMENT ON VIEW public.pos_impersonation_log IS 'AGENTE 4 (B-PNL-5): vista de tenant_impersonation_log (esquema legacy).';
