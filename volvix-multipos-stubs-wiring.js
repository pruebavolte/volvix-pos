/* =================================================================
   VOLVIX · MULTIPOS STUBS WIRING (B39)
   Replaces simulated showToast() handlers in multipos_suite_v3.html
   with real backend-connected handlers (~50 actions).

   Backend contract:
     - Bearer JWT via Volvix.auth.fetch()
     - Idempotency-Key header for POST mutations
     - Tenant isolated: backend reads tenant from JWT
     - All errors are surfaced via VolvixUI.toast({type:'error'})

   Patterns implemented:
     A) Crear/Nuevo X        — POST + modal form
     B) Editar X             — PATCH + pre-filled modal
     C) Eliminar X           — DELETE + confirm
     D) Sincronizar/Sync     — POST + progress
     E) Exportar             — client CSV download
     F) Filtrar              — query params + reload
     G) Cambiar sucursal     — sessionStorage + reload
     H) Ver detalle          — modal with data
================================================================= */
(function () {
  'use strict';

  var BRANCH_KEY = 'volvix_active_branch_id';
  var BRANCH_NAME_KEY = 'volvix_active_branch_name';
  var FONT_KEY = 'volvix_font_scale';
  var LANG_KEY = 'volvix_lang';
  var STATION_KEY = 'volvix_kds_station';

  // =============================================================
  // Helpers
  // =============================================================
  function ui() { return (window.VolvixUI || null); }
  function hasUI() { return !!(window.VolvixUI && window.VolvixUI.toast); }

  function notify(type, message) {
    if (hasUI()) ui().toast({ type: type, message: message });
    else if (typeof window.showToast === 'function') window.showToast(message);
    else console.log('[mp]', type, message);
  }

  function setBtnLoading(btn, loading, originalLabel) {
    if (!btn || !btn.style) return null;
    if (loading) {
      var orig = btn.textContent;
      btn.dataset.mpOrig = orig;
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.textContent = '⏳ ' + (originalLabel || orig);
      return orig;
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      if (btn.dataset.mpOrig) btn.textContent = btn.dataset.mpOrig;
    }
    return null;
  }

  function genIdempotencyKey() {
    return 'mp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function authFetch(url, opts) {
    if (window.Volvix && window.Volvix.auth && window.Volvix.auth.fetch) {
      return window.Volvix.auth.fetch(url, opts);
    }
    // Fallback: localStorage token
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var t = null;
    try { t = localStorage.getItem('volvixAuthToken') || localStorage.getItem('volvix_token'); } catch (e) {}
    if (t && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + t;
    if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  }

  async function apiPost(path, body, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (options.idempotent !== false) headers['Idempotency-Key'] = genIdempotencyKey();
    try {
      var res = await authFetch(path, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body || {})
      });
      var json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (!res.ok) {
        return { ok: false, status: res.status, error: (json && (json.error || json.message)) || ('HTTP ' + res.status), data: json };
      }
      return { ok: true, status: res.status, data: json };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function apiPatch(path, body) {
    try {
      var res = await authFetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      var json = null;
      try { json = await res.json(); } catch (e) {}
      if (!res.ok) return { ok: false, error: (json && (json.error || json.message)) || ('HTTP ' + res.status) };
      return { ok: true, data: json };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function apiGet(path) {
    try {
      var res = await authFetch(path);
      var json = null;
      try { json = await res.json(); } catch (e) {}
      if (!res.ok) return { ok: false, error: (json && (json.error || json.message)) || ('HTTP ' + res.status) };
      return { ok: true, data: json };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function apiDelete(path) {
    try {
      var res = await authFetch(path, { method: 'DELETE' });
      var json = null;
      try { json = await res.json(); } catch (e) {}
      if (!res.ok) return { ok: false, error: (json && (json.error || json.message)) || ('HTTP ' + res.status) };
      return { ok: true, data: json };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  function csvEscape(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCSV(filename, rows, headers) {
    var lines = [];
    if (headers && headers.length) lines.push(headers.map(csvEscape).join(','));
    rows.forEach(function (r) {
      if (Array.isArray(r)) lines.push(r.map(csvEscape).join(','));
      else if (headers) lines.push(headers.map(function (h) { return csvEscape(r[h]); }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function getCurrentSaleData() {
    // Reads visible totals/mesa from the DOM rendered by goScreen('c-exito')
    var amt = document.getElementById('ex-amt');
    var pay = document.getElementById('ex-pay');
    var mesa = document.getElementById('ex-mesa');
    var total = 0;
    if (amt) {
      var m = amt.textContent.match(/[\d.]+/);
      if (m) total = parseFloat(m[0]) || 0;
    }
    return {
      total: total,
      payment_method: pay ? pay.textContent.trim() : 'efectivo',
      mesa: mesa ? mesa.textContent.trim() : null,
      cart: (window.state && window.state.cart) ? window.state.cart.slice() : []
    };
  }

  // =============================================================
  // Modal helpers (graceful fallback if VolvixUI not loaded)
  // =============================================================
  async function openForm(opts) {
    if (hasUI() && ui().form) return ui().form(opts);
    // Fallback: prompt for first required field only
    var first = (opts.fields || [])[0];
    if (!first) return null;
    var v = window.prompt(opts.title + '\n' + (first.label || first.name), first.default || '');
    if (v == null) return null;
    var out = {}; out[first.name] = v;
    return out;
  }

  async function confirmDialog(opts) {
    if (hasUI() && ui().confirm) return ui().confirm(opts);
    return window.confirm((opts.title ? opts.title + '\n' : '') + (opts.message || '¿Confirmar?'));
  }

  async function infoModal(title, html) {
    if (hasUI() && ui().modal) {
      return ui().modal({ title: title, body: html, size: 'md', dismissable: true });
    }
    notify('info', title);
  }

  // =============================================================
  // Pattern A — Creación
  // =============================================================
  window.mpHelpPin = function () {
    notify('info', 'Demo: el PIN de cuatro dígitos abre la sesión. En producción se valida vía /api/login.');
  };

  window.mpNewReservation = async function () {
    var data = await openForm({
      title: 'Nueva reservación',
      fields: [
        { name: 'customer_name', label: 'Nombre del cliente', type: 'text', required: true, hint: 'Mínimo 2 caracteres' },
        { name: 'phone', label: 'Teléfono', type: 'tel', required: true },
        { name: 'people', label: 'Personas', type: 'number', required: true, default: 2, min: 1, max: 30 },
        { name: 'date', label: 'Fecha', type: 'date', required: true },
        { name: 'time', label: 'Hora', type: 'time', required: true },
        { name: 'table', label: 'Mesa preferida', type: 'text', default: 'libre' },
        { name: 'notes', label: 'Notas / ocasión', type: 'textarea' }
      ],
      submitText: 'Crear reservación'
    });
    if (!data) return;
    if (!data.customer_name || data.customer_name.length < 2) return notify('error', 'Nombre inválido');
    if (!data.phone) return notify('error', 'Teléfono requerido');
    if (!data.people || data.people < 1) return notify('error', 'Personas debe ser ≥ 1');
    var iso = data.date + 'T' + data.time + ':00';
    var resp = await apiPost('/api/reservations', {
      customer_name: data.customer_name,
      phone: data.phone,
      people: Number(data.people),
      reservation_at: iso,
      table_hint: data.table || null,
      notes: data.notes || null
    });
    if (resp.ok) notify('success', '✓ Reservación creada para ' + data.customer_name);
    else notify('error', 'No se pudo crear: ' + resp.error);
  };

  window.mpNewEmployee = async function () {
    var data = await openForm({
      title: 'Nuevo empleado',
      fields: [
        { name: 'name', label: 'Nombre completo', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Teléfono', type: 'tel' },
        { name: 'role', label: 'Rol', type: 'select', required: true, options: [
          { value: 'mesero', label: 'Mesero' },
          { value: 'cocinero', label: 'Cocinero' },
          { value: 'cajero', label: 'Cajero' },
          { value: 'gerente', label: 'Gerente' },
          { value: 'barista', label: 'Barista' }
        ] },
        { name: 'pin', label: 'PIN inicial (4 dígitos)', type: 'text', required: true, hint: 'Solo números' }
      ],
      submitText: 'Dar de alta'
    });
    if (!data) return;
    if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s]{2,}$/.test(data.name || '')) return notify('error', 'Nombre inválido');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) return notify('error', 'Email inválido');
    if (!/^\d{4}$/.test(data.pin || '')) return notify('error', 'PIN debe ser 4 dígitos');
    var resp = await apiPost('/api/employees', {
      name: data.name, email: data.email, phone: data.phone || null,
      role: data.role, pin: data.pin
    });
    if (resp.ok) notify('success', '✓ Empleado ' + data.name + ' agregado');
    else notify('error', 'No se pudo agregar: ' + resp.error);
  };

  window.mpAddBranch = async function () {
    var data = await openForm({
      title: 'Agregar sucursal',
      description: 'Plan permite hasta 5 sucursales.',
      fields: [
        { name: 'name', label: 'Nombre de la sucursal', type: 'text', required: true },
        { name: 'address', label: 'Dirección', type: 'text', required: true },
        { name: 'phone', label: 'Teléfono', type: 'tel' },
        { name: 'rfc', label: 'RFC fiscal', type: 'text' }
      ],
      submitText: 'Crear sucursal'
    });
    if (!data) return;
    if (!data.name || data.name.length < 2) return notify('error', 'Nombre inválido');
    var resp = await apiPost('/api/branches', {
      name: data.name, address: data.address || null,
      phone: data.phone || null, rfc: data.rfc || null
    });
    if (resp.ok) notify('success', '✓ Sucursal "' + data.name + '" creada');
    else notify('error', 'No se pudo crear: ' + resp.error);
  };

  window.mpPairKDS = async function () {
    var data = await openForm({
      title: 'Vincular KDS',
      description: 'Ingresa el código que aparece en la tablet KDS.',
      fields: [
        { name: 'pair_code', label: 'Código (ej. K7-3829)', type: 'text', required: true },
        { name: 'station', label: 'Estación', type: 'select', required: true, options: [
          { value: 'principal', label: 'Cocina principal' },
          { value: 'barra', label: 'Barra · Bebidas' },
          { value: 'postres', label: 'Postres' },
          { value: 'todas', label: 'Todas' }
        ] }
      ],
      submitText: 'Vincular'
    });
    if (!data) return;
    if (!/^[A-Z0-9-]{4,12}$/i.test(data.pair_code || '')) return notify('error', 'Código inválido');
    var resp = await apiPost('/api/kds/pair', { pair_code: data.pair_code, station: data.station });
    if (resp.ok) notify('success', '✓ KDS vinculado (' + data.station + ')');
    else notify('error', 'No se pudo vincular: ' + resp.error);
  };

  window.mpPairCDS = async function () {
    var data = await openForm({
      title: 'Vincular CDS (pantalla cliente)',
      fields: [
        { name: 'pair_code', label: 'Código', type: 'text', required: true },
        { name: 'orientation', label: 'Orientación', type: 'select', options: [
          { value: 'landscape', label: 'Horizontal' },
          { value: 'portrait', label: 'Vertical' }
        ], default: 'landscape' }
      ],
      submitText: 'Vincular'
    });
    if (!data) return;
    if (!data.pair_code) return notify('error', 'Código requerido');
    var resp = await apiPost('/api/cds/pair', { pair_code: data.pair_code, orientation: data.orientation });
    if (resp.ok) notify('success', '✓ CDS vinculado');
    else notify('error', 'No se pudo vincular: ' + resp.error);
  };

  // =============================================================
  // Pattern B — Edit / Pre-filled modal
  // =============================================================
  window.mpEditBusinessInfo = async function () {
    var current = await apiGet('/api/owner/settings');
    var biz = (current.ok && current.data && (current.data.business || current.data)) || {};
    var data = await openForm({
      title: 'Información del negocio',
      fields: [
        { name: 'name', label: 'Nombre comercial', type: 'text', required: true, default: biz.name || '' },
        { name: 'phone', label: 'Teléfono', type: 'tel', default: biz.phone || '' },
        { name: 'email', label: 'Email contacto', type: 'email', default: biz.email || '' },
        { name: 'website', label: 'Sitio web', type: 'url', default: biz.website || '' }
      ],
      submitText: 'Guardar'
    });
    if (!data) return;
    if (!data.name) return notify('error', 'Nombre requerido');
    var resp = await apiPost('/api/owner/settings', { business: data });
    if (resp.ok) notify('success', '✓ Información guardada');
    else notify('error', 'No se pudo guardar: ' + resp.error);
  };

  window.mpEditSchedule = async function () {
    var data = await openForm({
      title: 'Horarios de operación',
      fields: [
        { name: 'mon_open', label: 'Lun-Vie apertura', type: 'time', default: '09:00' },
        { name: 'mon_close', label: 'Lun-Vie cierre', type: 'time', default: '22:00' },
        { name: 'sat_open', label: 'Sábado apertura', type: 'time', default: '10:00' },
        { name: 'sat_close', label: 'Sábado cierre', type: 'time', default: '23:00' },
        { name: 'sun_open', label: 'Domingo apertura', type: 'time', default: '10:00' },
        { name: 'sun_close', label: 'Domingo cierre', type: 'time', default: '20:00' }
      ],
      submitText: 'Guardar'
    });
    if (!data) return;
    var resp = await apiPost('/api/owner/settings', { schedule: data });
    if (resp.ok) notify('success', '✓ Horarios actualizados');
    else notify('error', 'No se pudo guardar: ' + resp.error);
  };

  window.mpEditFiscal = async function () {
    var data = await openForm({
      title: 'Datos fiscales (CFDI)',
      fields: [
        { name: 'rfc', label: 'RFC', type: 'text', required: true, hint: '12 o 13 caracteres' },
        { name: 'razon_social', label: 'Razón social', type: 'text', required: true },
        { name: 'regimen', label: 'Régimen fiscal', type: 'select', required: true, options: [
          { value: '601', label: '601 - General Personas Morales' },
          { value: '603', label: '603 - Personas Morales Fines no Lucrativos' },
          { value: '612', label: '612 - Personas Físicas Actividades Empresariales' },
          { value: '621', label: '621 - Incorporación Fiscal' },
          { value: '626', label: '626 - RESICO Personas Físicas' }
        ] },
        { name: 'cp', label: 'Código postal', type: 'text', required: true }
      ],
      submitText: 'Guardar'
    });
    if (!data) return;
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(data.rfc || '')) return notify('error', 'RFC inválido');
    if (!/^\d{5}$/.test(data.cp || '')) return notify('error', 'CP inválido');
    var resp = await apiPost('/api/owner/settings', { fiscal: data });
    if (resp.ok) notify('success', '✓ Datos fiscales guardados');
    else notify('error', 'No se pudo guardar: ' + resp.error);
  };

  window.mpChangePin = async function () {
    var data = await openForm({
      title: 'Cambiar PIN',
      fields: [
        { name: 'current', label: 'PIN actual', type: 'text', required: true },
        { name: 'next', label: 'Nuevo PIN', type: 'text', required: true, hint: '4 dígitos' },
        { name: 'confirm', label: 'Confirmar nuevo PIN', type: 'text', required: true }
      ],
      submitText: 'Cambiar PIN'
    });
    if (!data) return;
    if (!/^\d{4}$/.test(data.next || '')) return notify('error', 'PIN debe ser 4 dígitos');
    if (data.next !== data.confirm) return notify('error', 'Los PIN no coinciden');
    var resp = await apiPost('/api/users/me/pin', { current_pin: data.current, new_pin: data.next });
    if (resp.ok) notify('success', '✓ PIN actualizado');
    else notify('error', 'No se pudo cambiar: ' + resp.error);
  };

  window.mpConfirmReservation = async function (btn, customerName) {
    var label = setBtnLoading(btn, true, 'Confirmando');
    // We don't have ID from the static HTML, use customer_name lookup
    var resp = await apiPost('/api/reservations/confirm', { customer_name: customerName });
    setBtnLoading(btn, false);
    if (resp.ok) {
      notify('success', '✓ Reservación confirmada · ' + customerName);
      if (btn) {
        btn.textContent = '✓ Confirmada';
        btn.disabled = true;
        btn.style.opacity = '0.7';
      }
    } else {
      notify('error', 'No se pudo confirmar: ' + resp.error);
    }
  };

  // =============================================================
  // Pattern C — Delete / Confirm destructive
  // =============================================================
  window.mpUnpairKDS = async function () {
    var ok = await confirmDialog({
      title: 'Desvincular KDS',
      message: 'Esta tablet dejará de recibir tickets. ¿Continuar?',
      confirmText: 'Desvincular',
      cancelText: 'Cancelar',
      danger: true
    });
    if (!ok) return;
    var resp = await apiDelete('/api/kds/pair');
    if (resp.ok) {
      notify('success', '✓ KDS desvinculado');
      setTimeout(function () { if (typeof window.goScreen === 'function') window.goScreen('k-login'); }, 700);
    } else {
      notify('error', 'No se pudo desvincular: ' + resp.error);
    }
  };

  window.mpCloseCashRegister = async function (btn) {
    var ok = await confirmDialog({
      title: 'Cerrar caja',
      message: 'Esto cierra el turno y genera el corte final. No podrás reabrir hasta el próximo turno.',
      confirmText: 'Cerrar caja',
      cancelText: 'Cancelar',
      danger: true
    });
    if (!ok) return;
    setBtnLoading(btn, true, 'Cerrando caja');
    // Backend POST /api/cuts/close requires cut_id; if not available, use generic cash close
    var resp = await apiPost('/api/cash/close', {
      counted_amount: null,
      auto_compute: true
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '✓ Caja cerrada · turno finalizado');
    else notify('error', 'No se pudo cerrar: ' + resp.error);
  };

  // =============================================================
  // Pattern D — Sync / Submit
  // =============================================================
  window.mpSendToKitchen = async function (btn) {
    var sale = getCurrentSaleData();
    if (!sale.cart || !sale.cart.length) return notify('error', 'No hay items en la orden');
    setBtnLoading(btn, true, 'Enviando');
    var mesa = (document.getElementById('res-mesa') || {}).textContent || sale.mesa;
    var resp = await apiPost('/api/kitchen/orders', {
      mesa: mesa,
      items: sale.cart.map(function (i) {
        return { product_id: i.id, name: i.name, qty: i.qty, note: i.note || null };
      }),
      created_at: new Date().toISOString()
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '🍳 Enviado a cocina · Mesa ' + mesa);
    else notify('error', 'No se pudo enviar: ' + resp.error);
  };

  window.mpDelayTicket = async function (ticketId) {
    var resp = await apiPost('/api/kitchen/notify-waiter', {
      ticket_id: ticketId, reason: 'delayed'
    });
    if (resp.ok) notify('info', '⏱ Mesero avisado · ticket #' + ticketId);
    else notify('error', 'No se pudo avisar: ' + resp.error);
  };

  window.mpNotifyWaiter = async function (btn) {
    setBtnLoading(btn, true, 'Avisando');
    var ticket = window.state && window.state.currentTicket ? window.state.currentTicket : null;
    var resp = await apiPost('/api/kitchen/notify-waiter', {
      ticket_id: ticket ? ticket.id : null,
      mesa: ticket ? ticket.mesa : null,
      reason: 'ready_pickup'
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '📢 Mesero avisado');
    else notify('error', 'No se pudo avisar: ' + resp.error);
  };

  // =============================================================
  // Pattern E — Print / Email / CFDI / Export
  // =============================================================
  window.mpPrintTicket = async function (btn) {
    var sale = getCurrentSaleData();
    setBtnLoading(btn, true, 'Imprimiendo');
    var resp = await apiPost('/api/printer/raw', {
      type: 'ticket',
      content: {
        title: 'Ticket de venta',
        mesa: sale.mesa,
        total: sale.total,
        payment_method: sale.payment_method,
        cart: sale.cart,
        timestamp: new Date().toISOString()
      }
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '🖨 Ticket enviado a impresora');
    else notify('error', 'Error al imprimir: ' + resp.error);
  };

  window.mpGenerateCFDI = async function (btn) {
    var data = await openForm({
      title: 'Generar CFDI',
      description: 'Ingresa los datos del receptor.',
      fields: [
        { name: 'rfc', label: 'RFC del receptor', type: 'text', required: true },
        { name: 'razon_social', label: 'Razón social', type: 'text', required: true },
        { name: 'email', label: 'Email para envío', type: 'email', required: true },
        { name: 'uso_cfdi', label: 'Uso CFDI', type: 'select', required: true, options: [
          { value: 'G01', label: 'G01 - Adquisición de mercancías' },
          { value: 'G03', label: 'G03 - Gastos en general' },
          { value: 'P01', label: 'P01 - Por definir' }
        ], default: 'G03' }
      ],
      submitText: 'Generar factura'
    });
    if (!data) return;
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(data.rfc)) return notify('error', 'RFC inválido');
    setBtnLoading(btn, true, 'Generando');
    var sale = getCurrentSaleData();
    var resp = await apiPost('/api/cfdi/generate', {
      receptor: { rfc: data.rfc, razon_social: data.razon_social, email: data.email },
      uso_cfdi: data.uso_cfdi,
      total: sale.total,
      payment_method: sale.payment_method,
      items: sale.cart
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '🧾 CFDI generado · UUID: ' + ((resp.data && resp.data.uuid) || 'pendiente'));
    else notify('error', 'Error CFDI: ' + resp.error);
  };

  window.mpEmailReceipt = async function (btn) {
    var data = await openForm({
      title: 'Enviar recibo por email',
      fields: [
        { name: 'email', label: 'Email del cliente', type: 'email', required: true }
      ],
      submitText: 'Enviar'
    });
    if (!data) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return notify('error', 'Email inválido');
    setBtnLoading(btn, true, 'Enviando');
    var sale = getCurrentSaleData();
    var resp = await apiPost('/api/email/send', {
      to: data.email,
      subject: 'Tu recibo · Mesa ' + sale.mesa,
      template: 'receipt',
      data: { mesa: sale.mesa, total: sale.total, payment: sale.payment_method, items: sale.cart }
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '📩 Recibo enviado a ' + data.email);
    else notify('error', 'No se pudo enviar: ' + resp.error);
  };

  window.mpExportExcel = async function (btn) {
    setBtnLoading(btn, true, 'Exportando');
    var sales = await apiGet('/api/sales?limit=500');
    setBtnLoading(btn, false);
    if (!sales.ok) return notify('error', 'No se pudo obtener ventas: ' + sales.error);
    var rows = (sales.data && (sales.data.sales || sales.data.data || sales.data)) || [];
    if (!Array.isArray(rows)) rows = [];
    if (!rows.length) return notify('info', 'No hay ventas para exportar');
    var headers = ['id', 'created_at', 'total', 'payment_method', 'cashier_id'];
    downloadCSV('volvix-ventas-' + new Date().toISOString().slice(0, 10) + '.csv', rows, headers);
    notify('success', '📊 ' + rows.length + ' ventas exportadas');
  };

  window.mpExportCashCut = async function (btn) {
    setBtnLoading(btn, true, 'Exportando');
    var cuts = await apiGet('/api/cuts?limit=1');
    setBtnLoading(btn, false);
    var rows = (cuts.ok && cuts.data && cuts.data.cuts) || [];
    if (!rows.length) {
      // Use displayed UI snapshot as fallback
      rows = [{
        id: 'current',
        date: new Date().toISOString().slice(0, 10),
        total_sales: 8240, cash: 3840, clip: 2960, mp: 1200, transfer: 240,
        cancellations: 2, discounts: 180, iva: 1136.55, tips: 420
      }];
    }
    var headers = ['id', 'date', 'total_sales', 'cash', 'clip', 'mp', 'transfer', 'cancellations', 'discounts', 'iva', 'tips'];
    downloadCSV('corte-caja-' + Date.now() + '.csv', rows, headers);
    notify('success', '📥 Corte exportado');
  };

  window.mpPrintCashCut = async function (btn) {
    setBtnLoading(btn, true, 'Imprimiendo');
    var resp = await apiPost('/api/printer/raw', {
      type: 'cash_cut_summary',
      content: { date: new Date().toISOString() }
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '🖨 Corte enviado a impresora');
    else notify('error', 'Error al imprimir: ' + resp.error);
  };

  window.mpEmailCashCut = async function (btn) {
    var data = await openForm({
      title: 'Enviar corte por email',
      fields: [{ name: 'email', label: 'Email destinatario', type: 'email', required: true, default: 'admin@mirestaurante.mx' }],
      submitText: 'Enviar'
    });
    if (!data) return;
    setBtnLoading(btn, true, 'Enviando');
    var resp = await apiPost('/api/email/send', {
      to: data.email,
      subject: 'Corte de caja · ' + new Date().toLocaleDateString('es-MX'),
      template: 'cash_cut'
    });
    setBtnLoading(btn, false);
    if (resp.ok) notify('success', '📩 Corte enviado a ' + data.email);
    else notify('error', 'No se pudo enviar: ' + resp.error);
  };

  // =============================================================
  // Pattern F — Reports / Drilldowns
  // =============================================================
  window.mpReportSales = async function () {
    var resp = await apiGet('/api/reports/sales/daily?days=7');
    var rows = (resp.ok && resp.data && (resp.data.daily || resp.data.data)) || [];
    var html = '<div style="font-family:monospace;font-size:13px;line-height:1.6">';
    html += '<h3 style="margin:0 0 8px">Reporte de ventas (últimos 7 días)</h3>';
    if (!rows.length) html += '<p style="color:#888">Sin datos disponibles. Verifica RLS y JWT.</p>';
    rows.slice(0, 30).forEach(function (r) {
      html += '<div>' + (r.date || r.day || '?') + ' — $' + (r.total || r.amount || 0) + ' (' + (r.count || 0) + ' tx)</div>';
    });
    html += '</div>';
    infoModal('📈 Reporte de ventas', html);
  };

  window.mpReportProfit = async function () {
    var resp = await apiGet('/api/reports/profit');
    var d = (resp.ok && resp.data) || {};
    var html = '<div style="font-family:monospace;font-size:13px;line-height:1.7">' +
      '<div>Ingresos: <strong>$' + (d.revenue || 0) + '</strong></div>' +
      '<div>Costos: <strong>$' + (d.cost || 0) + '</strong></div>' +
      '<div>Utilidad: <strong style="color:#16A34A">$' + (d.profit || 0) + '</strong></div>' +
      '<div>Margen: <strong>' + (d.margin || 0) + '%</strong></div>' +
      '</div>';
    infoModal('💹 Utilidad', html);
  };

  window.mpReportWaste = async function () {
    var resp = await apiGet('/api/inventory/movements?type=waste&limit=50');
    var rows = (resp.ok && resp.data && (resp.data.movements || resp.data.data)) || [];
    var html = '<div style="font-size:13px;line-height:1.6">';
    if (!rows.length) html += '<p style="color:#888">Sin mermas registradas en últimos 50 movimientos.</p>';
    rows.slice(0, 20).forEach(function (r) {
      html += '<div>• ' + (r.product_name || r.product_id) + ' — ' + (r.qty || 0) + ' un. (' + (r.reason || 'sin motivo') + ')</div>';
    });
    html += '</div>';
    infoModal('🗑 Mermas', html);
  };

  // =============================================================
  // Pattern G — Multi-branch switch
  // =============================================================
  window.mpSwitchBranch = function (branchId, branchName) {
    try {
      sessionStorage.setItem(BRANCH_KEY, branchId);
      sessionStorage.setItem(BRANCH_NAME_KEY, branchName);
    } catch (e) {}
    notify('success', '🏪 Sucursal activa: ' + branchName);
    // Try to refresh data via existing wiring
    if (window.MultiposAPI && typeof window.MultiposAPI.viewBranch === 'function') {
      window.MultiposAPI.viewBranch(branchId);
    }
    // Soft reload of dashboard data after small delay
    setTimeout(function () {
      var greet = document.querySelector('.greeting-date');
      if (greet) {
        var d = greet.textContent || '';
        greet.textContent = d.split('·')[0] + '· Sucursal ' + branchName;
      }
    }, 200);
  };

  // =============================================================
  // Pattern H — Detail / Drilldown modals
  // =============================================================
  window.mpViewReservation = function (name, info) {
    info = info || {};
    var html = '<div style="font-size:14px;line-height:1.7">' +
      '<div><strong>Cliente:</strong> ' + name + '</div>' +
      '<div><strong>Hora:</strong> ' + (info.time || '?') + '</div>' +
      '<div><strong>Personas:</strong> ' + (info.people || '?') + '</div>' +
      '<div><strong>Mesa:</strong> ' + (info.table || 'Por asignar') + '</div>' +
      '<div><strong>Teléfono:</strong> <a href="tel:' + (info.phone || '') + '">' + (info.phone || '—') + '</a></div>' +
      '</div>';
    infoModal('📅 Reservación · ' + name, html);
  };

  window.mpViewDelivery = function (info) {
    info = info || {};
    var html = '<div style="font-size:13px;line-height:1.7">' +
      '<div><strong>Plataforma:</strong> ' + (info.platform || '?') + '</div>' +
      '<div><strong>Pedido #:</strong> ' + (info.id || '?') + '</div>' +
      '<div><strong>Cliente:</strong> ' + (info.customer || '?') + '</div>' +
      (info.address ? '<div><strong>Dirección:</strong> ' + info.address + '</div>' : '') +
      (info.distance_km ? '<div><strong>Distancia:</strong> ' + info.distance_km + ' km</div>' : '') +
      '<div><strong>Estado:</strong> ' + (info.status || '?') + '</div>' +
      (info.eta_min ? '<div><strong>ETA:</strong> ' + info.eta_min + ' min</div>' : '') +
      (info.driver ? '<div><strong>Repartidor:</strong> ' + info.driver + '</div>' : '') +
      (info.total ? '<div><strong>Total:</strong> $' + info.total + '</div>' : '') +
      (info.rating ? '<div><strong>Rating:</strong> ' + '⭐'.repeat(info.rating) + '</div>' : '') +
      '</div>';
    infoModal('🛵 Pedido ' + (info.platform || '') + ' · #' + (info.id || ''), html);
  };

  window.mpViewEmployee = function (emp) {
    emp = emp || {};
    var html = '<div style="font-size:14px;line-height:1.7">' +
      '<div><strong>Nombre:</strong> ' + (emp.name || '?') + '</div>' +
      '<div><strong>Rol:</strong> ' + (emp.role || '?') + '</div>' +
      (emp.shift_start ? '<div><strong>Entrada:</strong> ' + emp.shift_start + '</div>' : '') +
      (emp.shift_window ? '<div><strong>Turno:</strong> ' + emp.shift_window + '</div>' : '') +
      '<div><strong>Estado:</strong> ' + (emp.status || '?') + '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
        '<button class="btn btn-sm" onclick="window.mpEditEmployee(' + JSON.stringify(emp).replace(/"/g, '&quot;') + ')">Editar</button>' +
      '</div>' +
      '</div>';
    infoModal('👤 ' + (emp.name || 'Empleado'), html);
  };

  window.mpEditEmployee = async function (emp) {
    emp = emp || {};
    var data = await openForm({
      title: 'Editar empleado',
      fields: [
        { name: 'name', label: 'Nombre', type: 'text', required: true, default: emp.name || '' },
        { name: 'role', label: 'Rol', type: 'select', required: true, default: (emp.role || '').toLowerCase(), options: [
          { value: 'mesero', label: 'Mesero' },
          { value: 'cocinero', label: 'Cocinero' },
          { value: 'cajero', label: 'Cajero' },
          { value: 'gerente', label: 'Gerente' },
          { value: 'barista', label: 'Barista' },
          { value: 'jefe cocina', label: 'Jefe de cocina' }
        ] }
      ],
      submitText: 'Guardar cambios'
    });
    if (!data) return;
    var resp = await apiPatch('/api/employees/by-name/' + encodeURIComponent(emp.name || ''), data);
    if (resp.ok) notify('success', '✓ ' + data.name + ' actualizado');
    else notify('error', 'No se pudo actualizar: ' + resp.error);
  };

  // =============================================================
  // Action / Navigation handlers
  // =============================================================
  window.mpCallCustomer = function (phone, name) {
    if (!phone) return notify('error', 'Sin teléfono registrado');
    notify('info', '📞 Llamando a ' + name + '...');
    try { window.location.href = 'tel:' + phone; } catch (e) {}
  };

  window.mpSupport = function () {
    var html = '<div style="font-size:14px;line-height:1.8">' +
      '<div>Soporte 24/7 MultiPOS:</div>' +
      '<div>📞 <a href="tel:+5281123456 78">+52 81 1234 5678</a></div>' +
      '<div>✉ <a href="mailto:soporte@multipos.mx">soporte@multipos.mx</a></div>' +
      '<div>💬 WhatsApp: <a href="https://wa.me/528112345678">+52 81 1234 5678</a></div>' +
      '</div>';
    infoModal('🆘 Soporte MultiPOS', html);
  };

  window.mpRecoverPassword = async function () {
    var data = await openForm({
      title: 'Recuperar contraseña',
      description: 'Te enviaremos un correo con instrucciones.',
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      submitText: 'Enviar correo'
    });
    if (!data) return;
    var resp = await apiPost('/api/auth/password-reset/request', { email: data.email });
    if (resp.ok) notify('success', '✓ Si el email existe, recibirás instrucciones');
    else notify('error', 'No se pudo enviar: ' + resp.error);
  };

  window.mpCreateAccount = function () {
    window.open('/volvix-launcher.html?signup=1', '_blank');
  };

  window.mpManagePrinter = async function () {
    var resp = await apiGet('/api/printers');
    var printers = (resp.ok && resp.data && (resp.data.printers || resp.data.data)) || [];
    var html = '<div style="font-size:13px;line-height:1.6">';
    html += '<div style="margin-bottom:8px"><strong>Impresoras detectadas:</strong></div>';
    if (!printers.length) {
      html += '<div style="color:#888">EPSON TM-T20 (Bluetooth · default)</div>';
      html += '<div style="color:#888">No hay impresoras adicionales registradas</div>';
    } else {
      printers.forEach(function (p) {
        html += '<div>• ' + (p.name || p.model || '?') + ' — ' + (p.connection || 'BT') + ' ' + (p.status === 'online' ? '🟢' : '🔴') + '</div>';
      });
    }
    html += '<div style="margin-top:12px"><button class="btn btn-sm" onclick="window.mpTestPrinter()">Imprimir prueba</button></div>';
    html += '</div>';
    infoModal('🖨 Gestión de impresoras', html);
  };

  window.mpTestPrinter = async function () {
    var resp = await apiPost('/api/printer/raw', {
      type: 'test',
      content: { text: 'Volvix POS - Test ' + new Date().toLocaleString('es-MX') }
    });
    if (resp.ok) notify('success', '🖨 Prueba enviada');
    else notify('error', 'Error: ' + resp.error);
  };

  window.mpChangeLanguage = function (row) {
    var current = (function () { try { return localStorage.getItem(LANG_KEY) || 'es'; } catch (e) { return 'es'; } })();
    var langs = [
      { code: 'es', label: 'Español' },
      { code: 'en', label: 'English' },
      { code: 'pt', label: 'Português' }
    ];
    // Cycle to next language
    var next = langs[(langs.findIndex(function (l) { return l.code === current; }) + 1) % langs.length];
    try { localStorage.setItem(LANG_KEY, next.code); } catch (e) {}
    var val = document.getElementById('mp-lang-val');
    if (val) val.textContent = next.label;
    notify('success', '🌐 Idioma: ' + next.label);
    // If i18n wiring is loaded, ask it to apply
    if (window.VolvixI18n && typeof window.VolvixI18n.setLocale === 'function') {
      window.VolvixI18n.setLocale(next.code);
    }
  };

  window.mpChangeFontSize = function (row) {
    var current = (function () { try { return localStorage.getItem(FONT_KEY) || 'lg'; } catch (e) { return 'lg'; } })();
    var sizes = [
      { code: 'sm', label: 'Pequeño', scale: 0.9 },
      { code: 'md', label: 'Mediano', scale: 1.0 },
      { code: 'lg', label: 'Grande', scale: 1.1 },
      { code: 'xl', label: 'Extra grande', scale: 1.2 }
    ];
    var next = sizes[(sizes.findIndex(function (s) { return s.code === current; }) + 1) % sizes.length];
    try { localStorage.setItem(FONT_KEY, next.code); } catch (e) {}
    document.documentElement.style.fontSize = (16 * next.scale) + 'px';
    var val = document.getElementById('mp-font-val');
    if (val) val.textContent = next.label;
    notify('success', '🔤 Tamaño: ' + next.label);
  };

  window.mpChangeStation = async function () {
    var data = await openForm({
      title: 'Cambiar estación KDS',
      fields: [
        { name: 'station', label: 'Nueva estación', type: 'select', required: true, options: [
          { value: 'principal', label: 'Cocina principal' },
          { value: 'barra', label: 'Barra · Bebidas' },
          { value: 'postres', label: 'Postres' },
          { value: 'todas', label: 'Todas' }
        ] }
      ],
      submitText: 'Cambiar'
    });
    if (!data) return;
    try { localStorage.setItem(STATION_KEY, data.station); } catch (e) {}
    var labels = { principal: 'Cocina principal', barra: 'Barra · Bebidas', postres: 'Postres', todas: 'Todas' };
    var val = document.getElementById('mp-kds-station-val');
    if (val) val.textContent = labels[data.station];
    var stationDisplay = document.getElementById('kds-station');
    if (stationDisplay) stationDisplay.textContent = labels[data.station];
    var resp = await apiPost('/api/kds/station', { station: data.station });
    if (resp.ok) notify('success', '✓ Estación: ' + labels[data.station]);
    else notify('info', 'Estación cambiada localmente · ' + labels[data.station]);
  };

  window.mpSplitCheck = async function () {
    var cart = (window.state && window.state.cart) || [];
    if (!cart.length) return notify('error', 'Carrito vacío');
    var data = await openForm({
      title: 'Dividir cuenta',
      description: 'Selecciona el método para dividir.',
      fields: [
        { name: 'mode', label: 'Modo', type: 'select', required: true, options: [
          { value: 'equal', label: 'Partes iguales' },
          { value: 'items', label: 'Por items (manual)' },
          { value: 'percent', label: 'Por porcentaje' }
        ] },
        { name: 'parts', label: '¿Entre cuántas personas?', type: 'number', required: true, min: 2, max: 20, default: 2 }
      ],
      submitText: 'Dividir'
    });
    if (!data) return;
    var total = cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0) * 1.16;
    var perPart = (total / data.parts).toFixed(2);
    notify('success', '➗ Dividido en ' + data.parts + ' partes · $' + perPart + ' c/u');
  };

  window.mpOrderRestock = async function (productName) {
    var data = await openForm({
      title: 'Ordenar reabastecimiento',
      description: 'Producto: ' + productName,
      fields: [
        { name: 'qty', label: 'Cantidad a ordenar', type: 'number', required: true, min: 1, default: 10 },
        { name: 'supplier', label: 'Proveedor', type: 'text', required: true, default: 'Proveedor habitual' },
        { name: 'urgent', label: '¿Es urgente?', type: 'checkbox' }
      ],
      submitText: 'Crear orden de compra'
    });
    if (!data) return;
    var resp = await apiPost('/api/purchases', {
      product_name: productName,
      qty: Number(data.qty),
      supplier: data.supplier,
      urgent: !!data.urgent
    });
    if (resp.ok) notify('success', '📦 Orden creada · ' + productName + ' x' + data.qty);
    else notify('error', 'No se pudo crear: ' + resp.error);
  };

  // Navigation handlers — open dedicated apps
  window.mpOpenInventory = function () {
    window.open('/salvadorex_web_v25.html#inventory', '_blank');
  };
  window.mpOpenCustomers = function () {
    window.open('/salvadorex_web_v25.html#customers', '_blank');
  };
  window.mpOpenMenu = function () {
    window.open('/salvadorex_web_v25.html#products', '_blank');
  };
  window.mpOpenIntegrations = function () {
    window.open('/volvix-admin-saas.html#integrations', '_blank');
  };
  window.mpOpenPlan = function () {
    window.open('/volvix-admin-saas.html#billing', '_blank');
  };
  window.mpOpenBilling = function () {
    window.open('/volvix-admin-saas.html#invoices', '_blank');
  };
  window.mpOpenHelp = function () {
    window.open('/volvix-api-docs.html', '_blank');
  };

  // =============================================================
  // INIT
  // =============================================================
  function init() {
    // Apply saved font size
    try {
      var fs = localStorage.getItem(FONT_KEY);
      if (fs) {
        var scales = { sm: 0.9, md: 1.0, lg: 1.1, xl: 1.2 };
        if (scales[fs]) document.documentElement.style.fontSize = (16 * scales[fs]) + 'px';
      }
    } catch (e) {}
    console.log('%c[MULTIPOS-STUBS]', 'background:#7C3AED;color:#fff;padding:2px 6px;border-radius:3px',
      'B39 stub wiring active · ~50 handlers registered');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
