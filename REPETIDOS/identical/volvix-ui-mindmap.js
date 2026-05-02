/**
 * volvix-ui-mindmap.js
 * Mind Map UI: central node + branches, drag, colors, export PNG.
 * Exposes: window.MindMap
 *
 * Usage:
 *   const mm = MindMap.create({ container: '#mm', root: 'Volvix' });
 *   mm.addNode(rootId, 'Branch 1');
 *   mm.exportPNG('mindmap.png');
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  //  Constants & palette
  // ─────────────────────────────────────────────────────────────────
  const PALETTE = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#F4D03F', '#AF7AC5', '#48C9B0'
  ];
  const ROOT_COLOR  = '#2C3E50';
  const TEXT_COLOR  = '#FFFFFF';
  const EDGE_COLOR  = '#7F8C8D';
  const BG_COLOR    = '#FAFAFA';

  const NODE_W      = 140;
  const NODE_H      = 44;
  const NODE_RADIUS = 22;
  const ROOT_W      = 180;
  const ROOT_H      = 60;
  const FONT        = '14px system-ui, -apple-system, sans-serif';

  let _uid = 1;
  const uid = () => 'n' + (_uid++);

  // ─────────────────────────────────────────────────────────────────
  //  MindMap class
  // ─────────────────────────────────────────────────────────────────
  class MindMap {
    constructor(opts) {
      opts = opts || {};
      const cont = typeof opts.container === 'string'
        ? document.querySelector(opts.container)
        : opts.container;
      if (!cont) throw new Error('MindMap: container not found');

      this.container = cont;
      this.width  = opts.width  || cont.clientWidth  || 800;
      this.height = opts.height || cont.clientHeight || 600;

      this.nodes  = new Map();   // id -> node
      this.edges  = [];          // [{from, to}]
      this.rootId = null;
      this.selectedId = null;
      this.colorIdx = 0;

      this._dragging = null;
      this._dragOff  = { x: 0, y: 0 };
      this._onChange = opts.onChange || null;

      this._buildDOM();
      this._bindEvents();

      const rootLabel = opts.root || 'Root';
      this.rootId = this._addNodeRaw({
        label: rootLabel,
        x: this.width / 2,
        y: this.height / 2,
        color: ROOT_COLOR,
        isRoot: true
      });
      this.render();
    }

    // ── DOM ──────────────────────────────────────────────────────
    _buildDOM() {
      this.container.style.position = this.container.style.position || 'relative';
      this.container.style.background = BG_COLOR;
      this.container.style.overflow = 'hidden';
      this.container.style.userSelect = 'none';

      const c = document.createElement('canvas');
      c.width  = this.width;
      c.height = this.height;
      c.style.display = 'block';
      c.style.cursor  = 'default';
      this.container.innerHTML = '';
      this.container.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');

      // Toolbar
      const tb = document.createElement('div');
      tb.style.cssText =
        'position:absolute;top:8px;left:8px;display:flex;gap:6px;' +
        'font:13px system-ui;z-index:10;';
      tb.innerHTML = `
        <button data-act="add">+ Branch</button>
        <button data-act="del">- Delete</button>
        <button data-act="rename">Rename</button>
        <button data-act="color">Color</button>
        <button data-act="export">Export PNG</button>
      `;
      tb.querySelectorAll('button').forEach(b => {
        b.style.cssText =
          'padding:6px 10px;border:1px solid #ccc;background:#fff;' +
          'border-radius:6px;cursor:pointer;';
      });
      this.container.appendChild(tb);
      this.toolbar = tb;
    }

    _bindEvents() {
      const c = this.canvas;
      c.addEventListener('mousedown', (e) => this._onDown(e));
      c.addEventListener('mousemove', (e) => this._onMove(e));
      c.addEventListener('mouseup',   () => this._onUp());
      c.addEventListener('mouseleave',() => this._onUp());
      c.addEventListener('dblclick',  (e) => this._onDblClick(e));

      this.toolbar.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'add')    this._uiAdd();
        if (act === 'del')    this._uiDel();
        if (act === 'rename') this._uiRename();
        if (act === 'color')  this._uiColor();
        if (act === 'export') this.exportPNG('mindmap.png');
      });
    }

    // ── Coordinate helpers ───────────────────────────────────────
    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _hit(p) {
      // iterate in reverse so topmost node wins
      const ids = Array.from(this.nodes.keys()).reverse();
      for (const id of ids) {
        const n = this.nodes.get(id);
        const w = n.isRoot ? ROOT_W : NODE_W;
        const h = n.isRoot ? ROOT_H : NODE_H;
        if (p.x >= n.x - w/2 && p.x <= n.x + w/2 &&
            p.y >= n.y - h/2 && p.y <= n.y + h/2) {
          return id;
        }
      }
      return null;
    }

    // ── Mouse handlers ───────────────────────────────────────────
    _onDown(e) {
      const p = this._pos(e);
      const id = this._hit(p);
      this.selectedId = id;
      if (id) {
        const n = this.nodes.get(id);
        this._dragging = id;
        this._dragOff  = { x: p.x - n.x, y: p.y - n.y };
        this.canvas.style.cursor = 'grabbing';
      }
      this.render();
    }

    _onMove(e) {
      const p = this._pos(e);
      if (this._dragging) {
        const n = this.nodes.get(this._dragging);
        n.x = p.x - this._dragOff.x;
        n.y = p.y - this._dragOff.y;
        this.render();
        return;
      }
      this.canvas.style.cursor = this._hit(p) ? 'grab' : 'default';
    }

    _onUp() {
      if (this._dragging) {
        this._dragging = null;
        this.canvas.style.cursor = 'default';
        this._fireChange();
      }
    }

    _onDblClick(e) {
      const id = this._hit(this._pos(e));
      if (id) { this.selectedId = id; this._uiRename(); }
      else    { this._uiAdd(this.rootId); }
    }

    // ── UI actions ───────────────────────────────────────────────
    _uiAdd(parentId) {
      const pid = parentId || this.selectedId || this.rootId;
      const self = this;
      const opts = PALETTE.map((c, i) => ({ value: c, label: 'Paleta ' + i }));
      const ui = global.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        Promise.resolve(ui.form({
          title: 'Nuevo nodo',
          fields: [
            { name: 'label', label: 'Nombre del nodo', type: 'text', default: 'New branch', required: true },
            { name: 'category', label: 'Categoría', type: 'radio', options: [{value:'idea',label:'Idea'},{value:'tarea',label:'Tarea'},{value:'nota',label:'Nota'}], default: 'idea' },
            { name: 'color', label: 'Color', type: 'color', default: PALETTE[0] }
          ],
          submitText: 'Crear'
        })).then(res => {
          if (!res || !res.label) return;
          const id = self.addNode(pid, res.label);
          if (res.color) { const n = self.nodes.get(id); if (n) { n.color = res.color; self.render(); self._fireChange(); } }
        }).catch(()=>{});
        return;
      }
      const label = prompt('Branch label:', 'New branch');
      if (!label) return;
      this.addNode(pid, label);
    }
    _uiDel() {
      if (!this.selectedId || this.selectedId === this.rootId) return;
      this.removeNode(this.selectedId);
      this.selectedId = null;
    }
    _uiRename() {
      if (!this.selectedId) return;
      const n = this.nodes.get(this.selectedId);
      const self = this;
      const ui = global.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        Promise.resolve(ui.form({
          title: 'Renombrar nodo',
          fields: [{ name: 'label', label: 'Nombre', type: 'text', default: n.label, required: true }],
          submitText: 'Guardar'
        })).then(res => {
          if (res && res.label) { n.label = res.label; self.render(); self._fireChange(); }
        }).catch(()=>{});
        return;
      }
      const v = prompt('Rename node:', n.label);
      if (v != null && v !== '') { n.label = v; this.render(); this._fireChange(); }
    }
    _uiColor() {
      if (!this.selectedId) return;
      const n = this.nodes.get(this.selectedId);
      const self = this;
      const ui = global.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        Promise.resolve(ui.form({
          title: 'Cambiar color',
          fields: [{ name: 'color', label: 'Color del nodo', type: 'color', default: n.color }],
          submitText: 'Aplicar'
        })).then(res => {
          if (res && res.color) { n.color = res.color; self.render(); self._fireChange(); }
        }).catch(()=>{});
        return;
      }
      const v = prompt('Color (hex or palette idx 0-' + (PALETTE.length-1) + '):', n.color);
      if (v == null) return;
      const idx = parseInt(v, 10);
      n.color = (!isNaN(idx) && PALETTE[idx]) ? PALETTE[idx] : v;
      this.render(); this._fireChange();
    }

    // ── Public API ───────────────────────────────────────────────
    addNode(parentId, label, opts) {
      opts = opts || {};
      const parent = this.nodes.get(parentId);
      if (!parent) throw new Error('addNode: parent not found');

      // place around parent in a circle
      const siblings = this.edges.filter(e => e.from === parentId).length;
      const angle = (siblings * (Math.PI * 2 / 6)) + Math.random() * 0.4;
      const dist  = parent.isRoot ? 200 : 160;
      const x = parent.x + Math.cos(angle) * dist;
      const y = parent.y + Math.sin(angle) * dist;

      const color = opts.color || PALETTE[this.colorIdx++ % PALETTE.length];
      const id = this._addNodeRaw({ label, x, y, color, isRoot: false });
      this.edges.push({ from: parentId, to: id });
      this.render();
      this._fireChange();
      return id;
    }

    _addNodeRaw(n) {
      const id = uid();
      this.nodes.set(id, Object.assign({ id }, n));
      return id;
    }

    removeNode(id) {
      if (id === this.rootId) return;
      // remove children recursively
      const kids = this.edges.filter(e => e.from === id).map(e => e.to);
      kids.forEach(k => this.removeNode(k));
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      this.nodes.delete(id);
      this.render();
      this._fireChange();
    }

    setLabel(id, label) {
      const n = this.nodes.get(id);
      if (n) { n.label = label; this.render(); this._fireChange(); }
    }

    toJSON() {
      return {
        rootId: this.rootId,
        nodes: Array.from(this.nodes.values()),
        edges: this.edges.slice()
      };
    }

    fromJSON(data) {
      this.nodes.clear();
      this.edges = [];
      (data.nodes || []).forEach(n => this.nodes.set(n.id, Object.assign({}, n)));
      this.edges = (data.edges || []).slice();
      this.rootId = data.rootId;
      this.render();
    }

    _fireChange() {
      if (typeof this._onChange === 'function') {
        try { this._onChange(this.toJSON()); } catch (_) { /* noop */ }
      }
    }

    // ── Rendering ────────────────────────────────────────────────
    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, this.width, this.height);

      // edges
      ctx.lineWidth = 2;
      ctx.strokeStyle = EDGE_COLOR;
      this.edges.forEach(e => {
        const a = this.nodes.get(e.from);
        const b = this.nodes.get(e.to);
        if (!a || !b) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        const mx = (a.x + b.x) / 2;
        ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
        ctx.stroke();
      });

      // nodes
      this.nodes.forEach(n => this._drawNode(n, n.id === this.selectedId));
    }

    _drawNode(n, selected) {
      const ctx = this.ctx;
      const w = n.isRoot ? ROOT_W : NODE_W;
      const h = n.isRoot ? ROOT_H : NODE_H;
      const r = NODE_RADIUS;
      const x = n.x - w/2, y = n.y - h/2;

      // shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur  = 8;
      ctx.shadowOffsetY = 2;

      // rounded rect
      ctx.fillStyle = n.color || PALETTE[0];
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (selected) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#222';
        ctx.stroke();
      }

      // label
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = n.isRoot ? 'bold 16px system-ui' : FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = this._truncate(n.label, w - 16);
      ctx.fillText(txt, n.x, n.y);
    }

    _truncate(text, maxW) {
      const ctx = this.ctx;
      if (ctx.measureText(text).width <= maxW) return text;
      let s = text;
      while (s.length && ctx.measureText(s + '...').width > maxW) s = s.slice(0, -1);
      return s + '...';
    }

    // ── Export ───────────────────────────────────────────────────
    exportPNG(filename) {
      filename = filename || 'mindmap.png';
      // re-render without selection highlight for clean export
      const sel = this.selectedId; this.selectedId = null;
      this.render();
      const url = this.canvas.toDataURL('image/png');
      this.selectedId = sel; this.render();

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return url;
    }

    resize(w, h) {
      this.width = w; this.height = h;
      this.canvas.width = w; this.canvas.height = h;
      this.render();
    }

    destroy() {
      this.container.innerHTML = '';
      this.nodes.clear();
      this.edges = [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Public namespace
  // ─────────────────────────────────────────────────────────────────
  const NS = {
    create(opts) { return new MindMap(opts); },
    palette: PALETTE.slice(),
    version: '1.0.0'
  };

  global.MindMap = NS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
