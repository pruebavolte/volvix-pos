-- TecnoMundo — 35 productos electrónica con specs
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000009
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000009', slug),
       '22222222-0009-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '350 days' + (random() * interval '300 days')
FROM (VALUES
  -- Smartphones (con serial + warranty)
  ('elec-001','iPhone 14 128GB Negro','Smartphones',18999.00,15500.00,5,'Serial: AP14-001 — Garantía 12m — Apple'),
  ('elec-002','iPhone 14 128GB Blanco','Smartphones',18999.00,15500.00,4,'Serial: AP14-002 — Garantía 12m'),
  ('elec-003','iPhone 14 256GB Negro','Smartphones',21499.00,17500.00,3,'Serial: AP14-003 — Garantía 12m'),
  ('elec-004','iPhone 13 128GB','Smartphones',15999.00,13000.00,6,'Serial: AP13-XX — Garantía 12m'),
  ('elec-005','Samsung Galaxy A54 128GB','Smartphones',8499.00,6800.00,10,'Serial: SM-A54-XX — Garantía 12m'),
  ('elec-006','Samsung Galaxy S23','Smartphones',16999.00,14000.00,4,'Serial: SM-S23-XX — Garantía 12m'),
  ('elec-007','Xiaomi Redmi Note 12','Smartphones',5999.00,4800.00,12,'Serial: XR12-XX — Garantía 12m'),
  ('elec-008','Motorola Moto G54','Smartphones',4799.00,3800.00,15,'Serial: MTG54-XX — Garantía 12m'),
  -- Audio
  ('elec-009','AirPods 2da Gen','Audio',3799.00,3000.00,8,'Apple — Garantía 12m'),
  ('elec-010','AirPods Pro 2','Audio',6499.00,5300.00,5,'Apple — Cancelación ruido — Gar 12m'),
  ('elec-011','Audífonos Sony WH-1000XM4','Audio',6799.00,5500.00,4,'Bluetooth — noise cancel'),
  ('elec-012','Bocina JBL Charge 5','Audio',3499.00,2700.00,8,'Portátil resistente agua'),
  ('elec-013','Bocina JBL Flip 6','Audio',2499.00,1900.00,12,'Portátil compacta'),
  -- Wearables
  ('elec-014','Apple Watch SE','Wearables',5999.00,4900.00,5,'40mm — Garantía 12m'),
  ('elec-015','Galaxy Watch 5','Wearables',4799.00,3900.00,6,'40mm — Garantía 12m'),
  ('elec-016','Mi Band 7','Wearables',999.00,750.00,20,'Pulsera fitness'),
  -- TVs
  ('elec-017','TV Samsung 55" 4K Crystal','Televisores',14999.00,12000.00,3,'UHD — Smart TV — Gar 24m'),
  ('elec-018','TV LG 50" 4K NanoCell','Televisores',13499.00,10800.00,4,'UHD — webOS — Gar 24m'),
  ('elec-019','TV Sony 65" Bravia','Televisores',24999.00,20000.00,2,'4K HDR — Android TV — Gar 24m'),
  ('elec-020','TV Hisense 43" 4K','Televisores',8499.00,6800.00,6,'UHD — Smart — Gar 12m'),
  -- Computación
  ('elec-021','Laptop HP 15-fc 8GB/512SSD','Laptops',16999.00,13800.00,4,'AMD Ryzen 5 — Gar 12m'),
  ('elec-022','Laptop Lenovo IdeaPad i5','Laptops',18999.00,15500.00,3,'i5 12va — 16GB — Gar 12m'),
  ('elec-023','MacBook Air M2','Laptops',32999.00,28000.00,2,'8GB/256GB — Gar 12m'),
  ('elec-024','iPad 10ma Gen 64GB','Tablets',11999.00,9800.00,4,'WiFi — Gar 12m'),
  ('elec-025','Tablet Samsung Tab A8','Tablets',5499.00,4300.00,6,'10.5" — Gar 12m'),
  -- Periféricos
  ('elec-026','Mouse Logitech MX Master 3','Periféricos',1999.00,1500.00,10,'Inalámbrico premium'),
  ('elec-027','Mouse Inalámbrico Genérico','Periféricos',450.00,250.00,30,'USB-A receptor'),
  ('elec-028','Teclado Mecánico HyperX','Periféricos',2299.00,1800.00,8,'RGB — switches red'),
  ('elec-029','Teclado Logitech K380','Periféricos',999.00,720.00,15,'Bluetooth multi-device'),
  -- Cargadores y accesorios
  ('elec-030','Cargador USB-C 20W Apple','Accesorios',299.00,180.00,40,'Original Apple'),
  ('elec-031','Cargador Inalámbrico 15W','Accesorios',599.00,380.00,20,'Qi compatible'),
  ('elec-032','Cable Lightning 1m','Accesorios',249.00,150.00,50,'MFi certificado'),
  ('elec-033','Cable USB-C a USB-C 1m','Accesorios',199.00,120.00,60,'PD compatible'),
  ('elec-034','Power Bank Anker 10000mAh','Accesorios',699.00,450.00,18,'Carga rápida'),
  ('elec-035','Memoria USB 64GB SanDisk','Accesorios',299.00,180.00,30,'USB 3.0')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
