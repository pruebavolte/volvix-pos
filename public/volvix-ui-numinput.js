/**
 * volvix-ui-numinput.js
 * Volvix UI - Number Input Component
 *
 * Componente de entrada numérica con botones +/-, validación min/max,
 * step configurable, formato de moneda, soporte de teclado y eventos.
 *
 * Uso:
 *   const ni = NumInput.create({
 *     mount: '#qty',
 *     value: 1,
 *     min: 0,
 *     max: 99,
 *     step: 1,
 *     currency: false,
 *     onChange: (v) => console.log(v)
 *   });
 *
 *   ni.set(5);
 *   ni.get();
 *   ni.increment();
 *   ni.decrement();
 *   ni.destroy();
 *
 * window.NumInput
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'volvix-numinput-style';
  const CSS = `
    .vx-numinput { display:inline-flex; align-items:stretch; border:1px solid #cbd5e1;
      border-radius:8px; overflow:hidden; background:#fff; font-family:system-ui,sans-serif;
      box-shadow:0 1px 2px rgba(0,0,0,.04); }
    .vx-numinput.vx-disabled { opacity:.55; pointer-events:none; }
    .vx-numinput.vx-focus { outline:2px solid #2563eb; outline-offset:1px; }
    .vx-numinput .vx-ni-btn { background:#f1f5f9; border:0; width:36px; cursor:pointer;
      font-size:18px; font-weight:600; color:#0f172a; user-select:none;
      transition:background .15s; }
    .vx-numinput .vx-ni-btn:hover { background:#e2e8f0; }
    .vx-numinput .vx-ni-btn:active { background:#cbd5e1; }
    .vx-numinput .vx-ni-btn:disabled { color:#94a3b8; cursor:not-allowed; }
    .vx-numinput .vx-ni-input { border:0; outline:none; text-align:center; width:80px;
      font-size:15px; padding:6px 4px; background:transparent; color:#0f172a; }
    .vx-numinput .vx-ni-input::-webkit-outer-spin-button,
    .vx-numinput .vx-ni-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
    .vx-numinput.vx-sm .vx-ni-btn { width:28px; font-size:14px; }
    .vx-numinput.vx-sm .vx-ni-input { width:60px; font-size:13px; padding:4px 2px; }
    .vx-numinput.vx-lg .vx-ni-btn { width:44px; font-size:22px; }
    .vx-numinput.vx-lg .vx-ni-input { width:100px; font-size:18px; padding:8px 4px; }
    .vx-numinput.vx-error { border-color:#dc2626; }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function clamp(v, min, max) {
    if (typeof min === 'number' && v < min) return min;
    if (typeof max === 'number' && v > max) return max;
    return v;
  }

  function roundStep(v, step, base) {
    if (!step || step <= 0) return v;
    const b = base || 0;
    const n = Math.round((v - b) / step);
    return +(b + n * step).toFixed(10);
  }

  function formatCurrency(v, opts) {
    try {
      return new Intl.NumberFormat(opts.locale || 'es-MX', {
        style: 'currency',
        currency: opts.currencyCode || 'MXN',
        minimumFractionDigits: opts.fractionDigits != null ? opts.fractionDigits : 2,
        maximumFractionDigits: opts.fractionDigits != null ? opts.fractionDigits : 2
      }).format(v);
    } catch (e) {
      return String(v);
    }
  }

  function parseNumber(str, currency) {
    if (str == null) return NaN;
    let s = String(str).trim();
    if (currency) {
      s = s.replace(/[^\d.,\-]/g, '');
      // si tiene coma como decimal (es-ES), normalizar
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  function NumInput(opts) {
    this.opts = Object.assign({
      mount: null,
      value: 0,
      min: null,
      max: null,
      step: 1,
      currency: false,
      currencyCode: 'MXN',
      locale: 'es-MX',
      fractionDigits: null,
      size: 'md',
      disabled: false,
      readOnly: false,
      placeholder: '',
      onChange: null,
      onInvalid: null
    }, opts || {});

    this._value = Number(this.opts.value) || 0;
    this._listeners = [];
    this._build();
  }

  NumInput.prototype._build = function () {
    injectStyle();
    const o = this.opts;
    const root = typeof o.mount === 'string' ? document.querySelector(o.mount) : o.mount;
    if (!root) throw new Error('NumInput: mount no encontrado');

    const wrap = document.createElement('div');
    wrap.className = 'vx-numinput vx-' + (o.size || 'md');
    if (o.disabled) wrap.classList.add('vx-disabled');

    const btnDec = document.createElement('button');
    btnDec.type = 'button';
    btnDec.className = 'vx-ni-btn vx-ni-dec';
    btnDec.setAttribute('aria-label', 'Disminuir');
    btnDec.textContent = '−';

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = o.currency ? 'decimal' : 'numeric';
    input.className = 'vx-ni-input';
    input.placeholder = o.placeholder || '';
    if (o.readOnly) input.readOnly = true;

    const btnInc = document.createElement('button');
    btnInc.type = 'button';
    btnInc.className = 'vx-ni-btn vx-ni-inc';
    btnInc.setAttribute('aria-label', 'Aumentar');
    btnInc.textContent = '+';

    wrap.appendChild(btnDec);
    wrap.appendChild(input);
    wrap.appendChild(btnInc);
    root.appendChild(wrap);

    this.el = wrap;
    this.input = input;
    this.btnDec = btnDec;
    this.btnInc = btnInc;

    const onDec = () => this.decrement();
    const onInc = () => this.increment();
    const onFocus = () => wrap.classList.add('vx-focus');
    const onBlur = () => {
      wrap.classList.remove('vx-focus');
      this._commitFromInput();
    };
    const onKey = (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this.increment(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.decrement(); }
      else if (e.key === 'Enter') { this._commitFromInput(); }
    };
    const onWheel = (e) => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      if (e.deltaY < 0) this.increment(); else this.decrement();
    };

    btnDec.addEventListener('click', onDec);
    btnInc.addEventListener('click', onInc);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKey);
    input.addEventListener('wheel', onWheel, { passive: false });

    this._listeners = [
      [btnDec, 'click', onDec],
      [btnInc, 'click', onInc],
      [input, 'focus', onFocus],
      [input, 'blur', onBlur],
      [input, 'keydown', onKey],
      [input, 'wheel', onWheel]
    ];

    this._render();
  };

  NumInput.prototype._render = function () {
    const o = this.opts;
    const v = this._value;
    if (document.activeElement === this.input) {
      // mientras se edita no sobreescribir
    } else if (o.currency) {
      this.input.value = formatCurrency(v, o);
    } else {
      this.input.value = String(v);
    }
    if (typeof o.min === 'number') this.btnDec.disabled = v <= o.min;
    if (typeof o.max === 'number') this.btnInc.disabled = v >= o.max;
  };

  NumInput.prototype._commitFromInput = function () {
    const raw = this.input.value;
    const n = parseNumber(raw, this.opts.currency);
    if (isNaN(n)) {
      this.el.classList.add('vx-error');
      if (typeof this.opts.onInvalid === 'function') this.opts.onInvalid(raw);
      this._render();
      setTimeout(() => this.el.classList.remove('vx-error'), 800);
      return;
    }
    this.set(n);
  };

  NumInput.prototype.set = function (v, silent) {
    const o = this.opts;
    let n = Number(v);
    if (isNaN(n)) return;
    n = roundStep(n, o.step, typeof o.min === 'number' ? o.min : 0);
    n = clamp(n, o.min, o.max);
    const changed = n !== this._value;
    this._value = n;
    this._render();
    if (changed && !silent && typeof o.onChange === 'function') {
      o.onChange(n, this);
    }
  };

  NumInput.prototype.get = function () { return this._value; };

  NumInput.prototype.increment = function () {
    this.set(this._value + (this.opts.step || 1));
  };
  NumInput.prototype.decrement = function () {
    this.set(this._value - (this.opts.step || 1));
  };

  NumInput.prototype.setMin = function (m) { this.opts.min = m; this.set(this._value, true); this._render(); };
  NumInput.prototype.setMax = function (m) { this.opts.max = m; this.set(this._value, true); this._render(); };
  NumInput.prototype.setStep = function (s) { this.opts.step = s; };

  NumInput.prototype.disable = function () {
    this.opts.disabled = true;
    this.el.classList.add('vx-disabled');
  };
  NumInput.prototype.enable = function () {
    this.opts.disabled = false;
    this.el.classList.remove('vx-disabled');
  };

  NumInput.prototype.focus = function () { this.input.focus(); this.input.select(); };

  NumInput.prototype.destroy = function () {
    this._listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this._listeners = [];
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = this.input = this.btnDec = this.btnInc = null;
  };

  // API pública
  const API = {
    create: function (opts) { return new NumInput(opts); },
    parseNumber: parseNumber,
    formatCurrency: formatCurrency,
    version: '1.0.0'
  };

  global.NumInput = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
