# R14 · OpenAPI 3.1 Documentation

**Fecha:** 2026-04-26
**Versión API:** 7.3.0-r14
**Spec:** `openapi.yaml` (raíz del proyecto)
**Swagger UI:** `public/api-docs.html`

## Endpoints servidos

- `GET /api/openapi.yaml` — sirve spec OpenAPI 3.1 (YAML, public, sin auth, cache 5min).
- `GET /api/docs` — sirve Swagger UI (HTML) que renderiza el spec desde CDN unpkg.

Ambos handlers se inyectan en `api/index.js` justo antes del MAIN HANDLER.

## Cobertura

### Endpoints documentados: **77** operations sobre **63** paths

Desglose por tag:

| Tag | Paths | Operations |
|---|---|---|
| Auth | 4 | 4 (login, logout, password-reset/request, password-reset/confirm) |
| Health | 3 | 3 (/api/health, /api/health/deep, /api/status) |
| Observability | 2 | 2 (/api/metrics, /api/errors/log) |
| Tenants | 2 | 4 (GET/POST list, PATCH/DELETE :id) |
| Products | 2 | 4 |
| Sales | 1 | 2 |
| Customers | 2 | 4 |
| Owner | 11 | 12 (dashboard, tenants, users GET/POST, sales-report, licenses GET/POST, domains, billing, low-stock, sync-queue, settings GET/POST) |
| Features | 3 | 3 (list, request, activate) |
| AI | 3 | 3 (decide, support, decisions) |
| Tickets | 1 | 2 |
| Inventory | 2 | 2 (list + adjust) |
| InventoryAdvanced (R14) | 7 | 8 (locations CRUD, stock, movements, counts start/lines/finalize) |
| Reports | 3 | 3 (daily, sales, inventory) |
| Sync | 1 | 1 |
| Search | 1 | 2 |
| Blobs (TOP10 R13) | 17 paths × GET+POST + 4 sub-wildcards | 38+ |
| Admin | 1 | 1 (jobs/low-stock-alert) |
| Docs | 2 | 2 (openapi.yaml, docs) |

### Schemas (`components.schemas`): **34**

`Error`, `Ok`, `OkMessage`, `LoginRequest`, `LoginResponse`, `User`, `UserInput`,
`Tenant`, `TenantInput`, `Product`, `ProductInput`, `SaleItem`, `Sale`, `SaleInput`,
`Customer`, `CustomerInput`, `Payment`, `Invoice`, `License`, `LicenseInput`,
`Feature`, `FeatureDecision`, `AIResponse`, `Ticket`, `InventoryLocation`,
`InventoryLocationInput`, `StockRow`, `InventoryMovement`, `InventoryMovementInput`,
`InventoryCount`, `OwnerDashboard`, `Health`, `HealthDeep`, `Metrics`, `ErrorLogEntry`.

### Reusable components

- **securitySchemes**: `BearerAuth` (HTTP bearer, JWT)
- **parameters**: `UuidId` (path uuid)
- **responses**: `BadRequest` (400), `Unauthorized` (401), `Forbidden` (403),
  `NotFound` (404), `RateLimited` (429), `ServerError` (500),
  `BlobValue`, `BlobStored`

### Servers

- `https://salvadorexoficial.com` (producción)
- `http://localhost:3000` (dev)

## Notas

- Todos los endpoints documentan respuestas 200 + errores relevantes (400/401/403/404/429/500).
- `security: BearerAuth` aplica globalmente; rutas públicas (`/api/login`,
  `/api/logout`, `/api/health*`, `/api/errors/log`, `/api/auth/password-reset/*`,
  `/api/openapi.yaml`, `/api/docs`) lo sobre-escriben con `security: []`.
- Endpoints owner (`/api/owner/*`) y `/api/metrics` requieren rol
  `admin|owner|superadmin` (documentado vía 403).
- Endpoints inventory advanced rechazan rol `cajero` para operaciones de escritura
  (documentado vía 403).
- Endpoints AI (`/api/ai/*`) tienen rate-limit 20/min por usuario (documentado vía 429).
- `/api/login` rate-limit 5/15min por IP (documentado vía 429).

## Acceso

- **Spec raw:** https://salvadorexoficial.com/api/openapi.yaml
- **UI interactiva:** https://salvadorexoficial.com/api/docs
