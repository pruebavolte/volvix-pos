/**
 * volvix-ui-progress.js
 * UI Progress bars: linear, circular, indeterminate, segments, animated.
 * Exposes window.Progress
 *
 * Usage:
 *   const p = Progress.linear({ container: '#x', value: 0, max: 100, label: 'Loading' });
 *   p.set(45); p.increment(5); p.complete(); p.destroy();
 *
 *   const c = Progress.circular({ container: '#y', value: 30, size: 120 });
 *   const i = Progress.indeterminate({ container: '#z', type: 'linear' });
 *   const s = Progress.segments({ container: '#w', segments: 5, value: 2 });
 */
(function (global) {
  'use strict';

  // ---------- Style injection ----------
  const STYLE_ID = 'volvix-progress-styles';
  const CSS = `
  .vx-pg{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#222;box-sizing:border-box}
  .vx-pg *,.vx-pg *::before,.vx-pg *::after{box-sizing:border-box}
  .vx-pg-label{font-size:12px;display:flex;justify-content:space-between;margin-bottom:4px;color:#444}
  .vx-pg-label .vx-pg-pct{font-variant-numeric:tabular-nums;font-weight:600}

  /* Linear */
  .vx-pg-linear{width:100%;height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;position:relative}
  .vx-pg-linear .vx-pg-fill{height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:inherit;transition:width .35s cubic-bezier(.4,0,.2,1)}
  .vx-pg-linear.vx-pg-success .vx-pg-fill{background:linear-gradient(90deg,#10b981,#22c55e)}
  .vx-pg-linear.vx-pg-warn .vx-pg-fill{background:linear-gradient(90deg,#f59e0b,#f97316)}
  .vx-pg-linear.vx-pg-error .vx-pg-fill{background:linear-gradient(90deg,#ef4444,#dc2626)}

  /* Striped + animated */
  .vx-pg-striped .vx-pg-fill{background-image:linear-gradient(45deg,rgba(255,255,255,.2) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.2) 50%,rgba(255,255,255,.2) 75%,transparent 75%,transparent);background-size:1rem 1rem}
  .vx-pg-animated .vx-pg-fill{animation:vx-pg-stripes 1s linear infinite}
  @keyframes vx-pg-stripes{from{background-position:1rem 0}to{background-position:0 0}}

  /* Indeterminate linear */
  .vx-pg-indeterminate .vx-pg-fill{width:40% !important;animation:vx-pg-indet 1.4s ease-in-out infinite;background:linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)}
  @keyframes vx-pg-indet{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}

  /* Circular */
  .vx-pg-circular{position:relative;display:inline-block;line-height:0}
  .vx-pg-circular svg{transform:rotate(-90deg);display:block}
  .vx-pg-circular .vx-pg-track{stroke:#e5e7eb;fill:none}
  .vx-pg-circular .vx-pg-bar{stroke:#3b82f6;fill:none;stroke-linecap:round;transition:stroke-dashoffset .35s cubic-bezier(.4,0,.2,1)}
  .vx-pg-circular .vx-pg-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;line-height:1;color:#222}
  .vx-pg-circular.vx-pg-success .vx-pg-bar{stroke:#10b981}
  .vx-pg-circular.vx-pg-warn .vx-pg-bar{stroke:#f59e0b}
  .vx-pg-circular.vx-pg-error .vx-pg-bar{stroke:#ef4444}
  .vx-pg-circular.vx-pg-indet svg{animation:vx-pg-spin 1.2s linear infinite}
  .vx-pg-circular.vx-pg-indet .vx-pg-bar{animation:vx-pg-dash 1.6s ease-in-out infinite}
  @keyframes vx-pg-spin{to{transform:rotate(270deg)}}
  @keyframes vx-pg-dash{0%{stroke-dasharray:1,200;stroke-dashoffset:0}50%{stroke-dasharray:90,200;stroke-dashoffset:-35}100%{stroke-dasharray:90,200;stroke-dashoffset:-125}}

  /* Segments */
  .vx-pg-segments{display:flex;gap:4px;width:100%}
  .vx-pg-segments .vx-pg-seg{flex:1;height:8px;background:#e5e7eb;border-radius:4px;transition:background .25s ease}
  .vx-pg-segments .vx-pg-seg.on{background:linear-gradient(90deg,#3b82f6,#6366f1)}
  .vx-pg-segments.vx-pg-success .vx-pg-seg.on{background:#10b981}
  .vx-pg-segments.vx-pg-warn .vx-pg-seg.on{background:#f59e0b}
  .vx-pg-segments.vx-pg-error .vx-pg-seg.on{background:#ef4444}
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Helpers ----------
  function resolveContainer(c) {
    if (!c) return document.body;
    if (typeof c === 'string') {
      const el = document.querySelector(c);
      if (!el) throw new Error('Progress: container not found ' + c);
      return el;
    }
    return c;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function pct(v, max) { return max <= 0 ? 0 : clamp((v / max) * 100, 0, 100); }
  function applyStatus(el, status) {
    el.classList.remove('vx-pg-success', 'vx-pg-warn', 'vx-pg-error');
    if (status) el.classList.add('vx-pg-' + status);
  }

  // ---------- Linear ----------
  function linear(opts = {}) {
    injectStyles();
    const container = resolveContainer(opts.container);
    const max = opts.max ?? 100;
    let value = clamp(opts.value ?? 0, 0, max);

    const wrap = document.createElement('div');
    wrap.className = 'vx-pg';

    let labelEl = null, pctEl = null;
    if (opts.label || opts.showPercent !== false) {
      labelEl = document.createElement('div');
      labelEl.className = 'vx-pg-label';
      const txt = document.createElement('span');
      txt.textContent = opts.label || '';
      pctEl = document.createElement('span');
      pctEl.className = 'vx-pg-pct';
      labelEl.appendChild(txt);
      labelEl.appendChild(pctEl);
      wrap.appendChild(labelEl);
    }

    const bar = document.createElement('div');
    bar.className = 'vx-pg-linear';
    if (opts.striped) bar.classList.add('vx-pg-striped');
    if (opts.animated) bar.classList.add('vx-pg-animated');
    if (opts.status) applyStatus(bar, opts.status);

    const fill = document.createElement('div');
    fill.className = 'vx-pg-fill';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    container.appendChild(wrap);

    function render() {
      const p = pct(value, max);
      fill.style.width = p.toFixed(2) + '%';
      if (pctEl) pctEl.textContent = Math.round(p) + '%';
      if (typeof opts.onChange === 'function') opts.onChange(value, max);
    }
    render();

    return {
      el: wrap,
      set(v) { value = clamp(v, 0, max); render(); return this; },
      increment(d = 1) { return this.set(value + d); },
      get() { return value; },
      max() { return max; },
      status(s) { applyStatus(bar, s); return this; },
      label(t) { if (labelEl) labelEl.firstChild.textContent = t; return this; },
      complete() { this.set(max); applyStatus(bar, 'success'); return this; },
      fail() { applyStatus(bar, 'error'); return this; },
      destroy() { wrap.remove(); }
    };
  }

  // ---------- Circular ----------
  function circular(opts = {}) {
    injectStyles();
    const container = resolveContainer(opts.container);
    const size = opts.size ?? 100;
    const stroke = opts.stroke ?? 8;
    const max = opts.max ?? 100;
    let value = clamp(opts.value ?? 0, 0, max);
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;

    const wrap = document.createElement('div');
    wrap.className = 'vx-pg vx-pg-circular';
    wrap.style.width = size + 'px';
    wrap.style.height = size + 'px';
    if (opts.status) applyStatus(wrap, opts.status);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('class', 'vx-pg-track');
    track.setAttribute('cx', size / 2);
    track.setAttribute('cy', size / 2);
    track.setAttribute('r', r);
    track.setAttribute('stroke-width', stroke);

    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bar.setAttribute('class', 'vx-pg-bar');
    bar.setAttribute('cx', size / 2);
    bar.setAttribute('cy', size / 2);
    bar.setAttribute('r', r);
    bar.setAttribute('stroke-width', stroke);
    bar.setAttribute('stroke-dasharray', circ.toFixed(3));

    svg.appendChild(track);
    svg.appendChild(bar);
    wrap.appendChild(svg);

    const txt = document.createElement('div');
    txt.className = 'vx-pg-text';
    if (opts.showPercent === false) txt.style.display = 'none';
    wrap.appendChild(txt);

    container.appendChild(wrap);

    function render() {
      const p = pct(value, max);
      const offset = circ * (1 - p / 100);
      bar.setAttribute('stroke-dashoffset', offset.toFixed(3));
      txt.textContent = (opts.text != null) ? opts.text : Math.round(p) + '%';
      if (typeof opts.onChange === 'function') opts.onChange(value, max);
    }
    render();

    return {
      el: wrap,
      set(v) { value = clamp(v, 0, max); render(); return this; },
      increment(d = 1) { return this.set(value + d); },
      get() { return value; },
      status(s) { applyStatus(wrap, s); return this; },
      text(t) { opts.text = t; render(); return this; },
      complete() { this.set(max); applyStatus(wrap, 'success'); return this; },
      fail() { applyStatus(wrap, 'error'); return this; },
      destroy() { wrap.remove(); }
    };
  }

  // ---------- Indeterminate ----------
  function indeterminate(opts = {}) {
    injectStyles();
    const type = opts.type || 'linear';
    if (type === 'circular') {
      const inst = circular({ ...opts, value: 25 });
      inst.el.classList.add('vx-pg-indet');
      return inst;
    }
    const inst = linear({ ...opts, value: 0 });
    const bar = inst.el.querySelector('.vx-pg-linear');
    bar.classList.add('vx-pg-indeterminate');
    const pctEl = inst.el.querySelector('.vx-pg-pct');
    if (pctEl) pctEl.textContent = '';
    inst.stop = function (finalValue) {
      bar.classList.remove('vx-pg-indeterminate');
      this.set(finalValue ?? 100);
      return this;
    };
    return inst;
  }

  // ---------- Segments ----------
  function segments(opts = {}) {
    injectStyles();
    const container = resolveContainer(opts.container);
    const total = Math.max(1, opts.segments ?? 5);
    let value = clamp(opts.value ?? 0, 0, total);

    const wrap = document.createElement('div');
    wrap.className = 'vx-pg';

    let labelEl = null, pctEl = null;
    if (opts.label || opts.showPercent) {
      labelEl = document.createElement('div');
      labelEl.className = 'vx-pg-label';
      const t = document.createElement('span');
      t.textContent = opts.label || '';
      pctEl = document.createElement('span');
      pctEl.className = 'vx-pg-pct';
      labelEl.appendChild(t);
      labelEl.appendChild(pctEl);
      wrap.appendChild(labelEl);
    }

    const segWrap = document.createElement('div');
    segWrap.className = 'vx-pg-segments';
    if (opts.status) applyStatus(segWrap, opts.status);

    const segs = [];
    for (let i = 0; i < total; i++) {
      const s = document.createElement('div');
      s.className = 'vx-pg-seg';
      segWrap.appendChild(s);
      segs.push(s);
    }
    wrap.appendChild(segWrap);
    container.appendChild(wrap);

    function render() {
      segs.forEach((s, i) => s.classList.toggle('on', i < value));
      if (pctEl) pctEl.textContent = value + '/' + total;
      if (typeof opts.onChange === 'function') opts.onChange(value, total);
    }
    render();

    return {
      el: wrap,
      set(v) { value = clamp(Math.round(v), 0, total); render(); return this; },
      next() { return this.set(value + 1); },
      prev() { return this.set(value - 1); },
      get() { return value; },
      total() { return total; },
      status(s) { applyStatus(segWrap, s); return this; },
      complete() { this.set(total); applyStatus(segWrap, 'success'); return this; },
      fail() { applyStatus(segWrap, 'error'); return this; },
      destroy() { wrap.remove(); }
    };
  }

  // ---------- Animated runner ----------
  function animate(instance, { from = 0, to = 100, duration = 1500, easing } = {}) {
    const ease = easing || (t => 1 - Math.pow(1 - t, 3));
    const start = performance.now();
    return new Promise(resolve => {
      function tick(now) {
        const t = clamp((now - start) / duration, 0, 1);
        const v = from + (to - from) * ease(t);
        instance.set(v);
        if (t < 1) requestAnimationFrame(tick);
        else resolve(instance);
      }
      requestAnimationFrame(tick);
    });
  }

  const Progress = { linear, circular, indeterminate, segments, animate, _injectStyles: injectStyles };
  global.Progress = Progress;
  if (typeof module !== 'undefined' && module.exports) module.exports = Progress;
})(typeof window !== 'undefined' ? window : this);
