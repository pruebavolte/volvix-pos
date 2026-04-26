/**
 * volvix-keyboard-nav.js
 * Keyboard navigation completo para Volvix POS
 * - Tab order management
 * - Focus trap (modales)
 * - Vim-like navigation (h/j/k/l, gg, G)
 * - Custom shortcuts per role
 *
 * API global: window.KeyNav
 */
(function (global) {
  'use strict';

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');

  const STATE = {
    enabled: true,
    vimMode: false,
    role: 'cashier',
    activeTrap: null,
    trapStack: [],
    shortcuts: new Map(),
    lastKeys: [],
    lastKeyTime: 0,
    listeners: { keydown: null, focusin: null },
    debug: false
  };

  // ─────────────────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────────────────
  function log() {
    if (STATE.debug) console.log('[KeyNav]', ...arguments);
  }

  function getFocusable(root) {
    root = root || document;
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 &&
               style.visibility !== 'hidden' &&
               style.display !== 'none';
      });
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           el.isContentEditable;
  }

  function keyComboString(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    const k = (e.key || '').toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(k)) parts.push(k);
    return parts.join('+');
  }

  // ─────────────────────────────────────────────────────────
  // Tab order
  // ─────────────────────────────────────────────────────────
  function setTabOrder(elements) {
    elements.forEach((el, i) => {
      const node = typeof el === 'string' ? document.querySelector(el) : el;
      if (node) node.tabIndex = i + 1;
    });
    log('tab order set:', elements.length);
  }

  function focusNext(reverse) {
    const list = getFocusable();
    const idx = list.indexOf(document.activeElement);
    if (idx === -1) {
      list[0] && list[0].focus();
      return;
    }
    const next = reverse
      ? (idx - 1 + list.length) % list.length
      : (idx + 1) % list.length;
    list[next] && list[next].focus();
  }

  // ─────────────────────────────────────────────────────────
  // Focus trap (modales / overlays)
  // ─────────────────────────────────────────────────────────
  function trapFocus(container, opts) {
    opts = opts || {};
    const node = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!node) return null;

    const trap = {
      container: node,
      previouslyFocused: document.activeElement,
      onEscape: opts.onEscape || null,
      autoFocus: opts.autoFocus !== false
    };

    STATE.trapStack.push(trap);
    STATE.activeTrap = trap;

    if (trap.autoFocus) {
      const focusables = getFocusable(node);
      (focusables[0] || node).focus();
    }
    log('focus trapped on', node);
    return trap;
  }

  function releaseTrap() {
    const trap = STATE.trapStack.pop();
    STATE.activeTrap = STATE.trapStack[STATE.trapStack.length - 1] || null;
    if (trap && trap.previouslyFocused && trap.previouslyFocused.focus) {
      trap.previouslyFocused.focus();
    }
    log('focus trap released');
  }

  function handleTrapTab(e) {
    if (!STATE.activeTrap) return;
    const list = getFocusable(STATE.activeTrap.container);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Vim-like navigation
  // ─────────────────────────────────────────────────────────
  function vimHandler(e) {
    if (!STATE.vimMode) return false;
    if (isEditable(document.activeElement)) return false;
    const k = e.key;
    const now = Date.now();
    if (now - STATE.lastKeyTime > 800) STATE.lastKeys = [];
    STATE.lastKeyTime = now;
    STATE.lastKeys.push(k);
    if (STATE.lastKeys.length > 4) STATE.lastKeys.shift();

    // gg → ir al inicio
    if (STATE.lastKeys.slice(-2).join('') === 'gg') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      STATE.lastKeys = [];
      e.preventDefault();
      return true;
    }
    if (k === 'G') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      e.preventDefault();
      return true;
    }
    switch (k) {
      case 'j': window.scrollBy({ top: 60, behavior: 'smooth' }); e.preventDefault(); return true;
      case 'k': window.scrollBy({ top: -60, behavior: 'smooth' }); e.preventDefault(); return true;
      case 'h': history.back(); e.preventDefault(); return true;
      case 'l': history.forward(); e.preventDefault(); return true;
      case 'n': focusNext(false); e.preventDefault(); return true;
      case 'p': focusNext(true); e.preventDefault(); return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────
  // Shortcuts por rol
  // ─────────────────────────────────────────────────────────
  const ROLE_SHORTCUTS = {
    cashier: {
      'f2': () => triggerAction('new-sale'),
      'f3': () => triggerAction('search-product'),
      'f4': () => triggerAction('apply-discount'),
      'f9': () => triggerAction('finalize-sale'),
      'f12': () => triggerAction('cancel-sale'),
      'ctrl+p': () => triggerAction('print-receipt')
    },
    manager: {
      'f2': () => triggerAction('open-reports'),
      'f5': () => triggerAction('refresh-dashboard'),
      'ctrl+shift+i': () => triggerAction('inventory'),
      'ctrl+shift+u': () => triggerAction('users'),
      'ctrl+k': () => triggerAction('command-palette')
    },
    admin: {
      'ctrl+shift+d': () => triggerAction('debug-panel'),
      'ctrl+shift+l': () => triggerAction('view-logs'),
      'ctrl+shift+r': () => location.reload(true),
      'ctrl+k': () => triggerAction('command-palette')
    }
  };

  function triggerAction(name) {
    log('action:', name);
    document.dispatchEvent(new CustomEvent('volvix:action', { detail: { name } }));
  }

  function loadRoleShortcuts(role) {
    STATE.role = role;
    STATE.shortcuts.clear();
    const map = ROLE_SHORTCUTS[role] || {};
    Object.entries(map).forEach(([combo, fn]) => STATE.shortcuts.set(combo, fn));
    // globales
    STATE.shortcuts.set('escape', handleEscape);
    STATE.shortcuts.set('?', showHelp);
    log('role loaded:', role, 'shortcuts:', STATE.shortcuts.size);
  }

  function registerShortcut(combo, fn) {
    STATE.shortcuts.set(combo.toLowerCase(), fn);
  }

  function unregisterShortcut(combo) {
    STATE.shortcuts.delete(combo.toLowerCase());
  }

  function handleEscape() {
    if (STATE.activeTrap) {
      if (STATE.activeTrap.onEscape) STATE.activeTrap.onEscape();
      else releaseTrap();
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function showHelp() {
    const lines = ['Atajos disponibles (' + STATE.role + '):'];
    STATE.shortcuts.forEach((_, k) => lines.push('  ' + k));
    if (STATE.vimMode) lines.push('Vim: h/j/k/l, gg, G, n/p');
    alert(lines.join('\n'));
  }

  // ─────────────────────────────────────────────────────────
  // Listener principal
  // ─────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!STATE.enabled) return;

    // Tab dentro de trap
    if (e.key === 'Tab' && STATE.activeTrap) {
      handleTrapTab(e);
      return;
    }

    // Escape siempre
    if (e.key === 'Escape') {
      handleEscape();
      return;
    }

    // Shortcuts registrados
    const combo = keyComboString(e);
    const fn = STATE.shortcuts.get(combo);
    if (fn && !isEditable(document.activeElement)) {
      e.preventDefault();
      try { fn(e); } catch (err) { console.error('[KeyNav] shortcut error:', err); }
      return;
    }

    // Vim
    if (vimHandler(e)) return;
  }

  function onFocusIn(e) {
    if (STATE.activeTrap && !STATE.activeTrap.container.contains(e.target)) {
      const list = getFocusable(STATE.activeTrap.container);
      list[0] && list[0].focus();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Init / destroy
  // ─────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    STATE.role = opts.role || 'cashier';
    STATE.vimMode = !!opts.vim;
    STATE.debug = !!opts.debug;
    STATE.listeners.keydown = onKeyDown;
    STATE.listeners.focusin = onFocusIn;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    loadRoleShortcuts(STATE.role);
    log('initialized', STATE);
    return KeyNav;
  }

  function destroy() {
    document.removeEventListener('keydown', STATE.listeners.keydown, true);
    document.removeEventListener('focusin', STATE.listeners.focusin, true);
    STATE.shortcuts.clear();
    STATE.trapStack = [];
    STATE.activeTrap = null;
  }

  // ─────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────
  const KeyNav = {
    init,
    destroy,
    enable: () => { STATE.enabled = true; },
    disable: () => { STATE.enabled = false; },
    setRole: loadRoleShortcuts,
    setVimMode: (on) => { STATE.vimMode = !!on; },
    register: registerShortcut,
    unregister: unregisterShortcut,
    setTabOrder,
    focusNext: () => focusNext(false),
    focusPrev: () => focusNext(true),
    trap: trapFocus,
    releaseTrap,
    showHelp,
    state: () => Object.assign({}, STATE, { shortcuts: Array.from(STATE.shortcuts.keys()) })
  };

  global.KeyNav = KeyNav;
  if (typeof module !== 'undefined' && module.exports) module.exports = KeyNav;

  // Auto-init si data-attr presente
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const meta = document.querySelector('meta[name="keynav-autoinit"]');
      if (meta) init({
        role: meta.getAttribute('data-role') || 'cashier',
        vim: meta.getAttribute('data-vim') === 'true',
        debug: meta.getAttribute('data-debug') === 'true'
      });
    });
  }
})(typeof window !== 'undefined' ? window : this);
