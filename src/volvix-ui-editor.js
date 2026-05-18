/* volvix-ui-editor.js
 * Rich text editor for Volvix UI.
 * Exposes window.Editor with: create, getHTML, setHTML, getText, destroy, focus, on, off.
 *
 * Features:
 *  - contenteditable surface
 *  - Bold / Italic / Underline / Strike
 *  - Ordered & unordered lists
 *  - Headings H1/H2/H3 + paragraph
 *  - Links (insert / unlink)
 *  - Undo / Redo (custom history stack)
 *  - Paste as plain text
 *  - Keyboard shortcuts (Ctrl+B/I/U/Z/Y/K)
 *  - Toolbar generation
 *  - Active-state reflection on toolbar buttons
 *  - Word / character counter
 *  - Sanitization on setHTML
 */
(function (global) {
    'use strict';

    // ---------- Constants ----------
    var ALLOWED_TAGS = [
        'A','B','I','U','S','STRONG','EM','BR','P','DIV','SPAN',
        'UL','OL','LI','H1','H2','H3','H4','BLOCKQUOTE','CODE','PRE'
    ];
    var ALLOWED_ATTRS = ['href','target','rel','class'];

    var TOOLBAR_DEF = [
        { cmd: 'bold',         label: 'B',  title: 'Negrita (Ctrl+B)',     style: 'font-weight:700;' },
        { cmd: 'italic',       label: 'I',  title: 'Cursiva (Ctrl+I)',     style: 'font-style:italic;' },
        { cmd: 'underline',    label: 'U',  title: 'Subrayar (Ctrl+U)',    style: 'text-decoration:underline;' },
        { cmd: 'strikeThrough',label: 'S',  title: 'Tachar',                style: 'text-decoration:line-through;' },
        { sep: true },
        { cmd: 'h1',           label: 'H1', title: 'Titulo 1' },
        { cmd: 'h2',           label: 'H2', title: 'Titulo 2' },
        { cmd: 'h3',           label: 'H3', title: 'Titulo 3' },
        { cmd: 'p',            label: 'P',  title: 'Parrafo' },
        { sep: true },
        { cmd: 'insertUnorderedList', label: 'UL', title: 'Lista' },
        { cmd: 'insertOrderedList',   label: 'OL', title: 'Lista numerada' },
        { sep: true },
        { cmd: 'createLink',   label: 'Link',   title: 'Insertar enlace (Ctrl+K)' },
        { cmd: 'unlink',       label: 'Unlink', title: 'Quitar enlace' },
        { sep: true },
        { cmd: 'undo',         label: '<-', title: 'Deshacer (Ctrl+Z)' },
        { cmd: 'redo',         label: '->', title: 'Rehacer (Ctrl+Y)' },
        { sep: true },
        { cmd: 'removeFormat', label: 'Tx', title: 'Limpiar formato' }
    ];

    // ---------- Utils ----------
    function el(tag, attrs, children) {
        var n = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'style') n.style.cssText = attrs[k];
                else if (k === 'class') n.className = attrs[k];
                else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
                else n.setAttribute(k, attrs[k]);
            }
        }
        if (children) {
            if (!Array.isArray(children)) children = [children];
            for (var i = 0; i < children.length; i++) {
                var c = children[i];
                if (c == null) continue;
                if (typeof c === 'string') n.appendChild(document.createTextNode(c));
                else n.appendChild(c);
            }
        }
        return n;
    }

    function sanitize(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html || '';
        (function walk(node) {
            var children = Array.prototype.slice.call(node.childNodes);
            for (var i = 0; i < children.length; i++) {
                var c = children[i];
                if (c.nodeType === 1) {
                    if (ALLOWED_TAGS.indexOf(c.tagName) === -1) {
                        // unwrap
                        while (c.firstChild) node.insertBefore(c.firstChild, c);
                        node.removeChild(c);
                        continue;
                    }
                    // strip disallowed attrs
                    var attrs = Array.prototype.slice.call(c.attributes);
                    for (var j = 0; j < attrs.length; j++) {
                        if (ALLOWED_ATTRS.indexOf(attrs[j].name) === -1) {
                            c.removeAttribute(attrs[j].name);
                        }
                    }
                    // force safe link target
                    if (c.tagName === 'A') {
                        var href = c.getAttribute('href') || '';
                        if (/^javascript:/i.test(href)) c.removeAttribute('href');
                        c.setAttribute('target', '_blank');
                        c.setAttribute('rel', 'noopener noreferrer');
                    }
                    walk(c);
                } else if (c.nodeType === 8) {
                    node.removeChild(c); // strip comments
                }
            }
        })(tmp);
        return tmp.innerHTML;
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, ms);
        };
    }

    // ---------- Editor ----------
    function Editor(target, opts) {
        if (!target) throw new Error('Editor: target requerido');
        if (typeof target === 'string') target = document.querySelector(target);
        opts = opts || {};

        this.opts = {
            placeholder: opts.placeholder || 'Escribe aqui...',
            initialHTML: opts.initialHTML || '',
            minHeight:   opts.minHeight   || '180px',
            maxHistory:  opts.maxHistory  || 100,
            showCounter: opts.showCounter !== false,
            onChange:    opts.onChange || null
        };

        this.host = target;
        this._listeners = {};
        this._history = [];
        this._future  = [];
        this._suppress = false;

        this._build();
        this._bind();

        if (this.opts.initialHTML) this.setHTML(this.opts.initialHTML);
        this._snapshot(); // initial state
    }

    Editor.prototype._build = function () {
        var self = this;

        this.root    = el('div', { class: 'vx-editor', style: 'border:1px solid #d0d4da;border-radius:6px;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#fff;' });
        this.toolbar = el('div', { class: 'vx-editor-toolbar', style: 'display:flex;flex-wrap:wrap;gap:2px;padding:6px;border-bottom:1px solid #e3e6ea;background:#f7f8fa;border-radius:6px 6px 0 0;' });

        this._buttons = {};
        for (var i = 0; i < TOOLBAR_DEF.length; i++) {
            var def = TOOLBAR_DEF[i];
            if (def.sep) {
                this.toolbar.appendChild(el('span', { style: 'width:1px;background:#d0d4da;margin:2px 4px;' }));
                continue;
            }
            (function (d) {
                var btn = el('button', {
                    type: 'button',
                    title: d.title || d.cmd,
                    class: 'vx-editor-btn',
                    style: 'min-width:28px;height:28px;padding:0 8px;border:1px solid transparent;background:transparent;border-radius:4px;cursor:pointer;font-size:13px;' + (d.style || ''),
                    onmousedown: function (e) { e.preventDefault(); }, // keep selection
                    onclick: function (e) { e.preventDefault(); self._exec(d.cmd); }
                }, d.label);
                self._buttons[d.cmd] = btn;
                self.toolbar.appendChild(btn);
            })(def);
        }

        this.area = el('div', {
            class: 'vx-editor-area',
            contenteditable: 'true',
            spellcheck: 'true',
            'data-placeholder': this.opts.placeholder,
            style: 'min-height:' + this.opts.minHeight + ';padding:12px 14px;outline:none;line-height:1.5;font-size:14px;color:#1f2328;'
        });

        this.root.appendChild(this.toolbar);
        this.root.appendChild(this.area);

        if (this.opts.showCounter) {
            this.counter = el('div', {
                class: 'vx-editor-counter',
                style: 'padding:4px 10px;border-top:1px solid #e3e6ea;font-size:11px;color:#6b7280;text-align:right;background:#fafbfc;border-radius:0 0 6px 6px;'
            }, '0 palabras / 0 caracteres');
            this.root.appendChild(this.counter);
        }

        // placeholder via CSS pseudo (inject once)
        if (!document.getElementById('vx-editor-style')) {
            var style = el('style', { id: 'vx-editor-style' });
            style.textContent =
                '.vx-editor-area:empty:before{content:attr(data-placeholder);color:#9aa0a6;pointer-events:none;}' +
                '.vx-editor-btn:hover{background:#e8ebef;}' +
                '.vx-editor-btn.is-active{background:#dbe4ff;border-color:#aab8e6;}' +
                '.vx-editor-area a{color:#1a73e8;text-decoration:underline;}' +
                '.vx-editor-area ul,.vx-editor-area ol{padding-left:1.5em;}' +
                '.vx-editor-area h1{font-size:1.6em;margin:.4em 0;}' +
                '.vx-editor-area h2{font-size:1.35em;margin:.4em 0;}' +
                '.vx-editor-area h3{font-size:1.15em;margin:.4em 0;}';
            document.head.appendChild(style);
        }

        this.host.appendChild(this.root);
    };

    Editor.prototype._bind = function () {
        var self = this;

        this.area.addEventListener('input', function () {
            self._onInput();
        });

        this.area.addEventListener('keydown', function (e) {
            var k = e.key.toLowerCase();
            if (e.ctrlKey || e.metaKey) {
                if (k === 'b') { e.preventDefault(); self._exec('bold'); }
                else if (k === 'i') { e.preventDefault(); self._exec('italic'); }
                else if (k === 'u') { e.preventDefault(); self._exec('underline'); }
                else if (k === 'k') { e.preventDefault(); self._exec('createLink'); }
                else if (k === 'z' && !e.shiftKey) { e.preventDefault(); self.undo(); }
                else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); self.redo(); }
            }
        });

        this.area.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = (e.clipboardData || global.clipboardData).getData('text/plain') || '';
            // Insert plain text at caret
            var sel = global.getSelection();
            if (!sel || !sel.rangeCount) {
                self.area.appendChild(document.createTextNode(text));
            } else {
                var range = sel.getRangeAt(0);
                range.deleteContents();
                var lines = text.split(/\r?\n/);
                var frag = document.createDocumentFragment();
                for (var i = 0; i < lines.length; i++) {
                    if (i > 0) frag.appendChild(document.createElement('br'));
                    frag.appendChild(document.createTextNode(lines[i]));
                }
                range.insertNode(frag);
                range.collapse(false);
                sel.removeAllRanges(); sel.addRange(range);
            }
            self._onInput();
        });

        // Reflect active commands on selection change
        document.addEventListener('selectionchange', function () {
            if (!self.area.contains(document.activeElement)) return;
            self._updateActiveStates();
        });

        // Track history snapshots (debounced)
        this._debouncedSnapshot = debounce(function () { self._snapshot(); }, 350);
    };

    Editor.prototype._exec = function (cmd) {
        this.area.focus();

        if (cmd === 'h1' || cmd === 'h2' || cmd === 'h3' || cmd === 'p') {
            var tag = cmd === 'p' ? 'P' : cmd.toUpperCase();
            document.execCommand('formatBlock', false, tag);
        } else if (cmd === 'createLink') {
            var self = this;
            var applyLink = function (url) {
                if (!url) return;
                if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = 'https://' + url;
                document.execCommand('createLink', false, url);
                var sel = global.getSelection();
                if (sel && sel.anchorNode) {
                    var a = sel.anchorNode.parentNode;
                    while (a && a !== self.area && a.tagName !== 'A') a = a.parentNode;
                    if (a && a.tagName === 'A') {
                        a.setAttribute('target', '_blank');
                        a.setAttribute('rel', 'noopener noreferrer');
                    }
                }
            };
            var ui = global.VolvixUI;
            if (ui && typeof ui.form === 'function') {
                Promise.resolve(ui.form({
                    title: 'Insertar enlace',
                    fields: [{ name: 'url', label: 'URL', type: 'text', default: 'https://', required: true }],
                    submitText: 'Insertar'
                })).then(function (res) { if (res && res.url) applyLink(res.url); }).catch(function(){});
                return;
            }
            var url = global.prompt('URL del enlace:', 'https://');
            if (url) {
                applyLink(url);
            }
        } else if (cmd === 'undo') {
            this.undo(); return;
        } else if (cmd === 'redo') {
            this.redo(); return;
        } else {
            try { document.execCommand(cmd, false, null); } catch (e) { /* ignore */ }
        }

        this._onInput();
        this._updateActiveStates();
    };

    Editor.prototype._onInput = function () {
        if (this._suppress) return;
        this._future.length = 0;
        this._debouncedSnapshot();
        this._updateCounter();
        this._emit('change', this.getHTML());
        if (typeof this.opts.onChange === 'function') {
            try { this.opts.onChange(this.getHTML()); } catch (e) { /* ignore */ }
        }
    };

    Editor.prototype._snapshot = function () {
        var html = this.area.innerHTML;
        var last = this._history[this._history.length - 1];
        if (last === html) return;
        this._history.push(html);
        if (this._history.length > this.opts.maxHistory) this._history.shift();
    };

    Editor.prototype.undo = function () {
        if (this._history.length < 2) return;
        var current = this._history.pop();
        this._future.push(current);
        var prev = this._history[this._history.length - 1];
        this._suppress = true;
        this.area.innerHTML = prev;
        this._suppress = false;
        this._updateCounter();
        this._emit('change', this.getHTML());
    };

    Editor.prototype.redo = function () {
        if (!this._future.length) return;
        var next = this._future.pop();
        this._suppress = true;
        this.area.innerHTML = next;
        this._history.push(next);
        this._suppress = false;
        this._updateCounter();
        this._emit('change', this.getHTML());
    };

    Editor.prototype._updateActiveStates = function () {
        var simple = ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'];
        for (var i = 0; i < simple.length; i++) {
            var cmd = simple[i];
            var btn = this._buttons[cmd];
            if (!btn) continue;
            var on = false;
            try { on = document.queryCommandState(cmd); } catch (e) {}
            btn.classList.toggle('is-active', !!on);
        }
        // headings
        var block = '';
        try { block = (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) {}
        ['h1','h2','h3','p'].forEach(function (h) {
            var b = this._buttons[h];
            if (!b) return;
            b.classList.toggle('is-active', block === h || block === '<' + h + '>');
        }, this);
    };

    Editor.prototype._updateCounter = function () {
        if (!this.counter) return;
        var text = this.getText();
        var chars = text.length;
        var words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.counter.textContent = words + ' palabras / ' + chars + ' caracteres';
    };

    // ---------- Public API ----------
    Editor.prototype.getHTML = function () { return this.area.innerHTML; };
    Editor.prototype.getText = function () { return this.area.innerText || this.area.textContent || ''; };

    Editor.prototype.setHTML = function (html) {
        this._suppress = true;
        this.area.innerHTML = sanitize(html);
        this._suppress = false;
        this._snapshot();
        this._updateCounter();
        this._emit('change', this.getHTML());
    };

    Editor.prototype.clear = function () { this.setHTML(''); };

    Editor.prototype.focus = function () { this.area.focus(); };

    Editor.prototype.destroy = function () {
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this._listeners = {};
        this._history.length = 0;
        this._future.length = 0;
    };

    Editor.prototype.on = function (ev, fn) {
        (this._listeners[ev] = this._listeners[ev] || []).push(fn);
        return this;
    };

    Editor.prototype.off = function (ev, fn) {
        var arr = this._listeners[ev]; if (!arr) return this;
        if (!fn) { delete this._listeners[ev]; return this; }
        this._listeners[ev] = arr.filter(function (f) { return f !== fn; });
        return this;
    };

    Editor.prototype._emit = function (ev, payload) {
        var arr = this._listeners[ev]; if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](payload); } catch (e) { /* ignore */ }
        }
    };

    // ---------- Factory ----------
    function create(target, opts) { return new Editor(target, opts); }

    global.Editor = {
        create: create,
        sanitize: sanitize,
        version: '1.0.0'
    };

})(window);
