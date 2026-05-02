/* ============================================================================
 * volvix-layaway-wiring.js
 * Agent-65 R9 — Sistema de Apartados (Layaway) para Volvix POS
 * ----------------------------------------------------------------------------
 * Permite a un cliente apartar productos pagando un anticipo, generar plan
 * de pagos, recibir recordatorios, manejar vencimientos y convertir el
 * apartado en venta una vez liquidado.
 *
 * Expone: window.LayawayAPI
 * ==========================================================================*/

(function (global) {
    'use strict';

    // ---------------------------------------------------------------------
    // 0. Configuración por defecto
    // ---------------------------------------------------------------------
    const DEFAULTS = {
        storageKey: 'volvix_layaways_v1',
        counterKey: 'volvix_layaway_counter',
        minDownPaymentPct: 0.20,      // 20% mínimo de anticipo
        defaultTermDays: 60,          // 60 días para liquidar
        graceDays: 7,                 // periodo de gracia tras vencimiento
        reminderOffsetsDays: [7, 3, 1], // recordatorios antes del vencimiento
        cancellationFeePct: 0.10,     // 10% retenido si cancela
        paymentFrequencies: {
            weekly: 7,
            biweekly: 14,
            monthly: 30
        }
    };

    let CONFIG = Object.assign({}, DEFAULTS);

    // ---------------------------------------------------------------------
    // 1. Utilidades internas
    // ---------------------------------------------------------------------
    const _utils = {
        uid() {
            const n = parseInt(localStorage.getItem(CONFIG.counterKey) || '1000', 10) + 1;
            localStorage.setItem(CONFIG.counterKey, String(n));
            return 'LAY-' + n;
        },
        today() { return new Date(); },
        addDays(date, days) {
            const d = new Date(date);
            d.setDate(d.getDate() + days);
            return d;
        },
        diffDays(a, b) {
            const ms = new Date(a).getTime() - new Date(b).getTime();
            return Math.floor(ms / (1000 * 60 * 60 * 24));
        },
        iso(d) { return new Date(d).toISOString(); },
        money(n) { return Math.round(Number(n) * 100) / 100; },
        clone(o) { return JSON.parse(JSON.stringify(o)); },
        emit(name, detail) {
            try {
                global.dispatchEvent(new CustomEvent('layaway:' + name, { detail }));
            } catch (_) { /* SSR safety */ }
        },
        log() {
            if (global.VOLVIX_DEBUG) console.log.apply(console, ['[Layaway]'].concat([].slice.call(arguments)));
        }
    };

    // ---------------------------------------------------------------------
    // 2. Capa de persistencia (localStorage; reemplazable)
    // ---------------------------------------------------------------------
    const _store = {
        readAll() {
            try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'); }
            catch (e) { return []; }
        },
        writeAll(list) {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(list));
        },
        upsert(layaway) {
            const list = _store.readAll();
            const i = list.findIndex(x => x.id === layaway.id);
            if (i >= 0) list[i] = layaway; else list.push(layaway);
            _store.writeAll(list);
            return layaway;
        },
        remove(id) {
            const list = _store.readAll().filter(x => x.id !== id);
            _store.writeAll(list);
        },
        get(id) {
            return _store.readAll().find(x => x.id === id) || null;
        }
    };

    // ---------------------------------------------------------------------
    // 3. Cálculo de plan de pagos
    // ---------------------------------------------------------------------
    function buildPaymentPlan(total, downPayment, opts) {
        opts = opts || {};
        const freq = opts.frequency || 'biweekly';
        const stepDays = CONFIG.paymentFrequencies[freq] || 14;
        const termDays = opts.termDays || CONFIG.defaultTermDays;
        const startDate = opts.startDate ? new Date(opts.startDate) : _utils.today();

        const remaining = _utils.money(total - downPayment);
        const numPayments = Math.max(1, Math.ceil(termDays / stepDays));
        const perPayment = _utils.money(remaining / numPayments);

        const schedule = [];
        let acc = 0;
        for (let i = 0; i < numPayments; i++) {
            const due = _utils.addDays(startDate, stepDays * (i + 1));
            const amount = (i === numPayments - 1)
                ? _utils.money(remaining - acc)   // último ajusta centavos
                : perPayment;
            acc = _utils.money(acc + amount);
            schedule.push({
                n: i + 1,
                dueDate: _utils.iso(due),
                amount: amount,
                status: 'pending',     // pending | paid | overdue
                paidAt: null,
                paidAmount: 0
            });
        }
        return { frequency: freq, stepDays, numPayments, perPayment, schedule };
    }

    // ---------------------------------------------------------------------
    // 4. Operaciones principales
    // ---------------------------------------------------------------------
    function createLayaway(input) {
        if (!input || !input.customer || !input.customer.id) throw new Error('customer requerido');
        if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('items requeridos');

        const total = _utils.money(input.items.reduce((s, it) =>
            s + (Number(it.price) * Number(it.qty || 1)), 0));

        const minDown = _utils.money(total * CONFIG.minDownPaymentPct);
        const down = _utils.money(input.downPayment || minDown);
        if (down < minDown) throw new Error('Anticipo mínimo: ' + minDown);
        if (down >= total) throw new Error('Anticipo no puede cubrir el total (use venta directa)');

        const plan = buildPaymentPlan(total, down, {
            frequency: input.frequency,
            termDays: input.termDays,
            startDate: input.startDate
        });

        const expiresAt = _utils.addDays(
            input.startDate || _utils.today(),
            input.termDays || CONFIG.defaultTermDays
        );

        const layaway = {
            id: _utils.uid(),
            status: 'active',         // active | completed | cancelled | expired
            customer: input.customer,
            items: input.items.map(it => Object.assign({}, it)),
            total,
            downPayment: down,
            balance: _utils.money(total - down),
            paid: down,
            createdAt: _utils.iso(_utils.today()),
            expiresAt: _utils.iso(expiresAt),
            plan,
            payments: [{
                id: 'P1',
                type: 'down',
                amount: down,
                method: input.paymentMethod || 'cash',
                at: _utils.iso(_utils.today())
            }],
            reminders: [],
            notes: input.notes || ''
        };

        _store.upsert(layaway);
        _scheduleReminders(layaway);
        _utils.emit('created', layaway);
        _utils.log('creado', layaway.id, 'total', total, 'anticipo', down);
        return layaway;
    }

    function addPayment(id, amount, method) {
        const lay = _store.get(id);
        if (!lay) throw new Error('apartado no encontrado: ' + id);
        if (lay.status !== 'active') throw new Error('apartado no activo');

        amount = _utils.money(amount);
        if (amount <= 0) throw new Error('monto inválido');
        if (amount > lay.balance + 0.01) throw new Error('monto excede saldo (' + lay.balance + ')');

        // aplicar al primer pago pendiente / overdue
        let remaining = amount;
        for (const p of lay.plan.schedule) {
            if (remaining <= 0) break;
            if (p.status === 'paid') continue;
            const need = _utils.money(p.amount - p.paidAmount);
            const apply = Math.min(remaining, need);
            p.paidAmount = _utils.money(p.paidAmount + apply);
            remaining = _utils.money(remaining - apply);
            if (p.paidAmount >= p.amount - 0.005) {
                p.status = 'paid';
                p.paidAt = _utils.iso(_utils.today());
            }
        }

        lay.payments.push({
            id: 'P' + (lay.payments.length + 1),
            type: 'installment',
            amount,
            method: method || 'cash',
            at: _utils.iso(_utils.today())
        });
        lay.paid = _utils.money(lay.paid + amount);
        lay.balance = _utils.money(lay.total - lay.paid);

        if (lay.balance <= 0.005) {
            lay.balance = 0;
            lay.status = 'ready_to_convert';
            _utils.emit('ready', lay);
        } else {
            _utils.emit('payment', { layaway: lay, amount });
        }

        _store.upsert(lay);
        return lay;
    }

    function convertToSale(id, posAdapter) {
        const lay = _store.get(id);
        if (!lay) throw new Error('apartado no encontrado');
        if (lay.balance > 0.005) throw new Error('saldo pendiente: ' + lay.balance);

        const sale = {
            source: 'layaway',
            layawayId: lay.id,
            customer: lay.customer,
            items: lay.items,
            total: lay.total,
            paid: lay.paid,
            payments: lay.payments,
            at: _utils.iso(_utils.today())
        };

        // Integración con POS si existe
        const pos = posAdapter || global.VolvixPOS || global.POS;
        if (pos && typeof pos.registerSale === 'function') {
            try { pos.registerSale(sale); } catch (e) { _utils.log('POS error', e); }
        }

        lay.status = 'completed';
        lay.completedAt = _utils.iso(_utils.today());
        _store.upsert(lay);
        _utils.emit('completed', { layaway: lay, sale });
        return sale;
    }

    function cancelLayaway(id, reason) {
        const lay = _store.get(id);
        if (!lay) throw new Error('apartado no encontrado');
        if (lay.status === 'completed') throw new Error('ya completado');

        const fee = _utils.money(lay.paid * CONFIG.cancellationFeePct);
        const refund = _utils.money(lay.paid - fee);

        lay.status = 'cancelled';
        lay.cancelledAt = _utils.iso(_utils.today());
        lay.cancellationReason = reason || '';
        lay.cancellationFee = fee;
        lay.refundAmount = refund;
        _store.upsert(lay);
        _utils.emit('cancelled', lay);
        return { layaway: lay, fee, refund };
    }

    // ---------------------------------------------------------------------
    // 5. Recordatorios y vencimientos
    // ---------------------------------------------------------------------
    function _scheduleReminders(lay) {
        const now = _utils.today();
        for (const p of lay.plan.schedule) {
            for (const offset of CONFIG.reminderOffsetsDays) {
                const fireAt = _utils.addDays(p.dueDate, -offset);
                if (fireAt > now) {
                    lay.reminders.push({
                        installment: p.n,
                        dueDate: p.dueDate,
                        fireAt: _utils.iso(fireAt),
                        offsetDays: offset,
                        sent: false
                    });
                }
            }
        }
        _store.upsert(lay);
    }

    function processReminders(now) {
        now = now || _utils.today();
        const list = _store.readAll();
        const fired = [];
        for (const lay of list) {
            if (lay.status !== 'active') continue;
            for (const r of lay.reminders) {
                if (!r.sent && new Date(r.fireAt) <= now) {
                    r.sent = true;
                    r.sentAt = _utils.iso(now);
                    fired.push({ layaway: lay, reminder: r });
                    _utils.emit('reminder', { layaway: lay, reminder: r });
                }
            }
            _store.upsert(lay);
        }
        return fired;
    }

    function processExpirations(now) {
        now = now || _utils.today();
        const list = _store.readAll();
        const changed = [];
        for (const lay of list) {
            if (lay.status !== 'active') continue;

            // marcar cuotas vencidas
            for (const p of lay.plan.schedule) {
                if (p.status === 'pending' && new Date(p.dueDate) < now) {
                    p.status = 'overdue';
                }
            }

            // expiración total (vencimiento + gracia)
            const deadLine = _utils.addDays(lay.expiresAt, CONFIG.graceDays);
            if (new Date(deadLine) < now) {
                lay.status = 'expired';
                lay.expiredAt = _utils.iso(now);
                changed.push(lay);
                _utils.emit('expired', lay);
            }
            _store.upsert(lay);
        }
        return changed;
    }

    // ---------------------------------------------------------------------
    // 6. Consultas
    // ---------------------------------------------------------------------
    function listLayaways(filter) {
        let list = _store.readAll();
        if (!filter) return list;
        if (filter.status) list = list.filter(x => x.status === filter.status);
        if (filter.customerId) list = list.filter(x => x.customer && x.customer.id === filter.customerId);
        if (filter.from) list = list.filter(x => new Date(x.createdAt) >= new Date(filter.from));
        if (filter.to)   list = list.filter(x => new Date(x.createdAt) <= new Date(filter.to));
        return list;
    }

    function getLayaway(id) { return _store.get(id); }

    function summary() {
        const list = _store.readAll();
        const acc = { total: 0, active: 0, completed: 0, cancelled: 0, expired: 0,
                      ready_to_convert: 0, balance: 0, collected: 0 };
        for (const l of list) {
            acc.total++;
            acc[l.status] = (acc[l.status] || 0) + 1;
            acc.balance = _utils.money(acc.balance + (l.balance || 0));
            acc.collected = _utils.money(acc.collected + (l.paid || 0));
        }
        return acc;
    }

    // ---------------------------------------------------------------------
    // 7. Auto-tick (recordatorios + vencimientos cada N min)
    // ---------------------------------------------------------------------
    let _tickHandle = null;
    function startAutoTick(intervalMinutes) {
        stopAutoTick();
        const ms = (intervalMinutes || 15) * 60 * 1000;
        _tickHandle = setInterval(() => {
            try {
                processReminders();
                processExpirations();
            } catch (e) { _utils.log('tick error', e); }
        }, ms);
        _utils.log('autoTick iniciado cada', intervalMinutes || 15, 'min');
    }
    function stopAutoTick() {
        if (_tickHandle) { clearInterval(_tickHandle); _tickHandle = null; }
    }

    // ---------------------------------------------------------------------
    // 8. API pública
    // ---------------------------------------------------------------------
    const LayawayAPI = {
        // configuración
        configure(partial) { CONFIG = Object.assign({}, CONFIG, partial || {}); return CONFIG; },
        getConfig() { return _utils.clone(CONFIG); },

        // CRUD / flujo
        create:           createLayaway,
        addPayment:       addPayment,
        convertToSale:    convertToSale,
        cancel:           cancelLayaway,
        get:              getLayaway,
        list:             listLayaways,
        summary:          summary,

        // tareas programadas
        processReminders:    processReminders,
        processExpirations:  processExpirations,
        startAutoTick:       startAutoTick,
        stopAutoTick:        stopAutoTick,

        // utilidades expuestas (útiles en UI)
        buildPaymentPlan: buildPaymentPlan,

        // versión
        version: '1.0.0'
    };

    global.LayawayAPI = LayawayAPI;
    _utils.log('LayawayAPI v' + LayawayAPI.version + ' listo');

})(typeof window !== 'undefined' ? window : globalThis);
