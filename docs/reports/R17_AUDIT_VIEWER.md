# R17 — Audit Logs Viewer (Admin UI)

## Resumen
Visor administrativo de audit logs con tabla paginada, filtros, expansión de fila con diff before/after, export CSV y auto-refresh cada 60s.

## Archivos creados
- `volvix-audit-viewer.html` — UI principal (tabla + filtros + paginador + scroll virtual >1000 rows).
- `volvix-audit-viewer-wiring.js` — cliente que consume `GET /api/audit-log` con `Volvix.auth.fetch`.

## Archivos modificados
- `api/index.js` — handler `GET /api/audit-log` ahora soporta `?page=` (offset = (page-1)*limit) y devuelve `{ ok, items, page, limit, total }` para alinear con paginación cliente. Sigue restringido a `['admin','owner','superadmin']` vía `requireAuth`.

## Endpoint backend
`GET /api/audit-log` — query params soportados:
- `from`, `to` (ISO 8601, sobre campo `ts`)
- `user_id`, `action`, `resource`, `tenant_id`
- `page` (1-indexed, nuevo)
- `limit` (1..5000, default 100)

Tabla Supabase: `volvix_audit_log`. Orden: `ts DESC`. Roles autorizados: admin, owner, superadmin.

## Características UI
- Tabla con columnas: ts, level, user, action, resource, ip.
- Filtros: rango fechas (`datetime-local`), user_id, action, resource, tenant_id, limit (50/100/500/1000/5000).
- Click en fila → expande con tres bloques JSON: Before / After / Raw.
- Export CSV con todas las columnas + before/after serializados.
- Auto-refresh 60s con botón Pausar/Reanudar.
- Scroll virtual: si el resultado supera 1000 filas, solo renderiza las primeras 1000 con aviso de refinar filtros.
- Paginación: Anterior/Siguiente; deshabilita Siguiente cuando `rows.length < limit`.

## Seguridad
- Usa `Volvix.auth.fetch` (JWT). Fallback a `localStorage.token` si no está disponible.
- HTTP 401/403 muestra mensaje "Acceso denegado" en lugar de tabla vacía.
- Sin escritura: solo lectura. No se exponen acciones de purge/delete desde este viewer.

## Testing manual
1. Login como admin.
2. Abrir `/volvix-audit-viewer.html`.
3. Filtrar por action `user.login` y rango últimas 24h → confirmar resultados.
4. Click fila → ver diff JSON.
5. Export CSV → archivo descargado contiene todas las filas visibles.
6. Esperar 60s → tabla refresca automáticamente.
7. Login como rol no-admin → debe mostrar "Acceso denegado".
