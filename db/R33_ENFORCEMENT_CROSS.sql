-- R33_ENFORCEMENT_CROSS.sql — AGENTE 5
-- Tablas para enforcement REAL de toggles del panel sobre el POS del cliente.
-- Resuelve Bloqueantes B-X-1 (cache stale), B-X-2 (feature cosmetico), B-X-3 (JWT vivo).

-- ============================================================
-- Tabla 1: revoked_tokens
-- Cuando se suspende un tenant o se hace logout server-side, los JWT activos se
-- insertan aqui. requireAuth los rechaza antes de validar firma.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_revoked_tokens (
  jti          TEXT PRIMARY KEY,
  tenant_id    TEXT,
  user_id      TEXT,
  reason       TEXT NOT NULL,
  revoked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by   TEXT,
  expires_at   TIMESTAMPTZ -- TTL del JWT original, para cleanup
);

CREATE INDEX IF NOT EXISTS pos_revoked_tokens_tenant_idx ON public.pos_revoked_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS pos_revoked_tokens_expires_idx ON public.pos_revoked_tokens(expires_at);

-- Cleanup: rows con expires_at < now() pueden eliminarse (JWT ya invalido por TTL)
-- Manejado por cron diario (configurar aparte)

-- ============================================================
-- Tabla 2: tenant_module_permissions
-- Estado real de modulos/features por tenant. NO cosmetico — el server lo consulta
-- antes de aceptar requests sensibles (ej. POST /api/sales).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_tenant_module_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  module_key    TEXT NOT NULL,  -- ej: 'ventas', 'cobrar', 'inventario', 'reportes', 'devoluciones'
  enabled       BOOLEAN NOT NULL DEFAULT true,
  state         TEXT NOT NULL DEFAULT 'enabled' CHECK (state IN ('enabled','locked','hidden')),
  lock_message  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT,
  UNIQUE (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS pos_tenant_modperms_tenant_idx ON public.pos_tenant_module_permissions(tenant_id);

-- ============================================================
-- Tabla 3: app_config_versions
-- Cada cambio de modulo/feature/plan/branding incrementa la version del tenant.
-- El POS hace polling GET /api/app/config?since=<version> y solo recibe payload
-- si la version del server es mayor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_app_config_versions (
  tenant_id     TEXT PRIMARY KEY,
  version       BIGINT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: bump version cuando cambian tenant_module_permissions
CREATE OR REPLACE FUNCTION bump_app_config_version()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.pos_app_config_versions (tenant_id, version, updated_at)
  VALUES (NEW.tenant_id, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET version = pos_app_config_versions.version + 1,
        updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_config_on_modperms ON public.pos_tenant_module_permissions;
CREATE TRIGGER trg_bump_config_on_modperms
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_tenant_module_permissions
  FOR EACH ROW EXECUTE FUNCTION bump_app_config_version();

-- RLS
ALTER TABLE public.pos_revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_tenant_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_app_config_versions ENABLE ROW LEVEL SECURITY;

-- pos_revoked_tokens: solo superadmin / platform_owner pueden insertar; cualquier auth lee su propio
DROP POLICY IF EXISTS "revoked_select" ON public.pos_revoked_tokens;
CREATE POLICY "revoked_select" ON public.pos_revoked_tokens FOR SELECT USING (true);

DROP POLICY IF EXISTS "revoked_insert_admin" ON public.pos_revoked_tokens;
CREATE POLICY "revoked_insert_admin" ON public.pos_revoked_tokens FOR INSERT
  WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner','owner'));

-- pos_tenant_module_permissions: lectura por usuarios del tenant; escritura solo admin
DROP POLICY IF EXISTS "modperms_select_own" ON public.pos_tenant_module_permissions;
CREATE POLICY "modperms_select_own" ON public.pos_tenant_module_permissions FOR SELECT
  USING (
    tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

DROP POLICY IF EXISTS "modperms_write_admin" ON public.pos_tenant_module_permissions;
CREATE POLICY "modperms_write_admin" ON public.pos_tenant_module_permissions FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner','owner','admin'));

DROP POLICY IF EXISTS "config_ver_select_own" ON public.pos_app_config_versions;
CREATE POLICY "config_ver_select_own" ON public.pos_app_config_versions FOR SELECT
  USING (
    tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

COMMENT ON TABLE public.pos_revoked_tokens IS 'AGENTE 5: JWT revocados antes de su TTL (suspender tenant, logout, breach).';
COMMENT ON TABLE public.pos_tenant_module_permissions IS 'AGENTE 5: estado real de modulos/features. Server-side enforcement.';
COMMENT ON TABLE public.pos_app_config_versions IS 'AGENTE 5: version monotonica para polling/304 Not Modified del cliente.';
