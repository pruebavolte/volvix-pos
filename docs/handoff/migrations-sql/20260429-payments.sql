-- Stripe payments table (PENDIENTE — implementar)
CREATE TABLE IF NOT EXISTS stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  amount_cents INT, currency TEXT DEFAULT 'usd',
  status TEXT, plan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE stripe_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_tenant ON stripe_payments FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id'));
