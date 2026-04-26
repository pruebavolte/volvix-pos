/* ============================================================================
 * volvix-workflow-closeday.js
 * Volvix POS — Workflow de Cierre del Día
 * ----------------------------------------------------------------------------
 * Orquesta el proceso completo de cierre diario:
 *   1. Conteo físico de caja (denominaciones)
 *   2. Cálculo de diferencia vs sistema (sobrante / faltante)
 *   3. Depósito bancario (efectivo + comprobantes)
 *   4. Generación de reportes (ventas, impuestos, métodos de pago, X/Z)
 *   5. Backup local + remoto (Supabase)
 *   6. Bloqueo del POS hasta apertura del siguiente día
 *
 * Expone: window.CloseDayWorkflow
 * ============================================================================ */
(function (global) {
    'use strict';

    const VERSION = '3.4.0';
    const STORAGE_KEY = 'volvix.closeday.state';
    const LOCK_KEY = 'volvix.pos.locked';

    // Denominaciones MXN estándar (billetes y monedas)
    const DENOMINATIONS = [
        { value: 1000, type: 'bill',  label: '$1000' },
        { value: 500,  type: 'bill',  label: '$500'  },
        { value: 200,  type: 'bill',  label: '$200'  },
        { value: 100,  type: 'bill',  label: '$100'  },
        { value: 50,   type: 'bill',  label: '$50'   },
        { value: 20,   type: 'bill',  label: '$20'   },
        { value: 10,   type: 'coin',  label: '$10'   },
        { value: 5,    type: 'coin',  label: '$5'    },
        { value: 2,    type: 'coin',  label: '$2'    },
        { value: 1,    type: 'coin',  label: '$1'    },
        { value: 0.5,  type: 'coin',  label: '$0.50' },
    ];

    // Estados del workflow
    const STEPS = Object.freeze({
        IDLE:       'idle',
        COUNTING:   'counting',
        DIFFERENCE: 'difference',
        DEPOSIT:    'deposit',
        REPORTS:    'reports',
        BACKUP:     'backup',
        LOCKING:    'locking',
        DONE:       'done',
        ERROR:      'error',
    });

    // ------------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------------
    function nowIso()      { return new Date().toISOString(); }
    function todayStamp()  { return new Date().toISOString().slice(0, 10); }
    function round2(n)     { return Math.round((n + Number.EPSILON) * 100) / 100; }
    function fmtMxn(n)     { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0); }

    function log(level, msg, data) {
        const prefix = `[CloseDay ${level.toUpperCase()}]`;
        if (data !== undefined) console[level === 'error' ? 'error' : 'log'](prefix, msg, data);
        else console[level === 'error' ? 'error' : 'log'](prefix, msg);
    }

    function safeLocalGet(key, fallback) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
        catch (e) { return fallback; }
    }
    function safeLocalSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { log('error', 'localStorage set fail', e); return false; }
    }

    // ------------------------------------------------------------------------
    // Estado interno
    // ------------------------------------------------------------------------
    const state = {
        step:          STEPS.IDLE,
        startedAt:     null,
        finishedAt:    null,
        operator:      null,
        sessionId:     null,
        count:         {},        // { denomValue: qty }
        countedTotal:  0,
        systemTotal:   0,         // efectivo esperado en caja según sistema
        difference:    0,         // counted - system
        deposit:       null,      // { amount, reference, bank, slipUrl }
        reports:       [],        // [{ name, status, url }]
        backup:        null,      // { local, remote, sizeBytes }
        errors:        [],
    };

    function resetState() {
        state.step          = STEPS.IDLE;
        state.startedAt     = null;
        state.finishedAt    = null;
        state.operator      = null;
        state.sessionId     = null;
        state.count         = {};
        state.countedTotal  = 0;
        state.systemTotal   = 0;
        state.difference    = 0;
        state.deposit       = null;
        state.reports       = [];
        state.backup        = null;
        state.errors        = [];
    }

    function persist() {
        safeLocalSet(STORAGE_KEY, {
            ...state,
            persistedAt: nowIso(),
        });
    }

    function restore() {
        const prev = safeLocalGet(STORAGE_KEY, null);
        if (prev && prev.step && prev.step !== STEPS.DONE) {
            Object.assign(state, prev);
            log('info', 'Estado restaurado desde localStorage', { step: state.step });
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------------
    // Eventos (pub/sub mínimo)
    // ------------------------------------------------------------------------
    const listeners = {};
    function on(event, cb) {
        (listeners[event] = listeners[event] || []).push(cb);
    }
    function emit(event, payload) {
        (listeners[event] || []).forEach(cb => {
            try { cb(payload); } catch (e) { log('error', `listener ${event} falló`, e); }
        });
    }

    // ------------------------------------------------------------------------
    // PASO 1 — Conteo físico
    // ------------------------------------------------------------------------
    function startCount(operator, sessionId) {
        if (state.step !== STEPS.IDLE && state.step !== STEPS.ERROR) {
            throw new Error(`No se puede iniciar conteo desde step=${state.step}`);
        }
        resetState();
        state.step      = STEPS.COUNTING;
        state.startedAt = nowIso();
        state.operator  = operator || 'unknown';
        state.sessionId = sessionId || `sess-${Date.now()}`;
        DENOMINATIONS.forEach(d => { state.count[d.value] = 0; });
        persist();
        emit('step:changed', { step: state.step });
        log('info', 'Conteo iniciado', { operator, sessionId });
        return state;
    }

    function setDenominationQty(denomValue, qty) {
        if (state.step !== STEPS.COUNTING) throw new Error('No estás en fase de conteo');
        if (!(denomValue in state.count))  throw new Error(`Denominación inválida: ${denomValue}`);
        if (qty < 0 || !Number.isFinite(qty)) throw new Error('Cantidad inválida');
        state.count[denomValue] = Math.floor(qty);
        recomputeCounted();
        persist();
        emit('count:updated', { denomValue, qty, total: state.countedTotal });
    }

    function recomputeCounted() {
        let total = 0;
        DENOMINATIONS.forEach(d => { total += d.value * (state.count[d.value] || 0); });
        state.countedTotal = round2(total);
        return state.countedTotal;
    }

    // ------------------------------------------------------------------------
    // PASO 2 — Diferencia vs sistema
    // ------------------------------------------------------------------------
    async function computeDifference(systemTotalOverride) {
        if (state.step !== STEPS.COUNTING) throw new Error('Conteo no completado');
        recomputeCounted();
        state.systemTotal = round2(
            systemTotalOverride != null ? systemTotalOverride : await fetchSystemCashTotal()
        );
        state.difference = round2(state.countedTotal - state.systemTotal);
        state.step = STEPS.DIFFERENCE;
        persist();
        emit('difference:computed', {
            counted:    state.countedTotal,
            system:     state.systemTotal,
            difference: state.difference,
            kind:       state.difference > 0 ? 'sobrante' : state.difference < 0 ? 'faltante' : 'exacto',
        });
        log('info', 'Diferencia calculada', { diff: state.difference });
        return state.difference;
    }

    async function fetchSystemCashTotal() {
        // Intentar obtener desde POS si existe
        if (global.VolvixPOS && typeof global.VolvixPOS.getCashExpected === 'function') {
            try { return await global.VolvixPOS.getCashExpected(state.sessionId); }
            catch (e) { log('error', 'getCashExpected falló', e); }
        }
        // Fallback: 0
        return 0;
    }

    // ------------------------------------------------------------------------
    // PASO 3 — Depósito bancario
    // ------------------------------------------------------------------------
    async function registerDeposit({ amount, bank, reference, slipUrl }) {
        if (state.step !== STEPS.DIFFERENCE) throw new Error('Calcula la diferencia primero');
        if (!amount || amount <= 0) throw new Error('Monto de depósito inválido');
        if (!bank || !reference)    throw new Error('Banco y referencia requeridos');

        state.deposit = {
            amount:    round2(amount),
            bank,
            reference,
            slipUrl:   slipUrl || null,
            at:        nowIso(),
        };
        state.step = STEPS.DEPOSIT;
        persist();
        emit('deposit:registered', state.deposit);
        log('info', 'Depósito registrado', state.deposit);
        return state.deposit;
    }

    // ------------------------------------------------------------------------
    // PASO 4 — Generación de reportes
    // ------------------------------------------------------------------------
    const REPORT_TYPES = ['sales', 'taxes', 'payment-methods', 'x-report', 'z-report'];

    async function generateReports() {
        if (state.step !== STEPS.DEPOSIT) throw new Error('Registra el depósito primero');
        state.step = STEPS.REPORTS;
        state.reports = [];
        persist();

        for (const name of REPORT_TYPES) {
            const r = await generateOneReport(name);
            state.reports.push(r);
            emit('report:generated', r);
            persist();
        }

        const failed = state.reports.filter(r => r.status === 'error');
        if (failed.length) {
            log('error', `${failed.length}/${state.reports.length} reportes fallaron`, failed);
        }
        return state.reports;
    }

    async function generateOneReport(name) {
        try {
            let url = null;
            if (global.VolvixReports && typeof global.VolvixReports.generate === 'function') {
                url = await global.VolvixReports.generate(name, {
                    sessionId: state.sessionId,
                    date:      todayStamp(),
                });
            } else {
                // Stub: simular generación
                await new Promise(res => setTimeout(res, 50));
                url = `local://reports/${todayStamp()}/${name}.pdf`;
            }
            return { name, status: 'ok', url, at: nowIso() };
        } catch (e) {
            log('error', `Reporte ${name} falló`, e);
            state.errors.push({ phase: 'reports', name, error: String(e) });
            return { name, status: 'error', error: String(e), at: nowIso() };
        }
    }

    // ------------------------------------------------------------------------
    // PASO 5 — Backup local + remoto
    // ------------------------------------------------------------------------
    async function runBackup() {
        if (state.step !== STEPS.REPORTS) throw new Error('Genera reportes primero');
        state.step = STEPS.BACKUP;
        persist();

        const snapshot = buildSnapshot();
        const json     = JSON.stringify(snapshot, null, 2);
        const sizeBytes = new Blob([json]).size;

        // Local
        const localKey = `volvix.backup.${todayStamp()}`;
        const localOk  = safeLocalSet(localKey, snapshot);

        // Remoto (Supabase si está disponible)
        let remoteOk = false, remoteRef = null;
        try {
            if (global.VolvixSupabase && typeof global.VolvixSupabase.uploadBackup === 'function') {
                const res = await global.VolvixSupabase.uploadBackup({
                    date:      todayStamp(),
                    sessionId: state.sessionId,
                    payload:   snapshot,
                });
                remoteOk  = !!res && res.ok !== false;
                remoteRef = res && res.ref ? res.ref : null;
            }
        } catch (e) {
            log('error', 'Backup remoto falló', e);
            state.errors.push({ phase: 'backup-remote', error: String(e) });
        }

        state.backup = {
            local:     localOk,
            remote:    remoteOk,
            remoteRef,
            sizeBytes,
            at:        nowIso(),
        };
        persist();
        emit('backup:done', state.backup);
        log('info', 'Backup completado', state.backup);
        return state.backup;
    }

    function buildSnapshot() {
        return {
            version:      VERSION,
            date:         todayStamp(),
            sessionId:    state.sessionId,
            operator:     state.operator,
            startedAt:    state.startedAt,
            count:        { ...state.count },
            countedTotal: state.countedTotal,
            systemTotal:  state.systemTotal,
            difference:   state.difference,
            deposit:      state.deposit,
            reports:      state.reports,
            errors:       state.errors,
        };
    }

    // ------------------------------------------------------------------------
    // PASO 6 — Lock del POS
    // ------------------------------------------------------------------------
    async function lockPOS() {
        if (state.step !== STEPS.BACKUP) throw new Error('Ejecuta backup primero');
        state.step = STEPS.LOCKING;
        persist();

        safeLocalSet(LOCK_KEY, {
            locked:    true,
            lockedAt:  nowIso(),
            sessionId: state.sessionId,
            until:     'next-open',
        });

        if (global.VolvixPOS && typeof global.VolvixPOS.lock === 'function') {
            try { await global.VolvixPOS.lock({ reason: 'closeday', sessionId: state.sessionId }); }
            catch (e) { log('error', 'POS.lock falló', e); state.errors.push({ phase: 'lock', error: String(e) }); }
        }

        state.step       = STEPS.DONE;
        state.finishedAt = nowIso();
        persist();
        emit('locked', { at: state.finishedAt });
        emit('step:changed', { step: state.step });
        log('info', 'POS bloqueado, cierre de día COMPLETADO');
        return true;
    }

    function isLocked() {
        const l = safeLocalGet(LOCK_KEY, null);
        return !!(l && l.locked);
    }

    function unlockForNextDay(operator) {
        safeLocalSet(LOCK_KEY, { locked: false, unlockedAt: nowIso(), by: operator || 'unknown' });
        emit('unlocked', { by: operator });
        return true;
    }

    // ------------------------------------------------------------------------
    // Workflow completo (one-shot)
    // ------------------------------------------------------------------------
    async function runFullWorkflow(opts) {
        const {
            operator,
            sessionId,
            count,           // { denomValue: qty }
            systemTotal,
            deposit,         // { amount, bank, reference, slipUrl }
        } = opts || {};

        try {
            startCount(operator, sessionId);
            if (count) Object.entries(count).forEach(([k, v]) => setDenominationQty(Number(k), v));
            await computeDifference(systemTotal);
            await registerDeposit(deposit);
            await generateReports();
            await runBackup();
            await lockPOS();
            return { ok: true, snapshot: buildSnapshot() };
        } catch (e) {
            state.step = STEPS.ERROR;
            state.errors.push({ phase: state.step, error: String(e) });
            persist();
            emit('error', { error: String(e), step: state.step });
            log('error', 'Workflow falló', e);
            return { ok: false, error: String(e), state: { ...state } };
        }
    }

    // ------------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------------
    const api = {
        VERSION,
        STEPS,
        DENOMINATIONS,

        // estado
        getState:           () => ({ ...state }),
        getStep:            () => state.step,
        getCountedTotal:    () => state.countedTotal,
        getDifference:      () => state.difference,
        getSnapshot:        buildSnapshot,
        restore,
        reset:              resetState,

        // pasos
        startCount,
        setDenominationQty,
        computeDifference,
        registerDeposit,
        generateReports,
        runBackup,
        lockPOS,
        unlockForNextDay,
        isLocked,

        // todo en uno
        runFullWorkflow,

        // eventos
        on,

        // utilidades expuestas
        utils: { fmtMxn, round2, todayStamp },
    };

    global.CloseDayWorkflow = api;
    log('info', `CloseDayWorkflow v${VERSION} listo`);

})(typeof window !== 'undefined' ? window : globalThis);
