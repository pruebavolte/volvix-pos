-- =============================================================
-- R17 GEOFENCE — Auto check-in cajeros por ubicación (slice_111)
-- =============================================================

-- Tabla de check-ins de cajeros
CREATE TABLE IF NOT EXISTS public.cashier_checkins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  branch_id   uuid NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  distance_m  integer NOT NULL,
  accuracy_m  integer NULL,
  ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashier_checkins_user_ts_idx
  ON public.cashier_checkins (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS cashier_checkins_branch_ts_idx
  ON public.cashier_checkins (branch_id, ts DESC);

-- Asegurar columnas lat/lng en pos_branches (idempotente)
ALTER TABLE public.pos_branches
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

-- Función Haversine: distancia en metros entre dos puntos (lat,lng) en grados
CREATE OR REPLACE FUNCTION public.haversine_distance(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  r constant double precision := 6371000; -- radio Tierra en metros
  d_lat double precision;
  d_lng double precision;
  a     double precision;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  d_lat := radians(lat2 - lat1);
  d_lng := radians(lng2 - lng1);
  a := sin(d_lat/2) * sin(d_lat/2)
       + cos(radians(lat1)) * cos(radians(lat2))
       * sin(d_lng/2) * sin(d_lng/2);
  RETURN 2 * r * asin(sqrt(a));
END;
$$;

-- Vista útil: último check-in por cajero
CREATE OR REPLACE VIEW public.cashier_last_checkin AS
SELECT DISTINCT ON (user_id)
  user_id, branch_id, lat, lng, distance_m, accuracy_m, ts
FROM public.cashier_checkins
ORDER BY user_id, ts DESC;

-- RLS (cada cajero ve solo lo suyo; service role bypass)
ALTER TABLE public.cashier_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashier_checkins_self_select ON public.cashier_checkins;
CREATE POLICY cashier_checkins_self_select ON public.cashier_checkins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cashier_checkins_self_insert ON public.cashier_checkins;
CREATE POLICY cashier_checkins_self_insert ON public.cashier_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);
