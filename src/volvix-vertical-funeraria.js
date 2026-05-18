/**
 * volvix-vertical-funeraria.js
 * Vertical POS para Funerarias / Servicios Funerarios
 * Expone: window.FunerariaAPI
 *
 * Capacidades:
 *  - Catálogo de servicios funerarios individuales
 *  - Paquetes (combos) configurables
 *  - Planes anticipados (pago a plazos / prepago)
 *  - Agenda de capilla/velatorio (slots por sala)
 *  - Gestión de expediente del finado
 *  - Cotización y conversión a venta POS
 *  - Persistencia en localStorage (clave: volvix_funeraria_v1)
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_funeraria_v1';
  const VERSION = '1.0.0';

  // ───────────────────────────── Estado ─────────────────────────────
  const state = {
    servicios: [],
    paquetes: [],
    planes: [],
    expedientes: [],
    agenda: [],          // reservas de capilla
    salas: [],           // capillas/velatorios disponibles
    cotizaciones: [],
    ventas: [],
    contadores: { exp: 1, cot: 1, vta: 1, plan: 1, res: 1 }
  };

  // ─────────────────────── Persistencia local ───────────────────────
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[Funeraria] save fail:', e); }
  }
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _seed();
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch (e) {
      console.warn('[Funeraria] load fail, seeding:', e);
      _seed();
    }
  }

  function _seed() {
    state.salas = [
      { id: 'S1', nombre: 'Capilla San Rafael', capacidad: 80 },
      { id: 'S2', nombre: 'Capilla Los Ángeles', capacidad: 50 },
      { id: 'S3', nombre: 'Sala de Velación VIP', capacidad: 120 }
    ];
    state.servicios = [
      { id: 'SV001', nombre: 'Ataúd Madera Roble',           categoria: 'ataud',     precio: 18500 },
      { id: 'SV002', nombre: 'Ataúd Metálico Premium',       categoria: 'ataud',     precio: 32000 },
      { id: 'SV003', nombre: 'Urna Cineraria Mármol',        categoria: 'urna',      precio:  4200 },
      { id: 'SV004', nombre: 'Servicio de Cremación',        categoria: 'cremacion', precio: 12000 },
      { id: 'SV005', nombre: 'Embalsamamiento',              categoria: 'preparacion', precio: 6500 },
      { id: 'SV006', nombre: 'Maquillaje Tanatopráctico',    categoria: 'preparacion', precio: 2500 },
      { id: 'SV007', nombre: 'Carroza Fúnebre (traslado)',   categoria: 'traslado',  precio:  3800 },
      { id: 'SV008', nombre: 'Velación 24h en capilla',      categoria: 'velacion',  precio:  5500 },
      { id: 'SV009', nombre: 'Arreglo Floral Premium',       categoria: 'flores',    precio:  2200 },
      { id: 'SV010', nombre: 'Esquela en periódico',         categoria: 'avisos',    precio:  1500 },
      { id: 'SV011', nombre: 'Trámite acta de defunción',    categoria: 'tramites',  precio:   900 },
      { id: 'SV012', nombre: 'Misa de cuerpo presente',      categoria: 'religioso', precio:  2000 }
    ];
    state.paquetes = [
      {
        id: 'PQ-BASICO',
        nombre: 'Paquete Tradicional Básico',
        descripcion: 'Ataúd madera + velación 24h + traslado + trámites',
        items: ['SV001', 'SV008', 'SV007', 'SV011'],
        descuento: 0.10
      },
      {
        id: 'PQ-PREMIUM',
        nombre: 'Paquete Premium',
        descripcion: 'Ataúd metálico + preparación completa + velación + flores + misa',
        items: ['SV002', 'SV005', 'SV006', 'SV008', 'SV009', 'SV012'],
        descuento: 0.15
      },
      {
        id: 'PQ-CREMA',
        nombre: 'Paquete Cremación Digna',
        descripcion: 'Cremación + urna + velación breve + esquela',
        items: ['SV004', 'SV003', 'SV008', 'SV010'],
        descuento: 0.12
      }
    ];
    _save();
  }

  // ─────────────────────────── Helpers ──────────────────────────────
  function _id(prefix, key) {
    const n = state.contadores[key]++;
    _save();
    return `${prefix}-${String(n).padStart(5, '0')}`;
  }
  function _findServicio(id) { return state.servicios.find(s => s.id === id); }
  function _findPaquete(id)  { return state.paquetes.find(p => p.id === id); }

  // ─────────────────────── Cálculo de precios ───────────────────────
  function calcularPaquete(paqueteId) {
    const pq = _findPaquete(paqueteId);
    if (!pq) throw new Error('Paquete no existe: ' + paqueteId);
    const subtotal = pq.items.reduce((acc, sid) => {
      const s = _findServicio(sid);
      return acc + (s ? s.precio : 0);
    }, 0);
    const descuento = +(subtotal * pq.descuento).toFixed(2);
    const total = +(subtotal - descuento).toFixed(2);
    return { paqueteId, subtotal, descuento, total, items: pq.items };
  }

  // ───────────────────────── Expedientes ────────────────────────────
  function crearExpediente({ finado, familiarResponsable, telefono, observaciones }) {
    if (!finado || !familiarResponsable) throw new Error('finado y familiarResponsable son requeridos');
    const exp = {
      id: _id('EXP', 'exp'),
      finado,
      familiarResponsable,
      telefono: telefono || '',
      observaciones: observaciones || '',
      creadoEn: new Date().toISOString(),
      estado: 'abierto'
    };
    state.expedientes.push(exp);
    _save();
    return exp;
  }
  function listarExpedientes(filtro = {}) {
    return state.expedientes.filter(e =>
      (!filtro.estado || e.estado === filtro.estado)
    );
  }
  function cerrarExpediente(id) {
    const e = state.expedientes.find(x => x.id === id);
    if (!e) throw new Error('Expediente no existe');
    e.estado = 'cerrado';
    e.cerradoEn = new Date().toISOString();
    _save();
    return e;
  }

  // ───────────────────────── Cotizaciones ───────────────────────────
  function crearCotizacion({ expedienteId, items = [], paqueteId = null, descuentoExtra = 0 }) {
    let subtotal = 0;
    const detalle = [];
    if (paqueteId) {
      const calc = calcularPaquete(paqueteId);
      subtotal += calc.total;
      detalle.push({ tipo: 'paquete', ref: paqueteId, monto: calc.total });
    }
    items.forEach(it => {
      const s = _findServicio(it.servicioId);
      if (!s) return;
      const cant = it.cantidad || 1;
      const monto = s.precio * cant;
      subtotal += monto;
      detalle.push({ tipo: 'servicio', ref: s.id, cantidad: cant, monto });
    });
    const total = +(subtotal - descuentoExtra).toFixed(2);
    const cot = {
      id: _id('COT', 'cot'),
      expedienteId: expedienteId || null,
      detalle,
      subtotal: +subtotal.toFixed(2),
      descuentoExtra,
      total,
      estado: 'pendiente',
      creadoEn: new Date().toISOString()
    };
    state.cotizaciones.push(cot);
    _save();
    return cot;
  }

  function convertirCotizacionAVenta(cotizacionId, { metodoPago = 'efectivo' } = {}) {
    const cot = state.cotizaciones.find(c => c.id === cotizacionId);
    if (!cot) throw new Error('Cotización no existe');
    if (cot.estado !== 'pendiente') throw new Error('Cotización ya procesada');
    const venta = {
      id: _id('VTA', 'vta'),
      cotizacionId,
      expedienteId: cot.expedienteId,
      total: cot.total,
      metodoPago,
      fecha: new Date().toISOString()
    };
    cot.estado = 'facturada';
    state.ventas.push(venta);
    _save();
    return venta;
  }

  // ─────────────────────── Planes anticipados ───────────────────────
  function crearPlanAnticipado({ titular, paqueteId, plazoMeses = 12, enganche = 0 }) {
    const calc = calcularPaquete(paqueteId);
    const saldo = +(calc.total - enganche).toFixed(2);
    const mensualidad = +(saldo / plazoMeses).toFixed(2);
    const plan = {
      id: _id('PLN', 'plan'),
      titular,
      paqueteId,
      total: calc.total,
      enganche,
      saldo,
      plazoMeses,
      mensualidad,
      pagos: enganche > 0
        ? [{ fecha: new Date().toISOString(), monto: enganche, concepto: 'enganche' }]
        : [],
      estado: 'activo',
      creadoEn: new Date().toISOString()
    };
    state.planes.push(plan);
    _save();
    return plan;
  }
  function abonarPlan(planId, monto) {
    const p = state.planes.find(x => x.id === planId);
    if (!p) throw new Error('Plan no existe');
    if (monto <= 0) throw new Error('Monto inválido');
    p.pagos.push({ fecha: new Date().toISOString(), monto, concepto: 'mensualidad' });
    p.saldo = +(p.saldo - monto).toFixed(2);
    if (p.saldo <= 0) { p.saldo = 0; p.estado = 'liquidado'; }
    _save();
    return p;
  }

  // ───────────────────────── Agenda capilla ─────────────────────────
  function _solapan(aIni, aFin, bIni, bFin) {
    return new Date(aIni) < new Date(bFin) && new Date(bIni) < new Date(aFin);
  }
  function reservarCapilla({ salaId, expedienteId, inicio, fin, contacto }) {
    const sala = state.salas.find(s => s.id === salaId);
    if (!sala) throw new Error('Sala no existe');
    if (!inicio || !fin) throw new Error('inicio y fin requeridos (ISO date)');
    if (new Date(inicio) >= new Date(fin)) throw new Error('Rango inválido');
    const choque = state.agenda.find(r =>
      r.salaId === salaId && r.estado === 'confirmada' &&
      _solapan(r.inicio, r.fin, inicio, fin)
    );
    if (choque) throw new Error('Sala ocupada en ese horario: ' + choque.id);
    const res = {
      id: _id('RES', 'res'),
      salaId, expedienteId,
      inicio, fin,
      contacto: contacto || '',
      estado: 'confirmada',
      creadoEn: new Date().toISOString()
    };
    state.agenda.push(res);
    _save();
    return res;
  }
  function cancelarReserva(id) {
    const r = state.agenda.find(x => x.id === id);
    if (!r) throw new Error('Reserva no existe');
    r.estado = 'cancelada';
    _save();
    return r;
  }
  function disponibilidadSala(salaId, fechaISO) {
    const dia = fechaISO.slice(0, 10);
    return state.agenda
      .filter(r => r.salaId === salaId && r.estado === 'confirmada' && r.inicio.startsWith(dia))
      .map(r => ({ id: r.id, inicio: r.inicio, fin: r.fin }));
  }

  // ───────────────────────── Reportes rápidos ───────────────────────
  function reporteVentas({ desde, hasta } = {}) {
    const d = desde ? new Date(desde) : new Date(0);
    const h = hasta ? new Date(hasta) : new Date('2999-12-31');
    const items = state.ventas.filter(v => {
      const f = new Date(v.fecha);
      return f >= d && f <= h;
    });
    const total = items.reduce((a, v) => a + v.total, 0);
    return { conteo: items.length, total: +total.toFixed(2), ventas: items };
  }
  function planesMorosos() {
    return state.planes.filter(p => p.estado === 'activo' && p.saldo > 0);
  }

  // ───────────────────────────── API ────────────────────────────────
  const FunerariaAPI = {
    version: VERSION,
    // catálogos
    listarServicios:  () => state.servicios.slice(),
    listarPaquetes:   () => state.paquetes.slice(),
    listarSalas:      () => state.salas.slice(),
    calcularPaquete,
    // expedientes
    crearExpediente, listarExpedientes, cerrarExpediente,
    // cotización / venta
    crearCotizacion, convertirCotizacionAVenta,
    listarCotizaciones: () => state.cotizaciones.slice(),
    listarVentas: () => state.ventas.slice(),
    // planes anticipados
    crearPlanAnticipado, abonarPlan,
    listarPlanes: () => state.planes.slice(),
    planesMorosos,
    // agenda
    reservarCapilla, cancelarReserva, disponibilidadSala,
    listarAgenda: () => state.agenda.slice(),
    // reportes
    reporteVentas,
    // utilidades
    _resetDemo: () => { localStorage.removeItem(STORAGE_KEY); _seed(); },
    _dump: () => JSON.parse(JSON.stringify(state))
  };

  // ───────────────────────── Bootstrap ──────────────────────────────
  _load();
  global.FunerariaAPI = FunerariaAPI;
  console.log('[Volvix Vertical Funeraria] cargada v' + VERSION);
})(typeof window !== 'undefined' ? window : globalThis);
