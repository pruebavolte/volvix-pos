-- FitZone Gym — 10 membresías + 20 productos = 30 items
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000010
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000010', slug),
       '22222222-0010-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '210 days' + (random() * interval '180 days')
FROM (VALUES
  -- Membresías
  ('fit-001','Membresía Semanal','Membresías',250.00,0.00,9999,'7 días acceso ilimitado'),
  ('fit-002','Membresía Quincenal','Membresías',450.00,0.00,9999,'15 días acceso ilimitado'),
  ('fit-003','Membresía Mensual','Membresías',800.00,0.00,9999,'30 días acceso ilimitado — más popular'),
  ('fit-004','Membresía Mensual Pareja','Membresías',1400.00,0.00,9999,'30 días para 2 personas'),
  ('fit-005','Membresía Trimestral','Membresías',2200.00,0.00,9999,'90 días — descuento 8%'),
  ('fit-006','Membresía Semestral','Membresías',4200.00,0.00,9999,'180 días — descuento 12%'),
  ('fit-007','Membresía Anual','Membresías',7500.00,0.00,9999,'365 días — descuento 22%'),
  ('fit-008','Membresía Estudiante','Membresías',650.00,0.00,9999,'Mensual con credencial vigente'),
  ('fit-009','Membresía Senior 60+','Membresías',600.00,0.00,9999,'Mensual adulto mayor'),
  ('fit-010','Pase Día','Membresías',80.00,0.00,9999,'Acceso por 1 día'),
  -- Suplementos
  ('fit-011','Proteína Whey 2kg Vainilla','Suplementos',1400.00,950.00,12,'Hydroxy Pro — sabor vainilla'),
  ('fit-012','Proteína Whey 2kg Chocolate','Suplementos',1400.00,950.00,15,'Hydroxy Pro — chocolate'),
  ('fit-013','Proteína Whey 1kg Fresa','Suplementos',780.00,510.00,10,'Hydroxy Pro — fresa'),
  ('fit-014','Creatina Monohidratada 250g','Suplementos',450.00,290.00,18,'Sin sabor — pura'),
  ('fit-015','BCAA Polvo 300g','Suplementos',650.00,420.00,8,'Sabor frutal'),
  ('fit-016','Pre-Workout 200g','Suplementos',850.00,560.00,10,'Sabor sandía'),
  ('fit-017','Glutamina 300g','Suplementos',520.00,340.00,8,'Sin sabor'),
  ('fit-018','Multivitamínico 60c','Suplementos',380.00,240.00,15,'Para deportistas'),
  ('fit-019','Barras Proteicas (caja 12)','Suplementos',420.00,260.00,10,'Quest Bar — sabores varios'),
  -- Accesorios
  ('fit-020','Shaker Premium 600ml','Accesorios',250.00,140.00,25,'Con compartimentos'),
  ('fit-021','Shaker Básico 500ml','Accesorios',150.00,80.00,30,'Botella simple'),
  ('fit-022','Toalla Gym Microfibra','Accesorios',180.00,90.00,20,'Absorción rápida'),
  ('fit-023','Camiseta Gym FitZone Hombre M','Accesorios',350.00,180.00,15,'Talla M — algodón dry-fit'),
  ('fit-024','Camiseta Gym FitZone Hombre L','Accesorios',350.00,180.00,18,'Talla L — algodón dry-fit'),
  ('fit-025','Camiseta Gym FitZone Mujer S','Accesorios',350.00,180.00,12,'Talla S — algodón dry-fit'),
  ('fit-026','Cinturón Levantamiento','Accesorios',520.00,280.00,8,'Cuero — talla M/L'),
  ('fit-027','Guantes Gym','Accesorios',280.00,150.00,20,'Cuero sintético'),
  ('fit-028','Banda Resistencia Set','Accesorios',420.00,250.00,15,'5 bandas + accesorios'),
  ('fit-029','Cuerda para Saltar','Accesorios',250.00,130.00,18,'Velocidad — speed rope'),
  ('fit-030','Botella Térmica 750ml','Accesorios',320.00,180.00,22,'Acero inoxidable')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
