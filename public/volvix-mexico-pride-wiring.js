/* volvix-mexico-pride-wiring.js
 * Banner "Hecho en Mexico - Nuevo Leon" auto-injectado en <body>.
 * Se omite en login/registro y cuando ?embed=1.
 * Idempotente: solo inserta una vez por documento.
 */
(function () {
  'use strict';
  if (window.__vlxMexicoPrideLoaded) return;
  window.__vlxMexicoPrideLoaded = true;

  function shouldSkip() {
    try {
      var path = (location.pathname || '').toLowerCase();
      if (/login\.html?$|registro\.html?$|signup|register/.test(path)) return true;
      var qs = new URLSearchParams(location.search || '');
      if (qs.get('embed') === '1') return true;
    } catch (_) {}
    return false;
  }

  function inject() {
    if (shouldSkip()) return;
    if (document.getElementById('vlx-mexico-pride')) return;
    if (!document.body) return;

    var bar = document.createElement('div');
    bar.id = 'vlx-mexico-pride';
    bar.setAttribute('role', 'note');
    bar.setAttribute('aria-label', 'Hecho en Mexico - Nuevo Leon');
    bar.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:99999',
      'width:100%',
      'box-sizing:border-box',
      'background:#006847',
      'color:#FFFFFF',
      'padding:0 16px',
      'height:36px',
      'line-height:36px',
      'text-align:center',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:0.03em',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:10px',
      'border-bottom:2px solid #CE1126',
      'box-shadow:0 2px 8px rgba(0,104,71,0.35)'
    ].join(';');
    bar.innerHTML =
      '<span style="font-size:18px;line-height:1">🇲🇽</span>' +
      '<span><strong>Hecho en México</strong></span>' +
      '<span style="color:rgba(255,255,255,0.45);font-size:10px">●</span>' +
      '<span>Soy Mexicano</span>' +
      '<span style="color:rgba(255,255,255,0.45);font-size:10px">●</span>' +
      '<span style="background:#CE1126;padding:2px 10px;border-radius:3px;font-size:12px;letter-spacing:0.05em">Hecho en Nuevo León 🦅</span>';

    // Insertar al inicio del <body> (encima de todo el contenido visual).
    try {
      if (document.body.firstChild) {
        document.body.insertBefore(bar, document.body.firstChild);
      } else {
        document.body.appendChild(bar);
      }
    } catch (_) {
      try { document.body.appendChild(bar); } catch (__) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
