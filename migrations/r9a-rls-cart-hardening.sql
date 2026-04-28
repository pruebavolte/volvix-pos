-- ============================================================================
-- R9a — RLS hardening for active carts and event stream
-- Round 9a · FIX-9a-3 (P0)
--
-- Síntoma corregido:
--   En r8b-recovery-server.sql las policies *_service_all eran
--     FOR ALL WITH CHECK (true)
--   sin TO service_role. Cualquier usuario autenticado podía
--   UPDATE/DELETE el cart o el event_stream de OTRO cajero del mismo tenant
--   atacando PostgREST con un JWT válido cualquiera.
--
-- Patrón aplicado:
--   1) DROP de la policy demasiado permisiva.
--   2) RECREATE *_service_all restringida a TO service_role.
--   3) Policies por operación (SELECT/INSERT/UPDATE/DELETE) para usuarios
--      autenticados, scope estricto al user_id del JWT (auth.jwt()->>'sub').
--   4) Owner/superadmin/admin pueden SELECT (consultas globales del tenant)
--      pero no UPDATE/DELETE para conservar el principio de menor privilegio.
--
-- Coherence Charter: R4 (RLS verification), R6 (adversarial: JWT user A
--   ya NO puede tocar carts de user B en el mismo tenant).
--
-- IDEMPOTENTE — corre N veces sin romper.
-- ============================================================================

DO $$
BEGIN
  -- ==========================================================================
  -- pos_active_carts
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_active_carts') THEN
    EXECUTE 'ALTER TABLE pos_active_carts ENABLE ROW LEVEL SECURITY';

    -- Drop legacy permissive policies
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_service_all ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_self_read   ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_user_select ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_user_insert ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_user_update ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pac_user_delete ON pos_active_carts'; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Service role: passthrough (api/index.js corre con service_role key)
    EXECUTE $p$
      CREATE POLICY pac_service_all ON pos_active_carts
        FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;

    -- Authenticated SELECT — solo el dueño del cart o roles privilegiados del tenant
    EXECUTE $p$
      CREATE POLICY pac_user_select ON pos_active_carts
        FOR SELECT TO authenticated
        USING (
          user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid
          OR (
            tenant_id = (auth.jwt() ->> 'tenant_id')
            AND COALESCE(auth.jwt() ->> 'role','') IN ('owner','superadmin','admin','manager')
          )
        )
    $p$;

    -- Authenticated INSERT — solo crear tu propio cart, en TU tenant
    EXECUTE $p$
      CREATE POLICY pac_user_insert ON pos_active_carts
        FOR INSERT TO authenticated
        WITH CHECK (
          user_id  = NULLIF(auth.jwt() ->> 'sub','')::uuid
          AND tenant_id = (auth.jwt() ->> 'tenant_id')
        )
    $p$;

    -- Authenticated UPDATE — solo tu propio cart (no puedes cambiar al cart de otro)
    EXECUTE $p$
      CREATE POLICY pac_user_update ON pos_active_carts
        FOR UPDATE TO authenticated
        USING      (user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid)
        WITH CHECK (user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid)
    $p$;

    -- Authenticated DELETE — solo tu propio cart
    EXECUTE $p$
      CREATE POLICY pac_user_delete ON pos_active_carts
        FOR DELETE TO authenticated
        USING (user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid)
    $p$;
  END IF;

  -- ==========================================================================
  -- pos_event_stream — mismo patrón estricto
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_event_stream') THEN
    EXECUTE 'ALTER TABLE pos_event_stream ENABLE ROW LEVEL SECURITY';

    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_service_all ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_self_read   ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_user_select ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_user_insert ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_user_update ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS pes_user_delete ON pos_event_stream'; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Service: full
    EXECUTE $p$
      CREATE POLICY pes_service_all ON pos_event_stream
        FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;

    -- SELECT: dueño del evento O broadcast del tenant (user_id NULL = broadcast)
    EXECUTE $p$
      CREATE POLICY pes_user_select ON pos_event_stream
        FOR SELECT TO authenticated
        USING (
          user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid
          OR (user_id IS NULL AND tenant_id = (auth.jwt() ->> 'tenant_id'))
          OR (
            tenant_id = (auth.jwt() ->> 'tenant_id')
            AND COALESCE(auth.jwt() ->> 'role','') IN ('owner','superadmin','admin','manager')
          )
        )
    $p$;

    -- INSERT: solo eventos firmados por TI, en TU tenant
    EXECUTE $p$
      CREATE POLICY pes_user_insert ON pos_event_stream
        FOR INSERT TO authenticated
        WITH CHECK (
          (user_id IS NULL OR user_id = NULLIF(auth.jwt() ->> 'sub','')::uuid)
          AND tenant_id = (auth.jwt() ->> 'tenant_id')
        )
    $p$;

    -- UPDATE / DELETE: bloqueados para usuarios. Eventos son append-only,
    -- solo service_role (vía la policy pes_service_all) puede mutarlos.
    -- Sin policies = denegado por default (RLS habilitado).
  END IF;

  -- ==========================================================================
  -- tenant_settings — patrón consistente (no estaba afectado pero alineamos)
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant_settings') THEN
    EXECUTE 'ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY';

    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_service_all ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_self_read   ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_user_select ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP POLICY IF EXISTS ts_owner_write ON tenant_settings'; EXCEPTION WHEN OTHERS THEN NULL; END;

    EXECUTE $p$
      CREATE POLICY ts_service_all ON tenant_settings
        FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;

    EXECUTE $p$
      CREATE POLICY ts_user_select ON tenant_settings
        FOR SELECT TO authenticated
        USING (tenant_id = (auth.jwt() ->> 'tenant_id'))
    $p$;

    -- Solo owner/superadmin/admin pueden mutar settings de SU tenant
    EXECUTE $p$
      CREATE POLICY ts_owner_write ON tenant_settings
        FOR ALL TO authenticated
        USING (
          tenant_id = (auth.jwt() ->> 'tenant_id')
          AND COALESCE(auth.jwt() ->> 'role','') IN ('owner','superadmin','admin')
        )
        WITH CHECK (
          tenant_id = (auth.jwt() ->> 'tenant_id')
          AND COALESCE(auth.jwt() ->> 'role','') IN ('owner','superadmin','admin')
        )
    $p$;
  END IF;

END $$;

-- ============================================================================
-- Smoke test post-migration (corre como super-user; debe pasar limpio)
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Verificar que las nuevas policies existen en pos_active_carts
  SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename ='pos_active_carts'
      AND policyname IN ('pac_service_all','pac_user_select','pac_user_insert','pac_user_update','pac_user_delete');
  IF v_count < 5 THEN
    RAISE NOTICE 'r9a smoke: pos_active_carts policies incompletas (got %)', v_count;
  ELSE
    RAISE NOTICE 'r9a smoke: pos_active_carts OK (5/5 policies)';
  END IF;

  -- Verificar que pac_service_all tiene roles=service_role (no PUBLIC)
  SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='pos_active_carts'
      AND policyname='pac_service_all'
      AND 'service_role' = ANY(roles);
  IF v_count = 0 THEN
    RAISE WARNING 'r9a smoke: pac_service_all NO está restringida a service_role';
  ELSE
    RAISE NOTICE 'r9a smoke: pac_service_all restringida a service_role OK';
  END IF;
END $$;
