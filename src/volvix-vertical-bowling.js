/**
 * volvix-vertical-bowling.js
 * Volvix POS - Vertical Boliche
 * Sistema de punto de venta para boleras: renta de pistas por hora, scoring,
 * renta de zapatos, snacks/bar, gestión de grupos y cierre de cuenta.
 *
 * Expone window.BowlingAPI
 */
(function (global) {
  'use strict';

  // ───────── Catálogo base ─────────
  const LANES = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `Pista ${i + 1}`,
    status: 'free',     // free | reserved | playing | maintenance
    sessionId: null,
  }));

  const SHOE_INVENTORY = {
    sizes: {}, // talla -> { total, rented }
    init() {
      for (let s = 20; s <= 32; s++) this.sizes[s] = { total: 8, rented: 0 };
    },
    rent(size) {
      const s = this.sizes[size];
      if (!s) throw new Error(`Talla ${size} no existe`);
      if (s.rented >= s.total) throw new Error(`Sin zapatos talla ${size}`);
      s.rented++;
      return true;
    },
    giveBack(size) {
      const s = this.sizes[size];
      if (!s || s.rented <= 0) return false;
      s.rented--;
      return true;
    },
    available(size) {
      const s = this.sizes[size];
      return s ? s.total - s.rented : 0;
    },
  };
  SHOE_INVENTORY.init();

  const SNACKS = [
    { sku: 'SNK01', name: 'Refresco 600ml',  price: 35 },
    { sku: 'SNK02', name: 'Cerveza',          price: 55 },
    { sku: 'SNK03', name: 'Papas grandes',    price: 60 },
    { sku: 'SNK04', name: 'Hot Dog',          price: 45 },
    { sku: 'SNK05', name: 'Hamburguesa',      price: 95 },
    { sku: 'SNK06', name: 'Nachos',           price: 70 },
    { sku: 'SNK07', name: 'Pizza personal',   price: 110 },
    { sku: 'SNK08', name: 'Agua 500ml',       price: 20 },
  ];

  const PRICING = {
    laneHourly: 380,    // MXN por hora por pista
    laneHourlyHappy: 280,
    happyHours: [{ from: 13, to: 17 }], // L-V 1pm-5pm
    shoePair:   45,
    taxRate:    0.16,
  };

  // ───────── Estado de sesiones ─────────
  const sessions = new Map(); // sessionId -> session
  let nextSessionId = 1000;

  function nowISO()  { return new Date().toISOString(); }
  function uuid()    { return `S${++nextSessionId}-${Date.now().toString(36)}`; }
  function isHappyHour(d = new Date()) {
    const day = d.getDay(); // 0 dom, 6 sab
    if (day === 0 || day === 6) return false;
    const h = d.getHours();
    return PRICING.happyHours.some(r => h >= r.from && h < r.to);
  }
  function laneRate() { return isHappyHour() ? PRICING.laneHourlyHappy : PRICING.laneHourly; }

  // ───────── Scoring de boliche (10 frames) ─────────
  function newFrameSheet() {
    return Array.from({ length: 10 }, () => ({ rolls: [], score: null }));
  }

  function rollFrame(frames, frameIdx, pins) {
    if (frameIdx < 0 || frameIdx > 9) throw new Error('Frame inválido');
    if (pins < 0 || pins > 10) throw new Error('Pinos inválidos');
    const f = frames[frameIdx];
    if (frameIdx < 9) {
      if (f.rolls.length >= 2) throw new Error('Frame ya completo');
      if (f.rolls.length === 1 && f.rolls[0] + pins > 10) throw new Error('Suma > 10');
      f.rolls.push(pins);
      if (pins === 10 && f.rolls.length === 1) f.rolls.push(0); // strike, frame cerrado
    } else {
      // Frame 10: hasta 3 tiros si strike o spare
      if (f.rolls.length >= 3) throw new Error('Frame 10 cerrado');
      f.rolls.push(pins);
    }
    recomputeScores(frames);
    return f;
  }

  function recomputeScores(frames) {
    const flat = [];
    frames.forEach((f, i) => {
      if (i < 9) {
        flat.push(...f.rolls.slice(0, f.rolls[0] === 10 ? 1 : 2));
      } else {
        flat.push(...f.rolls);
      }
    });
    let cursor = 0, total = 0;
    for (let i = 0; i < 10; i++) {
      const f = frames[i];
      if (f.rolls.length === 0) { f.score = null; continue; }
      const r1 = flat[cursor], r2 = flat[cursor + 1] ?? 0;
      if (i < 9 && r1 === 10) {
        const b1 = flat[cursor + 1], b2 = flat[cursor + 2];
        if (b1 == null || b2 == null) { f.score = null; cursor += 1; continue; }
        total += 10 + b1 + b2;
        f.score = total;
        cursor += 1;
      } else if (i < 9 && r1 + r2 === 10) {
        const b1 = flat[cursor + 2];
        if (b1 == null) { f.score = null; cursor += 2; continue; }
        total += 10 + b1;
        f.score = total;
        cursor += 2;
      } else if (i < 9) {
        if (f.rolls.length < 2) { f.score = null; cursor += f.rolls.length; continue; }
        total += r1 + r2;
        f.score = total;
        cursor += 2;
      } else {
        // frame 10
        const need = (f.rolls[0] === 10 || (f.rolls[0] + (f.rolls[1] ?? 0)) === 10) ? 3 : 2;
        if (f.rolls.length < need) { f.score = null; continue; }
        total += f.rolls.reduce((a, b) => a + b, 0);
        f.score = total;
      }
    }
  }

  // ───────── API pública ─────────
  const BowlingAPI = {
    // Pistas
    listLanes() { return LANES.map(l => ({ ...l })); },
    laneStatus(id) { return LANES.find(l => l.id === id) || null; },

    openLane({ laneId, players = [], shoes = [] }) {
      const lane = LANES.find(l => l.id === laneId);
      if (!lane) throw new Error('Pista no existe');
      if (lane.status !== 'free') throw new Error('Pista ocupada');
      if (!players.length) throw new Error('Se requiere al menos 1 jugador');

      // rentar zapatos
      shoes.forEach(sz => SHOE_INVENTORY.rent(sz));

      const id = uuid();
      const session = {
        id,
        laneId,
        players: players.map(name => ({ name, frames: newFrameSheet() })),
        shoes: shoes.slice(),
        snacks: [],
        startedAt: Date.now(),
        endedAt: null,
        rateAtOpen: laneRate(),
      };
      sessions.set(id, session);
      lane.status = 'playing';
      lane.sessionId = id;
      return { sessionId: id, lane: lane.id, rate: session.rateAtOpen, startedAt: nowISO() };
    },

    // Scoring
    roll({ sessionId, playerIdx, frameIdx, pins }) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      const p = s.players[playerIdx];
      if (!p) throw new Error('Jugador no existe');
      rollFrame(p.frames, frameIdx, pins);
      return { player: p.name, frames: p.frames, total: p.frames[9]?.score ?? null };
    },

    scoreboard(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      return s.players.map(p => ({
        name: p.name,
        total: p.frames.findLast?.(f => f.score != null)?.score
            ?? [...p.frames].reverse().find(f => f.score != null)?.score
            ?? 0,
        frames: p.frames.map(f => ({ rolls: f.rolls, score: f.score })),
      }));
    },

    // Snacks
    catalogSnacks() { return SNACKS.slice(); },
    addSnack({ sessionId, sku, qty = 1 }) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      const item = SNACKS.find(x => x.sku === sku);
      if (!item) throw new Error('SKU no existe');
      s.snacks.push({ ...item, qty, at: nowISO() });
      return s.snacks.length;
    },
    removeSnack({ sessionId, idx }) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      return s.snacks.splice(idx, 1)[0] || null;
    },

    // Zapatos
    shoesAvailable(size) { return SHOE_INVENTORY.available(size); },
    rentShoe({ sessionId, size }) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      SHOE_INVENTORY.rent(size);
      s.shoes.push(size);
      return SHOE_INVENTORY.available(size);
    },

    // Cierre y cobro
    closeLane(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('Sesión no existe');
      if (s.endedAt) throw new Error('Ya cerrada');
      s.endedAt = Date.now();
      s.shoes.forEach(sz => SHOE_INVENTORY.giveBack(sz));
      const lane = LANES.find(l => l.id === s.laneId);
      lane.status = 'free';
      lane.sessionId = null;

      const minutes  = Math.max(15, Math.ceil((s.endedAt - s.startedAt) / 60000));
      const hours    = minutes / 60;
      const laneCost = +(hours * s.rateAtOpen).toFixed(2);
      const shoeCost = s.shoes.length * PRICING.shoePair;
      const snackCost = s.snacks.reduce((a, x) => a + x.price * x.qty, 0);
      const subtotal = +(laneCost + shoeCost + snackCost).toFixed(2);
      const tax      = +(subtotal * PRICING.taxRate).toFixed(2);
      const total    = +(subtotal + tax).toFixed(2);

      const ticket = {
        sessionId, laneId: s.laneId, minutes, rate: s.rateAtOpen,
        breakdown: { laneCost, shoeCost, snackCost },
        subtotal, tax, total,
        players: s.players.map(p => ({
          name: p.name,
          total: [...p.frames].reverse().find(f => f.score != null)?.score ?? 0,
        })),
        snacks: s.snacks,
        closedAt: nowISO(),
      };
      s.ticket = ticket;
      return ticket;
    },

    getSession(sessionId) {
      const s = sessions.get(sessionId);
      return s ? JSON.parse(JSON.stringify(s)) : null;
    },

    listActiveSessions() {
      return [...sessions.values()].filter(s => !s.endedAt).map(s => ({
        id: s.id, laneId: s.laneId, players: s.players.length,
        startedAt: new Date(s.startedAt).toISOString(),
      }));
    },

    // Mantenimiento
    setLaneMaintenance(id, on = true) {
      const lane = LANES.find(l => l.id === id);
      if (!lane) throw new Error('Pista no existe');
      if (on && lane.sessionId) throw new Error('Pista en uso');
      lane.status = on ? 'maintenance' : 'free';
      return lane.status;
    },

    pricing: () => ({ ...PRICING, currentRate: laneRate(), happy: isHappyHour() }),
    version: '1.0.0',
  };

  global.BowlingAPI = BowlingAPI;
})(typeof window !== 'undefined' ? window : globalThis);
