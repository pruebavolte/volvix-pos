-- ============================================================
-- FIX-D-2 — Clientes Demo PRO (R12a)
-- ============================================================
-- 10 clientes con nombres mexicanos reales por cada uno de los 6 giros principales.
-- - Phone: +52 55 XXXX-XXXX (10 dígitos formato MX)
-- - Email: nombre.apellido@gmail.com
-- - RFC: 4 letras + 6 dígitos + 3 alfanum (formato persona física)
-- Idempotente: ON CONFLICT (id) DO UPDATE.
-- Reusa schema customers (tenant_id, user_id, name, phone, email, rfc, address, etc.).
-- ============================================================
BEGIN;

-- Helper local: 10 clientes mexicanos canónicos.
-- Cada giro recibe los mismos 10 con prefijos de slug distintos para evitar colisión seed_uuid.
DO $$
DECLARE
  -- (tenant_uuid, owner_uuid, slug_prefix)
  tenants jsonb := '[
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000005","owner":"22222222-0005-aaaa-aaaa-000000000001","prefix":"cafepro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000004","owner":"22222222-0004-aaaa-aaaa-000000000001","prefix":"restpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000001","owner":"22222222-0001-aaaa-aaaa-000000000001","prefix":"abarrpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000003","owner":"22222222-0003-aaaa-aaaa-000000000001","prefix":"farmpro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000008","owner":"22222222-0008-aaaa-aaaa-000000000001","prefix":"ropapro"},
    {"tenant":"11111111-aaaa-aaaa-aaaa-000000000006","owner":"22222222-0006-aaaa-aaaa-000000000001","prefix":"barbpro"}
  ]'::jsonb;
  clients jsonb := '[
    {"name":"María González Hernández",        "phone":"+525512345001","rfc":"GOHM850315ABC","email":"maria.gonzalez@gmail.com"},
    {"name":"José Luis Ramírez Pérez",         "phone":"+525512345002","rfc":"RAPJ820712D45","email":"jose.ramirez@gmail.com"},
    {"name":"Ana Patricia Martínez",            "phone":"+525512345003","rfc":"MAPA900221XY2","email":"ana.martinez@gmail.com"},
    {"name":"Carlos Eduardo López Vargas",      "phone":"+525512345004","rfc":"LOVC780610Q9P","email":"carlos.lopez@gmail.com"},
    {"name":"Lucía Fernández del Río",          "phone":"+525512345005","rfc":"FERL931104B72","email":"lucia.fernandez@gmail.com"},
    {"name":"Roberto Carlos Sánchez",           "phone":"+525512345006","rfc":"SAOR751228KK1","email":"roberto.sanchez@gmail.com"},
    {"name":"Diana Laura Torres",               "phone":"+525512345007","rfc":"TODL880506M30","email":"diana.torres@gmail.com"},
    {"name":"Miguel Ángel Ortiz",               "phone":"+525512345008","rfc":"OIMA800817P11","email":"miguel.ortiz@gmail.com"},
    {"name":"Verónica Castillo Ruiz",           "phone":"+525512345009","rfc":"CARV870423Z21","email":"veronica.castillo@gmail.com"},
    {"name":"Fernando Aguilar Méndez",          "phone":"+525512345010","rfc":"AUMF830129RFC","email":"fernando.aguilar@gmail.com"}
  ]'::jsonb;
  has_tenant_id boolean;
  has_rfc boolean;
  t jsonb;
  c jsonb;
  i int;
  cust_id uuid;
BEGIN
  -- Detect schema flavor (legacy customers vs r4b-hardened).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='customers' AND column_name='tenant_id'
  ) INTO has_tenant_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='customers' AND column_name='rfc'
  ) INTO has_rfc;

  i := 0;
  FOR t IN SELECT * FROM jsonb_array_elements(tenants) LOOP
    FOR c IN SELECT * FROM jsonb_array_elements(clients) LOOP
      i := i + 1;
      cust_id := seed_uuid((t->>'tenant')::uuid, (t->>'prefix') || '-pro-cust-' || (c->>'rfc'));

      IF has_tenant_id AND has_rfc THEN
        INSERT INTO customers (id, tenant_id, user_id, name, phone, email, rfc, address, credit_limit, balance, is_active, created_at)
        VALUES (
          cust_id,
          (t->>'tenant')::uuid,
          (t->>'owner')::uuid,
          c->>'name',
          c->>'phone',
          c->>'email',
          c->>'rfc',
          'Av. Reforma 100, Col. Centro, CDMX',
          0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email,
              rfc = EXCLUDED.rfc;
      ELSIF has_rfc THEN
        INSERT INTO customers (id, user_id, name, phone, email, rfc, address, credit_limit, balance, is_active, created_at)
        VALUES (
          cust_id,
          (t->>'owner')::uuid,
          c->>'name',
          c->>'phone',
          c->>'email',
          c->>'rfc',
          'Av. Reforma 100, Col. Centro, CDMX',
          0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email,
              rfc = EXCLUDED.rfc;
      ELSE
        -- Legacy schema sin rfc — saltar columna
        INSERT INTO customers (id, user_id, name, phone, email, address, credit_limit, balance, is_active, created_at)
        VALUES (
          cust_id,
          (t->>'owner')::uuid,
          c->>'name',
          c->>'phone',
          c->>'email',
          'Av. Reforma 100, Col. Centro, CDMX',
          0, 0, true,
          now() - (random() * interval '90 days')
        )
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'FIX-D-2: % clientes demo PRO insertados/actualizados (6 giros x 10).', i;
END $$;

COMMIT;
