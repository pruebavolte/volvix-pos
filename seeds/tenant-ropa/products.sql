-- Boutique Femenina Andrea — 40 productos con variantes
-- Tenant: 11111111-aaaa-aaaa-aaaa-000000000008
BEGIN;

INSERT INTO pos_products (id, pos_user_id, name, code, price, cost, stock, category, description, created_at)
SELECT seed_uuid('11111111-aaaa-aaaa-aaaa-000000000008', slug),
       '22222222-0008-aaaa-aaaa-000000000001'::uuid,
       name, seed_ean13(slug), price, cost, stock, category, description,
       now() - interval '105 days' + (random() * interval '90 days')
FROM (VALUES
  -- Vestidos casuales
  ('ropa-001','Vestido Casual Floral S','Vestidos',450.00,180.00,8,'Talla S — color rosa — temporada actual'),
  ('ropa-002','Vestido Casual Floral M','Vestidos',450.00,180.00,12,'Talla M — color rosa — temporada actual'),
  ('ropa-003','Vestido Casual Floral L','Vestidos',450.00,180.00,10,'Talla L — color rosa — temporada actual'),
  ('ropa-004','Vestido Casual Negro S','Vestidos',450.00,180.00,6,'Talla S — color negro'),
  ('ropa-005','Vestido Casual Negro M','Vestidos',450.00,180.00,9,'Talla M — color negro'),
  ('ropa-006','Vestido Casual Negro L','Vestidos',450.00,180.00,8,'Talla L — color negro'),
  -- Vestidos elegantes
  ('ropa-007','Vestido Coctel Negro S','Vestidos',850.00,360.00,5,'Talla S — fiesta'),
  ('ropa-008','Vestido Coctel Negro M','Vestidos',850.00,360.00,7,'Talla M — fiesta'),
  ('ropa-009','Vestido Largo Galas L','Vestidos',1200.00,520.00,3,'Talla L — gala'),
  -- Blusas
  ('ropa-010','Blusa Elegante Blanca S','Blusas',380.00,150.00,10,'Talla S — blanco'),
  ('ropa-011','Blusa Elegante Blanca M','Blusas',380.00,150.00,15,'Talla M — blanco'),
  ('ropa-012','Blusa Elegante Blanca L','Blusas',380.00,150.00,12,'Talla L — blanco'),
  ('ropa-013','Blusa Estampada Verano S','Blusas',320.00,130.00,8,'Talla S — estampada — liquidación 30%'),
  ('ropa-014','Blusa Estampada Verano M','Blusas',320.00,130.00,11,'Talla M — liquidación 30%'),
  ('ropa-015','Blusa Manga Larga Beige M','Blusas',420.00,170.00,9,'Talla M — manga larga'),
  -- Pantalones
  ('ropa-016','Pantalón Mezclilla Skinny 26','Pantalones',550.00,220.00,8,'Talla 26'),
  ('ropa-017','Pantalón Mezclilla Skinny 28','Pantalones',550.00,220.00,12,'Talla 28'),
  ('ropa-018','Pantalón Mezclilla Skinny 30','Pantalones',550.00,220.00,14,'Talla 30'),
  ('ropa-019','Pantalón Mezclilla Skinny 32','Pantalones',550.00,220.00,10,'Talla 32'),
  ('ropa-020','Pantalón de Vestir Negro S','Pantalones',680.00,280.00,7,'Talla S — formal'),
  ('ropa-021','Pantalón de Vestir Negro M','Pantalones',680.00,280.00,9,'Talla M — formal'),
  ('ropa-022','Falda Plisada Larga M','Faldas',580.00,240.00,6,'Talla M — plisada'),
  ('ropa-023','Falda Tubo Negra M','Faldas',520.00,210.00,8,'Talla M — clásica'),
  -- Sacos
  ('ropa-024','Saco Blazer Negro M','Sacos',980.00,420.00,5,'Talla M — formal'),
  ('ropa-025','Saco Blazer Beige M','Sacos',980.00,420.00,4,'Talla M — beige'),
  ('ropa-026','Cardigan Tejido S','Sacos',520.00,210.00,6,'Talla S — algodón — liquidación 30%'),
  ('ropa-027','Cardigan Tejido M','Sacos',520.00,210.00,8,'Talla M — algodón — liquidación 30%'),
  -- Calzado
  ('ropa-028','Zapatos Tacón Nude #24','Calzado',890.00,380.00,4,'Tacón medio nude'),
  ('ropa-029','Zapatos Tacón Nude #25','Calzado',890.00,380.00,6,'Tacón medio nude'),
  ('ropa-030','Zapatos Tacón Nude #26','Calzado',890.00,380.00,5,'Tacón medio nude'),
  ('ropa-031','Sandalias Romanas #25','Calzado',520.00,220.00,8,'Bajas plana'),
  ('ropa-032','Botines Cuero #25','Calzado',1450.00,650.00,3,'Cuero genuino'),
  ('ropa-033','Tenis Casuales Blancos #25','Calzado',780.00,340.00,7,'Tenis lifestyle'),
  -- Accesorios
  ('ropa-034','Bolsa Cuero Mediana','Bolsas',1200.00,520.00,5,'Cuero genuino — café'),
  ('ropa-035','Bolsa Cuero Negra','Bolsas',1200.00,520.00,4,'Cuero genuino — negro'),
  ('ropa-036','Bolsa Mano Fiesta','Bolsas',650.00,280.00,8,'Clutch elegante'),
  ('ropa-037','Cinturón Cuero S','Accesorios',280.00,110.00,12,'Talla S — café'),
  ('ropa-038','Cinturón Cuero M','Accesorios',280.00,110.00,15,'Talla M — café'),
  ('ropa-039','Aretes Plata 925','Accesorios',420.00,180.00,18,'Plata pura'),
  ('ropa-040','Collar Cadena Plata','Accesorios',680.00,280.00,9,'Plata 925 con dije')
) AS t(slug, name, category, price, cost, stock, description)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, cost=EXCLUDED.cost, stock=EXCLUDED.stock, category=EXCLUDED.category, description=EXCLUDED.description;

COMMIT;
