/* ============================================================================
 * volvix-customer-credit.js
 * Customer credit / abonos (payments toward outstanding balance) module.
 *
 * - Hooks button "+ Registrar abono" via querySelector + MutationObserver.
 * - Adds a sibling "Ver historial de abonos" link if missing.
 * - Modal: customer autocomplete, current balance display, amount input
 *   (validated > 0 and ≤ balance), payment method, date, notes.
 * - Submits to POST /api/customers/:id/payments.
 * - History modal: paginated table with print-receipt button per row.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__volvixCustomerCreditLoaded) return;
  window.__volvixCustomerCreditLoaded = true;

  var API_BASE = (window.VOLVIX_API_BASE || '') + '/api';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getToken() {
    try {
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getToken === 'function') {
        return window.Volvix.auth.getToken();
      }
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        return window.VolvixAuth.getToken();
      }
    } catch (_) {}
    return null;
  }

  function api(path, opts) {
    opts = opts || {};
    var token = getToken();
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include'
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (txt) {
          var err = new Error('HTTP ' + r.status + ': ' + txt.slice(0, 200));
          err.status = r.status;
          err.body = txt;
          throw err;
        });
      }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') >= 0) return r.json();
      return r.text();
    });
  }

  function toast(msg, level) {
    level = level || 'info';
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, level); return; } catch (_) {}
    }
    var t = document.createElement('div');
    t.textContent = msg;
    t.className = 'vlx-mini-toast vlx-toast-' + level;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:' + (level === 'error' ? '#DC2626' : level === 'success' ? '#10B981' : '#1F2937') + ';' +
      'color:#fff;padding:10px 16px;border-radius:8px;z-index:99999;font-size:13px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '$0.00';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // ---------------------------------------------------------------------------
  // Modal helper (focus trap, ESC to close, ARIA)
  // ---------------------------------------------------------------------------
  function openModal(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'vlx-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var modal = document.createElement('div');
    modal.className = 'vlx-modal';

    var header = document.createElement('div');
    header.className = 'vlx-modal-header';
    var h = document.createElement('h3');
    h.id = 'vlx-modal-title-' + Date.now();
    h.textContent = opts.title || '';
    overlay.setAttribute('aria-labelledby', h.id);
    header.appendChild(h);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vlx-modal-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'vlx-modal-body';
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body instanceof Element) bodyEl.appendChild(opts.body);
    modal.appendChild(bodyEl);

    var footer = document.createElement('div');
    footer.className = 'vlx-modal-footer';
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vlx-btn ' + (b.primary ? 'vlx-btn-primary' : 'vlx-btn-secondary');
      btn.textContent = b.text;
      if (b.id) btn.id = b.id;
      btn.addEventListener('click', function () {
        try { b.onClick && b.onClick({ close: close, modal: modal, body: bodyEl }); } catch (e) { console.error(e); }
      });
      footer.appendChild(btn);
    });
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var prevFocus = document.activeElement;
    function focusables() {
      return $$('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', modal)
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    }
    var f = focusables();
    if (f[0]) f[0].focus();

    function trap(e) {
      if (e.key === 'Tab') {
        var ff = focusables();
        if (!ff.length) return;
        var first = ff[0], last = ff[ff.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      } else if (e.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', trap);

    function close() {
      document.removeEventListener('keydown', trap);
      overlay.remove();
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (_) {}
      if (opts.onClose) try { opts.onClose(); } catch (_) {}
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    return { close: close, modal: modal, body: bodyEl };
  }

  // ---------------------------------------------------------------------------
  // Customer autocomplete
  // ---------------------------------------------------------------------------
  function buildCustomerSelect(container, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'vlx-customer-search';
    wrap.innerHTML =
      '<label>Cliente' +
        '<input type="text" id="vlx-cust-search" autocomplete="off" placeholder="Buscar por nombre o teléfono...">' +
      '</label>' +
      '<div class="vlx-cust-results" role="listbox" aria-label="Resultados de cliente"></div>' +
      '<input type="hidden" id="vlx-cust-id">';
    container.appendChild(wrap);

    var input = wrap.querySelector('#vlx-cust-search');
    var list = wrap.querySelector('.vlx-cust-results');
    var hidden = wrap.querySelector('#vlx-cust-id');
    var debounce;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(debounce);
      if (q.length < 2) { list.innerHTML = ''; hidden.value = ''; if (onChange) onChange(null); return; }
      debounce = setTimeout(function () {
        api('/customers?search=' + encodeURIComponent(q) + '&limit=10').then(function (resp) {
          var items = Array.isArray(resp) ? resp :
                      Array.isArray(resp.data) ? resp.data :
                      Array.isArray(resp.items) ? resp.items : [];
          list.innerHTML = '';
          if (!items.length) {
            list.innerHTML = '<div class="vlx-cust-empty">Sin resultados</div>';
            return;
          }
          items.forEach(function (c) {
            var d = document.createElement('button');
            d.type = 'button';
            d.className = 'vlx-cust-item';
            d.setAttribute('role', 'option');
            d.innerHTML = '<strong>' + (c.name || '(sin nombre)') + '</strong>' +
              '<span>' + (c.phone || '') + '</span>' +
              '<span class="vlx-cust-balance">' + fmtMoney(c.balance) + '</span>';
            d.addEventListener('click', function () {
              hidden.value = c.id;
              input.value = c.name || '';
              list.innerHTML = '';
              if (onChange) onChange(c);
            });
            list.appendChild(d);
          });
        }).catch(function (e) {
          list.innerHTML = '<div class="vlx-cust-empty">Error: ' + e.message + '</div>';
        });
      }, 250);
    });
  }

  // ---------------------------------------------------------------------------
  // Register payment modal
  // ---------------------------------------------------------------------------
  function openRegisterPaymentModal(preselectedCustomerId) {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }

    var content = document.createElement('div');
    content.className = 'vlx-credit-form';

    var balanceBox = document.createElement('div');
    balanceBox.className = 'vlx-balance-box';
    balanceBox.innerHTML = '<span class="vlx-balance-label">Adeudo actual:</span> <span class="vlx-balance-value">—</span>';
    content.appendChild(balanceBox);

    buildCustomerSelect(content, function (cust) {
      if (cust) {
        balanceBox.querySelector('.vlx-balance-value').textContent = fmtMoney(cust.balance);
        amountInput.max = cust.balance != null ? cust.balance : '';
        currentBalance = cust.balance != null ? Number(cust.balance) : null;
      } else {
        balanceBox.querySelector('.vlx-balance-value').textContent = '—';
        currentBalance = null;
      }
    });

    var fieldsHtml =
      '<div class="vlx-form-row"><label>Monto del abono' +
        '<input type="number" step="0.01" min="0.01" id="vlx-pay-amount" required>' +
      '</label></div>' +
      '<div class="vlx-form-row"><label>Método de pago' +
        '<select id="vlx-pay-method" required>' +
          '<option value="efectivo">Efectivo</option>' +
          '<option value="tarjeta">Tarjeta</option>' +
          '<option value="transferencia">Transferencia</option>' +
          '<option value="cheque">Cheque</option>' +
        '</select>' +
      '</label></div>' +
      '<div class="vlx-form-row"><label>Fecha' +
        '<input type="date" id="vlx-pay-date" value="' + todayISO() + '" required>' +
      '</label></div>' +
      '<div class="vlx-form-row"><label>Notas (opcional)' +
        '<textarea id="vlx-pay-notes" rows="2"></textarea>' +
      '</label></div>' +
      '<div class="vlx-form-error" id="vlx-pay-err" role="alert" aria-live="polite"></div>';

    var fieldsWrap = document.createElement('div');
    fieldsWrap.innerHTML = fieldsHtml;
    content.appendChild(fieldsWrap);

    var currentBalance = null;
    var amountInput;

    var modalCtl = openModal({
      title: 'Registrar abono',
      body: content,
      buttons: [
        { text: 'Cancelar', onClick: function (ctx) { ctx.close(); } },
        {
          text: 'Registrar',
          primary: true,
          id: 'vlx-pay-submit',
          onClick: function (ctx) {
            submitPayment(ctx);
          }
        }
      ]
    });

    amountInput = $('#vlx-pay-amount');

    if (preselectedCustomerId) {
      // Try fetch customer + prefill
      api('/customers/' + preselectedCustomerId).then(function (c) {
        if (!c) return;
        var custInput = $('#vlx-cust-search');
        var custIdHidden = $('#vlx-cust-id');
        custInput.value = c.name || '';
        custIdHidden.value = c.id;
        balanceBox.querySelector('.vlx-balance-value').textContent = fmtMoney(c.balance);
        currentBalance = c.balance != null ? Number(c.balance) : null;
        amountInput.max = c.balance != null ? c.balance : '';
      }).catch(function (e) { console.warn('preselect customer failed', e); });
    }

    function submitPayment(ctx) {
      var custId = ($('#vlx-cust-id') || {}).value;
      var amount = parseFloat(($('#vlx-pay-amount') || {}).value);
      var method = ($('#vlx-pay-method') || {}).value;
      var date = ($('#vlx-pay-date') || {}).value;
      var notes = ($('#vlx-pay-notes') || {}).value;
      var errBox = $('#vlx-pay-err');
      errBox.textContent = '';

      if (!custId) { errBox.textContent = 'Selecciona un cliente.'; return; }
      if (!amount || isNaN(amount) || amount <= 0) { errBox.textContent = 'Ingresa un monto válido (> 0).'; return; }
      if (currentBalance != null && amount > currentBalance + 0.001) {
        errBox.textContent = 'El monto no puede exceder el adeudo actual (' + fmtMoney(currentBalance) + ').';
        return;
      }
      if (!method) { errBox.textContent = 'Selecciona método de pago.'; return; }
      if (!date) { errBox.textContent = 'Selecciona fecha.'; return; }

      var btn = $('#vlx-pay-submit');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Procesando...';

      api('/customers/' + encodeURIComponent(custId) + '/payments', {
        method: 'POST',
        body: { amount: amount, method: method, date: date, notes: notes }
      }).then(function (resp) {
        ctx.close();
        toast('Abono registrado: ' + fmtMoney(amount), 'success');
        // Refresh balance display anywhere on page
        try {
          window.dispatchEvent(new CustomEvent('volvix:customer:payment', {
            detail: { customer_id: custId, amount: amount, response: resp }
          }));
          if (typeof window.refreshCustomerBalance === 'function') {
            window.refreshCustomerBalance(custId);
          }
        } catch (_) {}
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = origText;
        errBox.textContent = 'Error: ' + e.message;
        console.error('[customer-credit] payment failed', e);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // History modal
  // ---------------------------------------------------------------------------
  function openHistoryModal(customerId) {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }

    var customerSearch = !customerId;
    var content = document.createElement('div');
    content.className = 'vlx-credit-history';

    if (customerSearch) {
      var pickerWrap = document.createElement('div');
      content.appendChild(pickerWrap);
      buildCustomerSelect(pickerWrap, function (c) {
        if (c) {
          customerId = c.id;
          loadHistory();
        }
      });
    }

    var listWrap = document.createElement('div');
    listWrap.className = 'vlx-history-list';
    listWrap.innerHTML = '<p class="vlx-loading-text">Selecciona un cliente para ver su historial...</p>';
    content.appendChild(listWrap);

    var pageOffset = 0;
    var PAGE_SIZE = 20;
    var allLoaded = false;

    function loadHistory(append) {
      if (!customerId) return;
      if (!append) { pageOffset = 0; allLoaded = false; listWrap.innerHTML = '<p class="vlx-loading-text">Cargando...</p>'; }
      api('/customers/' + encodeURIComponent(customerId) + '/payments?limit=' + PAGE_SIZE + '&offset=' + pageOffset)
        .then(function (resp) {
          var items = Array.isArray(resp) ? resp :
                      Array.isArray(resp.data) ? resp.data :
                      Array.isArray(resp.items) ? resp.items : [];
          if (!append) listWrap.innerHTML = '';
          if (!items.length && !append) {
            listWrap.innerHTML = '<p class="vlx-empty-text">Sin abonos registrados.</p>';
            return;
          }
          if (items.length < PAGE_SIZE) allLoaded = true;
          renderHistoryRows(items, append);
          pageOffset += items.length;
        })
        .catch(function (e) {
          listWrap.innerHTML = '<p class="vlx-error-text">Error: ' + e.message + '</p>';
        });
    }

    function renderHistoryRows(items, append) {
      var table = listWrap.querySelector('table');
      if (!table) {
        table = document.createElement('table');
        table.className = 'vlx-csv-table vlx-history-table';
        table.innerHTML =
          '<thead><tr>' +
            '<th>Fecha</th><th>Monto</th><th>Método</th><th>Balance después</th><th>Notas</th><th>Acciones</th>' +
          '</tr></thead><tbody></tbody>';
        listWrap.appendChild(table);
      }
      var tbody = table.querySelector('tbody');
      items.forEach(function (p) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + (p.date || p.created_at || '').toString().slice(0, 10) + '</td>' +
          '<td>' + fmtMoney(p.amount) + '</td>' +
          '<td>' + (p.method || '') + '</td>' +
          '<td>' + (p.balance_after != null ? fmtMoney(p.balance_after) : '—') + '</td>' +
          '<td>' + ((p.notes || '').replace(/[<>]/g, '')) + '</td>' +
          '<td><button type="button" class="vlx-btn vlx-btn-secondary vlx-print-receipt">Imprimir</button></td>';
        tr.querySelector('.vlx-print-receipt').addEventListener('click', function () { printReceipt(p, customerId); });
        tbody.appendChild(tr);
      });
      // Add load-more button if not all loaded
      var lm = listWrap.querySelector('.vlx-load-more');
      if (lm) lm.remove();
      if (!allLoaded) {
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'vlx-btn vlx-btn-secondary vlx-load-more';
        more.textContent = 'Cargar más';
        more.addEventListener('click', function () { loadHistory(true); });
        listWrap.appendChild(more);
      }
    }

    openModal({
      title: 'Historial de abonos',
      body: content,
      buttons: [{ text: 'Cerrar', onClick: function (ctx) { ctx.close(); } }]
    });

    if (customerId) loadHistory();
  }

  function printReceipt(payment, customerId) {
    var w = window.open('', '_blank', 'width=400,height=600');
    if (!w) { toast('Permite ventanas emergentes para imprimir', 'error'); return; }
    var html =
      '<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:20px;font-size:14px;}' +
      'h2{margin:0 0 10px;}.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ccc;}' +
      '.total{font-size:18px;font-weight:bold;margin-top:10px;}</style></head><body>' +
      '<h2>Comprobante de abono</h2>' +
      '<div class="row"><span>Cliente ID:</span><span>' + customerId + '</span></div>' +
      '<div class="row"><span>Fecha:</span><span>' + ((payment.date || payment.created_at || '') + '').slice(0, 10) + '</span></div>' +
      '<div class="row"><span>Método:</span><span>' + (payment.method || '') + '</span></div>' +
      '<div class="row total"><span>Monto:</span><span>' + fmtMoney(payment.amount) + '</span></div>' +
      (payment.balance_after != null ? '<div class="row"><span>Saldo restante:</span><span>' + fmtMoney(payment.balance_after) + '</span></div>' : '') +
      (payment.notes ? '<div class="row"><span>Notas:</span><span>' + payment.notes + '</span></div>' : '') +
      '<script>window.onload=function(){window.print();};</' + 'script>' +
      '</body></html>';
    w.document.write(html);
    w.document.close();
  }

  // ---------------------------------------------------------------------------
  // Hooking
  // ---------------------------------------------------------------------------
  function findRegisterPaymentBtn() {
    return $$('button,a').find(function (b) {
      var t = (b.textContent || '').trim();
      return /Registrar abono/i.test(t);
    }) || null;
  }

  function ensureHistoryLink(btn) {
    if (!btn) return;
    if (btn.parentElement && btn.parentElement.querySelector('.vlx-history-link')) return;
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'vlx-history-link';
    a.textContent = 'Ver historial de abonos';
    a.style.cssText = 'margin-left:12px;font-size:13px;color:#3B82F6;text-decoration:underline;cursor:pointer;';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      // Try to use a "current customer" from window or page state; otherwise let user search
      var cid = (window.currentCustomerId || (window.currentCustomer && window.currentCustomer.id) || null);
      openHistoryModal(cid);
    });
    if (btn.parentElement) btn.parentElement.insertBefore(a, btn.nextSibling);
  }

  function hookButtons() {
    var btn = findRegisterPaymentBtn();
    if (btn && btn.dataset.vlxCreditHooked !== '1') {
      btn.dataset.vlxCreditHooked = '1';
      btn.removeAttribute('data-vlx-rescued');
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var cid = (window.currentCustomerId || (window.currentCustomer && window.currentCustomer.id) || null);
        openRegisterPaymentModal(cid);
      }, true);
      ensureHistoryLink(btn);
    }
  }

  function startObserver() {
    if (!('MutationObserver' in window)) return;
    var t;
    var mo = new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(hookButtons, 300);
    });
    try {
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function init() {
    hookButtons();
    startObserver();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      hookButtons();
      if (tries >= 10) clearInterval(iv);
    }, 1000);
  }

  window.VolvixCustomerCredit = {
    openRegisterPaymentModal: openRegisterPaymentModal,
    openHistoryModal: openHistoryModal,
    rehook: hookButtons
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
