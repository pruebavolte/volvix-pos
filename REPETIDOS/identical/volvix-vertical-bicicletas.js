// volvix-vertical-bicicletas.js
// Vertical POS para tiendas de bicicletas
// Expone: window.BicicletasAPI
// Catálogo de modelos, refacciones, reparaciones (taller) y alquiler

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // Datos maestros
  // ──────────────────────────────────────────────────────────────

  const TIPOS_BICI = ['montaña', 'ruta', 'urbana', 'bmx', 'plegable', 'electrica', 'infantil'];
  const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];
  const RODADAS = [12, 16, 20, 24, 26, 27.5, 29, 700];

  const CATALOGO_MODELOS = [
    { sku: 'BIC-MTB-001', nombre: 'Trail Hunter 29',  tipo: 'montaña',   rodada: 29,   talla: 'M', precio: 12500, stock: 4 },
    { sku: 'BIC-MTB-002', nombre: 'Rocky Pro 27.5',   tipo: 'montaña',   rodada: 27.5, talla: 'L', precio: 15800, stock: 2 },
    { sku: 'BIC-RUT-001', nombre: 'Aero Speed 700',   tipo: 'ruta',      rodada: 700,  talla: 'M', precio: 21000, stock: 3 },
    { sku: 'BIC-URB-001', nombre: 'CityGo Classic',   tipo: 'urbana',    rodada: 26,   talla: 'M', precio: 7800,  stock: 6 },
    { sku: 'BIC-BMX-001', nombre: 'Street King 20',   tipo: 'bmx',       rodada: 20,   talla: 'S', precio: 5400,  stock: 5 },
    { sku: 'BIC-PLG-001', nombre: 'Foldy Compact',    tipo: 'plegable',  rodada: 20,   talla: 'S', precio: 9200,  stock: 3 },
    { sku: 'BIC-ELE-001', nombre: 'eVolt 500W',       tipo: 'electrica', rodada: 27.5, talla: 'L', precio: 32500, stock: 2 },
    { sku: 'BIC-INF-001', nombre: 'KidStar 16',       tipo: 'infantil',  rodada: 16,   talla: 'XS', precio: 3200, stock: 8 }
  ];

  const CATALOGO_REFACCIONES = [
    { sku: 'REF-CAM-26',  nombre: 'Cámara R26',           categoria: 'llantas',     precio: 120,  stock: 40 },
    { sku: 'REF-CAM-29',  nombre: 'Cámara R29',           categoria: 'llantas',     precio: 145,  stock: 35 },
    { sku: 'REF-LLA-26',  nombre: 'Llanta MTB R26',       categoria: 'llantas',     precio: 480,  stock: 18 },
    { sku: 'REF-LLA-29',  nombre: 'Llanta MTB R29',       categoria: 'llantas',     precio: 650,  stock: 12 },
    { sku: 'REF-CAD-001', nombre: 'Cadena 9V',            categoria: 'transmision', precio: 380,  stock: 22 },
    { sku: 'REF-CAD-002', nombre: 'Cadena 11V',           categoria: 'transmision', precio: 620,  stock: 14 },
    { sku: 'REF-PIN-001', nombre: 'Piñón 11-32 9V',       categoria: 'transmision', precio: 720,  stock: 9 },
    { sku: 'REF-FRE-001', nombre: 'Pastillas freno disco',categoria: 'frenos',      precio: 280,  stock: 30 },
    { sku: 'REF-FRE-002', nombre: 'Cable freno',          categoria: 'frenos',      precio: 95,   stock: 50 },
    { sku: 'REF-MAN-001', nombre: 'Manubrio aluminio',    categoria: 'componentes', precio: 540,  stock: 11 },
    { sku: 'REF-ASI-001', nombre: 'Asiento confort',      categoria: 'componentes', precio: 320,  stock: 17 },
    { sku: 'REF-PED-001', nombre: 'Pedal MTB par',        categoria: 'componentes', precio: 410,  stock: 20 },
    { sku: 'REF-LUZ-001', nombre: 'Luz LED USB',          categoria: 'accesorios',  precio: 220,  stock: 25 },
    { sku: 'REF-CAS-001', nombre: 'Casco MTB',            categoria: 'accesorios',  precio: 780,  stock: 14 },
    { sku: 'REF-CAN-001', nombre: 'Candado U-lock',       categoria: 'accesorios',  precio: 350,  stock: 19 }
  ];

  const SERVICIOS_TALLER = [
    { codigo: 'SRV-AFI', nombre: 'Afinación general',         tiempoMin: 60,  precio: 350 },
    { codigo: 'SRV-FRE', nombre: 'Ajuste de frenos',          tiempoMin: 20,  precio: 120 },
    { codigo: 'SRV-CAM', nombre: 'Cambio de cámara',          tiempoMin: 15,  precio: 80  },
    { codigo: 'SRV-CEN', nombre: 'Centrado de rin',           tiempoMin: 30,  precio: 180 },
    { codigo: 'SRV-CAD', nombre: 'Cambio de cadena',          tiempoMin: 25,  precio: 150 },
    { codigo: 'SRV-VEL', nombre: 'Ajuste de velocidades',     tiempoMin: 20,  precio: 130 },
    { codigo: 'SRV-LIM', nombre: 'Lavado y lubricación',      tiempoMin: 40,  precio: 220 },
    { codigo: 'SRV-ARM', nombre: 'Armado de bicicleta nueva', tiempoMin: 90,  precio: 600 },
    { codigo: 'SRV-SUS', nombre: 'Servicio de suspensión',    tiempoMin: 120, precio: 950 }
  ];

  const TARIFAS_ALQUILER = {
    hora:    { urbana: 60,  montaña: 90,  ruta: 110, electrica: 180 },
    medioDia:{ urbana: 220, montaña: 320, ruta: 400, electrica: 650 },
    dia:     { urbana: 380, montaña: 550, ruta: 700, electrica: 1100 },
    semana:  { urbana: 1800,montaña: 2600,ruta: 3300,electrica: 5200 }
  };

  // ──────────────────────────────────────────────────────────────
  // Estado en memoria
  // ──────────────────────────────────────────────────────────────

  const state = {
    ventas: [],
    ordenesTaller: [],
    alquileres: [],
    seqVenta: 1000,
    seqOrden: 5000,
    seqAlquiler: 8000
  };

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  function findModelo(sku)     { return CATALOGO_MODELOS.find(m => m.sku === sku); }
  function findRefaccion(sku)  { return CATALOGO_REFACCIONES.find(r => r.sku === sku); }
  function findServicio(cod)   { return SERVICIOS_TALLER.find(s => s.codigo === cod); }
  function nowISO()            { return new Date().toISOString(); }
  function round2(n)           { return Math.round(n * 100) / 100; }

  function calcIVA(subtotal, tasa = 0.16) {
    const iva = round2(subtotal * tasa);
    return { subtotal: round2(subtotal), iva, total: round2(subtotal + iva) };
  }

  // ──────────────────────────────────────────────────────────────
  // Catálogo: búsqueda y filtros
  // ──────────────────────────────────────────────────────────────

  function buscarModelos(filtros = {}) {
    return CATALOGO_MODELOS.filter(m => {
      if (filtros.tipo   && m.tipo   !== filtros.tipo)   return false;
      if (filtros.rodada && m.rodada !== filtros.rodada) return false;
      if (filtros.talla  && m.talla  !== filtros.talla)  return false;
      if (filtros.precioMax && m.precio > filtros.precioMax) return false;
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        if (!m.nombre.toLowerCase().includes(q) && !m.sku.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function buscarRefacciones(filtros = {}) {
    return CATALOGO_REFACCIONES.filter(r => {
      if (filtros.categoria && r.categoria !== filtros.categoria) return false;
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        if (!r.nombre.toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Ventas (modelos + refacciones)
  // ──────────────────────────────────────────────────────────────

  function nuevaVenta(items, cliente = null) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Venta sin items');
    }
    const detalle = [];
    let subtotal = 0;

    for (const it of items) {
      const prod = findModelo(it.sku) || findRefaccion(it.sku);
      if (!prod) throw new Error(`SKU no encontrado: ${it.sku}`);
      const cant = it.cantidad || 1;
      if (prod.stock < cant) throw new Error(`Stock insuficiente para ${prod.sku} (hay ${prod.stock})`);
      prod.stock -= cant;
      const importe = round2(prod.precio * cant);
      subtotal += importe;
      detalle.push({ sku: prod.sku, nombre: prod.nombre, cantidad: cant, precio: prod.precio, importe });
    }

    const totales = calcIVA(subtotal);
    const venta = {
      id: `V-${++state.seqVenta}`,
      fecha: nowISO(),
      cliente,
      items: detalle,
      ...totales,
      estado: 'pagada'
    };
    state.ventas.push(venta);
    return venta;
  }

  function listarVentas() { return state.ventas.slice(); }

  // ──────────────────────────────────────────────────────────────
  // Taller / Reparaciones
  // ──────────────────────────────────────────────────────────────

  function abrirOrdenTaller({ cliente, bici, servicios = [], refacciones = [], notas = '' }) {
    if (!cliente || !bici) throw new Error('Falta cliente o datos de bici');

    const detalleSrv = servicios.map(c => {
      const s = findServicio(c);
      if (!s) throw new Error(`Servicio no encontrado: ${c}`);
      return { ...s };
    });

    const detalleRef = refacciones.map(it => {
      const r = findRefaccion(it.sku);
      if (!r) throw new Error(`Refacción no encontrada: ${it.sku}`);
      return { sku: r.sku, nombre: r.nombre, cantidad: it.cantidad || 1, precio: r.precio };
    });

    const subtotal =
      detalleSrv.reduce((a, s) => a + s.precio, 0) +
      detalleRef.reduce((a, r) => a + r.precio * r.cantidad, 0);

    const totales = calcIVA(subtotal);

    const orden = {
      id: `OT-${++state.seqOrden}`,
      fechaApertura: nowISO(),
      fechaCierre: null,
      cliente,
      bici,                   // { marca, modelo, color, serie }
      servicios: detalleSrv,
      refacciones: detalleRef,
      notas,
      ...totales,
      estado: 'recibida'      // recibida | en_proceso | listo | entregada
    };
    state.ordenesTaller.push(orden);
    return orden;
  }

  function actualizarOrden(id, parche) {
    const o = state.ordenesTaller.find(x => x.id === id);
    if (!o) throw new Error(`Orden no encontrada: ${id}`);
    Object.assign(o, parche);
    if (parche.estado === 'entregada' && !o.fechaCierre) o.fechaCierre = nowISO();
    return o;
  }

  function listarOrdenes(estado = null) {
    return estado ? state.ordenesTaller.filter(o => o.estado === estado) : state.ordenesTaller.slice();
  }

  // ──────────────────────────────────────────────────────────────
  // Alquiler
  // ──────────────────────────────────────────────────────────────

  function cotizarAlquiler(tipo, periodo) {
    const tarifa = TARIFAS_ALQUILER[periodo];
    if (!tarifa) throw new Error(`Periodo inválido: ${periodo}`);
    const precio = tarifa[tipo];
    if (precio == null) throw new Error(`Tipo no rentable: ${tipo}`);
    return precio;
  }

  function iniciarAlquiler({ cliente, sku, periodo, deposito = 500, identificacion }) {
    const bici = findModelo(sku);
    if (!bici) throw new Error(`Bici no encontrada: ${sku}`);
    if (bici.stock < 1) throw new Error('Sin unidades disponibles');
    if (!identificacion) throw new Error('Se requiere identificación del cliente');

    const precio = cotizarAlquiler(bici.tipo, periodo);
    bici.stock -= 1;

    const alq = {
      id: `AL-${++state.seqAlquiler}`,
      fechaInicio: nowISO(),
      fechaFin: null,
      cliente,
      identificacion,
      sku: bici.sku,
      modelo: bici.nombre,
      periodo,
      precio,
      deposito,
      estado: 'activo'
    };
    state.alquileres.push(alq);
    return alq;
  }

  function cerrarAlquiler(id, { danios = 0, cargosExtra = 0 } = {}) {
    const a = state.alquileres.find(x => x.id === id);
    if (!a) throw new Error(`Alquiler no encontrado: ${id}`);
    if (a.estado !== 'activo') throw new Error('Alquiler ya cerrado');

    const bici = findModelo(a.sku);
    if (bici) bici.stock += 1;

    a.fechaFin = nowISO();
    a.danios = danios;
    a.cargosExtra = cargosExtra;
    a.devolucionDeposito = round2(Math.max(0, a.deposito - danios - cargosExtra));
    a.totalCobrado = round2(a.precio + danios + cargosExtra);
    a.estado = 'cerrado';
    return a;
  }

  function listarAlquileres(estado = null) {
    return estado ? state.alquileres.filter(a => a.estado === estado) : state.alquileres.slice();
  }

  // ──────────────────────────────────────────────────────────────
  // Reportes
  // ──────────────────────────────────────────────────────────────

  function reporteDelDia(fecha = new Date()) {
    const dia = fecha.toISOString().slice(0, 10);
    const dentro = iso => iso && iso.slice(0, 10) === dia;

    const ventas = state.ventas.filter(v => dentro(v.fecha));
    const ordenes = state.ordenesTaller.filter(o => dentro(o.fechaApertura));
    const alquileres = state.alquileres.filter(a => dentro(a.fechaInicio));

    const totalVentas = ventas.reduce((a, v) => a + v.total, 0);
    const totalTaller = ordenes.reduce((a, o) => a + o.total, 0);
    const totalAlquiler = alquileres.reduce((a, x) => a + x.precio, 0);

    return {
      fecha: dia,
      ventas:     { cantidad: ventas.length,     total: round2(totalVentas) },
      taller:     { cantidad: ordenes.length,    total: round2(totalTaller) },
      alquiler:   { cantidad: alquileres.length, total: round2(totalAlquiler) },
      totalGeneral: round2(totalVentas + totalTaller + totalAlquiler)
    };
  }

  function stockBajo(umbral = 5) {
    return [
      ...CATALOGO_MODELOS.filter(m => m.stock <= umbral),
      ...CATALOGO_REFACCIONES.filter(r => r.stock <= umbral)
    ];
  }

  // ──────────────────────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────────────────────

  global.BicicletasAPI = {
    // constantes
    TIPOS_BICI, TALLAS, RODADAS,
    // catálogo
    catalogoModelos:     () => CATALOGO_MODELOS.slice(),
    catalogoRefacciones: () => CATALOGO_REFACCIONES.slice(),
    serviciosTaller:     () => SERVICIOS_TALLER.slice(),
    tarifasAlquiler:     () => JSON.parse(JSON.stringify(TARIFAS_ALQUILER)),
    buscarModelos,
    buscarRefacciones,
    // ventas
    nuevaVenta,
    listarVentas,
    // taller
    abrirOrdenTaller,
    actualizarOrden,
    listarOrdenes,
    // alquiler
    cotizarAlquiler,
    iniciarAlquiler,
    cerrarAlquiler,
    listarAlquileres,
    // reportes
    reporteDelDia,
    stockBajo,
    // versión
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : globalThis);
