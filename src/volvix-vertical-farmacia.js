/**
 * volvix-vertical-farmacia.js
 * Vertical POS para Farmacias - Volvix POS
 *
 * Funcionalidad específica:
 *  - Receta médica (validación, captura, archivo)
 *  - Lote y caducidad por SKU
 *  - Cumplimiento COFEPRIS (México)
 *  - Medicamentos controlados (Grupos I-VI)
 *  - Sustancias activas y equivalencias genéricas
 *  - Alergias del cliente y alertas cruzadas
 *
 * Expone: window.FarmaciaAPI
 */
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES COFEPRIS / Clasificación medicamentos México
  // ────────────────────────────────────────────────────────────
  const GRUPOS_CONTROLADOS = {
    I:   { nombre: 'Estupefacientes',           recetaEspecial: true,  copias: 3, dias: 30,  libro: true  },
    II:  { nombre: 'Psicotrópicos alta',        recetaEspecial: true,  copias: 3, dias: 30,  libro: true  },
    III: { nombre: 'Psicotrópicos media',       recetaEspecial: false, copias: 2, dias: 30,  libro: true  },
    IV:  { nombre: 'Receta retenida',           recetaEspecial: false, copias: 1, dias: 90,  libro: false },
    V:   { nombre: 'Antibióticos / Receta',     recetaEspecial: false, copias: 1, dias: 30,  libro: false },
    VI:  { nombre: 'Venta libre (OTC)',         recetaEspecial: false, copias: 0, dias: 0,   libro: false }
  };

  const VIAS_ADMIN = ['oral', 'sublingual', 'tópica', 'oftálmica', 'ótica', 'nasal',
                      'rectal', 'vaginal', 'inhalada', 'IM', 'IV', 'SC'];

  // ────────────────────────────────────────────────────────────
  // ESTADO INTERNO (en memoria + persistencia opcional)
  // ────────────────────────────────────────────────────────────
  const state = {
    inventario: new Map(),   // sku -> { ...producto, lotes:[] }
    clientes:   new Map(),   // id  -> { ...cliente, alergias:[], historial:[] }
    recetas:    new Map(),   // folio -> receta
    libroControlados: [],    // bitácora COFEPRIS
    ventaActual: null
  };

  function _persist() {
    try {
      const dump = {
        inventario: Array.from(state.inventario.entries()),
        clientes:   Array.from(state.clientes.entries()),
        recetas:    Array.from(state.recetas.entries()),
        libroControlados: state.libroControlados
      };
      localStorage.setItem('volvix_farmacia_v1', JSON.stringify(dump));
    } catch (e) { console.warn('[Farmacia] persist falló', e); }
  }

  function _restore() {
    try {
      const raw = localStorage.getItem('volvix_farmacia_v1');
      if (!raw) return;
      const d = JSON.parse(raw);
      state.inventario = new Map(d.inventario || []);
      state.clientes   = new Map(d.clientes   || []);
      state.recetas    = new Map(d.recetas    || []);
      state.libroControlados = d.libroControlados || [];
    } catch (e) { console.warn('[Farmacia] restore falló', e); }
  }

  // ────────────────────────────────────────────────────────────
  // PRODUCTOS / INVENTARIO con LOTE Y CADUCIDAD
  // ────────────────────────────────────────────────────────────
  function altaProducto({ sku, nombre, sustanciaActiva, presentacion, concentracion,
                          via, grupoCofepris = 'VI', precio, requiereReceta = false,
                          fabricante, registroSanitario }) {
    if (!sku || !nombre) throw new Error('SKU y nombre son obligatorios');
    if (!GRUPOS_CONTROLADOS[grupoCofepris]) throw new Error('Grupo COFEPRIS inválido');
    state.inventario.set(sku, {
      sku, nombre,
      sustanciaActiva: (sustanciaActiva || '').toLowerCase().trim(),
      presentacion, concentracion, via,
      grupoCofepris, precio: Number(precio) || 0,
      requiereReceta: !!requiereReceta || ['I','II','III','IV','V'].includes(grupoCofepris),
      fabricante, registroSanitario,
      lotes: []
    });
    _persist();
    return state.inventario.get(sku);
  }

  function agregarLote(sku, { lote, caducidad, cantidad, costo }) {
    const p = state.inventario.get(sku);
    if (!p) throw new Error('SKU no existe: ' + sku);
    if (!lote || !caducidad) throw new Error('Lote y caducidad obligatorios');
    const cad = new Date(caducidad);
    if (isNaN(cad)) throw new Error('Caducidad inválida');
    p.lotes.push({ lote, caducidad: cad.toISOString().slice(0,10),
                   cantidad: Number(cantidad)||0, costo: Number(costo)||0,
                   ingreso: new Date().toISOString() });
    p.lotes.sort((a,b) => a.caducidad.localeCompare(b.caducidad)); // FEFO
    _persist();
    return p;
  }

  function lotesPorCaducar(diasUmbral = 60) {
    const limite = new Date(); limite.setDate(limite.getDate() + diasUmbral);
    const out = [];
    for (const p of state.inventario.values()) {
      for (const l of p.lotes) {
        const cad = new Date(l.caducidad);
        if (cad <= limite && l.cantidad > 0) {
          const dias = Math.ceil((cad - new Date()) / 86400000);
          out.push({ sku: p.sku, nombre: p.nombre, lote: l.lote,
                     caducidad: l.caducidad, cantidad: l.cantidad, diasRestantes: dias });
        }
      }
    }
    return out.sort((a,b) => a.diasRestantes - b.diasRestantes);
  }

  function buscarPorSustanciaActiva(sustancia) {
    const s = (sustancia || '').toLowerCase().trim();
    return Array.from(state.inventario.values())
      .filter(p => p.sustanciaActiva.includes(s));
  }

  // ────────────────────────────────────────────────────────────
  // CLIENTES + ALERGIAS
  // ────────────────────────────────────────────────────────────
  function altaCliente({ id, nombre, telefono, email, fechaNacimiento,
                         alergias = [], padecimientos = [] }) {
    if (!id || !nombre) throw new Error('id y nombre obligatorios');
    state.clientes.set(id, {
      id, nombre, telefono, email, fechaNacimiento,
      alergias: alergias.map(a => a.toLowerCase().trim()),
      padecimientos: padecimientos.map(p => p.toLowerCase().trim()),
      historial: []
    });
    _persist();
    return state.clientes.get(id);
  }

  function agregarAlergia(idCliente, sustancia) {
    const c = state.clientes.get(idCliente);
    if (!c) throw new Error('Cliente no existe');
    const s = sustancia.toLowerCase().trim();
    if (!c.alergias.includes(s)) c.alergias.push(s);
    _persist();
    return c;
  }

  function chequearAlergias(idCliente, skus) {
    const c = state.clientes.get(idCliente);
    if (!c) return [];
    const alertas = [];
    for (const sku of skus) {
      const p = state.inventario.get(sku);
      if (!p) continue;
      for (const al of c.alergias) {
        if (p.sustanciaActiva.includes(al)) {
          alertas.push({
            severidad: 'ALTA',
            sku, producto: p.nombre,
            sustancia: p.sustanciaActiva,
            alergia: al,
            mensaje: `Cliente ${c.nombre} es alérgico a ${al} y ${p.nombre} la contiene`
          });
        }
      }
    }
    return alertas;
  }

  // ────────────────────────────────────────────────────────────
  // RECETAS MÉDICAS
  // ────────────────────────────────────────────────────────────
  function registrarReceta({ folio, idCliente, medico, cedulaProf,
                             especialidad, fechaEmision, items = [],
                             diagnostico, imagenURL }) {
    if (!folio) throw new Error('Folio de receta obligatorio');
    if (state.recetas.has(folio)) throw new Error('Folio duplicado: ' + folio);
    if (!cedulaProf || !/^\d{5,8}$/.test(String(cedulaProf))) {
      throw new Error('Cédula profesional inválida (5-8 dígitos SEP)');
    }
    const fEm = new Date(fechaEmision || Date.now());
    const receta = {
      folio, idCliente, medico, cedulaProf, especialidad,
      fechaEmision: fEm.toISOString().slice(0,10),
      diagnostico, imagenURL,
      items, // [{sku, cantidad, indicaciones, dias}]
      surtido: [], // {fecha, cantidad, ticket}
      estatus: 'vigente'
    };
    state.recetas.set(folio, receta);
    _persist();
    return receta;
  }

  function validarRecetaParaSku(folio, sku, cantidad) {
    const r = state.recetas.get(folio);
    if (!r) return { ok:false, motivo:'Folio inexistente' };
    const p = state.inventario.get(sku);
    if (!p) return { ok:false, motivo:'SKU inexistente' };
    const grupo = GRUPOS_CONTROLADOS[p.grupoCofepris];

    // Vigencia según grupo
    const dEm = new Date(r.fechaEmision);
    const diasTrans = Math.floor((Date.now() - dEm) / 86400000);
    if (grupo.dias > 0 && diasTrans > grupo.dias) {
      return { ok:false, motivo:`Receta vencida (${diasTrans}d > ${grupo.dias}d permitidos para grupo ${p.grupoCofepris})` };
    }

    // ¿El SKU está prescrito?
    const item = r.items.find(i => i.sku === sku);
    if (!item) return { ok:false, motivo:'SKU no figura en la receta' };

    // ¿Surtidos previos?
    const surtidoSku = r.surtido.filter(s => s.sku === sku)
                                .reduce((a,s) => a + s.cantidad, 0);
    if (surtidoSku + cantidad > item.cantidad) {
      return { ok:false, motivo:`Excede prescripción (${item.cantidad}, ya surtido ${surtidoSku})` };
    }

    return { ok:true, receta:r, item };
  }

  // ────────────────────────────────────────────────────────────
  // VENTA / TICKET
  // ────────────────────────────────────────────────────────────
  function nuevaVenta(idCliente = null) {
    state.ventaActual = {
      id: 'V-' + Date.now(),
      fecha: new Date().toISOString(),
      idCliente,
      items: [],
      recetas: [],
      total: 0,
      alertas: []
    };
    return state.ventaActual;
  }

  function agregarItem(sku, cantidad, folioReceta = null) {
    const v = state.ventaActual;
    if (!v) throw new Error('No hay venta activa');
    const p = state.inventario.get(sku);
    if (!p) throw new Error('SKU no existe');

    // ¿Requiere receta?
    if (p.requiereReceta) {
      if (!folioReceta) {
        throw new Error(`${p.nombre} (grupo ${p.grupoCofepris}) requiere receta médica`);
      }
      const v2 = validarRecetaParaSku(folioReceta, sku, cantidad);
      if (!v2.ok) throw new Error('Receta inválida: ' + v2.motivo);
      if (!v.recetas.includes(folioReceta)) v.recetas.push(folioReceta);
    }

    // FEFO: tomar lote más próximo a caducar
    const loteDisp = p.lotes.find(l => l.cantidad >= cantidad);
    if (!loteDisp) throw new Error('Sin stock suficiente en un solo lote para ' + p.nombre);

    // Alergias
    if (v.idCliente) {
      const al = chequearAlergias(v.idCliente, [sku]);
      if (al.length) v.alertas.push(...al);
    }

    const importe = p.precio * cantidad;
    v.items.push({
      sku, nombre: p.nombre, cantidad,
      lote: loteDisp.lote, caducidad: loteDisp.caducidad,
      precio: p.precio, importe,
      grupoCofepris: p.grupoCofepris,
      folioReceta
    });
    v.total += importe;
    return v;
  }

  function cerrarVenta({ metodoPago = 'efectivo' } = {}) {
    const v = state.ventaActual;
    if (!v) throw new Error('No hay venta activa');
    if (!v.items.length) throw new Error('Venta vacía');

    // Descontar inventario y registrar surtido en recetas
    for (const it of v.items) {
      const p = state.inventario.get(it.sku);
      const lote = p.lotes.find(l => l.lote === it.lote);
      lote.cantidad -= it.cantidad;

      if (it.folioReceta) {
        const r = state.recetas.get(it.folioReceta);
        r.surtido.push({ sku: it.sku, cantidad: it.cantidad,
                         fecha: new Date().toISOString(), ticket: v.id });
      }

      // Libro de controlados
      if (GRUPOS_CONTROLADOS[it.grupoCofepris].libro) {
        state.libroControlados.push({
          fecha: new Date().toISOString(),
          ticket: v.id,
          idCliente: v.idCliente,
          sku: it.sku, nombre: it.nombre,
          lote: it.lote, caducidad: it.caducidad,
          cantidad: it.cantidad,
          grupo: it.grupoCofepris,
          folioReceta: it.folioReceta
        });
      }
    }

    // Historial cliente
    if (v.idCliente && state.clientes.has(v.idCliente)) {
      state.clientes.get(v.idCliente).historial.push({
        ticket: v.id, fecha: v.fecha, total: v.total,
        skus: v.items.map(i => i.sku)
      });
    }

    v.metodoPago = metodoPago;
    v.estatus = 'cerrada';
    const cerrada = v;
    state.ventaActual = null;
    _persist();
    return cerrada;
  }

  // ────────────────────────────────────────────────────────────
  // REPORTES COFEPRIS
  // ────────────────────────────────────────────────────────────
  function reporteLibroControlados(desde, hasta) {
    const d = desde ? new Date(desde) : new Date(0);
    const h = hasta ? new Date(hasta) : new Date();
    return state.libroControlados.filter(r => {
      const f = new Date(r.fecha);
      return f >= d && f <= h;
    });
  }

  function exportarLibroCSV() {
    const headers = ['fecha','ticket','cliente','sku','producto','lote','caducidad','cantidad','grupo','receta'];
    const rows = state.libroControlados.map(r => [
      r.fecha, r.ticket, r.idCliente || '', r.sku, r.nombre,
      r.lote, r.caducidad, r.cantidad, r.grupo, r.folioReceta || ''
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  // ────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────
  _restore();

  global.FarmaciaAPI = {
    // catálogos
    GRUPOS_CONTROLADOS, VIAS_ADMIN,
    // inventario
    altaProducto, agregarLote, lotesPorCaducar, buscarPorSustanciaActiva,
    // clientes
    altaCliente, agregarAlergia, chequearAlergias,
    // recetas
    registrarReceta, validarRecetaParaSku,
    // venta
    nuevaVenta, agregarItem, cerrarVenta,
    // reportes
    reporteLibroControlados, exportarLibroCSV,
    // estado (solo lectura segura)
    _state: () => ({
      inventario: state.inventario.size,
      clientes:   state.clientes.size,
      recetas:    state.recetas.size,
      libro:      state.libroControlados.length,
      ventaActiva: !!state.ventaActual
    })
  };

  console.log('[Volvix] FarmaciaAPI cargada — window.FarmaciaAPI');
})(typeof window !== 'undefined' ? window : globalThis);
