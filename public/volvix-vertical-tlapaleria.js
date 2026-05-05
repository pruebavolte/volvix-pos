/**
 * Volvix POS - Vertical Tlapalería
 * Módulo especializado para tlapalerías: pintura por litros, tonos custom,
 * herramientas, mezclas, ferretería básica.
 *
 * API: window.TlapaleriaAPI
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // CATÁLOGOS BASE
  // ──────────────────────────────────────────────────────────────
  const BASES_PINTURA = {
    VINILICA:   { id: 'VIN', nombre: 'Vinílica',        precioLitro: 85.00, rendimiento: 12 },
    ESMALTE:    { id: 'ESM', nombre: 'Esmalte',         precioLitro: 145.00, rendimiento: 10 },
    ACRILICA:   { id: 'ACR', nombre: 'Acrílica',        precioLitro: 175.00, rendimiento: 14 },
    IMPERMEAB:  { id: 'IMP', nombre: 'Impermeabilizante', precioLitro: 110.00, rendimiento: 8 },
    ANTICORR:   { id: 'ANT', nombre: 'Anticorrosiva',   precioLitro: 195.00, rendimiento: 9 },
    BARNIZ:     { id: 'BAR', nombre: 'Barniz',          precioLitro: 165.00, rendimiento: 13 }
  };

  const COLORANTES = {
    AMARILLO: { id: 'CL01', nombre: 'Amarillo Óxido',  precioMl: 0.85 },
    ROJO:     { id: 'CL02', nombre: 'Rojo Cadmio',     precioMl: 1.10 },
    AZUL:     { id: 'CL03', nombre: 'Azul Ultramar',   precioMl: 1.05 },
    VERDE:    { id: 'CL04', nombre: 'Verde Ftalo',     precioMl: 1.20 },
    NEGRO:    { id: 'CL05', nombre: 'Negro Carbón',    precioMl: 0.75 },
    BLANCO:   { id: 'CL06', nombre: 'Blanco Titanio',  precioMl: 0.65 },
    OCRE:     { id: 'CL07', nombre: 'Ocre Natural',    precioMl: 0.90 },
    UMBER:    { id: 'CL08', nombre: 'Tierra Sombra',   precioMl: 0.95 }
  };

  const HERRAMIENTAS = [
    { sku: 'HRR-001', nombre: 'Rodillo felpa 9"',       precio:   65.00, stock: 24 },
    { sku: 'HRR-002', nombre: 'Brocha cerda 4"',        precio:   78.00, stock: 18 },
    { sku: 'HRR-003', nombre: 'Brocha cerda 2"',        precio:   42.00, stock: 30 },
    { sku: 'HRR-004', nombre: 'Charola para pintar',    precio:   55.00, stock: 15 },
    { sku: 'HRR-005', nombre: 'Espátula 3"',            precio:   38.00, stock: 22 },
    { sku: 'HRR-006', nombre: 'Cinta masking 24mm',     precio:   28.00, stock: 60 },
    { sku: 'HRR-007', nombre: 'Lija agua #220',         precio:   12.00, stock: 120 },
    { sku: 'HRR-008', nombre: 'Thinner estándar 1L',    precio:   95.00, stock: 40 },
    { sku: 'HRR-009', nombre: 'Aguarrás mineral 1L',    precio:  110.00, stock: 25 },
    { sku: 'HRR-010', nombre: 'Pistola airless básica', precio: 1850.00, stock: 4 },
    { sku: 'FER-001', nombre: 'Clavo 2" (kg)',          precio:   45.00, stock: 80 },
    { sku: 'FER-002', nombre: 'Tornillo autorroscante', precio:    1.50, stock: 500 },
    { sku: 'FER-003', nombre: 'Taquete plástico 1/4"',  precio:    2.00, stock: 400 }
  ];

  // ──────────────────────────────────────────────────────────────
  // ESTADO INTERNO
  // ──────────────────────────────────────────────────────────────
  const _state = {
    mezclasGuardadas: new Map(),  // codigo -> receta
    ticketActual: [],
    folioMezcla: 1000
  };

  // ──────────────────────────────────────────────────────────────
  // UTILIDADES
  // ──────────────────────────────────────────────────────────────
  function _redondea(n, dec = 2) {
    const f = Math.pow(10, dec);
    return Math.round(n * f) / f;
  }

  function _validaLitros(litros) {
    const l = Number(litros);
    if (!isFinite(l) || l <= 0) throw new Error('Litros inválidos: ' + litros);
    if (l > 200) throw new Error('Cantidad excesiva (>200L). Use pedido especial.');
    return l;
  }

  function _validaBase(baseId) {
    const base = Object.values(BASES_PINTURA).find(b => b.id === baseId || b.nombre.toUpperCase() === String(baseId).toUpperCase());
    if (!base) throw new Error('Base de pintura desconocida: ' + baseId);
    return base;
  }

  function _validaColorante(colId) {
    const col = Object.values(COLORANTES).find(c => c.id === colId || c.nombre.toUpperCase() === String(colId).toUpperCase());
    if (!col) throw new Error('Colorante desconocido: ' + colId);
    return col;
  }

  // ──────────────────────────────────────────────────────────────
  // CÁLCULOS DE PINTURA
  // ──────────────────────────────────────────────────────────────
  function calcularPinturaPorLitros(baseId, litros) {
    const base = _validaBase(baseId);
    const l = _validaLitros(litros);
    const subtotal = _redondea(base.precioLitro * l);
    return {
      base: base.nombre,
      litros: l,
      precioUnitario: base.precioLitro,
      subtotal,
      coberturaM2: _redondea(base.rendimiento * l, 1)
    };
  }

  function calcularPinturaPorArea(baseId, metrosCuadrados, manos = 2) {
    const base = _validaBase(baseId);
    const m2 = Number(metrosCuadrados);
    if (!isFinite(m2) || m2 <= 0) throw new Error('Metros cuadrados inválidos');
    const litrosNecesarios = _redondea((m2 * manos) / base.rendimiento, 2);
    return calcularPinturaPorLitros(base.id, Math.max(1, Math.ceil(litrosNecesarios)));
  }

  // ──────────────────────────────────────────────────────────────
  // TONOS CUSTOM (mezclas de colorante sobre base)
  // ──────────────────────────────────────────────────────────────
  /**
   * receta = [{ colorante: 'CL01', ml: 30 }, ...]
   */
  function crearTonoCustom(baseId, litrosBase, receta, nombreCliente = '') {
    const base = _validaBase(baseId);
    const litros = _validaLitros(litrosBase);
    if (!Array.isArray(receta) || receta.length === 0) {
      throw new Error('Receta vacía. Agregue al menos un colorante.');
    }

    let costoColorantes = 0;
    const detalleColorantes = receta.map(item => {
      const col = _validaColorante(item.colorante);
      const ml = Number(item.ml);
      if (!isFinite(ml) || ml <= 0) throw new Error('ml inválidos para ' + col.nombre);
      if (ml > 500) throw new Error('Carga de colorante excesiva (>500ml) para ' + col.nombre);
      const importe = _redondea(col.precioMl * ml);
      costoColorantes += importe;
      return { id: col.id, nombre: col.nombre, ml, importe };
    });

    const costoBase = _redondea(base.precioLitro * litros);
    const subtotal = _redondea(costoBase + costoColorantes);
    const margenTono = _redondea(subtotal * 0.08); // 8% por servicio de mezcla
    const total = _redondea(subtotal + margenTono);

    const folio = 'TC-' + (++_state.folioMezcla);
    const mezcla = {
      folio,
      fecha: new Date().toISOString(),
      cliente: nombreCliente,
      base: base.nombre,
      litros,
      colorantes: detalleColorantes,
      costoBase,
      costoColorantes: _redondea(costoColorantes),
      servicioMezcla: margenTono,
      total
    };
    _state.mezclasGuardadas.set(folio, mezcla);
    return mezcla;
  }

  function recuperarTono(folio) {
    const m = _state.mezclasGuardadas.get(folio);
    if (!m) throw new Error('Folio de tono no encontrado: ' + folio);
    return Object.assign({}, m);
  }

  function repetirTono(folio, nuevosLitros) {
    const original = recuperarTono(folio);
    const factor = nuevosLitros / original.litros;
    const recetaEscalada = original.colorantes.map(c => ({
      colorante: c.id,
      ml: _redondea(c.ml * factor, 1)
    }));
    const baseId = Object.values(BASES_PINTURA).find(b => b.nombre === original.base).id;
    return crearTonoCustom(baseId, nuevosLitros, recetaEscalada, original.cliente + ' (repetición ' + folio + ')');
  }

  // ──────────────────────────────────────────────────────────────
  // HERRAMIENTAS / FERRETERÍA
  // ──────────────────────────────────────────────────────────────
  function buscarHerramienta(termino) {
    const t = String(termino).toLowerCase();
    return HERRAMIENTAS.filter(h =>
      h.sku.toLowerCase().includes(t) || h.nombre.toLowerCase().includes(t)
    );
  }

  function obtenerHerramienta(sku) {
    const h = HERRAMIENTAS.find(x => x.sku === sku);
    if (!h) throw new Error('SKU no encontrado: ' + sku);
    return h;
  }

  function ajustarStock(sku, delta) {
    const h = obtenerHerramienta(sku);
    if (h.stock + delta < 0) throw new Error('Stock insuficiente de ' + h.nombre + ' (disp: ' + h.stock + ')');
    h.stock += delta;
    return h.stock;
  }

  // ──────────────────────────────────────────────────────────────
  // TICKET / VENTA
  // ──────────────────────────────────────────────────────────────
  function nuevoTicket() {
    _state.ticketActual = [];
    return true;
  }

  function agregarPinturaLitros(baseId, litros) {
    const item = calcularPinturaPorLitros(baseId, litros);
    _state.ticketActual.push({ tipo: 'PINTURA_LT', descripcion: item.base + ' ' + item.litros + 'L', importe: item.subtotal, detalle: item });
    return item;
  }

  function agregarTonoCustom(baseId, litros, receta, cliente) {
    const mezcla = crearTonoCustom(baseId, litros, receta, cliente);
    _state.ticketActual.push({ tipo: 'TONO_CUSTOM', descripcion: 'Tono ' + mezcla.folio + ' (' + mezcla.base + ' ' + mezcla.litros + 'L)', importe: mezcla.total, detalle: mezcla });
    return mezcla;
  }

  function agregarHerramienta(sku, cantidad = 1) {
    const h = obtenerHerramienta(sku);
    if (cantidad <= 0) throw new Error('Cantidad inválida');
    ajustarStock(sku, -cantidad);
    const importe = _redondea(h.precio * cantidad);
    _state.ticketActual.push({ tipo: 'HERRAMIENTA', descripcion: h.nombre + ' x' + cantidad, importe, detalle: { sku, cantidad, precio: h.precio } });
    return { sku, cantidad, importe };
  }

  function totalTicket() {
    const subtotal = _state.ticketActual.reduce((acc, it) => acc + it.importe, 0);
    const iva = _redondea(subtotal * 0.16);
    const total = _redondea(subtotal + iva);
    return {
      items: _state.ticketActual.length,
      subtotal: _redondea(subtotal),
      iva,
      total,
      lineas: _state.ticketActual.slice()
    };
  }

  function cerrarTicket(metodoPago = 'EFECTIVO') {
    const t = totalTicket();
    if (t.items === 0) throw new Error('Ticket vacío');
    const ticket = Object.assign({}, t, {
      folio: 'TLP-' + Date.now(),
      fecha: new Date().toISOString(),
      metodoPago
    });
    _state.ticketActual = [];
    return ticket;
  }

  // ──────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────────
  global.TlapaleriaAPI = {
    // Catálogos
    bases: () => Object.values(BASES_PINTURA).map(b => Object.assign({}, b)),
    colorantes: () => Object.values(COLORANTES).map(c => Object.assign({}, c)),
    herramientas: () => HERRAMIENTAS.map(h => Object.assign({}, h)),
    // Cálculos pintura
    calcularPinturaPorLitros,
    calcularPinturaPorArea,
    // Tonos custom
    crearTonoCustom,
    recuperarTono,
    repetirTono,
    listarMezclas: () => Array.from(_state.mezclasGuardadas.values()),
    // Herramientas
    buscarHerramienta,
    obtenerHerramienta,
    ajustarStock,
    // Ticket
    nuevoTicket,
    agregarPinturaLitros,
    agregarTonoCustom,
    agregarHerramienta,
    totalTicket,
    cerrarTicket,
    // Meta
    version: '1.0.0',
    vertical: 'tlapaleria'
  };

})(typeof window !== 'undefined' ? window : globalThis);
