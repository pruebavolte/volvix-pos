/**
 * volvix-vertical-joyeria.js
 * Vertical POS especializado para Joyería.
 *
 * Características:
 *  - Piezas únicas (SKU único, no stock por cantidad)
 *  - Control de peso oro/plata (gramos, kilates)
 *  - Cálculo dinámico de precio según cotización del metal
 *  - Certificados de autenticidad (gemológicos / metal)
 *  - Garantías por pieza con vigencia
 *  - Órdenes de reparación (recepción, presupuesto, entrega)
 *  - Apartados / layaway
 *  - Trazabilidad completa por pieza
 *
 * Expone:  window.JoyeriaAPI
 *
 * (c) Volvix POS — vertical module
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Configuración por defecto (editable en runtime)
  // ─────────────────────────────────────────────────────────────
  const CONFIG = {
    monedaBase: 'MXN',
    cotizaciones: {
      oro_24k_gramo: 1750.00,   // MXN por gramo
      oro_18k_gramo: 1312.50,
      oro_14k_gramo: 1020.00,
      oro_10k_gramo: 729.00,
      plata_925_gramo: 22.50,
      platino_gramo: 1180.00
    },
    margenManoObra: 0.35,       // 35% sobre el valor del metal
    ivaPct: 0.16,
    garantiaDefaultMeses: 12,
    folioPrefijos: {
      pieza: 'JY-',
      certificado: 'CERT-',
      garantia: 'GAR-',
      reparacion: 'REP-',
      apartado: 'APT-',
      venta: 'V-'
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Almacenes en memoria (en producción: Supabase/IndexedDB)
  // ─────────────────────────────────────────────────────────────
  const DB = {
    piezas:        new Map(),  // sku -> pieza
    certificados:  new Map(),
    garantias:     new Map(),
    reparaciones:  new Map(),
    apartados:     new Map(),
    ventas:        new Map(),
    contadores:    {
      pieza: 1, cert: 1, gar: 1, rep: 1, apt: 1, venta: 1
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Utilidades internas
  // ─────────────────────────────────────────────────────────────
  function _folio(tipo) {
    const map = {
      pieza: ['pieza', CONFIG.folioPrefijos.pieza],
      cert:  ['cert',  CONFIG.folioPrefijos.certificado],
      gar:   ['gar',   CONFIG.folioPrefijos.garantia],
      rep:   ['rep',   CONFIG.folioPrefijos.reparacion],
      apt:   ['apt',   CONFIG.folioPrefijos.apartado],
      venta: ['venta', CONFIG.folioPrefijos.venta]
    };
    const [k, prefix] = map[tipo];
    const n = DB.contadores[k]++;
    return prefix + String(n).padStart(6, '0');
  }

  function _now() { return new Date().toISOString(); }

  function _round(n, d = 2) {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  }

  function _requerir(obj, campos) {
    for (const c of campos) {
      if (obj[c] === undefined || obj[c] === null || obj[c] === '') {
        throw new Error(`Campo requerido: ${c}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Cotizaciones de metal
  // ─────────────────────────────────────────────────────────────
  function actualizarCotizacion(tipoMetal, precioPorGramo) {
    if (typeof precioPorGramo !== 'number' || precioPorGramo <= 0) {
      throw new Error('precioPorGramo inválido');
    }
    CONFIG.cotizaciones[tipoMetal] = precioPorGramo;
    return { tipoMetal, precioPorGramo, actualizado: _now() };
  }

  function obtenerCotizaciones() {
    return Object.assign({}, CONFIG.cotizaciones);
  }

  function calcularValorMetal(tipoMetal, gramos) {
    const cotiz = CONFIG.cotizaciones[tipoMetal];
    if (!cotiz) throw new Error(`Cotización no encontrada: ${tipoMetal}`);
    return _round(cotiz * gramos);
  }

  // ─────────────────────────────────────────────────────────────
  // PIEZAS (cada SKU es único, cantidad = 1)
  // ─────────────────────────────────────────────────────────────
  function registrarPieza(data) {
    _requerir(data, ['nombre', 'tipoMetal', 'gramos']);
    const sku = data.sku || _folio('pieza');
    if (DB.piezas.has(sku)) throw new Error(`SKU ya existe: ${sku}`);

    const valorMetal = calcularValorMetal(data.tipoMetal, data.gramos);
    const manoObra   = _round(valorMetal * CONFIG.margenManoObra);
    const piedras    = _round(data.valorPiedras || 0);
    const subtotal   = valorMetal + manoObra + piedras;
    const precio     = data.precioFijo
      ? _round(data.precioFijo)
      : _round(subtotal * (1 + CONFIG.ivaPct));

    const pieza = {
      sku,
      nombre: data.nombre,
      categoria: data.categoria || 'general',  // anillo, cadena, dije, arete...
      tipoMetal: data.tipoMetal,
      kilates: data.kilates || null,
      gramos: data.gramos,
      valorPiedras: piedras,
      piedras: data.piedras || [],             // [{tipo, quilates, color, claridad}]
      proveedor: data.proveedor || null,
      costoAdquisicion: _round(data.costoAdquisicion || 0),
      precioVenta: precio,
      desglose: { valorMetal, manoObra, piedras, subtotal },
      foto: data.foto || null,
      ubicacion: data.ubicacion || 'vitrina',
      estado: 'disponible',                    // disponible | apartada | vendida | reparacion
      fechaIngreso: _now(),
      fechaVenta: null,
      certificadoId: null,
      garantiaId: null,
      notas: data.notas || ''
    };

    DB.piezas.set(sku, pieza);
    return pieza;
  }

  function obtenerPieza(sku) {
    return DB.piezas.get(sku) || null;
  }

  function listarPiezas(filtro = {}) {
    let arr = Array.from(DB.piezas.values());
    if (filtro.estado)    arr = arr.filter(p => p.estado === filtro.estado);
    if (filtro.categoria) arr = arr.filter(p => p.categoria === filtro.categoria);
    if (filtro.tipoMetal) arr = arr.filter(p => p.tipoMetal === filtro.tipoMetal);
    return arr;
  }

  function reevaluarPieza(sku) {
    const p = DB.piezas.get(sku);
    if (!p) throw new Error(`Pieza no encontrada: ${sku}`);
    const valorMetal = calcularValorMetal(p.tipoMetal, p.gramos);
    const manoObra   = _round(valorMetal * CONFIG.margenManoObra);
    const subtotal   = valorMetal + manoObra + p.valorPiedras;
    p.precioVenta    = _round(subtotal * (1 + CONFIG.ivaPct));
    p.desglose       = { valorMetal, manoObra, piedras: p.valorPiedras, subtotal };
    return p;
  }

  // ─────────────────────────────────────────────────────────────
  // CERTIFICADOS de autenticidad
  // ─────────────────────────────────────────────────────────────
  function emitirCertificado(sku, data = {}) {
    const pieza = DB.piezas.get(sku);
    if (!pieza) throw new Error(`Pieza no encontrada: ${sku}`);
    const id = _folio('cert');
    const cert = {
      id,
      sku,
      tipo: data.tipo || 'autenticidad',     // autenticidad | gemologico | metal
      gemologo: data.gemologo || null,
      laboratorio: data.laboratorio || 'Volvix Lab',
      hallazgos: data.hallazgos || [],
      pesoCertificado: pieza.gramos,
      tipoMetalCertificado: pieza.tipoMetal,
      kilatesCertificado: pieza.kilates,
      piedrasCertificadas: pieza.piedras,
      fechaEmision: _now(),
      vigente: true,
      hashIntegridad: _hashCert(sku, pieza.gramos, pieza.tipoMetal)
    };
    DB.certificados.set(id, cert);
    pieza.certificadoId = id;
    return cert;
  }

  function _hashCert(sku, gramos, metal) {
    const s = `${sku}|${gramos}|${metal}|${Date.now()}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'C' + Math.abs(h).toString(16).toUpperCase();
  }

  function verificarCertificado(id) {
    const c = DB.certificados.get(id);
    if (!c) return { valido: false, motivo: 'no_existe' };
    if (!c.vigente) return { valido: false, motivo: 'revocado' };
    return { valido: true, certificado: c };
  }

  // ─────────────────────────────────────────────────────────────
  // GARANTÍAS
  // ─────────────────────────────────────────────────────────────
  function emitirGarantia(sku, ventaId, meses) {
    const pieza = DB.piezas.get(sku);
    if (!pieza) throw new Error(`Pieza no encontrada: ${sku}`);
    const id = _folio('gar');
    const m  = meses || CONFIG.garantiaDefaultMeses;
    const ini = new Date();
    const fin = new Date(ini.getTime());
    fin.setMonth(fin.getMonth() + m);

    const gar = {
      id, sku, ventaId,
      meses: m,
      cubre: ['defectos de fabricación', 'soldaduras', 'engastes'],
      excluye: ['golpes', 'pérdida', 'desgaste por uso', 'modificaciones externas'],
      fechaInicio: ini.toISOString(),
      fechaFin: fin.toISOString(),
      estado: 'activa',
      reclamos: []
    };
    DB.garantias.set(id, gar);
    pieza.garantiaId = id;
    return gar;
  }

  function reclamarGarantia(id, motivo) {
    const g = DB.garantias.get(id);
    if (!g) throw new Error(`Garantía no encontrada: ${id}`);
    if (new Date(g.fechaFin) < new Date()) {
      g.estado = 'vencida';
      throw new Error('Garantía vencida');
    }
    g.reclamos.push({ fecha: _now(), motivo, estado: 'recibido' });
    return g;
  }

  // ─────────────────────────────────────────────────────────────
  // REPARACIONES
  // ─────────────────────────────────────────────────────────────
  function recibirReparacion(data) {
    _requerir(data, ['cliente', 'descripcionPieza', 'problema']);
    const id = _folio('rep');
    const rep = {
      id,
      cliente: data.cliente,                  // {nombre, tel, email}
      descripcionPieza: data.descripcionPieza,
      pesoEstimado: data.pesoEstimado || null,
      problema: data.problema,
      fotosIngreso: data.fotosIngreso || [],
      presupuesto: null,
      aprobado: false,
      estado: 'recibida',                      // recibida|presupuestada|aprobada|en_proceso|lista|entregada
      fechaIngreso: _now(),
      fechaPresupuesto: null,
      fechaListo: null,
      fechaEntrega: null,
      tecnico: data.tecnico || null,
      notas: data.notas || ''
    };
    DB.reparaciones.set(id, rep);
    return rep;
  }

  function presupuestarReparacion(id, monto, descripcion) {
    const r = DB.reparaciones.get(id);
    if (!r) throw new Error(`Reparación no encontrada: ${id}`);
    r.presupuesto = { monto: _round(monto), descripcion, fecha: _now() };
    r.estado = 'presupuestada';
    r.fechaPresupuesto = _now();
    return r;
  }

  function aprobarReparacion(id) {
    const r = DB.reparaciones.get(id);
    if (!r) throw new Error(`Reparación no encontrada: ${id}`);
    if (!r.presupuesto) throw new Error('Sin presupuesto');
    r.aprobado = true;
    r.estado = 'en_proceso';
    return r;
  }

  function finalizarReparacion(id) {
    const r = DB.reparaciones.get(id);
    if (!r) throw new Error(`Reparación no encontrada: ${id}`);
    r.estado = 'lista';
    r.fechaListo = _now();
    return r;
  }

  function entregarReparacion(id) {
    const r = DB.reparaciones.get(id);
    if (!r) throw new Error(`Reparación no encontrada: ${id}`);
    r.estado = 'entregada';
    r.fechaEntrega = _now();
    return r;
  }

  // ─────────────────────────────────────────────────────────────
  // APARTADOS / LAYAWAY
  // ─────────────────────────────────────────────────────────────
  function crearApartado(sku, cliente, anticipo) {
    const pieza = DB.piezas.get(sku);
    if (!pieza) throw new Error(`Pieza no encontrada: ${sku}`);
    if (pieza.estado !== 'disponible') throw new Error(`Pieza no disponible: ${pieza.estado}`);
    const id = _folio('apt');
    const apt = {
      id, sku, cliente,
      precioTotal: pieza.precioVenta,
      anticipo: _round(anticipo),
      saldo: _round(pieza.precioVenta - anticipo),
      abonos: [{ fecha: _now(), monto: _round(anticipo), tipo: 'anticipo' }],
      fechaApartado: _now(),
      fechaLimite: null,
      estado: 'activo'
    };
    pieza.estado = 'apartada';
    DB.apartados.set(id, apt);
    return apt;
  }

  function abonarApartado(id, monto) {
    const a = DB.apartados.get(id);
    if (!a) throw new Error(`Apartado no encontrado: ${id}`);
    if (a.estado !== 'activo') throw new Error(`Apartado ${a.estado}`);
    a.abonos.push({ fecha: _now(), monto: _round(monto), tipo: 'abono' });
    a.saldo = _round(a.saldo - monto);
    if (a.saldo <= 0) {
      a.saldo = 0;
      a.estado = 'liquidado';
    }
    return a;
  }

  function cancelarApartado(id, retencionPct = 0.20) {
    const a = DB.apartados.get(id);
    if (!a) throw new Error(`Apartado no encontrado: ${id}`);
    const totalAbonado = a.abonos.reduce((s, x) => s + x.monto, 0);
    const retencion = _round(totalAbonado * retencionPct);
    const reembolso = _round(totalAbonado - retencion);
    a.estado = 'cancelado';
    a.reembolso = reembolso;
    a.retencion = retencion;
    const pieza = DB.piezas.get(a.sku);
    if (pieza) pieza.estado = 'disponible';
    return a;
  }

  // ─────────────────────────────────────────────────────────────
  // VENTA de pieza
  // ─────────────────────────────────────────────────────────────
  function venderPieza(sku, cliente, opciones = {}) {
    const pieza = DB.piezas.get(sku);
    if (!pieza) throw new Error(`Pieza no encontrada: ${sku}`);
    if (pieza.estado === 'vendida') throw new Error('Pieza ya vendida');

    const id = _folio('venta');
    const venta = {
      id, sku, cliente,
      precio: pieza.precioVenta,
      formaPago: opciones.formaPago || 'efectivo',
      fecha: _now(),
      vendedor: opciones.vendedor || null,
      certificadoId: pieza.certificadoId,
      garantiaId: null
    };

    pieza.estado = 'vendida';
    pieza.fechaVenta = _now();

    // Auto-emitir garantía
    if (opciones.emitirGarantia !== false) {
      const g = emitirGarantia(sku, id, opciones.mesesGarantia);
      venta.garantiaId = g.id;
    }
    // Auto-emitir certificado si no tiene
    if (!pieza.certificadoId && opciones.emitirCertificado !== false) {
      const c = emitirCertificado(sku);
      venta.certificadoId = c.id;
    }

    DB.ventas.set(id, venta);
    return venta;
  }

  // ─────────────────────────────────────────────────────────────
  // REPORTES
  // ─────────────────────────────────────────────────────────────
  function reporteInventario() {
    const piezas = Array.from(DB.piezas.values());
    const porEstado = {};
    let valorTotal = 0;
    let gramosOro = 0, gramosPlata = 0;
    for (const p of piezas) {
      porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
      if (p.estado === 'disponible' || p.estado === 'apartada') {
        valorTotal += p.precioVenta;
        if (p.tipoMetal.startsWith('oro_'))   gramosOro   += p.gramos;
        if (p.tipoMetal.startsWith('plata_')) gramosPlata += p.gramos;
      }
    }
    return {
      totalPiezas: piezas.length,
      porEstado,
      valorInventario: _round(valorTotal),
      gramosOro: _round(gramosOro, 3),
      gramosPlata: _round(gramosPlata, 3)
    };
  }

  function reporteVentas(desde, hasta) {
    const d = desde ? new Date(desde) : new Date(0);
    const h = hasta ? new Date(hasta) : new Date();
    const ventas = Array.from(DB.ventas.values()).filter(v => {
      const f = new Date(v.fecha);
      return f >= d && f <= h;
    });
    const total = ventas.reduce((s, v) => s + v.precio, 0);
    return {
      cantidad: ventas.length,
      total: _round(total),
      ticketPromedio: ventas.length ? _round(total / ventas.length) : 0,
      ventas
    };
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  const JoyeriaAPI = {
    // config
    config: CONFIG,
    actualizarCotizacion,
    obtenerCotizaciones,
    calcularValorMetal,
    // piezas
    registrarPieza,
    obtenerPieza,
    listarPiezas,
    reevaluarPieza,
    // certificados
    emitirCertificado,
    verificarCertificado,
    // garantías
    emitirGarantia,
    reclamarGarantia,
    // reparaciones
    recibirReparacion,
    presupuestarReparacion,
    aprobarReparacion,
    finalizarReparacion,
    entregarReparacion,
    // apartados
    crearApartado,
    abonarApartado,
    cancelarApartado,
    // ventas
    venderPieza,
    // reportes
    reporteInventario,
    reporteVentas,
    // debug
    _db: DB,
    version: '1.0.0'
  };

  global.JoyeriaAPI = JoyeriaAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JoyeriaAPI;
  }

})(typeof window !== 'undefined' ? window : globalThis);
