# Agentes Wave 3 — Validadores cruzados

Cinco agentes que SOLO LEEN y reportan. No escriben código nuevo, no modifican contratos. Solo detectan inconsistencias.

---

## Agente 3.1: Validator de Schema

### Misión

Verificar que TODAS las tablas mencionadas en contratos de endpoints existen en `.specify/schema-truth.md`.

### Proceso

1. Lee `.specify/schema-truth.md` y extrae la lista de tablas.
2. Lee TODOS los archivos en `.specify/contracts/endpoints/`.
3. Por cada contrato, extrae las tablas que dice tocar (en la sección "Tablas Supabase que toca").
4. Cruza:
   - Tablas mencionadas en contratos pero NO en schema-truth → ❌ INVENTADAS
   - Tablas en schema-truth NO mencionadas por ningún contrato → ⚠️ HUÉRFANAS

### Output

Crea `.audit/validation-schema.md`:

```markdown
# Validación Wave 3.1 — Schema

## Tablas inventadas (mencionadas en contratos pero NO existen)

(crítico — significa que el contrato está mal o que falta schema)

- `<tabla>` mencionada en `<archivo-contrato>.spec.md` línea N
- ...

## Tablas huérfanas (existen en schema pero ningún contrato las toca)

- `<tabla>` — sin contrato que la mencione. Posibilidades:
  - Es usada por endpoint sin contrato (revisar Wave 3.2).
  - Es legacy / dead table → considerar drop con ADR.

## Tablas con conflicto de propósito

- `productos` + `inventario` ambas mencionadas como "catálogo" → ⚠️ duplicación
- ...
```

---

## Agente 3.2: Validator de Endpoints

### Misión

Detectar endpoints que aparecen en `system-map.json` pero NO tienen contrato (ni dedicado ni en `_INDEX.md`).

### Proceso

1. Lee `public/system-map.json` y extrae todos los nodos con `tipo === 'endpoint'`.
2. Lee `.specify/contracts/endpoints/` (lista de archivos `.spec.md`).
3. Lee `.specify/contracts/endpoints/_INDEX.md` y extrae endpoints listados ahí.
4. Lista endpoints en system-map.json que NO están en (2) ni en (3).

### Output

Crea `.audit/validation-endpoints.md`:

```markdown
# Validación Wave 3.2 — Endpoints sin contrato

## Total

- Endpoints en system-map.json: N
- Con contrato dedicado: N (X%)
- En _INDEX como stub: N (X%)
- **SIN ningún contrato**: N (X%) ← deuda

## Endpoints sin contrato

(Estos son los que tu IA puede tocar sin tener context, lo cual es lo que queremos EVITAR)

- `<endpoint>` consumido por `<modulo/screen>` — ⚠️ sin contrato
- ...

## Recomendación de prioridad

Para los SIN contrato, ordenar por:
1. Endpoints que aparecen en flujos críticos (cobro, corte, inventario).
2. Endpoints exclusivos POS (porque PDC ya tiene menos endpoints).
3. Endpoints con verb `mutación` (POST/PUT/DELETE) sobre los GET.
```

---

## Agente 3.3: Validator de Screens

### Misión

Detectar screens en system-map sin contrato.

### Proceso

1. Lee system-map.json, lista nodos `tipo === 'screen'`.
2. Para cada uno, verifica que existe `.specify/contracts/screens/<nombre>.spec.md`.

### Output

`.audit/validation-screens.md`:

```markdown
# Validación Wave 3.3 — Screens

## Cobertura

- Screens en system-map: N
- Con contrato (Tier 1 detallado): N
- Con stub (Tier 2): N
- **SIN ningún contrato**: N (debería ser 0 después del blitz)

## Screens sin contrato

- `<screen>` — ⚠️ ausente.

## Calidad de contratos

(Inferir leyendo cada contrato. Si tiene muchos TODOs, es Tier 2 todavía.)

| Screen | Tier | TODOs | Endpoints documentados | Confianza |
|--------|------|-------|----------------------|-----------|
| pos | 1 | 2 | 18 | ⭐⭐⭐ |
| ...
```

---

## Agente 3.4: Validator de Huérfanos

### Misión

Detectar nodos del grafo que están aislados (sin relaciones) o tablas que el sistema no toca.

### Proceso

1. Lee system-map.json.
2. Para cada nodo, cuenta relaciones entrantes + salientes.
3. Lista los que tienen 0 (huérfanos).
4. Para tablas (de schema-truth.md): cruza con tablas mencionadas en endpoints. Las no mencionadas son huérfanas a nivel de BD.

### Output

`.audit/validation-orphans.md`:

```markdown
# Validación Wave 3.4 — Huérfanos y deuda

## Nodos huérfanos en el grafo

(0 relaciones — síntoma de scanner que no detectó usos, o de nodo realmente muerto)

- `<id>` (tipo X) — ningún edge.

## Tablas huérfanas en Supabase

(En schema-truth, pero ningún endpoint contrato las toca)

- `<tabla>` — candidato a:
  - Documentar endpoint que la usa (si existe pero no tiene contrato).
  - Drop con ADR si es legacy.

## Sufijos prohibidos detectados

(De schema-truth)

- ⚠️ `<tabla>` con sufijo `_v2` / `_temp` / `_old` / etc.

## Duplicación semántica

- `<tabla1>` + `<tabla2>` parecen duplicar propósito (de domain.md).
```

---

## Agente 3.5: Validator de Coherencia

### Misión

Verificar consistencia bidireccional:
- Si screen-contract dice "uso endpoint X", el endpoint-contract debe decir "soy consumido por screen X".
- Si endpoint-contract menciona tabla Y, el schema-truth debe tener Y.
- Las cross_references del system-map deben matchear con relaciones en contratos.

### Proceso

1. Lee TODOS los contratos de screens.
2. Para cada uno, lista los endpoints que menciona.
3. Lee TODOS los contratos de endpoints.
4. Para cada uno, lista los consumidores.
5. Verifica matches en ambos sentidos.

### Output

`.audit/validation-coherence.md`:

```markdown
# Validación Wave 3.5 — Coherencia bidireccional

## Inconsistencias screen ↔ endpoint

### Screens que mencionan endpoint sin reciprocidad

- Screen `<X>` dice usar `/api/Y`, pero `/api/Y` no lista a `<X>` como consumidor.

### Endpoints con consumidores fantasma

- Endpoint `/api/Y` dice consumido por `<X>`, pero `<X>` no menciona `/api/Y`.

## Tablas en contratos vs schema-truth

(Re-verificación complementaria de Wave 3.1)

## Cross-references del system-map vs contratos

(Si POS dice `redirige_a` PDC y existe `comparte_endpoints`, los contratos
de endpoints compartidos deben mencionar AMBOS consumidores. Validar.)

## Score de coherencia

- Total relaciones esperadas: N
- Recíprocas (✓): X
- Una vía solo (⚠️): Y
- Inconsistentes (❌): Z

Score: X / N
```

---

## Consolidación

Después de los 5 validators, el orquestador junta:

`.audit/wave-3-summary.md`:

```markdown
# Wave 3 — Consolidación

## Resumen

- Validators corridos: 5/5 ✓
- Total deudas detectadas: N
  - 🔴 Críticas: N (schema inventado, endpoints sin contrato en flujo crítico)
  - 🟡 Altas: N (screens sin contrato, huérfanos)
  - 🟢 Bajas: N (huérfanos legacy, naming)

## Top 10 deudas críticas

1. ...
2. ...

## Próximas iteraciones del blitz

Para mañana, priorizar:
- Llenar contratos de screens más usadas (cualquiera con bugs reportados).
- Promover stubs de endpoints críticos.
- ADR-002 si se detectó refactor pendiente.
```
