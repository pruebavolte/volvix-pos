/**
 * volvix-vertical-spa.js
 * Volvix POS - Vertical SPA / Centro de Bienestar
 *
 * Maneja: tratamientos, cabinas, terapeutas, paquetes, productos retail.
 * Expone: window.SpaAPI
 *
 * Persistencia: localStorage namespace "volvix_spa_v1"
 */
(function (global) {
  'use strict';

  const NS = 'volvix_spa_v1';
  const VERSION = '1.0.0';

  // ============================================================
  // STORAGE
  // ============================================================
  const Storage = {
    load(key, def) {
      try {
        const raw = localStorage.getItem(`${NS}:${key}`);
        return raw ? JSON.parse(raw) : def;
      } catch (e) {
        console.warn('[Spa] storage load fail', key, e);
        return def;
      }
    },
    save(key, val) {
      try {
        localStorage.setItem(`${NS}:${key}`, JSON.stringify(val));
        return true;
      } catch (e) {
        console.error('[Spa] storage save fail', key, e);
        return false;
      }
    },
    clear() {
      Object.keys(localStorage)
        .filter(k => k.startsWith(`${NS}:`))
        .forEach(k => localStorage.removeItem(k));
    }
  };

  // ============================================================
  // CATALOGOS POR DEFECTO
  // ============================================================
  const DEFAULT_TREATMENTS = [
    { id: 't-001', nombre: 'Masaje Relajante 60 min', categoria: 'Masajes', duracion: 60, precio: 650, comision: 0.30, requiereCabina: true },
    { id: 't-002', nombre: 'Masaje Descontracturante 90 min', categoria: 'Masajes', duracion: 90, precio: 950, comision: 0.30, requiereCabina: true },
    { id: 't-003', nombre: 'Masaje con Piedras Calientes', categoria: 'Masajes', duracion: 75, precio: 850, comision: 0.30, requiereCabina: true },
    { id: 't-004', nombre: 'Facial Hidratante', categoria: 'Faciales', duracion: 50, precio: 700, comision: 0.25, requiereCabina: true },
    { id: 't-005', nombre: 'Facial Anti-Edad', categoria: 'Faciales', duracion: 75, precio: 1100, comision: 0.25, requiereCabina: true },
    { id: 't-006', nombre: 'Limpieza Profunda', categoria: 'Faciales', duracion: 60, precio: 800, comision: 0.25, requiereCabina: true },
    { id: 't-007', nombre: 'Exfoliacion Corporal', categoria: 'Corporales', duracion: 45, precio: 600, comision: 0.25, requiereCabina: true },
    { id: 't-008', nombre: 'Envoltura de Chocolate', categoria: 'Corporales', duracion: 60, precio: 850, comision: 0.25, requiereCabina: true },
    { id: 't-009', nombre: 'Reflexologia Podal', categoria: 'Terapias', duracion: 45, precio: 500, comision: 0.30, requiereCabina: false },
    { id: 't-010', nombre: 'Aromaterapia', categoria: 'Terapias', duracion: 60, precio: 700, comision: 0.30, requiereCabina: true },
    { id: 't-011', nombre: 'Manicure Spa', categoria: 'Manos y Pies', duracion: 45, precio: 350, comision: 0.20, requiereCabina: false },
    { id: 't-012', nombre: 'Pedicure Spa', categoria: 'Manos y Pies', duracion: 60, precio: 450, comision: 0.20, requiereCabina: false },
    { id: 't-013', nombre: 'Depilacion con Cera (piernas)', categoria: 'Depilacion', duracion: 30, precio: 400, comision: 0.25, requiereCabina: true },
    { id: 't-014', nombre: 'Sesion de Sauna', categoria: 'Hidroterapia', duracion: 30, precio: 250, comision: 0.10, requiereCabina: false },
    { id: 't-015', nombre: 'Hidromasaje 30 min', categoria: 'Hidroterapia', duracion: 30, precio: 350, comision: 0.10, requiereCabina: true }
  ];

  const DEFAULT_CABINS = [
    { id: 'c-1', nombre: 'Cabina 1 - Lavanda', tipo: 'Masajes', activa: true },
    { id: 'c-2', nombre: 'Cabina 2 - Rosa', tipo: 'Masajes', activa: true },
    { id: 'c-3', nombre: 'Cabina 3 - Jazmin', tipo: 'Faciales', activa: true },
    { id: 'c-4', nombre: 'Cabina 4 - Eucalipto', tipo: 'Corporales', activa: true },
    { id: 'c-5', nombre: 'Cabina Pareja', tipo: 'Pareja', activa: true },
    { id: 'c-6', nombre: 'Sala Hidroterapia', tipo: 'Hidroterapia', activa: true }
  ];

  const DEFAULT_THERAPISTS = [
    { id: 'th-001', nombre: 'Maria Lopez', especialidades: ['Masajes', 'Terapias'], activo: true, telefono: '5551234567' },
    { id: 'th-002', nombre: 'Ana Garcia', especialidades: ['Faciales', 'Corporales'], activo: true, telefono: '5552345678' },
    { id: 'th-003', nombre: 'Lucia Hernandez', especialidades: ['Masajes', 'Hidroterapia'], activo: true, telefono: '5553456789' },
    { id: 'th-004', nombre: 'Patricia Ramirez', especialidades: ['Manos y Pies', 'Depilacion'], activo: true, telefono: '5554567890' },
    { id: 'th-005', nombre: 'Carlos Mendoza', especialidades: ['Masajes', 'Terapias'], activo: true, telefono: '5555678901' }
  ];

  const DEFAULT_PACKAGES = [
    { id: 'pkg-001', nombre: 'Paquete Relax Total', tratamientos: ['t-001', 't-009', 't-014'], precio: 1200, descuento: 0.15, vigenciaDias: 60 },
    { id: 'pkg-002', nombre: 'Dia de Spa Completo', tratamientos: ['t-002', 't-005', 't-007', 't-012'], precio: 2800, descuento: 0.20, vigenciaDias: 30 },
    { id: 'pkg-003', nombre: 'Novia Radiante', tratamientos: ['t-005', 't-008', 't-011', 't-012'], precio: 2400, descuento: 0.18, vigenciaDias: 90 },
    { id: 'pkg-004', nombre: 'Pareja en Armonia', tratamientos: ['t-001', 't-001', 't-014', 't-014'], precio: 1500, descuento: 0.15, vigenciaDias: 45 },
    { id: 'pkg-005', nombre: 'Mensual Premium (4 visitas)', tratamientos: ['t-002', 't-002', 't-002', 't-002'], precio: 3200, descuento: 0.25, vigenciaDias: 30 }
  ];

  const DEFAULT_RETAIL = [
    { id: 'r-001', sku: 'CR-FAC-01', nombre: 'Crema Facial Hidratante 50ml', categoria: 'Skincare', precio: 450, costo: 180, stock: 24 },
    { id: 'r-002', sku: 'CR-FAC-02', nombre: 'Serum Anti-Edad 30ml', categoria: 'Skincare', precio: 750, costo: 320, stock: 18 },
    { id: 'r-003', sku: 'AC-AR-01', nombre: 'Aceite Esencial Lavanda 15ml', categoria: 'Aromaterapia', precio: 280, costo: 110, stock: 40 },
    { id: 'r-004', sku: 'AC-AR-02', nombre: 'Aceite Esencial Eucalipto 15ml', categoria: 'Aromaterapia', precio: 280, costo: 110, stock: 35 },
    { id: 'r-005', sku: 'EX-CO-01', nombre: 'Exfoliante Corporal 200g', categoria: 'Corporal', precio: 380, costo: 150, stock: 22 },
    { id: 'r-006', sku: 'MA-CO-01', nombre: 'Mascarilla Capilar 250ml', categoria: 'Cabello', precio: 320, costo: 130, stock: 28 },
    { id: 'r-007', sku: 'GE-DU-01', nombre: 'Gel de Ducha Spa 500ml', categoria: 'Corporal', precio: 240, costo: 95, stock: 50 },
    { id: 'r-008', sku: 'VE-RE-01', nombre: 'Vela Aromatica Relax', categoria: 'Ambiente', precio: 350, costo: 140, stock: 30 },
    { id: 'r-009', sku: 'BA-SA-01', nombre: 'Sales de Bano 1kg', categoria: 'Corporal', precio: 290, costo: 115, stock: 25 },
    { id: 'r-010', sku: 'BR-MA-01', nombre: 'Bruma Facial 100ml', categoria: 'Skincare', precio: 360, costo: 145, stock: 32 }
  ];

  // ============================================================
  // STATE
  // ============================================================
  const State = {
    treatments: Storage.load('treatments', DEFAULT_TREATMENTS),
    cabins:     Storage.load('cabins',     DEFAULT_CABINS),
    therapists: Storage.load('therapists', DEFAULT_THERAPISTS),
    packages:   Storage.load('packages',   DEFAULT_PACKAGES),
    retail:     Storage.load('retail',     DEFAULT_RETAIL),
    appointments: Storage.load('appointments', []),
    sales:      Storage.load('sales', [])
  };

  function persist(key) { Storage.save(key, State[key]); }
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

  // ============================================================
  // TRATAMIENTOS
  // ============================================================
  function listTreatments(filter) {
    if (!filter) return [...State.treatments];
    const f = filter.toLowerCase();
    return State.treatments.filter(t =>
      t.nombre.toLowerCase().includes(f) || t.categoria.toLowerCase().includes(f));
  }
  function getTreatment(id) { return State.treatments.find(t => t.id === id) || null; }
  function addTreatment(t) {
    const nuevo = { id: uid('t'), comision: 0.25, requiereCabina: true, ...t };
    State.treatments.push(nuevo); persist('treatments'); return nuevo;
  }
  function updateTreatment(id, patch) {
    const t = getTreatment(id); if (!t) return null;
    Object.assign(t, patch); persist('treatments'); return t;
  }
  function removeTreatment(id) {
    const i = State.treatments.findIndex(t => t.id === id);
    if (i < 0) return false;
    State.treatments.splice(i, 1); persist('treatments'); return true;
  }

  // ============================================================
  // CABINAS
  // ============================================================
  function listCabins(soloActivas) {
    return soloActivas ? State.cabins.filter(c => c.activa) : [...State.cabins];
  }
  function isCabinAvailable(cabinId, fechaISO, duracionMin) {
    const inicio = new Date(fechaISO).getTime();
    const fin = inicio + duracionMin * 60000;
    return !State.appointments.some(a => {
      if (a.cabinId !== cabinId || a.estado === 'cancelada') return false;
      const aIni = new Date(a.fecha).getTime();
      const aFin = aIni + a.duracion * 60000;
      return inicio < aFin && fin > aIni;
    });
  }
  function addCabin(c) {
    const nuevo = { id: uid('c'), activa: true, ...c };
    State.cabins.push(nuevo); persist('cabins'); return nuevo;
  }
  function toggleCabin(id) {
    const c = State.cabins.find(x => x.id === id); if (!c) return null;
    c.activa = !c.activa; persist('cabins'); return c;
  }

  // ============================================================
  // TERAPEUTAS
  // ============================================================
  function listTherapists(soloActivos) {
    return soloActivos ? State.therapists.filter(t => t.activo) : [...State.therapists];
  }
  function therapistsForCategory(categoria) {
    return State.therapists.filter(t => t.activo && t.especialidades.includes(categoria));
  }
  function addTherapist(t) {
    const nuevo = { id: uid('th'), activo: true, especialidades: [], ...t };
    State.therapists.push(nuevo); persist('therapists'); return nuevo;
  }
  function updateTherapist(id, patch) {
    const th = State.therapists.find(t => t.id === id); if (!th) return null;
    Object.assign(th, patch); persist('therapists'); return th;
  }

  // ============================================================
  // PAQUETES
  // ============================================================
  function listPackages() { return [...State.packages]; }
  function getPackage(id) { return State.packages.find(p => p.id === id) || null; }
  function packagePriceBreakdown(id) {
    const p = getPackage(id); if (!p) return null;
    const sumaIndividual = p.tratamientos.reduce((acc, tid) => {
      const t = getTreatment(tid); return acc + (t ? t.precio : 0);
    }, 0);
    return {
      paquete: p.nombre,
      sumaIndividual,
      precioPaquete: p.precio,
      ahorro: sumaIndividual - p.precio,
      descuentoPct: p.descuento
    };
  }
  function addPackage(p) {
    const nuevo = { id: uid('pkg'), tratamientos: [], descuento: 0.15, vigenciaDias: 60, ...p };
    State.packages.push(nuevo); persist('packages'); return nuevo;
  }

  // ============================================================
  // RETAIL
  // ============================================================
  function listRetail(filter) {
    if (!filter) return [...State.retail];
    const f = filter.toLowerCase();
    return State.retail.filter(r =>
      r.nombre.toLowerCase().includes(f) ||
      r.sku.toLowerCase().includes(f) ||
      r.categoria.toLowerCase().includes(f));
  }
  function getRetail(id) { return State.retail.find(r => r.id === id) || null; }
  function adjustStock(id, delta) {
    const r = getRetail(id); if (!r) return null;
    r.stock = Math.max(0, r.stock + delta); persist('retail'); return r;
  }
  function addRetail(r) {
    const nuevo = { id: uid('r'), stock: 0, costo: 0, ...r };
    State.retail.push(nuevo); persist('retail'); return nuevo;
  }
  function lowStockReport(umbral) {
    const u = umbral || 5;
    return State.retail.filter(r => r.stock <= u);
  }

  // ============================================================
  // CITAS / AGENDA
  // ============================================================
  function bookAppointment(data) {
    const t = getTreatment(data.treatmentId);
    if (!t) return { ok: false, error: 'Tratamiento no encontrado' };
    if (t.requiereCabina && !data.cabinId) return { ok: false, error: 'Se requiere cabina' };
    if (data.cabinId && !isCabinAvailable(data.cabinId, data.fecha, t.duracion))
      return { ok: false, error: 'Cabina no disponible en ese horario' };

    const cita = {
      id: uid('apt'),
      treatmentId: data.treatmentId,
      treatmentNombre: t.nombre,
      cabinId: data.cabinId || null,
      therapistId: data.therapistId || null,
      clienteNombre: data.clienteNombre || 'Sin nombre',
      clienteTel: data.clienteTel || '',
      fecha: data.fecha,
      duracion: t.duracion,
      precio: t.precio,
      estado: 'confirmada',
      creada: new Date().toISOString()
    };
    State.appointments.push(cita); persist('appointments');
    return { ok: true, cita };
  }
  function listAppointments(filter) {
    let arr = [...State.appointments];
    if (filter && filter.fechaDesde) arr = arr.filter(a => a.fecha >= filter.fechaDesde);
    if (filter && filter.fechaHasta) arr = arr.filter(a => a.fecha <= filter.fechaHasta);
    if (filter && filter.therapistId) arr = arr.filter(a => a.therapistId === filter.therapistId);
    if (filter && filter.estado) arr = arr.filter(a => a.estado === filter.estado);
    return arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  function cancelAppointment(id, motivo) {
    const a = State.appointments.find(x => x.id === id); if (!a) return null;
    a.estado = 'cancelada'; a.motivoCancel = motivo || ''; persist('appointments'); return a;
  }
  function completeAppointment(id) {
    const a = State.appointments.find(x => x.id === id); if (!a) return null;
    a.estado = 'completada'; persist('appointments'); return a;
  }

  // ============================================================
  // VENTA POS
  // ============================================================
  function checkout(data) {
    const items = data.items || [];
    if (!items.length) return { ok: false, error: 'Carrito vacio' };

    const detalle = [];
    let subtotal = 0;
    for (const it of items) {
      let nombre = '', precio = 0;
      if (it.tipo === 'tratamiento') {
        const t = getTreatment(it.id); if (!t) return { ok: false, error: `Tratamiento ${it.id} no existe` };
        nombre = t.nombre; precio = t.precio;
      } else if (it.tipo === 'paquete') {
        const p = getPackage(it.id); if (!p) return { ok: false, error: `Paquete ${it.id} no existe` };
        nombre = p.nombre; precio = p.precio;
      } else if (it.tipo === 'retail') {
        const r = getRetail(it.id); if (!r) return { ok: false, error: `Producto ${it.id} no existe` };
        if (r.stock < (it.cantidad || 1)) return { ok: false, error: `Stock insuficiente: ${r.nombre}` };
        nombre = r.nombre; precio = r.precio;
        adjustStock(it.id, -(it.cantidad || 1));
      } else {
        return { ok: false, error: `Tipo desconocido: ${it.tipo}` };
      }
      const cant = it.cantidad || 1;
      const importe = precio * cant;
      detalle.push({ tipo: it.tipo, id: it.id, nombre, cantidad: cant, precio, importe });
      subtotal += importe;
    }
    const descuento = data.descuento || 0;
    const totalNeto = subtotal - descuento;
    const iva = +(totalNeto * 0.16).toFixed(2);
    const total = +(totalNeto + iva).toFixed(2);

    const venta = {
      id: uid('v'),
      fecha: new Date().toISOString(),
      cliente: data.cliente || 'Publico general',
      detalle, subtotal, descuento, iva, total,
      metodoPago: data.metodoPago || 'efectivo',
      cajero: data.cajero || 'sistema'
    };
    State.sales.push(venta); persist('sales');
    return { ok: true, venta };
  }

  // ============================================================
  // REPORTES
  // ============================================================
  function reportSalesByDay(fechaISO) {
    const dia = (fechaISO || new Date().toISOString()).slice(0, 10);
    const ventas = State.sales.filter(v => v.fecha.startsWith(dia));
    const total = ventas.reduce((a, v) => a + v.total, 0);
    return { dia, count: ventas.length, total: +total.toFixed(2), ventas };
  }
  function reportTherapistCommission(therapistId, fechaDesde, fechaHasta) {
    const citas = listAppointments({ therapistId, fechaDesde, fechaHasta, estado: 'completada' });
    let comision = 0;
    citas.forEach(c => {
      const t = getTreatment(c.treatmentId);
      if (t) comision += c.precio * (t.comision || 0);
    });
    return { therapistId, citas: citas.length, comision: +comision.toFixed(2) };
  }
  function reportTopTreatments(limit) {
    const map = {};
    State.sales.forEach(v => v.detalle.forEach(d => {
      if (d.tipo === 'tratamiento') {
        map[d.id] = map[d.id] || { id: d.id, nombre: d.nombre, cantidad: 0, importe: 0 };
        map[d.id].cantidad += d.cantidad;
        map[d.id].importe += d.importe;
      }
    }));
    return Object.values(map).sort((a, b) => b.importe - a.importe).slice(0, limit || 10);
  }

  // ============================================================
  // RESET / SEED
  // ============================================================
  function resetAll() {
    Storage.clear();
    State.treatments = [...DEFAULT_TREATMENTS];
    State.cabins     = [...DEFAULT_CABINS];
    State.therapists = [...DEFAULT_THERAPISTS];
    State.packages   = [...DEFAULT_PACKAGES];
    State.retail     = [...DEFAULT_RETAIL];
    State.appointments = [];
    State.sales = [];
    Object.keys(State).forEach(persist);
    return true;
  }

  // ============================================================
  // API PUBLICA
  // ============================================================
  global.SpaAPI = {
    version: VERSION,
    // tratamientos
    listTreatments, getTreatment, addTreatment, updateTreatment, removeTreatment,
    // cabinas
    listCabins, isCabinAvailable, addCabin, toggleCabin,
    // terapeutas
    listTherapists, therapistsForCategory, addTherapist, updateTherapist,
    // paquetes
    listPackages, getPackage, packagePriceBreakdown, addPackage,
    // retail
    listRetail, getRetail, adjustStock, addRetail, lowStockReport,
    // citas
    bookAppointment, listAppointments, cancelAppointment, completeAppointment,
    // pos
    checkout,
    // reportes
    reportSalesByDay, reportTherapistCommission, reportTopTreatments,
    // utilidades
    resetAll,
    _state: State
  };

  console.log(`[Volvix Spa] SpaAPI v${VERSION} listo. Tratamientos: ${State.treatments.length}, Cabinas: ${State.cabins.length}, Terapeutas: ${State.therapists.length}.`);
})(typeof window !== 'undefined' ? window : globalThis);
