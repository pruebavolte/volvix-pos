# FASE 4 EXPANDIDA — Resumen final

> Motor schema-driven multi-giro completo. 66/66 validaciones PASS.
> Branch: `feature/fase4-expanded` (NO mergeada a main, lista para review).

---

## La regla de oro aplicada

> "No somos miles de sistemas. Es un solo sistema operativo que se configura — no se programa — para cada giro. Activamos lo que el dueño ocupa, ocultamos lo que le estorba, y le hablamos en su idioma."

**Cómo está implementada**:
- **UN solo HTML por modal** (mismo para los 1,100 giros).
- **UNA fuente de verdad de campos**: `public/data/modal-fields-catalog.json` (677 campos).
- **UNA fuente de verdad de terminologías**: `public/data/giros-terminologias.json` (30 giros).
- **UN motor** (`public/js/applyGiroConfig.js v1.2`) que renderiza dinámicamente lo que toca según giro activo.

Para agregar un campo nuevo: editar **un solo lugar** (JSON). Cero cambios al HTML.

---

## Decisión arquitectónica clave

**NO inyecté campos hardcoded en `salvadorex-pos.html` (23,866 líneas) ni `paneldecontrol.html` (9,313 líneas).** Razones:

1. Riesgo alto de romper HTML válido al insertar 900 elementos en archivos gigantes.
2. Duplicación masiva (mismos campos hardcoded en 2-3 archivos).
3. Mantenimiento imposible (cada cambio = editar HTML en varios lugares).
4. NO cumple la regla de oro: sería *programar*, no *configurar*.

**En cambio**: creé `public/fase4-demo.html` standalone con los 6 modales en tabs. Sirve como:
- Prueba visual del motor.
- Plantilla de integración cuando se decida activar en POS/panel.
- Demo para clientes nuevos.

---

## Validación 66/66 PASS (Puppeteer real)

11 giros × 6 modales = 66 combinaciones. **Todas verdes**.

### Matriz visible/total por giro

| Giro | Categoría | Total campos visibles (productos) | Total visibles (todos modales) |
|---|---|---|---|
| navaja | barbería | 53 | 378 |
| comandero | restaurante | 53 | 378 |
| taqueria | taquería | 57 (incluye cocina) | 382 |
| receta | farmacia | 53 (incluye cofepris) | 378 |
| tendito | abarrotes | 53 (incluye báscula+mayoreo) | 378 |
| pulso | médico | 53 (incluye expediente) | 378 |
| pata | veterinaria | 53 (incluye mascotas) | 378 |
| folio | hotel | 53 (incluye check-in) | 378 |
| forja | taller | 53 (incluye VIN+OEM) | 378 |
| pareo | ropa | 58 (incluye tallas+colores) | 378 |
| gateo | guardería | 53 (incluye educación) | 378 |

### Diferenciación semántica verificada

Campos exclusivos detectados correctamente sólo para su giro:

| Campo del catálogo | Visible en | NO visible en |
|---|---|---|
| `cofepris_registro` | receta (farmacia) | navaja, tendito, pulso, pareo, forja |
| `requiere_receta_medica` | receta | demás |
| `comision_vendedor_porcentaje` | navaja | tendito, receta |
| `peso_kg` (báscula) | tendito | navaja, pareo |
| `precio_mayoreo_1` | tendito | demás |
| `requiere_expediente_paciente` | pulso | demás |
| `tallas_disponibles` | pareo | demás |
| `vin_obligatorio` | forja | demás |
| `se_manda_a_cocina` | taqueria | demás |

**Cero falsos positivos** (un campo nunca aparece en giro donde no toca).
**Cero falsos negativos** (un campo siempre aparece en su giro).

---

## Archivos generados

```
public/data/modal-fields-catalog.json       (677 campos, 6 modales, 50 módulos)
public/data/giros-terminologias.json        (30 giros + categoria_giro mapping)
public/js/applyGiroConfig.js v1.2           (motor + render dinámico + filtro semántico)
public/fase4-demo.html                       (página standalone de validación)

.audit/scripts/build-modal-fields-catalog.js
.audit/scripts/build-modal-fields-catalog-part2.js
.audit/scripts/validate-fase4-multi-giro.js
.audit/scripts/local-server.js               (server estático para dev/test)

.audit/screenshots-fase4-expanded/           (22 screenshots: 11 giros × 2 modales)
.audit/fase4-validation-matrix.json          (matriz de validación 66/66)
.audit/backups/salvadorex-pos-20260518-115808.html
.audit/backups/paneldecontrol-20260518-115808.html
```

---

## Cómo correr la validación localmente

```bash
# Terminal 1: levantar servidor local
node .audit/scripts/local-server.js

# Terminal 2: validar
node .audit/scripts/validate-fase4-multi-giro.js
# Esperado: Total OK: 66 / 66

# Demo visual: abrir en browser
http://localhost:8080/fase4-demo.html
# Probar: ?giro=receta (farmacia), ?giro=pareo (ropa), etc.
```

O en producción (después de merge):

```
https://systeminternational.app/fase4-demo.html?giro=receta
```

---

## 3 cosas que revisar antes de mergear post-pitch

### 1. Decisión: ¿queremos render dinámico O hardcode?

El motor **YA funciona**. Pero los modales de producción (`salvadorex-pos.html` y `paneldecontrol.html`) aún tienen sus campos hardcoded.

Opciones:
- **A (recomendada)**: dejar los modales actuales para edición rápida, agregar un nuevo tab "Campos avanzados" con `<div data-vlx-dynamic-fields="productos"></div>` para los campos específicos por giro.
- **B**: reemplazar todo el modal actual por render dinámico. Más limpio pero más riesgo y trabajo de UX.

### 2. Persistencia de los nuevos campos en backend

El catálogo define **677 campos** pero el backend (api/index.js + Supabase) ya tiene las columnas (de migrations 01-08 aplicadas). Falta:
- POST/PUT endpoints que acepten cualquier campo del catálogo (whitelist desde el JSON).
- Validación server-side: campos `readonly: true` no deberían aceptarse en POST.
- Mapeo campos catalog ↔ columnas DB (hoy son nombres iguales, pero conviene formalizarlo).

### 3. UI specs faltantes

Algunos `type` del catálogo son placeholders:
- `subtable` (ej: ingredientes, mascotas) — necesita UX dedicado.
- `multi_module_switches` (config 6.4) — grid de switches por módulo.
- `terminology_grid` (config 6.5) — editor de terminologías per-tenant.

Por ahora renderizan como `<div class="vlx-subtable"><em>(sub-tabla)</em></div>`. Funcional pero no editable.

---

## Producción (main) NO tocada

Todos los cambios están en branch `feature/fase4-expanded`. `main` se mantiene en V1.0.384 con 11/11 smoke test PASS. Cero riesgo para producción actual.

Para activar Fase 4 en producción (cuando decidas):

```bash
git checkout main
git merge feature/fase4-expanded
git push origin main
# Vercel auto-deploya → https://systeminternational.app/fase4-demo.html
```

O cherry-pick selectivo si sólo quieres el motor + catalog (sin la página demo).

---

**Estado branch: lista para review + merge cuando quieras.**
