/* volvix-ui-spinner.js - UI Spinners Loading Library
 * 10 estilos: dots, bars, ring, pulse, wave, circle, square, cube, grid, ripple
 * Tamaños: xs, sm, md, lg, xl
 * Colores configurables, fullscreen overlay
 * window.Spinner
 */
(function (global) {
  'use strict';

  const STYLES = ['dots', 'bars', 'ring', 'pulse', 'wave', 'circle', 'square', 'cube', 'grid', 'ripple'];
  const SIZES = { xs: 16, sm: 24, md: 40, lg: 64, xl: 96 };
  const DEFAULT_COLOR = '#3b82f6';

  let cssInjected = false;

  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const css = `
.vsp-root{display:inline-block;position:relative;line-height:0}
.vsp-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999}
.vsp-overlay-light{background:rgba(255,255,255,0.7)}
@keyframes vsp-spin{to{transform:rotate(360deg)}}
@keyframes vsp-pulse{0%,100%{transform:scale(0.6);opacity:0.4}50%{transform:scale(1);opacity:1}}
@keyframes vsp-bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
@keyframes vsp-bar{0%,40%,100%{transform:scaleY(0.4)}20%{transform:scaleY(1)}}
@keyframes vsp-wave{0%,40%,100%{transform:translateY(0)}20%{transform:translateY(-100%)}}
@keyframes vsp-ripple{0%{top:50%;left:50%;width:0;height:0;opacity:1}100%{top:0;left:0;width:100%;height:100%;opacity:0}}
@keyframes vsp-cube{0%,70%,100%{transform:scale3D(1,1,1)}35%{transform:scale3D(0,0,1)}}
@keyframes vsp-grid{0%,70%,100%{transform:scale3D(1,1,1);opacity:1}35%{transform:scale3D(0,0,1);opacity:0.3}}
@keyframes vsp-square{0%{transform:rotate(0)}25%{transform:rotate(180deg)}50%{transform:rotate(180deg)}75%{transform:rotate(360deg)}100%{transform:rotate(360deg)}}

.vsp-ring{display:inline-block;border-style:solid;border-radius:50%;border-color:currentColor transparent transparent transparent;animation:vsp-spin 1s linear infinite}
.vsp-circle{display:inline-block;border-style:solid;border-radius:50%;border-color:currentColor;border-top-color:transparent;animation:vsp-spin 0.8s linear infinite}
.vsp-pulse{display:inline-block;background:currentColor;border-radius:50%;animation:vsp-pulse 1s ease-in-out infinite}
.vsp-dots{display:inline-flex;gap:25%}
.vsp-dots>span{display:block;width:25%;background:currentColor;border-radius:50%;animation:vsp-bounce 1.4s ease-in-out infinite both}
.vsp-dots>span:nth-child(1){animation-delay:-0.32s}
.vsp-dots>span:nth-child(2){animation-delay:-0.16s}
.vsp-bars{display:inline-flex;gap:15%;align-items:center}
.vsp-bars>span{display:block;width:15%;height:100%;background:currentColor;animation:vsp-bar 1.2s ease-in-out infinite}
.vsp-bars>span:nth-child(2){animation-delay:-1.0s}
.vsp-bars>span:nth-child(3){animation-delay:-0.9s}
.vsp-bars>span:nth-child(4){animation-delay:-0.8s}
.vsp-bars>span:nth-child(5){animation-delay:-0.7s}
.vsp-wave{display:inline-flex;gap:10%;align-items:flex-end;overflow:hidden}
.vsp-wave>span{display:block;width:20%;height:100%;background:currentColor;border-radius:50%;animation:vsp-wave 1.2s ease-in-out infinite}
.vsp-wave>span:nth-child(2){animation-delay:0.1s}
.vsp-wave>span:nth-child(3){animation-delay:0.2s}
.vsp-wave>span:nth-child(4){animation-delay:0.3s}
.vsp-square{display:inline-block;background:currentColor;animation:vsp-square 2s infinite}
.vsp-cube{display:inline-block;background:currentColor;animation:vsp-cube 1.2s infinite ease-in-out}
.vsp-grid{display:inline-grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:5%}
.vsp-grid>span{background:currentColor;animation:vsp-grid 1.3s infinite ease-in-out}
.vsp-grid>span:nth-child(1){animation-delay:0.2s}
.vsp-grid>span:nth-child(2){animation-delay:0.3s}
.vsp-grid>span:nth-child(3){animation-delay:0.4s}
.vsp-grid>span:nth-child(4){animation-delay:0.1s}
.vsp-grid>span:nth-child(5){animation-delay:0.2s}
.vsp-grid>span:nth-child(6){animation-delay:0.3s}
.vsp-grid>span:nth-child(7){animation-delay:0.0s}
.vsp-grid>span:nth-child(8){animation-delay:0.1s}
.vsp-grid>span:nth-child(9){animation-delay:0.2s}
.vsp-ripple{display:inline-block;position:relative}
.vsp-ripple>span{position:absolute;border:4px solid currentColor;opacity:1;border-radius:50%;animation:vsp-ripple 1s cubic-bezier(0,0.2,0.8,1) infinite}
.vsp-ripple>span:nth-child(2){animation-delay:-0.5s}
.vsp-label{display:block;margin-top:8px;text-align:center;font:13px sans-serif;color:inherit}
`;
    const style = document.createElement('style');
    style.id = 'vsp-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function resolveSize(size) {
    if (typeof size === 'number') return size;
    return SIZES[size] || SIZES.md;
  }

  function buildSpinner(opts) {
    const o = opts || {};
    const style = STYLES.includes(o.style) ? o.style : 'ring';
    const px = resolveSize(o.size);
    const color = o.color || DEFAULT_COLOR;
    const speed = o.speed || null;

    const root = document.createElement('div');
    root.className = 'vsp-root';
    root.style.color = color;

    const el = document.createElement('div');
    el.className = 'vsp-' + style;
    el.style.width = px + 'px';
    el.style.height = px + 'px';
    if (speed) el.style.animationDuration = speed;

    if (style === 'ring' || style === 'circle') {
      el.style.borderWidth = Math.max(2, Math.round(px / 10)) + 'px';
    }

    const childCounts = { dots: 3, bars: 5, wave: 4, grid: 9, ripple: 2 };
    if (childCounts[style]) {
      for (let i = 0; i < childCounts[style]; i++) {
        el.appendChild(document.createElement('span'));
      }
    }

    root.appendChild(el);

    if (o.label) {
      const lbl = document.createElement('span');
      lbl.className = 'vsp-label';
      lbl.textContent = o.label;
      root.appendChild(lbl);
    }

    return root;
  }

  function create(opts) {
    injectCSS();
    return buildSpinner(opts);
  }

  function mount(target, opts) {
    injectCSS();
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) throw new Error('Spinner.mount: target no encontrado');
    const sp = buildSpinner(opts);
    node.innerHTML = '';
    node.appendChild(sp);
    return {
      element: sp,
      destroy: () => { if (sp.parentNode) sp.parentNode.removeChild(sp); }
    };
  }

  let overlayRef = null;

  function show(opts) {
    injectCSS();
    if (overlayRef) hide();
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'vsp-overlay' + (o.theme === 'light' ? ' vsp-overlay-light' : '');
    const sp = buildSpinner(Object.assign({ size: 'lg' }, o));
    if (o.theme === 'dark' || !o.theme) {
      sp.style.color = o.color || '#ffffff';
      const lbl = sp.querySelector('.vsp-label');
      if (lbl) lbl.style.color = '#ffffff';
    }
    overlay.appendChild(sp);
    document.body.appendChild(overlay);
    overlayRef = overlay;
    return {
      update: (text) => {
        const lbl = overlay.querySelector('.vsp-label');
        if (lbl) lbl.textContent = text;
      },
      hide
    };
  }

  function hide() {
    if (overlayRef && overlayRef.parentNode) {
      overlayRef.parentNode.removeChild(overlayRef);
    }
    overlayRef = null;
  }

  async function withSpinner(promise, opts) {
    const ctrl = show(opts);
    try {
      return await promise;
    } finally {
      ctrl.hide();
    }
  }

  function listStyles() { return STYLES.slice(); }
  function listSizes() { return Object.keys(SIZES); }

  global.Spinner = {
    create,
    mount,
    show,
    hide,
    withSpinner,
    listStyles,
    listSizes,
    STYLES,
    SIZES,
    version: '1.0.0'
  };

  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    injectCSS();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  }
})(typeof window !== 'undefined' ? window : this);
