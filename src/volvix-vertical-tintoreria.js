/* ============================================================================
 * volvix-vertical-tintoreria.js
 * Vertical POS para Tintorería / Lavandería
 * Expone: window.TintoreriaAPI
 * ============================================================================
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuración base
  // ---------------------------------------------------------------------------
  const CONFIG = {
    moneda: 'MXN',
    iva: 0.16,
    recargoUrgente: 0.50,        // +50% si urgente (<24h)
    recargoDelicado: 0.25,       // +25% prendas delicadas
    recargoPlanchado: 0.15,      // +15% si incluye planchado
    diasMaxAlmacen: 30,          // días máximos antes de marcar abandonada
    horasUrgente: 24,
    horasNormal: 72
  };

  // ---------------------------------------------------------------------------
  // Catálogo de servicios (precio base por prenda)
  // ---------------------------------------------------------------------------
  const CATALOGO = {
    'camisa':         { base: 35,  delicada: false, planchadoOpcional: true  },
    'pantalon':       { base: 40,  delicada: false, planchadoOpcional: true  },
    'traje':          { base: 180, delicada: true,  planchadoOpcional: true  },
    'vestido':        { base: 120, delicada: true,  planchadoOpcional: true  },
    'vestido_novia':  { base: 850, delicada: true,  planchadoOpcional: true  },
    'abrigo':         { base: 200, delicada: true,  planchadoOpcional: true  },
    'cortina':        { base: 150, delicada: false, planchadoOpcional: false },
    'edredon':        { base: 220, delicada: false, planchadoOpcional: false },
    'sabana':         { base: 60,  delicada: false, planchadoOpcional: true  },
    'corbata':        { base: 45,  delicada: true,  planchadoOpcional: true  },
    'falda':          { base: 50,  delicada: false, planchadoOpcional: true  },
    'blusa':          { base: 40,  delicada: true,  planchadoOpcional: true  },
    'saco':           { base: 90,  delicada: true,  planchadoOpcional: true  },
    'tapete':         { base: 180, delicada: false, planchadoOpcional: false }
  };

  // ---------------------------------------------------------------------------
  // Estado interno (memoria)
  // ---------------------------------------------------------------------------
  const state = {
    tickets: new Map(),   // folio -> ticket
    secuencia: 1000,
    clientes: new Map()   // tel -> {nombre, historial[]}
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function _folio() {
    state.secuencia += 1;
    const yy = new Date().getFullYear().toString().slice(-2);
    return `T${yy}-${state.secuencia}`;
  }

  function _now() { return new Date(); }

  function _addHours(date, h) {
    const d = new Date(date.getTime());
    d.setHours(d.getHours() + h);
    return d;
  }

  function _round(n) { return Math.round(n * 100) / 100; }

  function _validarPrenda(p) {
    if (!p || typeof p !== 'object') throw new Error('Prenda inválida');
    if (!CATALOGO[p.tipo]) throw new Error(`Tipo no soportado: ${p.tipo}`);
    if (!p.cantidad || p.cantidad < 1) throw new Error('Cantidad inválida');
  }

  // ---------------------------------------------------------------------------
  // Cálculo de precios
  // ---------------------------------------------------------------------------
  function calcularPrenda(prenda) {
    _validarPrenda(prenda);
    const def = CATALOGO[prenda.tipo];
    let precio = def.base * prenda.cantidad;

    if (def.delicada) precio *= (1 + CONFIG.recargoDelicado);
    if (prenda.planchado && def.planchadoOpcional) precio *= (1 + CONFIG.recargoPlanchado);
    if (prenda.urgente) precio *= (1 + CONFIG.recargoUrgente);

    return _round(precio);
  }

  function calcularTotal(prendas) {
    const subtotal = prendas.reduce((s, p) => s + calcularPrenda(p), 0);
    const iva = _round(subtotal * CONFIG.iva);
    const total = _round(subtotal + iva);
    return { subtotal: _round(subtotal), iva, total };
  }

  // ---------------------------------------------------------------------------
  // Ticket / Orden
  // ---------------------------------------------------------------------------
  function crearTicket({ cliente, telefono, prendas, urgente = false, notas = '' }) {
    if (!cliente || !telefono) throw new Error('Cliente y teléfono requeridos');
    if (!Array.isArray(prendas) || prendas.length === 0) {
      throw new Error('Debe haber al menos una prenda');
    }

    if (urgente) prendas.forEach(p => p.urgente = true);
    prendas.forEach(_validarPrenda);

    const folio = _folio();
    const ahora = _now();
    const horas = urgente ? CONFIG.horasUrgente : CONFIG.horasNormal;
    const totales = calcularTotal(prendas);

    const ticket = {
      folio,
      cliente,
      telefono,
      prendas: JSON.parse(JSON.stringify(prendas)),
      urgente,
      notas,
      estado: 'recibida',         // recibida -> en_proceso -> lista -> entregada -> abandonada
      fechaRecepcion: ahora.toISOString(),
      fechaPromesa:   _addHours(ahora, horas).toISOString(),
      fechaEntrega:   null,
      pagado: false,
      ...totales
    };

    state.tickets.set(folio, ticket);

    // historial cliente
    if (!state.clientes.has(telefono)) {
      state.clientes.set(telefono, { nombre: cliente, historial: [] });
    }
    state.clientes.get(telefono).historial.push(folio);

    return ticket;
  }

  function actualizarEstado(folio, nuevoEstado) {
    const t = state.tickets.get(folio);
    if (!t) throw new Error(`Folio no existe: ${folio}`);
    const validos = ['recibida', 'en_proceso', 'lista', 'entregada', 'abandonada'];
    if (!validos.includes(nuevoEstado)) {
      throw new Error(`Estado inválido: ${nuevoEstado}`);
    }
    t.estado = nuevoEstado;
    if (nuevoEstado === 'entregada') t.fechaEntrega = _now().toISOString();
    return t;
  }

  function marcarPagado(folio) {
    const t = state.tickets.get(folio);
    if (!t) throw new Error(`Folio no existe: ${folio}`);
    t.pagado = true;
    return t;
  }

  function entregar(folio) {
    const t = state.tickets.get(folio);
    if (!t) throw new Error(`Folio no existe: ${folio}`);
    if (!t.pagado) throw new Error('No se puede entregar sin pago');
    return actualizarEstado(folio, 'entregada');
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------
  function obtener(folio) {
    return state.tickets.get(folio) || null;
  }

  function listarPorEstado(estado) {
    return Array.from(state.tickets.values()).filter(t => t.estado === estado);
  }

  function pendientesRecoger() {
    return listarPorEstado('lista');
  }

  function urgentesActivos() {
    return Array.from(state.tickets.values())
      .filter(t => t.urgente && !['entregada', 'abandonada'].includes(t.estado));
  }

  function vencidasPromesa() {
    const ahora = _now();
    return Array.from(state.tickets.values()).filter(t => {
      if (['entregada', 'abandonada'].includes(t.estado)) return false;
      return new Date(t.fechaPromesa) < ahora;
    });
  }

  function detectarAbandonadas() {
    const limite = _addHours(_now(), -24 * CONFIG.diasMaxAlmacen);
    const abandonadas = [];
    state.tickets.forEach(t => {
      if (t.estado === 'lista' && new Date(t.fechaRecepcion) < limite) {
        t.estado = 'abandonada';
        abandonadas.push(t.folio);
      }
    });
    return abandonadas;
  }

  function historialCliente(telefono) {
    const c = state.clientes.get(telefono);
    if (!c) return null;
    return {
      nombre: c.nombre,
      telefono,
      tickets: c.historial.map(f => state.tickets.get(f)).filter(Boolean)
    };
  }

  // ---------------------------------------------------------------------------
  // Reportes
  // ---------------------------------------------------------------------------
  function reporteDia(fecha = new Date()) {
    const dia = fecha.toISOString().slice(0, 10);
    const delDia = Array.from(state.tickets.values())
      .filter(t => t.fechaRecepcion.slice(0, 10) === dia);

    const ingresos = delDia.filter(t => t.pagado)
      .reduce((s, t) => s + t.total, 0);

    return {
      fecha: dia,
      ticketsRecibidos: delDia.length,
      urgentes: delDia.filter(t => t.urgente).length,
      entregados: delDia.filter(t => t.estado === 'entregada').length,
      ingresosCobrados: _round(ingresos),
      pendientesPago: delDia.filter(t => !t.pagado).length
    };
  }

  function imprimirTicket(folio) {
    const t = obtener(folio);
    if (!t) return null;
    const lineas = [];
    lineas.push('=========== TINTORERIA ===========');
    lineas.push(`Folio: ${t.folio}`);
    lineas.push(`Cliente: ${t.cliente}  Tel: ${t.telefono}`);
    lineas.push(`Recibido: ${t.fechaRecepcion}`);
    lineas.push(`Promesa : ${t.fechaPromesa}`);
    if (t.urgente) lineas.push('*** URGENTE ***');
    lineas.push('----------------------------------');
    t.prendas.forEach(p => {
      const flags = [
        p.planchado ? 'plancha' : null,
        CATALOGO[p.tipo].delicada ? 'delicada' : null
      ].filter(Boolean).join(',');
      lineas.push(`${p.cantidad}x ${p.tipo}${flags ? ' ('+flags+')' : ''}  $${calcularPrenda(p)}`);
    });
    lineas.push('----------------------------------');
    lineas.push(`Subtotal: $${t.subtotal}`);
    lineas.push(`IVA     : $${t.iva}`);
    lineas.push(`TOTAL   : $${t.total}`);
    lineas.push(`Estado  : ${t.estado}`);
    if (t.notas) lineas.push(`Notas: ${t.notas}`);
    lineas.push('==================================');
    return lineas.join('\n');
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------
  global.TintoreriaAPI = {
    CONFIG,
    CATALOGO,
    calcularPrenda,
    calcularTotal,
    crearTicket,
    actualizarEstado,
    marcarPagado,
    entregar,
    obtener,
    listarPorEstado,
    pendientesRecoger,
    urgentesActivos,
    vencidasPromesa,
    detectarAbandonadas,
    historialCliente,
    reporteDia,
    imprimirTicket,
    _debugState: () => state
  };

})(typeof window !== 'undefined' ? window : globalThis);
