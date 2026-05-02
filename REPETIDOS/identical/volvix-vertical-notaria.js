/**
 * Volvix Vertical - Notaría
 * Módulo POS especializado para notarías públicas.
 * Maneja trámites, escrituras, citas, expedientes y honorarios.
 *
 * Expone: window.NotariaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Catálogo de trámites notariales
  // ─────────────────────────────────────────────────────────────
  const CATALOGO_TRAMITES = [
    { id: 'TR001', nombre: 'Compraventa de inmueble', categoria: 'escritura', base: 8500, iva: true, dias: 7 },
    { id: 'TR002', nombre: 'Donación entre vivos', categoria: 'escritura', base: 6200, iva: true, dias: 5 },
    { id: 'TR003', nombre: 'Testamento público abierto', categoria: 'escritura', base: 3500, iva: true, dias: 1 },
    { id: 'TR004', nombre: 'Testamento público cerrado', categoria: 'escritura', base: 4200, iva: true, dias: 2 },
    { id: 'TR005', nombre: 'Constitución de sociedad', categoria: 'escritura', base: 12000, iva: true, dias: 10 },
    { id: 'TR006', nombre: 'Acta de protocolización', categoria: 'acta', base: 1800, iva: true, dias: 1 },
    { id: 'TR007', nombre: 'Acta de notificación', categoria: 'acta', base: 1200, iva: true, dias: 1 },
    { id: 'TR008', nombre: 'Poder general', categoria: 'poder', base: 2500, iva: true, dias: 1 },
    { id: 'TR009', nombre: 'Poder especial', categoria: 'poder', base: 1500, iva: true, dias: 1 },
    { id: 'TR010', nombre: 'Revocación de poder', categoria: 'poder', base: 1200, iva: true, dias: 1 },
    { id: 'TR011', nombre: 'Fe de hechos', categoria: 'fe', base: 2800, iva: true, dias: 1 },
    { id: 'TR012', nombre: 'Cotejo de documentos', categoria: 'fe', base: 350, iva: true, dias: 1 },
    { id: 'TR013', nombre: 'Ratificación de firmas', categoria: 'fe', base: 450, iva: true, dias: 1 },
    { id: 'TR014', nombre: 'Adjudicación por herencia', categoria: 'sucesion', base: 9500, iva: true, dias: 15 },
    { id: 'TR015', nombre: 'Liquidación de sociedad conyugal', categoria: 'sucesion', base: 7500, iva: true, dias: 10 },
    { id: 'TR016', nombre: 'Hipoteca', categoria: 'escritura', base: 6800, iva: true, dias: 5 },
    { id: 'TR017', nombre: 'Cancelación de hipoteca', categoria: 'escritura', base: 3200, iva: true, dias: 3 },
    { id: 'TR018', nombre: 'Fideicomiso', categoria: 'escritura', base: 15000, iva: true, dias: 12 },
    { id: 'TR019', nombre: 'Convenio de divorcio', categoria: 'familiar', base: 5500, iva: true, dias: 7 },
    { id: 'TR020', nombre: 'Reconocimiento de hijo', categoria: 'familiar', base: 1800, iva: true, dias: 1 }
  ];

  // ─────────────────────────────────────────────────────────────
  // Stores en memoria (persistencia delegada al host)
  // ─────────────────────────────────────────────────────────────
  const expedientes = new Map();   // numero -> expediente
  const citas = new Map();         // id -> cita
  const escrituras = new Map();    // numero -> escritura
  const clientes = new Map();      // rfc -> cliente
  const tickets = [];              // historial POS

  let consecutivoExpediente = 1000;
  let consecutivoEscritura = 1;
  let consecutivoCita = 1;
  let consecutivoTicket = 1;

  // ─────────────────────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────────────────────
  function nowISO() { return new Date().toISOString(); }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function calcIVA(monto) { return Math.round(monto * 0.16 * 100) / 100; }
  function fmt(n) { return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function buscarTramite(id) {
    return CATALOGO_TRAMITES.find(t => t.id === id) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Clientes
  // ─────────────────────────────────────────────────────────────
  function registrarCliente({ rfc, nombre, direccion = '', telefono = '', email = '', tipo = 'fisica' }) {
    if (!rfc || !nombre) throw new Error('rfc y nombre son obligatorios');
    const cli = {
      rfc: rfc.toUpperCase().trim(),
      nombre: nombre.trim(),
      direccion, telefono, email,
      tipo, // fisica | moral
      creado: nowISO(),
      tramites: []
    };
    clientes.set(cli.rfc, cli);
    return cli;
  }

  function obtenerCliente(rfc) {
    return clientes.get((rfc || '').toUpperCase()) || null;
  }

  function listarClientes() {
    return Array.from(clientes.values());
  }

  // ─────────────────────────────────────────────────────────────
  // Expedientes
  // ─────────────────────────────────────────────────────────────
  function abrirExpediente({ rfcCliente, asunto, tramiteId, notarioId = 'N1', observaciones = '' }) {
    const cli = obtenerCliente(rfcCliente);
    if (!cli) throw new Error('cliente no registrado: ' + rfcCliente);
    const tramite = buscarTramite(tramiteId);
    if (!tramite) throw new Error('trámite inválido: ' + tramiteId);

    const numero = 'EXP-' + (++consecutivoExpediente);
    const exp = {
      numero,
      rfcCliente: cli.rfc,
      cliente: cli.nombre,
      asunto: asunto || tramite.nombre,
      tramiteId,
      tramite: tramite.nombre,
      categoria: tramite.categoria,
      notarioId,
      estado: 'abierto', // abierto | en_proceso | listo | entregado | cancelado
      observaciones,
      documentos: [],
      pagos: [],
      saldo: tramite.base + (tramite.iva ? calcIVA(tramite.base) : 0),
      total: tramite.base + (tramite.iva ? calcIVA(tramite.base) : 0),
      creado: nowISO(),
      actualizado: nowISO()
    };
    expedientes.set(numero, exp);
    cli.tramites.push(numero);
    return exp;
  }

  function actualizarEstadoExpediente(numero, nuevoEstado) {
    const exp = expedientes.get(numero);
    if (!exp) throw new Error('expediente no existe: ' + numero);
    const validos = ['abierto', 'en_proceso', 'listo', 'entregado', 'cancelado'];
    if (!validos.includes(nuevoEstado)) throw new Error('estado inválido: ' + nuevoEstado);
    exp.estado = nuevoEstado;
    exp.actualizado = nowISO();
    return exp;
  }

  function adjuntarDocumento(numero, { tipo, nombre, hash = null }) {
    const exp = expedientes.get(numero);
    if (!exp) throw new Error('expediente no existe');
    const doc = { id: uid('DOC'), tipo, nombre, hash, subido: nowISO() };
    exp.documentos.push(doc);
    exp.actualizado = nowISO();
    return doc;
  }

  function listarExpedientes(filtro = {}) {
    let arr = Array.from(expedientes.values());
    if (filtro.estado) arr = arr.filter(e => e.estado === filtro.estado);
    if (filtro.rfcCliente) arr = arr.filter(e => e.rfcCliente === filtro.rfcCliente.toUpperCase());
    if (filtro.notarioId) arr = arr.filter(e => e.notarioId === filtro.notarioId);
    return arr;
  }

  // ─────────────────────────────────────────────────────────────
  // Citas
  // ─────────────────────────────────────────────────────────────
  function agendarCita({ rfcCliente, fecha, hora, motivo, notarioId = 'N1', duracionMin = 30 }) {
    const cli = obtenerCliente(rfcCliente);
    if (!cli) throw new Error('cliente no registrado');
    if (!fecha || !hora) throw new Error('fecha y hora obligatorias');
    const id = 'CITA-' + (++consecutivoCita);
    const cita = {
      id,
      rfcCliente: cli.rfc,
      cliente: cli.nombre,
      fecha, hora, duracionMin,
      motivo: motivo || 'consulta',
      notarioId,
      estado: 'agendada', // agendada | confirmada | cumplida | cancelada | no_show
      creado: nowISO()
    };
    citas.set(id, cita);
    return cita;
  }

  function cambiarEstadoCita(id, estado) {
    const c = citas.get(id);
    if (!c) throw new Error('cita no existe');
    c.estado = estado;
    return c;
  }

  function citasDelDia(fecha) {
    return Array.from(citas.values()).filter(c => c.fecha === fecha);
  }

  // ─────────────────────────────────────────────────────────────
  // Escrituras (numeración consecutiva)
  // ─────────────────────────────────────────────────────────────
  function generarEscritura({ expedienteNumero, volumen = 1, fojas = 0 }) {
    const exp = expedientes.get(expedienteNumero);
    if (!exp) throw new Error('expediente no existe');
    if (exp.categoria !== 'escritura' && exp.categoria !== 'sucesion') {
      throw new Error('expediente no genera escritura');
    }
    const numero = consecutivoEscritura++;
    const esc = {
      numero,
      volumen,
      fojas,
      expediente: expedienteNumero,
      tramite: exp.tramite,
      otorgantes: [exp.cliente],
      fecha: nowISO(),
      estado: 'firmada' // firmada | inscrita | cancelada
    };
    escrituras.set(numero, esc);
    exp.escrituraNumero = numero;
    exp.actualizado = nowISO();
    return esc;
  }

  function listarEscrituras() {
    return Array.from(escrituras.values()).sort((a, b) => a.numero - b.numero);
  }

  // ─────────────────────────────────────────────────────────────
  // Cobros / POS
  // ─────────────────────────────────────────────────────────────
  function cobrarPago({ expedienteNumero, monto, metodo = 'efectivo', referencia = '' }) {
    const exp = expedientes.get(expedienteNumero);
    if (!exp) throw new Error('expediente no existe');
    if (monto <= 0) throw new Error('monto inválido');
    if (monto > exp.saldo + 0.01) throw new Error('monto excede saldo: ' + fmt(exp.saldo));

    const pago = {
      id: uid('PAG'),
      monto,
      metodo, // efectivo | tarjeta | transferencia | cheque
      referencia,
      fecha: nowISO()
    };
    exp.pagos.push(pago);
    exp.saldo = Math.round((exp.saldo - monto) * 100) / 100;
    exp.actualizado = nowISO();

    const ticket = {
      folio: 'TKT-' + (++consecutivoTicket),
      expediente: expedienteNumero,
      cliente: exp.cliente,
      concepto: exp.tramite,
      monto,
      metodo,
      saldoRestante: exp.saldo,
      fecha: pago.fecha
    };
    tickets.push(ticket);
    return ticket;
  }

  function emitirFactura(expedienteNumero) {
    const exp = expedientes.get(expedienteNumero);
    if (!exp) throw new Error('expediente no existe');
    if (exp.saldo > 0.01) throw new Error('expediente con saldo pendiente: ' + fmt(exp.saldo));
    const cli = obtenerCliente(exp.rfcCliente);
    const subtotal = Math.round((exp.total / 1.16) * 100) / 100;
    return {
      uuid: uid('CFDI'),
      rfcEmisor: 'NOTARIA-RFC',
      rfcReceptor: cli.rfc,
      receptor: cli.nombre,
      conceptos: [{ descripcion: exp.tramite, importe: subtotal }],
      subtotal,
      iva: calcIVA(subtotal),
      total: exp.total,
      fecha: nowISO(),
      expediente: expedienteNumero
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Reportes
  // ─────────────────────────────────────────────────────────────
  function reporteDiario(fecha) {
    const day = (fecha || nowISO().slice(0, 10));
    const ts = tickets.filter(t => t.fecha.slice(0, 10) === day);
    const totales = ts.reduce((acc, t) => {
      acc.total += t.monto;
      acc.porMetodo[t.metodo] = (acc.porMetodo[t.metodo] || 0) + t.monto;
      return acc;
    }, { total: 0, porMetodo: {}, tickets: ts.length });
    return { fecha: day, ...totales, detalle: ts };
  }

  function reporteExpedientes() {
    const arr = Array.from(expedientes.values());
    const porEstado = arr.reduce((a, e) => { a[e.estado] = (a[e.estado] || 0) + 1; return a; }, {});
    const carteraPendiente = arr.reduce((s, e) => s + e.saldo, 0);
    return { total: arr.length, porEstado, carteraPendiente };
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  const NotariaAPI = {
    version: '1.0.0',
    vertical: 'notaria',
    catalogo: CATALOGO_TRAMITES,
    buscarTramite,

    // clientes
    registrarCliente, obtenerCliente, listarClientes,

    // expedientes
    abrirExpediente, actualizarEstadoExpediente, adjuntarDocumento, listarExpedientes,

    // citas
    agendarCita, cambiarEstadoCita, citasDelDia,

    // escrituras
    generarEscritura, listarEscrituras,

    // cobros
    cobrarPago, emitirFactura,

    // reportes
    reporteDiario, reporteExpedientes,

    // utilidades
    _utils: { calcIVA, fmt, uid, nowISO }
  };

  global.NotariaAPI = NotariaAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotariaAPI;
  }

  if (global.console && global.console.log) {
    global.console.log('[Volvix] NotariaAPI cargado v' + NotariaAPI.version + ' (' + CATALOGO_TRAMITES.length + ' trámites)');
  }
})(typeof window !== 'undefined' ? window : globalThis);
