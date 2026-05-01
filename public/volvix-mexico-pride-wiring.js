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
    bar.setAttribute('aria-label', 'Hecho en Mexico');
    bar.style.cssText = [
      'position:relative',
      'background:linear-gradient(90deg,#006847 0%,#FFFFFF 50%,#CE1126 100%)',
      'color:#0A0A0A',
      'padding:6px 16px',
      'text-align:center',
      'font-size:12px',
      'font-weight:600',
      'border-bottom:1px solid rgba(0,0,0,0.1)',
      'font-family:Inter,-apple-system,sans-serif',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:12px'
    ].join(';');
    bar.innerHTML =
      '<span>🇲🇽 <strong>Hecho en México</strong></span>' +
      '<span style="opacity:0.7">·</span>' +
      '<span>Soy Mexicano · Hecho en Nuevo León 🦅</span>';

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
