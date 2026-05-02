/* ============================================================================
 * VOLVIX VERTICAL — CINE
 * POS especializado para complejos de cine: salas, asientos, horarios,
 * dulcería (combos y snacks), entradas y reportes de taquilla.
 *
 * Expone: window.CineAPI
 * ========================================================================== */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const nowISO = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmtMoney = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const pad2 = (n) => String(n).padStart(2, '0');

  function emit(type, payload) {
    try {
      const ev = new CustomEvent(`cine:${type}`, { detail: payload });
      (global.dispatchEvent || (() => {}))(ev);
    } catch (_) { /* no-op fuera del DOM */ }
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------
  const STATE = {
    cine: { nombre: 'Volvix Cine', sucursal: 'Centro', moneda: 'MXN' },
    salas: [],          // {id, nombre, filas, columnas, tipo}
    peliculas: [],      // {id, titulo, duracion, clasificacion, idioma, formato}
    funciones: [],      // {id, peliculaId, salaId, fecha, hora, precioBase, asientosOcupados:[]}
    snacks: [],         // {id, nombre, categoria, precio, stock}
    combos: [],         // {id, nombre, items:[{snackId, qty}], precio}
    boletos: [],        // {id, funcionId, asiento, precio, fecha}
    ordenes: [],        // {id, items, total, fecha, tipo:'taquilla'|'dulceria'|'mixta'}
    config: { ivaIncluido: true, descuentoMartes: 0.5 }
  };

  // -------------------------------------------------------------------------
  // Salas
  // -------------------------------------------------------------------------
  function crearSala({ nombre, filas = 8, columnas = 12, tipo = '2D' }) {
    if (!nombre) throw new Error('crearSala: nombre requerido');
    const sala = { id: uid('sala'), nombre, filas, columnas, tipo, capacidad: filas * columnas };
    STATE.salas.push(sala);
    emit('sala:creada', sala);
    return sala;
  }

  function listarSalas() { return clone(STATE.salas); }

  function generarMapaAsientos(salaId, funcionId) {
    const sala = STATE.salas.find(s => s.id === salaId);
    if (!sala) throw new Error('Sala no encontrada');
    const funcion = funcionId ? STATE.funciones.find(f => f.id === funcionId) : null;
    const ocupados = funcion ? funcion.asientosOcupados : [];
    const mapa = [];
    for (let r = 0; r < sala.filas; r++) {
      const fila = [];
      const letra = String.fromCharCode(65 + r);
      for (let c = 1; c <= sala.columnas; c++) {
        const cod = `${letra}${pad2(c)}`;
        fila.push({ codigo: cod, ocupado: ocupados.includes(cod) });
      }
      mapa.push(fila);
    }
    return mapa;
  }

  // -------------------------------------------------------------------------
  // Películas
  // -------------------------------------------------------------------------
  function registrarPelicula({ titulo, duracion = 120, clasificacion = 'B', idioma = 'ESP', formato = '2D' }) {
    if (!titulo) throw new Error('registrarPelicula: titulo requerido');
    const peli = { id: uid('peli'), titulo, duracion, clasificacion, idioma, formato };
    STATE.peliculas.push(peli);
    emit('pelicula:registrada', peli);
    return peli;
  }

  function listarPeliculas() { return clone(STATE.peliculas); }

  function buscarPelicula(query) {
    const q = String(query || '').toLowerCase();
    return STATE.peliculas.filter(p => p.titulo.toLowerCase().includes(q));
  }

  // -------------------------------------------------------------------------
  // Funciones / Horarios
  // -------------------------------------------------------------------------
  function programarFuncion({ peliculaId, salaId, fecha, hora, precioBase = 75 }) {
    if (!STATE.peliculas.find(p => p.id === peliculaId)) throw new Error('Película no existe');
    if (!STATE.salas.find(s => s.id === salaId)) throw new Error('Sala no existe');
    const f = {
      id: uid('fun'), peliculaId, salaId, fecha, hora, precioBase,
      asientosOcupados: [], creada: nowISO()
    };
    STATE.funciones.push(f);
    emit('funcion:programada', f);
    return f;
  }

  function listarFunciones(filtro = {}) {
    return STATE.funciones.filter(f => {
      if (filtro.fecha && f.fecha !== filtro.fecha) return false;
      if (filtro.peliculaId && f.peliculaId !== filtro.peliculaId) return false;
      if (filtro.salaId && f.salaId !== filtro.salaId) return false;
      return true;
    }).map(f => {
      const peli = STATE.peliculas.find(p => p.id === f.peliculaId);
      const sala = STATE.salas.find(s => s.id === f.salaId);
      return { ...clone(f), pelicula: peli && peli.titulo, sala: sala && sala.nombre };
    });
  }

  function cancelarFuncion(funcionId) {
    const idx = STATE.funciones.findIndex(f => f.id === funcionId);
    if (idx < 0) return false;
    const [eliminada] = STATE.funciones.splice(idx, 1);
    emit('funcion:cancelada', eliminada);
    return true;
  }

  // -------------------------------------------------------------------------
  // Boletos / Taquilla
  // -------------------------------------------------------------------------
  function calcularPrecioBoleto(funcion) {
    let p = funcion.precioBase;
    const dia = new Date(funcion.fecha + 'T00:00:00').getDay();
    if (dia === 2) p = p * (1 - STATE.config.descuentoMartes); // martes 50%
    return Number(p.toFixed(2));
  }

  function venderBoleto({ funcionId, asiento }) {
    const funcion = STATE.funciones.find(f => f.id === funcionId);
    if (!funcion) throw new Error('Función no existe');
    if (funcion.asientosOcupados.includes(asiento)) throw new Error(`Asiento ${asiento} ocupado`);
    funcion.asientosOcupados.push(asiento);
    const precio = calcularPrecioBoleto(funcion);
    const boleto = { id: uid('blt'), funcionId, asiento, precio, fecha: nowISO() };
    STATE.boletos.push(boleto);
    emit('boleto:vendido', boleto);
    return boleto;
  }

  function venderBoletosMultiples(funcionId, asientos = []) {
    return asientos.map(a => venderBoleto({ funcionId, asiento: a }));
  }

  function liberarAsiento(funcionId, asiento) {
    const funcion = STATE.funciones.find(f => f.id === funcionId);
    if (!funcion) return false;
    funcion.asientosOcupados = funcion.asientosOcupados.filter(a => a !== asiento);
    emit('asiento:liberado', { funcionId, asiento });
    return true;
  }

  // -------------------------------------------------------------------------
  // Dulcería: snacks y combos
  // -------------------------------------------------------------------------
  function registrarSnack({ nombre, categoria = 'snack', precio = 0, stock = 0 }) {
    const s = { id: uid('snk'), nombre, categoria, precio, stock };
    STATE.snacks.push(s);
    emit('snack:registrado', s);
    return s;
  }

  function listarSnacks(categoria) {
    return categoria
      ? STATE.snacks.filter(s => s.categoria === categoria)
      : clone(STATE.snacks);
  }

  function ajustarStock(snackId, delta) {
    const s = STATE.snacks.find(x => x.id === snackId);
    if (!s) throw new Error('Snack no encontrado');
    s.stock += delta;
    if (s.stock < 0) s.stock = 0;
    emit('snack:stock', { id: snackId, stock: s.stock });
    return s.stock;
  }

  function crearCombo({ nombre, items = [], precio }) {
    if (!items.length) throw new Error('crearCombo: items requeridos');
    items.forEach(it => {
      if (!STATE.snacks.find(s => s.id === it.snackId)) {
        throw new Error(`Snack ${it.snackId} no existe`);
      }
    });
    const c = { id: uid('cmb'), nombre, items, precio };
    STATE.combos.push(c);
    emit('combo:creado', c);
    return c;
  }

  function listarCombos() { return clone(STATE.combos); }

  function venderSnack(snackId, qty = 1) {
    const s = STATE.snacks.find(x => x.id === snackId);
    if (!s) throw new Error('Snack no existe');
    if (s.stock < qty) throw new Error(`Stock insuficiente de ${s.nombre}`);
    s.stock -= qty;
    return { snackId, nombre: s.nombre, qty, subtotal: s.precio * qty };
  }

  function venderCombo(comboId, qty = 1) {
    const c = STATE.combos.find(x => x.id === comboId);
    if (!c) throw new Error('Combo no existe');
    c.items.forEach(it => {
      const s = STATE.snacks.find(x => x.id === it.snackId);
      if (!s || s.stock < it.qty * qty) throw new Error(`Stock insuficiente para combo ${c.nombre}`);
    });
    c.items.forEach(it => {
      const s = STATE.snacks.find(x => x.id === it.snackId);
      s.stock -= it.qty * qty;
    });
    return { comboId, nombre: c.nombre, qty, subtotal: c.precio * qty };
  }

  // -------------------------------------------------------------------------
  // Órdenes mixtas (taquilla + dulcería)
  // -------------------------------------------------------------------------
  function crearOrden({ boletos = [], snacks = [], combos = [] }) {
    const items = [];
    let total = 0;

    boletos.forEach(b => {
      const blt = venderBoleto(b);
      items.push({ tipo: 'boleto', ref: blt.id, asiento: blt.asiento, precio: blt.precio });
      total += blt.precio;
    });
    snacks.forEach(({ snackId, qty }) => {
      const r = venderSnack(snackId, qty);
      items.push({ tipo: 'snack', ref: snackId, qty, subtotal: r.subtotal });
      total += r.subtotal;
    });
    combos.forEach(({ comboId, qty }) => {
      const r = venderCombo(comboId, qty);
      items.push({ tipo: 'combo', ref: comboId, qty, subtotal: r.subtotal });
      total += r.subtotal;
    });

    const tipo = boletos.length && (snacks.length || combos.length) ? 'mixta'
               : boletos.length ? 'taquilla' : 'dulceria';
    const orden = { id: uid('ord'), items, total: Number(total.toFixed(2)), fecha: nowISO(), tipo };
    STATE.ordenes.push(orden);
    emit('orden:creada', orden);
    return orden;
  }

  // -------------------------------------------------------------------------
  // Reportes
  // -------------------------------------------------------------------------
  function reporteTaquilla(fecha) {
    const blts = STATE.boletos.filter(b => !fecha || b.fecha.startsWith(fecha));
    const total = blts.reduce((a, b) => a + b.precio, 0);
    return { boletos: blts.length, ingresos: Number(total.toFixed(2)), fmt: fmtMoney(total) };
  }

  function reporteDulceria(fecha) {
    const ords = STATE.ordenes.filter(o =>
      (o.tipo === 'dulceria' || o.tipo === 'mixta') && (!fecha || o.fecha.startsWith(fecha))
    );
    let total = 0;
    ords.forEach(o => o.items.filter(i => i.tipo !== 'boleto').forEach(i => total += (i.subtotal || 0)));
    return { ordenes: ords.length, ingresos: Number(total.toFixed(2)), fmt: fmtMoney(total) };
  }

  function ocupacionFuncion(funcionId) {
    const f = STATE.funciones.find(x => x.id === funcionId);
    if (!f) return null;
    const sala = STATE.salas.find(s => s.id === f.salaId);
    const cap = sala ? sala.capacidad : 0;
    const ocup = f.asientosOcupados.length;
    return { capacidad: cap, ocupados: ocup, libres: cap - ocup, porcentaje: cap ? +(ocup / cap * 100).toFixed(1) : 0 };
  }

  function topPeliculas(limit = 5) {
    const conteo = {};
    STATE.boletos.forEach(b => {
      const f = STATE.funciones.find(x => x.id === b.funcionId);
      if (f) conteo[f.peliculaId] = (conteo[f.peliculaId] || 0) + 1;
    });
    return Object.entries(conteo)
      .map(([pid, n]) => {
        const p = STATE.peliculas.find(x => x.id === pid);
        return { pelicula: p ? p.titulo : pid, boletos: n };
      })
      .sort((a, b) => b.boletos - a.boletos)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Persistencia (localStorage si existe)
  // -------------------------------------------------------------------------
  const LS_KEY = 'volvix_cine_state';
  function guardar() {
    try { global.localStorage && global.localStorage.setItem(LS_KEY, JSON.stringify(STATE)); return true; }
    catch (e) { return false; }
  }
  function cargar() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(STATE, data);
      emit('estado:cargado', null);
      return true;
    } catch (e) { return false; }
  }
  function reset() {
    STATE.salas = []; STATE.peliculas = []; STATE.funciones = [];
    STATE.snacks = []; STATE.combos = []; STATE.boletos = []; STATE.ordenes = [];
    emit('estado:reset', null);
  }

  // -------------------------------------------------------------------------
  // Seed demo (datos de ejemplo)
  // -------------------------------------------------------------------------
  function seedDemo() {
    reset();
    const sala1 = crearSala({ nombre: 'Sala 1', filas: 8, columnas: 12, tipo: '2D' });
    const sala2 = crearSala({ nombre: 'Sala 2 IMAX', filas: 10, columnas: 16, tipo: 'IMAX' });
    const p1 = registrarPelicula({ titulo: 'Volvix: El Origen', duracion: 128, clasificacion: 'B', formato: '2D' });
    const p2 = registrarPelicula({ titulo: 'Cine Galáctico', duracion: 145, clasificacion: 'A', formato: 'IMAX' });
    programarFuncion({ peliculaId: p1.id, salaId: sala1.id, fecha: '2026-04-26', hora: '18:30', precioBase: 75 });
    programarFuncion({ peliculaId: p2.id, salaId: sala2.id, fecha: '2026-04-26', hora: '20:00', precioBase: 120 });
    const palo = registrarSnack({ nombre: 'Palomitas Grandes', categoria: 'palomitas', precio: 85, stock: 100 });
    const ref = registrarSnack({ nombre: 'Refresco 32oz', categoria: 'bebida', precio: 55, stock: 200 });
    const nach = registrarSnack({ nombre: 'Nachos', categoria: 'snack', precio: 70, stock: 50 });
    crearCombo({ nombre: 'Combo Pareja', items: [{ snackId: palo.id, qty: 1 }, { snackId: ref.id, qty: 2 }], precio: 175 });
    crearCombo({ nombre: 'Combo Nachos', items: [{ snackId: nach.id, qty: 1 }, { snackId: ref.id, qty: 1 }], precio: 110 });
    return { salas: STATE.salas.length, peliculas: STATE.peliculas.length, funciones: STATE.funciones.length };
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------
  const CineAPI = {
    // estado
    state: () => clone(STATE),
    config: STATE.config,
    guardar, cargar, reset, seedDemo,
    // salas
    crearSala, listarSalas, generarMapaAsientos,
    // peliculas
    registrarPelicula, listarPeliculas, buscarPelicula,
    // funciones
    programarFuncion, listarFunciones, cancelarFuncion,
    // boletos
    venderBoleto, venderBoletosMultiples, liberarAsiento, calcularPrecioBoleto,
    // dulceria
    registrarSnack, listarSnacks, ajustarStock,
    crearCombo, listarCombos, venderSnack, venderCombo,
    // ordenes
    crearOrden,
    // reportes
    reporteTaquilla, reporteDulceria, ocupacionFuncion, topPeliculas,
    // utils
    _fmtMoney: fmtMoney,
    version: '1.0.0'
  };

  global.CineAPI = CineAPI;
  emit('api:lista', { version: CineAPI.version });
})(typeof window !== 'undefined' ? window : globalThis);
