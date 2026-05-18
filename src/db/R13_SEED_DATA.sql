-- =====================================================================
-- VOLVIX POS GODMODE 3.4.0 — R13 SEED DATA
-- Generated: 2026-04-26
-- Idempotent seed for Supabase. Safe to re-run.
-- Password de prueba (cargada desde env TEST_USER_PASSWORD) -> almacenada como bcrypt en password_hash. NUNCA hardcodear el plaintext aquí.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 0. EXTENSIONES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. TENANTS / COMPANIES (3: farmacia, restaurante, gym)
-- =====================================================================
INSERT INTO pos_companies (id, name, plan, is_active, owner_user_id, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Farmacia San Rafael CDMX', 'pro',        TRUE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NOW() - INTERVAL '180 days'),
  ('22222222-2222-2222-2222-222222222222', 'Restaurante La Casa del Mole',  'enterprise', TRUE, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', NOW() - INTERVAL '120 days'),
  ('33333333-3333-3333-3333-333333333333', 'Volvix Fitness Club Polanco',   'pro',        TRUE, 'cccccccc-cccc-cccc-cccc-ccccccccccc1', NOW() -  INTERVAL '90 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  is_active = EXCLUDED.is_active;

-- =====================================================================
-- 2. USUARIOS (admin, owner, cajero) — password_hash = bcrypt(TEST_USER_PASSWORD)
-- =====================================================================
INSERT INTO pos_users (id, email, password_hash, role, plan, full_name, phone, company_id, is_active, notes, created_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'admin@volvix.test',
   '$2b$12$Q5kF3Z8wYx9rL2nPjVbHmu7qKsR4tT6vW8yZ1aB3cD5eF7gH9iJ1K',
   'ADMIN', 'enterprise', 'Roberto Hernández Vázquez', '+525512345678',
   '11111111-1111-1111-1111-111111111111', TRUE,
   '{"volvix_role":"superadmin","tenant_id":"TNT001","tenant_name":"Farmacia San Rafael CDMX"}',
   NOW() - INTERVAL '180 days'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'owner@volvix.test',
   '$2b$12$Q5kF3Z8wYx9rL2nPjVbHmu7qKsR4tT6vW8yZ1aB3cD5eF7gH9iJ1K',
   'OWNER', 'enterprise', 'María Fernanda Gutiérrez López', '+525587654321',
   '22222222-2222-2222-2222-222222222222', TRUE,
   '{"volvix_role":"owner","tenant_id":"TNT002","tenant_name":"Restaurante La Casa del Mole"}',
   NOW() - INTERVAL '120 days'),

  ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
   'cajero@volvix.test',
   '$2b$12$Q5kF3Z8wYx9rL2nPjVbHmu7qKsR4tT6vW8yZ1aB3cD5eF7gH9iJ1K',
   'USER', 'pro', 'José Antonio Ramírez Mendoza', '+525599887766',
   '33333333-3333-3333-3333-333333333333', TRUE,
   '{"volvix_role":"cajero","tenant_id":"TNT003","tenant_name":"Volvix Fitness Club Polanco"}',
   NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes;

-- =====================================================================
-- 3. ROLES Y PERMISOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS pos_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, code)
);

INSERT INTO pos_roles (id, company_id, code, name, description, permissions) VALUES
  ('d1111111-0000-0000-0000-000000000001', NULL, 'superadmin', 'Super Administrador',
   'Acceso global Volvix, multi-tenant, billing, agents.',
   '["*","tenants.*","users.*","billing.*","agents.*","reports.*","audit.read"]'),
  ('d1111111-0000-0000-0000-000000000002', NULL, 'owner', 'Dueño del Negocio',
   'Dueño legal del tenant, ve finanzas y P&L.',
   '["org.read","org.update","users.read","users.create","reports.*","finance.*","products.*","customers.*","sales.*","staff.*","settings.*"]'),
  ('d1111111-0000-0000-0000-000000000003', NULL, 'manager', 'Gerente',
   'Operaciones diarias, sin acceso a billing externo.',
   '["products.*","customers.*","sales.*","inventory.*","staff.read","staff.update","reports.read"]'),
  ('d1111111-0000-0000-0000-000000000004', NULL, 'cajero', 'Cajero / Vendedor',
   'POS terminal, ventas y consulta de productos.',
   '["pos.use","sales.create","sales.read","customers.read","customers.create","products.read","till.open","till.close"]'),
  ('d1111111-0000-0000-0000-000000000005', NULL, 'almacenista', 'Almacenista',
   'Gestión de inventario y recibo de mercancía.',
   '["products.read","inventory.*","suppliers.read","po.read","po.receive"]'),
  ('d1111111-0000-0000-0000-000000000006', NULL, 'contador', 'Contador',
   'Reportes fiscales SAT y conciliación.',
   '["reports.financial","finance.read","tax.*","journal.read","ledger.read","cfdi.*"]')
ON CONFLICT (company_id, code) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS pos_user_roles (
  user_id    UUID NOT NULL,
  role_id    UUID NOT NULL,
  company_id UUID,
  PRIMARY KEY (user_id, role_id)
);

INSERT INTO pos_user_roles (user_id, role_id, company_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','d1111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','d1111111-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1','d1111111-0000-0000-0000-000000000004','33333333-3333-3333-3333-333333333333')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- =====================================================================
-- 4. CONFIGURACIÓN FISCAL MX (CFDI 4.0)
-- =====================================================================
CREATE TABLE IF NOT EXISTS pos_fiscal_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL UNIQUE,
  rfc               TEXT NOT NULL,
  razon_social      TEXT NOT NULL,
  regimen_fiscal    TEXT NOT NULL,
  codigo_postal     TEXT NOT NULL,
  uso_cfdi_default  TEXT NOT NULL DEFAULT 'G03',
  serie_factura     TEXT NOT NULL DEFAULT 'A',
  folio_inicial     INTEGER NOT NULL DEFAULT 1,
  pac_provider      TEXT,
  pac_user          TEXT,
  certificado_csd   TEXT,
  llave_privada_csd TEXT,
  is_test_mode      BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO pos_fiscal_config
  (company_id, rfc, razon_social, regimen_fiscal, codigo_postal, uso_cfdi_default, serie_factura, folio_inicial, pac_provider, is_test_mode)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'FSR210315AB7', 'FARMACIA SAN RAFAEL SA DE CV',
   '601', '06470', 'G03', 'A', 1001, 'finkok', TRUE),
  ('22222222-2222-2222-2222-222222222222',
   'CDM180722H44', 'LA CASA DEL MOLE SA DE CV',
   '601', '03100', 'G03', 'B', 2001, 'finkok', TRUE),
  ('33333333-3333-3333-3333-333333333333',
   'VFC220105NK3', 'VOLVIX FITNESS CLUB SA DE CV',
   '601', '11560', 'G03', 'C', 3001, 'finkok', TRUE)
ON CONFLICT (company_id) DO UPDATE SET
  rfc = EXCLUDED.rfc,
  razon_social = EXCLUDED.razon_social,
  regimen_fiscal = EXCLUDED.regimen_fiscal,
  codigo_postal = EXCLUDED.codigo_postal;

-- Catálogos SAT mínimos
CREATE TABLE IF NOT EXISTS sat_uso_cfdi (clave TEXT PRIMARY KEY, descripcion TEXT NOT NULL);
INSERT INTO sat_uso_cfdi (clave, descripcion) VALUES
  ('G01','Adquisición de mercancías'),
  ('G02','Devoluciones, descuentos o bonificaciones'),
  ('G03','Gastos en general'),
  ('I01','Construcciones'),
  ('I04','Equipo de cómputo y accesorios'),
  ('D01','Honorarios médicos, dentales y gastos hospitalarios'),
  ('P01','Por definir'),
  ('S01','Sin efectos fiscales'),
  ('CP01','Pagos')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS sat_regimen_fiscal (clave TEXT PRIMARY KEY, descripcion TEXT NOT NULL);
INSERT INTO sat_regimen_fiscal (clave, descripcion) VALUES
  ('601','General de Ley Personas Morales'),
  ('603','Personas Morales con Fines no Lucrativos'),
  ('605','Sueldos y Salarios e Ingresos Asimilados'),
  ('612','Personas Físicas con Actividades Empresariales'),
  ('621','Incorporación Fiscal'),
  ('626','Régimen Simplificado de Confianza')
ON CONFLICT (clave) DO NOTHING;

-- =====================================================================
-- 5. PRODUCTOS (50 por tenant)
-- =====================================================================

-- Helper: borra productos previos del seed para idempotencia limpia
DELETE FROM pos_products WHERE code LIKE 'FAR-%' OR code LIKE 'RES-%' OR code LIKE 'GYM-%';

-- ----- 5.1 FARMACIA (50 SKUs) -----
INSERT INTO pos_products (pos_user_id, code, name, category, cost, price, stock, icon) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0001','Paracetamol 500mg caja 20 tabs','analgesicos',18.50,42.00,180,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0002','Ibuprofeno 400mg caja 30 tabs','analgesicos',32.00,78.00,140,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0003','Naproxeno 250mg caja 24 tabs','analgesicos',45.00,98.00,90,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0004','Diclofenaco 100mg caja 20 tabs','analgesicos',38.00,89.00,75,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0005','Amoxicilina 500mg caja 12 caps','antibioticos',58.00,135.00,60,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0006','Azitromicina 500mg caja 3 tabs','antibioticos',92.00,210.00,45,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0007','Ciprofloxacino 500mg caja 14 tabs','antibioticos',78.00,178.00,55,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0008','Loratadina 10mg caja 20 tabs','antialergicos',35.00,82.00,120,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0009','Clorfenamina 4mg caja 20 tabs','antialergicos',22.00,52.00,95,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0010','Cetirizina 10mg caja 10 tabs','antialergicos',42.00,95.00,80,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0011','Omeprazol 20mg caja 14 caps','gastrointestinales',38.00,89.00,160,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0012','Ranitidina 150mg caja 20 tabs','gastrointestinales',32.00,72.00,110,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0013','Loperamida 2mg caja 12 tabs','gastrointestinales',28.00,65.00,85,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0014','Sales de hidratación oral sobre 20.5g','gastrointestinales',8.50,18.00,300,'🧂'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0015','Metformina 850mg caja 30 tabs','diabetes',55.00,128.00,70,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0016','Glibenclamida 5mg caja 50 tabs','diabetes',48.00,112.00,55,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0017','Insulina NPH 100UI/ml 10ml','diabetes',180.00,389.00,30,'💉'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0018','Tira reactiva glucosa caja 50','diabetes',220.00,485.00,40,'🩸'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0019','Losartán 50mg caja 30 tabs','cardiovascular',62.00,142.00,85,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0020','Enalapril 10mg caja 30 tabs','cardiovascular',48.00,108.00,72,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0021','Atorvastatina 20mg caja 30 tabs','cardiovascular',95.00,215.00,65,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0022','Aspirina protect 100mg caja 28 tabs','cardiovascular',38.00,85.00,140,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0023','Vitamina C 1g caja 10 efervescentes','vitaminas',58.00,128.00,150,'🍊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0024','Complejo B12 caja 30 tabs','vitaminas',72.00,165.00,90,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0025','Multivitamínico adulto caja 60 tabs','vitaminas',145.00,329.00,75,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0026','Calcio + Vit D caja 60 tabs','vitaminas',98.00,225.00,85,'💊'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0027','Hierro polimaltosado jarabe 100ml','vitaminas',82.00,189.00,65,'🍯'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0028','Alcohol etílico 70% 250ml','curaciones',18.00,42.00,200,'🧴'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0029','Agua oxigenada 120ml','curaciones',12.00,28.00,180,'🧴'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0030','Gasas estériles 10x10 paq 5','curaciones',22.00,52.00,150,'🩹'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0031','Curitas surtidas caja 30','curaciones',28.00,65.00,220,'🩹'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0032','Vendas elásticas 5cm','curaciones',32.00,75.00,90,'🩹'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0033','Termómetro digital','dispositivos',95.00,215.00,40,'🌡️'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0034','Baumanómetro digital de brazo','dispositivos',680.00,1499.00,12,'🩺'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0035','Glucómetro completo','dispositivos',420.00,925.00,18,'🩸'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0036','Cubrebocas tricapa caja 50','higiene',58.00,135.00,250,'😷'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0037','Gel antibacterial 1L','higiene',65.00,149.00,160,'🧴'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0038','Jabón neutro Asepxia 100g','higiene',32.00,72.00,140,'🧼'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0039','Shampoo Head & Shoulders 700ml','higiene',98.00,219.00,80,'🧴'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0040','Pasta dental Colgate 100ml','higiene',38.00,85.00,180,'🪥'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0041','Pañal Huggies etapa 4 paq 50','bebes',285.00,629.00,55,'👶'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0042','Toallitas húmedas Pampers 80','bebes',48.00,108.00,140,'🧻'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0043','Fórmula NAN 1 800g','bebes',420.00,925.00,35,'🍼'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0044','Talco Mennen 200g','bebes',45.00,98.00,90,'🍼'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0045','Preservativos Sico caja 3','sexual',38.00,85.00,200,'📦'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0046','Prueba de embarazo Predictor','sexual',62.00,139.00,75,'🧪'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0047','Prueba COVID-19 antígeno','dispositivos',85.00,189.00,120,'🧪'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0048','Salbutamol inhalador 100mcg','respiratorio',128.00,289.00,42,'💨'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0049','Ambroxol jarabe 120ml','respiratorio',58.00,132.00,95,'🍯'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','FAR-0050','Vick Vaporub 50g','respiratorio',45.00,99.00,160,'🧴');

-- ----- 5.2 RESTAURANTE (50 SKUs) -----
INSERT INTO pos_products (pos_user_id, code, name, category, cost, price, stock, icon) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0001','Mole Poblano con pollo','platillos_fuertes',58.00,189.00,40,'🍛'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0002','Mole Negro de Oaxaca','platillos_fuertes',62.00,205.00,35,'🍛'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0003','Chiles en Nogada (temporada)','platillos_fuertes',95.00,295.00,20,'🌶️'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0004','Cochinita Pibil con frijol charro','platillos_fuertes',72.00,219.00,30,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0005','Enchiladas Suizas (3pz)','platillos_fuertes',45.00,165.00,50,'🌯'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0006','Enchiladas Verdes (3pz)','platillos_fuertes',42.00,155.00,55,'🌯'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0007','Enchiladas de Mole (3pz)','platillos_fuertes',45.00,165.00,45,'🌯'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0008','Chilaquiles Verdes con huevo','desayunos',38.00,135.00,60,'🍳'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0009','Chilaquiles Rojos con cecina','desayunos',45.00,159.00,55,'🍳'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0010','Huevos Rancheros','desayunos',32.00,119.00,70,'🍳'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0011','Huevos Divorciados','desayunos',35.00,125.00,65,'🍳'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0012','Molletes con pico de gallo','desayunos',28.00,99.00,80,'🥖'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0013','Tacos de Pastor (3pz)','tacos',32.00,109.00,120,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0014','Tacos de Suadero (3pz)','tacos',35.00,119.00,110,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0015','Tacos de Carnitas (3pz)','tacos',38.00,129.00,100,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0016','Tacos de Lengua (3pz)','tacos',45.00,149.00,60,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0017','Tacos de Cochinita (3pz)','tacos',38.00,135.00,80,'🌮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0018','Quesadilla de flor de calabaza','antojitos',28.00,89.00,90,'🫓'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0019','Quesadilla de huitlacoche','antojitos',32.00,105.00,75,'🫓'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0020','Sopes surtidos (3pz)','antojitos',32.00,115.00,85,'🫓'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0021','Tlayuda oaxaqueña','antojitos',58.00,189.00,40,'🫓'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0022','Sopa de Tortilla','sopas',28.00,95.00,70,'🍲'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0023','Crema de Elote','sopas',25.00,89.00,60,'🍲'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0024','Pozole Rojo Jalisciense','sopas',58.00,179.00,45,'🍲'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0025','Caldo Tlalpeño','sopas',48.00,149.00,55,'🍲'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0026','Ensalada César con pollo','ensaladas',48.00,155.00,65,'🥗'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0027','Ensalada de Nopales','ensaladas',32.00,109.00,50,'🥗'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0028','Arrachera 300g con guarnición','platillos_fuertes',180.00,495.00,25,'🥩'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0029','Filete Tampiqueño','platillos_fuertes',195.00,539.00,20,'🥩'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0030','Pescado a la Veracruzana','platillos_fuertes',155.00,425.00,30,'🐟'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0031','Camarones al Mojo de Ajo','platillos_fuertes',185.00,495.00,28,'🦐'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0032','Agua de Horchata 1L','bebidas',18.00,75.00,150,'🥛'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0033','Agua de Jamaica 1L','bebidas',15.00,65.00,160,'🍹'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0034','Agua de Tamarindo 1L','bebidas',18.00,75.00,140,'🍹'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0035','Refresco Coca-Cola 600ml','bebidas',14.00,45.00,200,'🥤'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0036','Cerveza Victoria 355ml','bebidas',18.00,55.00,180,'🍺'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0037','Cerveza Modelo Especial 355ml','bebidas',20.00,59.00,160,'🍺'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0038','Margarita clásica','cocteles',45.00,159.00,100,'🍸'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0039','Mezcal Espadín shot 60ml','cocteles',58.00,189.00,80,'🥃'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0040','Tequila Don Julio 70 shot','cocteles',95.00,295.00,60,'🥃'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0041','Michelada Cubana','cocteles',38.00,135.00,90,'🍺'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0042','Café americano','bebidas_calientes',12.00,45.00,120,'☕'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0043','Café de olla','bebidas_calientes',14.00,52.00,110,'☕'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0044','Chocolate caliente oaxaqueño','bebidas_calientes',22.00,79.00,75,'☕'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0045','Flan napolitano','postres',22.00,85.00,80,'🍮'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0046','Pastel Tres Leches','postres',32.00,109.00,60,'🍰'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0047','Crepas de cajeta','postres',28.00,99.00,70,'🥞'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0048','Helado artesanal 2 bolas','postres',25.00,89.00,90,'🍨'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0049','Guacamole con totopos','entradas',45.00,149.00,75,'🥑'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','RES-0050','Queso fundido con chorizo','entradas',58.00,179.00,55,'🧀');

-- ----- 5.3 GYM (50 SKUs) -----
INSERT INTO pos_products (pos_user_id, code, name, category, cost, price, stock, icon) VALUES
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0001','Membresía mensual básica','membresias',0.00,799.00,9999,'🎫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0002','Membresía mensual premium','membresias',0.00,1299.00,9999,'🎫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0003','Membresía mensual VIP','membresias',0.00,1899.00,9999,'🎫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0004','Membresía trimestral básica','membresias',0.00,2099.00,9999,'🎫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0005','Membresía anual premium','membresias',0.00,12999.00,9999,'🎫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0006','Pase de día','membresias',0.00,180.00,9999,'🎟️'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0007','Inscripción nuevo miembro','membresias',0.00,499.00,9999,'📝'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0008','Sesión personal trainer 1h','servicios',150.00,450.00,9999,'💪'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0009','Paquete 10 sesiones PT','servicios',1200.00,3999.00,9999,'💪'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0010','Clase Spinning','servicios',0.00,150.00,9999,'🚴'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0011','Clase Yoga 1h','servicios',0.00,180.00,9999,'🧘'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0012','Clase CrossFit 1h','servicios',0.00,200.00,9999,'🏋️'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0013','Clase Zumba 1h','servicios',0.00,150.00,9999,'💃'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0014','Evaluación nutricional','servicios',200.00,599.00,9999,'🥗'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0015','Plan nutricional mensual','servicios',300.00,899.00,9999,'📋'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0016','Whey Protein Gold Standard 5lb','suplementos',850.00,1599.00,40,'🥤'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0017','Whey Isolate ON 3lb','suplementos',780.00,1399.00,35,'🥤'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0018','Creatina Monohidratada 300g','suplementos',280.00,549.00,60,'💊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0019','BCAA Xtend 30 servicios','suplementos',420.00,799.00,45,'🧪'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0020','Pre-workout C4 30 servicios','suplementos',380.00,729.00,50,'⚡'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0021','Glutamina 500g','suplementos',320.00,629.00,38,'💊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0022','Multivitamínico Animal Pak','suplementos',650.00,1199.00,25,'💊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0023','Omega 3 1000mg 100 caps','suplementos',180.00,389.00,55,'💊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0024','Quemador de grasa Hydroxycut','suplementos',420.00,829.00,30,'💊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0025','Barra proteica Quest 60g','suplementos',38.00,79.00,200,'🍫'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0026','Botella Shaker 600ml Volvix','accesorios',45.00,149.00,80,'🍶'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0027','Cinturón de levantamiento cuero','accesorios',280.00,649.00,25,'🥋'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0028','Guantes entrenamiento Harbinger','accesorios',180.00,429.00,40,'🧤'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0029','Bandas de resistencia set 5','accesorios',220.00,499.00,55,'🎗️'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0030','Cuerda para saltar profesional','accesorios',150.00,349.00,45,'🪢'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0031','Tapete yoga 6mm','accesorios',180.00,399.00,60,'🧘'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0032','Foam Roller 33cm','accesorios',220.00,499.00,35,'🧴'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0033','Rodilleras crossfit par','accesorios',280.00,629.00,30,'🦵'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0034','Muñequeras elásticas par','accesorios',95.00,229.00,70,'⌚'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0035','Playera dry-fit Volvix','ropa',180.00,429.00,90,'👕'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0036','Short deportivo Nike','ropa',280.00,649.00,65,'🩳'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0037','Leggings mujer Under Armour','ropa',420.00,949.00,50,'👖'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0038','Sudadera Volvix con gorro','ropa',350.00,799.00,55,'🧥'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0039','Tenis running Adidas Ultraboost','ropa',1850.00,3999.00,18,'👟'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0040','Calcetines deportivos pack 3','ropa',85.00,199.00,120,'🧦'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0041','Toalla microfibra gym','accesorios',120.00,279.00,80,'🧻'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0042','Mochila deportiva Volvix','accesorios',380.00,849.00,40,'🎒'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0043','Bebida hidratante Gatorade 600ml','bebidas',18.00,42.00,250,'🥤'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0044','Agua mineral Topo Chico 600ml','bebidas',12.00,28.00,300,'💧'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0045','Bebida proteica Premier 325ml','bebidas',45.00,89.00,150,'🥤'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0046','Café energético MuscleTech','bebidas',38.00,79.00,100,'☕'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0047','Renta locker mensual','servicios',0.00,299.00,9999,'🔐'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0048','Masaje deportivo 50min','servicios',280.00,699.00,9999,'💆'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0049','Bioimpedancia análisis corporal','servicios',150.00,399.00,9999,'📊'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','GYM-0050','Congelar membresía 1 mes','servicios',0.00,199.00,9999,'❄️');

-- =====================================================================
-- 6. CLIENTES (20 por tenant) — datos mexicanos realistas
-- =====================================================================

DELETE FROM customers WHERE email LIKE '%@volvix-seed.mx';

-- ----- 6.1 FARMACIA -----
INSERT INTO customers (user_id, name, email, phone, address, credit_limit, credit_balance, points, loyalty_points, active) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','María Guadalupe Hernández Ramírez','maria.hernandez01@volvix-seed.mx','+525511220001','Av. Insurgentes Sur 1234, Col. Del Valle, CDMX, CP 03100',2000,0,145,145,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Juan Carlos Martínez González','juan.martinez02@volvix-seed.mx','+525511220002','Calle Madero 45, Col. Centro, CDMX, CP 06000',1500,320,89,89,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Ana Patricia Sánchez Ruiz','ana.sanchez03@volvix-seed.mx','+525511220003','Av. Universidad 3000, Col. Copilco, CDMX, CP 04510',3000,0,256,256,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Roberto Jiménez Castillo','roberto.jimenez04@volvix-seed.mx','+525511220004','Calzada de Tlalpan 1500, Col. Portales, CDMX, CP 03300',1000,0,42,42,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Laura Beatriz Morales Vega','laura.morales05@volvix-seed.mx','+525511220005','Av. Reforma 222, Col. Juárez, CDMX, CP 06600',2500,580,178,178,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Carlos Alberto Pérez Domínguez','carlos.perez06@volvix-seed.mx','+525511220006','Calle Sevilla 78, Col. Juárez, CDMX, CP 06600',2000,0,98,98,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Sofía Alejandra Torres Núñez','sofia.torres07@volvix-seed.mx','+525511220007','Av. Patriotismo 890, Col. Mixcoac, CDMX, CP 03910',1500,0,67,67,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Miguel Ángel Rodríguez Flores','miguel.rodriguez08@volvix-seed.mx','+525511220008','Calle Tabasco 156, Col. Roma Norte, CDMX, CP 06700',3500,0,312,312,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Patricia Elena Gómez Salinas','patricia.gomez09@volvix-seed.mx','+525511220009','Av. Cuauhtémoc 567, Col. Narvarte, CDMX, CP 03020',2000,250,134,134,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Fernando José Ramos Aguilar','fernando.ramos10@volvix-seed.mx','+525511220010','Calle Zacatecas 234, Col. Roma Sur, CDMX, CP 06760',1000,0,45,45,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Verónica Isabel Mendoza Cruz','veronica.mendoza11@volvix-seed.mx','+525511220011','Av. Coyoacán 1500, Col. Del Valle, CDMX, CP 03100',2500,0,189,189,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Alejandro Daniel Vázquez Ortiz','alejandro.vazquez12@volvix-seed.mx','+525511220012','Calle Guanajuato 89, Col. Roma Norte, CDMX, CP 06700',1500,180,76,76,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Gabriela Cristina López Reyes','gabriela.lopez13@volvix-seed.mx','+525511220013','Av. División del Norte 2900, Col. Portales, CDMX, CP 03300',2000,0,156,156,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Héctor Manuel Ortega Silva','hector.ortega14@volvix-seed.mx','+525511220014','Calle Veracruz 345, Col. Condesa, CDMX, CP 06140',3000,0,245,245,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Lucía Margarita Castro Peña','lucia.castro15@volvix-seed.mx','+525511220015','Av. Nuevo León 156, Col. Hipódromo, CDMX, CP 06100',1500,0,87,87,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Diego Sebastián Romero Núñez','diego.romero16@volvix-seed.mx','+525511220016','Calle Amsterdam 78, Col. Condesa, CDMX, CP 06140',2000,420,123,123,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Alejandra Valeria Fuentes Lara','alejandra.fuentes17@volvix-seed.mx','+525511220017','Av. Tamaulipas 234, Col. Condesa, CDMX, CP 06140',2500,0,198,198,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Rodrigo Emilio Navarro Solís','rodrigo.navarro18@volvix-seed.mx','+525511220018','Calle Querétaro 567, Col. Roma Norte, CDMX, CP 06700',1000,0,54,54,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Mariana Itzel Espinoza Cordero','mariana.espinoza19@volvix-seed.mx','+525511220019','Av. Álvaro Obregón 890, Col. Roma Norte, CDMX, CP 06700',3000,0,267,267,TRUE),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Eduardo Antonio Vargas Mejía','eduardo.vargas20@volvix-seed.mx','+525511220020','Calle Orizaba 123, Col. Roma Norte, CDMX, CP 06700',2000,0,134,134,TRUE);

-- ----- 6.2 RESTAURANTE -----
INSERT INTO customers (user_id, name, email, phone, address, credit_limit, credit_balance, points, loyalty_points, active) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Ricardo Antonio Beltrán Cárdenas','ricardo.beltran01@volvix-seed.mx','+525522330001','Av. Polanco 234, Col. Polanco, CDMX, CP 11560',5000,0,489,489,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Mónica Elena Salazar Quintero','monica.salazar02@volvix-seed.mx','+525522330002','Calle Masaryk 567, Col. Polanco, CDMX, CP 11560',8000,0,756,756,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Javier Eduardo Carrillo Mondragón','javier.carrillo03@volvix-seed.mx','+525522330003','Av. Presidente Masaryk 890, Col. Polanco, CDMX, CP 11560',5000,1200,567,567,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Elizabeth Carolina Pineda Rojas','elizabeth.pineda04@volvix-seed.mx','+525522330004','Calle Horacio 123, Col. Polanco, CDMX, CP 11560',6000,0,678,678,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Francisco Javier Aldama Cervantes','francisco.aldama05@volvix-seed.mx','+525522330005','Av. Ejército Nacional 456, Col. Granada, CDMX, CP 11520',4000,0,345,345,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Daniela Renata Bustamante Tovar','daniela.bustamante06@volvix-seed.mx','+525522330006','Calle Homero 789, Col. Polanco, CDMX, CP 11550',5000,0,456,456,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Arturo Gerardo Cisneros Villalobos','arturo.cisneros07@volvix-seed.mx','+525522330007','Av. Mariano Escobedo 345, Col. Anzures, CDMX, CP 11590',7000,890,623,623,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Karla Vanessa Delgado Olvera','karla.delgado08@volvix-seed.mx','+525522330008','Calle Lamartine 234, Col. Polanco, CDMX, CP 11550',5000,0,512,512,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Pablo Emiliano Estrada Galindo','pablo.estrada09@volvix-seed.mx','+525522330009','Av. Río Mississippi 67, Col. Cuauhtémoc, CDMX, CP 06500',3500,0,289,289,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Andrea Camila Figueroa Hinojosa','andrea.figueroa10@volvix-seed.mx','+525522330010','Calle Schiller 456, Col. Polanco, CDMX, CP 11550',6000,0,634,634,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Sergio Iván Guzmán Iturbide','sergio.guzman11@volvix-seed.mx','+525522330011','Av. Ejército Nacional 990, Col. Granada, CDMX, CP 11520',5500,750,478,478,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Regina Sofía Hidalgo Juárez','regina.hidalgo12@volvix-seed.mx','+525522330012','Calle Aristóteles 123, Col. Polanco, CDMX, CP 11560',7500,0,789,789,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Mauricio Andrés Iglesias Kuri','mauricio.iglesias13@volvix-seed.mx','+525522330013','Av. Newton 567, Col. Polanco, CDMX, CP 11560',6500,0,567,567,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Valentina Renata Juárez Lazcano','valentina.juarez14@volvix-seed.mx','+525522330014','Calle Goldsmith 234, Col. Polanco, CDMX, CP 11550',5000,0,423,423,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Emilio Bernardo Karam Lerma','emilio.karam15@volvix-seed.mx','+525522330015','Av. Campos Elíseos 789, Col. Polanco, CDMX, CP 11560',8000,0,892,892,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Alejandra Paola León Mantecón','alejandra.leon16@volvix-seed.mx','+525522330016','Calle Sócrates 456, Col. Polanco, CDMX, CP 11560',5000,0,512,512,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Iván Rodrigo Magaña Núñez','ivan.magana17@volvix-seed.mx','+525522330017','Av. Moliere 234, Col. Polanco, CDMX, CP 11550',4500,0,389,389,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Jimena Aurora Núñez Ocampo','jimena.nunez18@volvix-seed.mx','+525522330018','Calle Tennyson 567, Col. Polanco, CDMX, CP 11560',6000,1100,567,567,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Rafael Octavio Ochoa Pacheco','rafael.ochoa19@volvix-seed.mx','+525522330019','Av. Hegel 890, Col. Polanco, CDMX, CP 11560',7000,0,678,678,TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Ximena Lucía Padilla Quintanilla','ximena.padilla20@volvix-seed.mx','+525522330020','Calle Galileo 123, Col. Polanco, CDMX, CP 11550',5500,0,489,489,TRUE);

-- ----- 6.3 GYM -----
INSERT INTO customers (user_id, name, email, phone, address, credit_limit, credit_balance, points, loyalty_points, active) VALUES
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Diego Alberto Quintero Robles','diego.quintero01@volvix-seed.mx','+525533440001','Av. Horacio 234, Col. Polanco, CDMX, CP 11560',2000,0,234,234,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Natalia Esperanza Robles Sandoval','natalia.robles02@volvix-seed.mx','+525533440002','Calle Newton 567, Col. Polanco, CDMX, CP 11560',1500,0,189,189,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Gustavo Adolfo Salgado Trejo','gustavo.salgado03@volvix-seed.mx','+525533440003','Av. Masaryk 890, Col. Polanco, CDMX, CP 11560',2500,0,345,345,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Brenda Itzel Treviño Uribe','brenda.trevino04@volvix-seed.mx','+525533440004','Calle Aristóteles 123, Col. Polanco, CDMX, CP 11560',1800,400,267,267,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Octavio Ramiro Uriarte Valencia','octavio.uriarte05@volvix-seed.mx','+525533440005','Av. Ejército Nacional 456, Col. Granada, CDMX, CP 11520',2200,0,289,289,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Adriana Berenice Vega Wong','adriana.vega06@volvix-seed.mx','+525533440006','Calle Schiller 789, Col. Polanco, CDMX, CP 11550',1500,0,156,156,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Bruno Maximiliano Wong Xochitl','bruno.wong07@volvix-seed.mx','+525533440007','Av. Homero 345, Col. Polanco, CDMX, CP 11560',3000,0,478,478,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Lorena Marisol Xolalpa Yáñez','lorena.xolalpa08@volvix-seed.mx','+525533440008','Calle Galileo 234, Col. Polanco, CDMX, CP 11550',1800,0,234,234,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Alfonso Tadeo Yedra Zamudio','alfonso.yedra09@volvix-seed.mx','+525533440009','Av. Hegel 567, Col. Polanco, CDMX, CP 11560',2500,650,367,367,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Citlalli Yaretzi Zambrano Acosta','citlalli.zambrano10@volvix-seed.mx','+525533440010','Calle Lamartine 890, Col. Polanco, CDMX, CP 11550',1500,0,178,178,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Damián Tristán Acuña Bermúdez','damian.acuna11@volvix-seed.mx','+525533440011','Av. Moliere 123, Col. Polanco, CDMX, CP 11550',2000,0,256,256,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Frida Renata Bárcenas Cifuentes','frida.barcenas12@volvix-seed.mx','+525533440012','Calle Tennyson 456, Col. Polanco, CDMX, CP 11560',2200,0,312,312,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Hugo Maximino Cervera Domínguez','hugo.cervera13@volvix-seed.mx','+525533440013','Av. Sócrates 789, Col. Polanco, CDMX, CP 11560',2800,0,389,389,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Itzel Tonalli Domínguez Echeverría','itzel.dominguez14@volvix-seed.mx','+525533440014','Calle Goldsmith 234, Col. Polanco, CDMX, CP 11550',1800,0,201,201,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Jair Eustaquio Echeverría Fonseca','jair.echeverria15@volvix-seed.mx','+525533440015','Av. Campos Elíseos 567, Col. Polanco, CDMX, CP 11560',2500,500,345,345,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Karina Yedid Fonseca Galván','karina.fonseca16@volvix-seed.mx','+525533440016','Calle Tennyson 890, Col. Polanco, CDMX, CP 11560',1500,0,167,167,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Luis Mariano Galván Hurtado','luis.galvan17@volvix-seed.mx','+525533440017','Av. Galileo 123, Col. Polanco, CDMX, CP 11550',3500,0,567,567,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Melissa Aranza Hurtado Iturralde','melissa.hurtado18@volvix-seed.mx','+525533440018','Calle Hegel 456, Col. Polanco, CDMX, CP 11560',2000,0,278,278,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Néstor Tadeo Iturralde Jaramillo','nestor.iturralde19@volvix-seed.mx','+525533440019','Av. Sócrates 789, Col. Polanco, CDMX, CP 11560',2300,0,312,312,TRUE),
('cccccccc-cccc-cccc-cccc-ccccccccccc1','Olivia Renata Jaramillo Kuri','olivia.jaramillo20@volvix-seed.mx','+525533440020','Calle Aristóteles 234, Col. Polanco, CDMX, CP 11560',1800,0,234,234,TRUE);

-- =====================================================================
-- 7. VENTAS (30 últimos 30 días) — distribuidas entre los 3 tenants
-- =====================================================================

-- Borrar ventas previas del seed (identificadas por items con sku especial)
DELETE FROM pos_sales WHERE items::text LIKE '%"seed_marker":"R13"%';

INSERT INTO pos_sales (pos_user_id, total, payment_method, items, created_at) VALUES
-- Farmacia (10 ventas)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 162.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0001","name":"Paracetamol 500mg","qty":2,"price":42.00,"subtotal":84.00},{"sku":"FAR-0011","name":"Omeprazol 20mg","qty":1,"price":89.00,"subtotal":89.00}],"subtotal":140.00,"iva":22.40,"total":162.40}',
 NOW() - INTERVAL '29 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 528.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0034","name":"Baumanómetro digital","qty":1,"price":1499.00,"subtotal":1499.00}],"subtotal":1292.24,"iva":206.76,"total":1499.00}',
 NOW() - INTERVAL '27 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 389.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0017","name":"Insulina NPH","qty":1,"price":389.00,"subtotal":389.00}],"subtotal":335.34,"iva":53.66,"total":389.00}',
 NOW() - INTERVAL '25 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 215.50, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0021","name":"Atorvastatina 20mg","qty":1,"price":215.00,"subtotal":215.00}],"subtotal":185.34,"iva":29.66,"total":215.00}',
 NOW() - INTERVAL '22 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 478.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0025","name":"Multivitamínico","qty":1,"price":329.00,"subtotal":329.00},{"sku":"FAR-0023","name":"Vit C","qty":1,"price":128.00,"subtotal":128.00}],"subtotal":394.00,"iva":63.04,"total":457.04}',
 NOW() - INTERVAL '19 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 925.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0035","name":"Glucómetro","qty":1,"price":925.00,"subtotal":925.00}],"subtotal":797.41,"iva":127.59,"total":925.00}',
 NOW() - INTERVAL '16 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 135.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0036","name":"Cubrebocas tricapa","qty":1,"price":135.00,"subtotal":135.00}],"subtotal":116.38,"iva":18.62,"total":135.00}',
 NOW() - INTERVAL '12 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 629.00, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0041","name":"Pañal Huggies","qty":1,"price":629.00,"subtotal":629.00}],"subtotal":542.24,"iva":86.76,"total":629.00}',
 NOW() - INTERVAL '8 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 289.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0048","name":"Salbutamol inhalador","qty":1,"price":289.00,"subtotal":289.00}],"subtotal":249.14,"iva":39.86,"total":289.00}',
 NOW() - INTERVAL '4 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 178.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"FAR-0007","name":"Ciprofloxacino","qty":1,"price":178.00,"subtotal":178.00}],"subtotal":153.45,"iva":24.55,"total":178.00}',
 NOW() - INTERVAL '1 days'),

-- Restaurante (10 ventas)
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 754.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0001","name":"Mole Poblano","qty":2,"price":189.00,"subtotal":378.00},{"sku":"RES-0036","name":"Cerveza Victoria","qty":4,"price":55.00,"subtotal":220.00},{"sku":"RES-0045","name":"Flan napolitano","qty":2,"price":85.00,"subtotal":170.00}],"subtotal":650.00,"iva":104.00,"propina":97.50,"total":851.50}',
 NOW() - INTERVAL '28 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 1299.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0028","name":"Arrachera 300g","qty":2,"price":495.00,"subtotal":990.00},{"sku":"RES-0040","name":"Tequila Don Julio 70","qty":1,"price":295.00,"subtotal":295.00}],"subtotal":1107.76,"iva":177.24,"total":1285.00}',
 NOW() - INTERVAL '26 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 425.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0030","name":"Pescado Veracruzana","qty":1,"price":425.00,"subtotal":425.00}],"subtotal":366.38,"iva":58.62,"total":425.00}',
 NOW() - INTERVAL '23 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 642.00, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0013","name":"Tacos Pastor","qty":3,"price":109.00,"subtotal":327.00},{"sku":"RES-0036","name":"Cerveza Victoria","qty":4,"price":55.00,"subtotal":220.00},{"sku":"RES-0049","name":"Guacamole","qty":1,"price":149.00,"subtotal":149.00}],"subtotal":600.86,"iva":96.14,"total":697.00}',
 NOW() - INTERVAL '21 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 1850.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0031","name":"Camarones mojo de ajo","qty":2,"price":495.00,"subtotal":990.00},{"sku":"RES-0029","name":"Filete Tampiqueño","qty":1,"price":539.00,"subtotal":539.00},{"sku":"RES-0038","name":"Margarita","qty":2,"price":159.00,"subtotal":318.00}],"subtotal":1592.24,"iva":254.76,"total":1847.00}',
 NOW() - INTERVAL '18 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 358.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0008","name":"Chilaquiles Verdes","qty":2,"price":135.00,"subtotal":270.00},{"sku":"RES-0042","name":"Café americano","qty":2,"price":45.00,"subtotal":90.00}],"subtotal":310.34,"iva":49.66,"total":360.00}',
 NOW() - INTERVAL '15 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 895.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0024","name":"Pozole Rojo","qty":3,"price":179.00,"subtotal":537.00},{"sku":"RES-0032","name":"Agua Horchata","qty":2,"price":75.00,"subtotal":150.00},{"sku":"RES-0046","name":"Pastel Tres Leches","qty":2,"price":109.00,"subtotal":218.00}],"subtotal":780.17,"iva":124.83,"total":905.00}',
 NOW() - INTERVAL '13 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 519.00, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0005","name":"Enchiladas Suizas","qty":2,"price":165.00,"subtotal":330.00},{"sku":"RES-0035","name":"Coca-Cola","qty":2,"price":45.00,"subtotal":90.00},{"sku":"RES-0047","name":"Crepas cajeta","qty":1,"price":99.00,"subtotal":99.00}],"subtotal":447.41,"iva":71.59,"total":519.00}',
 NOW() - INTERVAL '10 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 1180.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0003","name":"Chiles en Nogada","qty":4,"price":295.00,"subtotal":1180.00}],"subtotal":1017.24,"iva":162.76,"total":1180.00}',
 NOW() - INTERVAL '6 days'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 685.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"RES-0014","name":"Tacos Suadero","qty":3,"price":119.00,"subtotal":357.00},{"sku":"RES-0050","name":"Queso fundido chorizo","qty":1,"price":179.00,"subtotal":179.00},{"sku":"RES-0037","name":"Cerveza Modelo","qty":3,"price":59.00,"subtotal":177.00}],"subtotal":614.66,"iva":98.34,"total":713.00}',
 NOW() - INTERVAL '2 days'),

-- Gym (10 ventas)
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 1299.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0002","name":"Membresía premium mensual","qty":1,"price":1299.00,"subtotal":1299.00}],"subtotal":1119.83,"iva":179.17,"total":1299.00}',
 NOW() - INTERVAL '30 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 1599.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0016","name":"Whey Gold Standard 5lb","qty":1,"price":1599.00,"subtotal":1599.00}],"subtotal":1378.45,"iva":220.55,"total":1599.00}',
 NOW() - INTERVAL '28 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 12999.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0005","name":"Membresía anual premium","qty":1,"price":12999.00,"subtotal":12999.00}],"subtotal":11206.03,"iva":1792.97,"total":12999.00}',
 NOW() - INTERVAL '24 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 549.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0018","name":"Creatina 300g","qty":1,"price":549.00,"subtotal":549.00}],"subtotal":473.28,"iva":75.72,"total":549.00}',
 NOW() - INTERVAL '20 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 3999.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0009","name":"Paquete 10 sesiones PT","qty":1,"price":3999.00,"subtotal":3999.00}],"subtotal":3447.41,"iva":551.59,"total":3999.00}',
 NOW() - INTERVAL '17 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 728.00, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0035","name":"Playera dry-fit","qty":1,"price":429.00,"subtotal":429.00},{"sku":"GYM-0026","name":"Shaker 600ml","qty":2,"price":149.00,"subtotal":298.00}],"subtotal":626.72,"iva":100.28,"total":727.00}',
 NOW() - INTERVAL '14 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 729.00, 'efectivo',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0020","name":"Pre-workout C4","qty":1,"price":729.00,"subtotal":729.00}],"subtotal":628.45,"iva":100.55,"total":729.00}',
 NOW() - INTERVAL '11 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 3999.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0039","name":"Tenis Adidas Ultraboost","qty":1,"price":3999.00,"subtotal":3999.00}],"subtotal":3447.41,"iva":551.59,"total":3999.00}',
 NOW() - INTERVAL '7 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 348.00, 'tarjeta_debito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0011","name":"Clase Yoga","qty":1,"price":180.00,"subtotal":180.00},{"sku":"GYM-0044","name":"Topo Chico","qty":2,"price":28.00,"subtotal":56.00},{"sku":"GYM-0025","name":"Barra Quest","qty":1,"price":79.00,"subtotal":79.00},{"sku":"GYM-0047","name":"Locker mensual extra","qty":0,"price":0,"subtotal":0}],"subtotal":272.41,"iva":43.59,"total":316.00}',
 NOW() - INTERVAL '5 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 1199.00, 'tarjeta_credito',
 '{"seed_marker":"R13","lines":[{"sku":"GYM-0022","name":"Animal Pak","qty":1,"price":1199.00,"subtotal":1199.00}],"subtotal":1033.62,"iva":165.38,"total":1199.00}',
 NOW() - INTERVAL '1 days');

COMMIT;

-- =====================================================================
-- VERIFICACIÓN POST-SEED (correr manualmente)
-- =====================================================================
-- SELECT 'companies'  AS t, COUNT(*) FROM pos_companies WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')
-- UNION ALL SELECT 'users',     COUNT(*) FROM pos_users WHERE email IN ('admin@volvix.test','owner@volvix.test','cajero@volvix.test')
-- UNION ALL SELECT 'products',  COUNT(*) FROM pos_products WHERE code LIKE 'FAR-%' OR code LIKE 'RES-%' OR code LIKE 'GYM-%'
-- UNION ALL SELECT 'customers', COUNT(*) FROM customers WHERE email LIKE '%@volvix-seed.mx'
-- UNION ALL SELECT 'sales',     COUNT(*) FROM pos_sales WHERE items::text LIKE '%"seed_marker":"R13"%'
-- UNION ALL SELECT 'roles',     COUNT(*) FROM pos_roles
-- UNION ALL SELECT 'fiscal',    COUNT(*) FROM pos_fiscal_config;
-- Esperado: 3, 3, 150, 60, 30, 6, 3
