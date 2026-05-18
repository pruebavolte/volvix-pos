/**
 * Volvix POS - Vertical Mecanica
 * Modulo especializado para taller mecanico
 * Gestion: vehiculos, diagnostico, refacciones, mano de obra, garantias
 */
(function (global) {
  'use strict';

  // ============================================================
  // CATALOGOS BASE
  // ============================================================
  const TIPOS_VEHICULO = ['Sedan', 'SUV', 'Pickup', 'Hatchback', 'Van', 'Camion', 'Motocicleta'];
  const TIPOS_SERVICIO = [
    'Afinacion mayor', 'Afinacion menor', 'Cambio de aceite', 'Frenos',
    'Suspension', 'Transmision', 'Motor', 'Electrico', 'Aire acondicionado',
    'Diagnostico computarizado', 'Alineacion y balanceo', 'Hojalateria'
  ];
  const ESTADOS_OT = ['Recepcion', 'Diagnostico', 'Aprobacion', 'En reparacion', 'Pruebas', 'Listo', 'Entregado', 'Cancelado'];
  const PRIORIDADES = ['Baja', 'Normal', 'Alta', 'Urgente'];

  // ============================================================
  // ESTADO INTERNO
  // ============================================================
  const _state = {
    vehiculos: new Map(),
    clientes: new Map(),
    ordenesTrabajo: new Map(),
    refacciones: new Map(),
    manoObra: new Map(),
    garantias: new Map(),
    diagnosticos: new Map(),
    mecanicos: new Map(),
    citas: new Map(),
    historialServicios: [],
    config: {
      tasaImpuesto: 0.16,
      diasGarantiaDefault: 90,
      kmGarantiaDefault: 5000,
      moneda: 'MXN',
      tallerNombre: 'Taller Volvix Mecanica'
    }
  };

  let _seq = 1;
  function _id(prefix) { return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`; }
  function _now() { return new Date().toISOString(); }
  function _round(n) { return Math.round(n * 100) / 100; }

  // ============================================================
  // CLIENTES
  // ============================================================
  function registrarCliente(data) {
    if (!data || !data.nombre) throw new Error('Cliente requiere nombre');
    const id = data.id || _id('CLI');
    const cliente = {
      id,
      nombre: data.nombre,
      telefono: data.telefono || '',
      email: data.email || '',
      rfc: data.rfc || '',
      direccion: data.direccion || '',
      vehiculos: [],
      creadoEn: _now()
    };
    _state.clientes.set(id, cliente);
    return cliente;
  }

  function obtenerCliente(id) { return _state.clientes.get(id) || null; }
  function listarClientes() { return Array.from(_state.clientes.values()); }

  // ============================================================
  // VEHICULOS
  // ============================================================
  function registrarVehiculo(data) {
    if (!data || !data.placas) throw new Error('Vehiculo requiere placas');
    if (!data.clienteId || !_state.clientes.has(data.clienteId)) {
      throw new Error('clienteId invalido');
    }
    const id = data.id || _id('VEH');
    const vehiculo = {
      id,
      clienteId: data.clienteId,
      placas: data.placas.toUpperCase(),
      marca: data.marca || '',
      modelo: data.modelo || '',
      anio: data.anio || null,
      color: data.color || '',
      vin: data.vin || '',
      tipo: data.tipo || 'Sedan',
      kilometraje: data.kilometraje || 0,
      combustible: data.combustible || 'Gasolina',
      transmision: data.transmision || 'Manual',
      observaciones: data.observaciones || '',
      creadoEn: _now()
    };
    _state.vehiculos.set(id, vehiculo);
    const cli = _state.clientes.get(data.clienteId);
    if (cli && !cli.vehiculos.includes(id)) cli.vehiculos.push(id);
    return vehiculo;
  }

  function obtenerVehiculo(id) { return _state.vehiculos.get(id) || null; }
  function buscarVehiculoPorPlacas(placas) {
    const p = (placas || '').toUpperCase();
    return Array.from(_state.vehiculos.values()).find(v => v.placas === p) || null;
  }
  function listarVehiculosCliente(clienteId) {
    return Array.from(_state.vehiculos.values()).filter(v => v.clienteId === clienteId);
  }

  function actualizarKilometraje(vehId, km) {
    const v = _state.vehiculos.get(vehId);
    if (!v) throw new Error('Vehiculo no encontrado');
    if (km < v.kilometraje) throw new Error('Km nuevo menor al registrado');
    v.kilometraje = km;
    v.kmActualizadoEn = _now();
    return v;
  }

  // ============================================================
  // MECANICOS
  // ============================================================
  function registrarMecanico(data) {
    const id = data.id || _id('MEC');
    const mec = {
      id,
      nombre: data.nombre,
      especialidad: data.especialidad || 'General',
      tarifaHora: data.tarifaHora || 250,
      activo: true,
      ordenesActivas: 0,
      creadoEn: _now()
    };
    _state.mecanicos.set(id, mec);
    return mec;
  }
  function listarMecanicos() {
    return Array.from(_state.mecanicos.values()).filter(m => m.activo);
  }

  // ============================================================
  // REFACCIONES (INVENTARIO)
  // ============================================================
  function agregarRefaccion(data) {
    if (!data || !data.sku) throw new Error('Refaccion requiere sku');
    const id = data.sku;
    const ref = {
      sku: data.sku,
      nombre: data.nombre,
      marca: data.marca || '',
      categoria: data.categoria || 'General',
      compatibilidad: data.compatibilidad || [],
      costo: data.costo || 0,
      precioVenta: data.precioVenta || 0,
      stock: data.stock || 0,
      stockMinimo: data.stockMinimo || 1,
      ubicacion: data.ubicacion || '',
      proveedor: data.proveedor || '',
      creadoEn: _now()
    };
    _state.refacciones.set(id, ref);
    return ref;
  }

  function ajustarStock(sku, delta, motivo) {
    const ref = _state.refacciones.get(sku);
    if (!ref) throw new Error('Refaccion no encontrada: ' + sku);
    if (ref.stock + delta < 0) throw new Error('Stock insuficiente para ' + sku);
    ref.stock += delta;
    return { sku, stock: ref.stock, delta, motivo: motivo || '', en: _now() };
  }

  function refaccionesBajoStock() {
    return Array.from(_state.refacciones.values()).filter(r => r.stock <= r.stockMinimo);
  }

  // ============================================================
  // DIAGNOSTICO
  // ============================================================
  function crearDiagnostico(data) {
    if (!data.vehiculoId || !_state.vehiculos.has(data.vehiculoId)) {
      throw new Error('vehiculoId invalido');
    }
    const id = _id('DIAG');
    const diag = {
      id,
      vehiculoId: data.vehiculoId,
      mecanicoId: data.mecanicoId || null,
      sintomasReportados: data.sintomasReportados || [],
      hallazgos: data.hallazgos || [],
      codigosOBD: data.codigosOBD || [],
      recomendaciones: data.recomendaciones || [],
      severidad: data.severidad || 'Normal',
      creadoEn: _now()
    };
    _state.diagnosticos.set(id, diag);
    return diag;
  }

  function agregarHallazgo(diagId, hallazgo) {
    const d = _state.diagnosticos.get(diagId);
    if (!d) throw new Error('Diagnostico no encontrado');
    d.hallazgos.push({ ...hallazgo, en: _now() });
    return d;
  }

  // ============================================================
  // ORDEN DE TRABAJO (OT)
  // ============================================================
  function crearOrdenTrabajo(data) {
    if (!data.vehiculoId || !_state.vehiculos.has(data.vehiculoId)) {
      throw new Error('vehiculoId invalido');
    }
    const veh = _state.vehiculos.get(data.vehiculoId);
    const id = _id('OT');
    const ot = {
      id,
      folio: 'OT-' + Math.floor(Math.random() * 90000 + 10000),
      vehiculoId: data.vehiculoId,
      clienteId: veh.clienteId,
      mecanicoId: data.mecanicoId || null,
      diagnosticoId: data.diagnosticoId || null,
      estado: 'Recepcion',
      prioridad: data.prioridad || 'Normal',
      tipoServicio: data.tipoServicio || 'General',
      kmEntrada: data.kmEntrada || veh.kilometraje,
      combustibleEntrada: data.combustibleEntrada || null,
      objetosEntregados: data.objetosEntregados || [],
      refaccionesUsadas: [],
      manoObraAplicada: [],
      subtotalRefacciones: 0,
      subtotalManoObra: 0,
      subtotal: 0,
      impuesto: 0,
      total: 0,
      anticipo: 0,
      saldo: 0,
      fechaApertura: _now(),
      fechaPromesa: data.fechaPromesa || null,
      fechaCierre: null,
      historialEstados: [{ estado: 'Recepcion', en: _now() }],
      notas: data.notas || ''
    };
    _state.ordenesTrabajo.set(id, ot);
    if (ot.mecanicoId) {
      const m = _state.mecanicos.get(ot.mecanicoId);
      if (m) m.ordenesActivas++;
    }
    return ot;
  }

  function cambiarEstadoOT(otId, nuevoEstado) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    if (!ESTADOS_OT.includes(nuevoEstado)) throw new Error('Estado invalido');
    ot.estado = nuevoEstado;
    ot.historialEstados.push({ estado: nuevoEstado, en: _now() });
    if (nuevoEstado === 'Entregado' || nuevoEstado === 'Cancelado') {
      ot.fechaCierre = _now();
      if (ot.mecanicoId) {
        const m = _state.mecanicos.get(ot.mecanicoId);
        if (m && m.ordenesActivas > 0) m.ordenesActivas--;
      }
    }
    return ot;
  }

  function agregarRefaccionAOT(otId, sku, cantidad) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    const ref = _state.refacciones.get(sku);
    if (!ref) throw new Error('Refaccion no encontrada');
    if (ref.stock < cantidad) throw new Error('Stock insuficiente');
    ajustarStock(sku, -cantidad, 'OT ' + ot.folio);
    const linea = {
      sku,
      nombre: ref.nombre,
      cantidad,
      precioUnitario: ref.precioVenta,
      importe: _round(ref.precioVenta * cantidad)
    };
    ot.refaccionesUsadas.push(linea);
    _recalcularOT(ot);
    return linea;
  }

  function agregarManoObraAOT(otId, data) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    const horas = data.horas || 1;
    const tarifa = data.tarifaHora || 250;
    const linea = {
      id: _id('MO'),
      concepto: data.concepto,
      horas,
      tarifaHora: tarifa,
      mecanicoId: data.mecanicoId || ot.mecanicoId,
      importe: _round(horas * tarifa)
    };
    ot.manoObraAplicada.push(linea);
    _recalcularOT(ot);
    return linea;
  }

  function _recalcularOT(ot) {
    ot.subtotalRefacciones = _round(ot.refaccionesUsadas.reduce((a, r) => a + r.importe, 0));
    ot.subtotalManoObra = _round(ot.manoObraAplicada.reduce((a, m) => a + m.importe, 0));
    ot.subtotal = _round(ot.subtotalRefacciones + ot.subtotalManoObra);
    ot.impuesto = _round(ot.subtotal * _state.config.tasaImpuesto);
    ot.total = _round(ot.subtotal + ot.impuesto);
    ot.saldo = _round(ot.total - ot.anticipo);
    return ot;
  }

  function aplicarAnticipo(otId, monto) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    if (monto <= 0) throw new Error('Monto invalido');
    ot.anticipo = _round(ot.anticipo + monto);
    ot.saldo = _round(ot.total - ot.anticipo);
    return ot;
  }

  function cerrarOT(otId, formaPago) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    if (ot.saldo > 0 && !formaPago) throw new Error('Falta cubrir saldo');
    cambiarEstadoOT(otId, 'Entregado');
    ot.formaPago = formaPago || 'N/A';
    _state.historialServicios.push({
      otId,
      vehiculoId: ot.vehiculoId,
      clienteId: ot.clienteId,
      total: ot.total,
      en: _now()
    });
    return ot;
  }

  // ============================================================
  // GARANTIAS
  // ============================================================
  function emitirGarantia(otId, data) {
    const ot = _state.ordenesTrabajo.get(otId);
    if (!ot) throw new Error('OT no encontrada');
    const id = _id('GAR');
    const dias = (data && data.dias) || _state.config.diasGarantiaDefault;
    const km = (data && data.km) || _state.config.kmGarantiaDefault;
    const veh = _state.vehiculos.get(ot.vehiculoId);
    const garantia = {
      id,
      otId,
      vehiculoId: ot.vehiculoId,
      clienteId: ot.clienteId,
      cobertura: (data && data.cobertura) || 'Mano de obra y refacciones instaladas',
      fechaInicio: _now(),
      fechaFin: new Date(Date.now() + dias * 86400000).toISOString(),
      kmInicio: veh.kilometraje,
      kmLimite: veh.kilometraje + km,
      activa: true,
      reclamos: []
    };
    _state.garantias.set(id, garantia);
    return garantia;
  }

  function reclamarGarantia(garantiaId, descripcion) {
    const g = _state.garantias.get(garantiaId);
    if (!g) throw new Error('Garantia no encontrada');
    if (!g.activa) throw new Error('Garantia inactiva');
    if (new Date(g.fechaFin) < new Date()) {
      g.activa = false;
      throw new Error('Garantia vencida por fecha');
    }
    const veh = _state.vehiculos.get(g.vehiculoId);
    if (veh && veh.kilometraje > g.kmLimite) {
      g.activa = false;
      throw new Error('Garantia vencida por km');
    }
    const reclamo = { id: _id('REC'), descripcion, en: _now(), estado: 'Abierto' };
    g.reclamos.push(reclamo);
    return reclamo;
  }

  // ============================================================
  // CITAS
  // ============================================================
  function agendarCita(data) {
    if (!data.vehiculoId || !_state.vehiculos.has(data.vehiculoId)) {
      throw new Error('vehiculoId invalido');
    }
    const id = _id('CITA');
    const cita = {
      id,
      vehiculoId: data.vehiculoId,
      fechaHora: data.fechaHora,
      tipoServicio: data.tipoServicio || 'Revision',
      mecanicoId: data.mecanicoId || null,
      estado: 'Agendada',
      notas: data.notas || '',
      creadoEn: _now()
    };
    _state.citas.set(id, cita);
    return cita;
  }

  // ============================================================
  // REPORTES
  // ============================================================
  function reporteIngresos(desde, hasta) {
    const d = desde ? new Date(desde).getTime() : 0;
    const h = hasta ? new Date(hasta).getTime() : Date.now();
    const items = _state.historialServicios.filter(s => {
      const t = new Date(s.en).getTime();
      return t >= d && t <= h;
    });
    const total = items.reduce((a, s) => a + s.total, 0);
    return { desde, hasta, ordenes: items.length, total: _round(total) };
  }

  function reporteOrdenesActivas() {
    return Array.from(_state.ordenesTrabajo.values())
      .filter(ot => !['Entregado', 'Cancelado'].includes(ot.estado));
  }

  function historialVehiculo(vehId) {
    return Array.from(_state.ordenesTrabajo.values())
      .filter(ot => ot.vehiculoId === vehId)
      .sort((a, b) => new Date(b.fechaApertura) - new Date(a.fechaApertura));
  }

  function topMecanicos() {
    return Array.from(_state.mecanicos.values())
      .map(m => {
        const ots = Array.from(_state.ordenesTrabajo.values())
          .filter(ot => ot.mecanicoId === m.id && ot.estado === 'Entregado');
        return {
          id: m.id,
          nombre: m.nombre,
          ordenesCompletadas: ots.length,
          ingresoGenerado: _round(ots.reduce((a, ot) => a + ot.total, 0))
        };
      })
      .sort((a, b) => b.ingresoGenerado - a.ingresoGenerado);
  }

  // ============================================================
  // API PUBLICA
  // ============================================================
  const MecanicaAPI = {
    // Catalogos
    TIPOS_VEHICULO, TIPOS_SERVICIO, ESTADOS_OT, PRIORIDADES,
    // Config
    config: _state.config,
    // Clientes
    registrarCliente, obtenerCliente, listarClientes,
    // Vehiculos
    registrarVehiculo, obtenerVehiculo, buscarVehiculoPorPlacas,
    listarVehiculosCliente, actualizarKilometraje,
    // Mecanicos
    registrarMecanico, listarMecanicos,
    // Refacciones
    agregarRefaccion, ajustarStock, refaccionesBajoStock,
    // Diagnostico
    crearDiagnostico, agregarHallazgo,
    // OT
    crearOrdenTrabajo, cambiarEstadoOT, agregarRefaccionAOT,
    agregarManoObraAOT, aplicarAnticipo, cerrarOT,
    // Garantias
    emitirGarantia, reclamarGarantia,
    // Citas
    agendarCita,
    // Reportes
    reporteIngresos, reporteOrdenesActivas, historialVehiculo, topMecanicos,
    // Debug
    _state
  };

  global.MecanicaAPI = MecanicaAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = MecanicaAPI;

})(typeof window !== 'undefined' ? window : globalThis);
