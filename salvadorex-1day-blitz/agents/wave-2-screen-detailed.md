# Agente Wave 2A — Screen Contract DETALLADO (Tier 1)

## Misión

Crear el contrato DETALLADO de UNA screen específica. Recibes la variable `SCREEN_NAME`.

## Inputs que tienes

- `SCREEN_NAME`: el nombre exacto de la screen (ej. "pos", "corte", "inventario").
- `.specify/contracts/screens/SCREEN_TEMPLATE.md`: la plantilla.
- `public/system-map.json`: el mapa actual con todos los nodos.
- `public/salvadorex-pos.html`: el HTML del POS (donde vive esta screen).
- `.specify/schema-truth.md`: schema real de Supabase (puede no estar listo si la Wave 1.6 falló).

## Proceso

### 1. Extraer del system-map.json

```javascript
const data = JSON.parse(fs.readFileSync('public/system-map.json'));
const screenNode = data.nodos.find(n => n.id === 'screen_pos_' + SCREEN_NAME);
const relations = data.relaciones.filter(r => r.from === screenNode.id || r.to === screenNode.id);
const endpoints = relations.filter(r => r.verb === 'llama_api').map(r => r.to);
const modals = relations.filter(r => r.verb === 'abre_modal').map(r => r.to);
```

### 2. Buscar el bloque HTML de la screen

Grep `salvadorex-pos.html` buscando:
- `<section id="screen-${SCREEN_NAME}"` o `data-screen="${SCREEN_NAME}"`
- Si no encuentras el patrón exacto, busca `showScreen('${SCREEN_NAME}')` para localizar referencias y leer ±200 líneas alrededor.

Extrae:
- Tabla principal mostrada (`<table>`, `<tbody>`)
- Inputs (`<input>`, `<select>`)
- Botones del bloque
- Modales referenciados con `openModal()`

### 3. Inferir estado en memoria

Busca dentro del bloque (o cerca):
- Variables `let/const/var` declaradas
- `window.X` asignaciones cerca de funciones de esta screen
- Funciones que comienzan con `<screen>Init`, `<screen>Render`, `<screen>Load`

### 4. Generar contrato

Crea `.specify/contracts/screens/${SCREEN_NAME}.spec.md` siguiendo la estructura de `SCREEN_TEMPLATE.md` pero con datos REALES:

```markdown
# Contrato: Screen `${SCREEN_NAME}`

## Identidad

- **Nombre del showScreen()**: `${SCREEN_NAME}`
- **Archivo padre**: `public/salvadorex-pos.html`
- **Líneas aproximadas**: <buscar y reportar>
- **Rol mínimo requerido**: <inferir del bloque, default: cashier>
- **Sub-tabs internas**: <lista o "ninguna">

## Responsabilidades

(Inferir del bloque DOM + funciones cercanas. Sé honesto sobre lo que NO pudiste inferir, márcalo con TODO.)

## UI principal

- **Elemento principal**: <tabla, formulario, dashboard, etc.>
- **Buscador**: <hay input de búsqueda? qué filtra?>
- **Botones del bloque** (de system-map.json):
  - `<label>` → handler: `<si capturado>` → opens: `<modal/nada>`
  - ...
- **Modales que abre**: <lista de modal IDs detectados>

## Estado en memoria

(Inferido del código, marcar TODO si no se puede determinar)

```js
// Inferido o TODO
let <estado1> = ...;
```

## Endpoints API que consume

| Método | Endpoint | Cuándo | Tabla(s) backend (inferido) |
|--------|----------|--------|----------------------------|
| <??>   | <endpoint del system-map> | <TODO o inferido> | <ver schema-truth.md> |

(IMPORTANTE: si el endpoint ya tiene contrato en .specify/contracts/endpoints/, enlázalo:
   "ver contrato: `.specify/contracts/endpoints/<file>.spec.md`")

## Eventos que dispara

TODO si no detectaste, o lista los `dispatchEvent`, `BroadcastChannel.postMessage`, `supabase.channel().send()` encontrados.

## Invariantes

(Lista 3-5 invariantes razonables basados en lo observado, ej:
- I1. Al entrar a la screen, se llama a endpoint X para cargar lista.
- I2. Después de mutar, re-fetch automático.
- I3. ...)

## Flujo principal (happy path)

Paso a paso, basado en lo que el DOM y los botones sugieren.

## Anti-patrones

- ❌ Hacer .from('tabla') directo (constitución C1).
- ❌ Recargar la página después de un cambio en lugar de re-fetch.
- ❌ (otros específicos de esta screen si detectaste)

## Deudas detectadas en esta screen

(Lista de cosas que viste mal: handlers vacíos, modales que se abren pero no se cierran, endpoints inexistentes referenciados, etc.)

## Checklist R9

- [ ] API: endpoints listados responden 200.
- [ ] UI: flujo principal sin recargar.
- [ ] DB: mutaciones impactan tabla correcta.
- [ ] Permisos: rol insuficiente = bloqueo.

---

> Generado automáticamente por blitz · Wave 2A · <timestamp>
> Confianza de inferencia: ⭐⭐⭐ (alta) / ⭐⭐ (media) / ⭐ (baja, marcar TODO)
> Revisar manualmente y completar TODOs antes de tratar este contrato como autoritativo.
```

## Reglas críticas

1. **NO INVENTES**. Si no puedes determinar algo, escribe `TODO: investigar X` o `(no detectado, requiere verificación manual)`.

2. **Cita evidencia**. Cuando afirmes "esta screen llama a `/api/foo`", debe ser porque lo viste en el system-map.json o en el HTML. Indica la fuente.

3. **Marca el nivel de confianza** al final del archivo. Tres estrellas si pudiste inferir todo, una estrella si la mitad fueron TODOs.

## Reporte

Crea `.blitz/status/wave-2a-screen-${SCREEN_NAME}.md`:

```markdown
# Wave 2A — Screen ${SCREEN_NAME}

- Estado: ✓
- Archivo: .specify/contracts/screens/${SCREEN_NAME}.spec.md
- Líneas detectadas en HTML: X-Y
- Endpoints documentados: N
- Modales documentados: N
- Botones documentados: N
- Confianza: ⭐⭐⭐ / ⭐⭐ / ⭐
- TODOs marcados: N (para investigación humana)
```
