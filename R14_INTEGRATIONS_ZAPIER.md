# R14 — Integraciones Zapier / Make.com / n8n

Volvix POS expone una API REST con autenticación dual:
- `Authorization: Bearer <jwt>` (sesiones de usuario, sin cambios)
- `X-API-Key: vlx_xxx` (NUEVO — para integraciones de terceros)

## 1. Archivos entregados

| Archivo                               | Propósito                                              |
|---------------------------------------|--------------------------------------------------------|
| `db/R14_API_KEYS.sql`                 | Tabla `api_keys` con RLS por tenant + scopes           |
| `api/index.js` (patched)              | `requireAuth` acepta `X-API-Key` + 4 endpoints nuevos  |
| `volvix-zapier-app/definitions.json`  | Zapier app: 3 triggers + 3 actions                     |
| `volvix-zapier-app/auth.json`         | Schema de auth (API Key recomendado, OAuth2 opcional)  |
| `make-blueprint.json`                 | Blueprint Make.com (sales → Sheets + Slack)            |
| `n8n-workflow.json`                   | Workflow n8n (sales + low stock → Slack)               |

## 2. Endpoints de API Keys

Todos requieren JWT de un usuario con rol `admin` / `owner` / `superadmin`.

| Método | Path                                       | Descripción                                                      |
|--------|--------------------------------------------|------------------------------------------------------------------|
| GET    | `/api/integrations/api-keys/whoami`        | Ping (acepta API Key); usado por Zapier auth `test`              |
| GET    | `/api/integrations/api-keys`               | Lista las API keys del tenant (no devuelve el plain key)         |
| POST   | `/api/integrations/api-keys`               | Genera una nueva. Devuelve `api_key` **una sola vez**            |
| PATCH  | `/api/integrations/api-keys/:id`           | Renombra, cambia scopes, expira, o `{revoke:true}` para revocar  |

### Body POST
```json
{
  "name": "Zapier production",
  "scopes": ["read", "write"],
  "expires_at": "2027-01-01T00:00:00Z"
}
```
Respuesta:
```json
{
  "ok": true,
  "api_key": "vlx_AbCd...XyZ",
  "id": "uuid",
  "key_prefix": "vlx_AbCd1234",
  "scopes": ["read","write"],
  "warning": "Store this key now. It will not be shown again."
}
```

## 3. Scopes

| Scope   | HTTP métodos permitidos                       |
|---------|-----------------------------------------------|
| `read`  | GET, HEAD, OPTIONS                            |
| `write` | POST, PATCH, PUT, DELETE                      |
| `admin` | Todo lo anterior + endpoints `/owner/*`       |

El middleware `requireAuth`:
1. Si llega `X-API-Key`, busca el hash en `api_keys`, valida `revoked_at IS NULL` y `expires_at > now()`.
2. Verifica que el scope cubra el método HTTP.
3. Si la ruta exige `requiredRoles`, infiere `admin` (si scope `admin`) o `user`.
4. Toca `last_used_at` (fire-and-forget).

## 4. Migración SQL

```bash
psql "$DATABASE_URL" -f db/R14_API_KEYS.sql
```

La tabla guarda **sólo el sha256** del key. Si se pierde, hay que regenerar.

## 5. Publicar la Zapier app (pasos)

1. Instalar Zapier CLI: `npm i -g zapier-platform-cli`
2. `cd volvix-zapier-app && zapier init . --template=minimal` (si aún no tiene `package.json`)
3. Adaptar `index.js` del template para que cargue `definitions.json` + `auth.json`:
   ```js
   const auth = require('./auth.json');
   const defs = require('./definitions.json');
   module.exports = {
     version: defs.version,
     platformVersion: defs.platformVersion,
     authentication: auth,
     triggers: defs.triggers,
     creates: defs.creates
   };
   ```
4. `zapier login`
5. `zapier register "Volvix POS"`
6. `zapier push` → sube versión privada
7. Probar en https://zapier.com/app/zaps con cuenta del owner.
8. Cuando esté lista: `zapier promote 1.0.0` y luego `zapier migrate 1.0.0 1.0.0`.
9. Solicitar revisión pública en el Zapier Developer Dashboard (toma 2–4 semanas; requiere ≥10 usuarios activos en beta).

### Datos para el formulario de publicación
- **App name**: Volvix POS
- **Category**: Commerce / Point of Sale
- **Auth type**: API Key (custom)
- **Description**: "Volvix POS connects your point-of-sale to 6000+ apps. Trigger workflows on every sale, customer or stock event."
- **Logo**: 256×256 PNG (sube `public/logo-zapier.png`)
- **Support email**: support@volvix.com

## 6. Make.com

1. Importar `make-blueprint.json` desde Make → "Create new scenario" → "Import blueprint".
2. En "Connections" crear una HTTP connection con header `X-API-Key`.
3. Reemplazar `{{connection.api_url}}` → `https://app.volvix.com`.
4. Activar el scenario (poll cada 5 min).

Para distribuirlo como app oficial Make: solicitar acceso al programa "Make Partners" en https://www.make.com/en/partners.

## 7. n8n

1. En n8n: Workflows → Import from File → seleccionar `n8n-workflow.json`.
2. Definir credenciales/env:
   - `VOLVIX_URL=https://app.volvix.com`
   - `VOLVIX_API_KEY=vlx_xxxxx`
3. Configurar credencial Slack en los dos nodos `Slack`.
4. Activar el workflow.

Para publicarlo como **template oficial**: PR a https://github.com/n8n-io/n8n con el JSON en `packages/cli/templates/`.

## 8. Test rápido

```bash
# 1. Generar key (con JWT de admin)
curl -X POST https://app.volvix.com/api/integrations/api-keys \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","scopes":["read","write"]}'

# 2. Usarla
curl https://app.volvix.com/api/integrations/api-keys/whoami \
  -H "X-API-Key: vlx_xxx"

# 3. Listar productos con la key
curl https://app.volvix.com/api/products -H "X-API-Key: vlx_xxx"

# 4. Revocar
curl -X PATCH https://app.volvix.com/api/integrations/api-keys/<id> \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"revoke":true}'
```

## 9. Seguridad

- Keys almacenados **sólo como sha256** — no recuperables.
- RLS asegura que cada tenant ve únicamente sus propias keys.
- `expires_at` opcional permite rotación automática.
- `last_used_at` permite auditoría / detección de keys huérfanas.
- Al revocar (`revoked_at`), el lookup deja de hacer match inmediatamente.
- Recomendación: rotar keys de Zapier cada 90 días.
