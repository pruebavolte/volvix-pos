-- ============================================================
-- ALL TENANTS — Historical sales (last 30 days)
-- ============================================================
-- Generates sales with industry-specific volume + peak hours.
-- Idempotent: each (tenant, day, ticket_num) gets a deterministic UUID.
-- ============================================================
BEGIN;

DO $$
DECLARE
  -- (owner_id, sales_per_day_min, sales_per_day_max, peak_hours, avg_ticket, vertical_prefix)
  v_configs jsonb := '[
    {"owner":"22222222-0001-aaaa-aaaa-000000000001","min":3,"max":5,"peaks":[10,18,19],"avg":80,"prefix":"abarr"},
    {"owner":"22222222-0002-aaaa-aaaa-000000000001","min":5,"max":10,"peaks":[7,8,9,17],"avg":50,"prefix":"pan"},
    {"owner":"22222222-0003-aaaa-aaaa-000000000001","min":4,"max":8,"peaks":[10,11,17,18],"avg":120,"prefix":"farm"},
    {"owner":"22222222-0004-aaaa-aaaa-000000000001","min":30,"max":60,"peaks":[14,15,20,21],"avg":150,"prefix":"rest"},
    {"owner":"22222222-0005-aaaa-aaaa-000000000001","min":50,"max":100,"peaks":[8,9,15,16],"avg":80,"prefix":"cafe"},
    {"owner":"22222222-0006-aaaa-aaaa-000000000001","min":5,"max":10,"peaks":[11,12,17,18,19],"avg":150,"prefix":"barb"},
    {"owner":"22222222-0007-aaaa-aaaa-000000000001","min":80,"max":150,"peaks":[7,8,17,18,19,20],"avg":400,"prefix":"gas"},
    {"owner":"22222222-0008-aaaa-aaaa-000000000001","min":5,"max":15,"peaks":[12,13,17,18,19],"avg":600,"prefix":"ropa"},
    {"owner":"22222222-0009-aaaa-aaaa-000000000001","min":1,"max":3,"peaks":[12,13,17,18],"avg":5000,"prefix":"elec"},
    {"owner":"22222222-0010-aaaa-aaaa-000000000001","min":5,"max":15,"peaks":[6,7,18,19,20],"avg":400,"prefix":"fit"}
  ]'::jsonb;
  cfg jsonb;
  d int;
  s int;
  count_today int;
  ticket_total numeric;
  ts timestamptz;
  hr int;
  pay_methods text[] := ARRAY['efectivo','tarjeta','transferencia','tarjeta','efectivo'];
  pay text;
  sale_id uuid;
  qty int;
  unit_price numeric;
BEGIN
  FOR cfg IN SELECT * FROM jsonb_array_elements(v_configs) LOOP
    FOR d IN 0..29 LOOP
      count_today := (cfg->>'min')::int + (random() * ((cfg->>'max')::int - (cfg->>'min')::int))::int;
      FOR s IN 1..count_today LOOP
        -- random hour with peak bias
        IF random() < 0.55 AND jsonb_array_length(cfg->'peaks') > 0 THEN
          hr := (cfg->'peaks'->((random() * (jsonb_array_length(cfg->'peaks') - 1))::int))::int;
        ELSE
          hr := 8 + (random() * 14)::int;
        END IF;
        ts := (current_date - d)::timestamptz + (hr || ' hours')::interval + ((random() * 59)::int || ' minutes')::interval;
        ticket_total := ((cfg->>'avg')::numeric * (0.4 + random() * 1.4))::numeric(10,2);
        pay := pay_methods[1 + (random() * (array_length(pay_methods,1) - 1))::int];
        sale_id := seed_uuid((cfg->>'owner')::uuid, (cfg->>'prefix') || '-sale-d' || d || '-n' || s);
        qty := 1 + (random() * 3)::int;
        unit_price := (ticket_total / qty)::numeric(10,2);

        INSERT INTO pos_sales (id, pos_user_id, total, payment_method, items, created_at)
        VALUES (
          sale_id,
          (cfg->>'owner')::uuid,
          ticket_total,
          pay,
          jsonb_build_array(jsonb_build_object(
            'qty', qty,
            'sku', (cfg->>'prefix') || '-item-' || (1 + (random()*30)::int)::text,
            'price', unit_price,
            'name', 'Item demo ' || (cfg->>'prefix')
          )),
          ts
        )
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
