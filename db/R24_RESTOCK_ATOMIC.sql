-- 2026-05-14 — Fix critico reportado por usuario:
-- "si se devuelve no se regresa al inventario"
--
-- ROOT CAUSE:
-- El endpoint POST /api/returns/:id/approve intentaba reusar la RPC
-- decrement_stock_atomic(items) pasando qty NEGATIVA (-Math.abs(qty)).
-- Pero esa RPC rechaza qty<=0 con `RAISE EXCEPTION 'invalid_qty:'` (linea 67
-- de R22_SECURITY_HARDENING.sql). El cliente envolvia el call en .catch() vacio,
-- asi el error pasaba silenciado y el restock nunca ocurria.
--
-- FIX:
-- Nueva RPC `restock_atomic(items jsonb)` que INCREMENTA stock (qty positiva).
-- Misma transaccionalidad que decrement: si UN item falla, revierte todos.
-- El cliente (api/index.js handler de /api/returns/:id/approve) sera modificado
-- en commit aparte para llamar a esta RPC en lugar de decrement_stock_atomic con
-- qty negativa.
--
-- Idempotencia: ejecutar este script multiples veces es seguro (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION restock_atomic(items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  it          jsonb;
  pid         uuid;
  qty         int;
  new_stock   int;
  result      jsonb := '[]'::jsonb;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    pid := (it->>'id')::uuid;
    qty := COALESCE((it->>'qty')::int, 0);
    IF qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty:%', pid;
    END IF;
    -- Sin check de stock minimo: siempre permitimos sumar (es restock/refund).
    UPDATE pos_products
       SET stock = COALESCE(stock, 0) + qty
     WHERE id = pid
     RETURNING stock INTO new_stock;
    IF new_stock IS NULL THEN
      RAISE EXCEPTION 'product_not_found:%', pid;
    END IF;
    result := result || jsonb_build_object('id', pid, 'ok', true, 'stock_after', new_stock, 'added', qty);
  END LOOP;
  RETURN result;
END;
$$;

-- Grant para PostgREST role (mismo que decrement_stock_atomic)
-- Si tu instancia usa otro role, ajusta aqui:
DO $$
BEGIN
  -- best-effort grant; algunos environments no tienen authenticated role
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION restock_atomic(jsonb) TO authenticated';
  EXCEPTION WHEN OTHERS THEN
    -- ignorar si el rol no existe
    NULL;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION restock_atomic(jsonb) TO service_role';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
