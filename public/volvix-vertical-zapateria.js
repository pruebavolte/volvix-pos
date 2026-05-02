/* ==========================================================================
 * Volvix POS - Vertical: Zapatería
 * Módulo especializado para tiendas de calzado.
 *
 * Características:
 *   - Matriz de tallas por modelo (US/EU/MX/CM)
 *   - Gestión de cajas físicas (color + talla = SKU único)
 *   - Reserva de pares (apartados con expiración)
 *   - Devoluciones con cambio de talla / color / modelo
 *   - Reporte de tallas con baja rotación / quiebres de stock
 *   - Conversión automática entre sistemas de tallas
 *
 * API global: window.ZapateriaAPI
 * ========================================================================== */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Tablas de conversión de tallas (Hombre / Mujer / Niño)
  // -------------------------------------------------------------------------
  const TABLA_TALLAS = {
    hombre: [
      { us: 6,  eu: 39, mx: 25,   cm: 24.0 },
      { us: 6.5,eu: 39.5,mx: 25.5,cm: 24.5 },
      { us: 7,  eu: 40, mx: 26,   cm: 25.0 },
      { us: 7.5,eu: 40.5,mx: 26.5,cm: 25.5 },
      { us: 8,  eu: 41, mx: 27,   cm: 26.0 },
      { us: 8.5,eu: 41.5,mx: 27.5,cm: 26.5 },
      { us: 9,  eu: 42, mx: 28,   cm: 27.0 },
      { us: 9.5,eu: 42.5,mx: 28.5,cm: 27.5 },
      { us: 10, eu: 43, mx: 29,   cm: 28.0 },
      { us: 10.5,eu: 43.5,mx: 29.5,cm: 28.5 },
      { us: 11, eu: 44, mx: 30,   cm: 29.0 },
      { us: 12, eu: 45, mx: 31,   cm: 30.0 },
      { us: 13, eu: 46, mx: 32,   cm: 31.0 },
    ],
    mujer: [
      { us: 5,  eu: 35, mx: 22,   cm: 22.0 },
      { us: 5.5,eu: 35.5,mx: 22.5,cm: 22.5 },
      { us: 6,  eu: 36, mx: 23,   cm: 23.0 },
      { us: 6.5,eu: 36.5,mx: 23.5,cm: 23.5 },
      { us: 7,  eu: 37, mx: 24,   cm: 24.0 },
      { us: 7.5,eu: 37.5,mx: 24.5,cm: 24.5 },
      { us: 8,  eu: 38, mx: 25,   cm: 25.0 },
      { us: 8.5,eu: 38.5,mx: 25.5,cm: 25.5 },
      { us: 9,  eu: 39, mx: 26,   cm: 26.0 },
      { us: 10, eu: 40, mx: 27,   cm: 27.0 },
    ],
    nino: [
      { us: 10, eu: 27, mx: 16, cm: 16.0 },
      { us: 11, eu: 28, mx: 17, cm: 17.0 },
      { us: 12, eu: 30, mx: 18, cm: 18.0 },
      { us: 13, eu: 31, mx: 19, cm: 19.0 },
      { us: 1,  eu: 32, mx: 20, cm: 20.0 },
      { us: 2,  eu: 33, mx: 21, cm: 21.0 },
      { us: 3,  eu: 34, mx: 22, cm: 22.0 },
      { us: 4,  eu: 35, mx: 23, cm: 23.0 },
    ],
  };

  function convertirTalla(valor, desde, hacia, genero = 'hombre') {
    const tabla = TABLA_TALLAS[genero] || TABLA_TALLAS.hombre;
    const fila = tabla.find(r => r[desde] === valor);
    return fila ? fila[hacia] : null;
  }

  // -------------------------------------------------------------------------
  // 2. Estado interno (persistencia en localStorage)
  // -------------------------------------------------------------------------
  const STORAGE_KEY = 'volvix_zapateria_v1';

  const estado = {
    modelos: {},     // { modeloId: { nombre, marca, genero, precio, colores:[] } }
    inventario: {},  // { sku: { modeloId, color, talla, stock, ubicacion } }
    reservas: [],    // [{ id, sku, cliente, vence, par }]
    ventas: [],      // historial
    devoluciones: [],
  };

  function cargar() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(estado, JSON.parse(raw));
    } catch (e) { console.warn('[Zapatería] no se pudo cargar estado:', e); }
  }
  function guardar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); }
    catch (e) { console.warn('[Zapatería] no se pudo guardar:', e); }
  }
  cargar();

  // -------------------------------------------------------------------------
  // 3. SKU helpers
  // -------------------------------------------------------------------------
  function generarSKU(modeloId, color, talla) {
    const c = String(color).toUpperCase().replace(/\s+/g, '').slice(0, 4);
    const t = String(talla).replace('.', 'p');
    return `${modeloId}-${c}-${t}`;
  }

  // -------------------------------------------------------------------------
  // 4. Modelos
  // -------------------------------------------------------------------------
  function registrarModelo({ id, nombre, marca, genero, precio, colores = [] }) {
    if (!id || !nombre) throw new Error('Modelo requiere id y nombre');
    estado.modelos[id] = {
      id, nombre, marca: marca || '',
      genero: genero || 'hombre',
      precio: Number(precio) || 0,
      colores: Array.from(new Set(colores)),
      creado: Date.now(),
    };
    guardar();
    return estado.modelos[id];
  }

  function obtenerModelo(id) { return estado.modelos[id] || null; }
  function listarModelos() { return Object.values(estado.modelos); }

  // -------------------------------------------------------------------------
  // 5. Inventario - Cajas (color + talla)
  // -------------------------------------------------------------------------
  function registrarCaja({ modeloId, color, talla, stock = 1, ubicacion = '' }) {
    if (!estado.modelos[modeloId]) throw new Error(`Modelo ${modeloId} no existe`);
    const sku = generarSKU(modeloId, color, talla);
    const actual = estado.inventario[sku];
    if (actual) {
      actual.stock += Number(stock);
    } else {
      estado.inventario[sku] = {
        sku, modeloId, color, talla: Number(talla),
        stock: Number(stock), ubicacion,
      };
    }
    // registrar color en modelo si es nuevo
    const m = estado.modelos[modeloId];
    if (!m.colores.includes(color)) m.colores.push(color);
    guardar();
    return estado.inventario[sku];
  }

  function ajustarStock(sku, delta) {
    const c = estado.inventario[sku];
    if (!c) throw new Error(`SKU ${sku} no existe`);
    c.stock += Number(delta);
    if (c.stock < 0) c.stock = 0;
    guardar();
    return c;
  }

  // -------------------------------------------------------------------------
  // 6. Matriz de tallas (vista clásica de zapatería)
  //    Devuelve tabla 2D: filas=colores, columnas=tallas, celda=stock
  // -------------------------------------------------------------------------
  function matrizTallas(modeloId) {
    const m = estado.modelos[modeloId];
    if (!m) return null;
    const cajas = Object.values(estado.inventario).filter(i => i.modeloId === modeloId);
    const tallas = Array.from(new Set(cajas.map(c => c.talla))).sort((a, b) => a - b);
    const colores = Array.from(new Set(cajas.map(c => c.color))).sort();
    const matriz = {};
    for (const color of colores) {
      matriz[color] = {};
      for (const talla of tallas) {
        const sku = generarSKU(modeloId, color, talla);
        matriz[color][talla] = (estado.inventario[sku]?.stock) || 0;
      }
    }
    return { modelo: m, tallas, colores, matriz };
  }

  // -------------------------------------------------------------------------
  // 7. Reservar par (apartado)
  // -------------------------------------------------------------------------
  function reservarPar({ sku, cliente, horasVigencia = 48 }) {
    const caja = estado.inventario[sku];
    if (!caja) throw new Error(`SKU ${sku} no existe`);
    if (caja.stock < 1) throw new Error(`Sin stock para ${sku}`);
    caja.stock -= 1;
    const reserva = {
      id: 'R' + Date.now().toString(36),
      sku, cliente,
      par: 1,
      creada: Date.now(),
      vence: Date.now() + horasVigencia * 3600 * 1000,
      estado: 'activa',
    };
    estado.reservas.push(reserva);
    guardar();
    return reserva;
  }

  function liberarReserva(id) {
    const r = estado.reservas.find(x => x.id === id);
    if (!r) throw new Error(`Reserva ${id} no existe`);
    if (r.estado !== 'activa') return r;
    estado.inventario[r.sku].stock += r.par;
    r.estado = 'liberada';
    r.liberada = Date.now();
    guardar();
    return r;
  }

  function purgarReservasVencidas() {
    const ahora = Date.now();
    let n = 0;
    for (const r of estado.reservas) {
      if (r.estado === 'activa' && r.vence < ahora) {
        estado.inventario[r.sku].stock += r.par;
        r.estado = 'vencida';
        n++;
      }
    }
    if (n) guardar();
    return n;
  }

  // -------------------------------------------------------------------------
  // 8. Venta
  // -------------------------------------------------------------------------
  function venderPar({ sku, cliente = 'mostrador', reservaId = null, descuento = 0 }) {
    const caja = estado.inventario[sku];
    if (!caja) throw new Error(`SKU ${sku} no existe`);
    if (reservaId) {
      const r = estado.reservas.find(x => x.id === reservaId && x.estado === 'activa');
      if (!r) throw new Error('Reserva inválida o vencida');
      r.estado = 'vendida';
    } else {
      if (caja.stock < 1) throw new Error(`Sin stock para ${sku}`);
      caja.stock -= 1;
    }
    const m = estado.modelos[caja.modeloId];
    const venta = {
      id: 'V' + Date.now().toString(36),
      sku, cliente,
      precio: m.precio,
      descuento: Number(descuento) || 0,
      total: Math.max(0, m.precio - (Number(descuento) || 0)),
      fecha: Date.now(),
    };
    estado.ventas.push(venta);
    guardar();
    return venta;
  }

  // -------------------------------------------------------------------------
  // 9. Devoluciones (cambio de talla, color o modelo)
  // -------------------------------------------------------------------------
  function devolverPar({ ventaId, motivo = '', cambioSku = null }) {
    const v = estado.ventas.find(x => x.id === ventaId);
    if (!v) throw new Error(`Venta ${ventaId} no existe`);
    estado.inventario[v.sku].stock += 1;
    let cambio = null;
    if (cambioSku) {
      const nueva = estado.inventario[cambioSku];
      if (!nueva) throw new Error(`SKU cambio ${cambioSku} no existe`);
      if (nueva.stock < 1) throw new Error(`Sin stock para cambio ${cambioSku}`);
      nueva.stock -= 1;
      cambio = cambioSku;
    }
    const dev = {
      id: 'D' + Date.now().toString(36),
      ventaId, skuOriginal: v.sku, skuCambio: cambio,
      motivo, fecha: Date.now(),
    };
    estado.devoluciones.push(dev);
    guardar();
    return dev;
  }

  // -------------------------------------------------------------------------
  // 10. Reportes
  // -------------------------------------------------------------------------
  function reporteQuiebres(umbral = 1) {
    return Object.values(estado.inventario)
      .filter(i => i.stock < umbral)
      .map(i => ({
        sku: i.sku,
        modelo: estado.modelos[i.modeloId]?.nombre,
        color: i.color, talla: i.talla, stock: i.stock,
      }));
  }

  function reporteRotacion(diasVentana = 30) {
    const desde = Date.now() - diasVentana * 86400000;
    const conteo = {};
    for (const v of estado.ventas) {
      if (v.fecha >= desde) conteo[v.sku] = (conteo[v.sku] || 0) + 1;
    }
    return Object.entries(conteo)
      .map(([sku, n]) => ({ sku, vendidos: n }))
      .sort((a, b) => b.vendidos - a.vendidos);
  }

  function tallasMasVendidas(diasVentana = 30) {
    const desde = Date.now() - diasVentana * 86400000;
    const por = {};
    for (const v of estado.ventas) {
      if (v.fecha < desde) continue;
      const t = estado.inventario[v.sku]?.talla;
      if (t == null) continue;
      por[t] = (por[t] || 0) + 1;
    }
    return Object.entries(por)
      .map(([talla, n]) => ({ talla: Number(talla), vendidos: n }))
      .sort((a, b) => b.vendidos - a.vendidos);
  }

  // -------------------------------------------------------------------------
  // 11. API pública
  // -------------------------------------------------------------------------
  global.ZapateriaAPI = {
    // tallas
    convertirTalla,
    TABLA_TALLAS,
    // modelos
    registrarModelo,
    obtenerModelo,
    listarModelos,
    // inventario
    registrarCaja,
    ajustarStock,
    matrizTallas,
    generarSKU,
    // reservas
    reservarPar,
    liberarReserva,
    purgarReservasVencidas,
    // ventas / devoluciones
    venderPar,
    devolverPar,
    // reportes
    reporteQuiebres,
    reporteRotacion,
    tallasMasVendidas,
    // debug
    _estado: () => estado,
    _reset: () => { localStorage.removeItem(STORAGE_KEY); location.reload(); },
  };

  // auto-purga reservas vencidas cada 5 min
  setInterval(purgarReservasVencidas, 5 * 60 * 1000);

  console.log('[Volvix Zapatería] cargado. Usa window.ZapateriaAPI');
})(typeof window !== 'undefined' ? window : globalThis);
