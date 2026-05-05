/* volvix-ui-colorwheel.js
 * UI Color Wheel HSL avanzado para Volvix
 * - Rueda interactiva (canvas)
 * - Schemes: monochromatic, complementary, analogous, triadic, tetradic, split-complementary
 * - Copy al portapapeles (HEX / HSL / RGB)
 * Expone: window.ColorWheel
 */
(function (global) {
  'use strict';

  // ───────── Conversión de color ─────────
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)      { r = c; g = x; b = 0; }
    else if (h <120) { r = x; g = c; b = 0; }
    else if (h <180) { r = 0; g = c; b = x; }
    else if (h <240) { r = 0; g = x; b = c; }
    else if (h <300) { r = x; g = 0; b = c; }
    else             { r = c; g = 0; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function hslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  function hslStr(h, s, l)  { return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`; }
  function rgbStr(r, g, b)  { return `rgb(${r}, ${g}, ${b})`; }

  // ───────── Schemes ─────────
  const SCHEMES = {
    monochromatic: (h, s, l) => [
      [h, s, Math.max(10, l - 30)],
      [h, s, Math.max(20, l - 15)],
      [h, s, l],
      [h, s, Math.min(85, l + 15)],
      [h, s, Math.min(95, l + 30)]
    ],
    complementary:        (h, s, l) => [[h, s, l], [(h + 180) % 360, s, l]],
    analogous:            (h, s, l) => [[(h - 30 + 360) % 360, s, l], [h, s, l], [(h + 30) % 360, s, l]],
    triadic:              (h, s, l) => [[h, s, l], [(h + 120) % 360, s, l], [(h + 240) % 360, s, l]],
    tetradic:             (h, s, l) => [[h, s, l], [(h + 90) % 360, s, l], [(h + 180) % 360, s, l], [(h + 270) % 360, s, l]],
    'split-complementary':(h, s, l) => [[h, s, l], [(h + 150) % 360, s, l], [(h + 210) % 360, s, l]]
  };

  // ───────── Clipboard ─────────
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  // ───────── Componente ─────────
  class ColorWheelUI {
    constructor(container, opts = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('ColorWheel: container no encontrado');
      this.size      = opts.size      || 280;
      this.hue       = opts.hue       ?? 0;
      this.sat       = opts.sat       ?? 80;
      this.light     = opts.light     ?? 50;
      this.scheme    = opts.scheme    || 'complementary';
      this.format    = opts.format    || 'hex';
      this.onChange  = opts.onChange  || null;
      this._dragging = false;
      this._render();
      this._draw();
      this._update();
    }

    _render() {
      this.container.innerHTML = `
        <div class="cw-root" style="font-family:system-ui,sans-serif;display:inline-block;padding:12px;background:#1a1a1a;color:#eee;border-radius:12px">
          <canvas class="cw-canvas" width="${this.size}" height="${this.size}" style="cursor:crosshair;display:block;margin:0 auto"></canvas>
          <div class="cw-controls" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;width:${this.size}px">
            <label style="font-size:12px">Saturación: <span class="cw-sat-val">${this.sat}</span>%
              <input type="range" min="0" max="100" value="${this.sat}" class="cw-sat" style="width:100%">
            </label>
            <label style="font-size:12px">Luminosidad: <span class="cw-light-val">${this.light}</span>%
              <input type="range" min="0" max="100" value="${this.light}" class="cw-light" style="width:100%">
            </label>
            <label style="font-size:12px">Esquema:
              <select class="cw-scheme" style="width:100%;background:#222;color:#eee;border:1px solid #444;padding:4px">
                ${Object.keys(SCHEMES).map(k => `<option value="${k}" ${k === this.scheme ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </label>
            <label style="font-size:12px">Formato:
              <select class="cw-format" style="width:100%;background:#222;color:#eee;border:1px solid #444;padding:4px">
                <option value="hex" ${this.format==='hex'?'selected':''}>HEX</option>
                <option value="hsl" ${this.format==='hsl'?'selected':''}>HSL</option>
                <option value="rgb" ${this.format==='rgb'?'selected':''}>RGB</option>
              </select>
            </label>
          </div>
          <div class="cw-swatches" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;width:${this.size}px"></div>
          <button class="cw-copy-all" style="margin-top:10px;width:${this.size}px;padding:8px;background:#0a84ff;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600">Copiar paleta</button>
          <div class="cw-status" style="margin-top:6px;font-size:11px;color:#888;min-height:14px;text-align:center"></div>
        </div>
      `;
      this.canvas    = this.container.querySelector('.cw-canvas');
      this.ctx       = this.canvas.getContext('2d');
      this.satEl     = this.container.querySelector('.cw-sat');
      this.lightEl   = this.container.querySelector('.cw-light');
      this.satVal    = this.container.querySelector('.cw-sat-val');
      this.lightVal  = this.container.querySelector('.cw-light-val');
      this.schemeEl  = this.container.querySelector('.cw-scheme');
      this.formatEl  = this.container.querySelector('.cw-format');
      this.swatchesEl= this.container.querySelector('.cw-swatches');
      this.copyAllEl = this.container.querySelector('.cw-copy-all');
      this.statusEl  = this.container.querySelector('.cw-status');

      this.canvas.addEventListener('mousedown', e => { this._dragging = true; this._pickFromEvent(e); });
      this.canvas.addEventListener('mousemove', e => { if (this._dragging) this._pickFromEvent(e); });
      window.addEventListener('mouseup', () => this._dragging = false);
      this.canvas.addEventListener('touchstart', e => { this._dragging = true; this._pickFromEvent(e.touches[0]); e.preventDefault(); });
      this.canvas.addEventListener('touchmove',  e => { if (this._dragging) { this._pickFromEvent(e.touches[0]); e.preventDefault(); } }, { passive: false });
      window.addEventListener('touchend', () => this._dragging = false);

      this.satEl.addEventListener('input',    () => { this.sat   = +this.satEl.value;   this.satVal.textContent   = this.sat;   this._update(); });
      this.lightEl.addEventListener('input',  () => { this.light = +this.lightEl.value; this.lightVal.textContent = this.light; this._draw(); this._update(); });
      this.schemeEl.addEventListener('change',() => { this.scheme = this.schemeEl.value; this._update(); });
      this.formatEl.addEventListener('change',() => { this.format = this.formatEl.value; this._update(); });
      this.copyAllEl.addEventListener('click',() => this._copyAll());
    }

    _draw() {
      const ctx = this.ctx, size = this.size, r = size / 2;
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - r, dy = y - r;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const i = (y * size + x) * 4;
          if (dist > r) { img.data[i + 3] = 0; continue; }
          let ang = Math.atan2(dy, dx) * 180 / Math.PI;
          if (ang < 0) ang += 360;
          const sat = Math.min(100, (dist / r) * 100);
          const [R, G, B] = hslToRgb(ang, sat, this.light);
          img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      this._drawMarker();
    }

    _drawMarker() {
      const ctx = this.ctx, size = this.size, r = size / 2;
      const rad = (this.sat / 100) * r;
      const a = this.hue * Math.PI / 180;
      const x = r + Math.cos(a) * rad;
      const y = r + Math.sin(a) * rad;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }

    _pickFromEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const r = this.size / 2;
      const dx = x - r, dy = y - r;
      const dist = Math.min(r, Math.sqrt(dx * dx + dy * dy));
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang < 0) ang += 360;
      this.hue = ang;
      this.sat = Math.round((dist / r) * 100);
      this.satEl.value = this.sat;
      this.satVal.textContent = this.sat;
      this._draw();
      this._update();
    }

    _format(h, s, l) {
      if (this.format === 'hsl') return hslStr(h, s, l);
      const [r, g, b] = hslToRgb(h, s, l);
      if (this.format === 'rgb') return rgbStr(r, g, b);
      return rgbToHex(r, g, b);
    }

    _update() {
      this._draw();
      const palette = SCHEMES[this.scheme](this.hue, this.sat, this.light);
      this.palette = palette.map(([h, s, l]) => ({ h, s, l, hex: hslToHex(h, s, l), str: this._format(h, s, l) }));
      this.swatchesEl.innerHTML = '';
      this.palette.forEach(c => {
        const sw = document.createElement('div');
        sw.title = 'Click para copiar ' + c.str;
        sw.style.cssText = `flex:1;min-width:40px;height:50px;background:${c.hex};border-radius:6px;cursor:pointer;border:2px solid #333;display:flex;align-items:flex-end;justify-content:center;font-size:9px;color:#000;text-shadow:0 0 2px #fff;padding-bottom:2px;font-weight:600`;
        sw.textContent = c.str;
        sw.addEventListener('click', () => {
          copyToClipboard(c.str).then(ok => this._status(ok ? 'Copiado: ' + c.str : 'Error al copiar'));
        });
        this.swatchesEl.appendChild(sw);
      });
      if (typeof this.onChange === 'function') {
        this.onChange({ hue: this.hue, sat: this.sat, light: this.light, scheme: this.scheme, palette: this.palette });
      }
    }

    _copyAll() {
      const txt = this.palette.map(c => c.str).join('\n');
      copyToClipboard(txt).then(ok => this._status(ok ? `Copiada paleta (${this.palette.length} colores)` : 'Error al copiar'));
    }

    _status(msg) {
      this.statusEl.textContent = msg;
      clearTimeout(this._st);
      this._st = setTimeout(() => this.statusEl.textContent = '', 2000);
    }

    // API pública
    getPalette()    { return this.palette.slice(); }
    setHue(h)       { this.hue = ((h % 360) + 360) % 360; this._update(); }
    setScheme(s)    { if (SCHEMES[s]) { this.scheme = s; this.schemeEl.value = s; this._update(); } }
    setFormat(f)    { if (['hex','hsl','rgb'].includes(f)) { this.format = f; this.formatEl.value = f; this._update(); } }
    destroy()       { this.container.innerHTML = ''; }
  }

  global.ColorWheel = {
    create: (container, opts) => new ColorWheelUI(container, opts),
    schemes: Object.keys(SCHEMES),
    utils: { hslToRgb, hslToHex, rgbToHex, hslStr, rgbStr, copyToClipboard },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : this);
