# Feature Flags & User Management API Spec

Endpoints to implement in `api/index.js` (Vercel Edge Function).
All endpoints require `Authorization: Bearer <jwt>` and respect `tenant_id` from JWT (RLS).

## Conventions

- Status values: `'enabled' | 'disabled' | 'coming-soon'`
- Role values: `'admin' | 'manager' | 'cajero' | 'inventario' | 'contador'` (or custom)
- All errors return `{ error: string, code?: string }` with appropriate HTTP status.

---

## Feature Flag Resolution

### `GET /api/feature-flags?user_id=<uuid>`
Returns the **resolved** feature map for a user (after applying user > role > tenant > default).

**Response 200**
```json
{
  "user_id": "uuid",
  "tenant_id": "uuid",
  "fetched_at": "2026-04-27T12:00:00Z",
  "flags": {
    "module.pos": "enabled",
    "module.facturacion": "coming-soon",
    "module.kds": "disabled"
  }
}
```

Implementation: call `SELECT resolve_features_for_user($tenant, $user)` from PG.

---

## User Management

### `GET /api/users`
List users in the requesting tenant.

**Query params**: `?role=cajero&active=true&search=foo`

**Response 200**
```json
{ "users": [{
  "id": "uuid", "email": "x@y.com", "name": "Juan Pérez",
  "role": "cajero", "active": true, "last_login_at": "2026-04-26T..."
}] }
```

### `POST /api/users`
Create a user in the tenant. Owner/admin only.

**Body**
```json
{ "email": "x@y.com", "name": "Juan", "role": "cajero", "password": "temp1234" }
```

**Response 201**: `{ "user": { ... } }`

**Validation**: email format, name min 2 chars, role in allowlist, password min 8 chars.

### `PATCH /api/users/:id`
Edit user fields (name, role, active flag, password reset).

**Body** (all optional)
```json
{ "name": "...", "role": "...", "active": false, "password": "..." }
```

### `DELETE /api/users/:id`
Soft-delete (set `active=false`). Owner/admin only. Cannot delete self.

### `GET /api/users/:id/permissions`
Returns user-specific overrides + effective resolved map.

**Response 200**
```json
{
  "overrides": { "module.facturacion": "disabled" },
  "effective": { "module.pos": "enabled", ... }
}
```

### `PATCH /api/users/:id/permissions`
Set/clear per-module overrides for a user.

**Body**
```json
{ "module_key": "module.facturacion", "status": "disabled" }
```
or to remove override:
```json
{ "module_key": "module.facturacion", "status": null }
```

---

## Role Management

### `GET /api/roles`
List all roles in tenant (predefined + custom).

**Response 200**
```json
{ "roles": [
  { "name": "admin", "system": true, "user_count": 1 },
  { "name": "cajero", "system": true, "user_count": 5 },
  { "name": "supervisor_turno", "system": false, "user_count": 2 }
] }
```

### `POST /api/roles`
Create a custom role.

**Body**: `{ "name": "supervisor_turno", "description": "..." }`

### `GET /api/roles/:role/permissions`
Get role default permissions.

### `PATCH /api/roles/:role/permissions`
Set role permissions for a single module.

**Body**: `{ "module_key": "module.facturacion", "status": "enabled" }`

---

## Module Catalog

### `GET /api/feature-modules`
List all available modules in the system.

**Response 200**: `{ "modules": [{ "key", "name", "category", "default_status", "description" }] }`

---

## Tenant Overrides

### `GET /api/tenant/modules`
Tenant-wide module overrides (and the effective list for the tenant).

### `PATCH /api/tenant/modules/:key`
Set tenant-wide override for a module.

**Body**: `{ "status": "coming-soon" }` (or `null` to remove)

---

## Module Pricing

### `GET /api/module-pricing`
Returns pricing matrix.

**Response 200**
```json
{ "tiers": ["basico","pro","enterprise"],
  "pricing": [
    { "module_key": "module.facturacion", "tier": "pro", "price_monthly": 199, "included": true }
  ] }
```

### `PATCH /api/module-pricing`
Update price entry. Platform owner only.

**Body**
```json
{ "module_key": "module.facturacion", "tier": "pro", "price_monthly": 249, "price_annual": 2490, "included": false }
```

---

## Audit Log

### `GET /api/feature-flags/audit?limit=50&user_id=<uuid>`
Last N audit entries for the tenant.

**Response 200**
```json
{ "entries": [
  { "id":1, "scope":"user", "scope_ref":"uuid", "module_key":"module.pos",
    "old_status":"enabled", "new_status":"disabled",
    "changed_by":"uuid", "changed_at":"...", "note":"manager request" }
] }
```

---

## Error codes

| Code              | HTTP | Meaning                                          |
|-------------------|------|--------------------------------------------------|
| `unauthorized`    | 401  | Missing/invalid JWT                              |
| `forbidden`       | 403  | Role not allowed for this action                 |
| `not_found`       | 404  | User/module/role does not exist                  |
| `validation`      | 422  | Body validation failed (see `details`)           |
| `conflict`        | 409  | Email already exists / role name taken           |
| `tenant_mismatch` | 403  | Resource belongs to a different tenant           |
