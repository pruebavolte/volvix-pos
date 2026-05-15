# Validation 3.1 — Schema Cross-Check

> Generado por Wave 3 · 2026-05-15
> Fuente: .specify/schema-truth.md vs .specify/contracts/endpoints/*.spec.md + _stubs-pos.md

---

## Resumen

| Métrica | Valor |
|---|---|
| Tablas en schema-truth | ~220 |
| Tablas mencionadas en contratos | 38 |
| Tablas en stubs | ~60 (estimado) |
| Tablas "inventadas" (contratos sin schema) | 14 reales (filtradas) |
| Tablas huérfanas (schema sin contrato) | 30 |

---

## Tablas "INVENTADAS" — En contratos pero NO en schema-truth

Estas tablas aparecen en los contratos o stubs pero no están documentadas en schema-truth. Pueden ser:
- Tablas reales en Supabase no documentadas aún (deuda de documentación)
- Tablas incorrectamente nombradas en el contrato (bug de spec)
- Columnas/campos que no son tablas (falsos positivos)

| Tabla | Aparece en | Probabilidad de ser real |
|---|---|---|
| `audit_log` | GET-POST-api-admin-tenant.spec.md | ALTA — usada en logAudit, probable alias de volvix_audit_log |
| `client_errors` | POST-api-log-client.spec.md | MEDIA — tabla de log de errores del cliente, puede no existir |
| `giros_buttons` | GET-api-admin-giros.spec.md, GET-api-app-config.spec.md | ALTA — catálogo de botones por giro |
| `giros_campos` | GET-api-admin-giros.spec.md | ALTA — campos configurables por giro |
| `giros_modulos` | GET-api-admin-giros.spec.md, GET-POST-api-admin-tenant.spec.md | ALTA — módulos por giro |
| `giros_terminologia` | GET-api-admin-giros.spec.md | ALTA — terminología por giro |
| `pos_app_branding` | GET-api-app-config.spec.md, _stubs-pos.md | ALTA — branding PWA por tenant |
| `pos_app_media` | GET-api-app-config.spec.md, _stubs-pos.md | ALTA — media/banners por tenant |
| `pos_app_orders` | GET-api-pos-app-orders.spec.md | ALTA — pedidos desde app cliente |
| `pos_cart_drafts` | _stubs-pos.md | MEDIA — drafts de carrito persistente |
| `pos_clientes` | _stubs-pos.md | MEDIA — probable alias de customers/pos_customers |
| `pos_usuarios` | _stubs-pos.md (heartbeat) | ALTA — probable alias de pos_users |
| `tenant_button_overrides` | GET-POST-api-admin-tenant.spec.md | ALTA — overrides de botones por tenant |
| `tenant_terminology` | GET-api-app-config.spec.md | ALTA — terminología overrides por tenant |
| `verticals` | GET-api-admin-giros.spec.md, GET-api-app-config.spec.md | ALTA — catálogo de giros/verticales |

**Falsos positivos descartados**: `last_seen`, `low_stock_count`, `module_name_overrides`, `server_time`, `superadmin`, `terminology`, `user_agent`, `volvix_user` (son campos/conceptos, no tablas).

---

## Tablas "HUÉRFANAS" — En schema-truth pero sin ningún contrato

Tablas con documentación en schema-truth que ningún contrato (.spec.md ni stub) cubre. Ordenadas por criticidad:

### Críticas (flujo de negocio principal)

| Tabla | Propósito | Riesgo de no tener contrato |
|---|---|---|
| `pos_sales` | Ventas registradas (24 menciones en API) | ALTO — tabla core del POS, sin spec de POST /api/sales |
| `pos_users` | Usuarios del sistema (24 menciones en API) | ALTO — toda auth/session depende de esta |
| `pos_products` | Catálogo de productos (19 menciones en API) | ALTO — inventario y cobro |
| `pos_security_alerts` | Log de alertas de seguridad (20 menciones) | ALTO — auditoría de fraude |
| `customers` | CRM de clientes (9 menciones API) | ALTO — duplicado vs pos_customers sin resolución |
| `inventory_movements` | Movimientos de inventario (13 menciones) | ALTO — trazabilidad de stock |
| `cuts` | Cortes de caja | ALTO — flujo crítico de cierre de turno |

### Financiero / Fiscal

| Tabla | Propósito |
|---|---|
| `invoices` | Facturas CFDI emitidas |
| `invoice_lines` | Líneas de factura |
| `invoice_log` | Log de acciones sobre facturas |
| `cfdi_stamps` | Registros de timbrado PAC |

### Módulos de plataforma

| Tabla | Propósito |
|---|---|
| `feature_modules` | Feature flags del sistema |
| `tenant_module_overrides` | Overrides de módulos por tenant |
| `module_pricing` | Precios por módulo/plan |
| `subscriptions` | Suscripciones activas |
| `subscription_plans` | Planes disponibles |
| `subscription_events` | Historial de eventos de suscripción |
| `webhook_endpoints` | Configuración de webhooks salientes |
| `webhook_deliveries` | Log de entrega de webhooks |

### Loyalty / Clientes

| Tabla | Propósito |
|---|---|
| `loyalty_tiers` | Tiers de lealtad |
| `loyalty_transactions` | Transacciones de puntos |
| `pos_customers` | Clientes (variante con prefijo pos_) |

### Operaciones / Seguridad

| Tabla | Propósito |
|---|---|
| `volvix_audit_log` | Log de auditoría global (5 menciones activas) |
| `volvix_gdpr_requests` | Solicitudes ARCO/GDPR |
| `volvix_subscriptions` | Suscripciones (variante volvix_) |
| `pos_otp_verifications` | OTP de registro |
| `pos_cortes` | Cortes de caja (variante con prefijo pos_) |
| `pending_sales` | Ventas pausadas |
| `notifications` | Notificaciones in-app |
| `product_variants_v2` | Variantes de producto (sufijo prohibido) |
| `volvix_ventas` | Ventas (alias legado de pos_sales) |
| `volvix_tables_layout` | Layout de mesas para restaurantes |
| `volvix_tenants` | Tenants (alias legado) |

---

## Deudas críticas de seguridad (Wave 2C)

| # | Endpoint | Deuda | Severidad |
|---|---|---|---|
| S1 | `GET /api/owner/low-stock` | No filtra por `tenant_id` — con service_role_key retorna productos de TODOS los tenants | CRÍTICA |
| S2 | `GET /api/users/me` | No verifica contra DB — usuarios desactivados en `pos_usuarios` mantienen acceso hasta expiración JWT | ALTA |
| S3 | `GET /api/app/config` | Público sin auth — expone configuración (branding, módulos, terminología) de cualquier tenant con solo pasar `tenant_id` | ALTA |

---

## Deudas de naming (duplicación semántica — D2/D3 del schema-truth)

| Concepto | Tablas duplicadas | Acción requerida |
|---|---|---|
| Ventas | `sales` / `pos_sales` / `volvix_ventas` | Consolidar en `pos_sales`, marcar otras como aliases |
| Tenants | `tenants` / `pos_tenants` / `volvix_tenants` / `companies` / `pos_companies` | Consolidar en `pos_companies` |
| Clientes | `customers` / `pos_customers` / `pos_clientes` / `volvix_clientes` | Consolidar en `customers` |
| Cortes | `cuts` / `pos_cortes` | Consolidar en `cuts` |
| OTP | `otp_verifications` / `pos_otp_verifications` / `otp_codes` | Consolidar en `pos_otp_verifications` |
