/**
 * volvix-vertical-rentaequipo.js
 * Vertical POS: Renta de Equipo y Maquinaria
 * Gestión de inventario rentable, plazos, depósitos en garantía,
 * devoluciones, daños, recargos por mora y mantenimiento.
 *
 * API: window.RentaEquipoAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Constantes y configuración
  // ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix.rentaEquipo.v1';
  const TASA_MORA_DIARIA = 0.05;          // 5% diario sobre tarifa
  const PORC_DEPOSITO_DEFAULT = 0.30;     // 30% del valor del equipo
  const IVA = 0.16;

  const ESTADOS_EQUIPO = Object.freeze({
    DISPONIBLE: 'disponible',
    RENTADO:    'rentado',
    MANTENIM:   'mantenimiento',
    DANADO:     'danado',
    BAJA:       'baja'
  });

  const ESTADOS_CONTRATO = Object.freeze({
    ACTIVO:    'activo',
    DEVUELTO:  'devuelto',
    VENCIDO:   'vencido',
    CANCELADO: 'cancelado'
  });

  const UNIDADES_PLAZO = Object.freeze({
    HORA: 'hora', DIA: 'dia', SEMANA: 'semana', MES: 'mes'
  });

  const HORAS_POR_UNIDAD = {
    hora: 1, dia: 24, semana: 168, mes: 720
  };

  // ─────────────────────────────────────────────────────────────
  // Estado en memoria
  // ─────────────────────────────────────────────────────────────
  let state = {
    equipos:   [],   // { id, codigo, nombre, categoria, valor, tarifas:{hora,dia,semana,mes}, estado, ubicacion, horasUso }
    clientes:  [],   // { id, nombre, identificacion, telefono, email, historial:[contratoId] }
    contratos: [],   // contrato completo
    movimientos: [], // log auditoría
    seq: { equipo: 1, cliente: 1, contrato: 1, mov: 1 }
  };

  // ─────────────────────────────────────────────────────────────
  // Persistencia
  // ─────────────────────────────────────────────────────────────
  function persist() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) { /* silencioso */ }
  }

  function restore() {
    try {
      if (!global.localStorage) return;
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) { /* silencioso */ }
  }

  function nextId(tipo) {
    const n = state.seq[tipo]++;
    persist();
    return `${tipo.toUpperCase()}-${String(n).padStart(5, '0')}`;
  }

  function logMov(tipo, refId, detalle) {
    state.movimientos.push({
      id: nextId('mov'),
      ts: new Date().toISOString(),
      tipo, refId, detalle
    });
    persist();
  }

  // ─────────────────────────────────────────────────────────────
  // Equipos
  // ─────────────────────────────────────────────────────────────
  function registrarEquipo({ codigo, nombre, categoria, valor, tarifas, ubicacion }) {
    if (!codigo || !nombre || !valor) {
      throw new Error('codigo, nombre y valor son requeridos');
    }
    if (state.equipos.some(e => e.codigo === codigo)) {
      throw new Error(`Ya existe equipo con código ${codigo}`);
    }
    const eq = {
      id: nextId('equipo'),
      codigo, nombre,
      categoria: categoria || 'general',
      valor: Number(valor),
      tarifas: Object.assign({ hora: 0, dia: 0, semana: 0, mes: 0 }, tarifas || {}),
      estado: ESTADOS_EQUIPO.DISPONIBLE,
      ubicacion: ubicacion || 'bodega',
      horasUso: 0,
      creado: new Date().toISOString()
    };
    state.equipos.push(eq);
    logMov('equipo.alta', eq.id, { codigo, nombre });
    persist();
    return eq;
  }

  function buscarEquipo(idOrCodigo) {
    return state.equipos.find(e => e.id === idOrCodigo || e.codigo === idOrCodigo) || null;
  }

  function listarEquiposDisponibles(categoria) {
    return state.equipos.filter(e =>
      e.estado === ESTADOS_EQUIPO.DISPONIBLE &&
      (!categoria || e.categoria === categoria)
    );
  }

  function cambiarEstadoEquipo(idOrCodigo, nuevoEstado, motivo) {
    const eq = buscarEquipo(idOrCodigo);
    if (!eq) throw new Error('equipo no encontrado');
    if (!Object.values(ESTADOS_EQUIPO).includes(nuevoEstado)) {
      throw new Error('estado inválido');
    }
    const previo = eq.estado;
    eq.estado = nuevoEstado;
    logMov('equipo.estado', eq.id, { previo, nuevoEstado, motivo });
    persist();
    return eq;
  }

  // ─────────────────────────────────────────────────────────────
  // Clientes
  // ─────────────────────────────────────────────────────────────
  function registrarCliente({ nombre, identificacion, telefono, email }) {
    if (!nombre || !identificacion) {
      throw new Error('nombre e identificacion requeridos');
    }
    const existe = state.clientes.find(c => c.identificacion === identificacion);
    if (existe) return existe;
    const cli = {
      id: nextId('cliente'),
      nombre, identificacion,
      telefono: telefono || '',
      email: email || '',
      historial: [],
      creado: new Date().toISOString()
    };
    state.clientes.push(cli);
    logMov('cliente.alta', cli.id, { nombre });
    persist();
    return cli;
  }

  function buscarCliente(idOrIdent) {
    return state.clientes.find(c =>
      c.id === idOrIdent || c.identificacion === idOrIdent
    ) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Cotización
  // ─────────────────────────────────────────────────────────────
  function calcularSubtotal(equipo, cantidad, unidad) {
    const tarifa = equipo.tarifas[unidad];
    if (tarifa == null) throw new Error(`equipo sin tarifa para ${unidad}`);
    return Number((tarifa * cantidad).toFixed(2));
  }

  function cotizar({ equipoId, cantidad, unidad, porcDeposito }) {
    const eq = buscarEquipo(equipoId);
    if (!eq) throw new Error('equipo no encontrado');
    if (!HORAS_POR_UNIDAD[unidad]) throw new Error('unidad inválida');
    if (!cantidad || cantidad <= 0) throw new Error('cantidad inválida');

    const subtotal = calcularSubtotal(eq, cantidad, unidad);
    const iva = Number((subtotal * IVA).toFixed(2));
    const total = Number((subtotal + iva).toFixed(2));
    const pd = porcDeposito != null ? porcDeposito : PORC_DEPOSITO_DEFAULT;
    const deposito = Number((eq.valor * pd).toFixed(2));

    return {
      equipo: { id: eq.id, codigo: eq.codigo, nombre: eq.nombre },
      cantidad, unidad,
      tarifaUnitaria: eq.tarifas[unidad],
      subtotal, iva, total,
      deposito,
      totalConDeposito: Number((total + deposito).toFixed(2))
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Contratos: alta, devolución, mora
  // ─────────────────────────────────────────────────────────────
  function crearContrato({ clienteId, equipoId, cantidad, unidad, porcDeposito, observaciones }) {
    const cli = buscarCliente(clienteId);
    if (!cli) throw new Error('cliente no encontrado');
    const eq = buscarEquipo(equipoId);
    if (!eq) throw new Error('equipo no encontrado');
    if (eq.estado !== ESTADOS_EQUIPO.DISPONIBLE) {
      throw new Error(`equipo no disponible (estado: ${eq.estado})`);
    }
    const cot = cotizar({ equipoId: eq.id, cantidad, unidad, porcDeposito });

    const inicio = new Date();
    const finProgramado = new Date(inicio.getTime() +
      HORAS_POR_UNIDAD[unidad] * cantidad * 3600 * 1000);

    const contrato = {
      id: nextId('contrato'),
      clienteId: cli.id,
      equipoId: eq.id,
      cantidad, unidad,
      tarifaUnitaria: cot.tarifaUnitaria,
      subtotal: cot.subtotal,
      iva: cot.iva,
      total: cot.total,
      deposito: cot.deposito,
      depositoRetenido: 0,
      mora: 0,
      cargosDano: 0,
      fechaInicio: inicio.toISOString(),
      fechaFinProgramada: finProgramado.toISOString(),
      fechaDevolucion: null,
      estado: ESTADOS_CONTRATO.ACTIVO,
      observaciones: observaciones || ''
    };

    state.contratos.push(contrato);
    cli.historial.push(contrato.id);
    eq.estado = ESTADOS_EQUIPO.RENTADO;
    logMov('contrato.crear', contrato.id, { clienteId: cli.id, equipoId: eq.id });
    persist();
    return contrato;
  }

  function calcularMora(contrato, fechaRef) {
    if (contrato.estado !== ESTADOS_CONTRATO.ACTIVO) return 0;
    const ref = fechaRef ? new Date(fechaRef) : new Date();
    const fin = new Date(contrato.fechaFinProgramada);
    if (ref <= fin) return 0;
    const diasMora = Math.ceil((ref - fin) / (1000 * 3600 * 24));
    const tarifaDiaria = contrato.subtotal / Math.max(1,
      (HORAS_POR_UNIDAD[contrato.unidad] * contrato.cantidad) / 24);
    return Number((diasMora * tarifaDiaria * (1 + TASA_MORA_DIARIA)).toFixed(2));
  }

  function registrarDevolucion({ contratoId, cargosDano, observaciones }) {
    const c = state.contratos.find(x => x.id === contratoId);
    if (!c) throw new Error('contrato no encontrado');
    if (c.estado !== ESTADOS_CONTRATO.ACTIVO) {
      throw new Error(`contrato no activo (estado: ${c.estado})`);
    }
    const eq = buscarEquipo(c.equipoId);
    const ahora = new Date();

    c.fechaDevolucion = ahora.toISOString();
    c.mora = calcularMora(c, ahora);
    c.cargosDano = Number(cargosDano || 0);

    const totalCargos = c.mora + c.cargosDano;
    c.depositoRetenido = Math.min(c.deposito, totalCargos);
    const depositoDevuelto = c.deposito - c.depositoRetenido;
    const saldoPendiente = Math.max(0, totalCargos - c.deposito);

    c.estado = ESTADOS_CONTRATO.DEVUELTO;
    c.observaciones = (c.observaciones ? c.observaciones + ' | ' : '') +
      (observaciones || '');

    eq.estado = c.cargosDano > 0
      ? ESTADOS_EQUIPO.MANTENIM
      : ESTADOS_EQUIPO.DISPONIBLE;
    eq.horasUso += HORAS_POR_UNIDAD[c.unidad] * c.cantidad;

    logMov('contrato.devolucion', c.id, {
      mora: c.mora, dano: c.cargosDano, retenido: c.depositoRetenido
    });
    persist();

    return {
      contrato: c,
      mora: c.mora,
      cargosDano: c.cargosDano,
      depositoRetenido: c.depositoRetenido,
      depositoDevuelto: Number(depositoDevuelto.toFixed(2)),
      saldoPendiente: Number(saldoPendiente.toFixed(2))
    };
  }

  function cancelarContrato(contratoId, motivo) {
    const c = state.contratos.find(x => x.id === contratoId);
    if (!c) throw new Error('contrato no encontrado');
    if (c.estado !== ESTADOS_CONTRATO.ACTIVO) {
      throw new Error('solo contratos activos pueden cancelarse');
    }
    const eq = buscarEquipo(c.equipoId);
    c.estado = ESTADOS_CONTRATO.CANCELADO;
    c.observaciones = (c.observaciones || '') + ' | CANCELADO: ' + (motivo || '');
    eq.estado = ESTADOS_EQUIPO.DISPONIBLE;
    logMov('contrato.cancelar', c.id, { motivo });
    persist();
    return c;
  }

  // ─────────────────────────────────────────────────────────────
  // Reportes
  // ─────────────────────────────────────────────────────────────
  function contratosVencidos() {
    const ahora = new Date();
    return state.contratos.filter(c =>
      c.estado === ESTADOS_CONTRATO.ACTIVO &&
      new Date(c.fechaFinProgramada) < ahora
    );
  }

  function reporteUtilizacion() {
    const total = state.equipos.length || 1;
    const por = e => state.equipos.filter(x => x.estado === e).length;
    return {
      total,
      disponible:    por(ESTADOS_EQUIPO.DISPONIBLE),
      rentado:       por(ESTADOS_EQUIPO.RENTADO),
      mantenimiento: por(ESTADOS_EQUIPO.MANTENIM),
      danado:        por(ESTADOS_EQUIPO.DANADO),
      tasaUtilizacion: Number((por(ESTADOS_EQUIPO.RENTADO) / total).toFixed(3))
    };
  }

  function ingresosPeriodo(desde, hasta) {
    const d = new Date(desde), h = new Date(hasta);
    return state.contratos
      .filter(c => {
        const f = new Date(c.fechaInicio);
        return f >= d && f <= h && c.estado !== ESTADOS_CONTRATO.CANCELADO;
      })
      .reduce((acc, c) => ({
        contratos: acc.contratos + 1,
        subtotal:  acc.subtotal + c.subtotal,
        iva:       acc.iva + c.iva,
        mora:      acc.mora + (c.mora || 0),
        danos:     acc.danos + (c.cargosDano || 0),
        total:     acc.total + c.total + (c.mora || 0) + (c.cargosDano || 0)
      }), { contratos: 0, subtotal: 0, iva: 0, mora: 0, danos: 0, total: 0 });
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  restore();

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  global.RentaEquipoAPI = {
    // constantes
    ESTADOS_EQUIPO, ESTADOS_CONTRATO, UNIDADES_PLAZO,
    // equipos
    registrarEquipo, buscarEquipo, listarEquiposDisponibles, cambiarEstadoEquipo,
    // clientes
    registrarCliente, buscarCliente,
    // operación
    cotizar, crearContrato, calcularMora, registrarDevolucion, cancelarContrato,
    // reportes
    contratosVencidos, reporteUtilizacion, ingresosPeriodo,
    // utilidades
    _state: () => JSON.parse(JSON.stringify(state)),
    _reset: () => { state = { equipos:[], clientes:[], contratos:[], movimientos:[], seq:{equipo:1,cliente:1,contrato:1,mov:1} }; persist(); }
  };

})(typeof window !== 'undefined' ? window : globalThis);
