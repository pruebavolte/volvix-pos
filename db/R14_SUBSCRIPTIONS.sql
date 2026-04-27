-- =============================================================
-- R14 · SUBSCRIPTIONS (SaaS multi-tenant billing)
-- Planes Free / Pro / Enterprise
-- =============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents  INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'MXN',
  features            JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits              JSONB NOT NULL DEFAULT '{}'::jsonb,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_price_monthly TEXT,
  stripe_price_yearly  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  status                  TEXT NOT NULL DEFAULT 'trial'
                          CHECK (status IN ('trial','active','past_due','canceled')),
  billing_cycle           TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  stripe_subscription_id  TEXT,
  stripe_customer_id      TEXT,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_events_sub ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_ts  ON subscription_events(ts DESC);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL,
  stripe_invoice_id  TEXT,
  number             TEXT,
  amount_cents       INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'MXN',
  status             TEXT NOT NULL DEFAULT 'open',
  hosted_invoice_url TEXT,
  pdf_url            TEXT,
  period_start       TIMESTAMPTZ,
  period_end         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_tenant ON subscription_invoices(tenant_id);

-- =============================================================
-- SEED: 3 planes base
-- =============================================================
INSERT INTO subscription_plans (name, price_monthly_cents, price_yearly_cents, currency, features, limits, active)
VALUES
  ('Free',
    0, 0, 'MXN',
    '{"support":"community","ai":false,"reports":"basic","backups":false}'::jsonb,
    '{"max_users":1,"max_products":100,"max_locations":1,"max_sales_per_month":500}'::jsonb,
    TRUE),
  ('Pro',
    29900, 299000, 'MXN',
    '{"support":"email","ai":true,"reports":"advanced","backups":true,"loyalty":true}'::jsonb,
    '{"max_users":5,"max_products":-1,"max_locations":3,"max_sales_per_month":-1}'::jsonb,
    TRUE),
  ('Enterprise',
    99900, 999000, 'MXN',
    '{"support":"priority","ai":true,"reports":"advanced","backups":true,"loyalty":true,"sso":true,"sla":true}'::jsonb,
    '{"max_users":-1,"max_products":-1,"max_locations":-1,"max_sales_per_month":-1}'::jsonb,
    TRUE)
ON CONFLICT (name) DO UPDATE
  SET price_monthly_cents = EXCLUDED.price_monthly_cents,
      price_yearly_cents  = EXCLUDED.price_yearly_cents,
      features            = EXCLUDED.features,
      limits              = EXCLUDED.limits,
      active              = EXCLUDED.active;
