/**
 * volvix-ui-pagination.js
 * UI Pagination component for Volvix POS / Copiador y Pegador.
 *
 * Features:
 *   - Prev / Next navigation
 *   - Jump to specific page
 *   - Configurable items per page (with selector)
 *   - Total counter ("Showing X-Y of Z")
 *   - Ellipsis-aware page button rendering
 *   - Pure vanilla JS, no dependencies
 *   - Exposes window.Pagination (factory + class)
 *
 * Usage:
 *   const pager = window.Pagination.create({
 *     container: '#myPager',
 *     totalItems: 1234,
 *     itemsPerPage: 25,
 *     currentPage: 1,
 *     pageSizeOptions: [10, 25, 50, 100],
 *     onChange: ({ page, pageSize, offset }) => loadData(offset, pageSize)
 *   });
 *   pager.setTotal(2000);
 *   pager.goTo(5);
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        container: null,
        totalItems: 0,
        itemsPerPage: 25,
        currentPage: 1,
        pageSizeOptions: [10, 25, 50, 100],
        maxButtons: 7,
        showJump: true,
        showPageSize: true,
        showCounter: true,
        labels: {
            prev: 'Anterior',
            next: 'Siguiente',
            first: 'Inicio',
            last: 'Final',
            jump: 'Ir a',
            perPage: 'Por página',
            counter: 'Mostrando {from}-{to} de {total}',
            empty: 'Sin resultados'
        },
        onChange: null
    };

    function clamp(n, lo, hi) {
        n = parseInt(n, 10) || 0;
        if (n < lo) return lo;
        if (n > hi) return hi;
        return n;
    }

    function format(tpl, vars) {
        return tpl.replace(/\{(\w+)\}/g, function (_, k) {
            return vars[k] != null ? vars[k] : '';
        });
    }

    function resolveContainer(c) {
        if (!c) return null;
        if (typeof c === 'string') return document.querySelector(c);
        if (c.nodeType === 1) return c;
        return null;
    }

    function Pagination(options) {
        this.opts = Object.assign({}, DEFAULTS, options || {});
        this.opts.labels = Object.assign({}, DEFAULTS.labels, (options && options.labels) || {});
        this.container = resolveContainer(this.opts.container);
        this.totalItems = Math.max(0, parseInt(this.opts.totalItems, 10) || 0);
        this.pageSize = Math.max(1, parseInt(this.opts.itemsPerPage, 10) || 25);
        this.page = Math.max(1, parseInt(this.opts.currentPage, 10) || 1);
        this._listeners = [];
        if (typeof this.opts.onChange === 'function') {
            this._listeners.push(this.opts.onChange);
        }
        this.render();
    }

    Pagination.prototype.totalPages = function () {
        if (this.totalItems <= 0) return 1;
        return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    };

    Pagination.prototype.offset = function () {
        return (this.page - 1) * this.pageSize;
    };

    Pagination.prototype.range = function () {
        if (this.totalItems === 0) return { from: 0, to: 0 };
        var from = this.offset() + 1;
        var to = Math.min(this.totalItems, this.offset() + this.pageSize);
        return { from: from, to: to };
    };

    Pagination.prototype.on = function (cb) {
        if (typeof cb === 'function') this._listeners.push(cb);
        return this;
    };

    Pagination.prototype._emit = function () {
        var payload = {
            page: this.page,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            totalPages: this.totalPages(),
            offset: this.offset(),
            range: this.range()
        };
        for (var i = 0; i < this._listeners.length; i++) {
            try { this._listeners[i](payload); } catch (e) { console.error('[Pagination] listener error', e); }
        }
    };

    Pagination.prototype.setTotal = function (total) {
        this.totalItems = Math.max(0, parseInt(total, 10) || 0);
        this.page = clamp(this.page, 1, this.totalPages());
        this.render();
        this._emit();
        return this;
    };

    Pagination.prototype.setPageSize = function (size) {
        var newSize = Math.max(1, parseInt(size, 10) || 1);
        if (newSize === this.pageSize) return this;
        var firstItem = this.offset();
        this.pageSize = newSize;
        this.page = Math.floor(firstItem / this.pageSize) + 1;
        this.page = clamp(this.page, 1, this.totalPages());
        this.render();
        this._emit();
        return this;
    };

    Pagination.prototype.goTo = function (p) {
        var target = clamp(p, 1, this.totalPages());
        if (target === this.page) return this;
        this.page = target;
        this.render();
        this._emit();
        return this;
    };

    Pagination.prototype.next = function () { return this.goTo(this.page + 1); };
    Pagination.prototype.prev = function () { return this.goTo(this.page - 1); };
    Pagination.prototype.first = function () { return this.goTo(1); };
    Pagination.prototype.last = function () { return this.goTo(this.totalPages()); };

    Pagination.prototype._buildPageList = function () {
        var total = this.totalPages();
        var max = Math.max(5, this.opts.maxButtons | 0);
        var current = this.page;
        var out = [];

        if (total <= max) {
            for (var i = 1; i <= total; i++) out.push(i);
            return out;
        }

        out.push(1);
        var side = Math.floor((max - 3) / 2);
        var left = Math.max(2, current - side);
        var right = Math.min(total - 1, current + side);

        if (current - 1 <= side) right = max - 2;
        if (total - current <= side) left = total - (max - 3);

        if (left > 2) out.push('...');
        for (var j = left; j <= right; j++) out.push(j);
        if (right < total - 1) out.push('...');
        out.push(total);
        return out;
    };

    Pagination.prototype.render = function () {
        if (!this.container) return;
        var L = this.opts.labels;
        var total = this.totalPages();
        var pages = this._buildPageList();
        var r = this.range();
        var counterText = this.totalItems === 0
            ? L.empty
            : format(L.counter, { from: r.from, to: r.to, total: this.totalItems });

        var html = [];
        html.push('<div class="vpg" data-vpg-root>');

        if (this.opts.showCounter) {
            html.push('<div class="vpg-counter" data-vpg-counter>' + escapeHtml(counterText) + '</div>');
        }

        html.push('<nav class="vpg-nav" role="navigation" aria-label="Pagination">');
        html.push(btn('first', L.first, this.page <= 1, '«'));
        html.push(btn('prev', L.prev, this.page <= 1, '‹ ' + escapeHtml(L.prev)));

        for (var i = 0; i < pages.length; i++) {
            var p = pages[i];
            if (p === '...') {
                html.push('<span class="vpg-ellipsis">…</span>');
            } else {
                var isActive = p === this.page;
                html.push(
                    '<button type="button" class="vpg-page' + (isActive ? ' is-active' : '') +
                    '" data-vpg-page="' + p + '"' + (isActive ? ' aria-current="page"' : '') + '>' +
                    p + '</button>'
                );
            }
        }

        html.push(btn('next', L.next, this.page >= total, escapeHtml(L.next) + ' ›'));
        html.push(btn('last', L.last, this.page >= total, '»'));
        html.push('</nav>');

        if (this.opts.showJump) {
            html.push(
                '<div class="vpg-jump">' +
                '<label>' + escapeHtml(L.jump) + ' ' +
                '<input type="number" min="1" max="' + total + '" value="' + this.page +
                '" data-vpg-jump style="width:64px"/>' +
                '</label>' +
                '<span class="vpg-of"> / ' + total + '</span>' +
                '</div>'
            );
        }

        if (this.opts.showPageSize) {
            html.push('<div class="vpg-size"><label>' + escapeHtml(L.perPage) + ' <select data-vpg-size>');
            var opts = this.opts.pageSizeOptions || [];
            for (var k = 0; k < opts.length; k++) {
                var o = opts[k];
                html.push('<option value="' + o + '"' + (o === this.pageSize ? ' selected' : '') + '>' + o + '</option>');
            }
            html.push('</select></label></div>');
        }

        html.push('</div>');
        this.container.innerHTML = html.join('');
        this._bind();
    };

    Pagination.prototype._bind = function () {
        var self = this;
        var root = this.container;

        root.querySelectorAll('[data-vpg-page]').forEach(function (el) {
            el.addEventListener('click', function () {
                self.goTo(parseInt(el.getAttribute('data-vpg-page'), 10));
            });
        });

        var actions = { first: 'first', prev: 'prev', next: 'next', last: 'last' };
        Object.keys(actions).forEach(function (k) {
            var el = root.querySelector('[data-vpg-action="' + k + '"]');
            if (el) el.addEventListener('click', function () { self[actions[k]](); });
        });

        var jump = root.querySelector('[data-vpg-jump]');
        if (jump) {
            var commit = function () {
                var v = parseInt(jump.value, 10);
                if (!isNaN(v)) self.goTo(v);
            };
            jump.addEventListener('change', commit);
            jump.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
            });
        }

        var size = root.querySelector('[data-vpg-size]');
        if (size) {
            size.addEventListener('change', function () {
                self.setPageSize(parseInt(size.value, 10));
            });
        }
    };

    Pagination.prototype.destroy = function () {
        if (this.container) this.container.innerHTML = '';
        this._listeners = [];
    };

    function btn(action, label, disabled, inner) {
        return '<button type="button" class="vpg-ctrl" data-vpg-action="' + action +
            '" aria-label="' + escapeHtml(label) + '"' + (disabled ? ' disabled' : '') + '>' +
            inner + '</button>';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var api = {
        create: function (opts) { return new Pagination(opts); },
        Pagination: Pagination,
        defaults: DEFAULTS,
        version: '1.0.0'
    };

    global.Pagination = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
