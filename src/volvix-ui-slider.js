/* volvix-ui-slider.js - UI Slider Component
 * Features: range, single/dual handle, marks, vertical orientation, custom labels
 * Exposes: window.Slider
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    min: 0,
    max: 100,
    step: 1,
    value: 0,
    values: null,        // [a, b] for dual handle
    dual: false,
    vertical: false,
    marks: null,         // array of numbers OR object {value: label}
    showLabels: true,
    showTooltip: true,
    showFill: true,
    disabled: false,
    formatter: null,     // function(v) -> string
    onChange: null,
    onInput: null,
    onStart: null,
    onEnd: null,
    color: '#3b82f6',
    trackColor: '#e5e7eb',
    handleSize: 18,
    trackSize: 6,
    className: ''
  };

  var STYLE_ID = '__volvix_slider_styles__';
  var CSS = [
    '.vx-slider{position:relative;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif;font-size:12px;color:#374151;box-sizing:border-box;}',
    '.vx-slider.vx-h{width:100%;padding:14px 10px;}',
    '.vx-slider.vx-v{height:200px;width:40px;padding:10px 14px;display:inline-block;}',
    '.vx-slider.vx-disabled{opacity:.5;pointer-events:none;}',
    '.vx-slider .vx-track{position:absolute;background:#e5e7eb;border-radius:999px;}',
    '.vx-slider.vx-h .vx-track{left:10px;right:10px;top:50%;transform:translateY(-50%);height:6px;}',
    '.vx-slider.vx-v .vx-track{top:10px;bottom:10px;left:50%;transform:translateX(-50%);width:6px;}',
    '.vx-slider .vx-fill{position:absolute;background:#3b82f6;border-radius:999px;}',
    '.vx-slider.vx-h .vx-fill{top:0;bottom:0;}',
    '.vx-slider.vx-v .vx-fill{left:0;right:0;}',
    '.vx-slider .vx-handle{position:absolute;width:18px;height:18px;background:#fff;border:2px solid #3b82f6;border-radius:50%;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.2);box-sizing:border-box;touch-action:none;}',
    '.vx-slider .vx-handle:hover{transform:scale(1.15);}',
    '.vx-slider.vx-h .vx-handle{top:50%;margin-top:-9px;margin-left:-9px;}',
    '.vx-slider.vx-v .vx-handle{left:50%;margin-left:-9px;margin-top:-9px;}',
    '.vx-slider .vx-handle.vx-active{cursor:grabbing;transform:scale(1.2);}',
    '.vx-slider .vx-tip{position:absolute;background:#111827;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;}',
    '.vx-slider.vx-h .vx-tip{bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;}',
    '.vx-slider.vx-v .vx-tip{left:100%;top:50%;transform:translateY(-50%);margin-left:6px;}',
    '.vx-slider .vx-handle.vx-active .vx-tip,.vx-slider .vx-handle:hover .vx-tip{opacity:1;}',
    '.vx-slider .vx-mark{position:absolute;width:3px;height:3px;background:#9ca3af;border-radius:50%;}',
    '.vx-slider.vx-h .vx-mark{top:50%;transform:translate(-50%,-50%);}',
    '.vx-slider.vx-v .vx-mark{left:50%;transform:translate(-50%,-50%);}',
    '.vx-slider .vx-label{position:absolute;font-size:10px;color:#6b7280;white-space:nowrap;}',
    '.vx-slider.vx-h .vx-label{top:calc(50% + 12px);transform:translateX(-50%);}',
    '.vx-slider.vx-v .vx-label{left:calc(50% + 12px);transform:translateY(-50%);}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function roundStep(v, step, min) {
    var n = Math.round((v - min) / step) * step + min;
    return parseFloat(n.toFixed(10));
  }
  function pct(v, min, max) { return ((v - min) / (max - min)) * 100; }

  function Slider(target, options) {
    if (!(this instanceof Slider)) return new Slider(target, options);
    injectStyles();

    this.el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.el) throw new Error('Slider: target not found');

    var opts = {};
    for (var k in DEFAULTS) opts[k] = DEFAULTS[k];
    if (options) for (var k2 in options) opts[k2] = options[k2];
    this.opts = opts;

    if (opts.dual) {
      this._values = opts.values
        ? [opts.values[0], opts.values[1]]
        : [opts.min, opts.max];
    } else {
      this._values = [opts.value];
    }

    this._dragIndex = -1;
    this._handles = [];
    this._build();
    this._bind();
    this._render();
  }

  Slider.prototype._build = function () {
    var o = this.opts;
    this.el.innerHTML = '';
    this.el.classList.add('vx-slider');
    this.el.classList.add(o.vertical ? 'vx-v' : 'vx-h');
    if (o.disabled) this.el.classList.add('vx-disabled');
    if (o.className) this.el.classList.add(o.className);

    this.track = document.createElement('div');
    this.track.className = 'vx-track';
    this.track.style.background = o.trackColor;
    if (o.vertical) this.track.style.width = o.trackSize + 'px';
    else this.track.style.height = o.trackSize + 'px';
    this.el.appendChild(this.track);

    if (o.showFill) {
      this.fill = document.createElement('div');
      this.fill.className = 'vx-fill';
      this.fill.style.background = o.color;
      this.track.appendChild(this.fill);
    }

    var count = o.dual ? 2 : 1;
    for (var i = 0; i < count; i++) {
      var h = document.createElement('div');
      h.className = 'vx-handle';
      h.style.borderColor = o.color;
      h.style.width = o.handleSize + 'px';
      h.style.height = o.handleSize + 'px';
      h.style.marginTop = -(o.handleSize / 2) + 'px';
      h.style.marginLeft = -(o.handleSize / 2) + 'px';
      h.dataset.idx = String(i);
      h.tabIndex = 0;
      if (o.showTooltip) {
        var tip = document.createElement('div');
        tip.className = 'vx-tip';
        h.appendChild(tip);
      }
      this.el.appendChild(h);
      this._handles.push(h);
    }

    if (o.marks) this._buildMarks();
  };

  Slider.prototype._buildMarks = function () {
    var o = this.opts;
    var marks = o.marks;
    var entries = [];
    if (Array.isArray(marks)) {
      for (var i = 0; i < marks.length; i++) entries.push({ value: marks[i], label: null });
    } else {
      for (var k in marks) entries.push({ value: parseFloat(k), label: marks[k] });
    }
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      var p = pct(e.value, o.min, o.max);
      var dot = document.createElement('div');
      dot.className = 'vx-mark';
      if (o.vertical) dot.style.bottom = p + '%';
      else dot.style.left = p + '%';
      this.track.appendChild(dot);

      if (o.showLabels && e.label !== null) {
        var lab = document.createElement('div');
        lab.className = 'vx-label';
        lab.textContent = e.label;
        if (o.vertical) lab.style.bottom = 'calc(' + p + '% - 6px)';
        else lab.style.left = 'calc(' + p + '% + 10px)';
        this.el.appendChild(lab);
      }
    }
  };

  Slider.prototype._bind = function () {
    var self = this;
    this._onDown = function (e) { self._down(e); };
    this._onMove = function (e) { self._move(e); };
    this._onUp = function (e) { self._up(e); };
    this._onKey = function (e) { self._key(e); };
    this._onTrackClick = function (e) { self._trackClick(e); };

    for (var i = 0; i < this._handles.length; i++) {
      this._handles[i].addEventListener('mousedown', this._onDown);
      this._handles[i].addEventListener('touchstart', this._onDown, { passive: false });
      this._handles[i].addEventListener('keydown', this._onKey);
    }
    this.track.addEventListener('mousedown', this._onTrackClick);
  };

  Slider.prototype._coord = function (e) {
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  };

  Slider.prototype._valueFromEvent = function (e) {
    var o = this.opts;
    var rect = this.track.getBoundingClientRect();
    var c = this._coord(e);
    var ratio;
    if (o.vertical) ratio = 1 - (c.y - rect.top) / rect.height;
    else ratio = (c.x - rect.left) / rect.width;
    ratio = clamp(ratio, 0, 1);
    var raw = o.min + ratio * (o.max - o.min);
    return clamp(roundStep(raw, o.step, o.min), o.min, o.max);
  };

  Slider.prototype._trackClick = function (e) {
    if (e.target !== this.track && e.target.className !== 'vx-fill') return;
    var v = this._valueFromEvent(e);
    var idx = 0;
    if (this.opts.dual) {
      idx = Math.abs(v - this._values[0]) <= Math.abs(v - this._values[1]) ? 0 : 1;
    }
    this._setValue(idx, v, true);
  };

  Slider.prototype._down = function (e) {
    if (this.opts.disabled) return;
    e.preventDefault();
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    this._dragIndex = idx;
    this._handles[idx].classList.add('vx-active');
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onUp);
    document.addEventListener('touchmove', this._onMove, { passive: false });
    document.addEventListener('touchend', this._onUp);
    if (this.opts.onStart) this.opts.onStart(this.getValue());
  };

  Slider.prototype._move = function (e) {
    if (this._dragIndex < 0) return;
    e.preventDefault();
    var v = this._valueFromEvent(e);
    this._setValue(this._dragIndex, v, false);
  };

  Slider.prototype._up = function () {
    if (this._dragIndex < 0) return;
    this._handles[this._dragIndex].classList.remove('vx-active');
    this._dragIndex = -1;
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onUp);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onUp);
    if (this.opts.onEnd) this.opts.onEnd(this.getValue());
    if (this.opts.onChange) this.opts.onChange(this.getValue());
  };

  Slider.prototype._key = function (e) {
    if (this.opts.disabled) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var step = this.opts.step;
    var delta = 0;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': delta = -step; break;
      case 'ArrowRight': case 'ArrowUp': delta = step; break;
      case 'Home': this._setValue(idx, this.opts.min, true); return;
      case 'End': this._setValue(idx, this.opts.max, true); return;
      case 'PageUp': delta = step * 10; break;
      case 'PageDown': delta = -step * 10; break;
      default: return;
    }
    e.preventDefault();
    this._setValue(idx, this._values[idx] + delta, true);
  };

  Slider.prototype._setValue = function (idx, v, fireChange) {
    var o = this.opts;
    v = clamp(roundStep(v, o.step, o.min), o.min, o.max);
    if (o.dual) {
      if (idx === 0) v = Math.min(v, this._values[1]);
      else v = Math.max(v, this._values[0]);
    }
    if (this._values[idx] === v) return;
    this._values[idx] = v;
    this._render();
    if (o.onInput) o.onInput(this.getValue());
    if (fireChange && o.onChange) o.onChange(this.getValue());
  };

  Slider.prototype._format = function (v) {
    return this.opts.formatter ? this.opts.formatter(v) : String(v);
  };

  Slider.prototype._render = function () {
    var o = this.opts;
    var vert = o.vertical;
    var p0 = pct(this._values[0], o.min, o.max);
    var p1 = o.dual ? pct(this._values[1], o.min, o.max) : p0;

    if (vert) {
      this._handles[0].style.bottom = p0 + '%';
      this._handles[0].style.left = '50%';
      if (o.dual) {
        this._handles[1].style.bottom = p1 + '%';
        this._handles[1].style.left = '50%';
      }
      if (this.fill) {
        var lo = o.dual ? Math.min(p0, p1) : 0;
        var hi = o.dual ? Math.max(p0, p1) : p0;
        this.fill.style.bottom = lo + '%';
        this.fill.style.height = (hi - lo) + '%';
      }
    } else {
      this._handles[0].style.left = p0 + '%';
      if (o.dual) this._handles[1].style.left = p1 + '%';
      if (this.fill) {
        var lo2 = o.dual ? Math.min(p0, p1) : 0;
        var hi2 = o.dual ? Math.max(p0, p1) : p0;
        this.fill.style.left = lo2 + '%';
        this.fill.style.width = (hi2 - lo2) + '%';
      }
    }

    for (var i = 0; i < this._handles.length; i++) {
      var tip = this._handles[i].querySelector('.vx-tip');
      if (tip) tip.textContent = this._format(this._values[i]);
      this._handles[i].setAttribute('aria-valuenow', this._values[i]);
      this._handles[i].setAttribute('aria-valuemin', o.min);
      this._handles[i].setAttribute('aria-valuemax', o.max);
      this._handles[i].setAttribute('role', 'slider');
    }
  };

  Slider.prototype.getValue = function () {
    return this.opts.dual ? this._values.slice() : this._values[0];
  };

  Slider.prototype.setValue = function (v) {
    if (this.opts.dual && Array.isArray(v)) {
      this._setValue(0, v[0], false);
      this._setValue(1, v[1], false);
    } else {
      this._setValue(0, v, false);
    }
    if (this.opts.onChange) this.opts.onChange(this.getValue());
    return this;
  };

  Slider.prototype.setMin = function (v) { this.opts.min = v; this._render(); return this; };
  Slider.prototype.setMax = function (v) { this.opts.max = v; this._render(); return this; };
  Slider.prototype.setStep = function (v) { this.opts.step = v; return this; };

  Slider.prototype.disable = function () {
    this.opts.disabled = true;
    this.el.classList.add('vx-disabled');
    return this;
  };
  Slider.prototype.enable = function () {
    this.opts.disabled = false;
    this.el.classList.remove('vx-disabled');
    return this;
  };

  Slider.prototype.destroy = function () {
    for (var i = 0; i < this._handles.length; i++) {
      this._handles[i].removeEventListener('mousedown', this._onDown);
      this._handles[i].removeEventListener('touchstart', this._onDown);
      this._handles[i].removeEventListener('keydown', this._onKey);
    }
    this.track.removeEventListener('mousedown', this._onTrackClick);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onUp);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onUp);
    this.el.innerHTML = '';
    this.el.classList.remove('vx-slider', 'vx-h', 'vx-v', 'vx-disabled');
  };

  Slider.create = function (target, options) { return new Slider(target, options); };
  Slider.version = '1.0.0';

  global.Slider = Slider;
  if (typeof module !== 'undefined' && module.exports) module.exports = Slider;
})(typeof window !== 'undefined' ? window : this);
