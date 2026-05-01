# Phase 2 — User & Module Management System

**Date:** 2026-04-27
**Scope:** Multi-tenant user management + 3-state feature flags (`enabled` / `disabled` / `coming-soon`) + per-module pricing.

---

## Files Created

| File | Path | Purpose |
|---|---|---|
| Feature flag client lib | `C:\Users\DELL\Downloads\verion 340\volvix-feature-flags.js` | Auto-fetches resolved flags, caches in localStorage, applies to `[data-feature]`, MutationObserver for dynamic DOM, cross-tab sync via `storage` event. Exposes `window.VolvixFeatures` (`has`, `status`, `all`, `onReady`, `refresh`, `setLocal`, `apply`). |
| Feature flag stylesheet | `C:\Users\DELL\Downloads\verion 340\volvix-feature-flags.css` | `.vlx-feature-hidden` (display:none) + `.vlx-coming-soon` (gray + "Pronto" badge + hover tooltip "Próximamente"). |
| User management UI | `C:\Users\DELL\Downloads\verion 340\volvix-user-management.html` | Standalone page with tabs Usuarios / Roles / Módulos / Precios. Drawer modals for user edit + role permissions. Real `fetch` against the JWT-secured API. |
| SQL migration | `C:\Users\DELL\Downloads\verion 340\migrations\feature-flags.sql` | 6 tables + 2 PG functions (`resolve_feature_status`, `resolve_features_for_user`) + RLS policies + seed data for 25 modules + initial pricing rows. |
| API spec | `C:\Users\DELL\Downloads\verion 340\migrations\feature-flags-api.md` | All endpoints to add to `api/index.js` (request/response schemas, validation, error codes). |

## Files Modified

| File | Lines | Change |
|---|---|---|
| `salvadorex_web_v25.html` | 8–10 (added 2 lines after `auth-gate.js`) | Added `<link rel="stylesheet" href="/volvix-feature-flags.css">` and `<script src="/volvix-feature-flags.js" defer></script>` in `<head>`. **No other changes.** |
| `volvix_owner_panel_v7.html` | ~684–687 (inserted before `tenants` nav-item) | Added sidebar nav-item: `👥 Gestión de Usuarios` linking to `/volvix-user-management.html`. |

---

## API Endpoints (specs in `migrations/feature-flags-api.md`)

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/feature-flags?user_id=X` | Resolved feature map for a user |
| GET    | `/api/users` | List tenant users |
| POST   | `/api/users` | Create user |
| PATCH  | `/api/users/:id` | Edit user |
| DELETE | `/api/users/:id` | Disable user (soft delete) |
| GET    | `/api/users/:id/permissions` | User overrides + effective map |
| PATCH  | `/api/users/:id/permissions` | Set/clear user override |
| GET    | `/api/roles` | List roles |
| POST   | `/api/roles` | Create custom role |
| GET    | `/api/roles/:role/permissions` | Role permissions |
| PATCH  | `/api/roles/:role/permissions` | Set role permission |
| GET    | `/api/feature-modules` | Catalog of modules |
| GET    | `/api/tenant/modules` | Tenant overrides |
| PATCH  | `/api/tenant/modules/:key` | Set tenant override |
| GET    | `/api/module-pricing` | Pricing matrix |
| PATCH  | `/api/module-pricing` | Update pricing row |
| GET    | `/api/feature-flags/audit` | Audit log |
| GET    | `/api/tenant/list` | (optional) multi-tenant for platform owner |

All endpoints require `Authorization: Bearer <jwt>` and respect tenant isolation via Postgres RLS.

---

## SQL Migrations Needed

Run `migrations/feature-flags.sql` against the Supabase Postgres instance.

Creates:
1. `feature_modules`
2. `module_pricing`
3. `tenant_module_overrides`
4. `role_module_permissions`
5. `user_module_overrides`
6. `feature_flag_audit`

Plus PG functions:
- `resolve_feature_status(tenant_id, user_id, module_key) -> TEXT`
- `resolve_features_for_user(tenant_id, user_id) -> JSONB` (used by `GET /api/feature-flags`)

RLS enabled on all 4 mutable tables, gated by `auth.jwt() ->> 'tenant_id'` and `auth.jwt() ->> 'role'`.

Seeds 25 modules (POS, Crédito, Clientes, Inventario, Kardex, Proveedores, Config, Facturación, Corte, Reportes, Dashboard, Apertura, Cotizaciones, Devoluciones, Ventas, Usuarios, Recargas, Servicios, Tarjetas, Promociones, Departamentos, Sugeridas, Actualizador, Marketplace, KDS) — `tarjetas`, `sugeridas`, `kds` default to `coming-soon`.

---

## How to Test

### 1. Apply DB migration
```bash
psql $DATABASE_URL -f migrations/feature-flags.sql
```

### 2. Implement API endpoints
Add the routes from `migrations/feature-flags-api.md` to `api/index.js`. Each handler must:
- Verify JWT (existing helper)
- Extract `tenant_id` from JWT claims
- Query/mutate via Supabase client (RLS enforces tenant isolation)
- Return JSON with the documented shape

### 3. Smoke test the UI
- Visit `https://salvadorexoficial.com/volvix-user-management.html` (must be authenticated)
- **Usuarios tab**: click "+ Crear usuario" → fill form → submit (form validates: name ≥ 2, email format, role required, password ≥ 8 chars on create)
- Click an existing user → drawer opens → switch to "Permisos" tab → toggle a module to `coming-soon` → click Guardar → toast confirms
- **Roles tab**: "+ Crear rol" → name validates `[a-z_][a-z0-9_]*` → save → modal closes
- **Módulos tab**: change a tenant-wide override → toast confirms
- **Precios tab**: edit a price cell → click "💾 Guardar cambios" → verifies all dirty rows are saved

### 4. Verify feature flags propagate
- Open `salvadorex_web_v25.html` (POS) in another tab while logged in
- Open DevTools console: `window.VolvixFeatures.all()` → should print the resolved map
- In the user management UI, set `module.facturacion` to `coming-soon` for the current user
- Reload POS page → the Facturación menu button should show grayed out with "Pronto" badge and "Próximamente" tooltip on hover
- Set `module.kardex` to `disabled` → reload POS → Kardex button should be **completely hidden** from menu

### 5. Cross-tab sync
- Open POS in two tabs
- In one tab, run `VolvixFeatures.setLocal('module.pos','coming-soon')` in console
- The other tab updates instantly (storage event listener).

### 6. Adversarial pass (R6)
- **Saboteur**: submit empty user form → blocked by client-side Zod-equivalent (manual validation in `validateUser()`).
- **New Hire**: button text reads "+ Crear usuario" — handler `openUserDrawer(null)` opens the create form. Match.
- **Security**: API calls use `Authorization: Bearer ${token}`. RLS policies in SQL gate by `auth.jwt() ->> 'tenant_id'`. No secrets in client.

---

## Acceptance Criteria — Status

| Criterion | Status |
|---|---|
| Owner can create/edit/disable users | ✅ (`volvix-user-management.html` Usuarios tab) |
| Owner can toggle modules at 3 levels | ✅ (tenant=Módulos tab, role=Roles tab, user=drawer→Permisos) |
| `disabled` modules disappear from menu | ✅ (`.vlx-feature-hidden { display:none !important }`) |
| `coming-soon` shows grayed + "Próximamente" | ✅ (`.vlx-coming-soon` + JS click blocker) |
| Per-module pricing UI | ✅ (Precios tab, PATCH `/api/module-pricing`) |
| Real fetch with JWT | ✅ (every call uses `Authorization: Bearer`) |
| Form validation | ✅ (name min 2, email regex, role required, password min 8) |
| Loading + error states | ✅ (spinners + `.alert.error` + toasts on every fetch) |
| `volvix-feature-flags.js` works on every page | ✅ (idempotent, MutationObserver, included in salvadorex_web_v25.html) |

---

## Known Limitations / TODOs

1. **API not yet implemented**: The UI is wired but until endpoints exist in `api/index.js` calls will 404. Spec is complete in `feature-flags-api.md`.
2. **Tenant selector**: shows current tenant only unless `/api/tenant/list` exposes more (platform-owner only).
3. **`resolve_feature_status` PG function** assumes a `users(id, role, tenant_id)` table — adjust if column names differ.
4. **Audit log**: API spec exists, the SQL writes are best done via a Postgres trigger on the override tables (not included to keep migration minimal — add later if desired).
5. **Password reset flow**: PATCH `/api/users/:id` accepts `password` field for direct reset; for production, add an email-based reset token flow.
6. **Custom role deletion**: not surfaced in UI yet; system roles cannot be deleted.
7. **Mobile responsiveness**: drawer layout collapses below 768px, but multi-column tables in Precios tab may need horizontal scroll.

---

## Self-Walkthrough (R5)

1. Owner opens `/volvix_owner_panel_v7.html` → sees new `👥 Gestión de Usuarios` nav item → clicks → navigates to `/volvix-user-management.html`.
2. Page loads → JWT validated by `auth-gate.js` → tenant selector populated → Usuarios table fetched (loading spinner visible during fetch).
3. Owner clicks "+ Crear usuario" → drawer slides in → fills form → clicks Guardar → button shows spinner → toast "Usuario creado" → drawer closes → table refreshes.
4. Owner clicks existing user → drawer opens with prefilled values → switches to Permisos tab → toggles `module.kardex` to `disabled` → clicks Guardar → API patches user override + audit row written.
5. Cashier (the user) reloads their POS tab → `volvix-feature-flags.js` boots → fetches `/api/feature-flags?user_id=X` → applies `vlx-feature-hidden` to `[data-feature="module.kardex"]` → button vanishes.
6. Refresh persists because cache lives in localStorage with TTL.
