/**
 * volvix-vertical-pethotel.js
 * Vertical: Hotel Canino / Pet Hotel POS
 * Gestion de estancias, paseos, banos, reservaciones y agenda.
 * Expone window.PetHotelAPI
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_pethotel_v1';
  const PRICING = {
    estancia_dia: 350,
    estancia_dia_grande: 450,
    paseo_30min: 120,
    paseo_60min: 200,
    bano_basico: 250,
    bano_premium: 450,
    corte_pelo: 380,
    guarderia_dia: 220,
    transporte: 150,
  };

  const STATE = {
    huespedes: [],     // perros registrados
    duenos: [],        // clientes
    reservaciones: [], // bookings de estancia
    servicios: [],     // paseos, banos, etc agendados
    agenda: [],        // eventos del dia
    facturas: [],      // tickets cobrados
    jaulas: [],        // inventario de jaulas/habitaciones
  };

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(STATE, parsed);
      }
    } catch (e) {
      console.warn('[PetHotel] no se pudo cargar estado:', e);
    }
    if (!STATE.jaulas.length) seedJaulas();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
    } catch (e) {
      console.warn('[PetHotel] no se pudo guardar estado:', e);
    }
  }

  function seedJaulas() {
    const tamanos = ['chica', 'chica', 'chica', 'mediana', 'mediana', 'mediana', 'grande', 'grande', 'suite', 'suite'];
    tamanos.forEach((t, i) => {
      STATE.jaulas.push({
        id: uid('jaula'),
        numero: i + 1,
        tamano: t,
        ocupada: false,
        huespedId: null,
      });
    });
  }

  // ─── DUENOS ─────────────────────────────────────────────
  function registrarDueno({ nombre, telefono, email, direccion }) {
    if (!nombre || !telefono) throw new Error('nombre y telefono requeridos');
    const dueno = { id: uid('due'), nombre, telefono, email: email || '', direccion: direccion || '', creadoEn: Date.now() };
    STATE.duenos.push(dueno);
    save();
    return dueno;
  }

  function buscarDueno(query) {
    const q = (query || '').toLowerCase();
    return STATE.duenos.filter(d =>
      d.nombre.toLowerCase().includes(q) ||
      d.telefono.includes(q) ||
      (d.email || '').toLowerCase().includes(q)
    );
  }

  // ─── HUESPEDES (perros) ─────────────────────────────────
  function registrarHuesped({ duenoId, nombre, raza, tamano, edad, peso, vacunas, notas }) {
    if (!duenoId || !nombre) throw new Error('duenoId y nombre requeridos');
    const dueno = STATE.duenos.find(d => d.id === duenoId);
    if (!dueno) throw new Error('dueno no encontrado');
    const huesped = {
      id: uid('per'),
      duenoId,
      nombre,
      raza: raza || 'mestizo',
      tamano: tamano || 'mediana',
      edad: edad || 0,
      peso: peso || 0,
      vacunas: vacunas || [],
      notas: notas || '',
      historial: [],
      creadoEn: Date.now(),
    };
    STATE.huespedes.push(huesped);
    save();
    return huesped;
  }

  function listarHuespedesDe(duenoId) {
    return STATE.huespedes.filter(h => h.duenoId === duenoId);
  }

  // ─── JAULAS ─────────────────────────────────────────────
  function asignarJaula(huespedId, tamanoPreferido) {
    const huesped = STATE.huespedes.find(h => h.id === huespedId);
    if (!huesped) throw new Error('huesped no encontrado');
    const tamano = tamanoPreferido || huesped.tamano;
    const jaula = STATE.jaulas.find(j => !j.ocupada && j.tamano === tamano)
      || STATE.jaulas.find(j => !j.ocupada);
    if (!jaula) throw new Error('no hay jaulas disponibles');
    jaula.ocupada = true;
    jaula.huespedId = huespedId;
    save();
    return jaula;
  }

  function liberarJaula(jaulaId) {
    const j = STATE.jaulas.find(x => x.id === jaulaId);
    if (!j) throw new Error('jaula no existe');
    j.ocupada = false;
    j.huespedId = null;
    save();
    return j;
  }

  function jaulasDisponibles() {
    return STATE.jaulas.filter(j => !j.ocupada);
  }

  // ─── RESERVACIONES (estancia) ───────────────────────────
  function crearReservacion({ huespedId, fechaEntrada, fechaSalida, tamanoJaula, notas }) {
    const huesped = STATE.huespedes.find(h => h.id === huespedId);
    if (!huesped) throw new Error('huesped no encontrado');
    const dEntrada = new Date(fechaEntrada).getTime();
    const dSalida = new Date(fechaSalida).getTime();
    if (isNaN(dEntrada) || isNaN(dSalida) || dSalida <= dEntrada) {
      throw new Error('fechas invalidas');
    }
    const dias = Math.max(1, Math.ceil((dSalida - dEntrada) / (1000 * 60 * 60 * 24)));
    const tarifa = (tamanoJaula === 'grande' || tamanoJaula === 'suite')
      ? PRICING.estancia_dia_grande : PRICING.estancia_dia;
    const total = dias * tarifa;
    const reserva = {
      id: uid('res'),
      huespedId,
      fechaEntrada: dEntrada,
      fechaSalida: dSalida,
      dias,
      tamanoJaula: tamanoJaula || huesped.tamano,
      tarifaDia: tarifa,
      total,
      estado: 'reservada',
      notas: notas || '',
      jaulaId: null,
      creadoEn: Date.now(),
    };
    STATE.reservaciones.push(reserva);
    agendar({
      tipo: 'check-in',
      fecha: dEntrada,
      refId: reserva.id,
      titulo: 'Check-in ' + huesped.nombre,
    });
    agendar({
      tipo: 'check-out',
      fecha: dSalida,
      refId: reserva.id,
      titulo: 'Check-out ' + huesped.nombre,
    });
    save();
    return reserva;
  }

  function checkIn(reservaId) {
    const r = STATE.reservaciones.find(x => x.id === reservaId);
    if (!r) throw new Error('reservacion no existe');
    if (r.estado !== 'reservada') throw new Error('estado invalido: ' + r.estado);
    const jaula = asignarJaula(r.huespedId, r.tamanoJaula);
    r.jaulaId = jaula.id;
    r.estado = 'en_estancia';
    r.checkInReal = Date.now();
    save();
    return r;
  }

  function checkOut(reservaId) {
    const r = STATE.reservaciones.find(x => x.id === reservaId);
    if (!r) throw new Error('reservacion no existe');
    if (r.estado !== 'en_estancia') throw new Error('huesped no esta en estancia');
    if (r.jaulaId) liberarJaula(r.jaulaId);
    r.estado = 'finalizada';
    r.checkOutReal = Date.now();
    const factura = facturar(r.huespedId, [
      { concepto: 'Estancia ' + r.dias + ' dia(s)', monto: r.total, refId: r.id },
    ]);
    save();
    return { reserva: r, factura };
  }

  // ─── SERVICIOS (paseos, banos, corte) ───────────────────
  function agendarServicio({ huespedId, tipo, fecha, duracion, notas }) {
    const huesped = STATE.huespedes.find(h => h.id === huespedId);
    if (!huesped) throw new Error('huesped no encontrado');
    const tarifa = tarifaServicio(tipo, duracion);
    if (tarifa == null) throw new Error('tipo de servicio invalido: ' + tipo);
    const f = new Date(fecha).getTime();
    if (isNaN(f)) throw new Error('fecha invalida');
    const srv = {
      id: uid('srv'),
      huespedId,
      tipo,
      duracion: duracion || null,
      fecha: f,
      tarifa,
      estado: 'agendado',
      notas: notas || '',
      creadoEn: Date.now(),
    };
    STATE.servicios.push(srv);
    agendar({
      tipo: 'servicio',
      subtipo: tipo,
      fecha: f,
      refId: srv.id,
      titulo: tipo + ' - ' + huesped.nombre,
    });
    save();
    return srv;
  }

  function tarifaServicio(tipo, duracion) {
    if (tipo === 'paseo') {
      if (duracion === 60) return PRICING.paseo_60min;
      return PRICING.paseo_30min;
    }
    if (tipo === 'bano') {
      return duracion === 'premium' ? PRICING.bano_premium : PRICING.bano_basico;
    }
    if (tipo === 'corte') return PRICING.corte_pelo;
    if (tipo === 'guarderia') return PRICING.guarderia_dia;
    if (tipo === 'transporte') return PRICING.transporte;
    return null;
  }

  function completarServicio(servicioId) {
    const s = STATE.servicios.find(x => x.id === servicioId);
    if (!s) throw new Error('servicio no existe');
    s.estado = 'completado';
    s.completadoEn = Date.now();
    const huesped = STATE.huespedes.find(h => h.id === s.huespedId);
    if (huesped) {
      huesped.historial.push({ servicioId: s.id, tipo: s.tipo, fecha: s.completadoEn });
    }
    save();
    return s;
  }

  // ─── AGENDA ─────────────────────────────────────────────
  function agendar(evento) {
    const ev = Object.assign({ id: uid('ev') }, evento);
    STATE.agenda.push(ev);
    save();
    return ev;
  }

  function agendaDelDia(fechaRef) {
    const base = fechaRef ? new Date(fechaRef) : new Date();
    const ini = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
    const fin = ini + 24 * 60 * 60 * 1000;
    return STATE.agenda
      .filter(e => e.fecha >= ini && e.fecha < fin)
      .sort((a, b) => a.fecha - b.fecha);
  }

  function agendaRango(desde, hasta) {
    const d = new Date(desde).getTime();
    const h = new Date(hasta).getTime();
    return STATE.agenda
      .filter(e => e.fecha >= d && e.fecha <= h)
      .sort((a, b) => a.fecha - b.fecha);
  }

  // ─── FACTURACION ────────────────────────────────────────
  function facturar(huespedId, conceptos) {
    if (!Array.isArray(conceptos) || !conceptos.length) throw new Error('conceptos vacios');
    const subtotal = conceptos.reduce((acc, c) => acc + Number(c.monto || 0), 0);
    const iva = +(subtotal * 0.16).toFixed(2);
    const total = +(subtotal + iva).toFixed(2);
    const f = {
      id: uid('fac'),
      folio: 'PH-' + (STATE.facturas.length + 1).toString().padStart(5, '0'),
      huespedId,
      conceptos,
      subtotal,
      iva,
      total,
      estado: 'pagada',
      fecha: Date.now(),
    };
    STATE.facturas.push(f);
    save();
    return f;
  }

  function totalDelDia(fechaRef) {
    const base = fechaRef ? new Date(fechaRef) : new Date();
    const ini = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
    const fin = ini + 24 * 60 * 60 * 1000;
    return STATE.facturas
      .filter(f => f.fecha >= ini && f.fecha < fin)
      .reduce((acc, f) => acc + f.total, 0);
  }

  // ─── REPORTES ───────────────────────────────────────────
  function ocupacion() {
    const total = STATE.jaulas.length;
    const ocupadas = STATE.jaulas.filter(j => j.ocupada).length;
    return {
      total,
      ocupadas,
      libres: total - ocupadas,
      porcentaje: total ? +((ocupadas / total) * 100).toFixed(1) : 0,
    };
  }

  function resumen() {
    return {
      duenos: STATE.duenos.length,
      huespedes: STATE.huespedes.length,
      reservasActivas: STATE.reservaciones.filter(r => r.estado === 'en_estancia').length,
      reservasPendientes: STATE.reservaciones.filter(r => r.estado === 'reservada').length,
      serviciosHoy: agendaDelDia().length,
      ocupacion: ocupacion(),
      ingresosHoy: totalDelDia(),
    };
  }

  function reset() {
    STATE.huespedes = [];
    STATE.duenos = [];
    STATE.reservaciones = [];
    STATE.servicios = [];
    STATE.agenda = [];
    STATE.facturas = [];
    STATE.jaulas = [];
    seedJaulas();
    save();
  }

  // ─── BOOTSTRAP ──────────────────────────────────────────
  load();

  global.PetHotelAPI = {
    PRICING,
    // duenos
    registrarDueno,
    buscarDueno,
    // huespedes
    registrarHuesped,
    listarHuespedesDe,
    // jaulas
    asignarJaula,
    liberarJaula,
    jaulasDisponibles,
    // reservaciones
    crearReservacion,
    checkIn,
    checkOut,
    // servicios
    agendarServicio,
    completarServicio,
    tarifaServicio,
    // agenda
    agendar,
    agendaDelDia,
    agendaRango,
    // facturacion
    facturar,
    totalDelDia,
    // reportes
    ocupacion,
    resumen,
    // utilidades
    _state: STATE,
    reset,
  };

  console.log('[PetHotel] API lista. Llama window.PetHotelAPI.resumen() para ver estado.');
})(typeof window !== 'undefined' ? window : globalThis);
