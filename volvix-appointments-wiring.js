/* ============================================================================
 * volvix-appointments-wiring.js
 * Volvix POS - Appointments Module (Estéticas, Médicos, Spas, Barberías)
 * Agent-67 R9 Volvix
 * ----------------------------------------------------------------------------
 * Funcionalidades:
 *  - Gestión de profesionales y horarios
 *  - Catálogo de servicios con duración y precio
 *  - Generación de slots disponibles
 *  - Reserva, confirmación y cancelación de citas
 *  - Recordatorios SMS / Email
 *  - Tracking de no-shows y métricas
 *  - Lista de espera
 * Expone: window.AppointmentsAPI
 * ==========================================================================*/
(function (global) {
    'use strict';

    // ---------------------------------------------------------------- STORAGE
    const LS_KEYS = {
        PROS:    'volvix.appt.professionals',
        SVCS:    'volvix.appt.services',
        APPTS:   'volvix.appt.appointments',
        WAIT:    'volvix.appt.waitlist',
        NOSHOW:  'volvix.appt.noshows',
        REMIND:  'volvix.appt.reminders',
        CONFIG:  'volvix.appt.config'
    };

    const DEFAULT_CONFIG = {
        slotGranularityMin: 15,
        reminderHoursBefore: 24,
        smsProvider: 'twilio',
        smsFrom: '+10000000000',
        emailFrom: 'no-reply@volvix.local',
        noShowGraceMin: 15,
        maxNoShowsBeforeBlock: 3,
        timezone: 'America/Mexico_City',
        confirmRequired: true
    };

    function readLS(k, fb) {
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
        catch (e) { console.warn('[Appt] readLS', k, e); return fb; }
    }
    function writeLS(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); }
        catch (e) { console.warn('[Appt] writeLS', k, e); }
    }

    // ----------------------------------------------------------------- STATE
    const state = {
        professionals: readLS(LS_KEYS.PROS,   []),
        services:      readLS(LS_KEYS.SVCS,   []),
        appointments:  readLS(LS_KEYS.APPTS,  []),
        waitlist:      readLS(LS_KEYS.WAIT,   []),
        noShows:       readLS(LS_KEYS.NOSHOW, {}),
        reminders:     readLS(LS_KEYS.REMIND, []),
        config:        Object.assign({}, DEFAULT_CONFIG, readLS(LS_KEYS.CONFIG, {}))
    };

    function persist() {
        writeLS(LS_KEYS.PROS,   state.professionals);
        writeLS(LS_KEYS.SVCS,   state.services);
        writeLS(LS_KEYS.APPTS,  state.appointments);
        writeLS(LS_KEYS.WAIT,   state.waitlist);
        writeLS(LS_KEYS.NOSHOW, state.noShows);
        writeLS(LS_KEYS.REMIND, state.reminders);
        writeLS(LS_KEYS.CONFIG, state.config);
    }

    // -------------------------------------------------------------- UTILITIES
    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
               Math.random().toString(36).slice(2, 8);
    }
    function toMinutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number); return h * 60 + m;
    }
    function fromMinutes(min) {
        const h = String(Math.floor(min / 60)).padStart(2, '0');
        const m = String(min % 60).padStart(2, '0');
        return `${h}:${m}`;
    }
    function dayOfWeek(dateStr) {
        return new Date(dateStr + 'T00:00:00').getDay(); // 0..6
    }
    function overlap(aStart, aEnd, bStart, bEnd) {
        return aStart < bEnd && bStart < aEnd;
    }
    function emit(evt, payload) {
        try { global.dispatchEvent(new CustomEvent('volvix:appt:' + evt, { detail: payload })); }
        catch (e) { /* noop */ }
    }

    // ------------------------------------------------------- PROFESSIONALS
    function addProfessional(p) {
        if (!p || !p.name) throw new Error('professional.name requerido');
        const pro = {
            id: p.id || uid('pro'),
            name: p.name,
            specialties: p.specialties || [],
            phone: p.phone || '',
            email: p.email || '',
            color: p.color || '#3b82f6',
            schedule: p.schedule || defaultSchedule(),
            servicesOffered: p.servicesOffered || [],
            active: p.active !== false,
            createdAt: new Date().toISOString()
        };
        state.professionals.push(pro);
        persist();
        emit('professional:added', pro);
        return pro;
    }
    function defaultSchedule() {
        // Lun-Vie 09:00-18:00, Sab 10:00-14:00
        return {
            0: null,
            1: [{ start: '09:00', end: '18:00' }],
            2: [{ start: '09:00', end: '18:00' }],
            3: [{ start: '09:00', end: '18:00' }],
            4: [{ start: '09:00', end: '18:00' }],
            5: [{ start: '09:00', end: '18:00' }],
            6: [{ start: '10:00', end: '14:00' }]
        };
    }
    function updateProfessional(id, patch) {
        const i = state.professionals.findIndex(x => x.id === id);
        if (i < 0) throw new Error('profesional no encontrado');
        state.professionals[i] = Object.assign({}, state.professionals[i], patch);
        persist();
        emit('professional:updated', state.professionals[i]);
        return state.professionals[i];
    }
    function removeProfessional(id) {
        state.professionals = state.professionals.filter(x => x.id !== id);
        persist();
        emit('professional:removed', { id });
    }
    function listProfessionals() { return state.professionals.slice(); }

    // ------------------------------------------------------------- SERVICES
    function addService(s) {
        if (!s || !s.name) throw new Error('service.name requerido');
        if (!s.durationMin || s.durationMin <= 0) throw new Error('durationMin > 0 requerido');
        const svc = {
            id: s.id || uid('svc'),
            name: s.name,
            durationMin: s.durationMin,
            price: s.price || 0,
            category: s.category || 'general',
            bufferBeforeMin: s.bufferBeforeMin || 0,
            bufferAfterMin: s.bufferAfterMin || 0,
            requiresDeposit: !!s.requiresDeposit,
            depositAmount: s.depositAmount || 0,
            description: s.description || '',
            active: s.active !== false
        };
        state.services.push(svc);
        persist();
        emit('service:added', svc);
        return svc;
    }
    function updateService(id, patch) {
        const i = state.services.findIndex(x => x.id === id);
        if (i < 0) throw new Error('servicio no encontrado');
        state.services[i] = Object.assign({}, state.services[i], patch);
        persist();
        return state.services[i];
    }
    function removeService(id) {
        state.services = state.services.filter(x => x.id !== id);
        persist();
    }
    function listServices() { return state.services.slice(); }

    // ----------------------------------------------------------- SLOT ENGINE
    function getSlots(professionalId, dateStr, serviceId) {
        const pro = state.professionals.find(x => x.id === professionalId);
        if (!pro || !pro.active) return [];
        const svc = state.services.find(x => x.id === serviceId);
        if (!svc) return [];

        const dow = dayOfWeek(dateStr);
        const blocks = pro.schedule[dow];
        if (!blocks || !blocks.length) return [];

        const dur = svc.durationMin + (svc.bufferBeforeMin || 0) + (svc.bufferAfterMin || 0);
        const granularity = state.config.slotGranularityMin;
        const dayAppts = state.appointments.filter(a =>
            a.professionalId === professionalId &&
            a.date === dateStr &&
            ['booked', 'confirmed', 'in_progress'].includes(a.status)
        );

        const slots = [];
        for (const b of blocks) {
            const startMin = toMinutes(b.start);
            const endMin = toMinutes(b.end);
            for (let t = startMin; t + dur <= endMin; t += granularity) {
                const slotEnd = t + dur;
                const conflict = dayAppts.some(a => {
                    const aStart = toMinutes(a.startTime);
                    const aEnd = aStart + a.durationMin;
                    return overlap(t, slotEnd, aStart, aEnd);
                });
                if (!conflict) {
                    slots.push({
                        date: dateStr,
                        startTime: fromMinutes(t),
                        endTime: fromMinutes(slotEnd),
                        durationMin: dur,
                        professionalId,
                        serviceId
                    });
                }
            }
        }
        return slots;
    }

    // ----------------------------------------------------------- APPOINTMENTS
    function bookAppointment(data) {
        const required = ['professionalId', 'serviceId', 'date', 'startTime', 'clientName'];
        for (const f of required) {
            if (!data[f]) throw new Error('campo requerido: ' + f);
        }
        const svc = state.services.find(x => x.id === data.serviceId);
        if (!svc) throw new Error('servicio inválido');

        // Validar no-show block
        if (data.clientPhone && state.noShows[data.clientPhone] >=
            state.config.maxNoShowsBeforeBlock) {
            throw new Error('cliente bloqueado por exceso de no-shows');
        }

        const dur = svc.durationMin + svc.bufferBeforeMin + svc.bufferAfterMin;
        const startMin = toMinutes(data.startTime);

        // Validar conflicto
        const conflicts = state.appointments.filter(a =>
            a.professionalId === data.professionalId &&
            a.date === data.date &&
            ['booked', 'confirmed', 'in_progress'].includes(a.status) &&
            overlap(startMin, startMin + dur,
                    toMinutes(a.startTime), toMinutes(a.startTime) + a.durationMin)
        );
        if (conflicts.length) throw new Error('conflicto con cita existente');

        const appt = {
            id: uid('appt'),
            professionalId: data.professionalId,
            serviceId: data.serviceId,
            date: data.date,
            startTime: data.startTime,
            durationMin: dur,
            clientName: data.clientName,
            clientPhone: data.clientPhone || '',
            clientEmail: data.clientEmail || '',
            notes: data.notes || '',
            status: state.config.confirmRequired ? 'booked' : 'confirmed',
            depositPaid: !!data.depositPaid,
            price: svc.price,
            createdAt: new Date().toISOString(),
            confirmedAt: null,
            cancelledAt: null,
            completedAt: null,
            source: data.source || 'manual'
        };
        state.appointments.push(appt);
        persist();
        scheduleReminder(appt);
        emit('appointment:booked', appt);
        return appt;
    }

    function confirmAppointment(id) {
        const a = state.appointments.find(x => x.id === id);
        if (!a) throw new Error('cita no encontrada');
        a.status = 'confirmed';
        a.confirmedAt = new Date().toISOString();
        persist();
        emit('appointment:confirmed', a);
        return a;
    }
    function cancelAppointment(id, reason) {
        const a = state.appointments.find(x => x.id === id);
        if (!a) throw new Error('cita no encontrada');
        a.status = 'cancelled';
        a.cancelledAt = new Date().toISOString();
        a.cancelReason = reason || '';
        persist();
        promoteFromWaitlist(a.professionalId, a.date, a.startTime);
        emit('appointment:cancelled', a);
        return a;
    }
    function completeAppointment(id) {
        const a = state.appointments.find(x => x.id === id);
        if (!a) throw new Error('cita no encontrada');
        a.status = 'completed';
        a.completedAt = new Date().toISOString();
        persist();
        emit('appointment:completed', a);
        return a;
    }
    function markNoShow(id) {
        const a = state.appointments.find(x => x.id === id);
        if (!a) throw new Error('cita no encontrada');
        a.status = 'no_show';
        a.noShowAt = new Date().toISOString();
        if (a.clientPhone) {
            state.noShows[a.clientPhone] = (state.noShows[a.clientPhone] || 0) + 1;
        }
        persist();
        emit('appointment:noshow', a);
        return a;
    }

    function listAppointments(filter) {
        filter = filter || {};
        return state.appointments.filter(a => {
            if (filter.date && a.date !== filter.date) return false;
            if (filter.professionalId && a.professionalId !== filter.professionalId) return false;
            if (filter.status && a.status !== filter.status) return false;
            if (filter.clientPhone && a.clientPhone !== filter.clientPhone) return false;
            if (filter.from && a.date < filter.from) return false;
            if (filter.to && a.date > filter.to) return false;
            return true;
        });
    }

    // -------------------------------------------------------------- WAITLIST
    function addToWaitlist(entry) {
        const w = {
            id: uid('wait'),
            clientName: entry.clientName,
            clientPhone: entry.clientPhone || '',
            serviceId: entry.serviceId,
            professionalId: entry.professionalId || null,
            preferredDate: entry.preferredDate || null,
            createdAt: new Date().toISOString()
        };
        state.waitlist.push(w);
        persist();
        emit('waitlist:added', w);
        return w;
    }
    function promoteFromWaitlist(professionalId, date, startTime) {
        const candidate = state.waitlist.find(w =>
            (!w.professionalId || w.professionalId === professionalId) &&
            (!w.preferredDate || w.preferredDate === date)
        );
        if (!candidate) return null;
        emit('waitlist:slotAvailable', { candidate, professionalId, date, startTime });
        return candidate;
    }
    function listWaitlist() { return state.waitlist.slice(); }

    // ------------------------------------------------------------ REMINDERS
    function scheduleReminder(appt) {
        const apptDateTime = new Date(`${appt.date}T${appt.startTime}:00`);
        const remindAt = new Date(apptDateTime.getTime() -
            state.config.reminderHoursBefore * 3600 * 1000);
        const r = {
            id: uid('rem'),
            appointmentId: appt.id,
            scheduledFor: remindAt.toISOString(),
            channel: appt.clientPhone ? 'sms' : (appt.clientEmail ? 'email' : 'none'),
            sent: false
        };
        state.reminders.push(r);
        persist();
        return r;
    }

    function processDueReminders() {
        const now = new Date();
        const due = state.reminders.filter(r =>
            !r.sent && new Date(r.scheduledFor) <= now);
        const sent = [];
        due.forEach(r => {
            const a = state.appointments.find(x => x.id === r.appointmentId);
            if (!a || ['cancelled', 'no_show', 'completed'].includes(a.status)) {
                r.sent = true; r.skipped = true; return;
            }
            const ok = sendReminder(a, r.channel);
            if (ok) {
                r.sent = true;
                r.sentAt = new Date().toISOString();
                sent.push(r);
            }
        });
        persist();
        return sent;
    }

    function sendReminder(appt, channel) {
        const svc = state.services.find(x => x.id === appt.serviceId);
        const pro = state.professionals.find(x => x.id === appt.professionalId);
        const msg = `Recordatorio: ${appt.clientName}, su cita de ${svc ? svc.name : ''}` +
                    ` con ${pro ? pro.name : ''} es el ${appt.date} a las ${appt.startTime}.` +
                    ` Responda C para confirmar.`;
        if (channel === 'sms') return sendSMS(appt.clientPhone, msg);
        if (channel === 'email') return sendEmail(appt.clientEmail, 'Recordatorio de cita', msg);
        return false;
    }
    function sendSMS(to, body) {
        // Stub - integrar con proveedor real (Twilio, MessageBird, etc.)
        console.log(`[SMS:${state.config.smsProvider}] -> ${to}: ${body}`);
        emit('sms:sent', { to, body });
        return true;
    }
    function sendEmail(to, subject, body) {
        console.log(`[EMAIL] -> ${to} | ${subject} | ${body}`);
        emit('email:sent', { to, subject, body });
        return true;
    }

    // ---------------------------------------------------------------- METRICS
    function metrics(rangeFrom, rangeTo) {
        const inRange = state.appointments.filter(a =>
            (!rangeFrom || a.date >= rangeFrom) &&
            (!rangeTo || a.date <= rangeTo));
        const total = inRange.length;
        const byStatus = {};
        inRange.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
        const noShowRate = total ? ((byStatus.no_show || 0) / total) : 0;
        const cancelRate = total ? ((byStatus.cancelled || 0) / total) : 0;
        const revenue = inRange.filter(a => a.status === 'completed')
            .reduce((s, a) => s + (a.price || 0), 0);
        return {
            total,
            byStatus,
            noShowRate: +(noShowRate * 100).toFixed(2),
            cancelRate: +(cancelRate * 100).toFixed(2),
            completedRevenue: revenue,
            blockedClients: Object.keys(state.noShows).filter(p =>
                state.noShows[p] >= state.config.maxNoShowsBeforeBlock).length
        };
    }

    // ------------------------------------------------------------------ CONFIG
    function updateConfig(patch) {
        state.config = Object.assign({}, state.config, patch);
        persist();
        emit('config:updated', state.config);
        return state.config;
    }
    function getConfig() { return Object.assign({}, state.config); }

    // ----------------------------------------------------------------- TIMER
    let reminderTimer = null;
    function startReminderLoop(intervalMs) {
        if (reminderTimer) clearInterval(reminderTimer);
        reminderTimer = setInterval(processDueReminders, intervalMs || 60000);
    }
    function stopReminderLoop() {
        if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
    }

    // -------------------------------------------------------------- AUTO INIT
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => startReminderLoop());
        } else {
            startReminderLoop();
        }
    }

    // ------------------------------------------------------------------ API
    global.AppointmentsAPI = {
        // Professionals
        addProfessional, updateProfessional, removeProfessional, listProfessionals,
        // Services
        addService, updateService, removeService, listServices,
        // Slots & booking
        getSlots,
        bookAppointment, confirmAppointment, cancelAppointment,
        completeAppointment, markNoShow, listAppointments,
        // Waitlist
        addToWaitlist, listWaitlist,
        // Reminders
        scheduleReminder, processDueReminders, sendSMS, sendEmail,
        startReminderLoop, stopReminderLoop,
        // Metrics & config
        metrics, getConfig, updateConfig,
        // Internals (debug)
        _state: state,
        _version: '1.0.0'
    };

    console.log('[Volvix] AppointmentsAPI v1.0.0 cargado.');
})(typeof window !== 'undefined' ? window : globalThis);
