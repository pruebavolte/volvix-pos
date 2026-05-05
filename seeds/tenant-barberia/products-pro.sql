-- ============================================================
-- FIX-D-1 — Barbería Don Pepe — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000006
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000006', slug),
       '22222222-0006-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('barbpro-001','Corte Caballero Clásico', 'Servicios',  150.00,  0.00,9999,'30 min — corte tradicional'),
  ('barbpro-002','Corte + Barba',           'Servicios',  225.00,  0.00,9999,'60 min — combo más popular'),
  ('barbpro-003','Corte Niño',              'Servicios',   95.00,  0.00,9999,'25 min — niños hasta 10 años'),
  ('barbpro-004','Diseño Cejas',            'Servicios',   45.00,  0.00,9999,'15 min — depilación cejas'),
  ('barbpro-005','Tinte Cabello',           'Servicios',  385.00,120.00,9999,'90 min — tintura completa'),
  ('barbpro-006','Lavado + Secado',         'Servicios',   85.00,  0.00,9999,'20 min — shampoo y secado'),
  ('barbpro-007','Tratamiento Capilar',     'Servicios',  245.00, 60.00,9999,'45 min — keratina o hidratación'),
  ('barbpro-008','Afeitada Tradicional',    'Servicios',  125.00,  0.00,9999,'30 min — toalla caliente, navaja'),
  ('barbpro-009','Pomada Suavecito 100ml',  'Productos',  245.00,130.00,  20,'Pomada Suavecito Original 100ml'),
  ('barbpro-010','Aceite Barba Argan',      'Productos',  185.00, 80.00,  25,'Aceite hidratante con argán 30ml'),
  ('barbpro-011','Champú Anti-caspa',       'Productos',  145.00, 65.00,  30,'Champú anti-caspa 250ml'),
  ('barbpro-012','Cera Modeladora',         'Productos',  125.00, 55.00,  35,'Cera modeladora mate 100g')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
