/**
 * volvix-vertical-eventos.js
 * Vertical POS para organizadores de eventos: bodas, XV años, salones, paquetes,
 * decoración, catering, mobiliario, audio/video, fotografía y staff.
 *
 * Expone: window.EventosAPI
 *
 * Almacenamiento: localStorage namespace "volvix_eventos_v1"
 */
(function (global) {
  'use strict';

  const NS = 'volvix_eventos_v1';
  const VERSION = '1.0.0';

  // ───────────────────────── Persistencia ─────────────────────────
  function _load(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + ':' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[EventosAPI] load fail', key, e);
      return fallback;
    }
  }
  function _save(key, value) {
    try {
      localStorage.setItem(NS + ':' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[EventosAPI] save fail', key, e);
      return false;
    }
  }
  function _uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }
  function _now() { return new Date().toISOString(); }

  // ───────────────────────── Catálogos base ─────────────────────────
  const TIPOS_EVENTO = [
    'boda', 'xv_anos', 'bautizo', 'primera_comunion', 'graduacion',
    'cumpleanos', 'corporativo', 'aniversario', 'baby_shower', 'otro'
  ];

  const CATEGORIAS_SERVICIO = [
    'salon', 'paquete', 'decoracion', 'catering', 'mobiliario',
    'audio_video', 'fotografia', 'video', 'staff', 'transporte',
    'pastel', 'mesa_dulces', 'bebidas', 'animacion', 'otro'
  ];

  const ESTADOS_EVENTO = [
    'cotizacion', 'apartado', 'confirmado', 'en_curso', 'finalizado', 'cancelado'
  ];

  const ESTADOS_PAGO = ['pendiente', 'parcial', 'pagado', 'reembolsado'];

  // ───────────────────────── Stores en memoria ─────────────────────────
  let salones    = _load('salones', []);
  let servicios  = _load('servicios', []);    // catálogo de items vendibles
  let paquetes   = _load('paquetes', []);     // bundles
  let clientes   = _load('clientes', []);
  let eventos    = _load('eventos', []);      // reservaciones / cotizaciones
  let pagos      = _load('pagos', []);
  let staff      = _load('staff', []);
  let proveedores= _load('proveedores', []);

  function _persistAll() {
    _save('salones', salones);
    _save('servicios', servicios);
    _save('paquetes', paquetes);
    _save('clientes', clientes);
    _save('eventos', eventos);
    _save('pagos', pagos);
    _save('staff', staff);
    _save('proveedores', proveedores);
  }

  // ───────────────────────── Salones ─────────────────────────
  function crearSalon({ nombre, capacidad, precio_dia, direccion = '', amenidades = [] }) {
    if (!nombre || !capacidad || precio_dia == null) {
      throw new Error('Salon requiere nombre, capacidad y precio_dia');
    }
    const s = {
      id: _uid('sal'),
      nombre, capacidad: +capacidad, precio_dia: +precio_dia,
      direccion, amenidades, activo: true, creado: _now()
    };
    salones.push(s); _save('salones', salones); return s;
  }
  function listarSalones(filtro = {}) {
    return salones.filter(s =>
      (filtro.activo == null || s.activo === filtro.activo) &&
      (filtro.capacidad_min == null || s.capacidad >= filtro.capacidad_min)
    );
  }
  function disponibilidadSalon(salon_id, fechaISO) {
    const dia = fechaISO.slice(0, 10);
    const ocupado = eventos.some(e =>
      e.salon_id === salon_id &&
      e.fecha.slice(0, 10) === dia &&
      ['apartado', 'confirmado', 'en_curso'].includes(e.estado)
    );
    return { salon_id, fecha: dia, disponible: !ocupado };
  }

  // ───────────────────────── Servicios (catálogo) ─────────────────────────
  function crearServicio({ nombre, categoria, precio, unidad = 'servicio', descripcion = '' }) {
    if (!nombre || !categoria || precio == null) {
      throw new Error('Servicio requiere nombre, categoria, precio');
    }
    if (!CATEGORIAS_SERVICIO.includes(categoria)) {
      throw new Error('Categoria invalida: ' + categoria);
    }
    const sv = {
      id: _uid('srv'), nombre, categoria, precio: +precio,
      unidad, descripcion, activo: true, creado: _now()
    };
    servicios.push(sv); _save('servicios', servicios); return sv;
  }
  function listarServicios(categoria) {
    return categoria ? servicios.filter(s => s.categoria === categoria && s.activo)
                     : servicios.filter(s => s.activo);
  }
  function actualizarServicio(id, patch) {
    const i = servicios.findIndex(s => s.id === id);
    if (i < 0) throw new Error('servicio no encontrado');
    servicios[i] = { ...servicios[i], ...patch, actualizado: _now() };
    _save('servicios', servicios); return servicios[i];
  }

  // ───────────────────────── Paquetes ─────────────────────────
  function crearPaquete({ nombre, tipo_evento, items = [], precio, descripcion = '' }) {
    // items: [{servicio_id, cantidad}]
    if (!nombre || !tipo_evento || precio == null) {
      throw new Error('Paquete requiere nombre, tipo_evento, precio');
    }
    items.forEach(it => {
      if (!servicios.find(s => s.id === it.servicio_id)) {
        throw new Error('servicio_id invalido en paquete: ' + it.servicio_id);
      }
    });
    const p = {
      id: _uid('pkg'), nombre, tipo_evento, items,
      precio: +precio, descripcion, activo: true, creado: _now()
    };
    paquetes.push(p); _save('paquetes', paquetes); return p;
  }
  function listarPaquetes(tipo_evento) {
    return tipo_evento ? paquetes.filter(p => p.tipo_evento === tipo_evento && p.activo)
                       : paquetes.filter(p => p.activo);
  }
  function expandirPaquete(paquete_id) {
    const p = paquetes.find(x => x.id === paquete_id);
    if (!p) throw new Error('paquete no encontrado');
    return p.items.map(it => {
      const sv = servicios.find(s => s.id === it.servicio_id);
      return { ...it, servicio: sv };
    });
  }

  // ───────────────────────── Clientes ─────────────────────────
  function crearCliente({ nombre, telefono = '', email = '', direccion = '', notas = '' }) {
    if (!nombre) throw new Error('cliente requiere nombre');
    const c = {
      id: _uid('cli'), nombre, telefono, email, direccion, notas,
      creado: _now()
    };
    clientes.push(c); _save('clientes', clientes); return c;
  }
  function buscarCliente(query) {
    const q = (query || '').toLowerCase();
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.telefono.includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }

  // ───────────────────────── Eventos / Reservaciones ─────────────────────────
  function crearEvento({
    cliente_id, tipo_evento, fecha, hora_inicio = '18:00', hora_fin = '02:00',
    salon_id = null, paquete_id = null, items_extra = [],
    invitados = 0, notas = '', descuento = 0
  }) {
    if (!cliente_id || !tipo_evento || !fecha) {
      throw new Error('evento requiere cliente_id, tipo_evento, fecha');
    }
    if (!TIPOS_EVENTO.includes(tipo_evento)) {
      throw new Error('tipo_evento invalido: ' + tipo_evento);
    }
    if (!clientes.find(c => c.id === cliente_id)) {
      throw new Error('cliente_id invalido');
    }
    if (salon_id) {
      const disp = disponibilidadSalon(salon_id, fecha);
      if (!disp.disponible) throw new Error('salon no disponible en esa fecha');
    }
    const ev = {
      id: _uid('evt'),
      cliente_id, tipo_evento, fecha, hora_inicio, hora_fin,
      salon_id, paquete_id,
      items_extra,            // [{servicio_id, cantidad, precio_unit}]
      invitados: +invitados,
      notas, descuento: +descuento,
      estado: 'cotizacion', estado_pago: 'pendiente',
      creado: _now()
    };
    eventos.push(ev); _save('eventos', eventos); return ev;
  }

  function calcularTotal(evento_id) {
    const ev = eventos.find(e => e.id === evento_id);
    if (!ev) throw new Error('evento no encontrado');
    let subtotal = 0;
    const desglose = [];

    if (ev.salon_id) {
      const sal = salones.find(s => s.id === ev.salon_id);
      if (sal) { subtotal += sal.precio_dia; desglose.push({ tipo: 'salon', nombre: sal.nombre, monto: sal.precio_dia }); }
    }
    if (ev.paquete_id) {
      const pkg = paquetes.find(p => p.id === ev.paquete_id);
      if (pkg) { subtotal += pkg.precio; desglose.push({ tipo: 'paquete', nombre: pkg.nombre, monto: pkg.precio }); }
    }
    (ev.items_extra || []).forEach(it => {
      const sv = servicios.find(s => s.id === it.servicio_id);
      const precio = it.precio_unit != null ? it.precio_unit : (sv ? sv.precio : 0);
      const monto = precio * (it.cantidad || 1);
      subtotal += monto;
      desglose.push({
        tipo: 'extra',
        nombre: sv ? sv.nombre : it.servicio_id,
        cantidad: it.cantidad || 1,
        monto
      });
    });

    const descuento = ev.descuento || 0;
    const base = Math.max(0, subtotal - descuento);
    const iva = +(base * 0.16).toFixed(2);
    const total = +(base + iva).toFixed(2);
    return { evento_id, subtotal, descuento, base, iva, total, desglose };
  }

  function cambiarEstado(evento_id, estado) {
    if (!ESTADOS_EVENTO.includes(estado)) throw new Error('estado invalido');
    const ev = eventos.find(e => e.id === evento_id);
    if (!ev) throw new Error('evento no encontrado');
    ev.estado = estado; ev.actualizado = _now();
    _save('eventos', eventos); return ev;
  }

  function listarEventos(filtro = {}) {
    return eventos.filter(e =>
      (!filtro.estado     || e.estado === filtro.estado) &&
      (!filtro.cliente_id || e.cliente_id === filtro.cliente_id) &&
      (!filtro.tipo       || e.tipo_evento === filtro.tipo) &&
      (!filtro.desde      || e.fecha >= filtro.desde) &&
      (!filtro.hasta      || e.fecha <= filtro.hasta)
    ).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function agendaPorMes(yyyy_mm) {
    return eventos
      .filter(e => e.fecha.slice(0, 7) === yyyy_mm &&
                   e.estado !== 'cancelado')
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ───────────────────────── Pagos ─────────────────────────
  function registrarPago({ evento_id, monto, metodo = 'efectivo', referencia = '', concepto = 'abono' }) {
    const ev = eventos.find(e => e.id === evento_id);
    if (!ev) throw new Error('evento no encontrado');
    if (!monto || +monto <= 0) throw new Error('monto invalido');
    const p = {
      id: _uid('pag'), evento_id, monto: +monto, metodo,
      referencia, concepto, fecha: _now()
    };
    pagos.push(p); _save('pagos', pagos);
    _recalcularEstadoPago(evento_id);
    return p;
  }
  function _recalcularEstadoPago(evento_id) {
    const ev = eventos.find(e => e.id === evento_id);
    if (!ev) return;
    const total = calcularTotal(evento_id).total;
    const pagado = pagos.filter(p => p.evento_id === evento_id)
                        .reduce((s, p) => s + p.monto, 0);
    if (pagado <= 0)            ev.estado_pago = 'pendiente';
    else if (pagado >= total)   ev.estado_pago = 'pagado';
    else                        ev.estado_pago = 'parcial';
    ev.pagado = +pagado.toFixed(2);
    ev.saldo  = +(total - pagado).toFixed(2);
    _save('eventos', eventos);
  }
  function pagosDeEvento(evento_id) {
    return pagos.filter(p => p.evento_id === evento_id);
  }

  // ───────────────────────── Staff y Proveedores ─────────────────────────
  function crearStaff({ nombre, rol, costo_evento = 0, telefono = '' }) {
    if (!nombre || !rol) throw new Error('staff requiere nombre y rol');
    const s = { id: _uid('stf'), nombre, rol, costo_evento: +costo_evento, telefono, activo: true };
    staff.push(s); _save('staff', staff); return s;
  }
  function asignarStaff(evento_id, staff_ids = []) {
    const ev = eventos.find(e => e.id === evento_id);
    if (!ev) throw new Error('evento no encontrado');
    ev.staff = staff_ids; _save('eventos', eventos); return ev;
  }
  function crearProveedor({ nombre, categoria, contacto = '', telefono = '' }) {
    if (!nombre || !categoria) throw new Error('proveedor requiere nombre y categoria');
    const p = { id: _uid('prv'), nombre, categoria, contacto, telefono, activo: true };
    proveedores.push(p); _save('proveedores', proveedores); return p;
  }

  // ───────────────────────── Reportes ─────────────────────────
  function reporteVentas(desde, hasta) {
    const evs = listarEventos({ desde, hasta }).filter(e => e.estado !== 'cancelado');
    let total = 0, cobrado = 0;
    const porTipo = {};
    evs.forEach(e => {
      const t = calcularTotal(e.id).total;
      const c = pagos.filter(p => p.evento_id === e.id).reduce((s, p) => s + p.monto, 0);
      total += t; cobrado += c;
      porTipo[e.tipo_evento] = (porTipo[e.tipo_evento] || 0) + t;
    });
    return {
      desde, hasta, eventos: evs.length,
      total: +total.toFixed(2),
      cobrado: +cobrado.toFixed(2),
      saldo: +(total - cobrado).toFixed(2),
      porTipo
    };
  }

  function topServicios(limit = 10) {
    const conteo = {};
    eventos.forEach(e => {
      (e.items_extra || []).forEach(it => {
        conteo[it.servicio_id] = (conteo[it.servicio_id] || 0) + (it.cantidad || 1);
      });
    });
    return Object.entries(conteo)
      .map(([id, q]) => {
        const sv = servicios.find(s => s.id === id);
        return { servicio_id: id, nombre: sv ? sv.nombre : id, cantidad: q };
      })
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limit);
  }

  // ───────────────────────── Seed demo ─────────────────────────
  function seedDemo() {
    if (salones.length || servicios.length) return { skipped: true };
    crearSalon({ nombre: 'Salon Cristal', capacidad: 300, precio_dia: 25000, amenidades: ['aire', 'pista', 'cocina'] });
    crearSalon({ nombre: 'Jardin Las Rosas', capacidad: 500, precio_dia: 40000, amenidades: ['jardin', 'kiosco'] });
    const cat = crearServicio({ nombre: 'Catering 3 tiempos', categoria: 'catering', precio: 350, unidad: 'persona' });
    const dec = crearServicio({ nombre: 'Decoracion floral', categoria: 'decoracion', precio: 15000 });
    const dj  = crearServicio({ nombre: 'DJ + audio', categoria: 'audio_video', precio: 12000 });
    const fot = crearServicio({ nombre: 'Fotografia 6h', categoria: 'fotografia', precio: 9000 });
    crearPaquete({
      nombre: 'Boda Plata', tipo_evento: 'boda', precio: 85000,
      items: [
        { servicio_id: cat.id, cantidad: 150 },
        { servicio_id: dec.id, cantidad: 1 },
        { servicio_id: dj.id,  cantidad: 1 },
        { servicio_id: fot.id, cantidad: 1 }
      ]
    });
    return { ok: true };
  }

  // ───────────────────────── Reset / Export ─────────────────────────
  function exportarTodo() {
    return JSON.stringify({
      version: VERSION,
      salones, servicios, paquetes, clientes,
      eventos, pagos, staff, proveedores
    }, null, 2);
  }
  function importarTodo(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    salones = data.salones || []; servicios = data.servicios || [];
    paquetes = data.paquetes || []; clientes = data.clientes || [];
    eventos = data.eventos || []; pagos = data.pagos || [];
    staff = data.staff || []; proveedores = data.proveedores || [];
    _persistAll(); return { ok: true };
  }
  function resetTodo() {
    salones = []; servicios = []; paquetes = []; clientes = [];
    eventos = []; pagos = []; staff = []; proveedores = [];
    _persistAll(); return { ok: true };
  }

  // ───────────────────────── API pública ─────────────────────────
  global.EventosAPI = {
    VERSION,
    TIPOS_EVENTO, CATEGORIAS_SERVICIO, ESTADOS_EVENTO, ESTADOS_PAGO,
    // salones
    crearSalon, listarSalones, disponibilidadSalon,
    // servicios
    crearServicio, listarServicios, actualizarServicio,
    // paquetes
    crearPaquete, listarPaquetes, expandirPaquete,
    // clientes
    crearCliente, buscarCliente,
    // eventos
    crearEvento, calcularTotal, cambiarEstado, listarEventos, agendaPorMes,
    // pagos
    registrarPago, pagosDeEvento,
    // staff / proveedores
    crearStaff, asignarStaff, crearProveedor,
    // reportes
    reporteVentas, topServicios,
    // utilidad
    seedDemo, exportarTodo, importarTodo, resetTodo
  };

  console.log('[EventosAPI] cargado v' + VERSION);
})(typeof window !== 'undefined' ? window : globalThis);
