-- Gasolinera Express 24/7 — 30 productos (combustible + tienda)
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000007
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000007', slug),
       '22222222-0007-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '450 days' + (random() * interval '300 days')
FROM (VALUES
  ('gas-001','Magna (Litro)','Combustible',23.50,21.00,50000,'Bombas 1, 2, 3 — verde'),
  ('gas-002','Premium (Litro)','Combustible',25.80,22.80,30000,'Bombas 4, 5 — rojo'),
  ('gas-003','Diésel (Litro)','Combustible',24.20,21.50,25000,'Bomba 6 — amarillo'),
  ('gas-004','Aceite Mobil 1 5W30 1L','Lubricantes',280.00,180.00,40,'Sintético'),
  ('gas-005','Aceite Mobil Super 1L','Lubricantes',180.00,110.00,60,'Mineral'),
  ('gas-006','Aceite Castrol GTX 1L','Lubricantes',195.00,125.00,50,'Multigrado'),
  ('gas-007','Anticongelante 1L','Lubricantes',95.00,55.00,40,'Color verde'),
  ('gas-008','Líquido Frenos DOT 4','Lubricantes',85.00,50.00,30,'500ml'),
  ('gas-009','Limpiaparabrisas 5L','Lubricantes',55.00,30.00,40,'Líquido azul'),
  ('gas-010','Air Freshener Pino','Accesorios',45.00,18.00,80,'Variedad de aromas'),
  ('gas-011','Coca-Cola 600ml','Bebidas',22.00,14.00,200,'Refresco frío'),
  ('gas-012','Coca-Cola 2L','Bebidas',45.00,30.00,100,'Familiar'),
  ('gas-013','Powerade 600ml','Bebidas',28.00,18.00,80,'Bebida deportiva'),
  ('gas-014','Red Bull 250ml','Bebidas',45.00,28.00,60,'Energética'),
  ('gas-015','Monster 473ml','Bebidas',55.00,35.00,50,'Energética'),
  ('gas-016','Agua Bonafont 1L','Bebidas',15.00,8.00,150,'Agua purificada'),
  ('gas-017','Café Caliente Vaso','Bebidas',25.00,5.00,9999,'Servido en barra'),
  ('gas-018','Sabritas Original 45g','Botanas',18.00,11.00,120,'Papas fritas'),
  ('gas-019','Doritos 60g','Botanas',20.00,12.00,100,'Tortillas con queso'),
  ('gas-020','Cheetos Flamin Hot 50g','Botanas',20.00,12.00,90,'Picantes'),
  ('gas-021','Galletas Emperador','Botanas',18.00,10.00,80,'Chocolate'),
  ('gas-022','Mazapán De La Rosa','Dulces',8.00,4.00,200,'Cacahuate'),
  ('gas-023','Carlos V chocolate','Dulces',8.00,4.00,180,'Chocolate de leche'),
  ('gas-024','Cigarros Marlboro','Cigarros',90.00,72.00,60,'Cajetilla 20'),
  ('gas-025','Cigarros Camel','Cigarros',88.00,70.00,40,'Cajetilla 20'),
  ('gas-026','Cigarros Faros','Cigarros',55.00,42.00,30,'Cajetilla 14'),
  ('gas-027','Sándwich Jamón Queso','Comida',45.00,22.00,30,'Refrigerado'),
  ('gas-028','Burrito Microondas','Comida',55.00,28.00,25,'Calentar 90s'),
  ('gas-029','Tarjeta Telmex 100','Tarjetas',100.00,95.00,50,'Recarga'),
  ('gas-030','Tarjeta Telcel 200','Tarjetas',200.00,190.00,40,'Recarga')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
