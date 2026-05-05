-- ============================================================================
-- 2026-05 audit B-38: corregir trigger apply_inventory_movement
-- Bug: 'traslado' restaba del stock GLOBAL del producto. Pero un traslado
-- entre almacenes NO debe afectar el stock global — solo mover entre almacenes.
-- Si la migración anterior dejó traslado dentro de la rama 'venta/salida/merma',
-- aquí lo separamos.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_inventory_movement() RETURNS TRIGGER AS $$
DECLARE
  v_has_stock BOOLEAN;
  v_has_warehouse BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'products' AND column_name = 'stock'
  ) INTO v_has_stock;

  -- ¿Existe stock por almacén?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'inventory_by_warehouse'
  ) INTO v_has_warehouse;

  IF v_has_stock THEN
    -- Ventas / salidas / merma → restan del stock global SIEMPRE.
    IF NEW.type IN ('venta','salida','merma') THEN
      EXECUTE format(
        'UPDATE products SET stock = COALESCE(stock,0) - %s WHERE id = %L',
        NEW.quantity, NEW.product_id
      );
    -- Entradas / devoluciones → suman.
    ELSIF NEW.type IN ('entrada','devolucion') THEN
      EXECUTE format(
        'UPDATE products SET stock = COALESCE(stock,0) + %s WHERE id = %L',
        NEW.quantity, NEW.product_id
      );
    -- Ajuste → set absoluto.
    ELSIF NEW.type = 'ajuste' THEN
      IF NEW.after_qty IS NOT NULL THEN
        EXECUTE format(
          'UPDATE products SET stock = %s WHERE id = %L',
          NEW.after_qty, NEW.product_id
        );
      END IF;
    -- TRASLADO: el stock GLOBAL no cambia. Solo se ajusta inventory_by_warehouse
    -- usando branch_id (origen) y branch_id_to (destino) si la tabla existe.
    ELSIF NEW.type = 'traslado' THEN
      IF v_has_warehouse AND NEW.branch_id IS NOT NULL AND NEW.branch_id_to IS NOT NULL THEN
        -- Origen: -qty
        EXECUTE format(
          'UPDATE inventory_by_warehouse SET stock = COALESCE(stock,0) - %s
             WHERE product_id = %L AND warehouse_id = %L',
          NEW.quantity, NEW.product_id, NEW.branch_id
        );
        -- Destino: +qty (upsert)
        EXECUTE format(
          'INSERT INTO inventory_by_warehouse(product_id, warehouse_id, stock)
             VALUES (%L, %L, %s)
             ON CONFLICT (product_id, warehouse_id) DO UPDATE
             SET stock = COALESCE(inventory_by_warehouse.stock,0) + EXCLUDED.stock',
          NEW.product_id, NEW.branch_id_to, NEW.quantity
        );
      END IF;
      -- Stock global INTACTO en traslado.
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_inv_movement ON inventory_movements;
CREATE TRIGGER trg_apply_inv_movement
  AFTER INSERT ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION apply_inventory_movement();

-- ============================================================
-- Aplicar en Supabase SQL editor o:
--   psql $DATABASE_URL -f migrations/inventory-movements-fix-traslado.sql
-- ============================================================
