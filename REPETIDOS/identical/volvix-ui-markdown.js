/* volvix-ui-markdown.js
 * Volvix Markdown Editor UI
 * Live preview split view, toolbar, syntax highlight, export.
 * Exposes window.MarkdownEditor
 */
(function (global) {
  'use strict';

  // ---------- Minimal Markdown parser ----------
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightCode(code, lang) {
    var src = escapeHtml(code);
    var keywords = /\b(function|return|if|else|for|while|var|let|const|class|new|this|import|export|from|default|async|await|try|catch|throw|switch|case|break|continue|do|in|of|typeof|instanceof|null|true|false|undefined)\b/g;
    src = src.replace(/(\/\/[^\n]*)/g, '<span class="vmd-com">$1</span>');
    src = src.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="vmd-str">$1</span>');
    src = src.replace(keywords, '<span class="vmd-kw">$1</span>');
    src = src.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="vmd-num">$1</span>');
    return '<pre class="vmd-pre"><code class="vmd-code lang-' + (lang || 'plain') + '">' + src + '</code></pre>';
  }

  function parseInline(s) {
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2"/>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/`([^`]+)`/g, '<code class="vmd-icode">$1</code>');
    return s;
  }

  function parseMarkdown(md) {
    if (!md) return '';
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      // Fenced code
      var fence = line.match(/^```(\w+)?\s*$/);
      if (fence) {
        var lang = fence[1] || '';
        var buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buf.push(lines[i]); i++;
        }
        i++;
        out.push(highlightCode(buf.join('\n'), lang));
        continue;
      }

      // Heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = h[1].length;
        out.push('<h' + lv + '>' + parseInline(escapeHtml(h[2])) + '</h' + lv + '>');
        i++; continue;
      }

      // Horizontal rule
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr/>'); i++; continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        var qb = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          qb.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + parseMarkdown(qb.join('\n')) + '</blockquote>');
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          var item = lines[i].replace(/^\s*[-*+]\s+/, '');
          var task = item.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            ul.push('<li class="vmd-task"><input type="checkbox" disabled' +
              (task[1].toLowerCase() === 'x' ? ' checked' : '') + '/> ' +
              parseInline(escapeHtml(task[2])) + '</li>');
          } else {
            ul.push('<li>' + parseInline(escapeHtml(item)) + '</li>');
          }
          i++;
        }
        out.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ol.push('<li>' + parseInline(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, ''))) + '</li>');
          i++;
        }
        out.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }

      // Table
      if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1])) {
        var headers = line.slice(1, -1).split('|').map(function (c) { return c.trim(); });
        i += 2;
        var rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
          rows.push(lines[i].slice(1, -1).split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        var th = '<tr>' + headers.map(function (c) { return '<th>' + parseInline(escapeHtml(c)) + '</th>'; }).join('') + '</tr>';
        var tb = rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + parseInline(escapeHtml(c)) + '</td>'; }).join('') + '</tr>';
        }).join('');
        out.push('<table class="vmd-table"><thead>' + th + '</thead><tbody>' + tb + '</tbody></table>');
        continue;
      }

      // Blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // Paragraph
      var pb = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+\.\s|```)/.test(lines[i])) {
        pb.push(lines[i]); i++;
      }
      out.push('<p>' + parseInline(escapeHtml(pb.join(' '))) + '</p>');
    }
    return out.join('\n');
  }

  // ---------- Styles ----------
  var CSS = [
    '.vmd-root{display:flex;flex-direction:column;height:100%;font-family:system-ui,Segoe UI,Roboto,sans-serif;border:1px solid #2b2f36;border-radius:8px;overflow:hidden;background:#0f1115;color:#e6e6e6}',
    '.vmd-toolbar{display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#171a21;border-bottom:1px solid #2b2f36}',
    '.vmd-btn{background:#222831;color:#e6e6e6;border:1px solid #2b2f36;padding:4px 9px;border-radius:4px;cursor:pointer;font-size:12px}',
    '.vmd-btn:hover{background:#2d3540}',
    '.vmd-btn.active{background:#3b82f6;border-color:#3b82f6}',
    '.vmd-split{display:flex;flex:1;min-height:0}',
    '.vmd-pane{flex:1;min-width:0;height:100%}',
    '.vmd-textarea{width:100%;height:100%;box-sizing:border-box;background:#0f1115;color:#e6e6e6;border:none;outline:none;padding:12px;resize:none;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.55}',
    '.vmd-preview{padding:14px;overflow:auto;background:#13161c;border-left:1px solid #2b2f36}',
    '.vmd-preview h1,.vmd-preview h2,.vmd-preview h3{border-bottom:1px solid #2b2f36;padding-bottom:4px}',
    '.vmd-preview a{color:#60a5fa}',
    '.vmd-preview code.vmd-icode{background:#1e2330;padding:2px 5px;border-radius:3px;font-size:12px}',
    '.vmd-pre{background:#1e2330;padding:10px;border-radius:6px;overflow:auto}',
    '.vmd-code{font-family:Consolas,Monaco,monospace;font-size:12px;color:#e6e6e6}',
    '.vmd-kw{color:#c084fc}.vmd-str{color:#86efac}.vmd-num{color:#fbbf24}.vmd-com{color:#6b7280;font-style:italic}',
    '.vmd-table{border-collapse:collapse;margin:8px 0}',
    '.vmd-table th,.vmd-table td{border:1px solid #2b2f36;padding:5px 9px}',
    '.vmd-table th{background:#1e2330}',
    '.vmd-preview blockquote{border-left:3px solid #3b82f6;margin:8px 0;padding:4px 12px;color:#cbd5e1;background:#161a22}',
    '.vmd-status{padding:4px 10px;background:#171a21;border-top:1px solid #2b2f36;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('vmd-styles')) return;
    var s = document.createElement('style');
    s.id = 'vmd-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Editor ----------
  function MarkdownEditor(target, opts) {
    if (!(this instanceof MarkdownEditor)) return new MarkdownEditor(target, opts);
    opts = opts || {};
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) throw new Error('MarkdownEditor: container not found');
    this.mode = opts.mode || 'split'; // edit | preview | split
    this.value = opts.value || '';
    injectStyles();
    this._build();
    this.setValue(this.value);
  }

  MarkdownEditor.prototype._build = function () {
    var self = this;
    var root = document.createElement('div');
    root.className = 'vmd-root';

    var bar = document.createElement('div');
    bar.className = 'vmd-toolbar';
    var actions = [
      ['B', 'Bold', function () { self._wrap('**', '**'); }],
      ['I', 'Italic', function () { self._wrap('*', '*'); }],
      ['S', 'Strike', function () { self._wrap('~~', '~~'); }],
      ['H1', 'H1', function () { self._prefix('# '); }],
      ['H2', 'H2', function () { self._prefix('## '); }],
      ['H3', 'H3', function () { self._prefix('### '); }],
      ['•', 'List', function () { self._prefix('- '); }],
      ['1.', 'Ordered', function () { self._prefix('1. '); }],
      ['"', 'Quote', function () { self._prefix('> '); }],
      ['<>', 'Code', function () { self._wrap('`', '`'); }],
      ['{}', 'Block', function () { self._wrap('\n```\n', '\n```\n'); }],
      ['🔗', 'Link', function () { self._wrap('[', '](url)'); }],
      ['🖼', 'Image', function () { self._wrap('![', '](url)'); }],
      ['—', 'HR', function () { self._insert('\n\n---\n\n'); }],
      ['⊞', 'Table', function () { self._insert('\n| Col1 | Col2 |\n|------|------|\n| a    | b    |\n'); }]
    ];
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'vmd-btn';
      b.textContent = a[0];
      b.title = a[1];
      b.addEventListener('click', a[2]);
      bar.appendChild(b);
    });

    var sep = document.createElement('span');
    sep.style.flex = '1';
    bar.appendChild(sep);

    ['edit', 'split', 'preview'].forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'vmd-btn vmd-mode';
      b.textContent = m;
      b.dataset.mode = m;
      b.addEventListener('click', function () { self.setMode(m); });
      bar.appendChild(b);
    });

    var exp = document.createElement('button');
    exp.className = 'vmd-btn';
    exp.textContent = 'Export';
    exp.title = 'Export Markdown / HTML';
    exp.addEventListener('click', function () { self.exportFile(); });
    bar.appendChild(exp);

    var split = document.createElement('div');
    split.className = 'vmd-split';

    var ta = document.createElement('textarea');
    ta.className = 'vmd-textarea vmd-pane';
    ta.spellcheck = false;
    ta.addEventListener('input', function () { self.value = ta.value; self._render(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); self._insert('  '); }
    });

    var pv = document.createElement('div');
    pv.className = 'vmd-preview vmd-pane';

    split.appendChild(ta);
    split.appendChild(pv);

    var st = document.createElement('div');
    st.className = 'vmd-status';
    st.innerHTML = '<span class="vmd-st-words">0 words</span><span class="vmd-st-mode">' + this.mode + '</span>';

    root.appendChild(bar);
    root.appendChild(split);
    root.appendChild(st);

    this.container.innerHTML = '';
    this.container.appendChild(root);

    this.els = { root: root, bar: bar, split: split, ta: ta, pv: pv, st: st };
    this.setMode(this.mode);
  };

  MarkdownEditor.prototype._render = function () {
    this.els.pv.innerHTML = parseMarkdown(this.value);
    var words = (this.value.trim().match(/\S+/g) || []).length;
    this.els.st.querySelector('.vmd-st-words').textContent = words + ' words / ' + this.value.length + ' chars';
    if (typeof this.onChange === 'function') this.onChange(this.value);
  };

  MarkdownEditor.prototype._wrap = function (a, b) {
    var ta = this.els.ta;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var sel = ta.value.substring(s, e);
    ta.value = ta.value.slice(0, s) + a + sel + b + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = s + a.length;
    ta.selectionEnd = e + a.length;
    this.value = ta.value;
    this._render();
  };

  MarkdownEditor.prototype._prefix = function (p) {
    var ta = this.els.ta;
    var s = ta.selectionStart;
    var before = ta.value.slice(0, s);
    var lineStart = before.lastIndexOf('\n') + 1;
    ta.value = ta.value.slice(0, lineStart) + p + ta.value.slice(lineStart);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + p.length;
    this.value = ta.value;
    this._render();
  };

  MarkdownEditor.prototype._insert = function (text) {
    var ta = this.els.ta;
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + text.length;
    this.value = ta.value;
    this._render();
  };

  MarkdownEditor.prototype.setValue = function (v) {
    this.value = v || '';
    this.els.ta.value = this.value;
    this._render();
  };

  MarkdownEditor.prototype.getValue = function () { return this.value; };
  MarkdownEditor.prototype.getHTML = function () { return parseMarkdown(this.value); };

  MarkdownEditor.prototype.setMode = function (m) {
    this.mode = m;
    var ta = this.els.ta, pv = this.els.pv;
    if (m === 'edit') { ta.style.display = ''; pv.style.display = 'none'; }
    else if (m === 'preview') { ta.style.display = 'none'; pv.style.display = ''; }
    else { ta.style.display = ''; pv.style.display = ''; }
    var btns = this.els.bar.querySelectorAll('.vmd-mode');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mode === m);
    }
    this.els.st.querySelector('.vmd-st-mode').textContent = m;
  };

  MarkdownEditor.prototype.exportFile = function (kind) {
    kind = kind || 'md';
    var content, mime, name;
    if (kind === 'html') {
      content = '<!doctype html><meta charset="utf-8"><title>Export</title>' + this.getHTML();
      mime = 'text/html'; name = 'document.html';
    } else {
      content = this.value; mime = 'text/markdown'; name = 'document.md';
    }
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  MarkdownEditor.prototype.destroy = function () {
    this.container.innerHTML = '';
  };

  MarkdownEditor.parse = parseMarkdown;
  global.MarkdownEditor = MarkdownEditor;
})(typeof window !== 'undefined' ? window : this);
