/**
 * Volvix POS - Vertical: Tortillería
 * Módulo de venta por kg, producción diaria de tortilla,
 * cupos de reservación y suscripciones de clientes frecuentes.
 *
 * Expone: window.TortilleriaAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1. Configuración base
  // ============================================================
  const STORAGE_KEY = 'volvix_tortilleria_v1';
  const DEFAULT_CONFIG = {
    moneda: 'MXN',
    precioKgTortilla: 26.00,
    precioKgMasa: 18.00,
    precioPiezaGordita: 8.00,
    pesoTortillaPromedioGr: 30,
    capacidadProduccionDiariaKg: 250,
    horarioInicio: '06:00',
    horarioCierre: '20:00',
    impuesto: 0,            // tortilla canasta básica
    aceptaSuscripciones: true,
    descuentoSuscriptor: 0.10
  };

  // ============================================================
  // 2. Estado en memoria + persistencia
  // ============================================================
  let state = {
    config: { ...DEFAULT_CONFIG },
    catalogo: [
      { id: 'tort-maiz',  nombre: 'Tortilla de maíz',   unidad: 'kg',    precio: 26.0 },
      { id: 'tort-harina',nombre: 'Tortilla de harina', unidad: 'kg',    precio: 38.0 },
      { id: 'masa',       nombre: 'Masa fresca',        unidad: 'kg',    precio: 18.0 },
      { id: 'gordita',    nombre: 'Gordita',            unidad: 'pieza', precio: 8.0  },
      { id: 'totopo',     nombre: 'Totopo (bolsa 200g)',unidad: 'pieza', precio: 25.0 }
    ],
    produccionHoy: { fecha: null, kgProducidos: 0, kgVendidos: 0, kgReservados: 0 },
    cupos: [],          // [{id, cliente, kg, hora, estado}]
    suscripciones: [],  // [{id, cliente, plan, kgDiarios, activa, vence}]
    ventas: [],
    clientes: []
  };

  function _today() { return new Date().toISOString().slice(0, 10); }
  function _id(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch (e) { console.warn('[Tortilleria] load fail', e); }
    if (state.produccionHoy.fecha !== _today()) {
      state.produccionHoy = { fecha: _today(), kgProducidos: 0, kgVendidos: 0, kgReservados: 0 };
    }
  }
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[Tortilleria] save fail', e); }
  }

  // ============================================================
  // 3. Catálogo y precios
  // ============================================================
  function getCatalogo() { return JSON.parse(JSON.stringify(state.catalogo)); }

  function setPrecio(id, nuevoPrecio) {
    const item = state.catalogo.find(p => p.id === id);
    if (!item) throw new Error('Producto no encontrado: ' + id);
    if (nuevoPrecio < 0) throw new Error('Precio inválido');
    item.precio = Number(nuevoPrecio);
    _save();
    return item;
  }

  function agregarProducto({ nombre, unidad, precio }) {
    if (!nombre || !unidad || precio == null) throw new Error('Datos incompletos');
    const nuevo = { id: _id('prod'), nombre, unidad, precio: Number(precio) };
    state.catalogo.push(nuevo);
    _save();
    return nuevo;
  }

  // ============================================================
  // 4. Producción diaria
  // ============================================================
  function registrarProduccion(kg) {
    if (kg <= 0) throw new Error('Kg debe ser mayor a 0');
    const max = state.config.capacidadProduccionDiariaKg;
    if (state.produccionHoy.kgProducidos + kg > max) {
      throw new Error(`Excede capacidad diaria (${max} kg)`);
    }
    state.produccionHoy.kgProducidos += Number(kg);
    _save();
    return { ...state.produccionHoy };
  }

  function disponibleHoy() {
    const p = state.produccionHoy;
    return Math.max(0, p.kgProducidos - p.kgVendidos - p.kgReservados);
  }

  function resumenProduccion() {
    return {
      ...state.produccionHoy,
      disponible: disponibleHoy(),
      capacidad: state.config.capacidadProduccionDiariaKg,
      ocupacion: (state.produccionHoy.kgProducidos / state.config.capacidadProduccionDiariaKg * 100).toFixed(1) + '%'
    };
  }

  // ============================================================
  // 5. Cupos de reservación
  // ============================================================
  function reservarCupo({ cliente, kg, hora }) {
    if (!cliente || !kg || !hora) throw new Error('Datos incompletos para cupo');
    if (kg > disponibleHoy()) throw new Error('No hay suficiente tortilla disponible');
    const cupo = {
      id: _id('cupo'),
      cliente,
      kg: Number(kg),
      hora,
      estado: 'reservado',
      fecha: _today()
    };
    state.cupos.push(cupo);
    state.produccionHoy.kgReservados += Number(kg);
    _save();
    return cupo;
  }

  function cancelarCupo(cupoId) {
    const c = state.cupos.find(x => x.id === cupoId);
    if (!c) throw new Error('Cupo no encontrado');
    if (c.estado === 'cancelado') return c;
    c.estado = 'cancelado';
    state.produccionHoy.kgReservados -= c.kg;
    _save();
    return c;
  }

  function entregarCupo(cupoId) {
    const c = state.cupos.find(x => x.id === cupoId);
    if (!c) throw new Error('Cupo no encontrado');
    if (c.estado !== 'reservado') throw new Error('Cupo no está activo');
    c.estado = 'entregado';
    state.produccionHoy.kgReservados -= c.kg;
    state.produccionHoy.kgVendidos += c.kg;
    _save();
    return c;
  }

  function listarCupos(filtroEstado) {
    return filtroEstado
      ? state.cupos.filter(c => c.estado === filtroEstado)
      : [...state.cupos];
  }

  // ============================================================
  // 6. Suscripciones (cliente frecuente)
  // ============================================================
  function crearSuscripcion({ cliente, kgDiarios, plan = 'mensual' }) {
    if (!state.config.aceptaSuscripciones) throw new Error('Suscripciones deshabilitadas');
    if (!cliente || !kgDiarios) throw new Error('Datos incompletos');
    const dias = plan === 'semanal' ? 7 : plan === 'quincenal' ? 15 : 30;
    const vence = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
    const sub = {
      id: _id('sub'),
      cliente,
      plan,
      kgDiarios: Number(kgDiarios),
      activa: true,
      desde: _today(),
      vence,
      descuento: state.config.descuentoSuscriptor
    };
    state.suscripciones.push(sub);
    _save();
    return sub;
  }

  function pausarSuscripcion(subId) {
    const s = state.suscripciones.find(x => x.id === subId);
    if (!s) throw new Error('Suscripción no encontrada');
    s.activa = false;
    _save();
    return s;
  }

  function suscripcionesActivas() {
    return state.suscripciones.filter(s => s.activa && s.vence >= _today());
  }

  // ============================================================
  // 7. Ventas (POS)
  // ============================================================
  function nuevaVenta(items, opciones = {}) {
    // items: [{productoId, cantidad}]
    if (!Array.isArray(items) || !items.length) throw new Error('Venta sin items');
    let subtotal = 0;
    let kgTortilla = 0;
    const detalle = items.map(it => {
      const p = state.catalogo.find(x => x.id === it.productoId);
      if (!p) throw new Error('Producto inválido: ' + it.productoId);
      const importe = p.precio * it.cantidad;
      subtotal += importe;
      if (p.unidad === 'kg' && p.id.startsWith('tort-')) kgTortilla += it.cantidad;
      return { ...p, cantidad: it.cantidad, importe };
    });

    let descuento = 0;
    if (opciones.suscriptorId) {
      const sub = state.suscripciones.find(s => s.id === opciones.suscriptorId && s.activa);
      if (sub) descuento = subtotal * sub.descuento;
    }

    const impuesto = (subtotal - descuento) * state.config.impuesto;
    const total = subtotal - descuento + impuesto;

    if (kgTortilla > disponibleHoy()) throw new Error('Sin inventario suficiente de tortilla');

    const venta = {
      id: _id('venta'),
      fecha: new Date().toISOString(),
      detalle,
      subtotal: Number(subtotal.toFixed(2)),
      descuento: Number(descuento.toFixed(2)),
      impuesto: Number(impuesto.toFixed(2)),
      total: Number(total.toFixed(2)),
      metodoPago: opciones.metodoPago || 'efectivo',
      kgTortilla
    };
    state.ventas.push(venta);
    state.produccionHoy.kgVendidos += kgTortilla;
    _save();
    return venta;
  }

  function ventasDelDia() {
    const hoy = _today();
    return state.ventas.filter(v => v.fecha.slice(0, 10) === hoy);
  }

  function totalDelDia() {
    return ventasDelDia().reduce((acc, v) => acc + v.total, 0);
  }

  // ============================================================
  // 8. Configuración y reset
  // ============================================================
  function getConfig() { return { ...state.config }; }
  function setConfig(patch) {
    state.config = { ...state.config, ...patch };
    _save();
    return state.config;
  }

  function resetDia() {
    state.produccionHoy = { fecha: _today(), kgProducidos: 0, kgVendidos: 0, kgReservados: 0 };
    state.cupos = state.cupos.filter(c => c.fecha === _today());
    _save();
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    state = {
      config: { ...DEFAULT_CONFIG },
      catalogo: [],
      produccionHoy: { fecha: _today(), kgProducidos: 0, kgVendidos: 0, kgReservados: 0 },
      cupos: [], suscripciones: [], ventas: [], clientes: []
    };
    _save();
  }

  // ============================================================
  // 9. Inicialización y exposición pública
  // ============================================================
  _load();

  global.TortilleriaAPI = {
    // catálogo
    getCatalogo, setPrecio, agregarProducto,
    // producción
    registrarProduccion, disponibleHoy, resumenProduccion,
    // cupos
    reservarCupo, cancelarCupo, entregarCupo, listarCupos,
    // suscripciones
    crearSuscripcion, pausarSuscripcion, suscripcionesActivas,
    // ventas
    nuevaVenta, ventasDelDia, totalDelDia,
    // config
    getConfig, setConfig, resetDia, resetAll,
    // meta
    version: '1.0.0',
    vertical: 'tortilleria'
  };

  console.log('[Volvix] Vertical Tortillería cargado:', global.TortilleriaAPI.version);
})(typeof window !== 'undefined' ? window : globalThis);
