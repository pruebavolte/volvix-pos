/* ============================================================
 * volvix-vertical-karaoke.js
 * Volvix POS — Vertical Karaoke
 * Salas privadas por hora, bebidas, comida, reservas.
 * API global: window.KaraokeAPI
 * ============================================================ */
(function (global) {
    'use strict';

    // ---------- Catálogo de salas ----------
    const ROOMS = [
        { id: 'R-01', name: 'Sala Tokyo',     capacity: 4,  hourly: 180, premium: false },
        { id: 'R-02', name: 'Sala Seoul',     capacity: 6,  hourly: 240, premium: false },
        { id: 'R-03', name: 'Sala Osaka',     capacity: 8,  hourly: 320, premium: false },
        { id: 'R-04', name: 'Sala VIP Gold',  capacity: 10, hourly: 480, premium: true  },
        { id: 'R-05', name: 'Sala VIP Black', capacity: 14, hourly: 650, premium: true  },
        { id: 'R-06', name: 'Sala Family',    capacity: 12, hourly: 380, premium: false },
        { id: 'R-07', name: 'Sala Couple',    capacity: 2,  hourly: 140, premium: false },
        { id: 'R-08', name: 'Sala Mega VIP',  capacity: 20, hourly: 950, premium: true  }
    ];

    // ---------- Catálogo de bebidas ----------
    const DRINKS = [
        { sku: 'D-CERV-01', name: 'Cerveza Nacional 355ml', price: 45,  type: 'alcohol', stock: 240 },
        { sku: 'D-CERV-02', name: 'Cerveza Importada',      price: 75,  type: 'alcohol', stock: 120 },
        { sku: 'D-WHIS-01', name: 'Whisky Etiqueta Roja',   price: 120, type: 'alcohol', stock: 60  },
        { sku: 'D-WHIS-02', name: 'Whisky Etiqueta Negra',  price: 220, type: 'alcohol', stock: 30  },
        { sku: 'D-VODK-01', name: 'Vodka Premium shot',     price: 90,  type: 'alcohol', stock: 80  },
        { sku: 'D-COCT-01', name: 'Margarita',              price: 110, type: 'cocktail',stock: 999 },
        { sku: 'D-COCT-02', name: 'Mojito',                 price: 110, type: 'cocktail',stock: 999 },
        { sku: 'D-COCT-03', name: 'Piña Colada',            price: 120, type: 'cocktail',stock: 999 },
        { sku: 'D-REFR-01', name: 'Refresco 600ml',         price: 35,  type: 'soft',    stock: 300 },
        { sku: 'D-AGUA-01', name: 'Agua mineral',           price: 25,  type: 'soft',    stock: 500 },
        { sku: 'D-JARRA-01',name: 'Jarra cerveza 1.5L',     price: 180, type: 'alcohol', stock: 90  },
        { sku: 'D-BOT-01',  name: 'Botella Tequila 750ml',  price: 950, type: 'bottle',  stock: 25  }
    ];

    // ---------- Catálogo de comida ----------
    const FOOD = [
        { sku: 'F-BOT-01', name: 'Botana mixta',         price: 180 },
        { sku: 'F-BOT-02', name: 'Alitas BBQ (10pz)',    price: 220 },
        { sku: 'F-BOT-03', name: 'Alitas Buffalo (10pz)',price: 220 },
        { sku: 'F-BOT-04', name: 'Nachos supremos',      price: 165 },
        { sku: 'F-BOT-05', name: 'Papas a la francesa',  price: 95  },
        { sku: 'F-BOT-06', name: 'Aros de cebolla',      price: 110 },
        { sku: 'F-PIZ-01', name: 'Pizza personal',       price: 180 },
        { sku: 'F-PIZ-02', name: 'Pizza familiar',       price: 320 },
        { sku: 'F-HAM-01', name: 'Hamburguesa clásica',  price: 175 },
        { sku: 'F-HAM-02', name: 'Hamburguesa BBQ',      price: 195 },
        { sku: 'F-TAC-01', name: 'Orden de tacos (4pz)', price: 145 },
        { sku: 'F-POS-01', name: 'Postre del día',       price: 85  }
    ];

    // ---------- Estado ----------
    const state = {
        reservations: {},   // resId -> reservation
        sessions:     {},   // roomId -> activeSession
        orders:       {},   // orderId -> order
        counters: { res: 1000, ord: 5000, ses: 9000 }
    };

    // ---------- Helpers ----------
    const now      = () => Date.now();
    const uid      = (p, k) => `${p}-${++state.counters[k]}`;
    const findRoom = id => ROOMS.find(r => r.id === id);
    const findItem = sku => DRINKS.find(d => d.sku === sku) || FOOD.find(f => f.sku === sku);
    const round2   = n => Math.round(n * 100) / 100;
    const isPeak   = ts => { const h = new Date(ts).getHours(); return h >= 21 || h < 3; };

    function calcRoomCharge(room, minutes, startTs) {
        const base = room.hourly * (minutes / 60);
        const peak = isPeak(startTs) ? base * 0.20 : 0;
        return round2(base + peak);
    }

    function applyHappyHour(price, ts) {
        const h = new Date(ts).getHours();
        // 18:00 - 20:59 happy hour: 25% off bebidas alcohol/cocktail
        return (h >= 18 && h < 21) ? round2(price * 0.75) : price;
    }

    // ---------- Reservas ----------
    function createReservation({ roomId, customer, phone, partySize, startTs, hours }) {
        const room = findRoom(roomId);
        if (!room) throw new Error('Sala no existe');
        if (partySize > room.capacity) throw new Error('Excede capacidad de sala');
        if (!startTs || !hours) throw new Error('Falta horario');

        const conflict = Object.values(state.reservations).some(r =>
            r.roomId === roomId && r.status === 'confirmed' &&
            !(startTs + hours * 3600e3 <= r.startTs || startTs >= r.startTs + r.hours * 3600e3)
        );
        if (conflict) throw new Error('Sala ocupada en ese horario');

        const id = uid('RES', 'res');
        const deposit = round2(room.hourly * hours * 0.30);
        state.reservations[id] = {
            id, roomId, customer, phone, partySize,
            startTs, hours, deposit,
            status: 'confirmed', createdAt: now()
        };
        return state.reservations[id];
    }

    function cancelReservation(resId) {
        const r = state.reservations[resId];
        if (!r) throw new Error('Reserva no existe');
        const hoursToStart = (r.startTs - now()) / 3600e3;
        const refund = hoursToStart >= 24 ? r.deposit
                     : hoursToStart >=  4 ? round2(r.deposit * 0.50)
                     : 0;
        r.status = 'cancelled';
        r.refund = refund;
        return { id: resId, refund, status: 'cancelled' };
    }

    // ---------- Sesiones de sala ----------
    function checkIn(roomId, resId) {
        const room = findRoom(roomId);
        if (!room) throw new Error('Sala no existe');
        if (state.sessions[roomId]) throw new Error('Sala ya activa');
        const id = uid('SES', 'ses');
        const session = {
            id, roomId, resId: resId || null,
            startTs: now(), endTs: null,
            orders: [], status: 'active'
        };
        state.sessions[roomId] = session;
        return session;
    }

    function checkOut(roomId) {
        const session = state.sessions[roomId];
        if (!session) throw new Error('Sin sesión activa');
        session.endTs = now();
        session.status = 'closed';
        const minutes = Math.max(60, Math.ceil((session.endTs - session.startTs) / 60000));
        const room = findRoom(roomId);
        const roomCharge = calcRoomCharge(room, minutes, session.startTs);

        const items = session.orders.flatMap(oid => state.orders[oid].lines);
        const itemsTotal = round2(items.reduce((s, l) => s + l.subtotal, 0));
        const subtotal = round2(roomCharge + itemsTotal);
        const tax      = round2(subtotal * 0.16);
        const tip      = round2(subtotal * 0.10);
        const total    = round2(subtotal + tax + tip);

        const ticket = {
            sessionId: session.id, roomId, minutes,
            roomCharge, itemsTotal, subtotal, tax, tip, total,
            paidAt: session.endTs
        };
        delete state.sessions[roomId];
        return ticket;
    }

    // ---------- Órdenes (bebidas + comida) ----------
    function addOrder(roomId, lines) {
        const session = state.sessions[roomId];
        if (!session) throw new Error('Sin sesión activa');
        if (!Array.isArray(lines) || !lines.length) throw new Error('Orden vacía');

        const id = uid('ORD', 'ord');
        const ts = now();
        const built = lines.map(l => {
            const item = findItem(l.sku);
            if (!item) throw new Error(`SKU desconocido: ${l.sku}`);
            const qty = l.qty || 1;
            let unit = item.price;
            if (item.type === 'alcohol' || item.type === 'cocktail') {
                unit = applyHappyHour(unit, ts);
            }
            const subtotal = round2(unit * qty);
            if (item.stock !== undefined) {
                if (item.stock < qty) throw new Error(`Sin stock: ${item.name}`);
                item.stock -= qty;
            }
            return { sku: item.sku, name: item.name, qty, unit, subtotal };
        });

        state.orders[id] = {
            id, roomId, sessionId: session.id,
            lines: built, ts, status: 'open'
        };
        session.orders.push(id);
        return state.orders[id];
    }

    function voidOrder(orderId) {
        const o = state.orders[orderId];
        if (!o) throw new Error('Orden no existe');
        o.lines.forEach(l => {
            const item = findItem(l.sku);
            if (item && item.stock !== undefined) item.stock += l.qty;
        });
        o.status = 'void';
        return o;
    }

    // ---------- Reportes ----------
    function dashboard() {
        const activeRooms = Object.keys(state.sessions).length;
        const todayRes = Object.values(state.reservations)
            .filter(r => r.status === 'confirmed').length;
        const lowStock = DRINKS.filter(d => d.stock < 30).map(d => d.sku);
        return {
            ts: now(),
            rooms: { total: ROOMS.length, active: activeRooms, free: ROOMS.length - activeRooms },
            reservations: todayRes,
            lowStock
        };
    }

    function listAvailability(startTs, hours) {
        return ROOMS.map(room => {
            const busy = Object.values(state.reservations).some(r =>
                r.roomId === room.id && r.status === 'confirmed' &&
                !(startTs + hours * 3600e3 <= r.startTs || startTs >= r.startTs + r.hours * 3600e3)
            ) || !!state.sessions[room.id];
            return {
                id: room.id, name: room.name, capacity: room.capacity,
                hourly: room.hourly, premium: room.premium, available: !busy
            };
        });
    }

    // ---------- API pública ----------
    const KaraokeAPI = {
        // catálogos
        getRooms:   () => ROOMS.slice(),
        getDrinks:  () => DRINKS.slice(),
        getFood:    () => FOOD.slice(),
        // reservas
        reserve:           createReservation,
        cancelReservation: cancelReservation,
        listReservations:  () => Object.values(state.reservations),
        // sesiones
        checkIn, checkOut,
        activeSessions: () => Object.values(state.sessions),
        // órdenes
        addOrder, voidOrder,
        getOrder: id => state.orders[id] || null,
        // utilidades
        availability: listAvailability,
        dashboard,
        version: '1.0.0',
        _state: state // debug
    };

    global.KaraokeAPI = KaraokeAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = KaraokeAPI;
})(typeof window !== 'undefined' ? window : globalThis);
