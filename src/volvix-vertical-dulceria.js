/**
 * volvix-vertical-dulceria.js
 * Vertical POS para Dulcería / Piñatería / Artículos de Fiesta
 * Expone: window.DulceriaAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Catálogo base ─────────────────────────────
  const CATEGORIAS = Object.freeze({
    DULCE_GRANEL:   'dulce_granel',
    DULCE_EMPAQUE:  'dulce_empaque',
    CHOCOLATE:      'chocolate',
    CHICLE:         'chicle',
    PALETA:         'paleta',
    BOTANA:         'botana',
    PINATA_STD:     'pinata_estandar',
    PINATA_CUSTOM:  'pinata_custom',
    RELLENO_BOLSA:  'relleno_bolsa',
    DECORACION:     'decoracion',
    GLOBO:          'globo',
    DESECHABLE:     'desechable',
    VELA:           'vela',
    PAQUETE_FIESTA: 'paquete_fiesta'
  });

  const UNIDADES = Object.freeze({
    PIEZA: 'pza', KILO: 'kg', GRAMO: 'g', BOLSA: 'bolsa', CAJA: 'caja', PAQUETE: 'paq'
  });

  // ───────────────────────────── Estado interno ────────────────────────────
  const state = {
    productos: new Map(),     // sku -> producto
    pinatasCustom: new Map(), // id  -> orden personalizada
    carrito: [],              // líneas del ticket actual
    ventas: [],               // historial
    paquetes: new Map(),      // id paquete fiesta
    descuentos: new Map(),    // codigo -> { tipo, valor }
    config: {
      iva: 0.16,
      monedaSimbolo: '$',
      anticipoMinPinata: 0.5,   // 50% anticipo
      diasEntregaCustom: 7,
      stockMinimoAlerta: 5
    },
    contadores: { folio: 1000, pinataId: 1, paqueteId: 1 }
  };

  // ───────────────────────────── Helpers ───────────────────────────────────
  const round2 = n => Math.round(n * 100) / 100;
  const nuevoFolio = () => `T-${++state.contadores.folio}`;
  const ahora = () => new Date().toISOString();
  const fmt = n => `${state.config.monedaSimbolo}${round2(n).toFixed(2)}`;

  function requiere(cond, msg) { if (!cond) throw new Error(`[DulceriaAPI] ${msg}`); }

  // ───────────────────────────── Productos ─────────────────────────────────
  function registrarProducto({ sku, nombre, categoria, precio, unidad = UNIDADES.PIEZA, stock = 0, costo = 0, proveedor = '' }) {
    requiere(sku && nombre, 'sku y nombre son obligatorios');
    requiere(Object.values(CATEGORIAS).includes(categoria), `categoria inválida: ${categoria}`);
    requiere(precio >= 0, 'precio inválido');
    state.productos.set(sku, { sku, nombre, categoria, precio, unidad, stock, costo, proveedor, activo: true });
    return state.productos.get(sku);
  }

  function actualizarStock(sku, delta) {
    const p = state.productos.get(sku);
    requiere(p, `producto ${sku} no existe`);
    p.stock = round2(p.stock + delta);
    return p.stock;
  }

  function listarBajoStock() {
    const min = state.config.stockMinimoAlerta;
    return [...state.productos.values()].filter(p => p.activo && p.stock <= min);
  }

  function buscarProductos(texto = '', categoria = null) {
    const q = texto.toLowerCase();
    return [...state.productos.values()].filter(p =>
      p.activo &&
      (!categoria || p.categoria === categoria) &&
      (!q || p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
  }

  // ───────────────────────────── Piñatas custom ────────────────────────────
  function crearPinataCustom({ cliente, telefono, personaje, tamano, colores = [], fechaEntrega, precio, notas = '' }) {
    requiere(cliente && telefono, 'cliente y telefono requeridos');
    requiere(personaje && tamano, 'personaje y tamano requeridos');
    requiere(precio > 0, 'precio inválido');
    const id = `PC-${state.contadores.pinataId++}`;
    const anticipo = round2(precio * state.config.anticipoMinPinata);
    const orden = {
      id, cliente, telefono, personaje, tamano, colores, notas,
      precio, anticipo, saldo: round2(precio - anticipo),
      fechaPedido: ahora(),
      fechaEntrega: fechaEntrega || null,
      estado: 'cotizada', // cotizada | anticipada | en_produccion | lista | entregada | cancelada
      pagos: []
    };
    state.pinatasCustom.set(id, orden);
    return orden;
  }

  function pagarPinata(id, monto, metodo = 'efectivo') {
    const o = state.pinatasCustom.get(id);
    requiere(o, `piñata ${id} no existe`);
    requiere(monto > 0, 'monto inválido');
    o.pagos.push({ monto, metodo, fecha: ahora() });
    const pagado = o.pagos.reduce((a, p) => a + p.monto, 0);
    o.saldo = round2(o.precio - pagado);
    if (pagado >= o.anticipo && o.estado === 'cotizada') o.estado = 'anticipada';
    if (o.saldo <= 0) { o.saldo = 0; o.estado = 'lista'; }
    return o;
  }

  function cambiarEstadoPinata(id, estado) {
    const o = state.pinatasCustom.get(id);
    requiere(o, `piñata ${id} no existe`);
    const validos = ['cotizada','anticipada','en_produccion','lista','entregada','cancelada'];
    requiere(validos.includes(estado), 'estado inválido');
    o.estado = estado;
    return o;
  }

  // ───────────────────────────── Paquetes de fiesta ────────────────────────
  function crearPaqueteFiesta({ nombre, items = [], precioFijo = null, descripcion = '' }) {
    requiere(nombre && items.length, 'nombre e items requeridos');
    const id = `PF-${state.contadores.paqueteId++}`;
    const precioCalculado = items.reduce((acc, it) => {
      const p = state.productos.get(it.sku);
      requiere(p, `sku ${it.sku} no existe en paquete`);
      return acc + p.precio * it.cantidad;
    }, 0);
    const paquete = {
      id, nombre, descripcion, items,
      precio: precioFijo != null ? precioFijo : round2(precioCalculado),
      precioOriginal: round2(precioCalculado)
    };
    state.paquetes.set(id, paquete);
    return paquete;
  }

  // ───────────────────────────── Carrito / Ticket ──────────────────────────
  function agregarAlCarrito(sku, cantidad = 1) {
    const p = state.productos.get(sku);
    requiere(p, `producto ${sku} no existe`);
    requiere(cantidad > 0, 'cantidad inválida');
    if (p.stock < cantidad) console.warn(`[DulceriaAPI] stock insuficiente ${sku} (${p.stock} disp.)`);
    const existente = state.carrito.find(l => l.sku === sku && !l.paqueteId && !l.pinataId);
    if (existente) existente.cantidad = round2(existente.cantidad + cantidad);
    else state.carrito.push({ sku, nombre: p.nombre, precio: p.precio, cantidad, unidad: p.unidad });
    return calcularTotales();
  }

  function agregarPaqueteAlCarrito(idPaquete) {
    const pq = state.paquetes.get(idPaquete);
    requiere(pq, `paquete ${idPaquete} no existe`);
    state.carrito.push({ paqueteId: pq.id, nombre: `Paquete: ${pq.nombre}`, precio: pq.precio, cantidad: 1, items: pq.items });
    return calcularTotales();
  }

  function agregarPinataAlCarrito(idPinata, cobrarSaldo = false) {
    const o = state.pinatasCustom.get(idPinata);
    requiere(o, `piñata ${idPinata} no existe`);
    const monto = cobrarSaldo ? o.saldo : o.anticipo;
    state.carrito.push({
      pinataId: o.id,
      nombre: `Piñata ${o.personaje} (${cobrarSaldo ? 'saldo' : 'anticipo'})`,
      precio: monto, cantidad: 1
    });
    return calcularTotales();
  }

  function quitarLinea(idx) {
    requiere(idx >= 0 && idx < state.carrito.length, 'índice inválido');
    state.carrito.splice(idx, 1);
    return calcularTotales();
  }

  function vaciarCarrito() { state.carrito = []; return calcularTotales(); }

  // ───────────────────────────── Descuentos ────────────────────────────────
  function registrarDescuento(codigo, tipo, valor) {
    requiere(['porcentaje','monto'].includes(tipo), 'tipo inválido');
    state.descuentos.set(codigo.toUpperCase(), { tipo, valor });
  }

  function aplicarDescuento(subtotal, codigo) {
    if (!codigo) return 0;
    const d = state.descuentos.get(codigo.toUpperCase());
    if (!d) return 0;
    return d.tipo === 'porcentaje' ? round2(subtotal * d.valor) : Math.min(d.valor, subtotal);
  }

  // ───────────────────────────── Totales ───────────────────────────────────
  function calcularTotales(codigoDescuento = null) {
    const subtotal = state.carrito.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const descuento = aplicarDescuento(subtotal, codigoDescuento);
    const base = subtotal - descuento;
    const iva = round2(base * state.config.iva);
    const total = round2(base + iva);
    return { subtotal: round2(subtotal), descuento: round2(descuento), iva, total, lineas: state.carrito.length };
  }

  // ───────────────────────────── Cobro ─────────────────────────────────────
  function cobrar({ metodo = 'efectivo', recibido = 0, codigoDescuento = null, cliente = 'Público general' } = {}) {
    requiere(state.carrito.length > 0, 'carrito vacío');
    const tot = calcularTotales(codigoDescuento);
    requiere(metodo !== 'efectivo' || recibido >= tot.total, 'efectivo insuficiente');

    // Descontar stock de productos simples y de items dentro de paquetes
    state.carrito.forEach(l => {
      if (l.sku && state.productos.has(l.sku)) {
        actualizarStock(l.sku, -l.cantidad);
      }
      if (l.items) l.items.forEach(it => state.productos.has(it.sku) && actualizarStock(it.sku, -it.cantidad));
      if (l.pinataId) {
        const o = state.pinatasCustom.get(l.pinataId);
        if (o) pagarPinata(l.pinataId, l.precio, metodo);
      }
    });

    const venta = {
      folio: nuevoFolio(),
      fecha: ahora(),
      cliente, metodo,
      lineas: JSON.parse(JSON.stringify(state.carrito)),
      ...tot,
      recibido: round2(recibido),
      cambio: round2(Math.max(0, recibido - tot.total))
    };
    state.ventas.push(venta);
    state.carrito = [];
    return venta;
  }

  // ───────────────────────────── Reportes ──────────────────────────────────
  function reporteDelDia(fecha = new Date().toISOString().slice(0, 10)) {
    const dia = state.ventas.filter(v => v.fecha.startsWith(fecha));
    const total = dia.reduce((a, v) => a + v.total, 0);
    const porMetodo = dia.reduce((acc, v) => { acc[v.metodo] = (acc[v.metodo] || 0) + v.total; return acc; }, {});
    return { fecha, tickets: dia.length, total: round2(total), porMetodo };
  }

  function topProductos(limite = 10) {
    const conteo = new Map();
    state.ventas.forEach(v => v.lineas.forEach(l => {
      if (!l.sku) return;
      conteo.set(l.sku, (conteo.get(l.sku) || 0) + l.cantidad);
    }));
    return [...conteo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite)
      .map(([sku, cant]) => ({ sku, nombre: state.productos.get(sku)?.nombre || sku, cantidad: round2(cant) }));
  }

  function pinatasPendientes() {
    return [...state.pinatasCustom.values()].filter(p => !['entregada','cancelada'].includes(p.estado));
  }

  // ───────────────────────────── Impresión / Ticket texto ──────────────────
  function imprimirTicket(venta) {
    const L = [];
    L.push('===== DULCERÍA & PIÑATERÍA =====');
    L.push(`Folio: ${venta.folio}`);
    L.push(`Fecha: ${venta.fecha}`);
    L.push(`Cliente: ${venta.cliente}`);
    L.push('--------------------------------');
    venta.lineas.forEach(l => {
      L.push(`${l.cantidad} x ${l.nombre}`);
      L.push(`   ${fmt(l.precio)}  =  ${fmt(l.precio * l.cantidad)}`);
    });
    L.push('--------------------------------');
    L.push(`Subtotal: ${fmt(venta.subtotal)}`);
    if (venta.descuento) L.push(`Descuento: -${fmt(venta.descuento)}`);
    L.push(`IVA:      ${fmt(venta.iva)}`);
    L.push(`TOTAL:    ${fmt(venta.total)}`);
    L.push(`Pago (${venta.metodo}): ${fmt(venta.recibido)}`);
    L.push(`Cambio:   ${fmt(venta.cambio)}`);
    L.push('===== ¡Gracias por su compra! =====');
    return L.join('\n');
  }

  // ───────────────────────────── Seed demo ─────────────────────────────────
  function seedDemo() {
    registrarProducto({ sku:'DG001', nombre:'Tamarindo enchilado',  categoria:CATEGORIAS.DULCE_GRANEL, precio:180, unidad:UNIDADES.KILO, stock:25 });
    registrarProducto({ sku:'CH001', nombre:'Chocolate Carlos V',   categoria:CATEGORIAS.CHOCOLATE,    precio:8,   stock:200 });
    registrarProducto({ sku:'PL001', nombre:'Paleta Vero Mango',    categoria:CATEGORIAS.PALETA,       precio:3,   stock:500 });
    registrarProducto({ sku:'PN001', nombre:'Piñata estrella std',  categoria:CATEGORIAS.PINATA_STD,   precio:250, stock:8 });
    registrarProducto({ sku:'GL001', nombre:'Globo látex #9',       categoria:CATEGORIAS.GLOBO,        precio:2,   stock:1000 });
    registrarProducto({ sku:'DS001', nombre:'Plato fiesta paq/10',  categoria:CATEGORIAS.DESECHABLE,   precio:35,  unidad:UNIDADES.PAQUETE, stock:40 });
    registrarDescuento('FIESTA10', 'porcentaje', 0.10);
    registrarDescuento('CUMPLE',   'monto', 50);
    crearPaqueteFiesta({
      nombre: 'Cumple Básico 10 niños',
      descripcion: 'Piñata + dulces + globos + desechables',
      items: [
        { sku:'PN001', cantidad:1 },
        { sku:'CH001', cantidad:20 },
        { sku:'PL001', cantidad:30 },
        { sku:'GL001', cantidad:20 },
        { sku:'DS001', cantidad:1 }
      ],
      precioFijo: 480
    });
  }

  // ───────────────────────────── API pública ───────────────────────────────
  const DulceriaAPI = {
    CATEGORIAS, UNIDADES,
    // productos
    registrarProducto, actualizarStock, listarBajoStock, buscarProductos,
    // piñatas custom
    crearPinataCustom, pagarPinata, cambiarEstadoPinata, pinatasPendientes,
    // paquetes
    crearPaqueteFiesta,
    // carrito
    agregarAlCarrito, agregarPaqueteAlCarrito, agregarPinataAlCarrito,
    quitarLinea, vaciarCarrito, calcularTotales,
    // descuentos
    registrarDescuento,
    // cobro
    cobrar, imprimirTicket,
    // reportes
    reporteDelDia, topProductos,
    // utilidades
    seedDemo,
    config: state.config,
    _state: state // solo para depuración
  };

  global.DulceriaAPI = DulceriaAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = DulceriaAPI;

})(typeof window !== 'undefined' ? window : globalThis);
