-- =============================================================
-- R22 SECURITY HARDENING (anti-fraude / race conditions)
-- =============================================================
-- Fix 1 — idempotency_keys
-- Fix 2 — version columns (optimistic locking)
-- Fix 3 — decrement_stock_atomic RPC
-- Fix 6 — request_nonces (anti-replay)
-- =============================================================

-- ---------- FIX 1: IDEMPOTENCY KEYS ----------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key            text PRIMARY KEY,
  user_id        text,
  endpoint       text NOT NULL,
  response_body  jsonb,
  status_code    int NOT NULL DEFAULT 200,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idem_user ON idempotency_keys(user_id);

-- ---------- FIX 2: OPTIMISTIC LOCKING ----------
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE pos_sales    ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE customers    ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

-- Bump version on UPDATE automáticamente
CREATE OR REPLACE FUNCTION bump_version_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.version IS NOT DISTINCT FROM NEW.version THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_products_version ON pos_products;
CREATE TRIGGER trg_pos_products_version BEFORE UPDATE ON pos_products
  FOR EACH ROW EXECUTE FUNCTION bump_version_trigger();

DROP TRIGGER IF EXISTS trg_pos_sales_version ON pos_sales;
CREATE TRIGGER trg_pos_sales_version BEFORE UPDATE ON pos_sales
  FOR EACH ROW EXECUTE FUNCTION bump_version_trigger();

DROP TRIGGER IF EXISTS trg_customers_version ON customers;
CREATE TRIGGER trg_customers_version BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION bump_version_trigger();

-- ---------- FIX 3: STOCK ATÓMICO ----------
-- items: jsonb array [{id: uuid, qty: int}, ...]
-- Devuelve: array of {id, ok, stock_after, requested}
CREATE OR REPLACE FUNCTION decrement_stock_atomic(items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  it          jsonb;
  pid         uuid;
  qty         int;
  new_stock   int;
  result      jsonb := '[]'::jsonb;
BEGIN
  -- Pre-validar todo en una transacción; si UN item falla, revertir.
  FOR it IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    pid := (it->>'id')::uuid;
    qty := COALESCE((it->>'qty')::int, 0);
    IF qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty:%', pid;
    END IF;
    UPDATE pos_products
       SET stock = stock - qty
     WHERE id = pid AND stock >= qty
     RETURNING stock INTO new_stock;
    IF new_stock IS NULL THEN
      RAISE EXCEPTION 'stock_insuficiente:%', pid;
    END IF;
    result := result || jsonb_build_object('id', pid, 'ok', true, 'stock_after', new_stock, 'requested', qty);
  END LOOP;
  RETURN result;
END;
$$;

-- ---------- FIX 6: REQUEST NONCES (anti-replay) ----------
CREATE TABLE IF NOT EXISTS request_nonces (
  nonce      text PRIMARY KEY,
  endpoint   text NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS idx_nonces_expires ON request_nonces(expires_at);

-- Cleanup helper (opcional, se puede llamar desde cron)
CREATE OR REPLACE FUNCTION cleanup_expired_security_records() RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < now();
  DELETE FROM request_nonces   WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
