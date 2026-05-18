/*!
 * Volvix UI - Steps / Stepper Component
 * Visual stepper: horizontal/vertical, status (pending/active/done/error),
 * descriptions, click-to-navigate.
 *
 * Public API: window.Steps
 *   Steps.create(target, options)  -> instance
 *   Steps.from(selector, options)  -> instance[]
 *   instance.next() / prev() / goTo(i) / setStatus(i, status)
 *   instance.update(options) / destroy()
 *   instance.on(event, handler)
 *
 * Events: change, complete, error, click
 * License: MIT
 */
(function (root, factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Steps = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---------- Utilities ----------
    var STYLE_ID = 'volvix-steps-styles';
    var INSTANCE_KEY = '__volvixStepsInstance__';
    var idCounter = 0;
    function uid(p) { idCounter += 1; return (p || 'step') + '-' + idCounter + '-' + Date.now().toString(36); }

    function isEl(x) { return x && x.nodeType === 1; }
    function resolveEl(target) {
        if (typeof target === 'string') return document.querySelector(target);
        if (isEl(target)) return target;
        return null;
    }
    function extend(target) {
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i];
            if (!src) continue;
            for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
        }
        return target;
    }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ---------- CSS Injection ----------
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '.vx-steps{display:flex;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;gap:0;list-style:none;margin:0;padding:12px 0}',
            '.vx-steps.vx-h{flex-direction:row;align-items:flex-start}',
            '.vx-steps.vx-v{flex-direction:column;align-items:stretch}',
            '.vx-step{position:relative;flex:1;display:flex;align-items:flex-start;cursor:default;padding:8px;border-radius:6px;transition:background .15s}',
            '.vx-steps.vx-h .vx-step{flex-direction:column;align-items:center;text-align:center}',
            '.vx-steps.vx-v .vx-step{flex-direction:row;align-items:flex-start;gap:12px}',
            '.vx-step.vx-clickable{cursor:pointer}',
            '.vx-step.vx-clickable:hover{background:rgba(0,0,0,.04)}',
            '.vx-step.vx-disabled{opacity:.5;cursor:not-allowed}',
            '.vx-step-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;border:2px solid #cfd4da;background:#fff;color:#6c757d;flex:0 0 auto;transition:all .2s;z-index:2;position:relative}',
            '.vx-step-body{margin-top:8px;min-width:0}',
            '.vx-steps.vx-v .vx-step-body{margin-top:2px;flex:1;padding-bottom:18px}',
            '.vx-step-title{font-size:14px;font-weight:600;line-height:1.3}',
            '.vx-step-desc{font-size:12px;color:#6c757d;margin-top:2px;line-height:1.4}',
            '.vx-step-conn{position:absolute;background:#cfd4da;z-index:1;transition:background .2s}',
            '.vx-steps.vx-h .vx-step-conn{top:23px;left:50%;right:-50%;height:2px}',
            '.vx-steps.vx-v .vx-step-conn{left:23px;top:34px;bottom:-6px;width:2px}',
            '.vx-step:last-child .vx-step-conn{display:none}',
            /* states */
            '.vx-step.vx-active .vx-step-icon{border-color:#0d6efd;color:#0d6efd;box-shadow:0 0 0 4px rgba(13,110,253,.15)}',
            '.vx-step.vx-active .vx-step-title{color:#0d6efd}',
            '.vx-step.vx-done .vx-step-icon{border-color:#198754;background:#198754;color:#fff}',
            '.vx-step.vx-done .vx-step-conn{background:#198754}',
            '.vx-step.vx-error .vx-step-icon{border-color:#dc3545;background:#dc3545;color:#fff}',
            '.vx-step.vx-error .vx-step-title{color:#dc3545}',
            '.vx-step.vx-warning .vx-step-icon{border-color:#ffc107;background:#ffc107;color:#212529}',
            '@media (max-width:600px){.vx-steps.vx-h{flex-direction:column}.vx-steps.vx-h .vx-step{flex-direction:row;text-align:left;gap:12px}.vx-steps.vx-h .vx-step-body{margin-top:2px}.vx-steps.vx-h .vx-step-conn{left:23px;top:34px;bottom:-6px;width:2px;right:auto;height:auto}}'
        ].join('');
        var s = document.createElement('style');
        s.id = STYLE_ID; s.type = 'text/css';
        s.appendChild(document.createTextNode(css));
        (document.head || document.documentElement).appendChild(s);
    }

    // ---------- Defaults ----------
    var DEFAULTS = {
        steps: [],            // [{title, description, status, icon, disabled}]
        current: 0,           // active index
        orientation: 'horizontal', // horizontal | vertical
        clickable: true,      // user may click steps to navigate
        linear: false,        // if true, can only navigate to <= current+1
        allowError: true,
        onChange: null,
        onComplete: null,
        onClick: null
    };

    var VALID_STATUS = { pending: 1, active: 1, done: 1, error: 1, warning: 1 };

    // ---------- Component ----------
    function Stepper(el, opts) {
        if (!isEl(el)) throw new Error('Steps: target element not found');
        if (el[INSTANCE_KEY]) el[INSTANCE_KEY].destroy();
        injectStyles();

        this.el = el;
        this.id = uid('steps');
        this.options = extend({}, DEFAULTS, opts || {});
        this.options.steps = (this.options.steps || []).map(function (s, i) {
            return {
                title: s.title || ('Step ' + (i + 1)),
                description: s.description || '',
                status: VALID_STATUS[s.status] ? s.status : null,
                icon: s.icon || null,
                disabled: !!s.disabled
            };
        });
        this._listeners = {};
        this._onClickBound = this._onClick.bind(this);
        el[INSTANCE_KEY] = this;
        this.render();
    }

    Stepper.prototype.render = function () {
        var o = this.options;
        var horizontal = o.orientation !== 'vertical';
        var ul = document.createElement('ul');
        ul.className = 'vx-steps ' + (horizontal ? 'vx-h' : 'vx-v');
        ul.setAttribute('role', 'list');
        ul.setAttribute('data-steps-id', this.id);

        var current = clamp(o.current | 0, 0, Math.max(0, o.steps.length - 1));
        o.current = current;

        for (var i = 0; i < o.steps.length; i++) {
            var step = o.steps[i];
            var status = step.status || (i < current ? 'done' : (i === current ? 'active' : 'pending'));
            var li = document.createElement('li');
            li.className = 'vx-step vx-' + status;
            li.setAttribute('data-index', String(i));
            li.setAttribute('role', 'listitem');
            li.setAttribute('aria-current', status === 'active' ? 'step' : 'false');
            if (step.disabled) li.classList.add('vx-disabled');
            if (o.clickable && !step.disabled) li.classList.add('vx-clickable');

            var iconHtml = step.icon != null ? escapeHtml(step.icon)
                : (status === 'done' ? '&#10003;'
                : (status === 'error' ? '!'
                : String(i + 1)));

            li.innerHTML =
                '<span class="vx-step-icon" aria-hidden="true">' + iconHtml + '</span>' +
                '<div class="vx-step-body">' +
                    '<div class="vx-step-title">' + escapeHtml(step.title) + '</div>' +
                    (step.description ? '<div class="vx-step-desc">' + escapeHtml(step.description) + '</div>' : '') +
                '</div>' +
                '<span class="vx-step-conn" aria-hidden="true"></span>';
            ul.appendChild(li);
        }

        this.el.innerHTML = '';
        this.el.appendChild(ul);
        this._root = ul;
        ul.addEventListener('click', this._onClickBound);
    };

    Stepper.prototype._onClick = function (ev) {
        var li = ev.target.closest ? ev.target.closest('.vx-step') : null;
        if (!li || !this._root.contains(li)) return;
        var idx = parseInt(li.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        var step = this.options.steps[idx];
        if (!step || step.disabled) return;
        this._emit('click', { index: idx, step: step });
        if (typeof this.options.onClick === 'function') this.options.onClick(idx, step);
        if (!this.options.clickable) return;
        if (this.options.linear && idx > this.options.current + 1) return;
        this.goTo(idx);
    };

    Stepper.prototype.goTo = function (idx) {
        var o = this.options;
        idx = clamp(idx | 0, 0, o.steps.length - 1);
        var prev = o.current;
        if (prev === idx) return this;
        o.current = idx;
        // auto-mark previous active->done if it had no explicit error
        for (var i = 0; i < o.steps.length; i++) {
            var s = o.steps[i];
            if (s.status === 'error') continue;
            s.status = (i < idx) ? 'done' : (i === idx ? 'active' : 'pending');
        }
        this.render();
        this._emit('change', { from: prev, to: idx });
        if (typeof o.onChange === 'function') o.onChange(idx, prev);
        if (idx === o.steps.length - 1) {
            this._emit('complete', { index: idx });
            if (typeof o.onComplete === 'function') o.onComplete(idx);
        }
        return this;
    };

    Stepper.prototype.next = function () { return this.goTo(this.options.current + 1); };
    Stepper.prototype.prev = function () { return this.goTo(this.options.current - 1); };

    Stepper.prototype.setStatus = function (idx, status) {
        if (!VALID_STATUS[status]) return this;
        var s = this.options.steps[idx];
        if (!s) return this;
        s.status = status;
        if (status === 'error') this._emit('error', { index: idx, step: s });
        this.render();
        return this;
    };

    Stepper.prototype.getCurrent = function () { return this.options.current; };
    Stepper.prototype.getSteps = function () { return this.options.steps.slice(); };

    Stepper.prototype.update = function (opts) {
        this.options = extend({}, this.options, opts || {});
        this.render();
        return this;
    };

    Stepper.prototype.on = function (event, handler) {
        if (typeof handler !== 'function') return this;
        (this._listeners[event] = this._listeners[event] || []).push(handler);
        return this;
    };
    Stepper.prototype.off = function (event, handler) {
        var arr = this._listeners[event]; if (!arr) return this;
        if (!handler) { delete this._listeners[event]; return this; }
        this._listeners[event] = arr.filter(function (h) { return h !== handler; });
        return this;
    };
    Stepper.prototype._emit = function (event, payload) {
        var arr = this._listeners[event]; if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](payload); } catch (e) { /* swallow */ }
        }
    };

    Stepper.prototype.destroy = function () {
        if (this._root) this._root.removeEventListener('click', this._onClickBound);
        if (this.el) { this.el.innerHTML = ''; try { delete this.el[INSTANCE_KEY]; } catch (e) { this.el[INSTANCE_KEY] = null; } }
        this._listeners = {};
        this._root = null;
        this.el = null;
    };

    // ---------- Factory / Public ----------
    var Steps = {
        version: '1.0.0',
        create: function (target, options) {
            var el = resolveEl(target);
            return new Stepper(el, options);
        },
        from: function (selector, options) {
            var nodes = document.querySelectorAll(selector);
            var out = [];
            for (var i = 0; i < nodes.length; i++) out.push(new Stepper(nodes[i], options));
            return out;
        },
        get: function (target) {
            var el = resolveEl(target);
            return el ? el[INSTANCE_KEY] || null : null;
        },
        defaults: function (opts) { extend(DEFAULTS, opts || {}); return DEFAULTS; },
        injectStyles: injectStyles
    };

    return Steps;
}));
