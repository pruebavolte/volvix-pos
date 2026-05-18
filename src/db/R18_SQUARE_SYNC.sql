-- =============================================================
-- R18 — Square POS Sync Log
-- =============================================================
-- Tabla de auditoria para sincronizaciones de catalogo y eventos
-- de webhook recibidos desde Square (https://connect.squareup.com)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.square_sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,           -- 'catalog_sync' | 'webhook:<event>' | 'webhook:error'
  status        TEXT NOT NULL,           -- 'ok' | 'partial' | 'error' | 'ignored'
  items_synced  INTEGER NOT NULL DEFAULT 0,
  meta          JSONB,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id     UUID
);

CREATE INDEX IF NOT EXISTS idx_square_sync_log_ts     ON public.square_sync_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_square_sync_log_type   ON public.square_sync_log (type);
CREATE INDEX IF NOT EXISTS idx_square_sync_log_status ON public.square_sync_log (status);
CREATE INDEX IF NOT EXISTS idx_square_sync_log_tenant ON public.square_sync_log (tenant_id);

-- Columna external_id en pos_products para mapear hacia Square Catalog
ALTER TABLE public.pos_products
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source      TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_products_external_id ON public.pos_products (external_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_source      ON public.pos_products (source);

-- RLS: solo admins/owners ven el log
ALTER TABLE public.square_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS square_sync_log_admin_read ON public.square_sync_log;
CREATE POLICY square_sync_log_admin_read ON public.square_sync_log
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR (auth.jwt() ->> 'role') IN ('admin','superadmin','owner')
  );

DROP POLICY IF EXISTS square_sync_log_admin_write ON public.square_sync_log;
CREATE POLICY square_sync_log_admin_write ON public.square_sync_log
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt() ->> 'role') IN ('admin','superadmin','owner')
  );

GRANT SELECT, INSERT ON public.square_sync_log TO authenticated, service_role;
