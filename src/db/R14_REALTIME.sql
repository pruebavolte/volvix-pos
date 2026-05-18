-- R14_REALTIME.sql
-- Habilita Supabase Realtime sobre las tablas de Volvix POS.
-- Ejecutar en el SQL editor de Supabase con un rol con privilegios sobre la
-- publicación `supabase_realtime` (normalmente postgres).
--
-- NOTA: el spec original menciona `sales, customers, products`. En este
-- proyecto las tablas reales llevan el prefijo `volvix_`. Se usan los nombres
-- reales del esquema. Si en el futuro se renombran, actualizar este archivo.

BEGIN;

-- Asegurar que la publicación existe (Supabase la crea por defecto, pero
-- ejecutar este script en una DB nueva no debe fallar).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Añadir tablas a la publicación (idempotente: ignora si ya están).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['volvix_ventas', 'volvix_productos', 'volvix_tenants', 'volvix_usuarios']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        RAISE NOTICE 'Tabla %% añadida a supabase_realtime', t;
      ELSE
        RAISE NOTICE 'Tabla %% ya estaba en supabase_realtime', t;
      END IF;
    ELSE
      RAISE NOTICE 'Tabla %% no existe — omitida', t;
    END IF;
  END LOOP;
END $$;

-- Replica identity FULL: necesario para recibir filas `old` en UPDATE/DELETE
-- y para que los filtros server-side por tenant_id trabajen sobre la fila
-- previa también.
ALTER TABLE IF EXISTS public.volvix_ventas    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_productos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_tenants   REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.volvix_usuarios  REPLICA IDENTITY FULL;

COMMIT;

-- Verificación:
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
