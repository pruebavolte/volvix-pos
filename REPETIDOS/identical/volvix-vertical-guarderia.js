/**
 * Volvix Vertical - Guardería / Kinder
 * Sistema POS especializado para guarderías, kinders y estancias infantiles.
 *
 * Funcionalidades:
 *  - Registro de niños (niño, tutor, alergias, médico, contactos emergencia)
 *  - Control de asistencia (check-in / check-out con firma del tutor)
 *  - Mensualidades / colegiaturas (pagos recurrentes, recargos)
 *  - Eventos (festivales, kermesses, paseos) con cobro
 *  - Notificaciones a padres (SMS / WhatsApp / Email simulado)
 *  - Reportes diarios (asistencia, ingresos, alertas)
 *
 * API global: window.GuarderiaAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // STORAGE
  // ============================================================
  const STORE_KEY = 'volvix_guarderia_v1';

  const _defaultState = () => ({
    ninos: [],
    tutores: [],
    asistencias: [],
    mensualidades: [],
    pagos: [],
    eventos: [],
    inscripcionesEvento: [],
    notificaciones: [],
    config: {
      nombreEstancia: 'Guardería Volvix',
      colegiaturaDefault: 2500,
      diaCorte: 5,
      recargoPorcentaje: 10,
      horaEntrada: '08:00',
      horaSalida: '14:00',
      toleranciaMinutos: 15,
    },
    _seq: { nino: 1, tutor: 1, asis: 1, mens: 1, pago: 1, evt: 1, insc: 1, notif: 1 },
  });

  let state = _load();

  function _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return _defaultState();
      return Object.assign(_defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('[Guarderia] storage corrupto, reinicio', e);
      return _defaultState();
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Guarderia] no pude guardar', e);
    }
  }

  function _id(seq) {
    const n = state._seq[seq]++;
    _save();
    return n;
  }

  function _now() {
    return new Date().toISOString();
  }

  // ============================================================
  // NIÑOS
  // ============================================================
  function registrarNino(data) {
    if (!data || !data.nombre) throw new Error('nombre requerido');
    const nino = {
      id: _id('nino'),
      nombre: data.nombre,
      fechaNacimiento: data.fechaNacimiento || null,
      grupo: data.grupo || 'Maternal',
      tutorIds: data.tutorIds || [],
      alergias: data.alergias || [],
      medicamentos: data.medicamentos || [],
      medicoNombre: data.medicoNombre || '',
      medicoTel: data.medicoTel || '',
      contactosEmergencia: data.contactosEmergencia || [],
      foto: data.foto || null,
      activo: true,
      colegiatura: data.colegiatura || state.config.colegiaturaDefault,
      creado: _now(),
    };
    state.ninos.push(nino);
    _save();
    return nino;
  }

  function listarNinos(filtro = {}) {
    return state.ninos.filter((n) => {
      if (filtro.activo !== undefined && n.activo !== filtro.activo) return false;
      if (filtro.grupo && n.grupo !== filtro.grupo) return false;
      if (filtro.q) {
        const q = filtro.q.toLowerCase();
        if (!n.nombre.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function obtenerNino(id) {
    return state.ninos.find((n) => n.id === id) || null;
  }

  function darBajaNino(id, motivo) {
    const n = obtenerNino(id);
    if (!n) throw new Error('niño no existe');
    n.activo = false;
    n.bajaMotivo = motivo || '';
    n.bajaFecha = _now();
    _save();
    return n;
  }

  // ============================================================
  // TUTORES
  // ============================================================
  function registrarTutor(data) {
    if (!data.nombre) throw new Error('nombre tutor requerido');
    const t = {
      id: _id('tutor'),
      nombre: data.nombre,
      parentesco: data.parentesco || 'Padre/Madre',
      telefono: data.telefono || '',
      email: data.email || '',
      ine: data.ine || '',
      autorizadoRecoger: data.autorizadoRecoger !== false,
      preferenciaContacto: data.preferenciaContacto || 'whatsapp',
      creado: _now(),
    };
    state.tutores.push(t);
    _save();
    return t;
  }

  function obtenerTutor(id) {
    return state.tutores.find((t) => t.id === id) || null;
  }

  function tutoresDeNino(ninoId) {
    const n = obtenerNino(ninoId);
    if (!n) return [];
    return n.tutorIds.map(obtenerTutor).filter(Boolean);
  }

  // ============================================================
  // ASISTENCIA
  // ============================================================
  function checkIn(ninoId, tutorId, opts = {}) {
    const n = obtenerNino(ninoId);
    if (!n) throw new Error('niño no existe');
    if (!n.activo) throw new Error('niño dado de baja');
    const abierta = state.asistencias.find(
      (a) => a.ninoId === ninoId && !a.salida
    );
    if (abierta) throw new Error('ya tiene asistencia abierta hoy');
    const a = {
      id: _id('asis'),
      ninoId,
      entradaTutorId: tutorId,
      entrada: _now(),
      salida: null,
      salidaTutorId: null,
      firmaEntrada: opts.firma || null,
      observacionesEntrada: opts.observaciones || '',
      tarde: _esTarde(state.config.horaEntrada),
    };
    state.asistencias.push(a);
    _save();
    notificarTutores(ninoId, `Check-in registrado a las ${new Date(a.entrada).toLocaleTimeString()}`);
    return a;
  }

  function checkOut(ninoId, tutorId, opts = {}) {
    const a = state.asistencias.find(
      (x) => x.ninoId === ninoId && !x.salida
    );
    if (!a) throw new Error('no hay asistencia abierta');
    const tut = obtenerTutor(tutorId);
    if (!tut) throw new Error('tutor no existe');
    if (!tut.autorizadoRecoger) throw new Error('tutor no autorizado para recoger');
    a.salida = _now();
    a.salidaTutorId = tutorId;
    a.firmaSalida = opts.firma || null;
    a.observacionesSalida = opts.observaciones || '';
    _save();
    notificarTutores(ninoId, `Check-out registrado a las ${new Date(a.salida).toLocaleTimeString()}`);
    return a;
  }

  function asistenciaHoy() {
    const hoy = new Date().toISOString().slice(0, 10);
    return state.asistencias.filter((a) => a.entrada.slice(0, 10) === hoy);
  }

  function _esTarde(horaLimite) {
    const [h, m] = horaLimite.split(':').map(Number);
    const lim = new Date();
    lim.setHours(h, m + state.config.toleranciaMinutos, 0, 0);
    return new Date() > lim;
  }

  // ============================================================
  // MENSUALIDADES / COLEGIATURAS
  // ============================================================
  function generarMensualidades(periodo) {
    // periodo: "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('periodo inválido');
    const generadas = [];
    state.ninos.filter((n) => n.activo).forEach((n) => {
      const ya = state.mensualidades.find(
        (m) => m.ninoId === n.id && m.periodo === periodo
      );
      if (ya) return;
      const m = {
        id: _id('mens'),
        ninoId: n.id,
        periodo,
        monto: n.colegiatura,
        recargo: 0,
        pagado: false,
        fechaLimite: `${periodo}-${String(state.config.diaCorte).padStart(2, '0')}`,
        generado: _now(),
      };
      state.mensualidades.push(m);
      generadas.push(m);
    });
    _save();
    return generadas;
  }

  function aplicarRecargos() {
    const hoy = new Date().toISOString().slice(0, 10);
    let aplicados = 0;
    state.mensualidades.forEach((m) => {
      if (!m.pagado && m.recargo === 0 && hoy > m.fechaLimite) {
        m.recargo = Math.round(m.monto * (state.config.recargoPorcentaje / 100));
        aplicados++;
        notificarTutores(m.ninoId, `Recargo aplicado a colegiatura ${m.periodo}: $${m.recargo}`);
      }
    });
    _save();
    return aplicados;
  }

  function registrarPago(mensualidadId, monto, metodo) {
    const m = state.mensualidades.find((x) => x.id === mensualidadId);
    if (!m) throw new Error('mensualidad no existe');
    if (m.pagado) throw new Error('ya pagada');
    const total = m.monto + m.recargo;
    if (monto < total) throw new Error(`monto insuficiente, requiere $${total}`);
    const p = {
      id: _id('pago'),
      mensualidadId,
      ninoId: m.ninoId,
      monto,
      metodo: metodo || 'efectivo',
      fecha: _now(),
      cambio: monto - total,
    };
    state.pagos.push(p);
    m.pagado = true;
    m.fechaPago = p.fecha;
    _save();
    notificarTutores(m.ninoId, `Pago recibido por $${monto} - colegiatura ${m.periodo}`);
    return p;
  }

  function adeudosPorNino(ninoId) {
    return state.mensualidades.filter((m) => m.ninoId === ninoId && !m.pagado);
  }

  // ============================================================
  // EVENTOS
  // ============================================================
  function crearEvento(data) {
    if (!data.nombre || !data.fecha) throw new Error('nombre y fecha requeridos');
    const e = {
      id: _id('evt'),
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      fecha: data.fecha,
      lugar: data.lugar || '',
      costo: data.costo || 0,
      cupo: data.cupo || null,
      tipo: data.tipo || 'festival',
      creado: _now(),
    };
    state.eventos.push(e);
    _save();
    // Notificar a todos los tutores activos
    state.ninos.filter((n) => n.activo).forEach((n) => {
      notificarTutores(n.id, `Nuevo evento: ${e.nombre} el ${e.fecha}. Costo: $${e.costo}`);
    });
    return e;
  }

  function inscribirEvento(eventoId, ninoId) {
    const e = state.eventos.find((x) => x.id === eventoId);
    if (!e) throw new Error('evento no existe');
    const yainsc = state.inscripcionesEvento.find(
      (i) => i.eventoId === eventoId && i.ninoId === ninoId
    );
    if (yainsc) throw new Error('ya inscrito');
    if (e.cupo) {
      const total = state.inscripcionesEvento.filter((i) => i.eventoId === eventoId).length;
      if (total >= e.cupo) throw new Error('cupo lleno');
    }
    const i = {
      id: _id('insc'),
      eventoId,
      ninoId,
      pagado: e.costo === 0,
      fecha: _now(),
    };
    state.inscripcionesEvento.push(i);
    _save();
    return i;
  }

  function listarEventos(futuros = true) {
    const hoy = new Date().toISOString().slice(0, 10);
    return state.eventos.filter((e) => (futuros ? e.fecha >= hoy : true));
  }

  // ============================================================
  // NOTIFICACIONES A PADRES
  // ============================================================
  function notificarTutores(ninoId, mensaje, canal) {
    const tuts = tutoresDeNino(ninoId);
    const enviadas = [];
    tuts.forEach((t) => {
      const c = canal || t.preferenciaContacto;
      const n = {
        id: _id('notif'),
        tutorId: t.id,
        ninoId,
        canal: c,
        destino: c === 'email' ? t.email : t.telefono,
        mensaje,
        enviado: _now(),
        estado: 'enviado',
      };
      state.notificaciones.push(n);
      enviadas.push(n);
      // Hook: integración real con SMS/WhatsApp/email iría aquí
      if (global.GuarderiaHooks && typeof global.GuarderiaHooks.onNotify === 'function') {
        try { global.GuarderiaHooks.onNotify(n); } catch (e) { console.warn(e); }
      }
    });
    _save();
    return enviadas;
  }

  function bandejaNotificaciones(limite = 50) {
    return state.notificaciones.slice(-limite).reverse();
  }

  // ============================================================
  // REPORTES
  // ============================================================
  function reporteDiario(fecha) {
    const f = fecha || new Date().toISOString().slice(0, 10);
    const asis = state.asistencias.filter((a) => a.entrada.slice(0, 10) === f);
    const pagosDia = state.pagos.filter((p) => p.fecha.slice(0, 10) === f);
    return {
      fecha: f,
      asistenciasTotal: asis.length,
      tarde: asis.filter((a) => a.tarde).length,
      pendientesSalida: asis.filter((a) => !a.salida).length,
      ingresos: pagosDia.reduce((s, p) => s + p.monto, 0),
      pagos: pagosDia.length,
      ninosActivos: state.ninos.filter((n) => n.activo).length,
    };
  }

  function reporteMorosos() {
    const hoy = new Date().toISOString().slice(0, 10);
    return state.mensualidades
      .filter((m) => !m.pagado && hoy > m.fechaLimite)
      .map((m) => ({
        ...m,
        nino: obtenerNino(m.ninoId),
        diasVencido: Math.ceil(
          (new Date(hoy) - new Date(m.fechaLimite)) / 86400000
        ),
      }));
  }

  // ============================================================
  // CONFIG
  // ============================================================
  function setConfig(patch) {
    Object.assign(state.config, patch || {});
    _save();
    return state.config;
  }

  function getConfig() {
    return { ...state.config };
  }

  function resetAll() {
    state = _defaultState();
    _save();
  }

  // ============================================================
  // EXPORT
  // ============================================================
  global.GuarderiaAPI = {
    // niños
    registrarNino, listarNinos, obtenerNino, darBajaNino,
    // tutores
    registrarTutor, obtenerTutor, tutoresDeNino,
    // asistencia
    checkIn, checkOut, asistenciaHoy,
    // mensualidades
    generarMensualidades, aplicarRecargos, registrarPago, adeudosPorNino,
    // eventos
    crearEvento, inscribirEvento, listarEventos,
    // notificaciones
    notificarTutores, bandejaNotificaciones,
    // reportes
    reporteDiario, reporteMorosos,
    // config
    setConfig, getConfig, resetAll,
    // meta
    version: '1.0.0',
    vertical: 'guarderia',
  };

  console.log('[Volvix] Vertical Guardería cargada v1.0.0');
})(typeof window !== 'undefined' ? window : globalThis);
