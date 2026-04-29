# Mapa del sistema — Volvix POS — 2026-04-27

> Generado por system-architecture-audit. Carpeta auditada: `C:\Users\DELL\Downloads\verion 340`. Deploy live: https://volvix-pos.vercel.app

## Resumen numérico

| Recurso | Total |
|---------|-------|
| HTMLs detectados | 59 |
| Endpoints API en api/index.js | 373 |
| Tablas Supabase referenciadas | 85 |
| Roles distintos en código | 8 |
| Sub-sistemas funcionalmente distintos | 14 |

---

## A. Sub-sistemas / Apps detectados (14)

| # | Sub-sistema | Archivo principal | Rol esperado | Propósito |
|---|-------------|-------------------|--------------|-----------|
| 1 | Volvix Hub Landing | volvix-hub-landing.html | público | Marketing / landing principal |
| 2 | Login Volvix | login.html | cualquiera | Auth gateway de la plataforma |
| 3 | Volvix Admin SaaS | volvix-admin-saas.html | superadmin | Dueño de la plataforma — gestiona tenants, billing, NPS |
| 4 | Volvix MEGA Dashboard | volvix-mega-dashboard.html | superadmin | KPIs globales multi-tenant en vivo |
| 5 | Owner Panel | volvix_owner_panel_v7.html | owner | Dueño de UN negocio individual — su tienda |
| 6 | SalvadoreX POS | salvadorex_web_v25.html | cashier, manager, owner | Punto de venta de un tenant |
| 7 | MultiPOS Suite | multipos_suite_v3.html | manager+ | Gestión multi-sucursal (cocina, comandas, manager, KDS-like) |
| 8 | KDS (Kitchen Display) | volvix-kds.html | kitchen | Pantalla de cocina para meseros/cocineros |
| 9 | Kiosko self-service | volvix-kiosk.html | kiosk | Auto-servicio cliente final en local |
| 10 | Customer Portal | volvix-customer-portal.html (+v2) | customer | Comprador final — sus compras / NFTs / loyalty |
| 11 | Vendor Portal | volvix-vendor-portal.html | vendor | Proveedor — sus POs y facturas |
| 12 | Marketplace | marketplace.html | público / owner | Selector de giro / catálogo de tipos de negocio |
| 13 | GDPR Portal | volvix-gdpr-portal.html (+public/) | público | Solicitudes Art.15/17/20 |
| 14 | Fraud Dashboard | public/volvix-fraud-dashboard.html | superadmin | Vigilancia de fraude global |

**Auxiliares no auditables como pantalla principal pero en el deploy:**
- `volvix-shop.html`, `etiqueta_designer.html`, `volvix_remote.html`
- `volvix_ai_engine.html`, `volvix_ai_academy.html`, `volvix_ai_support.html`
- `volvix-onboarding-v2.html`, `volvix-onboarding-wizard.html`
- `volvix-grand-tour.html`, `volvix-sitemap.html`, `volvix-api-docs.html`
- `volvix-sandbox.html`, `volvix-modals-demo.html`, `volvix-pwa-final.html`
- `volvix-audit-viewer.html`, `volvix-customer-portal-v2.html`, `landing_dynamic.html`
- `BITACORA_LIVE.html`, `MATRIZ_PRUEBAS_LOCAL.html`, `volvix-qa-scenarios.html` (¡archivos de QA en producción!)

---

## B. Roles del sistema

| Rol | Menciones código | Sub-sistemas que debería ver | NO debería ver |
|-----|:-:|------------------------------|----------------|
| `superadmin` | 90 | TODOS | (nada está prohibido para superadmin) |
| `admin` | 81 | Owner Panel + SalvadoreX (mismo tenant) + Vendor + Reports | Volvix Admin SaaS, datos de OTROS tenants |
| `owner` | 71 | Owner Panel + SalvadoreX (su tenant) | Volvix Admin SaaS, otros tenants |
| `manager` | 8 | SalvadoreX + Reports + KDS | Owner panel financiero, Volvix Admin SaaS |
| `cashier` | 1 | SalvadoreX (sin reportes financieros) | Owner Panel, Reports, KDS configuración |
| `customer` | 3 | Customer Portal (solo SU cuenta) | Todo lo demás |
| `kiosk` | 2 | Kiosko self-service (sin auth de empleado) | Todo lo demás |
| `warehouse` | 2 | Inventario / Compras | Reports financieros, Customer data |

**Hallazgos preliminares Fase 1:**
- Solo 1 mención de `cashier` y 8 de `manager` en api/index.js → la mayoría de endpoints discriminan `superadmin`/`admin`/`owner` y NO chequean cashier/manager. Probable: rol cashier no está realmente protegido.
- No hay rol `vendor` en código. La Vendor Portal NO valida quién entra. **BLOQUEANTE-CANDIDATO**.
- No hay rol `kitchen` en código. KDS no tiene control de acceso por rol.

---

## C. Tablas DB y matriz de visibilidad esperada (top 40 críticas)

| Tabla | superadmin | owner/admin | manager | cashier | customer | vendor | kiosk |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| pos_companies (tenants) | ALL | OWN | ✗ | ✗ | ✗ | ✗ | ✗ |
| pos_users | ALL | OWN_TENANT | OWN_TENANT (read) | OWN_USER | ✗ | ✗ | ✗ |
| pos_sales | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (write) | OWN_AS_BUYER (read) | ✗ | OWN_TENANT (write) |
| pos_products | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | catalog (read, no cost) | ✗ | OWN_TENANT (read) |
| customers | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | OWN_RECORD | ✗ | ✗ |
| pos_branches | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | ✗ | ✗ | ✗ |
| pos_cash_sessions | ALL | OWN_TENANT | OWN_TENANT | OWN_USER | ✗ | ✗ | ✗ |
| pos_credits | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | OWN_AS_DEBTOR | ✗ | ✗ |
| pos_quotations | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT | ✗ | ✗ | ✗ |
| pos_returns | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT | OWN_AS_BUYER | ✗ | ✗ |
| invoices | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (write CFDI) | OWN_RECORD | ✗ | ✗ |
| inventory_locations / inventory_warehouses | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | ✗ | ✗ | ✗ |
| inventory_movements / inventory_counts | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (limited) | ✗ | ✗ | ✗ |
| warehouse_transfers | ALL | OWN_TENANT | OWN_TENANT | ✗ | ✗ | ✗ | ✗ |
| purchases | ALL | OWN_TENANT | OWN_TENANT | ✗ | ✗ | OWN_AS_VENDOR | ✗ |
| billing_plans | ALL (write) | catalog (read) | catalog (read) | ✗ | ✗ | ✗ | ✗ |
| billing_configs | ALL | OWN_TENANT | ✗ | ✗ | ✗ | ✗ | ✗ |
| customer_subscriptions | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (write) | OWN_RECORD | ✗ | ✗ |
| subscription_plans / subscription_charges / subscription_events | ALL | OWN_TENANT | OWN_TENANT | ✗ | OWN_AS_BUYER | ✗ | ✗ |
| loyalty_tiers / loyalty_transactions | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT (read) | OWN_USER | ✗ | ✗ |
| customer_segments / segment_campaigns | ALL | OWN_TENANT | OWN_TENANT | ✗ | ✗ | ✗ | ✗ |
| reviews / review_responses | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT | OWN_AS_AUTHOR | ✗ | ✗ |
| customer_nfts / nft_collections / blockchain_receipts | ALL | OWN_TENANT | ✗ | ✗ | OWN_RECORD | ✗ | ✗ |
| employees / cashier_checkins | ALL | OWN_TENANT | OWN_TENANT | OWN_USER | ✗ | ✗ | ✗ |
| payroll_periods / payroll_receipts | ALL | OWN_TENANT | ✗ | ✗ | ✗ | ✗ | ✗ |
| tip_pools / tip_distributions | ALL | OWN_TENANT | OWN_TENANT | OWN_USER (read) | ✗ | ✗ | ✗ |
| kiosk_devices / kiosk_orders | ALL | OWN_TENANT | OWN_TENANT | OWN_TENANT | ✗ | ✗ | OWN_DEVICE |
| webhook_endpoints / webhook_deliveries / discord_webhooks | ALL | OWN_TENANT | ✗ | ✗ | ✗ | ✗ | ✗ |
| api_keys | ALL | OWN_TENANT | ✗ | ✗ | ✗ | ✗ | ✗ |
| audit_log / volvix_audit_log | ALL | OWN_TENANT (read) | ✗ | ✗ | ✗ | ✗ | ✗ |
| volvix_gdpr_requests | ALL | OWN_TENANT (read) | ✗ | ✗ | OWN_RECORD | ✗ | ✗ |
| fraud_alerts / fraud_rules | ALL | OWN_TENANT (read) | ✗ | ✗ | ✗ | ✗ | ✗ |
| domains | ALL | OWN_TENANT | ✗ | ✗ | ✗ | ✗ | ✗ |
| licenses | ALL | OWN_TENANT (read) | ✗ | ✗ | ✗ | ✗ | ✗ |
| pos_login_events | ALL | OWN_TENANT (read) | OWN_TENANT (read) | OWN_USER | ✗ | ✗ | ✗ |
| daily_sales_report | ALL | OWN_TENANT | OWN_TENANT | ✗ | ✗ | ✗ | ✗ |
| ai_chat_log / ml_predictions / ocr_scans | ALL | OWN_TENANT | OWN_TENANT (read) | ✗ | ✗ | ✗ | ✗ |

(ALL = todos los registros / OWN_TENANT = filtrado por tenant_id / OWN_USER = filtrado por user_id / OWN_RECORD = filtrado por id que pertenece al usuario / ✗ = sin acceso)

**Tablas críticas faltantes en código** (mencionadas pero no encontradas):
- No existe tabla explícita `vendors` cuando vendor_portal.html debería leer de algo. Solo hay `vendor_payouts` y `vendor_sale_splits` (tablas SQL inline). **Cableado roto candidato.**
- Tabla `pos_tenants` aparece en código pero también `pos_companies` — **duplicidad de modelo**: ¿son la misma cosa? Aparenta confusión arquitectónica.

---

## D. Conexiones cruzadas que DEBEN existir (23 verificables)

| # | Conexión esperada | Origen | Destino | Cómo verificar |
|---|-------------------|--------|---------|----------------|
| D1 | Login Volvix → Owner Panel via SSO IIFE | login.html POST /api/auth/login | volvix_owner_panel_v7.html ssoCheck() | Login → ir a /volvix_owner_panel_v7.html, debe entrar sin re-login |
| D2 | Login Volvix → SalvadoreX POS via SSO | login.html | salvadorex_web_v25.html ssoCheck() | Login → /salvadorex... debe entrar sin re-login (R26 ya implementado) |
| D3 | Owner Panel KPIs ← /api/owner/dashboard | API | UI cards de revenue/users/products | Hacer venta → KPI revenue +N en owner panel |
| D4 | MEGA Dashboard ← /api/reports/sales/daily | API | gráfica ventas 7d | Validar con `_sbReq('GET','/pos_sales')` agg |
| D5 | Volvix Admin SaaS Tenants tab ← /api/owner/companies | API | lista tenants | Crear tenant → aparece |
| D6 | SalvadoreX vende → pos_sales row created | POST /api/sales | pos_sales table | Hacer venta, query `?select=id&order=created_at.desc&limit=1` |
| D7 | Vender baja stock atómico | POST /api/sales | pos_products.stock -= qty | qty=1, stock antes vs después |
| D8 | Customer Portal ← /api/customer/orders | API | UI lista compras del cliente | Login customer A, ver solo SUS compras |
| D9 | Customer Portal NFTs ← /api/customer/nfts | API | UI tarjeta NFTs | Mintear NFT → aparece |
| D10 | Vendor Portal POs ← /api/vendor/pos | API (no existe aún) | UI lista POs | **NO existe endpoint /api/vendor/* en api/index.js** |
| D11 | KDS recibe ticket cuando hay venta de comida | POST /api/sales con kitchen_items | INSERT kds_tickets | Hacer venta restaurante → ticket aparece |
| D12 | Reports ← Supabase real (R26 fix) | server.js _sbReq | mega-dashboard / reports | GET /api/reports/sales/daily devuelve `sum(total)` real |
| D13 | Customer Subscription cobra recurrente | cron /api/admin/jobs/process-recurring | subscription_charges | Forzar cron, charges nuevos creados |
| D14 | Loyalty acumula puntos al vender | POST /api/sales | loyalty_transactions INSERT | Vender, puntos del cliente +N |
| D15 | Loyalty redime al pasar ticket | POST /api/loyalty/redeem | loyalty_transactions debit | Redimir, balance baja |
| D16 | Audit log captura mutaciones admin | cualquier PATCH /api/owner/* | audit_log INSERT | Cambiar settings → audit row |
| D17 | GDPR access devuelve datos del cliente | POST /api/gdpr/access | volvix_gdpr_requests + email | Solicitar, recibir export |
| D18 | CFDI stamp graba uuid en invoices | POST /api/invoices/cfdi | invoices.uuid set | Estampar, query invoice |
| D19 | Stripe webhook actualiza subscription | POST /api/payments/stripe/webhook | subscriptions.status | Stripe test event → row update |
| D20 | Push notif suscribe al device | POST /api/push/subscribe | push_subscriptions row | Subscribe → row aparece |
| D21 | Multi-sucursal (branches) filtra ventas | GET /api/sales?branch_id=X | only that branch | Crear sucursal Y, ver sales NO incluye Y |
| D22 | Onboarding crea tenant + admin user | POST /api/onboarding/start | pos_companies + pos_users | Onboarding wizard → 2 rows nuevas |
| D23 | i18n carga locale del usuario | /api/me devuelve lang | UI rehidrata strings | Cambiar lang → strings cambian |

---

## E. Conexiones que NO deben existir (anti-flujos — 18)

| # | Anti-flujo | Verificación | Severidad si existe |
|---|------------|--------------|---------------------|
| E1 | owner_A ve ventas de tenant_B | Login owner_A, GET /api/sales?tenant_id=B → debe 403 o array vacío | BLOQUEANTE -20 |
| E2 | owner_A ve customers de tenant_B | GET /api/customers (todos) → solo de su tenant | BLOQUEANTE -20 |
| E3 | owner_A ve pos_users de tenant_B | GET /api/owner/users → solo su tenant | BLOQUEANTE -20 |
| E4 | owner_A puede modificar billing_plan de tenant_B | PATCH /api/billing/upgrade en otro tenant | BLOQUEANTE -20 |
| E5 | cashier accede a /api/reports/profit | GET /api/reports/profit con role:cashier → 403 | Crítico -10 |
| E6 | cashier accede a /api/owner/billing | GET /api/owner/billing con role:cashier → 403 | Crítico -10 |
| E7 | cashier puede DELETE producto | DELETE /api/products/:id con role:cashier → 403 | Crítico -10 |
| E8 | customer ve precio de costo `cost_price` | GET /api/products como customer → response NO incluye cost | Crítico -10 |
| E9 | customer ve compras de OTRO customer | GET /api/customer/orders?customer_id=X → solo SUS órdenes | BLOQUEANTE -20 |
| E10 | customer accede a /api/owner/* | GET cualquier /api/owner/* como customer → 403 | Crítico -10 |
| E11 | vendor ve clientes finales | GET /api/customers como vendor → 403 | Crítico -10 |
| E12 | vendor ve POs de OTRO vendor | GET /api/purchases?vendor_id=X → solo SUS POs | Crítico -10 |
| E13 | kiosk puede crear/editar productos | POST/PATCH /api/products como kiosk → 403 | Alto -5 |
| E14 | kiosk accede a settings del tenant | GET /api/owner/settings como kiosk → 403 | Alto -5 |
| E15 | endpoint /api/admin/* sin auth → 200 | curl GET /api/admin/backup/list sin token → 401 | BLOQUEANTE -20 |
| E16 | endpoint /api/owner/* sin auth → 200 | curl GET /api/owner/dashboard sin token → 401 | BLOQUEANTE -20 |
| E17 | passwords visibles en GET /api/owner/users | response NO debe incluir password_hash | BLOQUEANTE -20 |
| E18 | service_role key expuesta en frontend | grep -r "SUPABASE_SERVICE" en HTML/JS público → 0 hits | BLOQUEANTE -20 |

---

## F. Conexiones esperadas a verificar (cableado lógico)

Las verificaciones D1-D23 y E1-E18 se ejecutan en FASE 2.

**Ya conocidas como rotas (de R27 UX audit):**
- D1, D3 (parcial): Owner Panel renderiza HTML de SalvadoreX → KPIs no llegan a la UI correcta
- D5: Volvix Admin SaaS muestra `847 tenants` hardcoded, no tira de API
- D10: No hay endpoints /api/vendor/* en api/index.js — Vendor Portal es 100% mock

---

## Próxima fase

FASE 2 — verificar D1-D23 + E1-E18 con tokens reales contra https://volvix-pos.vercel.app y reportar fugas como BLOQUEANTES.
