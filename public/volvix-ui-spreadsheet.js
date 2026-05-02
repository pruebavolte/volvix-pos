/**
 * volvix-ui-spreadsheet.js
 * UI Spreadsheet Excel-like para Volvix POS
 * Cells edit, fórmulas básicas (SUM, AVG, MIN, MAX, COUNT, PRODUCT, IF),
 * formato (bold, italic, color, bg, align), export CSV/JSON.
 *
 * Uso:
 *   const sheet = new window.Spreadsheet('#container', { rows: 50, cols: 20 });
 *   sheet.setCell('A1', 100);
 *   sheet.setCell('A2', 200);
 *   sheet.setCell('A3', '=SUM(A1:A2)');
 *   sheet.exportCSV();
 */
(function (global) {
  'use strict';

  // ========== Utilidades de direcciones ==========
  function colToLetter(col) {
    let s = '';
    col = col + 1;
    while (col > 0) {
      const r = (col - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      col = Math.floor((col - 1) / 26);
    }
    return s;
  }

  function letterToCol(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) {
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n - 1;
  }

  function parseRef(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
    if (!m) return null;
    return { col: letterToCol(m[1]), row: parseInt(m[2], 10) - 1 };
  }

  function refToKey(col, row) {
    return colToLetter(col) + (row + 1);
  }

  function expandRange(ref) {
    const parts = ref.split(':');
    if (parts.length !== 2) {
      const p = parseRef(parts[0]);
      return p ? [p] : [];
    }
    const a = parseRef(parts[0]);
    const b = parseRef(parts[1]);
    if (!a || !b) return [];
    const cells = [];
    const r1 = Math.min(a.row, b.row);
    const r2 = Math.max(a.row, b.row);
    const c1 = Math.min(a.col, b.col);
    const c2 = Math.max(a.col, b.col);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        cells.push({ col: c, row: r });
      }
    }
    return cells;
  }

  // ========== Motor de fórmulas ==========
  const FUNCTIONS = {
    SUM: (a) => a.reduce((s, v) => s + (Number(v) || 0), 0),
    AVG: (a) => a.length ? FUNCTIONS.SUM(a) / a.length : 0,
    AVERAGE: (a) => FUNCTIONS.AVG(a),
    MIN: (a) => a.length ? Math.min(...a.map(Number)) : 0,
    MAX: (a) => a.length ? Math.max(...a.map(Number)) : 0,
    COUNT: (a) => a.filter((v) => v !== '' && v !== null && !isNaN(Number(v))).length,
    COUNTA: (a) => a.filter((v) => v !== '' && v !== null && v !== undefined).length,
    PRODUCT: (a) => a.reduce((p, v) => p * (Number(v) || 0), 1),
    ABS: (a) => Math.abs(Number(a[0]) || 0),
    ROUND: (a) => {
      const n = Number(a[0]) || 0;
      const d = Number(a[1]) || 0;
      const f = Math.pow(10, d);
      return Math.round(n * f) / f;
    },
    IF: (a) => (a[0] ? a[1] : a[2]),
    CONCAT: (a) => a.map(String).join(''),
    CONCATENATE: (a) => FUNCTIONS.CONCAT(a),
    LEN: (a) => String(a[0] || '').length,
    UPPER: (a) => String(a[0] || '').toUpperCase(),
    LOWER: (a) => String(a[0] || '').toLowerCase(),
    NOW: () => new Date().toISOString(),
    TODAY: () => new Date().toISOString().split('T')[0],
    PI: () => Math.PI,
    SQRT: (a) => Math.sqrt(Number(a[0]) || 0),
    POWER: (a) => Math.pow(Number(a[0]) || 0, Number(a[1]) || 0),
  };

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let n = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) n += expr[i++];
        tokens.push({ type: 'num', value: parseFloat(n) });
        continue;
      }
      if (c === '"') {
        let s = ''; i++;
        while (i < expr.length && expr[i] !== '"') s += expr[i++];
        i++;
        tokens.push({ type: 'str', value: s });
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let id = '';
        while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) id += expr[i++];
        // Posible referencia tipo A1 o A1:B5
        if (/^[A-Za-z]+$/.test(id) && i < expr.length && /[0-9]/.test(expr[i])) {
          let num = '';
          while (i < expr.length && /[0-9]/.test(expr[i])) num += expr[i++];
          let ref = id + num;
          if (expr[i] === ':') {
            i++;
            let id2 = '';
            while (i < expr.length && /[A-Za-z]/.test(expr[i])) id2 += expr[i++];
            let num2 = '';
            while (i < expr.length && /[0-9]/.test(expr[i])) num2 += expr[i++];
            ref += ':' + id2 + num2;
            tokens.push({ type: 'range', value: ref });
          } else {
            tokens.push({ type: 'ref', value: ref });
          }
        } else {
          tokens.push({ type: 'fn', value: id.toUpperCase() });
        }
        continue;
      }
      if ('+-*/(),%^<>='.indexOf(c) >= 0) {
        // Operadores compuestos
        if ((c === '<' || c === '>' || c === '=' || c === '!') && expr[i + 1] === '=') {
          tokens.push({ type: 'op', value: c + '=' });
          i += 2;
          continue;
        }
        if (c === '<' && expr[i + 1] === '>') {
          tokens.push({ type: 'op', value: '<>' });
          i += 2;
          continue;
        }
        tokens.push({ type: 'op', value: c });
        i++;
        continue;
      }
      i++;
    }
    return tokens;
  }

  function evaluateFormula(formula, getCellValue, visiting) {
    visiting = visiting || new Set();
    const expr = formula.replace(/^=/, '');
    const tokens = tokenize(expr);
    let pos = 0;

    function peek() { return tokens[pos]; }
    function eat() { return tokens[pos++]; }

    function resolveRef(ref) {
      if (visiting.has(ref)) return '#CIRC';
      const p = parseRef(ref);
      if (!p) return 0;
      const v = getCellValue(p.col, p.row, new Set([...visiting, ref]));
      const n = Number(v);
      return isNaN(n) ? (v || 0) : n;
    }

    function resolveRange(ref) {
      const cells = expandRange(ref);
      return cells.map((c) => {
        const k = refToKey(c.col, c.row);
        if (visiting.has(k)) return 0;
        const v = getCellValue(c.col, c.row, new Set([...visiting, k]));
        const n = Number(v);
        return isNaN(n) ? v : n;
      });
    }

    function parseAtom() {
      const t = eat();
      if (!t) return 0;
      if (t.type === 'num') return t.value;
      if (t.type === 'str') return t.value;
      if (t.type === 'ref') return resolveRef(t.value);
      if (t.type === 'range') return resolveRange(t.value);
      if (t.type === 'op' && t.value === '-') return -parseAtom();
      if (t.type === 'op' && t.value === '+') return parseAtom();
      if (t.type === 'op' && t.value === '(') {
        const v = parseExpr();
        eat();
        return v;
      }
      if (t.type === 'fn') {
        if (peek() && peek().value === '(') {
          eat();
          const args = [];
          if (!peek() || peek().value !== ')') {
            args.push(parseExpr());
            while (peek() && peek().value === ',') { eat(); args.push(parseExpr()); }
          }
          eat();
          let flat = [];
          args.forEach((a) => Array.isArray(a) ? flat = flat.concat(a) : flat.push(a));
          const fn = FUNCTIONS[t.value];
          if (!fn) return '#NAME?';
          try { return fn(flat); } catch (e) { return '#ERR'; }
        }
        return 0;
      }
      return 0;
    }

    function parsePower() {
      let left = parseAtom();
      while (peek() && peek().value === '^') { eat(); left = Math.pow(left, parseAtom()); }
      return left;
    }
    function parseMul() {
      let left = parsePower();
      while (peek() && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
        const op = eat().value;
        const right = parsePower();
        if (op === '*') left = left * right;
        else if (op === '/') left = right === 0 ? '#DIV/0' : left / right;
        else left = left % right;
      }
      return left;
    }
    function parseAdd() {
      let left = parseMul();
      while (peek() && (peek().value === '+' || peek().value === '-')) {
        const op = eat().value;
        const right = parseMul();
        if (typeof left === 'string' || typeof right === 'string') {
          left = (op === '+') ? (left + right) : (Number(left) - Number(right));
        } else {
          left = op === '+' ? left + right : left - right;
        }
      }
      return left;
    }
    function parseCmp() {
      let left = parseAdd();
      while (peek() && ['=', '<', '>', '<=', '>=', '<>', '!='].indexOf(peek().value) >= 0) {
        const op = eat().value;
        const right = parseAdd();
        if (op === '=') left = left == right;
        else if (op === '<>' || op === '!=') left = left != right;
        else if (op === '<') left = left < right;
        else if (op === '>') left = left > right;
        else if (op === '<=') left = left <= right;
        else if (op === '>=') left = left >= right;
      }
      return left;
    }
    function parseExpr() { return parseCmp(); }

    try {
      return parseExpr();
    } catch (e) {
      return '#ERR';
    }
  }

  // ========== Spreadsheet ==========
  function Spreadsheet(container, options) {
    this.opts = Object.assign({ rows: 50, cols: 20, defaultColWidth: 90, rowHeight: 26 }, options || {});
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('Spreadsheet: container no encontrado');
    this.cells = {};
    this.formats = {};
    this.selected = { col: 0, row: 0 };
    this.editing = null;
    this._buildDOM();
    this._render();
    this._bindEvents();
  }

  Spreadsheet.prototype._buildDOM = function () {
    const c = this.container;
    c.innerHTML = '';
    c.classList.add('vx-sheet');
    const style = document.createElement('style');
    style.textContent = `
      .vx-sheet{font-family:Arial,sans-serif;font-size:12px;user-select:none;display:flex;flex-direction:column;height:100%;border:1px solid #ccc;background:#fff;}
      .vx-toolbar{display:flex;gap:4px;padding:6px;background:#f3f3f3;border-bottom:1px solid #ccc;flex-wrap:wrap;align-items:center;}
      .vx-toolbar button,.vx-toolbar select,.vx-toolbar input{font-size:12px;padding:4px 8px;border:1px solid #bbb;background:#fff;cursor:pointer;border-radius:3px;}
      .vx-toolbar button:hover{background:#e8e8e8;}
      .vx-formula-bar{display:flex;padding:4px;background:#fafafa;border-bottom:1px solid #ccc;align-items:center;gap:6px;}
      .vx-cell-name{width:70px;padding:3px 6px;border:1px solid #ccc;background:#fff;font-weight:bold;}
      .vx-formula-input{flex:1;padding:3px 6px;border:1px solid #ccc;font-family:Consolas,monospace;}
      .vx-grid-wrap{flex:1;overflow:auto;}
      .vx-grid{border-collapse:collapse;table-layout:fixed;}
      .vx-grid th,.vx-grid td{border:1px solid #d0d0d0;padding:2px 4px;height:${this.opts.rowHeight}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#fff;}
      .vx-grid th{background:#f0f0f0;font-weight:600;text-align:center;position:sticky;top:0;z-index:2;}
      .vx-grid th.vx-row-h{position:sticky;left:0;z-index:1;width:40px;}
      .vx-grid th.vx-corner{left:0;z-index:3;}
      .vx-grid td.vx-selected{outline:2px solid #1a73e8;outline-offset:-2px;background:#e8f0fe;}
      .vx-grid td.vx-num{text-align:right;}
      .vx-grid td input{width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;}
      .vx-status{padding:4px 8px;background:#f3f3f3;border-top:1px solid #ccc;font-size:11px;color:#555;}
    `;
    c.appendChild(style);

    const tb = document.createElement('div');
    tb.className = 'vx-toolbar';
    tb.innerHTML = `
      <button data-cmd="bold"><b>B</b></button>
      <button data-cmd="italic"><i>I</i></button>
      <button data-cmd="underline"><u>U</u></button>
      <button data-cmd="alignLeft">⬅</button>
      <button data-cmd="alignCenter">⬌</button>
      <button data-cmd="alignRight">➡</button>
      <input type="color" data-cmd="color" title="Color texto" value="#000000">
      <input type="color" data-cmd="bg" title="Fondo" value="#ffffff">
      <select data-cmd="fontSize">
        <option value="">Tamaño</option>
        <option>10</option><option selected>12</option><option>14</option><option>16</option><option>18</option><option>24</option>
      </select>
      <button data-cmd="clearFmt">Limpiar formato</button>
      <span style="flex:1"></span>
      <button data-cmd="exportCSV">CSV</button>
      <button data-cmd="exportJSON">JSON</button>
      <button data-cmd="importCSV">Importar CSV</button>
    `;
    c.appendChild(tb);
    this.toolbar = tb;

    const fb = document.createElement('div');
    fb.className = 'vx-formula-bar';
    fb.innerHTML = `<div class="vx-cell-name">A1</div><input class="vx-formula-input" type="text" placeholder="Fórmula o valor (ej: =SUM(A1:A10))">`;
    c.appendChild(fb);
    this.cellName = fb.querySelector('.vx-cell-name');
    this.formulaInput = fb.querySelector('.vx-formula-input');

    const wrap = document.createElement('div');
    wrap.className = 'vx-grid-wrap';
    const tbl = document.createElement('table');
    tbl.className = 'vx-grid';
    wrap.appendChild(tbl);
    c.appendChild(wrap);
    this.grid = tbl;

    const status = document.createElement('div');
    status.className = 'vx-status';
    status.textContent = 'Listo';
    c.appendChild(status);
    this.statusBar = status;
  };

  Spreadsheet.prototype._render = function () {
    const { rows, cols, defaultColWidth } = this.opts;
    let html = '<thead><tr><th class="vx-row-h vx-corner"></th>';
    for (let c = 0; c < cols; c++) {
      html += `<th style="width:${defaultColWidth}px">${colToLetter(c)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let r = 0; r < rows; r++) {
      html += `<tr><th class="vx-row-h">${r + 1}</th>`;
      for (let c = 0; c < cols; c++) {
        const k = refToKey(c, r);
        const v = this._displayValue(c, r);
        const fmt = this.formats[k] || {};
        const styles = this._formatToStyle(fmt);
        const isNum = typeof this._evalCell(c, r) === 'number';
        html += `<td data-col="${c}" data-row="${r}" class="${isNum ? 'vx-num' : ''}" style="${styles}">${escapeHTML(String(v))}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
    this.grid.innerHTML = html;
    this._highlightSelection();
  };

  Spreadsheet.prototype._formatToStyle = function (fmt) {
    let s = '';
    if (fmt.bold) s += 'font-weight:bold;';
    if (fmt.italic) s += 'font-style:italic;';
    if (fmt.underline) s += 'text-decoration:underline;';
    if (fmt.align) s += `text-align:${fmt.align};`;
    if (fmt.color) s += `color:${fmt.color};`;
    if (fmt.bg) s += `background:${fmt.bg};`;
    if (fmt.fontSize) s += `font-size:${fmt.fontSize}px;`;
    return s;
  };

  function escapeHTML(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  Spreadsheet.prototype._displayValue = function (col, row) {
    const v = this._evalCell(col, row);
    if (v === '' || v === null || v === undefined) return '';
    return v;
  };

  Spreadsheet.prototype._evalCell = function (col, row, visiting) {
    const k = refToKey(col, row);
    const raw = this.cells[k];
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw === 'string' && raw.startsWith('=')) {
      return evaluateFormula(raw, (c, r, v) => this._evalCell(c, r, v), visiting);
    }
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  };

  Spreadsheet.prototype._highlightSelection = function () {
    this.grid.querySelectorAll('td.vx-selected').forEach((el) => el.classList.remove('vx-selected'));
    const td = this.grid.querySelector(`td[data-col="${this.selected.col}"][data-row="${this.selected.row}"]`);
    if (td) td.classList.add('vx-selected');
    const k = refToKey(this.selected.col, this.selected.row);
    this.cellName.textContent = k;
    this.formulaInput.value = this.cells[k] || '';
  };

  Spreadsheet.prototype._bindEvents = function () {
    const self = this;
    this.grid.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-col]');
      if (!td) return;
      self.selected = { col: +td.dataset.col, row: +td.dataset.row };
      self._highlightSelection();
    });
    this.grid.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td[data-col]');
      if (!td) return;
      self._editCell(+td.dataset.col, +td.dataset.row);
    });
    this.formulaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const k = refToKey(self.selected.col, self.selected.row);
        self.cells[k] = self.formulaInput.value;
        self._render();
        self._setStatus('Celda ' + k + ' actualizada');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (self.editing) return;
      if (!self.container.contains(document.activeElement) && document.activeElement !== document.body) return;
      const s = self.selected;
      let handled = true;
      if (e.key === 'ArrowUp') s.row = Math.max(0, s.row - 1);
      else if (e.key === 'ArrowDown') s.row = Math.min(self.opts.rows - 1, s.row + 1);
      else if (e.key === 'ArrowLeft') s.col = Math.max(0, s.col - 1);
      else if (e.key === 'ArrowRight' || e.key === 'Tab') s.col = Math.min(self.opts.cols - 1, s.col + 1);
      else if (e.key === 'Enter') self._editCell(s.col, s.row);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        delete self.cells[refToKey(s.col, s.row)];
        self._render();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        self._editCell(s.col, s.row, e.key);
      } else handled = false;
      if (handled) { e.preventDefault(); self._highlightSelection(); }
    });

    this.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
      self._handleCommand(btn.dataset.cmd);
    });
    this.toolbar.addEventListener('change', (e) => {
      const el = e.target.closest('[data-cmd]');
      if (!el) return;
      self._handleCommand(el.dataset.cmd, el.value);
    });
  };

  Spreadsheet.prototype._editCell = function (col, row, initial) {
    const td = this.grid.querySelector(`td[data-col="${col}"][data-row="${row}"]`);
    if (!td) return;
    const k = refToKey(col, row);
    const current = initial !== undefined ? initial : (this.cells[k] || '');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = current;
    td.innerHTML = '';
    td.appendChild(inp);
    inp.focus();
    if (initial === undefined) inp.select();
    this.editing = { col, row, input: inp };
    const finish = (commit, advance) => {
      if (!this.editing) return;
      if (commit) this.cells[k] = inp.value;
      this.editing = null;
      this._render();
      if (advance === 'down') this.selected.row = Math.min(this.opts.rows - 1, row + 1);
      else if (advance === 'right') this.selected.col = Math.min(this.opts.cols - 1, col + 1);
      this._highlightSelection();
    };
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, 'right'); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  };

  Spreadsheet.prototype._handleCommand = function (cmd, val) {
    const k = refToKey(this.selected.col, this.selected.row);
    const fmt = this.formats[k] = this.formats[k] || {};
    switch (cmd) {
      case 'bold': fmt.bold = !fmt.bold; break;
      case 'italic': fmt.italic = !fmt.italic; break;
      case 'underline': fmt.underline = !fmt.underline; break;
      case 'alignLeft': fmt.align = 'left'; break;
      case 'alignCenter': fmt.align = 'center'; break;
      case 'alignRight': fmt.align = 'right'; break;
      case 'color': fmt.color = val; break;
      case 'bg': fmt.bg = val; break;
      case 'fontSize': fmt.fontSize = val; break;
      case 'clearFmt': delete this.formats[k]; break;
      case 'exportCSV': this.exportCSV(); return;
      case 'exportJSON': this.exportJSON(); return;
      case 'importCSV': this._importCSVDialog(); return;
    }
    this._render();
  };

  Spreadsheet.prototype._setStatus = function (msg) { this.statusBar.textContent = msg; };

  // ========== API pública ==========
  Spreadsheet.prototype.setCell = function (ref, value) {
    const p = parseRef(ref);
    if (!p) return;
    this.cells[ref.toUpperCase()] = value;
    this._render();
  };

  Spreadsheet.prototype.getCell = function (ref) {
    const p = parseRef(ref);
    if (!p) return null;
    return this._evalCell(p.col, p.row);
  };

  Spreadsheet.prototype.getRaw = function (ref) {
    return this.cells[ref.toUpperCase()];
  };

  Spreadsheet.prototype.setFormat = function (ref, fmt) {
    this.formats[ref.toUpperCase()] = Object.assign(this.formats[ref.toUpperCase()] || {}, fmt);
    this._render();
  };

  Spreadsheet.prototype.clear = function () {
    this.cells = {}; this.formats = {}; this._render();
  };

  Spreadsheet.prototype.toCSV = function () {
    const { rows, cols } = this.opts;
    let maxR = 0, maxC = 0;
    Object.keys(this.cells).forEach((k) => {
      const p = parseRef(k);
      if (p) { maxR = Math.max(maxR, p.row); maxC = Math.max(maxC, p.col); }
    });
    const out = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const v = this._evalCell(c, r);
        const s = String(v == null ? '' : v);
        row.push(/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      }
      out.push(row.join(','));
    }
    return out.join('\n');
  };

  Spreadsheet.prototype.exportCSV = function (filename) {
    const csv = this.toCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this._download(blob, filename || 'spreadsheet.csv');
    this._setStatus('Exportado CSV');
  };

  Spreadsheet.prototype.exportJSON = function (filename) {
    const data = { cells: this.cells, formats: this.formats, opts: this.opts };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this._download(blob, filename || 'spreadsheet.json');
    this._setStatus('Exportado JSON');
  };

  Spreadsheet.prototype.importJSON = function (data) {
    if (typeof data === 'string') data = JSON.parse(data);
    this.cells = data.cells || {};
    this.formats = data.formats || {};
    this._render();
  };

  Spreadsheet.prototype.importCSV = function (text) {
    this.cells = {};
    const rows = text.split(/\r?\n/);
    rows.forEach((line, r) => {
      const cells = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === ',') { cells.push(cur); cur = ''; }
          else cur += ch;
        }
      }
      cells.push(cur);
      cells.forEach((v, c) => { if (v !== '') this.cells[refToKey(c, r)] = v; });
    });
    this._render();
  };

  Spreadsheet.prototype._importCSVDialog = function () {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { this.importCSV(fr.result); this._setStatus('CSV importado'); };
      fr.readAsText(f);
    };
    inp.click();
  };

  Spreadsheet.prototype._download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Exponer helpers
  Spreadsheet.utils = { colToLetter, letterToCol, parseRef, expandRange, evaluateFormula };
  Spreadsheet.FUNCTIONS = FUNCTIONS;

  global.Spreadsheet = Spreadsheet;
})(typeof window !== 'undefined' ? window : this);
