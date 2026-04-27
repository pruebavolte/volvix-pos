-- R19 FIX: R14_REALTIME.sql
-- Original error: too many parameters specified for RAISE
-- Cause: el formato '%%' (escape de '%') más el arg `t` confunde al parser
-- (RAISE NOTICE 'Tabla %% añadida', t  → '%%' es un literal '%', deja el real arg sin slot).
-- Fix: usar un solo % por placeholder.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['volvix_ventas', 'volvix_productos', 'volvix_tenants', 'volvix_usuarios']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        RAISE NOTICE 'Tabla % añadida a supabase_realtime', t;
      ELSE
        RAISE NOTICE 'Tabla % ya estaba en supabase_realtime', t;
      END IF;
    ELSE
      RAISE NOTICE 'Tabla % no existe — omitida', t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.volvix_ventas    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_productos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_tenants   REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_usuarios  REPLICA IDENTITY FULL;

COMMIT;
