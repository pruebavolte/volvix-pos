-- 2026-05-14 — Cleanup del trigger DB roto.
--
-- BACKGROUND:
-- En migrations/inventory-movements.sql habia un trigger trg_apply_inv_movement
-- que disparaba al INSERT en inventory_movements para actualizar stock auto.
-- PERO el trigger:
--   1. Referencia tabla `products` (que no existe — la real es `pos_products`)
--   2. Tiene signos INVERTIDOS para type='traslado' (decrementa en ambas direcciones)
-- Por eso el endpoint /api/inventory/transfer era efectivamente NO-OP en stock.
--
-- DECISION:
-- En lugar de "arreglar" el trigger (complejo: traslado preserva total global pero
-- mueve stock entre sucursales en inventory_stock), DROP del trigger y delegamos
-- TODO el control de stock al codigo aplicativo:
--   - decrement_stock_atomic (ventas, ya existe)
--   - restock_atomic (devoluciones, R24)
--   - apply_inventory_movement RPC (transferencias, ajustes, conteo — ya existe en app schema)
--   - PATCH directo pos_products.stock (compras receive — explicito en /api/purchases/:id/receive)
--
-- Esto elimina la duplicacion (trigger DB + codigo) que causaba inconsistencias.
-- El codigo aplicativo es ahora la unica fuente de verdad para mutaciones de stock.
--
-- Idempotencia: DROP IF EXISTS, seguro de re-ejecutar.

DROP TRIGGER IF EXISTS trg_apply_inv_movement ON inventory_movements;
DROP FUNCTION IF EXISTS apply_inventory_movement(); -- la version publica con bug

-- NOTA: NO tocamos `app.apply_inventory_movement(uuid,uuid,uuid,uuid,numeric,text,text,uuid)`
-- que es la RPC correcta usada por /api/inventory/movements y nuevo /api/inventory/transfer.
-- Esta vive en el schema `app` y es independiente de la del schema public que dropamos.

-- Verificacion: SELECT proname,pronamespace::regnamespace FROM pg_proc WHERE proname='apply_inventory_movement';
-- Esperado: solo aparece `app.apply_inventory_movement`, NO `public.apply_inventory_movement`.
