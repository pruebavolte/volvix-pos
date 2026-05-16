-- R37_CREATE_POS_CUSTOMERS.sql — Prep para B-X-6
--
-- Crea pos_customers como copia exacta del esquema legacy customers.
-- Esta es operacion ADITIVA: no toca customers existente, no rompe nada en produccion.
--
-- Prerequisitos: ninguno (CREATE IF NOT EXISTS es seguro).
-- Postrequisitos: tabla pos_customers existe + datos legacy copiados.
-- Permite que el siguiente ciclo refactorice api/index.js con seguridad.

-- ============================================================
-- 1. Crear tabla pos_customers con mismo esquema que customers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_customers (LIKE public.customers INCLUDING ALL);

-- ============================================================
-- 2. Copiar datos existentes de customers (legacy) a pos_customers
-- ============================================================
INSERT INTO public.pos_customers
SELECT * FROM public.customers
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. RLS basica para pos_customers (alineada con customers existente)
-- ============================================================
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_customers_tenant_isolation" ON public.pos_customers;
CREATE POLICY "pos_customers_tenant_isolation" ON public.pos_customers FOR ALL
  USING (
    tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')
    OR (current_setting('request.jwt.claims', true)::jsonb->>'role') IN ('superadmin','platform_owner')
  );

-- ============================================================
-- 4. Indices basicos (LIKE INCLUDING ALL ya copia los originales)
-- ============================================================
-- (sin ALTERs adicionales necesarios)

COMMENT ON TABLE public.pos_customers IS 'AGENTE V4 (B-X-6 prep): clon de customers para refactor futuro. Aditivo, no destructivo.';

-- ============================================================
-- Verificacion (no se ejecuta automaticamente, es referencia para verificacion manual):
-- SELECT count(*) FROM public.pos_customers; -- Debe igualar count(customers)
-- SELECT count(*) FROM public.customers;
-- ============================================================
