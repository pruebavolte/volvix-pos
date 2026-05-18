-- Tacos El Buen Sabor — 35 productos (menú restaurante)
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000004
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000004', slug),
       '22222222-0004-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '300 days' + (random() * interval '180 days')
FROM (VALUES
  ('rest-001','Taco al Pastor','Tacos',18.00,7.00,9999,'Pastor con piña — cocina caliente — 5min'),
  ('rest-002','Taco de Suadero','Tacos',20.00,8.00,9999,'Suadero — cocina caliente — 5min'),
  ('rest-003','Taco de Carnitas','Tacos',22.00,9.00,9999,'Carnitas Michoacán — cocina caliente — 5min'),
  ('rest-004','Taco de Bistec','Tacos',25.00,10.00,9999,'Bistec asado — parrilla — 7min'),
  ('rest-005','Taco de Chorizo','Tacos',20.00,8.00,9999,'Chorizo casero — cocina — 5min'),
  ('rest-006','Taco de Lengua','Tacos',28.00,12.00,9999,'Lengua de res — cocina — 6min'),
  ('rest-007','Orden de 5 Tacos al Pastor','Tacos',60.00,28.00,9999,'5 tacos pastor — 8min'),
  ('rest-008','Quesadilla Sencilla','Antojitos',45.00,18.00,9999,'Tortilla con queso — comal — 5min'),
  ('rest-009','Quesadilla 3 Quesos','Antojitos',75.00,32.00,9999,'Mezcla de quesos — 6min'),
  ('rest-010','Quesadilla Flor de Calabaza','Antojitos',65.00,28.00,9999,'Flor con queso — 6min'),
  ('rest-011','Quesadilla Huitlacoche','Antojitos',70.00,30.00,9999,'Huitlacoche — 6min'),
  ('rest-012','Sopes (orden 4)','Antojitos',55.00,22.00,9999,'Frijol, queso, lechuga — 8min'),
  ('rest-013','Tlacoyos (orden 3)','Antojitos',60.00,24.00,9999,'Frijol/haba con nopales — 8min'),
  ('rest-014','Gringa al Pastor','Antojitos',75.00,30.00,9999,'Tortilla harina con pastor — 6min'),
  ('rest-015','Vampiro al Pastor','Antojitos',45.00,18.00,9999,'Tortilla tatemada — 6min'),
  ('rest-016','Volcán al Pastor','Antojitos',50.00,20.00,9999,'Tostada con queso y pastor — 6min'),
  ('rest-017','Aguas Frescas Vaso','Bebidas',25.00,5.00,9999,'Jamaica/horchata/limón — barra'),
  ('rest-018','Aguas Frescas Jarra 1L','Bebidas',75.00,18.00,9999,'Jarra para 4 — barra'),
  ('rest-019','Refresco 600ml','Bebidas',30.00,18.00,200,'Coca/Sprite/Fanta'),
  ('rest-020','Refresco Manzana 600ml','Bebidas',32.00,19.00,80,'Manzanita Sol'),
  ('rest-021','Cerveza Corona 355ml','Bebidas',45.00,22.00,150,'Botella'),
  ('rest-022','Cerveza Modelo 355ml','Bebidas',48.00,24.00,120,'Botella'),
  ('rest-023','Cerveza Victoria 355ml','Bebidas',45.00,22.00,80,'Botella'),
  ('rest-024','Caguama Modelo 940ml','Bebidas',95.00,55.00,60,'Familiar'),
  ('rest-025','Café de Olla','Bebidas',30.00,8.00,9999,'Tradicional con piloncillo'),
  ('rest-026','Postre Flan Napolitano','Postres',55.00,18.00,30,'Casero — refri'),
  ('rest-027','Postre Pastel de Tres Leches','Postres',60.00,22.00,25,'Rebanada — refri'),
  ('rest-028','Postre Arroz con Leche','Postres',45.00,15.00,40,'Casero — refri'),
  ('rest-029','Combo Familiar (8 tacos + agua 1L)','Combos',180.00,75.00,9999,'Promoción familiar'),
  ('rest-030','Combo Solo (3 tacos + refresco)','Combos',75.00,32.00,9999,'Promo individual'),
  ('rest-031','Plato Completo Suadero','Platos',150.00,65.00,9999,'Frijoles, arroz, tortillas, suadero'),
  ('rest-032','Plato Completo Carnitas','Platos',160.00,70.00,9999,'Carnitas con guarniciones'),
  ('rest-033','Plato Mixto Parrilla','Platos',185.00,82.00,9999,'Bistec, chorizo, costilla'),
  ('rest-034','Salsas Extra (orden)','Extras',15.00,3.00,9999,'4 salsas surtidas'),
  ('rest-035','Tortillas Extra (10pz)','Extras',20.00,5.00,9999,'Tortillas hechas a mano')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
