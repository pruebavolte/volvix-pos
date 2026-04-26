/**
 * VOLVIX VERTICAL — OPTOMETRÍA
 * Módulo POS especializado para ópticas / consultorios de optometría.
 * Cubre: pacientes con graduación, monturas, lentes (mica), exámenes
 * visuales, prescripciones (Rx) y venta integrada al POS.
 *
 * Expone window.OptometriaAPI con métodos públicos.
 *
 * Persistencia: localStorage bajo el namespace "volvix_optometria_v1".
 *  - patients          → pacientes y su historial
 *  - frames            → catálogo de monturas
 *  - lenses            → catálogo de lentes / micas
 *  - exams             → exámenes visuales realizados
 *  - prescriptions     → recetas (Rx) generadas
 *  - orders            → órdenes de trabajo (paciente + montura + lente)
 */
(function (global) {
  'use strict';

  const NS = 'volvix_optometria_v1';
  const now = () => new Date().toISOString();
  const uid = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  // ───────────────────────────── Storage helpers ─────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(NS);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      ['patients', 'frames', 'lenses', 'exams', 'prescriptions', 'orders']
        .forEach((k) => { if (!Array.isArray(data[k])) data[k] = []; });
      return data;
    } catch (e) {
      console.warn('[Optometria] storage corrupto, regenerando:', e);
      return seed();
    }
  }
  function save(db) {
    localStorage.setItem(NS, JSON.stringify(db));
    return db;
  }
  function seed() {
    const db = {
      patients: [],
      frames: [
        { id: uid('frm'), sku: 'MNT-001', marca: 'Ray-Ban', modelo: 'Wayfarer', material: 'Acetato', color: 'Negro', precio: 2400, stock: 5 },
        { id: uid('frm'), sku: 'MNT-002', marca: 'Oakley',  modelo: 'Holbrook', material: 'O-Matter', color: 'Mate',  precio: 3100, stock: 3 }
      ],
      lenses: [
        { id: uid('lns'), sku: 'LNS-CR39', tipo: 'Monofocal', material: 'CR-39',        tratamiento: 'AR', precio: 850,  stock: 20 },
        { id: uid('lns'), sku: 'LNS-PROG', tipo: 'Progresivo', material: 'Policarbonato', tratamiento: 'AR+Blue', precio: 2600, stock: 8 }
      ],
      exams: [],
      prescriptions: [],
      orders: [],
      meta: { created: now(), version: 1 }
    };
    return save(db);
  }

  let DB = load();

  // ───────────────────────────── Pacientes ─────────────────────────────
  function addPatient({ nombre, apellidos = '', telefono = '', email = '', fechaNac = '', notas = '' }) {
    if (!nombre) throw new Error('nombre requerido');
    const p = {
      id: uid('pat'),
      nombre, apellidos, telefono, email, fechaNac, notas,
      createdAt: now(),
      updatedAt: now(),
      historial: []
    };
    DB.patients.push(p); save(DB); return p;
  }
  function updatePatient(id, patch) {
    const p = DB.patients.find((x) => x.id === id);
    if (!p) throw new Error('paciente no encontrado');
    Object.assign(p, patch, { updatedAt: now() });
    save(DB); return p;
  }
  function getPatient(id) { return DB.patients.find((x) => x.id === id) || null; }
  function listPatients(q = '') {
    if (!q) return DB.patients.slice();
    const s = q.toLowerCase();
    return DB.patients.filter((p) =>
      [p.nombre, p.apellidos, p.telefono, p.email].join(' ').toLowerCase().includes(s));
  }
  function deletePatient(id) {
    const i = DB.patients.findIndex((x) => x.id === id);
    if (i < 0) return false;
    DB.patients.splice(i, 1); save(DB); return true;
  }

  // ───────────────────────────── Catálogo: monturas ─────────────────────────────
  function addFrame(f) {
    if (!f || !f.sku || !f.modelo) throw new Error('sku y modelo requeridos');
    const item = Object.assign({ id: uid('frm'), stock: 0, precio: 0 }, f);
    DB.frames.push(item); save(DB); return item;
  }
  function updateFrame(id, patch) {
    const f = DB.frames.find((x) => x.id === id);
    if (!f) throw new Error('montura no encontrada');
    Object.assign(f, patch); save(DB); return f;
  }
  function listFrames(q = '') {
    if (!q) return DB.frames.slice();
    const s = q.toLowerCase();
    return DB.frames.filter((f) => [f.sku, f.marca, f.modelo, f.color].join(' ').toLowerCase().includes(s));
  }
  function deleteFrame(id) {
    const i = DB.frames.findIndex((x) => x.id === id);
    if (i < 0) return false;
    DB.frames.splice(i, 1); save(DB); return true;
  }

  // ───────────────────────────── Catálogo: lentes / micas ─────────────────────────────
  function addLens(l) {
    if (!l || !l.sku || !l.tipo) throw new Error('sku y tipo requeridos');
    const item = Object.assign({ id: uid('lns'), stock: 0, precio: 0 }, l);
    DB.lenses.push(item); save(DB); return item;
  }
  function updateLens(id, patch) {
    const l = DB.lenses.find((x) => x.id === id);
    if (!l) throw new Error('lente no encontrado');
    Object.assign(l, patch); save(DB); return l;
  }
  function listLenses(q = '') {
    if (!q) return DB.lenses.slice();
    const s = q.toLowerCase();
    return DB.lenses.filter((l) => [l.sku, l.tipo, l.material, l.tratamiento].join(' ').toLowerCase().includes(s));
  }
  function deleteLens(id) {
    const i = DB.lenses.findIndex((x) => x.id === id);
    if (i < 0) return false;
    DB.lenses.splice(i, 1); save(DB); return true;
  }

  // ───────────────────────────── Examen visual ─────────────────────────────
  /**
   * Estructura típica de graduación por ojo:
   *  { esfera, cilindro, eje, adicion, dip, agudezaVisual }
   */
  function createExam({ patientId, optometrista = '', motivo = '', od = {}, oi = {}, observaciones = '' }) {
    const p = getPatient(patientId);
    if (!p) throw new Error('paciente no existe');
    const exam = {
      id: uid('exm'),
      patientId,
      fecha: now(),
      optometrista,
      motivo,
      od: normalizeEye(od),
      oi: normalizeEye(oi),
      observaciones
    };
    DB.exams.push(exam);
    p.historial.push({ tipo: 'examen', refId: exam.id, fecha: exam.fecha });
    p.updatedAt = now();
    save(DB);
    return exam;
  }
  function normalizeEye(e) {
    return {
      esfera: numOrNull(e.esfera),
      cilindro: numOrNull(e.cilindro),
      eje: numOrNull(e.eje),
      adicion: numOrNull(e.adicion),
      dip: numOrNull(e.dip),
      agudezaVisual: e.agudezaVisual || ''
    };
  }
  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function listExams(patientId) {
    return DB.exams.filter((e) => !patientId || e.patientId === patientId);
  }
  function getExam(id) { return DB.exams.find((e) => e.id === id) || null; }

  // ───────────────────────────── Prescripción (Rx) ─────────────────────────────
  function createPrescription({ examId, vigenciaMeses = 12, recomendaciones = '' }) {
    const exam = getExam(examId);
    if (!exam) throw new Error('examen no existe');
    const rx = {
      id: uid('rx'),
      examId,
      patientId: exam.patientId,
      fecha: now(),
      od: exam.od,
      oi: exam.oi,
      vigenciaMeses,
      recomendaciones,
      folio: 'RX-' + Date.now().toString().slice(-8)
    };
    DB.prescriptions.push(rx);
    const p = getPatient(exam.patientId);
    if (p) { p.historial.push({ tipo: 'rx', refId: rx.id, fecha: rx.fecha }); p.updatedAt = now(); }
    save(DB);
    return rx;
  }
  function listPrescriptions(patientId) {
    return DB.prescriptions.filter((r) => !patientId || r.patientId === patientId);
  }
  function getPrescription(id) { return DB.prescriptions.find((r) => r.id === id) || null; }

  // ───────────────────────────── Órdenes de trabajo / venta ─────────────────────────────
  function createOrder({ patientId, prescriptionId = null, frameId = null, lensId = null, descuento = 0, notas = '' }) {
    const p = getPatient(patientId);
    if (!p) throw new Error('paciente no existe');
    const frame = frameId ? DB.frames.find((f) => f.id === frameId) : null;
    const lens  = lensId  ? DB.lenses.find((l) => l.id === lensId)  : null;
    if (frameId && !frame) throw new Error('montura no existe');
    if (lensId  && !lens)  throw new Error('lente no existe');

    const items = [];
    if (frame) items.push({ tipo: 'montura', refId: frame.id, descripcion: `${frame.marca || ''} ${frame.modelo}`.trim(), precio: Number(frame.precio) || 0 });
    if (lens)  items.push({ tipo: 'lente',   refId: lens.id,  descripcion: `${lens.tipo} ${lens.material || ''}`.trim(),  precio: Number(lens.precio)  || 0 });

    const subtotal = items.reduce((s, it) => s + it.precio, 0);
    const desc = Math.max(0, Math.min(Number(descuento) || 0, subtotal));
    const total = subtotal - desc;

    const order = {
      id: uid('ord'),
      folio: 'OPT-' + Date.now().toString().slice(-8),
      fecha: now(),
      patientId,
      prescriptionId,
      items,
      subtotal,
      descuento: desc,
      total,
      estatus: 'abierta',
      notas
    };

    if (frame && typeof frame.stock === 'number') frame.stock = Math.max(0, frame.stock - 1);
    if (lens  && typeof lens.stock  === 'number') lens.stock  = Math.max(0, lens.stock  - 1);

    DB.orders.push(order);
    p.historial.push({ tipo: 'orden', refId: order.id, fecha: order.fecha });
    p.updatedAt = now();
    save(DB);
    return order;
  }
  function payOrder(id, { metodo = 'efectivo', monto = 0 } = {}) {
    const o = DB.orders.find((x) => x.id === id);
    if (!o) throw new Error('orden no existe');
    if (Number(monto) < o.total) throw new Error('monto insuficiente');
    o.estatus = 'pagada';
    o.pago = { metodo, monto: Number(monto), fecha: now(), cambio: Number(monto) - o.total };
    save(DB);

    // Integración POS si está disponible
    try {
      if (global.PosAPI && typeof global.PosAPI.registrarVentaExterna === 'function') {
        global.PosAPI.registrarVentaExterna({
          origen: 'optometria',
          folio: o.folio,
          total: o.total,
          metodo,
          items: o.items
        });
      }
    } catch (e) { console.warn('[Optometria] PosAPI no disponible:', e); }
    return o;
  }
  function cancelOrder(id, motivo = '') {
    const o = DB.orders.find((x) => x.id === id);
    if (!o) throw new Error('orden no existe');
    o.estatus = 'cancelada';
    o.cancelacion = { fecha: now(), motivo };
    save(DB);
    return o;
  }
  function listOrders({ patientId, estatus } = {}) {
    return DB.orders.filter((o) =>
      (!patientId || o.patientId === patientId) &&
      (!estatus   || o.estatus   === estatus));
  }

  // ───────────────────────────── Reportes y utilidades ─────────────────────────────
  function reportVentas({ desde, hasta } = {}) {
    const d = desde ? new Date(desde).getTime() : 0;
    const h = hasta ? new Date(hasta).getTime() : Date.now();
    const orders = DB.orders.filter((o) => o.estatus === 'pagada' && {
      t: new Date(o.fecha).getTime()
    }.t >= d && new Date(o.fecha).getTime() <= h);
    const total = orders.reduce((s, o) => s + o.total, 0);
    return {
      cantidad: orders.length,
      total,
      promedio: orders.length ? total / orders.length : 0,
      orders
    };
  }
  function historialPaciente(patientId) {
    const p = getPatient(patientId);
    if (!p) return null;
    return {
      paciente: p,
      examenes: listExams(patientId),
      recetas: listPrescriptions(patientId),
      ordenes: listOrders({ patientId })
    };
  }
  function exportData() { return JSON.parse(JSON.stringify(DB)); }
  function importData(json) {
    if (!json || typeof json !== 'object') throw new Error('json inválido');
    DB = json; save(DB); return true;
  }
  function resetAll() { localStorage.removeItem(NS); DB = load(); return true; }

  // ───────────────────────────── API pública ─────────────────────────────
  global.OptometriaAPI = {
    // pacientes
    addPatient, updatePatient, getPatient, listPatients, deletePatient,
    // monturas
    addFrame, updateFrame, listFrames, deleteFrame,
    // lentes
    addLens, updateLens, listLenses, deleteLens,
    // exámenes
    createExam, listExams, getExam,
    // prescripciones
    createPrescription, listPrescriptions, getPrescription,
    // órdenes
    createOrder, payOrder, cancelOrder, listOrders,
    // utilidades
    reportVentas, historialPaciente, exportData, importData, resetAll,
    // meta
    _version: 1,
    _namespace: NS
  };

  console.info('[Volvix Optometría] módulo cargado. Usa window.OptometriaAPI');
})(typeof window !== 'undefined' ? window : globalThis);
