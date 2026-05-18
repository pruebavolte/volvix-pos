/**
 * volvix-ui-searchbox.js
 * Advanced Search Box UI Component for Volvix POS
 *
 * Features:
 *  - Autocomplete with async/sync source providers
 *  - Recent searches (localStorage persistence)
 *  - Suggestions / popular queries
 *  - Debounced input
 *  - Keyboard navigation (ArrowUp / ArrowDown / Enter / Escape)
 *  - Global hotkey support ("/" or Ctrl+K to focus)
 *  - Clearable input, loading indicator, empty-state
 *  - Highlighting of matching substrings
 *  - Public API via window.SearchBox
 *
 * Usage:
 *   const sb = window.SearchBox.create({
 *     mount: '#searchbox',
 *     placeholder: 'Buscar productos...',
 *     source: async (q) => fetch('/api/search?q=' + q).then(r => r.json()),
 *     onSelect: (item) => console.log('selected', item),
 *     hotkey: 'ctrl+k'
 *   });
 */
(function (global) {
    'use strict';

    // ---------- Utilities ----------
    function debounce(fn, wait) {
        let t = null;
        return function debounced(...args) {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function highlight(text, query) {
        const safe = escapeHtml(text);
        if (!query) return safe;
        const q = query.trim();
        if (!q) return safe;
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
        return safe.replace(re, '<mark class="vsb-hl">$1</mark>');
    }

    function uid(prefix) {
        return (prefix || 'sb_') + Math.random().toString(36).slice(2, 9);
    }

    function parseHotkey(spec) {
        if (!spec) return null;
        const parts = String(spec).toLowerCase().split('+').map(s => s.trim());
        return {
            ctrl: parts.includes('ctrl') || parts.includes('control'),
            meta: parts.includes('meta') || parts.includes('cmd'),
            shift: parts.includes('shift'),
            alt: parts.includes('alt') || parts.includes('option'),
            key: parts.filter(p => !['ctrl','control','meta','cmd','shift','alt','option'].includes(p)).pop() || ''
        };
    }

    function matchHotkey(e, hk) {
        if (!hk) return false;
        if (!!hk.ctrl !== !!e.ctrlKey) return false;
        if (!!hk.meta !== !!e.metaKey) return false;
        if (!!hk.shift !== !!e.shiftKey) return false;
        if (!!hk.alt !== !!e.altKey) return false;
        return e.key && e.key.toLowerCase() === hk.key;
    }

    // ---------- Storage ----------
    const STORAGE_KEY = 'volvix.searchbox.recents';
    const MAX_RECENTS = 8;

    function loadRecents(ns) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY + (ns ? ':' + ns : ''));
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveRecents(ns, list) {
        try {
            localStorage.setItem(STORAGE_KEY + (ns ? ':' + ns : ''), JSON.stringify(list.slice(0, MAX_RECENTS)));
        } catch (e) { /* ignore */ }
    }

    // ---------- Styles (inject once) ----------
    const STYLES = `
    .vsb-wrap{position:relative;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;width:100%;max-width:480px}
    .vsb-input-row{display:flex;align-items:center;gap:6px;border:1px solid #d0d4dc;border-radius:8px;background:#fff;padding:6px 10px;transition:border-color .15s,box-shadow .15s}
    .vsb-input-row:focus-within{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
    .vsb-icon{width:16px;height:16px;flex:0 0 auto;color:#6b7280}
    .vsb-input{flex:1;border:0;outline:0;background:transparent;font-size:14px;padding:6px 0;min-width:0}
    .vsb-clear{cursor:pointer;color:#9ca3af;border:0;background:transparent;font-size:14px;padding:2px 6px;display:none}
    .vsb-clear:hover{color:#374151}
    .vsb-loading{width:14px;height:14px;border:2px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:vsb-spin .8s linear infinite;display:none}
    @keyframes vsb-spin{to{transform:rotate(360deg)}}
    .vsb-panel{position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.08);max-height:360px;overflow:auto;z-index:9999;display:none}
    .vsb-panel.open{display:block}
    .vsb-section{padding:6px 0}
    .vsb-section + .vsb-section{border-top:1px solid #f3f4f6}
    .vsb-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;padding:6px 12px;display:flex;justify-content:space-between;align-items:center}
    .vsb-section-title button{border:0;background:transparent;color:#3b82f6;font-size:11px;cursor:pointer}
    .vsb-item{padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:14px;color:#111827}
    .vsb-item small{color:#6b7280;font-size:12px;margin-left:auto}
    .vsb-item.active,.vsb-item:hover{background:#f3f4f6}
    .vsb-empty{padding:14px 12px;color:#6b7280;font-size:13px;text-align:center}
    .vsb-hl{background:#fff3a3;color:inherit;border-radius:2px;padding:0 1px}
    .vsb-kbd{font-family:ui-monospace,Menlo,monospace;font-size:11px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:4px;padding:1px 5px;color:#6b7280}
    `;

    function ensureStyles() {
        if (document.getElementById('vsb-styles')) return;
        const tag = document.createElement('style');
        tag.id = 'vsb-styles';
        tag.textContent = STYLES;
        document.head.appendChild(tag);
    }

    // ---------- Component ----------
    function create(options) {
        ensureStyles();
        const opts = Object.assign({
            mount: null,                 // selector or HTMLElement
            placeholder: 'Buscar...',
            source: null,                // function(query) => array | Promise<array>
            suggestions: [],             // static suggestions when input empty
            onSelect: null,              // callback(item)
            onChange: null,              // callback(query)
            namespace: 'default',        // for storage isolation
            debounce: 180,
            minChars: 1,
            maxResults: 10,
            hotkey: '/',                 // string spec like 'ctrl+k' or '/'
            renderItem: null,            // function(item, query) => html
            getLabel: (it) => (typeof it === 'string' ? it : (it.label || it.name || it.title || String(it))),
            getKey: (it) => (typeof it === 'string' ? it : (it.id || it.key || it.label || it.name)),
            persistRecents: true,
            showHotkeyHint: true
        }, options || {});

        const root = typeof opts.mount === 'string'
            ? document.querySelector(opts.mount)
            : opts.mount;

        if (!root) throw new Error('[SearchBox] mount target not found');

        const id = uid('vsb_');
        const state = {
            query: '',
            items: [],
            active: -1,
            open: false,
            loading: false,
            recents: opts.persistRecents ? loadRecents(opts.namespace) : [],
            destroyed: false,
            reqSeq: 0
        };

        // DOM
        root.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'vsb-wrap';
        wrap.id = id;
        wrap.innerHTML = `
            <div class="vsb-input-row">
                <svg class="vsb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input class="vsb-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(opts.placeholder)}" />
                <span class="vsb-loading" aria-hidden="true"></span>
                <button type="button" class="vsb-clear" aria-label="Clear">×</button>
                ${opts.showHotkeyHint ? `<span class="vsb-kbd">${escapeHtml(String(opts.hotkey).toUpperCase())}</span>` : ''}
            </div>
            <div class="vsb-panel" role="listbox"></div>
        `;
        root.appendChild(wrap);

        const input = wrap.querySelector('.vsb-input');
        const panel = wrap.querySelector('.vsb-panel');
        const clearBtn = wrap.querySelector('.vsb-clear');
        const spinner = wrap.querySelector('.vsb-loading');

        // ---------- Render ----------
        function renderDefaultItem(item, query) {
            const label = opts.getLabel(item);
            const sub = (item && item.sub) ? `<small>${escapeHtml(item.sub)}</small>` : '';
            return `<span>${highlight(label, query)}</span>${sub}`;
        }

        function render() {
            const q = state.query.trim();
            const sections = [];

            if (q.length >= opts.minChars) {
                if (state.items.length === 0 && !state.loading) {
                    sections.push(`<div class="vsb-empty">Sin resultados para "<b>${escapeHtml(q)}</b>"</div>`);
                } else {
                    const lis = state.items.slice(0, opts.maxResults).map((it, idx) => {
                        const html = opts.renderItem ? opts.renderItem(it, q) : renderDefaultItem(it, q);
                        return `<div class="vsb-item ${idx === state.active ? 'active' : ''}" data-idx="${idx}" role="option">${html}</div>`;
                    }).join('');
                    sections.push(`<div class="vsb-section"><div class="vsb-section-title">Resultados</div>${lis}</div>`);
                }
            } else {
                if (state.recents.length > 0) {
                    const lis = state.recents.map((r, idx) => `
                        <div class="vsb-item ${idx === state.active ? 'active' : ''}" data-idx="${idx}" data-recent="1" role="option">
                            <svg class="vsb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                            <span>${escapeHtml(r)}</span>
                        </div>`).join('');
                    sections.push(`
                        <div class="vsb-section">
                            <div class="vsb-section-title">Recientes <button type="button" data-action="clear-recents">Limpiar</button></div>
                            ${lis}
                        </div>`);
                }
                if (opts.suggestions && opts.suggestions.length > 0) {
                    const offset = state.recents.length;
                    const lis = opts.suggestions.map((s, idx) => {
                        const i = idx + offset;
                        const label = opts.getLabel(s);
                        return `<div class="vsb-item ${i === state.active ? 'active' : ''}" data-idx="${i}" data-suggestion="1" role="option">
                            <span>${escapeHtml(label)}</span>
                        </div>`;
                    }).join('');
                    sections.push(`<div class="vsb-section"><div class="vsb-section-title">Sugerencias</div>${lis}</div>`);
                }
                if (sections.length === 0) {
                    sections.push(`<div class="vsb-empty">Empieza a escribir para buscar...</div>`);
                }
            }

            panel.innerHTML = sections.join('');
            panel.classList.toggle('open', state.open);
            clearBtn.style.display = state.query ? 'inline-block' : 'none';
            spinner.style.display = state.loading ? 'inline-block' : 'none';
        }

        // ---------- Data ----------
        function currentList() {
            const q = state.query.trim();
            if (q.length >= opts.minChars) return state.items.slice(0, opts.maxResults);
            return [].concat(state.recents, opts.suggestions || []);
        }

        async function runSearch(q) {
            if (!opts.source) {
                state.items = [];
                render();
                return;
            }
            const seq = ++state.reqSeq;
            state.loading = true;
            render();
            try {
                const res = await Promise.resolve(opts.source(q));
                if (seq !== state.reqSeq || state.destroyed) return;
                state.items = Array.isArray(res) ? res : (res && res.items) || [];
            } catch (err) {
                if (seq !== state.reqSeq) return;
                state.items = [];
                console.error('[SearchBox] source error:', err);
            } finally {
                if (seq === state.reqSeq) {
                    state.loading = false;
                    state.active = -1;
                    render();
                }
            }
        }

        const debouncedSearch = debounce((q) => runSearch(q), opts.debounce);

        // ---------- Selection ----------
        function commitRecent(text) {
            if (!opts.persistRecents) return;
            const t = String(text || '').trim();
            if (!t) return;
            state.recents = [t].concat(state.recents.filter(r => r !== t)).slice(0, MAX_RECENTS);
            saveRecents(opts.namespace, state.recents);
        }

        function selectIndex(i) {
            const list = currentList();
            const item = list[i];
            if (item == null) return;
            const label = (typeof item === 'string') ? item : opts.getLabel(item);
            commitRecent(label);
            api.close();
            input.value = label;
            state.query = label;
            if (typeof opts.onSelect === 'function') {
                try { opts.onSelect(item); } catch (e) { console.error(e); }
            }
        }

        // ---------- Events ----------
        input.addEventListener('input', (e) => {
            state.query = input.value;
            state.active = -1;
            state.open = true;
            if (typeof opts.onChange === 'function') opts.onChange(state.query);
            const q = state.query.trim();
            if (q.length >= opts.minChars) {
                debouncedSearch(q);
            } else {
                state.items = [];
                state.loading = false;
                render();
            }
        });

        input.addEventListener('focus', () => { state.open = true; render(); });

        input.addEventListener('keydown', (e) => {
            const list = currentList();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                state.active = Math.min(list.length - 1, state.active + 1);
                state.open = true;
                render();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                state.active = Math.max(-1, state.active - 1);
                render();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (state.active >= 0) {
                    selectIndex(state.active);
                } else if (state.query.trim()) {
                    commitRecent(state.query.trim());
                    if (typeof opts.onSelect === 'function') {
                        opts.onSelect({ query: state.query.trim(), raw: true });
                    }
                    api.close();
                }
            } else if (e.key === 'Escape') {
                api.close();
                input.blur();
            }
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            state.query = '';
            state.items = [];
            state.active = -1;
            input.focus();
            render();
        });

        panel.addEventListener('mousedown', (e) => {
            const action = e.target.closest('[data-action]');
            if (action && action.dataset.action === 'clear-recents') {
                e.preventDefault();
                state.recents = [];
                saveRecents(opts.namespace, []);
                render();
                return;
            }
            const it = e.target.closest('.vsb-item');
            if (!it) return;
            e.preventDefault();
            const idx = parseInt(it.dataset.idx, 10);
            if (!isNaN(idx)) selectIndex(idx);
        });

        document.addEventListener('mousedown', (e) => {
            if (!wrap.contains(e.target)) api.close();
        });

        // Global hotkey
        const hk = parseHotkey(opts.hotkey);
        function onGlobalKey(e) {
            if (state.destroyed) return;
            const tag = (e.target && e.target.tagName || '').toLowerCase();
            const isField = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
            if (matchHotkey(e, hk)) {
                if (hk.key === '/' && isField) return; // don't hijack typing "/"
                e.preventDefault();
                input.focus();
                input.select();
                state.open = true;
                render();
            }
        }
        document.addEventListener('keydown', onGlobalKey);

        // ---------- Public API ----------
        const api = {
            id,
            el: wrap,
            input,
            focus() { input.focus(); },
            blur() { input.blur(); },
            open() { state.open = true; render(); },
            close() { state.open = false; state.active = -1; render(); },
            getValue() { return input.value; },
            setValue(v, { search = true } = {}) {
                input.value = v == null ? '' : String(v);
                state.query = input.value;
                if (search && state.query.trim().length >= opts.minChars) {
                    runSearch(state.query.trim());
                } else {
                    render();
                }
            },
            clear() { clearBtn.click(); },
            getRecents() { return state.recents.slice(); },
            clearRecents() {
                state.recents = [];
                saveRecents(opts.namespace, []);
                render();
            },
            setSuggestions(list) {
                opts.suggestions = Array.isArray(list) ? list : [];
                render();
            },
            setSource(fn) { opts.source = fn; },
            destroy() {
                state.destroyed = true;
                document.removeEventListener('keydown', onGlobalKey);
                root.innerHTML = '';
            }
        };

        render();
        return api;
    }

    const SearchBox = {
        version: '1.0.0',
        create,
        _utils: { debounce, highlight, escapeHtml, parseHotkey }
    };

    global.SearchBox = SearchBox;
    if (typeof module !== 'undefined' && module.exports) module.exports = SearchBox;

})(typeof window !== 'undefined' ? window : this);
