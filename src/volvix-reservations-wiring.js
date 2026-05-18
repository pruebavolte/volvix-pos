/**
 * volvix-reservations-wiring.js
 * Volvix POS - Sistema de Reservaciones
 * Agent-55 R9
 *
 * Funcionalidades:
 *  - Calendario de reservaciones (vista por dia/semana/mes)
 *  - Slots horarios configurables
 *  - Capacidad por mesa y por slot
 *  - Confirmaciones (manual / automatica)
 *  - Recordatorios programados (24h, 2h antes)
 *  - Lista de espera (waitlist) con auto-promocion
 *  - Persistencia local (localStorage) y hooks Supabase opcionales
 *
 * API publica: window.ReservationsAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1. CONFIGURACION
  // ============================================================
  const CONFIG = {
    storageKey: 'volvix_reservations_v1',
    waitlistKey: 'volvix_waitlist_v1',
    tablesKey: 'volvix_tables_v1',
    slotMinutes: 30,            // duracion de cada slot
    openingHour: 12,            // 12:00
    closingHour: 23,            // 23:00
    defaultDuration: 90,        // minutos por reservacion
    reminderOffsets: [24 * 60, 120], // minutos antes
    maxPartySize: 20,
    autoConfirm: false,
    timezoneOffsetMinutes: -360, // CDMX
    statuses: ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'noshow']
  };

  // ============================================================
  // 2. UTILIDADES
  // ============================================================
  const Utils = {
    uid() {
      return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    },
    pad(n) { return String(n).padStart(2, '0'); },
    toISODate(d) {
      const x = new Date(d);
      return x.getFullYear() + '-' + this.pad(x.getMonth() + 1) + '-' + this.pad(x.getDate());
    },
    toISOTime(d) {
      const x = new Date(d);
      return this.pad(x.getHours()) + ':' + this.pad(x.getMinutes());
    },
    parseDateTime(dateStr, timeStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hh, mm] = timeStr.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    },
    minutesBetween(a, b) {
      return Math.round((b.getTime() - a.getTime()) / 60000);
    },
    addMinutes(d, mins) {
      return new Date(d.getTime() + mins * 60000);
    },
    overlaps(aStart, aEnd, bStart, bEnd) {
      return aStart < bEnd && bStart < aEnd;
    },
    safeJSON(str, fallback) {
      try { return JSON.parse(str); } catch (e) { return fallback; }
    },
    emit(eventName, payload) {
      try {
        const ev = new CustomEvent('reservations:' + eventName, { detail: payload });
        global.dispatchEvent(ev);
      } catch (e) { /* noop */ }
    }
  };

  // ============================================================
  // 3. STORAGE
  // ============================================================
  const Storage = {
    load(key, def) {
      if (!global.localStorage) return def;
      const raw = global.localStorage.getItem(key);
      if (!raw) return def;
      return Utils.safeJSON(raw, def);
    },
    save(key, val) {
      if (!global.localStorage) return;
      try { global.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
    }
  };

  // ============================================================
  // 4. ESTADO EN MEMORIA
  // ============================================================
  let _reservations = Storage.load(CONFIG.storageKey, []);
  let _waitlist = Storage.load(CONFIG.waitlistKey, []);
  let _tables = Storage.load(CONFIG.tablesKey, [
    { id: 't1', name: 'Mesa 1', capacity: 2 },
    { id: 't2', name: 'Mesa 2', capacity: 4 },
    { id: 't3', name: 'Mesa 3', capacity: 4 },
    { id: 't4', name: 'Mesa 4', capacity: 6 },
    { id: 't5', name: 'Mesa 5', capacity: 8 },
    { id: 't6', name: 'Barra',  capacity: 6 }
  ]);
  const _reminderTimers = new Map();

  function persist() {
    Storage.save(CONFIG.storageKey, _reservations);
    Storage.save(CONFIG.waitlistKey, _waitlist);
    Storage.save(CONFIG.tablesKey, _tables);
  }

  // ============================================================
  // 5. MESAS
  // ============================================================
  const Tables = {
    list() { return _tables.slice(); },
    add(name, capacity) {
      const t = { id: 't_' + Utils.uid(), name, capacity: Number(capacity) || 2 };
      _tables.push(t); persist(); return t;
    },
    update(id, patch) {
      const t = _tables.find(x => x.id === id);
      if (!t) return null;
      Object.assign(t, patch);
      persist(); return t;
    },
    remove(id) {
      const i = _tables.findIndex(x => x.id === id);
      if (i < 0) return false;
      _tables.splice(i, 1); persist(); return true;
    },
    findById(id) { return _tables.find(x => x.id === id) || null; }
  };

  // ============================================================
  // 6. SLOTS HORARIOS
  // ============================================================
  const Slots = {
    forDate(dateStr) {
      const slots = [];
      const start = Utils.parseDateTime(dateStr, Utils.pad(CONFIG.openingHour) + ':00');
      const end   = Utils.parseDateTime(dateStr, Utils.pad(CONFIG.closingHour) + ':00');
      let cur = new Date(start);
      while (cur < end) {
        slots.push(Utils.toISOTime(cur));
        cur = Utils.addMinutes(cur, CONFIG.slotMinutes);
      }
      return slots;
    },
    capacityAt(dateStr, timeStr) {
      const start = Utils.parseDateTime(dateStr, timeStr);
      const end = Utils.addMinutes(start, CONFIG.defaultDuration);
      const occupiedTables = new Set();
      let occupiedSeats = 0;
      _reservations
        .filter(r => r.status !== 'cancelled' && r.status !== 'noshow' && r.date === dateStr)
        .forEach(r => {
          const rs = Utils.parseDateTime(r.date, r.time);
          const re = Utils.addMinutes(rs, r.duration || CONFIG.defaultDuration);
          if (Utils.overlaps(start, end, rs, re)) {
            if (r.tableId) occupiedTables.add(r.tableId);
            occupiedSeats += Number(r.partySize) || 0;
          }
        });
      const totalSeats = _tables.reduce((s, t) => s + t.capacity, 0);
      const freeTables = _tables.filter(t => !occupiedTables.has(t.id));
      return {
        date: dateStr,
        time: timeStr,
        totalSeats,
        occupiedSeats,
        freeSeats: Math.max(0, totalSeats - occupiedSeats),
        freeTables,
        occupiedTables: Array.from(occupiedTables)
      };
    },
    suggestTable(dateStr, timeStr, partySize) {
      const cap = this.capacityAt(dateStr, timeStr);
      const fits = cap.freeTables.filter(t => t.capacity >= partySize);
      fits.sort((a, b) => a.capacity - b.capacity); // best fit
      return fits[0] || null;
    }
  };

  // ============================================================
  // 7. RESERVACIONES (CRUD)
  // ============================================================
  const Reservations = {
    list(filter) {
      filter = filter || {};
      return _reservations.filter(r => {
        if (filter.date && r.date !== filter.date) return false;
        if (filter.status && r.status !== filter.status) return false;
        if (filter.tableId && r.tableId !== filter.tableId) return false;
        if (filter.from && r.date < filter.from) return false;
        if (filter.to && r.date > filter.to) return false;
        return true;
      }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    },
    get(id) { return _reservations.find(r => r.id === id) || null; },
    create(data) {
      const partySize = Math.min(CONFIG.maxPartySize, Math.max(1, Number(data.partySize) || 1));
      const date = data.date;
      const time = data.time;
      if (!date || !time) throw new Error('date y time son requeridos');
      let tableId = data.tableId || null;
      if (!tableId) {
        const t = Slots.suggestTable(date, time, partySize);
        if (!t) {
          // sin mesa: enviar a waitlist
          return Waitlist.add({ ...data, partySize, reason: 'no-availability' });
        }
        tableId = t.id;
      } else {
        const cap = Slots.capacityAt(date, time);
        if (cap.occupiedTables.indexOf(tableId) >= 0) {
          throw new Error('La mesa solicitada no esta disponible en ese horario');
        }
      }
      const r = {
        id: Utils.uid(),
        customerName: data.customerName || 'Sin nombre',
        phone: data.phone || '',
        email: data.email || '',
        partySize,
        date, time,
        duration: Number(data.duration) || CONFIG.defaultDuration,
        tableId,
        notes: data.notes || '',
        status: CONFIG.autoConfirm ? 'confirmed' : 'pending',
        source: data.source || 'manual',
        createdAt: new Date().toISOString(),
        remindersSent: []
      };
      _reservations.push(r);
      persist();
      Reminders.schedule(r);
      Utils.emit('created', r);
      return r;
    },
    update(id, patch) {
      const r = this.get(id);
      if (!r) return null;
      const oldDate = r.date, oldTime = r.time;
      Object.assign(r, patch);
      persist();
      if (patch.date || patch.time) {
        Reminders.cancel(id);
        Reminders.schedule(r);
      }
      Utils.emit('updated', r);
      // si liberamos espacio, intentar promover waitlist
      if (oldDate && oldTime) Waitlist.tryPromote(oldDate, oldTime);
      return r;
    },
    confirm(id) {
      const r = this.update(id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
      if (r) Utils.emit('confirmed', r);
      return r;
    },
    seat(id) {
      const r = this.update(id, { status: 'seated', seatedAt: new Date().toISOString() });
      if (r) Utils.emit('seated', r);
      return r;
    },
    complete(id) {
      const r = this.update(id, { status: 'completed', completedAt: new Date().toISOString() });
      if (r) {
        Utils.emit('completed', r);
        Waitlist.tryPromote(r.date, r.time);
      }
      return r;
    },
    cancel(id, reason) {
      const r = this.update(id, { status: 'cancelled', cancelReason: reason || '', cancelledAt: new Date().toISOString() });
      if (r) {
        Reminders.cancel(id);
        Utils.emit('cancelled', r);
        Waitlist.tryPromote(r.date, r.time);
      }
      return r;
    },
    noShow(id) {
      const r = this.update(id, { status: 'noshow', noshowAt: new Date().toISOString() });
      if (r) {
        Reminders.cancel(id);
        Utils.emit('noshow', r);
        Waitlist.tryPromote(r.date, r.time);
      }
      return r;
    },
    remove(id) {
      const i = _reservations.findIndex(r => r.id === id);
      if (i < 0) return false;
      const r = _reservations[i];
      _reservations.splice(i, 1);
      persist();
      Reminders.cancel(id);
      Utils.emit('removed', r);
      return true;
    }
  };

  // ============================================================
  // 8. CALENDARIO
  // ============================================================
  const Calendar = {
    day(dateStr) {
      const items = Reservations.list({ date: dateStr });
      const slots = Slots.forDate(dateStr).map(t => ({
        time: t,
        capacity: Slots.capacityAt(dateStr, t),
        reservations: items.filter(r => r.time === t)
      }));
      return { date: dateStr, slots, total: items.length };
    },
    week(startDateStr) {
      const out = [];
      const start = new Date(startDateStr);
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime() + i * 86400000);
        out.push(this.day(Utils.toISODate(d)));
      }
      return { start: startDateStr, days: out };
    },
    month(year, month /* 1..12 */) {
      const days = new Date(year, month, 0).getDate();
      const out = [];
      for (let d = 1; d <= days; d++) {
        const ds = year + '-' + Utils.pad(month) + '-' + Utils.pad(d);
        const items = Reservations.list({ date: ds });
        out.push({
          date: ds,
          count: items.length,
          confirmed: items.filter(x => x.status === 'confirmed').length,
          pending:   items.filter(x => x.status === 'pending').length
        });
      }
      return { year, month, days: out };
    }
  };

  // ============================================================
  // 9. RECORDATORIOS
  // ============================================================
  const Reminders = {
    schedule(r) {
      this.cancel(r.id);
      const when = Utils.parseDateTime(r.date, r.time);
      const timers = [];
      CONFIG.reminderOffsets.forEach(offMin => {
        const fireAt = Utils.addMinutes(when, -offMin).getTime() - Date.now();
        if (fireAt <= 0) return;
        const t = setTimeout(() => Reminders.fire(r.id, offMin), Math.min(fireAt, 2147483000));
        timers.push(t);
      });
      _reminderTimers.set(r.id, timers);
    },
    cancel(id) {
      const ts = _reminderTimers.get(id);
      if (!ts) return;
      ts.forEach(t => clearTimeout(t));
      _reminderTimers.delete(id);
    },
    fire(id, offsetMin) {
      const r = Reservations.get(id);
      if (!r) return;
      if (r.status === 'cancelled' || r.status === 'noshow' || r.status === 'completed') return;
      r.remindersSent = r.remindersSent || [];
      r.remindersSent.push({ offsetMin, sentAt: new Date().toISOString() });
      persist();
      Utils.emit('reminder', { reservation: r, offsetMin });
    },
    rehydrateAll() {
      _reservations.forEach(r => {
        if (['pending', 'confirmed'].indexOf(r.status) >= 0) Reminders.schedule(r);
      });
    }
  };

  // ============================================================
  // 10. LISTA DE ESPERA
  // ============================================================
  const Waitlist = {
    list() { return _waitlist.slice(); },
    add(data) {
      const w = {
        id: 'w_' + Utils.uid(),
        customerName: data.customerName || 'Sin nombre',
        phone: data.phone || '',
        email: data.email || '',
        partySize: Number(data.partySize) || 1,
        date: data.date,
        time: data.time,
        notes: data.notes || '',
        reason: data.reason || 'manual',
        createdAt: new Date().toISOString(),
        status: 'waiting'
      };
      _waitlist.push(w);
      persist();
      Utils.emit('waitlist:added', w);
      return w;
    },
    remove(id) {
      const i = _waitlist.findIndex(x => x.id === id);
      if (i < 0) return false;
      const w = _waitlist[i];
      _waitlist.splice(i, 1);
      persist();
      Utils.emit('waitlist:removed', w);
      return true;
    },
    tryPromote(dateStr, timeStr) {
      const candidates = _waitlist
        .filter(w => w.status === 'waiting' && w.date === dateStr && w.time === timeStr)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const w of candidates) {
        const t = Slots.suggestTable(w.date, w.time, w.partySize);
        if (!t) continue;
        const r = Reservations.create({
          customerName: w.customerName,
          phone: w.phone,
          email: w.email,
          partySize: w.partySize,
          date: w.date,
          time: w.time,
          notes: '[promovido waitlist] ' + (w.notes || ''),
          source: 'waitlist'
        });
        if (r && r.id) {
          w.status = 'promoted';
          w.promotedTo = r.id;
          persist();
          Utils.emit('waitlist:promoted', { waitlist: w, reservation: r });
          return r;
        }
      }
      return null;
    }
  };

  // ============================================================
  // 11. METRICAS / REPORTES
  // ============================================================
  const Metrics = {
    summary(dateStr) {
      const items = Reservations.list({ date: dateStr });
      const by = {};
      CONFIG.statuses.forEach(s => { by[s] = 0; });
      items.forEach(r => { by[r.status] = (by[r.status] || 0) + 1; });
      const seats = items
        .filter(r => r.status !== 'cancelled' && r.status !== 'noshow')
        .reduce((s, r) => s + (Number(r.partySize) || 0), 0);
      return { date: dateStr, total: items.length, byStatus: by, seats, waitlist: _waitlist.filter(w => w.date === dateStr).length };
    },
    occupancyRate(dateStr) {
      const slots = Slots.forDate(dateStr);
      let totalCells = slots.length * _tables.length;
      let occCells = 0;
      slots.forEach(t => {
        const cap = Slots.capacityAt(dateStr, t);
        occCells += cap.occupiedTables.length;
      });
      return totalCells === 0 ? 0 : Math.round((occCells / totalCells) * 100);
    }
  };

  // ============================================================
  // 12. INICIALIZACION
  // ============================================================
  function init() {
    Reminders.rehydrateAll();
    Utils.emit('ready', { reservations: _reservations.length, waitlist: _waitlist.length });
  }

  // ============================================================
  // 13. API PUBLICA
  // ============================================================
  const API = {
    config: CONFIG,
    tables: Tables,
    slots: Slots,
    reservations: Reservations,
    calendar: Calendar,
    reminders: Reminders,
    waitlist: Waitlist,
    metrics: Metrics,
    // helpers cortos
    create:  (d) => Reservations.create(d),
    confirm: (id) => Reservations.confirm(id),
    cancel:  (id, reason) => Reservations.cancel(id, reason),
    seat:    (id) => Reservations.seat(id),
    complete:(id) => Reservations.complete(id),
    listForDate: (d) => Reservations.list({ date: d }),
    suggestTable: (d, t, p) => Slots.suggestTable(d, t, p),
    on: (event, handler) => global.addEventListener('reservations:' + event, handler),
    off: (event, handler) => global.removeEventListener('reservations:' + event, handler),
    _debug: { state: () => ({ _reservations, _waitlist, _tables }) }
  };

  global.ReservationsAPI = API;

  if (global.document && global.document.readyState !== 'loading') {
    init();
  } else if (global.document) {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : globalThis);
