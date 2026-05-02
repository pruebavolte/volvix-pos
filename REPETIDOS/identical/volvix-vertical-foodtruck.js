/**
 * VOLVIX VERTICAL - FOOD TRUCK POS
 * Sistema de Punto de Venta especializado para food trucks móviles
 * Funcionalidades: GPS, horarios dinámicos, menú simple, ticket digital, eventos
 *
 * Expone: window.FoodTruckAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  const CONFIG = {
    storageKey: 'volvix_foodtruck_v1',
    currency: 'MXN',
    taxRate: 0.16,
    geoOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    defaultRadius: 500, // metros para "estamos aquí"
  };

  // ============================================================
  // ESTADO INTERNO
  // ============================================================
  const state = {
    truckId: null,
    truckName: 'Food Truck Volvix',
    location: { lat: null, lng: null, accuracy: null, updatedAt: null },
    schedule: [],     // [{day:'mon', open:'12:00', close:'22:00'}]
    menu: [],         // [{id, name, price, category, available}]
    cart: [],         // [{itemId, qty, notes}]
    tickets: [],      // historial
    events: [],       // [{id, name, date, address, lat, lng, status}]
    isOpen: false,
    listeners: {},
  };

  // ============================================================
  // UTILIDADES
  // ============================================================
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emit(event, data) {
    (state.listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[FoodTruck] listener error', e); }
    });
  }

  function on(event, fn) {
    state.listeners[event] = state.listeners[event] || [];
    state.listeners[event].push(fn);
    return () => {
      state.listeners[event] = state.listeners[event].filter(f => f !== fn);
    };
  }

  function persist() {
    try {
      const snap = {
        truckId: state.truckId,
        truckName: state.truckName,
        schedule: state.schedule,
        menu: state.menu,
        tickets: state.tickets.slice(-200),
        events: state.events,
        location: state.location,
      };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(snap));
    } catch (e) { console.warn('[FoodTruck] persist failed', e); }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch (e) { console.warn('[FoodTruck] restore failed', e); }
  }

  // Distancia haversine en metros
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ============================================================
  // GPS / UBICACIÓN
  // ============================================================
  function updateLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation no soportado'));
      navigator.geolocation.getCurrentPosition(
        pos => {
          state.location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            updatedAt: new Date().toISOString(),
          };
          persist();
          emit('location:update', state.location);
          resolve(state.location);
        },
        err => reject(err),
        CONFIG.geoOptions
      );
    });
  }

  function watchLocation() {
    if (!navigator.geolocation) return null;
    return navigator.geolocation.watchPosition(
      pos => {
        state.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date().toISOString(),
        };
        emit('location:update', state.location);
      },
      err => emit('location:error', err),
      CONFIG.geoOptions
    );
  }

  function isCustomerNearby(customerLat, customerLng, radiusM) {
    if (state.location.lat == null) return false;
    const r = radiusM || CONFIG.defaultRadius;
    return distanceMeters(state.location.lat, state.location.lng, customerLat, customerLng) <= r;
  }

  // ============================================================
  // HORARIOS
  // ============================================================
  const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];

  function setSchedule(schedule) {
    state.schedule = schedule;
    persist();
    refreshOpenStatus();
  }

  function refreshOpenStatus() {
    const now = new Date();
    const day = DAYS[now.getDay()];
    const hhmm = now.toTimeString().slice(0,5);
    const slot = state.schedule.find(s => s.day === day);
    state.isOpen = !!(slot && hhmm >= slot.open && hhmm <= slot.close);
    emit('status:change', { isOpen: state.isOpen });
    return state.isOpen;
  }

  // ============================================================
  // MENÚ
  // ============================================================
  function setMenu(items) {
    state.menu = items.map(i => ({
      id: i.id || uid('item'),
      name: i.name,
      price: Number(i.price) || 0,
      category: i.category || 'general',
      available: i.available !== false,
    }));
    persist();
    emit('menu:update', state.menu);
  }

  function addMenuItem(item) {
    const newItem = {
      id: uid('item'),
      name: item.name,
      price: Number(item.price) || 0,
      category: item.category || 'general',
      available: item.available !== false,
    };
    state.menu.push(newItem);
    persist();
    emit('menu:update', state.menu);
    return newItem;
  }

  function toggleAvailability(itemId) {
    const item = state.menu.find(i => i.id === itemId);
    if (!item) return false;
    item.available = !item.available;
    persist();
    emit('menu:update', state.menu);
    return item.available;
  }

  // ============================================================
  // CARRITO
  // ============================================================
  function addToCart(itemId, qty, notes) {
    const item = state.menu.find(i => i.id === itemId);
    if (!item || !item.available) throw new Error('Producto no disponible');
    state.cart.push({ itemId, qty: qty || 1, notes: notes || '' });
    emit('cart:update', state.cart);
  }

  function clearCart() {
    state.cart = [];
    emit('cart:update', state.cart);
  }

  function cartTotals() {
    let subtotal = 0;
    state.cart.forEach(line => {
      const item = state.menu.find(i => i.id === line.itemId);
      if (item) subtotal += item.price * line.qty;
    });
    const tax = subtotal * CONFIG.taxRate;
    return { subtotal, tax, total: subtotal + tax };
  }

  // ============================================================
  // TICKETS DIGITALES
  // ============================================================
  function checkout(payment) {
    if (!state.cart.length) throw new Error('Carrito vacío');
    const totals = cartTotals();
    const ticket = {
      id: uid('tkt'),
      truckId: state.truckId,
      truckName: state.truckName,
      createdAt: new Date().toISOString(),
      location: { ...state.location },
      lines: state.cart.map(line => {
        const item = state.menu.find(i => i.id === line.itemId);
        return {
          name: item ? item.name : 'desconocido',
          qty: line.qty,
          unitPrice: item ? item.price : 0,
          notes: line.notes,
          lineTotal: item ? item.price * line.qty : 0,
        };
      }),
      ...totals,
      currency: CONFIG.currency,
      payment: payment || { method: 'cash' },
    };
    state.tickets.push(ticket);
    clearCart();
    persist();
    emit('ticket:created', ticket);
    return ticket;
  }

  function ticketToText(ticket) {
    const lines = [];
    lines.push('=== ' + ticket.truckName + ' ===');
    lines.push(new Date(ticket.createdAt).toLocaleString());
    lines.push('Ticket: ' + ticket.id);
    lines.push('-------------------------');
    ticket.lines.forEach(l => {
      lines.push(`${l.qty}x ${l.name} ........ $${l.lineTotal.toFixed(2)}`);
      if (l.notes) lines.push('  > ' + l.notes);
    });
    lines.push('-------------------------');
    lines.push('Subtotal: $' + ticket.subtotal.toFixed(2));
    lines.push('IVA:      $' + ticket.tax.toFixed(2));
    lines.push('TOTAL:    $' + ticket.total.toFixed(2));
    lines.push('Pago: ' + ticket.payment.method);
    lines.push('¡Gracias por tu compra!');
    return lines.join('\n');
  }

  // ============================================================
  // EVENTOS (ferias, festivales, conciertos)
  // ============================================================
  function scheduleEvent(ev) {
    const event = {
      id: uid('evt'),
      name: ev.name,
      date: ev.date,
      address: ev.address || '',
      lat: ev.lat || null,
      lng: ev.lng || null,
      status: 'scheduled',
    };
    state.events.push(event);
    persist();
    emit('event:scheduled', event);
    return event;
  }

  function activateEvent(eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) throw new Error('Evento no encontrado');
    state.events.forEach(e => { if (e.status === 'active') e.status = 'scheduled'; });
    ev.status = 'active';
    if (ev.lat && ev.lng) {
      state.location = { lat: ev.lat, lng: ev.lng, accuracy: 0, updatedAt: new Date().toISOString() };
    }
    persist();
    emit('event:active', ev);
    return ev;
  }

  function listUpcomingEvents() {
    const now = Date.now();
    return state.events
      .filter(e => new Date(e.date).getTime() >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // ============================================================
  // REPORTES RÁPIDOS
  // ============================================================
  function dailySummary(dateStr) {
    const day = dateStr || new Date().toISOString().slice(0, 10);
    const ticketsOfDay = state.tickets.filter(t => t.createdAt.slice(0,10) === day);
    const total = ticketsOfDay.reduce((s, t) => s + t.total, 0);
    return {
      date: day,
      ticketCount: ticketsOfDay.length,
      revenue: total,
      avgTicket: ticketsOfDay.length ? total / ticketsOfDay.length : 0,
    };
  }

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  function init(opts) {
    opts = opts || {};
    restore();
    if (!state.truckId) state.truckId = opts.truckId || uid('truck');
    if (opts.truckName) state.truckName = opts.truckName;
    refreshOpenStatus();
    setInterval(refreshOpenStatus, 60000);
    persist();
    emit('ready', { truckId: state.truckId, truckName: state.truckName });
    return state.truckId;
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  global.FoodTruckAPI = {
    init,
    on,
    // GPS
    updateLocation,
    watchLocation,
    isCustomerNearby,
    getLocation: () => ({ ...state.location }),
    // Horarios
    setSchedule,
    isOpen: () => state.isOpen,
    refreshOpenStatus,
    // Menú
    setMenu,
    addMenuItem,
    toggleAvailability,
    getMenu: () => state.menu.slice(),
    // Carrito
    addToCart,
    clearCart,
    cartTotals,
    getCart: () => state.cart.slice(),
    // Tickets
    checkout,
    ticketToText,
    getTickets: () => state.tickets.slice(),
    // Eventos
    scheduleEvent,
    activateEvent,
    listUpcomingEvents,
    // Reportes
    dailySummary,
    // Estado
    getState: () => JSON.parse(JSON.stringify(state)),
  };

})(typeof window !== 'undefined' ? window : globalThis);
