-- ============================================================
-- VOLVIX POS — 10 INDUSTRY DEMO TENANTS (master file)
-- ============================================================
-- IDEMPOTENT: uses ON CONFLICT DO NOTHING + fixed UUIDs
-- Creates: 10 tenants + 30 users (1 owner + 2 cajeros each)
--
-- Password for ALL demo users: Demo2026!
-- Password hash (bcrypt rounds=10) below is for "Demo2026!"
-- $2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO
--
-- Run: psql $DATABASE_URL -f seeds/tenants-10-industries.sql
-- ============================================================

BEGIN;

-- ── Tenants (pos_companies) ──
INSERT INTO pos_companies (id, name, vertical, plan, currency, timezone, address, phone, tax_id, is_active, created_at)
VALUES
 ('11111111-aaaa-aaaa-aaaa-000000000001','Abarrotes La Esquina','abarrotes','pro','MXN','America/Mexico_City','Av. Insurgentes Sur 1234, CDMX','+525555010001','ALE240115ABC',true, now() - interval '120 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000002','Panadería La Espiga Dorada','panaderia','pro','MXN','America/Mexico_City','Calle Madero 56, Centro, GDL','+523333010002','PED230810XYZ',true, now() - interval '95 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000003','Farmacia San Rafael','farmacia','pro','MXN','America/Monterrey','Av. Constitución 890, MTY','+528181010003','FSR220505DEF',true, now() - interval '210 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000004','Tacos El Buen Sabor','restaurant','pro','MXN','America/Mexico_City','Calz. Tlalpan 4567, CDMX','+525555010004','TBS210320GHI',true, now() - interval '305 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000005','Café Central','cafe','pro','MXN','America/Mexico_City','Reforma 222, Cuauhtémoc, CDMX','+525555010005','CCE220715JKL',true, now() - interval '180 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000006','Barbería Don Pepe','barberia','pro','MXN','America/Mexico_City','Av. Universidad 990, Coyoacán, CDMX','+525555010006','BDP230101MNO',true, now() - interval '150 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000007','Gasolinera Express 24/7','gasolinera','pro','MXN','America/Mexico_City','Carretera México-Querétaro km 35','+524422010007','GEX190612PQR',true, now() - interval '500 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000008','Boutique Femenina Andrea','ropa','pro','MXN','America/Mexico_City','Plaza Antara, Polanco, CDMX','+525555010008','BFA231120STU',true, now() - interval '110 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000009','TecnoMundo','electronica','pro','MXN','America/Mexico_City','Plaza Galerías, Puebla','+522222010009','TEC200818VWX',true, now() - interval '380 days'),
 ('11111111-aaaa-aaaa-aaaa-000000000010','FitZone Gym','fitness','pro','MXN','America/Mexico_City','Av. Vallarta 5500, GDL','+523333010010','FZG220301YZA',true, now() - interval '230 days')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      vertical = EXCLUDED.vertical,
      plan = EXCLUDED.plan,
      currency = EXCLUDED.currency,
      timezone = EXCLUDED.timezone,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone,
      tax_id = EXCLUDED.tax_id,
      is_active = EXCLUDED.is_active;

-- ── Users (pos_users) ──
-- Each tenant has 1 owner + 2 cajeros.
-- UUID convention: 22222222-{vertical-num}-XXXX-XXXX-{role-num}
-- role-num: 001=owner, 002=cajero1, 003=cajero2
-- Password hash for "Demo2026!" (bcrypt cost=10)
INSERT INTO pos_users (id, email, password_hash, full_name, role, company_id, is_active, created_at)
VALUES
 -- Abarrotes
 ('22222222-0001-aaaa-aaaa-000000000001','demo-abarrotes@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Carlos Hernández (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000001',true, now() - interval '120 days'),
 ('22222222-0001-aaaa-aaaa-000000000002','cajero1-abarrotes@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','María López (Cajera)','cashier','11111111-aaaa-aaaa-aaaa-000000000001',true, now() - interval '90 days'),
 ('22222222-0001-aaaa-aaaa-000000000003','cajero2-abarrotes@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Pedro Ramírez (Cajero+Reportes)','manager','11111111-aaaa-aaaa-aaaa-000000000001',true, now() - interval '60 days'),
 -- Panaderia
 ('22222222-0002-aaaa-aaaa-000000000001','demo-panaderia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Juana Martínez (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000002',true, now() - interval '95 days'),
 ('22222222-0002-aaaa-aaaa-000000000002','cajero1-panaderia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Sofía Domínguez','cashier','11111111-aaaa-aaaa-aaaa-000000000002',true, now() - interval '70 days'),
 ('22222222-0002-aaaa-aaaa-000000000003','cajero2-panaderia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Miguel Ángel Ortiz','manager','11111111-aaaa-aaaa-aaaa-000000000002',true, now() - interval '55 days'),
 -- Farmacia
 ('22222222-0003-aaaa-aaaa-000000000001','demo-farmacia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Dr. Rafael Gómez (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000003',true, now() - interval '210 days'),
 ('22222222-0003-aaaa-aaaa-000000000002','cajero1-farmacia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Laura Vargas','cashier','11111111-aaaa-aaaa-aaaa-000000000003',true, now() - interval '180 days'),
 ('22222222-0003-aaaa-aaaa-000000000003','cajero2-farmacia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Ricardo Ibarra','manager','11111111-aaaa-aaaa-aaaa-000000000003',true, now() - interval '120 days'),
 -- Restaurant
 ('22222222-0004-aaaa-aaaa-000000000001','demo-restaurant@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Don Joaquín Rivera (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000004',true, now() - interval '305 days'),
 ('22222222-0004-aaaa-aaaa-000000000002','cajero1-restaurant@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Norma Salinas','cashier','11111111-aaaa-aaaa-aaaa-000000000004',true, now() - interval '240 days'),
 ('22222222-0004-aaaa-aaaa-000000000003','cajero2-restaurant@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Andrés Cabrera','manager','11111111-aaaa-aaaa-aaaa-000000000004',true, now() - interval '180 days'),
 -- Cafe
 ('22222222-0005-aaaa-aaaa-000000000001','demo-cafe@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Valeria Ochoa (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000005',true, now() - interval '180 days'),
 ('22222222-0005-aaaa-aaaa-000000000002','cajero1-cafe@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Daniela Pérez (Barista)','cashier','11111111-aaaa-aaaa-aaaa-000000000005',true, now() - interval '160 days'),
 ('22222222-0005-aaaa-aaaa-000000000003','cajero2-cafe@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Eduardo Solís','manager','11111111-aaaa-aaaa-aaaa-000000000005',true, now() - interval '140 days'),
 -- Barberia
 ('22222222-0006-aaaa-aaaa-000000000001','demo-barberia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','José "Pepe" Ruiz (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000006',true, now() - interval '150 days'),
 ('22222222-0006-aaaa-aaaa-000000000002','cajero1-barberia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Iván "El Chino" Robles','cashier','11111111-aaaa-aaaa-aaaa-000000000006',true, now() - interval '130 days'),
 ('22222222-0006-aaaa-aaaa-000000000003','cajero2-barberia@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Roberto "Beto" Aguilar','manager','11111111-aaaa-aaaa-aaaa-000000000006',true, now() - interval '90 days'),
 -- Gasolinera
 ('22222222-0007-aaaa-aaaa-000000000001','demo-gasolinera@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Lic. Hugo Mendoza (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000007',true, now() - interval '500 days'),
 ('22222222-0007-aaaa-aaaa-000000000002','cajero1-gasolinera@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Despachador Turno 1','cashier','11111111-aaaa-aaaa-aaaa-000000000007',true, now() - interval '450 days'),
 ('22222222-0007-aaaa-aaaa-000000000003','cajero2-gasolinera@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Despachador Turno 2','manager','11111111-aaaa-aaaa-aaaa-000000000007',true, now() - interval '400 days'),
 -- Ropa
 ('22222222-0008-aaaa-aaaa-000000000001','demo-ropa@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Andrea Treviño (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000008',true, now() - interval '110 days'),
 ('22222222-0008-aaaa-aaaa-000000000002','cajero1-ropa@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Karla Bustamante','cashier','11111111-aaaa-aaaa-aaaa-000000000008',true, now() - interval '85 days'),
 ('22222222-0008-aaaa-aaaa-000000000003','cajero2-ropa@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Patricia Méndez','manager','11111111-aaaa-aaaa-aaaa-000000000008',true, now() - interval '60 days'),
 -- Electronica
 ('22222222-0009-aaaa-aaaa-000000000001','demo-electronica@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Ing. Fernando Cano (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000009',true, now() - interval '380 days'),
 ('22222222-0009-aaaa-aaaa-000000000002','cajero1-electronica@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Diego Tapia','cashier','11111111-aaaa-aaaa-aaaa-000000000009',true, now() - interval '330 days'),
 ('22222222-0009-aaaa-aaaa-000000000003','cajero2-electronica@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Brenda Salgado','manager','11111111-aaaa-aaaa-aaaa-000000000009',true, now() - interval '210 days'),
 -- Fitness
 ('22222222-0010-aaaa-aaaa-000000000001','demo-fitness@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Coach Alex Rivera (Owner)','admin','11111111-aaaa-aaaa-aaaa-000000000010',true, now() - interval '230 days'),
 ('22222222-0010-aaaa-aaaa-000000000002','cajero1-fitness@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Recepción Mañana','cashier','11111111-aaaa-aaaa-aaaa-000000000010',true, now() - interval '180 days'),
 ('22222222-0010-aaaa-aaaa-000000000003','cajero2-fitness@volvix.test','$2a$10$9V8K2vG3qPzN5xHj7eFwKO6sR4tYbXnLmQpZcUaWdHv8jNiK0lPmO','Recepción Tarde','manager','11111111-aaaa-aaaa-aaaa-000000000010',true, now() - interval '160 days')
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      company_id = EXCLUDED.company_id,
      is_active = EXCLUDED.is_active;

-- ── Link tenant.owner_user_id back to owners (idempotent) ──
UPDATE pos_companies SET owner_user_id = '22222222-0001-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000001' AND owner_user_id IS DISTINCT FROM '22222222-0001-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0002-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000002' AND owner_user_id IS DISTINCT FROM '22222222-0002-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0003-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000003' AND owner_user_id IS DISTINCT FROM '22222222-0003-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0004-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000004' AND owner_user_id IS DISTINCT FROM '22222222-0004-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0005-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000005' AND owner_user_id IS DISTINCT FROM '22222222-0005-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0006-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000006' AND owner_user_id IS DISTINCT FROM '22222222-0006-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0007-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000007' AND owner_user_id IS DISTINCT FROM '22222222-0007-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0008-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000008' AND owner_user_id IS DISTINCT FROM '22222222-0008-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0009-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000009' AND owner_user_id IS DISTINCT FROM '22222222-0009-aaaa-aaaa-000000000001';
UPDATE pos_companies SET owner_user_id = '22222222-0010-aaaa-aaaa-000000000001' WHERE id = '11111111-aaaa-aaaa-aaaa-000000000010' AND owner_user_id IS DISTINCT FROM '22222222-0010-aaaa-aaaa-000000000001';

COMMIT;

-- ============================================================
-- Tenant UUIDs (for reference in per-vertical SQL files)
-- ============================================================
-- Abarrotes  : 11111111-aaaa-aaaa-aaaa-000000000001  | owner 22222222-0001-aaaa-aaaa-000000000001
-- Panaderia  : 11111111-aaaa-aaaa-aaaa-000000000002  | owner 22222222-0002-aaaa-aaaa-000000000001
-- Farmacia   : 11111111-aaaa-aaaa-aaaa-000000000003  | owner 22222222-0003-aaaa-aaaa-000000000001
-- Restaurant : 11111111-aaaa-aaaa-aaaa-000000000004  | owner 22222222-0004-aaaa-aaaa-000000000001
-- Cafe       : 11111111-aaaa-aaaa-aaaa-000000000005  | owner 22222222-0005-aaaa-aaaa-000000000001
-- Barberia   : 11111111-aaaa-aaaa-aaaa-000000000006  | owner 22222222-0006-aaaa-aaaa-000000000001
-- Gasolinera : 11111111-aaaa-aaaa-aaaa-000000000007  | owner 22222222-0007-aaaa-aaaa-000000000001
-- Ropa       : 11111111-aaaa-aaaa-aaaa-000000000008  | owner 22222222-0008-aaaa-aaaa-000000000001
-- Electronica: 11111111-aaaa-aaaa-aaaa-000000000009  | owner 22222222-0009-aaaa-aaaa-000000000001
-- Fitness    : 11111111-aaaa-aaaa-aaaa-000000000010  | owner 22222222-0010-aaaa-aaaa-000000000001
