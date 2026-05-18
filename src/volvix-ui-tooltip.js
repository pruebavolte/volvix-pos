/**
 * volvix-ui-tooltip.js
 * UI Tooltip component with hover/click trigger, 4 positions, delay,
 * rich content, and arrow indicator.
 *
 * Exposes: window.Tooltip
 *
 * Usage:
 *   const tip = Tooltip.create(targetEl, {
 *     content: 'Hello world',
 *     position: 'top',      // 'top' | 'bottom' | 'left' | 'right'
 *     trigger: 'hover',     // 'hover' | 'click' | 'manual'
 *     delay: 200,           // ms before showing
 *     hideDelay: 100,       // ms before hiding
 *     arrow: true,
 *     theme: 'dark',        // 'dark' | 'light'
 *     maxWidth: 240,
 *     html: false           // allow rich HTML content
 *   });
 *   tip.show(); tip.hide(); tip.toggle(); tip.update('new'); tip.destroy();
 *
 *   // Auto-init via attributes:
 *   //   <button data-tooltip="Hello" data-tooltip-position="bottom">Hi</button>
 *   Tooltip.init();
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-tooltip-styles';
  var Z_INDEX = 99999;
  var ACTIVE = [];
  var ID_SEQ = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.vx-tooltip{position:absolute;z-index:' + Z_INDEX + ';pointer-events:none;' +
      'font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'padding:6px 10px;border-radius:6px;max-width:240px;word-wrap:break-word;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:0;transform:translateY(2px);' +
      'transition:opacity .15s ease,transform .15s ease;}' +
      '.vx-tooltip.vx-show{opacity:1;transform:translateY(0);}' +
      '.vx-tooltip.vx-interactive{pointer-events:auto;}' +
      '.vx-tooltip.vx-dark{background:#1f2937;color:#f9fafb;}' +
      '.vx-tooltip.vx-light{background:#ffffff;color:#111827;border:1px solid #e5e7eb;}' +
      '.vx-tooltip .vx-arrow{position:absolute;width:8px;height:8px;transform:rotate(45deg);}' +
      '.vx-tooltip.vx-dark .vx-arrow{background:#1f2937;}' +
      '.vx-tooltip.vx-light .vx-arrow{background:#ffffff;border:1px solid #e5e7eb;}' +
      '.vx-tooltip.vx-pos-top .vx-arrow{bottom:-4px;left:50%;margin-left:-4px;border-top:none;border-left:none;}' +
      '.vx-tooltip.vx-pos-bottom .vx-arrow{top:-4px;left:50%;margin-left:-4px;border-bottom:none;border-right:none;}' +
      '.vx-tooltip.vx-pos-left .vx-arrow{right:-4px;top:50%;margin-top:-4px;border-left:none;border-bottom:none;}' +
      '.vx-tooltip.vx-pos-right .vx-arrow{left:-4px;top:50%;margin-top:-4px;border-right:none;border-top:none;}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function getRect(el) { return el.getBoundingClientRect(); }

  function computePosition(targetRect, tipRect, position) {
    var sx = window.pageXOffset || document.documentElement.scrollLeft;
    var sy = window.pageYOffset || document.documentElement.scrollTop;
    var gap = 8;
    var top = 0, left = 0;
    switch (position) {
      case 'bottom':
        top = targetRect.bottom + sy + gap;
        left = targetRect.left + sx + (targetRect.width - tipRect.width) / 2;
        break;
      case 'left':
        top = targetRect.top + sy + (targetRect.height - tipRect.height) / 2;
        left = targetRect.left + sx - tipRect.width - gap;
        break;
      case 'right':
        top = targetRect.top + sy + (targetRect.height - tipRect.height) / 2;
        left = targetRect.right + sx + gap;
        break;
      case 'top':
      default:
        top = targetRect.top + sy - tipRect.height - gap;
        left = targetRect.left + sx + (targetRect.width - tipRect.width) / 2;
        break;
    }
    // Viewport clamp
    var vw = document.documentElement.clientWidth;
    var minLeft = sx + 4;
    var maxLeft = sx + vw - tipRect.width - 4;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    return { top: top, left: left };
  }

  function flipIfOverflow(targetRect, tipRect, position) {
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    if (position === 'top' && targetRect.top - tipRect.height - 8 < 0) return 'bottom';
    if (position === 'bottom' && targetRect.bottom + tipRect.height + 8 > vh) return 'top';
    if (position === 'left' && targetRect.left - tipRect.width - 8 < 0) return 'right';
    if (position === 'right' && targetRect.right + tipRect.width + 8 > vw) return 'left';
    return position;
  }

  function Tooltip(target, options) {
    if (!target) throw new Error('Tooltip: target is required');
    this.id = ++ID_SEQ;
    this.target = target;
    this.opts = Object.assign({
      content: '',
      position: 'top',
      trigger: 'hover',
      delay: 200,
      hideDelay: 100,
      arrow: true,
      theme: 'dark',
      maxWidth: 240,
      html: false,
      interactive: false,
      offset: 8
    }, options || {});
    this._showTimer = null;
    this._hideTimer = null;
    this._visible = false;
    this._el = null;
    injectStyles();
    this._bind();
    ACTIVE.push(this);
  }

  Tooltip.prototype._build = function () {
    if (this._el) return this._el;
    var el = document.createElement('div');
    el.className = 'vx-tooltip vx-' + this.opts.theme + ' vx-pos-' + this.opts.position;
    if (this.opts.interactive) el.classList.add('vx-interactive');
    el.style.maxWidth = this.opts.maxWidth + 'px';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('data-vx-tip-id', String(this.id));
    if (this.opts.html) {
      if (this.opts.content instanceof Node) el.appendChild(this.opts.content);
      else el.innerHTML = String(this.opts.content);
    } else {
      el.textContent = String(this.opts.content);
    }
    if (this.opts.arrow) {
      var arrow = document.createElement('span');
      arrow.className = 'vx-arrow';
      el.appendChild(arrow);
    }
    document.body.appendChild(el);
    this._el = el;
    return el;
  };

  Tooltip.prototype._position = function () {
    if (!this._el) return;
    var tRect = getRect(this.target);
    var elRect = getRect(this._el);
    var pos = flipIfOverflow(tRect, elRect, this.opts.position);
    if (pos !== this.opts.position) {
      this._el.classList.remove('vx-pos-' + this.opts.position);
      this._el.classList.add('vx-pos-' + pos);
    }
    var coords = computePosition(tRect, elRect, pos);
    this._el.style.top = coords.top + 'px';
    this._el.style.left = coords.left + 'px';
  };

  Tooltip.prototype.show = function () {
    var self = this;
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
    if (this._visible) return;
    if (this._showTimer) return;
    this._showTimer = setTimeout(function () {
      self._showTimer = null;
      self._build();
      self._position();
      // Force reflow then add show class for transition
      void self._el.offsetWidth;
      self._el.classList.add('vx-show');
      self._visible = true;
      window.addEventListener('scroll', self._reposition, true);
      window.addEventListener('resize', self._reposition);
    }, this.opts.delay);
  };

  Tooltip.prototype.hide = function () {
    var self = this;
    if (this._showTimer) { clearTimeout(this._showTimer); this._showTimer = null; }
    if (!this._visible) return;
    if (this._hideTimer) return;
    this._hideTimer = setTimeout(function () {
      self._hideTimer = null;
      if (!self._el) return;
      self._el.classList.remove('vx-show');
      self._visible = false;
      window.removeEventListener('scroll', self._reposition, true);
      window.removeEventListener('resize', self._reposition);
      // Remove after transition
      setTimeout(function () {
        if (self._el && !self._visible) {
          self._el.parentNode && self._el.parentNode.removeChild(self._el);
          self._el = null;
        }
      }, 180);
    }, this.opts.hideDelay);
  };

  Tooltip.prototype.toggle = function () {
    this._visible ? this.hide() : this.show();
  };

  Tooltip.prototype.update = function (content) {
    this.opts.content = content;
    if (this._el) {
      // Preserve arrow
      var arrow = this._el.querySelector('.vx-arrow');
      if (this.opts.html) {
        this._el.innerHTML = '';
        if (content instanceof Node) this._el.appendChild(content);
        else this._el.innerHTML = String(content);
      } else {
        this._el.textContent = String(content);
      }
      if (arrow) this._el.appendChild(arrow);
      this._position();
    }
  };

  Tooltip.prototype._bind = function () {
    var self = this;
    this._reposition = function () { self._position(); };
    this._onEnter = function () { self.show(); };
    this._onLeave = function () { self.hide(); };
    this._onClick = function (e) { e.stopPropagation(); self.toggle(); };
    this._onDocClick = function (e) {
      if (!self._visible) return;
      if (self.target.contains(e.target)) return;
      if (self._el && self._el.contains(e.target)) return;
      self.hide();
    };
    this._onFocus = function () { self.show(); };
    this._onBlur = function () { self.hide(); };
    this._onKey = function (e) { if (e.key === 'Escape') self.hide(); };

    var t = this.opts.trigger;
    if (t === 'hover') {
      this.target.addEventListener('mouseenter', this._onEnter);
      this.target.addEventListener('mouseleave', this._onLeave);
      this.target.addEventListener('focus', this._onFocus);
      this.target.addEventListener('blur', this._onBlur);
    } else if (t === 'click') {
      this.target.addEventListener('click', this._onClick);
      document.addEventListener('click', this._onDocClick);
    }
    document.addEventListener('keydown', this._onKey);
  };

  Tooltip.prototype.destroy = function () {
    var t = this.opts.trigger;
    if (t === 'hover') {
      this.target.removeEventListener('mouseenter', this._onEnter);
      this.target.removeEventListener('mouseleave', this._onLeave);
      this.target.removeEventListener('focus', this._onFocus);
      this.target.removeEventListener('blur', this._onBlur);
    } else if (t === 'click') {
      this.target.removeEventListener('click', this._onClick);
      document.removeEventListener('click', this._onDocClick);
    }
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('scroll', this._reposition, true);
    window.removeEventListener('resize', this._reposition);
    if (this._showTimer) clearTimeout(this._showTimer);
    if (this._hideTimer) clearTimeout(this._hideTimer);
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    var idx = ACTIVE.indexOf(this);
    if (idx >= 0) ACTIVE.splice(idx, 1);
  };

  // Public API
  var API = {
    create: function (target, options) { return new Tooltip(target, options); },
    init: function (root) {
      root = root || document;
      var nodes = root.querySelectorAll('[data-tooltip]');
      var instances = [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.__vxTip) { instances.push(n.__vxTip); continue; }
        var inst = new Tooltip(n, {
          content: n.getAttribute('data-tooltip') || '',
          position: n.getAttribute('data-tooltip-position') || 'top',
          trigger: n.getAttribute('data-tooltip-trigger') || 'hover',
          theme: n.getAttribute('data-tooltip-theme') || 'dark',
          delay: parseInt(n.getAttribute('data-tooltip-delay') || '200', 10),
          html: n.getAttribute('data-tooltip-html') === 'true'
        });
        n.__vxTip = inst;
        instances.push(inst);
      }
      return instances;
    },
    destroyAll: function () {
      while (ACTIVE.length) ACTIVE[0].destroy();
    },
    instances: function () { return ACTIVE.slice(); },
    version: '1.0.0'
  };

  global.Tooltip = API;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { API.init(); });
  }
})(typeof window !== 'undefined' ? window : this);
