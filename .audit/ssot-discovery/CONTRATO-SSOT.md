# CONTRATO ARQUITECTÓNICO — SSOT Giros de Negocio

> **AGREGAR ESTO AL `CLAUDE.md` global del proyecto cuando se autorice FASE 4.**

## REGLA SSOT-001: GIROS DE NEGOCIO

La tabla `giros_maestro` en Supabase es la **ÚNICA** fuente de verdad para giros de negocio en todo el ecosistema SalvadoreX/Volvix.

### Antes de hacer CUALQUIER cosa con giros:

1. Consultar `giros_maestro` vía REST API o `loadEcosystem()`.
2. Si necesitas un giro que no existe → `INSERT` en `giros_maestro`, **NO crees tabla nueva, JSON suelto ni array hardcoded**.
3. Si necesitas datos derivados (catálogo, landing) → FK a `giros_maestro(id)`.

### PROHIBIDO EXPLÍCITAMENTE:

- ❌ Crear arrays hardcodeados con listas de giros en JS/HTML.
- ❌ Crear tablas nuevas con columna `giro_texto`, `nombre_giro`, `vertical`, `industry` sin FK a `giros_maestro`.
- ❌ Crear archivos `.json` con catálogos de giros sueltos en `data/`, `public/data/`, `wizards-by-industry/`.
- ❌ Asumir que un giro existe sin verificar contra el maestro.
- ❌ Modificar `giros-ecosystem.json` directamente — debe regenerarse desde `giros_maestro` vía script.

### Si pierdes contexto y no sabes dónde está la tabla:

```sql
SELECT id, slug, nombre, sinonimos FROM giros_maestro WHERE activo = true ORDER BY nombre;
```

**SIEMPRE empieza por esta query antes de tocar nada relacionado con giros.**

### Si no recuerdas: leer `.audit/ssot-discovery/inventario-fuentes.json`

Ahí tienes mapeado:
- Las 20 fuentes que existían antes del SSOT
- Cuál fue migrada y cómo
- Qué vistas de compatibilidad cubren código legacy

### Resolver giros con sinónimos / typos:

```sql
-- Si recibes un slug "kavanderia" o "lenceria_test_fresh", resuelve:
SELECT slug FROM giros_maestro
WHERE slug = $1 OR $1 = ANY(sinonimos)
LIMIT 1;
```

O en cliente JS:
```js
const giro = await fetch('/api/giros/resolve?slug=' + raw).then(r => r.json());
// devuelve { canonical: 'lavanderia', resolved_from: 'kavanderia' }
```

### Detección automática de violaciones:

Antes de hacer commit/deploy, este pre-commit hook debe pasar:

```bash
#!/bin/bash
# .githooks/pre-commit-no-new-giro-table

# Detecta arrays hardcodeados de giros
violaciones=$(grep -rn -E "(giros|verticales|industries)\s*[=:]\s*\[" \
  --include="*.js" --include="*.html" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=.audit \
  . 2>/dev/null | wc -l)

if [ "$violaciones" -gt 0 ]; then
  echo "❌ Detectados $violaciones arrays hardcoded de giros."
  echo "   Migra a giros_maestro antes de commitear."
  echo "   Lee .audit/ssot-discovery/CONTRATO-SSOT.md"
  exit 1
fi

# Detecta CREATE TABLE nuevo con columna giro sin FK
ddl_violaciones=$(grep -rnE "CREATE TABLE.*[(].*giro\s+(text|varchar)[^,]*,[^)]*REFERENCES" \
  --include="*.sql" . 2>/dev/null | wc -l)
ddl_total=$(grep -rnE "CREATE TABLE.*[(].*giro\s+(text|varchar)" \
  --include="*.sql" . 2>/dev/null | wc -l)

if [ "$ddl_total" -gt "$ddl_violaciones" ]; then
  echo "❌ DDL con columna 'giro' sin FK a giros_maestro."
  exit 1
fi
```

### Esta regla se aplica de FORMA RETROACTIVA

Cualquier código existente que la viole se considera **deuda técnica P0** y se migra al maestro antes de cualquier feature nueva.

### Lista de violaciones conocidas a remediar (post-FASE 4):

- [ ] `public/data/giros-ecosystem.json` → regenerar desde `giros_maestro`, no editar a mano
- [ ] `public/data/giros-terminologias.json` → mover datos a `giros_maestro.metadata.terminologias`
- [ ] `data/industry-schemas.json` → mover a `giros_maestro.metadata.fields`
- [ ] `data/industry-seed-products.json` → mover a tabla `productos_por_giro`
- [ ] `paneldecontrol.html` `GIRO_CATEGORIES` hardcoded → obtener de `giros_maestro.categoria`
- [ ] `paneldecontrol.html` `ECO_ALIASES_TABLE` + `ALIASES` (las 2 copias) → usar `giros_maestro.sinonimos`
- [ ] `public/wizards-by-industry/*.json` → mover a `giros_maestro.metadata.wizard`
- [ ] `migrations/giros-synonyms.sql` → reemplazado por `sinonimos[]` en maestro
- [ ] `db/R14_VERTICAL_TEMPLATES.sql` → reemplazado por `giros_maestro` + vista `vertical_templates_compat`

## REGLA SSOT-002: ¿Qué cuenta como giro?

**Decisión humana fijada (2026-05-20):** Un **giro** es el TIPO DE NEGOCIO, no el producto que vende.

- ✅ `taqueria` es un giro (es un tipo de negocio)
- ❌ `tacos_al_pastor` NO es un giro (es un producto que se vende en una taquería)
- ❌ `restaurante_de_mariscos` NO es un giro distinto (es un sinónimo de `marisqueria`)
- ✅ `marisqueria` es un giro

Si tienes duda, pregúntate: "¿este negocio podría ser dueño de su propio POS?". Si sí → giro. Si es un producto que vende otro negocio → no es giro, es producto/categoría.

## REGLA SSOT-003: Slugs basura no se borran de F001

En `volvix_tenants.tipo_negocio` hay valores como `test_final_lovable`, `almoiadas`, `kavanderia`. **NO se borran** — se resuelven al canónico via fuzzy match al renderizar.

Esto preserva el dato histórico del tenant y permite eventualmente reclasificarlo manualmente sin pérdida.
