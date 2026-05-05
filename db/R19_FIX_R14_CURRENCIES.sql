-- R19 FIX: R14_CURRENCIES.sql
-- Original error: functions in index expression must be marked IMMUTABLE
-- Cause: el cast (fetched_at::date) usa función no IMMUTABLE en algunos planners.
-- Fix: cambiar UNIQUE INDEX por columna generated stored o quitar el cast.

BEGIN;

CREATE TABLE IF NOT EXISTS currencies (
    code     CHAR(3)     PRIMARY KEY,
    name     TEXT        NOT NULL,
    symbol   TEXT        NOT NULL,
    decimals SMALLINT    NOT NULL DEFAULT 2,
    active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO currencies (code, name, symbol, decimals) VALUES
    ('MXN', 'Peso Mexicano',    '$',  2),
    ('USD', 'US Dollar',        'US$',2),
    ('EUR', 'Euro',             '€',  2),
    ('COP', 'Peso Colombiano',  'COL$',2),
    ('ARS', 'Peso Argentino',   'AR$',2),
    ('BRL', 'Real Brasileño',   'R$', 2),
    ('GBP', 'Libra Esterlina',  '£',  2),
    ('CAD', 'Dolar Canadiense', 'CA$',2)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS fx_rates (
    id          BIGSERIAL PRIMARY KEY,
    base_code   CHAR(3)   NOT NULL REFERENCES currencies(code),
    quote_code  CHAR(3)   NOT NULL REFERENCES currencies(code),
    rate        NUMERIC(20,10) NOT NULL CHECK (rate > 0),
    source      TEXT      NOT NULL DEFAULT 'exchangerate.host',
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Columna generada IMMUTABLE para indexar por día
    fetched_day DATE GENERATED ALWAYS AS ((fetched_at AT TIME ZONE 'UTC')::date) STORED
);

-- Índices ahora sobre columna física (IMMUTABLE)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fx_rates_daily
    ON fx_rates (base_code, quote_code, fetched_day);

CREATE INDEX IF NOT EXISTS ix_fx_rates_lookup
    ON fx_rates (base_code, quote_code, fetched_at DESC);

CREATE OR REPLACE FUNCTION convert(
    p_amount    NUMERIC,
    p_from_code CHAR(3),
    p_to_code   CHAR(3)
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE v_rate NUMERIC; v_inv NUMERIC;
BEGIN
    IF p_from_code = p_to_code THEN RETURN p_amount; END IF;
    SELECT rate INTO v_rate FROM fx_rates
      WHERE base_code = p_from_code AND quote_code = p_to_code
      ORDER BY fetched_at DESC LIMIT 1;
    IF v_rate IS NOT NULL THEN RETURN p_amount * v_rate; END IF;
    SELECT rate INTO v_inv FROM fx_rates
      WHERE base_code = p_to_code AND quote_code = p_from_code
      ORDER BY fetched_at DESC LIMIT 1;
    IF v_inv IS NOT NULL AND v_inv > 0 THEN RETURN p_amount / v_inv; END IF;
    DECLARE v_a NUMERIC; v_b NUMERIC;
    BEGIN
      SELECT rate INTO v_a FROM fx_rates
        WHERE base_code = p_from_code AND quote_code = 'MXN' ORDER BY fetched_at DESC LIMIT 1;
      SELECT rate INTO v_b FROM fx_rates
        WHERE base_code = 'MXN' AND quote_code = p_to_code ORDER BY fetched_at DESC LIMIT 1;
      IF v_a IS NOT NULL AND v_b IS NOT NULL THEN RETURN p_amount * v_a * v_b; END IF;
    END;
    RAISE EXCEPTION 'No FX rate available for % -> %', p_from_code, p_to_code;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_products') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_products' AND column_name='currency_code') THEN
            ALTER TABLE pos_products
                ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'MXN'
                REFERENCES currencies(code);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pos_sales') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_sales' AND column_name='currency_code') THEN
            ALTER TABLE pos_sales
                ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'MXN'
                REFERENCES currencies(code);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='pos_sales' AND column_name='fx_rate_to_base') THEN
            ALTER TABLE pos_sales
                ADD COLUMN fx_rate_to_base NUMERIC(20,10) NOT NULL DEFAULT 1.0;
        END IF;
    END IF;
END $$;

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS currencies_read ON currencies;
CREATE POLICY currencies_read ON currencies FOR SELECT USING (true);
DROP POLICY IF EXISTS fx_rates_read ON fx_rates;
CREATE POLICY fx_rates_read ON fx_rates FOR SELECT USING (true);

COMMIT;
