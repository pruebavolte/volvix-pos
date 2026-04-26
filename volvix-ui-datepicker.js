/**
 * volvix-ui-datepicker.js
 * Volvix UI DatePicker Component
 *
 * Features:
 *  - Popup calendar attached to <input> elements.
 *  - Single date and date range modes.
 *  - Quick presets: today, yesterday, this week, last week, this month, last month, last 7/30/90 days.
 *  - Localization (es / en) with month and weekday names.
 *  - Keyboard navigation (arrows, enter, escape).
 *  - Auto-binds to <input data-volvix-datepicker> on DOMContentLoaded.
 *  - Programmatic API: window.DatePicker.attach(input, options).
 *
 * Usage:
 *   <input data-volvix-datepicker data-mode="range" data-locale="es" data-format="YYYY-MM-DD">
 *   window.DatePicker.attach(myInput, { mode: 'single', onChange: fn });
 */
(function (global) {
    'use strict';

    // ---------------------------------------------------------------------
    // Localization dictionaries
    // ---------------------------------------------------------------------
    var LOCALES = {
        es: {
            months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
            monthsShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
            weekdays: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
            firstDayOfWeek: 1,
            presets: {
                today: 'Hoy',
                yesterday: 'Ayer',
                thisWeek: 'Esta semana',
                lastWeek: 'Semana pasada',
                thisMonth: 'Este mes',
                lastMonth: 'Mes pasado',
                last7: 'Últimos 7 días',
                last30: 'Últimos 30 días',
                last90: 'Últimos 90 días',
                clear: 'Limpiar',
                apply: 'Aplicar',
                cancel: 'Cancelar'
            }
        },
        en: {
            months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
            monthsShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
            weekdays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            firstDayOfWeek: 1,
            presets: {
                today: 'Today',
                yesterday: 'Yesterday',
                thisWeek: 'This week',
                lastWeek: 'Last week',
                thisMonth: 'This month',
                lastMonth: 'Last month',
                last7: 'Last 7 days',
                last30: 'Last 30 days',
                last90: 'Last 90 days',
                clear: 'Clear',
                apply: 'Apply',
                cancel: 'Cancel'
            }
        }
    };

    // ---------------------------------------------------------------------
    // Date utilities
    // ---------------------------------------------------------------------
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function startOfDay(d) {
        var x = new Date(d.getTime());
        x.setHours(0, 0, 0, 0);
        return x;
    }

    function addDays(d, n) {
        var x = new Date(d.getTime());
        x.setDate(x.getDate() + n);
        return x;
    }

    function sameDay(a, b) {
        if (!a || !b) return false;
        return a.getFullYear() === b.getFullYear() &&
               a.getMonth() === b.getMonth() &&
               a.getDate() === b.getDate();
    }

    function inRange(d, start, end) {
        if (!start || !end) return false;
        var t = startOfDay(d).getTime();
        return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime();
    }

    function formatDate(d, fmt) {
        if (!d) return '';
        fmt = fmt || 'YYYY-MM-DD';
        return fmt
            .replace('YYYY', d.getFullYear())
            .replace('MM', pad(d.getMonth() + 1))
            .replace('DD', pad(d.getDate()))
            .replace('HH', pad(d.getHours()))
            .replace('mm', pad(d.getMinutes()));
    }

    function parseDate(str) {
        if (!str) return null;
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        var d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    function startOfWeek(d, firstDay) {
        var x = startOfDay(d);
        var day = (x.getDay() - firstDay + 7) % 7;
        return addDays(x, -day);
    }

    function endOfWeek(d, firstDay) {
        return addDays(startOfWeek(d, firstDay), 6);
    }

    function startOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function endOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }

    // ---------------------------------------------------------------------
    // Style injection (one-time)
    // ---------------------------------------------------------------------
    var STYLE_ID = 'volvix-datepicker-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '.vdp-popup{position:absolute;z-index:9999;background:#fff;border:1px solid #d0d7de;border-radius:8px;',
            'box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px;font-family:system-ui,Segoe UI,Roboto,sans-serif;',
            'font-size:13px;color:#1f2328;display:none;user-select:none;min-width:280px}',
            '.vdp-popup.vdp-open{display:flex;gap:12px}',
            '.vdp-presets{display:flex;flex-direction:column;gap:4px;border-right:1px solid #eaeef2;padding-right:10px;min-width:130px}',
            '.vdp-preset{background:none;border:none;text-align:left;padding:6px 8px;border-radius:4px;cursor:pointer;color:#1f2328}',
            '.vdp-preset:hover{background:#f3f4f6}',
            '.vdp-preset.active{background:#0969da;color:#fff}',
            '.vdp-cal{display:flex;flex-direction:column;gap:6px}',
            '.vdp-header{display:flex;align-items:center;justify-content:space-between;gap:6px}',
            '.vdp-nav{background:none;border:none;cursor:pointer;padding:4px 8px;font-size:14px;border-radius:4px}',
            '.vdp-nav:hover{background:#f3f4f6}',
            '.vdp-title{font-weight:600}',
            '.vdp-grid{display:grid;grid-template-columns:repeat(7,32px);gap:2px}',
            '.vdp-wd{font-size:11px;color:#656d76;text-align:center;padding:4px 0;font-weight:600}',
            '.vdp-day{height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;color:#1f2328}',
            '.vdp-day:hover{background:#ddf4ff}',
            '.vdp-day.vdp-out{color:#afb8c1}',
            '.vdp-day.vdp-today{font-weight:700;border:1px solid #0969da}',
            '.vdp-day.vdp-selected{background:#0969da;color:#fff}',
            '.vdp-day.vdp-in-range{background:#ddf4ff}',
            '.vdp-day.vdp-range-start,.vdp-day.vdp-range-end{background:#0969da;color:#fff}',
            '.vdp-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}',
            '.vdp-btn{padding:5px 10px;border-radius:4px;border:1px solid #d0d7de;background:#f6f8fa;cursor:pointer;font-size:12px}',
            '.vdp-btn.vdp-primary{background:#0969da;color:#fff;border-color:#0969da}'
        ].join('');
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------------------
    // DatePicker instance
    // ---------------------------------------------------------------------
    function DatePicker(input, options) {
        this.input = input;
        this.opts = Object.assign({
            mode: 'single',          // 'single' | 'range'
            locale: 'es',
            format: 'YYYY-MM-DD',
            minDate: null,
            maxDate: null,
            showPresets: true,
            onChange: null,
            onClose: null
        }, options || {});

        this.L = LOCALES[this.opts.locale] || LOCALES.es;
        this.viewDate = startOfDay(new Date());
        this.start = null;
        this.end = null;
        this.tempStart = null;
        this.popup = null;
        this.isOpen = false;

        injectStyles();
        this._readInput();
        this._bind();
    }

    DatePicker.prototype._readInput = function () {
        var v = this.input.value;
        if (!v) return;
        if (this.opts.mode === 'range') {
            var parts = v.split(/\s*(?:,|→|-)\s*/);
            if (parts.length >= 2) {
                this.start = parseDate(parts[0]);
                this.end = parseDate(parts[1]);
            }
        } else {
            this.start = parseDate(v);
        }
    };

    DatePicker.prototype._bind = function () {
        var self = this;
        this.input.addEventListener('focus', function () { self.open(); });
        this.input.addEventListener('click', function () { self.open(); });
        this.input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') self.close();
        });
        document.addEventListener('mousedown', function (e) {
            if (!self.isOpen) return;
            if (self.popup && !self.popup.contains(e.target) && e.target !== self.input) {
                self.close();
            }
        });
        window.addEventListener('resize', function () { if (self.isOpen) self._position(); });
        window.addEventListener('scroll', function () { if (self.isOpen) self._position(); }, true);
    };

    DatePicker.prototype.open = function () {
        if (this.isOpen) return;
        if (!this.popup) this._buildPopup();
        this._render();
        this.popup.classList.add('vdp-open');
        this.isOpen = true;
        this._position();
    };

    DatePicker.prototype.close = function () {
        if (!this.isOpen) return;
        this.popup.classList.remove('vdp-open');
        this.isOpen = false;
        this.tempStart = null;
        if (typeof this.opts.onClose === 'function') this.opts.onClose();
    };

    DatePicker.prototype._position = function () {
        var r = this.input.getBoundingClientRect();
        this.popup.style.top = (window.scrollY + r.bottom + 4) + 'px';
        this.popup.style.left = (window.scrollX + r.left) + 'px';
    };

    DatePicker.prototype._buildPopup = function () {
        this.popup = document.createElement('div');
        this.popup.className = 'vdp-popup';
        document.body.appendChild(this.popup);
    };

    DatePicker.prototype._render = function () {
        var self = this;
        this.popup.innerHTML = '';

        if (this.opts.showPresets && this.opts.mode === 'range') {
            this.popup.appendChild(this._renderPresets());
        }

        var cal = document.createElement('div');
        cal.className = 'vdp-cal';
        cal.appendChild(this._renderHeader());
        cal.appendChild(this._renderGrid());
        cal.appendChild(this._renderActions());
        this.popup.appendChild(cal);
    };

    DatePicker.prototype._renderPresets = function () {
        var self = this;
        var box = document.createElement('div');
        box.className = 'vdp-presets';
        var P = this.L.presets;
        var today = startOfDay(new Date());
        var fdw = this.L.firstDayOfWeek;

        var defs = [
            { key: 'today', label: P.today, range: [today, today] },
            { key: 'yesterday', label: P.yesterday, range: [addDays(today, -1), addDays(today, -1)] },
            { key: 'thisWeek', label: P.thisWeek, range: [startOfWeek(today, fdw), endOfWeek(today, fdw)] },
            { key: 'lastWeek', label: P.lastWeek, range: [addDays(startOfWeek(today, fdw), -7), addDays(endOfWeek(today, fdw), -7)] },
            { key: 'thisMonth', label: P.thisMonth, range: [startOfMonth(today), endOfMonth(today)] },
            { key: 'lastMonth', label: P.lastMonth, range: [startOfMonth(addDays(startOfMonth(today), -1)), endOfMonth(addDays(startOfMonth(today), -1))] },
            { key: 'last7', label: P.last7, range: [addDays(today, -6), today] },
            { key: 'last30', label: P.last30, range: [addDays(today, -29), today] },
            { key: 'last90', label: P.last90, range: [addDays(today, -89), today] }
        ];

        defs.forEach(function (def) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'vdp-preset';
            b.textContent = def.label;
            b.addEventListener('click', function () {
                self.start = def.range[0];
                self.end = def.range[1];
                self.viewDate = new Date(self.start.getTime());
                self._commit();
            });
            box.appendChild(b);
        });

        return box;
    };

    DatePicker.prototype._renderHeader = function () {
        var self = this;
        var h = document.createElement('div');
        h.className = 'vdp-header';

        var prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'vdp-nav';
        prev.textContent = '‹';
        prev.addEventListener('click', function () {
            self.viewDate = new Date(self.viewDate.getFullYear(), self.viewDate.getMonth() - 1, 1);
            self._render();
        });

        var title = document.createElement('div');
        title.className = 'vdp-title';
        title.textContent = this.L.months[this.viewDate.getMonth()] + ' ' + this.viewDate.getFullYear();

        var next = document.createElement('button');
        next.type = 'button';
        next.className = 'vdp-nav';
        next.textContent = '›';
        next.addEventListener('click', function () {
            self.viewDate = new Date(self.viewDate.getFullYear(), self.viewDate.getMonth() + 1, 1);
            self._render();
        });

        h.appendChild(prev); h.appendChild(title); h.appendChild(next);
        return h;
    };

    DatePicker.prototype._renderGrid = function () {
        var self = this;
        var grid = document.createElement('div');
        grid.className = 'vdp-grid';
        var fdw = this.L.firstDayOfWeek;

        this.L.weekdays.forEach(function (w) {
            var c = document.createElement('div');
            c.className = 'vdp-wd';
            c.textContent = w;
            grid.appendChild(c);
        });

        var first = startOfMonth(this.viewDate);
        var firstWeekday = (first.getDay() - fdw + 7) % 7;
        var cursor = addDays(first, -firstWeekday);
        var today = startOfDay(new Date());

        for (var i = 0; i < 42; i++) {
            var d = new Date(cursor.getTime());
            var cell = document.createElement('div');
            cell.className = 'vdp-day';
            cell.textContent = d.getDate();
            if (d.getMonth() !== this.viewDate.getMonth()) cell.classList.add('vdp-out');
            if (sameDay(d, today)) cell.classList.add('vdp-today');

            if (this.opts.mode === 'single') {
                if (sameDay(d, this.start)) cell.classList.add('vdp-selected');
            } else {
                var s = this.tempStart || this.start;
                var e = this.tempStart ? null : this.end;
                if (s && sameDay(d, s)) cell.classList.add('vdp-range-start','vdp-selected');
                if (e && sameDay(d, e)) cell.classList.add('vdp-range-end','vdp-selected');
                if (s && e && inRange(d, s, e) && !sameDay(d, s) && !sameDay(d, e)) cell.classList.add('vdp-in-range');
            }

            (function (date) {
                cell.addEventListener('click', function () { self._selectDay(date); });
            })(d);

            grid.appendChild(cell);
            cursor = addDays(cursor, 1);
        }
        return grid;
    };

    DatePicker.prototype._selectDay = function (d) {
        if (this.opts.minDate && d < startOfDay(this.opts.minDate)) return;
        if (this.opts.maxDate && d > startOfDay(this.opts.maxDate)) return;

        if (this.opts.mode === 'single') {
            this.start = d;
            this.end = null;
            this._commit();
            return;
        }
        // range mode
        if (!this.tempStart) {
            this.tempStart = d;
            this.start = d;
            this.end = null;
            this._render();
        } else {
            if (d < this.tempStart) {
                this.start = d;
                this.end = this.tempStart;
            } else {
                this.start = this.tempStart;
                this.end = d;
            }
            this.tempStart = null;
            this._commit();
        }
    };

    DatePicker.prototype._renderActions = function () {
        var self = this;
        var box = document.createElement('div');
        box.className = 'vdp-actions';

        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'vdp-btn';
        clear.textContent = this.L.presets.clear;
        clear.addEventListener('click', function () {
            self.start = null;
            self.end = null;
            self.tempStart = null;
            self._commit();
        });

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'vdp-btn';
        cancel.textContent = this.L.presets.cancel;
        cancel.addEventListener('click', function () { self.close(); });

        box.appendChild(clear);
        box.appendChild(cancel);
        return box;
    };

    DatePicker.prototype._commit = function () {
        var fmt = this.opts.format;
        var val = '';
        if (this.opts.mode === 'single') {
            val = this.start ? formatDate(this.start, fmt) : '';
        } else {
            if (this.start && this.end) {
                val = formatDate(this.start, fmt) + ' → ' + formatDate(this.end, fmt);
            } else if (this.start) {
                val = formatDate(this.start, fmt);
            }
        }
        this.input.value = val;
        if (typeof this.opts.onChange === 'function') {
            this.opts.onChange({ start: this.start, end: this.end, value: val });
        }
        try {
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) { /* old IE */ }
        this._render();
        if (this.opts.mode === 'single' || (this.start && this.end)) this.close();
    };

    DatePicker.prototype.getValue = function () {
        return { start: this.start, end: this.end, value: this.input.value };
    };

    DatePicker.prototype.setValue = function (start, end) {
        this.start = start ? startOfDay(start) : null;
        this.end = end ? startOfDay(end) : null;
        if (this.start) this.viewDate = new Date(this.start.getTime());
        this._commit();
    };

    DatePicker.prototype.destroy = function () {
        if (this.popup && this.popup.parentNode) this.popup.parentNode.removeChild(this.popup);
        this.popup = null;
        this.isOpen = false;
    };

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    var API = {
        attach: function (input, options) {
            if (!input || input.__vdp) return input ? input.__vdp : null;
            var inst = new DatePicker(input, options);
            input.__vdp = inst;
            return inst;
        },
        autoBind: function (root) {
            root = root || document;
            var inputs = root.querySelectorAll('input[data-volvix-datepicker]');
            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                if (inp.__vdp) continue;
                API.attach(inp, {
                    mode:   inp.getAttribute('data-mode')   || 'single',
                    locale: inp.getAttribute('data-locale') || 'es',
                    format: inp.getAttribute('data-format') || 'YYYY-MM-DD',
                    showPresets: inp.getAttribute('data-presets') !== 'false'
                });
            }
        },
        locales: LOCALES,
        version: '1.0.0'
    };

    global.DatePicker = API;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { API.autoBind(); });
    } else {
        API.autoBind();
    }

})(typeof window !== 'undefined' ? window : this);
