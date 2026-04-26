/**
 * Volvix POS - Vertical: Estética / Salón de Belleza
 * Servicios, agenda staff, comisiones, retail
 * Expone: window.EsteticaAPI
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_estetica_v1';
  const COMMISSION_DEFAULT = 0.30; // 30% para staff

  // ─────────────────────────────────────────────
  // Catálogo base de servicios
  // ─────────────────────────────────────────────
  const SERVICIOS_DEFAULT = [
    { id: 'srv-001', nombre: 'Corte Dama',         categoria: 'cabello',  duracion: 45, precio: 250, comision: 0.35 },
    { id: 'srv-002', nombre: 'Corte Caballero',    categoria: 'cabello',  duracion: 30, precio: 180, comision: 0.35 },
    { id: 'srv-003', nombre: 'Corte Niño',         categoria: 'cabello',  duracion: 25, precio: 130, comision: 0.30 },
    { id: 'srv-004', nombre: 'Tinte Completo',     categoria: 'color',    duracion: 90, precio: 850, comision: 0.40 },
    { id: 'srv-005', nombre: 'Mechas / Balayage',  categoria: 'color',    duracion: 150, precio: 1500, comision: 0.40 },
    { id: 'srv-006', nombre: 'Decoloración',       categoria: 'color',    duracion: 120, precio: 1200, comision: 0.40 },
    { id: 'srv-007', nombre: 'Manicure Clásico',   categoria: 'unas',     duracion: 40, precio: 180, comision: 0.45 },
    { id: 'srv-008', nombre: 'Manicure Gel',       categoria: 'unas',     duracion: 60, precio: 320, comision: 0.45 },
    { id: 'srv-009', nombre: 'Pedicure Spa',       categoria: 'unas',     duracion: 60, precio: 280, comision: 0.45 },
    { id: 'srv-010', nombre: 'Acrílicas',          categoria: 'unas',     duracion: 90, precio: 450, comision: 0.45 },
    { id: 'srv-011', nombre: 'Limpieza Facial',    categoria: 'facial',   duracion: 60, precio: 550, comision: 0.40 },
    { id: 'srv-012', nombre: 'Hidratación Facial', categoria: 'facial',   duracion: 45, precio: 480, comision: 0.40 },
    { id: 'srv-013', nombre: 'Peeling Químico',    categoria: 'facial',   duracion: 50, precio: 750, comision: 0.40 },
    { id: 'srv-014', nombre: 'Depilación Cera Pierna', categoria: 'depil', duracion: 40, precio: 350, comision: 0.40 },
    { id: 'srv-015', nombre: 'Depilación Cejas',   categoria: 'depil',    duracion: 15, precio: 90,  comision: 0.40 },
    { id: 'srv-016', nombre: 'Maquillaje Social',  categoria: 'makeup',   duracion: 60, precio: 600, comision: 0.50 },
    { id: 'srv-017', nombre: 'Maquillaje Novia',   categoria: 'makeup',   duracion: 90, precio: 1500, comision: 0.50 },
    { id: 'srv-018', nombre: 'Pestañas Postizas',  categoria: 'makeup',   duracion: 45, precio: 400, comision: 0.50 },
    { id: 'srv-019', nombre: 'Masaje Relajante',   categoria: 'spa',      duracion: 60, precio: 700, comision: 0.40 },
    { id: 'srv-020', nombre: 'Tratamiento Capilar',categoria: 'cabello',  duracion: 50, precio: 480, comision: 0.40 }
  ];

  // ─────────────────────────────────────────────
  // Productos retail (venta mostrador)
  // ─────────────────────────────────────────────
  const PRODUCTOS_DEFAULT = [
    { sku: 'P-SH01', nombre: 'Shampoo Profesional 500ml', precio: 320, costo: 180, stock: 24 },
    { sku: 'P-SH02', nombre: 'Acondicionador Reparador', precio: 340, costo: 190, stock: 20 },
    { sku: 'P-MS01', nombre: 'Mascarilla Capilar 250ml', precio: 280, costo: 140, stock: 18 },
    { sku: 'P-SE01', nombre: 'Sérum Anti-frizz',         precio: 420, costo: 230, stock: 12 },
    { sku: 'P-OL01', nombre: 'Aceite Argán 100ml',       precio: 380, costo: 200, stock: 15 },
    { sku: 'P-LC01', nombre: 'Laca Fijación Fuerte',     precio: 250, costo: 130, stock: 30 },
    { sku: 'P-ES01', nombre: 'Esmalte Gel UV',           precio: 180, costo: 80,  stock: 45 },
    { sku: 'P-CR01', nombre: 'Crema Facial Hidratante',  precio: 520, costo: 280, stock: 14 },
    { sku: 'P-CR02', nombre: 'Crema Manos Reparadora',   precio: 220, costo: 110, stock: 22 },
    { sku: 'P-PM01', nombre: 'Protector Térmico',        precio: 360, costo: 190, stock: 16 },
    { sku: 'P-TT01', nombre: 'Tinte Caja 60ml',          precio: 240, costo: 120, stock: 35 },
    { sku: 'P-PE01', nombre: 'Cepillo Profesional',      precio: 480, costo: 260, stock: 9 }
  ];

  // ─────────────────────────────────────────────
  // Staff
  // ─────────────────────────────────────────────
  const STAFF_DEFAULT = [
    { id: 'st-01', nombre: 'María López',     rol: 'Estilista Senior',   especialidad: ['cabello','color'], comision: 0.35, horario: '09:00-18:00' },
    { id: 'st-02', nombre: 'Ana Ramírez',     rol: 'Estilista',          especialidad: ['cabello'],         comision: 0.30, horario: '10:00-19:00' },
    { id: 'st-03', nombre: 'Sofía Martínez',  rol: 'Manicurista',        especialidad: ['unas'],            comision: 0.45, horario: '09:00-17:00' },
    { id: 'st-04', nombre: 'Laura Pérez',     rol: 'Esteticista',        especialidad: ['facial','depil'],  comision: 0.40, horario: '11:00-20:00' },
    { id: 'st-05', nombre: 'Jorge Hernández', rol: 'Barbero',            especialidad: ['cabello'],         comision: 0.35, horario: '10:00-19:00' },
    { id: 'st-06', nombre: 'Karen Díaz',      rol: 'Maquillista',        especialidad: ['makeup'],          comision: 0.50, horario: '12:00-21:00' },
    { id: 'st-07', nombre: 'Pablo Sánchez',   rol: 'Masajista',          especialidad: ['spa'],             comision: 0.40, horario: '11:00-19:00' }
  ];

  // ─────────────────────────────────────────────
  // Estado en memoria
  // ─────────────────────────────────────────────
  let state = {
    servicios: [...SERVICIOS_DEFAULT],
    productos: [...PRODUCTOS_DEFAULT],
    staff:     [...STAFF_DEFAULT],
    citas:     [],   // {id, clienteId, staffId, servicioId, fecha, hora, estado}
    clientes:  [],   // {id, nombre, tel, email, historial:[]}
    ventas:    [],   // {id, fecha, items:[], total, staffId, comision, tipo:'servicio'|'retail'}
    config:    { iva: 0.16, moneda: 'MXN', comisionDefault: COMMISSION_DEFAULT }
  };

  // ─────────────────────────────────────────────
  // Persistencia
  // ─────────────────────────────────────────────
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[Estetica] save fail:', e); }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(state, parsed);
      }
    } catch (e) { console.warn('[Estetica] load fail:', e); }
  }
  function reset() {
    state.citas = []; state.clientes = []; state.ventas = [];
    state.servicios = [...SERVICIOS_DEFAULT];
    state.productos = [...PRODUCTOS_DEFAULT];
    state.staff     = [...STAFF_DEFAULT];
    save();
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ─────────────────────────────────────────────
  // CRUD Servicios
  // ─────────────────────────────────────────────
  function listServicios(cat) {
    return cat ? state.servicios.filter(s => s.categoria === cat) : state.servicios.slice();
  }
  function addServicio(s) {
    const item = Object.assign({ id: uid('srv'), comision: COMMISSION_DEFAULT }, s);
    state.servicios.push(item); save(); return item;
  }
  function updateServicio(id, patch) {
    const i = state.servicios.findIndex(s => s.id === id);
    if (i < 0) return null;
    state.servicios[i] = Object.assign({}, state.servicios[i], patch);
    save(); return state.servicios[i];
  }
  function removeServicio(id) {
    state.servicios = state.servicios.filter(s => s.id !== id); save();
  }

  // ─────────────────────────────────────────────
  // CRUD Productos retail
  // ─────────────────────────────────────────────
  function listProductos() { return state.productos.slice(); }
  function addProducto(p) {
    const item = Object.assign({ sku: uid('P'), stock: 0 }, p);
    state.productos.push(item); save(); return item;
  }
  function updateStock(sku, delta) {
    const p = state.productos.find(x => x.sku === sku);
    if (!p) return null;
    p.stock = Math.max(0, p.stock + delta); save(); return p;
  }
  function lowStock(min) {
    min = min || 5;
    return state.productos.filter(p => p.stock <= min);
  }

  // ─────────────────────────────────────────────
  // CRUD Staff
  // ─────────────────────────────────────────────
  function listStaff() { return state.staff.slice(); }
  function staffByEspecialidad(cat) {
    return state.staff.filter(s => s.especialidad.includes(cat));
  }
  function addStaff(s) {
    const item = Object.assign({ id: uid('st'), comision: COMMISSION_DEFAULT, especialidad: [] }, s);
    state.staff.push(item); save(); return item;
  }

  // ─────────────────────────────────────────────
  // Clientes
  // ─────────────────────────────────────────────
  function addCliente(c) {
    const item = Object.assign({ id: uid('cli'), historial: [] }, c);
    state.clientes.push(item); save(); return item;
  }
  function findCliente(q) {
    q = (q || '').toLowerCase();
    return state.clientes.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.tel    || '').includes(q) ||
      (c.email  || '').toLowerCase().includes(q)
    );
  }

  // ─────────────────────────────────────────────
  // Agenda / Citas
  // ─────────────────────────────────────────────
  function bookCita({ clienteId, staffId, servicioId, fecha, hora }) {
    const srv = state.servicios.find(s => s.id === servicioId);
    if (!srv) throw new Error('Servicio no existe');
    // Verificar choque simple
    const choque = state.citas.find(c =>
      c.staffId === staffId && c.fecha === fecha && c.hora === hora && c.estado !== 'cancelada'
    );
    if (choque) throw new Error('Horario ocupado para ese staff');
    const cita = {
      id: uid('cita'), clienteId, staffId, servicioId,
      fecha, hora, duracion: srv.duracion, precio: srv.precio,
      estado: 'agendada', creada: new Date().toISOString()
    };
    state.citas.push(cita); save(); return cita;
  }
  function cancelCita(id) {
    const c = state.citas.find(x => x.id === id);
    if (c) { c.estado = 'cancelada'; save(); }
    return c;
  }
  function citasDelDia(fecha) {
    return state.citas
      .filter(c => c.fecha === fecha && c.estado !== 'cancelada')
      .sort((a, b) => a.hora.localeCompare(b.hora));
  }
  function citasStaff(staffId, fecha) {
    return state.citas.filter(c =>
      c.staffId === staffId && (!fecha || c.fecha === fecha) && c.estado !== 'cancelada'
    );
  }
  function slotsLibres(staffId, fecha, paso) {
    paso = paso || 30;
    const st = state.staff.find(s => s.id === staffId);
    if (!st) return [];
    const [hi, hf] = (st.horario || '09:00-18:00').split('-');
    const ocupadas = citasStaff(staffId, fecha).map(c => c.hora);
    const libres = [];
    let [h, m] = hi.split(':').map(Number);
    const [hF, mF] = hf.split(':').map(Number);
    while (h < hF || (h === hF && m < mF)) {
      const t = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
      if (!ocupadas.includes(t)) libres.push(t);
      m += paso; if (m >= 60) { h++; m -= 60; }
    }
    return libres;
  }

  // ─────────────────────────────────────────────
  // Ventas + cálculo de comisiones
  // ─────────────────────────────────────────────
  function cobrarServicio({ citaId, productosExtra, descuento, metodoPago }) {
    const cita = state.citas.find(c => c.id === citaId);
    if (!cita) throw new Error('Cita no existe');
    const srv  = state.servicios.find(s => s.id === cita.servicioId);
    const st   = state.staff.find(s => s.id === cita.staffId);
    const items = [{ tipo:'servicio', ref: srv.id, nombre: srv.nombre, precio: srv.precio, qty: 1 }];

    let subtotal = srv.precio;
    (productosExtra || []).forEach(({ sku, qty }) => {
      const p = state.productos.find(x => x.sku === sku);
      if (!p) return;
      const q = qty || 1;
      if (p.stock < q) throw new Error('Stock insuficiente: ' + p.nombre);
      p.stock -= q;
      subtotal += p.precio * q;
      items.push({ tipo:'retail', ref: p.sku, nombre: p.nombre, precio: p.precio, qty: q });
    });

    const desc  = descuento || 0;
    const base  = Math.max(0, subtotal - desc);
    const iva   = +(base * state.config.iva).toFixed(2);
    const total = +(base + iva).toFixed(2);

    const tasa = (srv.comision != null ? srv.comision : (st && st.comision) || COMMISSION_DEFAULT);
    const comision = +(srv.precio * tasa).toFixed(2);

    const venta = {
      id: uid('v'), fecha: new Date().toISOString(),
      citaId, staffId: cita.staffId, clienteId: cita.clienteId,
      items, subtotal, descuento: desc, iva, total,
      comision, tasaComision: tasa, metodoPago: metodoPago || 'efectivo',
      tipo: 'servicio'
    };
    state.ventas.push(venta);
    cita.estado = 'completada'; cita.ventaId = venta.id;
    save();
    return venta;
  }

  function cobrarRetail({ items, clienteId, staffId, descuento, metodoPago }) {
    const detalle = [];
    let subtotal = 0;
    (items || []).forEach(({ sku, qty }) => {
      const p = state.productos.find(x => x.sku === sku);
      if (!p) throw new Error('SKU inexistente: ' + sku);
      const q = qty || 1;
      if (p.stock < q) throw new Error('Stock insuficiente: ' + p.nombre);
      p.stock -= q;
      subtotal += p.precio * q;
      detalle.push({ tipo:'retail', ref: p.sku, nombre: p.nombre, precio: p.precio, qty: q, costo: p.costo });
    });
    const desc  = descuento || 0;
    const base  = Math.max(0, subtotal - desc);
    const iva   = +(base * state.config.iva).toFixed(2);
    const total = +(base + iva).toFixed(2);
    const comision = staffId ? +(subtotal * 0.05).toFixed(2) : 0; // 5% retail al vendedor

    const venta = {
      id: uid('v'), fecha: new Date().toISOString(),
      clienteId, staffId, items: detalle,
      subtotal, descuento: desc, iva, total,
      comision, metodoPago: metodoPago || 'efectivo',
      tipo: 'retail'
    };
    state.ventas.push(venta); save();
    return venta;
  }

  // ─────────────────────────────────────────────
  // Reportes
  // ─────────────────────────────────────────────
  function comisionesPorStaff(desde, hasta) {
    const d0 = desde ? new Date(desde).getTime() : 0;
    const d1 = hasta ? new Date(hasta).getTime() : Date.now() + 86400000;
    const out = {};
    state.ventas.forEach(v => {
      const t = new Date(v.fecha).getTime();
      if (t < d0 || t > d1) return;
      if (!v.staffId) return;
      out[v.staffId] = out[v.staffId] || { staffId: v.staffId, ventas: 0, comision: 0, tickets: 0 };
      out[v.staffId].ventas   += v.subtotal;
      out[v.staffId].comision += v.comision;
      out[v.staffId].tickets  += 1;
    });
    return Object.values(out).map(r => {
      const st = state.staff.find(x => x.id === r.staffId);
      return Object.assign(r, { nombre: st ? st.nombre : '?', rol: st ? st.rol : '' });
    });
  }

  function resumenDia(fecha) {
    const day = (fecha || new Date().toISOString().slice(0,10));
    const ventas = state.ventas.filter(v => v.fecha.slice(0,10) === day);
    const total    = ventas.reduce((a,v) => a + v.total, 0);
    const servicios= ventas.filter(v => v.tipo === 'servicio').length;
    const retail   = ventas.filter(v => v.tipo === 'retail').length;
    const comision = ventas.reduce((a,v) => a + v.comision, 0);
    return { fecha: day, tickets: ventas.length, total, servicios, retail, comision };
  }

  function topServicios(n) {
    n = n || 5;
    const map = {};
    state.ventas.forEach(v => v.items.filter(i => i.tipo === 'servicio').forEach(i => {
      map[i.ref] = (map[i.ref] || 0) + i.qty;
    }));
    return Object.entries(map)
      .sort((a,b) => b[1] - a[1]).slice(0, n)
      .map(([id, qty]) => {
        const s = state.servicios.find(x => x.id === id);
        return { id, nombre: s ? s.nombre : '?', cantidad: qty };
      });
  }

  // ─────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────
  load();

  global.EsteticaAPI = {
    // estado
    state: () => state,
    save, load, reset,
    // catálogos
    listServicios, addServicio, updateServicio, removeServicio,
    listProductos, addProducto, updateStock, lowStock,
    listStaff, staffByEspecialidad, addStaff,
    // clientes
    addCliente, findCliente,
    // agenda
    bookCita, cancelCita, citasDelDia, citasStaff, slotsLibres,
    // ventas
    cobrarServicio, cobrarRetail,
    // reportes
    comisionesPorStaff, resumenDia, topServicios,
    // meta
    version: '1.0.0',
    vertical: 'estetica'
  };

  console.log('[Volvix] Vertical Estética cargado v1.0.0 — window.EsteticaAPI listo');
})(typeof window !== 'undefined' ? window : globalThis);
