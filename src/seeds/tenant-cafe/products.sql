-- Café Central — 30 productos (cafetería)
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000005
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000005', slug),
       '22222222-0005-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '180 days' + (random() * interval '120 days')
FROM (VALUES
  ('cafe-001','Espresso Sencillo','Café',35.00,8.00,9999,'Espresso 30ml — modificadores: doble (+10)'),
  ('cafe-002','Espresso Doble','Café',45.00,12.00,9999,'Doble shot 60ml'),
  ('cafe-003','Americano','Café',40.00,10.00,9999,'Americano 240ml — modificadores: tamaño'),
  ('cafe-004','Americano Grande','Café',48.00,12.00,9999,'Americano 360ml'),
  ('cafe-005','Cappuccino','Café',50.00,14.00,9999,'Cappuccino italiano — leche entera/light/almendra/avena'),
  ('cafe-006','Latte','Café',55.00,16.00,9999,'Latte clásico — modif: vainilla/caramelo/avellana'),
  ('cafe-007','Latte Vainilla','Café',55.00,17.00,9999,'Latte saborizado vainilla'),
  ('cafe-008','Latte Caramelo','Café',55.00,17.00,9999,'Latte saborizado caramelo'),
  ('cafe-009','Mocha','Café',60.00,20.00,9999,'Mocha con chocolate'),
  ('cafe-010','Macchiato','Café',55.00,16.00,9999,'Espresso macchiato'),
  ('cafe-011','Frappé Caramelo','Frappés',65.00,22.00,9999,'Frappé hielo caramelo'),
  ('cafe-012','Frappé Mocha','Frappés',65.00,22.00,9999,'Frappé hielo chocolate'),
  ('cafe-013','Frappé Vainilla','Frappés',62.00,21.00,9999,'Frappé hielo vainilla'),
  ('cafe-014','Frappé Oreo','Frappés',70.00,25.00,9999,'Frappé con galleta Oreo'),
  ('cafe-015','Té Chai Latte','Té',45.00,14.00,9999,'Chai con leche al vapor'),
  ('cafe-016','Té Verde Matcha Latte','Té',55.00,18.00,9999,'Matcha grado ceremonial'),
  ('cafe-017','Té Negro Earl Grey','Té',38.00,10.00,9999,'Té caliente'),
  ('cafe-018','Té Frutos Rojos','Té',38.00,10.00,9999,'Infusión sin cafeína'),
  ('cafe-019','Croissant Sencillo','Panadería',35.00,12.00,40,'Hojaldre francés'),
  ('cafe-020','Croissant Almendra','Panadería',45.00,16.00,30,'Con crema de almendra'),
  ('cafe-021','Muffin Chocolate','Panadería',38.00,14.00,40,'Casero'),
  ('cafe-022','Muffin Arándano','Panadería',38.00,14.00,35,'Con arándanos frescos'),
  ('cafe-023','Sandwich Panini Jamón Queso','Comida',75.00,32.00,25,'Panini caliente'),
  ('cafe-024','Sandwich Pollo César','Comida',85.00,38.00,20,'Pollo con aderezo César'),
  ('cafe-025','Bagel Salmón','Comida',95.00,45.00,15,'Salmón ahumado, queso crema'),
  ('cafe-026','Pastel Zanahoria (rebanada)','Postres',60.00,22.00,30,'Casero con queso crema'),
  ('cafe-027','Brownie Casero','Postres',45.00,16.00,40,'Con nuez'),
  ('cafe-028','Cheesecake Frutos Rojos','Postres',75.00,28.00,20,'Rebanada individual'),
  ('cafe-029','Galleta Chocochip Grande','Postres',28.00,9.00,60,'Chip de chocolate'),
  ('cafe-030','Macarrón Francés (pieza)','Postres',32.00,12.00,80,'Variedad de sabores')
) AS t(slug, name, category, price, cost, stock, description)
-- FIX-G1: idempotente — si ya existe el id (mismo slug → seed_uuid estable), no toca el registro.
-- Si quieres re-actualizar precios/stock al re-seedear, cambia a DO UPDATE.
ON CONFLICT (id) DO NOTHING;

COMMIT;
