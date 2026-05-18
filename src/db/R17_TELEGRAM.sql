-- ============================================================================
-- R17_TELEGRAM.sql — Volvix POS GODMODE 3.4.0
-- Telegram bot admin integration: chat linking + alert audit log.
-- ----------------------------------------------------------------------------
-- Tablas:
--   public.telegram_admins  → vínculo chat_id <-> usuario admin del POS
--   public.telegram_alerts  → bitácora de alertas/mensajes salientes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_admins (
  chat_id     bigint        PRIMARY KEY,
  user_id     uuid          NOT NULL REFERENCES public.pos_users(id) ON DELETE CASCADE,
  tenant_id   uuid          NOT NULL,
  linked_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_admins_user_idx
  ON public.telegram_admins(user_id);
CREATE INDEX IF NOT EXISTS telegram_admins_tenant_idx
  ON public.telegram_admins(tenant_id);

CREATE TABLE IF NOT EXISTS public.telegram_alerts (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text         NOT NULL,                 -- 'sales','inventory','alert','dashboard','start'
  sent_to_chat  bigint       NOT NULL,
  body          text         NOT NULL,
  ts            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_alerts_ts_idx
  ON public.telegram_alerts(ts DESC);
CREATE INDEX IF NOT EXISTS telegram_alerts_chat_idx
  ON public.telegram_alerts(sent_to_chat);

-- RLS: solo service-role (API) puede leer/escribir; usuarios finales no tocan estas tablas.
ALTER TABLE public.telegram_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_admins_service_all ON public.telegram_admins;
CREATE POLICY telegram_admins_service_all ON public.telegram_admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS telegram_alerts_service_all ON public.telegram_alerts;
CREATE POLICY telegram_alerts_service_all ON public.telegram_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
