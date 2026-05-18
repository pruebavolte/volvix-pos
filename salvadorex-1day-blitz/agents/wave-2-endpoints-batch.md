# Agente Wave 2C — Endpoints BATCH (10 endpoints, stubs)

## Misión

Documentar 10 endpoints exclusivos de un módulo (POS o PDC) en stubs estructurados.

## Inputs

- `LISTA_ENDPOINTS`: array de 10 strings (ej. `["/api/sales/create", "/api/products/list", ...]`)
- `MODULO_CONSUMIDOR`: "POS" o "PDC"
- `public/system-map.json`
- `public/salvadorex-pos.html` o `public/paneldecontrol.html` según módulo

## Proceso

Para cada endpoint:

### 1. Detectar método HTTP

```bash
grep -B 1 -A 3 "'<endpoint>'" public/<archivo>.html | head -20
```

Busca `method:` en las fetch options. Default: GET (si no hay method, fetch es GET).

### 2. Stub minimalista

Crea `.specify/contracts/endpoints/<METHOD>-<sanitized-path>.spec.md`:

```markdown
# Contrato (STUB): `<METHOD> <path>`

> ⚠️ STUB Tier 2 — generado en blitz. Completar antes de mover a producción crítica.

## Identidad

- **Método**: <METHOD>
- **Path**: `<path>`
- **Consumido por**: <MODULO_CONSUMIDOR>
- **Exclusivo**: <POS | PDC>
- **Handler backend**: TODO (buscar en `pages/api/...`)

## Autorización

- **Rol mínimo**: TODO (verificar server-side)

## Request

### Body / Query params

TODO — inspeccionar invocaciones en frontend.

## Response

### Éxito

TODO — qué shape espera el frontend.

### Errores

TODO

## Tablas Supabase que toca

⚠️ **NO DETERMINADO** — requiere leer el handler backend.

Inferido del path:
- `<inferencia razonable>` — ej. `/api/sales/create` probablemente toca `sales` + `sale_items`.

## Invariantes

TODO

## Anti-patrones aplicables

- ❌ Cliente envía `tenant_id` en body (debe derivarse del token).
- ❌ Sin validación de rol server-side.
- ❌ Falta transaccionalidad si toca múltiples tablas.

---

> STUB por blitz · Wave 2C · <timestamp>
> Prioridad: ⭐ (subir si aparece en bugs reportados)
```

## Reglas de velocidad

10 endpoints en máximo 25 minutos = 2-3 min por endpoint.

- Lee system-map.json UNA VEZ.
- Para cada endpoint, grep rápido para detectar método (NO leer todo el HTML por cada uno).
- Copia plantilla, rellena lo extraíble, marca el resto como TODO.

## Reporte

`.blitz/status/wave-2c-batch-<id>.md`:

```markdown
# Wave 2C — Endpoints batch <id>

- Estado: ✓
- Endpoints procesados: 10
- Métodos HTTP detectados: { GET: N, POST: N, ... }
- Stubs creados: 10
- Endpoints donde NO se pudo detectar método: <lista>
```
