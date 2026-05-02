/**
 * volvix-vertical-carniceria.js
 * Vertical POS para Carnicería - Volvix
 *
 * Maneja: cortes, ventas por peso, precio/kg, stock fresco/congelado,
 * rotación FIFO por lote, marinados/preparados, mermas y trazabilidad.
 *
 * API pública: window.CarniceriaAPI
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Catálogo de cortes (estructura base)
  // ──────────────────────────────────────────────────────────
  const CORTES = {
    res: [
      { id: 'res_lomo',      nombre: 'Lomo fino de res',       precioKg: 320, categoria: 'premium' },
      { id: 'res_filete',    nombre: 'Filete de res',          precioKg: 280, categoria: 'premium' },
      { id: 'res_costilla',  nombre: 'Costilla de res',        precioKg: 180, categoria: 'estandar' },
      { id: 'res_molida',    nombre: 'Carne molida de res',    precioKg: 150, categoria: 'estandar' },
      { id: 'res_falda',     nombre: 'Falda de res',           precioKg: 160, categoria: 'estandar' },
      { id: 'res_chambarete',nombre: 'Chambarete',             precioKg: 140, categoria: 'economico' },
      { id: 'res_aguja',     nombre: 'Aguja norteña',          precioKg: 200, categoria: 'estandar' },
      { id: 'res_arrachera', nombre: 'Arrachera',              precioKg: 260, categoria: 'premium' },
    ],
    cerdo: [
      { id: 'cer_chuleta',   nombre: 'Chuleta de cerdo',       precioKg: 140, categoria: 'estandar' },
      { id: 'cer_lomo',      nombre: 'Lomo de cerdo',          precioKg: 160, categoria: 'estandar' },
      { id: 'cer_costilla',  nombre: 'Costilla de cerdo',      precioKg: 180, categoria: 'estandar' },
      { id: 'cer_pierna',    nombre: 'Pierna de cerdo',        precioKg: 130, categoria: 'economico' },
      { id: 'cer_panceta',   nombre: 'Panceta',                precioKg: 170, categoria: 'estandar' },
      { id: 'cer_molida',    nombre: 'Carne molida de cerdo',  precioKg: 120, categoria: 'economico' },
    ],
    pollo: [
      { id: 'pol_pechuga',   nombre: 'Pechuga de pollo',       precioKg: 110, categoria: 'estandar' },
      { id: 'pol_muslo',     nombre: 'Muslo de pollo',         precioKg: 85,  categoria: 'economico' },
      { id: 'pol_pierna',    nombre: 'Pierna de pollo',        precioKg: 80,  categoria: 'economico' },
      { id: 'pol_alas',      nombre: 'Alas de pollo',          precioKg: 75,  categoria: 'economico' },
      { id: 'pol_entero',    nombre: 'Pollo entero',           precioKg: 70,  categoria: 'economico' },
      { id: 'pol_milanesa',  nombre: 'Milanesa de pollo',      precioKg: 130, categoria: 'estandar' },
    ],
    embutidos: [
      { id: 'emb_chorizo',   nombre: 'Chorizo artesanal',      precioKg: 150, categoria: 'estandar' },
      { id: 'emb_longaniza', nombre: 'Longaniza',              precioKg: 140, categoria: 'estandar' },
      { id: 'emb_salchicha', nombre: 'Salchicha',              precioKg: 120, categoria: 'economico' },
    ],
  };

  // ──────────────────────────────────────────────────────────
  // Estado interno
  // ──────────────────────────────────────────────────────────
  const state = {
    inventario: {},      // { corteId: [ { lote, kg, fecha, estado, costoKg } ] }
    ventas: [],          // historial de tickets
    mermas: [],          // registro de mermas
    marinados: {},       // recetas activas
    ticketActual: [],    // líneas del ticket en curso
    config: {
      ivaPct: 16,
      umbralCongelado: 7,    // días para considerar congelar
      mermaMaxPct: 5,
      monedaSimbolo: '$',
    },
  };

  // ──────────────────────────────────────────────────────────
  // Utilidades
  // ──────────────────────────────────────────────────────────
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function hoy() { return new Date().toISOString().slice(0, 10); }

  function diasEntre(d1, d2) {
    const a = new Date(d1), b = new Date(d2);
    return Math.round((b - a) / 86400000);
  }

  function buscarCorte(id) {
    for (const cat in CORTES) {
      const c = CORTES[cat].find(x => x.id === id);
      if (c) return Object.assign({}, c, { especie: cat });
    }
    return null;
  }

  function redondear(n, dec = 2) {
    return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
  }

  // ──────────────────────────────────────────────────────────
  // Inventario - lotes con FIFO
  // ──────────────────────────────────────────────────────────
  function ingresarLote(corteId, kg, costoKg, estado) {
    const corte = buscarCorte(corteId);
    if (!corte) throw new Error('Corte inexistente: ' + corteId);
    if (kg <= 0) throw new Error('kg debe ser > 0');
    estado = estado || 'fresco';
    if (!['fresco', 'congelado'].includes(estado)) {
      throw new Error('Estado inválido (fresco|congelado)');
    }
    const lote = {
      lote: uid('L'),
      kg: redondear(kg, 3),
      kgInicial: redondear(kg, 3),
      fecha: hoy(),
      estado: estado,
      costoKg: redondear(costoKg || 0, 2),
    };
    if (!state.inventario[corteId]) state.inventario[corteId] = [];
    state.inventario[corteId].push(lote);
    // FIFO: ordenar por fecha asc (más viejo sale primero)
    state.inventario[corteId].sort((a, b) => a.fecha.localeCompare(b.fecha));
    return lote;
  }

  function stockTotal(corteId) {
    const lotes = state.inventario[corteId] || [];
    return redondear(lotes.reduce((s, l) => s + l.kg, 0), 3);
  }

  function descontarFIFO(corteId, kg) {
    const lotes = state.inventario[corteId] || [];
    if (stockTotal(corteId) < kg) {
      throw new Error('Stock insuficiente para ' + corteId + ' (necesita ' + kg + 'kg)');
    }
    let restante = kg;
    const consumidos = [];
    while (restante > 0 && lotes.length) {
      const l = lotes[0];
      if (l.kg <= restante) {
        consumidos.push({ lote: l.lote, kg: l.kg, costoKg: l.costoKg });
        restante = redondear(restante - l.kg, 3);
        lotes.shift();
      } else {
        consumidos.push({ lote: l.lote, kg: redondear(restante, 3), costoKg: l.costoKg });
        l.kg = redondear(l.kg - restante, 3);
        restante = 0;
      }
    }
    return consumidos;
  }

  // Convertir fresco a congelado (lote viejo)
  function congelarLotesViejos() {
    const cambiados = [];
    for (const cid in state.inventario) {
      state.inventario[cid].forEach(l => {
        if (l.estado === 'fresco' && diasEntre(l.fecha, hoy()) >= state.config.umbralCongelado) {
          l.estado = 'congelado';
          cambiados.push({ corteId: cid, lote: l.lote });
        }
      });
    }
    return cambiados;
  }

  // ──────────────────────────────────────────────────────────
  // Marinados / preparados
  // ──────────────────────────────────────────────────────────
  function registrarMarinado(nombre, corteBaseId, ingredientes, sobreprecioKg) {
    const id = uid('MAR');
    state.marinados[id] = {
      id,
      nombre,
      corteBaseId,
      ingredientes: ingredientes || [],
      sobreprecioKg: redondear(sobreprecioKg || 0, 2),
      fecha: hoy(),
    };
    return state.marinados[id];
  }

  function precioMarinado(marinadoId) {
    const m = state.marinados[marinadoId];
    if (!m) return 0;
    const base = buscarCorte(m.corteBaseId);
    return redondear((base ? base.precioKg : 0) + m.sobreprecioKg, 2);
  }

  // ──────────────────────────────────────────────────────────
  // Ticket / venta por peso
  // ──────────────────────────────────────────────────────────
  function nuevoTicket() {
    state.ticketActual = [];
    return { ok: true };
  }

  function agregarLineaPeso(corteId, kg, opts) {
    opts = opts || {};
    const corte = buscarCorte(corteId);
    if (!corte) throw new Error('Corte inválido');
    if (kg <= 0) throw new Error('kg debe ser > 0');
    let precioKg = corte.precioKg;
    let descripcion = corte.nombre;

    if (opts.marinadoId) {
      const m = state.marinados[opts.marinadoId];
      if (m) {
        precioKg = precioMarinado(opts.marinadoId);
        descripcion += ' (' + m.nombre + ')';
      }
    }
    if (opts.descuentoPct) {
      precioKg = redondear(precioKg * (1 - opts.descuentoPct / 100), 2);
    }
    const subtotal = redondear(precioKg * kg, 2);
    const linea = {
      id: uid('LN'),
      corteId,
      descripcion,
      kg: redondear(kg, 3),
      precioKg,
      subtotal,
      marinadoId: opts.marinadoId || null,
    };
    state.ticketActual.push(linea);
    return linea;
  }

  function totalTicket() {
    const sub = state.ticketActual.reduce((s, l) => s + l.subtotal, 0);
    const iva = redondear(sub * (state.config.ivaPct / 100), 2);
    return {
      subtotal: redondear(sub, 2),
      iva,
      total: redondear(sub + iva, 2),
      lineas: state.ticketActual.length,
    };
  }

  function cobrarTicket(metodoPago) {
    if (!state.ticketActual.length) throw new Error('Ticket vacío');
    const totales = totalTicket();
    const detalleCostos = [];
    state.ticketActual.forEach(l => {
      const consumidos = descontarFIFO(l.corteId, l.kg);
      const costoLinea = consumidos.reduce((s, c) => s + c.kg * c.costoKg, 0);
      detalleCostos.push({ linea: l.id, costo: redondear(costoLinea, 2), consumidos });
    });
    const ticket = {
      id: uid('TK'),
      fecha: new Date().toISOString(),
      lineas: state.ticketActual.slice(),
      totales,
      costos: detalleCostos,
      metodoPago: metodoPago || 'efectivo',
    };
    state.ventas.push(ticket);
    state.ticketActual = [];
    return ticket;
  }

  // ──────────────────────────────────────────────────────────
  // Mermas
  // ──────────────────────────────────────────────────────────
  function registrarMerma(corteId, kg, motivo) {
    if (kg <= 0) throw new Error('kg debe ser > 0');
    descontarFIFO(corteId, kg);
    const m = {
      id: uid('MM'),
      corteId,
      kg: redondear(kg, 3),
      motivo: motivo || 'no especificado',
      fecha: new Date().toISOString(),
    };
    state.mermas.push(m);
    return m;
  }

  function reporteMermas(desde, hasta) {
    return state.mermas.filter(m => {
      const f = m.fecha.slice(0, 10);
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    });
  }

  // ──────────────────────────────────────────────────────────
  // Reportes
  // ──────────────────────────────────────────────────────────
  function reporteVentas(desde, hasta) {
    const filtradas = state.ventas.filter(v => {
      const f = v.fecha.slice(0, 10);
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    });
    const total = filtradas.reduce((s, v) => s + v.totales.total, 0);
    const kg = filtradas.reduce((s, v) =>
      s + v.lineas.reduce((a, l) => a + l.kg, 0), 0);
    return {
      tickets: filtradas.length,
      kgVendidos: redondear(kg, 3),
      ingreso: redondear(total, 2),
      detalle: filtradas,
    };
  }

  function reporteInventario() {
    const out = [];
    for (const cid in state.inventario) {
      const corte = buscarCorte(cid);
      const lotes = state.inventario[cid];
      out.push({
        corteId: cid,
        nombre: corte ? corte.nombre : cid,
        kgTotal: stockTotal(cid),
        lotes: lotes.length,
        fresco: redondear(lotes.filter(l => l.estado === 'fresco').reduce((s, l) => s + l.kg, 0), 3),
        congelado: redondear(lotes.filter(l => l.estado === 'congelado').reduce((s, l) => s + l.kg, 0), 3),
      });
    }
    return out;
  }

  function corteMasVendido() {
    const acc = {};
    state.ventas.forEach(v => v.lineas.forEach(l => {
      acc[l.corteId] = (acc[l.corteId] || 0) + l.kg;
    }));
    let top = null;
    for (const cid in acc) {
      if (!top || acc[cid] > top.kg) top = { corteId: cid, kg: redondear(acc[cid], 3) };
    }
    return top;
  }

  // ──────────────────────────────────────────────────────────
  // Persistencia local
  // ──────────────────────────────────────────────────────────
  function exportar() { return JSON.stringify(state); }
  function importar(json) {
    try { Object.assign(state, JSON.parse(json)); return true; }
    catch (e) { return false; }
  }
  function guardarLocal(key) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key || 'volvix_carniceria', exportar());
  }
  function cargarLocal(key) {
    if (typeof localStorage !== 'undefined') {
      const d = localStorage.getItem(key || 'volvix_carniceria');
      if (d) return importar(d);
    }
    return false;
  }

  // ──────────────────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────────────────
  global.CarniceriaAPI = {
    CORTES,
    config: state.config,
    // catálogo
    listarCortes: (especie) => especie ? (CORTES[especie] || []) : CORTES,
    buscarCorte,
    // inventario
    ingresarLote,
    stockTotal,
    reporteInventario,
    congelarLotesViejos,
    // marinados
    registrarMarinado,
    precioMarinado,
    listarMarinados: () => Object.values(state.marinados),
    // ticket
    nuevoTicket,
    agregarLineaPeso,
    totalTicket,
    cobrarTicket,
    ticketActual: () => state.ticketActual.slice(),
    // mermas
    registrarMerma,
    reporteMermas,
    // reportes
    reporteVentas,
    corteMasVendido,
    // persistencia
    exportar,
    importar,
    guardarLocal,
    cargarLocal,
    // debug
    _state: state,
    version: '1.0.0',
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix Carnicería] API lista v1.0.0 - window.CarniceriaAPI');
  }
})(typeof window !== 'undefined' ? window : globalThis);
