/**
 * Volvix Vertical - Cremería / Lechería
 * POS especializado para productos lácteos, quesos por kg y control FIFO de caducidad.
 * Expone window.CremeriaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Catálogo base de productos lácteos
  // ─────────────────────────────────────────────────────────────
  const CATALOGO = [
    { sku: 'LCH-ENT-1L',   nombre: 'Leche entera 1L',          tipo: 'pieza', precio: 26.50, vidaDias: 12 },
    { sku: 'LCH-DES-1L',   nombre: 'Leche deslactosada 1L',    tipo: 'pieza', precio: 32.00, vidaDias: 14 },
    { sku: 'LCH-LIT-1L',   nombre: 'Leche light 1L',           tipo: 'pieza', precio: 28.00, vidaDias: 12 },
    { sku: 'CRM-ACI-200',  nombre: 'Crema acida 200ml',        tipo: 'pieza', precio: 22.00, vidaDias: 21 },
    { sku: 'CRM-NAT-450',  nombre: 'Crema natural 450ml',      tipo: 'pieza', precio: 48.00, vidaDias: 21 },
    { sku: 'YOG-NAT-1L',   nombre: 'Yogurt natural 1L',        tipo: 'pieza', precio: 38.00, vidaDias: 18 },
    { sku: 'YOG-FRE-150',  nombre: 'Yogurt fresa 150g',        tipo: 'pieza', precio: 12.50, vidaDias: 18 },
    { sku: 'MAN-BAR-200',  nombre: 'Mantequilla barra 200g',   tipo: 'pieza', precio: 45.00, vidaDias: 60 },
    { sku: 'QSO-OAX-KG',   nombre: 'Queso Oaxaca',             tipo: 'kg',    precio: 168.00, vidaDias: 25 },
    { sku: 'QSO-PAN-KG',   nombre: 'Queso panela',             tipo: 'kg',    precio: 142.00, vidaDias: 20 },
    { sku: 'QSO-MAN-KG',   nombre: 'Queso manchego',           tipo: 'kg',    precio: 215.00, vidaDias: 35 },
    { sku: 'QSO-CHI-KG',   nombre: 'Queso chihuahua',          tipo: 'kg',    precio: 198.00, vidaDias: 30 },
    { sku: 'QSO-FRE-KG',   nombre: 'Queso fresco',             tipo: 'kg',    precio: 125.00, vidaDias: 12 },
    { sku: 'QSO-COT-KG',   nombre: 'Queso cotija',             tipo: 'kg',    precio: 235.00, vidaDias: 90 },
    { sku: 'JAM-PAV-KG',   nombre: 'Jamon de pavo',            tipo: 'kg',    precio: 185.00, vidaDias: 15 },
    { sku: 'JAM-VIR-KG',   nombre: 'Jamon virginia',           tipo: 'kg',    precio: 220.00, vidaDias: 15 },
    { sku: 'HUE-18',       nombre: 'Huevo 18 piezas',          tipo: 'pieza', precio: 78.00, vidaDias: 28 }
  ];

  // ─────────────────────────────────────────────────────────────
  // Estado interno
  // ─────────────────────────────────────────────────────────────
  const estado = {
    inventario: new Map(), // sku -> [{lote, cantidad, caducidad, costo}]
    carrito: [],
    ventas: [],
    folio: 1001,
    config: {
      ivaPct: 0,            // lacteos exentos en MX
      alertaDiasCad: 3,
      descuentoMermaPct: 30 // descuento si caduca <= 1 dia
    }
  };

  function hoy() { return new Date(); }
  function diasEntre(a, b) {
    return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }
  function fmtFecha(d) { return d.toISOString().slice(0, 10); }
  function buscarProducto(sku) { return CATALOGO.find(p => p.sku === sku) || null; }

  // ─────────────────────────────────────────────────────────────
  // Inventario con lotes (FIFO por caducidad)
  // ─────────────────────────────────────────────────────────────
  function recibirLote(sku, cantidad, caducidad, costo) {
    const prod = buscarProducto(sku);
    if (!prod) throw new Error('SKU desconocido: ' + sku);
    if (cantidad <= 0) throw new Error('Cantidad invalida');
    const cad = caducidad instanceof Date ? caducidad : new Date(caducidad);
    if (isNaN(cad.getTime())) throw new Error('Caducidad invalida');

    if (!estado.inventario.has(sku)) estado.inventario.set(sku, []);
    const lotes = estado.inventario.get(sku);
    const lote = {
      lote: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      cantidad,
      caducidad: cad,
      costo: costo || prod.precio * 0.65
    };
    lotes.push(lote);
    lotes.sort((a, b) => a.caducidad - b.caducidad); // FIFO por cad
    return lote;
  }

  function existencia(sku) {
    const lotes = estado.inventario.get(sku) || [];
    return lotes.reduce((s, l) => s + l.cantidad, 0);
  }

  function descontarFIFO(sku, cantidad) {
    const lotes = estado.inventario.get(sku) || [];
    const total = existencia(sku);
    if (total < cantidad) throw new Error('Sin existencia para ' + sku + ' (hay ' + total + ')');

    let pendiente = cantidad;
    const consumido = [];
    for (const lote of lotes) {
      if (pendiente <= 0) break;
      const tomar = Math.min(lote.cantidad, pendiente);
      lote.cantidad -= tomar;
      pendiente -= tomar;
      consumido.push({ lote: lote.lote, cantidad: tomar, caducidad: lote.caducidad });
    }
    estado.inventario.set(sku, lotes.filter(l => l.cantidad > 0.0001));
    return consumido;
  }

  // ─────────────────────────────────────────────────────────────
  // Precio dinamico (descuento por merma cercana)
  // ─────────────────────────────────────────────────────────────
  function precioConMerma(sku) {
    const prod = buscarProducto(sku);
    if (!prod) return 0;
    const lotes = estado.inventario.get(sku) || [];
    if (!lotes.length) return prod.precio;
    const proxCad = lotes[0].caducidad;
    const dias = diasEntre(hoy(), proxCad);
    if (dias <= 1) {
      return +(prod.precio * (1 - estado.config.descuentoMermaPct / 100)).toFixed(2);
    }
    return prod.precio;
  }

  // ─────────────────────────────────────────────────────────────
  // Carrito
  // ─────────────────────────────────────────────────────────────
  function agregar(sku, cantidad) {
    const prod = buscarProducto(sku);
    if (!prod) throw new Error('SKU no existe: ' + sku);
    if (cantidad <= 0) throw new Error('Cantidad invalida');
    if (prod.tipo === 'pieza' && !Number.isInteger(cantidad)) {
      throw new Error('Producto por pieza requiere cantidad entera');
    }
    if (existencia(sku) < cantidad) {
      throw new Error('Existencia insuficiente para ' + prod.nombre);
    }
    const precio = precioConMerma(sku);
    const item = {
      sku,
      nombre: prod.nombre,
      tipo: prod.tipo,
      cantidad,
      precioUnit: precio,
      importe: +(precio * cantidad).toFixed(2),
      conDescuentoMerma: precio < prod.precio
    };
    estado.carrito.push(item);
    return item;
  }

  function quitar(idx) {
    if (idx < 0 || idx >= estado.carrito.length) return false;
    estado.carrito.splice(idx, 1);
    return true;
  }

  function totales() {
    const subtotal = estado.carrito.reduce((s, i) => s + i.importe, 0);
    const iva = +(subtotal * estado.config.ivaPct / 100).toFixed(2);
    const total = +(subtotal + iva).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), iva, total, items: estado.carrito.length };
  }

  function cobrar(metodoPago, recibido) {
    if (!estado.carrito.length) throw new Error('Carrito vacio');
    const t = totales();
    if (metodoPago === 'efectivo' && (recibido == null || recibido < t.total)) {
      throw new Error('Efectivo insuficiente');
    }
    const lotesUsados = [];
    for (const item of estado.carrito) {
      lotesUsados.push({ sku: item.sku, consumo: descontarFIFO(item.sku, item.cantidad) });
    }
    const venta = {
      folio: estado.folio++,
      fecha: hoy().toISOString(),
      items: estado.carrito.slice(),
      totales: t,
      metodoPago,
      recibido: recibido || t.total,
      cambio: metodoPago === 'efectivo' ? +(recibido - t.total).toFixed(2) : 0,
      lotesUsados
    };
    estado.ventas.push(venta);
    estado.carrito = [];
    return venta;
  }

  // ─────────────────────────────────────────────────────────────
  // Reportes / alertas
  // ─────────────────────────────────────────────────────────────
  function alertasCaducidad() {
    const out = [];
    const limite = estado.config.alertaDiasCad;
    for (const [sku, lotes] of estado.inventario.entries()) {
      const prod = buscarProducto(sku);
      for (const l of lotes) {
        const d = diasEntre(hoy(), l.caducidad);
        if (d <= limite) {
          out.push({
            sku, nombre: prod.nombre, lote: l.lote,
            cantidad: l.cantidad, caducidad: fmtFecha(l.caducidad),
            diasRestantes: d, urgencia: d <= 0 ? 'VENCIDO' : d <= 1 ? 'CRITICO' : 'PROXIMO'
          });
        }
      }
    }
    return out.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }

  function reporteInventario() {
    const r = [];
    for (const prod of CATALOGO) {
      const ex = existencia(prod.sku);
      if (ex > 0) {
        r.push({
          sku: prod.sku, nombre: prod.nombre, tipo: prod.tipo,
          existencia: +ex.toFixed(3), precio: prod.precio,
          precioActual: precioConMerma(prod.sku),
          valorInventario: +(ex * (estado.inventario.get(prod.sku)?.[0]?.costo || prod.precio * 0.65)).toFixed(2)
        });
      }
    }
    return r;
  }

  function reporteVentas() {
    const total = estado.ventas.reduce((s, v) => s + v.totales.total, 0);
    const porSku = {};
    for (const v of estado.ventas) {
      for (const it of v.items) {
        porSku[it.sku] = porSku[it.sku] || { nombre: it.nombre, cantidad: 0, importe: 0 };
        porSku[it.sku].cantidad += it.cantidad;
        porSku[it.sku].importe += it.importe;
      }
    }
    return {
      totalVentas: estado.ventas.length,
      ingresoTotal: +total.toFixed(2),
      ticketPromedio: estado.ventas.length ? +(total / estado.ventas.length).toFixed(2) : 0,
      topProductos: Object.entries(porSku)
        .map(([sku, d]) => ({ sku, ...d, importe: +d.importe.toFixed(2) }))
        .sort((a, b) => b.importe - a.importe)
        .slice(0, 10)
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Seed demo
  // ─────────────────────────────────────────────────────────────
  function seedDemo() {
    const h = hoy();
    const en = (d) => new Date(h.getTime() + d * 86400000);
    recibirLote('LCH-ENT-1L', 40, en(8), 18);
    recibirLote('LCH-ENT-1L', 20, en(2), 18);  // proximo a caducar
    recibirLote('LCH-DES-1L', 25, en(10), 22);
    recibirLote('CRM-ACI-200', 30, en(15), 14);
    recibirLote('YOG-NAT-1L', 18, en(12), 25);
    recibirLote('QSO-OAX-KG', 8.5, en(20), 110);
    recibirLote('QSO-PAN-KG', 6.2, en(15), 95);
    recibirLote('QSO-MAN-KG', 4.0, en(30), 145);
    recibirLote('QSO-FRE-KG', 5.5, en(1), 85);  // critico
    recibirLote('JAM-PAV-KG', 3.8, en(10), 125);
    recibirLote('HUE-18', 24, en(25), 55);
    recibirLote('MAN-BAR-200', 15, en(45), 30);
  }

  // ─────────────────────────────────────────────────────────────
  // API publica
  // ─────────────────────────────────────────────────────────────
  global.CremeriaAPI = {
    catalogo: () => CATALOGO.slice(),
    buscarProducto,
    recibirLote,
    existencia,
    precioConMerma,
    agregar,
    quitar,
    carrito: () => estado.carrito.slice(),
    totales,
    cobrar,
    alertasCaducidad,
    reporteInventario,
    reporteVentas,
    ventas: () => estado.ventas.slice(),
    config: estado.config,
    seedDemo,
    reset: () => {
      estado.inventario.clear();
      estado.carrito = [];
      estado.ventas = [];
      estado.folio = 1001;
    },
    version: '1.0.0-cremeria'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.CremeriaAPI;
})(typeof window !== 'undefined' ? window : globalThis);
