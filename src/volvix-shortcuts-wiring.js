/**
 * volvix-shortcuts-wiring.js
 * Volvix POS — Sistema global de keyboard shortcuts
 * Agent-17 / Ronda 7 Fibonacci
 *
 * Características:
 *  - Atajos globales con detección de plataforma (Mac/Win/Linux)
 *  - Modal de ayuda (Ctrl+/) con todos los atajos
 *  - Customización persistente en localStorage
 *  - Visual feedback (toast) al usar un atajo
 *  - API: window.VolvixShortcuts.register/unregister/list/reset
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Plataforma ─────────────────────────────
  const PLATFORM = (() => {
    const ua = (global.navigator && global.navigator.platform) || '';
    const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);
    return {
      isMac,
      modKey: isMac ? 'metaKey' : 'ctrlKey',
      modLabel: isMac ? '⌘' : 'Ctrl',
      altLabel: isMac ? '⌥' : 'Alt',
      shiftLabel: isMac ? '⇧' : 'Shift',
    };
  })();

  // ───────────────────────────── Storage ─────────────────────────────
  const STORAGE_KEY = 'volvix.shortcuts.v1';
  const FEEDBACK_KEY = 'volvix.shortcuts.feedback';

  function loadCustom() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('[Shortcuts] No pude leer localStorage:', e);
      return {};
    }
  }

  function saveCustom(map) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      console.warn('[Shortcuts] No pude guardar localStorage:', e);
      return false;
    }
  }

  // ───────────────────────────── Defaults ─────────────────────────────
  // combo: { mod, shift, alt, key } — `mod` = Ctrl en Win/Linux, Cmd en Mac
  const DEFAULT_SHORTCUTS = {
    'search.universal':   { combo: { mod: true,  shift: false, alt: false, key: 'k'      }, label: 'Búsqueda universal',     event: 'volvix:search'   },
    'backup.now':         { combo: { mod: true,  shift: false, alt: false, key: 'b'      }, label: 'Backup ahora',            event: 'volvix:backup'   },
    'logs.panel':         { combo: { mod: true,  shift: true,  alt: false, key: 'l'      }, label: 'Panel de logs',           event: 'volvix:logs'     },
    'tests.run':          { combo: { mod: true,  shift: true,  alt: false, key: 't'      }, label: 'Correr tests',            event: 'volvix:tests'    },
    'print.current':      { combo: { mod: true,  shift: false, alt: false, key: 'p'      }, label: 'Imprimir actual',         event: 'volvix:print'    },
    'save.current':       { combo: { mod: true,  shift: false, alt: false, key: 's'      }, label: 'Guardar',                 event: 'volvix:save'     },
    'modal.close':        { combo: { mod: false, shift: false, alt: false, key: 'Escape' }, label: 'Cerrar modal',            event: 'volvix:close'    },
    'help.show':          { combo: { mod: false, shift: false, alt: false, key: 'F1'     }, label: 'Ayuda',                   event: 'volvix:help'     },
    'tour.start':         { combo: { mod: false, shift: false, alt: false, key: 'F2'     }, label: 'Tour guiado',             event: 'volvix:tour'     },
    'shortcuts.show':     { combo: { mod: true,  shift: false, alt: false, key: '/'      }, label: 'Mostrar atajos',          event: 'volvix:shortcuts'},
  };

  // ───────────────────────────── State ─────────────────────────────
  const state = {
    shortcuts: {},          // id → definition (con combo + handlers)
    handlers: {},           // id → fn
    enabled: true,
    feedbackEnabled: true,
  };

  function rebuildShortcuts() {
    const custom = loadCustom();
    state.shortcuts = {};
    for (const id in DEFAULT_SHORTCUTS) {
      const def = DEFAULT_SHORTCUTS[id];
      const override = custom[id] && custom[id].combo;
      state.shortcuts[id] = {
        id,
        label: def.label,
        event: def.event,
        combo: override ? Object.assign({}, def.combo, override) : Object.assign({}, def.combo),
        defaultCombo: Object.assign({}, def.combo),
      };
    }
  }
  rebuildShortcuts();

  // ───────────────────────────── Combo helpers ─────────────────────────────
  function comboMatches(combo, e) {
    const wantMod = !!combo.mod;
    const hasMod  = !!e[PLATFORM.modKey];
    if (wantMod !== hasMod) return false;
    if (!!combo.shift !== !!e.shiftKey) return false;
    if (!!combo.alt   !== !!e.altKey)   return false;
    const key = (combo.key || '').toLowerCase();
    const ek  = (e.key || '').toLowerCase();
    return key === ek;
  }

  function comboToString(combo) {
    const parts = [];
    if (combo.mod)   parts.push(PLATFORM.modLabel);
    if (combo.shift) parts.push(PLATFORM.shiftLabel);
    if (combo.alt)   parts.push(PLATFORM.altLabel);
    let k = combo.key || '';
    if (k.length === 1) k = k.toUpperCase();
    parts.push(k);
    return parts.join(' + ');
  }

  // ───────────────────────────── Visual feedback ─────────────────────────────
  function ensureFeedbackEl() {
    let el = document.getElementById('volvix-shortcut-feedback');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'volvix-shortcut-feedback';
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99998',
      'padding:10px 16px', 'background:rgba(20,20,28,0.92)', 'color:#fff',
      'border:1px solid #3a3a4a', 'border-radius:8px',
      'font:600 13px/1.2 system-ui,sans-serif', 'letter-spacing:.3px',
      'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'opacity:0',
      'transition:opacity .18s ease, transform .18s ease',
      'transform:translateY(8px)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  let feedbackTimer = null;
  function showFeedback(label, comboStr) {
    if (!state.feedbackEnabled) return;
    const el = ensureFeedbackEl();
    el.innerHTML = '<span style="opacity:.7;margin-right:8px">' + comboStr + '</span>' + label;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }, 1200);
  }

  // ───────────────────────────── Modal de ayuda ─────────────────────────────
  function buildModal() {
    let modal = document.getElementById('volvix-shortcuts-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'volvix-shortcuts-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Atajos de teclado');
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:none', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,.55)', 'backdrop-filter:blur(2px)',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'background:#15151c', 'color:#e8e8f0', 'min-width:480px', 'max-width:720px',
      'max-height:80vh', 'overflow:auto', 'border-radius:12px',
      'border:1px solid #2a2a36', 'padding:22px 26px',
      'font:14px/1.45 system-ui,sans-serif',
      'box-shadow:0 20px 60px rgba(0,0,0,.5)',
    ].join(';');

    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700">Atajos de teclado · Volvix POS</h2>' +
        '<button id="volvix-shortcuts-close" aria-label="Cerrar" style="background:transparent;border:0;color:#aaa;font-size:22px;cursor:pointer">×</button>' +
      '</div>' +
      '<p style="margin:0 0 14px;color:#9a9ab0">Plataforma detectada: <b>' +
        (PLATFORM.isMac ? 'macOS (⌘)' : 'Windows/Linux (Ctrl)') +
      '</b></p>' +
      '<table id="volvix-shortcuts-table" style="width:100%;border-collapse:collapse"></table>' +
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="volvix-shortcuts-reset" style="background:#2a2a36;color:#fff;border:1px solid #3a3a4a;border-radius:6px;padding:6px 12px;cursor:pointer">Restaurar default</button>' +
      '</div>';

    modal.appendChild(card);
    modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });
    document.body.appendChild(modal);

    card.querySelector('#volvix-shortcuts-close').addEventListener('click', hideModal);
    card.querySelector('#volvix-shortcuts-reset').addEventListener('click', () => {
      saveCustom({});
      rebuildShortcuts();
      renderModalTable();
      showFeedback('Atajos restaurados', '');
    });

    return modal;
  }

  function renderModalTable() {
    const tbl = document.getElementById('volvix-shortcuts-table');
    if (!tbl) return;
    let rows = '<thead><tr>' +
      '<th style="text-align:left;padding:8px;border-bottom:1px solid #2a2a36;color:#9a9ab0;font-weight:600">Acción</th>' +
      '<th style="text-align:left;padding:8px;border-bottom:1px solid #2a2a36;color:#9a9ab0;font-weight:600">Atajo</th>' +
      '<th style="padding:8px;border-bottom:1px solid #2a2a36"></th>' +
      '</tr></thead><tbody>';
    for (const id in state.shortcuts) {
      const s = state.shortcuts[id];
      rows += '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid #1f1f28">' + escapeHTML(s.label) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #1f1f28"><kbd style="background:#23232f;padding:3px 7px;border-radius:4px;border:1px solid #3a3a4a;font:600 12px monospace">' + escapeHTML(comboToString(s.combo)) + '</kbd></td>' +
        '<td style="padding:8px;border-bottom:1px solid #1f1f28;text-align:right"><button data-rebind="' + escapeHTML(id) + '" style="background:transparent;color:#7aa7ff;border:0;cursor:pointer;font-size:12px">Rebind</button></td>' +
      '</tr>';
    }
    rows += '</tbody>';
    tbl.innerHTML = rows;
    tbl.querySelectorAll('button[data-rebind]').forEach((btn) => {
      btn.addEventListener('click', () => startRebind(btn.getAttribute('data-rebind')));
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function showModal() {
    const m = buildModal();
    renderModalTable();
    m.style.display = 'flex';
  }
  function hideModal() {
    const m = document.getElementById('volvix-shortcuts-modal');
    if (m) m.style.display = 'none';
  }
  function isModalOpen() {
    const m = document.getElementById('volvix-shortcuts-modal');
    return m && m.style.display !== 'none';
  }

  // ───────────────────────────── Rebind ─────────────────────────────
  let rebindingId = null;

  function startRebind(id) {
    rebindingId = id;
    showFeedback('Presiona la nueva combinación para "' + state.shortcuts[id].label + '" (Esc cancela)', '');
  }

  function captureRebind(e) {
    if (!rebindingId) return false;
    if (e.key === 'Escape') {
      rebindingId = null;
      showFeedback('Rebind cancelado', '');
      return true;
    }
    // Ignorar pulsaciones de solo modificador
    if (['Control','Shift','Alt','Meta'].indexOf(e.key) !== -1) return true;

    const newCombo = {
      mod: !!e[PLATFORM.modKey],
      shift: !!e.shiftKey,
      alt: !!e.altKey,
      key: e.key,
    };
    const custom = loadCustom();
    custom[rebindingId] = { combo: newCombo };
    saveCustom(custom);
    rebuildShortcuts();
    renderModalTable();
    showFeedback('Atajo actualizado', comboToString(newCombo));
    rebindingId = null;
    e.preventDefault();
    return true;
  }

  // ───────────────────────────── Default handlers ─────────────────────────────
  function dispatchEvent(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) { /* IE fallback ignored */ }
  }

  const defaultHandlers = {
    'search.universal': () => dispatchEvent('volvix:search'),
    'backup.now':       () => dispatchEvent('volvix:backup'),
    'logs.panel':       () => dispatchEvent('volvix:logs'),
    'tests.run':        () => dispatchEvent('volvix:tests'),
    'print.current':    () => { dispatchEvent('volvix:print'); try { global.print(); } catch (_) {} },
    'save.current':     () => dispatchEvent('volvix:save'),
    'modal.close':      () => {
      if (isModalOpen()) { hideModal(); return; }
      dispatchEvent('volvix:close');
      // best-effort: cerrar modales con atributo open o clase volvix-modal
      document.querySelectorAll('[data-volvix-modal="open"], .volvix-modal.open').forEach((el) => {
        el.classList.remove('open');
        el.setAttribute('data-volvix-modal', 'closed');
      });
    },
    'help.show':        () => dispatchEvent('volvix:help'),
    'tour.start':       () => dispatchEvent('volvix:tour'),
    'shortcuts.show':   () => { isModalOpen() ? hideModal() : showModal(); },
  };

  // ───────────────────────────── Key handler ─────────────────────────────
  function shouldIgnoreTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || '').toUpperCase();
    if (t.isContentEditable) return true;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // permitimos Esc y F1/F2 incluso en inputs
      return false;
    }
    return false;
  }

  function onKeyDown(e) {
    if (!state.enabled) return;
    if (rebindingId) { captureRebind(e); return; }

    for (const id in state.shortcuts) {
      const s = state.shortcuts[id];
      if (!comboMatches(s.combo, e)) continue;

      // En inputs, dejamos pasar Save/Print? — interceptamos siempre.
      if (shouldIgnoreTarget(e.target) && s.combo.key.length === 1 && !s.combo.mod) continue;

      e.preventDefault();
      e.stopPropagation();

      const handler = state.handlers[id] || defaultHandlers[id];
      try { if (handler) handler(e); } catch (err) { console.error('[Shortcuts] handler', id, err); }
      showFeedback(s.label, comboToString(s.combo));
      return;
    }
  }

  // ───────────────────────────── Public API ─────────────────────────────
  const api = {
    platform: PLATFORM,
    list() {
      return Object.keys(state.shortcuts).map((id) => ({
        id,
        label: state.shortcuts[id].label,
        combo: Object.assign({}, state.shortcuts[id].combo),
        comboString: comboToString(state.shortcuts[id].combo),
      }));
    },
    on(id, fn) { state.handlers[id] = fn; return () => { delete state.handlers[id]; }; },
    off(id) { delete state.handlers[id]; },
    rebind(id, combo) {
      if (!state.shortcuts[id]) return false;
      const custom = loadCustom();
      custom[id] = { combo: Object.assign({}, combo) };
      saveCustom(custom);
      rebuildShortcuts();
      return true;
    },
    reset() { saveCustom({}); rebuildShortcuts(); renderModalTable(); },
    enable()  { state.enabled = true;  },
    disable() { state.enabled = false; },
    setFeedback(on) { state.feedbackEnabled = !!on; try { localStorage.setItem(FEEDBACK_KEY, on ? '1' : '0'); } catch(_){} },
    showHelp() { showModal(); },
    hideHelp() { hideModal(); },
    trigger(id) {
      const s = state.shortcuts[id]; if (!s) return false;
      const h = state.handlers[id] || defaultHandlers[id];
      if (h) h(); showFeedback(s.label, comboToString(s.combo));
      return true;
    },
  };

  // restaurar feedback pref
  try {
    const fb = localStorage.getItem(FEEDBACK_KEY);
    if (fb === '0') state.feedbackEnabled = false;
  } catch (_) {}

  // ───────────────────────────── Init ─────────────────────────────
  function init() {
    document.addEventListener('keydown', onKeyDown, true);
    console.info('[Volvix Shortcuts] listo · plataforma=' + (PLATFORM.isMac ? 'mac' : 'win/linux'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.VolvixShortcuts = api;
})(typeof window !== 'undefined' ? window : this);
