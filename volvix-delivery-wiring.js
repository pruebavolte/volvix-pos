/**
 * volvix-delivery-wiring.js
 * Volvix POS - Delivery System Wiring
 * Agent-56 R9
 *
 * Provides:
 *  - Zone management with pricing rules
 *  - Driver (repartidor) assignment
 *  - Order tracking with status state machine
 *  - ETA computation
 *  - Tip calculation
 *  - Public API: window.DeliveryAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────
  const STATUS = Object.freeze({
    PENDING:    'pendiente',
    PREPARING:  'preparando',
    READY:      'listo',
    ASSIGNED:   'asignado',
    EN_ROUTE:   'en_ruta',
    DELIVERED:  'entregado',
    CANCELLED:  'cancelado',
    FAILED:     'fallido'
  });

  const STATUS_FLOW = {
    [STATUS.PENDING]:   [STATUS.PREPARING, STATUS.CANCELLED],
    [STATUS.PREPARING]: [STATUS.READY, STATUS.CANCELLED],
    [STATUS.READY]:     [STATUS.ASSIGNED, STATUS.CANCELLED],
    [STATUS.ASSIGNED]:  [STATUS.EN_ROUTE, STATUS.CANCELLED],
    [STATUS.EN_ROUTE]:  [STATUS.DELIVERED, STATUS.FAILED],
    [STATUS.DELIVERED]: [],
    [STATUS.CANCELLED]: [],
    [STATUS.FAILED]:    [STATUS.ASSIGNED]
  };

  const TIP_PRESETS = [0, 0.05, 0.10, 0.15, 0.20];
  const DEFAULT_PREP_MIN = 15;
  const DEFAULT_SPEED_KMH = 25;

  // ─────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────
  const state = {
    zones:    new Map(),  // id -> Zone
    drivers:  new Map(),  // id -> Driver
    orders:   new Map(),  // id -> Order
    listeners: [],
    seq: 1
  };

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${(state.seq++).toString(36)}`;
  }

  function emit(event, payload) {
    state.listeners.forEach(fn => {
      try { fn(event, payload); } catch (e) { console.error('[Delivery] listener error', e); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ZONES
  // ─────────────────────────────────────────────────────────────
  /**
   * @typedef {Object} Zone
   * @property {string} id
   * @property {string} name
   * @property {number} baseFee     - flat fee in MXN
   * @property {number} perKm       - extra per km
   * @property {number} minOrder    - minimum order amount
   * @property {number} freeAbove   - free delivery threshold
   * @property {number} maxDistance - km
   * @property {number} avgEtaMin   - default ETA minutes
   */
  function createZone(data) {
    if (!data || !data.name) throw new Error('Zone requires name');
    const zone = {
      id:          data.id || uid('zone'),
      name:        data.name,
      baseFee:     Number(data.baseFee     ?? 25),
      perKm:       Number(data.perKm       ?? 5),
      minOrder:    Number(data.minOrder    ?? 100),
      freeAbove:   Number(data.freeAbove   ?? 500),
      maxDistance: Number(data.maxDistance ?? 10),
      avgEtaMin:   Number(data.avgEtaMin   ?? 30),
      active:      data.active !== false
    };
    state.zones.set(zone.id, zone);
    emit('zone:created', zone);
    return zone;
  }

  function getZone(id) { return state.zones.get(id) || null; }
  function listZones() { return Array.from(state.zones.values()); }

  function updateZone(id, patch) {
    const z = state.zones.get(id);
    if (!z) return null;
    Object.assign(z, patch);
    emit('zone:updated', z);
    return z;
  }

  function removeZone(id) {
    const z = state.zones.get(id);
    if (!z) return false;
    state.zones.delete(id);
    emit('zone:removed', z);
    return true;
  }

  function calcZoneFee(zoneId, distanceKm, orderAmount) {
    const z = getZone(zoneId);
    if (!z) throw new Error(`Zone ${zoneId} not found`);
    if (distanceKm > z.maxDistance) {
      return { fee: null, reason: 'fuera_de_rango', maxDistance: z.maxDistance };
    }
    if (orderAmount < z.minOrder) {
      return { fee: null, reason: 'monto_minimo', minOrder: z.minOrder };
    }
    if (orderAmount >= z.freeAbove) {
      return { fee: 0, reason: 'envio_gratis', freeAbove: z.freeAbove };
    }
    const fee = z.baseFee + (z.perKm * Math.max(0, distanceKm));
    return { fee: Math.round(fee * 100) / 100, reason: 'ok' };
  }

  // ─────────────────────────────────────────────────────────────
  // DRIVERS
  // ─────────────────────────────────────────────────────────────
  /**
   * @typedef {Object} Driver
   * @property {string} id
   * @property {string} name
   * @property {string} phone
   * @property {string} vehicle
   * @property {string[]} zones    - zone ids
   * @property {boolean} available
   * @property {string|null} currentOrder
   */
  function createDriver(data) {
    if (!data || !data.name) throw new Error('Driver requires name');
    const driver = {
      id:           data.id || uid('drv'),
      name:         data.name,
      phone:        data.phone || '',
      vehicle:      data.vehicle || 'moto',
      zones:        Array.isArray(data.zones) ? data.zones.slice() : [],
      available:    data.available !== false,
      currentOrder: null,
      rating:       Number(data.rating ?? 5),
      deliveries:   0
    };
    state.drivers.set(driver.id, driver);
    emit('driver:created', driver);
    return driver;
  }

  function getDriver(id) { return state.drivers.get(id) || null; }
  function listDrivers() { return Array.from(state.drivers.values()); }

  function setDriverAvailability(id, available) {
    const d = state.drivers.get(id);
    if (!d) return null;
    d.available = !!available;
    emit('driver:availability', d);
    return d;
  }

  function findAvailableDriver(zoneId) {
    const candidates = listDrivers().filter(d =>
      d.available && !d.currentOrder && (d.zones.length === 0 || d.zones.includes(zoneId))
    );
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.rating - a.rating);
    return candidates[0];
  }

  // ─────────────────────────────────────────────────────────────
  // ETA
  // ─────────────────────────────────────────────────────────────
  function computeEta(zoneId, distanceKm, opts = {}) {
    const z = getZone(zoneId);
    const prep   = Number(opts.prepMinutes ?? DEFAULT_PREP_MIN);
    const speed  = Number(opts.speedKmh    ?? DEFAULT_SPEED_KMH);
    const travel = (Math.max(0, distanceKm) / speed) * 60;
    const buffer = z ? (z.avgEtaMin * 0.15) : 5;
    const totalMin = Math.round(prep + travel + buffer);
    const eta = new Date(Date.now() + totalMin * 60_000);
    return { minutes: totalMin, eta: eta.toISOString(), prep, travel: Math.round(travel), buffer: Math.round(buffer) };
  }

  // ─────────────────────────────────────────────────────────────
  // TIPS
  // ─────────────────────────────────────────────────────────────
  function calcTip(subtotal, input) {
    const sub = Number(subtotal) || 0;
    if (input == null) return 0;
    if (typeof input === 'number') {
      // <=1 treated as percentage, >1 treated as absolute
      if (input <= 1) return Math.round(sub * input * 100) / 100;
      return Math.round(input * 100) / 100;
    }
    if (typeof input === 'object') {
      if (input.percent != null) return Math.round(sub * Number(input.percent) * 100) / 100;
      if (input.amount  != null) return Math.round(Number(input.amount) * 100) / 100;
    }
    return 0;
  }

  function tipPresets(subtotal) {
    return TIP_PRESETS.map(p => ({
      label: `${Math.round(p * 100)}%`,
      percent: p,
      amount: Math.round((subtotal || 0) * p * 100) / 100
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // ORDERS
  // ─────────────────────────────────────────────────────────────
  /**
   * @typedef {Object} Order
   * @property {string} id
   * @property {string} customerName
   * @property {string} address
   * @property {string} zoneId
   * @property {number} distanceKm
   * @property {number} subtotal
   * @property {number} fee
   * @property {number} tip
   * @property {number} total
   * @property {string} status
   * @property {string|null} driverId
   * @property {object} eta
   * @property {Array<{at:string,status:string,note?:string}>} history
   */
  function createOrder(data) {
    if (!data) throw new Error('Order data required');
    const required = ['customerName', 'address', 'zoneId', 'subtotal'];
    for (const k of required) {
      if (data[k] == null) throw new Error(`Order requires ${k}`);
    }
    const distance = Number(data.distanceKm ?? 0);
    const feeInfo  = calcZoneFee(data.zoneId, distance, Number(data.subtotal));
    if (feeInfo.fee == null) {
      throw new Error(`No se puede crear pedido: ${feeInfo.reason}`);
    }
    const tip = calcTip(data.subtotal, data.tip);
    const eta = computeEta(data.zoneId, distance, data.etaOpts);
    const now = new Date().toISOString();
    const order = {
      id:           data.id || uid('ord'),
      customerName: data.customerName,
      phone:        data.phone || '',
      address:      data.address,
      zoneId:       data.zoneId,
      distanceKm:   distance,
      subtotal:     Number(data.subtotal),
      fee:          feeInfo.fee,
      tip:          tip,
      total:        Math.round((Number(data.subtotal) + feeInfo.fee + tip) * 100) / 100,
      status:       STATUS.PENDING,
      driverId:     null,
      createdAt:    now,
      eta:          eta,
      notes:        data.notes || '',
      history:      [{ at: now, status: STATUS.PENDING }]
    };
    state.orders.set(order.id, order);
    emit('order:created', order);
    return order;
  }

  function getOrder(id) { return state.orders.get(id) || null; }
  function listOrders(filter) {
    const all = Array.from(state.orders.values());
    if (!filter) return all;
    return all.filter(o => {
      if (filter.status   && o.status   !== filter.status)   return false;
      if (filter.zoneId   && o.zoneId   !== filter.zoneId)   return false;
      if (filter.driverId && o.driverId !== filter.driverId) return false;
      return true;
    });
  }

  function canTransition(from, to) {
    return (STATUS_FLOW[from] || []).includes(to);
  }

  function transitionOrder(orderId, nextStatus, note) {
    const order = state.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!canTransition(order.status, nextStatus)) {
      throw new Error(`Transición inválida ${order.status} -> ${nextStatus}`);
    }
    order.status = nextStatus;
    const entry = { at: new Date().toISOString(), status: nextStatus };
    if (note) entry.note = note;
    order.history.push(entry);
    emit('order:status', { order, status: nextStatus });
    if (nextStatus === STATUS.DELIVERED) {
      const d = order.driverId && state.drivers.get(order.driverId);
      if (d) {
        d.currentOrder = null;
        d.deliveries  += 1;
        emit('driver:freed', d);
      }
    }
    if (nextStatus === STATUS.CANCELLED || nextStatus === STATUS.FAILED) {
      const d = order.driverId && state.drivers.get(order.driverId);
      if (d) { d.currentOrder = null; emit('driver:freed', d); }
    }
    return order;
  }

  function assignDriver(orderId, driverId) {
    const order = state.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    let driver;
    if (driverId) {
      driver = state.drivers.get(driverId);
      if (!driver) throw new Error(`Driver ${driverId} not found`);
      if (driver.currentOrder) throw new Error(`Driver ${driverId} ocupado`);
      if (!driver.available) throw new Error(`Driver ${driverId} no disponible`);
    } else {
      driver = findAvailableDriver(order.zoneId);
      if (!driver) throw new Error('No hay repartidores disponibles');
    }
    order.driverId       = driver.id;
    driver.currentOrder  = order.id;
    if (order.status === STATUS.READY) {
      transitionOrder(order.id, STATUS.ASSIGNED, `Asignado a ${driver.name}`);
    } else {
      order.history.push({
        at: new Date().toISOString(),
        status: order.status,
        note: `Asignado a ${driver.name}`
      });
    }
    emit('order:assigned', { order, driver });
    return { order, driver };
  }

  function trackOrder(orderId) {
    const order = state.orders.get(orderId);
    if (!order) return null;
    const driver = order.driverId ? state.drivers.get(order.driverId) : null;
    const zone   = state.zones.get(order.zoneId);
    return {
      id:        order.id,
      status:    order.status,
      eta:       order.eta,
      total:     order.total,
      zone:      zone ? { id: zone.id, name: zone.name } : null,
      driver:    driver ? { id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle } : null,
      history:   order.history.slice(),
      delivered: order.status === STATUS.DELIVERED
    };
  }

  function refreshEta(orderId, opts) {
    const order = state.orders.get(orderId);
    if (!order) return null;
    order.eta = computeEta(order.zoneId, order.distanceKm, opts);
    emit('order:eta', order);
    return order.eta;
  }

  function applyTip(orderId, tipInput) {
    const order = state.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === STATUS.DELIVERED || order.status === STATUS.CANCELLED) {
      throw new Error('No se puede modificar propina en este estado');
    }
    const tip = calcTip(order.subtotal, tipInput);
    order.tip   = tip;
    order.total = Math.round((order.subtotal + order.fee + tip) * 100) / 100;
    emit('order:tip', order);
    return order;
  }

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────
  function subscribe(fn) {
    if (typeof fn !== 'function') throw new Error('listener must be function');
    state.listeners.push(fn);
    return () => {
      const i = state.listeners.indexOf(fn);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY / METRICS
  // ─────────────────────────────────────────────────────────────
  function summary() {
    const orders = listOrders();
    const byStatus = {};
    Object.values(STATUS).forEach(s => { byStatus[s] = 0; });
    let revenue = 0, tips = 0, fees = 0;
    orders.forEach(o => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      if (o.status === STATUS.DELIVERED) {
        revenue += o.total;
        tips    += o.tip;
        fees    += o.fee;
      }
    });
    return {
      zones:   state.zones.size,
      drivers: state.drivers.size,
      driversAvailable: listDrivers().filter(d => d.available && !d.currentOrder).length,
      orders:  orders.length,
      byStatus,
      revenue: Math.round(revenue * 100) / 100,
      tips:    Math.round(tips    * 100) / 100,
      fees:    Math.round(fees    * 100) / 100
    };
  }

  function reset() {
    state.zones.clear();
    state.drivers.clear();
    state.orders.clear();
    state.listeners.length = 0;
    state.seq = 1;
    emit('system:reset', null);
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────
  const DeliveryAPI = {
    STATUS,
    // zones
    createZone, getZone, listZones, updateZone, removeZone, calcZoneFee,
    // drivers
    createDriver, getDriver, listDrivers, setDriverAvailability, findAvailableDriver,
    // orders
    createOrder, getOrder, listOrders, transitionOrder, assignDriver,
    trackOrder, refreshEta, applyTip, canTransition,
    // tips & eta
    calcTip, tipPresets, computeEta,
    // events & meta
    subscribe, summary, reset,
    version: '1.0.0'
  };

  global.DeliveryAPI = DeliveryAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = DeliveryAPI;

})(typeof window !== 'undefined' ? window : globalThis);
