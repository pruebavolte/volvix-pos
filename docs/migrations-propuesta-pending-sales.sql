-- PROPUESTA (NO APLICADA) — pending_sales: columnas para tickets abiertos estilo Loyverse
-- Rama web/loyverse · 2026-09-20 · Aplicarla en produccion = luz verde de Vicky (regla comun 2c).
--
-- Por que hace falta (verificado por lectura PostgREST contra la BD real, 2026-09-20):
--   pending_sales solo tiene: id, tenant_id, user_id(uuid), reference, items(jsonb), customer_id, customer_name,
--   total, notes, expires_at, restored_at, cancelled_at, created_at.  NO existen name / comment / employee / dining
--   (GET ...?select=name -> 42703 "column pending_sales.name does not exist").
--   Hoy POST /api/sales/pending manda primero esas columnas, PostgREST las rechaza, y el server reintenta con
--   notes='VLXMETA:{json}' (<=500 chars). Funciona, pero: (1) cada guardado con nombre hace 2 viajes a la BD y deja un
--   error en el log; (2) name/comment no se pueden buscar/ordenar en SQL; (3) la nota del ticket y la meta comparten
--   el mismo limite de 500 chars. Con estas columnas el primer intento pasa y el fallback queda solo para entornos sin migrar.
--
-- Orden seguro: 1) aplicar este archivo  2) NOTIFY pgrst (incluido)  3) verificar con el SELECT del final
--   4) NO hace falta desplegar codigo: el server ya envia name/comment/employee/dining y el cliente (parseMeta)
--   lee columnas primero y VLXMETA despues.  Rollback: ver bloque ROLLBACK (las columnas son nullable, sin riesgo).

BEGIN;

ALTER TABLE public.pending_sales
  ADD COLUMN IF NOT EXISTS name     text,   -- nombre del ticket (default HH:MM o "Mesa 4")
  ADD COLUMN IF NOT EXISTS comment  text,   -- comentario del ticket
  ADD COLUMN IF NOT EXISTS employee text,   -- quien lo guardo (mesero/cajero)
  ADD COLUMN IF NOT EXISTS dining   text;   -- opcion de comedor: Comer aqui / Para llevar / A domicilio / ...

-- Migrar lo ya guardado como VLXMETA (si lo hay; al 2026-09-20 la tabla esta vacia fuera de TNT-MATA8).
-- Funcion temporal tolerante: un VLXMETA truncado por el bug anterior (slice 500) no debe abortar la migracion.
CREATE OR REPLACE FUNCTION pg_temp.try_jsonb(t text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN t::jsonb; EXCEPTION WHEN others THEN RETURN NULL; END $$;

UPDATE public.pending_sales p
   SET name     = COALESCE(p.name,     NULLIF(m.j->>'n', '')),
       comment  = COALESCE(p.comment,  NULLIF(m.j->>'c', '')),
       employee = COALESCE(p.employee, NULLIF(m.j->>'e', '')),
       dining   = COALESCE(p.dining,   NULLIF(m.j->>'d', '')),
       notes    = NULLIF(m.j->>'t', '')
  FROM (SELECT id, pg_temp.try_jsonb(substr(notes, 9)) AS j
          FROM public.pending_sales
         WHERE notes LIKE 'VLXMETA:%') m
 WHERE p.id = m.id AND m.j IS NOT NULL;

-- Busqueda/orden de la lista "Tickets abiertos" por tenant (ya existe idx_pendsales_tenant(tenant_id, restored_at, cancelled_at)).
CREATE INDEX IF NOT EXISTS idx_pendsales_tenant_created
  ON public.pending_sales (tenant_id, created_at DESC);

COMMIT;

-- PostgREST debe recargar su cache de esquema para aceptar las columnas nuevas:
NOTIFY pgrst, 'reload schema';

-- Verificacion (debe devolver 0 filas de error, no "column ... does not exist"):
--   SELECT id, name, comment, employee, dining FROM public.pending_sales LIMIT 1;

-- ROLLBACK (solo si hiciera falta):
--   ALTER TABLE public.pending_sales DROP COLUMN IF EXISTS name, DROP COLUMN IF EXISTS comment,
--     DROP COLUMN IF EXISTS employee, DROP COLUMN IF EXISTS dining;
--   DROP INDEX IF EXISTS public.idx_pendsales_tenant_created;
