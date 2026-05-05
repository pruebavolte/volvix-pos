-- ============================================================
-- FIX-D-1 — Farmacia San Rafael — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000003
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000003', slug),
       '22222222-0003-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('farmpro-001','Paracetamol 500mg 24tab',     'Analgésicos',       45.00,22.00,120,'Caja con 24 tabletas paracetamol'),
  ('farmpro-002','Ibuprofeno 400mg 12tab',      'Analgésicos',       38.00,18.00,100,'Caja con 12 tabletas ibuprofeno'),
  ('farmpro-003','Aspirina Bayer 12tab',        'Analgésicos',       42.00,22.00,100,'Aspirina Bayer 500mg, 12 tabletas'),
  ('farmpro-004','Vitamina C 1g 30tab',         'Vitaminas',         85.00,42.00, 80,'Vitamina C efervescente 30 tabs'),
  ('farmpro-005','Loratadina 10mg 10tab',       'Antialérgicos',     45.00,22.00, 90,'Antihistamínico 10 tabletas'),
  ('farmpro-006','Omeprazol 20mg 14cap',        'Gastrointestinal',  65.00,32.00, 70,'Cápsulas omeprazol 20mg'),
  ('farmpro-007','Alka-Seltzer 12sob',          'Gastrointestinal',  48.00,24.00, 80,'Alka-Seltzer caja 12 sobres'),
  ('farmpro-008','Termómetro Digital',          'Equipos',          125.00,68.00, 25,'Termómetro digital LCD'),
  ('farmpro-009','Jabón Antibacterial Asepxia', 'Higiene',           52.00,28.00, 60,'Barra Asepxia 100g'),
  ('farmpro-010','Curitas 30pz',                'Curaciones',        35.00,18.00, 90,'Curitas adhesivas paquete 30'),
  ('farmpro-011','Alcohol 70% 250ml',           'Curaciones',        28.00,14.00,100,'Alcohol etílico 70% botella 250ml'),
  ('farmpro-012','Test Embarazo',               'Diagnóstico',       85.00,38.00, 40,'Prueba rápida en orina'),
  ('farmpro-013','Cubrebocas KN95 5pz',         'Protección',        45.00,22.00,120,'Paquete 5 cubrebocas KN95')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
