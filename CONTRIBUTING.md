# Contributing to Volvix POS

## Setup

```bash
git clone <repo>
cd volvix-pos
npm install
cp .env.example .env   # configurar variables
npm start
```

Node >= 18.

## Branch model

- `main` — produccion (Vercel auto-deploy)
- `feature/*` — nuevas features
- `fix/*` — bugfixes
- `R<N>-*` — releases numerados (R13..R24)

## Commit style

Convencional: `tipo(scope): mensaje`
- `feat(inventory): agregar lote por caducidad`
- `fix(auth): corregir refresh token`
- `docs(api): documentar /reports`
- `chore(deps): bump supabase-js`

## Code standards

- Sin secretos en codigo (`SEED_USERS_JSON`, `JWT_SECRET`, etc.).
- Toda ruta nueva en `server.js` debe documentarse en `openapi.yaml`.
- Errores siempre devuelven `{ ok:false, error: '...' }` con HTTP correcto.
- Multi-tenant: validar `tenant_id` en todo handler protegido.
- Roles: `cajero | admin | owner | superadmin`.

## Tests

```bash
npm test                    # suite completa
node test-runner.js api     # solo API
```

Antes de PR: `node volvix-security-scan.js` debe pasar.

## Pull Requests

1. Branch desde `main`.
2. Pasar `volvix-security-scan.js` y tests.
3. Actualizar `openapi.yaml` si tocaste rutas.
4. Agregar entrada en `CHANGELOG.md`.
5. Describir el cambio y referenciar el R-release.

## Reportar bugs

Issues con: pasos repro, esperado vs obtenido, version (`/api/health`), logs.

## Codigo de conducta

Respeto, profesionalismo, foco en el producto.
