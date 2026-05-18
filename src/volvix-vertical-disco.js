/**
 * volvix-vertical-disco.js
 * Vertical: POS para antros / discotecas / bares nocturnos.
 *
 * Funcionalidades:
 *   - Cobro de cover (entrada) con tipos (general, VIP, mujeres, lista)
 *   - Gestión de mesas VIP con minimo de consumo
 *   - Catálogo de botellas y mixers, servicio en mesa
 *   - Lista de invitados (RSVP, comp, descuentos)
 *   - Comandera para meseros (orden -> barra -> entrega)
 *   - Cierre de mesa, propinas, split de cuenta
 *   - Reportes de noche (cover, ventas barra, ventas mesas, top meseros)
 *
 * Expone: window.DiscoAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────── Utilidades ─────────────────────────
  const _uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const _now = () => new Date().toISOString();
  const _money = (n) => Math.round(Number(n || 0) * 100) / 100;
  const _clone = (o) => JSON.parse(JSON.stringify(o));

  // ───────────────────────── Estado ─────────────────────────
  const state = {
    night: null,            // sesión nocturna activa
    coverTickets: [],       // entradas vendidas
    coverPrices: {
      general: 200,
      vip: 500,
      ladies: 0,
      lista: 100,
    },
    tables: {},             // mesas VIP { id: {...} }
    bottles: [],            // catálogo de botellas
    mixers: [],             // catálogo de mixers
    guestList: [],          // lista de invitados
    waiters: {},            // meseros { id: { name, sales, tips } }
    orders: {},             // órdenes activas { id: {...} }
    closedOrders: [],       // órdenes cerradas
    counters: { folio: 1000, cover: 0 },
  };

  // ───────────────────────── Sesión nocturna ─────────────────────────
  function openNight({ djs = [], promo = '', capacity = 300 } = {}) {
    if (state.night && !state.night.closed) {
      throw new Error('Ya hay una noche abierta. Ciérrala primero.');
    }
    state.night = {
      id: _uid('night'),
      openedAt: _now(),
      djs, promo, capacity,
      closed: false,
      closedAt: null,
    };
    return state.night;
  }

  function closeNight() {
    if (!state.night || state.night.closed) throw new Error('No hay noche abierta.');
    // forzar cierre de mesas pendientes
    for (const tid of Object.keys(state.tables)) {
      if (state.tables[tid].status === 'open') closeTable(tid, { force: true });
    }
    state.night.closed = true;
    state.night.closedAt = _now();
    return getNightReport();
  }

  // ───────────────────────── Cover / Entradas ─────────────────────────
  function setCoverPrice(type, price) {
    if (!(type in state.coverPrices)) throw new Error('Tipo cover invalido: ' + type);
    state.coverPrices[type] = _money(price);
    return state.coverPrices[type];
  }

  function sellCover({ type = 'general', qty = 1, payment = 'efectivo', guestId = null } = {}) {
    if (!state.night || state.night.closed) throw new Error('Abre la noche primero.');
    if (!(type in state.coverPrices)) throw new Error('Tipo cover invalido');
    const price = state.coverPrices[type];
    const ticket = {
      id: _uid('cv'),
      folio: ++state.counters.cover,
      type, qty, payment, guestId,
      unit: price,
      total: _money(price * qty),
      ts: _now(),
    };
    state.coverTickets.push(ticket);
    if (guestId) markGuestArrived(guestId);
    return ticket;
  }

  // ───────────────────────── Mesas VIP ─────────────────────────
  function createTable({ name, zone = 'VIP', capacity = 6, minConsumo = 0 } = {}) {
    if (!name) throw new Error('La mesa requiere nombre');
    const id = _uid('t');
    state.tables[id] = {
      id, name, zone, capacity, minConsumo: _money(minConsumo),
      status: 'libre',
      reservation: null,
      orderId: null,
      createdAt: _now(),
    };
    return state.tables[id];
  }

  function reserveTable(tableId, { guestName, phone, deposit = 0, hostessId = null } = {}) {
    const t = state.tables[tableId];
    if (!t) throw new Error('Mesa no existe');
    if (t.status !== 'libre') throw new Error('Mesa no disponible');
    t.reservation = { guestName, phone, deposit: _money(deposit), hostessId, at: _now() };
    t.status = 'reservada';
    return t;
  }

  function openTable(tableId, { waiterId, guests = 1 } = {}) {
    const t = state.tables[tableId];
    if (!t) throw new Error('Mesa no existe');
    if (t.status === 'open') throw new Error('Mesa ya abierta');
    if (!waiterId || !state.waiters[waiterId]) throw new Error('Mesero invalido');
    const order = _newOrder({ kind: 'table', tableId, waiterId, guests });
    t.status = 'open';
    t.orderId = order.id;
    return { table: t, order };
  }

  function closeTable(tableId, { tipPct = 0, payment = 'efectivo', force = false } = {}) {
    const t = state.tables[tableId];
    if (!t) throw new Error('Mesa no existe');
    if (t.status !== 'open' && !force) throw new Error('Mesa no esta abierta');
    const order = state.orders[t.orderId];
    if (order) {
      const closed = closeOrder(order.id, { tipPct, payment });
      // aplicar minimo de consumo
      if (t.minConsumo && closed.subtotal < t.minConsumo) {
        const diff = _money(t.minConsumo - closed.subtotal);
        closed.minConsumoAjuste = diff;
        closed.total = _money(closed.total + diff);
      }
    }
    t.status = 'libre';
    t.orderId = null;
    t.reservation = null;
    return state.tables[tableId];
  }

  // ───────────────────────── Catálogo de botellas / mixers ─────────────────────────
  function addBottle({ sku, name, category = 'whisky', price, stock = 0 }) {
    if (!sku || !name || price == null) throw new Error('Botella incompleta');
    const b = { sku, name, category, price: _money(price), stock };
    state.bottles.push(b);
    return b;
  }
  function addMixer({ sku, name, price, stock = 0 }) {
    if (!sku || !name || price == null) throw new Error('Mixer incompleto');
    const m = { sku, name, price: _money(price), stock };
    state.mixers.push(m);
    return m;
  }
  function findItemBySku(sku) {
    return state.bottles.find(b => b.sku === sku) || state.mixers.find(m => m.sku === sku) || null;
  }

  // ───────────────────────── Lista de invitados ─────────────────────────
  function addGuest({ name, phone = '', host = '', comp = false, discountPct = 0 }) {
    if (!name) throw new Error('Falta nombre');
    const g = {
      id: _uid('g'), name, phone, host,
      comp, discountPct: Math.max(0, Math.min(100, discountPct)),
      arrived: false, arrivedAt: null,
    };
    state.guestList.push(g);
    return g;
  }
  function markGuestArrived(guestId) {
    const g = state.guestList.find(x => x.id === guestId);
    if (!g) return null;
    g.arrived = true;
    g.arrivedAt = _now();
    return g;
  }

  // ───────────────────────── Meseros ─────────────────────────
  function addWaiter({ name, code = '' }) {
    if (!name) throw new Error('Falta nombre mesero');
    const id = _uid('w');
    state.waiters[id] = { id, name, code, sales: 0, tips: 0, orders: 0 };
    return state.waiters[id];
  }

  // ───────────────────────── Órdenes / Comandera ─────────────────────────
  function _newOrder({ kind, tableId = null, waiterId = null, guests = 1 }) {
    const id = _uid('o');
    const folio = ++state.counters.folio;
    const order = {
      id, folio, kind, tableId, waiterId, guests,
      items: [], subtotal: 0, tip: 0, minConsumoAjuste: 0, total: 0,
      payment: null, status: 'open',
      createdAt: _now(), closedAt: null,
      tickets: [],
    };
    state.orders[id] = order;
    if (waiterId && state.waiters[waiterId]) state.waiters[waiterId].orders++;
    return order;
  }

  function addItemToOrder(orderId, { sku, qty = 1, note = '' }) {
    const order = state.orders[orderId];
    if (!order || order.status !== 'open') throw new Error('Orden invalida');
    const item = findItemBySku(sku);
    if (!item) throw new Error('SKU no existe: ' + sku);
    if (item.stock != null && item.stock < qty) throw new Error('Sin stock: ' + sku);
    const line = {
      id: _uid('l'),
      sku, name: item.name, qty,
      unit: item.price,
      total: _money(item.price * qty),
      note,
      sentToBar: false,
      delivered: false,
      ts: _now(),
    };
    order.items.push(line);
    if (item.stock != null) item.stock -= qty;
    _recalcOrder(order);
    return line;
  }

  function sendToBar(orderId) {
    const order = state.orders[orderId];
    if (!order) throw new Error('Orden no existe');
    const ticket = {
      id: _uid('tk'),
      orderId,
      lines: order.items.filter(l => !l.sentToBar).map(l => ({ ...l })),
      ts: _now(),
    };
    if (!ticket.lines.length) throw new Error('No hay items nuevos para enviar');
    order.items.forEach(l => { l.sentToBar = true; });
    order.tickets.push(ticket);
    return ticket;
  }

  function markDelivered(orderId, lineId) {
    const order = state.orders[orderId];
    if (!order) throw new Error('Orden no existe');
    const line = order.items.find(l => l.id === lineId);
    if (!line) throw new Error('Linea no existe');
    line.delivered = true;
    return line;
  }

  function _recalcOrder(order) {
    const sub = order.items.reduce((a, l) => a + l.total, 0);
    order.subtotal = _money(sub);
    order.total = _money(order.subtotal + order.tip + order.minConsumoAjuste);
  }

  function closeOrder(orderId, { tipPct = 0, payment = 'efectivo' } = {}) {
    const order = state.orders[orderId];
    if (!order) throw new Error('Orden no existe');
    if (order.status !== 'open') throw new Error('Orden ya cerrada');
    order.tip = _money(order.subtotal * (tipPct / 100));
    _recalcOrder(order);
    order.payment = payment;
    order.status = 'closed';
    order.closedAt = _now();
    if (order.waiterId && state.waiters[order.waiterId]) {
      state.waiters[order.waiterId].sales += order.subtotal;
      state.waiters[order.waiterId].tips += order.tip;
    }
    state.closedOrders.push(order.id);
    return order;
  }

  function splitCheck(orderId, parts = 2) {
    const order = state.orders[orderId];
    if (!order) throw new Error('Orden no existe');
    if (parts < 2) throw new Error('Split minimo 2');
    const each = _money(order.total / parts);
    return Array.from({ length: parts }, (_, i) => ({ part: i + 1, amount: each }));
  }

  // ───────────────────────── Reportes ─────────────────────────
  function getNightReport() {
    const coverTotal = state.coverTickets.reduce((a, c) => a + c.total, 0);
    const coverByType = {};
    for (const c of state.coverTickets) {
      coverByType[c.type] = (coverByType[c.type] || 0) + c.total;
    }
    const closed = state.closedOrders.map(id => state.orders[id]);
    const ventasMesas = closed.filter(o => o.kind === 'table').reduce((a, o) => a + o.subtotal, 0);
    const ventasBarra = closed.filter(o => o.kind === 'bar').reduce((a, o) => a + o.subtotal, 0);
    const propinas = closed.reduce((a, o) => a + o.tip, 0);
    const topMeseros = Object.values(state.waiters)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
      .map(w => ({ name: w.name, sales: _money(w.sales), tips: _money(w.tips), orders: w.orders }));
    const topBotellas = {};
    for (const o of closed) {
      for (const l of o.items) {
        if (state.bottles.find(b => b.sku === l.sku)) {
          topBotellas[l.name] = (topBotellas[l.name] || 0) + l.qty;
        }
      }
    }
    return {
      night: state.night,
      cover: { total: _money(coverTotal), tickets: state.coverTickets.length, byType: coverByType },
      ventas: {
        mesas: _money(ventasMesas),
        barra: _money(ventasBarra),
        propinas: _money(propinas),
        total: _money(coverTotal + ventasMesas + ventasBarra),
      },
      topMeseros,
      topBotellas,
      mesasAbiertas: Object.values(state.tables).filter(t => t.status === 'open').length,
    };
  }

  function snapshot() { return _clone(state); }
  function reset() {
    state.night = null;
    state.coverTickets = [];
    state.tables = {};
    state.bottles = [];
    state.mixers = [];
    state.guestList = [];
    state.waiters = {};
    state.orders = {};
    state.closedOrders = [];
    state.counters = { folio: 1000, cover: 0 };
  }

  // ───────────────────────── API pública ─────────────────────────
  const DiscoAPI = {
    // sesión
    openNight, closeNight,
    // cover
    setCoverPrice, sellCover,
    // mesas
    createTable, reserveTable, openTable, closeTable,
    // catálogo
    addBottle, addMixer, findItemBySku,
    // invitados
    addGuest, markGuestArrived,
    // meseros
    addWaiter,
    // órdenes
    addItemToOrder, sendToBar, markDelivered, closeOrder, splitCheck,
    // reportes
    getNightReport, snapshot, reset,
    // estado bruto (lectura)
    get state() { return state; },
    version: '1.0.0',
  };

  global.DiscoAPI = DiscoAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = DiscoAPI;
})(typeof window !== 'undefined' ? window : globalThis);
