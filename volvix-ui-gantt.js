/* volvix-ui-gantt.js
 * Gantt chart UI: tasks with dates, dependencies, drag-resize, progress%.
 * Exposes window.Gantt
 */
(function (global) {
  'use strict';

  const DAY_MS = 86400000;

  function parseDate(d) {
    if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }

  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
  }

  function addDays(d, n) {
    const x = parseDate(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtDate(d) {
    const x = parseDate(d);
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${x.getFullYear()}-${m}-${day}`;
  }

  function uid() {
    return 't_' + Math.random().toString(36).slice(2, 10);
  }

  function injectStyles() {
    if (document.getElementById('volvix-gantt-styles')) return;
    const css = `
.vx-gantt{font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:13px;color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;user-select:none}
.vx-gantt-toolbar{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid #e5e7eb;background:#f9fafb;align-items:center}
.vx-gantt-toolbar button{padding:4px 10px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer;font-size:12px}
.vx-gantt-toolbar button:hover{background:#f3f4f6}
.vx-gantt-body{display:flex;overflow:auto;max-height:600px;position:relative}
.vx-gantt-left{flex:0 0 280px;border-right:1px solid #e5e7eb;background:#fafafa;position:sticky;left:0;z-index:2}
.vx-gantt-left-header{height:48px;display:flex;align-items:center;padding:0 12px;font-weight:600;border-bottom:1px solid #e5e7eb;background:#f3f4f6}
.vx-gantt-row-label{height:32px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vx-gantt-row-label:hover{background:#eef2ff}
.vx-gantt-row-label.selected{background:#dbeafe;font-weight:600}
.vx-gantt-right{flex:1;position:relative;overflow:visible}
.vx-gantt-timeline{height:48px;display:flex;border-bottom:1px solid #e5e7eb;background:#f3f4f6;position:sticky;top:0;z-index:1}
.vx-gantt-tick{flex:0 0 auto;border-right:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6b7280}
.vx-gantt-tick.weekend{background:#fef3f2}
.vx-gantt-grid{position:relative}
.vx-gantt-row{height:32px;border-bottom:1px solid #f3f4f6;position:relative}
.vx-gantt-row.weekend-bg::after{content:"";position:absolute;inset:0;pointer-events:none}
.vx-gantt-bar{position:absolute;height:20px;top:6px;background:linear-gradient(180deg,#3b82f6,#2563eb);border-radius:4px;cursor:move;box-shadow:0 1px 2px rgba(0,0,0,.15);overflow:hidden;color:#fff;font-size:11px;display:flex;align-items:center;padding:0 6px;white-space:nowrap}
.vx-gantt-bar.critical{background:linear-gradient(180deg,#ef4444,#dc2626)}
.vx-gantt-bar.done{background:linear-gradient(180deg,#10b981,#059669)}
.vx-gantt-bar-progress{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.25);pointer-events:none}
.vx-gantt-bar-handle{position:absolute;top:0;bottom:0;width:6px;cursor:ew-resize;background:rgba(0,0,0,.15)}
.vx-gantt-bar-handle.left{left:0;border-radius:4px 0 0 4px}
.vx-gantt-bar-handle.right{right:0;border-radius:0 4px 4px 0}
.vx-gantt-bar-progress-handle{position:absolute;top:0;bottom:0;width:4px;cursor:col-resize;background:rgba(255,255,255,.7)}
.vx-gantt-dep-svg{position:absolute;top:0;left:0;pointer-events:none;overflow:visible}
.vx-gantt-dep-line{stroke:#9ca3af;stroke-width:1.5;fill:none;marker-end:url(#vxArrow)}
.vx-gantt-today{position:absolute;top:0;bottom:0;width:2px;background:#ef4444;z-index:1;pointer-events:none}
.vx-gantt-tooltip{position:fixed;background:#111827;color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;pointer-events:none;z-index:1000;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2)}
`;
    const s = document.createElement('style');
    s.id = 'volvix-gantt-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  class Gantt {
    constructor(container, options) {
      if (typeof container === 'string') container = document.querySelector(container);
      if (!container) throw new Error('Gantt: container not found');
      injectStyles();
      this.container = container;
      this.opts = Object.assign({
        dayWidth: 28,
        rowHeight: 32,
        startDate: null,
        endDate: null,
        readOnly: false,
        onChange: null,
        onSelect: null,
      }, options || {});
      this.tasks = [];
      this.selectedId = null;
      this._drag = null;
      this._build();
    }

    setTasks(tasks) {
      this.tasks = (tasks || []).map(t => ({
        id: t.id || uid(),
        name: t.name || 'Task',
        start: fmtDate(t.start),
        end: fmtDate(t.end),
        progress: Math.max(0, Math.min(100, +t.progress || 0)),
        deps: Array.isArray(t.deps) ? t.deps.slice() : [],
        critical: !!t.critical,
      }));
      this._render();
    }

    addTask(t) {
      this.tasks.push({
        id: t.id || uid(),
        name: t.name || 'Task',
        start: fmtDate(t.start),
        end: fmtDate(t.end),
        progress: +t.progress || 0,
        deps: t.deps || [],
        critical: !!t.critical,
      });
      this._render();
      this._fireChange();
    }

    removeTask(id) {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.tasks.forEach(t => { t.deps = t.deps.filter(d => d !== id); });
      this._render();
      this._fireChange();
    }

    getTasks() {
      return JSON.parse(JSON.stringify(this.tasks));
    }

    selectTask(id) {
      this.selectedId = id;
      this._render();
      if (typeof this.opts.onSelect === 'function') {
        this.opts.onSelect(this.tasks.find(t => t.id === id) || null);
      }
    }

    _build() {
      this.container.innerHTML = '';
      this.container.classList.add('vx-gantt');

      const toolbar = document.createElement('div');
      toolbar.className = 'vx-gantt-toolbar';
      toolbar.innerHTML = `
        <strong>Gantt</strong>
        <button data-act="add">+ Task</button>
        <button data-act="zoomIn">Zoom +</button>
        <button data-act="zoomOut">Zoom -</button>
        <button data-act="today">Today</button>
        <span style="flex:1"></span>
        <span class="vx-gantt-info" style="color:#6b7280;font-size:12px"></span>
      `;
      toolbar.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'add') this._promptAdd();
        else if (act === 'zoomIn') { this.opts.dayWidth = Math.min(80, this.opts.dayWidth + 6); this._render(); }
        else if (act === 'zoomOut') { this.opts.dayWidth = Math.max(10, this.opts.dayWidth - 6); this._render(); }
        else if (act === 'today') this._scrollToToday();
      });
      this.container.appendChild(toolbar);

      const body = document.createElement('div');
      body.className = 'vx-gantt-body';
      this.body = body;

      const left = document.createElement('div');
      left.className = 'vx-gantt-left';
      left.innerHTML = `<div class="vx-gantt-left-header">Task</div><div class="vx-gantt-left-rows"></div>`;
      this.left = left;

      const right = document.createElement('div');
      right.className = 'vx-gantt-right';
      right.innerHTML = `<div class="vx-gantt-timeline"></div><div class="vx-gantt-grid"></div>`;
      this.right = right;

      body.appendChild(left);
      body.appendChild(right);
      this.container.appendChild(body);

      this.tooltip = document.createElement('div');
      this.tooltip.className = 'vx-gantt-tooltip';
      this.tooltip.style.display = 'none';
      document.body.appendChild(this.tooltip);
    }

    _promptAdd() {
      const name = prompt('Task name:', 'New Task');
      if (!name) return;
      const today = fmtDate(new Date());
      this.addTask({ name, start: today, end: fmtDate(addDays(today, 3)), progress: 0 });
    }

    _computeRange() {
      let min = this.opts.startDate ? parseDate(this.opts.startDate) : null;
      let max = this.opts.endDate ? parseDate(this.opts.endDate) : null;
      this.tasks.forEach(t => {
        const s = parseDate(t.start), e = parseDate(t.end);
        if (!min || s < min) min = s;
        if (!max || e > max) max = e;
      });
      if (!min) min = parseDate(new Date());
      if (!max) max = addDays(min, 14);
      min = addDays(min, -2);
      max = addDays(max, 4);
      return { min, max, days: diffDays(min, max) + 1 };
    }

    _render() {
      const range = this._computeRange();
      this._range = range;
      const dw = this.opts.dayWidth;
      const totalW = range.days * dw;

      // Timeline
      const tl = this.right.querySelector('.vx-gantt-timeline');
      tl.style.width = totalW + 'px';
      tl.innerHTML = '';
      for (let i = 0; i < range.days; i++) {
        const d = addDays(range.min, i);
        const div = document.createElement('div');
        div.className = 'vx-gantt-tick';
        const dow = d.getDay();
        if (dow === 0 || dow === 6) div.classList.add('weekend');
        div.style.width = dw + 'px';
        div.innerHTML = `<div style="text-align:center;line-height:1.2"><div>${d.getDate()}</div><div style="font-size:10px;opacity:.7">${['S','M','T','W','T','F','S'][dow]}</div></div>`;
        tl.appendChild(div);
      }

      // Left rows
      const lr = this.left.querySelector('.vx-gantt-left-rows');
      lr.innerHTML = '';
      this.tasks.forEach(t => {
        const r = document.createElement('div');
        r.className = 'vx-gantt-row-label' + (t.id === this.selectedId ? ' selected' : '');
        r.textContent = t.name;
        r.title = `${t.name}\n${t.start} → ${t.end}\n${t.progress}%`;
        r.addEventListener('click', () => this.selectTask(t.id));
        r.addEventListener('dblclick', () => {
          const nn = prompt('Rename:', t.name);
          if (nn) { t.name = nn; this._render(); this._fireChange(); }
        });
        lr.appendChild(r);
      });

      // Grid
      const grid = this.right.querySelector('.vx-gantt-grid');
      grid.style.width = totalW + 'px';
      grid.style.height = (this.tasks.length * this.opts.rowHeight) + 'px';
      grid.innerHTML = '';

      // Dep SVG
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'vx-gantt-dep-svg');
      svg.setAttribute('width', totalW);
      svg.setAttribute('height', this.tasks.length * this.opts.rowHeight);
      const defs = document.createElementNS(svgNS, 'defs');
      defs.innerHTML = `<marker id="vxArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#9ca3af"/></marker>`;
      svg.appendChild(defs);
      grid.appendChild(svg);

      // Rows + bars
      this.tasks.forEach((t, idx) => {
        const row = document.createElement('div');
        row.className = 'vx-gantt-row';
        row.style.height = this.opts.rowHeight + 'px';
        grid.appendChild(row);

        const startOff = diffDays(range.min, t.start) * dw;
        const len = Math.max(1, diffDays(t.start, t.end) + 1) * dw;
        const bar = document.createElement('div');
        bar.className = 'vx-gantt-bar';
        if (t.critical) bar.classList.add('critical');
        if (t.progress >= 100) bar.classList.add('done');
        bar.style.left = startOff + 'px';
        bar.style.width = len + 'px';
        bar.style.top = (idx * this.opts.rowHeight + 6) + 'px';
        bar.style.position = 'absolute';
        bar.dataset.id = t.id;
        bar.innerHTML = `
          <div class="vx-gantt-bar-progress" style="width:${t.progress}%"></div>
          <span style="position:relative;z-index:1">${t.name} (${t.progress}%)</span>
          <div class="vx-gantt-bar-handle left"></div>
          <div class="vx-gantt-bar-handle right"></div>
          <div class="vx-gantt-bar-progress-handle" style="left:${t.progress}%"></div>
        `;
        this._wireBar(bar, t);
        grid.appendChild(bar);
      });

      // Dependencies
      this.tasks.forEach((t, idx) => {
        (t.deps || []).forEach(depId => {
          const dep = this.tasks.find(x => x.id === depId);
          if (!dep) return;
          const depIdx = this.tasks.indexOf(dep);
          const x1 = (diffDays(range.min, dep.end) + 1) * dw;
          const y1 = depIdx * this.opts.rowHeight + 16;
          const x2 = diffDays(range.min, t.start) * dw;
          const y2 = idx * this.opts.rowHeight + 16;
          const path = document.createElementNS(svgNS, 'path');
          const midX = Math.max(x1 + 8, x2 - 8);
          path.setAttribute('d', `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`);
          path.setAttribute('class', 'vx-gantt-dep-line');
          svg.appendChild(path);
        });
      });

      // Today marker
      const todayOff = diffDays(range.min, new Date()) * dw;
      if (todayOff >= 0 && todayOff <= totalW) {
        const tm = document.createElement('div');
        tm.className = 'vx-gantt-today';
        tm.style.left = todayOff + 'px';
        tm.style.height = grid.style.height;
        grid.appendChild(tm);
      }

      const info = this.container.querySelector('.vx-gantt-info');
      if (info) info.textContent = `${this.tasks.length} tasks · ${fmtDate(range.min)} → ${fmtDate(range.max)}`;
    }

    _wireBar(bar, task) {
      if (this.opts.readOnly) return;
      const dw = this.opts.dayWidth;
      const onDown = (e) => {
        e.preventDefault();
        const target = e.target;
        let mode = 'move';
        if (target.classList.contains('vx-gantt-bar-handle')) {
          mode = target.classList.contains('left') ? 'resize-l' : 'resize-r';
        } else if (target.classList.contains('vx-gantt-bar-progress-handle')) {
          mode = 'progress';
        }
        this._drag = {
          mode, task, bar,
          startX: e.clientX,
          origStart: task.start,
          origEnd: task.end,
          origProgress: task.progress,
          origLeft: parseFloat(bar.style.left),
          origWidth: parseFloat(bar.style.width),
        };
        this.selectTask(task.id);
        document.addEventListener('mousemove', this._onMove);
        document.addEventListener('mouseup', this._onUp);
      };
      bar.addEventListener('mousedown', onDown);
      bar.addEventListener('mouseenter', e => this._showTip(e, task));
      bar.addEventListener('mousemove', e => this._showTip(e, task));
      bar.addEventListener('mouseleave', () => this._hideTip());
    }

    _showTip(e, t) {
      this.tooltip.style.display = 'block';
      this.tooltip.textContent = `${t.name} | ${t.start} → ${t.end} | ${t.progress}%`;
      this.tooltip.style.left = (e.clientX + 12) + 'px';
      this.tooltip.style.top = (e.clientY + 12) + 'px';
    }
    _hideTip() { this.tooltip.style.display = 'none'; }

    _onMove = (e) => {
      const d = this._drag;
      if (!d) return;
      const dw = this.opts.dayWidth;
      const dx = e.clientX - d.startX;
      const dDays = Math.round(dx / dw);
      if (d.mode === 'move') {
        d.task.start = fmtDate(addDays(d.origStart, dDays));
        d.task.end = fmtDate(addDays(d.origEnd, dDays));
      } else if (d.mode === 'resize-l') {
        const ns = addDays(d.origStart, dDays);
        if (parseDate(ns) <= parseDate(d.origEnd)) d.task.start = fmtDate(ns);
      } else if (d.mode === 'resize-r') {
        const ne = addDays(d.origEnd, dDays);
        if (parseDate(ne) >= parseDate(d.origStart)) d.task.end = fmtDate(ne);
      } else if (d.mode === 'progress') {
        const w = d.origWidth;
        const newPct = Math.max(0, Math.min(100, d.origProgress + (dx / w) * 100));
        d.task.progress = Math.round(newPct);
      }
      this._render();
    };

    _onUp = () => {
      if (this._drag) {
        this._drag = null;
        document.removeEventListener('mousemove', this._onMove);
        document.removeEventListener('mouseup', this._onUp);
        this._fireChange();
      }
    };

    _scrollToToday() {
      if (!this._range) return;
      const off = diffDays(this._range.min, new Date()) * this.opts.dayWidth;
      this.body.scrollLeft = Math.max(0, off - 100);
    }

    _fireChange() {
      if (typeof this.opts.onChange === 'function') this.opts.onChange(this.getTasks());
    }

    destroy() {
      if (this.tooltip && this.tooltip.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
      this.container.innerHTML = '';
      this.container.classList.remove('vx-gantt');
    }
  }

  global.Gantt = Gantt;
})(typeof window !== 'undefined' ? window : this);
