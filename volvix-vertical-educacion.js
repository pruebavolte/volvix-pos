/* ============================================================================
 * VOLVIX VERTICAL EDUCACIÓN
 * Módulo POS para escuelas: alumnos, mensualidades, becas, calificaciones,
 * ciclos escolares, materias, profesores, grupos, asistencia, reportes.
 * Expone: window.EducacionAPI
 * ============================================================================
 */
(function (global) {
    'use strict';

    // ----- Storage ---------------------------------------------------------
    const NS = 'volvix_edu_';
    const K = {
        ciclos:    NS + 'ciclos',
        alumnos:   NS + 'alumnos',
        tutores:   NS + 'tutores',
        grupos:    NS + 'grupos',
        materias:  NS + 'materias',
        profes:    NS + 'profesores',
        mensual:   NS + 'mensualidades',
        pagos:     NS + 'pagos',
        becas:     NS + 'becas',
        califs:    NS + 'calificaciones',
        asist:     NS + 'asistencia',
        config:    NS + 'config'
    };

    function _get(k, def) {
        try { return JSON.parse(localStorage.getItem(k)) ?? def; }
        catch (e) { return def; }
    }
    function _set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
    function _uid(p) { return (p || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    function _today() { return new Date().toISOString().slice(0, 10); }

    // ----- Config por defecto ---------------------------------------------
    const DEFAULT_CONFIG = {
        nombreEscuela: 'Escuela Volvix',
        moneda: 'MXN',
        diaCorte: 5,           // día del mes para considerar mensualidad atrasada
        recargoPctMensual: 10, // % recargo por mensualidad vencida
        escalaCalif: { min: 0, max: 10, aprobatoria: 6 },
        nivelesEducativos: ['Preescolar', 'Primaria', 'Secundaria', 'Preparatoria']
    };

    function getConfig()        { return _get(K.config, DEFAULT_CONFIG); }
    function setConfig(cfg)     { _set(K.config, Object.assign(getConfig(), cfg || {})); return getConfig(); }

    // ============================================================
    // CICLOS ESCOLARES
    // ============================================================
    function listCiclos()          { return _get(K.ciclos, []); }
    function getCiclo(id)          { return listCiclos().find(c => c.id === id) || null; }
    function getCicloActivo()      { return listCiclos().find(c => c.activo) || null; }

    function createCiclo(data) {
        const ciclos = listCiclos();
        const c = {
            id: _uid('cic'),
            nombre: data.nombre || ('Ciclo ' + new Date().getFullYear()),
            inicio: data.inicio || _today(),
            fin:    data.fin    || '',
            activo: !!data.activo,
            createdAt: Date.now()
        };
        if (c.activo) ciclos.forEach(x => x.activo = false);
        ciclos.push(c);
        _set(K.ciclos, ciclos);
        return c;
    }

    function activarCiclo(id) {
        const ciclos = listCiclos().map(c => ({ ...c, activo: c.id === id }));
        _set(K.ciclos, ciclos);
        return getCiclo(id);
    }

    function deleteCiclo(id) {
        _set(K.ciclos, listCiclos().filter(c => c.id !== id));
        return true;
    }

    // ============================================================
    // ALUMNOS Y TUTORES
    // ============================================================
    function listAlumnos()        { return _get(K.alumnos, []); }
    function getAlumno(id)        { return listAlumnos().find(a => a.id === id) || null; }

    function createAlumno(data) {
        const alumnos = listAlumnos();
        const a = {
            id: _uid('alu'),
            matricula: data.matricula || ('M' + Date.now().toString().slice(-6)),
            nombre:    data.nombre    || '',
            apellidos: data.apellidos || '',
            fechaNac:  data.fechaNac  || '',
            genero:    data.genero    || '',
            nivel:     data.nivel     || '',
            grado:     data.grado     || '',
            grupoId:   data.grupoId   || null,
            tutorId:   data.tutorId   || null,
            beca:      data.beca      || 0,        // % beca aplicada
            colegiatura: Number(data.colegiatura || 0),
            activo:    data.activo !== false,
            ingreso:   data.ingreso   || _today(),
            createdAt: Date.now()
        };
        alumnos.push(a);
        _set(K.alumnos, alumnos);
        return a;
    }

    function updateAlumno(id, patch) {
        const alumnos = listAlumnos();
        const i = alumnos.findIndex(a => a.id === id);
        if (i < 0) return null;
        alumnos[i] = { ...alumnos[i], ...patch, id };
        _set(K.alumnos, alumnos);
        return alumnos[i];
    }

    function bajaAlumno(id, motivo) {
        return updateAlumno(id, { activo: false, motivoBaja: motivo || '', fechaBaja: _today() });
    }

    function listTutores()        { return _get(K.tutores, []); }
    function createTutor(data) {
        const t = {
            id: _uid('tut'),
            nombre: data.nombre || '',
            telefono: data.telefono || '',
            email: data.email || '',
            parentesco: data.parentesco || 'Padre/Madre',
            createdAt: Date.now()
        };
        const arr = listTutores(); arr.push(t); _set(K.tutores, arr);
        return t;
    }

    // ============================================================
    // GRUPOS, MATERIAS, PROFESORES
    // ============================================================
    function listGrupos()    { return _get(K.grupos, []); }
    function createGrupo(data) {
        const g = {
            id: _uid('grp'),
            nombre: data.nombre || '',
            nivel:  data.nivel  || '',
            grado:  data.grado  || '',
            cicloId: data.cicloId || (getCicloActivo()?.id ?? null),
            cupo:   Number(data.cupo || 30),
            createdAt: Date.now()
        };
        const arr = listGrupos(); arr.push(g); _set(K.grupos, arr);
        return g;
    }
    function alumnosDeGrupo(grupoId) {
        return listAlumnos().filter(a => a.grupoId === grupoId && a.activo);
    }

    function listMaterias()  { return _get(K.materias, []); }
    function createMateria(data) {
        const m = {
            id: _uid('mat'),
            nombre: data.nombre || '',
            clave:  data.clave  || '',
            creditos: Number(data.creditos || 0),
            grupoId: data.grupoId || null,
            profesorId: data.profesorId || null,
            createdAt: Date.now()
        };
        const arr = listMaterias(); arr.push(m); _set(K.materias, arr);
        return m;
    }

    function listProfesores() { return _get(K.profes, []); }
    function createProfesor(data) {
        const p = {
            id: _uid('prof'),
            nombre: data.nombre || '',
            email:  data.email  || '',
            telefono: data.telefono || '',
            especialidad: data.especialidad || '',
            createdAt: Date.now()
        };
        const arr = listProfesores(); arr.push(p); _set(K.profes, arr);
        return p;
    }

    // ============================================================
    // BECAS
    // ============================================================
    function listBecas()  { return _get(K.becas, []); }
    function createBeca(data) {
        const b = {
            id: _uid('bec'),
            alumnoId: data.alumnoId,
            porcentaje: Number(data.porcentaje || 0),
            motivo: data.motivo || '',
            cicloId: data.cicloId || (getCicloActivo()?.id ?? null),
            vigenteHasta: data.vigenteHasta || '',
            createdAt: Date.now()
        };
        const arr = listBecas(); arr.push(b); _set(K.becas, arr);
        // sincroniza el % en el alumno
        updateAlumno(b.alumnoId, { beca: b.porcentaje });
        return b;
    }
    function quitarBeca(id) {
        const becas = listBecas();
        const b = becas.find(x => x.id === id);
        _set(K.becas, becas.filter(x => x.id !== id));
        if (b) updateAlumno(b.alumnoId, { beca: 0 });
        return true;
    }

    // ============================================================
    // MENSUALIDADES Y PAGOS
    // ============================================================
    function listMensualidades() { return _get(K.mensual, []); }
    function listPagos()         { return _get(K.pagos, []); }

    /**
     * Genera mensualidades del ciclo activo para todos los alumnos activos.
     * meses: array tipo ['2026-01','2026-02',...] o cantidad numérica de meses desde hoy.
     */
    function generarMensualidades(meses) {
        const ciclo = getCicloActivo();
        if (!ciclo) throw new Error('No hay ciclo activo');
        let lista = [];
        if (Array.isArray(meses)) lista = meses;
        else {
            const n = Number(meses || 10);
            const d = new Date();
            for (let i = 0; i < n; i++) {
                const dd = new Date(d.getFullYear(), d.getMonth() + i, 1);
                lista.push(dd.toISOString().slice(0, 7));
            }
        }
        const mens = listMensualidades();
        const alumnos = listAlumnos().filter(a => a.activo);
        let nuevas = 0;
        alumnos.forEach(a => {
            lista.forEach(periodo => {
                const ya = mens.find(m => m.alumnoId === a.id && m.periodo === periodo && m.cicloId === ciclo.id);
                if (ya) return;
                const subtotal = Number(a.colegiatura || 0);
                const descuento = subtotal * (Number(a.beca || 0) / 100);
                mens.push({
                    id: _uid('mns'),
                    alumnoId: a.id,
                    cicloId: ciclo.id,
                    periodo,
                    subtotal,
                    descuento,
                    total: subtotal - descuento,
                    pagado: 0,
                    estado: 'pendiente',
                    createdAt: Date.now()
                });
                nuevas++;
            });
        });
        _set(K.mensual, mens);
        return { generadas: nuevas, total: mens.length };
    }

    function _calcRecargo(m) {
        const cfg = getConfig();
        const hoy = new Date();
        const [y, mo] = m.periodo.split('-').map(Number);
        const venc = new Date(y, mo - 1, cfg.diaCorte);
        if (hoy <= venc) return 0;
        const mesesAtraso = Math.max(1, (hoy.getFullYear() - y) * 12 + (hoy.getMonth() - (mo - 1)));
        return +(m.total * (cfg.recargoPctMensual / 100) * mesesAtraso).toFixed(2);
    }

    function pagarMensualidad(mensualidadId, monto, metodo) {
        const mens = listMensualidades();
        const m = mens.find(x => x.id === mensualidadId);
        if (!m) throw new Error('Mensualidad no encontrada');
        const recargo = _calcRecargo(m);
        const totalConRec = +(m.total + recargo).toFixed(2);
        const pago = Number(monto || totalConRec);
        m.pagado = +(Number(m.pagado || 0) + pago).toFixed(2);
        m.recargo = recargo;
        if (m.pagado >= totalConRec)         m.estado = 'pagado';
        else if (m.pagado > 0)               m.estado = 'parcial';
        else                                 m.estado = 'pendiente';
        _set(K.mensual, mens);

        const pagos = listPagos();
        const p = {
            id: _uid('pag'),
            mensualidadId,
            alumnoId: m.alumnoId,
            monto: pago,
            metodo: metodo || 'efectivo',
            fecha: _today(),
            createdAt: Date.now()
        };
        pagos.push(p); _set(K.pagos, pagos);
        return { mensualidad: m, pago: p };
    }

    function estadoCuentaAlumno(alumnoId) {
        const mens = listMensualidades().filter(m => m.alumnoId === alumnoId);
        const pagos = listPagos().filter(p => p.alumnoId === alumnoId);
        const totalCargado = mens.reduce((s, m) => s + m.total + _calcRecargo(m), 0);
        const totalPagado  = pagos.reduce((s, p) => s + p.monto, 0);
        return {
            alumno: getAlumno(alumnoId),
            mensualidades: mens,
            pagos,
            totalCargado: +totalCargado.toFixed(2),
            totalPagado:  +totalPagado.toFixed(2),
            saldo: +(totalCargado - totalPagado).toFixed(2)
        };
    }

    function listAdeudos() {
        return listMensualidades()
            .filter(m => m.estado !== 'pagado')
            .map(m => ({ ...m, recargo: _calcRecargo(m), alumno: getAlumno(m.alumnoId) }));
    }

    // ============================================================
    // CALIFICACIONES
    // ============================================================
    function listCalificaciones() { return _get(K.califs, []); }

    function registrarCalificacion(data) {
        // data: { alumnoId, materiaId, parcial, calif }
        const cfg = getConfig();
        const c = {
            id: _uid('cal'),
            alumnoId: data.alumnoId,
            materiaId: data.materiaId,
            parcial:   Number(data.parcial || 1),
            calif:     Math.min(cfg.escalaCalif.max, Math.max(cfg.escalaCalif.min, Number(data.calif || 0))),
            cicloId:   data.cicloId || (getCicloActivo()?.id ?? null),
            fecha:     _today(),
            createdAt: Date.now()
        };
        const arr = listCalificaciones(); arr.push(c); _set(K.califs, arr);
        return c;
    }

    function boletaAlumno(alumnoId, cicloId) {
        const cid = cicloId || getCicloActivo()?.id;
        const cfg = getConfig();
        const califs = listCalificaciones().filter(c => c.alumnoId === alumnoId && c.cicloId === cid);
        const materias = listMaterias();
        const map = {};
        califs.forEach(c => {
            (map[c.materiaId] = map[c.materiaId] || []).push(c);
        });
        const renglones = Object.keys(map).map(mid => {
            const mat = materias.find(x => x.id === mid);
            const arr = map[mid];
            const prom = arr.reduce((s, x) => s + x.calif, 0) / arr.length;
            return {
                materia: mat ? mat.nombre : '(?)',
                parciales: arr.map(x => ({ p: x.parcial, c: x.calif })),
                promedio: +prom.toFixed(2),
                estado: prom >= cfg.escalaCalif.aprobatoria ? 'aprobado' : 'reprobado'
            };
        });
        const promGen = renglones.length
            ? +(renglones.reduce((s, r) => s + r.promedio, 0) / renglones.length).toFixed(2)
            : 0;
        return { alumno: getAlumno(alumnoId), cicloId: cid, materias: renglones, promedioGeneral: promGen };
    }

    // ============================================================
    // ASISTENCIA
    // ============================================================
    function listAsistencia() { return _get(K.asist, []); }

    function pasarLista(grupoId, fecha, registros) {
        // registros: [{ alumnoId, presente:bool, justificada?:bool, nota? }]
        const arr = listAsistencia();
        const f = fecha || _today();
        registros.forEach(r => {
            arr.push({
                id: _uid('asi'),
                grupoId,
                alumnoId: r.alumnoId,
                fecha: f,
                presente: !!r.presente,
                justificada: !!r.justificada,
                nota: r.nota || '',
                createdAt: Date.now()
            });
        });
        _set(K.asist, arr);
        return registros.length;
    }

    function reporteAsistenciaAlumno(alumnoId, desde, hasta) {
        const reg = listAsistencia().filter(r =>
            r.alumnoId === alumnoId &&
            (!desde || r.fecha >= desde) &&
            (!hasta || r.fecha <= hasta));
        const total = reg.length;
        const pres  = reg.filter(r => r.presente).length;
        return {
            alumno: getAlumno(alumnoId),
            total,
            presentes: pres,
            ausentes: total - pres,
            porcentaje: total ? +((pres / total) * 100).toFixed(2) : 0
        };
    }

    // ============================================================
    // REPORTES GLOBALES
    // ============================================================
    function dashboard() {
        const ciclo = getCicloActivo();
        const alumnos = listAlumnos();
        const activos = alumnos.filter(a => a.activo);
        const adeudos = listAdeudos();
        const ingresos = listPagos().reduce((s, p) => s + p.monto, 0);
        const becados = activos.filter(a => Number(a.beca) > 0);
        return {
            cicloActivo: ciclo,
            totalAlumnos: alumnos.length,
            alumnosActivos: activos.length,
            grupos: listGrupos().length,
            profesores: listProfesores().length,
            materias: listMaterias().length,
            adeudos: adeudos.length,
            saldoPorCobrar: +adeudos.reduce((s, m) => s + (m.total + m.recargo - (m.pagado || 0)), 0).toFixed(2),
            ingresosTotales: +ingresos.toFixed(2),
            becados: becados.length,
            promBecaPct: becados.length
                ? +(becados.reduce((s, a) => s + Number(a.beca), 0) / becados.length).toFixed(2)
                : 0
        };
    }

    function exportarTodo() {
        return {
            version: 1,
            exportadoEn: new Date().toISOString(),
            data: {
                config: getConfig(),
                ciclos: listCiclos(),
                alumnos: listAlumnos(),
                tutores: listTutores(),
                grupos: listGrupos(),
                materias: listMaterias(),
                profesores: listProfesores(),
                becas: listBecas(),
                mensualidades: listMensualidades(),
                pagos: listPagos(),
                calificaciones: listCalificaciones(),
                asistencia: listAsistencia()
            }
        };
    }

    function importarTodo(json) {
        if (!json || !json.data) throw new Error('Formato inválido');
        const d = json.data;
        if (d.config)        _set(K.config,   d.config);
        if (d.ciclos)        _set(K.ciclos,   d.ciclos);
        if (d.alumnos)       _set(K.alumnos,  d.alumnos);
        if (d.tutores)       _set(K.tutores,  d.tutores);
        if (d.grupos)        _set(K.grupos,   d.grupos);
        if (d.materias)      _set(K.materias, d.materias);
        if (d.profesores)    _set(K.profes,   d.profesores);
        if (d.becas)         _set(K.becas,    d.becas);
        if (d.mensualidades) _set(K.mensual,  d.mensualidades);
        if (d.pagos)         _set(K.pagos,    d.pagos);
        if (d.calificaciones)_set(K.califs,   d.calificaciones);
        if (d.asistencia)    _set(K.asist,    d.asistencia);
        return true;
    }

    function resetTodo() {
        Object.values(K).forEach(k => localStorage.removeItem(k));
        return true;
    }

    // ============================================================
    // API pública
    // ============================================================
    const EducacionAPI = {
        // config
        getConfig, setConfig,
        // ciclos
        listCiclos, getCiclo, getCicloActivo, createCiclo, activarCiclo, deleteCiclo,
        // alumnos / tutores
        listAlumnos, getAlumno, createAlumno, updateAlumno, bajaAlumno,
        listTutores, createTutor,
        // estructura académica
        listGrupos, createGrupo, alumnosDeGrupo,
        listMaterias, createMateria,
        listProfesores, createProfesor,
        // becas
        listBecas, createBeca, quitarBeca,
        // mensualidades / pagos
        listMensualidades, listPagos,
        generarMensualidades, pagarMensualidad,
        estadoCuentaAlumno, listAdeudos,
        // calificaciones
        listCalificaciones, registrarCalificacion, boletaAlumno,
        // asistencia
        listAsistencia, pasarLista, reporteAsistenciaAlumno,
        // reportes / mantenimiento
        dashboard, exportarTodo, importarTodo, resetTodo,
        // meta
        version: '1.0.0',
        vertical: 'educacion'
    };

    global.EducacionAPI = EducacionAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = EducacionAPI;
})(typeof window !== 'undefined' ? window : globalThis);
