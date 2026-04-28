# API Routes — Convenciones de namespaces

> Documenta la convencion de los 2 namespaces administrativos que conviven
> en `api/index.js`: `/api/admin/*` y `/api/owner/*`, su semantica y la
> estrategia de migracion.

## Convencion oficial

| Namespace          | Audiencia                          | Roles permitidos                          | Alcance         |
|--------------------|------------------------------------|-------------------------------------------|-----------------|
| `/api/admin/*`     | Plataforma SaaS (operadores Volvix)| `superadmin`                              | Cross-tenant    |
| `/api/owner/*`     | Tenant (cliente del SaaS)          | `owner`, `admin`, `manager`               | Tenant-scoped   |

Regla: si el endpoint puede ver/mutar datos de mas de un tenant, vive bajo
`/api/admin/*`. Si solo afecta al tenant del JWT, vive bajo `/api/owner/*`.

## Estado actual (2026-04-28, post-R9c)

Hay rutas que actualmente viven bajo `/api/admin/*` pero semanticamente
deberian estar en `/api/owner/*` porque son tenant-scoped (no cross-tenant).
Para no romper backward compatibility, se introdujeron **aliases** en R9c:

### Endpoints con alias (R9c FIX-9c-3)

Ambos paths apuntan al MISMO handler:

| Path original (legacy)                | Path nuevo (canonical)                   | Status      |
|---------------------------------------|------------------------------------------|-------------|
| `POST /api/admin/fraud-scan`          | `POST /api/owner/fraud-scan`             | aliased     |
| `GET /api/admin/fraud-alerts`         | `GET /api/owner/fraud-alerts`            | aliased     |
| `PATCH /api/admin/fraud-alerts/:id`   | `PATCH /api/owner/fraud-alerts/:id`      | aliased     |
| `GET /api/admin/security-summary`     | `GET /api/owner/security-summary`        | aliased     |

Ambos paths requieren rol `manager+` (`owner|manager|admin|superadmin`).

### Rutas que se mantienen como `/api/admin/*` (cross-tenant correctas)

Estas SI son legitimamente cross-tenant y deben permanecer en `/api/admin/*`:

- `POST /api/admin/audit/archive` (R5c) — archive global de audit_log
- `POST /api/admin/feature-flags` — toggling de flags globales
- `POST /api/admin/kill-switch` — emergencia plataforma
- `POST /api/admin/maintenance-block` — modo mantenimiento global
- `POST /api/admin/restart-workers` — control de workers
- `GET /api/admin/billing/invoices` — invoices cross-tenant del SaaS
- `POST /api/admin/backup/*` — backups del cluster

### Rutas legitimamente `/api/owner/*`

Estas siempre estuvieron bien nombradas:

- `GET /api/owner/dashboard`, `/api/owner/tenants`, `/api/owner/users`
- `POST /api/owner/tenants`, `PATCH /api/owner/tenants/:id`
- `POST /api/owner/seats`, `POST /api/owner/deploys`
- etc.

## Migration path (futuro)

1. **Fase actual (R9c)**: aliases activos. Los clientes pueden usar
   cualquiera de los dos paths.
2. **Fase 2 (futuro)**: emitir `Deprecation: true` header en respuestas de
   `/api/admin/fraud-*`, dirigiendo a `/api/owner/fraud-*` en `Link`.
3. **Fase 3 (futuro)**: redirigir `/api/admin/fraud-*` con HTTP 308
   Permanent Redirect a `/api/owner/fraud-*`.
4. **Fase 4 (futuro)**: eliminar handler legacy.

NO se hace HOY para no romper integraciones existentes (frontend, n8n,
zapier, scripts del cliente). La duplicacion via alias es zero-cost
(referencia de funcion, no copia).

## Reglas para nuevos endpoints

Al crear un endpoint nuevo:

1. **Pregunta**: ¿este endpoint puede operar sobre multiples tenants?
   - Si NO: usa `/api/owner/*`.
   - Si SI: usa `/api/admin/*`.
2. **Pregunta**: ¿que roles necesitan acceso?
   - `owner|admin|manager` → `/api/owner/*`.
   - solo `superadmin` → `/api/admin/*`.
3. **NO** crear nuevos endpoints bajo `/api/admin/*` para casos
   tenant-scoped solo porque "es admin-ish". Esa fue la causa del problema
   original que R9c resuelve.

## Detector / lint sugerido

A futuro se podria agregar un test que verifique:

```js
// pseudocode
for (const route of Object.keys(handlers)) {
  if (route.includes('/api/admin/') && handler.semantics === 'tenant-scoped') {
    fail(`${route} es tenant-scoped pero esta bajo /api/admin/*. Mover a /api/owner/*.`);
  }
}
```

## Referencias

- `api/index.js` — implementacion handlers
- `migrations/r8g-approvals-fraud.sql` — endpoints fraud originales
- R9c FIX-9c-3 — introduccion de aliases
