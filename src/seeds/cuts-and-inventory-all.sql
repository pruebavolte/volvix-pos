-- ============================================================
-- ALL TENANTS — Cash cuts + Inventory movements (last 30 days)
-- ============================================================
-- Generates daily apertura/cierre, with realistic discrepancies.
-- Idempotent: deterministic UUIDs per (tenant, day, type).
-- Tables expected: pos_cash_cuts, pos_inventory_movements, customer_payments.
-- If any of those don't exist, ignore silently (graceful fallback).
-- ============================================================
BEGIN;

-- ── CASH CUTS ──
DO $$
DECLARE
  owners uuid[] := ARRAY[
    '22222222-0001-aaaa-aaaa-000000000001'::uuid,
    '22222222-0002-aaaa-aaaa-000000000001'::uuid,
    '22222222-0003-aaaa-aaaa-000000000001'::uuid,
    '22222222-0004-aaaa-aaaa-000000000001'::uuid,
    '22222222-0005-aaaa-aaaa-000000000001'::uuid,
    '22222222-0006-aaaa-aaaa-000000000001'::uuid,
    '22222222-0007-aaaa-aaaa-000000000001'::uuid,
    '22222222-0008-aaaa-aaaa-000000000001'::uuid,
    '22222222-0009-aaaa-aaaa-000000000001'::uuid,
    '22222222-0010-aaaa-aaaa-000000000001'::uuid
  ];
  prefixes text[] := ARRAY['abarr','pan','farm','rest','cafe','barb','gas','ropa','elec','fit'];
  o uuid;
  p text;
  d int;
  i int;
  open_amount numeric;
  expected numeric;
  actual numeric;
  variance numeric;
  cut_id uuid;
BEGIN
  -- Skip silently if table doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_cash_cuts') THEN
    RAISE NOTICE 'pos_cash_cuts table not found — skipping cash cuts seed';
    RETURN;
  END IF;

  FOR i IN 1..array_length(owners, 1) LOOP
    o := owners[i];
    p := prefixes[i];
    FOR d IN 0..29 LOOP
      open_amount := 500 + (random() * 1000)::int;
      -- expected = sum of efectivo sales that day for this owner
      SELECT COALESCE(SUM(total), 0) INTO expected
      FROM pos_sales
      WHERE pos_user_id = o
        AND payment_method = 'efectivo'
        AND created_at::date = (current_date - d);
      -- variance: most days small (-50..+50), one day big (~150)
      IF d = 7 THEN
        variance := -150;
      ELSIF random() < 0.3 THEN
        variance := (random() * 100 - 50)::numeric(10,2);
      ELSE
        variance := 0;
      END IF;
      actual := expected + variance;
      cut_id := seed_uuid(o, p || '-cut-' || d);

      BEGIN
        INSERT INTO pos_cash_cuts (id, pos_user_id, opened_at, closed_at, opening_amount, expected_amount, actual_amount, variance, status, created_at)
        VALUES (
          cut_id, o,
          (current_date - d)::timestamptz + interval '8 hours',
          (current_date - d)::timestamptz + interval '21 hours',
          open_amount, expected + open_amount, actual + open_amount, variance,
          'closed',
          (current_date - d)::timestamptz + interval '21 hours'
        )
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN undefined_column THEN
        -- Schema variation: try minimal insert
        BEGIN
          INSERT INTO pos_cash_cuts (id, pos_user_id, total, created_at)
          VALUES (cut_id, o, actual + open_amount, (current_date - d)::timestamptz + interval '21 hours')
          ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END;
    END LOOP;
  END LOOP;
END $$;

-- ── INVENTORY MOVEMENTS ──
DO $$
DECLARE
  owners uuid[] := ARRAY[
    '22222222-0001-aaaa-aaaa-000000000001'::uuid,
    '22222222-0002-aaaa-aaaa-000000000001'::uuid,
    '22222222-0003-aaaa-aaaa-000000000001'::uuid,
    '22222222-0007-aaaa-aaaa-000000000001'::uuid,
    '22222222-0008-aaaa-aaaa-000000000001'::uuid,
    '22222222-0009-aaaa-aaaa-000000000001'::uuid,
    '22222222-0010-aaaa-aaaa-000000000001'::uuid
  ];
  prefixes text[] := ARRAY['abarr','pan','farm','gas','ropa','elec','fit'];
  o uuid; p text; d int; i int; mv_id uuid; prod_id uuid; mov_type text; qty int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_inventory_movements') THEN
    RAISE NOTICE 'pos_inventory_movements not found — skipping inventory seed';
    RETURN;
  END IF;
  FOR i IN 1..array_length(owners, 1) LOOP
    o := owners[i]; p := prefixes[i];
    -- 10 entradas (one every ~3 days)
    FOR d IN 0..9 LOOP
      mv_id := seed_uuid(o, p || '-mvin-' || d);
      prod_id := (SELECT id FROM pos_products WHERE pos_user_id = o ORDER BY name LIMIT 1 OFFSET (d % 20));
      IF prod_id IS NULL THEN CONTINUE; END IF;
      qty := 20 + (random() * 80)::int;
      BEGIN
        INSERT INTO pos_inventory_movements (id, pos_user_id, product_id, movement_type, quantity, notes, created_at)
        VALUES (mv_id, o, prod_id, 'entrada', qty, 'Compra a proveedor — seed', (current_date - d*3)::timestamptz + interval '9 hours')
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
    -- 3 ajustes (counts físicos)
    FOR d IN 0..2 LOOP
      mv_id := seed_uuid(o, p || '-adj-' || d);
      prod_id := (SELECT id FROM pos_products WHERE pos_user_id = o ORDER BY name LIMIT 1 OFFSET (d * 5 + 3));
      IF prod_id IS NULL THEN CONTINUE; END IF;
      qty := -((random() * 5)::int + 1);  -- ajuste negativo (mermas)
      BEGIN
        INSERT INTO pos_inventory_movements (id, pos_user_id, product_id, movement_type, quantity, notes, created_at)
        VALUES (mv_id, o, prod_id, 'ajuste', qty, 'Ajuste por conteo físico', (current_date - d*7)::timestamptz + interval '14 hours')
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;

-- ── CUSTOMER PAYMENTS (abonos) for credit industries: abarrotes + farmacia ──
DO $$
DECLARE
  owners uuid[] := ARRAY[
    '22222222-0001-aaaa-aaaa-000000000001'::uuid,
    '22222222-0003-aaaa-aaaa-000000000001'::uuid
  ];
  prefixes text[] := ARRAY['abarr','farm'];
  o uuid; p text; i int; c int; pay_id uuid; cust_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_payments') THEN
    RAISE NOTICE 'customer_payments not found — skipping payments seed';
    RETURN;
  END IF;
  FOR i IN 1..array_length(owners, 1) LOOP
    o := owners[i]; p := prefixes[i];
    -- 6 customers with 4 weekly abonos each
    FOR c IN 1..6 LOOP
      cust_id := seed_uuid((SELECT company_id FROM pos_users WHERE id = o), p || '-cust-' || c);
      IF NOT EXISTS (SELECT 1 FROM customers WHERE id = cust_id) THEN CONTINUE; END IF;
      FOR i IN 1..4 LOOP
        pay_id := seed_uuid(o, p || '-pay-c' || c || '-w' || i);
        BEGIN
          INSERT INTO customer_payments (id, customer_id, user_id, amount, payment_method, notes, created_at)
          VALUES (pay_id, cust_id, o, (200 + random()*300)::numeric(10,2), 'efectivo', 'Abono semanal', (current_date - (i*7))::timestamptz + interval '11 hours')
          ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
