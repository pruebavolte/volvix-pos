/**
 * volvix-vertical-parking.js
 * Vertical POS para Estacionamientos / Parking Lots
 *
 * Funcionalidades:
 *  - Tickets de entrada/salida (folio, placa, hora)
 *  - Tarifas por hora / fracción / tarifa máxima diaria
 *  - Mensualidades (pensiones) con asignación de cajón
 *  - Control de ocupación en tiempo real
 *  - Cortes de caja y reportes
 *  - Pérdida de boleto (tarifa penalizada)
 *  - Validaciones (sellos de comercios afiliados)
 *
 * API global: window.ParkingAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Estado interno
  // ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix_parking_state_v1';

  const defaultConfig = {
    nombre: 'Estacionamiento Volvix',
    capacidad: 100,
    tarifaHora: 25.0,
    tarifaFraccionMin: 15,         // minutos por fracción cobrable
    tarifaFraccion: 8.0,           // costo por fracción
    tarifaMaximaDiaria: 200.0,
    toleranciaSalidaMin: 10,       // minutos gratis tras pago
    tarifaPerdidaBoleto: 350.0,
    moneda: 'MXN',
    iva: 0.16,
    impresoraTicket: '58mm',
    mensualidad: 1500.0,
    descuentoValidacion: 0.5       // 50% off con sello
  };

  const state = {
    config: { ...defaultConfig },
    tickets: {},          // folio -> ticket activo
    historial: [],        // tickets cerrados
    mensualidades: {},    // placa -> { titular, vence, cajon, pagado }
    cajones: {},          // numCajon -> placa o null
    folio: 1000,
    cajaActual: {
      abierta: false,
      apertura: null,
      fondo: 0,
      ingresos: 0,
      ticketsCerrados: 0
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Persistencia
  // ─────────────────────────────────────────────────────────────
  function save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) { /* noop */ }
  }

  function load() {
    try {
      if (!global.localStorage) return;
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state, data);
      state.config = { ...defaultConfig, ...(data.config || {}) };
    } catch (e) { /* noop */ }
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  function nowISO() { return new Date().toISOString(); }
  function nuevoFolio() { state.folio += 1; return 'P' + state.folio; }
  function diffMinutos(a, b) {
    return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 60000));
  }
  function redondea(n) { return Math.round(n * 100) / 100; }

  function ocupacion() {
    const activos = Object.keys(state.tickets).length;
    return {
      ocupados: activos,
      libres: Math.max(0, state.config.capacidad - activos),
      capacidad: state.config.capacidad,
      porcentaje: redondea((activos / state.config.capacidad) * 100)
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Tarificación
  // ─────────────────────────────────────────────────────────────
  function calcularTarifa(minutos, opts = {}) {
    const cfg = state.config;
    if (opts.perdida) {
      return { total: cfg.tarifaPerdidaBoleto, detalle: 'Pérdida de boleto', minutos };
    }
    if (minutos <= cfg.toleranciaSalidaMin && opts.yaPagado) {
      return { total: 0, detalle: 'Salida dentro de tolerancia', minutos };
    }

    const horas = Math.floor(minutos / 60);
    const restoMin = minutos % 60;
    const fracciones = Math.ceil(restoMin / cfg.tarifaFraccionMin);

    let total = horas * cfg.tarifaHora + fracciones * cfg.tarifaFraccion;

    // Tarifa máxima diaria
    const dias = Math.floor(minutos / (60 * 24));
    const maxDiario = (dias + 1) * cfg.tarifaMaximaDiaria;
    if (total > maxDiario) total = maxDiario;

    if (opts.validado) total = total * (1 - cfg.descuentoValidacion);

    return {
      total: redondea(total),
      detalle: `${horas}h ${restoMin}m (${fracciones} fracc.)`,
      minutos,
      horas,
      fracciones
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Tickets
  // ─────────────────────────────────────────────────────────────
  function emitirTicket({ placa, tipoVehiculo = 'auto', conductor = '' } = {}) {
    if (!placa) throw new Error('Placa requerida');
    placa = String(placa).toUpperCase().trim();

    const occ = ocupacion();
    if (occ.libres <= 0) {
      return { ok: false, error: 'Estacionamiento lleno', ocupacion: occ };
    }

    // Si tiene mensualidad, registrar entrada sin tarifa
    const mensual = state.mensualidades[placa];
    const esMensualidad = mensual && new Date(mensual.vence) > new Date() && mensual.pagado;

    const folio = nuevoFolio();
    const ticket = {
      folio,
      placa,
      tipoVehiculo,
      conductor,
      entrada: nowISO(),
      salida: null,
      esMensualidad,
      validado: false,
      pagado: false,
      total: 0
    };
    state.tickets[folio] = ticket;
    save();
    return { ok: true, ticket, ocupacion: ocupacion() };
  }

  function consultarTicket(folio) {
    const t = state.tickets[folio];
    if (!t) return { ok: false, error: 'Ticket no encontrado' };
    const minutos = diffMinutos(t.entrada, new Date());
    const tarifa = t.esMensualidad
      ? { total: 0, detalle: 'Mensualidad activa', minutos }
      : calcularTarifa(minutos, { validado: t.validado });
    return { ok: true, ticket: t, minutos, tarifa };
  }

  function validarTicket(folio) {
    const t = state.tickets[folio];
    if (!t) return { ok: false, error: 'Ticket no encontrado' };
    t.validado = true;
    save();
    return { ok: true, ticket: t };
  }

  function pagarTicket(folio, { metodoPago = 'efectivo', perdida = false } = {}) {
    const t = state.tickets[folio];
    if (!t) return { ok: false, error: 'Ticket no encontrado' };
    if (t.esMensualidad) {
      t.pagado = true;
      t.total = 0;
      save();
      return { ok: true, ticket: t, total: 0, mensualidad: true };
    }
    const minutos = diffMinutos(t.entrada, new Date());
    const tarifa = calcularTarifa(minutos, { validado: t.validado, perdida });
    t.pagado = true;
    t.total = tarifa.total;
    t.metodoPago = metodoPago;
    t.minutosPagados = minutos;
    t.fechaPago = nowISO();
    state.cajaActual.ingresos = redondea(state.cajaActual.ingresos + tarifa.total);
    save();
    return { ok: true, ticket: t, tarifa };
  }

  function registrarSalida(folio) {
    const t = state.tickets[folio];
    if (!t) return { ok: false, error: 'Ticket no encontrado' };
    if (!t.pagado && !t.esMensualidad) {
      return { ok: false, error: 'Ticket no pagado' };
    }
    if (t.pagado && t.fechaPago) {
      const minutosDesdePago = diffMinutos(t.fechaPago, new Date());
      if (minutosDesdePago > state.config.toleranciaSalidaMin) {
        return {
          ok: false,
          error: 'Tiempo de tolerancia excedido. Reabonar.',
          minutosExtra: minutosDesdePago - state.config.toleranciaSalidaMin
        };
      }
    }
    t.salida = nowISO();
    state.historial.push(t);
    delete state.tickets[folio];
    state.cajaActual.ticketsCerrados += 1;
    save();
    return { ok: true, ticket: t, ocupacion: ocupacion() };
  }

  // ─────────────────────────────────────────────────────────────
  // Mensualidades
  // ─────────────────────────────────────────────────────────────
  function registrarMensualidad({ placa, titular, meses = 1, cajon = null }) {
    if (!placa || !titular) throw new Error('placa y titular requeridos');
    placa = String(placa).toUpperCase().trim();
    const vence = new Date();
    vence.setMonth(vence.getMonth() + meses);
    const monto = state.config.mensualidad * meses;
    const m = {
      placa, titular, cajon,
      desde: nowISO(),
      vence: vence.toISOString(),
      pagado: true,
      monto
    };
    state.mensualidades[placa] = m;
    if (cajon != null) state.cajones[cajon] = placa;
    state.cajaActual.ingresos = redondea(state.cajaActual.ingresos + monto);
    save();
    return { ok: true, mensualidad: m };
  }

  function listarMensualidades() {
    const ahora = new Date();
    return Object.values(state.mensualidades).map(m => ({
      ...m,
      vigente: new Date(m.vence) > ahora
    }));
  }

  function liberarCajon(numero) {
    const placa = state.cajones[numero];
    if (placa && state.mensualidades[placa]) {
      state.mensualidades[placa].cajon = null;
    }
    delete state.cajones[numero];
    save();
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Caja
  // ─────────────────────────────────────────────────────────────
  function abrirCaja(fondo = 0) {
    if (state.cajaActual.abierta) {
      return { ok: false, error: 'Caja ya abierta' };
    }
    state.cajaActual = {
      abierta: true,
      apertura: nowISO(),
      fondo: redondea(fondo),
      ingresos: 0,
      ticketsCerrados: 0
    };
    save();
    return { ok: true, caja: state.cajaActual };
  }

  function cerrarCaja() {
    if (!state.cajaActual.abierta) {
      return { ok: false, error: 'Caja no abierta' };
    }
    const corte = {
      ...state.cajaActual,
      cierre: nowISO(),
      total: redondea(state.cajaActual.fondo + state.cajaActual.ingresos)
    };
    state.cajaActual = { abierta: false, apertura: null, fondo: 0, ingresos: 0, ticketsCerrados: 0 };
    save();
    return { ok: true, corte };
  }

  // ─────────────────────────────────────────────────────────────
  // Reportes
  // ─────────────────────────────────────────────────────────────
  function reporteDia(fechaISO) {
    const dia = (fechaISO || nowISO()).slice(0, 10);
    const items = state.historial.filter(t => (t.fechaPago || t.entrada).slice(0, 10) === dia);
    const total = items.reduce((s, t) => s + (t.total || 0), 0);
    const promedioMin = items.length
      ? Math.round(items.reduce((s, t) => s + (t.minutosPagados || 0), 0) / items.length)
      : 0;
    return {
      fecha: dia,
      tickets: items.length,
      ingresos: redondea(total),
      promedioMin,
      ocupacionActual: ocupacion()
    };
  }

  function buscarPorPlaca(placa) {
    placa = String(placa).toUpperCase().trim();
    const activo = Object.values(state.tickets).find(t => t.placa === placa) || null;
    const historial = state.historial.filter(t => t.placa === placa);
    const mensualidad = state.mensualidades[placa] || null;
    return { activo, historial, mensualidad };
  }

  // ─────────────────────────────────────────────────────────────
  // Configuración
  // ─────────────────────────────────────────────────────────────
  function configurar(parcial) {
    state.config = { ...state.config, ...(parcial || {}) };
    save();
    return state.config;
  }

  function obtenerConfig() { return { ...state.config }; }

  // ─────────────────────────────────────────────────────────────
  // Inicialización
  // ─────────────────────────────────────────────────────────────
  load();

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────
  global.ParkingAPI = {
    // tickets
    emitirTicket,
    consultarTicket,
    validarTicket,
    pagarTicket,
    registrarSalida,
    // mensualidades
    registrarMensualidad,
    listarMensualidades,
    liberarCajon,
    // caja
    abrirCaja,
    cerrarCaja,
    // reportes
    reporteDia,
    buscarPorPlaca,
    ocupacion,
    // tarifa
    calcularTarifa,
    // config
    configurar,
    obtenerConfig,
    // utilidades
    _state: () => state,
    version: '1.0.0',
    vertical: 'parking'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.ParkingAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
