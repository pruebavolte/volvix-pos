/**
 * Volvix POS - Vertical Pollería
 * Módulo especializado para puntos de venta de pollos asados, partes, marinado y venta por kilogramo.
 * Expone API global: window.PolleriaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CATÁLOGO BASE DE PRODUCTOS
  // ─────────────────────────────────────────────────────────────
  const CATALOGO = {
    enteros: [
      { id: 'POL-ENT-NAT', nombre: 'Pollo asado natural', precio: 180.0, unidad: 'pieza', tiempoCoccion: 75 },
      { id: 'POL-ENT-ADO', nombre: 'Pollo asado adobado', precio: 195.0, unidad: 'pieza', tiempoCoccion: 80 },
      { id: 'POL-ENT-BBQ', nombre: 'Pollo asado BBQ',     precio: 205.0, unidad: 'pieza', tiempoCoccion: 80 },
      { id: 'POL-ENT-AJO', nombre: 'Pollo asado al ajo',  precio: 200.0, unidad: 'pieza', tiempoCoccion: 80 },
    ],
    partes: [
      { id: 'POL-PCH', nombre: 'Pechuga',     precio: 75.0, unidad: 'pieza', pesoPromedio: 0.35 },
      { id: 'POL-PRN', nombre: 'Pierna',      precio: 45.0, unidad: 'pieza', pesoPromedio: 0.22 },
      { id: 'POL-MSL', nombre: 'Muslo',       precio: 50.0, unidad: 'pieza', pesoPromedio: 0.25 },
      { id: 'POL-ALA', nombre: 'Alas (4 pz)', precio: 55.0, unidad: 'orden', pesoPromedio: 0.30 },
      { id: 'POL-RBL', nombre: 'Rabadilla',   precio: 25.0, unidad: 'pieza', pesoPromedio: 0.10 },
    ],
    granel: [
      { id: 'POL-KG-CRU', nombre: 'Pollo crudo a granel',     precioKg: 95.0,  unidad: 'kg' },
      { id: 'POL-KG-MAR', nombre: 'Pollo marinado a granel',  precioKg: 110.0, unidad: 'kg' },
      { id: 'POL-KG-FIL', nombre: 'Filete de pechuga',        precioKg: 165.0, unidad: 'kg' },
      { id: 'POL-KG-MOL', nombre: 'Pollo molido',             precioKg: 120.0, unidad: 'kg' },
    ],
    marinados: [
      { id: 'MAR-NAT', nombre: 'Natural',          recargo: 0,    descripcion: 'Sal y pimienta' },
      { id: 'MAR-ADO', nombre: 'Adobo tradicional', recargo: 8,   descripcion: 'Adobo rojo casa' },
      { id: 'MAR-AJO', nombre: 'Al ajo',           recargo: 10,   descripcion: 'Ajo asado y hierbas' },
      { id: 'MAR-BBQ', nombre: 'BBQ',              recargo: 15,   descripcion: 'Salsa BBQ ahumada' },
      { id: 'MAR-CHP', nombre: 'Chipotle',         recargo: 12,   descripcion: 'Chipotle cremoso' },
      { id: 'MAR-LIM', nombre: 'Limón pimienta',   recargo: 10,   descripcion: 'Cítrico picante' },
    ],
    guarniciones: [
      { id: 'GRN-TOR', nombre: 'Tortillas (12 pz)', precio: 18.0 },
      { id: 'GRN-ARZ', nombre: 'Arroz rojo (250g)', precio: 25.0 },
      { id: 'GRN-PAP', nombre: 'Papas a la francesa', precio: 35.0 },
      { id: 'GRN-ENS', nombre: 'Ensalada de col',   precio: 22.0 },
      { id: 'GRN-FRJ', nombre: 'Frijoles charros',  precio: 28.0 },
      { id: 'GRN-SLS', nombre: 'Salsa (200ml)',     precio: 15.0 },
    ],
  };

  const COMBOS = [
    { id: 'CMB-FAM', nombre: 'Familiar', incluye: { entero: 1, guarniciones: ['GRN-TOR', 'GRN-ARZ', 'GRN-SLS'] }, precio: 240.0 },
    { id: 'CMB-MEG', nombre: 'Mega Pollero', incluye: { entero: 2, guarniciones: ['GRN-TOR', 'GRN-ARZ', 'GRN-PAP', 'GRN-SLS'] }, precio: 430.0 },
    { id: 'CMB-IND', nombre: 'Individual 1/4', incluye: { partes: ['POL-PRN', 'POL-MSL'], guarniciones: ['GRN-TOR', 'GRN-SLS'] }, precio: 110.0 },
  ];

  // ─────────────────────────────────────────────────────────────
  // ESTADO INTERNO
  // ─────────────────────────────────────────────────────────────
  const state = {
    tickets: [],
    secuencia: 1,
    cocina: [],          // cola de pollos en asador
    inventarioKg: { 'POL-KG-CRU': 0, 'POL-KG-MAR': 0, 'POL-KG-FIL': 0, 'POL-KG-MOL': 0 },
    asadorCapacidad: 24,
    asadorEnUso: 0,
  };

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────
  function _findProducto(id) {
    for (const cat of Object.keys(CATALOGO)) {
      const it = CATALOGO[cat].find(p => p.id === id);
      if (it) return { ...it, _categoria: cat };
    }
    return null;
  }
  function _findMarinado(id) {
    return CATALOGO.marinados.find(m => m.id === id) || CATALOGO.marinados[0];
  }
  function _redondea(n) { return Math.round(n * 100) / 100; }
  function _ahora() { return new Date().toISOString(); }
  function _nuevoFolio() {
    const f = 'POL-' + String(state.secuencia).padStart(5, '0');
    state.secuencia += 1;
    return f;
  }

  // ─────────────────────────────────────────────────────────────
  // CÁLCULOS
  // ─────────────────────────────────────────────────────────────
  function calcularLineaEntero(productoId, marinadoId, cantidad) {
    const p = _findProducto(productoId);
    if (!p || p._categoria !== 'enteros') throw new Error('Pollo entero no encontrado: ' + productoId);
    const mar = _findMarinado(marinadoId);
    const subtotal = (p.precio + mar.recargo) * cantidad;
    return {
      tipo: 'entero',
      productoId, marinadoId,
      nombre: `${p.nombre} (${mar.nombre})`,
      cantidad, precioUnit: p.precio + mar.recargo,
      subtotal: _redondea(subtotal),
    };
  }

  function calcularLineaPartes(productoId, cantidad) {
    const p = _findProducto(productoId);
    if (!p || p._categoria !== 'partes') throw new Error('Parte no encontrada: ' + productoId);
    return {
      tipo: 'parte', productoId,
      nombre: p.nombre, cantidad,
      precioUnit: p.precio,
      subtotal: _redondea(p.precio * cantidad),
    };
  }

  function calcularLineaGranel(productoId, kg, marinadoId) {
    const p = _findProducto(productoId);
    if (!p || p._categoria !== 'granel') throw new Error('Producto granel no encontrado: ' + productoId);
    if (!(kg > 0)) throw new Error('Kilogramos inválidos');
    const mar = marinadoId ? _findMarinado(marinadoId) : null;
    const recargoKg = mar ? mar.recargo : 0;
    const total = (p.precioKg + recargoKg) * kg;
    return {
      tipo: 'granel', productoId,
      nombre: `${p.nombre}${mar ? ' - ' + mar.nombre : ''}`,
      cantidad: kg, unidad: 'kg',
      precioUnit: p.precioKg + recargoKg,
      subtotal: _redondea(total),
    };
  }

  function calcularLineaGuarnicion(productoId, cantidad) {
    const p = _findProducto(productoId);
    if (!p || p._categoria !== 'guarniciones') throw new Error('Guarnición no encontrada: ' + productoId);
    return {
      tipo: 'guarnicion', productoId,
      nombre: p.nombre, cantidad,
      precioUnit: p.precio,
      subtotal: _redondea(p.precio * cantidad),
    };
  }

  function calcularCombo(comboId, marinadoId) {
    const c = COMBOS.find(x => x.id === comboId);
    if (!c) throw new Error('Combo no encontrado: ' + comboId);
    const mar = _findMarinado(marinadoId);
    return {
      tipo: 'combo', productoId: comboId,
      nombre: `Combo ${c.nombre} (${mar.nombre})`,
      cantidad: 1,
      precioUnit: c.precio + mar.recargo,
      subtotal: _redondea(c.precio + mar.recargo),
      detalle: c.incluye,
      marinadoId,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TICKETS
  // ─────────────────────────────────────────────────────────────
  function nuevoTicket(opts = {}) {
    const t = {
      folio: _nuevoFolio(),
      abierto: _ahora(),
      cerrado: null,
      cliente: opts.cliente || 'Mostrador',
      tipo: opts.tipo || 'pasa',  // pasa | llevar | domicilio
      lineas: [],
      subtotal: 0,
      descuento: 0,
      iva: 0,
      total: 0,
      pagos: [],
      estado: 'abierto',
    };
    state.tickets.push(t);
    return t;
  }

  function _recalcular(ticket) {
    const sub = ticket.lineas.reduce((a, l) => a + l.subtotal, 0);
    ticket.subtotal = _redondea(sub - ticket.descuento);
    ticket.iva = _redondea(ticket.subtotal * 0.16);
    ticket.total = _redondea(ticket.subtotal + ticket.iva);
    return ticket;
  }

  function agregarLinea(folio, linea) {
    const t = state.tickets.find(x => x.folio === folio);
    if (!t) throw new Error('Ticket no encontrado: ' + folio);
    if (t.estado !== 'abierto') throw new Error('Ticket cerrado');
    t.lineas.push(linea);
    return _recalcular(t);
  }

  function aplicarDescuento(folio, monto) {
    const t = state.tickets.find(x => x.folio === folio);
    if (!t) throw new Error('Ticket no encontrado');
    t.descuento = _redondea(monto);
    return _recalcular(t);
  }

  function registrarPago(folio, metodo, monto) {
    const t = state.tickets.find(x => x.folio === folio);
    if (!t) throw new Error('Ticket no encontrado');
    t.pagos.push({ metodo, monto: _redondea(monto), at: _ahora() });
    const pagado = t.pagos.reduce((a, p) => a + p.monto, 0);
    if (pagado + 0.001 >= t.total) {
      t.estado = 'pagado';
      t.cerrado = _ahora();
    }
    return { ticket: t, pagado: _redondea(pagado), restante: _redondea(t.total - pagado) };
  }

  // ─────────────────────────────────────────────────────────────
  // COCINA / ASADOR
  // ─────────────────────────────────────────────────────────────
  function enviarACocina(folio) {
    const t = state.tickets.find(x => x.folio === folio);
    if (!t) throw new Error('Ticket no encontrado');
    const polosEnteros = t.lineas
      .filter(l => l.tipo === 'entero' || l.tipo === 'combo')
      .reduce((a, l) => a + (l.cantidad || 1), 0);
    if (state.asadorEnUso + polosEnteros > state.asadorCapacidad) {
      return { ok: false, motivo: 'Asador lleno', enUso: state.asadorEnUso, cap: state.asadorCapacidad };
    }
    const orden = {
      folio, ingreso: _ahora(),
      pollos: polosEnteros,
      partes: t.lineas.filter(l => l.tipo === 'parte').map(l => ({ id: l.productoId, qty: l.cantidad })),
      estado: 'asando',
      listoEstimado: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
    };
    state.cocina.push(orden);
    state.asadorEnUso += polosEnteros;
    return { ok: true, orden };
  }

  function marcarListo(folio) {
    const o = state.cocina.find(x => x.folio === folio && x.estado === 'asando');
    if (!o) return { ok: false };
    o.estado = 'listo';
    o.listoReal = _ahora();
    state.asadorEnUso = Math.max(0, state.asadorEnUso - o.pollos);
    return { ok: true, orden: o };
  }

  function estadoAsador() {
    return {
      capacidad: state.asadorCapacidad,
      enUso: state.asadorEnUso,
      libre: state.asadorCapacidad - state.asadorEnUso,
      ordenes: state.cocina.filter(o => o.estado === 'asando').length,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // INVENTARIO GRANEL
  // ─────────────────────────────────────────────────────────────
  function ajustarInventarioKg(productoId, deltaKg) {
    if (!(productoId in state.inventarioKg)) state.inventarioKg[productoId] = 0;
    state.inventarioKg[productoId] = _redondea(state.inventarioKg[productoId] + deltaKg);
    return state.inventarioKg[productoId];
  }

  function inventarioActual() {
    return { ...state.inventarioKg };
  }

  // ─────────────────────────────────────────────────────────────
  // REPORTES
  // ─────────────────────────────────────────────────────────────
  function reporteVentas(filtro = {}) {
    const tickets = state.tickets.filter(t => t.estado === 'pagado');
    const total = tickets.reduce((a, t) => a + t.total, 0);
    const porTipo = {};
    tickets.forEach(t => {
      t.lineas.forEach(l => {
        porTipo[l.tipo] = (porTipo[l.tipo] || 0) + l.subtotal;
      });
    });
    return {
      ticketsPagados: tickets.length,
      totalCobrado: _redondea(total),
      ticketPromedio: tickets.length ? _redondea(total / tickets.length) : 0,
      desglose: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, _redondea(v)])),
      generado: _ahora(),
    };
  }

  function topMarinados() {
    const conteo = {};
    state.tickets.forEach(t => t.lineas.forEach(l => {
      if (l.marinadoId) conteo[l.marinadoId] = (conteo[l.marinadoId] || 0) + (l.cantidad || 1);
    }));
    return Object.entries(conteo)
      .map(([id, n]) => ({ marinadoId: id, nombre: _findMarinado(id).nombre, cantidad: n }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }

  // ─────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  global.PolleriaAPI = {
    version: '1.0.0',
    catalogo: CATALOGO,
    combos: COMBOS,
    // catálogo
    listarEnteros: () => CATALOGO.enteros.slice(),
    listarPartes:  () => CATALOGO.partes.slice(),
    listarGranel:  () => CATALOGO.granel.slice(),
    listarMarinados: () => CATALOGO.marinados.slice(),
    listarGuarniciones: () => CATALOGO.guarniciones.slice(),
    listarCombos: () => COMBOS.slice(),
    // cálculos
    calcularLineaEntero,
    calcularLineaPartes,
    calcularLineaGranel,
    calcularLineaGuarnicion,
    calcularCombo,
    // tickets
    nuevoTicket,
    agregarLinea,
    aplicarDescuento,
    registrarPago,
    obtenerTicket: (folio) => state.tickets.find(t => t.folio === folio) || null,
    listarTickets: () => state.tickets.slice(),
    // cocina
    enviarACocina,
    marcarListo,
    estadoAsador,
    // inventario
    ajustarInventarioKg,
    inventarioActual,
    // reportes
    reporteVentas,
    topMarinados,
    // utilitarios
    _state: () => JSON.parse(JSON.stringify(state)),
    reset: () => {
      state.tickets.length = 0;
      state.cocina.length = 0;
      state.secuencia = 1;
      state.asadorEnUso = 0;
      Object.keys(state.inventarioKg).forEach(k => state.inventarioKg[k] = 0);
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PolleriaAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
