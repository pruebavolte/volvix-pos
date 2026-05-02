/*!
 * volvix-ui-wizard.js
 * UI Wizard / Stepper component for Volvix POS
 * Features: linear/non-linear navigation, per-step validation,
 * progress persistence (localStorage), summary review, events.
 *
 * Usage:
 *   const wiz = Wizard.create('#container', {
 *     id: 'checkout',
 *     mode: 'linear', // or 'non-linear'
 *     persist: true,
 *     steps: [
 *       { id: 'customer', title: 'Cliente', render: el => {...},
 *         validate: data => data.name ? null : 'Nombre requerido' },
 *       { id: 'payment', title: 'Pago', render: el => {...} },
 *       { id: 'review',  title: 'Resumen', render: el => {...}, summary: true }
 *     ],
 *     onComplete: data => console.log('done', data)
 *   });
 */
(function (global) {
    'use strict';

    // ---------- utilities ----------
    function $(sel, root) {
        if (typeof sel === 'string') return (root || document).querySelector(sel);
        return sel;
    }
    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                if (k === 'class') node.className = attrs[k];
                else if (k === 'style' && typeof attrs[k] === 'object')
                    Object.assign(node.style, attrs[k]);
                else if (k.startsWith('on') && typeof attrs[k] === 'function')
                    node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
                else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
            }
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(c => {
                if (c == null) return;
                node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            });
        }
        return node;
    }
    function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
    function noop() {}

    // ---------- styles (injected once) ----------
    const STYLE_ID = 'volvix-wizard-styles';
    const CSS = `
.vx-wiz{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1f2937;display:flex;flex-direction:column;gap:16px;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
.vx-wiz-stepbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.vx-wiz-step{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;background:#f3f4f6;cursor:default;font-size:13px;color:#6b7280;border:1px solid transparent;user-select:none}
.vx-wiz-step.is-active{background:#2563eb;color:#fff;border-color:#1d4ed8}
.vx-wiz-step.is-done{background:#dcfce7;color:#166534;border-color:#86efac}
.vx-wiz-step.is-error{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
.vx-wiz-step.is-clickable{cursor:pointer}
.vx-wiz-step .vx-num{width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
.vx-wiz-progress{height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden}
.vx-wiz-progress>div{height:100%;background:linear-gradient(90deg,#2563eb,#10b981);transition:width .25s ease}
.vx-wiz-body{min-height:160px;padding:8px 4px}
.vx-wiz-error{color:#b91c1c;font-size:13px;margin-top:8px}
.vx-wiz-actions{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #f1f5f9;padding-top:12px}
.vx-wiz-actions button{padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-weight:500}
.vx-wiz-actions button.primary{background:#2563eb;color:#fff;border-color:#1d4ed8}
.vx-wiz-actions button.primary:disabled{opacity:.5;cursor:not-allowed}
.vx-wiz-actions button.ghost{background:transparent}
.vx-wiz-summary{display:flex;flex-direction:column;gap:6px;background:#f9fafb;border-radius:8px;padding:12px}
.vx-wiz-summary-row{display:flex;justify-content:space-between;border-bottom:1px dashed #e5e7eb;padding:4px 0}
.vx-wiz-summary-row:last-child{border-bottom:none}
.vx-wiz-summary-key{font-weight:600;color:#374151}
.vx-wiz-summary-val{color:#1f2937;text-align:right;max-width:60%;overflow-wrap:anywhere}
`;
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ---------- Wizard class ----------
    function Wizard(container, opts) {
        if (!(this instanceof Wizard)) return new Wizard(container, opts);
        this.container = $(container);
        if (!this.container) throw new Error('Wizard: container not found');
        this.opts = Object.assign({
            id: 'wizard',
            mode: 'linear',         // 'linear' | 'non-linear'
            persist: false,
            persistKey: null,
            steps: [],
            data: {},
            startAt: 0,
            labels: {
                next: 'Siguiente',
                prev: 'Anterior',
                finish: 'Finalizar',
                cancel: 'Cancelar'
            },
            onStepChange: noop,
            onComplete: noop,
            onCancel: noop,
            onValidationError: noop
        }, opts || {});
        if (!Array.isArray(this.opts.steps) || !this.opts.steps.length)
            throw new Error('Wizard: at least one step required');
        this.persistKey = this.opts.persistKey || ('vx_wizard_' + this.opts.id);
        this.data = clone(this.opts.data);
        this.errors = {};
        this.visited = {};
        this.completed = {};
        this.current = Math.max(0, Math.min(this.opts.startAt | 0, this.opts.steps.length - 1));
        this._listeners = {};
        injectStyles();
        if (this.opts.persist) this._restore();
        this._build();
        this._render();
    }

    Wizard.prototype.on = function (evt, fn) {
        (this._listeners[evt] = this._listeners[evt] || []).push(fn);
        return this;
    };
    Wizard.prototype._emit = function (evt, payload) {
        (this._listeners[evt] || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } });
    };

    Wizard.prototype._build = function () {
        this.root = el('div', { class: 'vx-wiz', 'data-wizard-id': this.opts.id });
        this.bar = el('div', { class: 'vx-wiz-stepbar' });
        this.progress = el('div', { class: 'vx-wiz-progress' }, el('div'));
        this.body = el('div', { class: 'vx-wiz-body' });
        this.errorBox = el('div', { class: 'vx-wiz-error', style: { display: 'none' } });

        this.btnPrev = el('button', { class: 'ghost', onclick: () => this.prev() }, this.opts.labels.prev);
        this.btnNext = el('button', { class: 'primary', onclick: () => this.next() }, this.opts.labels.next);
        this.btnCancel = el('button', { class: 'ghost', onclick: () => this.cancel() }, this.opts.labels.cancel);
        this.actions = el('div', { class: 'vx-wiz-actions' }, [
            el('div', null, this.btnCancel),
            el('div', { style: { display: 'flex', gap: '8px' } }, [this.btnPrev, this.btnNext])
        ]);

        this.root.appendChild(this.bar);
        this.root.appendChild(this.progress);
        this.root.appendChild(this.body);
        this.root.appendChild(this.errorBox);
        this.root.appendChild(this.actions);
        this.container.innerHTML = '';
        this.container.appendChild(this.root);
    };

    Wizard.prototype._renderStepBar = function () {
        this.bar.innerHTML = '';
        const steps = this.opts.steps;
        const nonLinear = this.opts.mode === 'non-linear';
        steps.forEach((s, i) => {
            const classes = ['vx-wiz-step'];
            if (i === this.current) classes.push('is-active');
            else if (this.completed[s.id]) classes.push('is-done');
            if (this.errors[s.id]) classes.push('is-error');
            const canJump = nonLinear || this.completed[s.id] || i < this.current;
            if (canJump && i !== this.current) classes.push('is-clickable');
            const node = el('div', {
                class: classes.join(' '),
                onclick: canJump ? () => this.goTo(i) : null
            }, [
                el('span', { class: 'vx-num' }, String(i + 1)),
                el('span', null, s.title || s.id)
            ]);
            this.bar.appendChild(node);
        });
        const pct = Math.round(((this.current) / Math.max(1, this.opts.steps.length - 1)) * 100);
        this.progress.firstChild.style.width = pct + '%';
    };

    Wizard.prototype._renderBody = function () {
        const step = this.opts.steps[this.current];
        this.visited[step.id] = true;
        this.body.innerHTML = '';
        if (step.summary) {
            this.body.appendChild(this._buildSummary());
        } else if (typeof step.render === 'function') {
            const out = step.render(this.body, this.data, this);
            if (out instanceof Node) this.body.appendChild(out);
            else if (typeof out === 'string') this.body.innerHTML = out;
        } else if (step.html) {
            this.body.innerHTML = step.html;
        }
        // Auto bind inputs with [data-field]
        this.body.querySelectorAll('[data-field]').forEach(inp => {
            const key = inp.getAttribute('data-field');
            if (this.data[key] != null) {
                if (inp.type === 'checkbox') inp.checked = !!this.data[key];
                else inp.value = this.data[key];
            }
            const handler = () => {
                this.data[key] = inp.type === 'checkbox' ? inp.checked : inp.value;
                if (this.opts.persist) this._persist();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });
    };

    Wizard.prototype._buildSummary = function () {
        const wrap = el('div', { class: 'vx-wiz-summary' });
        const keys = Object.keys(this.data);
        if (!keys.length) {
            wrap.appendChild(el('div', null, '(Sin datos capturados)'));
            return wrap;
        }
        keys.forEach(k => {
            const v = this.data[k];
            const display = (v == null || v === '') ? '—'
                : (typeof v === 'object') ? JSON.stringify(v) : String(v);
            wrap.appendChild(el('div', { class: 'vx-wiz-summary-row' }, [
                el('span', { class: 'vx-wiz-summary-key' }, k),
                el('span', { class: 'vx-wiz-summary-val' }, display)
            ]));
        });
        return wrap;
    };

    Wizard.prototype._renderActions = function () {
        const isFirst = this.current === 0;
        const isLast = this.current === this.opts.steps.length - 1;
        this.btnPrev.disabled = isFirst;
        this.btnPrev.style.visibility = isFirst ? 'hidden' : 'visible';
        this.btnNext.textContent = isLast ? this.opts.labels.finish : this.opts.labels.next;
    };

    Wizard.prototype._render = function () {
        this._renderStepBar();
        this._renderBody();
        this._renderActions();
        this._showError(null);
        this._emit('stepchange', { index: this.current, step: this.opts.steps[this.current], data: this.data });
        try { this.opts.onStepChange(this.current, this.opts.steps[this.current], this.data); } catch (e) {}
    };

    Wizard.prototype._showError = function (msg) {
        if (!msg) {
            this.errorBox.style.display = 'none';
            this.errorBox.textContent = '';
        } else {
            this.errorBox.style.display = 'block';
            this.errorBox.textContent = msg;
        }
    };

    Wizard.prototype._validateCurrent = function () {
        const step = this.opts.steps[this.current];
        if (typeof step.validate !== 'function') return null;
        try {
            const result = step.validate(this.data, this);
            if (result == null || result === true) return null;
            if (typeof result === 'string') return result;
            if (result && result.error) return result.error;
            return 'Validación falló';
        } catch (e) {
            return e.message || String(e);
        }
    };

    Wizard.prototype.next = function () {
        const err = this._validateCurrent();
        const step = this.opts.steps[this.current];
        if (err) {
            this.errors[step.id] = err;
            this._showError(err);
            this._renderStepBar();
            try { this.opts.onValidationError(err, step, this.data); } catch (e) {}
            this._emit('validationerror', { error: err, step });
            return false;
        }
        delete this.errors[step.id];
        this.completed[step.id] = true;
        if (this.opts.persist) this._persist();
        if (this.current >= this.opts.steps.length - 1) return this.finish();
        this.current++;
        this._render();
        return true;
    };

    Wizard.prototype.prev = function () {
        if (this.current === 0) return false;
        this.current--;
        this._render();
        return true;
    };

    Wizard.prototype.goTo = function (index) {
        if (index < 0 || index >= this.opts.steps.length) return false;
        if (this.opts.mode === 'linear') {
            // only allow jumping back, or forward to already-completed steps
            const target = this.opts.steps[index];
            if (index > this.current && !this.completed[target.id]) return false;
        }
        this.current = index;
        this._render();
        return true;
    };

    Wizard.prototype.finish = function () {
        // validate all steps with validators
        for (let i = 0; i < this.opts.steps.length; i++) {
            const s = this.opts.steps[i];
            if (typeof s.validate === 'function') {
                const r = s.validate(this.data, this);
                if (r && r !== true) {
                    this.errors[s.id] = typeof r === 'string' ? r : 'Validación falló';
                    this.current = i;
                    this._render();
                    this._showError(this.errors[s.id]);
                    return false;
                }
            }
            this.completed[s.id] = true;
        }
        if (this.opts.persist) this._clearPersist();
        this._emit('complete', { data: this.data });
        try { this.opts.onComplete(this.data, this); } catch (e) { console.error(e); }
        return true;
    };

    Wizard.prototype.cancel = function () {
        if (this.opts.persist) this._clearPersist();
        this._emit('cancel', { data: this.data });
        try { this.opts.onCancel(this.data, this); } catch (e) {}
    };

    Wizard.prototype.reset = function () {
        this.data = clone(this.opts.data);
        this.errors = {};
        this.completed = {};
        this.visited = {};
        this.current = 0;
        if (this.opts.persist) this._clearPersist();
        this._render();
    };

    Wizard.prototype.setData = function (patch) {
        Object.assign(this.data, patch || {});
        if (this.opts.persist) this._persist();
        this._renderBody();
    };

    Wizard.prototype.getData = function () { return clone(this.data); };
    Wizard.prototype.getStep = function () { return this.opts.steps[this.current]; };
    Wizard.prototype.getIndex = function () { return this.current; };

    // ---------- persistence ----------
    Wizard.prototype._persist = function () {
        try {
            localStorage.setItem(this.persistKey, JSON.stringify({
                data: this.data,
                current: this.current,
                completed: this.completed,
                ts: Date.now()
            }));
        } catch (e) {}
    };
    Wizard.prototype._restore = function () {
        try {
            const raw = localStorage.getItem(this.persistKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') {
                this.data = Object.assign(clone(this.opts.data), saved.data || {});
                this.completed = saved.completed || {};
                if (typeof saved.current === 'number') this.current = saved.current;
            }
        } catch (e) {}
    };
    Wizard.prototype._clearPersist = function () {
        try { localStorage.removeItem(this.persistKey); } catch (e) {}
    };

    // ---------- factory ----------
    const API = {
        create: function (container, opts) { return new Wizard(container, opts); },
        Wizard: Wizard,
        version: '1.0.0'
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    global.Wizard = API;
})(typeof window !== 'undefined' ? window : this);
