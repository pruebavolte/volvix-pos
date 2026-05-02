/* volvix-ui-list.js — UI List component
 * Virtual scroll, swipe actions, drag reorder, infinite load, group headers.
 * Exposes: window.List
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    itemHeight: 56,
    overscan: 6,
    headerHeight: 32,
    swipeThreshold: 60,
    dragHandleSelector: '.list-drag-handle',
    infiniteThreshold: 200,
    groupBy: null,
    emptyText: 'Sin elementos',
    loadingText: 'Cargando…',
    keyField: 'id'
  };

  function injectStyles() {
    if (document.getElementById('volvix-list-styles')) return;
    const css = `
      .vlist-root{position:relative;overflow:auto;-webkit-overflow-scrolling:touch;height:100%;background:#fff;font-family:system-ui,-apple-system,sans-serif}
      .vlist-spacer{position:relative;width:100%}
      .vlist-row{position:absolute;left:0;right:0;display:flex;align-items:center;padding:0 12px;box-sizing:border-box;border-bottom:1px solid #eee;background:#fff;transition:transform .2s ease,background .15s}
      .vlist-row:active{background:#f5f7fa}
      .vlist-row.dragging{opacity:.6;z-index:10;box-shadow:0 6px 18px rgba(0,0,0,.15)}
      .vlist-row.drop-target{border-top:2px solid #2563eb}
      .vlist-header{position:absolute;left:0;right:0;display:flex;align-items:center;padding:0 12px;background:#f3f4f6;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;z-index:2}
      .vlist-header.sticky{position:sticky;top:0}
      .vlist-actions{position:absolute;top:0;right:0;bottom:0;display:flex;align-items:center}
      .vlist-action{height:100%;padding:0 18px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px;border:0;cursor:pointer}
      .vlist-action.danger{background:#dc2626}
      .vlist-action.warn{background:#f59e0b}
      .vlist-action.info{background:#2563eb}
      .vlist-empty,.vlist-loading{padding:32px;text-align:center;color:#94a3b8;font-size:14px}
      .vlist-handle{cursor:grab;padding:0 8px;color:#94a3b8;user-select:none}
      .vlist-handle:active{cursor:grabbing}
      .vlist-content{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    `;
    const s = document.createElement('style');
    s.id = 'volvix-list-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  class List {
    constructor(container, options) {
      injectStyles();
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.el) throw new Error('List: contenedor no encontrado');
      this.opts = Object.assign({}, DEFAULTS, options || {});
      this.items = (options && options.items) || [];
      this.renderItem = (options && options.renderItem) || ((it) => String(it.label || it.name || it.id || ''));
      this.actions = (options && options.actions) || []; // [{label,kind,onClick}]
      this.onLoadMore = options && options.onLoadMore;
      this.onReorder = options && options.onReorder;
      this.onItemClick = options && options.onItemClick;
      this._loading = false;
      this._exhausted = false;
      this._build();
      this._bind();
      this.refresh();
    }

    _build() {
      this.el.classList.add('vlist-root');
      this.el.innerHTML = '';
      this.spacer = document.createElement('div');
      this.spacer.className = 'vlist-spacer';
      this.el.appendChild(this.spacer);
      this.viewport = document.createElement('div');
      this.viewport.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      this.spacer.appendChild(this.viewport);
      this.empty = document.createElement('div');
      this.empty.className = 'vlist-empty';
      this.empty.textContent = this.opts.emptyText;
      this.empty.style.display = 'none';
      this.el.appendChild(this.empty);
    }

    _bind() {
      this._onScroll = this._onScroll.bind(this);
      this.el.addEventListener('scroll', this._onScroll, { passive: true });
      this._bindPointer();
    }

    _onScroll() {
      this._render();
      if (this.onLoadMore && !this._loading && !this._exhausted) {
        const remaining = this.spacer.offsetHeight - (this.el.scrollTop + this.el.clientHeight);
        if (remaining < this.opts.infiniteThreshold) this._triggerLoad();
      }
    }

    async _triggerLoad() {
      this._loading = true;
      try {
        const more = await this.onLoadMore();
        if (!more || !more.length) this._exhausted = true;
        else this.append(more);
      } catch (e) { console.error('List loadMore', e); }
      finally { this._loading = false; }
    }

    _layout() {
      // Build flat layout: [{type:'header'|'item', y, h, ref}]
      const layout = [];
      let y = 0;
      const ih = this.opts.itemHeight;
      const hh = this.opts.headerHeight;
      if (this.opts.groupBy) {
        const groups = new Map();
        for (const it of this.items) {
          const k = this.opts.groupBy(it);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(it);
        }
        for (const [k, arr] of groups) {
          layout.push({ type: 'header', y, h: hh, label: k });
          y += hh;
          for (const it of arr) {
            layout.push({ type: 'item', y, h: ih, item: it });
            y += ih;
          }
        }
      } else {
        for (const it of this.items) {
          layout.push({ type: 'item', y, h: ih, item: it });
          y += ih;
        }
      }
      this._layoutCache = layout;
      this.spacer.style.height = y + 'px';
      this.empty.style.display = this.items.length ? 'none' : 'block';
    }

    _render() {
      const layout = this._layoutCache || [];
      const top = this.el.scrollTop;
      const bot = top + this.el.clientHeight;
      const over = this.opts.overscan * this.opts.itemHeight;
      const visible = layout.filter(n => n.y + n.h >= top - over && n.y <= bot + over);
      // Diff render: clear + redraw (simple, fast for moderate viewports)
      this.viewport.innerHTML = '';
      this.viewport.style.pointerEvents = 'auto';
      for (const node of visible) {
        if (node.type === 'header') {
          const h = document.createElement('div');
          h.className = 'vlist-header';
          h.style.transform = `translateY(${node.y}px)`;
          h.style.height = node.h + 'px';
          h.textContent = node.label;
          this.viewport.appendChild(h);
        } else {
          const row = this._renderRow(node.item, node.y, node.h);
          this.viewport.appendChild(row);
        }
      }
    }

    _renderRow(item, y, h) {
      const row = document.createElement('div');
      row.className = 'vlist-row';
      row.style.transform = `translateY(${y}px)`;
      row.style.height = h + 'px';
      row.dataset.key = item[this.opts.keyField];

      if (this.onReorder) {
        const handle = document.createElement('span');
        handle.className = 'vlist-handle list-drag-handle';
        handle.textContent = '⋮⋮';
        handle.dataset.role = 'handle';
        row.appendChild(handle);
      }

      const content = document.createElement('div');
      content.className = 'vlist-content';
      const rendered = this.renderItem(item);
      if (typeof rendered === 'string') content.innerHTML = rendered;
      else if (rendered instanceof Node) content.appendChild(rendered);
      row.appendChild(content);

      if (this.actions && this.actions.length) {
        const actBox = document.createElement('div');
        actBox.className = 'vlist-actions';
        actBox.style.transform = 'translateX(100%)';
        for (const a of this.actions) {
          const b = document.createElement('button');
          b.className = 'vlist-action ' + (a.kind || 'info');
          b.textContent = a.label;
          b.onclick = (ev) => { ev.stopPropagation(); a.onClick && a.onClick(item); };
          actBox.appendChild(b);
        }
        row.appendChild(actBox);
        row._actBox = actBox;
      }

      row.addEventListener('click', (e) => {
        if (e.target.dataset.role === 'handle') return;
        if (row._swiped) { this._closeSwipe(row); return; }
        this.onItemClick && this.onItemClick(item);
      });

      return row;
    }

    _bindPointer() {
      let startX = 0, startY = 0, currentRow = null, swiping = false, dragging = false, dragKey = null;

      const onDown = (e) => {
        const t = e.touches ? e.touches[0] : e;
        const row = e.target.closest('.vlist-row');
        if (!row) return;
        startX = t.clientX; startY = t.clientY;
        currentRow = row;
        if (e.target.dataset.role === 'handle') {
          dragging = true; dragKey = row.dataset.key;
          row.classList.add('dragging');
        }
      };

      const onMove = (e) => {
        if (!currentRow) return;
        const t = e.touches ? e.touches[0] : e;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (dragging) {
          currentRow.style.transform = `translateY(${parseFloat(currentRow.style.transform.match(/-?\d+/)[0]) + dy}px)`;
          startY = t.clientY;
          // Mark drop target
          const over = document.elementFromPoint(t.clientX, t.clientY);
          const tgt = over && over.closest('.vlist-row');
          this.viewport.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
          if (tgt && tgt !== currentRow) tgt.classList.add('drop-target');
          e.preventDefault();
          return;
        }
        if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) swiping = true;
        if (swiping && currentRow._actBox) {
          const off = Math.max(-200, Math.min(0, dx));
          currentRow.style.transform = currentRow.style.transform.replace(/translateX\([^)]*\)/, '') + ` translateX(${off}px)`;
          currentRow._actBox.style.transform = `translateX(${100 + off / 2}%)`;
          e.preventDefault();
        }
      };

      const onUp = (e) => {
        if (!currentRow) return;
        if (dragging) {
          const tgt = this.viewport.querySelector('.drop-target');
          currentRow.classList.remove('dragging');
          if (tgt && this.onReorder) {
            const fromKey = dragKey;
            const toKey = tgt.dataset.key;
            this._reorder(fromKey, toKey);
          }
          this.viewport.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
        } else if (swiping) {
          const t = (e.changedTouches ? e.changedTouches[0] : e);
          const dx = t.clientX - startX;
          if (dx < -this.opts.swipeThreshold) this._openSwipe(currentRow);
          else this._closeSwipe(currentRow);
        }
        currentRow = null; swiping = false; dragging = false; dragKey = null;
        if (dragging || swiping) this._render();
      };

      this.el.addEventListener('mousedown', onDown);
      this.el.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      this.el.addEventListener('touchstart', onDown, { passive: true });
      this.el.addEventListener('touchmove', onMove, { passive: false });
      this.el.addEventListener('touchend', onUp);
    }

    _openSwipe(row) {
      row._swiped = true;
      const y = row.style.transform.match(/translateY\(([^)]+)\)/);
      row.style.transform = `translateY(${y ? y[1] : 0}) translateX(-160px)`;
      if (row._actBox) row._actBox.style.transform = 'translateX(0)';
    }
    _closeSwipe(row) {
      row._swiped = false;
      const y = row.style.transform.match(/translateY\(([^)]+)\)/);
      row.style.transform = `translateY(${y ? y[1] : 0})`;
      if (row._actBox) row._actBox.style.transform = 'translateX(100%)';
    }

    _reorder(fromKey, toKey) {
      const k = this.opts.keyField;
      const fi = this.items.findIndex(x => String(x[k]) === String(fromKey));
      const ti = this.items.findIndex(x => String(x[k]) === String(toKey));
      if (fi < 0 || ti < 0) return;
      const [moved] = this.items.splice(fi, 1);
      this.items.splice(ti, 0, moved);
      this.refresh();
      this.onReorder && this.onReorder(this.items.slice(), { fromKey, toKey });
    }

    // Public API
    setItems(items) { this.items = items.slice(); this._exhausted = false; this.refresh(); }
    append(items) { this.items = this.items.concat(items); this.refresh(); }
    prepend(items) { this.items = items.concat(this.items); this.refresh(); }
    remove(key) {
      const k = this.opts.keyField;
      this.items = this.items.filter(x => String(x[k]) !== String(key));
      this.refresh();
    }
    update(key, patch) {
      const k = this.opts.keyField;
      const i = this.items.findIndex(x => String(x[k]) === String(key));
      if (i >= 0) { this.items[i] = Object.assign({}, this.items[i], patch); this.refresh(); }
    }
    refresh() { this._layout(); this._render(); }
    scrollToKey(key) {
      const k = this.opts.keyField;
      const node = (this._layoutCache || []).find(n => n.type === 'item' && String(n.item[k]) === String(key));
      if (node) this.el.scrollTo({ top: node.y, behavior: 'smooth' });
    }
    destroy() {
      this.el.removeEventListener('scroll', this._onScroll);
      this.el.innerHTML = '';
      this.el.classList.remove('vlist-root');
    }
  }

  global.List = {
    create: (container, options) => new List(container, options),
    Class: List,
    version: '1.0.0'
  };

})(window);
