-- Farmacia San Rafael — 45 productos
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000003
-- Owner:  22222222-0003-aaaa-aaaa-000000000001
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000003', slug),
       '22222222-0003-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '180 days' + (random() * interval '120 days')
FROM (VALUES
  ('farm-001','Paracetamol 500mg 24t','Analgésicos',35.00,18.00,80,'Tabletas — caduca 2027-06'),
  ('farm-002','Paracetamol 750mg 10t','Analgésicos',32.00,17.00,70,'Tabletas — caduca 2027-04'),
  ('farm-003','Ibuprofeno 400mg 20t','Analgésicos',45.00,24.00,60,'Tabletas — caduca 2027-08'),
  ('farm-004','Ibuprofeno 600mg 10t','Analgésicos',55.00,30.00,50,'Tabletas — caduca 2027-08'),
  ('farm-005','Aspirina 100mg 30t','Analgésicos',28.00,15.00,90,'Cardio — caduca 2028-01'),
  ('farm-006','Aspirina Adulto 500mg 20t','Analgésicos',42.00,22.00,75,'Tabletas — caduca 2027-12'),
  ('farm-007','Naproxeno 250mg 10t','Antiinflamatorio',38.00,21.00,55,'Tabletas — caduca 2027-09'),
  ('farm-008','Diclofenaco 100mg 20t','Antiinflamatorio',48.00,26.00,40,'Liberación prolongada'),
  ('farm-009','Loratadina 10mg 10t','Antialérgico',55.00,30.00,60,'Antihistamínico — caduca 2028-03'),
  ('farm-010','Cetirizina 10mg 20t','Antialérgico',75.00,42.00,40,'Antialérgico'),
  ('farm-011','Amoxicilina 500mg 12t','Antibiótico',85.00,48.00,30,'Cápsulas — caduca 2026-12'),
  ('farm-012','Amoxicilina + Clavulanato','Antibiótico',180.00,110.00,20,'Tabletas potenciadas'),
  ('farm-013','Azitromicina 500mg 3t','Antibiótico',150.00,92.00,25,'Tabletas — caduca 2027-05'),
  ('farm-014','Ciprofloxacino 500mg 14t','Antibiótico',165.00,100.00,18,'Tabletas — caduca 2027-07'),
  ('farm-015','Vitamina C 1000mg','Vitaminas',120.00,65.00,80,'30 tabletas — caduca 2028-02'),
  ('farm-016','Multivitamínico Centrum 30t','Vitaminas',250.00,160.00,40,'Adulto — caduca 2027-11'),
  ('farm-017','Vitamina D3 2000UI 60c','Vitaminas',280.00,180.00,35,'Cápsulas — caduca 2028-04'),
  ('farm-018','Complejo B 30t','Vitaminas',95.00,52.00,50,'Tabletas — caduca 2027-10'),
  ('farm-019','Calcio + Magnesio 60t','Vitaminas',180.00,110.00,30,'Tabletas — caduca 2027-12'),
  ('farm-020','Crema Antibiótica Bacitracina','Tópico',45.00,24.00,55,'Pomada 15g'),
  ('farm-021','Crema Hidrocortisona 1%','Tópico',55.00,30.00,40,'Antiinflamatoria 15g'),
  ('farm-022','Bepanthen Crema 30g','Tópico',180.00,120.00,30,'Para irritación'),
  ('farm-023','Fenistil Gel','Tópico',150.00,95.00,25,'Antialérgico tópico'),
  ('farm-024','Termómetro Digital','Equipo',180.00,110.00,15,'Punta flexible'),
  ('farm-025','Glucómetro Accu-Chek','Equipo',850.00,580.00,8,'Con 10 tiras'),
  ('farm-026','Tiras Reactivas Glucosa 50p','Equipo',420.00,290.00,20,'Compatible Accu-Chek'),
  ('farm-027','Baumanómetro Digital','Equipo',650.00,420.00,10,'Brazo automático'),
  ('farm-028','Curitas Pack 50','Curaciones',55.00,30.00,80,'Variedad de tamaños'),
  ('farm-029','Gasas Estériles 10p','Curaciones',45.00,25.00,60,'10x10cm'),
  ('farm-030','Alcohol 96° 250ml','Curaciones',38.00,22.00,75,'Antiséptico'),
  ('farm-031','Agua Oxigenada 250ml','Curaciones',22.00,12.00,90,'10 vol'),
  ('farm-032','Cubrebocas KN95 5p','Higiene',65.00,38.00,150,'Mascarilla certificada'),
  ('farm-033','Cubrebocas Tricapa 50p','Higiene',95.00,55.00,80,'Caja 50 piezas'),
  ('farm-034','Gel Antibacterial 500ml','Higiene',58.00,32.00,100,'70% alcohol'),
  ('farm-035','Toallas Húmedas 80p','Higiene',55.00,32.00,70,'Sin alcohol'),
  ('farm-036','Pañales Huggies G 30p','Bebé',180.00,120.00,40,'Talla grande'),
  ('farm-037','Pañales Huggies XG 28p','Bebé',195.00,130.00,35,'Talla extra grande'),
  ('farm-038','Fórmula Nan 1 800g','Bebé',420.00,290.00,20,'0-6 meses'),
  ('farm-039','Shampoo Johnson Bebé 400ml','Bebé',95.00,55.00,30,'Sin lágrimas'),
  ('farm-040','Pepto-Bismol 240ml','Digestivo',135.00,82.00,25,'Antiácido'),
  ('farm-041','Sal de Uvas Picot','Digestivo',12.00,6.00,200,'Sobre individual'),
  ('farm-042','Loperamida 2mg 12t','Digestivo',55.00,30.00,40,'Antidiarréico'),
  ('farm-043','Omeprazol 20mg 14c','Digestivo',95.00,55.00,50,'Cápsulas — caduca 2027-08'),
  ('farm-044','Sueros Electrolit Frutas','Digestivo',32.00,18.00,90,'Bebida hidratante 625ml'),
  ('farm-045','Pediasure Vainilla 237ml','Nutricional',55.00,32.00,40,'Suplemento infantil')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
