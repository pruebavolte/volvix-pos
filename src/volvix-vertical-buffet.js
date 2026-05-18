/**
 * volvix-vertical-buffet.js
 * Vertical POS: Buffet libre / All-you-can-eat
 *
 * Características:
 *  - Precio fijo por persona (adulto)
 *  - Descuento configurable para niños y tercera edad
 *  - Bebidas / extras fuera del buffet (carta paralela)
 *  - Control de mesa con llave electrónica (RFID/PIN) anti-fraude
 *  - Apertura / cierre de mesa con timestamps
 *  - Cálculo de propina, IVA, totales
 *  - Persistencia en localStorage
 *
 * Expone: window.BuffetAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // CONFIGURACIÓN POR DEFECTO
  // ============================================================
  const DEFAULT_CONFIG = {
    precioAdulto: 250.0,
    precioNino: 150.0,           // 6-12 años
    precioInfante: 0.0,          // < 6 años
    descuentoTerceraEdad: 0.20,  // 20% sobre precio adulto
    iva: 0.16,
    propinaSugerida: 0.10,
    moneda: 'MXN',
    horarioBuffet: { inicio: '12:00', fin: '17:00' },
    maxPersonasPorMesa: 12,
    requiereLlaveElectronica: true,
    storageKey: 'volvix_buffet_state_v1'
  };

  // ============================================================
  // ESTADO INTERNO
  // ============================================================
  const state = {
    config: { ...DEFAULT_CONFIG },
    mesas: {},          // { mesaId: { ...mesa } }
    extras: [],         // catálogo de bebidas/extras
    llaves: {},         // { llaveId: { mesaId, asignadaEn } }
    historial: []       // tickets cerrados
  };

  // ============================================================
  // UTILIDADES
  // ============================================================
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return new Date().toISOString();
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function persistir() {
    try {
      const snap = {
        config: state.config,
        mesas: state.mesas,
        extras: state.extras,
        llaves: state.llaves,
        historial: state.historial.slice(-200)
      };
      localStorage.setItem(state.config.storageKey, JSON.stringify(snap));
    } catch (e) {
      console.warn('[Buffet] No se pudo persistir:', e.message);
    }
  }

  function restaurar() {
    try {
      const raw = localStorage.getItem(DEFAULT_CONFIG.storageKey);
      if (!raw) return;
      const snap = JSON.parse(raw);
      Object.assign(state.config, snap.config || {});
      state.mesas = snap.mesas || {};
      state.extras = snap.extras || [];
      state.llaves = snap.llaves || {};
      state.historial = snap.historial || [];
    } catch (e) {
      console.warn('[Buffet] No se pudo restaurar:', e.message);
    }
  }

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  function configurar(opts) {
    Object.assign(state.config, opts || {});
    persistir();
    return { ...state.config };
  }

  // ============================================================
  // CATÁLOGO DE EXTRAS (bebidas, postres premium, etc.)
  // ============================================================
  function agregarExtra(extra) {
    if (!extra || !extra.nombre || typeof extra.precio !== 'number') {
      throw new Error('Extra inválido: requiere {nombre, precio}');
    }
    const item = {
      id: extra.id || uid('ext'),
      nombre: extra.nombre,
      precio: round2(extra.precio),
      categoria: extra.categoria || 'bebida',
      activo: true
    };
    state.extras.push(item);
    persistir();
    return item;
  }

  function listarExtras(categoria) {
    return state.extras
      .filter(e => e.activo && (!categoria || e.categoria === categoria))
      .map(e => ({ ...e }));
  }

  // ============================================================
  // LLAVES ELECTRÓNICAS (anti-fraude)
  // ============================================================
  function asignarLlave(llaveId, mesaId) {
    if (!llaveId) throw new Error('llaveId requerido');
    if (state.llaves[llaveId] && state.llaves[llaveId].mesaId !== mesaId) {
      throw new Error('Llave ya asignada a otra mesa: ' + state.llaves[llaveId].mesaId);
    }
    state.llaves[llaveId] = { mesaId, asignadaEn: now() };
    persistir();
    return state.llaves[llaveId];
  }

  function liberarLlave(llaveId) {
    delete state.llaves[llaveId];
    persistir();
  }

  function validarLlave(llaveId, mesaId) {
    const r = state.llaves[llaveId];
    return !!(r && r.mesaId === mesaId);
  }

  // ============================================================
  // MESAS
  // ============================================================
  function abrirMesa({ mesaId, mesero, personas, llaveId }) {
    if (!mesaId) throw new Error('mesaId requerido');
    if (state.mesas[mesaId] && state.mesas[mesaId].estado === 'abierta') {
      throw new Error('Mesa ya está abierta: ' + mesaId);
    }
    if (state.config.requiereLlaveElectronica && !llaveId) {
      throw new Error('Se requiere llave electrónica para abrir mesa');
    }
    if (llaveId) asignarLlave(llaveId, mesaId);

    const personasInfo = personas || { adultos: 1, ninos: 0, infantes: 0, terceraEdad: 0 };
    const totalPersonas =
      (personasInfo.adultos || 0) +
      (personasInfo.ninos || 0) +
      (personasInfo.infantes || 0) +
      (personasInfo.terceraEdad || 0);

    if (totalPersonas > state.config.maxPersonasPorMesa) {
      throw new Error('Excede capacidad máxima: ' + state.config.maxPersonasPorMesa);
    }

    const mesa = {
      mesaId,
      ticketId: uid('tkt'),
      mesero: mesero || 'sin-asignar',
      personas: personasInfo,
      llaveId: llaveId || null,
      extras: [],
      abiertaEn: now(),
      cerradaEn: null,
      estado: 'abierta'
    };
    state.mesas[mesaId] = mesa;
    persistir();
    return mesa;
  }

  function agregarExtraAMesa(mesaId, extraId, cantidad, llaveId) {
    const mesa = state.mesas[mesaId];
    if (!mesa || mesa.estado !== 'abierta') throw new Error('Mesa no abierta');
    if (state.config.requiereLlaveElectronica && !validarLlave(llaveId, mesaId)) {
      throw new Error('Llave electrónica inválida para esta mesa');
    }
    const extra = state.extras.find(e => e.id === extraId);
    if (!extra) throw new Error('Extra no existe: ' + extraId);
    const linea = {
      id: uid('lin'),
      extraId,
      nombre: extra.nombre,
      precioUnitario: extra.precio,
      cantidad: cantidad || 1,
      subtotal: round2(extra.precio * (cantidad || 1)),
      agregadoEn: now()
    };
    mesa.extras.push(linea);
    persistir();
    return linea;
  }

  function quitarExtraDeMesa(mesaId, lineaId) {
    const mesa = state.mesas[mesaId];
    if (!mesa) throw new Error('Mesa no existe');
    const idx = mesa.extras.findIndex(l => l.id === lineaId);
    if (idx < 0) return false;
    mesa.extras.splice(idx, 1);
    persistir();
    return true;
  }

  // ============================================================
  // CÁLCULO DE TOTALES
  // ============================================================
  function calcularTotales(mesaId) {
    const mesa = state.mesas[mesaId];
    if (!mesa) throw new Error('Mesa no existe');
    const c = state.config;
    const p = mesa.personas;

    const buffetAdultos = (p.adultos || 0) * c.precioAdulto;
    const buffetNinos = (p.ninos || 0) * c.precioNino;
    const buffetInfantes = (p.infantes || 0) * c.precioInfante;
    const buffetTE = (p.terceraEdad || 0) * c.precioAdulto * (1 - c.descuentoTerceraEdad);

    const totalBuffet = round2(buffetAdultos + buffetNinos + buffetInfantes + buffetTE);
    const totalExtras = round2(mesa.extras.reduce((s, l) => s + l.subtotal, 0));
    const subtotal = round2(totalBuffet + totalExtras);
    const iva = round2(subtotal * c.iva);
    const propinaSugerida = round2(subtotal * c.propinaSugerida);
    const total = round2(subtotal + iva);

    return {
      desglose: {
        buffetAdultos: round2(buffetAdultos),
        buffetNinos: round2(buffetNinos),
        buffetInfantes: round2(buffetInfantes),
        buffetTerceraEdad: round2(buffetTE)
      },
      totalBuffet,
      totalExtras,
      subtotal,
      iva,
      propinaSugerida,
      total,
      moneda: c.moneda
    };
  }

  // ============================================================
  // CIERRE DE MESA / TICKET
  // ============================================================
  function cerrarMesa(mesaId, { propina, metodoPago, llaveId } = {}) {
    const mesa = state.mesas[mesaId];
    if (!mesa || mesa.estado !== 'abierta') throw new Error('Mesa no está abierta');
    if (state.config.requiereLlaveElectronica && !validarLlave(llaveId, mesaId)) {
      throw new Error('Llave electrónica inválida para cerrar mesa');
    }
    const totales = calcularTotales(mesaId);
    const propinaFinal = round2(typeof propina === 'number' ? propina : totales.propinaSugerida);

    const ticket = {
      ...mesa,
      cerradaEn: now(),
      estado: 'cerrada',
      totales,
      propina: propinaFinal,
      metodoPago: metodoPago || 'efectivo',
      totalConPropina: round2(totales.total + propinaFinal)
    };

    state.historial.push(ticket);
    delete state.mesas[mesaId];
    if (mesa.llaveId) liberarLlave(mesa.llaveId);
    persistir();
    return ticket;
  }

  function obtenerMesa(mesaId) {
    return state.mesas[mesaId] ? { ...state.mesas[mesaId] } : null;
  }

  function listarMesasAbiertas() {
    return Object.values(state.mesas).map(m => ({ ...m }));
  }

  function obtenerHistorial(limite) {
    const lim = limite || 50;
    return state.historial.slice(-lim).reverse();
  }

  // ============================================================
  // REPORTE DEL DÍA
  // ============================================================
  function reporteDia(fecha) {
    const f = fecha || new Date().toISOString().slice(0, 10);
    const tickets = state.historial.filter(t =>
      (t.cerradaEn || '').slice(0, 10) === f
    );
    const totalVentas = tickets.reduce((s, t) => s + t.totalConPropina, 0);
    const totalPropinas = tickets.reduce((s, t) => s + (t.propina || 0), 0);
    const totalPersonas = tickets.reduce((s, t) => {
      const p = t.personas || {};
      return s + (p.adultos || 0) + (p.ninos || 0) +
        (p.infantes || 0) + (p.terceraEdad || 0);
    }, 0);
    return {
      fecha: f,
      tickets: tickets.length,
      personasAtendidas: totalPersonas,
      totalVentas: round2(totalVentas),
      totalPropinas: round2(totalPropinas),
      ticketPromedio: tickets.length ? round2(totalVentas / tickets.length) : 0
    };
  }

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  restaurar();

  // ============================================================
  // API PÚBLICA
  // ============================================================
  global.BuffetAPI = {
    // config
    configurar,
    obtenerConfig: () => ({ ...state.config }),
    // extras
    agregarExtra,
    listarExtras,
    // llaves
    asignarLlave,
    liberarLlave,
    validarLlave,
    // mesas
    abrirMesa,
    agregarExtraAMesa,
    quitarExtraDeMesa,
    cerrarMesa,
    obtenerMesa,
    listarMesasAbiertas,
    // cálculos / reportes
    calcularTotales,
    obtenerHistorial,
    reporteDia,
    // utilidades
    _resetTotal: function () {
      state.mesas = {}; state.extras = []; state.llaves = {}; state.historial = [];
      persistir();
    }
  };

  console.log('[Volvix Buffet] API lista. window.BuffetAPI disponible.');
})(typeof window !== 'undefined' ? window : globalThis);
