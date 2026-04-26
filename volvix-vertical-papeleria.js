/**
 * VOLVIX VERTICAL — PAPELERIA
 * POS especializado para papelerias: utiles escolares, copias, impresiones,
 * encuadernado y servicio de escaneo.
 *
 * Expone window.PapeleriaAPI con metodos para gestionar catalogo, servicios,
 * carrito, ordenes y reportes basicos del dia.
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CATALOGO BASE — UTILES ESCOLARES Y OFICINA
  // ─────────────────────────────────────────────────────────────────────────
  const CATALOGO_UTILES = [
    { sku: 'LAP-001', nombre: 'Lapiz HB Mirado #2',           categoria: 'escritura',   precio:  3.50, stock: 200, unidad: 'pieza' },
    { sku: 'LAP-002', nombre: 'Lapiz adhesivo Pritt 22g',     categoria: 'adhesivos',   precio: 28.00, stock:  60, unidad: 'pieza' },
    { sku: 'BOL-001', nombre: 'Boligrafo BIC azul',           categoria: 'escritura',   precio:  6.00, stock: 250, unidad: 'pieza' },
    { sku: 'BOL-002', nombre: 'Boligrafo BIC negro',          categoria: 'escritura',   precio:  6.00, stock: 250, unidad: 'pieza' },
    { sku: 'BOL-003', nombre: 'Boligrafo BIC rojo',           categoria: 'escritura',   precio:  6.00, stock: 120, unidad: 'pieza' },
    { sku: 'MAR-001', nombre: 'Marcatextos Stabilo amarillo', categoria: 'escritura',   precio: 22.00, stock:  80, unidad: 'pieza' },
    { sku: 'MAR-002', nombre: 'Marcador Sharpie negro',       categoria: 'escritura',   precio: 35.00, stock:  60, unidad: 'pieza' },
    { sku: 'CUA-001', nombre: 'Cuaderno profesional 100h',    categoria: 'cuadernos',   precio: 45.00, stock: 150, unidad: 'pieza' },
    { sku: 'CUA-002', nombre: 'Cuaderno italiano 100h',       categoria: 'cuadernos',   precio: 38.00, stock: 120, unidad: 'pieza' },
    { sku: 'CUA-003', nombre: 'Libreta forma frances 50h',    categoria: 'cuadernos',   precio: 22.00, stock: 200, unidad: 'pieza' },
    { sku: 'HOJ-001', nombre: 'Paquete hojas blancas carta',  categoria: 'papeleria',   precio: 95.00, stock:  40, unidad: 'paquete' },
    { sku: 'HOJ-002', nombre: 'Paquete hojas color carta',    categoria: 'papeleria',   precio:115.00, stock:  20, unidad: 'paquete' },
    { sku: 'HOJ-003', nombre: 'Hoja opalina blanca',          categoria: 'papeleria',   precio:  2.00, stock: 500, unidad: 'pieza' },
    { sku: 'CAR-001', nombre: 'Cartulina blanca',             categoria: 'papeleria',   precio: 12.00, stock: 100, unidad: 'pieza' },
    { sku: 'CAR-002', nombre: 'Cartulina de color',           categoria: 'papeleria',   precio: 14.00, stock: 100, unidad: 'pieza' },
    { sku: 'TIJ-001', nombre: 'Tijeras escolares Maped',      categoria: 'cortar',      precio: 32.00, stock:  50, unidad: 'pieza' },
    { sku: 'PEG-001', nombre: 'Pegamento liquido Resistol',   categoria: 'adhesivos',   precio: 18.00, stock:  80, unidad: 'pieza' },
    { sku: 'CIN-001', nombre: 'Cinta adhesiva Diurex',        categoria: 'adhesivos',   precio: 15.00, stock: 100, unidad: 'pieza' },
    { sku: 'CIN-002', nombre: 'Cinta canela paquete',         categoria: 'adhesivos',   precio: 22.00, stock:  60, unidad: 'pieza' },
    { sku: 'REG-001', nombre: 'Regla 30cm transparente',      categoria: 'medicion',    precio: 14.00, stock:  90, unidad: 'pieza' },
    { sku: 'REG-002', nombre: 'Juego geometrico Maped',       categoria: 'medicion',    precio: 65.00, stock:  40, unidad: 'pieza' },
    { sku: 'BOR-001', nombre: 'Borrador Pelikan blanco',      categoria: 'escritura',   precio:  6.00, stock: 200, unidad: 'pieza' },
    { sku: 'SAC-001', nombre: 'Sacapuntas metalico',          categoria: 'escritura',   precio:  8.00, stock: 150, unidad: 'pieza' },
    { sku: 'COL-001', nombre: 'Colores Prismacolor 24pz',     categoria: 'arte',        precio:185.00, stock:  30, unidad: 'caja' },
    { sku: 'COL-002', nombre: 'Crayolas 12pz',                categoria: 'arte',        precio: 42.00, stock:  60, unidad: 'caja' },
    { sku: 'PLU-001', nombre: 'Plumones escolares 12pz',      categoria: 'arte',        precio: 65.00, stock:  40, unidad: 'caja' },
    { sku: 'CAL-001', nombre: 'Calculadora cientifica Casio', categoria: 'electronica', precio:295.00, stock:  15, unidad: 'pieza' },
    { sku: 'CAL-002', nombre: 'Calculadora basica',           categoria: 'electronica', precio: 75.00, stock:  25, unidad: 'pieza' },
    { sku: 'FOL-001', nombre: 'Folder tamano carta',          categoria: 'archivo',     precio:  4.00, stock: 300, unidad: 'pieza' },
    { sku: 'FOL-002', nombre: 'Folder colgante',              categoria: 'archivo',     precio:  8.00, stock: 150, unidad: 'pieza' },
    { sku: 'CAP-001', nombre: 'Carpeta de argollas 1 pulgada',categoria: 'archivo',     precio: 65.00, stock:  40, unidad: 'pieza' },
    { sku: 'SOB-001', nombre: 'Sobre manila tamano carta',    categoria: 'archivo',     precio:  3.50, stock: 200, unidad: 'pieza' },
    { sku: 'CLI-001', nombre: 'Clips chicos caja 100pz',      categoria: 'archivo',     precio: 18.00, stock:  60, unidad: 'caja' },
    { sku: 'GRA-001', nombre: 'Grapas estandar caja',         categoria: 'archivo',     precio: 22.00, stock:  50, unidad: 'caja' },
    { sku: 'ENG-001', nombre: 'Engrapadora estandar',         categoria: 'oficina',     precio: 95.00, stock:  20, unidad: 'pieza' },
    { sku: 'PER-001', nombre: 'Perforadora 2 orificios',      categoria: 'oficina',     precio:115.00, stock:  15, unidad: 'pieza' }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // SERVICIOS — COPIAS, IMPRESIONES, ENCUADERNADO, ESCANEAR
  // ─────────────────────────────────────────────────────────────────────────
  const SERVICIOS = {
    copia_bn:        { codigo: 'SRV-COP-BN',  nombre: 'Copia blanco y negro',  precio: 0.50, unidad: 'hoja',     descripcion: 'Copia simple por hoja tamano carta u oficio' },
    copia_color:     { codigo: 'SRV-COP-CO',  nombre: 'Copia a color',         precio: 5.00, unidad: 'hoja',     descripcion: 'Copia a color por hoja tamano carta' },
    impresion_bn:    { codigo: 'SRV-IMP-BN',  nombre: 'Impresion blanco y negro', precio: 1.00, unidad: 'hoja',  descripcion: 'Impresion desde USB / correo, B/N' },
    impresion_color: { codigo: 'SRV-IMP-CO',  nombre: 'Impresion a color',     precio: 7.00, unidad: 'hoja',     descripcion: 'Impresion desde USB / correo, color' },
    impresion_foto:  { codigo: 'SRV-IMP-FO',  nombre: 'Impresion fotografica', precio:15.00, unidad: 'hoja',     descripcion: 'Impresion en papel fotografico' },
    escaneo:         { codigo: 'SRV-ESC',     nombre: 'Escaneo digital',       precio: 3.00, unidad: 'hoja',     descripcion: 'Escaneo a USB, correo o WhatsApp' },
    enc_engargolado: { codigo: 'SRV-ENC-EG',  nombre: 'Engargolado',           precio:35.00, unidad: 'trabajo',  descripcion: 'Engargolado plastico hasta 100 hojas' },
    enc_engargolado_g:{codigo: 'SRV-ENC-EGG', nombre: 'Engargolado grande',    precio:55.00, unidad: 'trabajo',  descripcion: 'Engargolado plastico mas de 100 hojas' },
    enc_termico:     { codigo: 'SRV-ENC-TE',  nombre: 'Encuadernado termico',  precio:45.00, unidad: 'trabajo',  descripcion: 'Encuadernado termico con pasta' },
    enc_espiral:     { codigo: 'SRV-ENC-ES',  nombre: 'Encuadernado en espiral', precio:50.00, unidad: 'trabajo', descripcion: 'Espiral metalico' },
    laminado_carta:  { codigo: 'SRV-LAM-CA',  nombre: 'Laminado tamano carta', precio:18.00, unidad: 'hoja',     descripcion: 'Plastificado / enmicado tamano carta' },
    laminado_credencial:{codigo:'SRV-LAM-CR', nombre: 'Laminado credencial',   precio: 8.00, unidad: 'pieza',    descripcion: 'Plastificado tamano credencial' },
    fax:             { codigo: 'SRV-FAX',     nombre: 'Envio de fax',          precio: 8.00, unidad: 'hoja',     descripcion: 'Envio de fax nacional' }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ESTADO INTERNO
  // ─────────────────────────────────────────────────────────────────────────
  const estado = {
    catalogo: CATALOGO_UTILES.slice(),
    servicios: Object.assign({}, SERVICIOS),
    carrito: [],
    ordenes: [],
    contadorOrden: 1000,
    iva: 0.16
  };

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────────────────────────────────
  function dineroMx(n) {
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }

  function nuevoFolio() {
    estado.contadorOrden += 1;
    return 'PAP-' + estado.contadorOrden;
  }

  function buscarProducto(sku) {
    return estado.catalogo.find(p => p.sku === sku) || null;
  }

  function buscarServicio(key) {
    return estado.servicios[key] || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CATALOGO — CRUD
  // ─────────────────────────────────────────────────────────────────────────
  function listarProductos(filtro) {
    if (!filtro) return estado.catalogo.slice();
    const q = String(filtro).toLowerCase();
    return estado.catalogo.filter(p =>
      p.sku.toLowerCase().includes(q) ||
      p.nombre.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q)
    );
  }

  function listarPorCategoria(cat) {
    return estado.catalogo.filter(p => p.categoria === cat);
  }

  function categorias() {
    return Array.from(new Set(estado.catalogo.map(p => p.categoria))).sort();
  }

  function altaProducto(prod) {
    if (!prod || !prod.sku || !prod.nombre) throw new Error('SKU y nombre requeridos');
    if (buscarProducto(prod.sku)) throw new Error('SKU ya existe: ' + prod.sku);
    const nuevo = Object.assign(
      { categoria: 'general', precio: 0, stock: 0, unidad: 'pieza' },
      prod
    );
    estado.catalogo.push(nuevo);
    return nuevo;
  }

  function actualizarProducto(sku, cambios) {
    const p = buscarProducto(sku);
    if (!p) throw new Error('SKU no encontrado: ' + sku);
    Object.assign(p, cambios);
    return p;
  }

  function ajustarStock(sku, delta) {
    const p = buscarProducto(sku);
    if (!p) throw new Error('SKU no encontrado: ' + sku);
    p.stock += delta;
    if (p.stock < 0) p.stock = 0;
    return p;
  }

  function bajoStock(umbral) {
    const u = typeof umbral === 'number' ? umbral : 10;
    return estado.catalogo.filter(p => p.stock <= u);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CARRITO
  // ─────────────────────────────────────────────────────────────────────────
  function agregarProducto(sku, cantidad) {
    const p = buscarProducto(sku);
    if (!p) throw new Error('Producto no encontrado: ' + sku);
    const cant = cantidad > 0 ? cantidad : 1;
    if (p.stock < cant) throw new Error('Stock insuficiente para ' + p.nombre);
    estado.carrito.push({
      tipo: 'producto',
      sku: p.sku,
      nombre: p.nombre,
      precio: p.precio,
      cantidad: cant,
      subtotal: p.precio * cant
    });
    return estado.carrito[estado.carrito.length - 1];
  }

  function agregarServicio(key, cantidad, opciones) {
    const s = buscarServicio(key);
    if (!s) throw new Error('Servicio no encontrado: ' + key);
    const cant = cantidad > 0 ? cantidad : 1;
    const item = {
      tipo: 'servicio',
      codigo: s.codigo,
      nombre: s.nombre,
      precio: s.precio,
      cantidad: cant,
      unidad: s.unidad,
      subtotal: s.precio * cant,
      notas: (opciones && opciones.notas) || ''
    };
    estado.carrito.push(item);
    return item;
  }

  // Atajos para servicios mas comunes
  function copiarBN(hojas)   { return agregarServicio('copia_bn', hojas); }
  function copiarColor(hojas){ return agregarServicio('copia_color', hojas); }
  function imprimirBN(hojas) { return agregarServicio('impresion_bn', hojas); }
  function imprimirColor(hojas){ return agregarServicio('impresion_color', hojas); }
  function escanear(hojas)   { return agregarServicio('escaneo', hojas); }
  function engargolar(opcion){
    const key = opcion === 'grande' ? 'enc_engargolado_g' : 'enc_engargolado';
    return agregarServicio(key, 1);
  }

  function quitarItem(indice) {
    if (indice < 0 || indice >= estado.carrito.length) throw new Error('Indice invalido');
    return estado.carrito.splice(indice, 1)[0];
  }

  function limpiarCarrito() {
    estado.carrito.length = 0;
  }

  function verCarrito() {
    return estado.carrito.slice();
  }

  function totales() {
    const subtotal = estado.carrito.reduce((acc, it) => acc + it.subtotal, 0);
    const iva = subtotal * estado.iva;
    const total = subtotal + iva;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
      items: estado.carrito.length
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COBRO
  // ─────────────────────────────────────────────────────────────────────────
  function cobrar(metodoPago, recibido) {
    if (estado.carrito.length === 0) throw new Error('Carrito vacio');
    const t = totales();
    const metodo = metodoPago || 'efectivo';
    const pagoRecibido = recibido != null ? recibido : t.total;
    if (metodo === 'efectivo' && pagoRecibido < t.total) {
      throw new Error('Efectivo insuficiente. Falta ' + dineroMx(t.total - pagoRecibido));
    }
    // Descontar stock de productos
    estado.carrito.forEach(it => {
      if (it.tipo === 'producto') {
        const p = buscarProducto(it.sku);
        if (p) p.stock = Math.max(0, p.stock - it.cantidad);
      }
    });
    const orden = {
      folio: nuevoFolio(),
      fecha: new Date().toISOString(),
      items: estado.carrito.slice(),
      subtotal: t.subtotal,
      iva: t.iva,
      total: t.total,
      metodoPago: metodo,
      recibido: pagoRecibido,
      cambio: Math.max(0, Math.round((pagoRecibido - t.total) * 100) / 100)
    };
    estado.ordenes.push(orden);
    limpiarCarrito();
    return orden;
  }

  function ticketTexto(orden) {
    if (!orden) throw new Error('Orden requerida');
    const sep = '----------------------------------------';
    const lineas = [];
    lineas.push('       PAPELERIA VOLVIX');
    lineas.push('   Ticket: ' + orden.folio);
    lineas.push('   Fecha:  ' + orden.fecha);
    lineas.push(sep);
    orden.items.forEach(it => {
      lineas.push(it.cantidad + ' x ' + it.nombre);
      lineas.push('     ' + dineroMx(it.precio) + '   = ' + dineroMx(it.subtotal));
    });
    lineas.push(sep);
    lineas.push('Subtotal: ' + dineroMx(orden.subtotal));
    lineas.push('IVA 16%:  ' + dineroMx(orden.iva));
    lineas.push('TOTAL:    ' + dineroMx(orden.total));
    lineas.push('Pago (' + orden.metodoPago + '): ' + dineroMx(orden.recibido));
    lineas.push('Cambio:   ' + dineroMx(orden.cambio));
    lineas.push(sep);
    lineas.push('   Gracias por su compra!');
    return lineas.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTES
  // ─────────────────────────────────────────────────────────────────────────
  function ordenesDelDia(fecha) {
    const ref = (fecha ? new Date(fecha) : new Date()).toISOString().slice(0, 10);
    return estado.ordenes.filter(o => o.fecha.slice(0, 10) === ref);
  }

  function resumenDelDia(fecha) {
    const lista = ordenesDelDia(fecha);
    const total = lista.reduce((a, o) => a + o.total, 0);
    const porMetodo = {};
    lista.forEach(o => {
      porMetodo[o.metodoPago] = (porMetodo[o.metodoPago] || 0) + o.total;
    });
    const productosVendidos = {};
    const serviciosVendidos = {};
    lista.forEach(o => o.items.forEach(it => {
      const dest = it.tipo === 'producto' ? productosVendidos : serviciosVendidos;
      const key = it.sku || it.codigo;
      dest[key] = (dest[key] || 0) + it.cantidad;
    }));
    return {
      fecha: (fecha ? new Date(fecha) : new Date()).toISOString().slice(0, 10),
      ordenes: lista.length,
      total: Math.round(total * 100) / 100,
      porMetodo: porMetodo,
      productosVendidos: productosVendidos,
      serviciosVendidos: serviciosVendidos
    };
  }

  function topVendidos(n) {
    const limite = n > 0 ? n : 5;
    const conteo = {};
    estado.ordenes.forEach(o => o.items.forEach(it => {
      const key = it.nombre;
      conteo[key] = (conteo[key] || 0) + it.cantidad;
    }));
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite)
      .map(([nombre, cantidad]) => ({ nombre: nombre, cantidad: cantidad }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API PUBLICA
  // ─────────────────────────────────────────────────────────────────────────
  global.PapeleriaAPI = {
    version: '1.0.0',
    // Catalogo
    listarProductos: listarProductos,
    listarPorCategoria: listarPorCategoria,
    categorias: categorias,
    buscarProducto: buscarProducto,
    altaProducto: altaProducto,
    actualizarProducto: actualizarProducto,
    ajustarStock: ajustarStock,
    bajoStock: bajoStock,
    // Servicios
    listarServicios: function () { return Object.assign({}, estado.servicios); },
    buscarServicio: buscarServicio,
    // Carrito
    agregarProducto: agregarProducto,
    agregarServicio: agregarServicio,
    copiarBN: copiarBN,
    copiarColor: copiarColor,
    imprimirBN: imprimirBN,
    imprimirColor: imprimirColor,
    escanear: escanear,
    engargolar: engargolar,
    quitarItem: quitarItem,
    limpiarCarrito: limpiarCarrito,
    verCarrito: verCarrito,
    totales: totales,
    // Cobro
    cobrar: cobrar,
    ticketTexto: ticketTexto,
    // Reportes
    ordenesDelDia: ordenesDelDia,
    resumenDelDia: resumenDelDia,
    topVendidos: topVendidos,
    // Estado (solo lectura segura)
    _estado: function () {
      return {
        productos: estado.catalogo.length,
        servicios: Object.keys(estado.servicios).length,
        carrito: estado.carrito.length,
        ordenes: estado.ordenes.length
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PapeleriaAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
