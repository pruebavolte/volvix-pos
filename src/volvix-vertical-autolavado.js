/**
 * volvix-vertical-autolavado.js
 * POS vertical para Autolavado / Car Wash.
 *
 * Funcionalidades:
 *  - Catálogo de paquetes de lavado (Básico, Premium, Detallado, Encerado, etc.)
 *  - Tarifas diferenciadas por tipo de vehículo (moto, sedán, SUV, pickup, camión)
 *  - Asignación de lavadores y cálculo de comisión por servicio
 *  - Suscripciones mensuales (lavado ilimitado / N lavados al mes)
 *  - Control de tickets diarios, ingresos, tiempos de servicio
 *  - Persistencia local (localStorage) y API global window.AutoLavadoAPI
 *
 * Compatible con el resto de módulos volvix-vertical-*.js del suite.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_autolavado_v1';
  const VERSION = '1.0.0';

  // ─────────────────────────────────────────────────────────────────────────
  //  Catálogos por defecto
  // ─────────────────────────────────────────────────────────────────────────
  const DEFAULT_VEHICLE_TYPES = [
    { id: 'moto',    nombre: 'Motocicleta',  factor: 0.6 },
    { id: 'sedan',   nombre: 'Sedán',        factor: 1.0 },
    { id: 'suv',     nombre: 'SUV',          factor: 1.25 },
    { id: 'pickup',  nombre: 'Pickup',       factor: 1.4 },
    { id: 'camion',  nombre: 'Camión',       factor: 1.8 },
    { id: 'camioneta_grande', nombre: 'Camioneta Grande', factor: 1.55 },
  ];

  const DEFAULT_PACKAGES = [
    { id: 'pkg_basico',    nombre: 'Lavado Básico',     base: 80,  duracionMin: 15, comisionPct: 0.30,
      incluye: ['Carrocería exterior', 'Llantas', 'Secado'] },
    { id: 'pkg_completo',  nombre: 'Lavado Completo',   base: 150, duracionMin: 30, comisionPct: 0.32,
      incluye: ['Exterior', 'Aspirado interior', 'Tablero', 'Vidrios'] },
    { id: 'pkg_premium',   nombre: 'Lavado Premium',    base: 250, duracionMin: 45, comisionPct: 0.35,
      incluye: ['Completo', 'Aromatizante', 'Limpieza vestiduras', 'Abrillantado llantas'] },
    { id: 'pkg_encerado',  nombre: 'Encerado a Mano',   base: 400, duracionMin: 60, comisionPct: 0.38,
      incluye: ['Premium', 'Cera carnauba', 'Pulido suave'] },
    { id: 'pkg_detallado', nombre: 'Detallado Total',   base: 950, duracionMin: 180, comisionPct: 0.40,
      incluye: ['Encerado', 'Shampoo asientos', 'Motor', 'Pulido faros', 'Tratamiento piel'] },
    { id: 'pkg_motor',     nombre: 'Lavado de Motor',   base: 180, duracionMin: 25, comisionPct: 0.33,
      incluye: ['Desengrasado', 'Enjuague', 'Abrillantado plásticos'] },
  ];

  const DEFAULT_SUBSCRIPTIONS = [
    { id: 'sub_basic',   nombre: 'Plan Básico Mensual',    precio: 499,  lavadosMes: 4,  paqueteId: 'pkg_basico' },
    { id: 'sub_full',    nombre: 'Plan Completo Mensual',  precio: 899,  lavadosMes: 4,  paqueteId: 'pkg_completo' },
    { id: 'sub_unlim',   nombre: 'Plan Ilimitado Mensual', precio: 1499, lavadosMes: -1, paqueteId: 'pkg_completo' },
    { id: 'sub_premium', nombre: 'Plan Premium VIP',       precio: 2499, lavadosMes: -1, paqueteId: 'pkg_premium' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  //  Estado en memoria
  // ─────────────────────────────────────────────────────────────────────────
  let state = {
    vehicleTypes: [...DEFAULT_VEHICLE_TYPES],
    packages:     [...DEFAULT_PACKAGES],
    subscriptions: [...DEFAULT_SUBSCRIPTIONS],
    lavadores:    [],   // {id, nombre, activo, comisionExtra}
    suscriptores: [],   // {id, cliente, vehiculoPlaca, planId, inicio, vencimiento, lavadosUsados}
    tickets:      [],   // {id, fecha, vehiculoTipo, placa, paqueteId, lavadorId, total, comision, suscriptorId?}
    config: {
      moneda: 'MXN',
      ivaPct: 0.16,
      comisionGlobalDefault: 0.32,
      cobroExtraVehiculoSucio: 30,
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Persistencia
  // ─────────────────────────────────────────────────────────────────────────
  function load() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state = Object.assign(state, data);
      }
    } catch (e) {
      console.warn('[AutoLavado] no se pudo cargar storage:', e);
    }
  }

  function save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn('[AutoLavado] no se pudo guardar storage:', e);
    }
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Lavadores
  // ─────────────────────────────────────────────────────────────────────────
  function addLavador(nombre, comisionExtra) {
    const lav = {
      id: uid('lav'),
      nombre: String(nombre || 'Sin nombre'),
      activo: true,
      comisionExtra: Number(comisionExtra) || 0,
      ingresoTotal: 0,
      lavadosTotal: 0,
    };
    state.lavadores.push(lav);
    save();
    return lav;
  }

  function listLavadores(soloActivos) {
    return state.lavadores.filter(l => !soloActivos || l.activo);
  }

  function setLavadorActivo(id, activo) {
    const lav = state.lavadores.find(l => l.id === id);
    if (!lav) return null;
    lav.activo = !!activo;
    save();
    return lav;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Paquetes y vehículos
  // ─────────────────────────────────────────────────────────────────────────
  function getPaquete(id)   { return state.packages.find(p => p.id === id) || null; }
  function getVehiculo(id)  { return state.vehicleTypes.find(v => v.id === id) || null; }
  function getSubPlan(id)   { return state.subscriptions.find(s => s.id === id) || null; }

  function calcularPrecio(paqueteId, vehiculoTipo, sucio) {
    const pkg = getPaquete(paqueteId);
    const veh = getVehiculo(vehiculoTipo);
    if (!pkg || !veh) return null;
    let total = pkg.base * veh.factor;
    if (sucio) total += state.config.cobroExtraVehiculoSucio;
    const subtotal = +(total).toFixed(2);
    const iva = +(subtotal * state.config.ivaPct).toFixed(2);
    return {
      paquete: pkg.nombre,
      vehiculo: veh.nombre,
      base: pkg.base,
      factor: veh.factor,
      extraSucio: sucio ? state.config.cobroExtraVehiculoSucio : 0,
      subtotal,
      iva,
      total: +(subtotal + iva).toFixed(2),
      duracionMin: pkg.duracionMin,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Tickets / venta de servicio
  // ─────────────────────────────────────────────────────────────────────────
  function venderServicio(opts) {
    opts = opts || {};
    const pkg = getPaquete(opts.paqueteId);
    const veh = getVehiculo(opts.vehiculoTipo);
    if (!pkg || !veh) throw new Error('Paquete o tipo de vehículo inválido');

    let suscriptor = null;
    let cobrarCliente = true;
    if (opts.suscriptorId) {
      suscriptor = state.suscriptores.find(s => s.id === opts.suscriptorId);
      if (suscriptor && suscriptorVigente(suscriptor)) {
        const plan = getSubPlan(suscriptor.planId);
        const ilimitado = plan && plan.lavadosMes === -1;
        const tieneCupo = ilimitado || suscriptor.lavadosUsados < (plan ? plan.lavadosMes : 0);
        if (tieneCupo) {
          cobrarCliente = false;
          suscriptor.lavadosUsados += 1;
        }
      }
    }

    const precio = calcularPrecio(pkg.id, veh.id, !!opts.sucio);
    const totalCobrado = cobrarCliente ? precio.total : 0;

    const lavador = state.lavadores.find(l => l.id === opts.lavadorId);
    const comisionPct = (pkg.comisionPct || state.config.comisionGlobalDefault)
                     + (lavador ? lavador.comisionExtra : 0);
    // La comisión siempre se paga al lavador, incluso en suscripción (sobre precio "lista")
    const comision = +(precio.subtotal * comisionPct).toFixed(2);

    if (lavador) {
      lavador.lavadosTotal += 1;
      lavador.ingresoTotal += comision;
    }

    const ticket = {
      id: uid('tk'),
      fecha: new Date().toISOString(),
      vehiculoTipo: veh.id,
      placa: opts.placa || '',
      paqueteId: pkg.id,
      lavadorId: lavador ? lavador.id : null,
      suscriptorId: suscriptor ? suscriptor.id : null,
      detalle: precio,
      total: totalCobrado,
      comision,
      pagado: cobrarCliente ? (opts.metodoPago || 'efectivo') : 'suscripcion',
      notas: opts.notas || '',
    };
    state.tickets.push(ticket);
    save();
    return ticket;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Suscripciones
  // ─────────────────────────────────────────────────────────────────────────
  function altaSuscripcion(opts) {
    opts = opts || {};
    const plan = getSubPlan(opts.planId);
    if (!plan) throw new Error('Plan inexistente');
    const inicio = new Date();
    const venc = new Date(inicio); venc.setMonth(venc.getMonth() + 1);
    const sus = {
      id: uid('sus'),
      cliente: opts.cliente || 'Cliente',
      vehiculoPlaca: opts.placa || '',
      planId: plan.id,
      inicio: inicio.toISOString(),
      vencimiento: venc.toISOString(),
      lavadosUsados: 0,
      activo: true,
      pagado: opts.metodoPago || 'efectivo',
      monto: plan.precio,
    };
    state.suscriptores.push(sus);
    save();
    return sus;
  }

  function suscriptorVigente(s) {
    if (!s || !s.activo) return false;
    return new Date(s.vencimiento).getTime() >= Date.now();
  }

  function renovarSuscripcion(id) {
    const s = state.suscriptores.find(x => x.id === id);
    if (!s) return null;
    const venc = new Date(); venc.setMonth(venc.getMonth() + 1);
    s.vencimiento = venc.toISOString();
    s.lavadosUsados = 0;
    s.activo = true;
    save();
    return s;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Reportes
  // ─────────────────────────────────────────────────────────────────────────
  function reporteDia(fechaISO) {
    const d = fechaISO ? new Date(fechaISO) : new Date();
    const ymd = d.toISOString().slice(0, 10);
    const tks = state.tickets.filter(t => t.fecha.slice(0, 10) === ymd);
    const ingresos = tks.reduce((s, t) => s + t.total, 0);
    const comisiones = tks.reduce((s, t) => s + t.comision, 0);
    const porPaquete = {};
    tks.forEach(t => { porPaquete[t.paqueteId] = (porPaquete[t.paqueteId] || 0) + 1; });
    return {
      fecha: ymd,
      tickets: tks.length,
      ingresos: +ingresos.toFixed(2),
      comisiones: +comisiones.toFixed(2),
      neto: +(ingresos - comisiones).toFixed(2),
      porPaquete,
    };
  }

  function reporteLavador(lavadorId, dias) {
    const desde = Date.now() - (dias || 30) * 86400000;
    const tks = state.tickets.filter(t =>
      t.lavadorId === lavadorId && new Date(t.fecha).getTime() >= desde
    );
    return {
      lavadorId,
      periodoDias: dias || 30,
      lavados: tks.length,
      comisionTotal: +tks.reduce((s, t) => s + t.comision, 0).toFixed(2),
    };
  }

  function ingresosSuscripciones() {
    const activos = state.suscriptores.filter(suscriptorVigente);
    const mrr = activos.reduce((sum, s) => {
      const p = getSubPlan(s.planId);
      return sum + (p ? p.precio : 0);
    }, 0);
    return { activos: activos.length, mrr: +mrr.toFixed(2) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Inicialización
  // ─────────────────────────────────────────────────────────────────────────
  load();

  // API pública
  global.AutoLavadoAPI = {
    version: VERSION,
    // catálogos
    getPaquetes: () => state.packages.slice(),
    getVehiculos: () => state.vehicleTypes.slice(),
    getPlanes: () => state.subscriptions.slice(),
    // lavadores
    addLavador, listLavadores, setLavadorActivo,
    // pricing
    calcularPrecio,
    // operación
    venderServicio,
    // suscripciones
    altaSuscripcion, renovarSuscripcion, suscriptorVigente,
    listSuscriptores: () => state.suscriptores.slice(),
    // reportes
    reporteDia, reporteLavador, ingresosSuscripciones,
    // ticket history
    listTickets: () => state.tickets.slice(),
    // config
    getConfig: () => Object.assign({}, state.config),
    setConfig: (patch) => { state.config = Object.assign(state.config, patch || {}); save(); return state.config; },
    // utilidades
    _resetAll: () => { try { global.localStorage.removeItem(STORAGE_KEY); } catch (_) {} },
    _state: () => state,
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix] AutoLavado vertical cargado v' + VERSION);
  }
})(typeof window !== 'undefined' ? window : globalThis);
