/**
 * VOLVIX POS — Vertical: TABAQUERÍA
 * Control de edad estricto (18+/21+), IEPS de tabaco, marcas, vapeo/cigarros electrónicos
 * Expone window.TabaqueriaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONFIGURACIÓN FISCAL Y LEGAL (México - LIEPS / COFEPRIS)
  // ─────────────────────────────────────────────────────────────
  const CONFIG = {
    edadMinimaTabaco: 18,
    edadMinimaVapeo: 21,                 // política interna más estricta
    requiereIdentificacionOficial: true,
    documentosValidos: ['INE', 'PASAPORTE', 'CEDULA_PROFESIONAL', 'LICENCIA_CONDUCIR'],
    horarioVentaInicio: '07:00',
    horarioVentaFin:    '23:00',
    bloquearVentaMenores: true,
    registrarTodaVenta: true,
    leyendaSanitaria: 'ESTE PRODUCTO CONTIENE NICOTINA. SU CONSUMO ES DAÑINO PARA LA SALUD.',
    moneda: 'MXN',
    iva: 0.16
  };

  // IEPS por categoría (LIEPS Art. 2-I-C, valores aproximados de referencia)
  const IEPS_RATES = {
    cigarros:        { adValorem: 1.60, especifico: 0.5484 }, // 160% + cuota por cigarro
    puros:           { adValorem: 1.60, especifico: 0.0000 },
    tabacoLabrado:   { adValorem: 0.305, especifico: 0.0000 },
    vapeoLiquidos:   { adValorem: 0.30, especifico: 0.0000 },
    vapeoDispositivo:{ adValorem: 0.30, especifico: 0.0000 },
    accesorios:      { adValorem: 0.00, especifico: 0.0000 }
  };

  // Catálogo de marcas comunes (extensible)
  const MARCAS = {
    cigarros: ['Marlboro','Camel','Pall Mall','Lucky Strike','Delicados','Montana','Benson & Hedges','Raleigh','Faros'],
    puros:    ['Te-Amo','Santa Clara','Cohiba','Romeo y Julieta','Montecristo','Padron'],
    vapeo:    ['Juul','Vuse','Elf Bar','Lost Mary','SMOK','Vaporesso','GeekVape','Voopoo'],
    accesorios:['Zippo','Bic','Clipper','Cricket','RAW','OCB','Smoking']
  };

  // ─────────────────────────────────────────────────────────────
  // ESTADO INTERNO
  // ─────────────────────────────────────────────────────────────
  const state = {
    productos: new Map(),
    ventas: [],
    bitacoraVerificacionEdad: [],
    cajeroId: null,
    sucursalId: null
  };

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────
  function uid(prefix){ return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }
  function ahora(){ return new Date().toISOString(); }

  function dentroDeHorario() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const cur = `${hh}:${mm}`;
    return cur >= CONFIG.horarioVentaInicio && cur <= CONFIG.horarioVentaFin;
  }

  function calcularEdad(fechaNacISO) {
    const nac = new Date(fechaNacISO);
    if (isNaN(nac.getTime())) return -1;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }

  function edadMinimaPara(categoria) {
    if (categoria === 'vapeoLiquidos' || categoria === 'vapeoDispositivo') return CONFIG.edadMinimaVapeo;
    if (categoria === 'accesorios') return CONFIG.edadMinimaTabaco;
    return CONFIG.edadMinimaTabaco;
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICACIÓN DE EDAD
  // ─────────────────────────────────────────────────────────────
  function verificarEdad({ fechaNacimiento, tipoDocumento, numeroDocumento, categoriaProducto, cajeroId }) {
    const registro = {
      id: uid('age'),
      timestamp: ahora(),
      cajeroId: cajeroId || state.cajeroId,
      tipoDocumento,
      numeroDocumentoHash: numeroDocumento ? hashSimple(numeroDocumento) : null,
      categoriaProducto,
      resultado: null,
      motivo: null
    };

    if (!CONFIG.documentosValidos.includes(tipoDocumento)) {
      registro.resultado = 'RECHAZADA';
      registro.motivo = 'Documento no válido';
      state.bitacoraVerificacionEdad.push(registro);
      return { ok:false, motivo: registro.motivo };
    }

    const edad = calcularEdad(fechaNacimiento);
    const minima = edadMinimaPara(categoriaProducto);

    if (edad < 0) {
      registro.resultado = 'RECHAZADA';
      registro.motivo = 'Fecha de nacimiento inválida';
    } else if (edad < minima) {
      registro.resultado = 'RECHAZADA';
      registro.motivo = `Edad ${edad} < mínima ${minima} para ${categoriaProducto}`;
    } else {
      registro.resultado = 'APROBADA';
      registro.edadCalculada = edad;
    }

    state.bitacoraVerificacionEdad.push(registro);
    return { ok: registro.resultado === 'APROBADA', edad, motivo: registro.motivo, registroId: registro.id };
  }

  function hashSimple(s){ // hash no criptográfico, solo para no almacenar PII en claro
    let h = 0; for (let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  // ─────────────────────────────────────────────────────────────
  // CATÁLOGO DE PRODUCTOS
  // ─────────────────────────────────────────────────────────────
  function registrarProducto(p) {
    if (!p.sku || !p.nombre || !p.categoria || typeof p.precioBase !== 'number') {
      throw new Error('Producto inválido: sku, nombre, categoria, precioBase requeridos');
    }
    if (!IEPS_RATES[p.categoria]) {
      throw new Error('Categoría desconocida: ' + p.categoria);
    }
    const prod = {
      sku: p.sku,
      nombre: p.nombre,
      marca: p.marca || 'Sin marca',
      categoria: p.categoria,
      presentacion: p.presentacion || 'unidad',
      precioBase: p.precioBase,
      stock: p.stock || 0,
      contenidoNicotinaMg: p.contenidoNicotinaMg || null,
      registroSanitario: p.registroSanitario || null,
      requiereIdentificacion: true,
      activo: true
    };
    state.productos.set(prod.sku, prod);
    return prod;
  }

  function calcularPrecioConImpuestos(sku, cantidad) {
    const p = state.productos.get(sku);
    if (!p) throw new Error('SKU no encontrado: ' + sku);
    const cant = cantidad || 1;
    const ieps = IEPS_RATES[p.categoria];
    const subtotal = p.precioBase * cant;
    const iepsAdval = subtotal * ieps.adValorem;
    const iepsEsp = (ieps.especifico || 0) * cant;
    const baseIVA = subtotal + iepsAdval + iepsEsp;
    const iva = baseIVA * CONFIG.iva;
    const total = baseIVA + iva;
    return {
      sku, cantidad: cant, subtotal,
      iepsAdValorem: round2(iepsAdval),
      iepsEspecifico: round2(iepsEsp),
      iva: round2(iva),
      total: round2(total)
    };
  }

  function round2(n){ return Math.round(n*100)/100; }

  // ─────────────────────────────────────────────────────────────
  // VENTA
  // ─────────────────────────────────────────────────────────────
  function procesarVenta({ items, verificacionEdadId, cajeroId, metodoPago }) {
    if (!dentroDeHorario()) {
      return { ok:false, error:'Fuera del horario permitido de venta' };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { ok:false, error:'Venta sin items' };
    }

    // Determinar categoría más restrictiva
    let edadRequerida = CONFIG.edadMinimaTabaco;
    for (const it of items) {
      const p = state.productos.get(it.sku);
      if (!p) return { ok:false, error:'SKU inexistente: ' + it.sku };
      edadRequerida = Math.max(edadRequerida, edadMinimaPara(p.categoria));
    }

    // Buscar verificación previa
    const ver = state.bitacoraVerificacionEdad.find(v => v.id === verificacionEdadId);
    if (CONFIG.bloquearVentaMenores) {
      if (!ver || ver.resultado !== 'APROBADA') {
        return { ok:false, error:'Verificación de edad faltante o rechazada' };
      }
      if ((ver.edadCalculada || 0) < edadRequerida) {
        return { ok:false, error:`Edad ${ver.edadCalculada} insuficiente, requiere ${edadRequerida}` };
      }
    }

    // Stock + cálculos
    const lineas = [];
    let totalGeneral = 0, totalIEPS = 0, totalIVA = 0;
    for (const it of items) {
      const p = state.productos.get(it.sku);
      if (p.stock < it.cantidad) return { ok:false, error:'Stock insuficiente: ' + p.sku };
      const c = calcularPrecioConImpuestos(it.sku, it.cantidad);
      lineas.push({ ...c, nombre: p.nombre, marca: p.marca, categoria: p.categoria });
      totalGeneral += c.total;
      totalIEPS    += c.iepsAdValorem + c.iepsEspecifico;
      totalIVA     += c.iva;
    }

    // Descontar stock
    for (const it of items) {
      const p = state.productos.get(it.sku);
      p.stock -= it.cantidad;
    }

    const venta = {
      id: uid('venta'),
      timestamp: ahora(),
      cajeroId: cajeroId || state.cajeroId,
      sucursalId: state.sucursalId,
      lineas,
      totales: {
        total: round2(totalGeneral),
        ieps:  round2(totalIEPS),
        iva:   round2(totalIVA)
      },
      metodoPago: metodoPago || 'efectivo',
      verificacionEdadId,
      leyendaSanitaria: CONFIG.leyendaSanitaria
    };
    state.ventas.push(venta);
    return { ok:true, venta };
  }

  function reporteVentas({ desde, hasta } = {}) {
    const d = desde ? new Date(desde).getTime() : 0;
    const h = hasta ? new Date(hasta).getTime() : Date.now();
    const v = state.ventas.filter(x => {
      const t = new Date(x.timestamp).getTime();
      return t >= d && t <= h;
    });
    const totales = v.reduce((acc,x) => {
      acc.total += x.totales.total;
      acc.ieps  += x.totales.ieps;
      acc.iva   += x.totales.iva;
      return acc;
    }, { total:0, ieps:0, iva:0 });
    return {
      cantidad: v.length,
      totales: { total: round2(totales.total), ieps: round2(totales.ieps), iva: round2(totales.iva) },
      ventas: v
    };
  }

  function bitacoraEdad({ soloRechazadas } = {}) {
    return soloRechazadas
      ? state.bitacoraVerificacionEdad.filter(r => r.resultado === 'RECHAZADA')
      : state.bitacoraVerificacionEdad.slice();
  }

  function setContexto({ cajeroId, sucursalId }) {
    if (cajeroId)   state.cajeroId   = cajeroId;
    if (sucursalId) state.sucursalId = sucursalId;
  }

  function listarMarcas(categoria){ return categoria ? (MARCAS[categoria] || []) : MARCAS; }
  function listarProductos(){ return Array.from(state.productos.values()); }

  // ─────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  global.TabaqueriaAPI = {
    CONFIG,
    IEPS_RATES,
    MARCAS,
    setContexto,
    registrarProducto,
    listarProductos,
    listarMarcas,
    verificarEdad,
    calcularPrecioConImpuestos,
    procesarVenta,
    reporteVentas,
    bitacoraEdad,
    _state: state,
    version: '1.0.0-tabaqueria'
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix POS] Vertical Tabaquería cargado v' + global.TabaqueriaAPI.version);
  }

})(typeof window !== 'undefined' ? window : globalThis);
