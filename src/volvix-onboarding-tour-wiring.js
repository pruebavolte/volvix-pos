/**
 * volvix-onboarding-tour-wiring.js  (R12-O-3-B FIX-O3-B-3)
 *
 * Tour interactivo de 8 pasos con tooltips contextuales que aparece
 * post-wizard de bienvenida. Tooltips con flechas, dim del resto de
 * la pantalla, navegación Anterior / Siguiente / Saltar.
 *
 * Auto-trigger: si sessionStorage.volvix_launch_tour_after_load === '1'
 *   o si window.location.search contiene ?tour=1
 *
 * Reset desde menú Ayuda: window.VolvixOnboardingTour.start()
 *
 * Sin dependencias externas. Compatible offline.
 */
(function () {
  'use strict';
  if (window.VolvixOnboardingTour) return;

  // ====== PASOS DEL TOUR ======
  // Cada paso: target=selector que iluminar, title, body,
  //            placement=top|bottom|left|right (auto si no cabe)
  var STEPS = [
    {
      target: '#topbar, header[role="banner"], .topbar, #header, .navbar',
      title: 'Tu balance del día',
      body: 'Aquí ves de un vistazo cuánto has vendido hoy, los pendientes de cobro y el estado de la caja.',
      placement: 'bottom'
    },
    {
      target: '#sidebar, aside, nav.sidebar, .side-nav, #moduleNav',
      title: 'Tus módulos activos',
      body: 'Estos son los módulos habilitados para tu giro. Puedes cambiarlos en "Mis Módulos" cuando lo necesites.',
      placement: 'right'
    },
    {
      target: '#barcode-input, #productSearch, .product-search, [data-search="product"]',
      title: 'Buscar o escanear productos',
      body: 'Escribe el nombre, código de barras o usa Ctrl+M para buscar rápidamente cualquier producto.',
      placement: 'bottom'
    },
    {
      target: '#cart, #ticket-items, .cart, .ticket, [data-cart]',
      title: 'Tu carrito de venta',
      body: 'Los productos que escanees aparecen aquí. Puedes ajustar cantidades, aplicar descuentos o quitar items.',
      placement: 'left'
    },
    {
      target: '#cobrarBtn, #btnCobrar, .btn-cobrar, [data-action="cobrar"], button[data-cobrar]',
      title: 'Cobrar rápido (F12)',
      body: 'Presiona F12 o este botón para abrir el cobro. Acepta efectivo, tarjeta, transferencia y mixtos.',
      placement: 'top'
    },
    {
      target: '#reportsBtn, [data-page="reports"], .menu-reports, a[href*="reportes"]',
      title: 'Reportes y cierre Z',
      body: 'Revisa ventas, inventario y haz el cierre Z al final del día desde el módulo de reportes.',
      placement: 'right'
    },
    {
      target: '#settingsBtn, [data-page="settings"], .menu-settings, a[href*="settings"], a[href*="modulos"]',
      title: 'Mis Módulos y configuración',
      body: 'Activa o desactiva módulos, configura impuestos, sucursales y más desde aquí.',
      placement: 'right'
    },
    {
      target: '#logoutBtn, [data-action="logout"], .btn-logout, a[href*="logout"]',
      title: 'Cierre de sesión seguro',
      body: 'Al terminar tu turno, cierra sesión desde este botón para proteger tu cuenta.',
      placement: 'left'
    }
  ];

  // ====== ESTILOS INYECTADOS ======
  var STYLE_ID = 'volvix-onboarding-tour-style';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#vto-overlay{position:fixed;inset:0;z-index:99998;pointer-events:none}',
      '#vto-dim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;transition:opacity .25s;pointer-events:auto}',
      '#vto-spotlight{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.55), 0 0 0 4px rgba(255,255,255,.55), 0 0 30px rgba(255,255,255,.2);z-index:99999;transition:all .35s cubic-bezier(.4,.0,.2,1);pointer-events:none}',
      '#vto-tooltip{position:fixed;background:#fff;color:#1f2937;padding:18px 20px;border-radius:12px;max-width:340px;min-width:280px;box-shadow:0 18px 48px rgba(0,0,0,.4);z-index:100000;font-family:Segoe UI,Tahoma,sans-serif;animation:vtoFade .25s}',
      '@keyframes vtoFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '#vto-tooltip h4{font-size:16px;color:#1e3c72;margin:0 0 8px 0;font-weight:700}',
      '#vto-tooltip p{font-size:13px;line-height:1.55;color:#4b5563;margin:0 0 14px 0}',
      '#vto-tooltip .vto-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #f3f4f6;padding-top:12px}',
      '#vto-tooltip .vto-counter{font-size:11px;color:#9ca3af}',
      '#vto-tooltip .vto-actions{display:flex;gap:6px}',
      '#vto-tooltip button{padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:.15s;font-family:inherit}',
      '#vto-tooltip .vto-btn-prev{background:#f3f4f6;color:#374151}',
      '#vto-tooltip .vto-btn-prev:hover{background:#e5e7eb}',
      '#vto-tooltip .vto-btn-next{background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff}',
      '#vto-tooltip .vto-btn-next:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(42,82,152,.4)}',
      '#vto-tooltip .vto-btn-skip{background:transparent;color:#6b7280;text-decoration:underline;padding:8px 4px}',
      '#vto-tooltip .vto-btn-skip:hover{color:#374151}',
      '#vto-tooltip .vto-arrow{position:absolute;width:0;height:0}',
      '#vto-tooltip[data-place="bottom"] .vto-arrow{top:-9px;left:24px;border:9px solid transparent;border-top:0;border-bottom-color:#fff}',
      '#vto-tooltip[data-place="top"] .vto-arrow{bottom:-9px;left:24px;border:9px solid transparent;border-bottom:0;border-top-color:#fff}',
      '#vto-tooltip[data-place="left"] .vto-arrow{right:-9px;top:24px;border:9px solid transparent;border-right:0;border-left-color:#fff}',
      '#vto-tooltip[data-place="right"] .vto-arrow{left:-9px;top:24px;border:9px solid transparent;border-left:0;border-right-color:#fff}',
      '#vto-tooltip[data-place="center"]{top:50%;left:50%;transform:translate(-50%,-50%)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ====== ESTADO ======
  var idx = 0;
  var active = false;
  var dimEl = null, spotEl = null, ttEl = null;

  function findTarget(selectorList) {
    var sels = (selectorList || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function placeSpotlight(rect) {
    if (!spotEl) return;
    if (!rect) {
      spotEl.style.display = 'none';
      return;
    }
    spotEl.style.display = 'block';
    var pad = 8;
    spotEl.style.top = Math.max(0, rect.top - pad) + 'px';
    spotEl.style.left = Math.max(0, rect.left - pad) + 'px';
    spotEl.style.width = (rect.width + pad * 2) + 'px';
    spotEl.style.height = (rect.height + pad * 2) + 'px';
  }

  function placeTooltip(rect, placement) {
    if (!ttEl) return;
    if (!rect) {
      ttEl.dataset.place = 'center';
      ttEl.style.top = '50%';
      ttEl.style.left = '50%';
      ttEl.style.transform = 'translate(-50%,-50%)';
      return;
    }
    ttEl.style.transform = '';
    var w = ttEl.offsetWidth || 320;
    var h = ttEl.offsetHeight || 180;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var place = placement || 'bottom';
    var top, left;

    function fitsBottom() { return rect.bottom + h + 16 < vh; }
    function fitsTop()    { return rect.top - h - 16 > 0; }
    function fitsRight()  { return rect.right + w + 16 < vw; }
    function fitsLeft()   { return rect.left - w - 16 > 0; }

    // Auto-flip si no cabe
    if (place === 'bottom' && !fitsBottom()) place = fitsTop() ? 'top' : (fitsRight() ? 'right' : 'left');
    if (place === 'top'    && !fitsTop())    place = fitsBottom() ? 'bottom' : (fitsRight() ? 'right' : 'left');
    if (place === 'right'  && !fitsRight())  place = fitsLeft() ? 'left' : (fitsBottom() ? 'bottom' : 'top');
    if (place === 'left'   && !fitsLeft())   place = fitsRight() ? 'right' : (fitsBottom() ? 'bottom' : 'top');

    switch (place) {
      case 'bottom':
        top = rect.bottom + 14;
        left = Math.max(10, Math.min(rect.left, vw - w - 10));
        break;
      case 'top':
        top = rect.top - h - 14;
        left = Math.max(10, Math.min(rect.left, vw - w - 10));
        break;
      case 'right':
        top = Math.max(10, Math.min(rect.top, vh - h - 10));
        left = rect.right + 14;
        break;
      case 'left':
        top = Math.max(10, Math.min(rect.top, vh - h - 10));
        left = rect.left - w - 14;
        break;
      default:
        top = vh / 2 - h / 2;
        left = vw / 2 - w / 2;
    }
    ttEl.dataset.place = place;
    ttEl.style.top = top + 'px';
    ttEl.style.left = left + 'px';
  }

  function buildTooltip() {
    ttEl = document.createElement('div');
    ttEl.id = 'vto-tooltip';
    ttEl.setAttribute('role', 'dialog');
    ttEl.setAttribute('aria-live', 'polite');
    ttEl.innerHTML = [
      '<span class="vto-arrow"></span>',
      '<h4 id="vto-title"></h4>',
      '<p id="vto-body"></p>',
      '<div class="vto-bar">',
        '<span class="vto-counter" id="vto-counter"></span>',
        '<div class="vto-actions">',
          '<button class="vto-btn-skip" id="vto-skip">Saltar tour</button>',
          '<button class="vto-btn-prev" id="vto-prev">Anterior</button>',
          '<button class="vto-btn-next" id="vto-next">Siguiente</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(ttEl);
    document.getElementById('vto-prev').addEventListener('click', prev);
    document.getElementById('vto-next').addEventListener('click', next);
    document.getElementById('vto-skip').addEventListener('click', stop);
  }

  function buildOverlay() {
    dimEl = document.createElement('div');
    dimEl.id = 'vto-dim';
    dimEl.addEventListener('click', function (e) { e.stopPropagation(); });
    document.body.appendChild(dimEl);

    spotEl = document.createElement('div');
    spotEl.id = 'vto-spotlight';
    document.body.appendChild(spotEl);
  }

  function renderStep() {
    var step = STEPS[idx];
    if (!step) { stop(); return; }
    if (!ttEl) buildTooltip();
    if (!dimEl) buildOverlay();

    document.getElementById('vto-title').textContent = step.title;
    document.getElementById('vto-body').textContent = step.body;
    document.getElementById('vto-counter').textContent = (idx + 1) + ' / ' + STEPS.length;

    var prevBtn = document.getElementById('vto-prev');
    var nextBtn = document.getElementById('vto-next');
    prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = idx === STEPS.length - 1 ? '¡Listo!' : 'Siguiente';

    var target = findTarget(step.target);
    if (target) {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      // Esperar al scroll antes de medir
      setTimeout(function () {
        var rect = target.getBoundingClientRect();
        placeSpotlight(rect);
        placeTooltip(rect, step.placement);
      }, 280);
    } else {
      placeSpotlight(null);
      placeTooltip(null, 'center');
    }
  }

  function next() {
    if (idx < STEPS.length - 1) { idx++; renderStep(); }
    else { stop(); }
  }
  function prev() { if (idx > 0) { idx--; renderStep(); } }

  function start(opts) {
    opts = opts || {};
    if (active) return;
    active = true;
    idx = opts.startAt || 0;
    injectStyles();
    if (!dimEl) buildOverlay();
    if (!ttEl) buildTooltip();
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    renderStep();
    try { localStorage.setItem('volvix_tour_started_at', String(Date.now())); } catch (e) {}
  }

  function stop() {
    active = false;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    [dimEl, spotEl, ttEl].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
    dimEl = spotEl = ttEl = null;
    try { localStorage.setItem('volvix_tour_completed_at', String(Date.now())); } catch (e) {}
  }

  function onKey(e) {
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    else if (e.key === 'ArrowLeft') prev();
  }
  function onResize() {
    if (!active) return;
    var step = STEPS[idx]; if (!step) return;
    var t = findTarget(step.target);
    if (t) { var r = t.getBoundingClientRect(); placeSpotlight(r); placeTooltip(r, step.placement); }
  }

  // ====== Auto-trigger después de cargar ======
  function maybeAutoStart() {
    var fromWizard = false;
    try { fromWizard = sessionStorage.getItem('volvix_launch_tour_after_load') === '1'; } catch (e) {}
    var fromQuery = /[\?&]tour=1\b/.test(location.search);
    if (fromWizard || fromQuery) {
      try { sessionStorage.removeItem('volvix_launch_tour_after_load'); } catch (e) {}
      // Esperar a que la UI esté completamente montada
      setTimeout(function () { start(); }, 1200);
    }
  }

  // ====== API pública ======
  window.VolvixOnboardingTour = {
    start: start,
    stop: stop,
    next: next,
    prev: prev,
    isActive: function () { return active; },
    steps: STEPS
  };

  // Backwards compat con R8d (window.startVolvixTour)
  if (typeof window.startVolvixTour !== 'function') {
    window.startVolvixTour = start;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoStart);
  } else {
    maybeAutoStart();
  }
})();
