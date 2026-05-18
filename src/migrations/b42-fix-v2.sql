-- B42 G4 fix v2: simpler approach
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE tablename IN ('user_module_overrides','tenant_module_overrides','role_module_permissions','feature_flag_audit')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE user_module_overrides ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE tenant_module_overrides ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE role_module_permissions ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE feature_flag_audit ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

DROP POLICY IF EXISTS umo_iso ON user_module_overrides;
DROP POLICY IF EXISTS tmo_iso ON tenant_module_overrides;
DROP POLICY IF EXISTS rmp_iso ON role_module_permissions;
DROP POLICY IF EXISTS ffa_iso ON feature_flag_audit;

CREATE POLICY umo_iso ON user_module_overrides FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');
CREATE POLICY tmo_iso ON tenant_module_overrides FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');
CREATE POLICY rmp_iso ON role_module_permissions FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');
CREATE POLICY ffa_iso ON feature_flag_audit FOR ALL
  USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id'), '')
         OR COALESCE((auth.jwt() ->> 'role'), '') = 'superadmin');

NOTIFY pgrst, 'reload schema';
