/* volvix-ui-form-designer.js
 * Drag & drop form designer for Volvix.
 * Exposes: window.FormDesigner
 *
 * Features:
 *   - Palette of field types (text, number, email, date, select, checkbox, radio, textarea, file)
 *   - Drag from palette into canvas, drag inside canvas to reorder
 *   - Click a field on canvas to edit its properties (label, name, required, placeholder, options, validation regex, min/max)
 *   - Conditional visibility ("show if <field> <op> <value>")
 *   - Live JSON Schema export (Volvix-compatible)
 *   - Import existing schema and re-render
 *   - No external dependencies, vanilla JS
 */
(function (global) {
  'use strict';

  const FIELD_TYPES = [
    { type: 'text',     label: 'Texto',       icon: 'T'  },
    { type: 'textarea', label: 'Párrafo',     icon: '¶'  },
    { type: 'number',   label: 'Número',      icon: '#'  },
    { type: 'email',    label: 'Email',       icon: '@'  },
    { type: 'date',     label: 'Fecha',       icon: '📅' },
    { type: 'select',   label: 'Lista',       icon: '▼'  },
    { type: 'checkbox', label: 'Checkbox',    icon: '☑'  },
    { type: 'radio',    label: 'Opciones',    icon: '◉'  },
    { type: 'file',     label: 'Archivo',     icon: '📎' },
    { type: 'section',  label: 'Sección',     icon: '§'  }
  ];

  const OPS = ['=', '!=', '>', '<', '>=', '<=', 'contains', 'empty', 'notEmpty'];

  let _uid = 0;
  function uid(prefix) { _uid += 1; return (prefix || 'f') + '_' + Date.now().toString(36) + '_' + _uid; }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function defaultField(type) {
    const base = {
      id: uid(type),
      type: type,
      name: type + '_' + (_uid),
      label: 'Nuevo ' + type,
      required: false,
      placeholder: '',
      validation: { regex: '', min: '', max: '', message: '' },
      condition: null
    };
    if (type === 'select' || type === 'radio') base.options = [
      { value: 'op1', label: 'Opción 1' },
      { value: 'op2', label: 'Opción 2' }
    ];
    if (type === 'section') { base.label = 'Sección'; base.name = ''; }
    return base;
  }

  function FormDesigner(opts) {
    if (!(this instanceof FormDesigner)) return new FormDesigner(opts);
    opts = opts || {};
    this.container = typeof opts.container === 'string'
      ? document.querySelector(opts.container)
      : opts.container;
    if (!this.container) throw new Error('FormDesigner: container required');
    this.fields = Array.isArray(opts.schema && opts.schema.fields) ? opts.schema.fields.slice() : [];
    this.formMeta = {
      title: (opts.schema && opts.schema.title) || 'Formulario sin título',
      description: (opts.schema && opts.schema.description) || ''
    };
    this.selectedId = null;
    this.onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    this._injectStyles();
    this._render();
  }

  FormDesigner.prototype._injectStyles = function () {
    if (document.getElementById('vx-fd-styles')) return;
    const css = `
      .vx-fd { display:grid; grid-template-columns:180px 1fr 280px; gap:8px; font-family:system-ui,sans-serif; height:100%; min-height:520px; }
      .vx-fd-pal, .vx-fd-canvas, .vx-fd-props { background:#fff; border:1px solid #ddd; border-radius:6px; padding:8px; overflow:auto; }
      .vx-fd-pal h4, .vx-fd-props h4 { margin:0 0 8px; font-size:13px; color:#333; }
      .vx-fd-pi { display:flex; align-items:center; gap:6px; padding:6px 8px; margin-bottom:4px; background:#f6f7f9; border:1px dashed #bbb; border-radius:4px; cursor:grab; font-size:13px; user-select:none; }
      .vx-fd-pi:hover { background:#eef2ff; }
      .vx-fd-pi .ic { width:18px; text-align:center; font-weight:bold; color:#555; }
      .vx-fd-canvas { min-height:480px; background:#fafafa; }
      .vx-fd-meta { margin-bottom:8px; padding:6px; background:#fff; border:1px solid #eee; border-radius:4px; }
      .vx-fd-meta input { width:100%; border:none; outline:none; font-size:14px; padding:4px; }
      .vx-fd-meta .t { font-weight:600; }
      .vx-fd-empty { text-align:center; color:#999; padding:40px 10px; border:2px dashed #ccc; border-radius:6px; }
      .vx-fd-field { background:#fff; border:1px solid #ddd; border-radius:4px; padding:8px; margin-bottom:6px; cursor:move; position:relative; }
      .vx-fd-field.sel { border-color:#3b82f6; box-shadow:0 0 0 2px #3b82f633; }
      .vx-fd-field.drag { opacity:0.4; }
      .vx-fd-field.over { border-top:3px solid #3b82f6; }
      .vx-fd-field .lbl { font-size:13px; font-weight:600; color:#222; }
      .vx-fd-field .meta { font-size:11px; color:#888; margin-top:2px; }
      .vx-fd-field .req { color:#dc2626; }
      .vx-fd-field .actions { position:absolute; top:4px; right:4px; display:none; gap:2px; }
      .vx-fd-field:hover .actions { display:flex; }
      .vx-fd-field .actions button { border:none; background:#eee; cursor:pointer; padding:2px 6px; border-radius:3px; font-size:11px; }
      .vx-fd-field .actions button:hover { background:#ddd; }
      .vx-fd-field.section { background:#eef2ff; border-style:dashed; }
      .vx-fd-props label { display:block; font-size:11px; color:#555; margin-top:8px; margin-bottom:2px; }
      .vx-fd-props input[type=text], .vx-fd-props input[type=number], .vx-fd-props textarea, .vx-fd-props select { width:100%; box-sizing:border-box; padding:4px 6px; border:1px solid #ccc; border-radius:3px; font-size:12px; }
      .vx-fd-props textarea { min-height:50px; font-family:monospace; }
      .vx-fd-props .row { display:flex; gap:4px; }
      .vx-fd-props .row > * { flex:1; }
      .vx-fd-opts .opt { display:flex; gap:4px; margin-bottom:4px; }
      .vx-fd-opts .opt input { flex:1; }
      .vx-fd-opts button.add { width:100%; background:#3b82f6; color:#fff; border:none; padding:4px; border-radius:3px; cursor:pointer; font-size:11px; }
      .vx-fd-opts button.del { background:#dc2626; color:#fff; border:none; cursor:pointer; padding:0 6px; border-radius:3px; }
      .vx-fd-toolbar { margin-top:8px; display:flex; gap:4px; }
      .vx-fd-toolbar button { flex:1; padding:6px; border:1px solid #ccc; background:#f6f7f9; border-radius:3px; cursor:pointer; font-size:11px; }
      .vx-fd-toolbar button:hover { background:#eef2ff; }
      .vx-fd-cond { background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:6px; margin-top:6px; }
    `;
    const style = document.createElement('style');
    style.id = 'vx-fd-styles';
    style.textContent = css;
    document.head.appendChild(style);
  };

  FormDesigner.prototype._render = function () {
    this.container.innerHTML = '';
    this.root = el('div', { class: 'vx-fd' }, [
      this._renderPalette(),
      this._renderCanvas(),
      this._renderProps()
    ]);
    this.container.appendChild(this.root);
  };

  FormDesigner.prototype._renderPalette = function () {
    const self = this;
    const items = FIELD_TYPES.map(ft => {
      const node = el('div', {
        class: 'vx-fd-pi',
        draggable: 'true',
        ondragstart: function (e) {
          e.dataTransfer.setData('vx/new', ft.type);
          e.dataTransfer.effectAllowed = 'copy';
        }
      }, [el('span', { class: 'ic' }, [ft.icon]), el('span', null, [ft.label])]);
      return node;
    });
    return el('div', { class: 'vx-fd-pal' }, [el('h4', null, ['Campos']), ...items]);
  };

  FormDesigner.prototype._renderCanvas = function () {
    const self = this;
    const meta = el('div', { class: 'vx-fd-meta' }, [
      el('input', {
        class: 't', value: this.formMeta.title, placeholder: 'Título del formulario',
        oninput: function (e) { self.formMeta.title = e.target.value; self._fire(); }
      }),
      el('input', {
        value: this.formMeta.description, placeholder: 'Descripción (opcional)',
        oninput: function (e) { self.formMeta.description = e.target.value; self._fire(); }
      })
    ]);

    const list = el('div', {
      class: 'vx-fd-list',
      ondragover: function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
      ondrop: function (e) {
        e.preventDefault();
        const newType = e.dataTransfer.getData('vx/new');
        const moveId = e.dataTransfer.getData('vx/move');
        if (newType) {
          self.fields.push(defaultField(newType));
          self._fire(); self._render();
        } else if (moveId) {
          // dropped on container (end)
          const idx = self.fields.findIndex(f => f.id === moveId);
          if (idx >= 0) {
            const [it] = self.fields.splice(idx, 1);
            self.fields.push(it);
            self._fire(); self._render();
          }
        }
      }
    });

    if (this.fields.length === 0) {
      list.appendChild(el('div', { class: 'vx-fd-empty' }, ['Arrastra campos desde la izquierda']));
    } else {
      this.fields.forEach((f, idx) => list.appendChild(this._renderFieldNode(f, idx)));
    }

    return el('div', { class: 'vx-fd-canvas' }, [meta, list]);
  };

  FormDesigner.prototype._renderFieldNode = function (f, idx) {
    const self = this;
    const cls = 'vx-fd-field' + (this.selectedId === f.id ? ' sel' : '') + (f.type === 'section' ? ' section' : '');
    const node = el('div', {
      class: cls,
      draggable: 'true',
      'data-id': f.id,
      onclick: function (e) { e.stopPropagation(); self.selectedId = f.id; self._render(); },
      ondragstart: function (e) {
        e.dataTransfer.setData('vx/move', f.id);
        e.dataTransfer.effectAllowed = 'move';
        node.classList.add('drag');
      },
      ondragend: function () { node.classList.remove('drag'); },
      ondragover: function (e) { e.preventDefault(); node.classList.add('over'); },
      ondragleave: function () { node.classList.remove('over'); },
      ondrop: function (e) {
        e.preventDefault(); e.stopPropagation();
        node.classList.remove('over');
        const moveId = e.dataTransfer.getData('vx/move');
        const newType = e.dataTransfer.getData('vx/new');
        if (newType) {
          self.fields.splice(idx, 0, defaultField(newType));
          self._fire(); self._render();
        } else if (moveId && moveId !== f.id) {
          const from = self.fields.findIndex(x => x.id === moveId);
          if (from >= 0) {
            const [it] = self.fields.splice(from, 1);
            const to = self.fields.findIndex(x => x.id === f.id);
            self.fields.splice(to, 0, it);
            self._fire(); self._render();
          }
        }
      }
    }, [
      el('div', { class: 'lbl' }, [
        f.label || '(sin etiqueta)',
        f.required ? el('span', { class: 'req' }, [' *']) : null
      ]),
      el('div', { class: 'meta' }, [
        f.type + (f.name ? ' · ' + f.name : ''),
        f.condition ? ' · condicional' : ''
      ]),
      el('div', { class: 'actions' }, [
        el('button', { onclick: function (e) { e.stopPropagation(); self._duplicate(f.id); } }, ['⎘']),
        el('button', { onclick: function (e) { e.stopPropagation(); self._remove(f.id); } }, ['✕'])
      ])
    ]);
    return node;
  };

  FormDesigner.prototype._renderProps = function () {
    const self = this;
    const wrap = el('div', { class: 'vx-fd-props' }, [el('h4', null, ['Propiedades'])]);
    const f = this.fields.find(x => x.id === this.selectedId);
    if (!f) {
      wrap.appendChild(el('div', { style: { color: '#999', fontSize: '12px' } }, ['Selecciona un campo']));
      wrap.appendChild(this._renderToolbar());
      return wrap;
    }

    function bind(prop, type) {
      return {
        value: f[prop] == null ? '' : f[prop],
        oninput: function (e) {
          f[prop] = (type === 'bool') ? e.target.checked : (type === 'num' ? Number(e.target.value) : e.target.value);
          self._fire(); self._renderListAndProps();
        }
      };
    }

    wrap.appendChild(el('label', null, ['Etiqueta']));
    wrap.appendChild(el('input', Object.assign({ type: 'text' }, bind('label'))));

    if (f.type !== 'section') {
      wrap.appendChild(el('label', null, ['Nombre (clave)']));
      wrap.appendChild(el('input', Object.assign({ type: 'text' }, bind('name'))));

      wrap.appendChild(el('label', null, [
        el('input', { type: 'checkbox', checked: f.required ? 'checked' : null,
          onchange: function (e) { f.required = e.target.checked; self._fire(); self._renderListAndProps(); }
        }),
        ' Requerido'
      ]));

      if (['text', 'textarea', 'email', 'number'].includes(f.type)) {
        wrap.appendChild(el('label', null, ['Placeholder']));
        wrap.appendChild(el('input', Object.assign({ type: 'text' }, bind('placeholder'))));
      }

      if (['select', 'radio'].includes(f.type)) {
        const optsBox = el('div', { class: 'vx-fd-opts' });
        (f.options || []).forEach((opt, i) => {
          optsBox.appendChild(el('div', { class: 'opt' }, [
            el('input', { type: 'text', value: opt.label, placeholder: 'Etiqueta',
              oninput: function (e) { opt.label = e.target.value; self._fire(); }
            }),
            el('input', { type: 'text', value: opt.value, placeholder: 'Valor',
              oninput: function (e) { opt.value = e.target.value; self._fire(); }
            }),
            el('button', { class: 'del', onclick: function () { f.options.splice(i, 1); self._fire(); self._renderListAndProps(); } }, ['✕'])
          ]));
        });
        optsBox.appendChild(el('button', { class: 'add',
          onclick: function () {
            f.options = f.options || [];
            f.options.push({ value: 'op' + (f.options.length + 1), label: 'Opción ' + (f.options.length + 1) });
            self._fire(); self._renderListAndProps();
          }
        }, ['+ Agregar opción']));
        wrap.appendChild(el('label', null, ['Opciones']));
        wrap.appendChild(optsBox);
      }

      // Validation
      wrap.appendChild(el('label', null, ['Validación regex']));
      wrap.appendChild(el('input', { type: 'text', value: f.validation.regex,
        oninput: function (e) { f.validation.regex = e.target.value; self._fire(); }
      }));
      if (f.type === 'number') {
        wrap.appendChild(el('label', null, ['Min / Max']));
        wrap.appendChild(el('div', { class: 'row' }, [
          el('input', { type: 'number', value: f.validation.min,
            oninput: function (e) { f.validation.min = e.target.value; self._fire(); } }),
          el('input', { type: 'number', value: f.validation.max,
            oninput: function (e) { f.validation.max = e.target.value; self._fire(); } })
        ]));
      }
      wrap.appendChild(el('label', null, ['Mensaje de error']));
      wrap.appendChild(el('input', { type: 'text', value: f.validation.message,
        oninput: function (e) { f.validation.message = e.target.value; self._fire(); }
      }));

      // Conditional visibility
      const cond = f.condition || { field: '', op: '=', value: '' };
      const condBox = el('div', { class: 'vx-fd-cond' }, [
        el('label', null, [
          el('input', { type: 'checkbox', checked: f.condition ? 'checked' : null,
            onchange: function (e) {
              f.condition = e.target.checked ? { field: '', op: '=', value: '' } : null;
              self._fire(); self._renderListAndProps();
            }
          }),
          ' Mostrar solo si...'
        ])
      ]);
      if (f.condition) {
        const others = self.fields.filter(x => x.id !== f.id && x.name);
        const sel = el('select', {
          onchange: function (e) { f.condition.field = e.target.value; self._fire(); }
        }, [el('option', { value: '' }, ['-- campo --'])].concat(
          others.map(o => el('option', { value: o.name, selected: o.name === f.condition.field ? 'selected' : null }, [o.label || o.name]))
        ));
        const op = el('select', {
          onchange: function (e) { f.condition.op = e.target.value; self._fire(); }
        }, OPS.map(o => el('option', { value: o, selected: o === f.condition.op ? 'selected' : null }, [o])));
        const val = el('input', { type: 'text', value: f.condition.value,
          oninput: function (e) { f.condition.value = e.target.value; self._fire(); }
        });
        condBox.appendChild(el('div', { class: 'row' }, [sel, op]));
        condBox.appendChild(val);
      }
      wrap.appendChild(condBox);
    }

    wrap.appendChild(this._renderToolbar());
    return wrap;
  };

  FormDesigner.prototype._renderToolbar = function () {
    const self = this;
    return el('div', { class: 'vx-fd-toolbar' }, [
      el('button', { onclick: function () {
        const json = JSON.stringify(self.getSchema(), null, 2);
        const w = global.open('', '_blank');
        if (w) w.document.write('<pre>' + json.replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])) + '</pre>');
        else global.prompt('JSON Schema', json);
      } }, ['Ver JSON']),
      el('button', { onclick: function () {
        const txt = global.prompt('Pegar JSON Schema:');
        if (txt) try { self.setSchema(JSON.parse(txt)); } catch (e) { global.alert('JSON inválido: ' + e.message); }
      } }, ['Importar']),
      el('button', { onclick: function () {
        if (global.confirm('¿Limpiar formulario?')) { self.fields = []; self.selectedId = null; self._fire(); self._render(); }
      } }, ['Limpiar'])
    ]);
  };

  FormDesigner.prototype._renderListAndProps = function () { this._render(); };

  FormDesigner.prototype._duplicate = function (id) {
    const i = this.fields.findIndex(f => f.id === id);
    if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(this.fields[i]));
    copy.id = uid(copy.type);
    copy.name = (copy.name || copy.type) + '_copy';
    this.fields.splice(i + 1, 0, copy);
    this._fire(); this._render();
  };

  FormDesigner.prototype._remove = function (id) {
    this.fields = this.fields.filter(f => f.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this._fire(); this._render();
  };

  FormDesigner.prototype._fire = function () {
    try { this.onChange(this.getSchema()); } catch (e) { /* noop */ }
  };

  // ---------- Public API ----------

  FormDesigner.prototype.getSchema = function () {
    return {
      title: this.formMeta.title,
      description: this.formMeta.description,
      version: 1,
      fields: this.fields.map(f => {
        const out = {
          id: f.id, type: f.type, name: f.name, label: f.label,
          required: !!f.required, placeholder: f.placeholder || ''
        };
        if (f.options) out.options = f.options.slice();
        if (f.validation && (f.validation.regex || f.validation.min !== '' || f.validation.max !== '' || f.validation.message)) {
          out.validation = Object.assign({}, f.validation);
        }
        if (f.condition && f.condition.field) out.condition = Object.assign({}, f.condition);
        return out;
      })
    };
  };

  FormDesigner.prototype.setSchema = function (schema) {
    schema = schema || {};
    this.formMeta.title = schema.title || 'Formulario';
    this.formMeta.description = schema.description || '';
    this.fields = (schema.fields || []).map(f => Object.assign(
      defaultField(f.type || 'text'),
      f,
      { validation: Object.assign({ regex: '', min: '', max: '', message: '' }, f.validation || {}) }
    ));
    this.selectedId = null;
    this._fire(); this._render();
  };

  FormDesigner.prototype.validateValues = function (values) {
    const errors = {};
    values = values || {};
    this.fields.forEach(f => {
      if (!f.name || f.type === 'section') return;
      if (f.condition && !FormDesigner.evalCondition(f.condition, values)) return;
      const v = values[f.name];
      if (f.required && (v == null || v === '' || (Array.isArray(v) && v.length === 0))) {
        errors[f.name] = (f.validation && f.validation.message) || 'Campo requerido';
        return;
      }
      if (v != null && v !== '' && f.validation) {
        if (f.validation.regex) {
          try { if (!new RegExp(f.validation.regex).test(String(v))) errors[f.name] = f.validation.message || 'Formato inválido'; }
          catch (e) { /* invalid regex */ }
        }
        if (f.type === 'number') {
          const n = Number(v);
          if (f.validation.min !== '' && n < Number(f.validation.min)) errors[f.name] = f.validation.message || ('Mínimo ' + f.validation.min);
          if (f.validation.max !== '' && n > Number(f.validation.max)) errors[f.name] = f.validation.message || ('Máximo ' + f.validation.max);
        }
      }
    });
    return errors;
  };

  FormDesigner.evalCondition = function (cond, values) {
    if (!cond || !cond.field) return true;
    const a = values[cond.field];
    const b = cond.value;
    switch (cond.op) {
      case '=':         return String(a) === String(b);
      case '!=':        return String(a) !== String(b);
      case '>':         return Number(a) > Number(b);
      case '<':         return Number(a) < Number(b);
      case '>=':        return Number(a) >= Number(b);
      case '<=':        return Number(a) <= Number(b);
      case 'contains':  return String(a || '').indexOf(String(b)) >= 0;
      case 'empty':     return a == null || a === '';
      case 'notEmpty':  return !(a == null || a === '');
      default:          return true;
    }
  };

  FormDesigner.FIELD_TYPES = FIELD_TYPES;
  FormDesigner.defaultField = defaultField;

  global.FormDesigner = FormDesigner;
})(typeof window !== 'undefined' ? window : globalThis);
