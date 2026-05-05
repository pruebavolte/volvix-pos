/**
 * volvix-ui-colorpicker.js
 * UI Component: Color Picker with HSL/RGB/HEX, swatches, eyedropper, recent colors.
 * Exposes: window.ColorPicker
 */
(function (global) {
  'use strict';

  const DEFAULT_SWATCHES = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
    '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
    '#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47',
    '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'
  ];

  const RECENT_KEY = 'volvix.colorpicker.recent';
  const RECENT_MAX = 16;

  // ───────── Color conversions ─────────
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
    const v = h.length === 3
      ? h.split('').map(c => c + c).join('')
      : h.padEnd(6, '0').slice(0, 6);
    const num = parseInt(v, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex(r, g, b) {
    const toHex = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  }

  // ───────── Recent colors persistence ─────────
  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
    } catch { return []; }
  }

  function saveRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); }
    catch { /* ignore */ }
  }

  function pushRecent(hex) {
    const list = loadRecent().filter(c => c.toLowerCase() !== hex.toLowerCase());
    list.unshift(hex);
    saveRecent(list);
    return list.slice(0, RECENT_MAX);
  }

  // ───────── Styles (injected once) ─────────
  const STYLE_ID = 'volvix-colorpicker-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
.vcp-root{position:fixed;z-index:99999;background:#1e1e1e;color:#eee;border:1px solid #444;border-radius:8px;padding:12px;width:280px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.vcp-preview{width:100%;height:36px;border-radius:4px;border:1px solid #555;margin-bottom:10px;cursor:pointer}
.vcp-row{display:flex;gap:6px;align-items:center;margin-bottom:8px}
.vcp-row label{width:18px;color:#aaa}
.vcp-row input[type=number]{width:48px;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:3px;padding:3px;font-size:11px}
.vcp-row input[type=range]{flex:1}
.vcp-hex{width:100%;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:3px;padding:5px;font-family:monospace;text-transform:uppercase;margin-bottom:8px}
.vcp-swatches{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;margin-bottom:8px}
.vcp-sw{aspect-ratio:1;border:1px solid #333;cursor:pointer;border-radius:2px}
.vcp-sw:hover{border-color:#fff;transform:scale(1.15)}
.vcp-section-title{color:#888;margin:6px 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.vcp-recent{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-bottom:8px;min-height:22px}
.vcp-actions{display:flex;gap:6px;justify-content:space-between;margin-top:8px}
.vcp-btn{flex:1;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:3px;padding:6px;cursor:pointer;font-size:11px}
.vcp-btn:hover{background:#3a3a3a}
.vcp-btn.primary{background:#0a84ff;border-color:#0a84ff}
.vcp-btn.primary:hover{background:#3a9cff}
.vcp-btn[disabled]{opacity:.4;cursor:not-allowed}
`;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ───────── ColorPicker class ─────────
  class ColorPicker {
    constructor(opts = {}) {
      injectStyles();
      this.opts = opts;
      this.color = opts.initial || '#0a84ff';
      this.onChange = opts.onChange || (() => {});
      this.onSelect = opts.onSelect || (() => {});
      this.recent = loadRecent();
      this._build();
    }

    _build() {
      const root = document.createElement('div');
      root.className = 'vcp-root';
      root.innerHTML = `
        <div class="vcp-preview" data-vcp="preview"></div>
        <input class="vcp-hex" data-vcp="hex" maxlength="7" />
        <div class="vcp-row"><label>R</label><input type="range" min="0" max="255" data-vcp="r-range"><input type="number" min="0" max="255" data-vcp="r-num"></div>
        <div class="vcp-row"><label>G</label><input type="range" min="0" max="255" data-vcp="g-range"><input type="number" min="0" max="255" data-vcp="g-num"></div>
        <div class="vcp-row"><label>B</label><input type="range" min="0" max="255" data-vcp="b-range"><input type="number" min="0" max="255" data-vcp="b-num"></div>
        <div class="vcp-row"><label>H</label><input type="range" min="0" max="360" data-vcp="h-range"><input type="number" min="0" max="360" data-vcp="h-num"></div>
        <div class="vcp-row"><label>S</label><input type="range" min="0" max="100" data-vcp="s-range"><input type="number" min="0" max="100" data-vcp="s-num"></div>
        <div class="vcp-row"><label>L</label><input type="range" min="0" max="100" data-vcp="l-range"><input type="number" min="0" max="100" data-vcp="l-num"></div>
        <div class="vcp-section-title">Swatches</div>
        <div class="vcp-swatches" data-vcp="swatches"></div>
        <div class="vcp-section-title">Recent</div>
        <div class="vcp-recent" data-vcp="recent"></div>
        <div class="vcp-actions">
          <button class="vcp-btn" data-vcp="eyedropper">Eyedropper</button>
          <button class="vcp-btn" data-vcp="cancel">Cancel</button>
          <button class="vcp-btn primary" data-vcp="ok">OK</button>
        </div>
      `;
      this.root = root;
      this.el = sel => root.querySelector(`[data-vcp="${sel}"]`);

      // swatches
      const swWrap = this.el('swatches');
      DEFAULT_SWATCHES.forEach(c => {
        const d = document.createElement('div');
        d.className = 'vcp-sw';
        d.style.background = c;
        d.title = c;
        d.addEventListener('click', () => this.setColor(c));
        swWrap.appendChild(d);
      });

      this._renderRecent();

      // eyedropper availability
      const eyeBtn = this.el('eyedropper');
      if (!('EyeDropper' in global)) eyeBtn.disabled = true;
      eyeBtn.addEventListener('click', () => this._eyedrop());

      // input bindings
      this.el('hex').addEventListener('input', e => {
        const v = e.target.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) this.setColor(v.startsWith('#') ? v : '#' + v, 'hex');
      });
      ['r', 'g', 'b'].forEach(k => {
        const r = this.el(k + '-range'), n = this.el(k + '-num');
        const sync = src => {
          const v = clamp(parseInt(src.value || '0', 10), 0, 255);
          const cur = hexToRgb(this.color);
          cur[k] = v;
          this.setColor(rgbToHex(cur.r, cur.g, cur.b), 'rgb');
        };
        r.addEventListener('input', () => sync(r));
        n.addEventListener('input', () => sync(n));
      });
      ['h', 's', 'l'].forEach(k => {
        const r = this.el(k + '-range'), n = this.el(k + '-num');
        const sync = src => {
          const cur = rgbToHsl(...Object.values(hexToRgb(this.color)));
          cur[k] = parseInt(src.value || '0', 10);
          const rgb = hslToRgb(cur.h, cur.s, cur.l);
          this.setColor(rgbToHex(rgb.r, rgb.g, rgb.b), 'hsl');
        };
        r.addEventListener('input', () => sync(r));
        n.addEventListener('input', () => sync(n));
      });

      this.el('cancel').addEventListener('click', () => this.close(null));
      this.el('ok').addEventListener('click', () => this.close(this.color));

      this._refresh();
    }

    _renderRecent() {
      const wrap = this.el('recent');
      wrap.innerHTML = '';
      this.recent.forEach(c => {
        const d = document.createElement('div');
        d.className = 'vcp-sw';
        d.style.background = c;
        d.title = c;
        d.addEventListener('click', () => this.setColor(c));
        wrap.appendChild(d);
      });
    }

    async _eyedrop() {
      if (!('EyeDropper' in global)) return;
      try {
        const res = await new global.EyeDropper().open();
        if (res && res.sRGBHex) this.setColor(res.sRGBHex);
      } catch { /* user canceled */ }
    }

    setColor(hex, source) {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      this.color = hex.toLowerCase();
      this._refresh(source);
      this.onChange(this.color);
    }

    _refresh(source) {
      const { r, g, b } = hexToRgb(this.color);
      const { h, s, l } = rgbToHsl(r, g, b);
      this.el('preview').style.background = this.color;
      if (source !== 'hex') this.el('hex').value = this.color.toUpperCase();
      const set = (k, v) => { this.el(k + '-range').value = v; this.el(k + '-num').value = v; };
      if (source !== 'rgb') { set('r', r); set('g', g); set('b', b); }
      if (source !== 'hsl') { set('h', h); set('s', s); set('l', l); }
    }

    mount(parent) {
      (parent || document.body).appendChild(this.root);
      return this;
    }

    positionAt(x, y) {
      this.root.style.left = x + 'px';
      this.root.style.top = y + 'px';
      return this;
    }

    close(value) {
      if (value) {
        this.recent = pushRecent(value);
        this.onSelect(value);
      }
      if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }

    static open(opts = {}) {
      return new Promise(resolve => {
        const cp = new ColorPicker({
          ...opts,
          onSelect: c => { opts.onSelect && opts.onSelect(c); resolve(c); }
        });
        cp.mount(opts.parent);
        if (opts.x != null && opts.y != null) cp.positionAt(opts.x, opts.y);
        const origClose = cp.close.bind(cp);
        cp.close = v => { origClose(v); if (!v) resolve(null); };
      });
    }
  }

  global.ColorPicker = ColorPicker;
})(typeof window !== 'undefined' ? window : this);
