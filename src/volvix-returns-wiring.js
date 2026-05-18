/* ============================================================================
 * volvix-returns-wiring.js
 * Volvix POS — Returns / RMA Wiring Module
 * Agent-64 R9 Volvix
 *
 * Sistema integral de devoluciones y RMA:
 *   - Crear devolución a partir de venta original
 *   - Validar venta original (existencia, estado, fecha, política)
 *   - Devoluciones parciales o totales
 *   - Reembolso (efectivo, tarjeta, crédito en tienda) o cambio
 *   - Restock automático (con condición del item)
 *   - Motivo obligatorio + categorías predefinidas
 *   - Autorización de supervisor para casos sensibles
 *
 * Expone: window.ReturnsAPI
 * ============================================================================ */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  const CONFIG = {
    RETURN_WINDOW_DAYS: 30,                  // ventana estándar de devolución
    EXTENDED_WINDOW_DAYS: 60,                // requiere supervisor
    SUPERVISOR_THRESHOLD_AMOUNT: 1000,       // > MXN exige autorización
    SUPERVISOR_REQUIRED_REASONS: ['fraude_sospechoso', 'sin_recibo', 'fuera_de_ventana'],
    REFUND_METHODS: ['efectivo', 'tarjeta', 'credito_tienda', 'transferencia'],
    EXCHANGE_TYPES: ['mismo_producto', 'producto_distinto', 'mixto'],
    ITEM_CONDITIONS: ['nuevo', 'abierto', 'usado', 'danado', 'defectuoso'],
    RESTOCKABLE_CONDITIONS: ['nuevo', 'abierto'],
    REASONS: [
      'defecto_fabrica',
      'producto_equivocado',
      'no_satisfecho',
      'duplicado',
      'precio_incorrecto',
      'danado_envio',
      'fuera_de_ventana',
      'sin_recibo',
      'fraude_sospechoso',
      'otro'
    ],
    STORAGE_KEY: 'volvix_returns_v1',
    SEQ_KEY: 'volvix_returns_seq'
  };

  // ---------------------------------------------------------------------------
  // Estado interno
  // ---------------------------------------------------------------------------
  const state = {
    returns: [],            // historial de devoluciones procesadas
    pending: null,          // borrador de devolución actual
    seq: 1
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function nowISO() { return new Date().toISOString(); }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function nextRMA() {
    const n = state.seq++;
    persistSeq();
    return 'RMA-' + String(n).padStart(6, '0');
  }

  function daysBetween(aISO, bISO) {
    const a = new Date(aISO).getTime();
    const b = new Date(bISO).getTime();
    return Math.floor(Math.abs(b - a) / 86400000);
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function persist() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.returns));
      }
    } catch (e) { console.warn('[Returns] persist fail', e); }
  }

  function persistSeq() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(CONFIG.SEQ_KEY, String(state.seq));
      }
    } catch (e) { /* noop */ }
  }

  function load() {
    try {
      if (global.localStorage) {
        const raw = global.localStorage.getItem(CONFIG.STORAGE_KEY);
        if (raw) state.returns = JSON.parse(raw) || [];
        const seq = global.localStorage.getItem(CONFIG.SEQ_KEY);
        if (seq) state.seq = parseInt(seq, 10) || 1;
      }
    } catch (e) { console.warn('[Returns] load fail', e); }
  }

  function emit(event, payload) {
    try {
      if (global.dispatchEvent) {
        global.dispatchEvent(new CustomEvent('volvix:returns:' + event, { detail: payload }));
      }
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------------
  // Resolución de venta original
  // ---------------------------------------------------------------------------
  function resolveSale(saleId) {
    // Intenta varios proveedores conocidos
    if (global.SalesAPI && typeof global.SalesAPI.getSale === 'function') {
      return global.SalesAPI.getSale(saleId);
    }
    if (global.POS && typeof global.POS.getSale === 'function') {
      return global.POS.getSale(saleId);
    }
    if (global.VolvixDB && global.VolvixDB.sales) {
      return global.VolvixDB.sales.find(s => s.id === saleId) || null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Validación de venta
  // ---------------------------------------------------------------------------
  function validateSale(saleId, opts) {
    opts = opts || {};
    const result = { ok: false, sale: null, errors: [], warnings: [], requiresSupervisor: false };

    if (!saleId) {
      result.errors.push('saleId requerido');
      return result;
    }

    const sale = resolveSale(saleId);
    if (!sale) {
      result.errors.push('Venta original no encontrada: ' + saleId);
      return result;
    }
    result.sale = sale;

    if (sale.status === 'cancelled' || sale.status === 'voided') {
      result.errors.push('Venta cancelada/anulada, no es elegible');
      return result;
    }
    if (sale.status === 'refunded_full') {
      result.errors.push('Venta ya reembolsada completamente');
      return result;
    }

    const days = daysBetween(sale.date || sale.createdAt || nowISO(), nowISO());
    if (days > CONFIG.EXTENDED_WINDOW_DAYS) {
      result.errors.push('Fuera de ventana extendida (' + days + ' días)');
      return result;
    }
    if (days > CONFIG.RETURN_WINDOW_DAYS) {
      result.warnings.push('Fuera de ventana estándar (' + days + ' días) — requiere supervisor');
      result.requiresSupervisor = true;
    }

    if (!sale.items || !sale.items.length) {
      result.errors.push('Venta sin items');
      return result;
    }

    if (!sale.receipt && !opts.allowNoReceipt) {
      result.warnings.push('Venta sin recibo — requiere supervisor');
      result.requiresSupervisor = true;
    }

    result.ok = result.errors.length === 0;
    return result;
  }

  // ---------------------------------------------------------------------------
  // Crear borrador de devolución
  // ---------------------------------------------------------------------------
  function createReturn(payload) {
    payload = payload || {};
    const validation = validateSale(payload.saleId, { allowNoReceipt: !!payload.allowNoReceipt });
    if (!validation.ok) {
      return { ok: false, errors: validation.errors, warnings: validation.warnings };
    }

    const sale = validation.sale;
    const draft = {
      id: uid('ret'),
      rma: nextRMA(),
      saleId: sale.id,
      cashierId: payload.cashierId || null,
      createdAt: nowISO(),
      status: 'draft',
      items: [],
      reason: null,
      reasonNote: '',
      type: payload.type || 'refund',           // refund | exchange | mixed
      refundMethod: null,
      exchangeItems: [],
      subtotal: 0,
      taxes: 0,
      total: 0,
      requiresSupervisor: validation.requiresSupervisor,
      supervisor: null,
      warnings: validation.warnings.slice(),
      audit: []
    };

    state.pending = draft;
    audit(draft, 'draft_created', { saleId: sale.id });
    emit('draft', draft);
    return { ok: true, draft: draft, sale: sale };
  }

  // ---------------------------------------------------------------------------
  // Agregar item a devolver
  // ---------------------------------------------------------------------------
  function addItem(itemPayload) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (!itemPayload || !itemPayload.sku) return { ok: false, error: 'sku requerido' };

    const sale = resolveSale(draft.saleId);
    const orig = (sale.items || []).find(i => i.sku === itemPayload.sku);
    if (!orig) return { ok: false, error: 'SKU no presente en venta original: ' + itemPayload.sku };

    const alreadyReturned = (orig.returnedQty || 0) +
      draft.items.filter(i => i.sku === itemPayload.sku).reduce((a, b) => a + b.qty, 0);
    const available = (orig.qty || 0) - alreadyReturned;
    const qty = Math.max(0, parseInt(itemPayload.qty || 1, 10));

    if (qty <= 0) return { ok: false, error: 'qty debe ser > 0' };
    if (qty > available) return { ok: false, error: 'qty excede disponible (' + available + ')' };

    const condition = itemPayload.condition || 'nuevo';
    if (CONFIG.ITEM_CONDITIONS.indexOf(condition) === -1) {
      return { ok: false, error: 'Condición inválida: ' + condition };
    }

    const unitPrice = orig.unitPrice != null ? orig.unitPrice : (orig.price || 0);
    const taxRate = orig.taxRate != null ? orig.taxRate : 0.16;
    const lineSubtotal = round2(unitPrice * qty);
    const lineTax = round2(lineSubtotal * taxRate);
    const lineTotal = round2(lineSubtotal + lineTax);

    const item = {
      sku: orig.sku,
      name: orig.name,
      qty: qty,
      unitPrice: unitPrice,
      taxRate: taxRate,
      subtotal: lineSubtotal,
      tax: lineTax,
      total: lineTotal,
      condition: condition,
      restockable: CONFIG.RESTOCKABLE_CONDITIONS.indexOf(condition) !== -1,
      note: itemPayload.note || ''
    };

    draft.items.push(item);
    recalcTotals(draft);
    flagSupervisorIfNeeded(draft);
    audit(draft, 'item_added', { sku: item.sku, qty: item.qty });
    emit('item_added', { draft: draft, item: item });
    return { ok: true, item: item, draft: draft };
  }

  function removeItem(index) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (index < 0 || index >= draft.items.length) return { ok: false, error: 'Índice inválido' };
    const removed = draft.items.splice(index, 1)[0];
    recalcTotals(draft);
    audit(draft, 'item_removed', { sku: removed.sku });
    return { ok: true, removed: removed };
  }

  function recalcTotals(draft) {
    let sub = 0, tax = 0;
    for (const it of draft.items) { sub += it.subtotal; tax += it.tax; }
    draft.subtotal = round2(sub);
    draft.taxes = round2(tax);
    draft.total = round2(sub + tax);
  }

  function flagSupervisorIfNeeded(draft) {
    if (draft.total >= CONFIG.SUPERVISOR_THRESHOLD_AMOUNT) draft.requiresSupervisor = true;
    if (CONFIG.SUPERVISOR_REQUIRED_REASONS.indexOf(draft.reason) !== -1) draft.requiresSupervisor = true;
  }

  // ---------------------------------------------------------------------------
  // Motivo
  // ---------------------------------------------------------------------------
  function setReason(reason, note) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (CONFIG.REASONS.indexOf(reason) === -1) {
      return { ok: false, error: 'Motivo inválido. Use uno de: ' + CONFIG.REASONS.join(', ') };
    }
    draft.reason = reason;
    draft.reasonNote = note || '';
    flagSupervisorIfNeeded(draft);
    audit(draft, 'reason_set', { reason: reason });
    return { ok: true, draft: draft };
  }

  // ---------------------------------------------------------------------------
  // Tipo: reembolso vs cambio
  // ---------------------------------------------------------------------------
  function setRefundMethod(method) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (CONFIG.REFUND_METHODS.indexOf(method) === -1) {
      return { ok: false, error: 'Método inválido. Use: ' + CONFIG.REFUND_METHODS.join(', ') };
    }
    draft.refundMethod = method;
    if (draft.type === 'exchange') draft.type = 'mixed';
    audit(draft, 'refund_method_set', { method: method });
    return { ok: true, draft: draft };
  }

  function addExchangeItem(payload) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (!payload || !payload.sku) return { ok: false, error: 'sku requerido' };
    const qty = Math.max(1, parseInt(payload.qty || 1, 10));
    const unitPrice = parseFloat(payload.unitPrice || 0);
    const taxRate = payload.taxRate != null ? payload.taxRate : 0.16;
    const subtotal = round2(unitPrice * qty);
    const tax = round2(subtotal * taxRate);
    const item = {
      sku: payload.sku, name: payload.name || payload.sku,
      qty: qty, unitPrice: unitPrice, taxRate: taxRate,
      subtotal: subtotal, tax: tax, total: round2(subtotal + tax)
    };
    draft.exchangeItems.push(item);
    if (draft.type === 'refund') draft.type = 'exchange';
    audit(draft, 'exchange_item_added', { sku: item.sku, qty: item.qty });
    return { ok: true, item: item };
  }

  function computeBalance(draft) {
    const refundDue = draft.total;
    const exchangeTotal = draft.exchangeItems.reduce((a, b) => a + b.total, 0);
    const diff = round2(refundDue - exchangeTotal);
    // diff > 0 → cliente recibe; diff < 0 → cliente paga
    return {
      refundDue: round2(refundDue),
      exchangeTotal: round2(exchangeTotal),
      netToCustomer: diff,
      netFromCustomer: diff < 0 ? round2(-diff) : 0
    };
  }

  // ---------------------------------------------------------------------------
  // Autorización de supervisor
  // ---------------------------------------------------------------------------
  function authorizeSupervisor(supervisorId, pin) {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (!supervisorId || !pin) return { ok: false, error: 'supervisorId y pin requeridos' };

    let valid = false;
    if (global.AuthAPI && typeof global.AuthAPI.verifySupervisor === 'function') {
      valid = !!global.AuthAPI.verifySupervisor(supervisorId, pin);
    } else {
      // fallback dev: pin 4+ dígitos numéricos
      valid = /^\d{4,}$/.test(String(pin));
    }
    if (!valid) {
      audit(draft, 'supervisor_denied', { supervisorId: supervisorId });
      return { ok: false, error: 'Credenciales de supervisor inválidas' };
    }

    draft.supervisor = { id: supervisorId, authorizedAt: nowISO() };
    audit(draft, 'supervisor_authorized', { supervisorId: supervisorId });
    emit('supervisor_authorized', { draft: draft });
    return { ok: true, draft: draft };
  }

  // ---------------------------------------------------------------------------
  // Restock automático
  // ---------------------------------------------------------------------------
  function performRestock(draft) {
    const log = [];
    for (const it of draft.items) {
      if (!it.restockable) {
        log.push({ sku: it.sku, restocked: false, reason: 'condicion:' + it.condition });
        continue;
      }
      let ok = false;
      if (global.InventoryAPI && typeof global.InventoryAPI.increment === 'function') {
        try { ok = !!global.InventoryAPI.increment(it.sku, it.qty, { source: 'return:' + draft.rma }); }
        catch (e) { ok = false; log.push({ sku: it.sku, error: e.message }); }
      } else if (global.VolvixDB && global.VolvixDB.inventory) {
        const inv = global.VolvixDB.inventory[it.sku];
        if (inv) { inv.stock = (inv.stock || 0) + it.qty; ok = true; }
      } else {
        log.push({ sku: it.sku, restocked: false, reason: 'sin_inventory_api' });
        continue;
      }
      log.push({ sku: it.sku, qty: it.qty, restocked: ok });
    }
    return log;
  }

  // ---------------------------------------------------------------------------
  // Confirmar / procesar
  // ---------------------------------------------------------------------------
  function confirm() {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay devolución en borrador' };
    if (!draft.items.length) return { ok: false, error: 'Sin items a devolver' };
    if (!draft.reason) return { ok: false, error: 'Motivo requerido' };
    if (draft.type === 'refund' && !draft.refundMethod) {
      return { ok: false, error: 'Método de reembolso requerido' };
    }
    if (draft.requiresSupervisor && !draft.supervisor) {
      return { ok: false, error: 'Esta devolución requiere autorización de supervisor' };
    }

    const balance = computeBalance(draft);
    const restockLog = performRestock(draft);

    // Marcar items en venta original
    const sale = resolveSale(draft.saleId);
    if (sale && sale.items) {
      for (const it of draft.items) {
        const orig = sale.items.find(s => s.sku === it.sku);
        if (orig) orig.returnedQty = (orig.returnedQty || 0) + it.qty;
      }
      const totalSold = sale.items.reduce((a, b) => a + (b.qty || 0), 0);
      const totalReturned = sale.items.reduce((a, b) => a + (b.returnedQty || 0), 0);
      sale.status = totalReturned >= totalSold ? 'refunded_full' : 'refunded_partial';
    }

    // Disparar reembolso vía PaymentsAPI si existe
    let paymentResult = null;
    if (draft.refundMethod && global.PaymentsAPI && typeof global.PaymentsAPI.refund === 'function') {
      try {
        paymentResult = global.PaymentsAPI.refund({
          method: draft.refundMethod,
          amount: balance.netToCustomer > 0 ? balance.netToCustomer : draft.total,
          rma: draft.rma,
          saleId: draft.saleId
        });
      } catch (e) { paymentResult = { ok: false, error: e.message }; }
    }

    draft.status = 'confirmed';
    draft.confirmedAt = nowISO();
    draft.balance = balance;
    draft.restockLog = restockLog;
    draft.paymentResult = paymentResult;

    state.returns.push(draft);
    state.pending = null;
    persist();

    audit(draft, 'confirmed', { total: draft.total, type: draft.type });
    emit('confirmed', draft);
    return { ok: true, return: draft };
  }

  function cancel() {
    const draft = state.pending;
    if (!draft) return { ok: false, error: 'No hay borrador' };
    audit(draft, 'cancelled', {});
    state.pending = null;
    emit('cancelled', draft);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Auditoría
  // ---------------------------------------------------------------------------
  function audit(draft, action, data) {
    draft.audit.push({ at: nowISO(), action: action, data: data || {} });
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------
  function getPending() { return state.pending; }
  function getReturn(id) { return state.returns.find(r => r.id === id || r.rma === id) || null; }
  function listReturns(filter) {
    filter = filter || {};
    return state.returns.filter(r => {
      if (filter.saleId && r.saleId !== filter.saleId) return false;
      if (filter.status && r.status !== filter.status) return false;
      if (filter.from && r.createdAt < filter.from) return false;
      if (filter.to && r.createdAt > filter.to) return false;
      return true;
    });
  }
  function summary() {
    const total = state.returns.reduce((a, r) => a + (r.total || 0), 0);
    return {
      count: state.returns.length,
      totalRefunded: round2(total),
      pending: state.pending ? state.pending.id : null
    };
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  load();

  global.ReturnsAPI = {
    // configuración
    config: CONFIG,
    // flujo principal
    validateSale: validateSale,
    createReturn: createReturn,
    addItem: addItem,
    removeItem: removeItem,
    setReason: setReason,
    setRefundMethod: setRefundMethod,
    addExchangeItem: addExchangeItem,
    authorizeSupervisor: authorizeSupervisor,
    computeBalance: function () { return state.pending ? computeBalance(state.pending) : null; },
    confirm: confirm,
    cancel: cancel,
    // consultas
    getPending: getPending,
    getReturn: getReturn,
    listReturns: listReturns,
    summary: summary,
    // versión
    version: '1.0.0'
  };

  console.log('[Volvix Returns] ReturnsAPI ready v1.0.0');
})(typeof window !== 'undefined' ? window : globalThis);
