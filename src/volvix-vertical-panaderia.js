/**
 * VOLVIX VERTICAL — PANADERÍA
 * POS especializado para panaderías: pan dulce, pan salado, pasteles,
 * control de día de horneado, descuento fin del día, gestión de pedidos.
 *
 * API pública: window.PanaderiaAPI
 *
 * Autor: Volvix POS
 * Versión: 3.4.0
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────
  // CATÁLOGO DE PRODUCTOS
  // ──────────────────────────────────────────────────────────────────────
  const CATEGORIAS = {
    PAN_DULCE: 'pan_dulce',
    PAN_SALADO: 'pan_salado',
    PASTELES: 'pasteles',
    GALLETAS: 'galletas',
    BEBIDAS: 'bebidas',
    PEDIDOS: 'pedidos'
  };

  const CATALOGO_BASE = [
    // Pan dulce — variedad mexicana
    { id: 'PD001', nombre: 'Concha de vainilla',  cat: CATEGORIAS.PAN_DULCE, precio: 12, vidaUtilHoras: 24 },
    { id: 'PD002', nombre: 'Concha de chocolate', cat: CATEGORIAS.PAN_DULCE, precio: 12, vidaUtilHoras: 24 },
    { id: 'PD003', nombre: 'Cuernito',            cat: CATEGORIAS.PAN_DULCE, precio: 10, vidaUtilHoras: 24 },
    { id: 'PD004', nombre: 'Oreja',               cat: CATEGORIAS.PAN_DULCE, precio: 14, vidaUtilHoras: 36 },
    { id: 'PD005', nombre: 'Polvorón rosa',       cat: CATEGORIAS.PAN_DULCE, precio: 8,  vidaUtilHoras: 72 },
    { id: 'PD006', nombre: 'Empanada de piña',    cat: CATEGORIAS.PAN_DULCE, precio: 13, vidaUtilHoras: 24 },
    { id: 'PD007', nombre: 'Dona glaseada',       cat: CATEGORIAS.PAN_DULCE, precio: 15, vidaUtilHoras: 24 },
    { id: 'PD008', nombre: 'Cocol',               cat: CATEGORIAS.PAN_DULCE, precio: 11, vidaUtilHoras: 36 },
    { id: 'PD009', nombre: 'Bigote',              cat: CATEGORIAS.PAN_DULCE, precio: 10, vidaUtilHoras: 24 },
    { id: 'PD010', nombre: 'Beso',                cat: CATEGORIAS.PAN_DULCE, precio: 16, vidaUtilHoras: 24 },
    // Pan salado
    { id: 'PS001', nombre: 'Bolillo',             cat: CATEGORIAS.PAN_SALADO, precio: 4,  vidaUtilHoras: 12 },
    { id: 'PS002', nombre: 'Telera',              cat: CATEGORIAS.PAN_SALADO, precio: 5,  vidaUtilHoras: 12 },
    { id: 'PS003', nombre: 'Baguette',            cat: CATEGORIAS.PAN_SALADO, precio: 28, vidaUtilHoras: 24 },
    { id: 'PS004', nombre: 'Pan de caja blanco',  cat: CATEGORIAS.PAN_SALADO, precio: 45, vidaUtilHoras: 96 },
    { id: 'PS005', nombre: 'Pan integral',        cat: CATEGORIAS.PAN_SALADO, precio: 55, vidaUtilHoras: 96 },
    // Pasteles
    { id: 'PT001', nombre: 'Rebanada tres leches', cat: CATEGORIAS.PASTELES, precio: 45, vidaUtilHoras: 48 },
    { id: 'PT002', nombre: 'Rebanada chocolate',   cat: CATEGORIAS.PASTELES, precio: 42, vidaUtilHoras: 48 },
    { id: 'PT003', nombre: 'Pastel completo 1kg',  cat: CATEGORIAS.PASTELES, precio: 380, vidaUtilHoras: 48, requierePedido: false },
    { id: 'PT004', nombre: 'Pastel personalizado', cat: CATEGORIAS.PASTELES, precio: 550, vidaUtilHoras: 24, requierePedido: true },
    // Galletas
    { id: 'GL001', nombre: 'Galleta de avena',    cat: CATEGORIAS.GALLETAS, precio: 7,  vidaUtilHoras: 168 },
    { id: 'GL002', nombre: 'Galleta de chispas',  cat: CATEGORIAS.GALLETAS, precio: 8,  vidaUtilHoras: 168 },
    { id: 'GL003', nombre: 'Mantecada',           cat: CATEGORIAS.GALLETAS, precio: 9,  vidaUtilHoras: 96 },
    // Bebidas
    { id: 'BB001', nombre: 'Café americano',      cat: CATEGORIAS.BEBIDAS, precio: 25, vidaUtilHoras: null },
    { id: 'BB002', nombre: 'Café con leche',      cat: CATEGORIAS.BEBIDAS, precio: 30, vidaUtilHoras: null },
    { id: 'BB003', nombre: 'Chocolate caliente',  cat: CATEGORIAS.BEBIDAS, precio: 35, vidaUtilHoras: null }
  ];

  // ──────────────────────────────────────────────────────────────────────
  // ESTADO GLOBAL
  // ──────────────────────────────────────────────────────────────────────
  const estado = {
    catalogo: CATALOGO_BASE.map(p => ({ ...p })),
    inventario: {},          // id -> { lotes: [{fechaHorneado, cantidad}] }
    carrito: [],             // [{id, cantidad, precioUnit, descuento}]
    pedidos: [],             // [{id, cliente, items, fechaEntrega, anticipo, estado}]
    ventasDelDia: [],
    config: {
      descuentoFinDia: 0.30,           // 30% off al final del día
      horaInicioDescuento: 19,         // 7pm
      horaCierre: 22,
      iva: 0.16,
      anticipoMinimo: 0.30             // 30% anticipo en pedidos
    }
  };

  // Inicializar inventario vacío
  estado.catalogo.forEach(p => {
    estado.inventario[p.id] = { lotes: [] };
  });

  // ──────────────────────────────────────────────────────────────────────
  // UTILIDADES
  // ──────────────────────────────────────────────────────────────────────
  function ahora() { return new Date(); }
  function uid(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 9999); }

  function horasDesde(fecha) {
    return (ahora().getTime() - new Date(fecha).getTime()) / 36e5;
  }

  function formatMXN(n) {
    return '$' + n.toFixed(2);
  }

  // ──────────────────────────────────────────────────────────────────────
  // INVENTARIO — DÍA DE HORNEADO
  // ──────────────────────────────────────────────────────────────────────
  function registrarHorneado(productoId, cantidad, fechaHorneado) {
    const inv = estado.inventario[productoId];
    if (!inv) throw new Error('Producto no existe: ' + productoId);
    inv.lotes.push({
      loteId: uid('L'),
      fechaHorneado: fechaHorneado || ahora(),
      cantidadInicial: cantidad,
      cantidad: cantidad
    });
    return inv.lotes[inv.lotes.length - 1];
  }

  function existencias(productoId) {
    const inv = estado.inventario[productoId];
    if (!inv) return 0;
    return inv.lotes.reduce((s, l) => s + l.cantidad, 0);
  }

  function lotesActivos(productoId) {
    const prod = getProducto(productoId);
    const inv = estado.inventario[productoId];
    if (!inv || !prod) return [];
    return inv.lotes.filter(l => {
      if (l.cantidad <= 0) return false;
      if (prod.vidaUtilHoras == null) return true;
      return horasDesde(l.fechaHorneado) <= prod.vidaUtilHoras;
    });
  }

  function descontarInventario(productoId, cantidad) {
    // FIFO: descontar primero del lote más viejo
    const inv = estado.inventario[productoId];
    if (!inv) return false;
    inv.lotes.sort((a, b) => new Date(a.fechaHorneado) - new Date(b.fechaHorneado));
    let restante = cantidad;
    for (const lote of inv.lotes) {
      if (restante <= 0) break;
      const tomar = Math.min(lote.cantidad, restante);
      lote.cantidad -= tomar;
      restante -= tomar;
    }
    return restante === 0;
  }

  // ──────────────────────────────────────────────────────────────────────
  // CATÁLOGO Y PRECIOS
  // ──────────────────────────────────────────────────────────────────────
  function getProducto(id) {
    return estado.catalogo.find(p => p.id === id);
  }

  function listarPorCategoria(cat) {
    return estado.catalogo.filter(p => p.cat === cat);
  }

  function esHoraDescuento() {
    const h = ahora().getHours();
    return h >= estado.config.horaInicioDescuento && h < estado.config.horaCierre;
  }

  function calcularDescuento(producto) {
    // Descuento fin del día solo aplica a productos con vida útil corta
    if (!producto.vidaUtilHoras || producto.vidaUtilHoras > 48) return 0;
    if (!esHoraDescuento()) return 0;
    return estado.config.descuentoFinDia;
  }

  function precioFinal(productoId) {
    const p = getProducto(productoId);
    if (!p) return 0;
    const desc = calcularDescuento(p);
    return p.precio * (1 - desc);
  }

  // ──────────────────────────────────────────────────────────────────────
  // CARRITO Y VENTA
  // ──────────────────────────────────────────────────────────────────────
  function agregarAlCarrito(productoId, cantidad) {
    const p = getProducto(productoId);
    if (!p) throw new Error('Producto no existe');
    if (p.requierePedido) throw new Error('Este producto requiere pedido anticipado');
    if (existencias(productoId) < cantidad) {
      throw new Error('Inventario insuficiente: ' + p.nombre);
    }
    const precioU = precioFinal(productoId);
    const desc = calcularDescuento(p);
    const existente = estado.carrito.find(i => i.id === productoId);
    if (existente) {
      existente.cantidad += cantidad;
    } else {
      estado.carrito.push({
        id: productoId, nombre: p.nombre,
        cantidad, precioUnit: precioU, descuentoPct: desc
      });
    }
    return totalCarrito();
  }

  function quitarDelCarrito(productoId) {
    estado.carrito = estado.carrito.filter(i => i.id !== productoId);
    return totalCarrito();
  }

  function totalCarrito() {
    const subtotal = estado.carrito.reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
    const iva = subtotal * estado.config.iva;
    return {
      items: estado.carrito.length,
      subtotal: +subtotal.toFixed(2),
      iva: +iva.toFixed(2),
      total: +(subtotal + iva).toFixed(2)
    };
  }

  function cobrar(metodoPago) {
    if (estado.carrito.length === 0) throw new Error('Carrito vacío');
    // Descontar inventario
    for (const item of estado.carrito) {
      if (!descontarInventario(item.id, item.cantidad)) {
        throw new Error('Falla al descontar inventario: ' + item.nombre);
      }
    }
    const totales = totalCarrito();
    const venta = {
      id: uid('V'),
      fecha: ahora().toISOString(),
      items: estado.carrito.slice(),
      ...totales,
      metodoPago: metodoPago || 'efectivo'
    };
    estado.ventasDelDia.push(venta);
    estado.carrito = [];
    return venta;
  }

  // ──────────────────────────────────────────────────────────────────────
  // PEDIDOS (pasteles, eventos, mayoreo)
  // ──────────────────────────────────────────────────────────────────────
  function crearPedido(cliente, items, fechaEntrega, telefono) {
    if (!cliente || !items || !items.length || !fechaEntrega) {
      throw new Error('Datos incompletos del pedido');
    }
    let total = 0;
    const detalle = items.map(it => {
      const p = getProducto(it.id);
      if (!p) throw new Error('Producto no existe: ' + it.id);
      const sub = p.precio * it.cantidad;
      total += sub;
      return { id: p.id, nombre: p.nombre, cantidad: it.cantidad, precio: p.precio, subtotal: sub, notas: it.notas || '' };
    });
    const anticipo = +(total * estado.config.anticipoMinimo).toFixed(2);
    const pedido = {
      id: uid('P'),
      cliente, telefono: telefono || '',
      items: detalle,
      total: +total.toFixed(2),
      anticipo, saldo: +(total - anticipo).toFixed(2),
      fechaCreacion: ahora().toISOString(),
      fechaEntrega: new Date(fechaEntrega).toISOString(),
      estado: 'pendiente_anticipo'
    };
    estado.pedidos.push(pedido);
    return pedido;
  }

  function pagarAnticipo(pedidoId) {
    const p = estado.pedidos.find(x => x.id === pedidoId);
    if (!p) throw new Error('Pedido no existe');
    p.estado = 'confirmado';
    p.anticipoPagado = true;
    return p;
  }

  function entregarPedido(pedidoId) {
    const p = estado.pedidos.find(x => x.id === pedidoId);
    if (!p) throw new Error('Pedido no existe');
    if (p.estado !== 'confirmado' && p.estado !== 'listo') {
      throw new Error('Pedido no está listo para entregar');
    }
    p.estado = 'entregado';
    p.fechaEntregaReal = ahora().toISOString();
    return p;
  }

  function pedidosPendientes(fecha) {
    const hoy = fecha ? new Date(fecha).toDateString() : ahora().toDateString();
    return estado.pedidos.filter(p =>
      new Date(p.fechaEntrega).toDateString() === hoy &&
      p.estado !== 'entregado' && p.estado !== 'cancelado'
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // REPORTES
  // ──────────────────────────────────────────────────────────────────────
  function reporteDia() {
    const v = estado.ventasDelDia;
    const totalVentas = v.reduce((s, x) => s + x.total, 0);
    const piezasVendidas = v.reduce((s, x) =>
      s + x.items.reduce((a, b) => a + b.cantidad, 0), 0);
    const merma = mermaProyectada();
    return {
      fecha: ahora().toDateString(),
      transacciones: v.length,
      piezasVendidas,
      totalVentas: +totalVentas.toFixed(2),
      pedidosPendientesHoy: pedidosPendientes().length,
      mermaProyectada: merma
    };
  }

  function mermaProyectada() {
    let piezas = 0, valor = 0;
    estado.catalogo.forEach(p => {
      if (!p.vidaUtilHoras) return;
      const inv = estado.inventario[p.id];
      if (!inv) return;
      inv.lotes.forEach(l => {
        if (l.cantidad <= 0) return;
        const horasRestantes = p.vidaUtilHoras - horasDesde(l.fechaHorneado);
        if (horasRestantes < 6) {
          piezas += l.cantidad;
          valor += l.cantidad * p.precio;
        }
      });
    });
    return { piezas, valor: +valor.toFixed(2) };
  }

  function descartarVencidos() {
    let descartados = 0;
    estado.catalogo.forEach(p => {
      if (!p.vidaUtilHoras) return;
      const inv = estado.inventario[p.id];
      if (!inv) return;
      inv.lotes.forEach(l => {
        if (l.cantidad > 0 && horasDesde(l.fechaHorneado) > p.vidaUtilHoras) {
          descartados += l.cantidad;
          l.cantidad = 0;
          l.descartado = true;
        }
      });
    });
    return descartados;
  }

  // ──────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────────────────
  global.PanaderiaAPI = {
    // Constantes
    CATEGORIAS,
    // Catálogo
    catalogo: () => estado.catalogo.slice(),
    listarPorCategoria,
    getProducto,
    precioFinal,
    esHoraDescuento,
    // Inventario / horneado
    registrarHorneado,
    existencias,
    lotesActivos,
    descartarVencidos,
    mermaProyectada,
    // Carrito
    agregarAlCarrito,
    quitarDelCarrito,
    totalCarrito,
    cobrar,
    verCarrito: () => estado.carrito.slice(),
    // Pedidos
    crearPedido,
    pagarAnticipo,
    entregarPedido,
    pedidosPendientes,
    listarPedidos: () => estado.pedidos.slice(),
    // Reportes
    reporteDia,
    ventasDelDia: () => estado.ventasDelDia.slice(),
    // Config
    config: estado.config,
    formatMXN,
    // Debug
    _estado: estado,
    version: '3.4.0'
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix Panadería] API lista. window.PanaderiaAPI v' + global.PanaderiaAPI.version);
  }

})(typeof window !== 'undefined' ? window : globalThis);
