/**
 * VOLVIX POS — Vertical: Florería
 * Módulo especializado para puntos de venta de florerías.
 *
 * Funcionalidades:
 *  - Catálogo de arreglos custom (rosas, mixtos, fúnebres, novias)
 *  - Calendario de fechas especiales (San Valentín, Día Madres, etc.)
 *  - Entregas programadas con ventana horaria
 *  - Tarjetas de mensaje personalizadas
 *  - Cálculo de recargos por urgencia / domicilio
 *  - Estado de órdenes (pendiente, en preparación, en ruta, entregado)
 *
 * Expone: window.FloreriaAPI
 */
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // 1. CATÁLOGO BASE DE ARREGLOS
  // ────────────────────────────────────────────────────────────
  const CATALOGO_ARREGLOS = [
    { id: 'ARR-001', nombre: 'Docena de rosas rojas', categoria: 'romantico', precio: 450, stock: 30 },
    { id: 'ARR-002', nombre: 'Media docena rosas rosadas', categoria: 'romantico', precio: 280, stock: 25 },
    { id: 'ARR-003', nombre: 'Bouquet mixto primaveral', categoria: 'mixto', precio: 380, stock: 20 },
    { id: 'ARR-004', nombre: 'Corona fúnebre estándar', categoria: 'funebre', precio: 1200, stock: 10 },
    { id: 'ARR-005', nombre: 'Cruz floral fúnebre', categoria: 'funebre', precio: 950, stock: 8 },
    { id: 'ARR-006', nombre: 'Bouquet de novia clásico', categoria: 'novia', precio: 1800, stock: 5 },
    { id: 'ARR-007', nombre: 'Centro de mesa eventos', categoria: 'eventos', precio: 650, stock: 15 },
    { id: 'ARR-008', nombre: 'Girasoles x 6', categoria: 'mixto', precio: 320, stock: 18 },
    { id: 'ARR-009', nombre: 'Tulipanes holandeses x 12', categoria: 'romantico', precio: 580, stock: 12 },
    { id: 'ARR-010', nombre: 'Orquídea phalaenopsis', categoria: 'planta', precio: 420, stock: 14 }
  ];

  const FECHAS_ESPECIALES = [
    { fecha: '02-14', nombre: 'San Valentín', recargo: 0.25 },
    { fecha: '05-10', nombre: 'Día de las Madres (MX)', recargo: 0.30 },
    { fecha: '03-08', nombre: 'Día Internacional de la Mujer', recargo: 0.15 },
    { fecha: '11-02', nombre: 'Día de Muertos', recargo: 0.20 },
    { fecha: '12-12', nombre: 'Día de la Virgen de Guadalupe', recargo: 0.15 },
    { fecha: '02-02', nombre: 'Día de la Candelaria', recargo: 0.10 }
  ];

  const VENTANAS_ENTREGA = [
    { id: 'V1', rango: '08:00-11:00', etiqueta: 'Mañana temprano' },
    { id: 'V2', rango: '11:00-14:00', etiqueta: 'Medio día' },
    { id: 'V3', rango: '14:00-17:00', etiqueta: 'Tarde' },
    { id: 'V4', rango: '17:00-20:00', etiqueta: 'Noche' },
    { id: 'V5', rango: 'URGENTE', etiqueta: 'En menos de 2 horas (+50%)' }
  ];

  const PLANTILLAS_TARJETA = [
    { id: 'T01', titulo: 'Te amo', cuerpo: 'Cada día contigo es un nuevo motivo para sonreír. Te amo.' },
    { id: 'T02', titulo: 'Feliz cumpleaños', cuerpo: 'Que este nuevo año te traiga alegrías y bendiciones.' },
    { id: 'T03', titulo: 'Mis condolencias', cuerpo: 'Mi más sentido pésame en este momento difícil.' },
    { id: 'T04', titulo: 'Felicidades mamá', cuerpo: 'Gracias por todo, te amo siempre.' },
    { id: 'T05', titulo: 'Pensando en ti', cuerpo: 'Solo quería que supieras que estás en mis pensamientos.' }
  ];

  // ────────────────────────────────────────────────────────────
  // 2. ESTADO INTERNO
  // ────────────────────────────────────────────────────────────
  const _ordenes = [];
  let _seqOrden = 1000;

  // ────────────────────────────────────────────────────────────
  // 3. UTILIDADES
  // ────────────────────────────────────────────────────────────
  function _hoyMMDD() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${m}-${dd}`;
  }

  function _genId() {
    return 'ORD-' + (++_seqOrden) + '-' + Date.now().toString(36).toUpperCase();
  }

  function _buscarArreglo(id) {
    return CATALOGO_ARREGLOS.find(a => a.id === id) || null;
  }

  function _esFechaEspecial(mmdd) {
    return FECHAS_ESPECIALES.find(f => f.fecha === mmdd) || null;
  }

  // ────────────────────────────────────────────────────────────
  // 4. API PÚBLICA
  // ────────────────────────────────────────────────────────────
  const FloreriaAPI = {

    listarCatalogo(categoria) {
      if (!categoria) return CATALOGO_ARREGLOS.slice();
      return CATALOGO_ARREGLOS.filter(a => a.categoria === categoria);
    },

    buscarPorNombre(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) return [];
      return CATALOGO_ARREGLOS.filter(a => a.nombre.toLowerCase().includes(q));
    },

    listarFechasEspeciales() {
      return FECHAS_ESPECIALES.slice();
    },

    listarVentanasEntrega() {
      return VENTANAS_ENTREGA.slice();
    },

    listarPlantillasTarjeta() {
      return PLANTILLAS_TARJETA.slice();
    },

    /**
     * Crea una orden de florería.
     * @param {Object} datos
     *   - items: [{arregloId, cantidad}]
     *   - cliente: {nombre, telefono}
     *   - destinatario: {nombre, direccion, telefono}
     *   - fechaEntrega: 'YYYY-MM-DD'
     *   - ventanaId: 'V1'..'V5'
     *   - tarjeta: {titulo, cuerpo, firma}
     *   - notas: string
     */
    crearOrden(datos) {
      if (!datos || !Array.isArray(datos.items) || datos.items.length === 0) {
        throw new Error('La orden debe contener al menos un arreglo');
      }
      if (!datos.destinatario || !datos.destinatario.direccion) {
        throw new Error('Falta dirección de entrega');
      }

      let subtotal = 0;
      const detalle = datos.items.map(it => {
        const arr = _buscarArreglo(it.arregloId);
        if (!arr) throw new Error('Arreglo no encontrado: ' + it.arregloId);
        if (arr.stock < it.cantidad) {
          throw new Error(`Stock insuficiente de ${arr.nombre} (disponible: ${arr.stock})`);
        }
        const importe = arr.precio * it.cantidad;
        subtotal += importe;
        return {
          arregloId: arr.id,
          nombre: arr.nombre,
          precioUnit: arr.precio,
          cantidad: it.cantidad,
          importe
        };
      });

      // Recargos
      const fechaMMDD = (datos.fechaEntrega || '').slice(5);
      const especial = _esFechaEspecial(fechaMMDD);
      const recargoEspecial = especial ? subtotal * especial.recargo : 0;

      const esUrgente = datos.ventanaId === 'V5';
      const recargoUrgencia = esUrgente ? subtotal * 0.50 : 0;

      const costoDomicilio = datos.costoDomicilio != null ? datos.costoDomicilio : 80;

      const total = subtotal + recargoEspecial + recargoUrgencia + costoDomicilio;

      // Descontar stock
      datos.items.forEach(it => {
        const arr = _buscarArreglo(it.arregloId);
        arr.stock -= it.cantidad;
      });

      const orden = {
        id: _genId(),
        creadaEn: new Date().toISOString(),
        cliente: datos.cliente || {},
        destinatario: datos.destinatario,
        fechaEntrega: datos.fechaEntrega,
        ventanaId: datos.ventanaId || 'V2',
        tarjeta: datos.tarjeta || null,
        notas: datos.notas || '',
        detalle,
        subtotal,
        recargoEspecial,
        fechaEspecial: especial ? especial.nombre : null,
        recargoUrgencia,
        costoDomicilio,
        total,
        estado: 'pendiente'
      };

      _ordenes.push(orden);
      return orden;
    },

    actualizarEstado(ordenId, nuevoEstado) {
      const validos = ['pendiente', 'en_preparacion', 'en_ruta', 'entregado', 'cancelado'];
      if (!validos.includes(nuevoEstado)) {
        throw new Error('Estado inválido: ' + nuevoEstado);
      }
      const o = _ordenes.find(x => x.id === ordenId);
      if (!o) throw new Error('Orden no encontrada: ' + ordenId);
      o.estado = nuevoEstado;
      o.actualizadaEn = new Date().toISOString();
      return o;
    },

    listarOrdenes(filtroEstado) {
      if (!filtroEstado) return _ordenes.slice();
      return _ordenes.filter(o => o.estado === filtroEstado);
    },

    obtenerOrden(ordenId) {
      return _ordenes.find(o => o.id === ordenId) || null;
    },

    /**
     * Devuelve órdenes programadas para hoy con su ventana de entrega.
     */
    agendaHoy() {
      const hoy = new Date().toISOString().slice(0, 10);
      return _ordenes
        .filter(o => o.fechaEntrega === hoy && o.estado !== 'entregado' && o.estado !== 'cancelado')
        .sort((a, b) => (a.ventanaId || '').localeCompare(b.ventanaId || ''));
    },

    /**
     * Indica si la fecha (YYYY-MM-DD) es especial.
     */
    esDiaEspecial(fechaISO) {
      const mmdd = (fechaISO || _hoyMMDD()).slice(-5);
      return _esFechaEspecial(mmdd);
    },

    reabastecer(arregloId, cantidad) {
      const arr = _buscarArreglo(arregloId);
      if (!arr) throw new Error('Arreglo no encontrado');
      if (cantidad <= 0) throw new Error('Cantidad debe ser positiva');
      arr.stock += cantidad;
      return arr;
    },

    resumenVentas() {
      const total = _ordenes
        .filter(o => o.estado !== 'cancelado')
        .reduce((acc, o) => acc + o.total, 0);
      return {
        ordenes: _ordenes.length,
        entregadas: _ordenes.filter(o => o.estado === 'entregado').length,
        pendientes: _ordenes.filter(o => o.estado === 'pendiente').length,
        totalFacturado: total
      };
    },

    version: '1.0.0'
  };

  global.FloreriaAPI = FloreriaAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloreriaAPI;
  }

})(typeof window !== 'undefined' ? window : globalThis);
