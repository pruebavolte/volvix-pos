-- ============================================================
-- FIX-D-1 — Café Central — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000005
-- Idempotente: ON CONFLICT DO NOTHING.
-- Reusa pos_products schema (R4b dedupe + R10b multi-barcode + cost history).
-- NO toca handlers de R1-R11. Sólo INSERT.
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000005', slug),
       '22222222-0005-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('cafepro-001','Espresso Doble',           'Café',       35.00,10.00,9999,'Doble shot 60ml — barra de café'),
  ('cafepro-002','Americano',                'Café',       30.00, 8.00,9999,'Americano clásico 240ml'),
  ('cafepro-003','Latte Clásico',            'Café',       45.00,14.00,9999,'Latte tradicional con leche entera'),
  ('cafepro-004','Cappuccino Italiano',      'Café',       48.00,15.00,9999,'Espuma firme estilo italiano'),
  ('cafepro-005','Mocha Chocolate',          'Café',       52.00,18.00,9999,'Espresso, leche y chocolate belga'),
  ('cafepro-006','Frappé Caramelo',          'Frappés',    55.00,20.00,9999,'Frappé hielo con caramelo'),
  ('cafepro-007','Té Chai Latte',            'Té',         42.00,13.00,9999,'Chai con leche al vapor'),
  ('cafepro-008','Pan Dulce Concha',         'Panadería',  25.00, 8.00,  60,'Concha tradicional mexicana'),
  ('cafepro-009','Croissant Mantequilla',    'Panadería',  32.00,11.00,  45,'Hojaldre francés mantequilla'),
  ('cafepro-010','Bagel Salmón',             'Comida',     85.00,38.00,  20,'Salmón ahumado, queso crema, alcaparras'),
  ('cafepro-011','Cookie Chispas',           'Postres',    28.00, 9.00,  80,'Galleta con chispas de chocolate'),
  ('cafepro-012','Brownie Nuez',             'Postres',    35.00,12.00,  50,'Brownie casero con nuez')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
