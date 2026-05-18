/**
 * volvix-ui-contextmenu.js
 * Context Menu (right-click) component
 * Exposes: window.ContextMenu
 *
 * Features:
 *  - Items, sub-menus, separators, icons, keyboard-shortcut display
 *  - Disabled items, hidden items, checkbox items, radio groups
 *  - Auto-flip when overflowing the viewport
 *  - Keyboard navigation (Arrow keys, Enter, Esc, Home/End)
 *  - Multiple independent menus, single active root at a time
 */
(function (global) {
    'use strict';

    const NS = 'vctxmenu';
    let activeRoot = null;
    let zCounter = 100000;

    // ---------- Styles (injected once) ----------
    function injectStyles() {
        if (document.getElementById(NS + '-styles')) return;
        const css = `
        .${NS}-root, .${NS}-sub {
            position: fixed;
            min-width: 200px;
            max-width: 360px;
            background: #1f2330;
            color: #e6e8ef;
            border: 1px solid #353b4c;
            border-radius: 6px;
            box-shadow: 0 8px 28px rgba(0,0,0,0.45);
            padding: 4px 0;
            font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            user-select: none;
            outline: none;
        }
        .${NS}-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 14px 6px 10px;
            cursor: default;
            position: relative;
            white-space: nowrap;
        }
        .${NS}-item:hover:not(.${NS}-disabled),
        .${NS}-item.${NS}-active:not(.${NS}-disabled) {
            background: #3b6cf6;
            color: #fff;
        }
        .${NS}-icon {
            width: 16px; height: 16px;
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 13px; flex-shrink: 0;
        }
        .${NS}-label { flex: 1; }
        .${NS}-shortcut {
            color: #9aa3bd;
            font-size: 11px;
            margin-left: 24px;
            letter-spacing: 0.3px;
        }
        .${NS}-item:hover .${NS}-shortcut,
        .${NS}-item.${NS}-active .${NS}-shortcut { color: #d8def0; }
        .${NS}-arrow { color: #9aa3bd; margin-left: 6px; }
        .${NS}-separator {
            height: 1px; background: #353b4c;
            margin: 4px 6px;
        }
        .${NS}-disabled { color: #6a708a; cursor: not-allowed; }
        .${NS}-check { width: 16px; text-align: center; }
        .${NS}-header {
            padding: 4px 12px;
            font-size: 11px;
            color: #8a91ad;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }`;
        const s = document.createElement('style');
        s.id = NS + '-styles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ---------- Menu construction ----------
    function buildMenu(items, ctx, depth) {
        const el = document.createElement('div');
        el.className = depth === 0 ? `${NS}-root` : `${NS}-sub`;
        el.tabIndex = -1;
        el.style.zIndex = String(++zCounter);

        const itemEls = [];
        items.forEach((it) => {
            if (it.hidden) return;

            if (it.type === 'separator' || it === '-') {
                const sep = document.createElement('div');
                sep.className = `${NS}-separator`;
                el.appendChild(sep);
                return;
            }
            if (it.type === 'header') {
                const h = document.createElement('div');
                h.className = `${NS}-header`;
                h.textContent = it.label || '';
                el.appendChild(h);
                return;
            }

            const row = document.createElement('div');
            row.className = `${NS}-item`;
            if (it.disabled) row.classList.add(`${NS}-disabled`);

            // checkbox / radio mark or icon
            const icon = document.createElement('span');
            icon.className = `${NS}-icon`;
            if (it.type === 'checkbox') {
                icon.textContent = it.checked ? '✓' : '';
            } else if (it.type === 'radio') {
                icon.textContent = it.checked ? '●' : '';
            } else if (it.icon) {
                if (typeof it.icon === 'string' && it.icon.startsWith('<')) {
                    icon.innerHTML = it.icon;
                } else {
                    icon.textContent = it.icon;
                }
            }
            row.appendChild(icon);

            const lbl = document.createElement('span');
            lbl.className = `${NS}-label`;
            lbl.textContent = it.label || '';
            row.appendChild(lbl);

            if (it.shortcut) {
                const sc = document.createElement('span');
                sc.className = `${NS}-shortcut`;
                sc.textContent = it.shortcut;
                row.appendChild(sc);
            }
            if (it.submenu && it.submenu.length) {
                const arr = document.createElement('span');
                arr.className = `${NS}-arrow`;
                arr.textContent = '▶';
                row.appendChild(arr);
            }

            row._item = it;
            row.addEventListener('mouseenter', () => activate(el, row, ctx, depth));
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                if (it.disabled) return;
                if (it.submenu && it.submenu.length) {
                    openSub(el, row, it.submenu, ctx, depth);
                    return;
                }
                triggerItem(it, ctx);
            });

            el.appendChild(row);
            itemEls.push(row);
        });

        el._items = itemEls;
        return el;
    }

    function triggerItem(it, ctx) {
        if (it.type === 'checkbox') it.checked = !it.checked;
        if (it.type === 'radio' && it._group) {
            it._group.forEach((g) => (g.checked = false));
            it.checked = true;
        }
        try { it.action && it.action(ctx, it); } catch (e) { console.error(e); }
        ContextMenu.close();
    }

    // ---------- Active row / submenu handling ----------
    function activate(menuEl, row, ctx, depth) {
        if (menuEl._activeRow === row) return;
        if (menuEl._activeRow) menuEl._activeRow.classList.remove(`${NS}-active`);
        menuEl._activeRow = row;
        if (row) row.classList.add(`${NS}-active`);

        // close any deeper submenu
        if (menuEl._sub) {
            menuEl._sub.remove();
            menuEl._sub = null;
        }
        if (row && row._item && row._item.submenu && !row._item.disabled) {
            openSub(menuEl, row, row._item.submenu, ctx, depth);
        }
    }

    function openSub(parentEl, row, items, ctx, depth) {
        const sub = buildMenu(items, ctx, depth + 1);
        document.body.appendChild(sub);
        const r = row.getBoundingClientRect();
        positionMenu(sub, r.right - 2, r.top - 4);
        parentEl._sub = sub;
        sub._parent = parentEl;
    }

    // ---------- Positioning ----------
    function positionMenu(el, x, y) {
        el.style.left = '0px';
        el.style.top = '0px';
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (x + w > vw - 4) x = Math.max(4, vw - w - 4);
        if (y + h > vh - 4) y = Math.max(4, vh - h - 4);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }

    // ---------- Keyboard ----------
    function onKey(e) {
        if (!activeRoot) return;
        let menu = activeRoot;
        while (menu._sub) menu = menu._sub;

        const items = menu._items.filter((r) => !r.classList.contains(`${NS}-disabled`));
        const idx = items.indexOf(menu._activeRow);

        if (e.key === 'Escape') { e.preventDefault(); ContextMenu.close(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const n = items[(idx + 1 + items.length) % items.length];
            if (n) activate(menu, n, menu._ctx, 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const n = items[(idx - 1 + items.length) % items.length];
            if (n) activate(menu, n, menu._ctx, 0);
        } else if (e.key === 'ArrowRight') {
            const it = menu._activeRow && menu._activeRow._item;
            if (it && it.submenu) {
                e.preventDefault();
                openSub(menu, menu._activeRow, it.submenu, menu._ctx, 0);
                const sub = menu._sub;
                if (sub && sub._items.length) activate(sub, sub._items[0], menu._ctx, 1);
            }
        } else if (e.key === 'ArrowLeft') {
            if (menu._parent) {
                e.preventDefault();
                menu.remove();
                menu._parent._sub = null;
            }
        } else if (e.key === 'Enter') {
            if (menu._activeRow) { e.preventDefault(); menu._activeRow.click(); }
        } else if (e.key === 'Home') {
            if (items[0]) activate(menu, items[0], menu._ctx, 0);
        } else if (e.key === 'End') {
            if (items.length) activate(menu, items[items.length - 1], menu._ctx, 0);
        }
    }

    function onDocDown(e) {
        if (!activeRoot) return;
        let n = e.target;
        while (n) {
            if (n.classList && (n.classList.contains(`${NS}-root`) || n.classList.contains(`${NS}-sub`))) return;
            n = n.parentNode;
        }
        ContextMenu.close();
    }

    // ---------- Public API ----------
    const ContextMenu = {
        /**
         * Show a context menu.
         * @param {Array} items   Array of item descriptors.
         * @param {number} x      Page X (clientX).
         * @param {number} y      Page Y (clientY).
         * @param {object} ctx    Optional context passed to actions.
         */
        show(items, x, y, ctx) {
            injectStyles();
            this.close();
            // Resolve radio groups
            const groups = {};
            (function walk(arr) {
                arr.forEach((it) => {
                    if (it && it.type === 'radio' && it.group) {
                        (groups[it.group] = groups[it.group] || []).push(it);
                        it._group = groups[it.group];
                    }
                    if (it && it.submenu) walk(it.submenu);
                });
            })(items);

            const root = buildMenu(items, ctx || {}, 0);
            root._ctx = ctx || {};
            document.body.appendChild(root);
            positionMenu(root, x, y);
            activeRoot = root;
            root.focus();
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('keydown', onKey, true);
            window.addEventListener('blur', this.close);
            window.addEventListener('resize', this.close);
            return root;
        },

        close() {
            if (!activeRoot) return;
            // remove submenus chain
            let m = activeRoot;
            while (m && m._sub) { const s = m._sub; m._sub = null; m = s; }
            document.querySelectorAll(`.${NS}-root, .${NS}-sub`).forEach((n) => n.remove());
            activeRoot = null;
            document.removeEventListener('mousedown', onDocDown, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('blur', ContextMenu.close);
            window.removeEventListener('resize', ContextMenu.close);
        },

        /**
         * Bind a target element so right-click opens the given menu.
         * @param {Element|string} target  Element or selector.
         * @param {Array|Function} items   Items array or fn(event)->items.
         */
        bind(target, items) {
            const el = typeof target === 'string' ? document.querySelector(target) : target;
            if (!el) return;
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const list = typeof items === 'function' ? items(e) : items;
                if (!list || !list.length) return;
                ContextMenu.show(list, e.clientX, e.clientY, { event: e, target: e.target });
            });
        },

        isOpen() { return !!activeRoot; }
    };

    global.ContextMenu = ContextMenu;
})(window);
