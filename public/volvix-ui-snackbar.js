/**
 * volvix-ui-snackbar.js
 * Sistema de notificaciones tipo Snackbar/Toast para Volvix POS
 *
 * Caracteristicas:
 *  - Tipos: success, error, warning, info
 *  - Cola (queue) con limite configurable de visibles simultaneos
 *  - Boton de accion opcional (ej. "Deshacer")
 *  - Swipe to dismiss (mouse + touch)
 *  - Auto-dismiss con duracion configurable
 *  - Pausa al hover
 *  - API: window.Snackbar.success(...), .error(...), .warning(...), .info(...), .show({...}), .dismissAll()
 */
(function (global) {
  'use strict';

  // ---------- Configuracion por defecto ----------
  var DEFAULTS = {
    duration: 4000,        // ms; 0 = persistente hasta accion/cierre
    maxVisible: 3,         // cuantos visibles a la vez
    position: 'bottom-right', // bottom-right | bottom-left | top-right | top-left | bottom-center | top-center
    swipeThreshold: 80,    // px para descartar
    pauseOnHover: true,
    closeButton: true
  };

  var config = Object.assign({}, DEFAULTS);
  var queue = [];          // pendientes
  var active = [];         // visibles
  var idCounter = 0;
  var container = null;
  var stylesInjected = false;

  // ---------- Estilos ----------
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css = ''
      + '.vx-snackbar-container{position:fixed;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px;width:calc(100% - 32px);}'
      + '.vx-snackbar-container.pos-bottom-right{right:16px;bottom:16px;align-items:flex-end;}'
      + '.vx-snackbar-container.pos-bottom-left{left:16px;bottom:16px;align-items:flex-start;}'
      + '.vx-snackbar-container.pos-top-right{right:16px;top:16px;align-items:flex-end;flex-direction:column-reverse;}'
      + '.vx-snackbar-container.pos-top-left{left:16px;top:16px;align-items:flex-start;flex-direction:column-reverse;}'
      + '.vx-snackbar-container.pos-bottom-center{left:50%;transform:translateX(-50%);bottom:16px;align-items:center;}'
      + '.vx-snackbar-container.pos-top-center{left:50%;transform:translateX(-50%);top:16px;align-items:center;flex-direction:column-reverse;}'
      + '.vx-snackbar{pointer-events:auto;display:flex;align-items:center;gap:12px;min-height:48px;padding:12px 16px;border-radius:8px;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;'
      + 'color:#fff;background:#323232;width:100%;box-sizing:border-box;opacity:0;transform:translateY(20px) scale(.96);'
      + 'transition:opacity .25s ease, transform .25s ease;will-change:transform,opacity;cursor:grab;user-select:none;}'
      + '.vx-snackbar.show{opacity:1;transform:translateY(0) scale(1);}'
      + '.vx-snackbar.hide{opacity:0;transform:translateY(20px) scale(.96);}'
      + '.vx-snackbar.dragging{transition:none;cursor:grabbing;}'
      + '.vx-snackbar.success{background:#2e7d32;}'
      + '.vx-snackbar.error{background:#c62828;}'
      + '.vx-snackbar.warning{background:#ef6c00;color:#fff;}'
      + '.vx-snackbar.info{background:#1565c0;}'
      + '.vx-snackbar .vx-icon{flex:0 0 auto;font-size:18px;line-height:1;}'
      + '.vx-snackbar .vx-msg{flex:1 1 auto;line-height:1.35;word-break:break-word;}'
      + '.vx-snackbar .vx-action{flex:0 0 auto;background:transparent;border:none;color:#ffd54f;font-weight:600;text-transform:uppercase;'
      + 'font-size:12px;letter-spacing:.5px;cursor:pointer;padding:6px 8px;border-radius:4px;}'
      + '.vx-snackbar .vx-action:hover{background:rgba(255,255,255,.12);}'
      + '.vx-snackbar .vx-close{flex:0 0 auto;background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;opacity:.75;'
      + 'padding:2px 6px;border-radius:4px;}'
      + '.vx-snackbar .vx-close:hover{opacity:1;background:rgba(255,255,255,.12);}'
      + '.vx-progress{position:absolute;left:0;bottom:0;height:3px;background:rgba(255,255,255,.55);width:100%;transform-origin:left center;}'
      + '.vx-snackbar{position:relative;overflow:hidden;}'
      + '@media (max-width:480px){.vx-snackbar-container{max-width:none;}}';
    var style = document.createElement('style');
    style.setAttribute('data-vx-snackbar', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- Container ----------
  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.className = 'vx-snackbar-container pos-' + config.position;
    document.body.appendChild(container);
    return container;
  }

  function setPosition(pos) {
    config.position = pos;
    if (container) container.className = 'vx-snackbar-container pos-' + pos;
  }

  // ---------- Iconos ----------
  var ICONS = {
    success: '✔',
    error: '✖',
    warning: '⚠',
    info: 'ℹ'
  };

  // ---------- Render ----------
  function render(item) {
    var el = document.createElement('div');
    el.className = 'vx-snackbar ' + (item.type || 'info');
    el.setAttribute('role', item.type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', item.type === 'error' ? 'assertive' : 'polite');

    var icon = document.createElement('span');
    icon.className = 'vx-icon';
    icon.textContent = item.icon || ICONS[item.type] || ICONS.info;
    el.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'vx-msg';
    msg.textContent = item.message || '';
    el.appendChild(msg);

    if (item.action && typeof item.action.onClick === 'function') {
      var btn = document.createElement('button');
      btn.className = 'vx-action';
      btn.type = 'button';
      btn.textContent = item.action.label || 'OK';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        try { item.action.onClick(item); } catch (_) {}
        dismiss(item);
      });
      el.appendChild(btn);
    }

    if (config.closeButton) {
      var close = document.createElement('button');
      close.className = 'vx-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Cerrar');
      close.textContent = '×';
      close.addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss(item);
      });
      el.appendChild(close);
    }

    item.el = el;
    attachSwipe(item);
    attachHoverPause(item);

    ensureContainer().appendChild(el);
    // Forzar reflow para que la animacion corra
    void el.offsetWidth;
    el.classList.add('show');

    if (item.duration > 0) startTimer(item);
  }

  // ---------- Timer ----------
  function startTimer(item) {
    clearTimer(item);
    item.remaining = item.remaining != null ? item.remaining : item.duration;
    item.startedAt = Date.now();
    item.timer = setTimeout(function () { dismiss(item); }, item.remaining);
  }
  function pauseTimer(item) {
    if (!item.timer) return;
    clearTimeout(item.timer);
    item.timer = null;
    item.remaining = Math.max(0, item.remaining - (Date.now() - item.startedAt));
  }
  function clearTimer(item) {
    if (item.timer) { clearTimeout(item.timer); item.timer = null; }
  }

  // ---------- Pausa al hover ----------
  function attachHoverPause(item) {
    if (!config.pauseOnHover || !item.duration) return;
    item.el.addEventListener('mouseenter', function () { pauseTimer(item); });
    item.el.addEventListener('mouseleave', function () {
      if (!item.dragging && item.duration > 0) startTimer(item);
    });
  }

  // ---------- Swipe to dismiss ----------
  function attachSwipe(item) {
    var startX = 0, currentX = 0, dragging = false;
    var el = item.el;

    function onDown(e) {
      dragging = true;
      item.dragging = true;
      pauseTimer(item);
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      currentX = startX;
      el.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      currentX = (e.touches ? e.touches[0].clientX : e.clientX);
      var dx = currentX - startX;
      el.style.transform = 'translateX(' + dx + 'px)';
      el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 240));
      if (e.cancelable) e.preventDefault();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      item.dragging = false;
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      var dx = currentX - startX;
      if (Math.abs(dx) >= config.swipeThreshold) {
        el.style.transform = 'translateX(' + (dx > 0 ? 600 : -600) + 'px)';
        el.style.opacity = '0';
        setTimeout(function () { dismiss(item, true); }, 180);
      } else {
        el.style.transform = '';
        el.style.opacity = '';
        if (item.duration > 0) startTimer(item);
      }
    }

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
  }

  // ---------- Dismiss / queue ----------
  function dismiss(item, immediate) {
    if (item.dismissed) return;
    item.dismissed = true;
    clearTimer(item);
    var el = item.el;
    if (!el) return removeFromActive(item);
    el.classList.remove('show');
    el.classList.add('hide');
    var done = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      removeFromActive(item);
      if (typeof item.onClose === 'function') {
        try { item.onClose(item); } catch (_) {}
      }
      pump();
    };
    if (immediate) done();
    else setTimeout(done, 260);
  }

  function removeFromActive(item) {
    var i = active.indexOf(item);
    if (i >= 0) active.splice(i, 1);
  }

  function pump() {
    while (active.length < config.maxVisible && queue.length) {
      var next = queue.shift();
      active.push(next);
      render(next);
    }
  }

  // ---------- API publica ----------
  function show(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    injectStyles();
    ensureContainer();
    var item = {
      id: ++idCounter,
      type: opts.type || 'info',
      message: opts.message || '',
      icon: opts.icon || null,
      action: opts.action || null,
      duration: (opts.duration != null ? opts.duration : config.duration),
      onClose: opts.onClose || null,
      remaining: null,
      timer: null,
      el: null,
      dismissed: false,
      dragging: false
    };
    queue.push(item);
    pump();
    return {
      id: item.id,
      dismiss: function () { dismiss(item); }
    };
  }

  function dismissAll() {
    queue.length = 0;
    active.slice().forEach(function (it) { dismiss(it); });
  }

  function configure(opts) {
    if (!opts) return Object.assign({}, config);
    if (opts.position) setPosition(opts.position);
    if (typeof opts.duration === 'number') config.duration = opts.duration;
    if (typeof opts.maxVisible === 'number') config.maxVisible = Math.max(1, opts.maxVisible);
    if (typeof opts.swipeThreshold === 'number') config.swipeThreshold = opts.swipeThreshold;
    if (typeof opts.pauseOnHover === 'boolean') config.pauseOnHover = opts.pauseOnHover;
    if (typeof opts.closeButton === 'boolean') config.closeButton = opts.closeButton;
    return Object.assign({}, config);
  }

  var Snackbar = {
    show: show,
    success: function (msg, opts) { return show(Object.assign({}, opts || {}, { type: 'success', message: typeof msg === 'string' ? msg : (msg && msg.message) })); },
    error:   function (msg, opts) { return show(Object.assign({}, opts || {}, { type: 'error',   message: typeof msg === 'string' ? msg : (msg && msg.message) })); },
    warning: function (msg, opts) { return show(Object.assign({}, opts || {}, { type: 'warning', message: typeof msg === 'string' ? msg : (msg && msg.message) })); },
    info:    function (msg, opts) { return show(Object.assign({}, opts || {}, { type: 'info',    message: typeof msg === 'string' ? msg : (msg && msg.message) })); },
    dismissAll: dismissAll,
    configure: configure,
    _internal: { queue: queue, active: active }
  };

  global.Snackbar = Snackbar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Snackbar;
})(typeof window !== 'undefined' ? window : this);
