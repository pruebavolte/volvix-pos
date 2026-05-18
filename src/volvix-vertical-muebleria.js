/**
 * volvix-vertical-muebleria.js
 * Vertical POS para Mueblerías — Volvix POS
 *
 * Funcionalidades:
 *   - Catálogo de muebles con variantes (color, material, medida)
 *   - Financiamiento a plazos (cálculo de cuotas, intereses, enganche)
 *   - Entrega a domicilio (zonas, costos, agenda)
 *   - Apartado / layaway
 *   - Garantías y devoluciones
 *
 * Expone: window.MuebleriaAPI
 */

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────
  // 1. CATÁLOGO
  // ──────────────────────────────────────────────────────────────────
  const CATALOGO = [
    { sku: 'MBL-SAL-001', nombre: 'Sala esquinera Roma 3pz', categoria: 'Salas',
      precio: 18999, costo: 11500, stock: 4, peso_kg: 95,
      dim: { largo: 280, ancho: 210, alto: 90 },
      variantes: [
        { id: 'gris', label: 'Gris tela', extra: 0 },
        { id: 'cafe', label: 'Café piel sintética', extra: 1500 },
        { id: 'beige', label: 'Beige lino', extra: 800 }
      ],
      garantia_meses: 12, requiere_armado: true },
    { sku: 'MBL-COM-014', nombre: 'Comedor Verona 6 sillas', categoria: 'Comedores',
      precio: 14500, costo: 8400, stock: 6, peso_kg: 70,
      dim: { largo: 180, ancho: 90, alto: 76 },
      variantes: [
        { id: 'natural', label: 'Madera natural', extra: 0 },
        { id: 'chocolate', label: 'Chocolate', extra: 700 }
      ],
      garantia_meses: 24, requiere_armado: true },
    { sku: 'MBL-REC-007', nombre: 'Recámara matrimonial Aspen', categoria: 'Recámaras',
      precio: 22500, costo: 13800, stock: 3, peso_kg: 130,
      dim: { largo: 200, ancho: 180, alto: 110 },
      variantes: [
        { id: 'queen', label: 'Queen size', extra: 0 },
        { id: 'king', label: 'King size', extra: 2800 }
      ],
      garantia_meses: 24, requiere_armado: true },
    { sku: 'MBL-COL-003', nombre: 'Colchón Ortopédico Dream Plus', categoria: 'Colchones',
      precio: 7990, costo: 4200, stock: 12, peso_kg: 35,
      dim: { largo: 200, ancho: 160, alto: 30 },
      variantes: [
        { id: 'matr', label: 'Matrimonial', extra: 0 },
        { id: 'queen', label: 'Queen', extra: 1200 },
        { id: 'king', label: 'King', extra: 2400 }
      ],
      garantia_meses: 60, requiere_armado: false },
    { sku: 'MBL-OFI-021', nombre: 'Escritorio ejecutivo Manhattan', categoria: 'Oficina',
      precio: 5499, costo: 2900, stock: 8, peso_kg: 45,
      dim: { largo: 150, ancho: 70, alto: 75 },
      variantes: [{ id: 'std', label: 'Standard', extra: 0 }],
      garantia_meses: 12, requiere_armado: true }
  ];

  // ──────────────────────────────────────────────────────────────────
  // 2. PLANES DE FINANCIAMIENTO
  // ──────────────────────────────────────────────────────────────────
  const PLANES = [
    { id: 'CONTADO',   meses: 0,  tasa_anual: 0.00, descuento: 0.05, enganche_min: 1.00 },
    { id: 'MSI_3',     meses: 3,  tasa_anual: 0.00, descuento: 0.00, enganche_min: 0.00 },
    { id: 'MSI_6',     meses: 6,  tasa_anual: 0.00, descuento: 0.00, enganche_min: 0.00 },
    { id: 'MSI_12',    meses: 12, tasa_anual: 0.00, descuento: 0.00, enganche_min: 0.10 },
    { id: 'PROPIO_18', meses: 18, tasa_anual: 0.24, descuento: 0.00, enganche_min: 0.20 },
    { id: 'PROPIO_24', meses: 24, tasa_anual: 0.28, descuento: 0.00, enganche_min: 0.25 },
    { id: 'PROPIO_36', meses: 36, tasa_anual: 0.32, descuento: 0.00, enganche_min: 0.30 }
  ];

  // ──────────────────────────────────────────────────────────────────
  // 3. ZONAS DE ENTREGA
  // ──────────────────────────────────────────────────────────────────
  const ZONAS_ENTREGA = [
    { id: 'LOCAL',    label: 'Local (≤10 km)',     costo_base: 250,  costo_kg: 0,    dias: 1 },
    { id: 'METRO',    label: 'Zona metropolitana', costo_base: 450,  costo_kg: 2,    dias: 2 },
    { id: 'FORANEO',  label: 'Foráneo (≤300 km)',  costo_base: 1200, costo_kg: 8,    dias: 4 },
    { id: 'NACIONAL', label: 'Nacional',           costo_base: 2500, costo_kg: 15,   dias: 7 }
  ];

  // ──────────────────────────────────────────────────────────────────
  // 4. ESTADO INTERNO
  // ──────────────────────────────────────────────────────────────────
  const _state = {
    carrito: [],          // { sku, variante, qty, precio_unit }
    cliente: null,        // { nombre, rfc, tel, direccion }
    apartados: [],
    ventas: []
  };

  // ──────────────────────────────────────────────────────────────────
  // 5. UTILIDADES
  // ──────────────────────────────────────────────────────────────────
  function _round(n) { return Math.round(n * 100) / 100; }
  function _findProducto(sku) { return CATALOGO.find(p => p.sku === sku); }
  function _findVariante(p, vid) { return p.variantes.find(v => v.id === vid); }
  function _findPlan(id) { return PLANES.find(p => p.id === id); }
  function _findZona(id) { return ZONAS_ENTREGA.find(z => z.id === id); }
  function _uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. CATÁLOGO API
  // ──────────────────────────────────────────────────────────────────
  function listarCatalogo(filtro = {}) {
    return CATALOGO.filter(p => {
      if (filtro.categoria && p.categoria !== filtro.categoria) return false;
      if (filtro.minPrecio && p.precio < filtro.minPrecio) return false;
      if (filtro.maxPrecio && p.precio > filtro.maxPrecio) return false;
      if (filtro.q) {
        const q = filtro.q.toLowerCase();
        if (!p.nombre.toLowerCase().includes(q) &&
            !p.sku.toLowerCase().includes(q)) return false;
      }
      if (filtro.soloDisponible && p.stock <= 0) return false;
      return true;
    });
  }

  function obtenerProducto(sku) {
    const p = _findProducto(sku);
    return p ? Object.assign({}, p) : null;
  }

  function categorias() {
    return [...new Set(CATALOGO.map(p => p.categoria))];
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. CARRITO
  // ──────────────────────────────────────────────────────────────────
  function agregarAlCarrito(sku, varianteId, qty = 1) {
    const p = _findProducto(sku);
    if (!p) throw new Error('SKU no existe: ' + sku);
    const v = _findVariante(p, varianteId);
    if (!v) throw new Error('Variante no existe: ' + varianteId);
    if (qty <= 0) throw new Error('Cantidad inválida');
    if (qty > p.stock) throw new Error('Stock insuficiente: ' + p.stock);

    const precio_unit = p.precio + v.extra;
    const item = { sku, variante: varianteId, qty, precio_unit,
                   nombre: p.nombre + ' (' + v.label + ')',
                   peso_kg: p.peso_kg, requiere_armado: p.requiere_armado };
    _state.carrito.push(item);
    return item;
  }

  function quitarDelCarrito(idx) {
    return _state.carrito.splice(idx, 1)[0] || null;
  }

  function vaciarCarrito() { _state.carrito = []; }

  function subtotalCarrito() {
    return _round(_state.carrito.reduce((s, i) => s + i.precio_unit * i.qty, 0));
  }

  function pesoTotalCarrito() {
    return _state.carrito.reduce((s, i) => s + i.peso_kg * i.qty, 0);
  }

  // ──────────────────────────────────────────────────────────────────
  // 8. FINANCIAMIENTO
  // ──────────────────────────────────────────────────────────────────
  function calcularFinanciamiento(monto, planId, enganchePct = null) {
    const plan = _findPlan(planId);
    if (!plan) throw new Error('Plan no existe: ' + planId);

    const descuento = monto * plan.descuento;
    const montoFinal = monto - descuento;

    const eng = enganchePct !== null ? enganchePct : plan.enganche_min;
    if (eng < plan.enganche_min) {
      throw new Error('Enganche mínimo: ' + (plan.enganche_min * 100) + '%');
    }
    const enganche = _round(montoFinal * eng);
    const saldo = montoFinal - enganche;

    if (plan.meses === 0) {
      return { plan: plan.id, montoOriginal: monto, descuento: _round(descuento),
               montoFinal: _round(montoFinal), enganche, saldo: 0,
               cuotaMensual: 0, totalIntereses: 0, totalPagar: _round(montoFinal),
               meses: 0 };
    }

    const tasaMensual = plan.tasa_anual / 12;
    let cuota;
    if (tasaMensual === 0) {
      cuota = saldo / plan.meses;
    } else {
      cuota = saldo * (tasaMensual * Math.pow(1 + tasaMensual, plan.meses)) /
              (Math.pow(1 + tasaMensual, plan.meses) - 1);
    }
    const totalCuotas = cuota * plan.meses;
    const intereses = totalCuotas - saldo;

    return {
      plan: plan.id, meses: plan.meses,
      montoOriginal: monto, descuento: _round(descuento),
      montoFinal: _round(montoFinal),
      enganche, saldo: _round(saldo),
      cuotaMensual: _round(cuota),
      totalIntereses: _round(intereses),
      totalPagar: _round(enganche + totalCuotas),
      tasaAnual: plan.tasa_anual
    };
  }

  function comparativoPlanes(monto) {
    return PLANES.map(p => {
      try { return calcularFinanciamiento(monto, p.id); }
      catch (e) { return { plan: p.id, error: e.message }; }
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 9. ENTREGA A DOMICILIO
  // ──────────────────────────────────────────────────────────────────
  function cotizarEntrega(zonaId, pesoKg, requiereArmado = false) {
    const zona = _findZona(zonaId);
    if (!zona) throw new Error('Zona no existe: ' + zonaId);
    const transporte = zona.costo_base + zona.costo_kg * pesoKg;
    const armado = requiereArmado ? 350 : 0;
    return {
      zona: zona.id, label: zona.label,
      transporte: _round(transporte),
      armado, total: _round(transporte + armado),
      diasHabiles: zona.dias
    };
  }

  function agendarEntrega(fechaISO, zonaId) {
    const zona = _findZona(zonaId);
    if (!zona) throw new Error('Zona inválida');
    const f = new Date(fechaISO);
    if (isNaN(f.getTime())) throw new Error('Fecha inválida');
    const minDate = new Date(Date.now() + zona.dias * 86400000);
    if (f < minDate) {
      throw new Error('Fecha mínima para esta zona: ' +
                      minDate.toISOString().slice(0, 10));
    }
    return { folio: _uid('ENT'), fecha: fechaISO, zona: zonaId, status: 'programada' };
  }

  // ──────────────────────────────────────────────────────────────────
  // 10. APARTADO / LAYAWAY
  // ──────────────────────────────────────────────────────────────────
  function crearApartado(montoTotal, anticipo, plazoDias = 90) {
    if (anticipo < montoTotal * 0.20) {
      throw new Error('Anticipo mínimo 20% del total');
    }
    const ap = {
      folio: _uid('APT'),
      total: _round(montoTotal),
      anticipo: _round(anticipo),
      saldo: _round(montoTotal - anticipo),
      vence: new Date(Date.now() + plazoDias * 86400000).toISOString().slice(0, 10),
      abonos: [],
      status: 'activo'
    };
    _state.apartados.push(ap);
    return ap;
  }

  function abonarApartado(folio, monto) {
    const ap = _state.apartados.find(a => a.folio === folio);
    if (!ap) throw new Error('Apartado no encontrado');
    if (ap.status !== 'activo') throw new Error('Apartado no activo');
    ap.abonos.push({ fecha: new Date().toISOString(), monto: _round(monto) });
    ap.saldo = _round(ap.saldo - monto);
    if (ap.saldo <= 0) { ap.saldo = 0; ap.status = 'liquidado'; }
    return ap;
  }

  // ──────────────────────────────────────────────────────────────────
  // 11. CIERRE DE VENTA
  // ──────────────────────────────────────────────────────────────────
  function cerrarVenta(opciones = {}) {
    if (_state.carrito.length === 0) throw new Error('Carrito vacío');
    const subtotal = subtotalCarrito();
    const fin = opciones.planId
      ? calcularFinanciamiento(subtotal, opciones.planId, opciones.enganchePct)
      : null;
    const entrega = opciones.zonaEntrega
      ? cotizarEntrega(opciones.zonaEntrega, pesoTotalCarrito(),
                       _state.carrito.some(i => i.requiere_armado))
      : null;

    const baseTotal = fin ? fin.totalPagar : subtotal;
    const total = _round(baseTotal + (entrega ? entrega.total : 0));

    // Decrementar stock
    _state.carrito.forEach(it => {
      const p = _findProducto(it.sku);
      if (p) p.stock -= it.qty;
    });

    const venta = {
      folio: _uid('VTA'),
      fecha: new Date().toISOString(),
      cliente: _state.cliente,
      items: _state.carrito.slice(),
      subtotal, financiamiento: fin, entrega, total
    };
    _state.ventas.push(venta);
    vaciarCarrito();
    return venta;
  }

  function setCliente(c) { _state.cliente = c; return c; }
  function historialVentas() { return _state.ventas.slice(); }

  // ──────────────────────────────────────────────────────────────────
  // 12. EXPORT
  // ──────────────────────────────────────────────────────────────────
  global.MuebleriaAPI = {
    // catálogo
    listarCatalogo, obtenerProducto, categorias,
    // carrito
    agregarAlCarrito, quitarDelCarrito, vaciarCarrito,
    subtotalCarrito, pesoTotalCarrito,
    verCarrito: () => _state.carrito.slice(),
    // financiamiento
    calcularFinanciamiento, comparativoPlanes,
    planesDisponibles: () => PLANES.slice(),
    // entrega
    cotizarEntrega, agendarEntrega,
    zonasEntrega: () => ZONAS_ENTREGA.slice(),
    // apartado
    crearApartado, abonarApartado,
    listarApartados: () => _state.apartados.slice(),
    // venta
    cerrarVenta, setCliente, historialVentas,
    // meta
    version: '1.0.0', vertical: 'muebleria'
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix] MuebleriaAPI v1.0.0 cargada — ' +
                CATALOGO.length + ' productos, ' + PLANES.length + ' planes.');
  }
})(typeof window !== 'undefined' ? window : globalThis);
