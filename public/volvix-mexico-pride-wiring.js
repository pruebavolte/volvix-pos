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
    // Logo oficial "Hecho en Nuevo León México" (escudo del León, color naranja #F7941D)
    var nlLogoSVG =
      '<svg width="72" height="28" viewBox="0 0 72 28" xmlns="http://www.w3.org/2000/svg" aria-label="Hecho en Nuevo León México">' +
        // Escudo (shield)
        '<path d="M2,2 L18,2 L18,18 Q18,26 10,27.5 Q2,26 2,18 Z" fill="none" stroke="#F7941D" stroke-width="1.6" stroke-linejoin="round"/>' +
        // Melena del León (mane - círculo exterior)
        '<circle cx="10" cy="13" r="6.2" fill="none" stroke="#F7941D" stroke-width="1.1"/>' +
        // Cara del León
        '<circle cx="10" cy="13" r="4" fill="none" stroke="#F7941D" stroke-width="0.9"/>' +
        // Orejas
        '<path d="M6.5,8.5 L7.5,10.5" stroke="#F7941D" stroke-width="0.9" stroke-linecap="round"/>' +
        '<path d="M13.5,8.5 L12.5,10.5" stroke="#F7941D" stroke-width="0.9" stroke-linecap="round"/>' +
        // Ojos
        '<circle cx="8.5" cy="12.5" r="0.7" fill="#F7941D"/>' +
        '<circle cx="11.5" cy="12.5" r="0.7" fill="#F7941D"/>' +
        // Nariz
        '<path d="M9.2,14.2 Q10,15 10.8,14.2" fill="none" stroke="#F7941D" stroke-width="0.7"/>' +
        // Barba / mandíbula
        '<path d="M7,15.5 Q10,18 13,15.5" fill="none" stroke="#F7941D" stroke-width="0.8" stroke-linecap="round"/>' +
        // Texto "HECHO EN"
        '<text x="22" y="9" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="5.5" fill="#F7941D" letter-spacing="0.5">HECHO EN</text>' +
        // Texto "NUEVO"
        '<text x="22" y="17" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="7.5" fill="#F7941D" letter-spacing="0.3">NUEVO</text>' +
        // Texto "LEÓN"
        '<text x="22" y="25" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="7.5" fill="#F7941D" letter-spacing="0.3">LEÓN</text>' +
        // Texto "MÉXICO" pequeño
        '<text x="52" y="28" font-family="Arial,sans-serif" font-weight="700" font-size="4.5" fill="#F7941D" letter-spacing="1">MÉXICO</text>' +
      '</svg>';

    bar.innerHTML =
      '<span style="font-size:18px;line-height:1;margin-right:4px">🇲🇽</span>' +
      '<span><strong>Hecho en México</strong></span>' +
      '<span style="color:rgba(255,255,255,0.4);font-size:10px;margin:0 6px">●</span>' +
      '<span>Soy Mexicano</span>' +
      '<span style="color:rgba(255,255,255,0.4);font-size:10px;margin:0 6px">●</span>' +
      '<span style="display:inline-flex;align-items:center;background:rgba(247,148,29,0.12);border:1px solid rgba(247,148,29,0.45);border-radius:4px;padding:2px 8px 2px 4px;gap:6px">' +
        nlLogoSVG +
      '</span>';

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
