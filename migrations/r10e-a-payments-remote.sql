-- ============================================================================
-- R10e-A — NIVEL 5 BACKEND: Payments verification + External-pay polling +
--                            Anti-hijack signed remote sessions
-- Idempotente. 3 fixes:
-- ============================================================================
--   FIX-N5-A1: pos_payment_verifications — transferencia bancaria con
--              verificación manual (screenshot puede ser editado)
--   FIX-N5-A2: pos_payment_pending_reconciliation — extender con cols para
--              app pago tardío (5–60 min) + reconciliación bancaria
--   FIX-N5-A3: pos_remote_sessions — sesiones remotas firmadas (HMAC),
--              expiran 30 min, allowed_actions whitelist, audit completo
-- ============================================================================
-- Apply with: supabase db query --linked < migrations/r10e-a-payments-remote.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- FIX-N5-A1: pos_payment_verifications
-- Cuando cliente paga por transferencia, queda en sale.status='pending_verification'
-- hasta que owner/manager confirme (con screenshot Y/O comprobante banco).
-- Si rechazado → sale='cancelled' + alerta seguridad.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_payment_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  amount NUMERIC(14,2) NOT NULL,
  reference TEXT,
  screenshot_url TEXT,
  bank_confirmation_url TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  rejected_reason TEXT,
  cashier_id TEXT,
  cashier_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_payment_verifications_status_check') THEN
    ALTER TABLE pos_payment_verifications
      ADD CONSTRAINT pos_payment_verifications_status_check
      CHECK (status IN ('pending','verified','rejected','manual_review'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_payment_verifications_amount_check') THEN
    ALTER TABLE pos_payment_verifications
      ADD CONSTRAINT pos_payment_verifications_amount_check
      CHECK (amount > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pos_pay_verif_tenant_status_idx
  ON pos_payment_verifications(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_pay_verif_sale_idx
  ON pos_payment_verifications(sale_id);
CREATE INDEX IF NOT EXISTS pos_pay_verif_pending_idx
  ON pos_payment_verifications(tenant_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE pos_payment_verifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_pay_verif_iso_select ON pos_payment_verifications; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_pay_verif_iso_insert ON pos_payment_verifications; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_pay_verif_iso_update ON pos_payment_verifications; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_pay_verif_iso_select
  ON pos_payment_verifications FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_pay_verif_iso_insert
  ON pos_payment_verifications FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_pay_verif_iso_update
  ON pos_payment_verifications FOR UPDATE
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin','owner','manager')
  );

COMMENT ON TABLE pos_payment_verifications IS
  'R10e-A FIX-N5-A1: verificación manual de transferencias bancarias. Solo owner/manager pueden mover a verified/rejected. Audit obligatorio.';

-- ---------------------------------------------------------------------------
-- FIX-N5-A2: extender pos_payment_pending_reconciliation con cols de
-- "app pago tardío" (5–60 min entre pago en app y arribo a banco).
-- Reusamos la tabla existente. Agregamos cols si no existen.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='pos_payment_pending_reconciliation' AND column_name='external_app_name') THEN
    ALTER TABLE pos_payment_pending_reconciliation ADD COLUMN external_app_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='pos_payment_pending_reconciliation' AND column_name='external_reference') THEN
    ALTER TABLE pos_payment_pending_reconciliation ADD COLUMN external_reference TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='pos_payment_pending_reconciliation' AND column_name='expected_arrival_at') THEN
    ALTER TABLE pos_payment_pending_reconciliation ADD COLUMN expected_arrival_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='pos_payment_pending_reconciliation' AND column_name='expires_at') THEN
    ALTER TABLE pos_payment_pending_reconciliation ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='pos_payment_pending_reconciliation' AND column_name='source') THEN
    ALTER TABLE pos_payment_pending_reconciliation ADD COLUMN source TEXT;
  END IF;
END $$;

-- Permitir 'expired' en status del check existente (drop+re-add con ampliación)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_pay_pending_status_check') THEN
    ALTER TABLE pos_payment_pending_reconciliation DROP CONSTRAINT pos_pay_pending_status_check;
  END IF;
  ALTER TABLE pos_payment_pending_reconciliation
    ADD CONSTRAINT pos_pay_pending_status_check
    CHECK (status IN ('pending','resolved_paid','resolved_failed','escalated','manual','expired'));
END $$;

CREATE INDEX IF NOT EXISTS pos_pay_pending_external_ref_idx
  ON pos_payment_pending_reconciliation(tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS pos_pay_pending_expires_idx
  ON pos_payment_pending_reconciliation(expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS pos_pay_pending_source_idx
  ON pos_payment_pending_reconciliation(source, status)
  WHERE source IS NOT NULL;

COMMENT ON COLUMN pos_payment_pending_reconciliation.source IS
  'R10e-A FIX-N5-A2: psp | external_app | manual. external_app marca pagos por app bancaria (BBVA, Banamex, Santander, OXXO, etc).';
COMMENT ON COLUMN pos_payment_pending_reconciliation.expected_arrival_at IS
  'R10e-A FIX-N5-A2: timestamp esperado de arribo del pago al banco. Cron polea hasta expires_at.';

-- ---------------------------------------------------------------------------
-- FIX-N5-A3: pos_remote_sessions — sesiones remotas con token firmado HMAC,
-- allowed_actions whitelist, ping cada 5 min, target user puede cancelar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_remote_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_email TEXT,
  target_user_id TEXT NOT NULL,
  target_user_email TEXT,
  token_hash TEXT NOT NULL,
  reason TEXT,
  allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_consent',
  ip TEXT,
  user_agent TEXT,
  consented_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  last_ping_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ended_by TEXT,
  ended_reason TEXT,
  actions_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_remote_sessions_status_check') THEN
    ALTER TABLE pos_remote_sessions
      ADD CONSTRAINT pos_remote_sessions_status_check
      CHECK (status IN ('pending_consent','active','ended','revoked','expired','auto_revoked'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_remote_sessions_token_hash_uq
  ON pos_remote_sessions(token_hash);

CREATE INDEX IF NOT EXISTS pos_remote_sessions_target_active_idx
  ON pos_remote_sessions(target_user_id, status, expires_at DESC)
  WHERE status IN ('pending_consent','active');

CREATE INDEX IF NOT EXISTS pos_remote_sessions_tenant_idx
  ON pos_remote_sessions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_remote_sessions_expiring_idx
  ON pos_remote_sessions(expires_at)
  WHERE status IN ('pending_consent','active');

ALTER TABLE pos_remote_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_remote_sessions_iso_select ON pos_remote_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_remote_sessions_iso_insert ON pos_remote_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_remote_sessions_iso_update ON pos_remote_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_remote_sessions_iso_select
  ON pos_remote_sessions FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_remote_sessions_iso_insert
  ON pos_remote_sessions FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_remote_sessions_iso_update
  ON pos_remote_sessions FOR UPDATE
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

COMMENT ON TABLE pos_remote_sessions IS
  'R10e-A FIX-N5-A3: sesiones de soporte remoto con token firmado HMAC. Status flow: pending_consent → active (target acepta) → ended/revoked/expired/auto_revoked. allowed_actions es whitelist explícita; ninguna acción fuera de allow_list es permitida.';

-- ---------------------------------------------------------------------------
-- Tabla de log de acciones ejecutadas en sesión remota (sirve como join al audit).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_remote_session_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_resource TEXT,
  target_id TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  result_status INT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_remote_session_actions_session_idx
  ON pos_remote_session_actions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_remote_session_actions_tenant_idx
  ON pos_remote_session_actions(tenant_id, created_at DESC);

ALTER TABLE pos_remote_session_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS pos_remote_actions_iso_select ON pos_remote_session_actions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS pos_remote_actions_iso_insert ON pos_remote_session_actions; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE POLICY pos_remote_actions_iso_select
  ON pos_remote_session_actions FOR SELECT
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

CREATE POLICY pos_remote_actions_iso_insert
  ON pos_remote_session_actions FOR INSERT
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') IN ('superadmin','admin')
  );

COMMENT ON TABLE pos_remote_session_actions IS
  'R10e-A FIX-N5-A3: cada acción dentro de una pos_remote_sessions queda registrada aquí + en volvix_audit_log con remote_session_id en details.';

COMMIT;
