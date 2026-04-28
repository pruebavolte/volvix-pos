-- ============================================================================
-- VOLVIX POS — Customer Payments / Abonos
-- Migration: customer-payments.sql
-- ----------------------------------------------------------------------------
-- Tables:
--   customer_payments    (each abono/payment from a customer)
-- Side-effects:
--   ALTER customers add column balance NUMERIC (if missing)
--   Trigger: on INSERT decrement balance; on void restore.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Customer payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  customer_id   UUID NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        TEXT CHECK (method IN ('efectivo','tarjeta','transferencia','cheque','otro')),
  payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  reference     TEXT,
  notes         TEXT,
  receipt_id    UUID,
  cut_id        UUID,
  created_by    UUID,
  voided_at     TIMESTAMPTZ,
  voided_by     UUID,
  void_reason   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custpay_tenant   ON customer_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custpay_customer ON customer_payments(tenant_id, customer_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_custpay_date     ON customer_payments(tenant_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_custpay_method   ON customer_payments(tenant_id, method);
CREATE INDEX IF NOT EXISTS idx_custpay_active   ON customer_payments(tenant_id) WHERE voided_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Add balance column to customers if missing
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'customers' AND column_name = 'balance'
    ) THEN
      ALTER TABLE customers ADD COLUMN balance NUMERIC(12,2) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'customers' AND column_name = 'credit_limit'
    ) THEN
      ALTER TABLE customers ADD COLUMN credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0;
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger: keep customers.balance in sync
--    INSERT  → balance := balance - amount
--    UPDATE void (voided_at goes from NULL to NOT NULL) → balance += amount
--    UPDATE un-void (NOT NULL → NULL)                   → balance -= amount
--    DELETE active row → balance += amount (rollback)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_customer_payment() RETURNS TRIGGER AS $$
DECLARE
  v_has_customers BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'customers'
  ) INTO v_has_customers;
  IF NOT v_has_customers THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NULL THEN
      EXECUTE format('UPDATE customers SET balance = COALESCE(balance,0) - %s WHERE id = %L',
                     NEW.amount, NEW.customer_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- void event
    IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
      EXECUTE format('UPDATE customers SET balance = COALESCE(balance,0) + %s WHERE id = %L',
                     OLD.amount, OLD.customer_id);
    -- un-void event
    ELSIF OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN
      EXECUTE format('UPDATE customers SET balance = COALESCE(balance,0) - %s WHERE id = %L',
                     NEW.amount, NEW.customer_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.voided_at IS NULL THEN
      EXECUTE format('UPDATE customers SET balance = COALESCE(balance,0) + %s WHERE id = %L',
                     OLD.amount, OLD.customer_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_customer_payment ON customer_payments;
CREATE TRIGGER trg_apply_customer_payment
  AFTER INSERT OR UPDATE OR DELETE ON customer_payments
  FOR EACH ROW EXECUTE FUNCTION apply_customer_payment();

-- ---------------------------------------------------------------------------
-- 4. Audit log (best-effort)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION custpay_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'volvix_audit_log') THEN
    EXECUTE format(
      'INSERT INTO volvix_audit_log (tenant_id, entity, entity_id, action, actor_id, payload, created_at)
         VALUES (%L,%L,%L,%L,%L,%L::jsonb, now())',
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      'customer_payments',
      COALESCE(NEW.id, OLD.id),
      TG_OP,
      COALESCE(NEW.created_by, OLD.created_by, NEW.voided_by, OLD.voided_by),
      to_jsonb(COALESCE(NEW, OLD))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custpay_audit ON customer_payments;
CREATE TRIGGER trg_custpay_audit
  AFTER INSERT OR UPDATE OR DELETE ON customer_payments
  FOR EACH ROW EXECUTE FUNCTION custpay_audit_trigger();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custpay_iso_read"  ON customer_payments;
DROP POLICY IF EXISTS "custpay_iso_write" ON customer_payments;
CREATE POLICY "custpay_iso_read" ON customer_payments
  FOR SELECT USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
  );
CREATE POLICY "custpay_iso_write" ON customer_payments
  FOR ALL USING (
    tenant_id::text = COALESCE((auth.jwt() ->> 'tenant_id'), '')
    AND COALESCE((auth.jwt() ->> 'role'), '') IN
        ('superadmin','owner','admin','manager','cajero','contador')
  );

COMMIT;
