-- R19 FIX: R14_VERTICAL_TEMPLATES.sql
-- Original error: relation "companies" does not exist
-- Fix: crear companies stub (R19_PREFLIGHT) y products como tabla disponible.

CREATE TABLE IF NOT EXISTS vertical_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical    text NOT NULL,
  name        text NOT NULL,
  sku         text,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  stock       int NOT NULL DEFAULT 0,
  barcode     text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vertical_templates_vertical ON vertical_templates(vertical);

-- companies ya creada en R19_PREFLIGHT
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS vertical text,
  ADD COLUMN IF NOT EXISTS branding jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_config jsonb;

TRUNCATE vertical_templates;

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('farmacia','Paracetamol 500mg 20 tabs','FAR-001',35,50),
  ('farmacia','Ibuprofeno 400mg 10 tabs','FAR-002',42,40),
  ('farmacia','Alcohol 70% 250ml','FAR-003',28,30),
  ('farmacia','Cubrebocas KN95 (pack 5)','FAR-004',60,20),
  ('farmacia','Vitamina C 1g 30 tabs','FAR-005',95,25),
  ('farmacia','Naproxeno 250mg 30 tabs','FAR-006',85,30),
  ('farmacia','Loratadina 10mg 20 tabs','FAR-007',55,25);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('restaurante','Refresco 600ml','RES-001',25,100),
  ('restaurante','Hamburguesa clasica','RES-002',95,0),
  ('restaurante','Orden de papas','RES-003',45,0),
  ('restaurante','Agua natural 600ml','RES-004',18,80),
  ('restaurante','Cerveza 355ml','RES-005',40,60),
  ('restaurante','Ensalada cesar','RES-006',120,0),
  ('restaurante','Postre del dia','RES-007',65,0);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('gym','Mensualidad estandar','GYM-001',599,0),
  ('gym','Inscripcion','GYM-002',300,0),
  ('gym','Proteina whey 1kg','GYM-003',750,15),
  ('gym','Botella shaker','GYM-004',120,25),
  ('gym','Pase diario','GYM-005',80,0),
  ('gym','Membresia anual','GYM-006',5990,0);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('salon','Corte de cabello dama','SAL-001',250,0),
  ('salon','Corte caballero','SAL-002',150,0),
  ('salon','Tinte completo','SAL-003',650,0),
  ('salon','Manicure','SAL-004',180,0),
  ('salon','Shampoo profesional 500ml','SAL-005',320,12),
  ('salon','Pedicure','SAL-006',220,0);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('ferreteria','Martillo 16oz','FER-001',180,20),
  ('ferreteria','Desarmador plano 6"','FER-002',75,30),
  ('ferreteria','Cinta de aislar negra','FER-003',28,100),
  ('ferreteria','Tornillos 1/2" (100pz)','FER-004',95,40),
  ('ferreteria','Pintura blanca 1 galon','FER-005',480,15),
  ('ferreteria','Cable calibre 12 (m)','FER-006',22,200);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('papeleria','Cuaderno profesional 100h','PAP-001',65,50),
  ('papeleria','Boligrafo azul (paq 4)','PAP-002',35,80),
  ('papeleria','Lapiz #2 (paq 12)','PAP-003',45,60),
  ('papeleria','Hojas blancas carta (100)','PAP-004',90,40),
  ('papeleria','Tijeras escolares','PAP-005',55,35),
  ('papeleria','Pegamento blanco 250ml','PAP-006',48,30);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('abarrotes','Refresco 2L','ABA-001',38,80),
  ('abarrotes','Pan de caja grande','ABA-002',52,25),
  ('abarrotes','Leche 1L','ABA-003',28,60),
  ('abarrotes','Huevo (kg)','ABA-004',60,30),
  ('abarrotes','Frijol negro 1kg','ABA-005',45,40),
  ('abarrotes','Arroz blanco 1kg','ABA-006',38,50),
  ('abarrotes','Aceite vegetal 1L','ABA-007',55,30);

INSERT INTO vertical_templates (vertical, name, sku, price, stock) VALUES
  ('cafeteria','Espresso sencillo','CAF-001',35,0),
  ('cafeteria','Capuchino','CAF-002',55,0),
  ('cafeteria','Latte','CAF-003',60,0),
  ('cafeteria','Croissant','CAF-004',45,0),
  ('cafeteria','Te helado','CAF-005',40,0),
  ('cafeteria','Sandwich jamon y queso','CAF-006',75,0);

CREATE OR REPLACE FUNCTION seed_vertical_for_tenant(p_vertical text, p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO products (name, sku, price, stock, barcode, tenant_id)
  SELECT name, sku, price, stock, barcode, p_tenant
  FROM vertical_templates
  WHERE vertical = p_vertical;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
