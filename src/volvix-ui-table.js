/* volvix-ui-table.js — DataTable UI component
 * Features: sort, filter, pagination, virtualization, column resize, export (CSV/JSON)
 * Exposes: window.DataTable
 */
(function (global) {
  'use strict';

  const CSS_ID = 'volvix-dt-styles';
  const CSS = `
  .vdt-wrap{font-family:system-ui,Segoe UI,Roboto,sans-serif;border:1px solid #e5e7eb;border-radius:8px;background:#fff;display:flex;flex-direction:column;overflow:hidden}
  .vdt-toolbar{display:flex;gap:8px;padding:8px;border-bottom:1px solid #e5e7eb;align-items:center;flex-wrap:wrap}
  .vdt-toolbar input,.vdt-toolbar select,.vdt-toolbar button{padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff}
  .vdt-toolbar button{cursor:pointer}
  .vdt-toolbar button:hover{background:#f3f4f6}
  .vdt-search{flex:1;min-width:160px}
  .vdt-scroll{overflow:auto;position:relative;flex:1}
  .vdt-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;table-layout:fixed}
  .vdt-table thead th{position:sticky;top:0;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:left;padding:8px;font-weight:600;user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:2}
  .vdt-table tbody td{padding:6px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vdt-table tbody tr:hover{background:#f9fafb}
  .vdt-th-inner{display:flex;align-items:center;gap:4px;cursor:pointer}
  .vdt-sort{font-size:10px;color:#6b7280}
  .vdt-resizer{position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;user-select:none}
  .vdt-resizer:hover{background:#3b82f6}
  .vdt-th{position:relative}
  .vdt-pager{display:flex;gap:6px;align-items:center;padding:8px;border-top:1px solid #e5e7eb;font-size:12px;color:#374151}
  .vdt-pager button{padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer}
  .vdt-pager button:disabled{opacity:.4;cursor:not-allowed}
  .vdt-spacer{flex:1}
  .vdt-empty{padding:32px;text-align:center;color:#9ca3af}
  `;

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function defaultRenderer(v) {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function compare(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function toCSV(rows, cols) {
    const esc = v => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = cols.map(c => esc(c.title || c.key)).join(',');
    const body = rows.map(r => cols.map(c => esc(r[c.key])).join(',')).join('\n');
    return head + '\n' + body;
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  class DataTable {
    constructor(container, options) {
      injectCSS();
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('DataTable: container not found');

      this.opts = Object.assign({
        data: [],
        columns: null,           // [{key,title,width,sortable,filterable,render}]
        pageSize: 50,
        virtualize: true,        // when total rows > pageSize * 4
        rowHeight: 28,
        searchable: true,
        exportable: true,
        emptyText: 'No data'
      }, options || {});

      this.state = {
        sortKey: null,
        sortDir: 1,
        search: '',
        filters: {},             // per-column
        page: 0,
        scrollTop: 0
      };

      this.allRows = this.opts.data.slice();
      this.columns = this._inferColumns(this.opts.columns, this.allRows);
      this.filtered = this.allRows.slice();

      this._build();
      this._refresh();
    }

    _inferColumns(cols, data) {
      if (cols && cols.length) {
        return cols.map(c => Object.assign({
          width: 140, sortable: true, filterable: true, render: defaultRenderer
        }, c));
      }
      const sample = data[0] || {};
      return Object.keys(sample).map(k => ({
        key: k, title: k, width: 140, sortable: true, filterable: true, render: defaultRenderer
      }));
    }

    _build() {
      this.container.innerHTML = '';
      this.root = el('div', { class: 'vdt-wrap' });
      this._buildToolbar();
      this._buildTable();
      this._buildPager();
      this.container.appendChild(this.root);
    }

    _buildToolbar() {
      const tb = el('div', { class: 'vdt-toolbar' });
      if (this.opts.searchable) {
        this.searchInput = el('input', {
          class: 'vdt-search', type: 'search', placeholder: 'Search...',
          oninput: e => { this.state.search = e.target.value; this.state.page = 0; this._refresh(); }
        });
        tb.appendChild(this.searchInput);
      }
      tb.appendChild(el('span', { class: 'vdt-spacer' }));
      this.statusEl = el('span', { class: 'vdt-status' });
      tb.appendChild(this.statusEl);
      if (this.opts.exportable) {
        tb.appendChild(el('button', { onclick: () => this.exportCSV() }, 'CSV'));
        tb.appendChild(el('button', { onclick: () => this.exportJSON() }, 'JSON'));
      }
      this.root.appendChild(tb);
    }

    _buildTable() {
      this.scrollEl = el('div', { class: 'vdt-scroll' });
      this.table = el('table', { class: 'vdt-table' });
      this.colgroup = el('colgroup');
      this.thead = el('thead');
      this.tbody = el('tbody');
      this.table.appendChild(this.colgroup);
      this.table.appendChild(this.thead);
      this.table.appendChild(this.tbody);
      this.scrollEl.appendChild(this.table);
      this.scrollEl.addEventListener('scroll', () => {
        this.state.scrollTop = this.scrollEl.scrollTop;
        if (this._virtualActive) this._renderBody();
      });
      this.root.appendChild(this.scrollEl);
      this._renderHeader();
    }

    _renderHeader() {
      this.colgroup.innerHTML = '';
      this.thead.innerHTML = '';
      this.columns.forEach(c => {
        const col = el('col');
        col.style.width = c.width + 'px';
        this.colgroup.appendChild(col);
      });

      const tr = el('tr');
      this.columns.forEach((c, idx) => {
        const arrow = this.state.sortKey === c.key ? (this.state.sortDir > 0 ? '▲' : '▼') : '';
        const th = el('th', { class: 'vdt-th' });
        const inner = el('div', { class: 'vdt-th-inner' }, [
          el('span', null, c.title || c.key),
          el('span', { class: 'vdt-sort' }, arrow)
        ]);
        if (c.sortable) inner.addEventListener('click', () => this._toggleSort(c.key));
        th.appendChild(inner);
        const resizer = el('div', { class: 'vdt-resizer' });
        resizer.addEventListener('mousedown', e => this._startResize(e, idx));
        th.appendChild(resizer);
        tr.appendChild(th);
      });
      this.thead.appendChild(tr);

      // Filter row
      const fr = el('tr');
      this.columns.forEach(c => {
        const th = el('th', { style: { padding: '4px' } });
        if (c.filterable) {
          const inp = el('input', {
            type: 'text', placeholder: 'filter',
            style: { width: '100%', padding: '3px 6px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '12px' },
            oninput: e => {
              const v = e.target.value;
              if (v) this.state.filters[c.key] = v.toLowerCase();
              else delete this.state.filters[c.key];
              this.state.page = 0;
              this._refresh();
            }
          });
          th.appendChild(inp);
        }
        fr.appendChild(th);
      });
      this.thead.appendChild(fr);
    }

    _startResize(e, idx) {
      e.preventDefault();
      const startX = e.clientX;
      const startW = this.columns[idx].width;
      const move = ev => {
        const w = Math.max(40, startW + (ev.clientX - startX));
        this.columns[idx].width = w;
        this.colgroup.children[idx].style.width = w + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }

    _toggleSort(key) {
      if (this.state.sortKey === key) this.state.sortDir = -this.state.sortDir;
      else { this.state.sortKey = key; this.state.sortDir = 1; }
      this._refresh();
    }

    _buildPager() {
      this.pager = el('div', { class: 'vdt-pager' });
      this.pageInfo = el('span');
      this.firstBtn = el('button', { onclick: () => this._goto(0) }, '«');
      this.prevBtn = el('button', { onclick: () => this._goto(this.state.page - 1) }, '‹');
      this.nextBtn = el('button', { onclick: () => this._goto(this.state.page + 1) }, '›');
      this.lastBtn = el('button', { onclick: () => this._goto(this._pageCount() - 1) }, '»');
      this.sizeSel = el('select', {
        onchange: e => { this.opts.pageSize = +e.target.value; this.state.page = 0; this._refresh(); }
      });
      [25, 50, 100, 200, 500].forEach(n => {
        const o = el('option', { value: n }, n + '/page');
        if (n === this.opts.pageSize) o.selected = true;
        this.sizeSel.appendChild(o);
      });
      this.pager.appendChild(this.pageInfo);
      this.pager.appendChild(el('span', { class: 'vdt-spacer' }));
      this.pager.appendChild(this.sizeSel);
      this.pager.appendChild(this.firstBtn);
      this.pager.appendChild(this.prevBtn);
      this.pager.appendChild(this.nextBtn);
      this.pager.appendChild(this.lastBtn);
      this.root.appendChild(this.pager);
    }

    _goto(p) {
      const max = Math.max(0, this._pageCount() - 1);
      this.state.page = Math.min(Math.max(0, p), max);
      this._renderBody();
      this._renderPager();
    }

    _pageCount() {
      return Math.max(1, Math.ceil(this.filtered.length / this.opts.pageSize));
    }

    _applyFilters() {
      const search = this.state.search.toLowerCase();
      const filters = this.state.filters;
      const fkeys = Object.keys(filters);
      this.filtered = this.allRows.filter(row => {
        if (search) {
          let hit = false;
          for (const c of this.columns) {
            const v = row[c.key];
            if (v != null && String(v).toLowerCase().indexOf(search) !== -1) { hit = true; break; }
          }
          if (!hit) return false;
        }
        for (const k of fkeys) {
          const v = row[k];
          if (v == null || String(v).toLowerCase().indexOf(filters[k]) === -1) return false;
        }
        return true;
      });
      if (this.state.sortKey) {
        const k = this.state.sortKey, d = this.state.sortDir;
        this.filtered.sort((a, b) => d * compare(a[k], b[k]));
      }
    }

    _refresh() {
      this._applyFilters();
      this._renderHeader();
      this._renderBody();
      this._renderPager();
      this._renderStatus();
    }

    _renderStatus() {
      if (this.statusEl) this.statusEl.textContent = `${this.filtered.length} / ${this.allRows.length} rows`;
    }

    _renderPager() {
      const pc = this._pageCount();
      this.pageInfo.textContent = `Page ${this.state.page + 1} of ${pc}`;
      this.firstBtn.disabled = this.state.page <= 0;
      this.prevBtn.disabled = this.state.page <= 0;
      this.nextBtn.disabled = this.state.page >= pc - 1;
      this.lastBtn.disabled = this.state.page >= pc - 1;
    }

    _renderBody() {
      const tb = this.tbody;
      const rows = this.filtered;
      if (!rows.length) {
        tb.innerHTML = '';
        const tr = el('tr');
        const td = el('td', { colspan: this.columns.length, class: 'vdt-empty' }, this.opts.emptyText);
        tr.appendChild(td);
        tb.appendChild(tr);
        return;
      }

      const start = this.state.page * this.opts.pageSize;
      const pageRows = rows.slice(start, start + this.opts.pageSize);
      const useVirtual = this.opts.virtualize && pageRows.length > 200;
      this._virtualActive = useVirtual;

      tb.innerHTML = '';

      if (!useVirtual) {
        const frag = document.createDocumentFragment();
        pageRows.forEach(r => frag.appendChild(this._renderRow(r)));
        tb.appendChild(frag);
        return;
      }

      // Virtualization
      const rh = this.opts.rowHeight;
      const total = pageRows.length;
      const viewH = this.scrollEl.clientHeight || 400;
      const top = this.state.scrollTop;
      const startIdx = Math.max(0, Math.floor(top / rh) - 5);
      const endIdx = Math.min(total, Math.ceil((top + viewH) / rh) + 5);

      const padTop = el('tr', { style: { height: (startIdx * rh) + 'px' } });
      padTop.appendChild(el('td', { colspan: this.columns.length }));
      tb.appendChild(padTop);

      for (let i = startIdx; i < endIdx; i++) tb.appendChild(this._renderRow(pageRows[i]));

      const padBot = el('tr', { style: { height: ((total - endIdx) * rh) + 'px' } });
      padBot.appendChild(el('td', { colspan: this.columns.length }));
      tb.appendChild(padBot);
    }

    _renderRow(r) {
      const tr = el('tr');
      this.columns.forEach(c => {
        const td = el('td');
        const v = c.render ? c.render(r[c.key], r) : defaultRenderer(r[c.key]);
        if (v instanceof Node) td.appendChild(v);
        else td.textContent = v;
        tr.appendChild(td);
      });
      return tr;
    }

    // Public API
    setData(rows) {
      this.allRows = (rows || []).slice();
      this.state.page = 0;
      if (!this.opts.columns) this.columns = this._inferColumns(null, this.allRows);
      this._refresh();
    }

    addRow(row) { this.allRows.push(row); this._refresh(); }

    removeRow(predicate) {
      this.allRows = this.allRows.filter(r => !predicate(r));
      this._refresh();
    }

    getFiltered() { return this.filtered.slice(); }

    exportCSV(filename) {
      download(filename || 'datatable.csv', toCSV(this.filtered, this.columns), 'text/csv');
    }

    exportJSON(filename) {
      download(filename || 'datatable.json', JSON.stringify(this.filtered, null, 2), 'application/json');
    }

    destroy() {
      this.container.innerHTML = '';
    }
  }

  global.DataTable = DataTable;
})(typeof window !== 'undefined' ? window : this);
