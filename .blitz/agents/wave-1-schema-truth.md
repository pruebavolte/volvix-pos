# Agente Wave 1.6 — Regenerar Schema-truth desde Supabase

## Misión

Generar `.specify/schema-truth.md` con el schema REAL de Supabase usando el MCP.

## Pre-requisitos

- MCP de Supabase debe estar conectado. Verifica con un primer `mcp__supabase__list_tables(schema='public')` si la herramienta está disponible.
- Si no hay MCP de Supabase, intenta `mcp__supabase` con cualquier nombre similar. Si nada funciona, reporta error y genera schema-truth.md con placeholder "PENDIENTE — MCP no disponible".

## Proceso

1. Lista todas las tablas del schema `public` (excluir tablas internas tipo `pg_*`, `_realtime_*`, etc.)
2. Para cada tabla:
   - Obtén columnas con tipo, nullable, default
   - Obtén primary key
   - Obtén foreign keys
   - Obtén índices únicos
   - Detecta si RLS está habilitado
3. Detecta tablas con sufijos prohibidos: `_v2`, `_v3`, `_nuevo`, `_temp`, `_test`, `_old`, `_backup`, `_copy`
4. Detecta duplicación semántica:
   - `products` + `inventario` → ⚠️
   - `sales` + `tickets` + `pedidos` + `ordenes` → ⚠️
   - `customers` + `clientes` + `contactos` → ⚠️

## Output

Sobrescribe `.specify/schema-truth.md` con este formato:

```markdown
# Schema-truth — SalvadoreX (Supabase)

> Auto-generado por Wave 1.6 del blitz · <timestamp UTC>
> Project ref: zhvwmzkcqngcaqpdxtwr
> Fuente: MCP de Supabase, schema `public`

## Resumen

- Total de tablas: N
- Tablas con RLS habilitado: N
- Tablas con sufijos prohibidos: N
- Posibles duplicaciones semánticas: N

## Deudas detectadas

(lista de tablas sospechosas o vacío)

## Tablas

### `<nombre_tabla>`

**Propósito** (inferido del nombre, validar): ...

**RLS**: ✅ habilitado / ❌ deshabilitado

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| ... | ... | ... | ... | FK a otra.id / unique |

**Foreign keys**:
- `cliente_id` → `clientes.id`

**Índices únicos**:
- `idx_<tabla>_<col>` en (col1, col2)

---

(repetir para cada tabla)
```

## Validación

Antes de devolver:

1. Verifica que el archivo tiene al menos 1 tabla documentada.
2. Si tu count de tablas es 0, algo salió mal con el MCP. Reporta el error.
3. Si encontraste tablas con sufijos prohibidos, márcalas claramente y agrégalas a la sección "Deudas".

## Reporte

Crea `.blitz/status/wave-1-schema-truth.md`:

```markdown
# Wave 1.6 — Schema-truth

- Estado: ✓ / ✗
- Tablas encontradas: N
- Tablas con RLS: N
- Deudas detectadas:
  - <lista>
- Archivo generado: .specify/schema-truth.md (X KB)
- Error si lo hubo: ...
```
