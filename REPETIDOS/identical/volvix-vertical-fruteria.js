/**
 * volvix-vertical-fruteria.js
 * Módulo vertical POS para Frutería / Verdulería
 * Maneja: ventas por kg y por pieza, índice de frescura, jugos, ensaladas combinadas,
 * mermas, lotes y proveedores locales.
 *
 * API pública: window.FruteriaAPI
 */
(function (global) {
  'use strict';

  // ===================== CATÁLOGO BASE =====================
  const CATALOGO = [
    // frutas por kg
    { sku: 'FRU-MANZ-001', nombre: 'Manzana Roja',     unidad: 'kg',  precio: 38.00, categoria: 'fruta',   estacional: false },
    { sku: 'FRU-PLAT-001', nombre: 'Plátano Tabasco',  unidad: 'kg',  precio: 22.00, categoria: 'fruta',   estacional: false },
    { sku: 'FRU-PAPA-001', nombre: 'Papaya Maradol',   unidad: 'kg',  precio: 28.00, categoria: 'fruta',   estacional: false },
    { sku: 'FRU-MANG-001', nombre: 'Mango Ataulfo',    unidad: 'kg',  precio: 45.00, categoria: 'fruta',   estacional: true  },
    { sku: 'FRU-FRES-001', nombre: 'Fresa',            unidad: 'kg',  precio: 65.00, categoria: 'fruta',   estacional: true  },
    { sku: 'FRU-SAND-001', nombre: 'Sandía',           unidad: 'kg',  precio: 18.00, categoria: 'fruta',   estacional: true  },
    { sku: 'FRU-PINA-001', nombre: 'Piña Miel',        unidad: 'pza', precio: 35.00, categoria: 'fruta',   estacional: false },
    { sku: 'FRU-LIMA-001', nombre: 'Limón Persa',      unidad: 'kg',  precio: 30.00, categoria: 'fruta',   estacional: false },
    // verduras
    { sku: 'VER-JIT-001',  nombre: 'Jitomate Saladet', unidad: 'kg',  precio: 24.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-CEB-001',  nombre: 'Cebolla Blanca',   unidad: 'kg',  precio: 26.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-ZAN-001',  nombre: 'Zanahoria',        unidad: 'kg',  precio: 20.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-LEC-001',  nombre: 'Lechuga Romana',   unidad: 'pza', precio: 18.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-BET-001',  nombre: 'Betabel',          unidad: 'kg',  precio: 22.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-API-001',  nombre: 'Apio',             unidad: 'pza', precio: 15.00, categoria: 'verdura', estacional: false },
    { sku: 'VER-ESP-001',  nombre: 'Espinaca',         unidad: 'manojo', precio: 14.00, categoria: 'verdura', estacional: false },
    // jugos preparados
    { sku: 'JUG-VERDE-001', nombre: 'Jugo Verde 500ml', unidad: 'pza', precio: 45.00, categoria: 'jugo' },
    { sku: 'JUG-NARJ-001',  nombre: 'Naranja Natural 500ml', unidad: 'pza', precio: 35.00, categoria: 'jugo' },
    { sku: 'JUG-ZAN-001',   nombre: 'Zanahoria-Naranja 500ml', unidad: 'pza', precio: 40.00, categoria: 'jugo' },
    { sku: 'JUG-BET-001',   nombre: 'Betabel-Apio 500ml', unidad: 'pza', precio: 42.00, categoria: 'jugo' },
    // ensaladas combinadas (precio por base + extras)
    { sku: 'ENS-CHIC-001', nombre: 'Ensalada Chica 250g', unidad: 'pza', precio: 55.00, categoria: 'ensalada' },
    { sku: 'ENS-MED-001',  nombre: 'Ensalada Mediana 400g', unidad: 'pza', precio: 75.00, categoria: 'ensalada' },
    { sku: 'ENS-GRA-001',  nombre: 'Ensalada Grande 600g', unidad: 'pza', precio: 99.00, categoria: 'ensalada' }
  ];

  // ===================== INVENTARIO / LOTES =====================
  // Cada lote registra fecha de ingreso para calcular frescura
  const inventario = new Map(); // sku -> { stock, lotes: [{cantidad, ingreso, proveedor}] }

  function _initInventario() {
    CATALOGO.forEach(p => {
      inventario.set(p.sku, {
        stock: 50,
        lotes: [{ cantidad: 50, ingreso: Date.now(), proveedor: 'Central de Abastos' }]
      });
    });
  }
  _initInventario();

  // ===================== FRESCURA =====================
  // Días "vida útil" por categoría
  const VIDA_UTIL = { fruta: 7, verdura: 5, jugo: 2, ensalada: 1 };

  function indiceFrescura(sku) {
    const prod = CATALOGO.find(p => p.sku === sku);
    if (!prod) return 0;
    const inv = inventario.get(sku);
    if (!inv || !inv.lotes.length) return 0;
    const lote = inv.lotes[0];
    const diasTrans = (Date.now() - lote.ingreso) / 86400000;
    const vida = VIDA_UTIL[prod.categoria] || 5;
    const frescura = Math.max(0, 1 - diasTrans / vida);
    return Math.round(frescura * 100); // 0-100
  }

  function etiquetaFrescura(sku) {
    const f = indiceFrescura(sku);
    if (f >= 80) return { texto: 'Muy fresco', color: '#16a34a' };
    if (f >= 50) return { texto: 'Fresco',     color: '#65a30d' };
    if (f >= 25) return { texto: 'Aceptable',  color: '#ca8a04' };
    if (f > 0)   return { texto: 'Vender pronto', color: '#ea580c' };
    return { texto: 'Retirar', color: '#dc2626' };
  }

  // ===================== VENTAS POR PESO / PZA =====================
  function calcularSubtotal(sku, cantidad) {
    const prod = CATALOGO.find(p => p.sku === sku);
    if (!prod) throw new Error('SKU no encontrado: ' + sku);
    if (cantidad <= 0) throw new Error('Cantidad inválida');
    // Permitir decimales solo en kg / manojo
    if (prod.unidad === 'pza' && !Number.isInteger(cantidad)) {
      throw new Error('Productos por pieza requieren cantidad entera');
    }
    const subtotal = +(prod.precio * cantidad).toFixed(2);
    return { producto: prod, cantidad, subtotal };
  }

  // ===================== TICKET =====================
  const ticketActual = { items: [], creado: null };

  function nuevoTicket() {
    ticketActual.items = [];
    ticketActual.creado = new Date().toISOString();
    return ticketActual;
  }

  function agregarItem(sku, cantidad) {
    const item = calcularSubtotal(sku, cantidad);
    const inv = inventario.get(sku);
    if (!inv || inv.stock < cantidad) {
      throw new Error('Stock insuficiente para ' + item.producto.nombre);
    }
    inv.stock -= cantidad;
    ticketActual.items.push({
      sku,
      nombre: item.producto.nombre,
      unidad: item.producto.unidad,
      cantidad,
      precio: item.producto.precio,
      subtotal: item.subtotal,
      frescura: indiceFrescura(sku)
    });
    return ticketActual;
  }

  function totalTicket() {
    const subtotal = ticketActual.items.reduce((s, i) => s + i.subtotal, 0);
    const iva = 0; // Frutas/verduras frescas: tasa 0% en MX
    const total = +(subtotal + iva).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), iva, total };
  }

  // ===================== JUGOS PERSONALIZADOS =====================
  // Receta = combinación de ingredientes con cantidades
  const RECETAS_JUGO_BASE = {
    'verde':    [{ sku: 'VER-ESP-001', cant: 0.5 }, { sku: 'VER-API-001', cant: 1 }, { sku: 'FRU-LIMA-001', cant: 0.05 }],
    'energetico': [{ sku: 'VER-BET-001', cant: 0.2 }, { sku: 'VER-ZAN-001', cant: 0.3 }, { sku: 'FRU-MANZ-001', cant: 0.2 }],
    'tropical':   [{ sku: 'FRU-PINA-001', cant: 0.25 }, { sku: 'FRU-MANG-001', cant: 0.3 }, { sku: 'FRU-PAPA-001', cant: 0.3 }]
  };

  function prepararJugo(tipo, tamañoMl) {
    const receta = RECETAS_JUGO_BASE[tipo];
    if (!receta) throw new Error('Tipo de jugo no disponible: ' + tipo);
    const factor = tamañoMl / 500;
    let costoBase = 0;
    const ingredientes = receta.map(r => {
      const prod = CATALOGO.find(p => p.sku === r.sku);
      const cant = +(r.cant * factor).toFixed(3);
      const costo = +(prod.precio * cant).toFixed(2);
      costoBase += costo;
      return { sku: r.sku, nombre: prod.nombre, cantidad: cant, costo };
    });
    const margen = 2.2; // markup frutería
    const precio = +(costoBase * margen + 8).toFixed(2); // +8 envase
    return { tipo, tamañoMl, ingredientes, costoBase: +costoBase.toFixed(2), precio };
  }

  // ===================== ENSALADAS COMBINADAS =====================
  function armarEnsalada(tamaño, extrasSkus) {
    const baseSku = { chica: 'ENS-CHIC-001', mediana: 'ENS-MED-001', grande: 'ENS-GRA-001' }[tamaño];
    if (!baseSku) throw new Error('Tamaño inválido: ' + tamaño);
    const base = CATALOGO.find(p => p.sku === baseSku);
    let total = base.precio;
    const extras = (extrasSkus || []).map(sku => {
      const prod = CATALOGO.find(p => p.sku === sku);
      if (!prod) throw new Error('Extra no encontrado: ' + sku);
      const costo = +(prod.precio * 0.1).toFixed(2); // 100g por extra
      total += costo;
      return { sku, nombre: prod.nombre, costo };
    });
    return { tamaño, base: base.nombre, extras, precio: +total.toFixed(2) };
  }

  // ===================== MERMA =====================
  const merma = []; // { sku, cantidad, motivo, fecha }

  function registrarMerma(sku, cantidad, motivo) {
    const inv = inventario.get(sku);
    if (!inv) throw new Error('SKU no existe');
    inv.stock = Math.max(0, inv.stock - cantidad);
    merma.push({ sku, cantidad, motivo, fecha: new Date().toISOString() });
    return merma[merma.length - 1];
  }

  function reporteMerma() {
    const porSku = {};
    merma.forEach(m => {
      porSku[m.sku] = (porSku[m.sku] || 0) + m.cantidad;
    });
    return { total: merma.length, porSku, registros: merma.slice(-20) };
  }

  // ===================== RECEPCIÓN DE MERCANCÍA =====================
  function recibirLote(sku, cantidad, proveedor) {
    const inv = inventario.get(sku);
    if (!inv) throw new Error('SKU no existe');
    inv.stock += cantidad;
    inv.lotes.unshift({ cantidad, ingreso: Date.now(), proveedor: proveedor || 'sin especificar' });
    return inv;
  }

  // ===================== ALERTAS =====================
  function productosPorRetirar() {
    return CATALOGO
      .map(p => ({ ...p, frescura: indiceFrescura(p.sku) }))
      .filter(p => p.frescura > 0 && p.frescura < 25);
  }

  function stockBajo(umbral = 10) {
    return CATALOGO
      .map(p => ({ sku: p.sku, nombre: p.nombre, stock: inventario.get(p.sku)?.stock || 0 }))
      .filter(p => p.stock <= umbral);
  }

  // ===================== BÚSQUEDA / LISTADO =====================
  function buscar(termino) {
    const t = (termino || '').toLowerCase();
    return CATALOGO.filter(p => p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t));
  }

  function listarPorCategoria(cat) {
    return CATALOGO.filter(p => p.categoria === cat);
  }

  // ===================== API PÚBLICA =====================
  global.FruteriaAPI = {
    // catálogo
    catalogo: () => CATALOGO.slice(),
    buscar,
    listarPorCategoria,
    // ventas
    nuevoTicket,
    agregarItem,
    totalTicket,
    ticket: () => JSON.parse(JSON.stringify(ticketActual)),
    // frescura
    indiceFrescura,
    etiquetaFrescura,
    // jugos / ensaladas
    prepararJugo,
    armarEnsalada,
    // inventario
    recibirLote,
    stock: (sku) => inventario.get(sku)?.stock || 0,
    // merma
    registrarMerma,
    reporteMerma,
    // alertas
    productosPorRetirar,
    stockBajo,
    // meta
    version: '1.0.0',
    vertical: 'fruteria'
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix] Vertical Frutería cargado — window.FruteriaAPI disponible');
  }
})(typeof window !== 'undefined' ? window : globalThis);
