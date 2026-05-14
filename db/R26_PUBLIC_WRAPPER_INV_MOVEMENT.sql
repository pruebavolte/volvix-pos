-- 2026-05-14 — Wrapper public para app.apply_inventory_movement.
--
-- BACKGROUND:
-- R14 creo app.apply_inventory_movement(8 args) con SECURITY DEFINER.
-- Pero PostgREST en Supabase solo expone schemas public y graphql_public,
-- no `app`. Resultado: /rpc/apply_inventory_movement -> 404 PGRST202.
-- El codigo en api/index.js llamaba esta RPC desde /api/inventory/movements,
-- /api/inventory/counts/:id/finalize, y ahora /api/inventory/transfer.
-- TODAS estaban silenciosamente fallando.
--
-- FIX: Wrapper en schema public con mismo signature, que invoca al original.
-- Asi PostgREST lo expone via /rpc/apply_inventory_movement y todas las
-- llamadas funcionan.
--
-- Idempotencia: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_tenant_id  uuid,
  p_product_id uuid,
  p_from_loc   uuid,
  p_to_loc     uuid,
  p_qty        numeric,
  p_type       text,
  p_reason     text,
  p_user_id    uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Delegar a la implementacion real en schema app.
  SELECT app.apply_inventory_movement(
    p_tenant_id, p_product_id, p_from_loc, p_to_loc, p_qty, p_type, p_reason, p_user_id
  ) INTO v_id;
  RETURN v_id;
END;
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,uuid,uuid,numeric,text,text,uuid) TO authenticated';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,uuid,uuid,numeric,text,text,uuid) TO service_role';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
