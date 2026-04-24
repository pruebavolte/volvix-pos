-- =============================================================
-- Volvix POS — Row Level Security (RLS)
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- ── Habilitar RLS en todas las tablas ──────────────────────
ALTER TABLE volvix_tenants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_ventas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_features  ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_licencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE volvix_usuarios  ENABLE ROW LEVEL SECURITY;

-- ── Habilitar Realtime en tablas críticas ──────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE volvix_ventas;
ALTER PUBLICATION supabase_realtime ADD TABLE volvix_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE volvix_productos;
ALTER PUBLICATION supabase_realtime ADD TABLE volvix_features;

-- ── volvix_tenants ─────────────────────────────────────────
-- Cada tenant puede ver y editar solo su propio registro
CREATE POLICY "tenant_owner_select" ON volvix_tenants
  FOR SELECT USING (auth.uid()::text = owner_user_id OR auth.role() = 'service_role');

CREATE POLICY "tenant_owner_update" ON volvix_tenants
  FOR UPDATE USING (auth.uid()::text = owner_user_id OR auth.role() = 'service_role');

CREATE POLICY "tenant_insert_any" ON volvix_tenants
  FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

-- ── volvix_productos ───────────────────────────────────────
CREATE POLICY "productos_tenant_select" ON volvix_productos
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "productos_tenant_insert" ON volvix_productos
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "productos_tenant_update" ON volvix_productos
  FOR UPDATE USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- ── volvix_ventas ──────────────────────────────────────────
CREATE POLICY "ventas_tenant_select" ON volvix_ventas
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "ventas_tenant_insert" ON volvix_ventas
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- ── volvix_features ────────────────────────────────────────
CREATE POLICY "features_tenant_select" ON volvix_features
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "features_tenant_all" ON volvix_features
  FOR ALL USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- ── volvix_tickets ─────────────────────────────────────────
CREATE POLICY "tickets_tenant_select" ON volvix_tickets
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "tickets_tenant_insert" ON volvix_tickets
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- ── volvix_licencias ───────────────────────────────────────
CREATE POLICY "licencias_tenant_select" ON volvix_licencias
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "licencias_service_all" ON volvix_licencias
  FOR ALL USING (auth.role() = 'service_role');

-- ── volvix_usuarios ────────────────────────────────────────
CREATE POLICY "usuarios_own" ON volvix_usuarios
  FOR ALL USING (
    user_id = auth.uid()::text
    OR tenant_id IN (SELECT id FROM volvix_tenants WHERE owner_user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- ── NOTA: columna owner_user_id ────────────────────────────
-- Si volvix_tenants no tiene owner_user_id, agrégala:
-- ALTER TABLE volvix_tenants ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
