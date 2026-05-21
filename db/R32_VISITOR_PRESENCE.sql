-- =====================================================================
-- R32 · VISITOR PRESENCE (concurrent users en vivo)
-- Cada cliente (marketplace.html, landings, POS, panel) hace heartbeat
-- cada 30s a POST /api/presence/ping con session_id único. Server upserta
-- last_seen. GET /api/presence/active cuenta sesiones con last_seen >=
-- ahora-90s (3× el intervalo de ping → tolerante a 1-2 pings perdidos).
--
-- session_id es PK para que el upsert por on_conflict=session_id funcione.
-- Idempotente: seguro de correr múltiples veces.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.volvix_visitor_presence (
  session_id   TEXT PRIMARY KEY,                          -- generado client-side, ej: "v-k7x9m2-mqgz0a"
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- updated cada ping
  page         TEXT,                                       -- /marketplace.html, /landing-restaurante.html
  giro         TEXT,                                       -- giro buscado/visto (si aplica)
  ip_hash      TEXT,                                       -- SHA256 truncado a 16 chars
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON public.volvix_visitor_presence (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_presence_giro      ON public.volvix_visitor_presence (giro);
CREATE INDEX IF NOT EXISTS idx_presence_page      ON public.volvix_visitor_presence (page);

-- RLS
ALTER TABLE public.volvix_visitor_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_service_all" ON public.volvix_visitor_presence;
CREATE POLICY "presence_service_all" ON public.volvix_visitor_presence
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "presence_authenticated_read" ON public.volvix_visitor_presence;
CREATE POLICY "presence_authenticated_read" ON public.volvix_visitor_presence
  FOR SELECT TO authenticated
  USING (true);

-- Retention: limpiar sesiones inactivas >24h. Correr manualmente o vía pg_cron.
-- DELETE FROM public.volvix_visitor_presence WHERE last_seen < NOW() - INTERVAL '24 hours';

COMMENT ON TABLE public.volvix_visitor_presence IS
  'V13.26 - presencia en vivo de visitantes. Upsert por session_id. Contador en panel cuenta last_seen >= NOW()-90s.';
