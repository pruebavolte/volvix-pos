-- ============================================================
-- FIX-D-1 — Tacos El Buen Sabor — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000004
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000004', slug),
       '22222222-0004-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('restpro-001','Pollo a la Parrilla',      'Platos Fuertes', 185.00, 75.00,9999,'Pechuga 250g con guarniciones'),
  ('restpro-002','Tacos al Pastor (3pz)',    'Tacos',          125.00, 45.00,9999,'Orden 3 tacos pastor con piña'),
  ('restpro-003','Enchiladas Verdes',        'Mexicana',       145.00, 55.00,9999,'3 enchiladas pollo, salsa verde, crema'),
  ('restpro-004','Sopa Tortilla',            'Sopas',           85.00, 28.00,9999,'Sopa azteca con queso y aguacate'),
  ('restpro-005','Ensalada César',           'Ensaladas',      135.00, 50.00,9999,'Lechuga romana, pollo, parmesano'),
  ('restpro-006','Hamburguesa Clásica',      'Platos Fuertes', 165.00, 65.00,9999,'200g res, queso, jitomate, cebolla'),
  ('restpro-007','Quesadilla Champiñones',   'Mexicana',        95.00, 32.00,9999,'Tortilla harina con queso y champiñones'),
  ('restpro-008','Pasta Bolognesa',          'Pastas',         175.00, 60.00,9999,'Espagueti con salsa de carne'),
  ('restpro-009','Filete de Pescado',        'Platos Fuertes', 215.00, 85.00,9999,'Tilapia al ajillo con verduras'),
  ('restpro-010','Agua de Horchata',         'Bebidas',         35.00,  8.00,9999,'Vaso 500ml horchata casera'),
  ('restpro-011','Coca-Cola 600ml',          'Refrescos',       30.00, 12.00, 200,'Coca-Cola botella 600ml'),
  ('restpro-012','Cerveza Modelo',           'Bebidas',         55.00, 22.00, 150,'Cerveza Modelo Especial 355ml'),
  ('restpro-013','Postre Flan Napolitano',   'Postres',         65.00, 22.00, 30,'Flan casero con caramelo')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
