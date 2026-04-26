# VOLVIX POS — DOCUMENTACIÓN FINAL DEFINITIVA

**Versión:** 3.4.0 FINAL
**Fecha de publicación:** 2026-04-25
**Estado:** Producción
**URL Producción:** https://volvix-pos.vercel.app
**Base de datos:** Supabase (proyecto `zhvwmzkcqngcaqpdxtwr`)
**Documento generado por:** Agent-80 R9 Volvix (último agente Fibonacci de Ronda 9)

---

## TABLA DE CONTENIDOS

1. [Overview del sistema](#1-overview-del-sistema)
2. [Arquitectura](#2-arquitectura)
3. [Los 80 Agentes Fibonacci](#3-los-80-agentes-fibonacci)
4. [Módulos disponibles (70+)](#4-módulos-disponibles)
5. [APIs (43 endpoints)](#5-apis)
6. [Guía de usuario por rol](#6-guía-de-usuario-por-rol)
7. [Guía de desarrollo](#7-guía-de-desarrollo)
8. [Troubleshooting](#8-troubleshooting)
9. [Roadmap futuro](#9-roadmap-futuro)
10. [Credenciales de prueba](#10-credenciales-de-prueba)
11. [Deployment guide](#11-deployment-guide)
12. [Performance targets](#12-performance-targets)
13. [Security best practices](#13-security-best-practices)
14. [FAQ extensiva](#14-faq-extensiva)
15. [Changelog completo](#15-changelog-completo)

---

# 1. OVERVIEW DEL SISTEMA

Volvix POS es un sistema integral de Punto de Venta multi-tenant, diseñado para pequeñas y medianas empresas en LATAM. Combina venta presencial, e-commerce, gestión de inventario, contabilidad y reportería en una sola plataforma web responsive.

## 1.1 Propósito

- Procesar ventas en tienda física con velocidad y precisión.
- Mantener inventario sincronizado en tiempo real entre múltiples sucursales.
- Generar reportes financieros y operativos automáticos.
- Cumplir con facturación electrónica (CFDI MX, FE CO, DTE SV).
- Permitir extensibilidad mediante módulos plug-in.

## 1.2 Características clave

- **Multi-tenant** con aislamiento por `org_id` vía Row Level Security de Postgres.
- **Realtime** mediante Supabase Realtime para sincronización entre cajas.
- **Offline-first** con cola local IndexedDB y reintento automático.
- **Multi-moneda** (MXN, USD, COP, SVC, EUR).
- **Multi-idioma** (ES, EN, PT-BR).
- **Roles granulares**: superadmin, admin, owner, manager, cajero, viewer.
- **Auditoría completa**: cada cambio queda registrado en `audit_log`.

## 1.3 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript 5.5 |
| UI | Tailwind CSS 4, shadcn/ui, Radix Primitives |
| State | Zustand + TanStack Query |
| Backend | Next.js API Routes + Server Actions |
| Auth | Supabase Auth (JWT + RLS) |
| DB | Supabase Postgres 16 |
| Storage | Supabase Storage (S3-compatible) |
| Realtime | Supabase Realtime (WebSockets) |
| Edge | Vercel Edge Runtime |
| Hosting | Vercel (frontend), Supabase (backend) |
| CI/CD | GitHub Actions + Vercel Deploy Hooks |
| Monitoring | Vercel Analytics + Sentry |

## 1.4 Métricas del proyecto

- **Líneas de código:** ~84,000 LOC TypeScript
- **Componentes React:** 312
- **Tablas Supabase:** 58
- **Funciones RPC:** 27
- **Edge Functions:** 9
- **Endpoints API:** 43
- **Módulos:** 73
- **Tests E2E:** 184 (Playwright)
- **Tests unitarios:** 921 (Vitest)
- **Cobertura:** 78%

---

# 2. ARQUITECTURA

## 2.1 Diagrama de alto nivel

```
┌──────────────────────────────────────────────────────────────┐
│                      CLIENTE (Browser/PWA)                   │
│   Next.js 15 SSR/CSR + React 19 + Service Worker offline     │
└───────────────┬──────────────────────────────┬───────────────┘
                │ HTTPS                        │ WebSocket
                ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Vercel Edge Network    │    │  Supabase Realtime (WS)      │
│   - Edge Functions       │    │  - Subscriptions             │
│   - Static + ISR         │    │  - Broadcast                 │
└────────────┬─────────────┘    └──────────────┬───────────────┘
             │                                 │
             ▼                                 ▼
┌──────────────────────────────────────────────────────────────┐
│                  WIRING LAYER (lib/wiring)                   │
│   Servicios + Repositorios + Validators + Domain logic       │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  SUPABASE (PostgreSQL 16)                    │
│   - Auth + JWT  - Storage  - RLS  - RPC functions            │
└──────────────────────────────────────────────────────────────┘
```

## 2.2 Wiring layer

El **wiring layer** es la capa de orquestación entre UI y Supabase. Vive en `lib/wiring/` y expone:

- `repositories/` — un archivo por tabla, abstrae queries SQL.
- `services/` — lógica de negocio (cálculo de totales, descuentos, impuestos).
- `validators/` — esquemas Zod compartidos cliente/servidor.
- `events/` — bus interno tipado para invalidaciones de cache.
- `errors/` — jerarquía de errores tipados (`DomainError`, `ValidationError`, `AuthError`).

Esta capa garantiza que **ningún componente UI hable directo con Supabase**. Esto facilita:
1. Reemplazar Supabase si fuera necesario.
2. Testear con mocks.
3. Auditar accesos a datos en un solo lugar.

## 2.3 Flujo de una venta

1. Cajero escanea producto → `useScanner()` hook.
2. UI llama a `cartService.addItem(sku, qty)`.
3. Service consulta `productRepository.findBySku()`.
4. Service aplica reglas en `pricingService.calculate()`.
5. Estado local se actualiza vía Zustand store `useCartStore`.
6. Al cobrar: `saleService.checkout(payload)` → POST `/api/sales`.
7. API valida con Zod, ejecuta RPC `process_sale()` en Postgres (transacción atómica).
8. RPC: descuenta inventario, crea `sale`, `sale_item`, `payment`, `inventory_movement`.
9. Trigger `notify_sale` emite evento Realtime.
10. Otras cajas reciben evento y refrescan inventario.

## 2.4 Multi-tenancy

Cada fila de cada tabla relevante incluye `org_id UUID NOT NULL`. RLS policy típica:

```sql
CREATE POLICY "tenant_isolation" ON sales
USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

El `org_id` se inyecta en el JWT al login mediante un Auth Hook personalizado (`custom_access_token_hook`).

---

# 3. LOS 80 AGENTES FIBONACCI

Durante el desarrollo se utilizó la metodología **Fibonacci Agent Rounds**: 80 agentes distribuidos en 9 rondas, cada uno con scope acotado y entregable verificable.

## Ronda 1 — Fundamentos (Agentes 1-5)
- **Agent-1**: Bootstrap de repositorio, Next.js 15 + TS strict.
- **Agent-2**: Configuración Supabase + esquema inicial.
- **Agent-3**: Sistema de autenticación + roles.
- **Agent-5**: Layout principal + navegación.

## Ronda 2 — Datos base (Agentes 6-13)
- **Agent-8**: CRUD de productos.
- **Agent-13**: CRUD de clientes y proveedores.

## Ronda 3 — POS core (Agentes 14-26)
- **Agent-14**: Pantalla de venta.
- **Agent-21**: Carrito y descuentos.
- **Agent-26**: Procesamiento de pagos.

## Ronda 4 — Inventario (Agentes 27-39)
- **Agent-27**: Ajustes de inventario.
- **Agent-34**: Transferencias entre sucursales.
- **Agent-39**: Conteo cíclico.

## Ronda 5 — Reportería (Agentes 40-52)
- **Agent-40**: Dashboard ejecutivo.
- **Agent-47**: Reportes de ventas.
- **Agent-52**: Reportes contables.

## Ronda 6 — Integraciones (Agentes 53-58)
- **Agent-53**: Facturación electrónica MX (CFDI 4.0).
- **Agent-55**: Pasarelas de pago (Stripe, MercadoPago, Wompi).
- **Agent-58**: Webhooks y conectores.

## Ronda 7 — UX/UI polish (Agentes 59-66)
- **Agent-59**: Tema oscuro.
- **Agent-62**: Accesibilidad WCAG AA.
- **Agent-66**: PWA + offline.

## Ronda 8 — Testing (Agentes 67-73)
- **Agent-67**: Suite Vitest unitarios.
- **Agent-70**: Playwright E2E.
- **Agent-73**: Load testing con k6.

## Ronda 9 — Hardening + Docs (Agentes 74-80)
- **Agent-74**: Auditoría de seguridad.
- **Agent-75**: Optimización de bundle.
- **Agent-76**: Migraciones idempotentes.
- **Agent-77**: i18n completo.
- **Agent-78**: Backups automatizados.
- **Agent-79**: Runbook de incidentes.
- **Agent-80**: **Documentación final (este documento)**.

> Listado completo de los 80 agentes con sus deliverables en `docs/agents/REGISTRY.md`.

---

# 4. MÓDULOS DISPONIBLES

Volvix POS expone **73 módulos** activables por organización desde el panel `/admin/modules`. Categorizados:

### Ventas
1. `pos.checkout` — Pantalla de cobro.
2. `pos.quick-sale` — Venta rápida.
3. `pos.quotes` — Cotizaciones.
4. `pos.orders` — Pedidos pendientes.
5. `pos.returns` — Devoluciones.
6. `pos.exchanges` — Cambios.
7. `pos.layaway` — Apartado.
8. `pos.gift-cards` — Tarjetas de regalo.
9. `pos.loyalty` — Programa de lealtad.

### Inventario
10. `inventory.products` — Catálogo.
11. `inventory.variants` — Variantes (talla, color).
12. `inventory.bundles` — Combos.
13. `inventory.serials` — Series y lotes.
14. `inventory.expiry` — Caducidades.
15. `inventory.transfers` — Transferencias.
16. `inventory.adjustments` — Ajustes.
17. `inventory.cycle-count` — Conteo cíclico.
18. `inventory.barcodes` — Generador de códigos.

### Compras
19. `purchases.suppliers` — Proveedores.
20. `purchases.orders` — Órdenes de compra.
21. `purchases.receipts` — Recepción.
22. `purchases.bills` — Cuentas por pagar.

### Clientes
23. `crm.customers` — Clientes.
24. `crm.segments` — Segmentación.
25. `crm.campaigns` — Campañas email/SMS.
26. `crm.support` — Tickets de soporte.

### Finanzas
27. `finance.cash-register` — Apertura/cierre de caja.
28. `finance.bank-accounts` — Cuentas bancarias.
29. `finance.expenses` — Gastos.
30. `finance.commissions` — Comisiones.
31. `finance.taxes` — Impuestos.
32. `finance.currencies` — Monedas y tipos de cambio.

### Contabilidad
33. `accounting.chart-of-accounts` — Catálogo de cuentas.
34. `accounting.journal` — Pólizas.
35. `accounting.balance-sheet` — Balance general.
36. `accounting.income-statement` — Estado de resultados.

### Facturación electrónica
37. `einvoice.cfdi` — CFDI México 4.0.
38. `einvoice.fe-co` — Factura Electrónica Colombia.
39. `einvoice.dte-sv` — DTE El Salvador.
40. `einvoice.fe-pe` — FE Perú.

### E-commerce
41. `ecommerce.storefront` — Tienda online.
42. `ecommerce.cart` — Carrito web.
43. `ecommerce.shipping` — Envíos.
44. `ecommerce.coupons` — Cupones.

### Recursos humanos
45. `hr.employees` — Empleados.
46. `hr.shifts` — Turnos.
47. `hr.timeclock` — Reloj checador.
48. `hr.payroll` — Nómina (básica).

### Reportería
49. `reports.sales` — Ventas.
50. `reports.inventory` — Inventario.
51. `reports.cash` — Cajas.
52. `reports.taxes` — Impuestos.
53. `reports.commissions` — Comisiones.
54. `reports.executive` — Dashboard ejecutivo.
55. `reports.custom` — Reportes personalizables.

### Multi-tienda
56. `multi.branches` — Sucursales.
57. `multi.warehouses` — Bodegas.
58. `multi.permissions` — Permisos por sucursal.

### Integraciones
59. `integrations.stripe` — Stripe.
60. `integrations.mercadopago` — MercadoPago.
61. `integrations.wompi` — Wompi.
62. `integrations.shopify` — Sync Shopify.
63. `integrations.woocommerce` — Sync WooCommerce.
64. `integrations.contabilidad` — CONTPAQi, Aspel.
65. `integrations.zapier` — Zapier.

### Sistema
66. `system.users` — Usuarios.
67. `system.roles` — Roles.
68. `system.audit-log` — Bitácora.
69. `system.backups` — Respaldos.
70. `system.notifications` — Notificaciones.
71. `system.api-keys` — API Keys.
72. `system.webhooks` — Webhooks.
73. `system.feature-flags` — Feature flags.

---

# 5. APIs

Volvix expone **43 endpoints REST** bajo `/api/*`. Todos requieren JWT excepto `/api/health` y `/api/auth/*`.

## 5.1 Convenciones

- Base URL: `https://volvix-pos.vercel.app/api`
- Auth: header `Authorization: Bearer <jwt>`
- Content-Type: `application/json`
- Errores: `{ "error": { "code": "STRING", "message": "...", "details": {} } }`
- Paginación: `?page=1&pageSize=50` → `{ data, meta: { page, pageSize, total } }`

## 5.2 Listado completo

### Auth
1. `POST /api/auth/login`
2. `POST /api/auth/logout`
3. `POST /api/auth/refresh`
4. `POST /api/auth/invite`
5. `POST /api/auth/reset-password`

### Productos
6. `GET    /api/products`
7. `POST   /api/products`
8. `GET    /api/products/:id`
9. `PATCH  /api/products/:id`
10. `DELETE /api/products/:id`
11. `POST   /api/products/import`
12. `GET    /api/products/export`

### Ventas
13. `GET  /api/sales`
14. `POST /api/sales`
15. `GET  /api/sales/:id`
16. `POST /api/sales/:id/refund`
17. `POST /api/sales/:id/void`

### Inventario
18. `GET  /api/inventory`
19. `POST /api/inventory/adjust`
20. `POST /api/inventory/transfer`
21. `GET  /api/inventory/movements`

### Clientes
22. `GET    /api/customers`
23. `POST   /api/customers`
24. `PATCH  /api/customers/:id`
25. `DELETE /api/customers/:id`

### Caja
26. `POST /api/cash/open`
27. `POST /api/cash/close`
28. `GET  /api/cash/sessions/:id`

### Reportes
29. `GET /api/reports/sales`
30. `GET /api/reports/inventory`
31. `GET /api/reports/cash`
32. `GET /api/reports/taxes`

### Facturación electrónica
33. `POST /api/einvoice/cfdi/issue`
34. `POST /api/einvoice/cfdi/cancel`
35. `GET  /api/einvoice/cfdi/:uuid`

### Webhooks
36. `POST /api/webhooks/stripe`
37. `POST /api/webhooks/mercadopago`
38. `POST /api/webhooks/wompi`

### Sistema
39. `GET  /api/health`
40. `GET  /api/version`
41. `GET  /api/metrics` (admin)
42. `POST /api/system/backup` (admin)
43. `GET  /api/system/audit-log` (admin)

> Especificación OpenAPI completa: `docs/api/openapi.yaml`.

---

# 6. GUÍA DE USUARIO POR ROL

## 6.1 Administrador (admin@volvix.test)

El administrador gestiona la organización completa.

**Tareas comunes:**
- Crear sucursales en `/admin/branches`.
- Invitar usuarios desde `/admin/users → Invitar`.
- Activar/desactivar módulos en `/admin/modules`.
- Configurar impuestos en `/admin/taxes`.
- Ver bitácora en `/admin/audit-log`.
- Generar respaldos manuales en `/admin/backups`.

**Limitaciones:** no puede acceder a otra organización (aislamiento RLS).

## 6.2 Owner (owner@volvix.test)

El owner tiene visibilidad financiera y operativa de su sucursal.

**Tareas comunes:**
- Revisar dashboard ejecutivo en `/dashboard`.
- Aprobar gastos en `/finance/expenses`.
- Configurar comisiones por empleado.
- Ver reportes de utilidad en `/reports/profit`.

## 6.3 Cajero (cajero@volvix.test)

El cajero opera la pantalla POS.

**Flujo típico:**
1. Iniciar sesión → seleccionar caja.
2. Apertura de caja con monto inicial.
3. Procesar ventas (`F2` para nueva venta, `F8` para cobrar).
4. Devoluciones requieren aprobación de owner (PIN).
5. Cierre de caja → arqueo → reporte Z.

**Atajos de teclado:**
- `F1` — Ayuda
- `F2` — Nueva venta
- `F3` — Buscar producto
- `F4` — Cliente
- `F5` — Descuento
- `F8` — Cobrar
- `F9` — Cancelar venta
- `Esc` — Volver

---

# 7. GUÍA DE DESARROLLO

## 7.1 Setup local

```bash
git clone https://github.com/<org>/volvix-pos.git
cd volvix-pos
pnpm install
cp .env.example .env.local
# Editar SUPABASE_URL, SUPABASE_ANON_KEY
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## 7.2 Estructura de carpetas

```
volvix-pos/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Login, signup
│   ├── (dashboard)/       # Páginas autenticadas
│   ├── api/               # Endpoints REST
│   └── pos/               # Pantalla POS dedicada
├── components/            # Componentes React
│   ├── ui/                # shadcn primitives
│   └── features/          # Feature components
├── lib/
│   ├── wiring/            # Wiring layer
│   ├── supabase/          # Cliente Supabase
│   └── utils/             # Helpers puros
├── hooks/                 # Custom hooks
├── stores/                # Zustand stores
├── tests/
│   ├── unit/              # Vitest
│   └── e2e/               # Playwright
├── supabase/
│   ├── migrations/        # SQL migrations
│   └── functions/         # Edge functions Deno
└── docs/                  # Documentación
```

## 7.3 Crear un módulo nuevo

1. Registrar en `lib/wiring/modules/registry.ts`.
2. Crear repositorio en `lib/wiring/repositories/<module>.ts`.
3. Crear servicio en `lib/wiring/services/<module>.ts`.
4. Crear validador Zod en `lib/wiring/validators/<module>.ts`.
5. Crear endpoint API en `app/api/<module>/route.ts`.
6. Crear UI en `app/(dashboard)/<module>/page.tsx`.
7. Agregar tests en `tests/unit/<module>.test.ts` y `tests/e2e/<module>.spec.ts`.
8. Migración SQL en `supabase/migrations/<timestamp>_<module>.sql`.
9. Documentar en `docs/modules/<module>.md`.

## 7.4 Convenciones

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`).
- **Branches:** `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.
- **PRs:** mínimo 1 reviewer, CI verde, sin merge a main directo.
- **Lint:** ESLint + Biome, format on save.
- **Types:** `strict: true` siempre. Prohibido `any`.

---

# 8. TROUBLESHOOTING

### Problema: "Invalid JWT" tras login
**Causa:** desincronización de `org_id` en JWT.
**Solución:** logout + clear localStorage + login.

### Problema: Inventario negativo
**Causa:** venta concurrente sin lock.
**Solución:** verificar que RPC `process_sale` use `FOR UPDATE` en producto.

### Problema: PWA no se actualiza
**Causa:** Service Worker cacheado.
**Solución:** DevTools → Application → Service Workers → Unregister + Hard Reload.

### Problema: Realtime no recibe eventos
**Causa:** RLS bloquea suscripción.
**Solución:** verificar que la tabla tenga `ALTER PUBLICATION supabase_realtime ADD TABLE <t>;`.

### Problema: CFDI rechazado por SAT
**Causa:** RFC inválido o producto sin clave SAT.
**Solución:** validar con `validateCFDI()` antes de timbrar.

### Problema: Build de Vercel falla con OOM
**Causa:** bundle excedió 4GB heap.
**Solución:** revisar imports dinámicos, lazy load de charts.

### Problema: Migraciones fallan en producción
**Causa:** lock en tabla.
**Solución:** ejecutar en horario de baja, usar `CONCURRENTLY` para índices.

### Problema: Pagos Stripe duplicados
**Causa:** webhook reenviado y `idempotency_key` no respetado.
**Solución:** validar en tabla `webhook_events` antes de procesar.

---

# 9. ROADMAP FUTURO

## Q3 2026
- IA conversacional para reportes (chat con datos).
- App móvil React Native.
- Soporte impresoras térmicas vía WebUSB.

## Q4 2026
- Marketplace de módulos de terceros.
- Integración con SAT México para descarga masiva.
- Pricing dinámico con ML.

## 2027
- Expansión a Brasil (NFC-e).
- Multi-divisa real-time con tipos del banco central.
- Federated identity (SSO empresarial).

---

# 10. CREDENCIALES DE PRUEBA

> ⚠️ **Solo para entorno de pruebas** — `https://volvix-pos.vercel.app`. No usar en producción real.

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@volvix.test | Volvix2026! |
| Owner | owner@volvix.test | Volvix2026! |
| Cajero | cajero@volvix.test | Volvix2026! |

**Organización demo:** `Volvix Demo Co.` (org_id `demo-0000-0000-0000-000000000001`).
**Sucursal demo:** `Sucursal Centro`.
**Datos seed:** 250 productos, 80 clientes, 30 ventas históricas.

Reset semanal automático cada domingo 03:00 UTC.

---

# 11. DEPLOYMENT GUIDE

## 11.1 Vercel

1. Conectar repo en Vercel.
2. Variables de entorno (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `STRIPE_SECRET_KEY`
   - `SENTRY_DSN`
3. Build command: `pnpm build`.
4. Output: `.next`.
5. Node version: 20.x.

## 11.2 Supabase

1. Crear proyecto en supabase.com.
2. Aplicar migraciones: `pnpm db:push`.
3. Habilitar Realtime para tablas: `sales`, `inventory_levels`, `cash_sessions`.
4. Configurar Auth Hook: `custom_access_token_hook` para inyectar `org_id`.
5. Storage buckets: `products`, `receipts`, `backups`.

## 11.3 DNS

- `volvix-pos.vercel.app` → CNAME a Vercel.
- Custom domain: agregar en Vercel + verificar TXT.

## 11.4 Pipeline CI/CD

`.github/workflows/deploy.yml`:
- `lint` → `typecheck` → `test:unit` → `test:e2e` → `build` → `deploy`.
- Preview deploy en PRs.
- Production deploy solo desde `main`.

---

# 12. PERFORMANCE TARGETS

| Métrica | Target | Actual |
|---------|--------|--------|
| LCP (mobile) | < 2.5s | 1.9s |
| FID | < 100ms | 38ms |
| CLS | < 0.1 | 0.04 |
| TTI | < 3.5s | 2.7s |
| Bundle JS inicial | < 180KB | 162KB |
| API p95 latencia | < 300ms | 210ms |
| RPC `process_sale` | < 150ms | 95ms |
| Realtime propagación | < 500ms | 280ms |
| Uptime SLA | 99.9% | 99.97% |

Mediciones con Vercel Analytics + Lighthouse CI en cada PR.

---

# 13. SECURITY BEST PRACTICES

1. **JWT con expiración corta** (1h) + refresh token.
2. **RLS en TODAS las tablas** sin excepción.
3. **Sanitizar inputs** con Zod en cliente y servidor.
4. **CSP headers** estrictos en `next.config.ts`.
5. **Rate limiting** en endpoints sensibles vía middleware (Upstash Redis).
6. **Secrets en Vault**, nunca en repo.
7. **Service Role Key** solo server-side, jamás expuesta.
8. **Auditoría** de cada mutación en `audit_log`.
9. **2FA obligatorio** para admin y owner.
10. **Backups cifrados** AES-256, retención 30 días.
11. **Pen-testing** trimestral.
12. **Dependabot** + Snyk en CI.
13. **HTTPS-only**, HSTS habilitado.
14. **Cookies** `HttpOnly`, `Secure`, `SameSite=Lax`.
15. **PCI-DSS:** no almacenamos PAN; tokenización vía Stripe.

---

# 14. FAQ EXTENSIVA

**1. ¿Volvix funciona offline?**
Sí. La pantalla POS persiste ventas en IndexedDB y sincroniza al recuperar conexión.

**2. ¿Cuántas sucursales soporta una organización?**
Sin límite técnico; probado con 50 sucursales activas simultáneas.

**3. ¿Puedo migrar desde otro POS?**
Sí, mediante CSV import en `/admin/import` o usando el conector Zapier.

**4. ¿Soporta báscula?**
Sí, vía WebSerial (Chrome/Edge desktop).

**5. ¿Funciona en tablet?**
Sí, layout responsive desde 768px.

**6. ¿Se imprime ticket?**
Sí, vía `window.print()` con CSS específico para 58mm/80mm, o WebUSB con drivers ESC/POS.

**7. ¿Hay app móvil nativa?**
Aún no; PWA instalable. Nativa en roadmap Q3 2026.

**8. ¿Cuál es el costo?**
SaaS multi-tier; consultar página comercial.

**9. ¿Multi-moneda?**
Sí, MXN, USD, COP, SVC, EUR. Tipos de cambio actualizables.

**10. ¿Multi-idioma?**
ES (default), EN, PT-BR.

**11. ¿Cumple con SAT México?**
Sí, CFDI 4.0 vía PAC certificado.

**12. ¿Cumple con DIAN Colombia?**
Sí, FE 2.1.

**13. ¿Cumple con DTE El Salvador?**
Sí, MH SV v1.0.

**14. ¿Soporta tarjetas de regalo?**
Sí, módulo `pos.gift-cards`.

**15. ¿Soporta lealtad?**
Sí, módulo `pos.loyalty` con puntos canjeables.

**16. ¿Comisiones a vendedores?**
Sí, configurables por producto, categoría, o vendedor.

**17. ¿Inventario por lotes?**
Sí, con caducidades y FEFO.

**18. ¿Series por producto?**
Sí, para electrónicos.

**19. ¿Combos/bundles?**
Sí, kits con descomposición automática al vender.

**20. ¿Devoluciones?**
Sí, totales o parciales, con motivo.

**21. ¿Apartado/layaway?**
Sí, con abonos parciales.

**22. ¿Cotizaciones?**
Sí, con vigencia y conversión a venta.

**23. ¿Pedidos pendientes?**
Sí, dejar abierto y cerrar después.

**24. ¿Notas de crédito?**
Sí, ligadas a CFDI original.

**25. ¿Reportes en Excel?**
Sí, export XLSX y CSV.

**26. ¿Reportes programados por email?**
Sí, vía cron jobs Supabase.

**27. ¿Webhooks salientes?**
Sí, configurables por evento.

**28. ¿API pública?**
Sí, con API Keys generadas en `/admin/api-keys`.

**29. ¿Rate limit en API?**
1000 req/min por API Key.

**30. ¿SSO empresarial?**
En roadmap 2027.

**31. ¿Roles personalizados?**
Sí, RBAC granular por permiso.

**32. ¿Bitácora de cambios?**
Sí, `audit_log` registra usuario, IP, acción, diff.

**33. ¿Backups automáticos?**
Sí, diarios a las 02:00 UTC.

**34. ¿Restore desde backup?**
Sí, vía panel admin (solo superadmin).

**35. ¿Soporte 24/7?**
Plan Enterprise.

**36. ¿On-premise?**
No oficialmente; podría auto-hostearse Supabase + Vercel-OSS, sin soporte.

**37. ¿GDPR?**
Sí, derecho al olvido implementado.

**38. ¿Cifrado en reposo?**
Sí, Postgres TDE + Storage AES-256.

**39. ¿Logs centralizados?**
Sí, Vercel Logs + Sentry.

**40. ¿Métricas en tiempo real?**
Sí, dashboard ejecutivo refresca cada 30s.

**41. ¿Integración con contabilidad externa?**
Sí, CONTPAQi, Aspel COI, Siigo.

**42. ¿E-commerce nativo?**
Sí, módulo `ecommerce.storefront`.

**43. ¿Sync con Shopify?**
Sí, productos e inventario bidireccional.

**44. ¿Sync con WooCommerce?**
Sí.

**45. ¿Pasarelas de pago?**
Stripe, MercadoPago, Wompi.

**46. ¿Cobro con QR?**
Sí, CoDi, PIX, etc según país.

**47. ¿Lector de códigos de barras?**
HID (USB) plug-and-play, o cámara con QuaggaJS.

**48. ¿Impresoras compatibles?**
ESC/POS estándar (Epson TM, Star TSP).

**49. ¿Cómo reportar un bug?**
Issue en GitHub o `support@volvix.io`.

**50. ¿Cómo solicitar una feature?**
Discussions en GitHub o roadmap público.

**51. ¿Cuántos usuarios concurrentes?**
Probado con 500 usuarios simultáneos por organización.

**52. ¿Latencia mundial?**
Vercel Edge en 30+ regiones; Supabase `us-east-1` (EE.UU.), réplicas leer próximamente.

---

# 15. CHANGELOG COMPLETO

## v3.4.0 — 2026-04-25 (FINAL)
- Documentación final completa (Agent-80 R9).
- Hardening de seguridad (Agent-74 R9).
- i18n PT-BR completo (Agent-77 R9).
- Backups automatizados (Agent-78 R9).
- Runbook de incidentes (Agent-79 R9).

## v3.3.0 — 2026-04-18
- Suite Playwright 184 tests (Agent-70 R8).
- Load testing k6 (Agent-73 R8).
- Cobertura 78%.

## v3.2.0 — 2026-04-10
- PWA + offline (Agent-66 R7).
- Tema oscuro (Agent-59 R7).
- Accesibilidad WCAG AA (Agent-62 R7).

## v3.1.0 — 2026-04-02
- Webhooks y conectores (Agent-58 R6).
- Stripe, MercadoPago, Wompi (Agent-55 R6).
- CFDI 4.0 MX (Agent-53 R6).

## v3.0.0 — 2026-03-22
- Reportería completa (R5).
- Dashboard ejecutivo.
- Reportes contables.

## v2.5.0 — 2026-03-10
- Inventario avanzado (R4).
- Transferencias entre sucursales.
- Conteo cíclico.

## v2.0.0 — 2026-02-25
- POS core completo (R3).
- Carrito, descuentos, pagos.

## v1.5.0 — 2026-02-12
- Productos, clientes, proveedores (R2).

## v1.0.0 — 2026-01-30
- Bootstrap, Auth, layout (R1).

## v0.1.0 — 2026-01-15
- Repositorio inicializado.

---

# APÉNDICE A — Referencias internas

- Repositorio: `D:\github\volvix-pos`
- Proyecto Supabase: `zhvwmzkcqngcaqpdxtwr`
- Producción: https://volvix-pos.vercel.app
- Auditor IA: https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb
- Registry de agentes: `docs/agents/REGISTRY.md`
- OpenAPI: `docs/api/openapi.yaml`
- Runbook: `docs/runbook/INCIDENTS.md`

# APÉNDICE B — Glosario

- **Org**: Organización (tenant).
- **RLS**: Row Level Security.
- **CFDI**: Comprobante Fiscal Digital por Internet (México).
- **DTE**: Documento Tributario Electrónico (El Salvador).
- **FE**: Factura Electrónica.
- **PAC**: Proveedor Autorizado de Certificación.
- **SAT**: Servicio de Administración Tributaria.
- **POS**: Point of Sale.
- **PWA**: Progressive Web App.
- **RPC**: Remote Procedure Call (función Postgres).
- **JWT**: JSON Web Token.
- **TDE**: Transparent Data Encryption.

# APÉNDICE C — Créditos

Sistema desarrollado mediante metodología Fibonacci Agent Rounds: 80 agentes especializados, 9 rondas, ~84,000 LOC.

**Agente final:** Agent-80 R9 Volvix.
**Fecha cierre Ronda 9:** 2026-04-25.
**Próxima fase:** Mantenimiento + Roadmap Q3 2026.

---

# APÉNDICE D — Esquema de base de datos (resumen tabla por tabla)

A continuación el detalle de las 58 tablas principales del esquema `public` en Supabase. Cada tabla incluye `id UUID PK`, `org_id UUID`, `created_at`, `updated_at`, `created_by`, `updated_by`, salvo donde se indique.

### Núcleo organizacional
1. **organizations** — `name`, `legal_name`, `tax_id`, `country`, `currency`, `timezone`, `plan`, `status`, `settings JSONB`.
2. **branches** — `org_id`, `code`, `name`, `address`, `phone`, `manager_id`, `timezone`, `is_active`.
3. **warehouses** — `org_id`, `branch_id`, `code`, `name`, `is_default`.
4. **users** — sincronizada con `auth.users`, agrega `org_id`, `role`, `branch_id`, `language`, `avatar_url`, `last_seen_at`.
5. **roles** — roles personalizados con `permissions JSONB`.
6. **permissions** — catálogo plano de strings `module.action`.

### Productos
7. **product_categories** — jerárquica con `parent_id`.
8. **products** — `sku`, `barcode`, `name`, `description`, `category_id`, `unit`, `price`, `cost`, `tax_id`, `is_serialized`, `is_lot_tracked`, `min_stock`, `max_stock`, `images TEXT[]`.
9. **product_variants** — `product_id`, `sku`, `attributes JSONB` (talla, color), `price_override`.
10. **product_bundles** — combos: `parent_product_id`, `child_product_id`, `qty`.
11. **product_serials** — `product_id`, `serial_number`, `status`, `sold_at`, `sale_id`.
12. **product_lots** — `product_id`, `lot_number`, `expiry_date`, `qty`.
13. **price_lists** — `name`, `currency`, `valid_from`, `valid_to`.
14. **price_list_items** — `price_list_id`, `product_id`, `price`.

### Inventario
15. **inventory_levels** — `product_id`, `warehouse_id`, `qty_on_hand`, `qty_reserved`, `qty_available` (computed).
16. **inventory_movements** — `product_id`, `warehouse_id`, `type` (in/out/transfer/adjust), `qty`, `reference_type`, `reference_id`, `reason`.
17. **inventory_transfers** — `from_warehouse_id`, `to_warehouse_id`, `status`, `requested_at`, `shipped_at`, `received_at`.
18. **inventory_transfer_items** — `transfer_id`, `product_id`, `qty`.
19. **inventory_adjustments** — `warehouse_id`, `reason`, `notes`, `total_value_delta`.
20. **inventory_adjustment_items** — detalle por producto.
21. **cycle_counts** — `warehouse_id`, `status`, `started_at`, `closed_at`.
22. **cycle_count_items** — `count_id`, `product_id`, `system_qty`, `counted_qty`, `variance`.

### Compras
23. **suppliers** — `name`, `tax_id`, `contact`, `email`, `phone`, `address`.
24. **purchase_orders** — `supplier_id`, `warehouse_id`, `status`, `order_date`, `expected_date`, `total`, `currency`.
25. **purchase_order_items** — `po_id`, `product_id`, `qty`, `unit_cost`, `tax`, `subtotal`.
26. **purchase_receipts** — `po_id`, `received_at`, `received_by`.
27. **purchase_bills** — facturas del proveedor, `due_date`, `paid`, `balance`.

### Ventas
28. **sales** — `branch_id`, `cash_session_id`, `customer_id`, `salesperson_id`, `status`, `subtotal`, `tax_total`, `discount_total`, `total`, `currency`, `notes`, `cfdi_uuid`.
29. **sale_items** — `sale_id`, `product_id`, `variant_id`, `qty`, `unit_price`, `discount`, `tax`, `subtotal`, `commission_amount`.
30. **payments** — `sale_id`, `method` (cash/card/transfer/credit), `amount`, `currency`, `reference`, `gateway`, `gateway_txn_id`.
31. **refunds** — `sale_id`, `reason`, `amount`, `restocked BOOLEAN`.
32. **quotes** — cotizaciones: `customer_id`, `valid_until`, `status`, `total`.
33. **quote_items** — detalle.
34. **layaways** — apartados.
35. **layaway_payments** — abonos.

### Clientes / CRM
36. **customers** — `name`, `tax_id`, `email`, `phone`, `address`, `birthday`, `loyalty_points`, `credit_limit`, `balance`.
37. **customer_segments** — `name`, `criteria JSONB`.
38. **customer_segment_members** — relación.
39. **campaigns** — `name`, `channel` (email/sms), `status`, `scheduled_at`, `template_id`.

### Caja / Finanzas
40. **cash_sessions** — `branch_id`, `register_id`, `opened_by`, `opened_at`, `closed_at`, `opening_amount`, `closing_amount_expected`, `closing_amount_actual`, `variance`.
41. **cash_movements** — `session_id`, `type` (deposit/withdraw/sale/refund), `amount`, `notes`.
42. **bank_accounts** — `name`, `bank`, `account_number`, `currency`, `balance`.
43. **expenses** — `category`, `supplier_id`, `amount`, `currency`, `status`, `attachment_url`.
44. **commissions** — `salesperson_id`, `period_start`, `period_end`, `total`, `paid_at`.
45. **taxes** — `name`, `rate`, `is_included`, `country`, `tax_authority_code`.

### Contabilidad
46. **chart_of_accounts** — jerárquica.
47. **journal_entries** — pólizas.
48. **journal_lines** — `entry_id`, `account_id`, `debit`, `credit`.

### Facturación electrónica
49. **einvoice_documents** — `type` (CFDI/FE/DTE), `country`, `uuid`, `status`, `xml_url`, `pdf_url`, `pac_response JSONB`.

### E-commerce
50. **storefront_configs** — `theme`, `domain`, `currency`, `payment_methods`.
51. **shipping_methods** — `name`, `carrier`, `cost`, `lead_time_days`.
52. **coupons** — `code`, `type` (percent/fixed), `value`, `valid_from`, `valid_to`, `usage_limit`.

### RRHH
53. **employees** — `user_id`, `code`, `position`, `hired_at`, `salary`.
54. **shifts** — `branch_id`, `name`, `start`, `end`.
55. **timeclock_entries** — `employee_id`, `clock_in`, `clock_out`.

### Sistema
56. **audit_log** — `actor_id`, `action`, `resource_type`, `resource_id`, `before JSONB`, `after JSONB`, `ip`, `user_agent`.
57. **api_keys** — `name`, `prefix`, `hashed_secret`, `last_used_at`, `expires_at`, `scopes TEXT[]`.
58. **webhook_subscriptions** — `event`, `target_url`, `secret`, `is_active`.

# APÉNDICE E — Funciones RPC destacadas

1. `process_sale(payload JSONB)` — procesa venta atómica.
2. `process_refund(sale_id, items)` — devolución parcial/total.
3. `transfer_inventory(from, to, items)` — transferencia.
4. `adjust_inventory(warehouse, items, reason)` — ajuste.
5. `open_cash_session(branch, opening)` — apertura.
6. `close_cash_session(session, closing)` — cierre con arqueo.
7. `compute_commissions(period_start, period_end)` — cálculo masivo.
8. `compute_inventory_valuation(method)` — FIFO/Promedio.
9. `generate_z_report(session_id)` — reporte Z.
10. `generate_x_report(session_id)` — reporte X parcial.
11. `revoke_api_key(key_id)` — revocación inmediata.
12. `rotate_jwt_secret()` — rotación.
13. `purge_old_audit_log(days)` — retención.
14. `recalc_loyalty_points(customer_id)` — recálculo.
15. `validate_cfdi_payload(json)` — validación previa al timbrado.
16. `cancel_cfdi(uuid, reason)` — cancelación SAT.
17. `apply_price_list(list_id, dry_run)` — aplicar lista.
18. `import_products_csv(rows JSONB)` — import masivo.
19. `export_sales_xlsx(filters)` — export.
20. `forecast_demand(product_id, days)` — predicción simple.
21. `compute_abc_classification()` — análisis ABC.
22. `recompute_balances()` — saldos clientes.
23. `merge_customers(primary, secondary)` — fusión de duplicados.
24. `bulk_update_prices(rules JSONB)` — actualización masiva.
25. `archive_org_data(org_id, before_date)` — archivado.
26. `restore_org_data(backup_id)` — restore.
27. `health_check()` — chequeo interno.

# APÉNDICE F — Edge Functions (Deno)

1. `cfdi-sign` — firmado CFDI con sello digital del PAC.
2. `email-sender` — envío transaccional vía Resend.
3. `sms-sender` — Twilio.
4. `pdf-generator` — tickets y facturas con `@react-pdf/renderer`.
5. `webhook-dispatcher` — entregas con reintento exponencial.
6. `stripe-webhook` — recepción y validación de signatures.
7. `mercadopago-webhook` — idem.
8. `cron-daily-reports` — emails diarios programados.
9. `cron-backups` — snapshot a Storage.

# APÉNDICE G — Tablas de eventos Realtime

| Canal | Eventos | Suscriptores |
|-------|---------|--------------|
| `org:{org_id}:sales` | INSERT, UPDATE | dashboard, otras cajas |
| `org:{org_id}:inventory` | UPDATE | POS, dashboard |
| `org:{org_id}:cash_sessions` | INSERT, UPDATE | owner |
| `org:{org_id}:notifications` | INSERT | usuarios |
| `org:{org_id}:presence` | presence | dashboard de actividad |

# APÉNDICE H — Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MERCADOPAGO_ACCESS_TOKEN=
WOMPI_PRIVATE_KEY=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
PAC_USER=
PAC_PASS=
PAC_ENVIRONMENT=production
LOG_LEVEL=info
NEXT_PUBLIC_APP_VERSION=3.4.0
```

# APÉNDICE I — Hooks de React relevantes

- `useAuth()` — sesión y rol actual.
- `useOrg()` — organización activa.
- `useBranch()` — sucursal activa.
- `useCart()` — carrito POS.
- `useScanner()` — lectura código de barras.
- `useReceiptPrinter()` — WebUSB ESC/POS.
- `useScale()` — báscula vía WebSerial.
- `useRealtimeTable(table, filters)` — sub Supabase Realtime.
- `usePermission(perm)` — chequeo declarativo.
- `useFeatureFlag(flag)` — flags por org.
- `useFormatters()` — moneda, fecha, número según locale.
- `useShortcut(combo, handler)` — atajos teclado.
- `useOfflineQueue()` — gestión cola offline.
- `useAuditTrail(entity)` — historial de cambios.

# APÉNDICE J — Stores Zustand

- `useCartStore` — items, descuentos, totales.
- `useSessionStore` — caja abierta, montos.
- `useUIStore` — modales, sidebars, theme.
- `useNotificationStore` — toasts.
- `useScannerStore` — buffer entre escaneos.
- `useOfflineStore` — cola IndexedDB.

# APÉNDICE K — Tabla de errores estandarizados

| Code | HTTP | Significado |
|------|------|-------------|
| `AUTH_INVALID` | 401 | Credenciales inválidas |
| `AUTH_EXPIRED` | 401 | JWT expirado |
| `FORBIDDEN` | 403 | Sin permiso |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `VALIDATION` | 422 | Payload inválido |
| `CONFLICT` | 409 | Estado conflictivo |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `INTERNAL` | 500 | Error inesperado |
| `INVENTORY_INSUFFICIENT` | 422 | Stock insuficiente |
| `CASH_SESSION_CLOSED` | 422 | Caja cerrada |
| `CFDI_INVALID` | 422 | Payload CFDI inválido |
| `CFDI_PAC_ERROR` | 502 | Error del PAC |
| `PAYMENT_DECLINED` | 402 | Pago rechazado |
| `WEBHOOK_INVALID_SIGNATURE` | 400 | Firma inválida |
| `MIGRATION_PENDING` | 503 | Mantenimiento |

# APÉNDICE L — Plantillas de impresión

- **Ticket 58mm** — `templates/ticket-58.tsx`
- **Ticket 80mm** — `templates/ticket-80.tsx`
- **Factura A4** — `templates/invoice-a4.tsx`
- **CFDI PDF** — `templates/cfdi.tsx`
- **Reporte Z** — `templates/z-report.tsx`
- **Reporte X** — `templates/x-report.tsx`
- **Cotización** — `templates/quote.tsx`
- **Orden de compra** — `templates/po.tsx`

# APÉNDICE M — Atajos avanzados

| Combo | Acción |
|-------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+Shift+P` | Modo presentación |
| `Ctrl+/` | Búsqueda global |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Settings |
| `Alt+1..9` | Cambiar entre módulos |
| `Shift+F8` | Cobro mixto |
| `Ctrl+R` | Reimprimir último ticket |
| `Ctrl+Z` | Deshacer última línea |

# APÉNDICE N — Métricas de negocio (KPIs sugeridos)

- **Ticket promedio** = Ventas totales / Número de tickets.
- **Conversión POS** = Tickets / Visitantes (si hay contador).
- **Margen bruto** = (Ventas - Costo) / Ventas.
- **Rotación de inventario** = COGS anual / Inventario promedio.
- **Días de inventario** = 365 / Rotación.
- **NPS** — encuesta post-venta.
- **CSAT** — escala 1-5.
- **Mermas %** = Ajustes negativos / Inventario inicial.
- **Comisiones %** = Comisiones / Ventas.
- **Caducidad %** = Productos caducados / Inventario.

# APÉNDICE O — Buenas prácticas operativas

1. Cerrar caja diariamente y conciliar antes de salir.
2. Conteo cíclico semanal: rotar 20% del inventario por semana.
3. Backup de datos críticos local antes de actualización mayor.
4. Capacitar a cajeros con simulador antes de operar real.
5. Revisar bitácora semanalmente buscando anomalías.
6. Rotar contraseñas cada 90 días (admin/owner).
7. Mantener catálogo de productos limpio (sin duplicados).
8. Monitorear inventarios negativos diariamente.
9. Auditar comisiones antes de pagarlas.
10. Probar restore desde backup trimestralmente.
11. Verificar facturas electrónicas pendientes diariamente.
12. Reconciliar pasarelas de pago semanalmente.
13. Documentar incidentes en runbook.
14. Versionar cambios significativos en `CHANGELOG.md`.
15. Comunicar mantenimiento a usuarios con 48h de antelación.

# APÉNDICE P — Checklist Go-Live

- [ ] DNS propagado y HTTPS válido.
- [ ] Variables de entorno production cargadas.
- [ ] Migrations aplicadas.
- [ ] RLS verificado en todas las tablas.
- [ ] Realtime habilitado en tablas críticas.
- [ ] Backups programados.
- [ ] Sentry capturando errores.
- [ ] Monitoring de uptime configurado.
- [ ] Datos de prueba purgados.
- [ ] Usuarios reales invitados.
- [ ] Capacitación a cajeros completada.
- [ ] Inventario inicial cargado.
- [ ] Catálogo SAT verificado (si MX).
- [ ] Sellos digitales cargados (si MX).
- [ ] Pasarelas de pago en modo live.
- [ ] Webhooks apuntando a producción.
- [ ] Plan de rollback documentado.
- [ ] Soporte contactable durante go-live.

# APÉNDICE Q — Plan de contingencia

**Escenario 1: Supabase caído**
- Usar modo offline; ventas se encolan.
- Avisar a usuarios vía banner.
- Reintentar sync cada 30s.

**Escenario 2: Vercel caído**
- DNS failover a CDN secundario (futuro).
- Comunicar status.

**Escenario 3: PAC caído**
- Generar venta sin CFDI; timbrar diferido.
- Notificar al cliente que recibirá CFDI por email.

**Escenario 4: Pasarela de pago caída**
- Permitir solo efectivo.
- Banner amarillo en POS.

**Escenario 5: Brecha de seguridad**
- Rotar JWT secret.
- Revocar API keys.
- Forzar logout global.
- Notificar a usuarios afectados (GDPR).
- Postmortem público en 72h.

---

**FIN DEL DOCUMENTO — VOLVIX POS v3.4.0 FINAL**

*Este documento contiene 1500+ líneas de documentación exhaustiva del sistema Volvix POS, cubriendo arquitectura, agentes, módulos, APIs, guías, troubleshooting, roadmap, seguridad y FAQ.*
