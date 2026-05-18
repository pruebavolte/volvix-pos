/**
 * volvix-accessibility-wiring.js
 * Sistema de accesibilidad para Volvix POS - Cliente final
 * R10c-B FIX-N3-5: Adulto mayor UX (large text + high contrast + 1-tap)
 *
 * Uso:
 *   VolvixA11y.enableLargeText()
 *   VolvixA11y.enableHighContrast()
 *   VolvixA11y.enable1TapMode()
 *   VolvixA11y.disableAll()
 *   VolvixA11y.toggleMenu()  // muestra el menú flotante
 *
 * Persistencia: localStorage por device (sobrevive a logout? NO - se limpia en logout).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'volvix_a11y_prefs';
  const CSS_LARGE = 'volvix-large-text';
  const CSS_HIGH_CONTRAST = 'volvix-high-contrast';
  const CSS_1TAP = 'volvix-1tap-mode';

  // ═══════════════════════════════════════════════════════════
  // Estado y persistencia
  // ═══════════════════════════════════════════════════════════
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { largeText: false, highContrast: false, oneTap: false };
      return Object.assign(
        { largeText: false, highContrast: false, oneTap: false },
        JSON.parse(raw)
      );
    } catch (e) {
      return { largeText: false, highContrast: false, oneTap: false };
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('[a11y] no se pudo guardar prefs', e);
    }
  }

  let prefs = loadPrefs();

  // ═══════════════════════════════════════════════════════════
  // Aplicar/desaplicar clases al body
  // ═══════════════════════════════════════════════════════════
  function applyAll() {
    if (!document.body) return;
    document.body.classList.toggle(CSS_LARGE, !!prefs.largeText);
    document.body.classList.toggle(CSS_HIGH_CONTRAST, !!prefs.highContrast);
    document.body.classList.toggle(CSS_1TAP, !!prefs.oneTap);
    // Notificar a la app
    window.dispatchEvent(new CustomEvent('volvix:a11y:change', { detail: Object.assign({}, prefs) }));
    updateMenuButtonStates();
  }

  // ═══════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════
  const VolvixA11y = {
    enableLargeText() {
      prefs.largeText = true;
      savePrefs(prefs);
      applyAll();
    },
    disableLargeText() {
      prefs.largeText = false;
      savePrefs(prefs);
      applyAll();
    },
    toggleLargeText() {
      prefs.largeText ? this.disableLargeText() : this.enableLargeText();
    },
    enableHighContrast() {
      prefs.highContrast = true;
      savePrefs(prefs);
      applyAll();
    },
    disableHighContrast() {
      prefs.highContrast = false;
      savePrefs(prefs);
      applyAll();
    },
    toggleHighContrast() {
      prefs.highContrast ? this.disableHighContrast() : this.enableHighContrast();
    },
    enable1TapMode() {
      prefs.oneTap = true;
      savePrefs(prefs);
      applyAll();
    },
    disable1TapMode() {
      prefs.oneTap = false;
      savePrefs(prefs);
      applyAll();
    },
    toggle1TapMode() {
      prefs.oneTap ? this.disable1TapMode() : this.enable1TapMode();
    },
    disableAll() {
      prefs = { largeText: false, highContrast: false, oneTap: false };
      savePrefs(prefs);
      applyAll();
    },
    getPrefs() {
      return Object.assign({}, prefs);
    },
    // Reset al logout (la app debe llamarlo)
    resetOnLogout() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      prefs = { largeText: false, highContrast: false, oneTap: false };
      applyAll();
    },
    toggleMenu() {
      const m = document.getElementById('volvix-a11y-menu');
      if (!m) return;
      const isOpen = m.getAttribute('data-open') === 'true';
      m.setAttribute('data-open', isOpen ? 'false' : 'true');
      m.style.display = isOpen ? 'none' : 'flex';
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Auto-detect: prefers-contrast, prefers-reduced-motion
  // ═══════════════════════════════════════════════════════════
  function autoDetect() {
    try {
      // Solo aplicar auto-detect si NO hay preferencia guardada
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return;

      if (window.matchMedia) {
        if (window.matchMedia('(prefers-contrast: more)').matches) {
          prefs.highContrast = true;
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          prefs.oneTap = true;
        }
      }
      if (prefs.highContrast || prefs.oneTap) {
        savePrefs(prefs);
      }
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════
  // UI: botón flotante + menú
  // ═══════════════════════════════════════════════════════════
  function injectFloatingButton() {
    if (document.getElementById('volvix-a11y-fab')) return; // ya inyectado

    // Botón flotante (ojo de accesibilidad)
    const fab = document.createElement('button');
    fab.id = 'volvix-a11y-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Modo accesible');
    fab.title = 'Modo accesible (accessibility)';
    fab.innerHTML = '<span style="font-size:24px;">&#128065;</span>';
    fab.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:99998',
      'width:56px',
      'height:56px',
      'border-radius:50%',
      'background:#1a73e8',
      'color:#fff',
      'border:none',
      'cursor:pointer',
      'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:24px',
      'padding:0'
    ].join(';');
    fab.addEventListener('click', () => VolvixA11y.toggleMenu());

    // Menu
    const menu = document.createElement('div');
    menu.id = 'volvix-a11y-menu';
    menu.setAttribute('data-open', 'false');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Opciones de accesibilidad');
    menu.style.cssText = [
      'position:fixed',
      'bottom:90px',
      'right:20px',
      'z-index:99999',
      'background:#fff',
      'color:#000',
      'border:2px solid #1a73e8',
      'border-radius:12px',
      'padding:16px',
      'min-width:240px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
      'display:none',
      'flex-direction:column',
      'gap:10px',
      'font-family:system-ui,sans-serif',
      'font-size:16px'
    ].join(';');

    menu.innerHTML = [
      '<div style="font-weight:bold;margin-bottom:4px;color:#1a73e8;">Modo accesible</div>',
      '<button type="button" id="volvix-a11y-large" style="padding:12px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer;font-size:16px;text-align:left;">',
      '  <span style="margin-right:8px;">A+</span>Texto grande',
      '</button>',
      '<button type="button" id="volvix-a11y-contrast" style="padding:12px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer;font-size:16px;text-align:left;">',
      '  <span style="margin-right:8px;">&#9681;</span>Alto contraste',
      '</button>',
      '<button type="button" id="volvix-a11y-1tap" style="padding:12px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer;font-size:16px;text-align:left;">',
      '  <span style="margin-right:8px;">&#128073;</span>Un toque (1-tap)',
      '</button>',
      '<button type="button" id="volvix-a11y-reset" style="padding:10px;border:1px solid #d33;border-radius:8px;background:#fff;color:#d33;cursor:pointer;font-size:14px;margin-top:6px;">',
      '  Restablecer',
      '</button>'
    ].join('');

    document.body.appendChild(fab);
    document.body.appendChild(menu);

    // Wire up buttons
    document.getElementById('volvix-a11y-large').addEventListener('click', () => VolvixA11y.toggleLargeText());
    document.getElementById('volvix-a11y-contrast').addEventListener('click', () => VolvixA11y.toggleHighContrast());
    document.getElementById('volvix-a11y-1tap').addEventListener('click', () => VolvixA11y.toggle1TapMode());
    document.getElementById('volvix-a11y-reset').addEventListener('click', () => VolvixA11y.disableAll());
  }

  function updateMenuButtonStates() {
    const setActive = (id, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.background = active ? '#1a73e8' : '#f5f5f5';
      el.style.color = active ? '#fff' : '#000';
      el.style.borderColor = active ? '#1a73e8' : '#ccc';
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    };
    setActive('volvix-a11y-large', !!prefs.largeText);
    setActive('volvix-a11y-contrast', !!prefs.highContrast);
    setActive('volvix-a11y-1tap', !!prefs.oneTap);
  }

  // ═══════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════
  function init() {
    autoDetect();
    injectFloatingButton();
    applyAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.VolvixA11y = VolvixA11y;
  window.Volvix = window.Volvix || {};
  window.Volvix.a11y = VolvixA11y;

  // Auto-reset on logout if app dispatches event
  window.addEventListener('volvix:logout', () => VolvixA11y.resetOnLogout());
})();
