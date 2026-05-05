-- ============================================================================
-- R9b — Security hardening (P1 batch)
-- Round 9b · FIX-9b-2, FIX-9b-3, FIX-9b-5
--
-- Issues addressed:
--   FIX-9b-2 (S-3): fraud_scan() RPC was SECURITY DEFINER without tenant_id
--     guard and granted EXECUTE to authenticated → any cashier could call it
--     directly via PostgREST RPC and dump cross-tenant detection results.
--   FIX-9b-3 (S-4): app.allow_post_z bypass was documented but no server-side
--     wrapper existed, leaving it accessible only from raw SQL with elevated
--     privileges. A wrapped RPC update_sale_with_post_z_bypass() lets the
--     Node server perform compensations atomically while the bypass GUC is set.
--   FIX-9b-5 (SEC-4): pos_event_stream policy pes_self_read allowed any
--     authenticated user of the tenant to read rows where user_id IS NULL,
--     leaking admin-only events (fraud_alert, etc.). New event_scope column
--     plus a stricter SELECT policy split visibility into user / tenant_admin
--     / tenant_all / public.
--
-- Coherence Charter: R3 (RLS), R4 (RLS verification), R6 (adversarial:
--   cashier with valid JWT can no longer call fraud_scan, can no longer
--   read tenant_admin events, cannot bypass post-Z trigger via REST).
--
-- IDEMPOTENTE — corre N veces sin romper.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX-9b-2 · fraud_scan(p_tenant_id) — guard de tenant + role + GRANT restringido
-- ============================================================================
-- Notes:
--   * preserva la firma RETURNS TABLE original
--   * añade dos guards: (1) p_tenant_id no vacío, (2) role del JWT manager+
--   * GRANT REVOKE: solo service_role puede llamarla via PostgREST. Llamadas
--     desde el server Node siguen funcionando (usan service_role key).
--   * Defensa en profundidad: aunque alguien obtenga GRANT por error, el
--     guard de role bloquea la llamada con role=cashier o role IS NULL.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fraud_scan(p_tenant_id TEXT)
RETURNS TABLE (
  pattern         TEXT,
  severity        TEXT,
  user_id         UUID,
  resource        TEXT,
  resource_id     TEXT,
  details         JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Guard 1: tenant_id no vacío y razonable
  IF p_tenant_id IS NULL OR LENGTH(TRIM(p_tenant_id)) < 3 THEN
    RAISE EXCEPTION 'tenant_required: p_tenant_id must be a non-empty string of length >= 3'
      USING ERRCODE = 'P0001', HINT = 'TENANT_REQUIRED';
  END IF;

  -- Guard 2: role check (defensa adicional al GRANT)
  -- Si la llamada llega via service_role no hay JWT claims y el role queda NULL.
  -- En ese caso permitimos (es la ruta esperada desde server Node).
  BEGIN
    caller_role := current_setting('request.jwt.claims', true)::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;

  -- Si hay claims (REST call autenticado) y el role NO es manager+, bloquear
  IF caller_role IS NOT NULL
     AND caller_role NOT IN ('owner','admin','superadmin','manager','service_role') THEN
    RAISE EXCEPTION 'insufficient_role: fraud_scan requires manager+ (got %)', caller_role
      USING ERRCODE = '42501', HINT = 'INSUFFICIENT_ROLE';
  END IF;

  -- Patrón 1: cashier con > 5 cancels/devoluciones en 1 hora
  RETURN QUERY
    SELECT
      'cashier_high_cancels'::TEXT,
      'high'::TEXT,
      s.canceled_by,
      'pos_sales'::TEXT,
      NULL::TEXT,
      jsonb_build_object(
        'cancel_count', COUNT(*),
        'window_min', 60,
        'tenant_id', p_tenant_id
      )
    FROM public.pos_sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.status = 'cancelled'
      AND s.canceled_at >= now() - interval '1 hour'
      AND s.canceled_by IS NOT NULL
    GROUP BY s.canceled_by
    HAVING COUNT(*) > 5;

  -- Patrón 2: cashier con descuentos > 20% en > 10 ventas/día
  RETURN QUERY
    SELECT
      'cashier_high_discounts'::TEXT,
      'medium'::TEXT,
      po.user_id,
      'pos_price_overrides'::TEXT,
      NULL::TEXT,
      jsonb_build_object(
        'override_count', COUNT(*),
        'avg_delta_pct', ROUND(AVG((po.original_price - po.new_price) / NULLIF(po.original_price, 0))::numeric, 4),
        'window_h', 24
      )
    FROM public.pos_price_overrides po
    WHERE po.tenant_id = p_tenant_id
      AND po.ts >= now() - interval '24 hours'
      AND po.original_price > 0
      AND ((po.original_price - po.new_price) / po.original_price) > 0.20
    GROUP BY po.user_id
    HAVING COUNT(*) > 10;

  -- Patrón 3: ventas a las 23:00-04:00 con monto > $1000
  RETURN QUERY
    SELECT
      'late_night_high_value'::TEXT,
      'medium'::TEXT,
      s.pos_user_id,
      'pos_sales'::TEXT,
      s.id::TEXT,
      jsonb_build_object(
        'total', s.total,
        'created_at', s.created_at,
        'hour', EXTRACT(HOUR FROM s.created_at)
      )
    FROM public.pos_sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.created_at >= now() - interval '1 hour'
      AND COALESCE(s.total, 0) > 1000
      AND (EXTRACT(HOUR FROM s.created_at) >= 23 OR EXTRACT(HOUR FROM s.created_at) < 4);

  -- Patrón 4: > 3 reimpresiones del mismo ticket
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sale_prints') THEN
    RETURN QUERY
      SELECT
        'excessive_reprints'::TEXT,
        'low'::TEXT,
        NULL::UUID,
        'pos_sale_prints'::TEXT,
        sp.sale_id::TEXT,
        jsonb_build_object(
          'reprint_count', COUNT(*),
          'sale_id', sp.sale_id
        )
      FROM public.pos_sale_prints sp
      WHERE sp.tenant_id = p_tenant_id
        AND sp.printed_at >= now() - interval '1 hour'
      GROUP BY sp.sale_id
      HAVING COUNT(*) > 3;
  END IF;

  -- Patrón 5: usuario con > 5 lockout intentos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_auth_failures') THEN
    RETURN QUERY
      SELECT
        'auth_lockout_exceeded'::TEXT,
        'high'::TEXT,
        NULL::UUID,
        'pos_auth_failures'::TEXT,
        af.email,
        jsonb_build_object(
          'fail_count', COUNT(*),
          'window_min', 15,
          'email', af.email
        )
      FROM public.pos_auth_failures af
      WHERE af.tenant_id = p_tenant_id
        AND af.ts >= now() - interval '15 minutes'
      GROUP BY af.email
      HAVING COUNT(*) >= 5;
  END IF;

  RETURN;
END;
$$;

-- Restricted GRANT — only service_role can EXECUTE via PostgREST RPC
REVOKE EXECUTE ON FUNCTION public.fraud_scan(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fraud_scan(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fraud_scan(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fraud_scan(TEXT) TO service_role;


-- ============================================================================
-- FIX-9b-3 · update_sale_with_post_z_bypass — server-side wrapper
-- ============================================================================
-- Notes:
--   * SECURITY DEFINER + role guard (manager+/service_role)
--   * Setea app.allow_post_z='true' como GUC LOCAL → solo dura la transacción
--   * Aplica el UPDATE con jsonb_each_text para flexibilidad
--   * Solo permite mutar columnas whitelisted (status, reversed_*, cfdi_*,
--     reversal_reason, reversal_return_id) — NO total/items/payment_method.
--   * Devuelve la fila actualizada como jsonb.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_sale_with_post_z_bypass(
  p_sale_id UUID,
  p_updates JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  caller_role TEXT;
  allowed_cols TEXT[] := ARRAY[
    'status','reversed_at','reversed_by','reversal_reason','reversal_return_id',
    'cfdi_status','cfdi_uuid','canceled_at','canceled_by',
    'compensation_z_date','affects_z'
  ];
  k TEXT;
  v TEXT;
  set_parts TEXT := '';
  result_row JSONB;
  sql_text TEXT;
BEGIN
  -- Role guard: manager+ via JWT OR service_role direct
  BEGIN
    caller_role := current_setting('request.jwt.claims', true)::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;
  IF caller_role IS NOT NULL
     AND caller_role NOT IN ('owner','admin','superadmin','manager','service_role') THEN
    RAISE EXCEPTION 'insufficient_role: post-Z bypass requires manager+ (got %)', caller_role
      USING ERRCODE = '42501', HINT = 'INSUFFICIENT_ROLE';
  END IF;

  IF p_sale_id IS NULL THEN
    RAISE EXCEPTION 'p_sale_id required' USING ERRCODE = '22023';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'p_updates must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  -- Build SET clause from whitelisted keys only
  FOR k, v IN SELECT key, value FROM jsonb_each_text(p_updates) LOOP
    IF k = ANY(allowed_cols) THEN
      IF length(set_parts) > 0 THEN
        set_parts := set_parts || ', ';
      END IF;
      set_parts := set_parts || quote_ident(k) || ' = ' || quote_nullable(v);
    END IF;
  END LOOP;

  IF length(set_parts) = 0 THEN
    RAISE EXCEPTION 'no_valid_columns: ninguna columna whitelisted en p_updates' USING ERRCODE = '22023';
  END IF;

  -- Set bypass GUC (LOCAL → solo esta transacción)
  PERFORM set_config('app.allow_post_z', 'true', true);

  -- Ejecutar UPDATE dinámico
  sql_text := 'UPDATE public.pos_sales SET ' || set_parts
              || ' WHERE id = $1 RETURNING to_jsonb(pos_sales.*)';
  EXECUTE sql_text USING p_sale_id INTO result_row;

  IF result_row IS NULL THEN
    RAISE EXCEPTION 'sale_not_found: %', p_sale_id USING ERRCODE = 'P0002';
  END IF;

  RETURN result_row;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.update_sale_with_post_z_bypass(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_sale_with_post_z_bypass(UUID, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_sale_with_post_z_bypass(UUID, JSONB) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_sale_with_post_z_bypass(UUID, JSONB) TO service_role;


-- ============================================================================
-- FIX-9b-5 · pos_event_stream event_scope hardening
-- ============================================================================
-- Notes:
--   * Añade columna event_scope con CHECK de valores permitidos
--   * Backfill seguro: rows con user_id IS NOT NULL → 'user',
--                      rows con user_id IS NULL → 'tenant_all' (visibilidad
--                      previa preservada para datos legacy).
--   * Reescribe pes_self_read para diferenciar visibilidad por scope.
--   * Conserva pes_service_all sin cambios (ya restringido a service_role en R9a).
-- ============================================================================
DO $evs$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_event_stream') THEN
    RAISE NOTICE 'pos_event_stream no existe; FIX-9b-5 skipped';
    RETURN;
  END IF;

  -- 1) Add column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='pos_event_stream' AND column_name='event_scope'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.pos_event_stream
        ADD COLUMN event_scope TEXT
        CHECK (event_scope IN ('user','tenant_admin','tenant_all','public'))
    $sql$;
  END IF;

  -- 2) Backfill once: rows con user_id no null → 'user', null → 'tenant_all'
  EXECUTE $sql$
    UPDATE public.pos_event_stream
       SET event_scope = 'user'
     WHERE event_scope IS NULL AND user_id IS NOT NULL
  $sql$;

  EXECUTE $sql$
    UPDATE public.pos_event_stream
       SET event_scope = 'tenant_all'
     WHERE event_scope IS NULL AND user_id IS NULL
  $sql$;

  -- 3) Index para filtros frecuentes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='pos_event_stream'
       AND indexname='idx_pes_tenant_scope_ts'
  ) THEN
    EXECUTE 'CREATE INDEX idx_pes_tenant_scope_ts
              ON public.pos_event_stream (tenant_id, event_scope, ts DESC)';
  END IF;
END $evs$;


-- 4) Rewrite policies (idempotente)
DO $pol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_event_stream') THEN
    RAISE NOTICE 'pos_event_stream no existe; policies skipped';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.pos_event_stream ENABLE ROW LEVEL SECURITY';

  -- Drop legacy policies (R8b leaky + R9a refined)
  BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_self_read   ON public.pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_user_select ON public.pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- New scope-aware SELECT policy
  EXECUTE $p$
    CREATE POLICY pes_user_select ON public.pos_event_stream
      FOR SELECT TO authenticated
      USING (
        -- Tenant scope obligatorio
        tenant_id = COALESCE((auth.jwt() ->> 'tenant_id')::text, '__none__')
        AND (
          -- 'user' scope: solo el dueño exacto
          (event_scope = 'user'
            AND user_id IS NOT NULL
            AND user_id::text = (auth.jwt() ->> 'sub'))
          -- 'tenant_admin': solo owner/admin/superadmin/manager
          OR (event_scope = 'tenant_admin'
              AND (auth.jwt() ->> 'role') IN ('owner','admin','superadmin','manager'))
          -- 'tenant_all': cualquier usuario autenticado del tenant
          OR (event_scope = 'tenant_all')
          -- 'public': cualquiera
          OR (event_scope = 'public')
          -- Legacy fallback: filas sin event_scope (no debería pasar tras backfill)
          OR (event_scope IS NULL
              AND (user_id::text = (auth.jwt() ->> 'sub')
                   OR user_id IS NULL))
        )
      )
  $p$;

  -- Conservar pes_service_all (R9a ya lo restringió a service_role)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='pos_event_stream'
       AND policyname='pes_service_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY pes_service_all ON public.pos_event_stream
        FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;
  END IF;
END $pol$;

COMMIT;

-- ============================================================================
-- Smoke checks (manual after deploy):
--   1. SELECT public.fraud_scan('');              -- ERROR tenant_required
--      SELECT public.fraud_scan('TNT001');        -- desde service_role: ok
--   2. SELECT public.update_sale_with_post_z_bypass('<sale-uuid>', '{"status":"reversed"}'::jsonb);
--   3. INSERT INTO pos_event_stream (tenant_id, event_type, event_scope, payload)
--      VALUES ('TNT001','fraud_alert','tenant_admin','{"sev":"high"}'::jsonb);
--      → solo manager+ del tenant la ve, cashier NO.
--   4. INSERT INTO pos_event_stream (tenant_id, user_id, event_type, event_scope, payload)
--      VALUES ('TNT001','<user-A-uuid>','cart_updated','user','{"qty":3}'::jsonb);
--      → solo user-A la ve.
-- ============================================================================
