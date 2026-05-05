-- =============================================================
-- R18 · MercadoLibre integration (LATAM)
-- =============================================================

CREATE TABLE IF NOT EXISTS ml_oauth_tokens (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  ml_user_id      TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_type      TEXT DEFAULT 'bearer',
  scope           TEXT,
  site_id         TEXT DEFAULT 'MLM',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_tokens_tenant ON ml_oauth_tokens(tenant_id);

CREATE TABLE IF NOT EXISTS ml_listings (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  internal_id     TEXT NOT NULL,           -- pos_products.id
  ml_id           TEXT,                    -- MLM12345 / MLA...
  title           TEXT,
  price           NUMERIC(14,2),
  currency_id     TEXT DEFAULT 'MXN',
  available_qty   INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'draft',    -- draft|active|paused|closed|error
  permalink       TEXT,
  category_id     TEXT,
  listing_type_id TEXT DEFAULT 'gold_special',
  last_sync       TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, internal_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_listings_tenant ON ml_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ml_listings_status ON ml_listings(status);

CREATE TABLE IF NOT EXISTS ml_orders (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID,
  ml_order_id     TEXT UNIQUE,
  buyer_nick      TEXT,
  total_amount    NUMERIC(14,2),
  currency_id     TEXT,
  status          TEXT,
  raw             JSONB,
  received_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_orders_tenant ON ml_orders(tenant_id);
