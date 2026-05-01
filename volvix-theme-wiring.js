/**
 * volvix-theme-wiring.js
 * Volvix POS - Theme System (dark / light / auto)
 * Agent-16 - Ronda 7 Fibonacci
 *
 * Features:
 *  - 3 modes: dark, light, auto (follows OS prefers-color-scheme)
 *  - CSS variables applied to :root for global theming
 *  - Floating toggle button (top-right) cycling dark -> light -> auto
 *  - Smooth transitions when switching themes
 *  - Persistence via localStorage ('volvix:theme')
 *  - Live response to OS theme changes when in auto mode
 *  - Override layer to force-restyle pre-existing components
 *  - Public API: window.ThemeAPI / window.setTheme
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'volvix:theme';
  const BUTTON_ID = 'theme-toggle';
  const OVERRIDE_STYLE_ID = 'volvix-theme-override';
  const TRANSITION_STYLE_ID = 'volvix-theme-transition';
  const VALID_MODES = ['dark', 'light', 'auto'];

  const ICONS = {
    dark: '🌙',   // 🌙
    light: '☀️',  // ☀️
    auto: '🤖'    // 🤖
  };

  const THEMES = {
    dark: {
      '--vlx-bg':       '#0A0A0A',
      '--vlx-surface':  '#121212',
      '--vlx-surface-2':'#1A1A1A',
      '--vlx-text':     '#FAFAF9',
      '--vlx-text-2':   '#A8A29E',
      '--vlx-border':   '#2E2E2C',
      '--vlx-accent':   '#3B82F6',
      '--vlx-accent-2': '#2563EB',
      '--vlx-danger':   '#EF4444',
      '--vlx-success':  '#10B981',
      '--vlx-warn':     '#F59E0B',
      '--vlx-shadow':   '0 4px 12px rgba(0,0,0,0.4)'
    },
    light: {
      '--vlx-bg':       '#FAFAF9',
      '--vlx-surface':  '#FFFFFF',
      '--vlx-surface-2':'#F3F4F6',
      '--vlx-text':     '#1F2937',
      '--vlx-text-2':   '#6B7280',
      '--vlx-border':   '#E5E7EB',
      '--vlx-accent':   '#3B82F6',
      '--vlx-accent-2': '#1D4ED8',
      '--vlx-danger':   '#DC2626',
      '--vlx-success':  '#059669',
      '--vlx-warn':     '#D97706',
      '--vlx-shadow':   '0 4px 12px rgba(0,0,0,0.08)'
    }
  };

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  let currentMode = loadStoredMode();
  let mediaQuery = null;

  function loadStoredMode() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && VALID_MODES.indexOf(stored) !== -1) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return 'auto';
  }

  function saveMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  function resolveEffectiveTheme(mode) {
    if (mode === 'auto') {
      const prefersDark = window.matchMedia &&
                          window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  }

  // ---------------------------------------------------------------------------
  // TRANSITION LAYER
  // ---------------------------------------------------------------------------
  function ensureTransitionStyle() {
    if (document.getElementById(TRANSITION_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = TRANSITION_STYLE_ID;
    s.textContent = `
      :root {
        --vlx-transition: background-color .25s ease, color .25s ease, border-color .25s ease;
      }
      html, body, .card, .surface, .modal, button, input, textarea, select,
      .vlx-themed {
        transition: var(--vlx-transition);
      }
    `;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // APPLY THEME
  // ---------------------------------------------------------------------------
  function applyTheme(mode) {
    const effective = resolveEffectiveTheme(mode);
    const palette = THEMES[effective];
    const root = document.documentElement;

    Object.keys(palette).forEach(function (key) {
      root.style.setProperty(key, palette[key]);
    });

    root.setAttribute('data-vlx-theme', effective);
    root.setAttribute('data-vlx-mode', mode);

    if (effective === 'light') injectOverrides('light');
    else                       injectOverrides('dark');
  }

  function injectOverrides(effective) {
    let style = document.getElementById(OVERRIDE_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = OVERRIDE_STYLE_ID;
      document.head.appendChild(style);
    }

    // R28: overrides agresivos para que el toggle afecte pantallas con CSS hardcoded
    // B10: respetar elementos con [data-theme-skip] y .metric-val (gradient text)
    // B28: mejorar contraste — texto secundario más oscuro en light, más claro en dark
    const common = `
      html, body, main, section, article, header, footer, aside, nav {
        background-color: var(--vlx-bg) !important;
        color: var(--vlx-text) !important;
      }
      .card, .surface, .panel, .box, .kpi, .metric, .tile, .widget,
      [class*="card"], [class*="panel"], [class*="kpi"]:not(.kpi-value):not([class*="kpi-trend"]), [class*="metric"]:not(.metric-val):not([class*="metric-icon"]) {
        background-color: var(--vlx-surface) !important;
        color: var(--vlx-text) !important;
        border-color: var(--vlx-border) !important;
      }
      /* B10: NO sobreescribir elementos con gradient text */
      .metric-val, .kpi-value, [class*="grad-text"], [data-theme-skip],
      [data-theme-skip] *, .donut, .donut *, .chart .bar, [class*="logo"] {
        background: revert;
        color: revert;
      }
      input, textarea, select, .input, .field {
        background-color: var(--vlx-surface) !important;
        color: var(--vlx-text) !important;
        border: 1px solid var(--vlx-border) !important;
      }
      /* B28: contraste WCAG — labels secundarios más legibles */
      .muted, .text-muted, .secondary, small.muted, .meta, .hint, [class*="muted"], [class*="secondary"] {
        color: var(--vlx-text-2) !important;
        opacity: 1 !important;
      }
      label, .label, .form-label {
        color: var(--vlx-text) !important;
        opacity: 1 !important;
      }
      th, td, .table-cell {
        color: var(--vlx-text) !important;
      }
      th { color: var(--vlx-text-2) !important; font-weight: 600 !important; }
      ::placeholder { color: var(--vlx-text-2) !important; opacity: 0.7 !important; }
      input::placeholder, textarea::placeholder { color: var(--vlx-text-2) !important; }
      .modal, .dialog, .popup, [class*="modal"]:not([class*="backdrop"]),
      [class*="dialog"]:not([class*="backdrop"]) {
        background-color: var(--vlx-surface) !important;
        color: var(--vlx-text) !important;
      }
      .modal-backdrop, .overlay, [class*="backdrop"] {
        background-color: rgba(0,0,0,0.5) !important;
      }
      a { color: var(--vlx-accent) !important; }
      hr, .divider { border-color: var(--vlx-border) !important; }
      .muted, .secondary, small, .meta, .hint { color: var(--vlx-text-2) !important; }
      table { background-color: var(--vlx-surface) !important; color: var(--vlx-text) !important; }
      th { color: var(--vlx-text-2) !important; border-color: var(--vlx-border) !important; }
      td { border-color: var(--vlx-border) !important; }
    `;
    if (effective === 'light') {
      // Adicional para light: invertir scrollbars / shadows
      style.textContent = common + `
        ::-webkit-scrollbar { background: var(--vlx-bg) !important; }
        ::-webkit-scrollbar-thumb { background: var(--vlx-border) !important; }
      `;
    } else {
      style.textContent = common;
    }
  }

  // ---------------------------------------------------------------------------
  // TOGGLE BUTTON — REMOVED (floating button eliminated, UI cleanup)
  // ---------------------------------------------------------------------------
  // createButton() removed — no floating #theme-toggle injected in DOM

  function updateButton() {
    // no-op: button removed
  }

  function cycleMode() {
    const idx = VALID_MODES.indexOf(currentMode);
    const next = VALID_MODES[(idx + 1) % VALID_MODES.length];
    setTheme(next);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  function setTheme(mode) {
    if (VALID_MODES.indexOf(mode) === -1) {
      console.warn('[volvix-theme] modo invalido:', mode);
      return;
    }
    currentMode = mode;
    saveMode(mode);
    applyTheme(mode);
    updateButton();
    dispatch('volvix:theme:changed', {
      mode: mode,
      effective: resolveEffectiveTheme(mode)
    });
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // OS PREFERENCE WATCHER
  // ---------------------------------------------------------------------------
  function watchSystem() {
    if (!window.matchMedia) return;
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function () {
      if (currentMode === 'auto') applyTheme('auto');
    };
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handler);
    else if (mediaQuery.addListener)  mediaQuery.addListener(handler);
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------
  function init() {
    ensureTransitionStyle();
    applyTheme(currentMode);
    watchSystem();
    dispatch('volvix:theme:ready', {
      mode: currentMode,
      effective: resolveEffectiveTheme(currentMode)
    });
    console.log('[volvix-theme] ready - mode:', currentMode);
  }

  window.setTheme = setTheme;
  window.ThemeAPI = {
    setTheme: setTheme,
    cycle: cycleMode,
    current: function () { return currentMode; },
    effective: function () { return resolveEffectiveTheme(currentMode); },
    palette: function () { return THEMES[resolveEffectiveTheme(currentMode)]; },
    modes: VALID_MODES.slice()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
