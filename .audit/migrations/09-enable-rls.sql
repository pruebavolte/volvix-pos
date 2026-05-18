-- Migration 09: Habilitar Row Level Security en las 18 tablas nuevas
-- Política mínima: service_role bypass automático (siempre), anon/authenticated SIN acceso por defecto.
-- Cuando se necesiten reads desde frontend, agregar policies específicas POST-pitch.
-- 2026-05-18

BEGIN;

-- Lista de tablas a proteger (de migrations 05 + 08)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'giros_terminologias',
    'prospects_enrichment',
    'menu_ocr_jobs',
    'b2b_marketplace_offers',
    'b2b_marketplace_notificaciones',
    'transaction_fees_config',
    'transaction_fees_charged',
    'reportes_personalizados',
    'whatsapp_crm_threads',
    'whatsapp_crm_messages',
    'soporte_sesiones',
    'business_plans',
    'proveedores_crowdsourced',
    'meta_ads_campaigns',
    'meta_ads_rules',
    'zona_perfiles',
    'importacion_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Verificar que la tabla existe antes de tocarla
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Drop policy si ya existe (idempotente)
      EXECUTE format('DROP POLICY IF EXISTS svc_role_all ON public.%I', t);
      -- Policy: solo service_role puede leer/escribir (anon y authenticated bloqueados)
      EXECUTE format(
        'CREATE POLICY svc_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
      RAISE NOTICE 'RLS enabled on %', t;
    ELSE
      RAISE NOTICE 'Skip: % does not exist', t;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verificación:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
--   AND tablename IN ('giros_terminologias','prospects_enrichment','menu_ocr_jobs',...);
-- Debe regresar rowsecurity=true para todas.
