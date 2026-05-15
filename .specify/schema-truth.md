# Schema-truth — Volvix POS / SalvadoreX (Supabase)

> Auto-generado por Wave 1.6 · 2026-05-15
> Fuente: análisis estático del código (MCP no disponible)
> Supabase URL: https://zhvwmzkcqngcaqpdxtwr.supabase.co
> ⚠️ VALIDAR contra Supabase dashboard — este análisis es estático, no refleja el estado real de la BD

---

## Resumen

| Métrica | Valor |
|---|---|
| Tablas únicas encontradas en código | ~200 |
| Tablas en migraciones SQL (CREATE TABLE) | ~130 |
| Tablas activamente usadas en API (supabaseRequest) | 182 (top, excluyendo RPC) |
| Tablas con sufijos prohibidos | 1 |
| Grupos de duplicación semántica detectados | 11 |

---

## Deudas detectadas

| # | Deuda | Severidad | Detalle |
|---|---|---|---|
| D1 | `product_variants_v2` con sufijo prohibido | MEDIA | Tabla con `_v2` sugiere versión anterior existente o ambigüedad |
| D2 | `sales` vs `pos_sales` vs `volvix_ventas` | ALTA | Tres tablas para el mismo concepto. `cfdi-pac.js` usa `pos_sales`, `pdf-export.js` usa `sales`, migraciones definen `volvix_ventas` |
| D3 | `tenants` vs `pos_tenants` vs `volvix_tenants` vs `companies` vs `pos_companies` | ALTA | Cinco nombres para "empresa/tenant". Core usa `pos_companies`, CFDI fix usa `volvix_tenants`, pdf-export usa `tenants`. Riesgo de RLS divergente |
| D4 | `customers` vs `pos_customers` | MEDIA | Dos tablas para clientes. `api/index.js` llama a `customers` (9 veces) y `pos_customers` (2 veces) |
| D5 | `purchase_orders` vs `pos_purchase_orders` | MEDIA | Duplicación del módulo de órdenes de compra |
| D6 | `cuts` vs `pos_cortes` vs `pos_cut_adjustments` | MEDIA | `cuts.sql` crea `cuts`, API también llama `pos_cortes` |
| D7 | `otp_verifications` vs `pos_otp_verifications` vs `otp_codes` | MEDIA | Tres tablas para OTP |
| D8 | `tenant_settings` vs `pos_tenant_settings` | BAJA | Settings duplicados |
| D9 | `tenant_module_overrides` vs `tenant_module_flags` vs `pos_tenant_modules` | BAJA | Tres tablas para flags de módulos |
| D10 | `academy_progress` vs `user_academy_progress` | BAJA | Dos tablas para progreso de academia |
| D11 | `sync_sessions` vs `sync_queue` | BAJA | Naming inconsistente para sincronización |

---

## Tablas encontradas — Núcleo del negocio (más usadas)

### `pos_sales` (24 menciones en API)
**Propósito**: Ventas registradas en el POS
**Archivos que la tocan**: `api/index.js` (24x), `api/cfdi-pac.js` (1x como fuente CFDI)
**Columnas conocidas** (inferidas):
- `id` UUID PK
- `tenant_id` TEXT (formato "TNT001")
- `user_id` UUID (cajero)
- `customer_id` UUID (nullable)
- `total` NUMERIC(12,2)
- `status` TEXT — 'paid','cancelled','pending'
- `payment_method` TEXT
- `cancel_reason` TEXT (nullable)
- `canceled_at` TIMESTAMPTZ (nullable)
- `canceled_by` UUID (nullable)
- `printed_at` TIMESTAMPTZ (nullable)
- `cut_id` UUID FK→cuts (nullable)
- `created_at` TIMESTAMPTZ
**Nota de deuda**: `pdf-export.js` usa tabla `sales` (distinta), `cfdi-pac.js` usa `pos_sales`

---

### `pos_users` (24 menciones en API)
**Propósito**: Usuarios del sistema (admins, owners, cajeros)
**Archivos que la tocan**: `api/index.js`
**Columnas conocidas**:
- `id` UUID PK
- `email` TEXT UNIQUE
- `password_hash` TEXT (bcrypt)
- `role` TEXT — 'ADMIN','OWNER','USER'
- `plan` TEXT
- `full_name` TEXT
- `phone` TEXT UNIQUE
- `company_id` UUID FK→pos_companies
- `is_active` BOOLEAN
- `notes` JSONB (contiene volvix_role, tenant_id, tenant_name)
- `created_at` TIMESTAMPTZ

---

### `pos_products` (19 menciones en API)
**Propósito**: Catálogo de productos por tenant
**Archivos que la tocan**: `api/index.js`, `api/pdf-export.js` (como `products`)
**Columnas conocidas**:
- `id` UUID PK (o auto-increment en alguna versión)
- `pos_user_id` UUID FK→pos_users (tenant owner)
- `code` TEXT (SKU, ej: 'FAR-0001')
- `name` TEXT
- `category` TEXT
- `cost` NUMERIC(12,2)
- `price` NUMERIC(12,2)
- `stock` INTEGER
- `icon` TEXT (emoji)
- `tenant_id` TEXT (en queries REST)
- `is_active` BOOLEAN
- `created_at` TIMESTAMPTZ
**Nota de deuda**: `pdf-export.js` usa tabla `products` (alias o tabla separada) con columnas `id, cost, category, category_name`

---

### `pos_companies` (9 menciones en API)
**Propósito**: Empresas/tenants registrados en la plataforma
**Archivos que la tocan**: `api/index.js`, `src/db/R13_SEED_DATA.sql`
**Columnas conocidas**:
- `id` UUID PK
- `name` TEXT
- `plan` TEXT — 'pro','enterprise'
- `is_active` BOOLEAN
- `owner_user_id` UUID FK→pos_users
- `created_at` TIMESTAMPTZ
**Nota de deuda**: Coexiste con `tenants`, `pos_tenants`, `volvix_tenants`, `companies` (stub)

---

### `pos_security_alerts` (20 menciones en API)
**Propósito**: Log de alertas de seguridad (fraude, intentos fallidos, anomalías)
**Archivos que la tocan**: `api/index.js`, `src/migrations/r6a-auth-hardening.sql`, `src/migrations/r8c-sales-search.sql`, `src/migrations/r10b-nivel2-daily.sql`
**Columnas conocidas**:
- `id` UUID PK
- `tenant_id` TEXT/UUID
- `user_id` UUID
- `alert_type` TEXT
- `severity` TEXT
- `details` JSONB
- `resolved_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ
**Nota**: Definida en 3 migraciones distintas — posible conflicto de schema

---

### `inventory_movements` (13 menciones en API)
**Propósito**: Movimientos de inventario (entradas, salidas, traslados)
**Archivos que la tocan**: `api/index.js`, `api/pdf-export.js`, `src/db/R14_INVENTORY.sql`
**Columnas conocidas** (de R14_INVENTORY.sql):
- `id` UUID PK
- `tenant_id` UUID
- `product_id` UUID
- `from_loc` UUID FK→inventory_locations (nullable)
- `to_loc` UUID FK→inventory_locations (nullable)
- `qty` NUMERIC NOT NULL
- `type` TEXT — 'in','out','transfer','adjustment','return'
- `reference` TEXT
- `user_id` UUID
- `notes` TEXT
- `created_at` TIMESTAMPTZ

---

### `customers` (9 menciones en API) / `pos_customers` (2 menciones)
**Propósito**: CRM de clientes
**Archivos que la tocan**: `api/index.js`
**Columnas conocidas** (de R14_ALL_COMBINED.sql):
- `id` UUID PK
- `tenant_id` TEXT/UUID
- `name` TEXT
- `email` TEXT
- `phone` TEXT
- `rfc` TEXT
- `loyalty_points` INTEGER
- `tier_id` UUID FK→loyalty_tiers
- `created_at` TIMESTAMPTZ

---

### `volvix_audit_log` (5 menciones en API)
**Propósito**: Log de auditoría global de acciones del sistema
**Archivos que la tocan**: `api/index.js`, `src/migrations/r5c-audit-rewrite.sql`
**Columnas conocidas**:
- `id` UUID PK
- `tenant_id` TEXT
- `user_id` UUID
- `action` TEXT
- `entity` TEXT
- `entity_id` TEXT
- `payload` JSONB
- `ip` TEXT
- `ua` TEXT
- `created_at` TIMESTAMPTZ

---

### `cuts` (2 menciones en API) / `pos_cortes` (1 mención)
**Propósito**: Cortes de caja (apertura/cierre de turno)
**Archivos que la tocan**: `api/index.js`, `src/migrations/cuts.sql`
**Columnas conocidas** (de cuts.sql — schema completo):
- `id` UUID PK
- `tenant_id` UUID NOT NULL
- `cashier_id` UUID NOT NULL
- `station_id` TEXT
- `opening_balance` NUMERIC(12,2)
- `closing_balance` NUMERIC(12,2)
- `total_sales` NUMERIC(12,2)
- `total_cash_sales`, `total_card_sales`, `total_transfer_sales`, `total_other_sales`
- `expected_balance`, `discrepancy`
- `cash_in`, `cash_out`
- `status` TEXT — 'open','closed','reconciled','voided'
- `opened_at`, `closed_at`, `reconciled_at`, `voided_at` TIMESTAMPTZ
**Nota de deuda**: API también llama `pos_cortes` — posible tabla diferente

---

### `invoices` / `invoice_lines` / `invoice_log` (5/2/- menciones)
**Propósito**: Facturas CFDI emitidas
**Archivos que la tocan**: `api/index.js`, `api/pdf-export.js`, `src/db/R14_CFDI_TABLES.sql`
**Columnas conocidas** (de R14_CFDI_TABLES.sql):
- `invoices`: id, tenant_id, sale_id, customer_id, uuid (SAT), serie, folio, subtotal, iva, total, status, xml_content, pdf_url, stamped_at, created_at
- `invoice_lines`: id, invoice_id, product_id, quantity, unit_price, subtotal, iva_rate, iva_amount, total, sat_clave_prodserv, sat_clave_unidad
- `invoice_log`: id, invoice_id, action, actor_id, payload, created_at
**Nota**: `api/cfdi-pac.js` usa tablas alternativas: `cfdi_stamps`, `cfdi_templates`, `cfdi_mock`, `cfdi_public_links`

---

### `cfdi_stamps` (7 menciones en cfdi-pac.js)
**Propósito**: Registros de timbrado CFDI (PAC)
**Archivos que la tocan**: `api/cfdi-pac.js`
**Columnas conocidas**:
- `id` UUID PK
- `tenant_id` TEXT
- `sale_id` UUID
- `uuid` TEXT (UUID SAT)
- `status` TEXT
- `xml` TEXT
- `pdf_url` TEXT
- `stamped_at` TIMESTAMPTZ
- `error` TEXT

---

### `feature_modules` / `tenant_module_overrides` / `module_pricing` (4/3/3 menciones)
**Propósito**: Feature flags y módulos por tenant
**Archivos que la tocan**: `api/index.js`, `src/migrations/feature-flags.sql`
**Columnas conocidas** (de feature-flags.sql):
- `feature_modules`: id, code, name, description, category, is_global, default_enabled, created_at
- `module_pricing`: id, module_id, plan, price_monthly, price_yearly
- `tenant_module_overrides`: id, tenant_id, module_id, enabled, override_reason, created_at

---

### `pos_otp_verifications` (5 menciones en API)
**Propósito**: OTP para verificación de phone/email en registro
**Archivos que la tocan**: `api/index.js`, `src/migrations/r12-o-1-registro-otp.sql`
**Columnas conocidas**:
- `id` UUID PK
- `phone` TEXT
- `email` TEXT
- `code` TEXT (6 dígitos)
- `verified_at` TIMESTAMPTZ
- `expires_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ

---

### `webhook_endpoints` / `webhook_deliveries` (5/3 menciones)
**Propósito**: Webhooks salientes configurables por tenant
**Archivos que la tocan**: `api/index.js`, `src/db/R14_WEBHOOKS.sql`
**Columnas conocidas**:
- `webhook_endpoints`: id, tenant_id, url, secret, events JSONB, is_active, created_at
- `webhook_deliveries`: id, endpoint_id, tenant_id, event, payload JSONB, status, attempts, next_retry, delivered_at, created_at

---

### `subscriptions` / `subscription_plans` / `subscription_events` (2/1/1 menciones)
**Propósito**: Planes de suscripción SaaS
**Archivos que la tocan**: `api/index.js`, `src/db/R14_SUBSCRIPTIONS.sql`
**Columnas conocidas**:
- `subscription_plans`: id, code, name, price_monthly, price_yearly, max_users, max_products, features JSONB
- `subscriptions`: id, tenant_id, plan_id, status, current_period_start, current_period_end, canceled_at, created_at
- `subscription_events`: id, subscription_id, event_type, payload JSONB, created_at

---

### `loyalty_tiers` / `loyalty_transactions` (1/2 menciones)
**Propósito**: Programa de lealtad por puntos
**Archivos que la tocan**: `api/index.js`, `src/db/R14_LOYALTY.sql`, `src/db/R19_FIX_R14_LOYALTY.sql`
**Columnas conocidas**:
- `loyalty_tiers`: id, tenant_id, name, min_points, discount_percent, perks JSONB
- `loyalty_transactions`: id, tenant_id, customer_id, sale_id, points, type ('earn','redeem'), balance_after, created_at

---

### `pending_sales` (2 menciones en API)
**Propósito**: Ventas pausadas (F6 — venta en espera)
**Archivos que la tocan**: `api/index.js`, `src/migrations/b39-tables.sql`
**Columnas conocidas**:
- id, tenant_id, user_id, reference TEXT, items JSONB, customer_id, customer_name, total, notes, expires_at, restored_at, cancelled_at, created_at

---

### `notifications` (1 mención en API)
**Propósito**: Notificaciones in-app por tenant/usuario
**Archivos que la tocan**: `api/index.js`, `src/migrations/b39-tables.sql`
**Columnas conocidas**:
- id, tenant_id, user_id UUID, title, body, level TEXT ('info','warn','error','success'), url, read_at, archived_at, created_at

---

## Tablas en migraciones SQL (definidas pero uso en código no confirmado)

### Módulos avanzados (R17/R18 — feature-gated)

| Tabla | Archivo | Propósito |
|---|---|---|
| `services` + `appointments` + `staff_availability` | R17_APPOINTMENTS.sql | Agendamiento de citas |
| `fraud_rules` + `fraud_alerts` | R17_FRAUD.sql | Detección de fraude |
| `kiosk_devices` + `kiosk_orders` | R17_KIOSK.sql | Kiosco de autoservicio |
| `discord_webhooks` | R17_DISCORD.sql | Alertas Discord |
| `product_bundles` | R17_BUNDLES.sql | Paquetes de productos |
| `ml_predictions` | R17_ML.sql | Predicciones ML |
| `ocr_scans` | R17_OCR.sql | Escaneo OCR facturas |
| `promotions` + `promotion_uses` | R17_PROMOTIONS.sql | Descuentos/promociones |
| `reviews` + `review_responses` | R17_REVIEWS.sql | Reseñas de clientes |
| `customer_segments` + `segment_members` + `segment_campaigns` | R17_SEGMENTS.sql | CRM segmentación |
| `telegram_admins` + `telegram_alerts` | R17_TELEGRAM.sql | Alertas Telegram |
| `inventory_warehouses` + `warehouse_zones` + `stock_per_warehouse` + `warehouse_transfers` | R17_WAREHOUSES.sql | Almacenes múltiples |
| `whatsapp_messages` + `whatsapp_subscribers` | R17_WHATSAPP.sql | WhatsApp Business |
| `cashier_checkins` | R17_GEOFENCE.sql | Check-in por geolocalización |
| `accounting_accounts` + `accounting_journal` + `expenses` | R18_ACCOUNTING_SAT.sql | Contabilidad SAT |
| `attendance` + `time_off` + `performance_reviews` + `employee_documents` | R18_HR.sql | RRHH |
| `pipeline_stages` + `leads` + `crm_activities` + `crm_campaigns` | R18_CRM_ADVANCED.sql | CRM avanzado |
| `cloud_backups` | R18_CLOUD_BACKUP.sql | Backups en nube |
| `shopify_sync_state` + `shopify_mappings` | R18_SHOPIFY.sql | Integración Shopify |
| `amazon_orders_mirror` | R18_AMAZON.sql | Integración Amazon |
| `kds_stations` + `kds_tickets` | R18_KDS.sql | Kitchen Display System |
| `ml_oauth_tokens` + `ml_listings` + `ml_orders` | R18_MERCADOLIBRE.sql | MercadoLibre |
| `vendors` + `vendor_products` + `vendor_payouts` + `vendor_sale_splits` | R18_MARKETPLACE.sql | Marketplace multi-vendedor |
| `nft_collections` + `customer_nfts` + `blockchain_receipts` | R18_NFT_LOYALTY.sql | NFT Loyalty |
| `square_sync_log` | R18_SQUARE_SYNC.sql | Integración Square |

### Módulos de seguridad y operaciones

| Tabla | Archivo | Propósito |
|---|---|---|
| `idempotency_keys` | r1-pos-core-hardening.sql, R22 | Prevención de duplicados |
| `request_nonces` | R22_SECURITY_HARDENING.sql | Anti-replay |
| `pos_login_attempts` | r6a-auth-hardening.sql | Intentos de login |
| `pos_active_sessions` | r6a-auth-hardening.sql | Sesiones activas |
| `pos_password_reset_tokens` | r6a-auth-hardening.sql | Reset de contraseña |
| `mfa_attempts` | R14_MFA.sql | MFA |
| `api_keys` | R14_API_KEYS.sql | Llaves API externas |
| `volvix_audit_log` + `volvix_audit_log_archive` | r5c-audit-rewrite.sql | Auditoría completa |
| `volvix_gdpr_requests` | r5c-audit-rewrite.sql | Solicitudes ARCO/GDPR |
| `pos_arco_requests` | r12b-arco-requests.sql | Solicitudes ARCO |
| `error_log` + `system_error_logs` | R14_ERROR_LOG.sql | Logs de errores |
| `email_log` | R14_EMAIL_LOG.sql | Log de emails enviados |
| `sms_log` | R19_FIX_R17_SMS.sql | Log de SMS |

### SAT / Fiscal MX

| Tabla | Propósito |
|---|---|
| `sat_uso_cfdi` | Catálogo SAT uso CFDI |
| `sat_regimen_fiscal` | Catálogo SAT régimen fiscal |
| `sat_forma_pago` | Catálogo SAT forma de pago |
| `sat_metodo_pago` | Catálogo SAT método de pago |
| `sat_clave_prodserv` | Catálogo SAT clave producto/servicio |
| `sat_clave_unidad` | Catálogo SAT unidad de medida |
| `product_sat_mapping` | Mapeo producto → clave SAT |
| `pos_fiscal_config` | Configuración fiscal por empresa (CSD, RFC, PAC) |
| `cfdi_documents` + `cfdi_folios` | Documentos CFDI (migración cfdi.sql) |
| `billing_configs` | Config facturación PAC por tenant |

### Inventario avanzado

| Tabla | Propósito |
|---|---|
| `inventory_locations` | Ubicaciones físicas en almacén |
| `inventory_stock` | Stock actual por producto/ubicación |
| `inventory_counts` | Conteos de inventario |
| `inventory_count_lines` | Líneas de conteo |
| `inventory_count_items` | Items de conteo (alias/duplicado) |
| `pos_purchase_orders` + `pos_purchase_order_items` | Órdenes de compra |
| `pos_product_barcodes` | Códigos de barras por producto |
| `pos_product_cost_history` | Historial de costos |

### Tablas volvix_* (prefijo legado documentado en CLAUDE.md)

| Tabla | Descripción |
|---|---|
| `volvix_tenants` | Alias/duplicado de tenants — creado en R19_FIX_R14_CFDI_TABLES |
| `volvix_ventas` | Alias/duplicado de pos_sales — creado en R19_FIX_R14_CFDI_TABLES |
| `volvix_audit_log` | Log de auditoría (activo — 5 menciones en API) |
| `volvix_gdpr_requests` | Solicitudes ARCO/GDPR (activo — 1 mención en API) |
| `volvix_subscriptions` | Suscripciones (1 mención en API) — vs `subscriptions` |
| `volvix_tables_layout` | Layout de mesas para restaurantes (volvix-tables-wiring.js) |

---

## Tablas con sufijos prohibidos

| Tabla | Sufijo | Riesgo |
|---|---|---|
| `product_variants_v2` | `_v2` | Sugiere que `product_variants` (v1) debería existir o fue eliminada |

---

## Variables de entorno Supabase

- `SUPABASE_URL`: `https://zhvwmzkcqngcaqpdxtwr.supabase.co`
- `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`: presentes en `.env`
- `SUPABASE_PAT`: `sbp_b6fe6a70...` (Personal Access Token)

---

## Notas de validación

1. El servidor (`api/index.js`) NO usa el SDK de Supabase JS — usa `supabaseRequest()` con REST API directa. Las tablas se identifican por las rutas REST (ej: `/pos_sales?tenant_id=eq...`).
2. `api/pdf-export.js` y `api/cfdi-pac.js` SÍ usan el SDK JS (`.from('tabla')`).
3. Muchas tablas de los módulos R17/R18 pueden existir en el schema pero no tener datos reales ni código de negocio completo — fueron creadas anticipando features futuras.
4. La tabla `_health` (1 mención en volvix-health-wiring.js) es una tabla de ping de conexión, no es de negocio.
