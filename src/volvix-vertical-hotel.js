/**
 * volvix-vertical-hotel.js
 * Volvix Vertical Module: Hotel PMS (Property Management System)
 *
 * Provides hotel-specific functionality:
 *   - Room inventory & status tracking
 *   - Reservations, check-in / check-out
 *   - Availability calendar
 *   - Seasonal rate engine
 *   - Room service / in-room charges
 *   - Folio / billing per stay
 *
 * Exposes: window.HotelAPI
 */
(function (global) {
    'use strict';

    // ---------- Storage helpers ----------
    const LS_KEY = 'volvix_hotel_state_v1';

    const defaultState = () => ({
        rooms: [],
        reservations: [],
        rates: [],          // seasonal rate rules
        services: [],       // room service catalog
        charges: [],        // posted folio charges
        guests: [],
        nextIds: { room: 1, res: 1, rate: 1, svc: 1, chg: 1, guest: 1 }
    });

    let state = loadState();

    function loadState() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return defaultState();
            return Object.assign(defaultState(), JSON.parse(raw));
        } catch (e) {
            console.warn('[HotelAPI] load failed, using defaults', e);
            return defaultState();
        }
    }

    function persist() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[HotelAPI] persist failed', e);
        }
    }

    function nextId(kind) {
        const id = state.nextIds[kind]++;
        persist();
        return id;
    }

    // ---------- Date utilities ----------
    function toISO(d) {
        if (typeof d === 'string') return d.slice(0, 10);
        const dt = new Date(d);
        return dt.toISOString().slice(0, 10);
    }

    function daysBetween(a, b) {
        const ms = new Date(toISO(b)) - new Date(toISO(a));
        return Math.max(0, Math.round(ms / 86400000));
    }

    function eachNight(checkIn, checkOut) {
        const nights = [];
        let cur = new Date(toISO(checkIn));
        const end = new Date(toISO(checkOut));
        while (cur < end) {
            nights.push(toISO(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return nights;
    }

    function dateInRange(d, start, end) {
        const x = toISO(d);
        return x >= toISO(start) && x <= toISO(end);
    }

    // ---------- Rooms ----------
    function addRoom({ number, type = 'standard', floor = 1, beds = 1, baseRate = 100, status = 'available', amenities = [] }) {
        if (!number) throw new Error('room number required');
        if (state.rooms.some(r => r.number === number)) {
            throw new Error('room number already exists: ' + number);
        }
        const room = {
            id: nextId('room'),
            number, type, floor, beds, baseRate, status, amenities,
            createdAt: new Date().toISOString()
        };
        state.rooms.push(room);
        persist();
        return room;
    }

    function updateRoom(id, patch) {
        const r = state.rooms.find(x => x.id === id);
        if (!r) throw new Error('room not found');
        Object.assign(r, patch);
        persist();
        return r;
    }

    function removeRoom(id) {
        const i = state.rooms.findIndex(r => r.id === id);
        if (i < 0) return false;
        state.rooms.splice(i, 1);
        persist();
        return true;
    }

    function listRooms(filter = {}) {
        return state.rooms.filter(r => {
            if (filter.status && r.status !== filter.status) return false;
            if (filter.type && r.type !== filter.type) return false;
            if (filter.floor != null && r.floor !== filter.floor) return false;
            return true;
        });
    }

    function setRoomStatus(id, status) {
        return updateRoom(id, { status });
    }

    // ---------- Guests ----------
    function addGuest({ name, doc = '', phone = '', email = '', notes = '' }) {
        if (!name) throw new Error('guest name required');
        const g = {
            id: nextId('guest'),
            name, doc, phone, email, notes,
            createdAt: new Date().toISOString()
        };
        state.guests.push(g);
        persist();
        return g;
    }

    function findGuest(query) {
        const q = (query || '').toLowerCase();
        return state.guests.filter(g =>
            g.name.toLowerCase().includes(q) ||
            (g.doc || '').toLowerCase().includes(q) ||
            (g.email || '').toLowerCase().includes(q)
        );
    }

    // ---------- Seasonal rates ----------
    /**
     * Rate rule: applies a multiplier or fixed nightly rate to a room type
     * during [from, to] inclusive.
     */
    function addRate({ name, roomType = '*', from, to, multiplier = null, fixedRate = null, priority = 0 }) {
        if (!from || !to) throw new Error('from/to required');
        if (multiplier == null && fixedRate == null) {
            throw new Error('either multiplier or fixedRate required');
        }
        const rule = {
            id: nextId('rate'),
            name: name || `rate-${Date.now()}`,
            roomType, from: toISO(from), to: toISO(to),
            multiplier, fixedRate, priority
        };
        state.rates.push(rule);
        persist();
        return rule;
    }

    function removeRate(id) {
        const i = state.rates.findIndex(r => r.id === id);
        if (i < 0) return false;
        state.rates.splice(i, 1);
        persist();
        return true;
    }

    function rateForNight(room, dateISO) {
        const applicable = state.rates
            .filter(r => (r.roomType === '*' || r.roomType === room.type))
            .filter(r => dateInRange(dateISO, r.from, r.to))
            .sort((a, b) => b.priority - a.priority);
        if (applicable.length === 0) return room.baseRate;
        const rule = applicable[0];
        if (rule.fixedRate != null) return rule.fixedRate;
        return Math.round(room.baseRate * rule.multiplier * 100) / 100;
    }

    function quoteStay(roomId, checkIn, checkOut) {
        const room = state.rooms.find(r => r.id === roomId);
        if (!room) throw new Error('room not found');
        const nights = eachNight(checkIn, checkOut);
        if (nights.length === 0) throw new Error('checkOut must be after checkIn');
        const breakdown = nights.map(d => ({ date: d, rate: rateForNight(room, d) }));
        const total = breakdown.reduce((s, n) => s + n.rate, 0);
        return { roomId, nights: breakdown.length, breakdown, total: Math.round(total * 100) / 100 };
    }

    // ---------- Availability ----------
    function isRoomAvailable(roomId, checkIn, checkOut, ignoreReservationId = null) {
        const ci = toISO(checkIn), co = toISO(checkOut);
        return !state.reservations.some(r => {
            if (r.id === ignoreReservationId) return false;
            if (r.roomId !== roomId) return false;
            if (['cancelled', 'checked_out', 'no_show'].includes(r.status)) return false;
            // overlap if r.checkIn < co && r.checkOut > ci
            return r.checkIn < co && r.checkOut > ci;
        });
    }

    function availableRooms(checkIn, checkOut, filter = {}) {
        return listRooms(filter).filter(r =>
            r.status !== 'out_of_service' &&
            isRoomAvailable(r.id, checkIn, checkOut)
        );
    }

    function calendar(fromDate, days = 14) {
        const start = new Date(toISO(fromDate));
        const grid = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const iso = toISO(d);
            const row = { date: iso, rooms: {} };
            state.rooms.forEach(rm => {
                const occupied = state.reservations.find(r =>
                    r.roomId === rm.id &&
                    !['cancelled', 'no_show'].includes(r.status) &&
                    iso >= r.checkIn && iso < r.checkOut
                );
                row.rooms[rm.number] = occupied
                    ? { status: 'occupied', resId: occupied.id, guest: occupied.guestName }
                    : { status: rm.status };
            });
            grid.push(row);
        }
        return grid;
    }

    // ---------- Reservations ----------
    function createReservation({ roomId, guestName, guestId = null, checkIn, checkOut, adults = 1, children = 0, notes = '' }) {
        const room = state.rooms.find(r => r.id === roomId);
        if (!room) throw new Error('room not found');
        if (!guestName) throw new Error('guestName required');
        const ci = toISO(checkIn), co = toISO(checkOut);
        if (co <= ci) throw new Error('checkOut must be after checkIn');
        if (!isRoomAvailable(roomId, ci, co)) throw new Error('room not available for those dates');

        const quote = quoteStay(roomId, ci, co);
        const res = {
            id: nextId('res'),
            roomId, guestId, guestName,
            checkIn: ci, checkOut: co,
            adults, children, notes,
            status: 'booked',
            quote,
            createdAt: new Date().toISOString()
        };
        state.reservations.push(res);
        persist();
        return res;
    }

    function cancelReservation(id, reason = '') {
        const r = state.reservations.find(x => x.id === id);
        if (!r) throw new Error('reservation not found');
        r.status = 'cancelled';
        r.cancelReason = reason;
        r.cancelledAt = new Date().toISOString();
        persist();
        return r;
    }

    function checkIn(id) {
        const r = state.reservations.find(x => x.id === id);
        if (!r) throw new Error('reservation not found');
        if (r.status !== 'booked') throw new Error('cannot check-in from status ' + r.status);
        r.status = 'checked_in';
        r.checkedInAt = new Date().toISOString();
        const room = state.rooms.find(x => x.id === r.roomId);
        if (room) room.status = 'occupied';
        persist();
        return r;
    }

    function checkOut(id) {
        const r = state.reservations.find(x => x.id === id);
        if (!r) throw new Error('reservation not found');
        if (r.status !== 'checked_in') throw new Error('cannot check-out from status ' + r.status);
        r.status = 'checked_out';
        r.checkedOutAt = new Date().toISOString();
        const room = state.rooms.find(x => x.id === r.roomId);
        if (room) room.status = 'dirty';
        const folio = getFolio(id);
        r.finalTotal = folio.total;
        persist();
        return { reservation: r, folio };
    }

    function listReservations(filter = {}) {
        return state.reservations.filter(r => {
            if (filter.status && r.status !== filter.status) return false;
            if (filter.roomId && r.roomId !== filter.roomId) return false;
            if (filter.date) {
                const d = toISO(filter.date);
                if (!(d >= r.checkIn && d < r.checkOut)) return false;
            }
            return true;
        });
    }

    // ---------- Room service / charges ----------
    function addService({ code, name, price, category = 'misc', taxable = true }) {
        if (!code || !name) throw new Error('code and name required');
        const svc = { id: nextId('svc'), code, name, price, category, taxable };
        state.services.push(svc);
        persist();
        return svc;
    }

    function listServices(category = null) {
        return category ? state.services.filter(s => s.category === category) : state.services.slice();
    }

    function postCharge({ reservationId, serviceCode = null, description = '', amount = null, qty = 1 }) {
        const res = state.reservations.find(x => x.id === reservationId);
        if (!res) throw new Error('reservation not found');
        if (!['checked_in', 'booked'].includes(res.status)) {
            throw new Error('cannot post charge to ' + res.status);
        }
        let unit = amount, name = description;
        if (serviceCode) {
            const svc = state.services.find(s => s.code === serviceCode);
            if (!svc) throw new Error('service not found: ' + serviceCode);
            unit = unit != null ? unit : svc.price;
            name = name || svc.name;
        }
        if (unit == null) throw new Error('amount required when no serviceCode');
        const charge = {
            id: nextId('chg'),
            reservationId, serviceCode, description: name,
            unit, qty, total: Math.round(unit * qty * 100) / 100,
            postedAt: new Date().toISOString()
        };
        state.charges.push(charge);
        persist();
        return charge;
    }

    function voidCharge(id) {
        const c = state.charges.find(x => x.id === id);
        if (!c) throw new Error('charge not found');
        c.voided = true;
        c.voidedAt = new Date().toISOString();
        persist();
        return c;
    }

    function getFolio(reservationId) {
        const res = state.reservations.find(x => x.id === reservationId);
        if (!res) throw new Error('reservation not found');
        const charges = state.charges.filter(c => c.reservationId === reservationId && !c.voided);
        const lodging = res.quote ? res.quote.total : 0;
        const extras = charges.reduce((s, c) => s + c.total, 0);
        const total = Math.round((lodging + extras) * 100) / 100;
        return {
            reservationId,
            guest: res.guestName,
            nights: res.quote ? res.quote.nights : daysBetween(res.checkIn, res.checkOut),
            lodging,
            extras,
            charges,
            total
        };
    }

    // ---------- Reports ----------
    function occupancyReport(date) {
        const d = toISO(date || new Date());
        const total = state.rooms.length;
        if (total === 0) return { date: d, total: 0, occupied: 0, occupancy: 0 };
        const occupied = state.reservations.filter(r =>
            !['cancelled', 'no_show'].includes(r.status) &&
            d >= r.checkIn && d < r.checkOut
        ).length;
        return {
            date: d,
            total,
            occupied,
            available: total - occupied,
            occupancy: Math.round((occupied / total) * 10000) / 100
        };
    }

    function revenueReport(from, to) {
        const f = toISO(from), t = toISO(to);
        const lodging = state.reservations
            .filter(r => r.checkIn >= f && r.checkIn <= t && r.status !== 'cancelled')
            .reduce((s, r) => s + (r.quote ? r.quote.total : 0), 0);
        const extras = state.charges
            .filter(c => !c.voided && c.postedAt.slice(0, 10) >= f && c.postedAt.slice(0, 10) <= t)
            .reduce((s, c) => s + c.total, 0);
        return {
            from: f, to: t,
            lodging: Math.round(lodging * 100) / 100,
            extras: Math.round(extras * 100) / 100,
            total: Math.round((lodging + extras) * 100) / 100
        };
    }

    // ---------- Maintenance ----------
    function reset() {
        state = defaultState();
        persist();
        return true;
    }

    function exportData() {
        return JSON.parse(JSON.stringify(state));
    }

    function importData(data) {
        if (!data || typeof data !== 'object') throw new Error('invalid data');
        state = Object.assign(defaultState(), data);
        persist();
        return true;
    }

    // ---------- Public API ----------
    const HotelAPI = {
        // rooms
        addRoom, updateRoom, removeRoom, listRooms, setRoomStatus,
        // guests
        addGuest, findGuest,
        // rates
        addRate, removeRate, rateForNight, quoteStay,
        // availability
        isRoomAvailable, availableRooms, calendar,
        // reservations
        createReservation, cancelReservation, checkIn, checkOut, listReservations,
        // services & charges
        addService, listServices, postCharge, voidCharge, getFolio,
        // reports
        occupancyReport, revenueReport,
        // maintenance
        reset, exportData, importData,
        // meta
        version: '1.0.0',
        moduleName: 'volvix-vertical-hotel'
    };

    global.HotelAPI = HotelAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HotelAPI;
    }
})(typeof window !== 'undefined' ? window : globalThis);
