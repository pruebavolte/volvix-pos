/**
 * Volvix POS - Vertical Paqueteria / Envios
 * Modulo especializado para empresas de paqueteria, mensajeria y envios.
 * Funcionalidades: cotizacion por peso/destino, generacion de guias,
 * tracking de paquetes, gestion de rutas y zonas, registro de remitentes
 * y destinatarios, calculo de seguros y servicios adicionales.
 *
 * API global: window.PaqueteriaAPI
 */
(function (global) {
  'use strict';

  // ---------------- Datos base ----------------
  const ZONAS = {
    LOCAL:     { nombre: 'Local',      factor: 1.0, diasEntrega: 1 },
    REGIONAL:  { nombre: 'Regional',   factor: 1.5, diasEntrega: 2 },
    NACIONAL:  { nombre: 'Nacional',   factor: 2.2, diasEntrega: 4 },
    FRONTERA:  { nombre: 'Frontera',   factor: 3.0, diasEntrega: 6 },
    INTERNAC:  { nombre: 'Internacional', factor: 4.5, diasEntrega: 10 }
  };

  const SERVICIOS = {
    ESTANDAR: { nombre: 'Estandar', factor: 1.0,  prioridad: 3 },
    EXPRESS:  { nombre: 'Express',  factor: 1.6,  prioridad: 2 },
    SAMEDAY:  { nombre: 'Same Day', factor: 2.4,  prioridad: 1 },
    ECONOMY:  { nombre: 'Economy',  factor: 0.75, prioridad: 4 }
  };

  const TARIFA_BASE_KG = 18.50;   // MXN por kg
  const TARIFA_FIJA    = 45.00;   // costo de manejo fijo
  const SEGURO_PCT     = 0.015;   // 1.5% del valor declarado
  const COMBUSTIBLE_PCT= 0.08;    // recargo combustible
  const IVA            = 0.16;

  // ---------------- Estado interno ----------------
  const estado = {
    guias:        new Map(),   // numeroGuia -> guia
    remitentes:   new Map(),   // id -> remitente
    destinatarios:new Map(),
    eventosTracking: new Map(),// numeroGuia -> [eventos]
    contadorGuia: 100000,
    historialCotizaciones: []
  };

  // ---------------- Utilidades ----------------
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 8);
  }

  function generarNumeroGuia() {
    estado.contadorGuia += 1;
    const seq = String(estado.contadorGuia).padStart(8, '0');
    const check = ((estado.contadorGuia * 7) % 97).toString().padStart(2, '0');
    return 'VLX' + seq + check;
  }

  function redondear(n) { return Math.round(n * 100) / 100; }

  function calcularPesoVolumetrico(largoCm, anchoCm, altoCm) {
    if (!largoCm || !anchoCm || !altoCm) return 0;
    return (largoCm * anchoCm * altoCm) / 5000; // factor aereo estandar
  }

  function pesoFacturable(pesoReal, dims) {
    const vol = calcularPesoVolumetrico(dims?.largo, dims?.ancho, dims?.alto);
    return Math.max(pesoReal || 0, vol);
  }

  // ---------------- Cotizacion ----------------
  function cotizar(opts) {
    const {
      pesoKg = 0,
      dimensiones = null,        // { largo, ancho, alto } en cm
      zona = 'LOCAL',
      servicio = 'ESTANDAR',
      valorDeclarado = 0,
      conSeguro = false,
      conRecoleccion = false
    } = opts || {};

    const z = ZONAS[zona] || ZONAS.LOCAL;
    const s = SERVICIOS[servicio] || SERVICIOS.ESTANDAR;
    const pf = pesoFacturable(pesoKg, dimensiones);

    if (pf <= 0) {
      return { ok: false, error: 'Peso o dimensiones invalidos' };
    }

    const costoPeso     = pf * TARIFA_BASE_KG * z.factor * s.factor;
    const costoFijo     = TARIFA_FIJA;
    const recoleccion   = conRecoleccion ? 35 : 0;
    const seguro        = conSeguro ? valorDeclarado * SEGURO_PCT : 0;
    const subtotal      = costoPeso + costoFijo + recoleccion + seguro;
    const combustible   = subtotal * COMBUSTIBLE_PCT;
    const baseImpuestos = subtotal + combustible;
    const iva           = baseImpuestos * IVA;
    const total         = baseImpuestos + iva;

    const cotizacion = {
      id: uid('COT'),
      fecha: new Date().toISOString(),
      pesoReal: pesoKg,
      pesoVolumetrico: redondear(calcularPesoVolumetrico(
        dimensiones?.largo, dimensiones?.ancho, dimensiones?.alto)),
      pesoFacturable: redondear(pf),
      zona: z.nombre,
      servicio: s.nombre,
      diasEstimados: z.diasEntrega + (s.factor < 1 ? 2 : 0),
      desglose: {
        costoPeso:    redondear(costoPeso),
        costoFijo:    redondear(costoFijo),
        recoleccion:  redondear(recoleccion),
        seguro:       redondear(seguro),
        combustible:  redondear(combustible),
        iva:          redondear(iva)
      },
      subtotal: redondear(subtotal),
      total:    redondear(total)
    };

    estado.historialCotizaciones.push(cotizacion);
    if (estado.historialCotizaciones.length > 500) {
      estado.historialCotizaciones.shift();
    }
    return { ok: true, cotizacion };
  }

  // ---------------- Remitentes / Destinatarios ----------------
  function registrarRemitente(data) {
    const id = data.id || uid('REM');
    const reg = {
      id,
      nombre: data.nombre || '',
      telefono: data.telefono || '',
      email: data.email || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      cp: data.cp || '',
      rfc: data.rfc || '',
      creado: new Date().toISOString()
    };
    estado.remitentes.set(id, reg);
    return reg;
  }

  function registrarDestinatario(data) {
    const id = data.id || uid('DST');
    const reg = {
      id,
      nombre: data.nombre || '',
      telefono: data.telefono || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      cp: data.cp || '',
      referencias: data.referencias || '',
      creado: new Date().toISOString()
    };
    estado.destinatarios.set(id, reg);
    return reg;
  }

  // ---------------- Guias ----------------
  function generarGuia(opts) {
    const { remitente, destinatario, cotizacion, contenido = '', notas = '' } = opts || {};
    if (!remitente || !destinatario) {
      return { ok: false, error: 'Falta remitente o destinatario' };
    }
    if (!cotizacion || !cotizacion.total) {
      return { ok: false, error: 'Cotizacion invalida' };
    }
    const numero = generarNumeroGuia();
    const guia = {
      numero,
      fechaEmision: new Date().toISOString(),
      remitente,
      destinatario,
      cotizacion,
      contenido,
      notas,
      estado: 'EMITIDA',
      pagada: false
    };
    estado.guias.set(numero, guia);
    estado.eventosTracking.set(numero, [{
      fecha: new Date().toISOString(),
      tipo: 'EMITIDA',
      descripcion: 'Guia generada en sistema',
      ubicacion: remitente.ciudad || 'Origen'
    }]);
    return { ok: true, guia };
  }

  function marcarPagada(numeroGuia, metodoPago) {
    const g = estado.guias.get(numeroGuia);
    if (!g) return { ok: false, error: 'Guia no encontrada' };
    g.pagada = true;
    g.metodoPago = metodoPago || 'EFECTIVO';
    g.fechaPago = new Date().toISOString();
    return { ok: true, guia: g };
  }

  function cancelarGuia(numeroGuia, motivo) {
    const g = estado.guias.get(numeroGuia);
    if (!g) return { ok: false, error: 'Guia no encontrada' };
    if (g.estado === 'ENTREGADA') {
      return { ok: false, error: 'No se puede cancelar guia entregada' };
    }
    g.estado = 'CANCELADA';
    g.motivoCancelacion = motivo || '';
    agregarEventoTracking(numeroGuia, 'CANCELADA', motivo || 'Cancelada', '');
    return { ok: true, guia: g };
  }

  // ---------------- Tracking ----------------
  const ESTADOS_VALIDOS = [
    'EMITIDA', 'RECOLECTADA', 'EN_TRANSITO', 'EN_CENTRO',
    'EN_RUTA_ENTREGA', 'ENTREGADA', 'INCIDENCIA', 'DEVUELTA', 'CANCELADA'
  ];

  function agregarEventoTracking(numeroGuia, tipo, descripcion, ubicacion) {
    const g = estado.guias.get(numeroGuia);
    if (!g) return { ok: false, error: 'Guia no encontrada' };
    if (!ESTADOS_VALIDOS.includes(tipo)) {
      return { ok: false, error: 'Estado invalido: ' + tipo };
    }
    const evt = {
      fecha: new Date().toISOString(),
      tipo,
      descripcion: descripcion || '',
      ubicacion: ubicacion || ''
    };
    if (!estado.eventosTracking.has(numeroGuia)) {
      estado.eventosTracking.set(numeroGuia, []);
    }
    estado.eventosTracking.get(numeroGuia).push(evt);
    g.estado = tipo;
    if (tipo === 'ENTREGADA') {
      g.fechaEntrega = evt.fecha;
    }
    return { ok: true, evento: evt };
  }

  function consultarTracking(numeroGuia) {
    const g = estado.guias.get(numeroGuia);
    if (!g) return { ok: false, error: 'Guia no encontrada' };
    const eventos = estado.eventosTracking.get(numeroGuia) || [];
    return {
      ok: true,
      numero: numeroGuia,
      estadoActual: g.estado,
      remitente: g.remitente?.nombre,
      destinatario: g.destinatario?.nombre,
      origen: g.remitente?.ciudad,
      destino: g.destinatario?.ciudad,
      fechaEmision: g.fechaEmision,
      fechaEntrega: g.fechaEntrega || null,
      totalEventos: eventos.length,
      eventos: eventos.slice().reverse()
    };
  }

  // ---------------- Reportes ----------------
  function reporteDelDia(fechaISO) {
    const dia = (fechaISO || new Date().toISOString()).slice(0, 10);
    let total = 0, count = 0, entregadas = 0, canceladas = 0;
    estado.guias.forEach(g => {
      if (g.fechaEmision.slice(0, 10) === dia) {
        count += 1;
        total += g.cotizacion.total || 0;
        if (g.estado === 'ENTREGADA') entregadas += 1;
        if (g.estado === 'CANCELADA') canceladas += 1;
      }
    });
    return {
      fecha: dia,
      guiasEmitidas: count,
      entregadas,
      canceladas,
      enTransito: count - entregadas - canceladas,
      ingresoTotal: redondear(total)
    };
  }

  function listarGuiasPorEstado(estadoFiltro) {
    const out = [];
    estado.guias.forEach(g => {
      if (!estadoFiltro || g.estado === estadoFiltro) {
        out.push({
          numero: g.numero,
          estado: g.estado,
          destino: g.destinatario?.ciudad,
          total: g.cotizacion.total
        });
      }
    });
    return out;
  }

  // ---------------- API publica ----------------
  global.PaqueteriaAPI = {
    // catalogos
    ZONAS, SERVICIOS, ESTADOS_VALIDOS,
    // cotizacion
    cotizar,
    calcularPesoVolumetrico,
    pesoFacturable,
    // contactos
    registrarRemitente,
    registrarDestinatario,
    obtenerRemitente:    (id) => estado.remitentes.get(id) || null,
    obtenerDestinatario: (id) => estado.destinatarios.get(id) || null,
    // guias
    generarGuia,
    obtenerGuia: (num) => estado.guias.get(num) || null,
    marcarPagada,
    cancelarGuia,
    // tracking
    agregarEventoTracking,
    consultarTracking,
    // reportes
    reporteDelDia,
    listarGuiasPorEstado,
    historialCotizaciones: () => estado.historialCotizaciones.slice(),
    // util
    _estado: estado,
    version: '1.0.0'
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix] Vertical Paqueteria cargada v' + global.PaqueteriaAPI.version);
  }

})(typeof window !== 'undefined' ? window : globalThis);
