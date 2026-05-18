-- =====================================================================
-- R12b FIX-LEGAL-6: ARCO Requests (LFPDPPP México)
-- ---------------------------------------------------------------------
-- Tabla para solicitudes de derechos ARCO:
--   Acceso, Rectificación, Cancelación, Oposición
-- Conforme a artículos 28-35 LFPDPPP.
--
-- FIX 2026-04-28: la migration original referenciaba public.tenants(id)
--   y tenants.owner_user_id, pero ese schema NO existe en este proyecto.
--   El schema real es:
--     - pos_companies(id uuid, owner_user_id uuid, tenant_id text)
--     - sub_tenants(id uuid, owner_user_id uuid)
--     - pos_users(id uuid, role, notes->>'tenant_id' text)
--   tenant_id en la app son strings tipo 'TNT001' (no uuid). Se cambió la
--   columna pos_arco_requests.tenant_id a TEXT y se ajustó la RLS policy
--   del owner para hacer lookup contra pos_companies + pos_users.notes.
-- =====================================================================

BEGIN;

-- ── 1. Tabla principal ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_arco_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text,
  user_id         uuid,
  email           text        NOT NULL,
  type            text        NOT NULL
                              CHECK (type IN ('access','rectification','cancellation','opposition')),
  reason          text,
  payload         jsonb       DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','verifying','in_progress','resolved','rejected','expired')),
  ticket_number   text        UNIQUE,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution_notes text,
  ip_address      inet,
  user_agent      text,
  verify_token    text,
  verified_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '20 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Migración defensiva: si la tabla ya existía con tenant_id uuid, convertir a text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='pos_arco_requests'
      AND column_name='tenant_id'
      AND data_type='uuid'
  ) THEN
    ALTER TABLE public.pos_arco_requests
      ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
  END IF;
END$$;

-- ── 2. Índices ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_arco_email      ON public.pos_arco_requests(email);
CREATE INDEX IF NOT EXISTS idx_arco_status     ON public.pos_arco_requests(status);
CREATE INDEX IF NOT EXISTS idx_arco_tenant     ON public.pos_arco_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arco_user       ON public.pos_arco_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_arco_requested  ON public.pos_arco_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_arco_ticket     ON public.pos_arco_requests(ticket_number);

-- ── 3. Generador de ticket ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_arco_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'ARCO-' ||
      to_char(now(), 'YYYYMMDD') || '-' ||
      lpad((floor(random() * 99999))::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arco_ticket ON public.pos_arco_requests;
CREATE TRIGGER trg_arco_ticket
  BEFORE INSERT ON public.pos_arco_requests
  FOR EACH ROW EXECUTE FUNCTION public.generate_arco_ticket();

-- ── 4. updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_arco_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arco_updated ON public.pos_arco_requests;
CREATE TRIGGER trg_arco_updated
  BEFORE UPDATE ON public.pos_arco_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_arco_updated_at();

-- ── 5. Row Level Security ──────────────────────────────────────────
ALTER TABLE public.pos_arco_requests ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede crear su propia solicitud (anónimo OK; verificación por email)
DROP POLICY IF EXISTS arco_insert_anyone ON public.pos_arco_requests;
CREATE POLICY arco_insert_anyone
  ON public.pos_arco_requests
  FOR INSERT
  WITH CHECK (true);

-- Cada usuario autenticado ve solo sus propias solicitudes
DROP POLICY IF EXISTS arco_select_owner ON public.pos_arco_requests;
CREATE POLICY arco_select_owner
  ON public.pos_arco_requests
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.jwt() ->> 'email' = email
  );

-- Service role puede todo (bypass RLS) — usado por el endpoint server-side
-- (no requiere policy explícita, service_role salta RLS)

-- Owner del tenant puede ver/actualizar las solicitudes que le competen.
-- En este schema "tenant" se identifica por:
--   - pos_companies.owner_user_id = auth.uid()  (id::text === tenant_id)
--   - sub_tenants.owner_user_id = auth.uid()    (id::text === tenant_id)
DROP POLICY IF EXISTS arco_tenant_admin ON public.pos_arco_requests;
CREATE POLICY arco_tenant_admin
  ON public.pos_arco_requests
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id::text FROM public.pos_companies
      WHERE owner_user_id = auth.uid()
      UNION
      SELECT id::text FROM public.sub_tenants
      WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT id::text FROM public.pos_companies
      WHERE owner_user_id = auth.uid()
      UNION
      SELECT id::text FROM public.sub_tenants
      WHERE owner_user_id = auth.uid()
    )
  );

-- ── 6. Comentarios ─────────────────────────────────────────────────
COMMENT ON TABLE public.pos_arco_requests IS
  'R12b FIX-LEGAL-6: Solicitudes de derechos ARCO (LFPDPPP). Plazo legal de respuesta: 20 días hábiles, prórroga única +20 días.';

COMMENT ON COLUMN public.pos_arco_requests.type IS
  'access=Acceso (Art.28), rectification=Rectificación (Art.29), cancellation=Cancelación (Art.30), opposition=Oposición (Art.31).';

COMMIT;
