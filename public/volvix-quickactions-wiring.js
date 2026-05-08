/**
 * volvix-quickactions-wiring.js
 * Volvix POS — Quick Actions Bar
 *
 * Barra inferior con 8 botones más usados (configurable per user),
 * gestos swipe (left/right para cambiar de página, up para expandir,
 * down para colapsar), drag & drop para reordenar, y persistencia en
 * localStorage por usuario.
 *
 * Expone window.QuickActionsAPI:
 *   - mount(containerSelector?)
 *   - unmount()
 *   - setUser(userId)
 *   - registerAction(action)
 *   - unregisterAction(actionId)
 *   - setUserActions(userId, actionIds[])
 *   - getUserActions(userId)
 *   - trigger(actionId)
 *   - on(event, handler)
 *   - off(event, handler)
 *   - openCustomizer()
 *   - closeCustomizer()
 *   - reset(userId?)
 *
 * Eventos: 'mount', 'unmount', 'action', 'configchange', 'swipe',
 *          'expand', 'collapse', 'page'.
 *
 * Agent-74 R9 — versión 340
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────
  // Config / constantes
  // ───────────────────────────────────────────────────────────
  var STORAGE_PREFIX = 'volvix.quickactions.v1.';
  var MAX_VISIBLE = 8;
  var SWIPE_THRESHOLD = 40;     // px
  var SWIPE_TIME_LIMIT = 600;   // ms
  var LONG_PRESS_MS = 500;

  // Catálogo por defecto. Cualquier módulo del POS puede registrar
  // más acciones llamando QuickActionsAPI.registerAction().
  var DEFAULT_CATALOG = [
    { id: 'sale.new',       label: 'Nueva venta',     icon: '🧾', group: 'ventas' },
    { id: 'sale.hold',      label: 'Suspender',       icon: '⏸',  group: 'ventas' },
    { id: 'sale.recall',    label: 'Recuperar',       icon: '↩️', group: 'ventas' },
    { id: 'cash.open',      label: 'Abrir caja',      icon: '💵', group: 'caja'   },
    { id: 'cash.close',     label: 'Cerrar caja',     icon: '🔒', group: 'caja'   },
    { id: 'cash.movement',  label: 'Movimiento',      icon: '🔁', group: 'caja'   },
    { id: 'product.search', label: 'Buscar producto', icon: '🔍', group: 'cat'    },
    { id: 'product.scan',   label: 'Escanear',        icon: '📷', group: 'cat'    },
    { id: 'customer.find',  label: 'Cliente',         icon: '👤', group: 'cliente'},
    { id: 'discount.apply', label: 'Descuento',       icon: '%',  group: 'ventas' },
    { id: 'invoice.print',  label: 'Reimprimir',      icon: '🖨', group: 'docs'   },
    { id: 'report.daily',   label: 'Reporte X',       icon: '📊', group: 'reportes'},
    { id: 'report.z',       label: 'Reporte Z',       icon: '📈', group: 'reportes'},
    { id: 'shift.change',   label: 'Cambio turno',    icon: '🔄', group: 'caja'   },
    { id: 'help',           label: 'Ayuda',           icon: '❓', group: 'sistema'}
  ];

  var DEFAULT_USER_ACTIONS = [
    'sale.new', 'product.scan', 'product.search', 'discount.apply',
    'cash.movement', 'invoice.print', 'customer.find', 'help'
  ];

  // ───────────────────────────────────────────────────────────
  // Estado interno
  // ───────────────────────────────────────────────────────────
  var state = {
    mounted: false,
    container: null,
    rootEl: null,
    barEl: null,
    customizerEl: null,
    catalog: {},        // id -> action def
    userId: 'default',
    userActions: [],    // ids
    page: 0,
    expanded: false,
    listeners: {}       // event -> [fn]
  };

  // Cargar catálogo por defecto
  DEFAULT_CATALOG.forEach(function (a) { state.catalog[a.id] = a; });

  // ───────────────────────────────────────────────────────────
  // Utilidades
  // ───────────────────────────────────────────────────────────
  function emit(evt, payload) {
    var l = state.listeners[evt];
    if (!l) return;
    for (var i = 0; i < l.length; i++) {
      try { l[i](payload); } catch (e) {
        if (global.console) console.error('[QuickActions]', evt, e);
      }
    }
  }

  function storageKey(userId) { return STORAGE_PREFIX + (userId || 'default'); }

  function loadUserActions(userId) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(storageKey(userId));
      if (!raw) return DEFAULT_USER_ACTIONS.slice();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_USER_ACTIONS.slice();
      return parsed.filter(function (id) { return !!state.catalog[id]; });
    } catch (e) { return DEFAULT_USER_ACTIONS.slice(); }
  }

  function saveUserActions(userId, ids) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
      }
    } catch (e) { /* quota / privacidad */ }
  }

  function makeEl(tag, className, text) {
    var el = global.document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function injectStyles() {
    if (global.document.getElementById('volvix-qa-styles')) return;
    var css = [
      '.vqa-root{position:fixed;left:0;right:0;bottom:0;z-index:9000;font-family:system-ui,sans-serif;}',
      '.vqa-bar{display:flex;justify-content:space-around;align-items:center;background:#111c2e;color:#fff;border-top:1px solid #233248;padding:6px 8px;touch-action:pan-y;user-select:none;}',
      '.vqa-btn{flex:1;min-width:56px;max-width:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;margin:0 2px;border-radius:8px;background:transparent;color:inherit;border:none;cursor:pointer;font-size:12px;}',
      '.vqa-btn:hover{background:#1c2a44;}',
      '.vqa-btn:active{background:#2a3d5e;}',
      '.vqa-btn .vqa-ico{font-size:20px;line-height:1;margin-bottom:2px;}',
      '.vqa-btn[data-dragging="1"]{opacity:.5;}',
      '.vqa-page-indicator{position:absolute;top:-14px;left:50%;transform:translateX(-50%);display:flex;gap:4px;}',
      '.vqa-dot{width:6px;height:6px;border-radius:50%;background:#445;}',
      '.vqa-dot.active{background:#4ea1ff;}',
      '.vqa-expanded{max-height:50vh;overflow:auto;background:#0c1422;}',
      '.vqa-customizer{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9500;display:flex;align-items:center;justify-content:center;}',
      '.vqa-cust-card{background:#0f1a2e;color:#fff;border-radius:12px;padding:16px;max-width:520px;width:90%;max-height:80vh;overflow:auto;}',
      '.vqa-cust-card h3{margin:0 0 10px 0;}',
      '.vqa-cust-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}',
      '.vqa-cust-item{padding:8px;border:1px solid #233248;border-radius:8px;cursor:pointer;text-align:center;font-size:12px;}',
      '.vqa-cust-item.selected{background:#1c4170;border-color:#4ea1ff;}',
      '.vqa-cust-actions{margin-top:14px;display:flex;justify-content:flex-end;gap:8px;}',
      '.vqa-cust-actions button{padding:8px 12px;border-radius:6px;border:none;cursor:pointer;}',
      '.vqa-btn-primary{background:#4ea1ff;color:#fff;}',
      '.vqa-btn-secondary{background:#233248;color:#fff;}'
    ].join('\n');
    var style = makeEl('style');
    style.id = 'volvix-qa-styles';
    style.textContent = css;
    global.document.head.appendChild(style);
  }

  // ───────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────
  function pagedActions() {
    var perPage = MAX_VISIBLE;
    var start = state.page * perPage;
    return state.userActions.slice(start, start + perPage);
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.userActions.length / MAX_VISIBLE));
  }

  function renderBar() {
    if (!state.barEl) return;
    state.barEl.innerHTML = '';

    // Indicador de páginas
    if (totalPages() > 1) {
      var ind = makeEl('div', 'vqa-page-indicator');
      for (var p = 0; p < totalPages(); p++) {
        var dot = makeEl('span', 'vqa-dot' + (p === state.page ? ' active' : ''));
        ind.appendChild(dot);
      }
      state.barEl.appendChild(ind);
    }

    var ids = pagedActions();
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        var def = state.catalog[id];
        if (!def) return;
        var btn = makeEl('button', 'vqa-btn');
        btn.setAttribute('data-action-id', id);
        btn.setAttribute('draggable', 'true');
        var ico = makeEl('span', 'vqa-ico', def.icon || '•');
        var lbl = makeEl('span', 'vqa-lbl', def.label || id);
        btn.appendChild(ico);
        btn.appendChild(lbl);
        attachButtonHandlers(btn, id);
        state.barEl.appendChild(btn);
      })(ids[i]);
    }
  }

  function attachButtonHandlers(btn, id) {
    var pressTimer = null;
    btn.addEventListener('click', function (ev) {
      if (btn.getAttribute('data-suppress-click') === '1') {
        btn.removeAttribute('data-suppress-click');
        return;
      }
      QuickActionsAPI.trigger(id, { source: 'click', event: ev });
    });
    btn.addEventListener('pointerdown', function () {
      pressTimer = global.setTimeout(function () {
        btn.setAttribute('data-suppress-click', '1');
        QuickActionsAPI.openCustomizer();
      }, LONG_PRESS_MS);
    });
    var clearPress = function () {
      if (pressTimer) { global.clearTimeout(pressTimer); pressTimer = null; }
    };
    btn.addEventListener('pointerup', clearPress);
    btn.addEventListener('pointerleave', clearPress);
    btn.addEventListener('pointercancel', clearPress);

    // Drag & drop reordenar
    btn.addEventListener('dragstart', function (ev) {
      btn.setAttribute('data-dragging', '1');
      try { ev.dataTransfer.setData('text/plain', id); } catch (e) {}
    });
    btn.addEventListener('dragend', function () {
      btn.removeAttribute('data-dragging');
    });
    btn.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    btn.addEventListener('drop', function (ev) {
      ev.preventDefault();
      var srcId = ev.dataTransfer.getData('text/plain');
      if (!srcId || srcId === id) return;
      reorder(srcId, id);
    });
  }

  function reorder(srcId, dstId) {
    var arr = state.userActions.slice();
    var si = arr.indexOf(srcId);
    var di = arr.indexOf(dstId);
    if (si < 0 || di < 0) return;
    arr.splice(si, 1);
    arr.splice(di, 0, srcId);
    state.userActions = arr;
    saveUserActions(state.userId, arr);
    renderBar();
    emit('configchange', { userId: state.userId, actions: arr });
  }

  // ───────────────────────────────────────────────────────────
  // Gestos swipe
  // ───────────────────────────────────────────────────────────
  function attachSwipe(el) {
    var startX = 0, startY = 0, startT = 0, tracking = false;
    el.addEventListener('touchstart', function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      tracking = true;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', function (ev) {
      if (!tracking) return;
      tracking = false;
      var t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var dt = Date.now() - startT;
      if (dt > SWIPE_TIME_LIMIT) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx <= -SWIPE_THRESHOLD) handleSwipe('left');
        else if (dx >= SWIPE_THRESHOLD) handleSwipe('right');
      } else {
        if (dy <= -SWIPE_THRESHOLD) handleSwipe('up');
        else if (dy >= SWIPE_THRESHOLD) handleSwipe('down');
      }
    });
  }

  function handleSwipe(dir) {
    emit('swipe', { direction: dir });
    if (dir === 'left' && state.page < totalPages() - 1) {
      state.page++; renderBar(); emit('page', { page: state.page });
    } else if (dir === 'right' && state.page > 0) {
      state.page--; renderBar(); emit('page', { page: state.page });
    } else if (dir === 'up' && !state.expanded) {
      state.expanded = true;
      state.barEl.classList.add('vqa-expanded');
      emit('expand', {});
    } else if (dir === 'down' && state.expanded) {
      state.expanded = false;
      state.barEl.classList.remove('vqa-expanded');
      emit('collapse', {});
    }
  }

  // ───────────────────────────────────────────────────────────
  // Customizer (modal)
  // ───────────────────────────────────────────────────────────
  function buildCustomizer() {
    var overlay = makeEl('div', 'vqa-customizer');
    var card = makeEl('div', 'vqa-cust-card');
    card.appendChild(makeEl('h3', null, 'Personalizar acciones rápidas'));
    var hint = makeEl('p', null,
      'Selecciona hasta ' + MAX_VISIBLE + ' acciones por página. ' +
      'Arrastra los botones de la barra para reordenar.');
    hint.style.fontSize = '12px';
    hint.style.opacity = '0.8';
    card.appendChild(hint);

    var list = makeEl('div', 'vqa-cust-list');
    var selected = state.userActions.slice();

    Object.keys(state.catalog).forEach(function (id) {
      var def = state.catalog[id];
      var item = makeEl('div', 'vqa-cust-item' + (selected.indexOf(id) >= 0 ? ' selected' : ''));
      item.setAttribute('data-id', id);
      item.innerHTML = '<div style="font-size:18px">' + (def.icon || '•') + '</div>' +
                       '<div>' + def.label + '</div>';
      item.addEventListener('click', function () {
        var idx = selected.indexOf(id);
        if (idx >= 0) {
          selected.splice(idx, 1);
          item.classList.remove('selected');
        } else {
          selected.push(id);
          item.classList.add('selected');
        }
      });
      list.appendChild(item);
    });
    card.appendChild(list);

    var actions = makeEl('div', 'vqa-cust-actions');
    var cancel = makeEl('button', 'vqa-btn-secondary', 'Cancelar');
    var save = makeEl('button', 'vqa-btn-primary', 'Guardar');
    cancel.addEventListener('click', function () { QuickActionsAPI.closeCustomizer(); });
    save.addEventListener('click', function () {
      state.userActions = selected.slice();
      saveUserActions(state.userId, state.userActions);
      state.page = 0;
      renderBar();
      emit('configchange', { userId: state.userId, actions: state.userActions });
      QuickActionsAPI.closeCustomizer();
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) QuickActionsAPI.closeCustomizer();
    });
    return overlay;
  }

  // ───────────────────────────────────────────────────────────
  // API pública
  // ───────────────────────────────────────────────────────────
  var QuickActionsAPI = {
    mount: function (containerSelector) {
      // 2026-05-07 cleanup: barra inferior de QuickActions deshabilitada por
      // feature flag. Para re-habilitar: window.VOLVIX_QUICKACTIONS_FAB = true.
      if (global.VOLVIX_QUICKACTIONS_FAB !== true) return;
      if (state.mounted) return;
      injectStyles();
      var doc = global.document;
      var container = containerSelector
        ? doc.querySelector(containerSelector)
        : doc.body;
      if (!container) throw new Error('QuickActions: contenedor no encontrado');
      state.container = container;

      state.rootEl = makeEl('div', 'vqa-root');
      state.barEl = makeEl('div', 'vqa-bar');
      state.rootEl.appendChild(state.barEl);
      container.appendChild(state.rootEl);

      state.userActions = loadUserActions(state.userId);
      attachSwipe(state.barEl);
      renderBar();

      state.mounted = true;
      emit('mount', { userId: state.userId });
      return true;
    },

    unmount: function () {
      if (!state.mounted) return;
      if (state.rootEl && state.rootEl.parentNode) {
        state.rootEl.parentNode.removeChild(state.rootEl);
      }
      QuickActionsAPI.closeCustomizer();
      state.rootEl = null;
      state.barEl = null;
      state.mounted = false;
      emit('unmount', {});
    },

    setUser: function (userId) {
      state.userId = userId || 'default';
      state.userActions = loadUserActions(state.userId);
      state.page = 0;
      if (state.mounted) renderBar();
      emit('configchange', { userId: state.userId, actions: state.userActions });
    },

    registerAction: function (action) {
      if (!action || !action.id) throw new Error('action.id requerido');
      state.catalog[action.id] = {
        id: action.id,
        label: action.label || action.id,
        icon: action.icon || '•',
        group: action.group || 'custom',
        handler: typeof action.handler === 'function' ? action.handler : null
      };
      if (state.mounted) renderBar();
    },

    unregisterAction: function (actionId) {
      delete state.catalog[actionId];
      state.userActions = state.userActions.filter(function (i) { return i !== actionId; });
      saveUserActions(state.userId, state.userActions);
      if (state.mounted) renderBar();
    },

    setUserActions: function (userId, ids) {
      if (!Array.isArray(ids)) return;
      var clean = ids.filter(function (id) { return !!state.catalog[id]; });
      saveUserActions(userId, clean);
      if (userId === state.userId) {
        state.userActions = clean;
        state.page = 0;
        if (state.mounted) renderBar();
        emit('configchange', { userId: userId, actions: clean });
      }
    },

    getUserActions: function (userId) {
      return loadUserActions(userId || state.userId);
    },

    trigger: function (actionId, ctx) {
      var def = state.catalog[actionId];
      if (!def) return false;
      emit('action', { id: actionId, def: def, ctx: ctx || {} });
      if (typeof def.handler === 'function') {
        try { def.handler(ctx || {}); } catch (e) {
          if (global.console) console.error('[QuickActions] handler', actionId, e);
        }
      }
      return true;
    },

    on: function (evt, fn) {
      if (typeof fn !== 'function') return;
      (state.listeners[evt] = state.listeners[evt] || []).push(fn);
    },

    off: function (evt, fn) {
      var arr = state.listeners[evt];
      if (!arr) return;
      state.listeners[evt] = arr.filter(function (f) { return f !== fn; });
    },

    openCustomizer: function () {
      if (state.customizerEl) return;
      state.customizerEl = buildCustomizer();
      global.document.body.appendChild(state.customizerEl);
    },

    closeCustomizer: function () {
      if (state.customizerEl && state.customizerEl.parentNode) {
        state.customizerEl.parentNode.removeChild(state.customizerEl);
      }
      state.customizerEl = null;
    },

    reset: function (userId) {
      var u = userId || state.userId;
      try { global.localStorage && global.localStorage.removeItem(storageKey(u)); } catch (e) {}
      if (u === state.userId) {
        state.userActions = DEFAULT_USER_ACTIONS.slice();
        state.page = 0;
        if (state.mounted) renderBar();
        emit('configchange', { userId: u, actions: state.userActions });
      }
    },

    // Introspección útil para debugging / tests
    _debug: function () {
      return {
        userId: state.userId,
        page: state.page,
        expanded: state.expanded,
        userActions: state.userActions.slice(),
        catalog: Object.keys(state.catalog)
      };
    }
  };

  global.QuickActionsAPI = QuickActionsAPI;

  // Auto-mount opcional si el host pone <body data-volvix-qa="auto">
  if (global.document && global.document.readyState !== 'loading') {
    tryAutoMount();
  } else if (global.document) {
    global.document.addEventListener('DOMContentLoaded', tryAutoMount);
  }

  function tryAutoMount() {
    var body = global.document && global.document.body;
    if (body && body.getAttribute('data-volvix-qa') === 'auto') {
      try { QuickActionsAPI.mount(); } catch (e) {
        if (global.console) console.error('[QuickActions] auto-mount', e);
      }
    }
  }

})(typeof window !== 'undefined' ? window : this);
