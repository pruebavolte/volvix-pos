/**
 * volvix-vertical-dental.js
 * Vertical POS para clínicas dentales.
 * Expone: window.DentalAPI
 *
 * Módulos:
 *   - Pacientes (ficha clínica + historial)
 *   - Odontograma (32 piezas adulto / 20 pediátrico)
 *   - Tratamientos (catálogo + asignación)
 *   - Presupuestos (cotizaciones por paciente)
 *   - Planes de pago (cuotas, abonos, saldos)
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_dental_db_v1';

  // ──────────────────────────────────────────────────────────────
  // Catálogo base de tratamientos dentales
  // ──────────────────────────────────────────────────────────────
  const CATALOGO_DEFAULT = [
    { codigo: 'CONS-01', nombre: 'Consulta general',          precio: 250,   duracionMin: 20 },
    { codigo: 'LIMP-01', nombre: 'Limpieza dental (profilaxis)', precio: 600, duracionMin: 45 },
    { codigo: 'RX-PER',  nombre: 'Radiografía periapical',    precio: 180,   duracionMin: 10 },
    { codigo: 'RX-PAN',  nombre: 'Radiografía panorámica',    precio: 450,   duracionMin: 15 },
    { codigo: 'RES-01',  nombre: 'Resina compuesta (1 cara)', precio: 800,   duracionMin: 40 },
    { codigo: 'RES-02',  nombre: 'Resina compuesta (2 caras)',precio: 1100,  duracionMin: 50 },
    { codigo: 'AMG-01',  nombre: 'Amalgama',                   precio: 700,   duracionMin: 40 },
    { codigo: 'EXT-S',   nombre: 'Extracción simple',          precio: 900,   duracionMin: 30 },
    { codigo: 'EXT-Q',   nombre: 'Extracción quirúrgica',      precio: 2200,  duracionMin: 60 },
    { codigo: 'END-1',   nombre: 'Endodoncia unirradicular',   precio: 2800,  duracionMin: 60 },
    { codigo: 'END-2',   nombre: 'Endodoncia birradicular',    precio: 3500,  duracionMin: 80 },
    { codigo: 'END-3',   nombre: 'Endodoncia multirradicular', precio: 4500,  duracionMin: 100 },
    { codigo: 'COR-PFM', nombre: 'Corona porcelana/metal',     precio: 5500,  duracionMin: 90 },
    { codigo: 'COR-ZIR', nombre: 'Corona de zirconio',         precio: 8500,  duracionMin: 90 },
    { codigo: 'BLN-01',  nombre: 'Blanqueamiento en consultorio', precio: 3500, duracionMin: 60 },
    { codigo: 'ORT-MEN', nombre: 'Ortodoncia (mensualidad)',   precio: 850,   duracionMin: 30 },
    { codigo: 'IMP-01',  nombre: 'Implante dental (titanio)',  precio: 18000, duracionMin: 120 },
    { codigo: 'PRT-PAR', nombre: 'Prótesis parcial removible', precio: 6500,  duracionMin: 60 },
    { codigo: 'PRT-TOT', nombre: 'Prótesis total',             precio: 12000, duracionMin: 90 }
  ];

  // Estado FDI estándar de cada pieza dental
  const ESTADOS_PIEZA = ['sano','caries','obturado','endodoncia','corona','extraido','ausente','implante','fractura'];

  // Numeración FDI adulto (cuadrantes 1-4) y pediátrico (5-8)
  const PIEZAS_ADULTO = [
    11,12,13,14,15,16,17,18, 21,22,23,24,25,26,27,28,
    31,32,33,34,35,36,37,38, 41,42,43,44,45,46,47,48
  ];
  const PIEZAS_PEDIATRICO = [
    51,52,53,54,55, 61,62,63,64,65,
    71,72,73,74,75, 81,82,83,84,85
  ];

  // ──────────────────────────────────────────────────────────────
  // DB en memoria (con persistencia opcional a localStorage)
  // ──────────────────────────────────────────────────────────────
  const db = {
    pacientes:    [],
    odontogramas: {},   // pacienteId -> { piezas: { '11': {estado, nota}, ... } }
    tratamientos: [],   // historial: { id, pacienteId, codigo, pieza, fecha, costo, estado }
    presupuestos: [],   // { id, pacienteId, fecha, items, total, estado }
    planesPago:   [],   // { id, presupuestoId, cuotas:[{n, monto, vence, pagado}] }
    catalogo:     CATALOGO_DEFAULT.slice(),
    _seq:         { paciente: 1, trat: 1, presup: 1, plan: 1 }
  };

  function _persist() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (_) {}
  }
  function _restore() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      Object.assign(db, parsed);
    } catch (_) {}
  }
  _restore();

  function _id(kind) { return db._seq[kind]++; }
  function _now() { return new Date().toISOString(); }

  // ──────────────────────────────────────────────────────────────
  // PACIENTES
  // ──────────────────────────────────────────────────────────────
  function crearPaciente(data) {
    if (!data || !data.nombre) throw new Error('Nombre del paciente es requerido');
    const p = {
      id:           _id('paciente'),
      nombre:       data.nombre,
      apellidos:    data.apellidos || '',
      fechaNac:     data.fechaNac  || null,
      genero:       data.genero    || null,
      telefono:     data.telefono  || '',
      email:        data.email     || '',
      direccion:    data.direccion || '',
      alergias:     data.alergias  || [],
      antecedentes: data.antecedentes || '',
      medicacion:   data.medicacion || '',
      notas:        data.notas     || '',
      pediatrico:   !!data.pediatrico,
      creado:       _now()
    };
    db.pacientes.push(p);
    // odontograma vacío
    db.odontogramas[p.id] = { piezas: {} };
    const piezas = p.pediatrico ? PIEZAS_PEDIATRICO : PIEZAS_ADULTO;
    piezas.forEach(n => { db.odontogramas[p.id].piezas[n] = { estado: 'sano', nota: '' }; });
    _persist();
    return p;
  }
  function listarPacientes(filtro) {
    if (!filtro) return db.pacientes.slice();
    const q = String(filtro).toLowerCase();
    return db.pacientes.filter(p =>
      (p.nombre + ' ' + p.apellidos).toLowerCase().includes(q) ||
      (p.telefono || '').includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }
  function obtenerPaciente(id) {
    return db.pacientes.find(p => p.id === Number(id)) || null;
  }
  function actualizarPaciente(id, cambios) {
    const p = obtenerPaciente(id);
    if (!p) throw new Error('Paciente no encontrado: ' + id);
    Object.assign(p, cambios, { id: p.id });
    _persist();
    return p;
  }
  function eliminarPaciente(id) {
    const i = db.pacientes.findIndex(p => p.id === Number(id));
    if (i < 0) return false;
    db.pacientes.splice(i, 1);
    delete db.odontogramas[id];
    _persist();
    return true;
  }

  // ──────────────────────────────────────────────────────────────
  // ODONTOGRAMA
  // ──────────────────────────────────────────────────────────────
  function obtenerOdontograma(pacienteId) {
    return db.odontogramas[pacienteId] || null;
  }
  function marcarPieza(pacienteId, numPieza, estado, nota) {
    if (!ESTADOS_PIEZA.includes(estado)) throw new Error('Estado inválido: ' + estado);
    const odo = db.odontogramas[pacienteId];
    if (!odo) throw new Error('Paciente sin odontograma');
    odo.piezas[numPieza] = { estado, nota: nota || '', actualizado: _now() };
    _persist();
    return odo.piezas[numPieza];
  }
  function resumenOdontograma(pacienteId) {
    const odo = obtenerOdontograma(pacienteId);
    if (!odo) return null;
    const r = { total: 0 };
    ESTADOS_PIEZA.forEach(e => r[e] = 0);
    Object.values(odo.piezas).forEach(p => { r[p.estado] = (r[p.estado] || 0) + 1; r.total++; });
    return r;
  }

  // ──────────────────────────────────────────────────────────────
  // TRATAMIENTOS
  // ──────────────────────────────────────────────────────────────
  function buscarTratamientoCatalogo(codigo) {
    return db.catalogo.find(t => t.codigo === codigo) || null;
  }
  function listarCatalogo() { return db.catalogo.slice(); }
  function agregarAlCatalogo(item) {
    if (!item.codigo || !item.nombre || typeof item.precio !== 'number')
      throw new Error('codigo, nombre y precio son obligatorios');
    if (buscarTratamientoCatalogo(item.codigo)) throw new Error('Código ya existe');
    db.catalogo.push(Object.assign({ duracionMin: 30 }, item));
    _persist();
    return item;
  }
  function registrarTratamiento(pacienteId, codigo, pieza, opts) {
    opts = opts || {};
    const cat = buscarTratamientoCatalogo(codigo);
    if (!cat) throw new Error('Tratamiento no en catálogo: ' + codigo);
    if (!obtenerPaciente(pacienteId)) throw new Error('Paciente no existe');
    const t = {
      id:          _id('trat'),
      pacienteId:  Number(pacienteId),
      codigo:      codigo,
      nombre:      cat.nombre,
      pieza:       pieza || null,
      fecha:       opts.fecha || _now(),
      costo:       typeof opts.costo === 'number' ? opts.costo : cat.precio,
      estado:      opts.estado || 'realizado', // realizado | pendiente | cancelado
      observaciones: opts.observaciones || '',
      doctor:      opts.doctor || ''
    };
    db.tratamientos.push(t);
    _persist();
    return t;
  }
  function historialTratamientos(pacienteId) {
    return db.tratamientos.filter(t => t.pacienteId === Number(pacienteId));
  }

  // ──────────────────────────────────────────────────────────────
  // PRESUPUESTOS
  // ──────────────────────────────────────────────────────────────
  function crearPresupuesto(pacienteId, items, opts) {
    opts = opts || {};
    if (!obtenerPaciente(pacienteId)) throw new Error('Paciente no existe');
    if (!Array.isArray(items) || !items.length) throw new Error('Items requeridos');
    const detalle = items.map(it => {
      const cat = buscarTratamientoCatalogo(it.codigo);
      const precioBase = typeof it.precio === 'number' ? it.precio : (cat ? cat.precio : 0);
      const cantidad = it.cantidad || 1;
      return {
        codigo:   it.codigo,
        nombre:   it.nombre || (cat ? cat.nombre : it.codigo),
        pieza:    it.pieza || null,
        cantidad: cantidad,
        precio:   precioBase,
        subtotal: precioBase * cantidad
      };
    });
    const subtotal = detalle.reduce((s, d) => s + d.subtotal, 0);
    const descuento = opts.descuento || 0;
    const total = Math.max(0, subtotal - descuento);
    const presup = {
      id:         _id('presup'),
      pacienteId: Number(pacienteId),
      fecha:      _now(),
      items:      detalle,
      subtotal:   subtotal,
      descuento:  descuento,
      total:      total,
      estado:     'borrador',  // borrador | aprobado | rechazado | pagado
      validezDias: opts.validezDias || 30,
      notas:      opts.notas || ''
    };
    db.presupuestos.push(presup);
    _persist();
    return presup;
  }
  function listarPresupuestos(pacienteId) {
    if (pacienteId == null) return db.presupuestos.slice();
    return db.presupuestos.filter(p => p.pacienteId === Number(pacienteId));
  }
  function aprobarPresupuesto(id) {
    const p = db.presupuestos.find(x => x.id === Number(id));
    if (!p) throw new Error('Presupuesto no encontrado');
    p.estado = 'aprobado';
    _persist();
    return p;
  }

  // ──────────────────────────────────────────────────────────────
  // PLANES DE PAGO
  // ──────────────────────────────────────────────────────────────
  function crearPlanPago(presupuestoId, numCuotas, opts) {
    opts = opts || {};
    const presup = db.presupuestos.find(x => x.id === Number(presupuestoId));
    if (!presup) throw new Error('Presupuesto no encontrado');
    if (presup.estado === 'borrador') aprobarPresupuesto(presup.id);
    const n = Math.max(1, Number(numCuotas) || 1);
    const enganche = opts.enganche || 0;
    const restante = Math.max(0, presup.total - enganche);
    const montoCuota = Math.round((restante / n) * 100) / 100;
    const inicio = opts.fechaInicio ? new Date(opts.fechaInicio) : new Date();
    const cuotas = [];
    if (enganche > 0) {
      cuotas.push({ n: 0, monto: enganche, vence: inicio.toISOString(), pagado: !!opts.engancheCobrado, fechaPago: opts.engancheCobrado ? _now() : null, tipo: 'enganche' });
    }
    for (let i = 1; i <= n; i++) {
      const v = new Date(inicio);
      v.setMonth(v.getMonth() + i);
      cuotas.push({ n: i, monto: montoCuota, vence: v.toISOString(), pagado: false, fechaPago: null, tipo: 'cuota' });
    }
    const plan = {
      id:            _id('plan'),
      presupuestoId: presup.id,
      pacienteId:    presup.pacienteId,
      total:         presup.total,
      enganche:      enganche,
      numCuotas:     n,
      cuotas:        cuotas,
      creado:        _now()
    };
    db.planesPago.push(plan);
    _persist();
    return plan;
  }
  function pagarCuota(planId, numCuota, opts) {
    opts = opts || {};
    const plan = db.planesPago.find(p => p.id === Number(planId));
    if (!plan) throw new Error('Plan no encontrado');
    const cuota = plan.cuotas.find(c => c.n === Number(numCuota));
    if (!cuota) throw new Error('Cuota no encontrada');
    if (cuota.pagado) throw new Error('Cuota ya pagada');
    cuota.pagado = true;
    cuota.fechaPago = opts.fecha || _now();
    cuota.metodo = opts.metodo || 'efectivo';
    cuota.referencia = opts.referencia || null;
    _persist();
    return cuota;
  }
  function saldoPlan(planId) {
    const plan = db.planesPago.find(p => p.id === Number(planId));
    if (!plan) return null;
    let pagado = 0, pendiente = 0;
    plan.cuotas.forEach(c => { if (c.pagado) pagado += c.monto; else pendiente += c.monto; });
    return { total: plan.total, pagado: Math.round(pagado*100)/100, pendiente: Math.round(pendiente*100)/100 };
  }
  function listarPlanesPago(pacienteId) {
    if (pacienteId == null) return db.planesPago.slice();
    return db.planesPago.filter(p => p.pacienteId === Number(pacienteId));
  }

  // ──────────────────────────────────────────────────────────────
  // Utilidades
  // ──────────────────────────────────────────────────────────────
  function exportarDB() { return JSON.parse(JSON.stringify(db)); }
  function importarDB(data) {
    if (!data || typeof data !== 'object') throw new Error('Data inválida');
    Object.keys(db).forEach(k => delete db[k]);
    Object.assign(db, data);
    _persist();
    return true;
  }
  function resetDB() {
    db.pacientes = []; db.odontogramas = {}; db.tratamientos = [];
    db.presupuestos = []; db.planesPago = [];
    db.catalogo = CATALOGO_DEFAULT.slice();
    db._seq = { paciente: 1, trat: 1, presup: 1, plan: 1 };
    _persist();
    return true;
  }

  // ──────────────────────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────────────────────
  global.DentalAPI = {
    // pacientes
    crearPaciente, listarPacientes, obtenerPaciente, actualizarPaciente, eliminarPaciente,
    // odontograma
    obtenerOdontograma, marcarPieza, resumenOdontograma,
    PIEZAS_ADULTO, PIEZAS_PEDIATRICO, ESTADOS_PIEZA,
    // tratamientos
    listarCatalogo, agregarAlCatalogo, buscarTratamientoCatalogo,
    registrarTratamiento, historialTratamientos,
    // presupuestos
    crearPresupuesto, listarPresupuestos, aprobarPresupuesto,
    // planes de pago
    crearPlanPago, pagarCuota, saldoPlan, listarPlanesPago,
    // utilidades
    exportarDB, importarDB, resetDB,
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : globalThis);
