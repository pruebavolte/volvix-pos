/**
 * VOLVIX VERTICAL — CAFÉ INTERNET
 * POS especializado para café internet: alquiler de PCs por hora,
 * impresiones B/N y color, copias, escaneos y papelería rápida.
 *
 * Expone: window.CafeInternetAPI
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURACIÓN POR DEFECTO
  // ============================================================
  const DEFAULT_CONFIG = {
    monedaSimbolo: '$',
    ivaPorcentaje: 0,
    redondeoCentavos: 50,
    tarifas: {
      pcPorHora: 1500,
      pcFraccionMinima: 15,        // minutos mínimos cobrables
      pcCostoPorMinuto: 25,        // 1500 / 60
      impresionBN: 200,
      impresionColor: 500,
      copiaBN: 150,
      copiaColor: 400,
      escaneo: 300,
      escaneoConCorreo: 400,
    },
    papeleria: [
      { sku: 'LAP-001', nombre: 'Lapicero negro', precio: 800, stock: 50 },
      { sku: 'LAP-002', nombre: 'Lapicero rojo',  precio: 800, stock: 30 },
      { sku: 'LAP-003', nombre: 'Lápiz #2',        precio: 600, stock: 40 },
      { sku: 'BOR-001', nombre: 'Borrador',         precio: 500, stock: 25 },
      { sku: 'CUA-001', nombre: 'Cuaderno 100h',    precio: 4500, stock: 20 },
      { sku: 'FOL-001', nombre: 'Folder oficio',    precio: 1200, stock: 60 },
      { sku: 'CDR-001', nombre: 'CD-R virgen',      precio: 2000, stock: 15 },
      { sku: 'USB-001', nombre: 'USB 16GB',         precio: 25000, stock: 8 },
      { sku: 'SOB-001', nombre: 'Sobre manila',     precio: 700, stock: 100 },
      { sku: 'GRA-001', nombre: 'Grapadora pequeña', precio: 8500, stock: 5 },
    ],
    numeroPCs: 8,
  };

  // ============================================================
  // ESTADO INTERNO
  // ============================================================
  let _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const _sesionesPC = new Map();   // pcId -> { inicio, cliente, servicios[] }
  const _ventas = [];              // historial de ventas cerradas
  const _carrito = [];             // carrito de venta rápida (papelería/imp/copias)
  let _consecutivoFactura = 1;

  // Inicializar PCs disponibles
  function _inicializarPCs() {
    _sesionesPC.clear();
    for (let i = 1; i <= _config.numeroPCs; i++) {
      _sesionesPC.set(`PC-${String(i).padStart(2, '0')}`, null);
    }
  }
  _inicializarPCs();

  // ============================================================
  // UTILIDADES
  // ============================================================
  function _redondear(valor) {
    const r = _config.redondeoCentavos || 1;
    return Math.round(valor / r) * r;
  }

  function _ahora() {
    return new Date();
  }

  function _minutosEntre(d1, d2) {
    return Math.max(0, Math.floor((d2 - d1) / 60000));
  }

  function _formatoMoneda(valor) {
    return `${_config.monedaSimbolo}${_redondear(valor).toLocaleString('es-CO')}`;
  }

  function _generarIdVenta() {
    const n = String(_consecutivoFactura++).padStart(6, '0');
    return `CI-${n}`;
  }

  // ============================================================
  // GESTIÓN DE PCs (alquiler por hora)
  // ============================================================
  function listarPCs() {
    const out = [];
    for (const [pcId, sesion] of _sesionesPC.entries()) {
      out.push({
        pcId,
        ocupada: !!sesion,
        cliente: sesion?.cliente ?? null,
        inicio: sesion?.inicio ?? null,
        minutosTranscurridos: sesion ? _minutosEntre(sesion.inicio, _ahora()) : 0,
      });
    }
    return out;
  }

  function iniciarSesionPC(pcId, cliente = 'Anónimo') {
    if (!_sesionesPC.has(pcId)) throw new Error(`PC ${pcId} no existe`);
    if (_sesionesPC.get(pcId)) throw new Error(`PC ${pcId} ya está ocupada`);
    const sesion = {
      pcId,
      cliente,
      inicio: _ahora(),
      servicios: [],   // impresiones/copias añadidas durante la sesión
    };
    _sesionesPC.set(pcId, sesion);
    return { ok: true, pcId, inicio: sesion.inicio };
  }

  function agregarServicioASesion(pcId, tipo, cantidad = 1) {
    const sesion = _sesionesPC.get(pcId);
    if (!sesion) throw new Error(`PC ${pcId} no tiene sesión activa`);
    const precioUnit = _precioServicio(tipo);
    sesion.servicios.push({ tipo, cantidad, precioUnit, subtotal: precioUnit * cantidad });
    return sesion;
  }

  function calcularCostoPC(pcId) {
    const sesion = _sesionesPC.get(pcId);
    if (!sesion) throw new Error(`PC ${pcId} sin sesión activa`);
    const minutos = Math.max(_config.tarifas.pcFraccionMinima, _minutosEntre(sesion.inicio, _ahora()));
    const costoTiempo = minutos * _config.tarifas.pcCostoPorMinuto;
    const costoServicios = sesion.servicios.reduce((s, x) => s + x.subtotal, 0);
    return {
      pcId,
      cliente: sesion.cliente,
      minutos,
      costoTiempo: _redondear(costoTiempo),
      costoServicios: _redondear(costoServicios),
      total: _redondear(costoTiempo + costoServicios),
      detalle: sesion.servicios.slice(),
    };
  }

  function cerrarSesionPC(pcId, metodoPago = 'efectivo') {
    const calc = calcularCostoPC(pcId);
    const venta = {
      id: _generarIdVenta(),
      tipo: 'sesion-pc',
      pcId,
      cliente: calc.cliente,
      minutos: calc.minutos,
      items: [
        { descripcion: `Alquiler PC (${calc.minutos} min)`, cantidad: 1, precio: calc.costoTiempo, subtotal: calc.costoTiempo },
        ...calc.detalle.map(s => ({
          descripcion: s.tipo,
          cantidad: s.cantidad,
          precio: s.precioUnit,
          subtotal: s.subtotal,
        })),
      ],
      total: calc.total,
      metodoPago,
      fecha: _ahora().toISOString(),
    };
    _ventas.push(venta);
    _sesionesPC.set(pcId, null);
    return venta;
  }

  // ============================================================
  // VENTA RÁPIDA: impresiones, copias, escaneos, papelería
  // ============================================================
  function _precioServicio(tipo) {
    const t = _config.tarifas;
    const map = {
      'impresion-bn': t.impresionBN,
      'impresion-color': t.impresionColor,
      'copia-bn': t.copiaBN,
      'copia-color': t.copiaColor,
      'escaneo': t.escaneo,
      'escaneo-correo': t.escaneoConCorreo,
    };
    if (!(tipo in map)) throw new Error(`Servicio desconocido: ${tipo}`);
    return map[tipo];
  }

  function agregarServicioAlCarrito(tipo, cantidad = 1) {
    const precio = _precioServicio(tipo);
    _carrito.push({
      kind: 'servicio',
      descripcion: tipo,
      cantidad,
      precio,
      subtotal: precio * cantidad,
    });
    return _carrito.slice();
  }

  function agregarPapeleriaAlCarrito(sku, cantidad = 1) {
    const item = _config.papeleria.find(p => p.sku === sku);
    if (!item) throw new Error(`SKU ${sku} no existe`);
    if (item.stock < cantidad) throw new Error(`Stock insuficiente para ${item.nombre} (disp: ${item.stock})`);
    item.stock -= cantidad;
    _carrito.push({
      kind: 'papeleria',
      sku,
      descripcion: item.nombre,
      cantidad,
      precio: item.precio,
      subtotal: item.precio * cantidad,
    });
    return _carrito.slice();
  }

  function quitarDelCarrito(indice) {
    if (indice < 0 || indice >= _carrito.length) throw new Error('Índice inválido');
    const eliminado = _carrito.splice(indice, 1)[0];
    if (eliminado.kind === 'papeleria') {
      const item = _config.papeleria.find(p => p.sku === eliminado.sku);
      if (item) item.stock += eliminado.cantidad;
    }
    return _carrito.slice();
  }

  function totalCarrito() {
    const subtotal = _carrito.reduce((s, x) => s + x.subtotal, 0);
    const iva = subtotal * (_config.ivaPorcentaje / 100);
    return {
      subtotal: _redondear(subtotal),
      iva: _redondear(iva),
      total: _redondear(subtotal + iva),
      items: _carrito.length,
    };
  }

  function cobrarCarrito(metodoPago = 'efectivo', cliente = 'Anónimo') {
    if (_carrito.length === 0) throw new Error('Carrito vacío');
    const totales = totalCarrito();
    const venta = {
      id: _generarIdVenta(),
      tipo: 'venta-rapida',
      cliente,
      items: _carrito.slice(),
      subtotal: totales.subtotal,
      iva: totales.iva,
      total: totales.total,
      metodoPago,
      fecha: _ahora().toISOString(),
    };
    _ventas.push(venta);
    _carrito.length = 0;
    return venta;
  }

  // ============================================================
  // INVENTARIO Y REPORTES
  // ============================================================
  function listarPapeleria() {
    return _config.papeleria.map(p => ({ ...p }));
  }

  function reabastecer(sku, cantidad) {
    const item = _config.papeleria.find(p => p.sku === sku);
    if (!item) throw new Error(`SKU ${sku} no existe`);
    item.stock += cantidad;
    return { sku, stock: item.stock };
  }

  function ventasDelDia(fechaISO) {
    const fecha = fechaISO ? fechaISO.slice(0, 10) : _ahora().toISOString().slice(0, 10);
    const ventas = _ventas.filter(v => v.fecha.startsWith(fecha));
    const total = ventas.reduce((s, v) => s + v.total, 0);
    const porTipo = ventas.reduce((acc, v) => {
      acc[v.tipo] = (acc[v.tipo] || 0) + v.total;
      return acc;
    }, {});
    return { fecha, cantidad: ventas.length, total: _redondear(total), porTipo, ventas };
  }

  function resumenCaja() {
    const hoy = ventasDelDia();
    const pcsActivas = listarPCs().filter(p => p.ocupada).length;
    return {
      ventasHoy: hoy.total,
      transaccionesHoy: hoy.cantidad,
      pcsOcupadas: pcsActivas,
      pcsLibres: _config.numeroPCs - pcsActivas,
      itemsBajoStock: _config.papeleria.filter(p => p.stock <= 5),
    };
  }

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  function configurar(parcial) {
    _config = { ..._config, ...parcial, tarifas: { ..._config.tarifas, ...(parcial.tarifas || {}) } };
    if (parcial.numeroPCs) _inicializarPCs();
    return _config;
  }

  function obtenerConfig() {
    return JSON.parse(JSON.stringify(_config));
  }

  function reiniciar() {
    _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    _ventas.length = 0;
    _carrito.length = 0;
    _consecutivoFactura = 1;
    _inicializarPCs();
    return { ok: true };
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.CafeInternetAPI = {
    // PCs
    listarPCs,
    iniciarSesionPC,
    agregarServicioASesion,
    calcularCostoPC,
    cerrarSesionPC,
    // Venta rápida
    agregarServicioAlCarrito,
    agregarPapeleriaAlCarrito,
    quitarDelCarrito,
    totalCarrito,
    cobrarCarrito,
    verCarrito: () => _carrito.slice(),
    // Inventario
    listarPapeleria,
    reabastecer,
    // Reportes
    ventasDelDia,
    resumenCaja,
    // Config
    configurar,
    obtenerConfig,
    reiniciar,
    // Helpers
    formatoMoneda: _formatoMoneda,
    version: '1.0.0',
    vertical: 'cafe-internet',
  };

  console.log('[Volvix] CafeInternetAPI cargado v1.0.0');
})();
