# CONTEXT.md — Volvix POS

## URLs activas

- **Producción**: https://volvix-pos.vercel.app
- **Login**: https://volvix-pos.vercel.app/login.html
- **POS principal**: https://volvix-pos.vercel.app/salvadorex_web_v25.html
- **Owner Panel**: https://volvix-pos.vercel.app/volvix_owner_panel_v7.html
- **MultiPOS Suite**: https://volvix-pos.vercel.app/multipos_suite_v3.html
- **Marketplace**: https://volvix-pos.vercel.app/marketplace.html
- **Etiqueta Designer**: https://volvix-pos.vercel.app/etiqueta_designer.html
- **Landing dynamic**: https://volvix-pos.vercel.app/landing_dynamic.html

## Repositorio + Deploy

- **Repo local**: `C:\Users\DELL\Downloads\verion 340\`
- **Repo GitHub**: (no confirmado en sesión)
- **Deploy**: `vercel --prod --yes` (desde root)
- **Migraciones**: `supabase db query --linked < migrations/<file>.sql`

## Stack técnico

- **Frontend**: HTML+CSS+JS vanilla (no framework), Service Worker PWA
- **Backend**: api/index.js Vercel serverless (Node 20)
- **DB**: Supabase Postgres + RLS WITH CHECK
- **Auth**: JWT custom (no Supabase Auth para login POS)
- **Mobile**: Capacitor (Android scaffold + 12 plugins)
- **Tests**: Playwright E2E (58 tests + 100+ adicionales B42)
- **i18n**: ES/EN (volvix-i18n-wiring.js)
- **Tema**: dark/light (volvix-theme-wiring.js)

## Patrones de seguridad clave

- **JWT en `Authorization: Bearer <token>`**, decoded por `requireAuth()`
- **tenant_id en JWT como TEXT** (ej: "TNT001", "DEFAULT") — NO UUID
- **RLS policies**: `auth.jwt() ->> 'tenant_id' = tenant_id` + WITH CHECK separado
- **Idempotency-Key header** obligatorio en POST/PATCH críticos
- **Rate-limit per-tenant** en `/api/*`
- **Origin allowlist**: solo `volvix-pos.vercel.app` + `*.salvadorex.com`
- **HMAC validation** en webhooks (Stripe + WhatsApp)
- **resolveOwnerPosUserId(tenantId)** helper para queries POS por slug del tenant

## Tablas DB principales (30+)

- pos_companies, sub_tenants (multi-tenant)
- pos_users, tenant_users, user_module_overrides, tenant_module_overrides, role_module_permissions
- pos_products, pos_categories, pos_inventory, inventory_movements, inventory_counts
- pos_sales, pos_sale_items, pos_returns, pos_quotations
- pos_customers, customer_credits, customer_payments
- cuts (cortes apertura/cierre Z)
- volvix_audit_log + audit_events
- airtime_carriers, recargas, service_providers, service_payments
- promotions, kds_tickets, label_templates, etiqueta_*
- backups, sync_sessions, z_report_sequences
- observability_events, analytics_events
- feature_flags, feature_flag_audit
- vendor_purchase_orders, vendor_invoices

## Credenciales / Secrets

⚠️ **NO commiteados en repo, en Vercel env vars**:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- JWT_SECRET (firma tokens custom)
- STRIPE_SECRET_KEY (no usado aún — placeholder)
- STRIPE_WEBHOOK_SECRET (no usado aún)
- WHATSAPP_HMAC_SECRET (Wasender — pendiente real key)
- ANTHROPIC_API_KEY ❌ **MISSING en Vercel — bloquea AI modules**
- SENTRY_DSN (configured)

## Cuenta supabase / proyecto

- Proyecto Supabase: `GrupoVolvix` (ver memory/MEMORY.md general)
- Login Supabase: vinculado a cuenta del usuario

## SW + PWA

- **Versión actual**: `v1.12.2-b43` (en sw.js debe estar `v1.11.1-b42` — pendiente bump a 1.12.2)
- **STATIC_FILES**: 80+ archivos pre-cacheados
- **3 caches**: volvix-{ver}, volvix-api-{ver}, volvix-rt-{ver}
- **Strategies**: cache-first (statics), network-first SWR (API + HTML)
- **Background Sync**: cola offline en IndexedDB

## Demo data

- 10 demo tenants seeded (340 productos + 8460 ventas)
- Owner SaaS: TNT001 = volvix superadmin
- Cashier demo: cashier@demo / Demo2026! (en seed local — quitado de prod)

## Login flujo

1. POST /api/auth/login con `{ email, password }` → JWT cookie + body
2. JWT contiene `{ user_id, tenant_id, role, permissions }`
3. Front guarda en `localStorage.volvix_token` + cookie HttpOnly
4. `auth-gate.js` redirige a /login.html si no hay JWT válido
5. SSO via `auth-helper.js` para customer-portal
