-- ============================================================
-- CLEANUP — delete all 10 demo industry tenants and cascade data
-- ============================================================
-- WARNING: This permanently removes demo data. Use only in dev/staging.
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- Tenant IDs to wipe
WITH tenant_ids AS (
  SELECT unnest(ARRAY[
    '11111111-aaaa-aaaa-aaaa-000000000001'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000002'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000003'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000004'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000005'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000006'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000007'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000008'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000009'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000010'::uuid
  ]) AS id
),
user_ids AS (
  SELECT id FROM pos_users WHERE company_id IN (SELECT id FROM tenant_ids)
)
SELECT 1;  -- placeholder; actual deletes below

-- Use tmp tables to capture user_ids reproducibly
CREATE TEMP TABLE _demo_tenants AS
  SELECT unnest(ARRAY[
    '11111111-aaaa-aaaa-aaaa-000000000001'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000002'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000003'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000004'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000005'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000006'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000007'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000008'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000009'::uuid,
    '11111111-aaaa-aaaa-aaaa-000000000010'::uuid
  ]) AS id;

CREATE TEMP TABLE _demo_users AS
  SELECT id FROM pos_users WHERE company_id IN (SELECT id FROM _demo_tenants);

-- Optional tables: wrap in DO blocks so missing tables don't break the script.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customer_payments') THEN
    DELETE FROM customer_payments WHERE user_id IN (SELECT id FROM _demo_users);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_inventory_movements') THEN
    DELETE FROM pos_inventory_movements WHERE pos_user_id IN (SELECT id FROM _demo_users);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_cash_cuts') THEN
    DELETE FROM pos_cash_cuts WHERE pos_user_id IN (SELECT id FROM _demo_users);
  END IF;
END $$;

DELETE FROM pos_sales WHERE pos_user_id IN (SELECT id FROM _demo_users);
DELETE FROM customers WHERE user_id IN (SELECT id FROM _demo_users);
DELETE FROM pos_products WHERE pos_user_id IN (SELECT id FROM _demo_users);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='generic_blobs') THEN
    DELETE FROM generic_blobs WHERE user_id IN (SELECT id FROM _demo_users);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_login_events') THEN
    DELETE FROM pos_login_events WHERE pos_user_id IN (SELECT id FROM _demo_users);
  END IF;
END $$;

-- Detach owner_user_id before deleting users
UPDATE pos_companies SET owner_user_id = NULL WHERE id IN (SELECT id FROM _demo_tenants);

DELETE FROM pos_users WHERE id IN (SELECT id FROM _demo_users);
DELETE FROM pos_companies WHERE id IN (SELECT id FROM _demo_tenants);

DROP TABLE _demo_tenants;
DROP TABLE _demo_users;

COMMIT;

-- Verify
SELECT 'companies remaining' AS what, count(*) FROM pos_companies WHERE id::text LIKE '11111111-aaaa-aaaa-aaaa-%';
SELECT 'demo users remaining' AS what, count(*) FROM pos_users WHERE email LIKE 'demo-%@volvix.test' OR email LIKE 'cajero%-%@volvix.test';
