/**
 * volvix-clip-wiring.js
 * Mock de terminal Clip (bluetooth) para Volvix POS.
 * Expone window.ClipAPI con: pair, unpair, charge, refund, endOfDay, status, listen.
 *
 * Este archivo NO habla con hardware real. Simula latencias, fallos aleatorios
 * y respuestas estructuradas para poder integrar la UI sin la terminal física.
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Estado interno
  // ──────────────────────────────────────────────────────────
  const STATE = {
    paired: false,
    deviceId: null,
    deviceName: null,
    battery: 87,
    firmware: '2.14.3',
    signal: 'unknown',
    lastSeen: null,
    busy: false,
    txCounter: 1000,
    transactions: [],     // historial del día
    listeners: { event: [], status: [], tx: [] },
    pendingTimers: [],
  };

  const KNOWN_DEVICES = [
    { id: 'CLIP-AA11', name: 'Clip Mini AA11', mac: '04:5C:6F:AA:11:01' },
    { id: 'CLIP-BB22', name: 'Clip Pro BB22',  mac: '04:5C:6F:BB:22:02' },
    { id: 'CLIP-CC33', name: 'Clip Lite CC33', mac: '04:5C:6F:CC:33:03' },
  ];

  const CARD_NETWORKS = ['VISA', 'MC', 'AMEX', 'CARNET'];

  // ──────────────────────────────────────────────────────────
  // Utilidades
  // ──────────────────────────────────────────────────────────
  function now() { return new Date().toISOString(); }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function delay(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        STATE.pendingTimers = STATE.pendingTimers.filter((x) => x !== t);
        resolve();
      }, ms);
      STATE.pendingTimers.push(t);
    });
  }

  function uid(prefix) {
    STATE.txCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${STATE.txCounter}`;
  }

  function emit(channel, payload) {
    const arr = STATE.listeners[channel] || [];
    arr.forEach((fn) => {
      try { fn(payload); } catch (e) { console.warn('[ClipAPI] listener error:', e); }
    });
  }

  function requirePaired() {
    if (!STATE.paired) {
      const err = new Error('Clip terminal no está pareada');
      err.code = 'NOT_PAIRED';
      throw err;
    }
  }

  function requireIdle() {
    if (STATE.busy) {
      const err = new Error('Terminal ocupada con otra operación');
      err.code = 'BUSY';
      throw err;
    }
  }

  function maybeFail(rate, code, msg) {
    if (Math.random() < rate) {
      const err = new Error(msg);
      err.code = code;
      throw err;
    }
  }

  function maskCard(pan) {
    if (!pan || pan.length < 4) return '****';
    return '**** **** **** ' + pan.slice(-4);
  }

  function fakeCard() {
    const network = CARD_NETWORKS[Math.floor(Math.random() * CARD_NETWORKS.length)];
    const last4 = String(Math.floor(1000 + Math.random() * 8999));
    return { network, last4, pan: '************' + last4, holder: 'TARJETAHABIENTE' };
  }

  function setStatus(patch) {
    Object.assign(STATE, patch);
    STATE.lastSeen = now();
    emit('status', publicStatus());
  }

  function publicStatus() {
    return {
      paired: STATE.paired,
      deviceId: STATE.deviceId,
      deviceName: STATE.deviceName,
      battery: STATE.battery,
      firmware: STATE.firmware,
      signal: STATE.signal,
      busy: STATE.busy,
      lastSeen: STATE.lastSeen,
      txCount: STATE.transactions.length,
    };
  }

  // ──────────────────────────────────────────────────────────
  // API: pareo / despareo
  // ──────────────────────────────────────────────────────────
  async function scan() {
    emit('event', { type: 'SCAN_START', at: now() });
    await delay(rand(600, 1400));
    emit('event', { type: 'SCAN_END', at: now(), found: KNOWN_DEVICES.length });
    return KNOWN_DEVICES.slice();
  }

  async function pair(deviceId) {
    requireIdle();
    STATE.busy = true;
    try {
      emit('event', { type: 'PAIR_START', deviceId, at: now() });
      await delay(rand(800, 1800));
      maybeFail(0.08, 'PAIR_FAILED', 'No se pudo establecer enlace bluetooth');

      const dev = KNOWN_DEVICES.find((d) => d.id === deviceId) || KNOWN_DEVICES[0];
      setStatus({
        paired: true,
        deviceId: dev.id,
        deviceName: dev.name,
        signal: 'good',
        battery: Math.floor(rand(55, 99)),
      });
      emit('event', { type: 'PAIRED', deviceId: dev.id, at: now() });
      return { ok: true, device: dev };
    } finally {
      STATE.busy = false;
      emit('status', publicStatus());
    }
  }

  async function unpair() {
    if (!STATE.paired) return { ok: true, alreadyUnpaired: true };
    emit('event', { type: 'UNPAIR_START', at: now() });
    await delay(rand(200, 500));
    setStatus({ paired: false, deviceId: null, deviceName: null, signal: 'unknown' });
    emit('event', { type: 'UNPAIRED', at: now() });
    return { ok: true };
  }

  // ──────────────────────────────────────────────────────────
  // API: cobro
  // ──────────────────────────────────────────────────────────
  async function charge({ amount, currency = 'MXN', reference = '', tip = 0 } = {}) {
    requirePaired();
    requireIdle();
    if (!(amount > 0)) {
      const err = new Error('Monto inválido'); err.code = 'BAD_AMOUNT'; throw err;
    }
    STATE.busy = true;
    const txId = uid('CHG');
    try {
      emit('event', { type: 'CHARGE_START', txId, amount, at: now() });
      emit('event', { type: 'INSERT_CARD', txId });
      await delay(rand(1200, 2400));
      emit('event', { type: 'PIN_ENTRY', txId });
      await delay(rand(1500, 3000));
      emit('event', { type: 'AUTH_REQUEST', txId });
      await delay(rand(900, 2200));

      maybeFail(0.05, 'DECLINED', 'Transacción declinada por el banco');
      maybeFail(0.02, 'TIMEOUT', 'Tiempo de espera agotado con el adquirente');

      const card = fakeCard();
      const tx = {
        txId,
        kind: 'charge',
        amount: Number(amount),
        tip: Number(tip) || 0,
        total: Number(amount) + (Number(tip) || 0),
        currency,
        reference,
        status: 'approved',
        authCode: Math.floor(100000 + Math.random() * 899999).toString(),
        card: { network: card.network, masked: maskCard(card.pan), holder: card.holder },
        at: now(),
      };
      STATE.transactions.push(tx);
      STATE.battery = Math.max(1, STATE.battery - 1);
      emit('tx', tx);
      emit('event', { type: 'CHARGE_DONE', txId, status: 'approved' });
      return { ok: true, tx };
    } catch (e) {
      const tx = {
        txId, kind: 'charge', amount, currency, status: 'failed',
        error: { code: e.code || 'ERR', message: e.message }, at: now(),
      };
      STATE.transactions.push(tx);
      emit('tx', tx);
      emit('event', { type: 'CHARGE_DONE', txId, status: 'failed', error: e.code });
      throw e;
    } finally {
      STATE.busy = false;
      emit('status', publicStatus());
    }
  }

  // ──────────────────────────────────────────────────────────
  // API: devolución
  // ──────────────────────────────────────────────────────────
  async function refund({ originalTxId, amount } = {}) {
    requirePaired();
    requireIdle();
    const orig = STATE.transactions.find((t) => t.txId === originalTxId && t.kind === 'charge' && t.status === 'approved');
    if (!orig) {
      const err = new Error('Transacción original no encontrada o no reembolsable');
      err.code = 'TX_NOT_FOUND'; throw err;
    }
    const refundAmount = amount != null ? Number(amount) : orig.total;
    if (refundAmount <= 0 || refundAmount > orig.total) {
      const err = new Error('Monto de reembolso inválido'); err.code = 'BAD_AMOUNT'; throw err;
    }

    STATE.busy = true;
    const txId = uid('RFD');
    try {
      emit('event', { type: 'REFUND_START', txId, originalTxId, at: now() });
      await delay(rand(1000, 2000));
      maybeFail(0.04, 'REFUND_FAILED', 'El adquirente rechazó el reembolso');

      const tx = {
        txId, kind: 'refund', originalTxId,
        amount: refundAmount, currency: orig.currency,
        status: 'approved',
        card: orig.card,
        at: now(),
      };
      STATE.transactions.push(tx);
      emit('tx', tx);
      emit('event', { type: 'REFUND_DONE', txId, status: 'approved' });
      return { ok: true, tx };
    } finally {
      STATE.busy = false;
      emit('status', publicStatus());
    }
  }

  // ──────────────────────────────────────────────────────────
  // API: cierre de día
  // ──────────────────────────────────────────────────────────
  async function endOfDay() {
    requirePaired();
    requireIdle();
    STATE.busy = true;
    try {
      emit('event', { type: 'EOD_START', at: now() });
      await delay(rand(1500, 3000));

      const approved = STATE.transactions.filter((t) => t.status === 'approved');
      const charges = approved.filter((t) => t.kind === 'charge');
      const refunds = approved.filter((t) => t.kind === 'refund');
      const grossSales = charges.reduce((s, t) => s + (t.total || t.amount || 0), 0);
      const totalRefunds = refunds.reduce((s, t) => s + (t.amount || 0), 0);
      const net = grossSales - totalRefunds;

      const byNetwork = {};
      approved.forEach((t) => {
        const net = t.card && t.card.network ? t.card.network : 'OTRO';
        byNetwork[net] = byNetwork[net] || { count: 0, amount: 0 };
        byNetwork[net].count += 1;
        byNetwork[net].amount += (t.kind === 'refund' ? -1 : 1) * (t.total || t.amount || 0);
      });

      const batchId = uid('BATCH');
      const report = {
        batchId,
        closedAt: now(),
        deviceId: STATE.deviceId,
        counts: {
          total: approved.length,
          charges: charges.length,
          refunds: refunds.length,
        },
        amounts: {
          gross: grossSales,
          refunds: totalRefunds,
          net,
        },
        byNetwork,
      };

      // Reset del día
      STATE.transactions = [];
      emit('event', { type: 'EOD_DONE', batchId, at: now() });
      return { ok: true, report };
    } finally {
      STATE.busy = false;
      emit('status', publicStatus());
    }
  }

  // ──────────────────────────────────────────────────────────
  // API: listeners
  // ──────────────────────────────────────────────────────────
  function listen(channel, fn) {
    if (!STATE.listeners[channel]) {
      throw new Error(`Canal desconocido: ${channel}. Usa 'event', 'status' o 'tx'.`);
    }
    STATE.listeners[channel].push(fn);
    return function unsubscribe() {
      STATE.listeners[channel] = STATE.listeners[channel].filter((x) => x !== fn);
    };
  }

  function reset() {
    STATE.pendingTimers.forEach(clearTimeout);
    STATE.pendingTimers = [];
    STATE.paired = false;
    STATE.deviceId = null;
    STATE.deviceName = null;
    STATE.busy = false;
    STATE.transactions = [];
    STATE.listeners = { event: [], status: [], tx: [] };
  }

  // ──────────────────────────────────────────────────────────
  // Expose
  // ──────────────────────────────────────────────────────────
  global.ClipAPI = {
    version: '0.1.0-mock',
    scan,
    pair,
    unpair,
    charge,
    refund,
    endOfDay,
    status: publicStatus,
    transactions: () => STATE.transactions.slice(),
    listen,
    reset,
  };

  // Log de carga
  if (global.console && console.info) {
    console.info('[ClipAPI] mock cargado v' + global.ClipAPI.version);
  }
})(typeof window !== 'undefined' ? window : globalThis);
