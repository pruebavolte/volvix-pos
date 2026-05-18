/**
 * PATCH 5: Window vars — estado global en window.*
 * =================================================
 * Detecta asignaciones window.X = valor donde X NO es función.
 *
 * HALLAZGOS REALES en salvadorex-pos.html (calibración manual):
 *   window.__volvixPreviewMode   = true             L36  — flag booleano
 *   window.__volvixPreviewModule = qs.get(...)      L37  — string dinámico
 *   window.__volvixPreviewGiro   = qs.get(...)      L38  — string dinámico
 *   window.__volvixDevMode       = devMode          L180 — booleano
 *   window.__volvixWelcomeWizardChecked = true      L2564
 *   window.IMPERSONATING         = { email, tid … } L3304 — objeto complejo
 *   window.__impErrs             = []               L3315 — array mutable
 *   window.VOLVIX                = VOLVIX           L7336 — objeto global principal
 *   window.CART.length           = 0                L9838 — mutación de array
 *   window.fetch                 = origFetch        L3365/3505 — monkey-patch fetch
 *
 *   Total asignaciones detectadas: ~25 distintas
 *   Funciones asignadas a window (excluidas): __vlxResendVerify, __impLogReader, etc.
 *
 * RIESGO: window.VOLVIX, window.CART, window.IMPERSONATING son estado mutable
 *         global sin encapsulación — dificulta testing y produce acoplamiento oculto.
 *
 * HOW TO INTEGRATE: Añadir a scanFile() de generate-system-map.js.
 */

// ---------------------------------------------------------------------------
// SNIPPET PARA INSERTAR EN scanFile()
// ---------------------------------------------------------------------------

/**
 * Detecta asignaciones de estado global en window.* (excluye funciones).
 * @param {string} text - contenido completo del archivo
 * @returns {{ window_vars: WindowVarEntry[], function_assignments: string[], total: number }}
 */
function detectWindowVars(text) {
  const windowVars = [];
  const functionAssignments = [];

  // Regex principal: window.X = <valor que no empieza con 'function' ni '=>' aislado>
  // Captura: nombre, valor (primeros 80 chars)
  const winAssignRegex = /window\.([A-Za-z_$][A-Za-z0-9_$.]*)\s*=\s*([^\n;]{1,120})/g;

  let m;
  while ((m = winAssignRegex.exec(text)) !== null) {
    const name = m[1];
    const value = m[2].trim();

    // Excluir: accesos (no asignaciones reales), typeof checks
    if (value.startsWith('typeof ')) continue;
    // Excluir operadores de encadenamiento ?.
    if (name.includes('?.')) continue;

    const isFunction =
      value.startsWith('function') ||
      /^\([^)]*\)\s*=>/.test(value) ||
      /^[A-Za-z_$][A-Za-z0-9_$]*\s*=>/.test(value);

    if (isFunction) {
      functionAssignments.push(`window.${name}`);
    } else {
      // Clasificar tipo de valor
      let kind = 'unknown';
      if (/^(true|false)$/.test(value)) kind = 'boolean';
      else if (/^['"`]/.test(value)) kind = 'string';
      else if (/^\d/.test(value)) kind = 'number';
      else if (value.startsWith('{')) kind = 'object';
      else if (value.startsWith('[')) kind = 'array';
      else if (value.startsWith('null')) kind = 'null';
      else kind = 'expression';

      windowVars.push({
        name: `window.${name}`,
        kind,
        value_preview: value.slice(0, 60),
      });
    }
  }

  // Deduplicar por nombre (conservar primera aparición)
  const seen = new Set();
  const unique = windowVars.filter(v => {
    if (seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  });

  return {
    window_vars: unique,
    function_assignments: [...new Set(functionAssignments)],
    total: unique.length,
    total_functions: new Set(functionAssignments).size,
  };
}

// ---------------------------------------------------------------------------
// INTEGRACIÓN EN scanFile() — agregar al objeto de retorno:
// ---------------------------------------------------------------------------
//
//   const windowData = detectWindowVars(text);
//   return {
//     ...existingReturn,
//     window_state: windowData,
//   };
//
// ---------------------------------------------------------------------------

module.exports = { detectWindowVars };
