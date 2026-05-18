-- ============================================================
-- ALL TENANTS — Customers (20-50 per tenant)
-- ============================================================
-- Generates realistic Mexican customers for each demo tenant.
-- Idempotent: uses seed_uuid for stable IDs.
-- ============================================================
BEGIN;

DO $$
DECLARE
  tenants jsonb := '[
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000001","owner":"22222222-0001-aaaa-aaaa-000000000001","prefix":"abarr","count":40,"with_credit":true},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000002","owner":"22222222-0002-aaaa-aaaa-000000000001","prefix":"pan","count":35,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000003","owner":"22222222-0003-aaaa-aaaa-000000000001","prefix":"farm","count":50,"with_credit":true},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000004","owner":"22222222-0004-aaaa-aaaa-000000000001","prefix":"rest","count":40,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000005","owner":"22222222-0005-aaaa-aaaa-000000000001","prefix":"cafe","count":45,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000006","owner":"22222222-0006-aaaa-aaaa-000000000001","prefix":"barb","count":30,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000007","owner":"22222222-0007-aaaa-aaaa-000000000001","prefix":"gas","count":25,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000008","owner":"22222222-0008-aaaa-aaaa-000000000001","prefix":"ropa","count":35,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000009","owner":"22222222-0009-aaaa-aaaa-000000000001","prefix":"elec","count":30,"with_credit":false},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000010","owner":"22222222-0010-aaaa-aaaa-000000000001","prefix":"fit","count":50,"with_credit":false}
  ]'::jsonb;
  first_names text[] := ARRAY[
    'José','María','Juan','Guadalupe','Francisco','Ana','Luis','Margarita','Pedro','Patricia',
    'Carlos','Rosa','Jorge','Laura','Miguel','Elena','Roberto','Carmen','Alejandro','Sofía',
    'Fernando','Beatriz','Ricardo','Verónica','Eduardo','Mónica','Daniel','Adriana','Manuel','Lorena',
    'Sergio','Claudia','Antonio','Gabriela','Raúl','Diana','Hugo','Norma','Arturo','Leticia',
    'Javier','Silvia','Rafael','Andrea','Enrique','Yolanda','Héctor','Brenda','Ramón','Karla'
  ];
  last_names text[] := ARRAY[
    'García','Hernández','Martínez','López','González','Rodríguez','Pérez','Sánchez','Ramírez','Torres',
    'Flores','Rivera','Gómez','Díaz','Reyes','Cruz','Morales','Ortiz','Gutiérrez','Chávez',
    'Ramos','Ruiz','Aguilar','Mendoza','Castillo','Jiménez','Vargas','Romero','Herrera','Medina',
    'Castro','Álvarez','Vázquez','Moreno','Domínguez','Salazar','Núñez','Cabrera','Salinas','Téllez'
  ];
  cities text[] := ARRAY['CDMX','GDL','MTY','Puebla','Querétaro','Toluca','León','Mérida','Tijuana','Cancún'];
  t jsonb;
  i int;
  fn text; ln1 text; ln2 text;
  city text;
  cust_id uuid;
  credit numeric;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(tenants) LOOP
    FOR i IN 1..(t->>'count')::int LOOP
      fn := first_names[1 + (random() * (array_length(first_names,1) - 1))::int];
      ln1 := last_names[1 + (random() * (array_length(last_names,1) - 1))::int];
      ln2 := last_names[1 + (random() * (array_length(last_names,1) - 1))::int];
      city := cities[1 + (random() * (array_length(cities,1) - 1))::int];
      cust_id := seed_uuid((t->>'tenant')::uuid, (t->>'prefix') || '-cust-' || i);

      IF (t->>'with_credit')::boolean AND i <= 10 THEN
        credit := (random() * 4 + 1)::int * 500;  -- 500-2500 MXN credit
      ELSE
        credit := 0;
      END IF;

      INSERT INTO customers (id, user_id, name, phone, email, address, credit_limit, balance, is_active, created_at)
      VALUES (
        cust_id,
        (t->>'owner')::uuid,
        fn || ' ' || ln1 || ' ' || ln2,
        '+52' || (5500000000 + (random() * 99999999)::bigint)::text,
        lower(replace(fn, ' ', '')) || '.' || lower(ln1) || (1900 + i)::text || '@email.demo',
        'Calle ' || (i*7)::text || ' #' || (100 + i)::text || ', ' || city,
        credit,
        CASE WHEN credit > 0 AND random() < 0.5 THEN (random() * credit * 0.6)::numeric(10,2) ELSE 0 END,
        true,
        now() - (random() * interval '180 days')
      )
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
            address = EXCLUDED.address, credit_limit = EXCLUDED.credit_limit;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
