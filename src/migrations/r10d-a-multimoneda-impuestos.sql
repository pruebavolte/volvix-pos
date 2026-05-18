-- ============================================================================
-- VOLVIX POS — R10d-A Multi-moneda + Multi-impuestos por sucursal
-- Migration: r10d-a-multimoneda-impuestos.sql
-- ----------------------------------------------------------------------------
-- Goals:
--   * pos_currencies: catálogo de monedas con tipo de cambio a base
--   * pos_sales.currency, exchange_rate_at_sale, total_in_base_currency
--   * tenant_settings.base_currency (default MXN)
--   * pos_branches.allowed_currencies, tax_rate (override), tax_zone
--   * Indexes + RLS basics (idempotent)
--   * Audit triggers (R5c los captura auto vía pg_audit/triggers existentes)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. pos_currencies — catálogo (tabla NUEVA, separada de R14_CURRENCIES.currencies)
--    Usa exchange_rate_to_base + last_updated_at + source para FX-tracking simple.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_currencies (
  code                    TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  symbol                  TEXT NOT NULL DEFAULT '$',
  decimal_places          SMALLINT NOT NULL DEFAULT 2,
  exchange_rate_to_base   NUMERIC(20,10) NOT NULL DEFAULT 1.0
                            CHECK (exchange_rate_to_base > 0),
  last_updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  source                  TEXT NOT NULL DEFAULT 'manual',
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed (idempotent)
INSERT INTO public.pos_currencies (code, name, symbol, decimal_places, exchange_rate_to_base, source) VALUES
  ('MXN',        'Peso Mexicano',          '$',     2, 1.0,    'seed'),
  ('USD',        'US Dollar',              'US$',   2, 18.5,   'seed'),
  ('EUR',        'Euro',                   '€',     2, 20.5,   'seed'),
  ('GTQ',        'Quetzal Guatemalteco',   'Q',     2, 2.4,    'seed'),
  ('BZD',        'Belize Dollar',          'BZ$',   2, 9.2,    'seed'),
  ('USD-BORDER', 'US Dollar (frontera)',   'US$',   2, 18.0,   'seed')
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_pos_currencies_active
  ON public.pos_currencies(code) WHERE active = TRUE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pos_currencies_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_currencies_updated_at ON public.pos_currencies;
CREATE TRIGGER trg_pos_currencies_updated_at
  BEFORE UPDATE ON public.pos_currencies
  FOR EACH ROW EXECUTE FUNCTION public.pos_currencies_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. pos_sales — agregar currency + exchange_rate_at_sale + total_in_base_currency
--    NB: R14_CURRENCIES ya añadió currency_code+fx_rate_to_base; coexisten:
--    - currency_code (CHAR(3), FK→currencies)  ← legado R14
--    - currency      (TEXT, FK→pos_currencies) ← nuevo R10d-A
--    Mantenemos ambos para no romper código existente.
-- ---------------------------------------------------------------------------
DO $sales_alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales' AND table_schema='public') THEN
    -- currency (nueva, opcional FK a pos_currencies)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_sales' AND column_name='currency' AND table_schema='public'
    ) THEN
      EXECUTE 'ALTER TABLE public.pos_sales ADD COLUMN currency TEXT DEFAULT ''MXN''';
    END IF;

    -- exchange_rate_at_sale (snapshot del rate al momento de la venta)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_sales' AND column_name='exchange_rate_at_sale' AND table_schema='public'
    ) THEN
      EXECUTE 'ALTER TABLE public.pos_sales ADD COLUMN exchange_rate_at_sale NUMERIC(20,10) DEFAULT 1.0';
    END IF;

    -- total_in_base_currency (precomputado para reportes consolidados)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='pos_sales' AND column_name='total_in_base_currency' AND table_schema='public'
    ) THEN
      EXECUTE 'ALTER TABLE public.pos_sales ADD COLUMN total_in_base_currency NUMERIC(14,4)';
    END IF;
  END IF;
END
$sales_alter$;

CREATE INDEX IF NOT EXISTS idx_pos_sales_currency
  ON public.pos_sales(currency) WHERE currency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_currency_created
  ON public.pos_sales(tenant_id, currency, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. tenant_settings — base_currency (per-tenant)
-- ---------------------------------------------------------------------------
DO $ts_alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_settings' AND table_schema='public') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='tenant_settings' AND column_name='base_currency' AND table_schema='public'
    ) THEN
      EXECUTE 'ALTER TABLE public.tenant_settings ADD COLUMN base_currency TEXT NOT NULL DEFAULT ''MXN''';
    END IF;
  END IF;
END
$ts_alter$;

-- ---------------------------------------------------------------------------
-- 4. pos_branches — allowed_currencies + tax_rate + tax_zone
-- ---------------------------------------------------------------------------
DO $br_alter$
BEGIN
  -- allowed_currencies (TEXT[] — lista blanca de monedas que la sucursal puede aceptar)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pos_branches' AND column_name='allowed_currencies' AND table_schema='public'
  ) THEN
    EXECUTE 'ALTER TABLE public.pos_branches ADD COLUMN allowed_currencies TEXT[] NOT NULL DEFAULT ARRAY[''MXN'']::TEXT[]';
  END IF;

  -- tax_rate (override por sucursal; NULL = hereda tenant_settings.tax_rate)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pos_branches' AND column_name='tax_rate' AND table_schema='public'
  ) THEN
    EXECUTE 'ALTER TABLE public.pos_branches ADD COLUMN tax_rate NUMERIC(5,4) DEFAULT NULL CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1))';
  END IF;

  -- tax_zone (etiqueta libre — frontera_norte, general, etc)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pos_branches' AND column_name='tax_zone' AND table_schema='public'
  ) THEN
    EXECUTE 'ALTER TABLE public.pos_branches ADD COLUMN tax_zone TEXT DEFAULT NULL';
  END IF;
END
$br_alter$;

CREATE INDEX IF NOT EXISTS idx_pos_branches_tax_zone
  ON public.pos_branches(tenant_id, tax_zone) WHERE tax_zone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. branch_tax_history — auditoría de cambios de tax_rate por sucursal
--    (complementa R5c audit; permite cronología explicita con razón)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_tax_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL,
  tenant_id     TEXT NOT NULL,
  old_tax_rate  NUMERIC(5,4),
  new_tax_rate  NUMERIC(5,4),
  old_tax_zone  TEXT,
  new_tax_zone  TEXT,
  reason        TEXT,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_tax_history_branch
  ON public.branch_tax_history(branch_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_tax_history_tenant
  ON public.branch_tax_history(tenant_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 6. RLS — pos_currencies read public, write service_role
-- ---------------------------------------------------------------------------
ALTER TABLE public.pos_currencies ENABLE ROW LEVEL SECURITY;

DO $rls_curr$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_currencies' AND policyname='pos_currencies_read_public') THEN
    CREATE POLICY pos_currencies_read_public ON public.pos_currencies
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_currencies' AND policyname='pos_currencies_service_role') THEN
    CREATE POLICY pos_currencies_service_role ON public.pos_currencies
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$rls_curr$;

-- ---------------------------------------------------------------------------
-- 7. RLS — branch_tax_history (tenant-scoped read; service_role bypass)
-- ---------------------------------------------------------------------------
ALTER TABLE public.branch_tax_history ENABLE ROW LEVEL SECURITY;

DO $rls_bth$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_tax_history' AND policyname='branch_tax_history_tenant_select') THEN
    CREATE POLICY branch_tax_history_tenant_select ON public.branch_tax_history
      FOR SELECT TO authenticated
      USING (
        tenant_id IN (SELECT tenant_id::text FROM pos_users WHERE id::text = auth.uid()::text)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_tax_history' AND policyname='branch_tax_history_service_role') THEN
    CREATE POLICY branch_tax_history_service_role ON public.branch_tax_history
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$rls_bth$;

COMMIT;

-- ============================================================================
-- SMOKE QUERIES (run manually to verify):
--   SELECT code, exchange_rate_to_base FROM pos_currencies ORDER BY code;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='pos_sales'
--      AND column_name IN ('currency','exchange_rate_at_sale','total_in_base_currency');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='pos_branches'
--      AND column_name IN ('allowed_currencies','tax_rate','tax_zone');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='tenant_settings' AND column_name='base_currency';
-- ============================================================================
