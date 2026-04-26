/**
 * Volvix Vertical - Estudio Fotográfico
 * POS especializado para estudios de fotografía:
 * sesiones, paquetes, álbumes, retoque, agenda y entregables.
 *
 * Expone window.FotografiaAPI
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_fotografia_v1';

  // ─────────────────────────────────────────────────────────────
  // Catálogos base
  // ─────────────────────────────────────────────────────────────
  const TIPOS_SESION = [
    { id: 'retrato',    nombre: 'Retrato individual',   duracionMin: 60,  precioBase: 1200 },
    { id: 'familia',    nombre: 'Sesión familiar',      duracionMin: 90,  precioBase: 2200 },
    { id: 'boda',       nombre: 'Boda completa',        duracionMin: 480, precioBase: 25000 },
    { id: 'xv',         nombre: 'XV años',              duracionMin: 240, precioBase: 12000 },
    { id: 'producto',   nombre: 'Fotografía de producto', duracionMin: 120, precioBase: 3500 },
    { id: 'newborn',    nombre: 'Recién nacido',        duracionMin: 120, precioBase: 2800 },
    { id: 'corporativa',nombre: 'Headshots corporativos', duracionMin: 45, precioBase: 900 },
    { id: 'evento',     nombre: 'Cobertura de evento',  duracionMin: 300, precioBase: 8000 }
  ];

  const PAQUETES = [
    { id: 'basico',  nombre: 'Básico',  fotosEditadas: 10, impresas: 5,  album: false, usbDigital: true,  precio: 1500 },
    { id: 'plata',   nombre: 'Plata',   fotosEditadas: 25, impresas: 15, album: false, usbDigital: true,  precio: 3200 },
    { id: 'oro',     nombre: 'Oro',     fotosEditadas: 50, impresas: 30, album: true,  usbDigital: true,  precio: 6500 },
    { id: 'premium', nombre: 'Premium', fotosEditadas: 120, impresas: 60, album: true, usbDigital: true,  precio: 14000 }
  ];

  const TIPOS_RETOQUE = [
    { id: 'basico',    nombre: 'Color y exposición',   precio: 30 },
    { id: 'piel',      nombre: 'Retoque de piel',       precio: 80 },
    { id: 'avanzado',  nombre: 'Retoque avanzado',      precio: 150 },
    { id: 'compuesta', nombre: 'Imagen compuesta',      precio: 350 }
  ];

  const ESTADOS_SESION = ['agendada', 'confirmada', 'en_curso', 'tomada', 'en_edicion', 'lista', 'entregada', 'cancelada'];

  // ─────────────────────────────────────────────────────────────
  // Estado en memoria + persistencia
  // ─────────────────────────────────────────────────────────────
  const state = cargar() || {
    clientes: [],
    sesiones: [],
    albumes: [],
    trabajosRetoque: [],
    agenda: [],
    fotografos: [
      { id: 'f1', nombre: 'Fotógrafo Principal', tarifaHora: 600 }
    ],
    pagos: [],
    seq: { cli: 1, ses: 1, alb: 1, ret: 1, ag: 1, pg: 1 }
  };

  function persistir() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function cargar() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function uid(prefix, key) {
    const n = state.seq[key]++;
    persistir();
    return `${prefix}-${String(n).padStart(5, '0')}`;
  }

  // ─────────────────────────────────────────────────────────────
  // Clientes
  // ─────────────────────────────────────────────────────────────
  function crearCliente({ nombre, telefono = '', email = '', notas = '' }) {
    if (!nombre) throw new Error('Nombre requerido');
    const cli = {
      id: uid('CLI', 'cli'),
      nombre, telefono, email, notas,
      creado: new Date().toISOString(),
      historialSesiones: []
    };
    state.clientes.push(cli);
    persistir();
    return cli;
  }
  function buscarCliente(q) {
    const s = (q || '').toLowerCase();
    return state.clientes.filter(c =>
      c.nombre.toLowerCase().includes(s) ||
      c.telefono.includes(s) ||
      c.email.toLowerCase().includes(s));
  }

  // ─────────────────────────────────────────────────────────────
  // Sesiones fotográficas
  // ─────────────────────────────────────────────────────────────
  function agendarSesion({ clienteId, tipoSesionId, paqueteId, fechaISO, fotografoId = 'f1', ubicacion = 'estudio', notas = '' }) {
    const cli = state.clientes.find(c => c.id === clienteId);
    if (!cli) throw new Error('Cliente no existe');
    const tipo = TIPOS_SESION.find(t => t.id === tipoSesionId);
    if (!tipo) throw new Error('Tipo de sesión inválido');
    const paquete = PAQUETES.find(p => p.id === paqueteId);
    if (!paquete) throw new Error('Paquete inválido');

    const fecha = new Date(fechaISO);
    if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');

    if (haySolape(fotografoId, fecha, tipo.duracionMin)) {
      throw new Error('El fotógrafo ya tiene una sesión que se traslapa');
    }

    const total = tipo.precioBase + paquete.precio;
    const sesion = {
      id: uid('SES', 'ses'),
      clienteId, tipoSesionId, paqueteId, fotografoId,
      fechaISO: fecha.toISOString(),
      duracionMin: tipo.duracionMin,
      ubicacion, notas,
      estado: 'agendada',
      total, anticipo: 0, saldo: total,
      fotosCapturadas: 0,
      seleccionCliente: [],
      albumId: null,
      retoques: [],
      creada: new Date().toISOString()
    };
    state.sesiones.push(sesion);
    cli.historialSesiones.push(sesion.id);

    state.agenda.push({
      id: uid('AG', 'ag'),
      sesionId: sesion.id, fotografoId,
      inicio: fecha.toISOString(),
      fin: new Date(fecha.getTime() + tipo.duracionMin * 60000).toISOString()
    });

    persistir();
    return sesion;
  }

  function haySolape(fotografoId, inicio, duracionMin) {
    const fin = new Date(inicio.getTime() + duracionMin * 60000);
    return state.agenda.some(a => {
      if (a.fotografoId !== fotografoId) return false;
      const ai = new Date(a.inicio), af = new Date(a.fin);
      return inicio < af && fin > ai;
    });
  }

  function cambiarEstadoSesion(sesionId, nuevoEstado) {
    if (!ESTADOS_SESION.includes(nuevoEstado)) throw new Error('Estado inválido');
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    s.estado = nuevoEstado;
    if (nuevoEstado === 'cancelada') {
      const idx = state.agenda.findIndex(a => a.sesionId === sesionId);
      if (idx >= 0) state.agenda.splice(idx, 1);
    }
    persistir();
    return s;
  }

  function registrarCapturas(sesionId, cantidad) {
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    s.fotosCapturadas += cantidad;
    if (s.estado === 'agendada' || s.estado === 'confirmada') s.estado = 'tomada';
    persistir();
    return s;
  }

  function registrarSeleccion(sesionId, listaIds) {
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    s.seleccionCliente = Array.from(new Set([...s.seleccionCliente, ...listaIds]));
    persistir();
    return s;
  }

  // ─────────────────────────────────────────────────────────────
  // Álbumes
  // ─────────────────────────────────────────────────────────────
  function crearAlbum({ sesionId, formato = '30x30', paginas = 20, portada = 'tapa_dura', precio = 0 }) {
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    const album = {
      id: uid('ALB', 'alb'),
      sesionId, formato, paginas, portada, precio,
      estado: 'diseno', // diseno → aprobado → impresion → entregado
      diapositivas: []
    };
    state.albumes.push(album);
    s.albumId = album.id;
    s.total += precio;
    s.saldo += precio;
    persistir();
    return album;
  }
  function aprobarAlbum(albumId) {
    const a = state.albumes.find(x => x.id === albumId);
    if (!a) throw new Error('Álbum no encontrado');
    a.estado = 'aprobado';
    persistir();
    return a;
  }

  // ─────────────────────────────────────────────────────────────
  // Retoque
  // ─────────────────────────────────────────────────────────────
  function asignarRetoque({ sesionId, tipoRetoqueId, cantidad = 1, asignadoA = '' }) {
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    const t = TIPOS_RETOQUE.find(x => x.id === tipoRetoqueId);
    if (!t) throw new Error('Tipo de retoque inválido');
    const trabajo = {
      id: uid('RET', 'ret'),
      sesionId, tipoRetoqueId, cantidad,
      asignadoA,
      precioUnit: t.precio,
      total: t.precio * cantidad,
      estado: 'pendiente', // pendiente → en_proceso → revision → terminado
      creado: new Date().toISOString()
    };
    state.trabajosRetoque.push(trabajo);
    s.retoques.push(trabajo.id);
    s.total += trabajo.total;
    s.saldo += trabajo.total;
    if (s.estado === 'tomada') s.estado = 'en_edicion';
    persistir();
    return trabajo;
  }
  function avanzarRetoque(retId, nuevoEstado) {
    const r = state.trabajosRetoque.find(x => x.id === retId);
    if (!r) throw new Error('Retoque no encontrado');
    r.estado = nuevoEstado;
    persistir();
    return r;
  }

  // ─────────────────────────────────────────────────────────────
  // Pagos
  // ─────────────────────────────────────────────────────────────
  function registrarPago({ sesionId, monto, metodo = 'efectivo', concepto = 'anticipo' }) {
    const s = state.sesiones.find(x => x.id === sesionId);
    if (!s) throw new Error('Sesión no encontrada');
    if (monto <= 0) throw new Error('Monto inválido');
    const pago = {
      id: uid('PG', 'pg'),
      sesionId, monto, metodo, concepto,
      fecha: new Date().toISOString()
    };
    state.pagos.push(pago);
    if (concepto === 'anticipo') s.anticipo += monto;
    s.saldo = Math.max(0, s.total - sumarPagos(sesionId));
    persistir();
    return pago;
  }
  function sumarPagos(sesionId) {
    return state.pagos.filter(p => p.sesionId === sesionId).reduce((a, p) => a + p.monto, 0);
  }

  // ─────────────────────────────────────────────────────────────
  // Agenda y reportes
  // ─────────────────────────────────────────────────────────────
  function agendaDelDia(fechaISO) {
    const f = new Date(fechaISO);
    const ini = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
    const fin = ini + 86400000;
    return state.agenda
      .filter(a => {
        const t = new Date(a.inicio).getTime();
        return t >= ini && t < fin;
      })
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  }

  function reporteIngresos(rangoDias = 30) {
    const desde = Date.now() - rangoDias * 86400000;
    const pagos = state.pagos.filter(p => new Date(p.fecha).getTime() >= desde);
    const total = pagos.reduce((a, p) => a + p.monto, 0);
    const porMetodo = pagos.reduce((acc, p) => {
      acc[p.metodo] = (acc[p.metodo] || 0) + p.monto;
      return acc;
    }, {});
    return { rangoDias, totalPagos: pagos.length, ingresoTotal: total, porMetodo };
  }

  function pendientesEntrega() {
    return state.sesiones.filter(s =>
      ['en_edicion', 'lista'].includes(s.estado) && s.saldo >= 0
    );
  }

  function dashboard() {
    return {
      clientes: state.clientes.length,
      sesionesActivas: state.sesiones.filter(s => !['entregada', 'cancelada'].includes(s.estado)).length,
      sesionesHoy: agendaDelDia(new Date().toISOString()).length,
      retoquesPendientes: state.trabajosRetoque.filter(r => r.estado !== 'terminado').length,
      albumesEnProceso: state.albumes.filter(a => a.estado !== 'entregado').length,
      ingresos30d: reporteIngresos(30).ingresoTotal
    };
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  global.FotografiaAPI = {
    // catálogos
    TIPOS_SESION, PAQUETES, TIPOS_RETOQUE, ESTADOS_SESION,
    // clientes
    crearCliente, buscarCliente,
    listarClientes: () => state.clientes.slice(),
    // sesiones
    agendarSesion, cambiarEstadoSesion, registrarCapturas, registrarSeleccion,
    listarSesiones: (filtro = {}) => state.sesiones.filter(s =>
      Object.entries(filtro).every(([k, v]) => s[k] === v)),
    obtenerSesion: (id) => state.sesiones.find(s => s.id === id),
    // álbumes
    crearAlbum, aprobarAlbum,
    listarAlbumes: () => state.albumes.slice(),
    // retoque
    asignarRetoque, avanzarRetoque,
    listarRetoques: () => state.trabajosRetoque.slice(),
    // pagos
    registrarPago, sumarPagos,
    // agenda y reportes
    agendaDelDia, reporteIngresos, pendientesEntrega, dashboard,
    // utilidades
    exportar: () => JSON.stringify(state, null, 2),
    importar: (json) => {
      const data = JSON.parse(json);
      Object.assign(state, data);
      persistir();
    },
    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      location && location.reload && location.reload();
    },
    _state: state
  };

  console.log('[Volvix Fotografía] vertical cargado. window.FotografiaAPI listo.');
})(typeof window !== 'undefined' ? window : globalThis);
