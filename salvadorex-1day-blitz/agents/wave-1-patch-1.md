# Agente Wave 1 — Parche 1: Botón → Handler/Modal/Screen

## Misión

Aplicar el Parche 1 del enhancement guide (botones detectan qué función llaman, qué modal abren, a qué screen navegan).

## Contexto que necesitas

Lee:
- `scripts/generate-system-map.js` (el scanner actual del usuario)
- `enhancements/scanner-enhancements.md` (si está en el repo) o usa la guía a continuación

## Output esperado

Crea: **`scripts/_patches/patch-1.diff.js`**

Este archivo contiene SOLO la sección modificada del scanner (el bloque de extracción de buttons), NO el scanner completo. Formato:

```js
// PATCH 1: Botón → Handler/Modal/Screen
// Reemplaza el bloque actual de buttons en scanFile() con esto:

// --- INICIO PARCHE ---
const buttons = [];
const btnRegex = /<button[^>]*?(?:onclick=["']([^"']+)["'])?[^>]*?(?:data-action=["']([^"']+)["'])?[^>]*>([^<]{1,60})<\/button>/g;
let bm;
while ((bm = btnRegex.exec(text)) !== null) {
  const onclick = (bm[1] || '').trim();
  const dataAction = (bm[2] || '').trim();
  const label = bm[3].trim();
  if (!label || label.length <= 1) continue;
  if (buttons.find(b => b.label === label)) continue;

  let calls = null;
  if (onclick) {
    const fnMatch = onclick.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
    if (fnMatch) calls = fnMatch[1];
  }

  let opensModal = null;
  if (onclick) {
    const modalMatch = onclick.match(/(?:openModal|showModal)\(['"]([^'"]+)['"]/);
    if (modalMatch) opensModal = modalMatch[1];
  }

  let navigatesTo = null;
  if (onclick) {
    const navMatch = onclick.match(/showScreen\(['"]([^'"]+)['"]/);
    if (navMatch) navigatesTo = navMatch[1];
  }

  buttons.push({
    id: 'btn_' + prefix + '_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25),
    label,
    handler: onclick.slice(0, 120),
    data_action: dataAction,
    calls,
    opens_modal: opensModal,
    navigates_to: navigatesTo
  });
}
// --- FIN PARCHE ---

// EN LA SECCIÓN DE RELACIONES, AGREGAR:
// --- INICIO PARCHE RELACIONES ---
pos.buttons.forEach(b => {
  if (b.opens_modal) {
    relaciones.push({ from: b.id, to: 'modal_pos_' + b.opens_modal, verb: 'abre_modal' });
  }
  if (b.navigates_to) {
    relaciones.push({ from: b.id, to: 'screen_pos_' + b.navigates_to, verb: 'navega_a_screen' });
  }
  if (b.calls) {
    relaciones.push({ from: b.id, to: 'fn_pos_' + b.calls, verb: 'llama_funcion' });
  }
});
pdc.buttons.forEach(b => {
  if (b.opens_modal) {
    relaciones.push({ from: b.id, to: 'modal_pdc_' + b.opens_modal, verb: 'abre_modal' });
  }
  if (b.calls) {
    relaciones.push({ from: b.id, to: 'fn_pdc_' + b.calls, verb: 'llama_funcion' });
  }
});
// --- FIN PARCHE RELACIONES ---
```

## Validación

Antes de devolver:

1. Verifica que el parche es JavaScript válido (Node debe poder parsearlo sintácticamente).
2. Si tu output incluye números de línea aproximados de dónde insertar en el archivo original, mejor.

## Reporte

Crea `.blitz/status/wave-1-patch-1.md`:

```markdown
# Wave 1 — Parche 1: Botón → Handler

- Estado: ✓ COMPLETADO / ✗ FALLIDO / ⚠️ PARCIAL
- Archivo generado: scripts/_patches/patch-1.diff.js
- Líneas del scanner afectadas (aprox): X-Y (sección de buttons)
- Relaciones nuevas que va a generar: ~3 por botón con handler (≈285 nuevas para 95 botones totales)
- Verbos nuevos: abre_modal, navega_a_screen, llama_funcion
- Errores encontrados: (lista o "ninguno")
```

Después devuelve control al orquestador.
