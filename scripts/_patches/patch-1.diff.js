// PATCH 1: Botón → Handler/Modal/Screen
// ──────────────────────────────────────────────────────────────────────────────
// DÓNDE INSERTAR: En scanFile(), reemplaza el bloque "4. BUTTONS" completo
// (líneas 78-89 de generate-system-map.js).
//
// RESUMEN DE CAMBIOS:
//   Antes: buttons sólo tenía { id, label, handler }
//   Ahora: buttons tiene   { id, label, handler, calls, opens_modal, navigates_to }
//
// VERBOS NUEVOS que aparecen en el grafo de relaciones:
//   - llama_funcion  → button.calls    (ej: "exportar", "doLogout")
//   - abre_modal     → button.opens_modal (ej: "openPaymentModal" → "modal-pay")
//   - navega_a_screen → button.navigates_to (ej: showScreen('pos') → "pos")
//
// PATRONES DETECTADOS en salvadorex-pos.html:
//   showScreen('pos')          → navigates_to: 'pos'
//   openPayment()              → opens_modal: 'pay'  (nombre heurístico)
//   openChangePriceModal()     → opens_modal: 'change-price'
//   openNewCustomerModal()     → opens_modal: 'new-customer'
//   closeModal('modal-pay')    → opens_modal: null (ignorar — es cierre)
//   openModal('modal-xyz')     → opens_modal: 'xyz'
//   showModal('xyz')           → opens_modal: 'xyz'
//   vlxOpenXxx()               → calls: 'vlxOpenXxx'
//   handleLogin(event)         → calls: 'handleLogin'
//   doLogout()                 → calls: 'doLogout'
//   exportar()                 → calls: 'exportar'
// ──────────────────────────────────────────────────────────────────────────────

// ── HELPER: inferir opens_modal desde el nombre de la función ─────────────────
function inferModalFromFn(fn) {
  if (!fn) return null;
  // Patrón explícito: openModal('modal-xxx') o showModal('xxx')
  let m = fn.match(/(?:openModal|showModal)\(['"](?:modal-)?([a-z0-9-]+)['"]/i);
  if (m) return m[1];

  // Patrón: closeModal — ignorar (es cierre, no apertura)
  if (/closeModal\s*\(/.test(fn)) return null;

  // Patrón: openXxxModal() → convierte a kebab-case
  // Ej: openChangePriceModal → 'change-price'
  //     openNewCustomerModal → 'new-customer'
  //     openPaymentModal     → 'payment'
  m = fn.match(/^open([A-Z][a-zA-Z0-9]*)Modal\s*\(/);
  if (m) {
    return m[1]
      .replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase())
      .replace(/^-/, '');
  }

  // Patrón: openXxx() donde Xxx no termina en Modal pero es claramente un modal
  // Ej: openPayment() → modal 'pay'   openNotificationsPanel() → 'notifications-panel'
  m = fn.match(/^open([A-Z][a-zA-Z0-9]*)\s*\(/);
  if (m) {
    const name = m[1]
      .replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase())
      .replace(/^-/, '');
    // Heurística: si el nombre contiene "panel", "queue", "drawer" NO es modal
    if (/panel|queue|drawer|screen/i.test(name)) return null;
    return name;
  }

  return null;
}

// ── HELPER: inferir navigates_to desde el handler ────────────────────────────
function inferScreenFromFn(fn) {
  if (!fn) return null;
  const m = fn.match(/showScreen\(['"]([a-z][a-z0-9-]*)['"]/i);
  return m ? m[1] : null;
}

// ── HELPER: inferir calls (función principal invocada) ───────────────────────
function inferCallsFromFn(fn) {
  if (!fn) return null;
  // Toma el primer identificador antes del '('
  const m = fn.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return m ? m[1] : null;
}

// ── BLOQUE DE EXTRACCIÓN DE BUTTONS (reemplaza líneas 78-89) ─────────────────
//
// NOTA: Copiar este bloque completo dentro de scanFile().
// La firma de inferModalFromFn, inferScreenFromFn e inferCallsFromFn
// deben declararse ANTES de scanFile() (o dentro, si prefieres closure).

  // 4. BUTTONS — extracción enriquecida con calls / opens_modal / navigates_to
  const buttons = [];

  // Regex: captura el atributo onclick y el texto visible (primer nodo texto)
  // Soporta comillas simples y dobles en onclick.
  // Maneja onclick con o sin atributo (botones sin handler tienen label útil).
  const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let bm;

  while ((bm = btnRegex.exec(text)) !== null) {
    const attrs    = bm[1] || '';
    const inner    = bm[2] || '';

    // Extraer onclick del bloque de atributos
    const onclickM = attrs.match(/\bonclick\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const handler  = onclickM ? (onclickM[1] || onclickM[2] || '').trim().slice(0, 120) : '';

    // Extraer texto visible: primera cadena de texto no-HTML del inner
    const labelRaw = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    const label    = labelRaw || '';

    // Filtros de calidad: ignorar botones sin texto útil o duplicados por label
    if (!label || label.length < 2) continue;
    if (buttons.find(b => b.label === label)) continue;

    // Enriquecimiento semántico
    const navigates_to = inferScreenFromFn(handler) || null;
    const opens_modal  = navigates_to ? null : inferModalFromFn(handler);
    const calls        = inferCallsFromFn(handler) || null;

    // ID normalizado
    const id = 'btn_' + prefix + '_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25);

    buttons.push({ id, label, handler, calls, opens_modal, navigates_to });
  }

// ── RELACIONES ADICIONALES — añadir DESPUÉS del bloque de nodos de botones ───
//
// Una vez que buttons tiene los campos enriquecidos, añadir al grafo de
// relaciones: (insertar junto al bucle de pos.modals / pos.screens)

/*
  // Relaciones button → screen
  pos.buttons.filter(b => b.navigates_to).forEach(b => {
    const screenId = 'screen_pos_' + b.navigates_to;
    // Solo si el screen existe en el grafo
    if (nodos.find(n => n.id === screenId)) {
      relaciones.push({ from: b.id, to: screenId, verb: 'navega_a_screen',
                        contexto: b.handler });
    }
  });

  // Relaciones button → modal
  pos.buttons.filter(b => b.opens_modal).forEach(b => {
    const modalId = 'modal_pos_' + b.opens_modal;
    relaciones.push({ from: b.id, to: modalId, verb: 'abre_modal',
                      contexto: b.handler });
  });

  // Relaciones button → función (para buttons con calls != showScreen/openXxx)
  pos.buttons.filter(b => b.calls && !b.navigates_to && !b.opens_modal).forEach(b => {
    relaciones.push({ from: b.id, to: 'mod_pos', verb: 'llama_funcion',
                      contexto: b.calls });
  });
*/
// ──────────────────────────────────────────────────────────────────────────────
// FIN DEL PATCH 1
// Aplicar también en el return de scanFile():
//   buttons: buttons.slice(0, 80),   ← aumentar el límite de 50→80
// ──────────────────────────────────────────────────────────────────────────────
