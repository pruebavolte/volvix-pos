# Contrato: `GET /api/app/config`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/app/config`
- Método(s): GET
- Auth requerido: ❌ público (no hay `requireAuth`)
- Rol mínimo: N/A — acceso público

## Request
- Headers: ninguno requerido
- Body: N/A
- Query params:
  - `t` (string, **requerido**): `tenant_id` del tenant (formato `TNT-XXXXX`, case-sensitive)

## Response
- 200:
  ```json
  {
    "tenant": {
      "tenant_id": "TNT-XXXXX",
      "name": "Cafetería El Sol",
      "business_type": "cafeteria",
      "phone": "...",
      "city": "...",
      "state": "..."
    },
    "giro": { "code": "cafeteria", "name": "Cafetería" },
    "modules": { "pos": true, "inventario": false },
    "modulesState": { "pos": "enabled", "inventario": "hidden" },
    "moduleNameOverrides": { "pos": "Ventas" },
    "buttons": { "btn_cobrar": true },
    "buttonsState": { "btn_cobrar": "enabled" },
    "buttonNameOverrides": {},
    "terminology": { "producto": { "singular": "Platillo", "plural": "Platillos" } },
    "branding": { "logo_url": "...", "primary_color": "#..." },
    "media": [
      { "id": 1, "kind": "banner", "title": "...", "url": "...", "position": 0 }
    ]
  }
  ```
- 400: `{ "error": "tenant_slug requerido (?t=)" }` — falta `?t=`
- 404: `{ "error": "tenant_no_encontrado" }` — tenant no existe en `pos_companies`

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `pos_companies` | SELECT | siempre (resolver tenant por tenant_id) |
| `verticals` | SELECT | si tenant tiene business_type |
| `giros_modulos` | SELECT | si tenant tiene business_type |
| `giros_terminologia` | SELECT | si tenant tiene business_type |
| `giros_buttons` | SELECT | si tenant tiene business_type |
| `pos_app_branding` | SELECT | siempre (branding personalizado) |
| `pos_app_media` | SELECT | siempre (banners/media activos) |
| `tenant_terminology` | SELECT | si tenant tiene UUID (overrides per-tenant) |

## Consumidores
- **POS** (`salvadorex-pos.html`):
  - línea 11259: al abrir panel "App Cliente PWA" (`screen=config > tab=app-cliente`) — hidrata el formulario de configuración del giro actual.
  - línea 13194: al iniciar screen de configuración general — renombra módulos según `moduleNameOverrides`.
- **PDC** (`paneldecontrol.html`):
  - línea 6663 (comentario): referencia informativa — PDC no llama directamente el endpoint pero documenta que la PWA cliente `/app/?t=<tenant_id>` lo usa para bootstrap.

## Acoplamiento detectado
⚠️ POS consume `moduleNameOverrides` y `terminology` para renombrar UI en tiempo real. PDC no usa estos campos directamente. Si el shape cambia (ej. se renombra `moduleNameOverrides` → `module_name_overrides`), POS rompe silenciosamente.

## Deudas
- Endpoint **público** (sin auth): cualquiera con un `tenant_id` puede obtener nombre, teléfono, ciudad, estado y configuración del negocio. Considerar limitar campos expuestos a info pública real.
- `tenant_terminology` (overrides per-tenant) requiere el UUID interno (`pos_companies.id`), lo que genera una segunda query a `pos_companies`. Redundante con la primera query.
- No hay caché: 7+ queries paralelas a Supabase por cada llamada. Con tráfico alto puede impactar latencia.
- `pos_app_media` y `pos_app_branding` no figuran en el schema-truth del CLAUDE.md — verificar existencia en Supabase.
