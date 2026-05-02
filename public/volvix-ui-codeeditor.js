/**
 * volvix-ui-codeeditor.js
 * Simple code editor UI: line numbers, basic JS/JSON syntax highlighting,
 * indent on Tab, find (Ctrl+F).
 *
 * Usage:
 *   const ed = window.CodeEditor.create(containerEl, {
 *       value: '...', language: 'js'|'json', readOnly: false
 *   });
 *   ed.getValue(); ed.setValue(s); ed.setLanguage('json');
 *   ed.find('term'); ed.destroy();
 */
(function (global) {
    'use strict';

    // ---------- Styles (inyectados una sola vez) ----------
    const STYLE_ID = 'volvix-codeeditor-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
.vce-root{display:flex;flex-direction:column;border:1px solid #2c2c34;
  border-radius:6px;overflow:hidden;background:#1e1e24;color:#e6e6e6;
  font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.5;
  position:relative;height:100%;min-height:200px;}
.vce-toolbar{display:flex;gap:6px;align-items:center;padding:4px 8px;
  background:#26262e;border-bottom:1px solid #2c2c34;font-size:12px;}
.vce-toolbar button{background:#33333c;color:#ddd;border:1px solid #44444d;
  padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px;}
.vce-toolbar button:hover{background:#3c3c46;}
.vce-toolbar select{background:#33333c;color:#ddd;border:1px solid #44444d;
  font-size:11px;padding:2px 4px;border-radius:3px;}
.vce-toolbar .vce-spacer{flex:1;}
.vce-toolbar .vce-info{color:#888;font-size:11px;}
.vce-body{flex:1;display:flex;overflow:hidden;position:relative;}
.vce-gutter{background:#23232a;color:#666;padding:6px 8px 6px 6px;
  text-align:right;user-select:none;border-right:1px solid #2c2c34;
  white-space:pre;overflow:hidden;min-width:36px;}
.vce-editor-wrap{flex:1;position:relative;overflow:auto;}
.vce-highlight,.vce-textarea{margin:0;padding:6px 10px;border:0;
  font:inherit;line-height:inherit;white-space:pre;tab-size:4;
  -moz-tab-size:4;word-wrap:normal;overflow-wrap:normal;}
.vce-highlight{position:absolute;inset:0;pointer-events:none;color:#e6e6e6;
  overflow:visible;}
.vce-textarea{position:relative;width:100%;min-height:100%;background:transparent;
  color:transparent;caret-color:#fff;outline:none;resize:none;display:block;
  caret-shape:bar;}
.vce-textarea::selection{background:rgba(80,120,200,.45);}
/* Tokens */
.vce-tk-kw{color:#c586c0;}
.vce-tk-str{color:#ce9178;}
.vce-tk-num{color:#b5cea8;}
.vce-tk-com{color:#6a9955;font-style:italic;}
.vce-tk-bool{color:#569cd6;}
.vce-tk-null{color:#569cd6;}
.vce-tk-key{color:#9cdcfe;}
.vce-tk-pun{color:#d4d4d4;}
.vce-tk-id{color:#dcdcaa;}
.vce-find-bar{display:none;align-items:center;gap:6px;padding:4px 8px;
  background:#2a2a32;border-top:1px solid #2c2c34;}
.vce-find-bar.open{display:flex;}
.vce-find-bar input{background:#1e1e24;color:#eee;border:1px solid #44444d;
  padding:3px 6px;font:inherit;font-size:12px;border-radius:3px;flex:1;}
.vce-find-bar .vce-find-status{color:#888;font-size:11px;min-width:60px;}
.vce-find-mark{background:rgba(255,200,0,.25);outline:1px solid rgba(255,200,0,.6);}
        `;
        const tag = document.createElement('style');
        tag.id = STYLE_ID;
        tag.textContent = css;
        document.head.appendChild(tag);
    }

    // ---------- HTML escape ----------
    function esc(s) {
        return s.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------- Tokenizers ----------
    const JS_KW = new Set([
        'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for',
        'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this',
        'class', 'extends', 'super', 'import', 'export', 'from', 'as',
        'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in',
        'of', 'delete', 'void', 'yield', 'async', 'await', 'default',
        'static', 'get', 'set'
    ]);
    const JS_BOOL = new Set(['true', 'false']);
    const JS_NULL = new Set(['null', 'undefined', 'NaN', 'Infinity']);

    function tokenizeJS(src) {
        // Devuelve HTML con spans
        let out = '';
        let i = 0;
        const n = src.length;
        while (i < n) {
            const c = src[i];
            const c2 = src.substr(i, 2);
            // Comentario línea
            if (c2 === '//') {
                let j = src.indexOf('\n', i);
                if (j === -1) j = n;
                out += `<span class="vce-tk-com">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Comentario bloque
            if (c2 === '/*') {
                let j = src.indexOf('*/', i + 2);
                if (j === -1) j = n; else j += 2;
                out += `<span class="vce-tk-com">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Strings
            if (c === '"' || c === "'" || c === '`') {
                const q = c;
                let j = i + 1;
                while (j < n) {
                    if (src[j] === '\\') { j += 2; continue; }
                    if (src[j] === q) { j++; break; }
                    j++;
                }
                out += `<span class="vce-tk-str">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Numbers
            if (/[0-9]/.test(c)) {
                let j = i + 1;
                while (j < n && /[0-9._eExX+\-a-fA-F]/.test(src[j])) j++;
                out += `<span class="vce-tk-num">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Identifiers / keywords
            if (/[A-Za-z_$]/.test(c)) {
                let j = i + 1;
                while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
                const word = src.slice(i, j);
                let cls = 'vce-tk-id';
                if (JS_KW.has(word)) cls = 'vce-tk-kw';
                else if (JS_BOOL.has(word)) cls = 'vce-tk-bool';
                else if (JS_NULL.has(word)) cls = 'vce-tk-null';
                out += `<span class="${cls}">${esc(word)}</span>`;
                i = j;
                continue;
            }
            // Punctuation
            if (/[{}()\[\];,.:?+\-*/%=<>!&|^~]/.test(c)) {
                out += `<span class="vce-tk-pun">${esc(c)}</span>`;
                i++;
                continue;
            }
            // default
            out += esc(c);
            i++;
        }
        return out;
    }

    function tokenizeJSON(src) {
        let out = '';
        let i = 0;
        const n = src.length;
        while (i < n) {
            const c = src[i];
            // Strings (detectar si es key: seguida de :)
            if (c === '"') {
                let j = i + 1;
                while (j < n) {
                    if (src[j] === '\\') { j += 2; continue; }
                    if (src[j] === '"') { j++; break; }
                    j++;
                }
                // Mirar si próximo no-espacio es ':'
                let k = j;
                while (k < n && /\s/.test(src[k])) k++;
                const isKey = src[k] === ':';
                const cls = isKey ? 'vce-tk-key' : 'vce-tk-str';
                out += `<span class="${cls}">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (/[-0-9]/.test(c)) {
                let j = i + 1;
                while (j < n && /[0-9.eE+\-]/.test(src[j])) j++;
                out += `<span class="vce-tk-num">${esc(src.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (/[a-z]/.test(c)) {
                let j = i + 1;
                while (j < n && /[a-z]/.test(src[j])) j++;
                const word = src.slice(i, j);
                let cls = 'vce-tk-id';
                if (word === 'true' || word === 'false') cls = 'vce-tk-bool';
                else if (word === 'null') cls = 'vce-tk-null';
                out += `<span class="${cls}">${esc(word)}</span>`;
                i = j;
                continue;
            }
            if (/[{}\[\],:]/.test(c)) {
                out += `<span class="vce-tk-pun">${esc(c)}</span>`;
                i++;
                continue;
            }
            out += esc(c);
            i++;
        }
        return out;
    }

    function highlight(src, lang) {
        if (lang === 'json') return tokenizeJSON(src);
        return tokenizeJS(src);
    }

    // ---------- Editor instance ----------
    function create(container, opts) {
        injectStyles();
        opts = opts || {};
        let language = opts.language === 'json' ? 'json' : 'js';
        const readOnly = !!opts.readOnly;

        // DOM
        const root = document.createElement('div');
        root.className = 'vce-root';

        const toolbar = document.createElement('div');
        toolbar.className = 'vce-toolbar';
        toolbar.innerHTML = `
            <select class="vce-lang">
                <option value="js">JavaScript</option>
                <option value="json">JSON</option>
            </select>
            <button class="vce-btn-find" title="Find (Ctrl+F)">Find</button>
            <button class="vce-btn-format" title="Format JSON">Format</button>
            <span class="vce-spacer"></span>
            <span class="vce-info">Ln 1, Col 1</span>
        `;

        const body = document.createElement('div');
        body.className = 'vce-body';

        const gutter = document.createElement('div');
        gutter.className = 'vce-gutter';

        const wrap = document.createElement('div');
        wrap.className = 'vce-editor-wrap';

        const hl = document.createElement('pre');
        hl.className = 'vce-highlight';

        const ta = document.createElement('textarea');
        ta.className = 'vce-textarea';
        ta.spellcheck = false;
        ta.wrap = 'off';
        ta.autocapitalize = 'off';
        ta.autocomplete = 'off';
        if (readOnly) ta.readOnly = true;

        wrap.appendChild(hl);
        wrap.appendChild(ta);
        body.appendChild(gutter);
        body.appendChild(wrap);

        const findBar = document.createElement('div');
        findBar.className = 'vce-find-bar';
        findBar.innerHTML = `
            <input type="text" class="vce-find-input" placeholder="Find..." />
            <span class="vce-find-status">0 / 0</span>
            <button class="vce-find-prev">Prev</button>
            <button class="vce-find-next">Next</button>
            <button class="vce-find-close">Close</button>
        `;

        root.appendChild(toolbar);
        root.appendChild(body);
        root.appendChild(findBar);
        container.innerHTML = '';
        container.appendChild(root);

        const langSel = toolbar.querySelector('.vce-lang');
        const info = toolbar.querySelector('.vce-info');
        const btnFind = toolbar.querySelector('.vce-btn-find');
        const btnFormat = toolbar.querySelector('.vce-btn-format');
        const findInput = findBar.querySelector('.vce-find-input');
        const findStatus = findBar.querySelector('.vce-find-status');
        const findPrev = findBar.querySelector('.vce-find-prev');
        const findNext = findBar.querySelector('.vce-find-next');
        const findClose = findBar.querySelector('.vce-find-close');

        langSel.value = language;

        // ---------- Render ----------
        function render() {
            const src = ta.value;
            hl.innerHTML = highlight(src, language) + '\n';
            const lines = src.split('\n').length;
            let g = '';
            for (let i = 1; i <= lines; i++) g += i + '\n';
            gutter.textContent = g;
            updateCursorInfo();
        }

        function updateCursorInfo() {
            const pos = ta.selectionStart;
            const before = ta.value.slice(0, pos);
            const ln = before.split('\n').length;
            const col = pos - before.lastIndexOf('\n');
            info.textContent = `Ln ${ln}, Col ${col}`;
        }

        // ---------- Sync scroll ----------
        wrap.addEventListener('scroll', () => {
            gutter.scrollTop = wrap.scrollTop;
        });
        ta.addEventListener('scroll', () => {
            gutter.scrollTop = ta.scrollTop;
            hl.style.transform =
                `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`;
        });

        // ---------- Tab indent ----------
        ta.addEventListener('keydown', (e) => {
            // Ctrl+F open find
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                openFind();
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = ta.selectionStart, en = ta.selectionEnd;
                const v = ta.value;
                if (e.shiftKey) {
                    // Outdent
                    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
                    if (v.substr(lineStart, 4) === '    ') {
                        ta.value = v.slice(0, lineStart) + v.slice(lineStart + 4);
                        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - 4);
                    } else if (v[lineStart] === '\t') {
                        ta.value = v.slice(0, lineStart) + v.slice(lineStart + 1);
                        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - 1);
                    }
                } else if (s !== en) {
                    // Indent multi-line selection
                    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
                    const block = v.slice(lineStart, en);
                    const indented = block.replace(/^/gm, '    ');
                    ta.value = v.slice(0, lineStart) + indented + v.slice(en);
                    ta.selectionStart = s + 4;
                    ta.selectionEnd = en + (indented.length - block.length);
                } else {
                    ta.value = v.slice(0, s) + '    ' + v.slice(s);
                    ta.selectionStart = ta.selectionEnd = s + 4;
                }
                render();
                return;
            }
            // Auto-indent on Enter
            if (e.key === 'Enter') {
                const s = ta.selectionStart;
                const v = ta.value;
                const lineStart = v.lastIndexOf('\n', s - 1) + 1;
                const lineUpToCursor = v.slice(lineStart, s);
                const indent = (lineUpToCursor.match(/^[\t ]*/) || [''])[0];
                let extra = '';
                if (/[{\[(]\s*$/.test(lineUpToCursor)) extra = '    ';
                e.preventDefault();
                const ins = '\n' + indent + extra;
                ta.value = v.slice(0, s) + ins + v.slice(ta.selectionEnd);
                ta.selectionStart = ta.selectionEnd = s + ins.length;
                render();
            }
        });

        ta.addEventListener('input', render);
        ta.addEventListener('keyup', updateCursorInfo);
        ta.addEventListener('click', updateCursorInfo);

        // ---------- Toolbar actions ----------
        langSel.addEventListener('change', () => {
            language = langSel.value === 'json' ? 'json' : 'js';
            render();
        });
        btnFind.addEventListener('click', openFind);
        btnFormat.addEventListener('click', () => {
            try {
                const obj = JSON.parse(ta.value);
                ta.value = JSON.stringify(obj, null, 2);
                language = 'json';
                langSel.value = 'json';
                render();
            } catch (err) {
                info.textContent = 'JSON inválido: ' + err.message;
            }
        });

        // ---------- Find ----------
        let findMatches = [];
        let findIndex = -1;

        function openFind() {
            findBar.classList.add('open');
            findInput.focus();
            findInput.select();
        }
        function closeFind() {
            findBar.classList.remove('open');
            findMatches = [];
            findIndex = -1;
            render();
            ta.focus();
        }
        function doFind(term) {
            findMatches = [];
            findIndex = -1;
            if (!term) { findStatus.textContent = '0 / 0'; return; }
            const v = ta.value;
            const lower = v.toLowerCase();
            const t = term.toLowerCase();
            let pos = 0;
            while (true) {
                const idx = lower.indexOf(t, pos);
                if (idx === -1) break;
                findMatches.push([idx, idx + t.length]);
                pos = idx + Math.max(1, t.length);
            }
            if (findMatches.length) {
                findIndex = 0;
                gotoMatch();
            }
            findStatus.textContent =
                `${findMatches.length ? findIndex + 1 : 0} / ${findMatches.length}`;
        }
        function gotoMatch() {
            if (findIndex < 0 || !findMatches[findIndex]) return;
            const [a, b] = findMatches[findIndex];
            ta.focus();
            ta.setSelectionRange(a, b);
            // Scroll into view (aproximado)
            const before = ta.value.slice(0, a);
            const line = before.split('\n').length;
            const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18;
            wrap.scrollTop = Math.max(0, line * lineHeight - wrap.clientHeight / 2);
            findStatus.textContent =
                `${findIndex + 1} / ${findMatches.length}`;
        }
        findInput.addEventListener('input', () => doFind(findInput.value));
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!findMatches.length) return;
                findIndex = (findIndex + (e.shiftKey ? -1 : 1) + findMatches.length)
                    % findMatches.length;
                gotoMatch();
            } else if (e.key === 'Escape') {
                closeFind();
            }
        });
        findNext.addEventListener('click', () => {
            if (!findMatches.length) return;
            findIndex = (findIndex + 1) % findMatches.length;
            gotoMatch();
        });
        findPrev.addEventListener('click', () => {
            if (!findMatches.length) return;
            findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
            gotoMatch();
        });
        findClose.addEventListener('click', closeFind);

        // ---------- Init ----------
        ta.value = opts.value != null ? String(opts.value) : '';
        render();

        // ---------- API ----------
        const api = {
            getValue: () => ta.value,
            setValue: (v) => { ta.value = v == null ? '' : String(v); render(); },
            getLanguage: () => language,
            setLanguage: (l) => {
                language = l === 'json' ? 'json' : 'js';
                langSel.value = language;
                render();
            },
            focus: () => ta.focus(),
            find: (term) => { openFind(); findInput.value = term || ''; doFind(findInput.value); },
            destroy: () => { container.innerHTML = ''; },
            element: root,
            textarea: ta
        };
        return api;
    }

    global.CodeEditor = { create };
})(window);
