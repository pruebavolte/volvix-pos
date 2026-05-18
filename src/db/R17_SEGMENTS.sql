-- R17_SEGMENTS.sql
-- Segmentacion de clientes para marketing
-- Fecha: 2026-04-26

BEGIN;

-- ============================================================
-- 1. customer_segments
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_segments (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT       NOT NULL,
  name              TEXT         NOT NULL,
  description       TEXT,
  criteria          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  member_count      INTEGER      NOT NULL DEFAULT 0,
  last_computed_at  TIMESTAMPTZ,
  is_predefined     BOOLEAN      NOT NULL DEFAULT FALSE,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_segments_member_chk CHECK (member_count >= 0),
  CONSTRAINT customer_segments_tenant_name_uk UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_segments_tenant       ON customer_segments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_segments_active       ON customer_segments(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_segments_criteria_gin ON customer_segments USING GIN (criteria);

-- ============================================================
-- 2. segment_members
-- ============================================================
CREATE TABLE IF NOT EXISTS segment_members (
  segment_id   BIGINT      NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id  BIGINT      NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (segment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_members_segment  ON segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_customer ON segment_members(customer_id);

-- ============================================================
-- 3. segment_campaigns (auditoria de envios)
-- ============================================================
CREATE TABLE IF NOT EXISTS segment_campaigns (
  id            BIGSERIAL PRIMARY KEY,
  segment_id    BIGINT       NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  channel       TEXT         NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
  template      TEXT,
  subject       TEXT,
  body          TEXT,
  recipients    INTEGER      NOT NULL DEFAULT 0,
  sent          INTEGER      NOT NULL DEFAULT 0,
  failed        INTEGER      NOT NULL DEFAULT 0,
  status        TEXT         NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sending','done','failed')),
  triggered_by  BIGINT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_segment_campaigns_segment ON segment_campaigns(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_campaigns_status  ON segment_campaigns(status);

-- ============================================================
-- 4. compute_segment(segment_id) — evalua criteria y popula members
-- ============================================================
-- DSL soportado en criteria JSONB:
--   min_total_spent       (NUMERIC)  spent en ultimos 12 meses >=
--   min_visits            (INTEGER)  cantidad de sales >=
--   max_visits            (INTEGER)  cantidad de sales <=
--   days_since_last_visit (INTEGER)  ultima compra >= dias
--   max_days_since_first  (INTEGER)  primera compra <= dias (clientes nuevos)
--   has_tier              (TEXT)     bronze|silver|gold|platinum
--   vertical              (TEXT)     vertical del tenant/cliente
--   min_avg_ticket        (NUMERIC)  promedio por venta >=
CREATE OR REPLACE FUNCTION compute_segment(p_segment_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_tenant   BIGINT;
  v_crit     JSONB;
  v_count    INTEGER := 0;
  v_min_spent      NUMERIC;
  v_min_visits     INTEGER;
  v_max_visits     INTEGER;
  v_days_last      INTEGER;
  v_max_first      INTEGER;
  v_tier           TEXT;
  v_vertical       TEXT;
  v_min_avg        NUMERIC;
BEGIN
  SELECT tenant_id, criteria INTO v_tenant, v_crit
    FROM customer_segments WHERE id = p_segment_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'segment % not found', p_segment_id;
  END IF;

  v_min_spent  := NULLIF(v_crit->>'min_total_spent','')::NUMERIC;
  v_min_visits := NULLIF(v_crit->>'min_visits','')::INTEGER;
  v_max_visits := NULLIF(v_crit->>'max_visits','')::INTEGER;
  v_days_last  := NULLIF(v_crit->>'days_since_last_visit','')::INTEGER;
  v_max_first  := NULLIF(v_crit->>'max_days_since_first','')::INTEGER;
  v_tier       := NULLIF(v_crit->>'has_tier','');
  v_vertical   := NULLIF(v_crit->>'vertical','');
  v_min_avg    := NULLIF(v_crit->>'min_avg_ticket','')::NUMERIC;

  -- limpiar miembros previos
  DELETE FROM segment_members WHERE segment_id = p_segment_id;

  -- popular miembros usando CTE de agregados de ventas por cliente
  WITH sales_agg AS (
    SELECT
      s.customer_id,
      COUNT(*)                                    AS visits,
      COALESCE(SUM(s.total),0)                    AS total_spent,
      COALESCE(AVG(NULLIF(s.total,0)),0)          AS avg_ticket,
      MAX(s.created_at)                           AS last_visit,
      MIN(s.created_at)                           AS first_visit
    FROM sales s
    WHERE s.tenant_id = v_tenant
      AND s.customer_id IS NOT NULL
      AND s.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY s.customer_id
  )
  INSERT INTO segment_members (segment_id, customer_id)
  SELECT p_segment_id, c.id
    FROM customers c
    LEFT JOIN sales_agg a ON a.customer_id = c.id
   WHERE c.tenant_id = v_tenant
     AND (v_min_spent  IS NULL OR COALESCE(a.total_spent,0) >= v_min_spent)
     AND (v_min_visits IS NULL OR COALESCE(a.visits,0)      >= v_min_visits)
     AND (v_max_visits IS NULL OR COALESCE(a.visits,0)      <= v_max_visits)
     AND (v_min_avg    IS NULL OR COALESCE(a.avg_ticket,0)  >= v_min_avg)
     AND (v_days_last  IS NULL OR a.last_visit IS NULL
                                OR a.last_visit <= NOW() - (v_days_last || ' days')::INTERVAL)
     AND (v_max_first  IS NULL OR (a.first_visit IS NOT NULL
                                AND a.first_visit >= NOW() - (v_max_first || ' days')::INTERVAL))
     AND (v_tier       IS NULL OR c.loyalty_tier = v_tier)
     AND (v_vertical   IS NULL OR c.vertical     = v_vertical)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE customer_segments
     SET member_count     = v_count,
         last_computed_at = NOW(),
         updated_at       = NOW()
   WHERE id = p_segment_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Predefined segments seed (idempotente por tenant)
-- ============================================================
CREATE OR REPLACE FUNCTION seed_predefined_segments(p_tenant_id BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO customer_segments (tenant_id, name, description, criteria, is_predefined)
  VALUES
    (p_tenant_id, 'VIP',           'Spent >$5000 ultimos 12 meses', '{"min_total_spent":5000}'::jsonb, TRUE),
    (p_tenant_id, 'Inactive',      'Sin compra >90 dias',           '{"days_since_last_visit":90}'::jsonb, TRUE),
    (p_tenant_id, 'New',           'Primera compra <30 dias',       '{"max_days_since_first":30}'::jsonb, TRUE),
    (p_tenant_id, 'Big Spenders',  'Avg ticket >$500',              '{"min_avg_ticket":500}'::jsonb, TRUE),
    (p_tenant_id, 'Frequent',      '>10 visitas mes',               '{"min_visits":10}'::jsonb, TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMIT;
