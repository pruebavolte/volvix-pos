/**
 * volvix-cobro-modal.js — Wiring del Modal de Cobro v1 (R31)
 *
 * Conecta los nuevos botones / inputs del #modal-pay con:
 *   - window.VolvixCobro (state machine de volvix-cobro-state.js)
 *   - Endpoint POST /api/cobro (sales + payments + cfdi_invoices)
 *   - SAT catalogs (/data/sat/*.json)
 *
 * Expone handlers globales: __vlxToggleSection, __vlxOpenMixtoBreakdown,
 * __vlxMixtoAddRow, __vlxToggleCfdi, __vlxValidateCfdi, __vlxSetTipPercent,
 * __vlxApplyDiscount, __vlxSetDelivery, __vlxOpenUsdModal.
 *
 * Carga: <script src="/volvix-cobro-modal.js" defer></script>
 * Depende de: volvix-cobro-state.js (debe cargar antes o en paralelo)
 */

(function () {
  'use strict';
  var VLX_DEBUG = false;
  var SAT_BASE = '/data/sat/';

  // ------- Estado compartido del modal -------
  var modalState = null;  // VolvixCobro state instance
  var satCatalogsLoaded = false;
  var subtotalCache = 0;

  function log() { if (VLX_DEBUG) console.log.apply(console, ['[vlx-cobro]'].concat([].slice.call(arguments))); }
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function fmtCur(n) {
    if (window.VolvixCobro && window.VolvixCobro.formatters) return window.VolvixCobro.formatters.formatCurrency(n);
    return '$' + (Number(n) || 0).toFixed(2);
  }
  function parseCur(s) {
    if (window.VolvixCobro && window.VolvixCobro.formatters) return window.VolvixCobro.formatters.parseCurrency(s);
    return parseFloat(String(s || '0').replace(/[^0-9.]/g, '')) || 0;
  }

  // ============================================================================
  // SAT CATALOGS — load JSON + populate selects
  // ============================================================================
  function loadSatCatalogs() {
    if (satCatalogsLoaded) return Promise.resolve();
    var files = ['regimenes-fiscales.json', 'usos-cfdi.json', 'formas-pago.json', 'metodos-pago.json'];
    return Promise.all(files.map(function (f) {
      return fetch(SAT_BASE + f).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    })).then(function (arr) {
      window.__vlxSatRegimenes = arr[0] || [];
      window.__vlxSatUsosCfdi = arr[1] || [];
      window.__vlxSatFormasPago = arr[2] || [];
      window.__vlxSatMetodosPago = arr[3] || [];
      satCatalogsLoaded = true;
      populateRegimenSelect();
      populateUsoCfdiSelect();
      log('SAT catalogs loaded:', arr.map(function (a) { return a.length; }).join(','));
    });
  }

  function populateRegimenSelect() {
    var sel = document.getElementById('vlx-cfdi-regimen');
    if (!sel || !window.__vlxSatRegimenes) return;
    sel.innerHTML = '<option value="">-- Seleccionar --</option>';
    window.__vlxSatRegimenes.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.codigo;
      opt.textContent = r.codigo + ' - ' + r.nombre;
      sel.appendChild(opt);
    });
  }
  function populateUsoCfdiSelect() {
    var sel = document.getElementById('vlx-cfdi-uso');
    if (!sel || !window.__vlxSatUsosCfdi) return;
    sel.innerHTML = '';
    window.__vlxSatUsosCfdi.forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = u.codigo;
      opt.textContent = u.codigo + ' - ' + u.nombre;
      if (u.codigo === 'G03') opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ============================================================================
  // TOGGLE SECTIONS — abre/cierra secciones plegables (cfdi, tip, discount, delivery, notes)
  // ============================================================================
  window.__vlxToggleSection = function (section, btn) {
    var el = document.getElementById('vlx-' + section + '-section');
    if (!el) return;
    var isOpen = el.style.display !== 'none' && el.style.display !== '';
    el.style.display = isOpen ? 'none' : 'block';
    if (btn) {
      btn.style.background = isOpen ? '#FFF' : '#0B0B0F';
      btn.style.color = isOpen ? '#0B0B0F' : '#FFF';
    }
    log('toggle', section, !isOpen);
  };

  // ============================================================================
  // MIXTO BREAKDOWN — filas dinámicas
  // ============================================================================
  window.__vlxOpenMixtoBreakdown = function () {
    var sec = document.getElementById('vlx-mixto-section');
    if (!sec) return;
    sec.style.display = 'block';
    // Si no hay filas, agregar primera con el missing
    var rows = document.getElementById('vlx-mixto-rows');
    if (rows && rows.children.length === 0) {
      window.__vlxMixtoAddRow();
    }
    updateMixtoMissing();
  };

  window.__vlxMixtoAddRow = function (presetMethod, presetAmount) {
    var rows = document.getElementById('vlx-mixto-rows');
    if (!rows) return;
    var rowId = 'mxr_' + Math.random().toString(36).slice(2, 10);
    var div = document.createElement('div');
    div.id = rowId;
    div.dataset.mixtoRow = '1';
    div.style.cssText = 'display:grid;grid-template-columns:130px 110px 1fr 32px;gap:4px;align-items:center;background:#FFF;padding:4px;border:1px solid #FED7AA;border-radius:6px';
    div.innerHTML = '\
      <select onchange="window.__vlxMixtoUpdate && window.__vlxMixtoUpdate(\'' + rowId + '\')" style="padding:5px;font-size:11px;border:1px solid #FED7AA;border-radius:4px">\
        <option value="EFECTIVO">💵 Efectivo</option>\
        <option value="TARJETA_DEBITO">💳 Tarj. Débito</option>\
        <option value="TARJETA_CREDITO">💳 Tarj. Crédito</option>\
        <option value="SPEI">🏦 SPEI</option>\
        <option value="CODI">📱 CoDi</option>\
        <option value="MERCADO_PAGO">💛 Mercado Pago</option>\
        <option value="VALE_DESPENSA">🎟️ Vale</option>\
        <option value="MONEDERO_ELECTRONICO">💰 Monedero</option>\
      </select>\
      <input type="number" step="0.01" min="0" placeholder="0.00" oninput="window.__vlxMixtoUpdate && window.__vlxMixtoUpdate(\'' + rowId + '\')" style="padding:5px;font-size:11.5px;border:1px solid #FED7AA;border-radius:4px;text-align:right;font-family:monospace">\
      <input type="text" placeholder="Ref/auth/folio" oninput="window.__vlxMixtoUpdate && window.__vlxMixtoUpdate(\'' + rowId + '\')" style="padding:5px;font-size:10.5px;border:1px solid #FED7AA;border-radius:4px">\
      <button type="button" onclick="window.__vlxMixtoRemove && window.__vlxMixtoRemove(\'' + rowId + '\')" style="padding:4px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;border-radius:4px;cursor:pointer;font-size:12px" title="Quitar">×</button>\
    ';
    rows.appendChild(div);
    if (presetMethod) {
      div.querySelector('select').value = presetMethod;
    }
    if (presetAmount) {
      div.querySelector('input[type="number"]').value = String(presetAmount);
    } else {
      // Auto-fill con missing
      var missing = computeMissing();
      if (missing > 0) {
        div.querySelector('input[type="number"]').value = missing.toFixed(2);
      }
    }
    updateMixtoMissing();
  };

  window.__vlxMixtoRemove = function (rowId) {
    var row = document.getElementById(rowId);
    if (row) row.parentNode.removeChild(row);
    updateMixtoMissing();
  };

  window.__vlxMixtoUpdate = function (rowId) {
    updateMixtoMissing();
  };

  function getMixtoRows() {
    return $$('#vlx-mixto-rows [data-mixto-row]').map(function (div) {
      var sel = div.querySelector('select');
      var amt = div.querySelector('input[type="number"]');
      var ref = div.querySelector('input[type="text"]');
      return {
        method: sel ? sel.value : 'EFECTIVO',
        amount: amt ? (parseFloat(amt.value) || 0) : 0,
        reference: ref ? ref.value : ''
      };
    });
  }

  function computeMissing() {
    var total = parseCur($('#pay-total') && $('#pay-total').textContent || '0');
    var rows = getMixtoRows();
    var paid;
    if (rows.length > 0) {
      paid = rows.reduce(function (s, r) { return s + r.amount; }, 0);
    } else {
      paid = parseCur($('#pay-recibido') && $('#pay-recibido').value || '0');
    }
    return Math.max(0, total - paid);
  }

  function updateMixtoMissing() {
    var missing = computeMissing();
    var el = document.getElementById('vlx-mixto-missing');
    if (el) {
      el.textContent = 'Falta: ' + fmtCur(missing);
      el.style.color = missing > 0 ? '#9A3412' : '#166534';
    }
    refreshCompleteButton();
  }

  // ============================================================================
  // CFDI INLINE — toggle + validators
  // ============================================================================
  window.__vlxToggleCfdi = function (enabled) {
    var fields = document.getElementById('vlx-cfdi-fields');
    if (!fields) return;
    fields.style.display = enabled ? 'grid' : 'none';
    if (enabled) loadSatCatalogs();
    refreshCompleteButton();
  };

  // Validador PURO de CFDI: NO llama a refreshCompleteButton (evita recursión).
  // refreshCompleteButton llama a éste internamente para checar validez.
  function cfdiIsValid() {
    var enabled = $('#vlx-cfdi-enabled') && $('#vlx-cfdi-enabled').checked;
    if (!enabled) return { ok: true, errors: [] };
    var rfc = ($('#vlx-cfdi-rfc') && $('#vlx-cfdi-rfc').value || '').toUpperCase().trim();
    var cp = ($('#vlx-cfdi-cp') && $('#vlx-cfdi-cp').value || '').trim();
    var regimen = $('#vlx-cfdi-regimen') && $('#vlx-cfdi-regimen').value;
    var errors = [];
    if (window.VolvixCobro && window.VolvixCobro.validators) {
      if (!window.VolvixCobro.validators.isValidRFC(rfc)) errors.push('RFC inválido (formato: XAXX010101000)');
      if (!window.VolvixCobro.validators.isValidCP(cp)) errors.push('CP inválido (5 dígitos)');
    } else {
      if (!/^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/.test(rfc)) errors.push('RFC inválido');
      if (!/^\d{5}$/.test(cp)) errors.push('CP inválido');
    }
    if (!regimen) errors.push('Régimen fiscal requerido');
    return { ok: errors.length === 0, errors: errors };
  }

  // Handler público: actualiza UI de errores y refresca botón Completar.
  // SAFE — no recursión porque refreshCompleteButton llama a cfdiIsValid (puro).
  window.__vlxValidateCfdi = function () {
    var res = cfdiIsValid();
    var errBox = document.getElementById('vlx-cfdi-error');
    if (errBox) {
      errBox.style.display = res.errors.length ? 'block' : 'none';
      errBox.textContent = res.errors.join(' · ');
    }
    refreshCompleteButton();
    return res.ok;
  };

  // ============================================================================
  // PROPINA
  // ============================================================================
  window.__vlxSetTipPercent = function (percent, btn) {
    var subtotal = subtotalCache || parseCur($('#pay-total') && $('#pay-total').textContent || '0');
    var amount = Math.round((subtotal * percent / 100 + Number.EPSILON) * 100) / 100;
    var el = document.getElementById('vlx-tip-amount');
    if (el) el.textContent = fmtCur(amount);
    // Visual feedback
    $$('#vlx-tip-section button[data-tip]').forEach(function (b) {
      b.style.background = '#FFF';
      b.style.color = '';
    });
    if (btn) {
      btn.style.background = '#166534';
      btn.style.color = '#FFF';
    }
    // Update total
    window.__vlxTipAmount = amount;
    window.__vlxTipPercent = percent;
    recalcTotal();
  };

  // ============================================================================
  // DESCUENTO
  // ============================================================================
  window.__vlxApplyDiscount = function (mode, val) {
    var subtotal = subtotalCache || parseCur($('#pay-total') && $('#pay-total').textContent || '0');
    var amount = 0;
    if (mode === 'amount') {
      amount = val;
      if ($('#vlx-discount-percent')) $('#vlx-discount-percent').value = '';
    } else if (mode === 'percent') {
      amount = Math.round((subtotal * val / 100 + Number.EPSILON) * 100) / 100;
      if ($('#vlx-discount-amount')) $('#vlx-discount-amount').value = amount.toFixed(2);
    }
    if (amount > subtotal * 0.5) {
      // requiere autorización (UI lo flagea; backend lo valida estricto)
      var el = $('#vlx-discount-amount');
      if (el) el.style.borderColor = '#DC2626';
      console.warn('[vlx-cobro] Descuento >50% requiere autorización manager');
    } else {
      var el = $('#vlx-discount-amount');
      if (el) el.style.borderColor = '#FDE68A';
    }
    window.__vlxDiscountAmount = amount;
    recalcTotal();
  };

  // ============================================================================
  // ENTREGA TICKET
  // ============================================================================
  window.__vlxSetDelivery = function (method, btn) {
    $$('#vlx-delivery-section button[data-delivery]').forEach(function (b) {
      b.style.background = '#FFF';
      b.style.color = '';
    });
    if (btn) {
      btn.style.background = '#991B1B';
      btn.style.color = '#FFF';
    }
    var tgt = document.getElementById('vlx-delivery-target');
    if (tgt) {
      if (method === 'EMAIL' || method === 'WHATSAPP' || method === 'PRINT_AND_EMAIL') {
        tgt.style.display = 'block';
        tgt.placeholder = method === 'WHATSAPP' ? '+52 55 1234 5678' : 'cliente@email.com';
      } else {
        tgt.style.display = 'none';
      }
    }
    window.__vlxDeliveryMethod = method;
  };

  // ============================================================================
  // USD MODAL — para captura de monto USD + tipo de cambio
  // ============================================================================
  window.__vlxOpenUsdModal = function () {
    var subtotal = subtotalCache || parseCur($('#pay-total') && $('#pay-total').textContent || '0');
    var rateDefault = 17.50;
    if (window.VolvixCobro && window.VolvixCobro.api && window.VolvixCobro.api.getExchangeRate) {
      window.VolvixCobro.api.getExchangeRate().then(function (r) {
        promptUsd(subtotal, r.rate || rateDefault);
      }).catch(function () { promptUsd(subtotal, rateDefault); });
    } else {
      promptUsd(subtotal, rateDefault);
    }
  };

  function promptUsd(totalMxn, rate) {
    var usdNeeded = (totalMxn / rate).toFixed(2);
    var msg = 'Tipo de cambio: $' + rate.toFixed(4) + ' MXN/USD\n' +
              'Total en USD: $' + usdNeeded + '\n\nIngresa USD recibido:';
    var usdInput = prompt(msg, usdNeeded);
    if (usdInput === null) return;
    var usd = parseFloat(usdInput) || 0;
    var mxn = Math.round((usd * rate + Number.EPSILON) * 100) / 100;
    var recibido = $('#pay-recibido');
    if (recibido) {
      recibido.value = fmtCur(mxn);
      if (typeof calcChange === 'function') calcChange();
    }
    window.__vlxUsdAmount = usd;
    window.__vlxUsdRate = rate;
    log('USD captured:', usd, '@', rate, '=', mxn, 'MXN');
  }

  // ============================================================================
  // RECALC TOTAL — cuando cambia tip/discount/rounding, ajusta #pay-total
  // ============================================================================
  function recalcTotal() {
    if (!subtotalCache) return;
    var tip = window.__vlxTipAmount || 0;
    var discount = window.__vlxDiscountAmount || 0;
    var rounding = window.__vlxRoundingAmount || 0;
    var total = subtotalCache - discount + tip + rounding;
    var el = $('#pay-total');
    if (el) el.textContent = fmtCur(total);
    refreshCompleteButton();
  }

  // ============================================================================
  // VALIDACIÓN — Botón Completar disabled si monto insuficiente
  // ============================================================================
  function refreshCompleteButton() {
    var btn = $('#modal-pay-confirm');
    if (!btn) return;
    var method = window.__volvixSelectedPayMethod || 'efectivo';
    var total = parseCur($('#pay-total') && $('#pay-total').textContent || '0');
    var paid;
    if (method === 'mixto') {
      paid = getMixtoRows().reduce(function (s, r) { return s + r.amount; }, 0);
    } else {
      paid = parseCur($('#pay-recibido') && $('#pay-recibido').value || '0');
    }
    var sufficient = paid >= total - 0.005;
    // Llamar al validador PURO (cfdiIsValid), NO al handler público (recursión!)
    var cfdiOk = !($('#vlx-cfdi-enabled') && $('#vlx-cfdi-enabled').checked) || cfdiIsValid().ok;
    var canComplete = sufficient && cfdiOk;
    btn.disabled = !canComplete;
    if (canComplete) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    } else {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
  }

  // ============================================================================
  // SETUP — observa cambios de método para mostrar/ocultar Mixto, hookear validación
  // ============================================================================
  function setupModalListeners() {
    // 1) Monkey-patch setPayMethod para mostrar/ocultar Mixto y refresh validation
    var origSetMethod = window.setPayMethod;
    if (typeof origSetMethod === 'function') {
      window.setPayMethod = function (el) {
        origSetMethod(el);
        var method = (el && el.dataset && el.dataset.method) || 'efectivo';
        // Mostrar/ocultar Mixto breakdown
        var mixtoSec = document.getElementById('vlx-mixto-section');
        if (mixtoSec) mixtoSec.style.display = (method === 'mixto') ? 'block' : 'none';
        // Refresh validation
        setTimeout(refreshCompleteButton, 0);
      };
    }
    // 2) Listen recibido changes to refresh validation
    var rec = $('#pay-recibido');
    if (rec) {
      rec.addEventListener('input', refreshCompleteButton);
    }
    // 3) F1-F8 shortcuts (only when modal-pay is open)
    document.addEventListener('keydown', function (e) {
      var modal = document.getElementById('modal-pay');
      if (!modal || !modal.classList.contains('open')) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      var key = e.key;
      var shortcuts = { 'F1': 'efectivo', 'F2': 'tarjeta_debito', 'F3': 'tarjeta_credito', 'F4': 'spei',
                        'F5': 'codi', 'F6': 'mercado_pago', 'F7': 'vale_despensa', 'F8': 'mixto' };
      if (shortcuts[key]) {
        e.preventDefault();
        var btn = document.querySelector('#modal-pay .btn[data-method="' + shortcuts[key] + '"]');
        if (btn) btn.click();
      }
    });
    // 4) Hook into openPayment to cache subtotal + reset state
    var origOpenPay = window.openPayment;
    if (typeof origOpenPay === 'function') {
      window.openPayment = function () {
        origOpenPay();
        setTimeout(function () {
          var totalText = $('#pay-total') && $('#pay-total').textContent || '0';
          subtotalCache = parseCur(totalText);
          // Reset extras
          window.__vlxTipAmount = 0;
          window.__vlxTipPercent = null;
          window.__vlxDiscountAmount = 0;
          window.__vlxRoundingAmount = 0;
          window.__vlxDeliveryMethod = 'PRINT';
          window.__vlxUsdAmount = null;
          window.__vlxUsdRate = null;
          // Reset CFDI
          var cfdiCheck = $('#vlx-cfdi-enabled');
          if (cfdiCheck) cfdiCheck.checked = false;
          var cfdiFields = $('#vlx-cfdi-fields');
          if (cfdiFields) cfdiFields.style.display = 'none';
          // Reset mixto rows
          var mixtoRows = $('#vlx-mixto-rows');
          if (mixtoRows) mixtoRows.innerHTML = '';
          var mixtoSec = $('#vlx-mixto-section');
          if (mixtoSec) mixtoSec.style.display = 'none';
          // Hide extras sections
          ['cfdi', 'tip', 'discount', 'delivery', 'notes'].forEach(function (s) {
            var el = $('#vlx-' + s + '-section');
            if (el) el.style.display = 'none';
            var btn = $('.vlx-section-toggle[data-section="' + s + '"]');
            if (btn) { btn.style.background = '#FFF'; btn.style.color = '#0B0B0F'; }
          });
          refreshCompleteButton();
        }, 100);
      };
    }
  }

  // ============================================================================
  // SUBMIT — sobrescribir completePay con versión que envía state completo
  // ============================================================================
  function setupCompletePayWrapper() {
    var origComplete = window.completePay;
    if (typeof origComplete !== 'function') return;

    window.completePay = async function () {
      var method = window.__volvixSelectedPayMethod || 'efectivo';
      var total = parseCur($('#pay-total') && $('#pay-total').textContent || '0');

      // 1) Construir payments array
      var payments = [];
      if (method === 'mixto') {
        payments = getMixtoRows().filter(function (r) { return r.amount > 0; }).map(function (r) {
          return { method: r.method, amount: r.amount, details: { reference: r.reference } };
        });
        if (payments.length === 0) {
          alert('Mixto requiere al menos 1 método con monto > 0');
          return;
        }
      } else {
        var recibido = parseCur($('#pay-recibido') && $('#pay-recibido').value || '0');
        // Mapear método legacy → enum
        var methodMap = {
          'efectivo': 'EFECTIVO', 'tarjeta': 'TARJETA_CREDITO', 'tarjeta_debito': 'TARJETA_DEBITO',
          'tarjeta_credito': 'TARJETA_CREDITO', 'transferencia': 'SPEI', 'spei': 'SPEI',
          'codi': 'CODI', 'mercado_pago': 'MERCADO_PAGO', 'vale_despensa': 'VALE_DESPENSA',
          'monedero_electronico': 'MONEDERO_ELECTRONICO', 'usd_efectivo': 'USD_EFECTIVO',
          'credito_cliente': 'CREDITO_CLIENTE'
        };
        var enumMethod = methodMap[method] || 'EFECTIVO';
        var paymentAmount = recibido > 0 ? Math.min(recibido, total) : total;  // si es exacto, total; si cambio, total (no más)
        var details = {};
        if (enumMethod === 'USD_EFECTIVO' && window.__vlxUsdAmount) {
          details.usd_amount = window.__vlxUsdAmount;
          details.usd_rate = window.__vlxUsdRate;
        }
        payments.push({ method: enumMethod, amount: paymentAmount, details: details });
      }

      // 2) Construir CFDI si está enabled
      var cfdi = null;
      if ($('#vlx-cfdi-enabled') && $('#vlx-cfdi-enabled').checked) {
        if (!window.__vlxValidateCfdi()) {
          alert('Datos CFDI incompletos o inválidos');
          return;
        }
        cfdi = {
          rfc: ($('#vlx-cfdi-rfc') && $('#vlx-cfdi-rfc').value || '').toUpperCase().trim(),
          razon_social: ($('#vlx-cfdi-razon') && $('#vlx-cfdi-razon').value || '').trim(),
          codigo_postal: ($('#vlx-cfdi-cp') && $('#vlx-cfdi-cp').value || '').trim(),
          regimen_fiscal: $('#vlx-cfdi-regimen') && $('#vlx-cfdi-regimen').value,
          uso_cfdi: $('#vlx-cfdi-uso') && $('#vlx-cfdi-uso').value || 'G03',
          metodo_pago: $('#vlx-cfdi-metodo') && $('#vlx-cfdi-metodo').value || 'PUE',
          email_facturacion: ($('#vlx-cfdi-email') && $('#vlx-cfdi-email').value || '').trim(),
          forma_pago: payments.length > 1 ? '99' : (window.VolvixCobro && window.VolvixCobro.satCatalogs ? window.VolvixCobro.satCatalogs.mapMethodToFormaPago(payments[0].method) : '01')
        };
      }

      // 3) Inyectar extras al global usado por /api/sales (legacy) para retro-compat
      window.__vlxCobroExtras = {
        payments: payments,
        cfdi: cfdi,
        tip: { amount: window.__vlxTipAmount || 0, percent: window.__vlxTipPercent },
        discount: { amount: window.__vlxDiscountAmount || 0, reason: $('#vlx-discount-reason') && $('#vlx-discount-reason').value || null },
        rounding: { amount: window.__vlxRoundingAmount || 0, destination: null },
        delivery: { method: window.__vlxDeliveryMethod || 'PRINT', target: $('#vlx-delivery-target') && $('#vlx-delivery-target').value || null },
        notes: $('#vlx-notes-text') && $('#vlx-notes-text').value || ''
      };

      // 4) Llamar a /api/cobro PRIMERO (escribe sales + payments + cfdi en una transacción)
      try {
        var session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
        var token = (window.VolvixAuth && window.VolvixAuth.getToken && window.VolvixAuth.getToken())
          || localStorage.getItem('volvix_token')
          || localStorage.getItem('volvixAuthToken') || '';
        var folio = ($('#currentFolio') && $('#currentFolio').textContent) || '';
        var items = (window.CART || []).map(function (i) { return { id: i.id, code: i.code, name: i.name, price: i.price, qty: i.qty }; });
        var resp = await fetch('/api/cobro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
          body: JSON.stringify({
            tenant_id: session && session.tenant_id || null,
            customer_id: window.__volvixSelectedCustomerId || null,
            ticket_number: 'TKT-' + folio,
            subtotal: subtotalCache,
            items: items,
            payments: payments,
            cfdi: cfdi,
            tip: window.__vlxCobroExtras.tip,
            discount: window.__vlxCobroExtras.discount,
            rounding: window.__vlxCobroExtras.rounding,
            delivery: window.__vlxCobroExtras.delivery,
            notes: window.__vlxCobroExtras.notes,
            total: total
          })
        });
        if (resp.ok) {
          var data = await resp.json();
          log('cobro response:', data);
          window.__vlxLastCobroResult = data;
          // Continue with original completePay() that updates UI + closes modal
          return origComplete.apply(this, arguments);
        } else if (resp.status === 404) {
          // /api/cobro no desplegado todavía → fallback a /api/sales (legacy)
          log('FALLBACK to /api/sales (no /api/cobro yet)');
          return origComplete.apply(this, arguments);
        } else {
          var errBody = await resp.text();
          console.error('[vlx-cobro] /api/cobro failed:', resp.status, errBody);
          alert('Error al guardar el cobro: ' + resp.status);
          return;
        }
      } catch (e) {
        console.error('[vlx-cobro] /api/cobro exception:', e);
        // Si red falla, dejar que el legacy intente (que tiene offline queue)
        return origComplete.apply(this, arguments);
      }
    };
  }

  // ============================================================================
  // INIT
  // ============================================================================
  function init() {
    log('init');
    setupModalListeners();
    setupCompletePayWrapper();
    // Pre-cargar catalogos si CFDI section existe
    if (document.getElementById('vlx-cfdi-section')) {
      loadSatCatalogs();
    }
    // Initial validation check
    setTimeout(refreshCompleteButton, 500);
    document.dispatchEvent(new CustomEvent('volvix:cobro-modal:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
