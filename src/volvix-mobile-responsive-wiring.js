/* volvix-mobile-responsive-wiring.js
 * R8d FIX-M3 + FIX-M4 + FIX-M5
 *
 * FIX-M3: detect touch device + adaptive UI classes on <html>
 * FIX-M4: confirmCriticalAction helper (double-tap on mobile for critical actions)
 * FIX-M5: First-visit onboarding tour (5 guided steps + skip + replay)
 *
 * No external deps. Idempotent (safe to load multiple times).
 * Exposes:
 *   - window.confirmCriticalAction(message, callback, options)
 *   - window.startVolvixTour() / window.resetVolvixTour()
 *   - window.VolvixMobile = { isTouch, isMobile, ... }
 */
(function () {
  'use strict';

  if (window.__VOLVIX_MOBILE_WIRED__) return;
  window.__VOLVIX_MOBILE_WIRED__ = true;

  // ───────────────────────── FIX-M3: touch + adaptive UI ─────────────────────
  var isTouch = ('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                (navigator.msMaxTouchPoints > 0);

  function refreshMobileFlag() {
    var isMobile = window.matchMedia('(max-width: 640px)').matches;
    var isTablet = window.matchMedia('(max-width: 1024px)').matches;
    var html = document.documentElement;
    html.classList.toggle('touch-device', !!isTouch);
    html.classList.toggle('mobile-device', !!isMobile);
    html.classList.toggle('tablet-device', !!isTablet);
    if (window.VolvixMobile) {
      window.VolvixMobile.isMobile = isMobile;
      window.VolvixMobile.isTablet = isTablet;
    }
    return isMobile;
  }

  window.VolvixMobile = {
    isTouch: isTouch,
    isMobile: false,
    isTablet: false
  };

  function applyMobileFullscreenToModals() {
    if (!window.VolvixMobile.isMobile) return;
    try {
      var modals = document.querySelectorAll('.modal, .dialog, [class*="modal-content"]');
      for (var i = 0; i < modals.length; i++) {
        modals[i].classList.add('mobile-fullscreen');
      }
    } catch (e) { /* ignore */ }
  }

  function onResize() {
    refreshMobileFlag();
    applyMobileFullscreenToModals();
  }

  // ───────────────────────── FIX-M4: confirmCriticalAction ───────────────────
  // Avoid accidental taps on destructive actions (delete, refund, close-Z, logout)
  // - On desktop: window.confirm()
  // - On mobile + requireDoubleTap: returns a wrapped handler requiring 2 taps in 1.5s
  // - Falls back to window.confirm if no doubletap requested
  var __doubleTapState = { last: 0, target: null };

  function _toast(msg) {
    try {
      if (window.toast) return window.toast(msg);
      if (window.showToast) return window.showToast(msg);
    } catch (e) { /* ignore */ }
    // Fallback: ephemeral floating div
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);' +
      'background:rgba(20,20,20,0.92);color:#fff;padding:10px 18px;border-radius:8px;' +
      'font-size:14px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.3);' +
      'pointer-events:none;max-width:80vw;text-align:center;';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  /**
   * confirmCriticalAction(message, callback, options?)
   * - message: text shown in confirm() / toast
   * - callback: function executed after confirmation
   * - options: { requireDoubleTap?: boolean }
   *
   * Returns:
   *   - If called with options.returnHandler === true → returns an event-handler
   *     suitable for onClick that requires 2 taps within 1.5s on mobile.
   *   - Else: invokes callback() directly after confirm/double-tap is complete
   *     and returns true|false.
   */
  function confirmCriticalAction(message, callback, options) {
    options = options || {};
    var msg = message || '¿Confirmar esta acción?';
    var isMobile = window.VolvixMobile && window.VolvixMobile.isMobile;

    if (options.returnHandler) {
      return function (ev) {
        if (isMobile && options.requireDoubleTap) {
          var now = Date.now();
          var sameTarget = __doubleTapState.target === (ev && ev.currentTarget);
          if (sameTarget && (now - __doubleTapState.last) < 1500) {
            __doubleTapState.last = 0;
            __doubleTapState.target = null;
            try { callback && callback(ev); } catch (e) { console.error(e); }
            return;
          }
          __doubleTapState.last = now;
          __doubleTapState.target = ev && ev.currentTarget;
          _toast('Toca de nuevo para confirmar');
          return;
        }
        if (window.confirm(msg)) {
          try { callback && callback(ev); } catch (e) { console.error(e); }
        }
      };
    }

    // Synchronous mode
    if (isMobile && options.requireDoubleTap) {
      // Without an event we cannot do real double-tap; fall back to confirm()
      if (window.confirm(msg + '\n\n(Toca OK para confirmar)')) {
        try { return callback && callback(); } catch (e) { console.error(e); return false; }
      }
      return false;
    }
    if (window.confirm(msg)) {
      try { callback && callback(); return true; } catch (e) { console.error(e); return false; }
    }
    return false;
  }
  window.confirmCriticalAction = confirmCriticalAction;

  // ───────────────────────── FIX-M5: Onboarding tour ─────────────────────────
  var TOUR_KEY = 'volvix_tour_done';
  var TOUR_VERSION_KEY = 'volvix_tour_version';
  var TOUR_VERSION = '1';

  var TOUR_STEPS = [
    {
      id: 1,
      title: 'Buscar o escanear producto',
      body: 'Aquí escaneas el código de barras o buscas un producto por nombre. Funciona con lectores USB y cámara del dispositivo.',
      selector: '#bcInput, .pos-code-bar input, input[placeholder*="Escanea" i], input[placeholder*="código" i]'
    },
    {
      id: 2,
      title: 'Tu carrito de venta',
      body: 'Aquí ves los productos agregados, cantidades y subtotales. Puedes editar cantidades o eliminar items.',
      selector: 'table.pos-cart, .pos-cart-wrap, .cart-panel'
    },
    {
      id: 3,
      title: 'Cobrar (F2)',
      body: 'Pulsa F2 o este botón para abrir el modal de cobro. Soporta efectivo, tarjeta, transferencia y combinaciones.',
      selector: '.btn-cobrar, [data-action="cobrar"], button[onclick*="cobrar" i]'
    },
    {
      id: 4,
      title: 'Reportes y ventas',
      body: 'En este menú encuentras corte Z, reportes diarios, ventas por turno y exportación a Excel/PDF.',
      selector: '.menu-btn[onclick*="reporte" i], .menu-btn[onclick*="report" i], a[href*="reporte" i]'
    },
    {
      id: 5,
      title: 'Cerrar sesión',
      body: 'Aquí cierras sesión de forma segura. Tus datos quedan guardados en la nube. Recuerda hacer corte Z al final del turno.',
      selector: '.tb-btn[onclick*="logout" i], .tb-btn[onclick*="cerrar" i], button[onclick*="logout" i], #btnLogout'
    }
  ];

  function tourEl(tag, props, kids) {
    var el = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'style' && typeof props[k] === 'object') {
          for (var s in props[k]) el.style[s] = props[k][s];
        } else if (k === 'class') {
          el.className = props[k];
        } else if (k === 'text') {
          el.textContent = props[k];
        } else if (k === 'html') {
          el.innerHTML = props[k];
        } else if (k.indexOf('on') === 0 && typeof props[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else {
          el.setAttribute(k, props[k]);
        }
      }
    }
    if (kids) {
      if (!Array.isArray(kids)) kids = [kids];
      kids.forEach(function (c) { if (c) el.appendChild(c); });
    }
    return el;
  }

  function findTargetEl(selector) {
    if (!selector) return null;
    try {
      var parts = selector.split(',');
      for (var i = 0; i < parts.length; i++) {
        var el = document.querySelector(parts[i].trim());
        if (el && el.offsetParent !== null) return el; // visible
      }
      // fallback: any matching, even hidden
      return document.querySelector(selector) || null;
    } catch (e) { return null; }
  }

  function positionSpotlight(targetEl, spotlight) {
    if (!targetEl) {
      // Center spotlight in viewport when target not found
      spotlight.style.top = '40%';
      spotlight.style.left = '40%';
      spotlight.style.width = '20%';
      spotlight.style.height = '20%';
      spotlight.style.opacity = '0';
      return null;
    }
    var r = targetEl.getBoundingClientRect();
    var pad = 6;
    spotlight.style.top = Math.max(0, r.top - pad) + 'px';
    spotlight.style.left = Math.max(0, r.left - pad) + 'px';
    spotlight.style.width = (r.width + pad * 2) + 'px';
    spotlight.style.height = (r.height + pad * 2) + 'px';
    spotlight.style.opacity = '1';
    return r;
  }

  function buildTourUI() {
    // Backdrop with cutout (using box-shadow trick)
    var backdrop = tourEl('div', {
      id: 'volvix-tour-backdrop',
      style: {
        position: 'fixed', inset: '0', zIndex: '99000',
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'auto'
      }
    });
    var spotlight = tourEl('div', {
      id: 'volvix-tour-spotlight',
      style: {
        position: 'fixed', top: '0', left: '0', width: '0', height: '0',
        zIndex: '99001', pointerEvents: 'none',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        borderRadius: '8px',
        border: '2px solid #2D5F8F',
        transition: 'all 0.3s ease',
        opacity: '0'
      }
    });
    var card = tourEl('div', {
      id: 'volvix-tour-card',
      style: {
        position: 'fixed', zIndex: '99002',
        background: '#fff', color: '#1c1917',
        borderRadius: '12px', padding: '18px 20px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        width: 'min(92vw, 380px)',
        fontSize: '14px', lineHeight: '1.5',
        bottom: '20px', left: '50%', transform: 'translateX(-50%)'
      }
    });
    backdrop.appendChild(spotlight);
    document.body.appendChild(backdrop);
    document.body.appendChild(card);
    return { backdrop: backdrop, spotlight: spotlight, card: card };
  }

  function destroyTourUI() {
    ['volvix-tour-backdrop', 'volvix-tour-card'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  var __tourState = { idx: 0, ui: null, running: false };

  function renderTourStep() {
    var ui = __tourState.ui;
    if (!ui) return;
    var step = TOUR_STEPS[__tourState.idx];
    if (!step) { endTour(true); return; }

    var target = findTargetEl(step.selector);
    positionSpotlight(target, ui.spotlight);

    // Clear card
    ui.card.innerHTML = '';
    var stepLabel = tourEl('div', {
      style: { fontSize: '11px', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
      text: 'Paso ' + (__tourState.idx + 1) + ' de ' + TOUR_STEPS.length
    });
    var title = tourEl('div', {
      style: { fontWeight: '700', fontSize: '17px', marginBottom: '8px', color: '#2D5F8F' },
      text: step.title
    });
    var body = tourEl('div', {
      style: { marginBottom: '16px', color: '#44403c' },
      text: step.body
    });
    var actions = tourEl('div', {
      style: { display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }
    });
    var skip = tourEl('button', {
      type: 'button',
      style: {
        background: 'transparent', border: 'none', color: '#78716c',
        cursor: 'pointer', fontSize: '13px', padding: '8px 4px',
        textDecoration: 'underline', minHeight: '44px'
      },
      text: 'Saltar tour',
      onclick: function () { endTour(true); }
    });
    var rightWrap = tourEl('div', { style: { display: 'flex', gap: '8px' } });
    if (__tourState.idx > 0) {
      var prevBtn = tourEl('button', {
        type: 'button',
        style: {
          background: '#f5f4f2', border: '1px solid #d6d3d0', color: '#1c1917',
          padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
          fontSize: '14px', fontWeight: '500', minHeight: '44px', minWidth: '80px'
        },
        text: 'Atrás',
        onclick: function () { __tourState.idx--; renderTourStep(); }
      });
      rightWrap.appendChild(prevBtn);
    }
    var isLast = __tourState.idx === TOUR_STEPS.length - 1;
    var nextBtn = tourEl('button', {
      type: 'button',
      style: {
        background: '#2D5F8F', border: 'none', color: '#fff',
        padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
        fontSize: '14px', fontWeight: '600', minHeight: '44px', minWidth: '90px'
      },
      text: isLast ? 'Terminar' : 'Siguiente',
      onclick: function () {
        if (isLast) endTour(true);
        else { __tourState.idx++; renderTourStep(); }
      }
    });
    rightWrap.appendChild(nextBtn);
    actions.appendChild(skip);
    actions.appendChild(rightWrap);

    ui.card.appendChild(stepLabel);
    ui.card.appendChild(title);
    ui.card.appendChild(body);
    ui.card.appendChild(actions);
  }

  function startTour() {
    if (__tourState.running) return;
    __tourState.running = true;
    __tourState.idx = 0;
    __tourState.ui = buildTourUI();
    renderTourStep();
    // Re-render on resize
    window.addEventListener('resize', renderTourStep);
  }

  function endTour(markDone) {
    __tourState.running = false;
    destroyTourUI();
    window.removeEventListener('resize', renderTourStep);
    if (markDone) {
      try {
        localStorage.setItem(TOUR_KEY, '1');
        localStorage.setItem(TOUR_VERSION_KEY, TOUR_VERSION);
      } catch (e) { /* ignore */ }
    }
  }

  function resetTour() {
    try {
      localStorage.removeItem(TOUR_KEY);
      localStorage.removeItem(TOUR_VERSION_KEY);
    } catch (e) { /* ignore */ }
    startTour();
  }

  window.startVolvixTour = startTour;
  window.resetVolvixTour = resetTour;

  function maybeAutoStartTour() {
    try {
      var done = localStorage.getItem(TOUR_KEY);
      var ver = localStorage.getItem(TOUR_VERSION_KEY);
      // Only auto-start once per major version, and only when DOM is settled
      if (done === '1' && ver === TOUR_VERSION) return;
      // Skip on small auth/login screens (heuristic: presence of POS-only UI)
      var posReady = document.querySelector('.topbar') ||
                     document.querySelector('table.pos-cart') ||
                     document.querySelector('.btn-cobrar');
      if (!posReady) return;
      // Wait a bit so the POS finishes its own bootstrap
      setTimeout(startTour, 1500);
    } catch (e) { /* ignore */ }
  }

  // ───────────────────────── Boot ────────────────────────────────────────────
  function boot() {
    refreshMobileFlag();
    applyMobileFullscreenToModals();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);
    // Re-apply fullscreen-modal class when modals are added later
    try {
      var mo = new MutationObserver(function () {
        if (window.VolvixMobile.isMobile) applyMobileFullscreenToModals();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
    maybeAutoStartTour();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
