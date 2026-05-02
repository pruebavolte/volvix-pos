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
    // Top bar premium minimalista (estilo Apple/Stripe): negro suave, fina,
    // tipografía con tracking apretado, separadores tipo bullet sutil.
    bar.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:99999',
      'width:100%',
      'box-sizing:border-box',
      'background:#0B0B0F',
      'color:#E5E5EA',
      'padding:0 24px',
      'height:32px',
      'line-height:32px',
      'text-align:center',
      'font-size:12px',
      'font-weight:500',
      'letter-spacing:0.01em',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:14px',
      'border-bottom:1px solid #1F1F23',
      '-webkit-font-smoothing:antialiased'
    ].join(';');
    // Sin emojis: solo texto editorial, separadores · de bullet sutil.
    var dot = '<span aria-hidden="true" style="color:rgba(229,229,234,0.30);font-size:10px;margin:0 2px;letter-spacing:0">·</span>';
    bar.innerHTML =
      '<span style="color:#FFFFFF;font-weight:500">Hecho en México</span>' + dot +
      '<span>Desarrollado en Nuevo León</span>' + dot +
      '<span>Licencia vitalicia</span>' + dot +
      '<span>Sin mensualidades</span>';

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
      'top:32px',
      'z-index:99998',
      'width:100%',
      'box-sizing:border-box',
      'background:#FFFFFF',
      'border-bottom:1px solid #ECECEE',
      'padding:8px 16px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'min-height:48px'
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
