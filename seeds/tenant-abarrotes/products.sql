-- Abarrotes La Esquina — 40 productos catálogo realistas
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000001
-- Owner:  22222222-0001-aaaa-aaaa-000000000001
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
VALUES
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-001'),'22222222-0001-aaaa-aaaa-000000000001','Coca-Cola 600ml', seed_ean13('abarr-001'), 18.00, 12.50, 120,'Bebidas','Refresco de cola personal', now() - interval '90 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-002'),'22222222-0001-aaaa-aaaa-000000000001','Coca-Cola 2L', seed_ean13('abarr-002'), 38.00, 28.00, 60,'Bebidas','Refresco de cola familiar', now() - interval '90 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-003'),'22222222-0001-aaaa-aaaa-000000000001','Pepsi 600ml', seed_ean13('abarr-003'), 17.00, 11.50, 80,'Bebidas','Refresco de cola Pepsi', now() - interval '90 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-004'),'22222222-0001-aaaa-aaaa-000000000001','Sprite 600ml', seed_ean13('abarr-004'), 17.00, 11.50, 70,'Bebidas','Refresco lima-limón', now() - interval '90 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-005'),'22222222-0001-aaaa-aaaa-000000000001','Agua Bonafont 1L', seed_ean13('abarr-005'), 12.00, 7.00, 200,'Bebidas','Agua purificada', now() - interval '90 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-006'),'22222222-0001-aaaa-aaaa-000000000001','Sabritas Original 45g', seed_ean13('abarr-006'), 16.00, 10.00, 150,'Botanas','Papas fritas saladas', now() - interval '85 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-007'),'22222222-0001-aaaa-aaaa-000000000001','Doritos Nacho 60g', seed_ean13('abarr-007'), 18.00, 11.50, 110,'Botanas','Tortillas con queso', now() - interval '85 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-008'),'22222222-0001-aaaa-aaaa-000000000001','Cheetos Flamin Hot 50g', seed_ean13('abarr-008'), 18.00, 11.50, 95,'Botanas','Picantes', now() - interval '85 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-009'),'22222222-0001-aaaa-aaaa-000000000001','Maruchan Camarón 64g', seed_ean13('abarr-009'), 16.00, 9.50, 180,'Despensa','Sopa instantánea', now() - interval '80 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-010'),'22222222-0001-aaaa-aaaa-000000000001','Maruchan Pollo 64g', seed_ean13('abarr-010'), 16.00, 9.50, 140,'Despensa','Sopa instantánea', now() - interval '80 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-011'),'22222222-0001-aaaa-aaaa-000000000001','Bimbo Pan Blanco grande', seed_ean13('abarr-011'), 45.00, 33.00, 35,'Panadería','Pan de caja blanco', now() - interval '80 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-012'),'22222222-0001-aaaa-aaaa-000000000001','Bimbo Pan Integral', seed_ean13('abarr-012'), 52.00, 38.00, 25,'Panadería','Pan integral', now() - interval '80 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-013'),'22222222-0001-aaaa-aaaa-000000000001','Aceite Capullo 1L', seed_ean13('abarr-013'), 55.00, 42.00, 50,'Despensa','Aceite vegetal', now() - interval '75 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-014'),'22222222-0001-aaaa-aaaa-000000000001','Aceite 1-2-3 1L', seed_ean13('abarr-014'), 48.00, 36.00, 40,'Despensa','Aceite vegetal', now() - interval '75 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-015'),'22222222-0001-aaaa-aaaa-000000000001','Detergente Foca 1kg', seed_ean13('abarr-015'), 45.00, 32.00, 60,'Limpieza','Detergente en polvo', now() - interval '70 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-016'),'22222222-0001-aaaa-aaaa-000000000001','Ariel 1kg', seed_ean13('abarr-016'), 65.00, 48.00, 45,'Limpieza','Detergente premium', now() - interval '70 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-017'),'22222222-0001-aaaa-aaaa-000000000001','Cloralex 1L', seed_ean13('abarr-017'), 32.00, 22.00, 70,'Limpieza','Cloro doméstico', now() - interval '70 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-018'),'22222222-0001-aaaa-aaaa-000000000001','Pinol 1L', seed_ean13('abarr-018'), 38.00, 26.00, 50,'Limpieza','Limpiador aromatizante', now() - interval '70 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-019'),'22222222-0001-aaaa-aaaa-000000000001','Huevos San Juan 18p', seed_ean13('abarr-019'), 75.00, 58.00, 30,'Despensa','Huevo blanco grande', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-020'),'22222222-0001-aaaa-aaaa-000000000001','Huevos San Juan 12p', seed_ean13('abarr-020'), 52.00, 40.00, 40,'Despensa','Huevo blanco grande', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-021'),'22222222-0001-aaaa-aaaa-000000000001','Tortillas Maseca 1kg', seed_ean13('abarr-021'), 25.00, 18.00, 90,'Despensa','Harina de maíz', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-022'),'22222222-0001-aaaa-aaaa-000000000001','Frijol Verde Valle 1kg', seed_ean13('abarr-022'), 38.00, 27.00, 55,'Despensa','Frijol negro', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-023'),'22222222-0001-aaaa-aaaa-000000000001','Arroz Verde Valle 1kg', seed_ean13('abarr-023'), 32.00, 23.00, 65,'Despensa','Arroz blanco', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-024'),'22222222-0001-aaaa-aaaa-000000000001','Azúcar Estándar 1kg', seed_ean13('abarr-024'), 28.00, 20.00, 80,'Despensa','Azúcar refinada', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-025'),'22222222-0001-aaaa-aaaa-000000000001','Sal La Fina 1kg', seed_ean13('abarr-025'), 18.00, 12.00, 70,'Despensa','Sal de mesa', now() - interval '60 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-026'),'22222222-0001-aaaa-aaaa-000000000001','Crema La Lechera 250ml', seed_ean13('abarr-026'), 28.00, 19.00, 45,'Lácteos','Crema ácida', now() - interval '50 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-027'),'22222222-0001-aaaa-aaaa-000000000001','Leche Lala 1L', seed_ean13('abarr-027'), 28.00, 20.00, 100,'Lácteos','Leche entera', now() - interval '50 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-028'),'22222222-0001-aaaa-aaaa-000000000001','Yoplait Yogurt 1L', seed_ean13('abarr-028'), 38.00, 27.00, 50,'Lácteos','Yogurt natural', now() - interval '50 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-029'),'22222222-0001-aaaa-aaaa-000000000001','Queso Oaxaca 200g', seed_ean13('abarr-029'), 65.00, 45.00, 35,'Lácteos','Queso de hebra', now() - interval '50 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-030'),'22222222-0001-aaaa-aaaa-000000000001','Mantequilla Lyncott 90g', seed_ean13('abarr-030'), 22.00, 15.00, 60,'Lácteos','Mantequilla con sal', now() - interval '50 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-031'),'22222222-0001-aaaa-aaaa-000000000001','Cigarros Marlboro 20p', seed_ean13('abarr-031'), 90.00, 72.00, 40,'Cigarros','Cajetilla', now() - interval '40 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-032'),'22222222-0001-aaaa-aaaa-000000000001','Cigarros Camel 20p', seed_ean13('abarr-032'), 88.00, 70.00, 30,'Cigarros','Cajetilla', now() - interval '40 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-033'),'22222222-0001-aaaa-aaaa-000000000001','Cerveza Corona 355ml', seed_ean13('abarr-033'), 22.00, 16.00, 200,'Bebidas','Cerveza clara botella', now() - interval '40 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-034'),'22222222-0001-aaaa-aaaa-000000000001','Cerveza Modelo Especial 355ml', seed_ean13('abarr-034'), 24.00, 17.50, 150,'Bebidas','Cerveza clara', now() - interval '40 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-035'),'22222222-0001-aaaa-aaaa-000000000001','Cerveza Tecate Light 6pk', seed_ean13('abarr-035'), 110.00, 85.00, 40,'Bebidas','Six de cerveza light', now() - interval '40 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-036'),'22222222-0001-aaaa-aaaa-000000000001','Galletas Marías Gamesa 170g', seed_ean13('abarr-036'), 18.00, 12.00, 80,'Galletas','Galletas dulces', now() - interval '35 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-037'),'22222222-0001-aaaa-aaaa-000000000001','Galletas Saladitas 200g', seed_ean13('abarr-037'), 22.00, 15.00, 75,'Galletas','Galletas saladas', now() - interval '35 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-038'),'22222222-0001-aaaa-aaaa-000000000001','Chocolate Carlos V 18g', seed_ean13('abarr-038'), 8.00, 5.50, 200,'Dulces','Chocolate de leche', now() - interval '35 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-039'),'22222222-0001-aaaa-aaaa-000000000001','Chicles Trident 14p', seed_ean13('abarr-039'), 18.00, 12.00, 100,'Dulces','Chicle sin azúcar', now() - interval '35 days'),
 (seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001','abarr-040'),'22222222-0001-aaaa-aaaa-000000000001','Papel Higiénico Petalo 4r', seed_ean13('abarr-040'), 42.00, 30.00, 65,'Higiene','4 rollos doble hoja', now() - interval '30 days')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, price = EXCLUDED.price, cost = EXCLUDED.cost,
      stock = EXCLUDED.stock, category = EXCLUDED.category, description = EXCLUDED.description;

COMMIT;
