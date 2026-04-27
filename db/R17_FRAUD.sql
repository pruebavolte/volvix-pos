-- =============================================================
-- R17 — ANTI-FRAUD RULES ENGINE
-- =============================================================
-- Tablas para motor de reglas anti-fraude + alertas
-- =============================================================

-- Tabla de reglas configurables
CREATE TABLE IF NOT EXISTS fraud_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NULL,
  name         text NOT NULL,
  description  text,
  condition    jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight       integer NOT NULL DEFAULT 10 CHECK (weight BETWEEN 0 AND 100),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_rules_active ON fraud_rules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_fraud_rules_tenant ON fraud_rules(tenant_id);

-- Tabla de alertas generadas
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NULL,
  sale_id          uuid NOT NULL,
  customer_id      uuid NULL,
  score            integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  triggered_rules  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      uuid NULL,
  reviewed_at      timestamptz NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status   ON fraud_alerts(status);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_sale     ON fraud_alerts(sale_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_tenant   ON fraud_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created  ON fraud_alerts(created_at DESC);

-- Marcar columna fraud_review en pos_sales (idempotente)
ALTER TABLE IF EXISTS pos_sales
  ADD COLUMN IF NOT EXISTS fraud_review boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS pos_sales
  ADD COLUMN IF NOT EXISTS fraud_score  integer NULL;

-- Reglas seed por defecto
INSERT INTO fraud_rules (name, description, condition, weight, active) VALUES
  ('high_amount',        'Total > $10,000',                          '{"type":"amount_gt","value":10000}'::jsonb,        25, true),
  ('velocity_customer',  '>5 ventas mismo cliente en 1h',            '{"type":"velocity","window":3600,"max":5}'::jsonb,  25, true),
  ('card_test_pattern',  'Múltiples montos pequeños (card testing)', '{"type":"card_test","threshold":5,"max_amount":100}'::jsonb, 30, true),
  ('geo_mismatch',       'IP geo no coincide con address customer',  '{"type":"geo_mismatch"}'::jsonb,                  20, true),
  ('new_high_amount',    'Cliente nuevo + monto alto',               '{"type":"new_customer_high","amount":2000}'::jsonb, 20, true),
  ('refund_frequency',   'Tasa devoluciones alta',                   '{"type":"refund_freq","window":86400,"max":3}'::jsonb, 15, true)
ON CONFLICT DO NOTHING;

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE fraud_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fraud_rules_admin  ON fraud_rules;
DROP POLICY IF EXISTS fraud_alerts_admin ON fraud_alerts;

CREATE POLICY fraud_rules_admin  ON fraud_rules  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY fraud_alerts_admin ON fraud_alerts FOR ALL USING (true) WITH CHECK (true);
