/**
 * volvix-ui-diff.js
 * UI Diff viewer side-by-side con resaltado de líneas añadidas/eliminadas/modificadas
 * y diff a nivel de palabra dentro de líneas modificadas.
 *
 * API pública:
 *   window.DiffViewer.render(container, leftText, rightText, options)
 *   window.DiffViewer.diffLines(a, b)
 *   window.DiffViewer.diffWords(a, b)
 *   window.DiffViewer.injectStyles()
 *
 * Sin dependencias. Vanilla JS. Compatible con navegadores modernos.
 */
(function (global) {
  'use strict';

  // ---------- Estilos ----------
  var STYLE_ID = 'volvix-diff-styles';
  var CSS = [
    '.vx-diff{font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.5;',
    'border:1px solid #2a2f3a;border-radius:8px;overflow:hidden;background:#0e1117;color:#d6deeb;}',
    '.vx-diff-head{display:flex;background:#161b22;border-bottom:1px solid #2a2f3a;}',
    '.vx-diff-head>div{flex:1;padding:8px 12px;font-weight:600;color:#a6accd;}',
    '.vx-diff-body{display:grid;grid-template-columns:1fr 1fr;gap:0;}',
    '.vx-diff-side{overflow:auto;max-height:600px;}',
    '.vx-diff-row{display:flex;min-height:20px;border-left:3px solid transparent;}',
    '.vx-diff-row .vx-ln{flex:0 0 44px;text-align:right;padding:0 8px;color:#5a6376;',
    'background:#0b0e13;user-select:none;border-right:1px solid #1c2129;}',
    '.vx-diff-row .vx-code{flex:1;padding:0 10px;white-space:pre-wrap;word-break:break-word;}',
    '.vx-row-add{background:rgba(46,160,67,.18);border-left-color:#2ea043;}',
    '.vx-row-del{background:rgba(248,81,73,.18);border-left-color:#f85149;}',
    '.vx-row-chg{background:rgba(210,153,34,.15);border-left-color:#d29922;}',
    '.vx-row-eq{background:transparent;}',
    '.vx-row-empty{background:#0a0d12;color:#3a4150;}',
    '.vx-w-add{background:rgba(46,160,67,.45);border-radius:2px;padding:0 1px;}',
    '.vx-w-del{background:rgba(248,81,73,.45);border-radius:2px;padding:0 1px;text-decoration:line-through;}',
    '.vx-diff-stats{display:flex;gap:14px;padding:6px 12px;background:#0b0e13;',
    'border-top:1px solid #2a2f3a;font-size:11px;color:#8a93a6;}',
    '.vx-stat-add{color:#2ea043;}.vx-stat-del{color:#f85149;}.vx-stat-chg{color:#d29922;}'
  ].join('');

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitLines(text) {
    if (text == null) return [];
    return String(text).split(/\r?\n/);
  }

  function splitWords(line) {
    // Divide por espacios y signos pero conserva los separadores
    var parts = line.split(/(\s+|[.,;:(){}\[\]<>"'`])/g);
    return parts.filter(function (p) { return p !== ''; });
  }

  // ---------- LCS (programación dinámica) ----------
  // Devuelve la matriz LCS para reconstruir alineación
  function lcsMatrix(a, b, eq) {
    var n = a.length, m = b.length;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) {
      dp[i] = new Int32Array(m + 1);
    }
    for (var i2 = 1; i2 <= n; i2++) {
      for (var j = 1; j <= m; j++) {
        if (eq(a[i2 - 1], b[j - 1])) {
          dp[i2][j] = dp[i2 - 1][j - 1] + 1;
        } else {
          dp[i2][j] = dp[i2 - 1][j] >= dp[i2][j - 1] ? dp[i2 - 1][j] : dp[i2][j - 1];
        }
      }
    }
    return dp;
  }

  // Backtracking: produce una secuencia de operaciones {op, a, b}
  // op: 'eq' | 'add' | 'del'
  function lcsDiff(a, b, eq) {
    eq = eq || function (x, y) { return x === y; };
    var dp = lcsMatrix(a, b, eq);
    var i = a.length, j = b.length;
    var ops = [];
    while (i > 0 && j > 0) {
      if (eq(a[i - 1], b[j - 1])) {
        ops.push({ op: 'eq', a: a[i - 1], b: b[j - 1], ai: i - 1, bi: j - 1 });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        ops.push({ op: 'del', a: a[i - 1], ai: i - 1 });
        i--;
      } else {
        ops.push({ op: 'add', b: b[j - 1], bi: j - 1 });
        j--;
      }
    }
    while (i > 0) { ops.push({ op: 'del', a: a[i - 1], ai: i - 1 }); i--; }
    while (j > 0) { ops.push({ op: 'add', b: b[j - 1], bi: j - 1 }); j--; }
    ops.reverse();
    return ops;
  }

  // ---------- Diff a nivel línea ----------
  function diffLines(left, right) {
    var a = splitLines(left);
    var b = splitLines(right);
    return lcsDiff(a, b);
  }

  // ---------- Diff a nivel palabra ----------
  function diffWords(left, right) {
    var a = splitWords(String(left || ''));
    var b = splitWords(String(right || ''));
    return lcsDiff(a, b);
  }

  function renderWordDiffHtml(ops, side) {
    var out = '';
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o.op === 'eq') {
        out += escapeHtml(o.a);
      } else if (o.op === 'add' && side === 'right') {
        out += '<span class="vx-w-add">' + escapeHtml(o.b) + '</span>';
      } else if (o.op === 'del' && side === 'left') {
        out += '<span class="vx-w-del">' + escapeHtml(o.a) + '</span>';
      }
    }
    return out;
  }

  // ---------- Pareo de bloques add/del en bloques cambio ----------
  // Convierte secuencias del estilo [del,del,add,add] en pares 'chg'.
  function pairChanges(ops) {
    var rows = [];
    var i = 0;
    while (i < ops.length) {
      var o = ops[i];
      if (o.op === 'eq') {
        rows.push({ kind: 'eq', left: o.a, right: o.b });
        i++;
        continue;
      }
      // Recolectar bloque consecutivo de add/del
      var dels = [];
      var adds = [];
      while (i < ops.length && ops[i].op !== 'eq') {
        if (ops[i].op === 'del') dels.push(ops[i].a);
        else adds.push(ops[i].b);
        i++;
      }
      var pairs = Math.min(dels.length, adds.length);
      for (var p = 0; p < pairs; p++) {
        rows.push({ kind: 'chg', left: dels[p], right: adds[p] });
      }
      for (var d = pairs; d < dels.length; d++) {
        rows.push({ kind: 'del', left: dels[d], right: null });
      }
      for (var a2 = pairs; a2 < adds.length; a2++) {
        rows.push({ kind: 'add', left: null, right: adds[a2] });
      }
    }
    return rows;
  }

  // ---------- Render ----------
  function rowHtml(row, lnLeft, lnRight) {
    var leftClass = 'vx-row-eq', rightClass = 'vx-row-eq';
    var leftHtml = '', rightHtml = '';
    var leftLn = lnLeft != null ? lnLeft : '';
    var rightLn = lnRight != null ? lnRight : '';

    switch (row.kind) {
      case 'eq':
        leftHtml = escapeHtml(row.left);
        rightHtml = escapeHtml(row.right);
        break;
      case 'add':
        leftClass = 'vx-row-empty';
        rightClass = 'vx-row-add';
        rightHtml = escapeHtml(row.right);
        leftLn = '';
        break;
      case 'del':
        leftClass = 'vx-row-del';
        rightClass = 'vx-row-empty';
        leftHtml = escapeHtml(row.left);
        rightLn = '';
        break;
      case 'chg':
        leftClass = 'vx-row-chg';
        rightClass = 'vx-row-chg';
        var wops = diffWords(row.left, row.right);
        leftHtml = renderWordDiffHtml(wops, 'left');
        rightHtml = renderWordDiffHtml(wops, 'right');
        break;
    }

    var L = '<div class="vx-diff-row ' + leftClass + '">' +
      '<div class="vx-ln">' + leftLn + '</div>' +
      '<div class="vx-code">' + leftHtml + '</div></div>';
    var R = '<div class="vx-diff-row ' + rightClass + '">' +
      '<div class="vx-ln">' + rightLn + '</div>' +
      '<div class="vx-code">' + rightHtml + '</div></div>';
    return { left: L, right: R };
  }

  function render(container, leftText, rightText, options) {
    options = options || {};
    injectStyles();
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    if (!container) throw new Error('DiffViewer.render: container no encontrado');

    var ops = diffLines(leftText, rightText);
    var rows = pairChanges(ops);

    var leftHtml = '', rightHtml = '';
    var lnL = 1, lnR = 1;
    var stats = { add: 0, del: 0, chg: 0, eq: 0 };

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      stats[row.kind]++;
      var lL = row.kind === 'add' ? null : lnL;
      var lR = row.kind === 'del' ? null : lnR;
      var html = rowHtml(row, lL, lR);
      leftHtml += html.left;
      rightHtml += html.right;
      if (row.kind !== 'add') lnL++;
      if (row.kind !== 'del') lnR++;
    }

    var titleLeft = options.titleLeft || 'Original';
    var titleRight = options.titleRight || 'Modificado';

    container.innerHTML =
      '<div class="vx-diff">' +
        '<div class="vx-diff-head">' +
          '<div>' + escapeHtml(titleLeft) + '</div>' +
          '<div>' + escapeHtml(titleRight) + '</div>' +
        '</div>' +
        '<div class="vx-diff-body">' +
          '<div class="vx-diff-side vx-diff-left">' + leftHtml + '</div>' +
          '<div class="vx-diff-side vx-diff-right">' + rightHtml + '</div>' +
        '</div>' +
        '<div class="vx-diff-stats">' +
          '<span class="vx-stat-add">+' + stats.add + ' añadidas</span>' +
          '<span class="vx-stat-del">-' + stats.del + ' eliminadas</span>' +
          '<span class="vx-stat-chg">~' + stats.chg + ' modificadas</span>' +
          '<span>=' + stats.eq + ' iguales</span>' +
        '</div>' +
      '</div>';

    // Sincronizar scroll vertical entre los dos paneles
    var leftEl = container.querySelector('.vx-diff-left');
    var rightEl = container.querySelector('.vx-diff-right');
    if (leftEl && rightEl) {
      var syncing = false;
      leftEl.addEventListener('scroll', function () {
        if (syncing) return;
        syncing = true;
        rightEl.scrollTop = leftEl.scrollTop;
        syncing = false;
      });
      rightEl.addEventListener('scroll', function () {
        if (syncing) return;
        syncing = true;
        leftEl.scrollTop = rightEl.scrollTop;
        syncing = false;
      });
    }

    return { stats: stats, rows: rows };
  }

  // ---------- API pública ----------
  global.DiffViewer = {
    render: render,
    diffLines: diffLines,
    diffWords: diffWords,
    injectStyles: injectStyles,
    _internal: { lcsDiff: lcsDiff, pairChanges: pairChanges }
  };

})(typeof window !== 'undefined' ? window : this);
