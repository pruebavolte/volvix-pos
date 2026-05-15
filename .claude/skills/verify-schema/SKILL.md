---
name: verify-schema
description: Use this skill BEFORE writing any code that touches the database, creates tables, or writes SQL queries. It forces the agent to list the REAL tables in Supabase via the MCP server, compare against .specify/schema-truth.md, and refuse to invent tables or columns. Trigger this skill on any keyword: "create table", "new table", "INSERT", "UPDATE", "DELETE", "SELECT", "migration", "schema", "database", "Supabase", or any mention of tables like productos, tickets, clientes, etc.
---

# verify-schema

Skill obligatoria antes de tocar la BD. Bloquea la invención de tablas duplicadas o columnas fantasma.

## Cuándo se activa

Cualquier petición que implique:

- Crear/modificar/eliminar tablas o columnas.
- Escribir queries SQL o llamadas a `supabase.from(...)`.
- Implementar un módulo nuevo que persiste datos.
- Migrar datos entre tablas.

## Protocolo (sigue en orden, sin saltarte pasos)

### Paso 1. Listar tablas reales del schema `public`

Usar el MCP de Supabase:

```
mcp__supabase__list_tables(schema='public')
```

Guardar la lista en memoria de la sesión.

### Paso 2. Para cada tabla relevante, obtener detalle

```
mcp__supabase__describe_table(table='<nombre>')
```

Esto debe regresar columnas, tipos, PK, FKs, índices.

### Paso 3. Comparar contra `.specify/schema-truth.md`

Leer el archivo. Comparar:

- ¿Hay tablas en el MCP que NO están en schema-truth.md? → schema-truth.md está **desactualizado**, regenerarlo.
- ¿Hay tablas en schema-truth.md que NO están en el MCP? → reportar como inconsistencia grave.
- ¿Hay tablas con sufijos prohibidos (`_v2`, `_temp`, `_nuevo`, `_old`, `_backup`)? → reportar como **deuda crítica** en `.audit/deuda-critica.md`.

### Paso 4. Validar contra el dominio

Leer `.specify/domain.md` y verificar:

- ¿Las tablas existentes mapean al vocabulario del dominio?
- ¿Hay tablas con propósito duplicado? (ej. `pedidos` Y `tickets`, `productos` Y `inventario`, etc.)

### Paso 5. Decisión

- ✅ Si todo cuadra: proceder con el código solicitado usando **solo** las tablas y columnas reales del MCP.
- ⚠️ Si schema-truth.md está desactualizado: regenerarlo PRIMERO, avisar al usuario, esperar OK para continuar.
- ❌ Si encuentras duplicación o uso de tabla prohibida: **detener** y abrir conversación con el usuario. **No** crear una tabla nueva "para arreglarlo".

## Regla dura

**Prohibido** llamar a `mcp__supabase__execute_sql` con `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` sin haber:

1. Ejecutado este protocolo completo.
2. Confirmado que la tabla no existe ya.
3. Tener un ADR aprobado en `.specify/decisions/`.

## Output esperado

Al terminar el skill, el agente debe poder responder con certeza:

- "La tabla `<X>` existe con estas columnas: ..."
- "No existe la tabla `<X>`. Tabla equivalente sugerida: `<Y>`."
- "Hay deuda detectada: tablas `<X>` y `<Y>` parecen duplicar propósito."
