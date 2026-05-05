/**
 * volvix-ui-drawer.js
 * Side Drawer / Off-canvas panel component.
 *
 * Features:
 *  - Positions: left | right | top | bottom
 *  - Overlay (backdrop) with click-to-close
 *  - Swipe-to-close (touch)
 *  - ESC key to close
 *  - Focus trap (basic)
 *  - Programmatic open/close/toggle
 *  - Custom events: drawer:open, drawer:close
 *
 * Usage:
 *   const d = window.Drawer.create({
 *     position: 'right',
 *     size: '320px',
 *     content: '<h2>Menu</h2>',
 *     overlay: true,
 *     swipeClose: true,
 *     onOpen: () => {},
 *     onClose: () => {}
 *   });
 *   d.open(); d.close(); d.toggle(); d.destroy();
 *
 * Exposes: window.Drawer
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-drawer-styles';
  var ACTIVE_DRAWERS = [];

  var BASE_CSS = [
    '.vxd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;',
    'transition:opacity .25s ease;z-index:9998;pointer-events:none}',
    '.vxd-overlay.vxd-show{opacity:1;pointer-events:auto}',
    '.vxd-drawer{position:fixed;background:#fff;box-shadow:0 0 24px rgba(0,0,0,.2);',
    'z-index:9999;transition:transform .3s cubic-bezier(.2,.8,.2,1);',
    'display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif}',
    '.vxd-drawer.vxd-left{top:0;left:0;height:100%;transform:translateX(-100%)}',
    '.vxd-drawer.vxd-right{top:0;right:0;height:100%;transform:translateX(100%)}',
    '.vxd-drawer.vxd-top{top:0;left:0;width:100%;transform:translateY(-100%)}',
    '.vxd-drawer.vxd-bottom{bottom:0;left:0;width:100%;transform:translateY(100%)}',
    '.vxd-drawer.vxd-open{transform:translate(0,0)!important}',
    '.vxd-drawer.vxd-dragging{transition:none}',
    '.vxd-header{display:flex;align-items:center;justify-content:space-between;',
    'padding:12px 16px;border-bottom:1px solid #eee;font-weight:600}',
    '.vxd-close{background:none;border:0;font-size:20px;cursor:pointer;',
    'width:32px;height:32px;border-radius:50%}',
    '.vxd-close:hover{background:#f1f1f1}',
    '.vxd-body{flex:1;padding:16px;overflow:auto}',
    'body.vxd-locked{overflow:hidden}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    document.head.appendChild(style);
  }

  function emit(el, name, detail) {
    el.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
  }

  function Drawer(opts) {
    opts = opts || {};
    this.position = ['left', 'right', 'top', 'bottom'].indexOf(opts.position) >= 0
      ? opts.position : 'right';
    this.size = opts.size || '320px';
    this.title = opts.title || '';
    this.content = opts.content || '';
    this.overlayEnabled = opts.overlay !== false;
    this.swipeClose = opts.swipeClose !== false;
    this.closeOnEsc = opts.closeOnEsc !== false;
    this.closeOnOverlay = opts.closeOnOverlay !== false;
    this.showClose = opts.showClose !== false;
    this.onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : null;
    this.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

    this.isOpen = false;
    this._touch = null;

    injectStyles();
    this._build();
    this._bind();
  }

  Drawer.prototype._build = function () {
    var d = document.createElement('aside');
    d.className = 'vxd-drawer vxd-' + this.position;
    if (this.position === 'left' || this.position === 'right') {
      d.style.width = this.size;
      d.style.maxWidth = '100%';
    } else {
      d.style.height = this.size;
      d.style.maxHeight = '100%';
    }

    var header = '';
    if (this.title || this.showClose) {
      header = '<div class="vxd-header"><span class="vxd-title">' +
        (this.title || '') + '</span>' +
        (this.showClose ? '<button class="vxd-close" aria-label="Close">&times;</button>' : '') +
        '</div>';
    }

    var bodyContent = (typeof this.content === 'string')
      ? this.content
      : '';

    d.innerHTML = header + '<div class="vxd-body">' + bodyContent + '</div>';

    if (this.content && this.content.nodeType === 1) {
      d.querySelector('.vxd-body').innerHTML = '';
      d.querySelector('.vxd-body').appendChild(this.content);
    }

    this.el = d;
    document.body.appendChild(d);

    if (this.overlayEnabled) {
      var ov = document.createElement('div');
      ov.className = 'vxd-overlay';
      this.overlay = ov;
      document.body.appendChild(ov);
    }
  };

  Drawer.prototype._bind = function () {
    var self = this;
    var btn = this.el.querySelector('.vxd-close');
    if (btn) btn.addEventListener('click', function () { self.close(); });

    if (this.overlay && this.closeOnOverlay) {
      this.overlay.addEventListener('click', function () { self.close(); });
    }

    this._escHandler = function (e) {
      if (e.key === 'Escape' && self.isOpen && self.closeOnEsc) self.close();
    };
    document.addEventListener('keydown', this._escHandler);

    if (this.swipeClose) {
      this.el.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        self._touch = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          dx: 0, dy: 0
        };
      }, { passive: true });

      this.el.addEventListener('touchmove', function (e) {
        if (!self._touch) return;
        var t = e.touches[0];
        self._touch.dx = t.clientX - self._touch.x;
        self._touch.dy = t.clientY - self._touch.y;
        var off = self._allowedOffset(self._touch.dx, self._touch.dy);
        if (off !== null) {
          self.el.classList.add('vxd-dragging');
          var axis = (self.position === 'left' || self.position === 'right') ? 'X' : 'Y';
          self.el.style.transform = 'translate' + axis + '(' + off + 'px)';
        }
      }, { passive: true });

      this.el.addEventListener('touchend', function () {
        if (!self._touch) return;
        self.el.classList.remove('vxd-dragging');
        self.el.style.transform = '';
        var threshold = 80;
        var dx = self._touch.dx, dy = self._touch.dy;
        var shouldClose =
          (self.position === 'left' && dx < -threshold) ||
          (self.position === 'right' && dx > threshold) ||
          (self.position === 'top' && dy < -threshold) ||
          (self.position === 'bottom' && dy > threshold);
        self._touch = null;
        if (shouldClose) self.close();
      });
    }
  };

  Drawer.prototype._allowedOffset = function (dx, dy) {
    switch (this.position) {
      case 'left':   return dx < 0 ? dx : null;
      case 'right':  return dx > 0 ? dx : null;
      case 'top':    return dy < 0 ? dy : null;
      case 'bottom': return dy > 0 ? dy : null;
    }
    return null;
  };

  Drawer.prototype.open = function () {
    if (this.isOpen) return;
    this.isOpen = true;
    ACTIVE_DRAWERS.push(this);
    document.body.classList.add('vxd-locked');
    if (this.overlay) this.overlay.classList.add('vxd-show');
    var self = this;
    requestAnimationFrame(function () { self.el.classList.add('vxd-open'); });
    emit(this.el, 'drawer:open', { drawer: this });
    if (this.onOpen) this.onOpen(this);
  };

  Drawer.prototype.close = function () {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('vxd-open');
    if (this.overlay) this.overlay.classList.remove('vxd-show');
    var idx = ACTIVE_DRAWERS.indexOf(this);
    if (idx >= 0) ACTIVE_DRAWERS.splice(idx, 1);
    if (ACTIVE_DRAWERS.length === 0) document.body.classList.remove('vxd-locked');
    emit(this.el, 'drawer:close', { drawer: this });
    if (this.onClose) this.onClose(this);
  };

  Drawer.prototype.toggle = function () {
    this.isOpen ? this.close() : this.open();
  };

  Drawer.prototype.setContent = function (html) {
    var body = this.el.querySelector('.vxd-body');
    if (!body) return;
    if (typeof html === 'string') body.innerHTML = html;
    else if (html && html.nodeType === 1) {
      body.innerHTML = '';
      body.appendChild(html);
    }
  };

  Drawer.prototype.setTitle = function (t) {
    var s = this.el.querySelector('.vxd-title');
    if (s) s.textContent = t;
    this.title = t;
  };

  Drawer.prototype.destroy = function () {
    this.close();
    document.removeEventListener('keydown', this._escHandler);
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.el = this.overlay = null;
  };

  var API = {
    create: function (opts) { return new Drawer(opts); },
    closeAll: function () {
      ACTIVE_DRAWERS.slice().forEach(function (d) { d.close(); });
    },
    active: function () { return ACTIVE_DRAWERS.slice(); },
    Drawer: Drawer
  };

  global.Drawer = API;
})(typeof window !== 'undefined' ? window : this);
