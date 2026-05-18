-- Panadería La Espiga Dorada — 30 productos catálogo
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000002
-- Owner:  22222222-0002-aaaa-aaaa-000000000001
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000002', slug),
       '22222222-0002-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - (interval '90 days') + (random() * interval '60 days')
FROM (VALUES
  ('pan-001','Bolillo','Pan Salado',3.00,1.20,300,'Pan tradicional mexicano'),
  ('pan-002','Telera','Pan Salado',3.50,1.40,200,'Pan para tortas'),
  ('pan-003','Birote','Pan Salado',3.50,1.40,150,'Pan jalisciense'),
  ('pan-004','Concha de Chocolate','Pan Dulce',12.00,5.00,180,'Concha cubierta de chocolate'),
  ('pan-005','Concha de Vainilla','Pan Dulce',12.00,5.00,180,'Concha vainilla clásica'),
  ('pan-006','Cuernito Hojaldrado','Pan Dulce',14.00,6.00,120,'Croissant de hojaldre'),
  ('pan-007','Empanada de Piña','Pan Dulce',8.00,3.50,150,'Empanada rellena'),
  ('pan-008','Empanada de Cajeta','Pan Dulce',8.00,3.50,140,'Empanada con cajeta'),
  ('pan-009','Oreja','Pan Dulce',10.00,4.00,160,'Hojaldre azucarada'),
  ('pan-010','Polvorón Tricolor','Pan Dulce',9.00,3.80,200,'Polvorones surtidos'),
  ('pan-011','Cocol de Anís','Pan Dulce',8.00,3.50,140,'Cocol tradicional'),
  ('pan-012','Mantecada','Pan Dulce',10.00,4.20,150,'Mantecada esponjosa'),
  ('pan-013','Garibaldi','Pan Dulce',15.00,6.50,80,'Mantecada con chochitos'),
  ('pan-014','Rebanada de Pastel Chocolate','Pasteles',45.00,18.00,40,'Rebanada individual'),
  ('pan-015','Rebanada Tres Leches','Pasteles',50.00,20.00,35,'Rebanada de tres leches'),
  ('pan-016','Pastel Chocolate 8 personas','Pasteles',380.00,180.00,8,'Pastel chocolate completo'),
  ('pan-017','Pastel Tres Leches 8 personas','Pasteles',420.00,200.00,6,'Pastel tres leches'),
  ('pan-018','Pastel Zanahoria 8 personas','Pasteles',460.00,220.00,5,'Pastel de zanahoria'),
  ('pan-019','Pastel Vainilla 12 personas','Pasteles',520.00,260.00,4,'Pastel vainilla familiar'),
  ('pan-020','Bizcocho 1kg','Pasteles',65.00,28.00,20,'Bizcocho clásico'),
  ('pan-021','Galletas Saladas (paquete)','Galletas',35.00,14.00,60,'Galletas tipo saladita'),
  ('pan-022','Galletas Dulces (paquete)','Galletas',32.00,13.00,80,'Galletas surtidas'),
  ('pan-023','Galletas de Avena','Galletas',38.00,15.00,70,'Galletas con avena'),
  ('pan-024','Pan Integral Rebanado','Pan Saludable',55.00,25.00,30,'Pan integral artesanal'),
  ('pan-025','Pan Multigrano Rebanado','Pan Saludable',65.00,30.00,25,'Pan multigrano'),
  ('pan-026','Café Americano','Bebidas',35.00,8.00,9999,'Café del día'),
  ('pan-027','Café con Leche','Bebidas',42.00,12.00,9999,'Café con leche'),
  ('pan-028','Chocolate Caliente','Bebidas',40.00,12.00,9999,'Chocolate de mesa'),
  ('pan-029','Atole de Vainilla','Bebidas',30.00,8.00,9999,'Atole tradicional'),
  ('pan-030','Tamales (pieza)','Antojitos',25.00,10.00,80,'Tamal verde/rojo/dulce')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
