/**
 * volvix-ui-pivot.js
 * Pivot Table UI component with drag-and-drop fields, aggregations, and expand/collapse.
 *
 * Usage:
 *   const pivot = new PivotTable(document.getElementById('container'), {
 *     data: [{region:'N', product:'A', qty:10, price:100}, ...],
 *     fields: ['region','product','qty','price']
 *   });
 *   pivot.render();
 *
 * Exposes: window.PivotTable
 */
(function (global) {
  'use strict';

  // ---------- Aggregation functions ----------
  const AGGREGATORS = {
    sum: {
      label: 'Sum',
      init: () => ({ s: 0, n: 0 }),
      push: (acc, v) => { const x = +v; if (!isNaN(x)) { acc.s += x; acc.n++; } return acc; },
      value: (acc) => acc.n ? acc.s : 0,
      format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
    },
    avg: {
      label: 'Average',
      init: () => ({ s: 0, n: 0 }),
      push: (acc, v) => { const x = +v; if (!isNaN(x)) { acc.s += x; acc.n++; } return acc; },
      value: (acc) => acc.n ? acc.s / acc.n : 0,
      format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
    },
    count: {
      label: 'Count',
      init: () => ({ n: 0 }),
      push: (acc, v) => { if (v !== null && v !== undefined && v !== '') acc.n++; return acc; },
      value: (acc) => acc.n,
      format: (v) => String(v)
    },
    min: {
      label: 'Min',
      init: () => ({ m: null }),
      push: (acc, v) => { const x = +v; if (!isNaN(x)) acc.m = acc.m === null ? x : Math.min(acc.m, x); return acc; },
      value: (acc) => acc.m === null ? 0 : acc.m,
      format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
    },
    max: {
      label: 'Max',
      init: () => ({ m: null }),
      push: (acc, v) => { const x = +v; if (!isNaN(x)) acc.m = acc.m === null ? x : Math.max(acc.m, x); return acc; },
      value: (acc) => acc.m === null ? 0 : acc.m,
      format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  };

  // ---------- Default styles (injected once) ----------
  const STYLE_ID = 'volvix-pivot-style';
  const CSS = `
    .vpx-root{font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:13px;color:#222}
    .vpx-toolbar{display:flex;gap:12px;flex-wrap:wrap;padding:8px;background:#f4f6fa;border:1px solid #d6dbe4;border-radius:6px;margin-bottom:8px}
    .vpx-zone{flex:1;min-width:140px;background:#fff;border:1px dashed #b3bbcb;border-radius:4px;padding:6px;min-height:48px}
    .vpx-zone.over{background:#eaf3ff;border-color:#3a7bd5}
    .vpx-zone-title{font-weight:600;font-size:11px;color:#5a6478;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .vpx-chip{display:inline-flex;align-items:center;gap:4px;background:#3a7bd5;color:#fff;padding:3px 8px;border-radius:12px;margin:2px;cursor:grab;user-select:none;font-size:12px}
    .vpx-chip.fields{background:#6c757d}
    .vpx-chip .x{cursor:pointer;opacity:.8;font-weight:bold;margin-left:2px}
    .vpx-chip .x:hover{opacity:1}
    .vpx-chip select{background:transparent;color:#fff;border:none;font-size:11px;cursor:pointer}
    .vpx-chip select option{color:#222}
    .vpx-table{border-collapse:collapse;width:100%;background:#fff}
    .vpx-table th,.vpx-table td{border:1px solid #dde2eb;padding:5px 9px;text-align:right;white-space:nowrap}
    .vpx-table th{background:#eef1f6;font-weight:600;text-align:left;position:sticky;top:0}
    .vpx-table td.lbl,.vpx-table th.lbl{text-align:left;font-weight:500}
    .vpx-table tr.total td,.vpx-table tr.total th{background:#fff7d6;font-weight:700}
    .vpx-table tr.subtotal td,.vpx-table tr.subtotal th{background:#f6f8fb;font-weight:600}
    .vpx-toggle{display:inline-block;width:14px;text-align:center;cursor:pointer;color:#3a7bd5;font-weight:bold;margin-right:4px}
    .vpx-empty{padding:24px;text-align:center;color:#888;border:1px dashed #ccc;border-radius:6px}
    .vpx-wrap{overflow:auto;max-height:600px;border:1px solid #d6dbe4;border-radius:6px}
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Core class ----------
  class PivotTable {
    constructor(container, options) {
      if (!container) throw new Error('PivotTable: container required');
      this.container = container;
      this.data = (options && options.data) || [];
      this.fields = (options && options.fields) || (this.data[0] ? Object.keys(this.data[0]) : []);
      this.rows = (options && options.rows) ? options.rows.slice() : [];
      this.cols = (options && options.cols) ? options.cols.slice() : [];
      // values: [{field, agg}]
      this.values = (options && options.values) ? options.values.slice() : [];
      this.collapsed = new Set();
      this._dragData = null;
      injectStyle();
    }

    setData(data, fields) {
      this.data = data || [];
      if (fields) this.fields = fields;
      else if (this.data[0]) this.fields = Object.keys(this.data[0]);
      this.collapsed.clear();
      this.render();
    }

    // ---------- Rendering ----------
    render() {
      this.container.innerHTML = '';
      this.container.classList.add('vpx-root');
      this.container.appendChild(this._renderToolbar());
      const wrap = document.createElement('div');
      wrap.className = 'vpx-wrap';
      wrap.appendChild(this._renderTable());
      this.container.appendChild(wrap);
    }

    _renderToolbar() {
      const tb = document.createElement('div');
      tb.className = 'vpx-toolbar';
      const usedFields = new Set([...this.rows, ...this.cols, ...this.values.map(v => v.field)]);
      const available = this.fields.filter(f => !usedFields.has(f));

      tb.appendChild(this._zone('fields', 'Fields', available, true));
      tb.appendChild(this._zone('rows', 'Rows', this.rows));
      tb.appendChild(this._zone('cols', 'Columns', this.cols));
      tb.appendChild(this._zone('values', 'Values', this.values));
      return tb;
    }

    _zone(kind, title, items, isSource) {
      const z = document.createElement('div');
      z.className = 'vpx-zone';
      z.dataset.kind = kind;
      const t = document.createElement('div');
      t.className = 'vpx-zone-title';
      t.textContent = title;
      z.appendChild(t);

      items.forEach((item, idx) => {
        z.appendChild(this._chip(kind, item, idx, isSource));
      });

      z.addEventListener('dragover', (e) => {
        e.preventDefault();
        z.classList.add('over');
      });
      z.addEventListener('dragleave', () => z.classList.remove('over'));
      z.addEventListener('drop', (e) => {
        e.preventDefault();
        z.classList.remove('over');
        this._handleDrop(kind);
      });
      return z;
    }

    _chip(kind, item, idx, isSource) {
      const chip = document.createElement('span');
      chip.className = 'vpx-chip' + (isSource ? ' fields' : '');
      chip.draggable = true;
      const field = (kind === 'values') ? item.field : item;
      chip.dataset.field = field;
      const label = document.createElement('span');
      label.textContent = field;
      chip.appendChild(label);

      if (kind === 'values') {
        const sel = document.createElement('select');
        Object.keys(AGGREGATORS).forEach(k => {
          const o = document.createElement('option');
          o.value = k;
          o.textContent = AGGREGATORS[k].label;
          if (k === item.agg) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', (e) => {
          this.values[idx].agg = e.target.value;
          this.render();
        });
        sel.addEventListener('mousedown', (e) => e.stopPropagation());
        chip.appendChild(sel);
      }

      if (!isSource) {
        const x = document.createElement('span');
        x.className = 'x';
        x.textContent = '×';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeFrom(kind, idx);
        });
        chip.appendChild(x);
      }

      chip.addEventListener('dragstart', (e) => {
        this._dragData = { fromKind: kind, idx, field, item };
        try { e.dataTransfer.setData('text/plain', field); } catch (_) {}
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => { this._dragData = null; });
      return chip;
    }

    _removeFrom(kind, idx) {
      if (kind === 'rows') this.rows.splice(idx, 1);
      else if (kind === 'cols') this.cols.splice(idx, 1);
      else if (kind === 'values') this.values.splice(idx, 1);
      this.render();
    }

    _handleDrop(toKind) {
      const d = this._dragData;
      if (!d) return;
      const { fromKind, idx, field } = d;
      // Remove from source (unless source is the fields palette)
      if (fromKind === 'rows') this.rows.splice(idx, 1);
      else if (fromKind === 'cols') this.cols.splice(idx, 1);
      else if (fromKind === 'values') this.values.splice(idx, 1);

      if (toKind === 'fields') {
        // Just removed from active zones; nothing to add
      } else if (toKind === 'rows') {
        if (!this.rows.includes(field)) this.rows.push(field);
      } else if (toKind === 'cols') {
        if (!this.cols.includes(field)) this.cols.push(field);
      } else if (toKind === 'values') {
        this.values.push({ field, agg: 'sum' });
      }
      this._dragData = null;
      this.render();
    }

    // ---------- Aggregation ----------
    _computeTree() {
      // Build nested row tree, keyed by row dimension path; each leaf holds col-keyed accumulators per value.
      const root = { children: new Map(), accs: new Map(), key: '__root__', label: 'Total' };
      const colKeysSet = new Set();
      const colKeyTuples = new Map(); // colKey -> array of values for each col field

      const ensureAccs = (node, colKey) => {
        if (!node.accs.has(colKey)) {
          const arr = this.values.map(v => AGGREGATORS[v.agg].init());
          node.accs.set(colKey, arr);
        }
        return node.accs.get(colKey);
      };

      const pushAt = (node, colKey, row) => {
        const accs = ensureAccs(node, colKey);
        this.values.forEach((v, i) => {
          AGGREGATORS[v.agg].push(accs[i], row[v.field]);
        });
      };

      this.data.forEach(row => {
        const colVals = this.cols.map(c => row[c] === undefined || row[c] === null ? '(blank)' : String(row[c]));
        const colKey = colVals.join('||') || '__all__';
        if (!colKeyTuples.has(colKey)) colKeyTuples.set(colKey, colVals);
        colKeysSet.add(colKey);

        // root totals
        pushAt(root, colKey, row);
        pushAt(root, '__total__', row);

        // walk row dims
        let node = root;
        for (let i = 0; i < this.rows.length; i++) {
          const f = this.rows[i];
          const v = row[f] === undefined || row[f] === null ? '(blank)' : String(row[f]);
          if (!node.children.has(v)) {
            node.children.set(v, {
              children: new Map(),
              accs: new Map(),
              key: node.key + '/' + v,
              label: v,
              field: f,
              depth: i
            });
          }
          node = node.children.get(v);
          pushAt(node, colKey, row);
          pushAt(node, '__total__', row);
        }
      });

      // Sort col keys for stable output
      const colKeys = Array.from(colKeysSet).sort();
      return { root, colKeys, colKeyTuples };
    }

    _renderTable() {
      if (!this.values.length) {
        const e = document.createElement('div');
        e.className = 'vpx-empty';
        e.textContent = 'Drag at least one field into the Values zone to build the pivot.';
        return e;
      }

      const { root, colKeys, colKeyTuples } = this._computeTree();
      const table = document.createElement('table');
      table.className = 'vpx-table';

      // Header
      const thead = document.createElement('thead');
      const colSpan = this.values.length;

      // Row 1: column-field labels spanning value count
      const tr1 = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'lbl';
      corner.colSpan = Math.max(1, this.rows.length);
      corner.rowSpan = (this.cols.length || 1) + 1;
      corner.textContent = this.rows.join(' / ') || '(no rows)';
      tr1.appendChild(corner);

      colKeys.forEach(ck => {
        const tuple = colKeyTuples.get(ck) || [];
        const th = document.createElement('th');
        th.colSpan = colSpan;
        th.textContent = tuple.length ? tuple.join(' / ') : 'Value';
        tr1.appendChild(th);
      });
      const totalTh = document.createElement('th');
      totalTh.colSpan = colSpan;
      totalTh.textContent = 'Grand Total';
      tr1.appendChild(totalTh);
      thead.appendChild(tr1);

      // Row 2: value-field/agg labels under each column group
      const tr2 = document.createElement('tr');
      const buildValueHeaders = (parent) => {
        this.values.forEach(v => {
          const th = document.createElement('th');
          th.textContent = AGGREGATORS[v.agg].label + '(' + v.field + ')';
          parent.appendChild(th);
        });
      };
      colKeys.forEach(() => buildValueHeaders(tr2));
      buildValueHeaders(tr2);
      thead.appendChild(tr2);
      table.appendChild(thead);

      // Body
      const tbody = document.createElement('tbody');
      const renderNode = (node, depth, ancestorCollapsed) => {
        // Skip rendering if any ancestor is collapsed
        if (ancestorCollapsed) return;
        const isLeafLike = node.children.size === 0;
        const isCollapsed = this.collapsed.has(node.key);
        const tr = document.createElement('tr');
        if (depth < this.rows.length && !isLeafLike) tr.className = 'subtotal';

        const labelCell = document.createElement('th');
        labelCell.className = 'lbl';
        labelCell.colSpan = Math.max(1, this.rows.length);
        labelCell.style.paddingLeft = (8 + depth * 14) + 'px';

        if (!isLeafLike) {
          const tog = document.createElement('span');
          tog.className = 'vpx-toggle';
          tog.textContent = isCollapsed ? '+' : '−';
          tog.addEventListener('click', () => {
            if (isCollapsed) this.collapsed.delete(node.key);
            else this.collapsed.add(node.key);
            this.render();
          });
          labelCell.appendChild(tog);
        }
        labelCell.appendChild(document.createTextNode(node.label));
        tr.appendChild(labelCell);

        const writeAccs = (colKey) => {
          const accs = node.accs.get(colKey);
          this.values.forEach((v, i) => {
            const td = document.createElement('td');
            const agg = AGGREGATORS[v.agg];
            td.textContent = accs ? agg.format(agg.value(accs[i])) : '';
            tr.appendChild(td);
          });
        };
        colKeys.forEach(ck => writeAccs(ck));
        writeAccs('__total__');
        tbody.appendChild(tr);

        if (!isCollapsed && !isLeafLike) {
          const childKeys = Array.from(node.children.keys()).sort();
          childKeys.forEach(k => renderNode(node.children.get(k), depth + 1, false));
        }
      };

      if (this.rows.length === 0) {
        // Single total row
        const tr = document.createElement('tr');
        tr.className = 'total';
        const lbl = document.createElement('th');
        lbl.className = 'lbl';
        lbl.textContent = 'Total';
        tr.appendChild(lbl);
        const writeAccs = (colKey) => {
          const accs = root.accs.get(colKey);
          this.values.forEach((v, i) => {
            const td = document.createElement('td');
            const agg = AGGREGATORS[v.agg];
            td.textContent = accs ? agg.format(agg.value(accs[i])) : '';
            tr.appendChild(td);
          });
        };
        colKeys.forEach(ck => writeAccs(ck));
        writeAccs('__total__');
        tbody.appendChild(tr);
      } else {
        const childKeys = Array.from(root.children.keys()).sort();
        childKeys.forEach(k => renderNode(root.children.get(k), 0, false));

        // Grand total row
        const trT = document.createElement('tr');
        trT.className = 'total';
        const lbl = document.createElement('th');
        lbl.className = 'lbl';
        lbl.colSpan = Math.max(1, this.rows.length);
        lbl.textContent = 'Grand Total';
        trT.appendChild(lbl);
        const writeAccs = (colKey) => {
          const accs = root.accs.get(colKey);
          this.values.forEach((v, i) => {
            const td = document.createElement('td');
            const agg = AGGREGATORS[v.agg];
            td.textContent = accs ? agg.format(agg.value(accs[i])) : '';
            trT.appendChild(td);
          });
        };
        colKeys.forEach(ck => writeAccs(ck));
        writeAccs('__total__');
        tbody.appendChild(trT);
      }

      table.appendChild(tbody);
      return table;
    }

    // ---------- Public helpers ----------
    expandAll() { this.collapsed.clear(); this.render(); }
    collapseAll() {
      const walk = (node) => {
        if (node.children && node.children.size) {
          this.collapsed.add(node.key);
          node.children.forEach(walk);
        }
      };
      const { root } = this._computeTree();
      root.children.forEach(walk);
      this.render();
    }
    getState() {
      return {
        rows: this.rows.slice(),
        cols: this.cols.slice(),
        values: this.values.map(v => ({ ...v })),
        collapsed: Array.from(this.collapsed)
      };
    }
    setState(s) {
      if (!s) return;
      this.rows = (s.rows || []).slice();
      this.cols = (s.cols || []).slice();
      this.values = (s.values || []).map(v => ({ ...v }));
      this.collapsed = new Set(s.collapsed || []);
      this.render();
    }
  }

  PivotTable.AGGREGATORS = AGGREGATORS;
  global.PivotTable = PivotTable;
})(typeof window !== 'undefined' ? window : this);
