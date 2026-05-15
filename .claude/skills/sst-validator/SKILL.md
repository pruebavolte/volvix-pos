---
name: sst-validator
description: Use this skill to detect single-source-of-truth violations in the codebase. Activates when the user asks "review the system", "audit the code", "find duplications", "consolidate logic", or when about to create a new module/file that might duplicate existing functionality. Scans for duplicated business logic (e.g. two product-search functions in different files), duplicate tables, divergent contracts, hardcoded paths, and orphan files. Returns a report of violations with severity and proposed consolidations.
---

# sst-validator (Single Source of Truth Validator)

Detecta violaciones del principio "una tabla, un módulo, un flujo, una verdad" en el codebase.

## Cuándo se activa

- Usuario pide auditoría, revisión, consolidación.
- Antes de crear un archivo/módulo/función nuevo (validar que no exista uno equivalente).
- Cuando detectes patrón sospechoso (nombre con `_v2`, función con nombre casi idéntico a otra, etc.).

## Qué busca

### 1. Tablas duplicadas en BD

Vía MCP de Supabase, listar tablas. Marcar como sospechosas las que:

- Tengan sufijos: `_v2`, `_v3`, `_nuevo`, `_temp`, `_old`, `_backup`, `_copy`, `_test`.
- Tengan nombres semánticamente equivalentes: `productos` Y `inventario`, `tickets` Y `pedidos`, `clientes` Y `contactos`, `historial` Y `tickets`.

### 2. Funciones duplicadas de búsqueda/CRUD

`grep -r` en el repo buscando patrones de funciones que probablemente hagan lo mismo:

```bash
grep -rn "function buscarProducto\|function searchProduct\|function findProduct\|function getProduct" --include="*.js" --include="*.ts"
grep -rn "function buscarCliente\|function searchClient\|function findClient" --include="*.js" --include="*.ts"
grep -rn "function crearTicket\|function createTicket\|function nuevoTicket" --include="*.js" --include="*.ts"
```

Si aparecen N implementaciones distintas → marcar como deuda.

### 3. Queries hardcodeadas a tablas distintas para el mismo concepto

```bash
grep -rn "from('productos')\|from(\"productos\")" --include="*.js" --include="*.ts"
grep -rn "from('inventario')\|from(\"inventario\")" --include="*.js" --include="*.ts"
```

Si ambos resultados regresan rows, hay duplicación.

### 4. Archivos huérfanos

Archivos en el repo que:

- No se importan desde ningún otro archivo.
- No están en el sitemap del proyecto.
- Tienen nombres con `_old`, `_backup`, `copy`, `(1)`, `_test_real`, etc.

```bash
# Encuentra archivos sospechosos por nombre:
find . -name "*_old*" -o -name "*_backup*" -o -name "*copy*" -o -name "*v2*" -o -name "* (1)*"
```

### 5. Contratos divergentes

Para cada archivo en `.specify/contracts/*.spec.md`, verificar:

- Las tablas mencionadas existen en `schema-truth.md`.
- Las funciones mencionadas como "única" realmente solo aparecen una vez en el código.
- Los archivos primarios listados existen.

## Output

Generar `.audit/sst-report.md` con la siguiente estructura:

```markdown
# Reporte SST — <fecha>

## 🔴 Crítico (rompe la constitución)

- **D001**: Tabla `productos_v2` existe en BD junto con `productos`. Ubicación: Supabase. Acción sugerida: migrar datos a `productos`, drop `productos_v2` con ADR.
- **D002**: Función `buscarProductoFast()` en `pos/utils.js:42` duplica `buscarProducto()` en `pos/productos.js:88`. Acción: consolidar en `productos.js`.

## 🟡 Alto (deuda significativa)

- **D003**: Archivo `pos/clientes_old.js` no se importa pero contiene lógica activa. Acción: revisar y borrar.

## 🟢 Bajo (cosmético)

- **D004**: Nombre de variable inconsistente (`product` vs `producto`). Acción: estandarizar a español.

## Resumen

- Críticos: N
- Altos: N
- Bajos: N
```

## Regla dura

Si detectas un crítico, **no escribas código nuevo encima**. Repórtalo y espera decisión del usuario sobre cómo consolidar.
