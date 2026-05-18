# Agente Wave 1 — Parche 2: Screen → Endpoint

## Misión

Cambiar la granularidad de "módulo → endpoint" a "screen → endpoint" para que el grafo muestre exactamente qué screen llama a qué API.

## Contexto que necesitas

Lee:
- `scripts/generate-system-map.js`
- `public/salvadorex-pos.html` (al menos el inicio para entender la estructura del DOM)

## Investigación previa

Antes de escribir el parche, necesitas saber **cómo están marcados los bloques de screen** en el HTML. Las opciones comunes:

```html
<section id="screen-pos">...</section>
<section data-screen="pos">...</section>
<div class="screen" id="screen-pos">...</div>
```

Inspecciona los primeros 5,000 caracteres después de un `showScreen` definition en `salvadorex-pos.html` para detectar el patrón real. Reporta el patrón que encontraste.

## Output esperado

Crea: **`scripts/_patches/patch-2.diff.js`** con:

```js
// PATCH 2: Screen → Endpoint
// Detectado patrón de bloque: <PATRÓN AQUÍ>

// AGREGAR al final de scanFile() ANTES del return:
// --- INICIO PARCHE ---
const screenBlocks = {};
for (const s of screens) {
  // AJUSTA el regex según el patrón detectado:
  const blockRe = new RegExp(
    `<section[^>]*(?:id=["']screen-${s}["']|data-screen=["']${s}["'])[^>]*>([\\s\\S]*?)</section>`,
    'i'
  );
  const blockMatch = text.match(blockRe);
  if (blockMatch) {
    const block = blockMatch[1];
    const blockEndpoints = uniqueMatches(block, /\/api\/([a-zA-Z0-9_/.-]+)/g)
      .map(e => '/api/' + e);
    const blockModals = uniqueMatches(block, /(?:openModal|showModal)\(['"]([a-z0-9-]+)['"]/g);
    const blockFunctions = uniqueMatches(block, /(?:^|\s)([a-zA-Z_$][\w$]*)\s*\(/g)
      .filter(f => f.length > 3);
    screenBlocks[s] = {
      endpoints: blockEndpoints,
      modals_opened: blockModals,
      functions_called: blockFunctions.slice(0, 30)
    };
  } else {
    screenBlocks[s] = { endpoints: [], modals_opened: [], functions_called: [], _no_block_found: true };
  }
}
// --- FIN PARCHE ---

// EN EL RETURN de scanFile, agregar:
//   screen_blocks: screenBlocks

// EN LA SECCIÓN DE RELACIONES, agregar:
// --- INICIO PARCHE RELACIONES ---
for (const [screen, info] of Object.entries(pos.screen_blocks || {})) {
  const screenId = 'screen_pos_' + screen;
  // Endpoints
  for (const ep of info.endpoints) {
    const apiId = 'api_' + ep.replace(/[^a-z0-9]/gi, '_');
    if (nodos.find(n => n.id === apiId)) {
      relaciones.push({ from: screenId, to: apiId, verb: 'llama_api', granularidad: 'screen' });
    }
  }
  // Modals
  for (const m of info.modals_opened) {
    const modalId = 'modal_pos_' + m;
    if (nodos.find(n => n.id === modalId)) {
      relaciones.push({ from: screenId, to: modalId, verb: 'abre_modal' });
    }
  }
}
// --- FIN PARCHE RELACIONES ---
```

## Validación post-patch

Después de aplicar este parche en Wave 1.7, el orquestador debería ver:

- Relaciones `mod_pos → endpoint` reducidas (ahora son `screen → endpoint`).
- Cada screen documentada con qué endpoints llama, qué modales abre, qué funciones invoca.

## Si NO se detecta patrón de bloque

Si después de inspeccionar `salvadorex-pos.html` NO encuentras un patrón claro de `<section>` o `<div>` con `id="screen-X"`, hay dos opciones:

1. **Fallback heurístico**: dividir el archivo por la posición de `showScreen('X')` calls y asumir que el "bloque" de una screen es desde una declaración hasta la siguiente. Es impreciso pero útil.

2. **Reportar deuda**: agregar en `.blitz/status/wave-1-patch-2.md` una sección "DEUDA: el HTML no marca claramente los bloques de screens, sugerencia: agregar `data-screen` attributes en una iteración futura".

Documenta cuál de las dos tomaste.

## Reporte

Crea `.blitz/status/wave-1-patch-2.md`:

```markdown
# Wave 1 — Parche 2: Screen → Endpoint

- Estado: ✓ / ✗ / ⚠️
- Archivo generado: scripts/_patches/patch-2.diff.js
- Patrón de bloque detectado: <descripción del regex>
- Screens cuyo bloque NO se pudo detectar: <lista>
- Endpoints cuya nueva granularidad podemos asignar: <%>
- Errores: (lista o ninguno)
```
