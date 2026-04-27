-- R17_PROMOTIONS.sql
-- Sistema de promociones y cupones (descuentos por código)
-- Fecha: 2026-04-26

BEGIN;

-- ============================================================
-- 1. promotions
-- ============================================================
CREATE TABLE IF NOT EXISTS promotions (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT       NOT NULL,
  code            TEXT         NOT NULL,
  type            TEXT         NOT NULL
                  CHECK (type IN ('percent','fixed','bogo','first_purchase','loyalty_tier')),
  value           NUMERIC(12,4) NOT NULL DEFAULT 0,
  min_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses        INTEGER      NOT NULL DEFAULT 0,   -- 0 = ilimitado
  used_count      INTEGER      NOT NULL DEFAULT 0,
  category_id     BIGINT,                            -- aplica para BOGO
  required_tier   TEXT,                              -- bronze|silver|gold|platinum
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT promotions_value_chk    CHECK (value >= 0),
  CONSTRAINT promotions_min_chk      CHECK (min_amount >= 0),
  CONSTRAINT promotions_max_uses_chk CHECK (max_uses >= 0),
  CONSTRAINT promotions_used_chk     CHECK (used_count >= 0),
  CONSTRAINT promotions_dates_chk    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

-- code único por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uniq_promotions_tenant_code
  ON promotions(tenant_id, code);

CREATE INDEX IF NOT EXISTS idx_promotions_tenant   ON promotions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active   ON promotions(active);
CREATE INDEX IF NOT EXISTS idx_promotions_ends_at  ON promotions(ends_at DESC);

-- ============================================================
-- 2. promotion_uses
-- ============================================================
CREATE TABLE IF NOT EXISTS promotion_uses (
  id                BIGSERIAL PRIMARY KEY,
  promo_id          BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  sale_id           BIGINT,
  customer_id       BIGINT,
  discount_applied  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ts                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT promotion_uses_disc_chk CHECK (discount_applied >= 0)
);

CREATE INDEX IF NOT EXISTS idx_promo_uses_promo    ON promotion_uses(promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_sale     ON promotion_uses(sale_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_customer ON promotion_uses(customer_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_ts       ON promotion_uses(ts DESC);

-- ============================================================
-- 3. validate_promotion(code, tenant, customer, cart_total)
-- ============================================================
CREATE OR REPLACE FUNCTION validate_promotion(
  p_code        TEXT,
  p_tenant_id   BIGINT,
  p_customer_id BIGINT,
  p_cart_total  NUMERIC
) RETURNS TABLE(valid BOOLEAN, discount_amount NUMERIC, message TEXT, promo_id BIGINT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_p promotions%ROWTYPE;
  v_disc NUMERIC := 0;
  v_prev_uses INT := 0;
BEGIN
  SELECT * INTO v_p FROM promotions
   WHERE tenant_id = p_tenant_id AND code = p_code AND active = TRUE
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'invalid_code'::TEXT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_p.starts_at IS NOT NULL AND NOW() < v_p.starts_at THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'not_started'::TEXT, v_p.id;  RETURN;
  END IF;

  IF v_p.ends_at IS NOT NULL AND NOW() > v_p.ends_at THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'expired'::TEXT, v_p.id;  RETURN;
  END IF;

  IF v_p.max_uses > 0 AND v_p.used_count >= v_p.max_uses THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'max_uses_reached'::TEXT, v_p.id;  RETURN;
  END IF;

  IF p_cart_total < v_p.min_amount THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'min_amount_not_met'::TEXT, v_p.id;  RETURN;
  END IF;

  IF v_p.type = 'first_purchase' AND p_customer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_prev_uses FROM promotion_uses
      WHERE customer_id = p_customer_id;
    IF v_prev_uses > 0 THEN
      RETURN QUERY SELECT FALSE, 0::NUMERIC, 'not_first_purchase'::TEXT, v_p.id;  RETURN;
    END IF;
  END IF;

  -- cálculo del descuento
  IF v_p.type = 'percent' THEN
    v_disc := ROUND(p_cart_total * v_p.value / 100.0, 2);
  ELSIF v_p.type = 'fixed' THEN
    v_disc := LEAST(v_p.value, p_cart_total);
  ELSIF v_p.type = 'bogo' THEN
    v_disc := ROUND(p_cart_total * 0.5, 2);  -- aprox 2x1; cliente afina por categoría
  ELSIF v_p.type = 'first_purchase' THEN
    v_disc := ROUND(p_cart_total * v_p.value / 100.0, 2);
  ELSIF v_p.type = 'loyalty_tier' THEN
    v_disc := ROUND(p_cart_total * v_p.value / 100.0, 2);
  END IF;

  RETURN QUERY SELECT TRUE, v_disc, 'ok'::TEXT, v_p.id;
END;
$$;

COMMIT;
