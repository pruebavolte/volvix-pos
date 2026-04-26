/*!
 * volvix-ui-stars.js — Star Rating UI Component
 * Provides 1-5 / 1-10 star ratings with half-star precision,
 * hover preview, readonly mode, keyboard support, and events.
 *
 * Public API:
 *   window.StarRating.create(container, options) -> instance
 *   window.StarRating.mountAll(selector?)        -> instance[]
 *
 * Options:
 *   max        : 5 | 10            (default 5)
 *   value      : number            (default 0)
 *   step       : 1 | 0.5           (default 1)
 *   readonly   : boolean           (default false)
 *   size       : number (px)       (default 24)
 *   color      : string            (default '#f5b301')
 *   emptyColor : string            (default '#d8d8d8')
 *   onChange   : function(value)
 *   onHover    : function(value)
 *   showValue  : boolean           (default false)
 *   ariaLabel  : string            (default 'Rating')
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-stars-style';
  var CSS = [
    '.vx-stars{display:inline-flex;align-items:center;gap:6px;font-family:system-ui,sans-serif;user-select:none}',
    '.vx-stars-row{display:inline-flex;cursor:pointer;outline:none}',
    '.vx-stars[data-readonly="true"] .vx-stars-row{cursor:default}',
    '.vx-stars-row:focus-visible{box-shadow:0 0 0 2px #4c9aff;border-radius:4px}',
    '.vx-star{position:relative;display:inline-block;line-height:1}',
    '.vx-star-bg,.vx-star-fg{display:block;width:100%;height:100%}',
    '.vx-star-fg-wrap{position:absolute;inset:0;overflow:hidden;width:0;pointer-events:none;transition:width .12s ease}',
    '.vx-stars-value{font-size:13px;color:#444;min-width:2.5em;text-align:left}',
    '.vx-stars[data-readonly="true"] .vx-star{transition:transform .15s}',
    '.vx-stars:not([data-readonly="true"]) .vx-star:hover{transform:scale(1.08)}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var STAR_PATH =
    'M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.77 6.1 20.67l1.13-6.57L2.45 9.44l6.6-.96L12 2.5z';

  function svgStar(size, color) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', STAR_PATH);
    p.setAttribute('fill', color);
    svg.appendChild(p);
    return svg;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function quantize(v, step) {
    var inv = 1 / step;
    return Math.round(v * inv) / inv;
  }

  function StarRatingInstance(container, opts) {
    this.opts = Object.assign({
      max: 5,
      value: 0,
      step: 1,
      readonly: false,
      size: 24,
      color: '#f5b301',
      emptyColor: '#d8d8d8',
      onChange: null,
      onHover: null,
      showValue: false,
      ariaLabel: 'Rating'
    }, opts || {});
    if (this.opts.step !== 0.5 && this.opts.step !== 1) this.opts.step = 1;
    if (this.opts.max !== 5 && this.opts.max !== 10) this.opts.max = 5;

    this.container = typeof container === 'string'
      ? document.querySelector(container) : container;
    if (!this.container) throw new Error('StarRating: container not found');

    this.value = clamp(quantize(+this.opts.value || 0, this.opts.step), 0, this.opts.max);
    this.hoverValue = null;
    this._stars = [];
    this._build();
    this._render();
  }

  StarRatingInstance.prototype._build = function () {
    var self = this;
    injectStyle();
    var c = this.container;
    c.innerHTML = '';
    c.classList.add('vx-stars');
    c.setAttribute('data-readonly', this.opts.readonly ? 'true' : 'false');

    var row = document.createElement('div');
    row.className = 'vx-stars-row';
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-label', this.opts.ariaLabel);
    row.setAttribute('aria-valuemin', '0');
    row.setAttribute('aria-valuemax', String(this.opts.max));
    row.setAttribute('aria-valuenow', String(this.value));
    if (!this.opts.readonly) row.tabIndex = 0;

    for (var i = 0; i < this.opts.max; i++) {
      var star = document.createElement('span');
      star.className = 'vx-star';
      star.style.width = this.opts.size + 'px';
      star.style.height = this.opts.size + 'px';
      star.style.marginRight = '2px';

      var bg = svgStar(this.opts.size, this.opts.emptyColor);
      bg.classList.add('vx-star-bg');
      var fgWrap = document.createElement('span');
      fgWrap.className = 'vx-star-fg-wrap';
      var fg = svgStar(this.opts.size, this.opts.color);
      fg.classList.add('vx-star-fg');
      fgWrap.appendChild(fg);

      star.appendChild(bg);
      star.appendChild(fgWrap);
      star.dataset.idx = i;
      row.appendChild(star);
      this._stars.push({ el: star, fgWrap: fgWrap });
    }

    if (this.opts.showValue) {
      this.valueEl = document.createElement('span');
      this.valueEl.className = 'vx-stars-value';
      c.appendChild(row);
      c.appendChild(this.valueEl);
    } else {
      c.appendChild(row);
    }

    this.row = row;

    if (!this.opts.readonly) {
      row.addEventListener('mousemove', function (e) { self._onMove(e); });
      row.addEventListener('mouseleave', function () { self._onLeave(); });
      row.addEventListener('click', function (e) { self._onClick(e); });
      row.addEventListener('keydown', function (e) { self._onKey(e); });
    }
  };

  StarRatingInstance.prototype._coord = function (e) {
    var rect = this.row.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var totalW = rect.width;
    var ratio = clamp(x / totalW, 0, 1);
    var raw = ratio * this.opts.max;
    return quantize(raw + (this.opts.step === 0.5 ? 0.25 : 0.5), this.opts.step);
  };

  StarRatingInstance.prototype._onMove = function (e) {
    var v = clamp(this._coord(e), this.opts.step, this.opts.max);
    this.hoverValue = v;
    this._render();
    if (typeof this.opts.onHover === 'function') this.opts.onHover(v);
  };

  StarRatingInstance.prototype._onLeave = function () {
    this.hoverValue = null;
    this._render();
    if (typeof this.opts.onHover === 'function') this.opts.onHover(null);
  };

  StarRatingInstance.prototype._onClick = function (e) {
    var v = clamp(this._coord(e), 0, this.opts.max);
    this.setValue(v);
  };

  StarRatingInstance.prototype._onKey = function (e) {
    var step = this.opts.step;
    var k = e.key;
    var handled = true;
    if (k === 'ArrowRight' || k === 'ArrowUp') this.setValue(this.value + step);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') this.setValue(this.value - step);
    else if (k === 'Home') this.setValue(0);
    else if (k === 'End') this.setValue(this.opts.max);
    else handled = false;
    if (handled) e.preventDefault();
  };

  StarRatingInstance.prototype._render = function () {
    var v = this.hoverValue != null ? this.hoverValue : this.value;
    for (var i = 0; i < this._stars.length; i++) {
      var fill = clamp(v - i, 0, 1);
      this._stars[i].fgWrap.style.width = (fill * 100) + '%';
    }
    this.row.setAttribute('aria-valuenow', String(this.value));
    this.row.setAttribute('aria-valuetext', this.value + ' of ' + this.opts.max);
    if (this.valueEl) this.valueEl.textContent = this.value + ' / ' + this.opts.max;
  };

  StarRatingInstance.prototype.setValue = function (v) {
    var nv = clamp(quantize(+v || 0, this.opts.step), 0, this.opts.max);
    if (nv === this.value) { this._render(); return; }
    this.value = nv;
    this._render();
    if (typeof this.opts.onChange === 'function') this.opts.onChange(nv);
  };

  StarRatingInstance.prototype.getValue = function () { return this.value; };

  StarRatingInstance.prototype.setReadonly = function (b) {
    this.opts.readonly = !!b;
    this._build();
    this._render();
  };

  StarRatingInstance.prototype.destroy = function () {
    this.container.innerHTML = '';
    this.container.classList.remove('vx-stars');
    this.container.removeAttribute('data-readonly');
  };

  var StarRating = {
    create: function (container, options) {
      return new StarRatingInstance(container, options);
    },
    mountAll: function (selector) {
      var sel = selector || '[data-star-rating]';
      var nodes = document.querySelectorAll(sel);
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var opts = {
          max: +el.dataset.max || 5,
          value: +el.dataset.value || 0,
          step: el.dataset.step === '0.5' ? 0.5 : 1,
          readonly: el.dataset.readonly === 'true',
          size: +el.dataset.size || 24,
          showValue: el.dataset.showValue === 'true'
        };
        out.push(new StarRatingInstance(el, opts));
      }
      return out;
    },
    version: '1.0.0'
  };

  global.StarRating = StarRating;
  if (typeof module !== 'undefined' && module.exports) module.exports = StarRating;
})(typeof window !== 'undefined' ? window : this);
