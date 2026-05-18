-- =====================================================================
-- R12-O-1: Registro Self-Service + OTP Verification
-- ---------------------------------------------------------------------
-- Tabla pos_otp_verifications:
--   Almacena códigos OTP de 6 dígitos enviados por email/WhatsApp
--   durante el registro self-service de nuevos tenants.
--   - 6 dígitos numéricos
--   - TTL: 10 minutos
--   - Máx 3 intentos antes de bloqueo
--   - Una sola verificación por código (verified_at)
-- =====================================================================

BEGIN;

-- ── 1. Tabla principal ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_otp_verifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text        NOT NULL,
  user_id         uuid,
  email           text        NOT NULL,
  phone           text,
  otp_code        text        NOT NULL,
  sent_to_email   boolean     NOT NULL DEFAULT false,
  sent_to_phone   boolean     NOT NULL DEFAULT false,
  attempts        integer     NOT NULL DEFAULT 0,
  verified_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  ip_address      text,
  user_agent      text,
  purpose         text        NOT NULL DEFAULT 'register_tenant'
                              CHECK (purpose IN ('register_tenant','password_reset','email_change','phone_change')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Índices ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_otp_tenant     ON public.pos_otp_verifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_otp_email      ON public.pos_otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_lookup     ON public.pos_otp_verifications(tenant_id, otp_code, verified_at);
CREATE INDEX IF NOT EXISTS idx_otp_expires    ON public.pos_otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_purpose    ON public.pos_otp_verifications(purpose);

-- ── 3. updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_otp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_otp_updated ON public.pos_otp_verifications;
CREATE TRIGGER trg_otp_updated
  BEFORE UPDATE ON public.pos_otp_verifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_otp_updated_at();

-- ── 4. Row Level Security ──────────────────────────────────────────
ALTER TABLE public.pos_otp_verifications ENABLE ROW LEVEL SECURITY;

-- Service role bypass automatic; los clientes NO deben leer códigos OTP.
-- Política de SELECT bloqueada (solo service_role los lee server-side).
DROP POLICY IF EXISTS otp_no_select_clients ON public.pos_otp_verifications;
CREATE POLICY otp_no_select_clients
  ON public.pos_otp_verifications
  FOR SELECT
  USING (false);

-- Política de INSERT: nadie inserta directo desde el cliente.
DROP POLICY IF EXISTS otp_no_insert_clients ON public.pos_otp_verifications;
CREATE POLICY otp_no_insert_clients
  ON public.pos_otp_verifications
  FOR INSERT
  WITH CHECK (false);

-- ── 5. email_verified columna en pos_users (si no existe) ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_users' AND column_name='email_verified'
    ) THEN
      ALTER TABLE public.pos_users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_users' AND column_name='phone'
    ) THEN
      ALTER TABLE public.pos_users ADD COLUMN phone text;
    END IF;
  END IF;
END$$;

-- ── 6. status + business_type en pos_companies (si no existen) ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='status'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN status text DEFAULT 'pending'
        CHECK (status IN ('pending','active','suspended','deleted'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='business_type'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN business_type text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='rfc'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN rfc text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='city'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN city text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='state'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN state text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='phone'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN phone text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_companies' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE public.pos_companies ADD COLUMN tenant_id text UNIQUE;
    END IF;
  END IF;
END$$;

-- ── 7. Comentarios ────────────────────────────────────────────────
COMMENT ON TABLE public.pos_otp_verifications IS
  'R12-O-1: Códigos OTP 6 dígitos para verificación de email/WhatsApp en registro self-service. TTL 10 min, máx 3 intentos.';

COMMENT ON COLUMN public.pos_otp_verifications.purpose IS
  'register_tenant=registro nuevo tenant, password_reset=reset password, email_change=cambio email, phone_change=cambio phone.';

COMMIT;
