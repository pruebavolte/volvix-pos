-- R32_TAX_CONFIG.sql — AGENTE 6 (Fiscal IVA)
-- Crea tabla pos_tax_config para configuracion fiscal por tenant.
-- Default global: IVA 16% post-descuento (estandar mexicano).

CREATE TABLE IF NOT EXISTS public.pos_tax_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL UNIQUE,
  iva_rate         NUMERIC(5,4) NOT NULL DEFAULT 0.16 CHECK (iva_rate >= 0 AND iva_rate <= 1),
  applies_when     TEXT NOT NULL DEFAULT 'after_discount' CHECK (applies_when IN ('after_discount','before_discount')),
  ieps_enabled     BOOLEAN NOT NULL DEFAULT false,
  ieps_default_rate NUMERIC(5,4) NOT NULL DEFAULT 0.08,
  tasa_frontera    BOOLEAN NOT NULL DEFAULT false,
  exento           BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT
);

CREATE INDEX IF NOT EXISTS pos_tax_config_tenant_idx ON public.pos_tax_config(tenant_id);

-- RLS: solo lectura/escritura por usuarios del mismo tenant + superadmin
ALTER TABLE public.pos_tax_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_config_select_own_tenant" ON public.pos_tax_config;
CREATE POLICY "tax_config_select_own_tenant"
  ON public.pos_tax_config FOR SELECT
  USING (
    tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

DROP POLICY IF EXISTS "tax_config_write_own_tenant" ON public.pos_tax_config;
CREATE POLICY "tax_config_write_own_tenant"
  ON public.pos_tax_config FOR ALL
  USING (
    (
      tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
      AND (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('owner','admin')
    )
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

-- Seed: defaults para tenants existentes (16% post-descuento)
INSERT INTO public.pos_tax_config (tenant_id, iva_rate, applies_when)
SELECT DISTINCT tenant_id, 0.16, 'after_discount'
FROM public.pos_tenants
WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id) DO NOTHING;

COMMENT ON TABLE public.pos_tax_config IS 'AGENTE 6 (2026-05-16): configuracion fiscal por tenant. IVA, IEPS, frontera, exento.';
