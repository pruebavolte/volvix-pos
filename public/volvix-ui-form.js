/**
 * volvix-ui-form.js
 * Volvix UI Form Builder
 * Schema-based forms with validation, error display, multi-step support, and autosave.
 *
 * Exposes: window.FormBuilder
 *
 * Usage:
 *   const fb = new FormBuilder({
 *     container: '#myForm',
 *     schema: { fields: [...], steps: [...] },
 *     onSubmit: (data) => {...},
 *     autosave: { key: 'myForm', interval: 3000 }
 *   });
 *   fb.render();
 */
(function (global) {
  'use strict';

  // ---------- Validators ----------
  const Validators = {
    required: (v) => (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
      ? 'Este campo es obligatorio' : null,
    email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? null : 'Email inválido',
    minLength: (n) => (v) => (!v || String(v).length >= n) ? null : `Mínimo ${n} caracteres`,
    maxLength: (n) => (v) => (!v || String(v).length <= n) ? null : `Máximo ${n} caracteres`,
    min: (n) => (v) => (v === '' || v === null || v === undefined || Number(v) >= n) ? null : `Mínimo ${n}`,
    max: (n) => (v) => (v === '' || v === null || v === undefined || Number(v) <= n) ? null : `Máximo ${n}`,
    pattern: (re, msg) => (v) => (!v || new RegExp(re).test(v)) ? null : (msg || 'Formato inválido'),
    number: (v) => (v === '' || v === null || v === undefined || !isNaN(Number(v))) ? null : 'Debe ser un número',
    integer: (v) => (v === '' || v === null || v === undefined || /^-?\d+$/.test(String(v))) ? null : 'Debe ser un entero',
    url: (v) => { try { if (!v) return null; new URL(v); return null; } catch { return 'URL inválida'; } },
    phone: (v) => (!v || /^[+]?[\d\s\-()]{7,}$/.test(v)) ? null : 'Teléfono inválido',
    date: (v) => (!v || !isNaN(Date.parse(v))) ? null : 'Fecha inválida',
    match: (otherField, msg) => (v, data) => (v === data[otherField]) ? null : (msg || 'Los valores no coinciden'),
    custom: (fn, msg) => (v, data) => fn(v, data) ? null : (msg || 'Valor inválido')
  };

  // ---------- Field Renderers ----------
  const Renderers = {
    text: (f, value) => `<input type="text" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" ${f.disabled ? 'disabled' : ''} ${f.readonly ? 'readonly' : ''} class="fb-input"/>`,
    email: (f, value) => `<input type="email" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" class="fb-input"/>`,
    password: (f, value) => `<input type="password" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    number: (f, value) => `<input type="number" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} class="fb-input"/>`,
    tel: (f, value) => `<input type="tel" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    url: (f, value) => `<input type="url" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    date: (f, value) => `<input type="date" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    time: (f, value) => `<input type="time" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    datetime: (f, value) => `<input type="datetime-local" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" class="fb-input"/>`,
    color: (f, value) => `<input type="color" name="${f.name}" id="fb_${f.name}" value="${esc(value || '#000000')}" class="fb-input"/>`,
    range: (f, value) => `<input type="range" name="${f.name}" id="fb_${f.name}" value="${esc(value)}" min="${f.min || 0}" max="${f.max || 100}" step="${f.step || 1}" class="fb-input"/>`,
    textarea: (f, value) => `<textarea name="${f.name}" id="fb_${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}" class="fb-input">${esc(value)}</textarea>`,
    select: (f, value) => {
      const opts = (f.options || []).map(o => {
        const ov = typeof o === 'object' ? o.value : o;
        const ol = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(ov)}" ${String(value) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('');
      return `<select name="${f.name}" id="fb_${f.name}" class="fb-input">${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ''}${opts}</select>`;
    },
    multiselect: (f, value) => {
      const vals = Array.isArray(value) ? value : [];
      const opts = (f.options || []).map(o => {
        const ov = typeof o === 'object' ? o.value : o;
        const ol = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(ov)}" ${vals.includes(ov) ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('');
      return `<select multiple name="${f.name}" id="fb_${f.name}" class="fb-input">${opts}</select>`;
    },
    checkbox: (f, value) => `<label class="fb-check"><input type="checkbox" name="${f.name}" id="fb_${f.name}" ${value ? 'checked' : ''}/> ${esc(f.checkLabel || '')}</label>`,
    radio: (f, value) => (f.options || []).map((o, i) => {
      const ov = typeof o === 'object' ? o.value : o;
      const ol = typeof o === 'object' ? o.label : o;
      return `<label class="fb-radio"><input type="radio" name="${f.name}" value="${esc(ov)}" ${String(value) === String(ov) ? 'checked' : ''}/> ${esc(ol)}</label>`;
    }).join(''),
    file: (f, value) => `<input type="file" name="${f.name}" id="fb_${f.name}" ${f.accept ? `accept="${f.accept}"` : ''} ${f.multiple ? 'multiple' : ''} class="fb-input"/>`,
    hidden: (f, value) => `<input type="hidden" name="${f.name}" id="fb_${f.name}" value="${esc(value)}"/>`
  };

  function esc(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------- Default styles injected once ----------
  let _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css = `
      .fb-form{font-family:system-ui,-apple-system,sans-serif;max-width:640px;}
      .fb-field{margin-bottom:16px;}
      .fb-label{display:block;font-weight:600;margin-bottom:4px;color:#222;}
      .fb-label .fb-req{color:#d33;margin-left:2px;}
      .fb-input{width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;}
      .fb-input:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.2);}
      .fb-input.fb-error{border-color:#d33;}
      .fb-error-msg{color:#d33;font-size:12px;margin-top:4px;}
      .fb-help{color:#666;font-size:12px;margin-top:4px;}
      .fb-check,.fb-radio{display:inline-flex;align-items:center;gap:6px;margin-right:12px;}
      .fb-steps{display:flex;gap:8px;margin-bottom:20px;}
      .fb-step{flex:1;padding:8px;text-align:center;border-radius:6px;background:#eee;font-size:13px;}
      .fb-step.active{background:#3b82f6;color:#fff;}
      .fb-step.done{background:#10b981;color:#fff;}
      .fb-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;}
      .fb-btn{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;}
      .fb-btn-primary{background:#3b82f6;color:#fff;}
      .fb-btn-secondary{background:#e5e7eb;color:#222;}
      .fb-btn:disabled{opacity:.5;cursor:not-allowed;}
      .fb-autosave{font-size:11px;color:#888;text-align:right;margin-top:4px;}
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- FormBuilder class ----------
  function FormBuilder(opts) {
    if (!(this instanceof FormBuilder)) return new FormBuilder(opts);
    this.opts = opts || {};
    this.container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!this.container) throw new Error('FormBuilder: container not found');
    this.schema = opts.schema || { fields: [] };
    this.data = Object.assign({}, opts.initialData || {});
    this.errors = {};
    this.currentStep = 0;
    this.steps = this.schema.steps || null;
    this.onSubmit = opts.onSubmit || function () { };
    this.onChange = opts.onChange || function () { };
    this.autosave = opts.autosave || null;
    this._autosaveTimer = null;
    this._lastSaved = null;
    injectStyles();
    if (this.autosave && this.autosave.key) this._loadAutosave();
  }

  FormBuilder.prototype.getFields = function () {
    if (this.steps) return this.steps[this.currentStep].fields || [];
    return this.schema.fields || [];
  };

  FormBuilder.prototype.getAllFields = function () {
    if (this.steps) return this.steps.reduce((acc, s) => acc.concat(s.fields || []), []);
    return this.schema.fields || [];
  };

  FormBuilder.prototype.render = function () {
    const fields = this.getFields();
    const html = [];
    html.push('<form class="fb-form" novalidate>');
    if (this.steps) {
      html.push('<div class="fb-steps">');
      this.steps.forEach((s, i) => {
        const cls = i === this.currentStep ? 'active' : (i < this.currentStep ? 'done' : '');
        html.push(`<div class="fb-step ${cls}">${i + 1}. ${esc(s.title || ('Paso ' + (i + 1)))}</div>`);
      });
      html.push('</div>');
    }
    fields.forEach(f => html.push(this._renderField(f)));
    html.push('<div class="fb-actions">');
    if (this.steps && this.currentStep > 0) html.push('<button type="button" class="fb-btn fb-btn-secondary" data-action="prev">Anterior</button>');
    if (this.steps && this.currentStep < this.steps.length - 1) {
      html.push('<button type="button" class="fb-btn fb-btn-primary" data-action="next">Siguiente</button>');
    } else {
      html.push(`<button type="submit" class="fb-btn fb-btn-primary">${esc(this.opts.submitLabel || 'Enviar')}</button>`);
    }
    html.push('</div>');
    if (this.autosave) html.push('<div class="fb-autosave" data-autosave-status></div>');
    html.push('</form>');
    this.container.innerHTML = html.join('');
    this._bind();
  };

  FormBuilder.prototype._renderField = function (f) {
    if (f.type === 'hidden') return Renderers.hidden(f, this.data[f.name] || '');
    if (f.if && !this._evalCondition(f.if)) return '';
    const value = this.data[f.name] !== undefined ? this.data[f.name] : (f.default !== undefined ? f.default : '');
    const renderer = Renderers[f.type] || Renderers.text;
    const err = this.errors[f.name];
    const required = (f.validators || []).some(v => v === 'required' || (v && v.type === 'required'));
    return `
      <div class="fb-field" data-field="${f.name}">
        ${f.label ? `<label class="fb-label" for="fb_${f.name}">${esc(f.label)}${required ? '<span class="fb-req">*</span>' : ''}</label>` : ''}
        ${renderer(f, value)}
        ${f.help ? `<div class="fb-help">${esc(f.help)}</div>` : ''}
        ${err ? `<div class="fb-error-msg">${esc(err)}</div>` : ''}
      </div>`;
  };

  FormBuilder.prototype._evalCondition = function (cond) {
    if (typeof cond === 'function') return cond(this.data);
    if (typeof cond === 'object') {
      return Object.keys(cond).every(k => this.data[k] === cond[k]);
    }
    return true;
  };

  FormBuilder.prototype._bind = function () {
    const form = this.container.querySelector('form');
    const self = this;
    form.addEventListener('input', (e) => self._onInput(e));
    form.addEventListener('change', (e) => self._onInput(e));
    form.addEventListener('submit', (e) => { e.preventDefault(); self.submit(); });
    form.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.getAttribute('data-action');
        if (a === 'next') self.next();
        if (a === 'prev') self.prev();
      });
    });
    if (this.autosave) {
      const status = form.querySelector('[data-autosave-status]');
      if (status && this._lastSaved) status.textContent = 'Guardado: ' + new Date(this._lastSaved).toLocaleTimeString();
    }
  };

  FormBuilder.prototype._onInput = function (e) {
    const t = e.target;
    if (!t.name) return;
    const field = this.getAllFields().find(f => f.name === t.name);
    if (!field) return;
    let val;
    if (t.type === 'checkbox') val = t.checked;
    else if (field.type === 'multiselect') val = Array.from(t.selectedOptions).map(o => o.value);
    else if (t.type === 'file') val = t.files;
    else val = t.value;
    this.data[t.name] = val;
    if (this.errors[t.name]) {
      delete this.errors[t.name];
      const fld = this.container.querySelector(`[data-field="${t.name}"]`);
      if (fld) {
        fld.querySelector('.fb-error-msg')?.remove();
        fld.querySelector('.fb-input')?.classList.remove('fb-error');
      }
    }
    this.onChange(t.name, val, this.data);
    if (this.autosave) this._scheduleAutosave();
  };

  FormBuilder.prototype.validate = function (fieldsToValidate) {
    const fields = fieldsToValidate || this.getAllFields();
    this.errors = {};
    let ok = true;
    for (const f of fields) {
      if (f.if && !this._evalCondition(f.if)) continue;
      const validators = f.validators || [];
      const value = this.data[f.name];
      for (const v of validators) {
        let fn = null;
        if (typeof v === 'string') fn = Validators[v];
        else if (typeof v === 'function') fn = v;
        else if (v && v.type) {
          const vf = Validators[v.type];
          fn = typeof vf === 'function' && vf.length > 0 && v.type !== 'required' && v.type !== 'email' && v.type !== 'number' && v.type !== 'integer' && v.type !== 'url' && v.type !== 'phone' && v.type !== 'date'
            ? vf(v.value, v.message)
            : vf;
        }
        if (!fn) continue;
        const err = fn(value, this.data);
        if (err) {
          this.errors[f.name] = (v && v.message) || err;
          ok = false;
          break;
        }
      }
    }
    this.render();
    return ok;
  };

  FormBuilder.prototype.next = function () {
    if (!this.steps) return;
    const stepFields = this.steps[this.currentStep].fields || [];
    if (!this.validate(stepFields)) return false;
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.render();
    }
    return true;
  };

  FormBuilder.prototype.prev = function () {
    if (!this.steps) return;
    if (this.currentStep > 0) {
      this.currentStep--;
      this.render();
    }
  };

  FormBuilder.prototype.submit = function () {
    if (!this.validate()) return false;
    const result = this.onSubmit(this.data, this);
    if (this.autosave && this.autosave.clearOnSubmit !== false) this._clearAutosave();
    return result !== false;
  };

  FormBuilder.prototype.reset = function () {
    this.data = Object.assign({}, this.opts.initialData || {});
    this.errors = {};
    this.currentStep = 0;
    this._clearAutosave();
    this.render();
  };

  FormBuilder.prototype.setData = function (data) {
    this.data = Object.assign({}, this.data, data);
    this.render();
  };

  FormBuilder.prototype.getData = function () {
    return Object.assign({}, this.data);
  };

  FormBuilder.prototype.setError = function (field, msg) {
    this.errors[field] = msg;
    this.render();
  };

  // ---------- Autosave ----------
  FormBuilder.prototype._scheduleAutosave = function () {
    if (!this.autosave) return;
    clearTimeout(this._autosaveTimer);
    const interval = this.autosave.interval || 2000;
    const self = this;
    this._autosaveTimer = setTimeout(() => self._saveAutosave(), interval);
  };

  FormBuilder.prototype._saveAutosave = function () {
    if (!this.autosave || !this.autosave.key) return;
    try {
      const payload = { data: this.data, step: this.currentStep, ts: Date.now() };
      localStorage.setItem('fb_autosave_' + this.autosave.key, JSON.stringify(payload));
      this._lastSaved = payload.ts;
      const status = this.container.querySelector('[data-autosave-status]');
      if (status) status.textContent = 'Guardado: ' + new Date(payload.ts).toLocaleTimeString();
      if (typeof this.autosave.onSave === 'function') this.autosave.onSave(this.data);
    } catch (e) {
      console.warn('FormBuilder autosave failed', e);
    }
  };

  FormBuilder.prototype._loadAutosave = function () {
    try {
      const raw = localStorage.getItem('fb_autosave_' + this.autosave.key);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload && payload.data) {
        this.data = Object.assign({}, payload.data, this.data);
        if (typeof payload.step === 'number') this.currentStep = payload.step;
        this._lastSaved = payload.ts;
      }
    } catch (e) { /* ignore */ }
  };

  FormBuilder.prototype._clearAutosave = function () {
    if (!this.autosave || !this.autosave.key) return;
    try { localStorage.removeItem('fb_autosave_' + this.autosave.key); } catch (e) { }
    this._lastSaved = null;
  };

  // ---------- Public exports ----------
  FormBuilder.Validators = Validators;
  FormBuilder.Renderers = Renderers;
  FormBuilder.registerValidator = function (name, fn) { Validators[name] = fn; };
  FormBuilder.registerRenderer = function (name, fn) { Renderers[name] = fn; };

  global.FormBuilder = FormBuilder;
  global.VolvixFormBuilder = FormBuilder;
})(typeof window !== 'undefined' ? window : this);
