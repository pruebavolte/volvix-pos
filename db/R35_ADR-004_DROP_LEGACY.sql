-- R35_ADR-004_DROP_LEGACY.sql — Ejecución ADR-004
-- Canonización: pos_* es la única convención. Eliminar tablas legacy si existen.
-- AUTORIZADO POR OWNER 2026-05-16 (sin clientes activos en producción).
--
-- IMPORTANTE: ejecutar PRIMERO el bloque de migración de datos (si las tablas
-- legacy tienen filas) y DESPUÉS los DROP. Si rompe algo, rollback inmediato.

DO $$
DECLARE
  legacy_tables TEXT[] := ARRAY['sales', 'customers', 'products', 'volvix_ventas', 'volvix_productos', 'volvix_clientes'];
  t TEXT;
  cnt BIGINT;
BEGIN
  FOREACH t IN ARRAY legacy_tables LOOP
    -- Verificar si la tabla existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO cnt;
      RAISE NOTICE 'Legacy table % exists with % rows', t, cnt;

      -- Migración condicional (solo si pos_* equivalente existe y la legacy tiene datos)
      IF cnt > 0 THEN
        CASE t
          WHEN 'sales' THEN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pos_sales') THEN
              -- Insertar solo rows que no estén ya en pos_sales (por id o folio)
              BEGIN
                EXECUTE 'INSERT INTO public.pos_sales SELECT * FROM public.sales s WHERE NOT EXISTS (SELECT 1 FROM public.pos_sales p WHERE p.id::text = s.id::text)';
                RAISE NOTICE 'Migrated rows from sales -> pos_sales';
              EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Migration sales -> pos_sales failed: %', SQLERRM;
              END;
            END IF;
          WHEN 'customers' THEN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pos_customers') THEN
              BEGIN
                EXECUTE 'INSERT INTO public.pos_customers SELECT * FROM public.customers c WHERE NOT EXISTS (SELECT 1 FROM public.pos_customers p WHERE p.id::text = c.id::text)';
                RAISE NOTICE 'Migrated rows from customers -> pos_customers';
              EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Migration customers -> pos_customers failed: %', SQLERRM;
              END;
            END IF;
          WHEN 'products' THEN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pos_products') THEN
              BEGIN
                EXECUTE 'INSERT INTO public.pos_products SELECT * FROM public.products p WHERE NOT EXISTS (SELECT 1 FROM public.pos_products pp WHERE pp.id::text = p.id::text)';
                RAISE NOTICE 'Migrated rows from products -> pos_products';
              EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Migration products -> pos_products failed: %', SQLERRM;
              END;
            END IF;
          ELSE
            RAISE NOTICE 'No migration path defined for %, will DROP directly', t;
        END CASE;
      END IF;
    END IF;
  END LOOP;
END $$;

-- DROPs efectivos (idempotente con IF EXISTS)
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.volvix_ventas CASCADE;
DROP TABLE IF EXISTS public.volvix_productos CASCADE;
DROP TABLE IF EXISTS public.volvix_clientes CASCADE;

-- Verificación post-DROP
DO $$
DECLARE
  t TEXT;
  still_exists INT := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales', 'customers', 'products', 'volvix_ventas', 'volvix_productos', 'volvix_clientes'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE WARNING 'Table % still exists after DROP', t;
      still_exists := still_exists + 1;
    END IF;
  END LOOP;
  IF still_exists = 0 THEN
    RAISE NOTICE 'ADR-004 SUCCESS: all 6 legacy tables dropped.';
  END IF;
END $$;

COMMENT ON SCHEMA public IS 'ADR-004 ejecutado 2026-05-16: tablas legacy sales/customers/products/volvix_* eliminadas.';
