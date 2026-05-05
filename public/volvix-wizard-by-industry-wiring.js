/**
 * volvix-wizard-by-industry-wiring.js
 *
 * Engine que carga y ejecuta wizards especificos por giro de negocio.
 * Detecta el giro del tenant, carga el JSON correspondiente desde
 * /public/wizards-by-industry/{giro}.json y guia al usuario por los
 * pasos de su primera venta usando el catalogo demo R12a.
 *
 * Modulos R12-O-5-E:
 *  - FIX-O5-E-1: 10 wizards JSON por giro
 *  - FIX-O5-E-2: este engine de wiring
 *  - FIX-O5-E-3: auto-trigger banner post-onboarding
 *  - FIX-O5-E-4: variantes por rol (owner/cashier/inventarista)
 *
 * Persistencia (localStorage):
 *  - volvix_wizard_progress_{giro}: { stepIndex, completedSteps[], startedAt, completedAt }
 *  - volvix_wizard_first_sale_done: '1' cuando el usuario completa su primera venta real
 *  - volvix_wizard_banner_dismissed: '1' si dismiss permanente del banner
 *
 * Flujos publicos:
 *  - VolvixWizardByIndustry.start()
 *  - VolvixWizardByIndustry.startForGiro(giroId)
 *  - VolvixWizardByIndustry.dismiss()
 *  - VolvixWizardByIndustry.injectBanner()
 */
(function () {
  'use strict';

  var WIZARDS_BASE_PATH = '/wizards-by-industry/';
  var TENANT_SETTINGS_ENDPOINT = '/api/tenant/settings';
  var DEFAULT_GIRO = 'cafe';
  var SUPPORTED_GIROS = [
    'cafe', 'restaurante', 'taqueria', 'abarrotes', 'farmacia',
    'ropa', 'barberia', 'gimnasio', 'papeleria', 'autolavado'
  ];
  var ROLE_FILTERS = {
    owner:        function () { return true; },
    manager:      function () { return true; },
    cashier:      function (step) { return !step.role_only || step.role_only.indexOf('cashier') >= 0; },
    waiter:       function (step) { return !step.role_only || step.role_only.indexOf('waiter') >= 0; },
    barber:       function (step) { return !step.role_only || step.role_only.indexOf('barber') >= 0; },
    salesperson:  function (step) { return !step.role_only || step.role_only.indexOf('salesperson') >= 0; },
    pharmacist:   function (step) { return !step.role_only || step.role_only.indexOf('pharmacist') >= 0; },
    trainer:      function (step) { return !step.role_only || step.role_only.indexOf('trainer') >= 0; },
    operator:     function (step) { return !step.role_only || step.role_only.indexOf('operator') >= 0; },
    stockist:     function (step) { return step.action === 'inventory' || (step.role_only && step.role_only.indexOf('stockist') >= 0); }
  };

  var state = {
    giro: null,
    wizard: null,
    role: null,
    stepIndex: 0,
    overlay: null,
    listeners: []
  };

  // ---- Utils ----
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function progressKey(giro) { return 'volvix_wizard_progress_' + giro; }

  function readProgress(giro) {
    var raw = lsGet(progressKey(giro));
    if (!raw) return { stepIndex: 0, completedSteps: [], startedAt: null, completedAt: null };
    try { return JSON.parse(raw); } catch (e) { return { stepIndex: 0, completedSteps: [] }; }
  }
  function writeProgress(giro, data) {
    lsSet(progressKey(giro), JSON.stringify(data));
  }

  function fetchJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + url);
      return r.json();
    });
  }

  // ---- Detection ----
  function detectGiro() {
    return fetchJSON(TENANT_SETTINGS_ENDPOINT).then(function (settings) {
      var g = (settings && (settings.business_type || settings.giro)) || DEFAULT_GIRO;
      g = String(g).toLowerCase();
      return SUPPORTED_GIROS.indexOf(g) >= 0 ? g : DEFAULT_GIRO;
    }).catch(function () { return DEFAULT_GIRO; });
  }

  function detectRole() {
    // Try to read from window.VolvixUser, JWT-decoded role, or default to owner
    if (window.VolvixUser && window.VolvixUser.role) return String(window.VolvixUser.role).toLowerCase();
    var lsRole = lsGet('volvix_user_role');
    if (lsRole) return String(lsRole).toLowerCase();
    return 'owner';
  }

  function filterStepsByRole(wizard, role) {
    var filter = ROLE_FILTERS[role] || ROLE_FILTERS.owner;
    return wizard.steps.filter(filter);
  }

  // ---- Modal/Overlay rendering ----
  function injectStyles() {
    if (document.getElementById('volvix-wizard-industry-styles')) return;
    var style = document.createElement('style');
    style.id = 'volvix-wizard-industry-styles';
    style.textContent = [
      '.volvix-wiz-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif}',
      '.volvix-wiz-card{background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.3);max-width:520px;width:92%;padding:28px;position:relative}',
      '.volvix-wiz-step{font-size:13px;color:#888;margin-bottom:6px}',
      '.volvix-wiz-title{font-size:22px;font-weight:600;color:#1a1a1a;margin:0 0 10px}',
      '.volvix-wiz-text{font-size:15px;line-height:1.55;color:#333;margin:0 0 18px}',
      '.volvix-wiz-actions{display:flex;justify-content:space-between;align-items:center;gap:10px}',
      '.volvix-wiz-btn{border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:500;cursor:pointer}',
      '.volvix-wiz-btn-primary{background:#2c5cff;color:#fff}',
      '.volvix-wiz-btn-primary:hover{background:#1a47e0}',
      '.volvix-wiz-btn-ghost{background:transparent;color:#666}',
      '.volvix-wiz-progress{height:4px;background:#eee;border-radius:2px;margin-bottom:18px;overflow:hidden}',
      '.volvix-wiz-progress-bar{height:100%;background:#2c5cff;transition:width .3s}',
      '.volvix-wiz-close{position:absolute;top:12px;right:14px;background:none;border:0;font-size:22px;cursor:pointer;color:#999}',
      '.volvix-wiz-highlight{outline:3px solid #2c5cff !important;outline-offset:3px;border-radius:4px;animation:volvixWizPulse 1.4s infinite}',
      '@keyframes volvixWizPulse{0%,100%{box-shadow:0 0 0 0 rgba(44,92,255,.5)}50%{box-shadow:0 0 0 10px rgba(44,92,255,0)}}',
      '.volvix-wiz-banner{position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#2c5cff,#5a7fff);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:center;gap:14px;z-index:9990;font-size:14px;font-weight:500}',
      '.volvix-wiz-banner-btn{background:#fff;color:#2c5cff;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer}',
      '.volvix-wiz-banner-close{background:transparent;color:#fff;border:0;font-size:20px;cursor:pointer;margin-left:8px}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function clearHighlights() {
    var prev = document.querySelectorAll('.volvix-wiz-highlight');
    Array.prototype.forEach.call(prev, function (el) { el.classList.remove('volvix-wiz-highlight'); });
  }
  function applyHighlight(selector) {
    clearHighlights();
    if (!selector) return;
    try {
      var el = document.querySelector(selector);
      if (el) el.classList.add('volvix-wiz-highlight');
    } catch (e) { /* invalid selector, ignore */ }
  }

  function destroyOverlay() {
    if (state.overlay && state.overlay.parentNode) {
      state.overlay.parentNode.removeChild(state.overlay);
    }
    state.overlay = null;
    clearHighlights();
    detachActionListeners();
  }

  function detachActionListeners() {
    state.listeners.forEach(function (l) {
      try { l.target.removeEventListener(l.event, l.fn); } catch (e) {}
    });
    state.listeners = [];
  }

  function attachActionListener(target, event, fn) {
    target.addEventListener(event, fn);
    state.listeners.push({ target: target, event: event, fn: fn });
  }

  // ---- Step handlers ----
  function renderStep(steps, idx) {
    destroyOverlay();
    if (idx >= steps.length) return finishWizard();
    var step = steps[idx];

    injectStyles();
    var overlay = document.createElement('div');
    overlay.className = 'volvix-wiz-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var pct = Math.round(((idx) / steps.length) * 100);
    overlay.innerHTML = [
      '<div class="volvix-wiz-card">',
      '  <button class="volvix-wiz-close" aria-label="Cerrar">&times;</button>',
      '  <div class="volvix-wiz-progress"><div class="volvix-wiz-progress-bar" style="width:' + pct + '%"></div></div>',
      '  <div class="volvix-wiz-step">Paso ' + (idx + 1) + ' de ' + steps.length + '</div>',
      '  <h2 class="volvix-wiz-title"></h2>',
      '  <p class="volvix-wiz-text"></p>',
      '  <div class="volvix-wiz-actions">',
      '    <button class="volvix-wiz-btn volvix-wiz-btn-ghost" data-act="skip">Saltar tour</button>',
      '    <button class="volvix-wiz-btn volvix-wiz-btn-primary" data-act="next">Siguiente</button>',
      '  </div>',
      '</div>'
    ].join('');

    overlay.querySelector('.volvix-wiz-title').textContent = step.title || '';
    overlay.querySelector('.volvix-wiz-text').textContent = step.text || '';

    var btnNext = overlay.querySelector('[data-act="next"]');
    var btnSkip = overlay.querySelector('[data-act="skip"]');
    var btnClose = overlay.querySelector('.volvix-wiz-close');

    if (step.action === 'complete') btnNext.textContent = 'Terminar';

    btnNext.addEventListener('click', function () { advance(steps, idx, step); });
    btnSkip.addEventListener('click', function () { skipWizard(); });
    btnClose.addEventListener('click', function () { destroyOverlay(); });

    document.body.appendChild(overlay);
    state.overlay = overlay;
    applyHighlight(step.highlight_selector);
    attachActionWatcher(step, steps, idx);
  }

  function attachActionWatcher(step, steps, idx) {
    if (!step.action || step.action === 'next' || step.action === 'complete') return;
    // Para acciones del tipo wait_for_X dejamos el boton Siguiente activo,
    // pero tambien escuchamos eventos del POS reales (custom events) para
    // auto-avanzar cuando el usuario verdaderamente realice la accion.
    var eventName = step.action === 'wait_for_search' ? 'volvix:search'
                  : step.action === 'wait_for_cart' ? 'volvix:cart-add'
                  : step.action === 'wait_for_payment' ? 'volvix:payment-done'
                  : step.action === 'wait_for_payment_with_tip' ? 'volvix:payment-done'
                  : step.action === 'wait_for_barcode' ? 'volvix:barcode-scan'
                  : step.action === 'wait_for_table_select' ? 'volvix:table-select'
                  : step.action === 'wait_for_kitchen_send' ? 'volvix:kitchen-send'
                  : step.action === 'wait_for_walkin' ? 'volvix:walkin-create'
                  : step.action === 'wait_for_customer_create' ? 'volvix:customer-create'
                  : step.action === 'wait_for_membership_select' ? 'volvix:membership-add'
                  : step.action === 'wait_for_vehicle_register' ? 'volvix:vehicle-register'
                  : step.action === 'wait_for_variant_select' ? 'volvix:variant-add'
                  : step.action === 'wait_for_discount' ? 'volvix:discount-apply'
                  : step.action === 'wait_for_service' ? 'volvix:service-add'
                  : step.action === 'wait_for_multiple_items' ? 'volvix:cart-add'
                  : null;
    if (!eventName) return;

    var counter = 0;
    var needed = step.expected_items || 1;
    var fn = function (ev) {
      if (step.expected_query && ev && ev.detail && ev.detail.query) {
        if (String(ev.detail.query).toLowerCase().indexOf(step.expected_query.toLowerCase()) < 0) return;
      }
      if (step.expected_barcode && ev && ev.detail && ev.detail.barcode) {
        if (String(ev.detail.barcode) !== String(step.expected_barcode)) return;
      }
      counter++;
      if (counter >= needed) advance(steps, idx, step);
    };
    attachActionListener(window, eventName, fn);
  }

  function advance(steps, idx, step) {
    var giro = state.giro;
    var prog = readProgress(giro);
    if (prog.completedSteps.indexOf(step.id) < 0) prog.completedSteps.push(step.id);
    prog.stepIndex = idx + 1;
    if (!prog.startedAt) prog.startedAt = new Date().toISOString();
    if (step.action === 'complete') prog.completedAt = new Date().toISOString();
    writeProgress(giro, prog);

    if (step.action === 'complete') return finishWizard();
    renderStep(steps, idx + 1);
  }

  function finishWizard() {
    destroyOverlay();
    lsSet('volvix_wizard_first_sale_done', '1');
    var b = document.querySelector('.volvix-wiz-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    try {
      window.dispatchEvent(new CustomEvent('volvix:wizard-completed', { detail: { giro: state.giro } }));
    } catch (e) {}
  }

  function skipWizard() {
    destroyOverlay();
    lsSet('volvix_wizard_banner_dismissed', '1');
  }

  // ---- Public API ----
  function runWizard(wizard) {
    state.wizard = wizard;
    var role = detectRole();
    state.role = role;
    var steps = filterStepsByRole(wizard, role);
    if (!steps.length) return;
    var prog = readProgress(state.giro);
    var start = prog.stepIndex && prog.stepIndex < steps.length ? prog.stepIndex : 0;
    state.stepIndex = start;
    renderStep(steps, start);
  }

  function startForGiro(giroId) {
    state.giro = giroId;
    return fetchJSON(WIZARDS_BASE_PATH + giroId + '.json').then(runWizard).catch(function (err) {
      console.warn('[VolvixWizardByIndustry] no se pudo cargar wizard', giroId, err);
    });
  }

  function start() {
    return detectGiro().then(function (giro) {
      return startForGiro(giro);
    });
  }

  function dismiss() {
    destroyOverlay();
    lsSet('volvix_wizard_banner_dismissed', '1');
  }

  function shouldShowBanner() {
    if (lsGet('volvix_wizard_first_sale_done') === '1') return false;
    if (lsGet('volvix_wizard_banner_dismissed') === '1') return false;
    if (lsGet('volvix_welcome_completed') !== '1') return false; // Wait for onboarding
    return true;
  }

  function injectBanner() {
    if (!shouldShowBanner()) return;
    if (document.querySelector('.volvix-wiz-banner')) return;
    injectStyles();
    var banner = document.createElement('div');
    banner.className = 'volvix-wiz-banner';
    banner.innerHTML = [
      '<span>Hagamos tu primera venta &mdash; 3 minutos guiados</span>',
      '<button class="volvix-wiz-banner-btn" data-act="start">Comenzar</button>',
      '<button class="volvix-wiz-banner-close" aria-label="Cerrar">&times;</button>'
    ].join('');
    banner.querySelector('[data-act="start"]').addEventListener('click', function () {
      banner.parentNode && banner.parentNode.removeChild(banner);
      start();
    });
    banner.querySelector('.volvix-wiz-banner-close').addEventListener('click', function () {
      banner.parentNode && banner.parentNode.removeChild(banner);
      lsSet('volvix_wizard_banner_dismissed', '1');
    });
    document.body.appendChild(banner);

    // Si el POS dispara el evento de venta real, dismiss permanente.
    window.addEventListener('volvix:sale-completed', function () {
      lsSet('volvix_wizard_first_sale_done', '1');
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, { once: true });
  }

  function autoInit() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(injectBanner, 800);
    } else {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(injectBanner, 800); });
    }
  }

  window.VolvixWizardByIndustry = {
    start: start,
    startForGiro: startForGiro,
    dismiss: dismiss,
    injectBanner: injectBanner,
    detectGiro: detectGiro,
    detectRole: detectRole,
    SUPPORTED_GIROS: SUPPORTED_GIROS,
    _state: state
  };

  autoInit();
})();
