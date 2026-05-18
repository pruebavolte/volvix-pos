# Wave 2C — Endpoints

- **Compartidos documentados**: 8/8
- **Stubs POS creados**: 20
- **Tablas backend identificadas**:
  - `verticals` — catálogo de giros
  - `giros_modulos` — módulos por giro
  - `giros_terminologia` — terminología por giro
  - `giros_campos` — campos por giro
  - `giros_buttons` — botones por giro
  - `pos_companies` — tenants registrados (alias de `volvix_tenants`)
  - `pos_tenant_modules` — toggles de módulos por tenant
  - `tenant_button_overrides` — toggles de botones por tenant
  - `tenant_terminology` — overrides de terminología por tenant
  - `pos_app_branding` — branding personalizado de PWA cliente
  - `pos_app_media` — banners/media de PWA cliente
  - `pos_app_orders` — órdenes desde PWA cliente
  - `pos_app_clients` — clientes registrados en PWA
  - `pos_products` — catálogo de productos por tenant
  - `client_errors` — log de errores JS del frontend
  - `audit_log` — log de acciones de auditoría

- **Deudas críticas**:
  1. **CRÍTICO — Fuga de datos**: `GET /api/owner/low-stock` NO filtra por `tenant_id`. Si no hay RLS activa en `pos_products`, todos los tenants ven todos los productos de bajo stock del sistema completo.
  2. **CRÍTICO — Mismatch schema**: CLAUDE.md lista tablas como `volvix_tenants`, `volvix_productos`, `volvix_ventas`, `volvix_usuarios` pero el código usa `pos_companies`, `pos_products`, `pos_tenant_modules`, `pos_usuarios`. Confirmar nombres reales en Supabase y actualizar schema-truth.
  3. **ALTO — Tablas sin verificar en schema-truth**: `pos_app_branding`, `pos_app_media`, `pos_app_orders`, `pos_app_clients`, `pos_tenant_modules`, `tenant_button_overrides`, `tenant_terminology`, `client_errors` — ninguna aparece en la documentación de CLAUDE.md.
  4. **ALTO — Tokens JWT stale**: `GET /api/users/me` devuelve `req.user` directamente del JWT sin consultar DB. Un usuario desactivado en Supabase mantiene acceso hasta expiración del token.
  5. **MEDIO — Endpoint público expone datos de negocio**: `GET /api/app/config` es público (sin auth). Devuelve nombre, teléfono, ciudad y configuración completa de cualquier tenant. Minimizar campos expuestos.
  6. **MEDIO — Doble familia de toggles**: Existen dos handlers distintos para el mismo propósito (`/api/admin/tenant/:id/modules/:module_id/toggle` y `/api/admin/tenant/:tid/module`) — riesgo de inconsistencia en `pos_tenant_modules`.
  7. **BAJO — Paginación faltante**: `GET /api/admin/giros` (limit=500) y `GET /api/admin/tenants` (limit=500) truncan silenciosamente si hay más registros.
