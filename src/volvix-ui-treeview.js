/**
 * volvix-ui-treeview.js
 * Hierarchical TreeView component for Volvix POS.
 * Features: expand/collapse, drag-drop, lazy load, search, multi-select checkboxes.
 * Exposes window.TreeView
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    data: [],
    container: null,
    checkboxes: false,
    draggable: false,
    lazy: false,
    lazyLoader: null,         // async (node) => [children]
    searchable: false,
    expandIcon: '▶',     // ▶
    collapseIcon: '▼',   // ▼
    leafIcon: '•',       // •
    indent: 18,
    onSelect: null,
    onCheck: null,
    onExpand: null,
    onCollapse: null,
    onDrop: null,
    onLoad: null,
    multiSelect: true,
    showRoot: true,
    cascadeChecks: true,
  };

  let _idCounter = 0;
  const _uid = () => `tv_${++_idCounter}_${Date.now().toString(36)}`;

  function injectStyles() {
    if (document.getElementById('tv-styles')) return;
    const css = `
      .tv-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;user-select:none;}
      .tv-search{width:100%;padding:6px 8px;margin-bottom:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;}
      .tv-list,.tv-children{list-style:none;margin:0;padding:0;}
      .tv-node{position:relative;}
      .tv-row{display:flex;align-items:center;padding:3px 4px;border-radius:3px;cursor:pointer;}
      .tv-row:hover{background:#eef4ff;}
      .tv-row.tv-selected{background:#cfe2ff;}
      .tv-row.tv-drop-before{box-shadow:inset 0 2px 0 #2563eb;}
      .tv-row.tv-drop-after{box-shadow:inset 0 -2px 0 #2563eb;}
      .tv-row.tv-drop-inside{background:#dbeafe;outline:1px dashed #2563eb;}
      .tv-toggle{width:14px;display:inline-block;text-align:center;font-size:10px;color:#555;cursor:pointer;}
      .tv-toggle.tv-empty{visibility:hidden;}
      .tv-icon{margin-right:4px;}
      .tv-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tv-checkbox{margin-right:4px;}
      .tv-loading{font-style:italic;color:#888;padding:3px 0 3px 22px;}
      .tv-hidden{display:none !important;}
      .tv-match{background:#fff3a3;}
      .tv-children{margin-left:0;}
    `;
    const style = document.createElement('style');
    style.id = 'tv-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  class TreeView {
    constructor(opts) {
      injectStyles();
      this.opts = Object.assign({}, DEFAULTS, opts || {});
      if (typeof this.opts.container === 'string') {
        this.opts.container = document.querySelector(this.opts.container);
      }
      if (!this.opts.container) throw new Error('TreeView: container required');
      this.nodes = new Map();         // id -> node
      this.parents = new Map();       // id -> parentId
      this.selection = new Set();
      this.checked = new Set();
      this._root = this._normalize(this.opts.data, null);
      this._draggingId = null;
      this._render();
    }

    // ---------------- data ----------------
    _normalize(list, parentId) {
      const out = [];
      (list || []).forEach((raw) => {
        const node = {
          id: raw.id || _uid(),
          label: raw.label != null ? String(raw.label) : '(unnamed)',
          children: [],
          expanded: !!raw.expanded,
          loaded: !raw.lazy,
          lazy: !!raw.lazy,
          checked: !!raw.checked,
          data: raw.data || null,
          isLeaf: !!raw.isLeaf,
        };
        this.nodes.set(node.id, node);
        this.parents.set(node.id, parentId);
        if (Array.isArray(raw.children) && raw.children.length) {
          node.children = this._normalize(raw.children, node.id);
        }
        if (node.checked) this.checked.add(node.id);
        out.push(node);
      });
      return out;
    }

    setData(list) {
      this.nodes.clear();
      this.parents.clear();
      this.selection.clear();
      this.checked.clear();
      this._root = this._normalize(list, null);
      this._render();
    }

    getNode(id) { return this.nodes.get(id); }
    getCheckedIds() { return Array.from(this.checked); }
    getSelectedIds() { return Array.from(this.selection); }

    // ---------------- render ----------------
    _render() {
      const c = this.opts.container;
      c.innerHTML = '';
      c.classList.add('tv-root');
      if (this.opts.searchable) {
        const inp = document.createElement('input');
        inp.type = 'search';
        inp.placeholder = 'Buscar...';
        inp.className = 'tv-search';
        inp.addEventListener('input', (e) => this.search(e.target.value));
        c.appendChild(inp);
        this._searchInput = inp;
      }
      const ul = document.createElement('ul');
      ul.className = 'tv-list';
      this._listEl = ul;
      this._renderList(this._root, ul, 0);
      c.appendChild(ul);
    }

    _renderList(nodes, parentEl, depth) {
      nodes.forEach((node) => {
        const li = this._renderNode(node, depth);
        parentEl.appendChild(li);
      });
    }

    _renderNode(node, depth) {
      const li = document.createElement('li');
      li.className = 'tv-node';
      li.dataset.id = node.id;

      const row = document.createElement('div');
      row.className = 'tv-row';
      row.style.paddingLeft = (depth * this.opts.indent) + 'px';

      // toggle
      const toggle = document.createElement('span');
      toggle.className = 'tv-toggle';
      const hasKids = node.children.length > 0 || node.lazy;
      if (!hasKids || node.isLeaf) toggle.classList.add('tv-empty');
      toggle.textContent = node.expanded ? this.opts.collapseIcon : this.opts.expandIcon;
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle(node.id);
      });
      row.appendChild(toggle);

      // checkbox
      if (this.opts.checkboxes) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'tv-checkbox';
        cb.checked = this.checked.has(node.id);
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => this._onCheck(node.id, cb.checked));
        row.appendChild(cb);
        node._cbEl = cb;
      }

      // icon
      const ic = document.createElement('span');
      ic.className = 'tv-icon';
      ic.textContent = hasKids ? '' : this.opts.leafIcon;
      row.appendChild(ic);

      // label
      const lbl = document.createElement('span');
      lbl.className = 'tv-label';
      lbl.textContent = node.label;
      row.appendChild(lbl);

      // selection
      if (this.selection.has(node.id)) row.classList.add('tv-selected');
      row.addEventListener('click', (e) => this._onSelect(node.id, e));

      // drag-drop
      if (this.opts.draggable) {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => this._onDragStart(e, node.id));
        row.addEventListener('dragover', (e) => this._onDragOver(e, node.id, row));
        row.addEventListener('dragleave', () => this._clearDropMarks(row));
        row.addEventListener('drop', (e) => this._onDrop(e, node.id, row));
        row.addEventListener('dragend', () => this._clearAllDropMarks());
      }

      li.appendChild(row);
      node._rowEl = row;
      node._labelEl = lbl;
      node._toggleEl = toggle;

      // children container
      const childUl = document.createElement('ul');
      childUl.className = 'tv-children';
      if (!node.expanded) childUl.classList.add('tv-hidden');
      li.appendChild(childUl);
      node._childrenEl = childUl;

      if (node.expanded && node.children.length) {
        this._renderList(node.children, childUl, depth + 1);
      }
      return li;
    }

    // ---------------- expand / collapse ----------------
    toggle(id) {
      const node = this.nodes.get(id);
      if (!node) return;
      if (node.expanded) this.collapse(id);
      else this.expand(id);
    }

    async expand(id) {
      const node = this.nodes.get(id);
      if (!node || node.expanded) return;
      if (this.opts.lazy && !node.loaded && typeof this.opts.lazyLoader === 'function') {
        const loading = document.createElement('div');
        loading.className = 'tv-loading';
        loading.textContent = 'Cargando...';
        node._childrenEl.appendChild(loading);
        node._childrenEl.classList.remove('tv-hidden');
        try {
          const kids = await this.opts.lazyLoader(node);
          node.children = this._normalize(kids || [], node.id);
          node.loaded = true;
          if (typeof this.opts.onLoad === 'function') this.opts.onLoad(node);
        } catch (err) {
          loading.textContent = 'Error: ' + err.message;
          return;
        }
      }
      node.expanded = true;
      node._toggleEl.textContent = this.opts.collapseIcon;
      node._childrenEl.innerHTML = '';
      const depth = this._depthOf(node.id);
      this._renderList(node.children, node._childrenEl, depth + 1);
      node._childrenEl.classList.remove('tv-hidden');
      if (typeof this.opts.onExpand === 'function') this.opts.onExpand(node);
    }

    collapse(id) {
      const node = this.nodes.get(id);
      if (!node || !node.expanded) return;
      node.expanded = false;
      node._toggleEl.textContent = this.opts.expandIcon;
      node._childrenEl.classList.add('tv-hidden');
      if (typeof this.opts.onCollapse === 'function') this.opts.onCollapse(node);
    }

    expandAll() { this.nodes.forEach((n) => { if (n.children.length) this.expand(n.id); }); }
    collapseAll() { this.nodes.forEach((n) => this.collapse(n.id)); }

    _depthOf(id) {
      let d = 0, cur = this.parents.get(id);
      while (cur) { d++; cur = this.parents.get(cur); }
      return d;
    }

    // ---------------- selection ----------------
    _onSelect(id, ev) {
      const node = this.nodes.get(id);
      if (!node) return;
      if (this.opts.multiSelect && (ev.ctrlKey || ev.metaKey)) {
        if (this.selection.has(id)) this.selection.delete(id);
        else this.selection.add(id);
      } else {
        this.selection.forEach((sid) => {
          const n = this.nodes.get(sid);
          if (n && n._rowEl) n._rowEl.classList.remove('tv-selected');
        });
        this.selection.clear();
        this.selection.add(id);
      }
      if (node._rowEl) {
        if (this.selection.has(id)) node._rowEl.classList.add('tv-selected');
        else node._rowEl.classList.remove('tv-selected');
      }
      if (typeof this.opts.onSelect === 'function') this.opts.onSelect(node, this.getSelectedIds());
    }

    // ---------------- checkboxes ----------------
    _onCheck(id, val) {
      const node = this.nodes.get(id);
      if (!node) return;
      this._setChecked(node, val);
      if (this.opts.cascadeChecks) {
        this._cascadeDown(node, val);
        this._cascadeUp(node);
      }
      if (typeof this.opts.onCheck === 'function') this.opts.onCheck(node, val, this.getCheckedIds());
    }

    _setChecked(node, val) {
      node.checked = val;
      if (val) this.checked.add(node.id); else this.checked.delete(node.id);
      if (node._cbEl) { node._cbEl.checked = val; node._cbEl.indeterminate = false; }
    }

    _cascadeDown(node, val) {
      node.children.forEach((c) => { this._setChecked(c, val); this._cascadeDown(c, val); });
    }

    _cascadeUp(node) {
      const pid = this.parents.get(node.id);
      if (!pid) return;
      const parent = this.nodes.get(pid);
      if (!parent) return;
      const total = parent.children.length;
      const checked = parent.children.filter((c) => c.checked).length;
      const partial = parent.children.some((c) => c.checked || (c._cbEl && c._cbEl.indeterminate));
      if (checked === total) { this._setChecked(parent, true); }
      else if (checked === 0 && !partial) { this._setChecked(parent, false); }
      else {
        parent.checked = false;
        this.checked.delete(parent.id);
        if (parent._cbEl) { parent._cbEl.checked = false; parent._cbEl.indeterminate = true; }
      }
      this._cascadeUp(parent);
    }

    // ---------------- drag-drop ----------------
    _onDragStart(e, id) {
      this._draggingId = id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
    }

    _onDragOver(e, targetId, row) {
      if (!this._draggingId || this._draggingId === targetId) return;
      if (this._isDescendant(targetId, this._draggingId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._clearDropMarks(row);
      const r = row.getBoundingClientRect();
      const offset = e.clientY - r.top;
      if (offset < r.height * 0.25) row.classList.add('tv-drop-before');
      else if (offset > r.height * 0.75) row.classList.add('tv-drop-after');
      else row.classList.add('tv-drop-inside');
    }

    _onDrop(e, targetId, row) {
      e.preventDefault();
      const srcId = this._draggingId;
      this._draggingId = null;
      if (!srcId || srcId === targetId) { this._clearAllDropMarks(); return; }
      if (this._isDescendant(targetId, srcId)) { this._clearAllDropMarks(); return; }
      let position = 'inside';
      if (row.classList.contains('tv-drop-before')) position = 'before';
      else if (row.classList.contains('tv-drop-after')) position = 'after';
      this._clearAllDropMarks();
      this.moveNode(srcId, targetId, position);
      if (typeof this.opts.onDrop === 'function') {
        this.opts.onDrop(this.nodes.get(srcId), this.nodes.get(targetId), position);
      }
    }

    _isDescendant(maybeChildId, ancestorId) {
      let p = this.parents.get(maybeChildId);
      while (p) { if (p === ancestorId) return true; p = this.parents.get(p); }
      return maybeChildId === ancestorId;
    }

    _clearDropMarks(row) {
      row.classList.remove('tv-drop-before', 'tv-drop-after', 'tv-drop-inside');
    }
    _clearAllDropMarks() {
      this.opts.container.querySelectorAll('.tv-row').forEach((r) => this._clearDropMarks(r));
    }

    moveNode(srcId, targetId, position) {
      const src = this.nodes.get(srcId);
      const tgt = this.nodes.get(targetId);
      if (!src || !tgt) return;
      // remove from old parent
      const oldPid = this.parents.get(srcId);
      const oldArr = oldPid ? this.nodes.get(oldPid).children : this._root;
      const idx = oldArr.indexOf(src);
      if (idx >= 0) oldArr.splice(idx, 1);
      // insert
      if (position === 'inside') {
        tgt.children.push(src);
        this.parents.set(srcId, targetId);
      } else {
        const newPid = this.parents.get(targetId);
        const arr = newPid ? this.nodes.get(newPid).children : this._root;
        const tIdx = arr.indexOf(tgt);
        arr.splice(position === 'before' ? tIdx : tIdx + 1, 0, src);
        this.parents.set(srcId, newPid);
      }
      this._render();
    }

    // ---------------- search ----------------
    search(term) {
      term = (term || '').trim().toLowerCase();
      const visible = new Set();
      if (!term) {
        this.nodes.forEach((n) => {
          if (n._rowEl) {
            n._rowEl.parentElement.classList.remove('tv-hidden');
            n._labelEl.innerHTML = this._escape(n.label);
          }
        });
        return;
      }
      // mark matches and ancestors
      this.nodes.forEach((n) => {
        if (n.label.toLowerCase().includes(term)) {
          visible.add(n.id);
          let p = this.parents.get(n.id);
          while (p) { visible.add(p); p = this.parents.get(p); }
        }
      });
      this.nodes.forEach((n) => {
        if (!n._rowEl) return;
        const li = n._rowEl.parentElement;
        if (visible.has(n.id)) {
          li.classList.remove('tv-hidden');
          if (n.children.length) {
            n.expanded = true;
            n._toggleEl.textContent = this.opts.collapseIcon;
            n._childrenEl.classList.remove('tv-hidden');
          }
          const i = n.label.toLowerCase().indexOf(term);
          if (i >= 0) {
            const before = this._escape(n.label.slice(0, i));
            const mid = this._escape(n.label.slice(i, i + term.length));
            const after = this._escape(n.label.slice(i + term.length));
            n._labelEl.innerHTML = `${before}<span class="tv-match">${mid}</span>${after}`;
          } else {
            n._labelEl.innerHTML = this._escape(n.label);
          }
        } else {
          li.classList.add('tv-hidden');
        }
      });
    }

    _escape(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    }

    // ---------------- public mutators ----------------
    addNode(parentId, raw) {
      const arr = parentId ? this.nodes.get(parentId).children : this._root;
      const created = this._normalize([raw], parentId || null);
      arr.push(created[0]);
      this._render();
      return created[0];
    }

    removeNode(id) {
      const node = this.nodes.get(id);
      if (!node) return;
      const pid = this.parents.get(id);
      const arr = pid ? this.nodes.get(pid).children : this._root;
      const idx = arr.indexOf(node);
      if (idx >= 0) arr.splice(idx, 1);
      const purge = (n) => {
        this.nodes.delete(n.id);
        this.parents.delete(n.id);
        this.selection.delete(n.id);
        this.checked.delete(n.id);
        n.children.forEach(purge);
      };
      purge(node);
      this._render();
    }

    updateNode(id, patch) {
      const node = this.nodes.get(id);
      if (!node) return;
      Object.assign(node, patch || {});
      this._render();
    }

    destroy() {
      this.opts.container.innerHTML = '';
      this.nodes.clear();
      this.parents.clear();
      this.selection.clear();
      this.checked.clear();
    }
  }

  global.TreeView = {
    create: (opts) => new TreeView(opts),
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
