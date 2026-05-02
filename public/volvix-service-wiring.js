/* ============================================================================
 * volvix-service-wiring.js
 * Volvix POS — Service Orders Module (Talleres / Reparación)
 * ----------------------------------------------------------------------------
 * Exposes: window.ServiceAPI
 *
 * Cubre:
 *   - Orden de servicio (creación / búsqueda / actualización)
 *   - Diagnóstico técnico
 *   - Presupuesto (partes + labor)
 *   - Autorización del cliente (firma / aprobación)
 *   - Línea de tiempo de status (timeline)
 *   - Persistencia local (localStorage) con fallback a memoria
 *   - Eventos pub/sub para que la UI reaccione
 * ==========================================================================*/
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 0. Constantes
  // -------------------------------------------------------------------------
  var STORAGE_KEY = 'volvix.service.orders.v1';
  var COUNTER_KEY = 'volvix.service.counter.v1';

  var STATUS = Object.freeze({
    RECEIVED:      'received',       // Recibido en mostrador
    DIAGNOSING:    'diagnosing',     // En diagnóstico
    QUOTED:        'quoted',         // Presupuesto emitido
    AWAITING_AUTH: 'awaiting_auth',  // Esperando autorización del cliente
    AUTHORIZED:    'authorized',     // Cliente aprobó
    REJECTED:      'rejected',       // Cliente rechazó
    IN_REPAIR:     'in_repair',      // En reparación
    QC:            'qc',             // Control de calidad
    READY:         'ready',          // Listo para entrega
    DELIVERED:     'delivered',      // Entregado
    CANCELLED:     'cancelled'       // Cancelado
  });

  var STATUS_LABEL = {
    received:      'Recibido',
    diagnosing:    'En diagnóstico',
    quoted:        'Presupuestado',
    awaiting_auth: 'Esperando autorización',
    authorized:    'Autorizado',
    rejected:      'Rechazado',
    in_repair:     'En reparación',
    qc:            'Control de calidad',
    ready:         'Listo para entrega',
    delivered:     'Entregado',
    cancelled:     'Cancelado'
  };

  // Transiciones permitidas (state machine)
  var ALLOWED = {
    received:      ['diagnosing', 'cancelled'],
    diagnosing:    ['quoted', 'cancelled'],
    quoted:        ['awaiting_auth', 'cancelled'],
    awaiting_auth: ['authorized', 'rejected'],
    authorized:    ['in_repair', 'cancelled'],
    rejected:      ['ready', 'cancelled'],
    in_repair:     ['qc', 'cancelled'],
    qc:            ['ready', 'in_repair'],
    ready:         ['delivered'],
    delivered:     [],
    cancelled:     []
  };

  // -------------------------------------------------------------------------
  // 1. Storage helpers
  // -------------------------------------------------------------------------
  var memStore = { orders: [], counter: 1000 };

  function hasLS() {
    try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
  }

  function loadAll() {
    if (!hasLS()) return memStore.orders.slice();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[ServiceAPI] loadAll fallback memoria:', e);
      return memStore.orders.slice();
    }
  }

  function saveAll(list) {
    if (!hasLS()) { memStore.orders = list.slice(); return; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[ServiceAPI] saveAll fallback memoria:', e);
      memStore.orders = list.slice();
    }
  }

  function nextFolio() {
    var n;
    if (hasLS()) {
      try {
        n = parseInt(localStorage.getItem(COUNTER_KEY) || '1000', 10);
        if (isNaN(n)) n = 1000;
        n += 1;
        localStorage.setItem(COUNTER_KEY, String(n));
      } catch (e) {
        memStore.counter += 1; n = memStore.counter;
      }
    } else {
      memStore.counter += 1; n = memStore.counter;
    }
    return 'SO-' + n;
  }

  // -------------------------------------------------------------------------
  // 2. Pub/Sub muy simple
  // -------------------------------------------------------------------------
  var subs = {};
  function on(evt, cb) {
    if (!subs[evt]) subs[evt] = [];
    subs[evt].push(cb);
    return function off() {
      subs[evt] = (subs[evt] || []).filter(function (f) { return f !== cb; });
    };
  }
  function emit(evt, payload) {
    (subs[evt] || []).forEach(function (cb) {
      try { cb(payload); } catch (e) { console.error('[ServiceAPI] sub error', e); }
    });
    (subs['*'] || []).forEach(function (cb) {
      try { cb({ event: evt, payload: payload }); } catch (e) {}
    });
  }

  // -------------------------------------------------------------------------
  // 3. Util
  // -------------------------------------------------------------------------
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }

  function money(n) {
    n = Number(n) || 0;
    return Math.round(n * 100) / 100;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function findIndex(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  function pushTimeline(order, status, note, user) {
    order.timeline.push({
      at:     nowIso(),
      status: status,
      note:   note || '',
      user:   user || 'system'
    });
  }

  // -------------------------------------------------------------------------
  // 4. Cálculos: presupuesto
  // -------------------------------------------------------------------------
  function recalcQuote(order) {
    var partsTotal = 0, laborTotal = 0;
    (order.parts || []).forEach(function (p) {
      p.subtotal = money((Number(p.qty) || 0) * (Number(p.price) || 0));
      partsTotal += p.subtotal;
    });
    (order.labor || []).forEach(function (l) {
      l.subtotal = money((Number(l.hours) || 0) * (Number(l.rate) || 0));
      laborTotal += l.subtotal;
    });
    var subtotal = money(partsTotal + laborTotal);
    var taxRate  = order.taxRate != null ? Number(order.taxRate) : 0.16;
    var tax      = money(subtotal * taxRate);
    var total    = money(subtotal + tax);

    order.totals = {
      parts:    money(partsTotal),
      labor:    money(laborTotal),
      subtotal: subtotal,
      taxRate:  taxRate,
      tax:      tax,
      total:    total
    };
    return order.totals;
  }

  // -------------------------------------------------------------------------
  // 5. CRUD órdenes
  // -------------------------------------------------------------------------
  function createOrder(input) {
    input = input || {};
    if (!input.customer || !input.customer.name) {
      throw new Error('createOrder: customer.name requerido');
    }
    if (!input.item || !input.item.description) {
      throw new Error('createOrder: item.description requerido');
    }

    var order = {
      id:          uid(),
      folio:       nextFolio(),
      createdAt:   nowIso(),
      updatedAt:   nowIso(),
      status:      STATUS.RECEIVED,
      customer: {
        id:    input.customer.id    || null,
        name:  String(input.customer.name),
        phone: input.customer.phone || '',
        email: input.customer.email || ''
      },
      item: {
        type:        input.item.type        || 'generic',
        brand:       input.item.brand       || '',
        model:       input.item.model       || '',
        serial:      input.item.serial      || '',
        description: String(input.item.description),
        accessories: input.item.accessories || [],
        condition:   input.item.condition   || ''
      },
      reportedIssue: input.reportedIssue || '',
      diagnosis:     null,
      parts:         [],
      labor:         [],
      taxRate:       input.taxRate != null ? Number(input.taxRate) : 0.16,
      totals:        { parts:0, labor:0, subtotal:0, taxRate:0.16, tax:0, total:0 },
      authorization: null,
      assignedTech:  input.assignedTech || null,
      priority:      input.priority || 'normal',
      notes:         [],
      timeline:      []
    };

    pushTimeline(order, STATUS.RECEIVED, 'Orden creada en mostrador', input.user);
    recalcQuote(order);

    var list = loadAll();
    list.push(order);
    saveAll(list);
    emit('order:created', clone(order));
    return clone(order);
  }

  function getOrder(id) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    return idx >= 0 ? clone(list[idx]) : null;
  }

  function listOrders(filter) {
    filter = filter || {};
    var list = loadAll();
    return list.filter(function (o) {
      if (filter.status && o.status !== filter.status) return false;
      if (filter.tech && o.assignedTech !== filter.tech) return false;
      if (filter.q) {
        var q = String(filter.q).toLowerCase();
        var hay = (o.folio + ' ' + o.customer.name + ' ' + o.item.brand + ' ' +
                   o.item.model + ' ' + o.item.serial).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).map(clone);
  }

  function updateOrder(id, patch, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('updateOrder: orden no encontrada ' + id);
    var o = list[idx];
    ['customer','item','reportedIssue','assignedTech','priority','taxRate']
      .forEach(function (k) {
        if (patch[k] != null) {
          if (typeof o[k] === 'object' && o[k] && !Array.isArray(o[k])) {
            Object.keys(patch[k]).forEach(function (kk) { o[k][kk] = patch[k][kk]; });
          } else {
            o[k] = patch[k];
          }
        }
      });
    o.updatedAt = nowIso();
    recalcQuote(o);
    pushTimeline(o, o.status, 'Orden actualizada', user);
    saveAll(list);
    emit('order:updated', clone(o));
    return clone(o);
  }

  // -------------------------------------------------------------------------
  // 6. Diagnóstico
  // -------------------------------------------------------------------------
  function setDiagnosis(id, diag, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('setDiagnosis: orden no encontrada');
    var o = list[idx];
    o.diagnosis = {
      at:          nowIso(),
      tech:        diag.tech || o.assignedTech || user || 'unknown',
      summary:     String(diag.summary || ''),
      rootCause:   diag.rootCause || '',
      severity:    diag.severity  || 'medium',
      repairable:  diag.repairable !== false,
      recommendations: diag.recommendations || []
    };
    if (o.status === STATUS.RECEIVED) {
      o.status = STATUS.DIAGNOSING;
      pushTimeline(o, STATUS.DIAGNOSING, 'Diagnóstico iniciado', user);
    } else {
      pushTimeline(o, o.status, 'Diagnóstico actualizado', user);
    }
    o.updatedAt = nowIso();
    saveAll(list);
    emit('order:diagnosis', clone(o));
    return clone(o);
  }

  // -------------------------------------------------------------------------
  // 7. Partes y labor
  // -------------------------------------------------------------------------
  function addPart(id, part, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('addPart: orden no encontrada');
    var o = list[idx];
    var p = {
      id:    uid(),
      sku:   part.sku   || '',
      name:  String(part.name || 'Parte sin nombre'),
      qty:   Number(part.qty)   || 1,
      price: Number(part.price) || 0,
      stockSource: part.stockSource || 'inventory',
      subtotal: 0
    };
    o.parts.push(p);
    recalcQuote(o);
    o.updatedAt = nowIso();
    pushTimeline(o, o.status, 'Parte agregada: ' + p.name, user);
    saveAll(list);
    emit('order:part:add', { order: clone(o), part: clone(p) });
    return clone(o);
  }

  function removePart(id, partId, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('removePart: orden no encontrada');
    var o = list[idx];
    o.parts = o.parts.filter(function (p) { return p.id !== partId; });
    recalcQuote(o);
    o.updatedAt = nowIso();
    pushTimeline(o, o.status, 'Parte removida', user);
    saveAll(list);
    emit('order:part:remove', clone(o));
    return clone(o);
  }

  function addLabor(id, labor, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('addLabor: orden no encontrada');
    var o = list[idx];
    var l = {
      id:    uid(),
      desc:  String(labor.desc || 'Mano de obra'),
      hours: Number(labor.hours) || 0,
      rate:  Number(labor.rate)  || 0,
      tech:  labor.tech || o.assignedTech || '',
      subtotal: 0
    };
    o.labor.push(l);
    recalcQuote(o);
    o.updatedAt = nowIso();
    pushTimeline(o, o.status, 'Labor agregada: ' + l.desc, user);
    saveAll(list);
    emit('order:labor:add', { order: clone(o), labor: clone(l) });
    return clone(o);
  }

  function removeLabor(id, laborId, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('removeLabor: orden no encontrada');
    var o = list[idx];
    o.labor = o.labor.filter(function (l) { return l.id !== laborId; });
    recalcQuote(o);
    o.updatedAt = nowIso();
    pushTimeline(o, o.status, 'Labor removida', user);
    saveAll(list);
    emit('order:labor:remove', clone(o));
    return clone(o);
  }

  // -------------------------------------------------------------------------
  // 8. Presupuesto y autorización
  // -------------------------------------------------------------------------
  function emitQuote(id, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('emitQuote: orden no encontrada');
    var o = list[idx];
    if (!o.diagnosis) throw new Error('emitQuote: requiere diagnóstico previo');
    recalcQuote(o);
    o.status = STATUS.QUOTED;
    pushTimeline(o, STATUS.QUOTED, 'Presupuesto emitido total $' + o.totals.total, user);
    o.updatedAt = nowIso();
    saveAll(list);
    emit('order:quoted', clone(o));
    return clone(o);
  }

  function requestAuthorization(id, user) {
    return changeStatus(id, STATUS.AWAITING_AUTH, 'Enviado al cliente para autorización', user);
  }

  function authorize(id, payload, user) {
    payload = payload || {};
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('authorize: orden no encontrada');
    var o = list[idx];
    if (o.status !== STATUS.AWAITING_AUTH && o.status !== STATUS.QUOTED) {
      throw new Error('authorize: orden no está esperando autorización');
    }
    o.authorization = {
      at:        nowIso(),
      approved:  payload.approved !== false,
      method:    payload.method   || 'in_person',  // in_person | phone | email | sms
      signature: payload.signature || null,        // dataURL si firmó
      notes:     payload.notes     || ''
    };
    o.status = o.authorization.approved ? STATUS.AUTHORIZED : STATUS.REJECTED;
    pushTimeline(o, o.status,
      o.authorization.approved ? 'Cliente AUTORIZÓ reparación' : 'Cliente RECHAZÓ reparación',
      user);
    o.updatedAt = nowIso();
    saveAll(list);
    emit('order:authorized', clone(o));
    return clone(o);
  }

  // -------------------------------------------------------------------------
  // 9. Cambios de status (state machine)
  // -------------------------------------------------------------------------
  function canTransition(from, to) {
    return (ALLOWED[from] || []).indexOf(to) !== -1;
  }

  function changeStatus(id, to, note, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('changeStatus: orden no encontrada');
    var o = list[idx];
    if (!STATUS_LABEL[to]) throw new Error('changeStatus: status inválido ' + to);
    if (!canTransition(o.status, to)) {
      throw new Error('changeStatus: transición no permitida ' + o.status + ' -> ' + to);
    }
    o.status = to;
    pushTimeline(o, to, note || ('Cambio a ' + STATUS_LABEL[to]), user);
    o.updatedAt = nowIso();
    saveAll(list);
    emit('order:status', clone(o));
    return clone(o);
  }

  function addNote(id, text, user) {
    var list = loadAll();
    var idx  = findIndex(list, id);
    if (idx < 0) throw new Error('addNote: orden no encontrada');
    var o = list[idx];
    var note = { id: uid(), at: nowIso(), user: user || 'system', text: String(text || '') };
    o.notes.push(note);
    o.updatedAt = nowIso();
    saveAll(list);
    emit('order:note', { order: clone(o), note: note });
    return clone(o);
  }

  function getTimeline(id) {
    var o = getOrder(id);
    return o ? o.timeline.slice() : [];
  }

  // -------------------------------------------------------------------------
  // 10. Reportes simples
  // -------------------------------------------------------------------------
  function summary() {
    var list = loadAll();
    var counts = {};
    Object.keys(STATUS_LABEL).forEach(function (k) { counts[k] = 0; });
    var revenue = 0;
    list.forEach(function (o) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.status === STATUS.DELIVERED) revenue += (o.totals && o.totals.total) || 0;
    });
    return {
      total:   list.length,
      counts:  counts,
      revenue: money(revenue)
    };
  }

  // -------------------------------------------------------------------------
  // 11. Reset / utilidades de mantenimiento
  // -------------------------------------------------------------------------
  function _resetAll() {
    if (hasLS()) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(COUNTER_KEY);
      } catch (e) {}
    }
    memStore = { orders: [], counter: 1000 };
    emit('store:reset', {});
  }

  // -------------------------------------------------------------------------
  // 12. Exposición pública
  // -------------------------------------------------------------------------
  var ServiceAPI = {
    STATUS:        STATUS,
    STATUS_LABEL:  STATUS_LABEL,
    ALLOWED:       ALLOWED,

    // CRUD
    createOrder:   createOrder,
    getOrder:      getOrder,
    listOrders:    listOrders,
    updateOrder:   updateOrder,

    // Diagnóstico
    setDiagnosis:  setDiagnosis,

    // Presupuesto
    addPart:       addPart,
    removePart:    removePart,
    addLabor:      addLabor,
    removeLabor:   removeLabor,
    recalcQuote:   function (id) {
      var list = loadAll();
      var idx  = findIndex(list, id);
      if (idx < 0) throw new Error('recalcQuote: orden no encontrada');
      var t = recalcQuote(list[idx]);
      saveAll(list);
      return t;
    },
    emitQuote:           emitQuote,

    // Autorización
    requestAuthorization: requestAuthorization,
    authorize:            authorize,

    // Status / timeline
    changeStatus:  changeStatus,
    canTransition: canTransition,
    addNote:       addNote,
    getTimeline:   getTimeline,

    // Reportes
    summary:       summary,

    // Eventos
    on:            on,

    // Mantenimiento
    _resetAll:     _resetAll,

    // Versión
    version:       '1.0.0'
  };

  global.ServiceAPI = ServiceAPI;

  if (typeof console !== 'undefined') {
    console.log('[ServiceAPI] listo v' + ServiceAPI.version);
  }
})(typeof window !== 'undefined' ? window : this);
