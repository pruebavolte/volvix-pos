-- ============================================================
-- FIX-D-1 — Boutique Femenina Andrea — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000008
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000008', slug),
       '22222222-0008-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('ropapro-001','Camisa Polo Algodón',       'Caballero',  385.00,180.00, 40,'Polo 100% algodón, varios colores'),
  ('ropapro-002','Playera Básica Cuello V',   'Caballero',  185.00, 80.00, 60,'Playera cuello V algodón premium'),
  ('ropapro-003','Jeans Slim Fit',            'Caballero',  545.00,260.00, 35,'Jeans corte slim fit denim azul'),
  ('ropapro-004','Vestido Casual Floral',     'Dama',       625.00,290.00, 25,'Vestido midi estampado floral'),
  ('ropapro-005','Falda Plisada',             'Dama',       385.00,170.00, 30,'Falda plisada midi'),
  ('ropapro-006','Saco Blazer',               'Dama',       785.00,360.00, 20,'Blazer estructurado oficina'),
  ('ropapro-007','Tenis Deportivos',          'Calzado',    895.00,420.00, 35,'Tenis casuales deportivos unisex'),
  ('ropapro-008','Bolso Crossbody',           'Accesorios', 385.00,170.00, 30,'Bolso cruzado piel sintética'),
  ('ropapro-009','Cinturón Piel',             'Accesorios', 245.00,110.00, 40,'Cinturón piel genuina caballero'),
  ('ropapro-010','Calcetines Pack 3',         'Accesorios', 125.00, 50.00, 80,'Pack 3 pares calcetines algodón'),
  ('ropapro-011','Bufanda Lana',              'Accesorios', 185.00, 80.00, 50,'Bufanda lana suave invierno'),
  ('ropapro-012','Gorra Snapback',            'Accesorios', 285.00,130.00, 45,'Gorra snapback ajustable')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
