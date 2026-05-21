-- =====================================================================
-- R31 · GIRO SEARCHES TRACKING
-- Cada vez que un usuario busca un giro en /marketplace.html, el endpoint
-- POST /api/giros/track-search inserta un row aquí. Sirve para el contador
-- "Buscado hoy" en /paneldecontrol.html#permisos y para analytics.
--
-- Idempotente: seguro de correr múltiples veces.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.volvix_giro_searches (
  id           BIGSERIAL PRIMARY KEY,
  searched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slug         TEXT NOT NULL,                              -- ej: 'restaurante', 'taqueria'
  query_raw    TEXT,                                       -- texto exacto del usuario
  ip_hash      TEXT,                                       -- SHA256 truncado a 16 chars (privacidad)
  user_agent   TEXT,                                       -- browser/device para analytics
  meta         JSONB                                       -- futuro: utm, referrer, etc.
);

CREATE INDEX IF NOT EXISTS idx_giro_searches_searched_at ON public.volvix_giro_searches (searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_giro_searches_slug        ON public.volvix_giro_searches (slug);
CREATE INDEX IF NOT EXISTS idx_giro_searches_slug_date   ON public.volvix_giro_searches (slug, searched_at DESC);

-- RLS: service_role escribe (server-side), admin lee.
ALTER TABLE public.volvix_giro_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "giro_searches_service_all" ON public.volvix_giro_searches;
CREATE POLICY "giro_searches_service_all" ON public.volvix_giro_searches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "giro_searches_admin_read" ON public.volvix_giro_searches;
CREATE POLICY "giro_searches_admin_read" ON public.volvix_giro_searches
  FOR SELECT TO authenticated
  USING (true);

-- Opcional: retention 365 días (correr manualmente o vía pg_cron).
-- DELETE FROM public.volvix_giro_searches WHERE searched_at < NOW() - INTERVAL '365 days';

COMMENT ON TABLE public.volvix_giro_searches IS
  'V13.25 - tracking de búsquedas de giros en marketplace para contador panel. Insertado por /api/giros/track-search.';
