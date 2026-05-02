/**
 * VOLVIX VERTICAL — LAVANDERÍA
 * Módulo POS especializado para lavanderías y tintorerías.
 *
 * Funcionalidades:
 *   - Registro de órdenes con prendas, peso (kg) y tipo de servicio
 *     (lavado, planchado, lavado en seco, tintorería, mixto).
 *   - Cálculo automático de precio por kg / por prenda / mínimo.
 *   - Ticket de cliente con folio único para reclamar (sistema "recoger").
 *   - Estados de orden: recibido → en proceso → listo → entregado.
 *   - Persistencia en localStorage.
 *   - API global: window.LavanderiaAPI
 *
 * Autor: Volvix POS — versión vertical 3.4.0
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────
  // Catálogo de servicios y tarifas (configurable)
  // ─────────────────────────────────────────────
  const TARIFAS = {
    lavado:        { nombre: 'Lavado',           porKg: 25.00, minimo: 60.00 },
    secado:        { nombre: 'Secado',           porKg: 15.00, minimo: 40.00 },
    lavado_secado: { nombre: 'Lavado y secado',  porKg: 35.00, minimo: 80.00 },
    planchado:     { nombre: 'Planchado',        porPrenda: 12.00, minimo: 30.00 },
    seco:          { nombre: 'Lavado en seco',   porPrenda: 80.00, minimo: 80.00 },
    tintoreria:    { nombre: 'Tintorería',       porPrenda: 95.00, minimo: 95.00 },
    edredon:       { nombre: 'Edredón / cobija', porPrenda: 150.00, minimo: 150.00 },
    delicado:      { nombre: 'Lavado delicado',  porKg: 45.00, minimo: 90.00 },
  };

  const PRENDAS_COMUNES = [
    'Camisa', 'Pantalón', 'Vestido', 'Falda', 'Saco', 'Abrigo',
    'Traje', 'Corbata', 'Blusa', 'Playera', 'Ropa interior',
    'Sábanas', 'Toallas', 'Cortinas', 'Manteles', 'Edredón'
  ];

  const ESTADOS = {
    RECIBIDO:  'recibido',
    PROCESO:   'en_proceso',
    LISTO:     'listo',
    ENTREGADO: 'entregado',
    CANCELADO: 'cancelado'
  };

  const STORAGE_KEY = 'volvix_lavanderia_ordenes';
  const FOLIO_KEY   = 'volvix_lavanderia_folio';

  // ─────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────
  function uid() {
    return 'L-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  }

  function nuevoFolio() {
    let n = parseInt(localStorage.getItem(FOLIO_KEY) || '1000', 10) + 1;
    localStorage.setItem(FOLIO_KEY, String(n));
    return 'LAV' + n;
  }

  function ahora() { return new Date().toISOString(); }

  function mxn(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  function cargar() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      console.warn('[Lavanderia] storage corrupto, reseteando', e);
      return [];
    }
  }

  function guardar(ordenes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ordenes));
  }

  // ─────────────────────────────────────────────
  // Clase Orden
  // ─────────────────────────────────────────────
  function Orden(data) {
    this.id          = data.id          || uid();
    this.folio       = data.folio       || nuevoFolio();
    this.cliente     = data.cliente     || { nombre: '', telefono: '', email: '' };
    this.items       = data.items       || []; // [{ tipo, descripcion, kg, piezas, subtotal }]
    this.notas       = data.notas       || '';
    this.estado      = data.estado      || ESTADOS.RECIBIDO;
    this.fechaIngreso = data.fechaIngreso || ahora();
    this.fechaPromesa = data.fechaPromesa || null;
    this.fechaEntrega = data.fechaEntrega || null;
    this.pagado      = data.pagado      || false;
    this.metodoPago  = data.metodoPago  || null;
    this.descuento   = data.descuento   || 0;
    this.total       = data.total       || 0;
    this.historial   = data.historial   || [
      { estado: ESTADOS.RECIBIDO, fecha: ahora(), nota: 'Orden creada' }
    ];
  }

  Orden.prototype.calcularTotal = function () {
    let suma = 0;
    for (const it of this.items) {
      suma += Number(it.subtotal || 0);
    }
    suma -= Number(this.descuento || 0);
    this.total = Math.max(0, Math.round(suma * 100) / 100);
    return this.total;
  };

  Orden.prototype.cambiarEstado = function (nuevo, nota) {
    if (!Object.values(ESTADOS).includes(nuevo)) {
      throw new Error('Estado inválido: ' + nuevo);
    }
    this.estado = nuevo;
    this.historial.push({ estado: nuevo, fecha: ahora(), nota: nota || '' });
    if (nuevo === ESTADOS.ENTREGADO) this.fechaEntrega = ahora();
  };

  // ─────────────────────────────────────────────
  // Cálculo de subtotal por item
  // ─────────────────────────────────────────────
  function calcularSubtotalItem(item) {
    const tarifa = TARIFAS[item.tipo];
    if (!tarifa) throw new Error('Tipo de servicio desconocido: ' + item.tipo);

    let costo = 0;
    if (tarifa.porKg && item.kg) {
      costo = Number(item.kg) * tarifa.porKg;
    }
    if (tarifa.porPrenda && item.piezas) {
      costo += Number(item.piezas) * tarifa.porPrenda;
    }
    if (costo < tarifa.minimo) costo = tarifa.minimo;
    return Math.round(costo * 100) / 100;
  }

  // ─────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────
  const LavanderiaAPI = {

    TARIFAS,
    PRENDAS_COMUNES,
    ESTADOS,

    /** Lista todas las órdenes */
    listar() {
      return cargar();
    },

    /** Busca una orden por ID o folio */
    obtener(idOFolio) {
      const ordenes = cargar();
      return ordenes.find(o => o.id === idOFolio || o.folio === idOFolio) || null;
    },

    /** Crea una orden desde datos crudos */
    crear({ cliente, items, notas, fechaPromesa, descuento }) {
      if (!cliente || !cliente.nombre) {
        throw new Error('El cliente requiere nombre');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('La orden requiere al menos un servicio');
      }

      const itemsCalc = items.map(it => ({
        tipo: it.tipo,
        descripcion: it.descripcion || (TARIFAS[it.tipo] ? TARIFAS[it.tipo].nombre : it.tipo),
        kg: Number(it.kg || 0),
        piezas: Number(it.piezas || 0),
        prendas: Array.isArray(it.prendas) ? it.prendas : [],
        subtotal: calcularSubtotalItem(it)
      }));

      const orden = new Orden({
        cliente: {
          nombre:   String(cliente.nombre).trim(),
          telefono: cliente.telefono || '',
          email:    cliente.email    || ''
        },
        items: itemsCalc,
        notas: notas || '',
        fechaPromesa: fechaPromesa || null,
        descuento: descuento || 0
      });
      orden.calcularTotal();

      const ordenes = cargar();
      ordenes.push(orden);
      guardar(ordenes);
      return orden;
    },

    /** Actualiza estado */
    cambiarEstado(idOFolio, nuevoEstado, nota) {
      const ordenes = cargar();
      const idx = ordenes.findIndex(o => o.id === idOFolio || o.folio === idOFolio);
      if (idx < 0) throw new Error('Orden no encontrada: ' + idOFolio);
      const o = Object.assign(new Orden(ordenes[idx]), ordenes[idx]);
      o.cambiarEstado(nuevoEstado, nota);
      ordenes[idx] = o;
      guardar(ordenes);
      return o;
    },

    /** Marca como pagada */
    marcarPagada(idOFolio, metodo) {
      const ordenes = cargar();
      const idx = ordenes.findIndex(o => o.id === idOFolio || o.folio === idOFolio);
      if (idx < 0) throw new Error('Orden no encontrada: ' + idOFolio);
      ordenes[idx].pagado = true;
      ordenes[idx].metodoPago = metodo || 'efectivo';
      guardar(ordenes);
      return ordenes[idx];
    },

    /** Recoger / entregar — valida folio y marca entregada */
    recoger(folio, opciones) {
      opciones = opciones || {};
      const o = this.obtener(folio);
      if (!o) throw new Error('Folio inexistente: ' + folio);
      if (o.estado === ESTADOS.ENTREGADO) {
        throw new Error('Esta orden ya fue entregada el ' + o.fechaEntrega);
      }
      if (o.estado !== ESTADOS.LISTO && !opciones.forzar) {
        throw new Error('La orden aún no está lista (estado: ' + o.estado + ')');
      }
      if (!o.pagado && !opciones.permitirImpago) {
        throw new Error('La orden no está pagada. Cobre antes de entregar.');
      }
      return this.cambiarEstado(folio, ESTADOS.ENTREGADO, opciones.nota || 'Entregada al cliente');
    },

    /** Cancela una orden */
    cancelar(idOFolio, motivo) {
      return this.cambiarEstado(idOFolio, ESTADOS.CANCELADO, motivo || 'Cancelada');
    },

    /** Filtra por estado */
    porEstado(estado) {
      return cargar().filter(o => o.estado === estado);
    },

    /** Pendientes de entrega (listas pero no entregadas) */
    pendientesRecoger() {
      return this.porEstado(ESTADOS.LISTO);
    },

    /** Reporte de caja del día */
    reporteDia(fechaISO) {
      const dia = (fechaISO || ahora()).slice(0, 10);
      const ordenes = cargar().filter(o =>
        o.fechaIngreso.slice(0, 10) === dia
      );
      const totales = ordenes.reduce((acc, o) => {
        acc.cantidad++;
        acc.bruto += Number(o.total || 0);
        if (o.pagado) acc.cobrado += Number(o.total || 0);
        return acc;
      }, { cantidad: 0, bruto: 0, cobrado: 0 });
      return { fecha: dia, ordenes, totales };
    },

    /** Genera ticket imprimible (texto plano para impresora térmica 58/80mm) */
    generarTicket(idOFolio) {
      const o = this.obtener(idOFolio);
      if (!o) throw new Error('Orden no encontrada: ' + idOFolio);

      const linea = '------------------------------';
      let t = '';
      t += '       VOLVIX LAVANDERÍA       \n';
      t += linea + '\n';
      t += 'FOLIO: ' + o.folio + '\n';
      t += 'Fecha: ' + o.fechaIngreso.replace('T', ' ').slice(0, 16) + '\n';
      if (o.fechaPromesa) {
        t += 'Entrega: ' + String(o.fechaPromesa).replace('T', ' ').slice(0, 16) + '\n';
      }
      t += linea + '\n';
      t += 'Cliente: ' + o.cliente.nombre + '\n';
      if (o.cliente.telefono) t += 'Tel: ' + o.cliente.telefono + '\n';
      t += linea + '\n';
      t += 'SERVICIOS:\n';
      for (const it of o.items) {
        const detalle = (it.kg ? it.kg + 'kg ' : '') +
                        (it.piezas ? it.piezas + 'pz ' : '');
        t += '  ' + it.descripcion + '\n';
        t += '    ' + detalle + ' ' + mxn(it.subtotal) + '\n';
        if (it.prendas && it.prendas.length) {
          t += '    [' + it.prendas.join(', ') + ']\n';
        }
      }
      if (o.descuento) t += 'Descuento: -' + mxn(o.descuento) + '\n';
      t += linea + '\n';
      t += 'TOTAL: ' + mxn(o.total) + '\n';
      t += 'Pago: ' + (o.pagado ? (o.metodoPago || 'sí') : 'PENDIENTE') + '\n';
      t += linea + '\n';
      t += 'Conserve este ticket para\n';
      t += 'recoger su ropa.\n';
      t += '   ¡Gracias por su preferencia!\n';
      return t;
    },

    /** Imprime ticket vía window.print() en una ventana auxiliar */
    imprimirTicket(idOFolio) {
      const txt = this.generarTicket(idOFolio);
      const w = window.open('', '_blank', 'width=320,height=600');
      if (!w) throw new Error('Pop-up bloqueado');
      w.document.write('<pre style="font-family:monospace;font-size:12px;">' +
        txt.replace(/</g, '&lt;') + '</pre>');
      w.document.close();
      w.focus();
      w.print();
      return true;
    },

    /** Helper para construir items */
    construirItem({ tipo, kg, piezas, prendas, descripcion }) {
      const it = { tipo, kg: kg || 0, piezas: piezas || 0,
                   prendas: prendas || [], descripcion: descripcion || '' };
      it.subtotal = calcularSubtotalItem(it);
      return it;
    },

    /** Reset total (peligroso, sólo para desarrollo) */
    _reset() {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FOLIO_KEY);
      return true;
    },

    version: '3.4.0'
  };

  // Exponer
  global.LavanderiaAPI = LavanderiaAPI;

  if (typeof console !== 'undefined') {
    console.log('[Volvix Lavandería] módulo cargado v' + LavanderiaAPI.version);
  }

})(typeof window !== 'undefined' ? window : globalThis);
