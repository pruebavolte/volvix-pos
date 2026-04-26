/* volvix-ui-flowchart.js
 * Volvix UI Flowchart Builder
 * Drag-drop shapes, connectors, save/load JSON
 * Exposes: window.FlowChart
 */
(function (global) {
  'use strict';

  const SHAPE_TYPES = {
    rect:     { w: 140, h: 60,  draw: drawRect,    label: 'Process'  },
    diamond:  { w: 140, h: 80,  draw: drawDiamond, label: 'Decision' },
    ellipse:  { w: 140, h: 60,  draw: drawEllipse, label: 'Start/End'},
    parallelogram: { w: 150, h: 60, draw: drawParallelogram, label: 'I/O' },
    circle:   { w: 70,  h: 70,  draw: drawCircle,  label: 'Connector'},
    document: { w: 140, h: 70,  draw: drawDocument,label: 'Document' }
  };

  const COLORS = {
    fill: '#ffffff',
    stroke: '#1f2937',
    selected: '#2563eb',
    hover: '#3b82f6',
    connector: '#374151',
    bg: '#f8fafc',
    grid: '#e5e7eb',
    text: '#111827'
  };

  // ---------- shape drawers ----------
  function drawRect(ctx, s) {
    ctx.beginPath();
    ctx.rect(s.x, s.y, s.w, s.h);
    ctx.fill(); ctx.stroke();
  }
  function drawDiamond(ctx, s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, s.y);
    ctx.lineTo(s.x + s.w, cy);
    ctx.lineTo(cx, s.y + s.h);
    ctx.lineTo(s.x, cy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  function drawEllipse(ctx, s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  function drawParallelogram(ctx, s) {
    const off = 18;
    ctx.beginPath();
    ctx.moveTo(s.x + off, s.y);
    ctx.lineTo(s.x + s.w, s.y);
    ctx.lineTo(s.x + s.w - off, s.y + s.h);
    ctx.lineTo(s.x, s.y + s.h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  function drawCircle(ctx, s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2, r = Math.min(s.w, s.h) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  function drawDocument(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.w, s.y);
    ctx.lineTo(s.x + s.w, s.y + s.h - 14);
    ctx.quadraticCurveTo(s.x + s.w * 0.75, s.y + s.h + 8, s.x + s.w / 2, s.y + s.h - 6);
    ctx.quadraticCurveTo(s.x + s.w * 0.25, s.y + s.h - 20, s.x, s.y + s.h - 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // ---------- helpers ----------
  function uid() { return 'n_' + Math.random().toString(36).slice(2, 10); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function pointInShape(s, px, py) {
    return px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;
  }

  function shapeCenter(s) { return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; }

  // intersection of line from center to point with shape rect (good enough for all shapes)
  function shapeBorderPoint(s, tx, ty) {
    const c = shapeCenter(s);
    const dx = tx - c.x, dy = ty - c.y;
    if (dx === 0 && dy === 0) return c;
    const hw = s.w / 2, hh = s.h / 2;
    const scale = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return { x: c.x + dx * scale, y: c.y + dy * scale };
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---------- FlowChart class ----------
  class FlowChart {
    constructor(opts) {
      opts = opts || {};
      this.container = typeof opts.container === 'string'
        ? document.querySelector(opts.container)
        : opts.container || document.body;

      this.width  = opts.width  || 1000;
      this.height = opts.height || 600;
      this.gridSize = opts.gridSize || 20;
      this.snap = opts.snap !== false;

      this.shapes = [];
      this.connectors = [];
      this.selected = null;
      this.hover = null;
      this.dragging = null;
      this.dragOffset = { x: 0, y: 0 };
      this.connectFrom = null;
      this.tempLine = null;

      this._buildDOM();
      this._bindEvents();
      this.render();
    }

    _buildDOM() {
      const root = document.createElement('div');
      root.className = 'volvix-flowchart';
      root.style.cssText = `display:flex;flex-direction:column;gap:8px;font-family:system-ui,sans-serif;`;

      const toolbar = document.createElement('div');
      toolbar.style.cssText = `display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#f1f5f9;border-radius:6px;`;
      this.toolbar = toolbar;

      Object.keys(SHAPE_TYPES).forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = '+ ' + SHAPE_TYPES[type].label;
        btn.style.cssText = `padding:6px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;`;
        btn.draggable = true;
        btn.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/shape-type', type);
        });
        btn.addEventListener('click', () => this.addShape(type));
        toolbar.appendChild(btn);
      });

      const sep = document.createElement('span');
      sep.style.cssText = 'flex:1';
      toolbar.appendChild(sep);

      ['Connect','Delete','Rename','Save JSON','Load JSON','Export PNG','Clear']
        .forEach(label => {
          const b = document.createElement('button');
          b.textContent = label;
          b.style.cssText = `padding:6px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;`;
          b.addEventListener('click', () => this._toolbarAction(label));
          toolbar.appendChild(b);
        });

      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      canvas.style.cssText = `border:1px solid #cbd5e1;border-radius:6px;background:${COLORS.bg};cursor:default;`;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      root.appendChild(toolbar);
      root.appendChild(canvas);
      this.container.appendChild(root);
      this.root = root;
    }

    _toolbarAction(label) {
      switch (label) {
        case 'Connect':
          if (this.selected) {
            this.connectFrom = this.selected;
            this.canvas.style.cursor = 'crosshair';
          } else alert('Select a shape first');
          break;
        case 'Delete':
          if (this.selected) this.deleteShape(this.selected.id);
          break;
        case 'Rename':
          if (this.selected) {
            const t = prompt('Label:', this.selected.text);
            if (t !== null) { this.selected.text = t; this.render(); }
          }
          break;
        case 'Save JSON': {
          const json = JSON.stringify(this.toJSON(), null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'flowchart.json';
          a.click();
          break;
        }
        case 'Load JSON': {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = '.json,application/json';
          inp.onchange = e => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = () => { try { this.fromJSON(JSON.parse(r.result)); } catch (err) { alert('Invalid JSON'); } };
            r.readAsText(f);
          };
          inp.click();
          break;
        }
        case 'Export PNG': {
          const a = document.createElement('a');
          a.href = this.canvas.toDataURL('image/png');
          a.download = 'flowchart.png';
          a.click();
          break;
        }
        case 'Clear':
          if (confirm('Clear flowchart?')) { this.shapes = []; this.connectors = []; this.selected = null; this.render(); }
          break;
      }
    }

    _bindEvents() {
      const c = this.canvas;
      c.addEventListener('mousedown', e => this._onDown(e));
      c.addEventListener('mousemove', e => this._onMove(e));
      c.addEventListener('mouseup',   e => this._onUp(e));
      c.addEventListener('dblclick',  e => this._onDblClick(e));
      c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRight(e); });

      c.addEventListener('dragover', e => e.preventDefault());
      c.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/shape-type');
        if (!type) return;
        const p = this._mousePos(e);
        this.addShape(type, p.x, p.y);
      });

      window.addEventListener('keydown', e => {
        if (!this.root.isConnected) return;
        if (e.key === 'Delete' && this.selected) this.deleteShape(this.selected.id);
        if (e.key === 'Escape') { this.connectFrom = null; this.tempLine = null; this.canvas.style.cursor = 'default'; this.render(); }
      });
    }

    _mousePos(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _hit(p) {
      for (let i = this.shapes.length - 1; i >= 0; i--) {
        if (pointInShape(this.shapes[i], p.x, p.y)) return this.shapes[i];
      }
      return null;
    }

    _hitConnector(p) {
      for (const c of this.connectors) {
        const a = this.shapes.find(s => s.id === c.from);
        const b = this.shapes.find(s => s.id === c.to);
        if (!a || !b) continue;
        const pa = shapeBorderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const pb = shapeBorderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
        if (this._pointNearLine(p, pa, pb, 6)) return c;
      }
      return null;
    }

    _pointNearLine(p, a, b, tol) {
      const len2 = dist2(a.x, a.y, b.x, b.y) || 1;
      let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
      t = clamp(t, 0, 1);
      const px = a.x + t * (b.x - a.x), py = a.y + t * (b.y - a.y);
      return dist2(p.x, p.y, px, py) <= tol * tol;
    }

    _onDown(e) {
      const p = this._mousePos(e);
      const hit = this._hit(p);
      if (this.connectFrom) {
        if (hit && hit.id !== this.connectFrom.id) {
          this.connect(this.connectFrom.id, hit.id);
        }
        this.connectFrom = null; this.tempLine = null;
        this.canvas.style.cursor = 'default';
        this.render();
        return;
      }
      if (hit) {
        this.selected = hit;
        this.dragging = hit;
        this.dragOffset = { x: p.x - hit.x, y: p.y - hit.y };
      } else {
        this.selected = null;
      }
      this.render();
    }

    _onMove(e) {
      const p = this._mousePos(e);
      if (this.dragging) {
        let nx = p.x - this.dragOffset.x;
        let ny = p.y - this.dragOffset.y;
        if (this.snap) {
          nx = Math.round(nx / this.gridSize) * this.gridSize;
          ny = Math.round(ny / this.gridSize) * this.gridSize;
        }
        this.dragging.x = clamp(nx, 0, this.width  - this.dragging.w);
        this.dragging.y = clamp(ny, 0, this.height - this.dragging.h);
        this.render();
        return;
      }
      if (this.connectFrom) {
        this.tempLine = { from: shapeCenter(this.connectFrom), to: p };
        this.render();
        return;
      }
      this.hover = this._hit(p);
      this.canvas.style.cursor = this.hover ? 'move' : 'default';
    }

    _onUp() { this.dragging = null; }

    _onDblClick(e) {
      const p = this._mousePos(e);
      const hit = this._hit(p);
      if (hit) {
        const t = prompt('Label:', hit.text);
        if (t !== null) { hit.text = t; this.render(); }
      }
    }

    _onRight(e) {
      const p = this._mousePos(e);
      const hit = this._hit(p);
      if (hit) { this.deleteShape(hit.id); return; }
      const conn = this._hitConnector(p);
      if (conn) {
        this.connectors = this.connectors.filter(c => c !== conn);
        this.render();
      }
    }

    // ---------- public API ----------
    addShape(type, x, y) {
      const def = SHAPE_TYPES[type]; if (!def) return null;
      const s = {
        id: uid(),
        type,
        x: (x != null ? x : 60 + this.shapes.length * 20) - def.w / 2 + (x != null ? 0 : def.w / 2),
        y: (y != null ? y : 60 + this.shapes.length * 20) - def.h / 2 + (y != null ? 0 : def.h / 2),
        w: def.w,
        h: def.h,
        text: def.label
      };
      if (this.snap) {
        s.x = Math.round(s.x / this.gridSize) * this.gridSize;
        s.y = Math.round(s.y / this.gridSize) * this.gridSize;
      }
      s.x = clamp(s.x, 0, this.width  - s.w);
      s.y = clamp(s.y, 0, this.height - s.h);
      this.shapes.push(s);
      this.selected = s;
      this.render();
      return s;
    }

    deleteShape(id) {
      this.shapes = this.shapes.filter(s => s.id !== id);
      this.connectors = this.connectors.filter(c => c.from !== id && c.to !== id);
      if (this.selected && this.selected.id === id) this.selected = null;
      this.render();
    }

    connect(fromId, toId, label) {
      if (fromId === toId) return null;
      const exists = this.connectors.find(c => c.from === fromId && c.to === toId);
      if (exists) return exists;
      const c = { id: uid(), from: fromId, to: toId, label: label || '' };
      this.connectors.push(c);
      this.render();
      return c;
    }

    toJSON() {
      return {
        version: 1,
        width: this.width,
        height: this.height,
        shapes: this.shapes.map(s => ({ ...s })),
        connectors: this.connectors.map(c => ({ ...c }))
      };
    }

    fromJSON(data) {
      if (!data || !Array.isArray(data.shapes)) throw new Error('Invalid data');
      this.shapes = data.shapes.map(s => ({ ...s }));
      this.connectors = (data.connectors || []).map(c => ({ ...c }));
      this.selected = null;
      if (data.width)  { this.width  = data.width;  this.canvas.width  = data.width; }
      if (data.height) { this.height = data.height; this.canvas.height = data.height; }
      this.render();
    }

    // ---------- rendering ----------
    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // grid
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.width; x += this.gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
      }
      for (let y = 0; y <= this.height; y += this.gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
      }

      // connectors
      for (const c of this.connectors) {
        const a = this.shapes.find(s => s.id === c.from);
        const b = this.shapes.find(s => s.id === c.to);
        if (!a || !b) continue;
        const pa = shapeBorderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const pb = shapeBorderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
        this._drawArrow(pa, pb, c.label);
      }

      // temp line during connect
      if (this.tempLine) {
        ctx.save();
        ctx.strokeStyle = COLORS.hover;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(this.tempLine.from.x, this.tempLine.from.y);
        ctx.lineTo(this.tempLine.to.x, this.tempLine.to.y);
        ctx.stroke();
        ctx.restore();
      }

      // shapes
      for (const s of this.shapes) {
        ctx.save();
        ctx.fillStyle = COLORS.fill;
        ctx.strokeStyle = (this.selected && this.selected.id === s.id)
          ? COLORS.selected
          : (this.hover && this.hover.id === s.id ? COLORS.hover : COLORS.stroke);
        ctx.lineWidth = (this.selected && this.selected.id === s.id) ? 2.5 : 1.5;
        SHAPE_TYPES[s.type].draw(ctx, s);
        ctx.restore();

        // label
        ctx.fillStyle = COLORS.text;
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = wrapText(ctx, s.text, s.w - 16);
        const lh = 16;
        const startY = s.y + s.h / 2 - ((lines.length - 1) * lh) / 2;
        lines.forEach((ln, i) => ctx.fillText(ln, s.x + s.w / 2, startY + i * lh));
      }
    }

    _drawArrow(a, b, label) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.connector;
      ctx.fillStyle = COLORS.connector;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const ah = 10;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ah * Math.cos(angle - Math.PI / 7), b.y - ah * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(b.x - ah * Math.cos(angle + Math.PI / 7), b.y - ah * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();

      if (label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.fillStyle = '#fff';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(label).width + 8;
        ctx.fillRect(mx - w / 2, my - 8, w, 16);
        ctx.strokeStyle = COLORS.connector;
        ctx.strokeRect(mx - w / 2, my - 8, w, 16);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(label, mx, my);
      }
      ctx.restore();
    }
  }

  // ---------- export ----------
  global.FlowChart = {
    create: (opts) => new FlowChart(opts),
    SHAPE_TYPES: Object.keys(SHAPE_TYPES),
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : globalThis);
