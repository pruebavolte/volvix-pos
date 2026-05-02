/**
 * volvix-vertical-helado.js
 * POS Vertical para Heladerías
 * Maneja sabores, tamaños (cono, vaso, litro), toppings, batidos y sundaes.
 * API expuesta en: window.HeladoAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────
  // CATÁLOGO BASE
  // ─────────────────────────────────────────────
  const SABORES = [
    { id: 'van', nombre: 'Vainilla',     precio: 0,  stock: 100, tipo: 'crema'  },
    { id: 'cho', nombre: 'Chocolate',    precio: 0,  stock: 100, tipo: 'crema'  },
    { id: 'fre', nombre: 'Fresa',        precio: 0,  stock: 80,  tipo: 'crema'  },
    { id: 'pis', nombre: 'Pistacho',     precio: 5,  stock: 40,  tipo: 'crema'  },
    { id: 'coo', nombre: 'Cookies',      precio: 3,  stock: 60,  tipo: 'crema'  },
    { id: 'mng', nombre: 'Mango',        precio: 0,  stock: 70,  tipo: 'agua'   },
    { id: 'lim', nombre: 'Limón',        precio: 0,  stock: 70,  tipo: 'agua'   },
    { id: 'mar', nombre: 'Maracuyá',     precio: 2,  stock: 50,  tipo: 'agua'   },
    { id: 'caf', nombre: 'Café',         precio: 4,  stock: 50,  tipo: 'crema'  },
    { id: 'dul', nombre: 'Dulce de Leche',precio: 3, stock: 60,  tipo: 'crema'  }
  ];

  const TAMANOS = {
    cono_simple:  { nombre: 'Cono Simple',   precio: 25, bolas: 1, contenedor: 'cono'  },
    cono_doble:   { nombre: 'Cono Doble',    precio: 40, bolas: 2, contenedor: 'cono'  },
    cono_triple:  { nombre: 'Cono Triple',   precio: 55, bolas: 3, contenedor: 'cono'  },
    vaso_chico:   { nombre: 'Vaso Chico',    precio: 30, bolas: 1, contenedor: 'vaso'  },
    vaso_mediano: { nombre: 'Vaso Mediano',  precio: 45, bolas: 2, contenedor: 'vaso'  },
    vaso_grande:  { nombre: 'Vaso Grande',   precio: 60, bolas: 3, contenedor: 'vaso'  },
    litro_medio:  { nombre: 'Medio Litro',   precio: 90, bolas: 4, contenedor: 'litro' },
    litro_uno:    { nombre: 'Litro',         precio: 160,bolas: 6, contenedor: 'litro' },
    litro_dos:    { nombre: '2 Litros',      precio: 300,bolas: 12,contenedor: 'litro' }
  };

  const TOPPINGS = [
    { id: 'choc_chip', nombre: 'Chispas Chocolate', precio: 5  },
    { id: 'gran',      nombre: 'Granola',           precio: 5  },
    { id: 'jara_cho',  nombre: 'Jarabe Chocolate',  precio: 4  },
    { id: 'jara_fre',  nombre: 'Jarabe Fresa',      precio: 4  },
    { id: 'jara_car',  nombre: 'Jarabe Caramelo',   precio: 4  },
    { id: 'nuez',      nombre: 'Nuez Picada',       precio: 7  },
    { id: 'oreo',      nombre: 'Oreo Triturada',    precio: 8  },
    { id: 'mm',        nombre: 'M&M\'s',            precio: 7  },
    { id: 'crem',      nombre: 'Crema Batida',      precio: 6  },
    { id: 'cere',      nombre: 'Cereza',            precio: 3  },
    { id: 'frut',      nombre: 'Frutos Rojos',      precio: 10 },
    { id: 'cara',      nombre: 'Caramelo Líquido',  precio: 4  }
  ];

  const BATIDOS = {
    chico:   { nombre: 'Batido Chico',   precio: 50, base: 'leche', bolas: 2 },
    mediano: { nombre: 'Batido Mediano', precio: 70, base: 'leche', bolas: 3 },
    grande:  { nombre: 'Batido Grande',  precio: 90, base: 'leche', bolas: 4 }
  };

  const SUNDAES = {
    classic: { nombre: 'Sundae Clásico',   precio: 75,  bolas: 2, toppings_incl: ['jara_cho','crem','cere'] },
    brownie: { nombre: 'Sundae Brownie',   precio: 95,  bolas: 2, toppings_incl: ['jara_cho','nuez','crem'] },
    banana:  { nombre: 'Banana Split',     precio: 110, bolas: 3, toppings_incl: ['jara_fre','jara_cho','crem','cere'] },
    mega:    { nombre: 'Sundae Mega',      precio: 150, bolas: 5, toppings_incl: ['jara_cho','jara_car','oreo','crem','cere','nuez'] }
  };

  const IVA = 0.16;

  // ─────────────────────────────────────────────
  // ESTADO
  // ─────────────────────────────────────────────
  const state = {
    carrito: [],     // items en proceso
    ventas:  [],     // historial
    folio:   1000
  };

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  function uid() {
    return 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getSabor(id) {
    return SABORES.find(s => s.id === id);
  }

  function getTopping(id) {
    return TOPPINGS.find(t => t.id === id);
  }

  function descontarStockSabores(saboresIds) {
    saboresIds.forEach(id => {
      const s = getSabor(id);
      if (s && s.stock > 0) s.stock -= 1;
    });
  }

  function validarSabores(saboresIds, bolasEsperadas) {
    if (!Array.isArray(saboresIds) || saboresIds.length === 0) {
      throw new Error('Debe seleccionar al menos un sabor');
    }
    if (saboresIds.length > bolasEsperadas) {
      throw new Error('Sabores exceden bolas (' + bolasEsperadas + ')');
    }
    saboresIds.forEach(id => {
      const s = getSabor(id);
      if (!s) throw new Error('Sabor inválido: ' + id);
      if (s.stock <= 0) throw new Error('Sin stock: ' + s.nombre);
    });
  }

  // ─────────────────────────────────────────────
  // CONSTRUCTORES DE ITEMS
  // ─────────────────────────────────────────────
  function crearHelado({ tamanoId, sabores, toppings = [] }) {
    const tam = TAMANOS[tamanoId];
    if (!tam) throw new Error('Tamaño inválido: ' + tamanoId);
    validarSabores(sabores, tam.bolas);

    let precio = tam.precio;
    sabores.forEach(id => { precio += getSabor(id).precio; });
    const topsObj = toppings.map(tid => {
      const t = getTopping(tid);
      if (!t) throw new Error('Topping inválido: ' + tid);
      precio += t.precio;
      return t;
    });

    return {
      uid: uid(),
      tipo: 'helado',
      tamano: tam.nombre,
      contenedor: tam.contenedor,
      bolas: tam.bolas,
      sabores: sabores.map(id => getSabor(id).nombre),
      saboresIds: sabores.slice(),
      toppings: topsObj.map(t => t.nombre),
      precio: precio,
      cantidad: 1
    };
  }

  function crearBatido({ tamano, saborPrincipal, toppings = [], extraLeche = false }) {
    const b = BATIDOS[tamano];
    if (!b) throw new Error('Tamaño de batido inválido: ' + tamano);
    validarSabores([saborPrincipal], 1);

    let precio = b.precio + getSabor(saborPrincipal).precio;
    if (extraLeche) precio += 5;
    const topsObj = toppings.map(tid => {
      const t = getTopping(tid);
      if (!t) throw new Error('Topping inválido: ' + tid);
      precio += t.precio;
      return t;
    });

    return {
      uid: uid(),
      tipo: 'batido',
      tamano: b.nombre,
      bolas: b.bolas,
      sabores: [getSabor(saborPrincipal).nombre],
      saboresIds: [saborPrincipal],
      toppings: topsObj.map(t => t.nombre),
      extraLeche: extraLeche,
      precio: precio,
      cantidad: 1
    };
  }

  function crearSundae({ tipoSundae, sabores, extraToppings = [] }) {
    const sun = SUNDAES[tipoSundae];
    if (!sun) throw new Error('Sundae inválido: ' + tipoSundae);
    validarSabores(sabores, sun.bolas);

    let precio = sun.precio;
    sabores.forEach(id => { precio += getSabor(id).precio; });
    const extras = extraToppings.map(tid => {
      const t = getTopping(tid);
      if (!t) throw new Error('Topping inválido: ' + tid);
      precio += t.precio;
      return t;
    });
    const incluidos = sun.toppings_incl.map(getTopping).filter(Boolean);

    return {
      uid: uid(),
      tipo: 'sundae',
      tamano: sun.nombre,
      bolas: sun.bolas,
      sabores: sabores.map(id => getSabor(id).nombre),
      saboresIds: sabores.slice(),
      toppings: incluidos.concat(extras).map(t => t.nombre),
      precio: precio,
      cantidad: 1
    };
  }

  // ─────────────────────────────────────────────
  // CARRITO
  // ─────────────────────────────────────────────
  function agregarItem(item) {
    state.carrito.push(item);
    return item;
  }

  function quitarItem(uidItem) {
    const idx = state.carrito.findIndex(i => i.uid === uidItem);
    if (idx === -1) return false;
    state.carrito.splice(idx, 1);
    return true;
  }

  function setCantidad(uidItem, cantidad) {
    const it = state.carrito.find(i => i.uid === uidItem);
    if (!it) return false;
    it.cantidad = Math.max(1, parseInt(cantidad, 10) || 1);
    return true;
  }

  function vaciarCarrito() {
    state.carrito = [];
  }

  function calcularTotales() {
    const subtotal = state.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const iva = +(subtotal * IVA).toFixed(2);
    const total = +(subtotal + iva).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), iva, total, items: state.carrito.length };
  }

  // ─────────────────────────────────────────────
  // VENTA / TICKET
  // ─────────────────────────────────────────────
  function cobrar({ metodoPago = 'efectivo', recibido = 0 } = {}) {
    if (state.carrito.length === 0) throw new Error('Carrito vacío');
    const totales = calcularTotales();
    if (metodoPago === 'efectivo' && recibido < totales.total) {
      throw new Error('Efectivo insuficiente. Faltan ' + (totales.total - recibido).toFixed(2));
    }

    // Descontar stock
    state.carrito.forEach(it => {
      for (let n = 0; n < it.cantidad; n++) descontarStockSabores(it.saboresIds);
    });

    state.folio += 1;
    const ticket = {
      folio:    state.folio,
      fecha:    new Date().toISOString(),
      items:    state.carrito.slice(),
      ...totales,
      metodoPago,
      recibido,
      cambio:   metodoPago === 'efectivo' ? +(recibido - totales.total).toFixed(2) : 0
    };
    state.ventas.push(ticket);
    vaciarCarrito();
    return ticket;
  }

  function imprimirTicket(ticket) {
    const lines = [];
    lines.push('=== HELADERÍA VOLVIX ===');
    lines.push('Folio: ' + ticket.folio);
    lines.push('Fecha: ' + ticket.fecha);
    lines.push('------------------------');
    ticket.items.forEach(it => {
      lines.push(it.cantidad + 'x ' + it.tamano + ' (' + it.tipo + ')');
      lines.push('   Sabores: ' + it.sabores.join(', '));
      if (it.toppings && it.toppings.length) {
        lines.push('   Toppings: ' + it.toppings.join(', '));
      }
      lines.push('   $' + (it.precio * it.cantidad).toFixed(2));
    });
    lines.push('------------------------');
    lines.push('Subtotal: $' + ticket.subtotal.toFixed(2));
    lines.push('IVA:      $' + ticket.iva.toFixed(2));
    lines.push('TOTAL:    $' + ticket.total.toFixed(2));
    lines.push('Pago:     ' + ticket.metodoPago);
    if (ticket.metodoPago === 'efectivo') {
      lines.push('Recibido: $' + ticket.recibido.toFixed(2));
      lines.push('Cambio:   $' + ticket.cambio.toFixed(2));
    }
    lines.push('========================');
    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // REPORTES
  // ─────────────────────────────────────────────
  function reporteVentas() {
    const total = state.ventas.reduce((s, t) => s + t.total, 0);
    const conteoSabores = {};
    state.ventas.forEach(t => t.items.forEach(it => {
      it.saboresIds.forEach(id => {
        conteoSabores[id] = (conteoSabores[id] || 0) + it.cantidad;
      });
    }));
    const top = Object.entries(conteoSabores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, n]) => ({ sabor: getSabor(id) ? getSabor(id).nombre : id, cantidad: n }));
    return {
      tickets: state.ventas.length,
      totalVendido: +total.toFixed(2),
      topSabores: top
    };
  }

  function stockBajo(umbral = 20) {
    return SABORES.filter(s => s.stock <= umbral)
                  .map(s => ({ id: s.id, nombre: s.nombre, stock: s.stock }));
  }

  // ─────────────────────────────────────────────
  // API PÚBLICA
  // ─────────────────────────────────────────────
  const HeladoAPI = {
    // Catálogo
    getSabores:   () => SABORES.slice(),
    getTamanos:   () => Object.assign({}, TAMANOS),
    getToppings:  () => TOPPINGS.slice(),
    getBatidos:   () => Object.assign({}, BATIDOS),
    getSundaes:   () => Object.assign({}, SUNDAES),

    // Constructores
    crearHelado,
    crearBatido,
    crearSundae,

    // Carrito
    agregar:      (item) => agregarItem(item),
    quitar:       quitarItem,
    setCantidad,
    vaciar:       vaciarCarrito,
    getCarrito:   () => state.carrito.slice(),
    totales:      calcularTotales,

    // Venta
    cobrar,
    imprimirTicket,

    // Reportes
    reporteVentas,
    stockBajo,

    // Utilidad
    _state: state,
    version: '1.0.0'
  };

  global.HeladoAPI = HeladoAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeladoAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
