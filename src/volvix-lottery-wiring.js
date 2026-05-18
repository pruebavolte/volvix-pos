/* ============================================================================
 * volvix-lottery-wiring.js
 * Sistema de sorteos para Volvix POS
 * - Clientes acumulan boletos según condiciones (compras, monto, productos)
 * - Selección de ganador aleatorio con semilla criptográfica
 * - Premios configurables (efectivo, producto, descuento, custom)
 * - Condiciones de elegibilidad (mínimo de compras, periodo, categorías)
 * - Persistencia en localStorage + emisión de eventos
 * Expone: window.LotteryAPI
 * ==========================================================================*/
(function (global) {
    'use strict';

    const STORAGE_KEY = 'volvix_lottery_v1';
    const EVENT_PREFIX = 'volvix:lottery:';

    // ----- Utilidades -----------------------------------------------------
    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) +
               '_' + Math.random().toString(36).slice(2, 8);
    }

    function nowIso() { return new Date().toISOString(); }

    function cryptoRandom() {
        try {
            const buf = new Uint32Array(1);
            (global.crypto || global.msCrypto).getRandomValues(buf);
            return buf[0] / 0xFFFFFFFF;
        } catch (e) {
            return Math.random();
        }
    }

    function emit(type, detail) {
        try {
            const ev = new CustomEvent(EVENT_PREFIX + type, { detail: detail });
            global.dispatchEvent(ev);
        } catch (e) { /* noop */ }
    }

    // ----- Estado ---------------------------------------------------------
    const state = {
        lotteries: {},      // id -> lottery
        clients:   {},      // clientId -> { id, name, phone, tickets:[], stats }
        history:   []       // sorteos realizados
    };

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[Lottery] No se pudo persistir:', e);
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            Object.assign(state, data);
        } catch (e) {
            console.warn('[Lottery] Estado corrupto, reiniciando.');
        }
    }

    // ----- Clientes -------------------------------------------------------
    function registerClient(info) {
        if (!info || !info.name) throw new Error('name requerido');
        const id = info.id || uid('cli');
        state.clients[id] = {
            id: id,
            name: info.name,
            phone: info.phone || '',
            email: info.email || '',
            createdAt: nowIso(),
            tickets: [],
            stats: { purchases: 0, totalSpent: 0, lastPurchaseAt: null }
        };
        persist();
        emit('client:registered', state.clients[id]);
        return state.clients[id];
    }

    function getClient(id) { return state.clients[id] || null; }

    function listClients() { return Object.values(state.clients); }

    // ----- Loterías -------------------------------------------------------
    function createLottery(cfg) {
        const id = cfg.id || uid('lot');
        const lot = {
            id: id,
            name: cfg.name || 'Sorteo sin nombre',
            description: cfg.description || '',
            createdAt: nowIso(),
            startsAt: cfg.startsAt || nowIso(),
            endsAt: cfg.endsAt || null,
            status: 'open',                       // open | closed | drawn
            prizes: (cfg.prizes || []).map(normalizePrize),
            conditions: cfg.conditions || {       // condiciones de elegibilidad
                minPurchases: 0,
                minAmount: 0,
                requiredCategories: [],
                periodFrom: null,
                periodTo: null
            },
            ticketRules: cfg.ticketRules || {     // cómo se otorgan boletos
                ticketsPerPurchase: 1,
                ticketsPerAmount: 0,              // 1 boleto cada X gastado
                amountStep: 100,
                bonusCategories: {}               // cat -> boletos extra
            },
            participants: {}                      // clientId -> [ticketIds]
        };
        state.lotteries[id] = lot;
        persist();
        emit('lottery:created', lot);
        return lot;
    }

    function normalizePrize(p) {
        return {
            id: p.id || uid('prz'),
            type: p.type || 'cash',               // cash | product | discount | custom
            label: p.label || 'Premio',
            value: p.value || 0,
            quantity: p.quantity || 1,
            meta: p.meta || {}
        };
    }

    function getLottery(id) { return state.lotteries[id] || null; }

    function listLotteries(filter) {
        const arr = Object.values(state.lotteries);
        if (!filter) return arr;
        return arr.filter(l => l.status === filter);
    }

    function closeLottery(id) {
        const lot = getLottery(id);
        if (!lot) throw new Error('Loteria no existe');
        lot.status = 'closed';
        persist();
        emit('lottery:closed', lot);
        return lot;
    }

    // ----- Boletos --------------------------------------------------------
    function isEligible(lot, client, purchase) {
        const c = lot.conditions || {};
        if (client.stats.purchases < (c.minPurchases || 0)) return false;
        if (client.stats.totalSpent < (c.minAmount || 0)) return false;
        if (c.requiredCategories && c.requiredCategories.length && purchase) {
            const cats = purchase.categories || [];
            const ok = c.requiredCategories.every(rc => cats.indexOf(rc) >= 0);
            if (!ok) return false;
        }
        if (c.periodFrom && purchase && purchase.at < c.periodFrom) return false;
        if (c.periodTo && purchase && purchase.at > c.periodTo) return false;
        return true;
    }

    function calcTickets(lot, purchase) {
        const r = lot.ticketRules || {};
        let n = r.ticketsPerPurchase || 0;
        if (r.ticketsPerAmount && r.amountStep) {
            n += Math.floor((purchase.amount || 0) / r.amountStep) *
                 r.ticketsPerAmount;
        }
        if (r.bonusCategories && purchase.categories) {
            purchase.categories.forEach(cat => {
                if (r.bonusCategories[cat]) n += r.bonusCategories[cat];
            });
        }
        return Math.max(0, n);
    }

    function awardTickets(lotteryId, clientId, purchase) {
        const lot = getLottery(lotteryId);
        const client = getClient(clientId);
        if (!lot || !client) throw new Error('Loteria o cliente inexistente');
        if (lot.status !== 'open') return [];

        // Actualiza stats del cliente
        client.stats.purchases += 1;
        client.stats.totalSpent += (purchase && purchase.amount) || 0;
        client.stats.lastPurchaseAt = nowIso();

        if (!isEligible(lot, client, purchase)) {
            persist();
            emit('ticket:rejected', { lotteryId, clientId, reason: 'no_eligible' });
            return [];
        }

        const count = calcTickets(lot, purchase || {});
        const ids = [];
        for (let i = 0; i < count; i++) {
            const tid = uid('tkt');
            ids.push(tid);
            client.tickets.push({ id: tid, lotteryId: lot.id, at: nowIso() });
            if (!lot.participants[clientId]) lot.participants[clientId] = [];
            lot.participants[clientId].push(tid);
        }
        persist();
        emit('ticket:awarded', { lotteryId, clientId, ticketIds: ids });
        return ids;
    }

    // ----- Sorteo ---------------------------------------------------------
    function drawWinner(lotteryId, opts) {
        opts = opts || {};
        const lot = getLottery(lotteryId);
        if (!lot) throw new Error('Loteria no existe');
        if (lot.status === 'drawn' && !opts.force) {
            throw new Error('Loteria ya sorteada');
        }

        // Pool plano de boletos
        const pool = [];
        Object.keys(lot.participants).forEach(cid => {
            lot.participants[cid].forEach(tid => pool.push({ tid, cid }));
        });

        if (!pool.length) {
            emit('lottery:empty', lot);
            throw new Error('No hay boletos en el sorteo');
        }

        // Selección por premio (sin reposición salvo allowRepeat)
        const winners = [];
        const used = new Set();
        lot.prizes.forEach(prize => {
            for (let q = 0; q < prize.quantity; q++) {
                const candidates = opts.allowRepeat
                    ? pool
                    : pool.filter(p => !used.has(p.cid));
                if (!candidates.length) break;
                const pick = candidates[Math.floor(cryptoRandom() * candidates.length)];
                used.add(pick.cid);
                const client = getClient(pick.cid);
                winners.push({
                    prizeId: prize.id,
                    prizeLabel: prize.label,
                    prizeType: prize.type,
                    prizeValue: prize.value,
                    ticketId: pick.tid,
                    clientId: pick.cid,
                    clientName: client ? client.name : '(desconocido)',
                    drawnAt: nowIso()
                });
            }
        });

        lot.status = 'drawn';
        lot.winners = winners;
        lot.drawnAt = nowIso();
        state.history.push({
            lotteryId: lot.id,
            name: lot.name,
            winners: winners,
            at: lot.drawnAt
        });
        persist();
        emit('lottery:drawn', { lottery: lot, winners: winners });
        return winners;
    }

    function getHistory() { return state.history.slice(); }

    function reset(confirmToken) {
        if (confirmToken !== 'CONFIRM_RESET') return false;
        state.lotteries = {};
        state.clients = {};
        state.history = [];
        persist();
        emit('reset', {});
        return true;
    }

    // ----- Init -----------------------------------------------------------
    load();

    const LotteryAPI = {
        version: '1.0.0',
        // clientes
        registerClient, getClient, listClients,
        // loterías
        createLottery, getLottery, listLotteries, closeLottery,
        // boletos
        awardTickets, isEligible, calcTickets,
        // sorteo
        drawWinner, getHistory,
        // util
        reset,
        _state: state // solo lectura/depuración
    };

    global.LotteryAPI = LotteryAPI;
    emit('ready', { version: LotteryAPI.version });
    console.log('[Volvix Lottery] Listo. window.LotteryAPI v' + LotteryAPI.version);

})(typeof window !== 'undefined' ? window : this);
