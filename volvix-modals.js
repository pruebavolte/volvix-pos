/* ============================================================
   VOLVIX UI — Librería de modales, formularios, toasts, loading
   Vanilla JS, sin dependencias. Idioma: español MX.
   API global: window.VolvixUI
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- Helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') n.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k === 'dataset' && typeof v === 'object') Object.assign(n.dataset, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else if (v !== false && v != null) n.setAttribute(k, v);
      }
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null || c === false) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  }

  function uid(prefix) { return (prefix || 'vx') + '-' + Math.random().toString(36).slice(2, 9); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- Máscaras ----------
  var Masks = {
    'tel-mx': function (raw) {
      var d = (raw || '').replace(/\D/g, '').slice(0, 10);
      if (d.length === 0) return '';
      if (d.length <= 3) return '(' + d;
      if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
      return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 10);
    },
    'rfc': function (raw) { return (raw || '').toUpperCase().replace(/[^A-ZÑ0-9&]/g, '').slice(0, 13); },
    'cp-mx': function (raw) { return (raw || '').replace(/\D/g, '').slice(0, 5); },
    'curp': function (raw) { return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18); }
  };
  var MaskValidators = {
    'tel-mx': function (v) { return /^\(\d{3}\) \d{3}-\d{4}$/.test(v) ? null : 'Formato (XXX) XXX-XXXX'; },
    'rfc':    function (v) { return /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/.test(v) ? null : 'RFC inválido'; },
    'cp-mx':  function (v) { return /^\d{5}$/.test(v) ? null : 'CP debe tener 5 dígitos'; },
    'curp':   function (v) { return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/.test(v) ? null : 'CURP inválido'; }
  };

  // ---------- Focus trap ----------
  var FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
  function trap(container, e) {
    var focusables = Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE))
      .filter(function (n) { return n.offsetParent !== null; });
    if (!focusables.length) { e.preventDefault(); return; }
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  // ---------- Stack de modales ----------
  var modalStack = [];

  // ---------- Modal base ----------
  function modal(opts) {
    opts = opts || {};
    var size = opts.size || 'md';
    var dismissable = opts.dismissable !== false;
    var prevFocus = document.activeElement;
    var titleId = uid('vx-title');

    var backdrop = el('div', { class: 'vx-backdrop', role: 'presentation' });
    var modalEl = el('div', {
      class: 'vx-modal vx-size-' + size,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1'
    });

    var header = null;
    if (opts.title || dismissable) {
      var titleNodes = [];
      if (opts.title) {
        var titleWrap = el('div');
        titleWrap.appendChild(el('h2', { id: titleId, class: 'vx-modal-title' }, opts.title));
        if (opts.description) titleWrap.appendChild(el('p', { class: 'vx-modal-desc' }, opts.description));
        titleNodes.push(titleWrap);
      } else {
        titleNodes.push(el('div', { id: titleId }));
      }
      if (dismissable) {
        var closeBtn = el('button', {
          class: 'vx-modal-close',
          type: 'button',
          'aria-label': 'Cerrar',
          onclick: function () { instance.close(); }
        }, '×');
        titleNodes.push(closeBtn);
      }
      header = el('div', { class: 'vx-modal-header' }, titleNodes);
      modalEl.appendChild(header);
    }

    var body = el('div', { class: 'vx-modal-body' });
    if (opts.body) {
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else body.appendChild(opts.body);
    }
    modalEl.appendChild(body);

    if (opts.footer) {
      var footer = el('div', { class: 'vx-modal-footer' });
      if (Array.isArray(opts.footer)) opts.footer.forEach(function (f) { footer.appendChild(f); });
      else footer.appendChild(opts.footer);
      modalEl.appendChild(footer);
    }

    backdrop.appendChild(modalEl);

    function onKey(e) {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); instance.close(); }
      else if (e.key === 'Tab') trap(modalEl, e);
    }
    function onBackdropClick(e) {
      if (e.target === backdrop && dismissable) instance.close();
    }
    backdrop.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKey, true);

    var closed = false;
    var instance = {
      el: modalEl,
      body: body,
      backdrop: backdrop,
      close: function (result) {
        if (closed) return;
        closed = true;
        if (typeof opts.onClose === 'function') {
          var r = opts.onClose(result);
          if (r === false) { closed = false; return; }
        }
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.add('vx-closing');
        setTimeout(function () {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          var idx = modalStack.indexOf(instance);
          if (idx >= 0) modalStack.splice(idx, 1);
          if (prevFocus && typeof prevFocus.focus === 'function') {
            try { prevFocus.focus(); } catch (e) {}
          }
        }, 160);
      }
    };
    modalStack.push(instance);
    document.body.appendChild(backdrop);

    // Auto-focus
    setTimeout(function () {
      var first = modalEl.querySelector(FOCUSABLE);
      if (first) try { first.focus(); } catch (e) {}
      else modalEl.focus();
    }, 30);

    return instance;
  }

  // ---------- Confirm ----------
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var resolved = false;
      function done(v) { if (resolved) return; resolved = true; inst.close(); resolve(v); }
      var cancelBtn = el('button', {
        class: 'vx-btn', type: 'button', onclick: function () { done(false); }
      }, opts.cancelText || 'Cancelar');
      var confirmBtn = el('button', {
        class: 'vx-btn ' + (opts.danger ? 'vx-danger' : 'vx-primary'),
        type: 'button', onclick: function () { done(true); }
      }, opts.confirmText || 'Confirmar');

      var bodyEl = el('p', { style: { margin: '0', lineHeight: '1.5', color: 'var(--vx-text-2)' } }, opts.message || '');

      var inst = modal({
        title: opts.title || 'Confirmar',
        body: bodyEl,
        size: 'sm',
        footer: [cancelBtn, confirmBtn],
        onClose: function () { if (!resolved) { resolved = true; resolve(false); } }
      });
    });
  }

  // ---------- Destructive confirm ----------
  function destructiveConfirm(opts) {
    opts = opts || {};
    var requireText = opts.requireText || 'ELIMINAR';
    return new Promise(function (resolve) {
      var resolved = false;
      function done(v) { if (resolved) return; resolved = true; inst.close(); resolve(v); }

      var input = el('input', {
        class: 'vx-input', type: 'text', autocomplete: 'off',
        placeholder: 'Escribe ' + requireText + ' para confirmar'
      });
      var confirmBtn = el('button', {
        class: 'vx-btn vx-danger', type: 'button', disabled: true,
        onclick: function () { done(true); }
      }, opts.confirmText || 'Eliminar definitivamente');
      input.addEventListener('input', function () {
        confirmBtn.disabled = input.value.trim() !== requireText;
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !confirmBtn.disabled) done(true);
      });

      var cancelBtn = el('button', {
        class: 'vx-btn', type: 'button', onclick: function () { done(false); }
      }, opts.cancelText || 'Cancelar');

      var msg = el('p', { style: { margin: '0 0 12px', lineHeight: '1.5', color: 'var(--vx-text-2)' } }, opts.message || 'Esta acción no se puede deshacer.');
      var bodyEl = el('div', null, [msg, input]);

      var inst = modal({
        title: opts.title || 'Acción destructiva',
        body: bodyEl,
        size: 'sm',
        footer: [cancelBtn, confirmBtn],
        onClose: function () { if (!resolved) { resolved = true; resolve(false); } }
      });
    });
  }

  // ---------- Form ----------
  function form(opts) {
    opts = opts || {};
    var fields = opts.fields || [];
    var initial = opts.initialValues || {};

    return new Promise(function (resolve) {
      var resolved = false;
      var values = {};
      var errors = {};
      var renderers = {}; // name -> { getValue, setError, setDisabled }
      var dirty = false;
      var submitting = false;

      // Inicializar valores
      fields.forEach(function (f) {
        if (f.name == null) return;
        if (initial[f.name] !== undefined) values[f.name] = initial[f.name];
        else if (f.default !== undefined) values[f.name] = f.default;
        else if (f.type === 'checkbox' || f.type === 'switch') values[f.name] = false;
        else if (f.type === 'multiselect') values[f.name] = [];
        else values[f.name] = '';
      });

      var formEl = el('form', { class: 'vx-form', novalidate: true, onsubmit: function (e) { e.preventDefault(); doSubmit(); } });
      var banner = el('div', { class: 'vx-banner vx-banner-error', style: { display: 'none' } });
      formEl.appendChild(banner);

      fields.forEach(function (f) { formEl.appendChild(buildField(f)); });

      var cancelBtn = el('button', {
        class: 'vx-btn', type: 'button',
        onclick: function () { tryClose(); }
      }, opts.cancelText || 'Cancelar');

      var spinnerSpan = el('span', { class: 'vx-spinner', style: { display: 'none' } });
      var submitLabel = el('span', null, opts.submitText || 'Guardar');
      var submitBtn = el('button', { class: 'vx-btn vx-primary', type: 'submit' }, [spinnerSpan, submitLabel]);
      // FIX: Botones dentro del <form> para que submit funcione (Enter + click).
      // El botón submit DEBE estar dentro del <form>, si no el click no dispara onsubmit.
      var formFooter = el('div', { class: 'vx-modal-footer vx-form-footer' }, [cancelBtn, submitBtn]);
      formEl.appendChild(formFooter);
      // Click handler explícito como red de seguridad (por si form submit es bloqueado).
      submitBtn.addEventListener('click', function (e) {
        // Si el botón está dentro de <form>, el browser ya disparará submit.
        // Este handler solo actúa si por alguna razón no se disparó (defensa en profundidad).
        if (e.defaultPrevented) return;
      });

      var inst = modal({
        title: opts.title,
        description: opts.description,
        body: formEl,
        size: opts.size || 'md',
        dismissable: opts.dismissable !== false,
        // footer omitido: ya está dentro del <form>
        onClose: function (result) {
          if (resolved) return;
          if (submitting) return false;
          if (dirty && !result) {
            // confirmación inline
            return confirmInlineClose(banner);
          }
          resolved = true;
          resolve(null);
        }
      });

      function tryClose() {
        if (submitting) return;
        if (dirty) {
          confirmDialog({
            title: 'Cambios sin guardar',
            message: 'Tienes cambios sin guardar. ¿Cerrar de todos modos?',
            confirmText: 'Cerrar sin guardar',
            cancelText: 'Seguir editando',
            danger: true
          }).then(function (ok) {
            if (ok) { resolved = true; inst.close(); resolve(null); }
          });
        } else {
          resolved = true; inst.close(); resolve(null);
        }
      }

      function buildField(f) {
        var wrap = el('div', { class: 'vx-field' });
        var inputId = uid('vx-in');
        var labelChildren = [f.label || f.name];
        if (f.required) labelChildren.push(el('span', { class: 'vx-req' }, '*'));
        var labelEl = el('label', { for: inputId, class: 'vx-label' }, labelChildren);
        var hintEl = f.hint ? el('span', { class: 'vx-hint' }, f.hint) : null;
        var errEl = el('span', { class: 'vx-error', style: { display: 'none' } });

        // Para checkbox/switch invertimos disposición
        if (f.type === 'checkbox' || f.type === 'switch') {
          var toggle = buildToggleField(f, inputId);
          renderers[f.name] = toggle.api;
          wrap.appendChild(toggle.el);
          if (hintEl) wrap.appendChild(hintEl);
          wrap.appendChild(errEl);
          renderers[f.name].errEl = errEl;
          return wrap;
        }

        wrap.appendChild(labelEl);
        var ctrl = buildControl(f, inputId);
        wrap.appendChild(ctrl.el);
        if (hintEl) wrap.appendChild(hintEl);
        wrap.appendChild(errEl);
        ctrl.api.errEl = errEl;
        renderers[f.name] = ctrl.api;
        return wrap;
      }

      function setFieldError(name, msg) {
        var r = renderers[name];
        if (!r) return;
        errors[name] = msg || null;
        if (r.errEl) {
          if (msg) { r.errEl.textContent = msg; r.errEl.style.display = ''; }
          else { r.errEl.textContent = ''; r.errEl.style.display = 'none'; }
        }
        if (r.markInvalid) r.markInvalid(!!msg);
      }

      function onValueChange(name, val) {
        values[name] = val;
        dirty = true;
        if (errors[name]) setFieldError(name, null);
      }

      function buildControl(f, id) {
        var t = f.type || 'text';
        var api = { markInvalid: function () {} };
        var node;

        if (t === 'textarea') {
          node = el('textarea', {
            id: id, class: 'vx-textarea',
            placeholder: f.placeholder || '',
            maxlength: f.maxLength || null,
            minlength: f.minLength || null,
            required: !!f.required
          });
          node.value = values[f.name] || '';
          node.addEventListener('input', function () { onValueChange(f.name, node.value); });
          node.addEventListener('blur', function () { validateField(f); });
          api.markInvalid = function (b) { node.classList.toggle('vx-invalid', b); };
          api.disable = function (b) { node.disabled = b; };
          return { el: node, api: api };
        }

        if (t === 'select') {
          node = el('select', { id: id, class: 'vx-select', required: !!f.required });
          if (!f.required || f.placeholder) {
            node.appendChild(el('option', { value: '' }, f.placeholder || 'Selecciona...'));
          }
          (f.options || []).forEach(function (opt) {
            var o = el('option', { value: opt.value }, opt.label);
            if (String(values[f.name]) === String(opt.value)) o.selected = true;
            node.appendChild(o);
          });
          node.addEventListener('change', function () { onValueChange(f.name, node.value); });
          node.addEventListener('blur', function () { validateField(f); });
          api.markInvalid = function (b) { node.classList.toggle('vx-invalid', b); };
          api.disable = function (b) { node.disabled = b; };
          return { el: node, api: api };
        }

        if (t === 'radio') {
          var group = el('div', { class: 'vx-radio-group', id: id, role: 'radiogroup' });
          (f.options || []).forEach(function (opt) {
            var rid = uid('vx-rad');
            var input = el('input', {
              type: 'radio', name: f.name, id: rid, value: opt.value
            });
            if (String(values[f.name]) === String(opt.value)) input.checked = true;
            input.addEventListener('change', function () { if (input.checked) onValueChange(f.name, opt.value); });
            group.appendChild(el('label', { class: 'vx-radio-item', for: rid }, [input, document.createTextNode(opt.label)]));
          });
          api.disable = function (b) {
            group.querySelectorAll('input').forEach(function (i) { i.disabled = b; });
          };
          return { el: group, api: api };
        }

        if (t === 'combobox') {
          return buildCombobox(f, id, api);
        }
        if (t === 'autocomplete') {
          return buildAutocomplete(f, id, api);
        }
        if (t === 'multiselect') {
          return buildMultiselect(f, id, api);
        }
        if (t === 'password') {
          return buildPassword(f, id, api);
        }
        if (t === 'file') {
          return buildFile(f, id, api);
        }

        // Default: input simple (text, number, email, tel, url, date, time, datetime, color)
        var inputType = t;
        if (t === 'datetime') inputType = 'datetime-local';
        node = el('input', {
          id: id, class: 'vx-input', type: inputType,
          placeholder: f.placeholder || '',
          required: !!f.required,
          min: f.min != null ? f.min : (f.minDate || null),
          max: f.max != null ? f.max : (f.maxDate || null),
          step: f.step != null ? f.step : null,
          minlength: f.minLength || null,
          maxlength: f.maxLength || null,
          pattern: f.pattern || null,
          autocomplete: 'off'
        });
        node.value = values[f.name] != null ? values[f.name] : '';
        node.addEventListener('input', function () {
          if (f.mask && Masks[f.mask]) {
            var pos = node.selectionStart;
            var newVal = Masks[f.mask](node.value);
            node.value = newVal;
            try { node.setSelectionRange(newVal.length, newVal.length); } catch (e) {}
          }
          onValueChange(f.name, node.value);
        });
        node.addEventListener('blur', function () { validateField(f); });
        api.markInvalid = function (b) { node.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { node.disabled = b; };
        return { el: node, api: api };
      }

      function buildPassword(f, id, api) {
        var wrap = el('div', { class: 'vx-password-wrap' });
        var input = el('input', {
          id: id, class: 'vx-input', type: 'password',
          placeholder: f.placeholder || '',
          required: !!f.required,
          minlength: f.minLength || null,
          maxlength: f.maxLength || null,
          autocomplete: 'new-password',
          style: { paddingRight: '50px' }
        });
        input.value = values[f.name] || '';
        var toggle = el('button', { type: 'button', class: 'vx-password-toggle', 'aria-label': 'Mostrar/ocultar contraseña' }, '👁');
        toggle.addEventListener('click', function () {
          input.type = input.type === 'password' ? 'text' : 'password';
        });
        input.addEventListener('input', function () { onValueChange(f.name, input.value); });
        input.addEventListener('blur', function () { validateField(f); });
        wrap.appendChild(input); wrap.appendChild(toggle);
        api.markInvalid = function (b) { input.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { input.disabled = b; toggle.disabled = b; };
        return { el: wrap, api: api };
      }

      function buildToggleField(f, id) {
        var api = { markInvalid: function () {} };
        var input = el('input', { type: 'checkbox', id: id });
        input.checked = !!values[f.name];
        var labelChildren = [f.label || f.name];
        if (f.required) labelChildren.push(el('span', { class: 'vx-req' }, '*'));
        var labelText = el('span', null, labelChildren);
        var node;
        if (f.type === 'switch') {
          var switchEl = el('span', { class: 'vx-switch' });
          node = el('label', { class: 'vx-switch-wrap', for: id }, [input, switchEl, labelText]);
        } else {
          node = el('label', { class: 'vx-checkbox-wrap', for: id }, [input, labelText]);
        }
        input.addEventListener('change', function () { onValueChange(f.name, input.checked); });
        api.disable = function (b) { input.disabled = b; };
        return { el: node, api: api };
      }

      function buildCombobox(f, id, api) {
        var wrap = el('div', { class: 'vx-combo-wrap' });
        var input = el('input', {
          id: id, class: 'vx-input', type: 'text',
          placeholder: f.placeholder || 'Buscar...',
          autocomplete: 'off',
          required: !!f.required
        });
        var list = el('div', { class: 'vx-combo-list', style: { display: 'none' } });
        var current = values[f.name];
        var options = f.options || [];
        var selectedLabel = '';
        var match = options.find(function (o) { return String(o.value) === String(current); });
        if (match) { selectedLabel = match.label; input.value = match.label; }

        function render(filter) {
          list.innerHTML = '';
          var q = (filter || '').toLowerCase().trim();
          var filtered = options.filter(function (o) { return !q || o.label.toLowerCase().indexOf(q) >= 0; });
          if (!filtered.length) {
            list.appendChild(el('div', { class: 'vx-combo-empty' }, 'Sin resultados'));
            return;
          }
          filtered.slice(0, 100).forEach(function (o) {
            var item = el('div', { class: 'vx-combo-item' }, [
              o.icon ? el('span', null, o.icon) : null,
              document.createTextNode(o.label)
            ].filter(Boolean));
            item.addEventListener('mousedown', function (e) {
              e.preventDefault();
              input.value = o.label;
              onValueChange(f.name, o.value);
              list.style.display = 'none';
            });
            list.appendChild(item);
          });
        }
        input.addEventListener('focus', function () { render(input.value); list.style.display = ''; });
        input.addEventListener('input', function () {
          render(input.value);
          list.style.display = '';
          var exact = options.find(function (o) { return o.label === input.value; });
          if (exact) onValueChange(f.name, exact.value);
          else { values[f.name] = ''; dirty = true; }
        });
        input.addEventListener('blur', function () {
          setTimeout(function () {
            list.style.display = 'none';
            if (!options.find(function (o) { return o.label === input.value; })) {
              if (current && match) input.value = match.label;
              else input.value = '';
            }
            validateField(f);
          }, 150);
        });
        wrap.appendChild(input); wrap.appendChild(list);
        api.markInvalid = function (b) { input.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { input.disabled = b; };
        return { el: wrap, api: api };
      }

      function buildAutocomplete(f, id, api) {
        var wrap = el('div', { class: 'vx-combo-wrap' });
        var input = el('input', {
          id: id, class: 'vx-input', type: 'text',
          placeholder: f.placeholder || 'Buscar...',
          autocomplete: 'off',
          required: !!f.required
        });
        var list = el('div', { class: 'vx-combo-list', style: { display: 'none' } });
        var lastResults = [];

        var doSearch = debounce(function (q) {
          if (typeof f.search !== 'function') return;
          Promise.resolve(f.search(q)).then(function (res) {
            lastResults = res || [];
            list.innerHTML = '';
            if (!lastResults.length) {
              list.appendChild(el('div', { class: 'vx-combo-empty' }, 'Sin resultados'));
              list.style.display = '';
              return;
            }
            lastResults.forEach(function (o) {
              var item = el('div', { class: 'vx-combo-item' }, o.label);
              item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                input.value = o.label;
                onValueChange(f.name, o.value);
                list.style.display = 'none';
              });
              list.appendChild(item);
            });
            list.style.display = '';
          }).catch(function () {});
        }, 300);

        input.addEventListener('input', function () {
          values[f.name] = '';
          dirty = true;
          if (input.value.length >= 1) doSearch(input.value);
          else list.style.display = 'none';
        });
        input.addEventListener('blur', function () {
          setTimeout(function () { list.style.display = 'none'; validateField(f); }, 180);
        });
        wrap.appendChild(input); wrap.appendChild(list);
        api.markInvalid = function (b) { input.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { input.disabled = b; };
        return { el: wrap, api: api };
      }

      function buildMultiselect(f, id, api) {
        var wrap = el('div', { class: 'vx-multi-wrap', id: id });
        var input = el('input', { class: 'vx-multi-input', type: 'text', placeholder: f.placeholder || 'Agregar...' });
        var dropdown = el('div', { class: 'vx-combo-list', style: { display: 'none', position: 'absolute', left: 0, right: 0, top: '100%' } });
        var positionWrap = el('div', { style: { position: 'relative' } }, [wrap, dropdown]);
        var selected = Array.isArray(values[f.name]) ? values[f.name].slice() : [];
        var options = f.options || [];

        function refresh() {
          // limpiar chips
          Array.prototype.slice.call(wrap.querySelectorAll('.vx-chip')).forEach(function (n) { n.remove(); });
          selected.forEach(function (val) {
            var opt = options.find(function (o) { return String(o.value) === String(val); });
            var label = opt ? opt.label : val;
            var chip = el('span', { class: 'vx-chip' }, [
              document.createTextNode(label),
              el('span', { class: 'vx-chip-x', onclick: function (e) { e.stopPropagation(); remove(val); } }, '×')
            ]);
            wrap.insertBefore(chip, input);
          });
        }
        function add(val) {
          if (selected.indexOf(val) >= 0) return;
          if (f.max && selected.length >= f.max) return;
          selected.push(val);
          onValueChange(f.name, selected.slice());
          refresh();
        }
        function remove(val) {
          selected = selected.filter(function (v) { return v !== val; });
          onValueChange(f.name, selected.slice());
          refresh();
        }
        function renderDropdown(q) {
          dropdown.innerHTML = '';
          q = (q || '').toLowerCase();
          var filtered = options.filter(function (o) {
            return selected.indexOf(o.value) < 0 && (!q || o.label.toLowerCase().indexOf(q) >= 0);
          });
          if (!filtered.length) {
            dropdown.appendChild(el('div', { class: 'vx-combo-empty' }, 'Sin opciones'));
            return;
          }
          filtered.slice(0, 100).forEach(function (o) {
            var item = el('div', { class: 'vx-combo-item' }, o.label);
            item.addEventListener('mousedown', function (e) {
              e.preventDefault();
              add(o.value);
              input.value = '';
              renderDropdown('');
            });
            dropdown.appendChild(item);
          });
        }

        wrap.addEventListener('click', function () { input.focus(); });
        input.addEventListener('focus', function () {
          wrap.classList.add('vx-focus');
          renderDropdown(input.value);
          dropdown.style.display = '';
        });
        input.addEventListener('input', function () { renderDropdown(input.value); dropdown.style.display = ''; });
        input.addEventListener('blur', function () {
          wrap.classList.remove('vx-focus');
          setTimeout(function () { dropdown.style.display = 'none'; validateField(f); }, 150);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !input.value && selected.length) {
            remove(selected[selected.length - 1]);
          }
        });

        wrap.appendChild(input);
        refresh();
        api.markInvalid = function (b) { wrap.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { input.disabled = b; };
        return { el: positionWrap, api: api };
      }

      function buildFile(f, id, api) {
        var wrap = el('div', { class: 'vx-file-wrap' });
        var input = el('input', {
          id: id, class: 'vx-file-input', type: 'file',
          accept: f.accept || null,
          required: !!f.required
        });
        var label = el('label', { for: id, class: 'vx-file-label' }, 'Click para seleccionar archivo');
        var name = el('div', { class: 'vx-file-name' });
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) { name.textContent = ''; onValueChange(f.name, null); return; }
          if (f.maxSizeMB && file.size > f.maxSizeMB * 1024 * 1024) {
            setFieldError(f.name, 'Archivo excede ' + f.maxSizeMB + ' MB');
            input.value = ''; return;
          }
          name.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
          onValueChange(f.name, file);
        });
        wrap.appendChild(input); wrap.appendChild(label); wrap.appendChild(name);
        api.markInvalid = function (b) { label.classList.toggle('vx-invalid', b); };
        api.disable = function (b) { input.disabled = b; };
        return { el: wrap, api: api };
      }

      // ---------- Validación ----------
      function validateField(f) {
        var v = values[f.name];
        var msg = null;
        if (f.required) {
          var empty = v === '' || v == null || (Array.isArray(v) && v.length === 0) || v === false && (f.type === 'checkbox' || f.type === 'switch') ? false : false;
          if (v === '' || v == null) msg = 'Campo obligatorio';
          if (Array.isArray(v) && v.length === 0) msg = 'Selecciona al menos uno';
          if ((f.type === 'checkbox' || f.type === 'switch') && !v) msg = 'Debes aceptar';
        }
        if (!msg && f.mask && MaskValidators[f.mask] && v) msg = MaskValidators[f.mask](v);
        if (!msg && f.minLength && typeof v === 'string' && v.length < f.minLength) msg = 'Mínimo ' + f.minLength + ' caracteres';
        if (!msg && f.maxLength && typeof v === 'string' && v.length > f.maxLength) msg = 'Máximo ' + f.maxLength + ' caracteres';
        if (!msg && f.pattern && v && !(new RegExp(f.pattern)).test(v)) msg = 'Formato inválido';
        if (!msg && f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Email inválido';
        if (!msg && f.type === 'number' && v !== '' && v != null) {
          var n = Number(v);
          if (isNaN(n)) msg = 'Número inválido';
          else if (f.min != null && n < Number(f.min)) msg = 'Mínimo ' + f.min;
          else if (f.max != null && n > Number(f.max)) msg = 'Máximo ' + f.max;
        }
        if (!msg && typeof f.validate === 'function') {
          var custom = f.validate(v, values);
          if (custom && typeof custom.then === 'function') {
            custom.then(function (m) { setFieldError(f.name, m || null); });
            return null;
          } else if (custom) msg = custom;
        }
        setFieldError(f.name, msg);
        return msg;
      }

      function validateAll() {
        var allOk = true;
        var pending = [];
        fields.forEach(function (f) {
          if (typeof f.validate === 'function') {
            var v = values[f.name];
            var c = f.validate(v, values);
            if (c && typeof c.then === 'function') {
              pending.push(c.then(function (m) { setFieldError(f.name, m || null); if (m) allOk = false; }));
              return;
            }
          }
          var msg = validateField(f);
          if (msg) allOk = false;
        });
        return Promise.all(pending).then(function () { return allOk; });
      }

      function setSubmitting(b) {
        submitting = b;
        spinnerSpan.style.display = b ? '' : 'none';
        submitBtn.disabled = b;
        cancelBtn.disabled = b;
        Object.keys(renderers).forEach(function (k) {
          if (renderers[k].disable) renderers[k].disable(b);
        });
      }

      function showBanner(msg) {
        if (!msg) { banner.style.display = 'none'; banner.textContent = ''; return; }
        banner.textContent = msg;
        banner.style.display = '';
      }

      function doSubmit() {
        if (submitting) return;
        showBanner(null);
        validateAll().then(function (ok) {
          if (!ok) {
            showBanner('Revisa los campos marcados.');
            // focus primer error
            var first = fields.find(function (f) { return errors[f.name]; });
            if (first && renderers[first.name] && renderers[first.name].errEl) {
              var fld = formEl.querySelector('#' + CSS.escape(renderers[first.name].errEl.previousSibling ? '' : '')) || null;
            }
            return;
          }
          if (typeof opts.onSubmit !== 'function') {
            resolved = true; inst.close(); resolve(values);
            return;
          }
          setSubmitting(true);
          Promise.resolve()
            .then(function () { return opts.onSubmit(values); })
            .then(function (res) {
              setSubmitting(false);
              resolved = true;
              inst.close();
              resolve(res === undefined ? values : res);
            })
            .catch(function (err) {
              setSubmitting(false);
              showBanner((err && err.message) ? err.message : 'Error al guardar');
            });
        });
      }
    });
  }

  function confirmInlineClose(banner) {
    // Bloquea cierre y muestra mensaje en banner
    banner.textContent = 'Tienes cambios sin guardar. Vuelve a clic en cerrar para descartar.';
    banner.style.display = '';
    // Cambia comportamiento del backdrop close: simplemente devuelve false una vez
    return false;
  }

  // ---------- Toasts ----------
  var toastStack = null;
  function ensureToastStack() {
    if (!toastStack) {
      toastStack = el('div', { class: 'vx-toast-stack', 'aria-live': 'polite', 'aria-atomic': 'false' });
      document.body.appendChild(toastStack);
    }
    return toastStack;
  }
  var TOAST_ICONS = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  function toast(opts) {
    opts = opts || {};
    var type = opts.type || 'info';
    var duration = opts.duration != null ? opts.duration : 4000;
    var stack = ensureToastStack();
    while (stack.children.length >= 5) stack.removeChild(stack.firstChild);
    var node = el('div', { class: 'vx-toast vx-' + type, role: type === 'error' ? 'alert' : 'status' }, [
      el('span', { class: 'vx-toast-icon' }, TOAST_ICONS[type] || 'ℹ'),
      el('span', { class: 'vx-toast-msg' }, opts.message || '')
    ]);
    var to;
    function dismiss() {
      if (node.classList.contains('vx-closing')) return;
      node.classList.add('vx-closing');
      clearTimeout(to);
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 180);
    }
    node.addEventListener('click', dismiss);
    stack.appendChild(node);
    if (duration > 0) to = setTimeout(dismiss, duration);
    return { dismiss: dismiss };
  }

  // ---------- Loading overlay ----------
  var loadingNode = null;
  function loading(show, message) {
    if (show) {
      if (!loadingNode) {
        loadingNode = el('div', { class: 'vx-loading-overlay', role: 'status', 'aria-live': 'polite' }, [
          el('div', { class: 'vx-loading-spinner' }),
          el('div', { class: 'vx-loading-msg' }, message || 'Procesando...')
        ]);
        document.body.appendChild(loadingNode);
      } else {
        var msgEl = loadingNode.querySelector('.vx-loading-msg');
        if (msgEl) msgEl.textContent = message || 'Procesando...';
      }
    } else {
      if (loadingNode && loadingNode.parentNode) {
        loadingNode.classList.add('vx-closing');
        var n = loadingNode;
        loadingNode = null;
        setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 140);
      }
    }
  }

  // ---------- Export ----------
  global.VolvixUI = {
    modal: modal,
    form: form,
    confirm: confirmDialog,
    destructiveConfirm: destructiveConfirm,
    toast: toast,
    loading: loading,
    _masks: Masks
  };

  // ---------- Global hijack of native prompt/confirm/alert ----------
  // Reemplaza los diálogos nativos del navegador con modales VolvixUI.
  // Como prompt()/confirm() nativos son SÍNCRONOS y la API VolvixUI es async,
  // los hijacks retornan null/false (caller asume cancel) y disparan un
  // CustomEvent 'volvix:prompt-resolved' / 'volvix:confirm-resolved' al confirmar
  // para que listeners globales puedan reaccionar. alert() se redirige a toast().
  try {
    if (typeof global.prompt === 'function' && !global.__volvixPromptHijacked) {
      var _nativePrompt  = global.prompt.bind(global);
      var _nativeConfirm = global.confirm.bind(global);
      var _nativeAlert   = global.alert.bind(global);

      // Helper: parsea el texto del prompt() y deriva (title, description, fieldType, fieldLabel, fieldOpts)
      // sin duplicar el mensaje en el modal. Estrategia:
      //  - Si message tiene varias líneas: primera línea -> description, última -> label
      //  - Si message tiene una sola línea: usa "Acción requerida" como title y la línea como label
      //  - Detecta type por palabras clave (number/email/tel/rfc/date/text)
      function parsePromptMessage(msg, defaultVal) {
        var raw = String(msg || '').trim();
        var lines = raw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        var first = lines[0] || '';
        var last  = lines[lines.length - 1] || first;
        var corpus = raw.toLowerCase();

        // Inferir título contextual a partir del corpus (no duplica el message)
        var title = 'Acción requerida';
        if (/stock/.test(corpus))         title = 'Editar stock';
        else if (/precio/.test(corpus))   title = 'Editar precio';
        else if (/descuento|%|porcent/.test(corpus)) title = 'Aplicar descuento';
        else if (/cantidad|qty/.test(corpus))        title = 'Cantidad';
        else if (/c[oó]digo|sku|barcode/.test(corpus)) title = 'Código';
        else if (/correo|email/.test(corpus))        title = 'Email';
        else if (/tel[eé]fono|phone|celular/.test(corpus)) title = 'Teléfono';
        else if (/fecha|date/.test(corpus))          title = 'Fecha';
        else if (/nombre/.test(corpus))              title = 'Nombre';
        else if (/raz[oó]n|motivo/.test(corpus))     title = 'Motivo';

        // description: primera línea solo si hay >1 línea (contexto), si no, vacío para no duplicar
        var description = lines.length > 1 ? first : '';
        // label: última línea si es corta y diferente a description; si no, "Valor"
        var label = (last && last.length <= 60 && last !== description) ? last.replace(/[:\?]\s*$/, '') : 'Valor';

        // Tipo + opciones del campo
        var fieldType = 'text';
        var fieldOpts = { default: defaultVal != null ? String(defaultVal) : '', required: false };

        if (/cantidad|qty|stock|precio|monto|costo|%|porcent|descuento|amount|number|valor num|comisi[oó]n/i.test(corpus)) {
          fieldType = 'number';
          fieldOpts.min = 0;
          fieldOpts.step = /%|porcent|descuento/i.test(corpus) ? 0.01 : (/stock|cantidad|qty/i.test(corpus) ? 1 : 0.01);
          if (/%|porcent|descuento/i.test(corpus)) fieldOpts.max = 100;
        } else if (/email|correo/i.test(corpus)) {
          fieldType = 'email';
        } else if (/tel[eé]fono|phone|celular|tel\b/i.test(corpus)) {
          fieldType = 'tel';
          fieldOpts.mask = 'tel-mx';
        } else if (/\brfc\b/i.test(corpus)) {
          fieldType = 'text';
          fieldOpts.mask = 'rfc';
        } else if (/fecha|date/i.test(corpus)) {
          fieldType = 'date';
        }

        return { title: title, description: description, fieldType: fieldType, fieldLabel: label, fieldOpts: fieldOpts };
      }
      // Expone para tests / tooling
      global.VolvixUI._parsePromptMessage = parsePromptMessage;

      global.prompt = function (message, defaultValue) {
        try {
          if (global.VolvixUI && typeof global.VolvixUI.form === 'function') {
            var msgStr = String(message || '');
            var parsed = parsePromptMessage(msgStr, defaultValue);
            var fieldDef = Object.assign({
              name: 'value',
              label: parsed.fieldLabel,
              type: parsed.fieldType
            }, parsed.fieldOpts);

            global.VolvixUI.form({
              title: parsed.title,
              description: parsed.description || undefined,
              size: 'sm',
              fields: [fieldDef],
              submitText: 'Aceptar'
            }).then(function (r) {
              if (r) {
                global.dispatchEvent(new CustomEvent('volvix:prompt-resolved', {
                  detail: { message: msgStr, value: r.value, defaultValue: defaultValue }
                }));
              }
            }).catch(function () {});
            return null; // caller asume cancel; no hace acción destructiva
          }
        } catch (e) { /* ignore */ }
        return _nativePrompt(message, defaultValue);
      };

      global.confirm = function (message) {
        try {
          if (global.VolvixUI && typeof global.VolvixUI.confirm === 'function') {
            var msgStr = String(message || '¿Confirmar?');
            global.VolvixUI.confirm({
              title: 'Confirmar',
              message: msgStr,
              confirmText: 'Aceptar',
              cancelText: 'Cancelar'
            }).then(function (ok) {
              if (ok) {
                global.dispatchEvent(new CustomEvent('volvix:confirm-resolved', {
                  detail: { message: msgStr, value: true }
                }));
              }
            }).catch(function () {});
            return false; // caller asume cancel
          }
        } catch (e) { /* ignore */ }
        return _nativeConfirm(message);
      };

      global.alert = function (message) {
        try {
          if (global.VolvixUI && typeof global.VolvixUI.toast === 'function') {
            var msgStr = String(message || '');
            var type = /error|fall[oó]|inv[aá]lido|inválid/i.test(msgStr)
              ? 'error'
              : (/[éxito✓✅]|exito|guardad|registr|aplicad/i.test(msgStr) ? 'success' : 'info');
            global.VolvixUI.toast({ type: type, message: msgStr.slice(0, 240) });
            return;
          }
        } catch (e) { /* ignore */ }
        return _nativeAlert(message);
      };

      global.__volvixPromptHijacked = true;
    }
  } catch (e) { /* fail-safe: no rompemos la página */ }

})(typeof window !== 'undefined' ? window : this);
