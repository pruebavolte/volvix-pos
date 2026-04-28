-- =====================================================================
-- R12-O-3-A: Messaging Outgoing Audit + Retry Queue
-- ---------------------------------------------------------------------
-- Tabla pos_outgoing_messages_log:
--   Bitácora de TODOS los envíos (email, whatsapp, sms) emitidos por
--   /api/messaging/send. Si las API keys no están configuradas, el
--   mensaje queda en status='pending_provider' y un cron lo re-intenta
--   más tarde (POST /api/messaging/retry-failed).
--
-- Estados:
--   pending          → encolado, aún no procesado
--   pending_provider → SENDGRID/WASENDER no configurado, pendiente de keys
--   sent             → entregado al provider con éxito
--   failed           → provider rechazó el mensaje (revisar error_msg)
--   bounced          → provider notificó bounce (webhook futuro)
-- =====================================================================

BEGIN;

-- ── 1. Tabla principal ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_outgoing_messages_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text,
  template          text        NOT NULL,
  channel           text        NOT NULL
                                CHECK (channel IN ('email','whatsapp','sms')),
  recipient_email   text,
  recipient_phone   text,
  recipient_name    text,
  subject           text,
  body_preview      text,
  variables         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','pending_provider','sent','failed','bounced')),
  provider          text,
  provider_msg_id   text,
  error_msg         text,
  retries           integer     NOT NULL DEFAULT 0,
  next_retry_at     timestamptz,
  sent_at           timestamptz,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_outmsg_status         ON public.pos_outgoing_messages_log(status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outmsg_template_chan  ON public.pos_outgoing_messages_log(template, channel);
CREATE INDEX IF NOT EXISTS idx_outmsg_tenant         ON public.pos_outgoing_messages_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outmsg_retry          ON public.pos_outgoing_messages_log(status, next_retry_at)
  WHERE status IN ('pending','pending_provider','failed') AND retries < 5;
CREATE INDEX IF NOT EXISTS idx_outmsg_recipient      ON public.pos_outgoing_messages_log(recipient_email, recipient_phone);

-- ── 3. updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_outgoing_messages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outmsg_updated ON public.pos_outgoing_messages_log;
CREATE TRIGGER trg_outmsg_updated
  BEFORE UPDATE ON public.pos_outgoing_messages_log
  FOR EACH ROW EXECUTE FUNCTION public.touch_outgoing_messages_updated_at();

-- ── 4. Row Level Security ──────────────────────────────────────────
ALTER TABLE public.pos_outgoing_messages_log ENABLE ROW LEVEL SECURITY;

-- Solo service_role escribe; los usuarios solo pueden leer mensajes de su tenant
DROP POLICY IF EXISTS outmsg_select_own_tenant ON public.pos_outgoing_messages_log;
CREATE POLICY outmsg_select_own_tenant
  ON public.pos_outgoing_messages_log
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = COALESCE(
        current_setting('request.jwt.claim.tenant_id', true),
        current_setting('app.current_tenant_id', true),
        ''
    )
    OR COALESCE(
        current_setting('request.jwt.claim.role', true),
        ''
    ) IN ('superadmin','platform_admin')
  );

-- Inserts/updates SOLO por service_role (server-side)
DROP POLICY IF EXISTS outmsg_no_insert_clients ON public.pos_outgoing_messages_log;
CREATE POLICY outmsg_no_insert_clients
  ON public.pos_outgoing_messages_log
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS outmsg_no_update_clients ON public.pos_outgoing_messages_log;
CREATE POLICY outmsg_no_update_clients
  ON public.pos_outgoing_messages_log
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS outmsg_no_delete_clients ON public.pos_outgoing_messages_log;
CREATE POLICY outmsg_no_delete_clients
  ON public.pos_outgoing_messages_log
  FOR DELETE
  USING (false);

-- ── 5. Comentarios ────────────────────────────────────────────────
COMMENT ON TABLE public.pos_outgoing_messages_log IS
  'R12-O-3-A: Bitácora unificada de envíos email/whatsapp/sms desde /api/messaging/send. Soporta retry queue para mensajes en pending_provider o failed (max 5 reintentos).';

COMMENT ON COLUMN public.pos_outgoing_messages_log.status IS
  'pending=encolado, pending_provider=keys no set, sent=ok, failed=rechazo provider, bounced=bounce/webhook.';

COMMENT ON COLUMN public.pos_outgoing_messages_log.next_retry_at IS
  'Timestamp en el que el cron POST /api/messaging/retry-failed debe re-intentar este mensaje. NULL si ya está en sent/bounced.';

COMMIT;
