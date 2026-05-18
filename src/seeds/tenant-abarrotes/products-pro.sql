-- ============================================================
-- FIX-D-1 — Abarrotes La Esquina — Productos Demo PRO (R12a)
-- ============================================================
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000001
-- ============================================================
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001', slug),
       '22222222-0001-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('abarrpro-001','Coca-Cola 2L',                'Refrescos',  35.00,22.00,120,'Refresco Coca-Cola 2 litros'),
  ('abarrpro-002','Sabritas Original 175g',      'Botanas',    25.00,14.00,200,'Papas Sabritas sal 175g'),
  ('abarrpro-003','Gansito Marinela 4pz',        'Botanas',    32.00,18.00,150,'Pastelillos Gansito paquete 4 piezas'),
  ('abarrpro-004','Leche Lala 1L',               'Lácteos',    28.00,18.00,100,'Leche entera Lala 1 litro'),
  ('abarrpro-005','Pan Bimbo Blanco',            'Panadería',  42.00,28.00, 80,'Pan blanco grande Bimbo'),
  ('abarrpro-006','Frijol Bayo 1kg',             'Granos',     35.00,22.00,120,'Frijol bayos a granel 1kg'),
  ('abarrpro-007','Arroz Verde Valle 1kg',       'Granos',     28.00,18.00,150,'Arroz blanco Verde Valle 1kg'),
  ('abarrpro-008','Aceite Capullo 1L',           'Aceites',    48.00,32.00, 80,'Aceite vegetal Capullo 1L'),
  ('abarrpro-009','Azúcar Estándar 1kg',         'Despensa',   25.00,16.00,180,'Azúcar refinada estándar 1kg'),
  ('abarrpro-010','Sal La Fina 1kg',             'Despensa',   12.00, 6.00,200,'Sal de mesa La Fina 1kg'),
  ('abarrpro-011','Café Soluble Nescafé 175g',   'Café',       95.00,62.00, 60,'Café Nescafé Clásico frasco 175g'),
  ('abarrpro-012','Atún Tuny en Agua',           'Enlatados',  22.00,13.00,200,'Atún Tuny lata 140g en agua'),
  ('abarrpro-013','Papel Higiénico Pétalo 4r',   'Higiene',    32.00,20.00, 90,'Papel Pétalo paquete 4 rollos'),
  ('abarrpro-014','Detergente Roma 1kg',         'Limpieza',   35.00,22.00, 70,'Detergente en polvo Roma 1kg')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO NOTHING;

COMMIT;
