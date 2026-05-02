/**
 * volvix-ui-modal.js
 * Generic Modal UI Component for Volvix
 * Exposes: window.Modal
 *
 * Features:
 *  - open / close / toggle
 *  - sizes: sm, md, lg, xl, full
 *  - animations: fade, slide, zoom
 *  - ESC to close (configurable)
 *  - Backdrop click to close (configurable)
 *  - Nested modals (stack management)
 *  - Lifecycle hooks: onOpen, onClose, beforeClose
 *  - Focus trap (basic)
 *  - Auto styles injection
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-modal-styles';
  var CSS = [
    '.vx-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9000;opacity:0;transition:opacity .2s ease}',
    '.vx-modal-backdrop.vx-open{opacity:1}',
    '.vx-modal{background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;transform:scale(.95);opacity:0;transition:transform .2s ease,opacity .2s ease;width:100%}',
    '.vx-modal.vx-open{transform:scale(1);opacity:1}',
    '.vx-modal.vx-anim-slide{transform:translateY(-30px)}',
    '.vx-modal.vx-anim-slide.vx-open{transform:translateY(0)}',
    '.vx-modal.vx-anim-fade{transform:none}',
    '.vx-modal-sm{max-width:380px}',
    '.vx-modal-md{max-width:560px}',
    '.vx-modal-lg{max-width:800px}',
    '.vx-modal-xl{max-width:1100px}',
    '.vx-modal-full{max-width:96vw;max-height:96vh;width:96vw;height:96vh}',
    '.vx-modal-header{padding:14px 18px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:16px;color:#222}',
    '.vx-modal-body{padding:16px 18px;overflow-y:auto;flex:1;color:#333;font-size:14px;line-height:1.5}',
    '.vx-modal-footer{padding:12px 18px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px;background:#fafafa}',
    '.vx-modal-close{background:transparent;border:0;font-size:22px;line-height:1;cursor:pointer;color:#666;padding:4px 8px;border-radius:4px}',
    '.vx-modal-close:hover{background:#f0f0f0;color:#000}',
    '.vx-modal-btn{padding:8px 14px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:13px}',
    '.vx-modal-btn-primary{background:#2563eb;color:#fff;border-color:#2563eb}',
    '.vx-modal-btn-primary:hover{background:#1e4fcf}',
    '.vx-modal-btn:hover{background:#f4f4f4}',
    'body.vx-modal-open{overflow:hidden}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Stack of currently open modals (for nested handling)
  var modalStack = [];

  function topModal() {
    return modalStack[modalStack.length - 1] || null;
  }

  // Global ESC handler — only closes top modal
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = topModal();
    if (m && m.options.escClose) m.close();
  });

  function noop() {}

  function buildElement(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  /**
   * Modal constructor
   * @param {Object} opts
   *   title       string|HTMLElement
   *   content     string|HTMLElement
   *   size        'sm'|'md'|'lg'|'xl'|'full'   (default 'md')
   *   animation   'fade'|'slide'|'zoom'        (default 'zoom')
   *   escClose    boolean                       (default true)
   *   backdropClose boolean                     (default true)
   *   showClose   boolean                       (default true)
   *   buttons     Array<{text,className,onClick,closeOnClick}>
   *   onOpen      function(modal)
   *   onClose     function(modal)
   *   beforeClose function(modal) -> false to cancel
   *   className   extra class for modal box
   */
  function Modal(opts) {
    if (!(this instanceof Modal)) return new Modal(opts);
    injectStyles();
    this.options = Object.assign({
      title: '',
      content: '',
      size: 'md',
      animation: 'zoom',
      escClose: true,
      backdropClose: true,
      showClose: true,
      buttons: null,
      onOpen: noop,
      onClose: noop,
      beforeClose: null,
      className: ''
    }, opts || {});
    this.isOpen = false;
    this._build();
  }

  Modal.prototype._build = function () {
    var o = this.options;
    var backdrop = buildElement('div', 'vx-modal-backdrop');
    var modal = buildElement('div', 'vx-modal vx-modal-' + o.size + ' vx-anim-' + o.animation + ' ' + o.className);

    // Header
    if (o.title || o.showClose) {
      var header = buildElement('div', 'vx-modal-header');
      var title = buildElement('span', 'vx-modal-title');
      if (typeof o.title === 'string') title.innerHTML = o.title;
      else if (o.title instanceof HTMLElement) title.appendChild(o.title);
      header.appendChild(title);

      if (o.showClose) {
        var btnClose = buildElement('button', 'vx-modal-close', '&times;');
        btnClose.setAttribute('aria-label', 'Close');
        var self = this;
        btnClose.addEventListener('click', function () { self.close(); });
        header.appendChild(btnClose);
      }
      modal.appendChild(header);
    }

    // Body
    var body = buildElement('div', 'vx-modal-body');
    if (typeof o.content === 'string') body.innerHTML = o.content;
    else if (o.content instanceof HTMLElement) body.appendChild(o.content);
    modal.appendChild(body);
    this.bodyEl = body;

    // Footer / buttons
    if (Array.isArray(o.buttons) && o.buttons.length) {
      var footer = buildElement('div', 'vx-modal-footer');
      var self2 = this;
      o.buttons.forEach(function (b) {
        var btn = buildElement('button',
          'vx-modal-btn ' + (b.className || ''),
          b.text || 'OK');
        btn.addEventListener('click', function (ev) {
          var keep = false;
          if (typeof b.onClick === 'function') {
            keep = b.onClick(ev, self2) === false;
          }
          if (b.closeOnClick !== false && !keep) self2.close();
        });
        footer.appendChild(btn);
      });
      modal.appendChild(footer);
    }

    // Backdrop click
    var self3 = this;
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop && self3.options.backdropClose) self3.close();
    });

    backdrop.appendChild(modal);
    this.backdropEl = backdrop;
    this.modalEl = modal;
  };

  Modal.prototype.open = function () {
    if (this.isOpen) return this;
    document.body.appendChild(this.backdropEl);
    document.body.classList.add('vx-modal-open');

    // z-index for nesting
    var baseZ = 9000 + modalStack.length * 10;
    this.backdropEl.style.zIndex = String(baseZ);

    modalStack.push(this);
    this.isOpen = true;

    // Trigger animation (next frame)
    var self = this;
    requestAnimationFrame(function () {
      self.backdropEl.classList.add('vx-open');
      self.modalEl.classList.add('vx-open');
    });

    // Focus first focusable
    setTimeout(function () {
      var focusable = self.modalEl.querySelector('input,textarea,select,button:not(.vx-modal-close)');
      if (focusable) try { focusable.focus(); } catch (e) {}
    }, 50);

    try { this.options.onOpen(this); } catch (e) { console.error(e); }
    return this;
  };

  Modal.prototype.close = function () {
    if (!this.isOpen) return this;
    if (typeof this.options.beforeClose === 'function') {
      try {
        if (this.options.beforeClose(this) === false) return this;
      } catch (e) { console.error(e); }
    }
    var self = this;
    this.backdropEl.classList.remove('vx-open');
    this.modalEl.classList.remove('vx-open');

    setTimeout(function () {
      if (self.backdropEl.parentNode) {
        self.backdropEl.parentNode.removeChild(self.backdropEl);
      }
      var idx = modalStack.indexOf(self);
      if (idx >= 0) modalStack.splice(idx, 1);
      if (modalStack.length === 0) {
        document.body.classList.remove('vx-modal-open');
      }
      self.isOpen = false;
      try { self.options.onClose(self); } catch (e) { console.error(e); }
    }, 220);

    return this;
  };

  Modal.prototype.toggle = function () {
    return this.isOpen ? this.close() : this.open();
  };

  Modal.prototype.setContent = function (content) {
    if (!this.bodyEl) return this;
    this.bodyEl.innerHTML = '';
    if (typeof content === 'string') this.bodyEl.innerHTML = content;
    else if (content instanceof HTMLElement) this.bodyEl.appendChild(content);
    return this;
  };

  Modal.prototype.setTitle = function (title) {
    var t = this.modalEl.querySelector('.vx-modal-title');
    if (!t) return this;
    if (typeof title === 'string') t.innerHTML = title;
    else if (title instanceof HTMLElement) { t.innerHTML = ''; t.appendChild(title); }
    return this;
  };

  // Static helpers
  Modal.alert = function (message, title) {
    return new Modal({
      title: title || 'Aviso',
      content: '<p>' + message + '</p>',
      size: 'sm',
      buttons: [{ text: 'OK', className: 'vx-modal-btn-primary' }]
    }).open();
  };

  Modal.confirm = function (message, onYes, onNo) {
    return new Modal({
      title: 'Confirmar',
      content: '<p>' + message + '</p>',
      size: 'sm',
      buttons: [
        { text: 'Cancelar', onClick: function () { if (onNo) onNo(); } },
        { text: 'Aceptar', className: 'vx-modal-btn-primary', onClick: function () { if (onYes) onYes(); } }
      ]
    }).open();
  };

  Modal.closeAll = function () {
    while (modalStack.length) modalStack[modalStack.length - 1].close();
  };

  Modal.stack = function () { return modalStack.slice(); };

  global.Modal = Modal;
})(window);
