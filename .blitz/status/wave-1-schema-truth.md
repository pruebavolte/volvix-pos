# Wave 1.6 — Schema-truth

- Estado: ⚠️ (sin MCP Supabase — análisis estático)
- Método: grep de supabaseRequest() REST paths + SELECT en SDK .from() + CREATE TABLE en migraciones SQL
- Supabase URL: https://zhvwmzkcqngcaqpdxtwr.supabase.co
- Tablas encontradas: ~200 únicas (182 en API activa, ~130 en migraciones SQL)
- Archivo generado: `.specify/schema-truth.md` (~8KB)
- Completado: 2026-05-15

## Deudas críticas detectadas

| ID | Deuda | Severidad |
|---|---|---|
| D1 | `product_variants_v2` — sufijo prohibido | MEDIA |
| D2 | `sales` / `pos_sales` / `volvix_ventas` — triple duplicación | ALTA |
| D3 | `tenants` / `pos_tenants` / `volvix_tenants` / `companies` / `pos_companies` — quíntuple duplicación | ALTA |
| D4 | `customers` / `pos_customers` — duplicación | MEDIA |
| D5 | `purchase_orders` / `pos_purchase_orders` | MEDIA |
| D6 | `cuts` / `pos_cortes` / `pos_cut_adjustments` | MEDIA |
| D7 | `otp_verifications` / `pos_otp_verifications` / `otp_codes` | MEDIA |
| D8 | `tenant_settings` / `pos_tenant_settings` | BAJA |
| D9 | `tenant_module_overrides` / `tenant_module_flags` / `pos_tenant_modules` | BAJA |
| D10 | `academy_progress` / `user_academy_progress` | BAJA |
| D11 | `sync_sessions` / `sync_queue` | BAJA |

## Tablas core por frecuencia de uso (API)

1. `pos_sales` (24) — ventas
2. `pos_users` (24) — usuarios
3. `pos_security_alerts` (20) — seguridad
4. `pos_products` (19) — productos
5. `inventory_movements` (13) — stock
6. `pos_companies` (9) — tenants
7. `customers` (9) — CRM clientes
8. `cfdi_stamps` (7) — CFDI timbrado
9. `pos_user_session_invalidations` (8) — sesiones
10. `pos_login_attempts` (7) — auth
