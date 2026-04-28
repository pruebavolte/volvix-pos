-- ============================================================
-- R12a — DEMO DATA PRO (FIX-D-1 + FIX-D-2 + FIX-D-4)
-- ============================================================
-- Carga catálogo demo profesional + clientes mexicanos realistas
-- para los 6 giros principales:
--   1) cafe        (11111111-aaaa-aaaa-aaaa-000000000005)
--   2) restaurant  (11111111-aaaa-aaaa-aaaa-000000000004)
--   3) abarrotes   (11111111-aaaa-aaaa-aaaa-000000000001)
--   4) farmacia    (11111111-aaaa-aaaa-aaaa-000000000003)
--   5) ropa        (11111111-aaaa-aaaa-aaaa-000000000008)
--   6) barberia    (11111111-aaaa-aaaa-aaaa-000000000006)
--
-- IDEMPOTENTE:
--   - Productos: ON CONFLICT (id) DO NOTHING (slug + tenant_id ⇒ uuid estable).
--   - Clientes: ON CONFLICT (id) DO UPDATE (refresca name/phone/email/rfc).
--
-- NO TOCA api/index.js ni handlers de R1-R11.
-- Reusa schema pos_products (R4b dedupe + R10b multi-barcode + cost history).
--
-- Aplicar:
--   supabase db query --linked < migrations/r12a-demo-data-pro.sql
-- ó
--   psql $DATABASE_URL -f migrations/r12a-demo-data-pro.sql
--
-- Pre-requisito: seeds/_shared/helpers.sql ya aplicado
-- (provee seed_uuid y seed_ean13).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- Asegurar helpers (idempotente; no falla si ya existen).
-- Si seeds/_shared/helpers.sql nunca se aplicó, lo cargamos aquí.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_uuid(p_tenant uuid, p_slug text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 1 FOR 8) || '-' ||
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 9 FOR 4) || '-' ||
    '5' || SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 14 FOR 3) || '-' ||
    'a' || SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 18 FOR 3) || '-' ||
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 21 FOR 12)
  )::uuid
$$;

CREATE OR REPLACE FUNCTION seed_ean13(seed text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text; i int; sum_odd int := 0; sum_even int := 0; digit int; check_d int;
BEGIN
  d := lpad(regexp_replace(md5(seed), '\D', '', 'g'), 12, '0');
  d := substring(d FROM 1 FOR 12);
  FOR i IN 1..12 LOOP
    digit := substring(d FROM i FOR 1)::int;
    IF i % 2 = 1 THEN sum_odd := sum_odd + digit; ELSE sum_even := sum_even + digit; END IF;
  END LOOP;
  check_d := (10 - ((sum_odd + sum_even * 3) % 10)) % 10;
  RETURN d || check_d::text;
END;
$$;

-- ============================================================
-- BOOTSTRAP — Tenants + Owner users (prerequisitos para FK).
-- ============================================================
-- Si ya existían en producción (no afecta), ON CONFLICT DO NOTHING.
-- Usa columnas reales de prod: pos_companies(id,name,owner_user_id,plan,is_active)
--                              pos_users(id,email,password_hash,full_name,role,company_id,is_active)

-- Crear primero owners (sin company_id) — luego companies; finalmente set company_id en users.
-- bcrypt hash for "Demo2026!" (cost=10):
--   $2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO
-- Si tu auth requiere otro algoritmo, regenera afterwards.

INSERT INTO pos_users (id, email, phone, password_hash, full_name, role, is_active, created_at)
VALUES
  ('22222222-0001-aaaa-aaaa-000000000001','demo-abarrotes@volvix.test', '+525555010001','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Carlos Hernández (Demo Owner)','ADMIN',true, now() - interval '120 days'),
  ('22222222-0003-aaaa-aaaa-000000000001','demo-farmacia@volvix.test',  '+525555010003','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Dr. Rafael Gómez (Demo Owner)','ADMIN',true, now() - interval '210 days'),
  ('22222222-0004-aaaa-aaaa-000000000001','demo-restaurant@volvix.test','+525555010004','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Don Joaquín Rivera (Demo Owner)','ADMIN',true, now() - interval '305 days'),
  ('22222222-0005-aaaa-aaaa-000000000001','demo-cafe@volvix.test',      '+525555010005','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Valeria Ochoa (Demo Owner)','ADMIN',true, now() - interval '180 days'),
  ('22222222-0006-aaaa-aaaa-000000000001','demo-barberia@volvix.test',  '+525555010006','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','José "Pepe" Ruiz (Demo Owner)','ADMIN',true, now() - interval '150 days'),
  ('22222222-0008-aaaa-aaaa-000000000001','demo-ropa@volvix.test',      '+525555010008','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Andrea Treviño (Demo Owner)','ADMIN',true, now() - interval '110 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_companies (id, name, owner_user_id, plan, is_active, created_at)
VALUES
  ('11111111-aaaa-aaaa-aaaa-000000000001','Abarrotes La Esquina (DEMO)',     '22222222-0001-aaaa-aaaa-000000000001','pro',true, now() - interval '120 days'),
  ('11111111-aaaa-aaaa-aaaa-000000000003','Farmacia San Rafael (DEMO)',      '22222222-0003-aaaa-aaaa-000000000001','pro',true, now() - interval '210 days'),
  ('11111111-aaaa-aaaa-aaaa-000000000004','Tacos El Buen Sabor (DEMO)',      '22222222-0004-aaaa-aaaa-000000000001','pro',true, now() - interval '305 days'),
  ('11111111-aaaa-aaaa-aaaa-000000000005','Café Central (DEMO)',             '22222222-0005-aaaa-aaaa-000000000001','pro',true, now() - interval '180 days'),
  ('11111111-aaaa-aaaa-aaaa-000000000006','Barbería Don Pepe (DEMO)',        '22222222-0006-aaaa-aaaa-000000000001','pro',true, now() - interval '150 days'),
  ('11111111-aaaa-aaaa-aaaa-000000000008','Boutique Femenina Andrea (DEMO)', '22222222-0008-aaaa-aaaa-000000000001','pro',true, now() - interval '110 days')
ON CONFLICT (id) DO NOTHING;

-- Asociar owners a sus companies (idempotente).
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000001'
 WHERE id = '22222222-0001-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000001');
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000003'
 WHERE id = '22222222-0003-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000003');
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000004'
 WHERE id = '22222222-0004-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000004');
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000005'
 WHERE id = '22222222-0005-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000005');
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000006'
 WHERE id = '22222222-0006-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000006');
UPDATE pos_users SET company_id = '11111111-aaaa-aaaa-aaaa-000000000008'
 WHERE id = '22222222-0008-aaaa-aaaa-000000000001' AND (company_id IS NULL OR company_id = '11111111-aaaa-aaaa-aaaa-000000000008');

-- ============================================================
-- FIX-D-1 — PRODUCTOS DEMO PRO POR GIRO
-- ============================================================

-- ── 1) Café Central ──────────────────────────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000005', slug),
       '22222222-0005-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('cafepro-001','Espresso Doble',           'Café',       35.00,10.00,9999),
  ('cafepro-002','Americano',                'Café',       30.00, 8.00,9999),
  ('cafepro-003','Latte Clásico',            'Café',       45.00,14.00,9999),
  ('cafepro-004','Cappuccino Italiano',      'Café',       48.00,15.00,9999),
  ('cafepro-005','Mocha Chocolate',          'Café',       52.00,18.00,9999),
  ('cafepro-006','Frappé Caramelo',          'Frappés',    55.00,20.00,9999),
  ('cafepro-007','Té Chai Latte',            'Té',         42.00,13.00,9999),
  ('cafepro-008','Pan Dulce Concha',         'Panadería',  25.00, 8.00,  60),
  ('cafepro-009','Croissant Mantequilla',    'Panadería',  32.00,11.00,  45),
  ('cafepro-010','Bagel Salmón',             'Comida',     85.00,38.00,  20),
  ('cafepro-011','Cookie Chispas',           'Postres',    28.00, 9.00,  80),
  ('cafepro-012','Brownie Nuez',             'Postres',    35.00,12.00,  50)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ── 2) Tacos El Buen Sabor (restaurant) ──────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000004', slug),
       '22222222-0004-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('restpro-001','Pollo a la Parrilla',      'Platos Fuertes', 185.00, 75.00,9999),
  ('restpro-002','Tacos al Pastor (3pz)',    'Tacos',          125.00, 45.00,9999),
  ('restpro-003','Enchiladas Verdes',        'Mexicana',       145.00, 55.00,9999),
  ('restpro-004','Sopa Tortilla',            'Sopas',           85.00, 28.00,9999),
  ('restpro-005','Ensalada César',           'Ensaladas',      135.00, 50.00,9999),
  ('restpro-006','Hamburguesa Clásica',      'Platos Fuertes', 165.00, 65.00,9999),
  ('restpro-007','Quesadilla Champiñones',   'Mexicana',        95.00, 32.00,9999),
  ('restpro-008','Pasta Bolognesa',          'Pastas',         175.00, 60.00,9999),
  ('restpro-009','Filete de Pescado',        'Platos Fuertes', 215.00, 85.00,9999),
  ('restpro-010','Agua de Horchata',         'Bebidas',         35.00,  8.00,9999),
  ('restpro-011','Coca-Cola 600ml',          'Refrescos',       30.00, 12.00, 200),
  ('restpro-012','Cerveza Modelo',           'Bebidas',         55.00, 22.00, 150),
  ('restpro-013','Postre Flan Napolitano',   'Postres',         65.00, 22.00,  30)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ── 3) Abarrotes La Esquina ──────────────────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000001', slug),
       '22222222-0001-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('abarrpro-001','Coca-Cola 2L',                'Refrescos',  35.00,22.00,120),
  ('abarrpro-002','Sabritas Original 175g',      'Botanas',    25.00,14.00,200),
  ('abarrpro-003','Gansito Marinela 4pz',        'Botanas',    32.00,18.00,150),
  ('abarrpro-004','Leche Lala 1L',               'Lácteos',    28.00,18.00,100),
  ('abarrpro-005','Pan Bimbo Blanco',            'Panadería',  42.00,28.00, 80),
  ('abarrpro-006','Frijol Bayo 1kg',             'Granos',     35.00,22.00,120),
  ('abarrpro-007','Arroz Verde Valle 1kg',       'Granos',     28.00,18.00,150),
  ('abarrpro-008','Aceite Capullo 1L',           'Aceites',    48.00,32.00, 80),
  ('abarrpro-009','Azúcar Estándar 1kg',         'Despensa',   25.00,16.00,180),
  ('abarrpro-010','Sal La Fina 1kg',             'Despensa',   12.00, 6.00,200),
  ('abarrpro-011','Café Soluble Nescafé 175g',   'Café',       95.00,62.00, 60),
  ('abarrpro-012','Atún Tuny en Agua',           'Enlatados',  22.00,13.00,200),
  ('abarrpro-013','Papel Higiénico Pétalo 4r',   'Higiene',    32.00,20.00, 90),
  ('abarrpro-014','Detergente Roma 1kg',         'Limpieza',   35.00,22.00, 70)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ── 4) Farmacia San Rafael ───────────────────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000003', slug),
       '22222222-0003-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('farmpro-001','Paracetamol 500mg 24tab',     'Analgésicos',       45.00,22.00,120),
  ('farmpro-002','Ibuprofeno 400mg 12tab',      'Analgésicos',       38.00,18.00,100),
  ('farmpro-003','Aspirina Bayer 12tab',        'Analgésicos',       42.00,22.00,100),
  ('farmpro-004','Vitamina C 1g 30tab',         'Vitaminas',         85.00,42.00, 80),
  ('farmpro-005','Loratadina 10mg 10tab',       'Antialérgicos',     45.00,22.00, 90),
  ('farmpro-006','Omeprazol 20mg 14cap',        'Gastrointestinal',  65.00,32.00, 70),
  ('farmpro-007','Alka-Seltzer 12sob',          'Gastrointestinal',  48.00,24.00, 80),
  ('farmpro-008','Termómetro Digital',          'Equipos',          125.00,68.00, 25),
  ('farmpro-009','Jabón Antibacterial Asepxia', 'Higiene',           52.00,28.00, 60),
  ('farmpro-010','Curitas 30pz',                'Curaciones',        35.00,18.00, 90),
  ('farmpro-011','Alcohol 70% 250ml',           'Curaciones',        28.00,14.00,100),
  ('farmpro-012','Test Embarazo',               'Diagnóstico',       85.00,38.00, 40),
  ('farmpro-013','Cubrebocas KN95 5pz',         'Protección',        45.00,22.00,120)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ── 5) Boutique Femenina Andrea (ropa) ───────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000008', slug),
       '22222222-0008-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('ropapro-001','Camisa Polo Algodón',       'Caballero',  385.00,180.00, 40),
  ('ropapro-002','Playera Básica Cuello V',   'Caballero',  185.00, 80.00, 60),
  ('ropapro-003','Jeans Slim Fit',            'Caballero',  545.00,260.00, 35),
  ('ropapro-004','Vestido Casual Floral',     'Dama',       625.00,290.00, 25),
  ('ropapro-005','Falda Plisada',             'Dama',       385.00,170.00, 30),
  ('ropapro-006','Saco Blazer',               'Dama',       785.00,360.00, 20),
  ('ropapro-007','Tenis Deportivos',          'Calzado',    895.00,420.00, 35),
  ('ropapro-008','Bolso Crossbody',           'Accesorios', 385.00,170.00, 30),
  ('ropapro-009','Cinturón Piel',             'Accesorios', 245.00,110.00, 40),
  ('ropapro-010','Calcetines Pack 3',         'Accesorios', 125.00, 50.00, 80),
  ('ropapro-011','Bufanda Lana',              'Accesorios', 185.00, 80.00, 50),
  ('ropapro-012','Gorra Snapback',            'Accesorios', 285.00,130.00, 45)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ── 6) Barbería Don Pepe ─────────────────────────────────────
INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000006', slug),
       '22222222-0006-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category,
       now() - interval '90 days' + (random() * interval '60 days')
FROM (VALUES
  ('barbpro-001','Corte Caballero Clásico', 'Servicios',  150.00,  0.00,9999),
  ('barbpro-002','Corte + Barba',           'Servicios',  225.00,  0.00,9999),
  ('barbpro-003','Corte Niño',              'Servicios',   95.00,  0.00,9999),
  ('barbpro-004','Diseño Cejas',            'Servicios',   45.00,  0.00,9999),
  ('barbpro-005','Tinte Cabello',           'Servicios',  385.00,120.00,9999),
  ('barbpro-006','Lavado + Secado',         'Servicios',   85.00,  0.00,9999),
  ('barbpro-007','Tratamiento Capilar',     'Servicios',  245.00, 60.00,9999),
  ('barbpro-008','Afeitada Tradicional',    'Servicios',  125.00,  0.00,9999),
  ('barbpro-009','Pomada Suavecito 100ml',  'Productos',  245.00,130.00,  20),
  ('barbpro-010','Aceite Barba Argan',      'Productos',  185.00, 80.00,  25),
  ('barbpro-011','Champú Anti-caspa',       'Productos',  145.00, 65.00,  30),
  ('barbpro-012','Cera Modeladora',         'Productos',  125.00, 55.00,  35)
) AS t(slug, name, category, price, cost, stock)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FIX-D-2 — CLIENTES DEMO PRO (10 mexicanos por giro × 6 giros)
-- ============================================================
DO $$
DECLARE
  tenants jsonb := '[
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000005","owner":"22222222-0005-aaaa-aaaa-000000000001","prefix":"cafepro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000004","owner":"22222222-0004-aaaa-aaaa-000000000001","prefix":"restpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000001","owner":"22222222-0001-aaaa-aaaa-000000000001","prefix":"abarrpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000003","owner":"22222222-0003-aaaa-aaaa-000000000001","prefix":"farmpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000008","owner":"22222222-0008-aaaa-aaaa-000000000001","prefix":"ropapro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000006","owner":"22222222-0006-aaaa-aaaa-000000000001","prefix":"barbpro"}
  ]'::jsonb;
  clients jsonb := '[
    {"name":"María González Hernández",   "phone":"+525512345001","rfc":"GOHM850315ABC","email":"maria.gonzalez@gmail.com"},
    {"name":"José Luis Ramírez Pérez",    "phone":"+525512345002","rfc":"RAPJ820712D45","email":"jose.ramirez@gmail.com"},
    {"name":"Ana Patricia Martínez",       "phone":"+525512345003","rfc":"MAPA900221XY2","email":"ana.martinez@gmail.com"},
    {"name":"Carlos Eduardo López Vargas", "phone":"+525512345004","rfc":"LOVC780610Q9P","email":"carlos.lopez@gmail.com"},
    {"name":"Lucía Fernández del Río",     "phone":"+525512345005","rfc":"FERL931104B72","email":"lucia.fernandez@gmail.com"},
    {"name":"Roberto Carlos Sánchez",      "phone":"+525512345006","rfc":"SAOR751228KK1","email":"roberto.sanchez@gmail.com"},
    {"name":"Diana Laura Torres",          "phone":"+525512345007","rfc":"TODL880506M30","email":"diana.torres@gmail.com"},
    {"name":"Miguel Ángel Ortiz",          "phone":"+525512345008","rfc":"OIMA800817P11","email":"miguel.ortiz@gmail.com"},
    {"name":"Verónica Castillo Ruiz",      "phone":"+525512345009","rfc":"CARV870423Z21","email":"veronica.castillo@gmail.com"},
    {"name":"Fernando Aguilar Méndez",     "phone":"+525512345010","rfc":"AUMF830129RFC","email":"fernando.aguilar@gmail.com"}
  ]'::jsonb;
  has_tenant_id boolean;
  has_rfc boolean;
  t jsonb;
  c jsonb;
  inserted_count int := 0;
  cust_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customers') THEN
    RAISE NOTICE 'FIX-D-2: tabla customers no existe, saltando.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='customers' AND column_name='tenant_id'
  ) INTO has_tenant_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='customers' AND column_name='rfc'
  ) INTO has_rfc;

  FOR t IN SELECT * FROM jsonb_array_elements(tenants) LOOP
    FOR c IN SELECT * FROM jsonb_array_elements(clients) LOOP
      cust_id := seed_uuid((t->>'tenant')::uuid, (t->>'prefix') || '-pro-cust-' || (c->>'rfc'));

      IF has_tenant_id AND has_rfc THEN
        -- user_id NULL: customers.user_id FK -> users(id), no tenemos correspondencia.
        -- Lo importante para multi-tenant es tenant_id (R4b hardening).
        INSERT INTO customers (id, tenant_id, name, phone, email, rfc, address, credit_limit, balance, active, created_at)
        VALUES (
          cust_id, (t->>'tenant')::uuid,
          c->>'name', c->>'phone', c->>'email', c->>'rfc',
          'Av. Reforma 100, Col. Centro, CDMX', 0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, phone = EXCLUDED.phone,
              email = EXCLUDED.email, rfc = EXCLUDED.rfc;
      ELSIF has_rfc THEN
        INSERT INTO customers (id, name, phone, email, rfc, address, credit_limit, balance, active, created_at)
        VALUES (
          cust_id,
          c->>'name', c->>'phone', c->>'email', c->>'rfc',
          'Av. Reforma 100, Col. Centro, CDMX', 0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, phone = EXCLUDED.phone,
              email = EXCLUDED.email, rfc = EXCLUDED.rfc;
      ELSE
        INSERT INTO customers (id, name, phone, email, address, credit_limit, balance, active, created_at)
        VALUES (
          cust_id,
          c->>'name', c->>'phone', c->>'email',
          'Av. Reforma 100, Col. Centro, CDMX', 0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, phone = EXCLUDED.phone,
              email = EXCLUDED.email;
      END IF;
      inserted_count := inserted_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'FIX-D-2: % clientes demo PRO upserted (6 giros x 10).', inserted_count;
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL:
--   SELECT count(*) FROM pos_products
--    WHERE code IS NOT NULL
--      AND name LIKE '%Pollo a la Parrilla%'
--       OR name LIKE '%Espresso Doble%'
--       OR name LIKE '%Coca-Cola 2L%';
--   -- Esperado: ≥ 6 (uno por giro relevante).
--
--   SELECT t.name AS tenant, count(c.id) AS demo_pro_customers
--     FROM pos_companies t
--     JOIN customers c ON c.user_id IN (
--          SELECT id FROM pos_users WHERE company_id = t.id AND role='admin'
--     )
--    WHERE t.id IN (
--      '11111111-aaaa-aaaa-aaaa-000000000001',
--      '11111111-aaaa-aaaa-aaaa-000000000003',
--      '11111111-aaaa-aaaa-aaaa-000000000004',
--      '11111111-aaaa-aaaa-aaaa-000000000005',
--      '11111111-aaaa-aaaa-aaaa-000000000006',
--      '11111111-aaaa-aaaa-aaaa-000000000008'
--    )
--      AND c.email LIKE '%@gmail.com'
--    GROUP BY t.name;
-- ============================================================
