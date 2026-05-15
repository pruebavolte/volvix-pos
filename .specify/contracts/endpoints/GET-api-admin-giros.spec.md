# Contrato: `GET /api/admin/giros`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/admin/giros`
- Método(s): GET
- Auth requerido: ✅ JWT
- Rol mínimo: superadmin (enforced via `requireSuper()`)

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body: N/A
- Query params: ninguno

## Response
- 200:
  ```json
  {
    "ok": true,
    "items": [
      {
        "code": "cafeteria",
        "name": "Cafetería",
        "category_id": "...",
        "modules": [...],
        "settings": {...},
        "active": true,
        "icon": "☕",
        "color": "#...",
        "modulos": [...],
        "terminologia": [...],
        "campos": [...],
        "buttons": [...]
      }
    ]
  }
  ```
- 401: token inválido / ausente
- 403: rol insuficiente (no superadmin)
- 500: db_error

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `verticals` | SELECT | siempre (catálogo de giros) |
| `giros_modulos` | SELECT | siempre (módulos por giro) |
| `giros_terminologia` | SELECT | siempre (términos por giro) |
| `giros_campos` | SELECT | siempre (campos por giro) |
| `giros_buttons` | SELECT | siempre (botones por giro) |

## Consumidores
- **POS** (`salvadorex-pos.html`): llamado en `screen=config` tab giro al iniciar vista. Obtiene `moduleNameOverrides` y lista de giros para selector. Invoca `GET /api/admin/giros/:slug` por el slug activo del tenant. (línea 3614)
- **PDC** (`paneldecontrol.html`): línea 5915 — carga catálogo completo al iniciar la pestaña de Permisos v14; también línea 7246/7325 — hidrata datalist `#permv14-dl-giros` para filtros.

## Acoplamiento detectado
⚠️ POS consume `/api/admin/giros/:slug` (single giro) mientras PDC consume `/api/admin/giros` (lista completa). El shape del item en la lista vs el item singular puede diferir si `_buildGirosCatalog()` produce estructura distinta a la del handler GET-slug.

## Deudas
- `requireSuper()` bloquea cualquier rol que no sea `superadmin`; si un `owner` necesitara leer su propio giro debe usar `/api/app/config`. No está documentado en código.
- No hay paginación: `limit=500` hardcodeado en `verticals`; con >500 giros la respuesta se trunca silenciosamente.
- Variant `/api/admin/giros/` (con trailing slash) también mapea al sistema-map como nodo separado — el router debe normalizarla o hay 404 potencial.
