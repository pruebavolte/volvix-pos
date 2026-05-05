-- R19 FIX: R17_SMS.sql
-- Original error: column u.tenant_id does not exist
-- Cause: pos_users no tiene tenant_id (verificado por probe).
-- Fix: agregar columna en R19_PREFLIGHT (ya hecho); reforzar aquí.

ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sms_log (
  id          uuid primary key default gen_random_uuid(),
  to_phone    text,
  body        text,
  status      text not null default 'queued'
              check (status in ('sent','failed','queued')),
  twilio_sid  text,
  error       text,
  sent_at     timestamptz not null default now(),
  tenant_id   uuid
);

CREATE INDEX IF NOT EXISTS idx_sms_log_sent_at_status
  ON public.sms_log (sent_at desc, status);
CREATE INDEX IF NOT EXISTS idx_sms_log_to_phone   ON public.sms_log (to_phone);
CREATE INDEX IF NOT EXISTS idx_sms_log_tenant     ON public.sms_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_twilio_sid ON public.sms_log (twilio_sid);

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_log_admin_select ON public.sms_log;
CREATE POLICY sms_log_admin_select ON public.sms_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('ADMIN','SUPERADMIN','OWNER')
        AND (sms_log.tenant_id IS NULL OR sms_log.tenant_id = u.tenant_id)
    )
  );

DROP POLICY IF EXISTS sms_log_admin_insert ON public.sms_log;
CREATE POLICY sms_log_admin_insert ON public.sms_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pos_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('ADMIN','SUPERADMIN','OWNER')
    )
  );

DROP POLICY IF EXISTS sms_log_no_update ON public.sms_log;
DROP POLICY IF EXISTS sms_log_no_delete ON public.sms_log;
