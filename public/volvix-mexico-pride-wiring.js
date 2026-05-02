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
    // Banda verde superior — solo texto. El logo oficial "Hecho en Nuevo León"
    // va en una franja separada DEBAJO de la línea verde (no inventamos SVG).
    bar.innerHTML =
      '<span style="font-size:18px;line-height:1;margin-right:4px">🇲🇽</span>' +
      '<span><strong>Hecho en México</strong></span>' +
      '<span style="color:rgba(255,255,255,0.4);font-size:10px;margin:0 6px">●</span>' +
      '<span>Soy Mexicano</span>' +
      '<span style="color:rgba(255,255,255,0.4);font-size:10px;margin:0 6px">●</span>' +
      '<span>Hecho en Nuevo León 🦅</span>';

    // Franja blanca con el logo OFICIAL subido por el dueño.
    // Drop the file at ONE of these paths and it aparece automáticamente:
    //   /logos/hecho-en-nuevo-leon.svg   ← preferido (vector, escala perfecto)
    //   /logos/hecho-en-nuevo-leon.png
    //   /logos/hecho-en-nuevo-leon.jpg
    // Si ninguno existe, la franja se auto-colapsa (sin ícono roto).
    var nlStrip = document.createElement('div');
    nlStrip.id = 'vlx-nl-logo-strip';
    nlStrip.setAttribute('role', 'note');
    nlStrip.setAttribute('aria-label', 'Logo oficial Hecho en Nuevo León México');
    nlStrip.style.cssText = [
      'position:sticky',
      'top:36px',
      'z-index:99998',
      'width:100%',
      'box-sizing:border-box',
      'background:#FFFFFF',
      'border-bottom:1px solid #E5E7EB',
      'padding:10px 16px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'min-height:56px'
    ].join(';');

    // Cascada SVG → PNG → JPG. Si todos 404, ocultamos la franja entera.
    var candidates = [
      '/logos/hecho-en-nuevo-leon.svg',
      '/logos/hecho-en-nuevo-leon.png',
      '/logos/hecho-en-nuevo-leon.jpg'
    ];
    var nlImg = document.createElement('img');
    nlImg.alt = 'Hecho en Nuevo León México';
    // El logo oficial es horizontal (escudo del león + texto). 48px de alto da
    // buen tamaño en desktop sin ser invasivo, y deja respirar el espacio.
    nlImg.style.cssText = 'max-height:48px;width:auto;display:block;image-rendering:auto';
    nlImg.loading = 'eager';
    nlImg.decoding = 'async';
    var idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        nlStrip.style.display = 'none';
        return;
      }
      nlImg.src = candidates[idx++];
    }
    nlImg.onerror = tryNext;
    tryNext();
    nlStrip.appendChild(nlImg);

    // Insertar al inicio del <body>: primero la franja verde, luego el logo NL.
    try {
      if (document.body.firstChild) {
        document.body.insertBefore(nlStrip, document.body.firstChild);
        document.body.insertBefore(bar, nlStrip);
      } else {
        document.body.appendChild(bar);
        document.body.appendChild(nlStrip);
      }
    } catch (_) {
      try {
        document.body.appendChild(bar);
        document.body.appendChild(nlStrip);
      } catch (__) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
