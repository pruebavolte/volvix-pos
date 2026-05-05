/**
 * volvix-ui-skeleton.js
 * Skeleton loader system para Volvix POS.
 * Expone window.Skeleton con presets (card, list, table, profile),
 * formas custom y animación shimmer.
 *
 * Uso rápido:
 *   Skeleton.card('#contenedor');
 *   Skeleton.list('#lista', { rows: 5 });
 *   Skeleton.table('#tabla', { rows: 8, cols: 4 });
 *   Skeleton.profile('#perfil');
 *   Skeleton.custom('#x', [{w:'100%',h:20},{w:'60%',h:14}]);
 *   Skeleton.clear('#contenedor');
 *   Skeleton.replace('#contenedor', htmlReal);
 */
(function (global) {
  'use strict';

  // ─────────────────────────── ESTILOS ───────────────────────────
  const STYLE_ID = 'volvix-skeleton-styles';
  const CSS = `
    @keyframes vx-skeleton-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    @keyframes vx-skeleton-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }
    .vx-skel-root { display: block; width: 100%; }
    .vx-skel-root * { box-sizing: border-box; }
    .vx-skel {
      display: block;
      background: linear-gradient(
        90deg,
        #e6e8eb 0%,
        #f2f4f7 40%,
        #e6e8eb 80%
      );
      background-size: 800px 100%;
      animation: vx-skeleton-shimmer 1.4s linear infinite;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
    }
    .vx-skel.vx-pulse {
      animation: vx-skeleton-pulse 1.2s ease-in-out infinite;
      background: #e6e8eb;
    }
    .vx-skel-circle { border-radius: 50%; }
    .vx-skel-row    { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .vx-skel-col    { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .vx-skel-card   { padding: 16px; border: 1px solid #eceef1; border-radius: 10px; background: #fff; }
    .vx-skel-stack  { display: flex; flex-direction: column; gap: 10px; }
    .vx-skel-table  { width: 100%; border-collapse: separate; border-spacing: 0 8px; }
    .vx-skel-table td { padding: 4px; }

    @media (prefers-color-scheme: dark) {
      .vx-skel {
        background: linear-gradient(90deg,#2a2d33 0%,#3a3d44 40%,#2a2d33 80%);
        background-size: 800px 100%;
      }
      .vx-skel.vx-pulse { background: #2a2d33; }
      .vx-skel-card { background: #1c1e22; border-color: #2a2d33; }
    }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─────────────────────────── HELPERS ───────────────────────────
  function resolveTarget(target) {
    if (!target) throw new Error('[Skeleton] target requerido');
    if (typeof target === 'string') {
      const el = document.querySelector(target);
      if (!el) throw new Error('[Skeleton] no se encontró: ' + target);
      return el;
    }
    if (target instanceof HTMLElement) return target;
    throw new Error('[Skeleton] target inválido');
  }

  function bar(opts = {}) {
    const d = document.createElement('div');
    d.className = 'vx-skel' + (opts.circle ? ' vx-skel-circle' : '') + (opts.pulse ? ' vx-pulse' : '');
    if (opts.w) d.style.width = typeof opts.w === 'number' ? opts.w + 'px' : opts.w;
    if (opts.h) d.style.height = typeof opts.h === 'number' ? opts.h + 'px' : opts.h;
    if (opts.r) d.style.borderRadius = typeof opts.r === 'number' ? opts.r + 'px' : opts.r;
    if (opts.mb) d.style.marginBottom = typeof opts.mb === 'number' ? opts.mb + 'px' : opts.mb;
    if (opts.style) Object.assign(d.style, opts.style);
    return d;
  }

  function root(extraClass) {
    const r = document.createElement('div');
    r.className = 'vx-skel-root' + (extraClass ? ' ' + extraClass : '');
    r.setAttribute('data-vx-skeleton', '1');
    r.setAttribute('aria-busy', 'true');
    r.setAttribute('aria-live', 'polite');
    return r;
  }

  function mount(target, node) {
    const el = resolveTarget(target);
    injectStyles();
    el.innerHTML = '';
    el.appendChild(node);
    return { el, node, clear: () => clear(el), replace: (html) => replace(el, html) };
  }

  // ─────────────────────────── PRESETS ───────────────────────────
  function card(target, opts = {}) {
    const { lines = 3, image = true, pulse = false } = opts;
    const r = root('vx-skel-card-wrap');
    const card = document.createElement('div');
    card.className = 'vx-skel-card';
    if (image) card.appendChild(bar({ w: '100%', h: 160, r: 8, mb: 14, pulse }));
    const stack = document.createElement('div');
    stack.className = 'vx-skel-stack';
    stack.appendChild(bar({ w: '70%', h: 18, pulse }));
    for (let i = 0; i < lines; i++) {
      stack.appendChild(bar({ w: (90 - i * 12) + '%', h: 12, pulse }));
    }
    card.appendChild(stack);
    r.appendChild(card);
    return mount(target, r);
  }

  function list(target, opts = {}) {
    const { rows = 4, avatar = true, pulse = false } = opts;
    const r = root();
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('div');
      row.className = 'vx-skel-row';
      if (avatar) row.appendChild(bar({ w: 40, h: 40, circle: true, pulse }));
      const col = document.createElement('div');
      col.className = 'vx-skel-col';
      col.appendChild(bar({ w: '55%', h: 14, pulse }));
      col.appendChild(bar({ w: '85%', h: 10, pulse }));
      row.appendChild(col);
      r.appendChild(row);
    }
    return mount(target, r);
  }

  function table(target, opts = {}) {
    const { rows = 6, cols = 4, header = true, pulse = false } = opts;
    const r = root();
    const tbl = document.createElement('table');
    tbl.className = 'vx-skel-table';
    const totalRows = header ? rows + 1 : rows;
    for (let i = 0; i < totalRows; i++) {
      const tr = document.createElement('tr');
      for (let j = 0; j < cols; j++) {
        const td = document.createElement('td');
        const isHead = header && i === 0;
        td.appendChild(bar({
          w: isHead ? '60%' : (40 + Math.floor(Math.random() * 50)) + '%',
          h: isHead ? 14 : 12,
          pulse
        }));
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    r.appendChild(tbl);
    return mount(target, r);
  }

  function profile(target, opts = {}) {
    const { pulse = false } = opts;
    const r = root();
    const top = document.createElement('div');
    top.className = 'vx-skel-row';
    top.style.marginBottom = '20px';
    top.appendChild(bar({ w: 80, h: 80, circle: true, pulse }));
    const col = document.createElement('div');
    col.className = 'vx-skel-col';
    col.appendChild(bar({ w: '40%', h: 20, pulse }));
    col.appendChild(bar({ w: '60%', h: 12, pulse }));
    col.appendChild(bar({ w: '30%', h: 12, pulse }));
    top.appendChild(col);
    r.appendChild(top);

    const stats = document.createElement('div');
    stats.style.display = 'flex';
    stats.style.gap = '12px';
    stats.style.marginBottom = '20px';
    for (let i = 0; i < 3; i++) {
      const box = document.createElement('div');
      box.style.flex = '1';
      box.appendChild(bar({ w: '100%', h: 60, r: 8, pulse }));
      stats.appendChild(box);
    }
    r.appendChild(stats);

    const stack = document.createElement('div');
    stack.className = 'vx-skel-stack';
    for (let i = 0; i < 5; i++) {
      stack.appendChild(bar({ w: (95 - i * 8) + '%', h: 12, pulse }));
    }
    r.appendChild(stack);
    return mount(target, r);
  }

  function custom(target, shapes = []) {
    const r = root();
    shapes.forEach((s) => r.appendChild(bar(s)));
    return mount(target, r);
  }

  // ─────────────────────────── CONTROL ───────────────────────────
  function clear(target) {
    const el = resolveTarget(target);
    el.innerHTML = '';
    el.removeAttribute('aria-busy');
    return el;
  }

  function replace(target, html) {
    const el = resolveTarget(target);
    if (typeof html === 'string') el.innerHTML = html;
    else if (html instanceof HTMLElement) {
      el.innerHTML = '';
      el.appendChild(html);
    }
    el.removeAttribute('aria-busy');
    return el;
  }

  function isActive(target) {
    try {
      const el = resolveTarget(target);
      return !!el.querySelector('[data-vx-skeleton]');
    } catch (_) {
      return false;
    }
  }

  // ─────────────────────────── API ───────────────────────────
  const Skeleton = {
    version: '1.0.0',
    card,
    list,
    table,
    profile,
    custom,
    clear,
    replace,
    isActive,
    _bar: bar,
    _injectStyles: injectStyles
  };

  global.Skeleton = Skeleton;
  if (typeof module !== 'undefined' && module.exports) module.exports = Skeleton;
})(typeof window !== 'undefined' ? window : this);
