SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'volvix_tenants'
ORDER BY ordinal_position;
