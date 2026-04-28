# PROGRESS.md — Volvix POS

## Estado actual (2026-04-28, post B43+fixes)

**Producción**: https://volvix-pos.vercel.app
**SW Version**: v1.12.2-b43
**api/index.js**: 16,931 líneas / 628 endpoints
**salvadorex_web_v25.html**: 8,790 líneas
**DB tables**: 30+ con RLS WITH CHECK
**Score real promedio**: 88/100

## Bloques completados en orden cronológico

### B1-B34: Sesiones previas (no en este chat)
- B1: Cross-tenant security RLS (18 tablas hardened)
- B2: Dashboards mock → real
- B3: Vendor portal (2 vendors + 7 POs seeded)
- B4: SSO + i18n
- B5: Tema + i18n grande
- B6: Limpieza final → 86/100
- B7-B12: Deuda técnica → 90/100
- B13-B16: Audit-log + i18n EN +185 → 92/100
- B17-B18: 5 defectos runtime → 94/100
- B19: Smart product search + barcode cascade
- B20-B24: logAudit + mobile + noindex → 96/100
- B25-B28: AI endpoints + audit-log feed → 97/100
- B29: logAudit + Cache-Control + rate-limit → 98/100
- B30: SEO + security hardening + health/full → 99/100
- B31: ETag + rate-limit per-tenant + OpenAPI 3.0.3 → 100/100 (infra)
- B32: Client error reporter + PWA bump
- B33: Uplift wiring auto-inject 8 HTMLs
- B34: Bugs UX críticos + 404 inteligente + ghost button rescuer (100 infra / 88 UX)

### B35 (frontend blitz, 5 agentes paralelos)
- Agent A: Core POS - product edit/delete + inventory + cuts + reports
- Agent B: User/Module mgmt + feature flags + 6 SQL migrations
- Agent C: 10 industry landing pages
- Agent D: Export/import + customer credit
- Agent E: 37 ghost buttons en owner_panel + admin-saas

### B36 (backend blitz, 2 agentes)
- Agent F: 43 endpoints en api/index.js
- Agent G: 5 SQL migrations (cuts, inventory-movements, customer-payments, users-tenant, owner-saas)

### B37 (launch polish, 3 agentes)
- Agent H: Playwright regression suite (58 tests)
- Agent I: 10 demo tenants seed scripts (340 productos, 8460 ventas)
- Agent J: Volvix Launcher + auth-gate hardening 12 admin pages

### B38: PRODUCTION DEPLOY EN VIVO
- vercel deploy + supabase migrations
- Post-fix tenant_id TEXT en cuts/customer_payments/tenant_users/inventory_counts
- Drop audit triggers conflictivos
- E2E cuts + customer payments verified

### B39: Zero-stubs blitz
- Etiquetas backend real (5 endpoints + ESC/POS print)
- 47 stubs eliminated MultiPOS
- 10 stubs eliminated SalvadoreX
- 2 endpoint bugs (owner/tenants 500 + owner/seats UUID)
- 29 lightweight landings (37 giros total)
- 9 SQL tablas nuevas
- Bug "No hay diseña" 16 RESUELTO

### B40: Multi-tenant + Observability + Security hardening
- 7 agentes paralelos (Sentry, Analytics, CFDI mock, WhatsApp HMAC, Mobile Capacitor, Docs, Multi-tenant E2E)
- 5 P0 security fixes (HMAC validation, Origin allowlist, RLS WITH CHECK, etc.)
- 3 UX P0 fixes (broken file links)
- 4 P1 dead buttons + form validations

### B41: Multi-tenant verification + 18 endpoints
- 5 agentes paralelos (backend, mobile, inventory UI, performance, offline+backup)
- Multi-tenant ZERO violations verified
- Cierre Z + Libro Ventas + Kardex SAT-compliant
- BUG crítico Bearer auth en sales offline FIXED
- Capacitor + 12 plugins + Android scaffold
- Inventario UI completa (4 tabs + Kardex modal)

### B42: Audit Fibonacci 1-1-2-3-5-8 (20 agentes)
**Score por módulo**:
- R6-A MultiPOS 100 ⭐
- R5-A Etiquetas 96
- R4-A Customers 94
- R4-B Reportes 92
- R4-C Cortes 92
- R6-B Kiosko 88
- R3-B Inventario 78
- R6-C Vendor 71
- R3-A POS UI 69
- R5-D Owner Panel 67
- R5-C KDS 62
- R5-E Promociones 52
- R6-H Marketplace 50
- R6-G Servicios 42
- R6-E Cotizaciones 41
- R2 Multi-tenant 40
- R6-D AI 39
- R5-B Devoluciones 38

**Bugs detectados B42**: 15 críticos (G1, G3, G4, INV-1, INV-2, KDS-1, KDS-2 cross-tenant leak, Tickets leak, Stub shadow, MVP-9)

### B43: Wave 1 (5 agentes paralelos)
- W1-A: Backend mega-fix (Devoluciones + Owner PATCH + Promociones + Vendor writes + MVP-8 + Multi-tenant)
- W1-B: Frontend UI 3 modules (Devoluciones + Promociones + Cotizaciones)
- W1-C: Marketplace+Shop SEO + Customer Portal SSO loader fix
- W1-D: Servicios+Recargas backend (12 endpoints + 9 providers + 6 carriers seeded)
- W1-E: POS UI 33 partial buttons cleanup (quota cut casi al final)

### B43 Post-fixes (yo directamente)
- Returns shadow fix: removed `/api/returns` de POSTKEYS array
- Returns POST schema fix: pos_sales no tiene tenant_id, query por id + verify pos_user_id
- Quotations UUID→TEXT migration
- Tickets cross-tenant leak fix

## 28/28 endpoints OK (smoke test final)

```
✅ /api/health, /api/products, /api/customers, /api/sales, /api/cuts
✅ /api/inventory-movements, /api/feature-modules, /api/users, /api/owner/tenants
✅ /api/reports/sales, /api/reports/cierre-z, /api/reports/libro-ventas, /api/reports/top-products
✅ /api/notifications, /api/sales/pending, /api/reservations
✅ /api/cfdi/list, /api/whatsapp/messages, /api/admin/backup/list
✅ /api/observability/events, /api/analytics/dashboard
✅ /api/service-payments/providers, /api/recargas/v2/carriers
✅ /api/promotions, /api/quotations, /api/returns, /api/label-templates, /api/inventory/alerts
```

## Bugs FIXED en esta sesión (17 críticos)

1. MVP-9: Cajero ve productos (resolveOwnerPosUserId)
2. G1: sub-tenants/users 500 (user_id NOT NULL)
3. G3: split-brain owner/tenants (lee BOTH pos_companies + sub_tenants)
4. G4: PATCH permissions silently no-op (UUID→TEXT migration)
5. Inventory counts schema (added name+area+notes)
6. Inventory movements qty NOT NULL + type CHECK expanded
7. KDS PATCH await readBody (was sync req.body)
8. KDS cross-tenant leak (CRITICAL — added auth + tenant_id filter)
9. Tickets cross-tenant leak (filter by JWT tenant)
10. Cotizaciones stub shadow (removed `_emptyList`/`_createOk`)
11. Owner PATCH 503 schema_mismatch (W1-A migration)
12. pos_returns table missing (W1-A b43-pos-returns.sql)
13. promotions table missing (W1-A b43-promotions.sql)
14. applyPromoToSale dead code (W1-A wired in POST /api/sales)
15. Audit triggers conflictivos (10 dropped)
16. Returns shadow + pos_sales tenant_id query (post-W1-A)
17. pos_quotations UUID→TEXT (post-W1-A)

## Pendientes (NO arreglados aún)

- MVP-8 cierre-z reporta sales_count:0 (mi fix deployed pero no funciona aún)
- Devoluciones POST refund_amount:0 (items no se calcula bien — items field vs items_returned shape mismatch)
- Cotizaciones items column mismatch entre handler y tabla
- AI Modules 39/100 — bloqueado por ANTHROPIC_API_KEY missing en Vercel env
- Recargas/Servicios UI completa pendiente (backend listo, falta frontend)
- 33 PARTIAL buttons en POS UI (W1-E quedó incompleto por quota)

## Pendientes por credenciales (NO se puede sin acción del usuario)

1. **CFDI/Facturama** — usuario va a pasar credenciales (acordamos al final)
2. **Stripe** — crear products en Dashboard + secret key
3. **WhatsApp** — Wasender o Meta API key
4. **Email** — SMTP/SendGrid creds
5. **ANTHROPIC_API_KEY** — set en Vercel env (1 click)
6. **Android keystore** — keytool generate
7. **iOS** — Mac + Apple Dev account ($99/año)
8. **Custom domain** — comprar volvix.com + DNS
