-- Barbería Don Pepe — 25 servicios + productos
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000006
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000006', slug),
       '22222222-0006-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '140 days' + (random() * interval '80 days')
FROM (VALUES
  ('barb-001','Corte Clásico','Servicios',120.00,0.00,9999,'30 min — caballero'),
  ('barb-002','Corte Fade','Servicios',150.00,0.00,9999,'40 min — degradado'),
  ('barb-003','Corte Mid Fade','Servicios',150.00,0.00,9999,'40 min — fade medio'),
  ('barb-004','Corte High Fade','Servicios',160.00,0.00,9999,'40 min — fade alto'),
  ('barb-005','Corte Niño (0-10)','Servicios',90.00,0.00,9999,'25 min — corte infantil'),
  ('barb-006','Corte + Lavado','Servicios',150.00,0.00,9999,'45 min — incluye shampoo'),
  ('barb-007','Barba Completa','Servicios',80.00,0.00,9999,'25 min — perfilado y rasurado'),
  ('barb-008','Barba con Toalla Caliente','Servicios',100.00,0.00,9999,'35 min — ritual completo'),
  ('barb-009','Corte + Barba','Servicios',180.00,0.00,9999,'60 min — combo más popular'),
  ('barb-010','Corte + Barba Premium','Servicios',230.00,0.00,9999,'75 min — toalla caliente y aceite'),
  ('barb-011','Diseño de Ceja','Servicios',60.00,0.00,9999,'15 min'),
  ('barb-012','Tintura Cabello','Servicios',300.00,0.00,9999,'90 min — color por capa'),
  ('barb-013','Tintura Barba','Servicios',180.00,0.00,9999,'45 min'),
  ('barb-014','Diseño/Líneas en Cabello','Servicios',50.00,0.00,9999,'15 min — extras decorativos'),
  ('barb-015','Mascarilla Facial','Servicios',150.00,0.00,9999,'30 min — limpieza facial'),
  -- Productos retail
  ('barb-016','Pomada Reuzel Pink 113g','Productos',280.00,150.00,15,'Pomada base agua medio brillo'),
  ('barb-017','Pomada Suavecito Original','Productos',260.00,140.00,18,'Pomada clásica'),
  ('barb-018','Cera Barbero Modeladora','Productos',180.00,90.00,20,'Cera mate fijación fuerte'),
  ('barb-019','Aceite para Barba 30ml','Productos',180.00,80.00,25,'Aceite hidratante con jojoba'),
  ('barb-020','Aceite Premium Barba 50ml','Productos',280.00,150.00,12,'Premium con argán'),
  ('barb-021','Bálsamo Barba 60g','Productos',220.00,110.00,18,'Bálsamo definidor'),
  ('barb-022','Shampoo Hombre 300ml','Productos',150.00,75.00,20,'Anticaspa premium'),
  ('barb-023','Loción Aftershave 100ml','Productos',180.00,90.00,15,'Tradicional mentolada'),
  ('barb-024','Peine de Madera Profesional','Productos',120.00,55.00,25,'Madera de haya'),
  ('barb-025','Cepillo Barba Cerdas','Productos',150.00,75.00,15,'Cerdas naturales')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
