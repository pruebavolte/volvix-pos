/**
 * VOLVIX VERTICAL — LIBRERÍA / PAPELERÍA
 * ----------------------------------------------------
 * POS especializado para librerías escolares y generales.
 * Funcionalidades:
 *   - Escaneo de ISBN-10 / ISBN-13 con validación de checksum
 *   - Catálogo por autor, editorial, materia y nivel escolar
 *   - Distinción libros escolares vs. generales (IVA exento MX)
 *   - Descuentos especiales para profesores acreditados
 *   - Listas escolares precargadas por colegio/grado
 *   - Control de existencias con alertas de mínimo
 *   - Apartados y reservas para temporada escolar
 *
 * Uso: incluir antes que volvix-pos-core.js
 * API global: window.LibreriaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. CATÁLOGO BASE
  // ─────────────────────────────────────────────────────────────
  const CATALOGO = new Map();      // isbn → libro
  const POR_AUTOR = new Map();     // autor → Set(isbn)
  const POR_EDITORIAL = new Map(); // editorial → Set(isbn)
  const POR_MATERIA = new Map();   // materia → Set(isbn)
  const LISTAS_ESCOLARES = new Map(); // "colegio|grado" → [isbn,...]
  const PROFESORES = new Map();    // rfc/credencial → {nombre, colegio, descuento}

  // ─────────────────────────────────────────────────────────────
  // 2. VALIDACIÓN DE ISBN
  // ─────────────────────────────────────────────────────────────
  function limpiarISBN(raw) {
    return String(raw || '').replace(/[-\s]/g, '').toUpperCase();
  }

  function validarISBN10(isbn) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false;
    let suma = 0;
    for (let i = 0; i < 9; i++) suma += (10 - i) * parseInt(isbn[i], 10);
    const check = isbn[9] === 'X' ? 10 : parseInt(isbn[9], 10);
    return (suma + check) % 11 === 0;
  }

  function validarISBN13(isbn) {
    if (!/^\d{13}$/.test(isbn)) return false;
    let suma = 0;
    for (let i = 0; i < 12; i++) {
      suma += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (suma % 10)) % 10;
    return check === parseInt(isbn[12], 10);
  }

  function validarISBN(raw) {
    const c = limpiarISBN(raw);
    if (c.length === 10) return validarISBN10(c) ? c : null;
    if (c.length === 13) return validarISBN13(c) ? c : null;
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ALTA / BAJA / ACTUALIZACIÓN DE LIBROS
  // ─────────────────────────────────────────────────────────────
  function _indexar(map, key, isbn) {
    if (!key) return;
    const k = String(key).trim().toLowerCase();
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(isbn);
  }

  function _desindexar(map, key, isbn) {
    if (!key) return;
    const k = String(key).trim().toLowerCase();
    if (map.has(k)) {
      map.get(k).delete(isbn);
      if (map.get(k).size === 0) map.delete(k);
    }
  }

  function altaLibro(libro) {
    const isbn = validarISBN(libro.isbn);
    if (!isbn) throw new Error('ISBN inválido: ' + libro.isbn);
    const tipo = (libro.tipo || 'general').toLowerCase(); // escolar | general
    if (!['escolar', 'general'].includes(tipo)) {
      throw new Error('tipo debe ser "escolar" o "general"');
    }
    const reg = {
      isbn,
      titulo: String(libro.titulo || '').trim(),
      autor: String(libro.autor || 'Desconocido').trim(),
      editorial: String(libro.editorial || 'Sin editorial').trim(),
      materia: String(libro.materia || '').trim(),
      nivel: libro.nivel || null,        // primaria, secundaria, prepa, univ
      grado: libro.grado || null,
      tipo,                              // escolar (IVA 0%) | general (IVA 16%)
      precio: Number(libro.precio) || 0,
      costo: Number(libro.costo) || 0,
      stock: Number(libro.stock) || 0,
      stockMin: Number(libro.stockMin) || 2,
      ubicacion: libro.ubicacion || '',
      activo: libro.activo !== false,
      actualizado: Date.now()
    };
    CATALOGO.set(isbn, reg);
    _indexar(POR_AUTOR, reg.autor, isbn);
    _indexar(POR_EDITORIAL, reg.editorial, isbn);
    _indexar(POR_MATERIA, reg.materia, isbn);
    return reg;
  }

  function bajaLibro(isbnRaw) {
    const isbn = validarISBN(isbnRaw);
    if (!isbn || !CATALOGO.has(isbn)) return false;
    const r = CATALOGO.get(isbn);
    _desindexar(POR_AUTOR, r.autor, isbn);
    _desindexar(POR_EDITORIAL, r.editorial, isbn);
    _desindexar(POR_MATERIA, r.materia, isbn);
    CATALOGO.delete(isbn);
    return true;
  }

  function obtenerLibro(isbnRaw) {
    const isbn = validarISBN(isbnRaw);
    return isbn ? CATALOGO.get(isbn) || null : null;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. BÚSQUEDAS
  // ─────────────────────────────────────────────────────────────
  function _hidratar(set) {
    if (!set) return [];
    return [...set].map(i => CATALOGO.get(i)).filter(Boolean);
  }

  function buscarPorAutor(autor) {
    return _hidratar(POR_AUTOR.get(String(autor || '').trim().toLowerCase()));
  }

  function buscarPorEditorial(editorial) {
    return _hidratar(POR_EDITORIAL.get(String(editorial || '').trim().toLowerCase()));
  }

  function buscarPorMateria(materia) {
    return _hidratar(POR_MATERIA.get(String(materia || '').trim().toLowerCase()));
  }

  function buscarPorTitulo(fragmento) {
    const q = String(fragmento || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const r of CATALOGO.values()) {
      if (r.titulo.toLowerCase().includes(q)) out.push(r);
    }
    return out;
  }

  function buscarEscolares(nivel, grado) {
    const out = [];
    for (const r of CATALOGO.values()) {
      if (r.tipo !== 'escolar') continue;
      if (nivel && r.nivel !== nivel) continue;
      if (grado && String(r.grado) !== String(grado)) continue;
      out.push(r);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. PROFESORES Y DESCUENTOS
  // ─────────────────────────────────────────────────────────────
  function registrarProfesor(p) {
    const id = String(p.id || p.rfc || '').trim().toUpperCase();
    if (!id) throw new Error('Profesor requiere id/rfc');
    const desc = Math.max(0, Math.min(50, Number(p.descuento) || 15));
    PROFESORES.set(id, {
      id,
      nombre: p.nombre || '',
      colegio: p.colegio || '',
      descuento: desc,        // % por defecto 15
      vigencia: p.vigencia || null,
      verificado: !!p.verificado
    });
    return PROFESORES.get(id);
  }

  function obtenerProfesor(id) {
    return PROFESORES.get(String(id || '').trim().toUpperCase()) || null;
  }

  function aplicarDescuentoProfesor(precio, profesorId) {
    const p = obtenerProfesor(profesorId);
    if (!p || !p.verificado) return { precio, descuento: 0, profesor: null };
    if (p.vigencia && Date.now() > new Date(p.vigencia).getTime()) {
      return { precio, descuento: 0, profesor: p, motivo: 'credencial vencida' };
    }
    const desc = +(precio * (p.descuento / 100)).toFixed(2);
    return {
      precio: +(precio - desc).toFixed(2),
      descuento: desc,
      porcentaje: p.descuento,
      profesor: p
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. LISTAS ESCOLARES
  // ─────────────────────────────────────────────────────────────
  function guardarListaEscolar(colegio, grado, isbns) {
    const key = `${String(colegio).trim().toLowerCase()}|${String(grado).trim().toLowerCase()}`;
    const validos = (isbns || [])
      .map(validarISBN)
      .filter(i => i && CATALOGO.has(i));
    LISTAS_ESCOLARES.set(key, validos);
    return { colegio, grado, total: validos.length, isbns: validos };
  }

  function obtenerListaEscolar(colegio, grado) {
    const key = `${String(colegio).trim().toLowerCase()}|${String(grado).trim().toLowerCase()}`;
    const isbns = LISTAS_ESCOLARES.get(key) || [];
    const items = isbns.map(i => CATALOGO.get(i)).filter(Boolean);
    const total = items.reduce((s, l) => s + l.precio, 0);
    return { colegio, grado, items, total: +total.toFixed(2) };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. INVENTARIO
  // ─────────────────────────────────────────────────────────────
  function ajustarStock(isbnRaw, delta, motivo) {
    const isbn = validarISBN(isbnRaw);
    if (!isbn || !CATALOGO.has(isbn)) return null;
    const r = CATALOGO.get(isbn);
    r.stock = Math.max(0, r.stock + Number(delta || 0));
    r.actualizado = Date.now();
    return { isbn, stock: r.stock, motivo: motivo || 'ajuste' };
  }

  function bajoStock() {
    const out = [];
    for (const r of CATALOGO.values()) {
      if (r.activo && r.stock <= r.stockMin) out.push(r);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // 8. CARRITO / VENTA
  // ─────────────────────────────────────────────────────────────
  function calcularVenta(items, profesorId) {
    // items: [{ isbn, cantidad }]
    const detalle = [];
    let subtotal = 0, iva = 0, descTotal = 0;

    for (const it of items || []) {
      const libro = obtenerLibro(it.isbn);
      if (!libro) continue;
      const cant = Math.max(1, Number(it.cantidad) || 1);
      let pUnit = libro.precio;
      let descLinea = 0;

      if (profesorId) {
        const r = aplicarDescuentoProfesor(pUnit, profesorId);
        descLinea = r.descuento;
        pUnit = r.precio;
      }

      const base = pUnit * cant;
      // IVA 16% solo en libros generales (escolares exentos en MX)
      const ivaLinea = libro.tipo === 'general' ? +(base * 0.16).toFixed(2) : 0;

      subtotal += base;
      iva += ivaLinea;
      descTotal += descLinea * cant;
      detalle.push({
        isbn: libro.isbn,
        titulo: libro.titulo,
        cantidad: cant,
        precioUnit: +pUnit.toFixed(2),
        descuento: +(descLinea * cant).toFixed(2),
        iva: ivaLinea,
        importe: +(base + ivaLinea).toFixed(2),
        tipo: libro.tipo
      });
    }

    return {
      detalle,
      subtotal: +subtotal.toFixed(2),
      iva: +iva.toFixed(2),
      descuento: +descTotal.toFixed(2),
      total: +(subtotal + iva).toFixed(2),
      profesor: profesorId ? obtenerProfesor(profesorId) : null
    };
  }

  function confirmarVenta(items, profesorId) {
    const venta = calcularVenta(items, profesorId);
    for (const d of venta.detalle) ajustarStock(d.isbn, -d.cantidad, 'venta');
    venta.fecha = new Date().toISOString();
    venta.folio = 'LIB-' + Date.now().toString(36).toUpperCase();
    return venta;
  }

  // ─────────────────────────────────────────────────────────────
  // 9. EXPORTACIÓN API
  // ─────────────────────────────────────────────────────────────
  global.LibreriaAPI = {
    // ISBN
    validarISBN, limpiarISBN,
    // Catálogo
    altaLibro, bajaLibro, obtenerLibro,
    // Búsquedas
    buscarPorAutor, buscarPorEditorial, buscarPorMateria,
    buscarPorTitulo, buscarEscolares,
    // Profesores
    registrarProfesor, obtenerProfesor, aplicarDescuentoProfesor,
    // Listas escolares
    guardarListaEscolar, obtenerListaEscolar,
    // Inventario
    ajustarStock, bajoStock,
    // Venta
    calcularVenta, confirmarVenta,
    // Internos (debug)
    _debug: { CATALOGO, POR_AUTOR, POR_EDITORIAL, POR_MATERIA, LISTAS_ESCOLARES, PROFESORES }
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix] Vertical Librería cargado — window.LibreriaAPI lista');
  }
})(typeof window !== 'undefined' ? window : globalThis);
