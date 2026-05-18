// PATCH 2: Screen → Endpoint
// ─────────────────────────────────────────────────────────────────────────────
// DÓNDE INSERTAR: En scanFile(), ANTES del return (al final de la función).
//
// PATRÓN DE BLOQUE DETECTADO:
//   <section id="screen-X" class="screen-pad hidden">...</section>
//   (también: class="pos-screen" para screen-pos)
//
// HALLAZGO IMPORTANTE — DOS FASES:
//   Los bloques HTML de cada screen (líneas 4089-6575) contienen HTML puro
//   con onclick handlers, pero NO tienen fetch('/api/...') directos.
//   Toda la lógica de fetch está en el <script> (línea 7000+).
//
//   Por esto, el parche usa ESTRATEGIA DUAL:
//
//   FASE A — Extracción HTML: Para cada <section id="screen-X">,
//     extrae los onclick handlers y modales que el bloque HTML abre.
//     Esto da: qué funciones JS cada screen invoca desde botones.
//
//   FASE B — Heurística JS: Busca en el texto completo del archivo las
//     menciones del screen-name en comentarios/funciones, luego extrae
//     /api/ calls dentro de un radio de ±100 líneas de esas menciones.
//     Esto da: qué endpoints maneja la lógica de cada screen.
//
// RESUMEN DE CAMBIOS:
//   Antes: api_endpoints era un array global "POS llama a todos estos endpoints"
//   Ahora: screen_blocks mapea cada screen a sus endpoints específicos
//
// VERBOS NUEVOS en el grafo:
//   screen → endpoint: llama_api  (con granularidad: 'screen')
//   screen → modal:    abre_modal (desde botones inline en la screen)
// ─────────────────────────────────────────────────────────────────────────────

// ── HELPER: Extraer endpoints de un bloque de texto ──────────────────────────
function extractEndpoints(blockText) {
  const out = new Set();
  let m;
  const re = /\/api\/([a-zA-Z0-9_/.-]+)/g;
  while ((m = re.exec(blockText)) !== null) {
    // Filtrar falsos positivos (comentarios de línea, FLOOD_PATHS, atributos HTML)
    const before = blockText.slice(Math.max(0, m.index - 60), m.index);
    if (/\/\/[^\n]*$/.test(before)) continue;       // comentario de línea
    if (/<!--[^>]*$/.test(before)) continue;         // comentario HTML
    out.add('/api/' + m[1].replace(/[?#].*/, '').replace(/\/$/, ''));
  }
  return [...out].sort();
}

// ── HELPER: Extraer onclick handlers de un bloque HTML ───────────────────────
function extractOnclickHandlers(htmlBlock) {
  const out = new Set();
  const re = /\bonclick\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(htmlBlock)) !== null) {
    const handler = (m[1] || m[2] || '').trim();
    if (handler) out.add(handler.slice(0, 120));
  }
  return [...out];
}

// ── HELPER: Extraer nombres de función desde onclick handlers ─────────────────
function extractFnNames(handlers) {
  const out = new Set();
  handlers.forEach(h => {
    // Múltiples llamadas separadas por ; o ,
    const parts = h.split(/[;,]/);
    parts.forEach(part => {
      const m = part.trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
      if (m && !['if', 'for', 'while', 'return', 'function'].includes(m[1])) {
        out.add(m[1]);
      }
    });
  });
  return [...out];
}

// ── HELPER: Extraer modales abiertos desde onclick handlers ──────────────────
function extractModalsFromHandlers(handlers) {
  const out = new Set();
  handlers.forEach(h => {
    // openModal('modal-xyz') o showModal('xyz')
    let m = h.match(/(?:openModal|showModal)\(['"](?:modal-)?([a-z0-9-]+)['"]/i);
    if (m) { out.add(m[1]); return; }
    // openXxxModal() → kebab del nombre
    m = h.match(/^open([A-Z][a-zA-Z0-9]*)Modal\s*\(/);
    if (m) {
      const name = m[1].replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase()).replace(/^-/, '');
      out.add(name);
    }
  });
  return [...out];
}

// ──────────────────────────────────────────────────────────────────────────────
// BLOQUE PRINCIPAL: Extracción de screen_blocks
// INSERTAR: Al final de scanFile(), ANTES del return {}
// ──────────────────────────────────────────────────────────────────────────────

  // FASE A + FASE B: Construir screenBlocks
  const screenBlocks = {};
  const lines = text.split('\n');

  for (const s of screens) {
    // ── FASE A: Extraer bloque HTML de la section ─────────────────────────────
    // Patrón confirmado en salvadorex-pos.html: <section id="screen-X" class="...">
    // Nota: screen-pos tiene class="pos-screen", el resto "screen-pad hidden"
    const htmlBlockRe = new RegExp(
      `<section[^>]+id=["']screen-${s}["'][^>]*>([\\s\\S]*?)</section>`,
      'i'
    );
    const htmlMatch = text.match(htmlBlockRe);

    let handlers = [];
    let fnsCalled = [];
    let modalsOpened = [];
    let htmlEndpoints = [];  // normalmente vacío — ver HALLAZGO

    if (htmlMatch) {
      const htmlBlock = htmlMatch[1];
      handlers = extractOnclickHandlers(htmlBlock);
      fnsCalled = extractFnNames(handlers);
      modalsOpened = extractModalsFromHandlers(handlers);
      // Aunque esperamos 0 resultados aquí (ver HALLAZGO), lo intentamos
      htmlEndpoints = extractEndpoints(htmlBlock);
    }

    // ── FASE B: Heurística JS — buscar endpoints cerca de menciones del screen ─
    // Estrategia: encontrar líneas que contienen el nombre del screen (en
    // comentarios, IDs de elementos, nombres de función) en el bloque JS
    // (líneas > 7000) y extraer /api/ calls en el contexto circundante.
    const jsEndpoints = new Set();
    const CONTEXT_RADIUS = 120;  // líneas antes/después del marcador

    // Patrones que indican "este código JS pertenece a screen-X":
    //   1. Comentarios como "/* === Corte Module ===" o "// screen-corte"
    //   2. document.getElementById('screen-X') o querySelector('#screen-X')
    //   3. Función cuyo nombre incluye el nombre del screen (renderInv, loadCuts…)
    const screenCamel = s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const screenUpper = s.toUpperCase().replace(/-/g, '_');

    // Palabras clave derivadas del screen name para buscar en JS
    const screenKeywords = [
      `screen-${s}`,           // 'screen-inventario'
      `screen_${s.replace(/-/g,'_')}`, // 'screen_inventario'
      `'${s}'`,                // showScreen('inventario') — el argumento exacto
      `"${s}"`,
    ];
    // Palabras clave de función basadas en nombre del screen (heurística)
    const fnKeywords = [];
    if (s.length > 3) {
      fnKeywords.push(screenCamel);       // 'inventario' → usable como prefijo
      fnKeywords.push(s.replace(/-/g,'')); // 'menu-digital' → 'menudigital'
    }

    const markerLines = new Set();
    lines.forEach((line, idx) => {
      if (idx < 7000) return; // solo en la sección JS
      const lLower = line.toLowerCase();
      if (screenKeywords.some(kw => lLower.includes(kw.toLowerCase()))) {
        markerLines.add(idx);
      }
      // Funciones: render*, load*, init* que contengan el screen name
      if (fnKeywords.some(kw => lLower.includes(kw.toLowerCase()) &&
           /function\s+|window\.|const\s+|let\s+/.test(line))) {
        markerLines.add(idx);
      }
    });

    // Para cada marcador, revisar ventana de contexto y extraer /api/
    markerLines.forEach(markerIdx => {
      const start = Math.max(7000, markerIdx - CONTEXT_RADIUS);
      const end = Math.min(lines.length - 1, markerIdx + CONTEXT_RADIUS);
      for (let i = start; i <= end; i++) {
        const apiM = lines[i].match(/\/api\/([a-zA-Z0-9_/.-]+)/g);
        if (apiM) {
          const lineContent = lines[i];
          // Descartar si es un comentario
          const trimmed = lineContent.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) continue;
          apiM.forEach(ep => {
            const clean = ep.replace(/[?#].*/, '').replace(/\/$/, '');
            // Descartar flood paths y prefetch hints
            if (clean === '/api/log/client' || clean === '/api/owner/low-stock') return;
            jsEndpoints.add(clean);
          });
        }
      }
    });

    // ── COMBINAR resultados ───────────────────────────────────────────────────
    const allEndpoints = [...new Set([...htmlEndpoints, ...jsEndpoints])].sort();

    screenBlocks[s] = {
      html_block_found: !!htmlMatch,
      endpoints: allEndpoints,
      endpoints_from_html: htmlEndpoints,
      endpoints_from_js_heuristic: [...jsEndpoints].sort(),
      onclick_handlers: handlers.slice(0, 40),
      functions_called: fnsCalled.slice(0, 30),
      modals_opened: modalsOpened,
      js_markers_found: markerLines.size,
      _note: htmlEndpoints.length === 0 && jsEndpoints.size === 0
        ? 'DEUDA: screen sin endpoints detectados — puede tener lógica en módulo externo'
        : undefined
    };
  }

// ── EN EL RETURN de scanFile, agregar: ───────────────────────────────────────
//   screen_blocks: screenBlocks
// ─────────────────────────────────────────────────────────────────────────────

// ── EN LA SECCIÓN DE RELACIONES (después de los nodos de screens), agregar: ──
/*
  // Relaciones screen → endpoint (granularidad fina)
  for (const [screen, info] of Object.entries(pos.screen_blocks || {})) {
    const screenId = 'screen_pos_' + screen;
    // Endpoints
    for (const ep of (info.endpoints || [])) {
      const apiId = 'api_' + ep.replace(/[^a-z0-9]/gi, '_');
      // Añadir nodo de endpoint si no existe
      if (!nodos.find(n => n.id === apiId)) {
        nodos.push({ id: apiId, tipo: 'endpoint', nombre: ep, exclusivo: 'POS', granularidad: 'screen-inferred' });
      }
      relaciones.push({
        from: screenId,
        to: apiId,
        verb: 'llama_api',
        granularidad: 'screen',
        metodo: ep  // el endpoint completo normalizado
      });
    }
    // Modales abiertos desde botones inline de la screen
    for (const m of (info.modals_opened || [])) {
      const modalId = 'modal_pos_' + m;
      if (nodos.find(n => n.id === modalId)) {
        relaciones.push({
          from: screenId,
          to: modalId,
          verb: 'abre_modal',
          contexto: 'onclick en HTML de la screen'
        });
      }
    }
  }
*/
// ─────────────────────────────────────────────────────────────────────────────
// NOTA SOBRE DEUDA DETECTADA:
//
// El HTML de salvadorex-pos.html separa claramente la UI (HTML) de la lógica
// (JS): las sections <section id="screen-X"> solo tienen markup + onclick attrs,
// NO fetch() inline. Toda la lógica de fetch está en el bloque <script> (7000+).
//
// CONSECUENCIA: La Fase A (HTML block) captura handlers/modales pero 0 endpoints.
// La Fase B (heurística JS por cercanía) es la fuente real de endpoints por screen.
//
// DEUDA FUTURA: Para mayor precisión, refactorizar el JS para que cada función
// de screen tenga un comentario anotado como "// @screen inventario" — eso
// permitiría un regex 100% exacto en lugar de la heurística de proximidad.
// ─────────────────────────────────────────────────────────────────────────────
// FIN DEL PATCH 2
// ─────────────────────────────────────────────────────────────────────────────
