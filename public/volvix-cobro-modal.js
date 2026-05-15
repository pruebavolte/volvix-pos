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
    // 2b) Hook calcChange (legacy) — se dispara desde billetes, EXACTO, numpad
    var origCalcChange = window.calcChange;
    if (typeof origCalcChange === 'function') {
      window.calcChange = function () {
        try { origCalcChange.apply(this, arguments); } catch (e) { console.warn('[vlx] calcChange err', e); }
        try { refreshCompleteButton(); } catch (e) {}
      };
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
  // Sanitiza texto libre antes de mandarlo al backend (defensa-en-profundidad
  // contra XSS stored en reportes que rendereen con innerHTML).
  function sanitizeFreeText(s) {
    if (!s) return '';
    return String(s)
      .replace(/[<>]/g, '')       // elimina < y > para impedir cualquier tag
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .slice(0, 500);
  }

  // Token unificado (fix SEC-6): UN solo source-of-truth.
  // Prioridad: VolvixAuth.getToken → 'volvix:session' (auth-gate.js spec) → legacy keys.
  function getAuthToken() {
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        var t = window.VolvixAuth.getToken();
        if (t) return t;
      }
      // auth-gate.js usa 'volvix:session' como key oficial
      var sessRaw = localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession');
      if (sessRaw) {
        var sess = JSON.parse(sessRaw);
        if (sess && sess.token) return sess.token;
      }
      return localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || '';
    } catch (_) { return ''; }
  }

  // Idempotency-key determinista (fix SEC-3): SHA-256 de items + total + cashier + ticket.
  // Si el cliente reintenta (red intermitente, doble-submit, refresh), el server detecta dup.
  async function deterministicIdemKey(payload) {
    try {
      var src = JSON.stringify({
        items: (payload.items || []).map(function (i) { return [i.id || i.code, i.qty, i.price]; }),
        total: payload.total,
        ticket: payload.ticket_number,
        tenant: payload.tenant_id || ''
      });
      if (window.crypto && window.crypto.subtle) {
        var buf = new TextEncoder().encode(src);
        var hash = await window.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(function (b) { return b.toString(16).padStart(2,'0'); }).join('').slice(0, 32);
      }
    } catch (_) {}
    return 'idem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // 2026-05-14 — Auto-print ticket térmico al completar cobro.
  // Soporta dos modos: USB (impresora del SO) y BLUETOOTH (SPP / virtual COM).
  // El usuario elige en Configuración: localStorage.volvix_printer_mode = 'usb' | 'bluetooth' | 'auto'
  // Default 'auto': prueba BT primero (si hay BT paired) si no usa USB.
  async function autoPrintTicket(cobroResult) {
    try {
      // Sólo si estamos en la app .exe Electron — en navegador web puro fallback a window.print
      if (!window.volvixElectron || !window.volvixElectron.printToSystem) {
        log('autoPrint skipped (no Electron) — use config to enable web print');
        return false;
      }

      // Leer config impresora (mode + targets)
      var printMode = 'auto';   // 'auto' | 'usb' | 'bluetooth' | 'ip'
      try { printMode = localStorage.getItem('volvix_printer_mode') || 'auto'; } catch (_) {}
      var btMac = null, networkIP = null, networkPort = 9100;
      try { btMac = localStorage.getItem('volvix_bt_printer_mac'); } catch (_) {}
      try { networkIP = localStorage.getItem('volvix_printer_ip'); } catch (_) {}
      try { networkPort = parseInt(localStorage.getItem('volvix_printer_port') || '9100', 10) || 9100; } catch (_) {}

      // 2026-05-15: si modo 'ip' o ('auto' + IP configurada), probar IP primero
      if (printMode === 'ip' || (printMode === 'auto' && networkIP)) {
        if (window.volvixElectron.printNetwork) {
          try {
            var ipResult = await tryNetworkPrint(cobroResult, networkIP, networkPort);
            if (ipResult && ipResult.ok) {
              log('✅ Printed via IP:', networkIP + ':' + networkPort);
              return true;
            }
            if (printMode === 'ip') {
              log('IP print failed in IP mode:', ipResult && ipResult.error);
              if (typeof window.showToast === 'function') {
                window.showToast('⚠ Impresora IP no respondió (' + networkIP + ')', 'warning', 6000);
              }
              return false;
            }
            log('IP failed, trying next:', ipResult && ipResult.error);
          } catch (e) { log('IP print exception:', e); }
        }
      }

      // 2026-05-14 v1.0.311: si modo es 'auto' Y hay impresora BT emparejada,
      // PROMOVER a 'bluetooth' exclusivo (NO caer a USB si BT falla).
      var btPrintersAvailable = [];
      if (printMode === 'auto' && window.volvixElectron.listBluetoothPrinters) {
        try {
          btPrintersAvailable = await window.volvixElectron.listBluetoothPrinters();
          var btPrinters = (btPrintersAvailable || []).filter(function (p) { return p && p.isPrinter; });
          if (btPrinters.length > 0) {
            printMode = 'bluetooth';
            log('Auto-mode: BT printer detected (' + btPrinters[0].name + '), using BT exclusivamente');
          }
        } catch (e) { log('Error listing BT printers:', e.message); }
      }

      // BT mode: probar Bluetooth primero si el modo lo permite
      if (printMode === 'bluetooth' || printMode === 'auto') {
        if (window.volvixElectron.printBluetooth) {
          try {
            var btResult = await tryBluetoothPrint(cobroResult, btMac);
            if (btResult && btResult.ok) {
              log('✅ Printed via Bluetooth:', btResult.printer, btResult.com);
              return true;
            }
            if (printMode === 'bluetooth') {
              // Modo BT explícito + falló → reportar y NO fallback (el usuario quiere BT)
              log('BT print failed in BT mode:', btResult && btResult.error);
              if (typeof window.showToast === 'function') {
                window.showToast('⚠ Impresora BT no respondió. Verifica que esté encendida y con papel.', 'warning', 6000);
              }
              return false;
            }
            log('BT failed, falling back to USB:', btResult && btResult.error);
          } catch (e) {
            log('BT print exception:', e);
          }
        }
      }
      // 1) Resolver impresora
      var printerName = null;
      try { printerName = localStorage.getItem('volvix_system_printer'); } catch (_) {}
      if (!printerName && window.PrintHub && typeof window.PrintHub.findBestThermalPrinter === 'function') {
        try {
          var best = await window.PrintHub.findBestThermalPrinter();
          if (best && best.name) {
            printerName = best.name;
            // Auto-guardar para próximos cobros (adulto mayor no tiene que configurar nada)
            try { localStorage.setItem('volvix_system_printer', printerName); } catch (_) {}
            log('auto-selected thermal printer:', printerName);
          }
        } catch (e) { warn('findBestThermalPrinter fail', e); }
      }
      // 2) Construir HTML del ticket — 58mm = ~280px ancho a 203dpi
      var saleNum = (cobroResult && cobroResult.sale_number) || '';
      var saleId = (cobroResult && cobroResult.sale_id) || '';
      var total = (cobroResult && cobroResult.total) || 0;
      var nowStr = new Date().toLocaleString('es-MX');
      var items = (window.CART || []).slice();

      // 2026-05-15 v1.0.315: USAR el customizer del usuario si está disponible
      // Esto garantiza que el ticket impreso refleje EXACTAMENTE lo que se ve
      // en el preview en vivo del tab Configuración → Impresión.
      var ticketHtml;
      if (window.VolvixTicketCustomizer && window.VolvixTicketCustomizer.renderText) {
        var cfg = window.VolvixTicketCustomizer.getConfig();
        // Construir data desde el cobro real
        var realData = {
          folio: saleNum || (saleId ? saleId.slice(0, 8) : ''),
          date: new Date().toLocaleDateString('es-MX'),
          time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          cashier: (function () {
            try {
              var s = JSON.parse(localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession') || 'null');
              return (s && (s.full_name || s.name || s.email)) || 'Cajero';
            } catch (_) { return 'Cajero'; }
          })(),
          customer: window.__volvixSelectedCustomerName || 'Público en general',
          items: items.map(function (i) {
            return {
              qty: i.qty || 1,
              code: i.code || i.id,
              name: i.name || '',
              price: i.price || 0,
              total: (i.price || 0) * (i.qty || 1),
              tax: 0
            };
          }),
          itemsCount: items.reduce(function (s, i) { return s + (i.qty || 1); }, 0),
          subtotal: total,
          total: total,
          discount: 0,
          tip: 0,
          tax: 0,
          payment: {
            method: (window.__volvixSelectedPayMethod || 'efectivo').toUpperCase(),
            received: parseFloat((document.getElementById('pay-recibido') || {}).value || '0') || total,
            change: 0
          }
        };
        realData.payment.change = Math.max(0, realData.payment.received - total);
        var ticketText = window.VolvixTicketCustomizer.renderText(realData, cfg);
        ticketHtml = '<!doctype html><html><head><meta charset="utf-8"><style>' +
          '*{margin:0;padding:0;box-sizing:border-box}' +
          'body{font-family:"Courier New",monospace;font-size:' + (cfg.fontSize || 11) + 'px;width:' + (cfg.paperWidth === 48 ? '380px' : '280px') + ';padding:8px;color:#000;line-height:1.3;white-space:pre-wrap}' +
          '@media print{@page{size:' + (cfg.paperWidth === 48 ? '80mm' : '58mm') + ' auto;margin:0}body{width:' + (cfg.paperWidth === 48 ? '80mm' : '58mm') + ';padding:4mm 3mm}}' +
          '</style></head><body>' +
          ticketText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') +
          '</body></html>';
      } else {
        // Fallback al ticket simple
        var businessName = '';
        try {
          var sess = JSON.parse(localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession') || 'null');
          businessName = (sess && (sess.business_name || sess.tenant_name)) || '';
        } catch (_) {}
        ticketHtml = '<!doctype html><html><head><meta charset="utf-8"><style>' +
          '*{margin:0;padding:0;box-sizing:border-box}' +
          'body{font-family:"Courier New",monospace;font-size:11px;width:280px;padding:8px;color:#000}' +
          '.ctr{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:6px 0}' +
          'table{width:100%;font-size:10.5px}td{padding:1px 0}.r{text-align:right}' +
          '@media print{@page{size:58mm auto;margin:0}body{width:58mm;padding:4mm 3mm}}' +
          '</style></head><body>' +
          (businessName ? '<div class="ctr b" style="font-size:13px">' + businessName + '</div>' : '') +
          '<div class="ctr" style="font-size:10px">' + nowStr + '</div>' +
          '<div class="ctr" style="font-size:10px">Ticket: ' + (saleNum || saleId.slice(0,8)) + '</div>' +
          '<div class="sep"></div><table>' +
          items.map(function (i) {
            return '<tr><td>' + (i.qty || 1) + 'x ' + (i.name || '') + '</td>' +
                   '<td class="r">$' + ((i.price || 0) * (i.qty || 1)).toFixed(2) + '</td></tr>';
          }).join('') +
          '</table><div class="sep"></div>' +
          '<table><tr><td class="b">TOTAL</td><td class="r b" style="font-size:14px">$' + Number(total).toFixed(2) + '</td></tr></table>' +
          '<div class="sep"></div>' +
          '<div class="ctr" style="font-size:10px">¡Gracias por su compra!</div>' +
          '<div class="ctr" style="font-size:9px;color:#666;margin-top:4px">Volvix POS</div>' +
          '</body></html>';
      }
      // 3) Imprimir silencioso (sin diálogo Windows)
      var result = await window.volvixElectron.printToSystem({
        html: ticketHtml,
        printerName: printerName || undefined,  // undefined → impresora default del SO
        silent: true,
        copies: 1,
        printBackground: false
      });
      log('autoPrint result:', result);
      return !!(result && result.ok);
    } catch (e) {
      console.error('[vlx-cobro] autoPrintTicket error:', e);
      return false;
    }
  }

  // Auxiliar: imprimir vía IP (TCP socket JetDirect 9100)
  async function tryNetworkPrint(cobroResult, ip, port) {
    try {
      var saleNum = (cobroResult && cobroResult.sale_number) || '';
      var saleId = (cobroResult && cobroResult.sale_id) || '';
      var total = (cobroResult && cobroResult.total) || 0;
      var nowStr = new Date().toLocaleString('es-MX');
      var items = (window.CART || []).slice();
      var businessName = '';
      try {
        var sess = JSON.parse(localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession') || 'null');
        businessName = (sess && (sess.business_name || sess.tenant_name)) || '';
      } catch (_) {}

      var lines = [];
      if (businessName) lines.push(businessName);
      lines.push(nowStr);
      lines.push('Ticket: ' + (saleNum || saleId.slice(0,8)));
      lines.push('--------------------------------');
      items.forEach(function (i) {
        var name = (i.name || '').slice(0, 22).padEnd(22);
        var amt = '$' + ((i.price || 0) * (i.qty || 1)).toFixed(2);
        lines.push((i.qty || 1) + 'x ' + name + amt.padStart(8));
      });
      lines.push('--------------------------------');
      lines.push('TOTAL  $' + Number(total).toFixed(2));
      lines.push('--------------------------------');
      lines.push('Gracias por su compra!');
      lines.push('Volvix POS');

      return await window.volvixElectron.printNetwork({
        ip: ip,
        port: port || 9100,
        text: lines.join('\n'),
        cut: true,
        timeout: 10000
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Auxiliar: imprimir vía Bluetooth (SPP / virtual COM)
  async function tryBluetoothPrint(cobroResult, preferredMac) {
    try {
      var saleNum = (cobroResult && cobroResult.sale_number) || '';
      var saleId = (cobroResult && cobroResult.sale_id) || '';
      var total = (cobroResult && cobroResult.total) || 0;
      var nowStr = new Date().toLocaleString('es-MX');
      var items = (window.CART || []).slice();
      var businessName = '';
      try {
        var sess = JSON.parse(localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession') || 'null');
        businessName = (sess && (sess.business_name || sess.tenant_name)) || '';
      } catch (_) {}

      // Construir texto plano para BT (la conversión HTML→ESC/POS está en main.js)
      var lines = [];
      if (businessName) lines.push(businessName);
      lines.push(nowStr);
      lines.push('Ticket: ' + (saleNum || saleId.slice(0,8)));
      lines.push('--------------------------------');
      items.forEach(function (i) {
        var name = (i.name || '').slice(0, 22).padEnd(22);
        var amt = '$' + ((i.price || 0) * (i.qty || 1)).toFixed(2);
        lines.push((i.qty || 1) + 'x ' + name + amt.padStart(8));
      });
      lines.push('--------------------------------');
      lines.push('TOTAL  $' + Number(total).toFixed(2));
      lines.push('--------------------------------');
      lines.push('Gracias por su compra!');
      lines.push('Volvix POS');

      var text = lines.join('\n');
      return await window.volvixElectron.printBluetooth({
        text: text,
        mac: preferredMac,
        baudRate: 9600
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // 2026-05-15: Wrapper que detecta errores, repara USB automáticamente,
  // y muestra modal rojo grande si falla irrecuperable
  async function autoPrintTicketWithErrorHandling(cobroResult) {
    var snapshot = Object.assign({ cart: (window.CART || []).slice() }, cobroResult || {});

    // Intento 1
    var r1 = await autoPrintTicket(snapshot);
    if (r1 === true || (r1 && r1.ok)) return r1;

    // Falló — verificar status real Y reparar USB si aplica
    var errorMsg = (r1 && r1.error) || 'No se pudo imprimir';
    log('Print failed (intento 1):', errorMsg);

    // ¿Es problema de Spooler/USB (no es BT ni IP)? → intentar reparar
    var canRepairUSB = window.volvixElectron && window.volvixElectron.repairPrinter;
    if (canRepairUSB) {
      try {
        var repair = await window.volvixElectron.repairPrinter();
        log('USB repair:', repair);
        if (repair && repair.success) {
          // Reintentar después de reparar
          log('Reintentando print tras repair...');
          var r2 = await autoPrintTicket(snapshot);
          if (r2 === true || (r2 && r2.ok)) {
            if (typeof window.showToast === 'function') {
              window.showToast('✅ Impresora reconfigurada y ticket impreso (puerto cambió de ' + (repair.old_port || '?') + ' a ' + (repair.new_port || '?') + ')', 'success', 5000);
            }
            return r2;
          }
        }
      } catch (e) { log('Repair exception:', e); }
    }

    // Aún falla — verificar status real para mensaje específico
    var statusError = null;
    if (window.volvixElectron && window.volvixElectron.queryPrinterRealStatus) {
      try {
        var st = await window.volvixElectron.queryPrinterRealStatus();
        if (st && st.ok) {
          if (st.paperOut) statusError = 'NO_PAPER';
          else if (st.coverOpen) statusError = 'COVER_OPEN';
          else if (st.offline) statusError = 'PRINTER_OFF';
        }
      } catch (e) { log('Status query failed:', e); }
    }

    // Mostrar modal rojo grande con auto-reintento disponible
    if (window.VolvixPrinterErrors && window.VolvixPrinterErrors.handlePrintResult) {
      var displayResult = {
        ok: false,
        error: errorMsg,
        method: (r1 && r1.method) || 'print',
        statusByte: statusError
      };
      // Force el tipo si vino del status query
      if (statusError) {
        window.VolvixPrinterErrors.showErrorModal(statusError, {
          ctx: errorMsg,
          retry: async () => await autoPrintTicket(snapshot)
        });
      } else {
        window.VolvixPrinterErrors.handlePrintResult(displayResult, {
          retry: async () => await autoPrintTicket(snapshot)
        });
      }
    } else if (typeof window.showToast === 'function') {
      window.showToast('⚠ Error al imprimir: ' + errorMsg, 'error', 6000);
    }
    return r1;
  }

  // Post-success cleanup — replica el path final del completePay legacy SIN llamarlo
  // de nuevo (evita double-write a /api/sales). Fix S-1.
  function postSuccessCleanup(cobroResult) {
    try {
      var saleId = cobroResult && cobroResult.sale_id;
      var saleNum = cobroResult && cobroResult.sale_number;
      // 2026-05-14: AUTO-IMPRIMIR ticket sin que el adulto mayor haga nada.
      // 2026-05-15: con error handling completo + auto-repair USB.
      if (typeof window.volvixElectron !== 'undefined') {
        autoPrintTicketWithErrorHandling(cobroResult)
          .catch(function (e) { console.warn('[vlx-cobro] autoPrint failed silently', e); });
      }
      if (typeof window.showToast === 'function') {
        window.showToast('✓ Venta ' + (saleNum || saleId || '') + ' guardada');
      }
      if (typeof window.closeModal === 'function') window.closeModal('modal-pay');
      // GAP-2 — broadcast cart-checkout-done para otras pestañas
      try {
        if (typeof VOLVIX_CART_CHANNEL !== 'undefined' && VOLVIX_CART_CHANNEL) {
          VOLVIX_CART_CHANNEL.postMessage({ type: 'cart-checkout-done', token: (typeof __volvixGetOrCreateCartToken === 'function' ? __volvixGetOrCreateCartToken() : null), ts: Date.now() });
        }
      } catch (_) {}
      if (typeof window.__volvixResetCartToken === 'function') window.__volvixResetCartToken();
      if (Array.isArray(window.CART)) window.CART.length = 0;
      if (typeof window.renderCart === 'function') window.renderCart();
      // R8a/R8b — limpiar draft + notificar al server
      try { if (typeof window.__r8aClearCartDraft === 'function') window.__r8aClearCartDraft(); } catch (_) {}
      try {
        if (typeof window.__r8bAuthFetch === 'function') {
          window.__r8bAuthFetch('/api/cart/draft/clear', {
            method: 'POST', body: JSON.stringify({ reason: 'sale_completed' })
          }).catch(function () {});
        }
      } catch (_) {}
      // Reset footers
      var fp = document.getElementById('footer-pago'); if (fp) fp.textContent = '$0.00';
      var fc = document.getElementById('footer-cambio'); if (fc) fc.textContent = '$0.00';
      // Incrementar folio
      var cf = document.getElementById('currentFolio');
      var pf = document.getElementById('pay-folio');
      if (cf) {
        var newF = (parseInt(cf.textContent, 10) || 0) + 1;
        cf.textContent = String(newF);
        if (pf) pf.textContent = String(newF);
      }
    } catch (e) {
      console.error('[vlx-cobro] postSuccessCleanup error:', e);
    } finally {
      window.__volvixSaleInFlight = false;
      window.__volvixPayVerified = false;
      window.__volvixPayVerification = null;
    }
  }

  function setupCompletePayWrapper() {
    var origComplete = window.completePay;
    if (typeof origComplete !== 'function') {
      console.warn('[vlx-cobro] completePay no existe al momento del wrap — fallback al legacy más tarde');
      return;
    }

    window.completePay = async function () {
      // Fix S-1: anti double-submit global (también protege el flujo nuevo)
      if (window.__volvixSaleInFlight) { console.warn('[vlx-cobro] sale in flight, ignored'); return; }

      // Verificación bancaria humana — mantener guard legacy
      var method = window.__volvixSelectedPayMethod || 'efectivo';
      var needsBankVerify = (method === 'transferencia' || method === 'spei' || method === 'oxxo');
      if (needsBankVerify && !window.__volvixPayVerified) {
        if (typeof window.__vlxOpenPayVerifyModal === 'function') {
          window.__vlxOpenPayVerifyModal(method, parseCur($('#pay-total') && $('#pay-total').textContent || '0'));
        }
        return;
      }

      var total = parseCur($('#pay-total') && $('#pay-total').textContent || '0');

      // Fix S-2: subtotal sanity check antes de cualquier cosa
      if (!subtotalCache || subtotalCache <= 0) {
        // Recalcular desde CART para no depender del setTimeout 100ms del openPayment wrap
        if (Array.isArray(window.CART) && window.CART.length > 0) {
          subtotalCache = window.CART.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
        }
      }
      if (!subtotalCache || subtotalCache <= 0 || total <= 0) {
        alert('No se puede cobrar: subtotal/total = 0. Verifica el carrito.');
        return;
      }

      // 1) Construir payments array
      var payments = [];
      if (method === 'mixto') {
        payments = getMixtoRows().filter(function (r) { return r.amount > 0; }).map(function (r) {
          return { method: r.method, amount: r.amount, details: { reference: r.reference } };
        });
        if (payments.length === 0) { alert('Mixto requiere al menos 1 método con monto > 0'); return; }
      } else {
        var recibido = parseCur($('#pay-recibido') && $('#pay-recibido').value || '0');
        var methodMap = {
          'efectivo': 'EFECTIVO', 'tarjeta': 'TARJETA_CREDITO', 'tarjeta_debito': 'TARJETA_DEBITO',
          'tarjeta_credito': 'TARJETA_CREDITO', 'transferencia': 'SPEI', 'spei': 'SPEI',
          'codi': 'CODI', 'mercado_pago': 'MERCADO_PAGO', 'vale_despensa': 'VALE_DESPENSA',
          'monedero_electronico': 'MONEDERO_ELECTRONICO', 'usd_efectivo': 'USD_EFECTIVO',
          'credito_cliente': 'CREDITO_CLIENTE'
        };
        var enumMethod = methodMap[method] || 'EFECTIVO';
        var paymentAmount = recibido > 0 ? Math.min(recibido, total) : total;
        var details = {};
        if (enumMethod === 'USD_EFECTIVO' && window.__vlxUsdAmount) {
          details.usd_amount = window.__vlxUsdAmount;
          details.usd_rate = window.__vlxUsdRate;
        }
        payments.push({ method: enumMethod, amount: paymentAmount, details: details });
      }

      // 2) Construir CFDI
      var cfdi = null;
      if ($('#vlx-cfdi-enabled') && $('#vlx-cfdi-enabled').checked) {
        if (!window.__vlxValidateCfdi()) { alert('Datos CFDI incompletos o inválidos'); return; }
        cfdi = {
          rfc: ($('#vlx-cfdi-rfc') && $('#vlx-cfdi-rfc').value || '').toUpperCase().trim(),
          razon_social: sanitizeFreeText($('#vlx-cfdi-razon') && $('#vlx-cfdi-razon').value || ''),
          codigo_postal: ($('#vlx-cfdi-cp') && $('#vlx-cfdi-cp').value || '').trim(),
          regimen_fiscal: $('#vlx-cfdi-regimen') && $('#vlx-cfdi-regimen').value,
          uso_cfdi: $('#vlx-cfdi-uso') && $('#vlx-cfdi-uso').value || 'G03',
          metodo_pago: $('#vlx-cfdi-metodo') && $('#vlx-cfdi-metodo').value || 'PUE',
          email_facturacion: ($('#vlx-cfdi-email') && $('#vlx-cfdi-email').value || '').trim(),
          forma_pago: payments.length > 1 ? '99' : (window.VolvixCobro && window.VolvixCobro.satCatalogs ? window.VolvixCobro.satCatalogs.mapMethodToFormaPago(payments[0].method) : '01')
        };
      }

      // 3) UI lock — disable button + show processing
      var payBtn = document.getElementById('modal-pay-confirm');
      var origText = payBtn && (payBtn.dataset.originalText || payBtn.textContent);
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.dataset.originalText = origText;
        payBtn.textContent = 'Procesando…';
      }
      window.__volvixSaleInFlight = true;

      try {
        var session = (function(){ try { return JSON.parse(localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession') || 'null'); } catch(_){ return null; } })();
        var token = getAuthToken();
        var folio = ($('#currentFolio') && $('#currentFolio').textContent) || '';
        var ticketNum = 'TKT-' + folio;
        var items = (window.CART || []).map(function (i) {
          return { id: i.id, code: i.code, name: i.name, price: i.price, qty: i.qty };
        });

        var payload = {
          tenant_id: session && session.tenant_id || null,
          customer_id: window.__volvixSelectedCustomerId || null,
          ticket_number: ticketNum,
          subtotal: subtotalCache,
          items: items,
          payments: payments,
          cfdi: cfdi,
          tip: { amount: window.__vlxTipAmount || 0, percent: window.__vlxTipPercent },
          discount: { amount: window.__vlxDiscountAmount || 0, reason: $('#vlx-discount-reason') && $('#vlx-discount-reason').value || null },
          rounding: { amount: window.__vlxRoundingAmount || 0, destination: null },
          delivery: { method: window.__vlxDeliveryMethod || 'PRINT', target: ($('#vlx-delivery-target') && $('#vlx-delivery-target').value || null) },
          notes: sanitizeFreeText($('#vlx-notes-text') && $('#vlx-notes-text').value || ''),
          total: total
        };
        // Fix SEC-3: Idempotency-Key determinista
        var idemKey = await deterministicIdemKey(payload);

        var resp = await fetch('/api/cobro', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idemKey,
            Authorization: token ? ('Bearer ' + token) : ''
          },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          var data = await resp.json();
          log('/api/cobro OK:', data);
          window.__vlxLastCobroResult = data;
          // Fix S-1: cleanup manual, NO llamar origComplete (que dispararía /api/sales)
          postSuccessCleanup(data);
          return;
        } else if (resp.status === 404) {
          // Endpoint no desplegado → fallback al legacy (debe ser único path que llame /api/sales)
          log('FALLBACK to /api/sales (endpoint /api/cobro not deployed)');
          return origComplete.apply(this, arguments);
        } else if (resp.status === 409) {
          // Duplicate (idempotency caught it) → tratarlo como éxito silencioso
          try { var dupData = await resp.json(); postSuccessCleanup(dupData); }
          catch (_) { postSuccessCleanup({}); }
          return;
        } else {
          var errBody = await resp.text();
          console.error('[vlx-cobro] /api/cobro failed:', resp.status, errBody);
          alert('Error al guardar el cobro (' + resp.status + '). Reintenta o llama a soporte.');
          window.__volvixSaleInFlight = false;
          if (payBtn) { payBtn.disabled = false; payBtn.textContent = origText || '✓ F12 - Completar cobro'; }
          return;
        }
      } catch (e) {
        console.error('[vlx-cobro] /api/cobro exception:', e);
        // Fix S-4: NO caer al legacy en caso de red (legacy tiene su propia cola offline
        // que escribiría una segunda venta). Mostrar error y permitir reintento manual.
        alert('Sin conexión. Verifica internet e intenta de nuevo. (El cobro NO se duplicará.)');
        window.__volvixSaleInFlight = false;
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = origText || '✓ F12 - Completar cobro'; }
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
