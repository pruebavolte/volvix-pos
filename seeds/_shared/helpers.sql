-- ============================================================
-- SHARED HELPERS for industry-specific seed scripts
-- ============================================================
-- Provides idempotent helpers used by every tenant-{vertical}/*.sql
-- ============================================================

-- Generate deterministic UUID v5-like from tenant_id + slug (for products/customers).
-- Uses md5 hash so re-running is idempotent.
CREATE OR REPLACE FUNCTION seed_uuid(p_tenant uuid, p_slug text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 1 FOR 8) || '-' ||
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 9 FOR 4) || '-' ||
    '5' || SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 14 FOR 3) || '-' ||
    'a' || SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 18 FOR 3) || '-' ||
    SUBSTRING(md5(p_tenant::text || '|' || p_slug) FROM 21 FOR 12)
  )::uuid
$$;

-- Generate a fake but valid-looking EAN-13 barcode from a seed.
CREATE OR REPLACE FUNCTION seed_ean13(seed text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text;
  i int;
  sum_odd int := 0;
  sum_even int := 0;
  digit int;
  check_d int;
BEGIN
  d := lpad(regexp_replace(md5(seed), '\D', '', 'g'), 12, '0');
  d := substring(d FROM 1 FOR 12);
  FOR i IN 1..12 LOOP
    digit := substring(d FROM i FOR 1)::int;
    IF i % 2 = 1 THEN sum_odd := sum_odd + digit; ELSE sum_even := sum_even + digit; END IF;
  END LOOP;
  check_d := (10 - ((sum_odd + sum_even * 3) % 10)) % 10;
  RETURN d || check_d::text;
END;
$$;

-- Random timestamp within last N days (with hour bias for industry peaks)
CREATE OR REPLACE FUNCTION seed_random_recent(days int, peak_hours int[] DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE
  base date := current_date - (random() * days)::int;
  h int;
BEGIN
  IF peak_hours IS NOT NULL AND array_length(peak_hours, 1) > 0 AND random() < 0.6 THEN
    h := peak_hours[1 + (random() * (array_length(peak_hours,1) - 1))::int];
  ELSE
    h := 8 + (random() * 14)::int;
  END IF;
  RETURN base + (h || ' hours')::interval + ((random() * 59)::int || ' minutes')::interval;
END;
$$;
