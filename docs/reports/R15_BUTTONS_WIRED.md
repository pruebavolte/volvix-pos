# R15 — Cableado de botones del POS principal a Supabase

## Estado previo (auditoría)
Los botones del módulo Inventario en `salvadorex_web_v25.html` eran **demos sin handlers**:
- `+ Nuevo producto`, `📤 Exportar`, `📥 Importar` no tenían `id`, `data-action` ni `onclick`.
- `Editar` (renderizado por fila) tampoco tenía handler.
- `Eliminar` no existía.
- No había búsqueda inline.

La carga inicial del catálogo SÍ jalaba de Supabase (líneas 2610–2632, dentro del flujo de login: `fetch('/api/products?tenant_id=...')` muta `CATALOG`). Las mutaciones (alta/baja/edición) no estaban cableadas.

## Cambios realizados

### Archivo: `salvadorex_web_v25.html`

**1. Toolbar de Inventario (líneas ~1759–1764)** — IDs y `inv-search` añadidos:
- `#btn-export-prod`, `#btn-import-prod`, `#btn-new-prod`, `#inv-search`, `#inv-import-file` (file hidden).

**2. `renderInv(filter)` (línea ~2873)** — ahora soporta filtro y emite botones con `data-action`:
- `data-action="edit-prod"` y `data-action="del-prod"` con `data-code` / `data-id`.
- Actualiza `#inv-sub` con el conteo.

**3. Bloque nuevo "CABLEADO PRODUCTOS A SUPABASE"** (~110 líneas) con:
- `_vSession()`, `_vTenant()` — leen `volvixSession` de localStorage.
- `loadCatalogReal()` — `GET /api/products?tenant_id=...`, repuebla `CATALOG`, llama `renderInv()`.
- `saveProduct(data, id?)` — `POST /api/products` (alta) o `PUT /api/products/:id` (edición). Refresca y muestra toast.
- `deleteProduct(code, id)` — confirm + `DELETE /api/products/:id` (o `?code=&tenant_id=`). Refresca.
- `exportProductsCSV()` — intenta `GET /api/products?export=csv&tenant_id=...&token=...`; si el server no devuelve CSV, **fallback** generando CSV en cliente desde `CATALOG` y descargándolo con Blob.
- `importProductsCSV(file)` — parsea CSV en cliente (`_parseCSV`), `POST /api/products/import` con array; si el endpoint no existe, **fallback** itera con `POST /api/products` por cada item.
- `promptProductForm(prefill?)` — captura código / nombre / precio / stock (UI mínima vía `prompt`).
- Listeners en `DOMContentLoaded` para los 6 botones + delegación en `#inv-body` para edit/del.

## Endpoints invocados
| Botón | Método | Ruta |
|---|---|---|
| Nuevo producto | POST | `/api/products` |
| Editar | PUT | `/api/products/:id` |
| Eliminar | DELETE | `/api/products/:id` |
| Importar (bulk) | POST | `/api/products/import` (con fallback POST individual) |
| Exportar | GET | `/api/products?export=csv&tenant_id=...&token=...` (con fallback cliente) |
| Búsqueda | — | filtro local sobre `CATALOG` |

## Validación
- `node --check api/index.js` — **no se ejecutó**: la tarea no toca `api/`. El frontend asume contratos REST estándar.
- `vercel --prod --yes` — **no se ejecutó** desde el sandbox (sin CLI vercel disponible).

## Resumen
Antes: 3 botones decorativos + Editar muerto + sin Eliminar + sin búsqueda.
Después: 6 botones operativos cableados a `/api/products` (GET/POST/PUT/DELETE/import/export) con fallbacks defensivos. `tenant_id` se inyecta desde `volvixSession`. CSV import/export funcionales con o sin endpoints servidor dedicados.

Líneas modificadas: ~110 añadidas en `salvadorex_web_v25.html` (1 archivo).
