-- =============================================================================
-- R2 — MV_SALES_DAILY: Single source of truth para reportes financieros
-- Round 2 / Fibonacci
--
-- Cubre los GAPs:
--   GAP-A: cierre-z reportaba 0 ventas porque pos_sales no tenía tenant_id
--          (o lo filtraba por un solo pos_user_id, omitiendo cajeros del tenant)
--   GAP-B: reports / analytics / kardex devolvían totales distintos para mismo
--          período. Esta migration crea la vista materializada que es UNICA
--          fuente de verdad consultada por los 3 endpoints.
--
-- Aplicar con:
--   supabase db query --linked < migrations/r2-mv-sales-daily.sql
--
-- Re-ejecutable: usa CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASO 0: Asegurar columna tenant_id en pos_sales (puede no existir en legacy).
-- -----------------------------------------------------------------------------
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Index para queries por tenant
CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_created
  ON pos_sales (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_sales_pos_user_created
  ON pos_sales (pos_user_id, created_at);

-- -----------------------------------------------------------------------------
-- PASO 1: Backfill tenant_id desde pos_users.
-- IMPORTANTE: en este schema, pos_users.tenant_id es UUID y suele estar NULL.
-- La fuente real del tenant_id por usuario está en pos_users.notes (JSON,
-- p.ej. {"tenant_id":"TNT001","volvix_role":"superadmin"}).
-- -----------------------------------------------------------------------------
-- 1a) Intentar columna tenant_id directa
UPDATE pos_sales s
SET tenant_id = u.tenant_id::text
FROM pos_users u
WHERE s.pos_user_id = u.id
  AND u.tenant_id IS NOT NULL
  AND (s.tenant_id IS NULL OR s.tenant_id = '');

-- 1b) Fallback: pos_users.notes->>'tenant_id'
UPDATE pos_sales s
SET tenant_id = (u.notes::jsonb->>'tenant_id')
FROM pos_users u
WHERE s.pos_user_id = u.id
  AND u.notes IS NOT NULL
  AND (u.notes::jsonb->>'tenant_id') IS NOT NULL
  AND (s.tenant_id IS NULL OR s.tenant_id = '');

-- 1c) Default final
UPDATE pos_sales s
SET tenant_id = 'TNT001'
WHERE s.tenant_id IS NULL OR s.tenant_id = '';


-- -----------------------------------------------------------------------------
-- PASO 2: Drop si existe vista anterior incompatible (R14 usaba volvix_ventas)
-- -----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_sales_daily CASCADE;


-- -----------------------------------------------------------------------------
-- PASO 3: Crear mv_sales_daily — UNA fuente de verdad para todos los reportes.
-- Solo cuenta status IN ('paid','refunded') — excluye cancelled / pending.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_sales_daily AS
SELECT
  s.tenant_id                                                       AS tenant_id,
  date_trunc('day', s.created_at)::date                             AS dia,
  COUNT(*) FILTER (WHERE COALESCE(s.status, 'paid') = 'paid')       AS sales_count,
  COALESCE(SUM(s.total) FILTER (WHERE COALESCE(s.status,'paid')='paid'), 0)::numeric(14,2) AS sales_total,
  COALESCE(SUM(
    CASE
      WHEN jsonb_typeof(s.items) = 'array' THEN
        (SELECT COALESCE(SUM(COALESCE((it->>'qty')::numeric, (it->>'quantity')::numeric, 1)), 0)
         FROM jsonb_array_elements(s.items) AS it)
      ELSE 0
    END
  ) FILTER (WHERE COALESCE(s.status,'paid')='paid'), 0)::numeric(14,2) AS items_sold,
  COUNT(*) FILTER (WHERE s.status = 'refunded')                     AS refunds_count,
  COALESCE(SUM(s.total) FILTER (WHERE s.status='refunded'), 0)::numeric(14,2) AS refunds_total,
  COUNT(*) FILTER (WHERE s.status IN ('cancelled','canceled','voided','void')) AS cancellations_count,
  COALESCE(SUM(s.total) FILTER (WHERE s.status IN ('cancelled','canceled','voided','void')), 0)::numeric(14,2) AS cancellations_total,
  COALESCE(SUM(s.tip_amount) FILTER (WHERE COALESCE(s.status,'paid')='paid'), 0)::numeric(14,2) AS tips_total,
  -- Net = paid - refunded (lo que realmente queda en caja, sin contar cancelaciones)
  (
    COALESCE(SUM(s.total) FILTER (WHERE COALESCE(s.status,'paid')='paid'), 0)
    - COALESCE(SUM(s.total) FILTER (WHERE s.status='refunded'), 0)
  )::numeric(14,2)                                                  AS net_total,
  MAX(s.created_at)                                                 AS last_sale_at
FROM pos_sales s
WHERE s.tenant_id IS NOT NULL AND s.tenant_id <> ''
GROUP BY s.tenant_id, date_trunc('day', s.created_at)::date;

-- UNIQUE index obligatorio para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_sales_daily_pk
  ON mv_sales_daily (tenant_id, dia);

CREATE INDEX IF NOT EXISTS mv_sales_daily_dia
  ON mv_sales_daily (dia);


-- -----------------------------------------------------------------------------
-- PASO 4: Helper para refrescar la vista (idempotente, seguro de invocar).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_mv_sales_daily()
RETURNS void AS $$
BEGIN
  -- CONCURRENTLY requiere unique index Y debe haber al menos 1 row poblado.
  -- Si la vista está vacía, hacer refresh normal (no concurrent).
  IF EXISTS (SELECT 1 FROM mv_sales_daily LIMIT 1) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_daily;
  ELSE
    REFRESH MATERIALIZED VIEW mv_sales_daily;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- No bloquear flujo de venta por error de refresh
  RAISE NOTICE 'refresh_mv_sales_daily failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -----------------------------------------------------------------------------
-- PASO 5: Trigger AFTER INSERT / UPDATE en pos_sales para auto-refresh.
--
-- Estrategia: NO refrescamos en cada INSERT (sería caro en alto volumen).
-- En su lugar: enviamos NOTIFY que el backend Node puede escuchar, o el endpoint
-- /api/reports/refresh lo llama bajo demanda. El refresh CONCURRENTLY corre en
-- ~50ms por miles de rows, así que también es viable invocarlo cada N ventas.
-- -----------------------------------------------------------------------------

-- Trigger function: emite NOTIFY 'mv_sales_daily_dirty' con tenant_id
CREATE OR REPLACE FUNCTION trg_pos_sales_notify_mv()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('mv_sales_daily_dirty',
    COALESCE(NEW.tenant_id, OLD.tenant_id, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_sales_notify_mv ON pos_sales;
CREATE TRIGGER pos_sales_notify_mv
  AFTER INSERT OR UPDATE OF total, status, payment_method ON pos_sales
  FOR EACH ROW
  EXECUTE FUNCTION trg_pos_sales_notify_mv();


-- -----------------------------------------------------------------------------
-- PASO 6: Trigger BEFORE INSERT que auto-popule tenant_id si viene NULL
-- (defensivo: backend YA debería pasarlo, pero por si algún path legacy lo omite).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_pos_sales_set_tenant()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant TEXT;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = '' THEN
    -- Intento 1: columna tenant_id directa
    SELECT u.tenant_id::text INTO v_tenant
    FROM pos_users u
    WHERE u.id = NEW.pos_user_id
    LIMIT 1;
    -- Intento 2: notes JSON (donde el backend realmente guarda el tenant)
    IF v_tenant IS NULL OR v_tenant = '' THEN
      BEGIN
        SELECT (u.notes::jsonb->>'tenant_id') INTO v_tenant
        FROM pos_users u
        WHERE u.id = NEW.pos_user_id
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        v_tenant := NULL;
      END;
    END IF;
    -- Intento 3: default
    IF v_tenant IS NULL OR v_tenant = '' THEN
      v_tenant := 'TNT001';
    END IF;
    NEW.tenant_id := v_tenant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_sales_set_tenant ON pos_sales;
CREATE TRIGGER pos_sales_set_tenant
  BEFORE INSERT ON pos_sales
  FOR EACH ROW
  EXECUTE FUNCTION trg_pos_sales_set_tenant();


-- -----------------------------------------------------------------------------
-- PASO 7: Refresh inicial — popular la vista con datos existentes.
-- -----------------------------------------------------------------------------
REFRESH MATERIALIZED VIEW mv_sales_daily;


-- -----------------------------------------------------------------------------
-- PASO 8: RLS para mv_sales_daily — service-role bypassa, frontend no la consulta
-- directamente (siempre via /api). Así que dejamos sin RLS para evitar overhead.
-- -----------------------------------------------------------------------------
-- (intencional: no enable RLS — solo backend la lee con service-key)


-- =============================================================================
-- SMOKE QUERIES (ejecutar manualmente para verificar):
--
-- -- Filas en la vista (debe ser > 0 si hay ventas)
-- SELECT count(*) FROM mv_sales_daily;
--
-- -- Datos del tenant TNT001
-- SELECT tenant_id, dia, sales_count, sales_total, refunds_total, net_total
-- FROM mv_sales_daily WHERE tenant_id = 'TNT001' ORDER BY dia DESC LIMIT 10;
--
-- -- Verificar backfill: % de pos_sales con tenant_id no nulo
-- SELECT
--   count(*) AS total,
--   count(*) FILTER (WHERE tenant_id IS NOT NULL AND tenant_id <> '') AS con_tenant,
--   round(100.0 * count(*) FILTER (WHERE tenant_id IS NOT NULL AND tenant_id <> '')
--                / NULLIF(count(*),0), 2) AS pct
-- FROM pos_sales;
--
-- -- Forzar refresh manual:
-- SELECT refresh_mv_sales_daily();
-- =============================================================================
