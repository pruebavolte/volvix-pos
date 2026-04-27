-- R17_WAREHOUSES.sql
-- Multi-warehouse / multi-bodega global con geolocalización (extiende R14_INVENTORY)
-- Fecha: 2026-04-26

BEGIN;

-- ============================================================
-- 1. inventory_warehouses
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_warehouses (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT       NOT NULL,
  name            TEXT         NOT NULL,
  address         TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  country         TEXT,
  is_main         BOOLEAN      NOT NULL DEFAULT FALSE,
  capacity_units  INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_warehouses_tenant_name_uk UNIQUE (tenant_id, name),
  CONSTRAINT inventory_warehouses_lat_chk  CHECK (lat IS NULL OR (lat BETWEEN -90  AND 90)),
  CONSTRAINT inventory_warehouses_lng_chk  CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  CONSTRAINT inventory_warehouses_cap_chk  CHECK (capacity_units >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inv_wh_tenant   ON inventory_warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_wh_country  ON inventory_warehouses(country);
CREATE INDEX IF NOT EXISTS idx_inv_wh_geo      ON inventory_warehouses(lat, lng);

-- Sólo un warehouse "main" por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inv_wh_main_per_tenant
  ON inventory_warehouses(tenant_id) WHERE is_main = TRUE;

-- ============================================================
-- 2. warehouse_zones
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouse_zones (
  id            BIGSERIAL PRIMARY KEY,
  warehouse_id  BIGINT NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  code          TEXT   NOT NULL,
  type          TEXT   NOT NULL CHECK (type IN ('storage','picking','shipping','returns')),
  CONSTRAINT warehouse_zones_uk UNIQUE (warehouse_id, code)
);
CREATE INDEX IF NOT EXISTS idx_wh_zones_wh ON warehouse_zones(warehouse_id);

-- ============================================================
-- 3. stock_per_warehouse
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_per_warehouse (
  product_id    BIGINT NOT NULL,
  warehouse_id  BIGINT NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  qty           NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, warehouse_id),
  CONSTRAINT stock_per_warehouse_qty_chk CHECK (qty >= 0)
);
CREATE INDEX IF NOT EXISTS idx_spw_warehouse ON stock_per_warehouse(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_spw_product   ON stock_per_warehouse(product_id);

-- ============================================================
-- 4. warehouse_transfers (auditoría/tracking de transferencias)
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL,
  from_wh_id     BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  to_wh_id       BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  product_id     BIGINT NOT NULL,
  qty            NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  status         TEXT   NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_transit','received','cancelled')),
  tracking_code  TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at    TIMESTAMPTZ,
  CONSTRAINT wh_transfers_diff_chk CHECK (from_wh_id <> to_wh_id)
);
CREATE INDEX IF NOT EXISTS idx_wh_tr_tenant ON warehouse_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wh_tr_status ON warehouse_transfers(status);
CREATE INDEX IF NOT EXISTS idx_wh_tr_from   ON warehouse_transfers(from_wh_id);
CREATE INDEX IF NOT EXISTS idx_wh_tr_to     ON warehouse_transfers(to_wh_id);

-- ============================================================
-- 5. nearest_warehouse(lat, lng) — fórmula Haversine pura SQL
-- ============================================================
-- Devuelve el id del warehouse más cercano (de cualquier tenant si se desea filtrar
-- por tenant_id, envolverlo desde la API). Distancia en km.
CREATE OR REPLACE FUNCTION nearest_warehouse(
  customer_lat DOUBLE PRECISION,
  customer_lng DOUBLE PRECISION,
  p_tenant_id  BIGINT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT w.id
    INTO v_id
    FROM inventory_warehouses w
   WHERE w.lat IS NOT NULL
     AND w.lng IS NOT NULL
     AND (p_tenant_id IS NULL OR w.tenant_id = p_tenant_id)
   ORDER BY (
       2 * 6371 * asin(
         sqrt(
           power(sin(radians((w.lat - customer_lat) / 2)), 2) +
           cos(radians(customer_lat)) * cos(radians(w.lat)) *
           power(sin(radians((w.lng - customer_lng) / 2)), 2)
         )
       )
   ) ASC
   LIMIT 1;
  RETURN v_id;
END;
$$;

COMMIT;
