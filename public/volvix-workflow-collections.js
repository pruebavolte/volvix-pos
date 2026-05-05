/**
 * volvix-workflow-collections.js
 * Workflow de Cobranza Automática para Volvix POS
 *
 * Funcionalidades:
 *  - Listar clientes con saldo pendiente
 *  - Enviar recordatorios por SMS / Email / WhatsApp
 *  - Registrar pagos (parcial / total)
 *  - Reporte de aging (30/60/90/120+ días)
 *  - Historial de cobranza por cliente
 *
 * Expuesto como: window.CollectionsWorkflow
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────
  const CONFIG = {
    storageKey: 'volvix_collections_v1',
    agingBuckets: [30, 60, 90, 120],
    channels: ['sms', 'email', 'whatsapp'],
    templates: {
      sms: 'Hola {nombre}, te recordamos tu saldo pendiente de ${saldo} con vencimiento {vencimiento}. Volvix.',
      email: 'Estimado/a {nombre},\n\nLe recordamos que tiene un saldo pendiente de ${saldo} con fecha de vencimiento {vencimiento}.\n\nGracias,\nEquipo Volvix',
      whatsapp: '*Volvix* - Hola {nombre} 👋\nTu saldo pendiente es *${saldo}*. Vence: {vencimiento}.\nResponde este mensaje para coordinar pago.'
    },
    apiBase: (global.VOLVIX_API_BASE || '/api'),
    currency: 'MXN'
  };

  // ─────────────────────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────────────────────
  function nowISO() { return new Date().toISOString(); }

  function daysBetween(a, b) {
    const ms = (new Date(b)) - (new Date(a));
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  function fmtMoney(n) {
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: CONFIG.currency
      }).format(Number(n) || 0);
    } catch (_) { return '$' + Number(n || 0).toFixed(2); }
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function renderTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : ('{' + k + '}'));
  }

  function loadStore() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(CONFIG.storageKey);
      if (!raw) return { clients: [], reminders: [], payments: [] };
      return JSON.parse(raw);
    } catch (_) { return { clients: [], reminders: [], payments: [] }; }
  }

  function saveStore(store) {
    try {
      global.localStorage && global.localStorage.setItem(CONFIG.storageKey, JSON.stringify(store));
    } catch (e) { console.warn('[Collections] no se pudo persistir:', e); }
  }

  async function safeFetchJSON(url, opts) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[Collections] fetch fallback:', url, e.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Estado
  // ─────────────────────────────────────────────────────────────
  let store = loadStore();
  const listeners = [];
  function emit(evt, payload) {
    listeners.forEach(fn => { try { fn(evt, payload); } catch (_) {} });
  }

  // ─────────────────────────────────────────────────────────────
  // Clientes con saldo
  // ─────────────────────────────────────────────────────────────
  async function listClientsWithBalance(opts) {
    opts = opts || {};
    const remote = await safeFetchJSON(CONFIG.apiBase + '/customers/balance');
    let clients = remote && Array.isArray(remote.data) ? remote.data : store.clients;

    clients = clients.map(c => {
      const saldo = Number(c.saldo || c.balance || 0);
      const venc = c.vencimiento || c.due_date || nowISO();
      const dias = daysBetween(venc, nowISO());
      return {
        id: c.id || uid('cli'),
        nombre: c.nombre || c.name || 'Sin nombre',
        email: c.email || '',
        telefono: c.telefono || c.phone || '',
        whatsapp: c.whatsapp || c.phone || '',
        saldo: saldo,
        vencimiento: venc,
        diasVencido: dias > 0 ? dias : 0,
        bucket: bucketize(dias)
      };
    }).filter(c => c.saldo > 0);

    if (opts.minDias) clients = clients.filter(c => c.diasVencido >= opts.minDias);
    if (opts.bucket) clients = clients.filter(c => c.bucket === opts.bucket);
    if (opts.sort === 'saldo') clients.sort((a, b) => b.saldo - a.saldo);
    else clients.sort((a, b) => b.diasVencido - a.diasVencido);

    return clients;
  }

  function bucketize(dias) {
    if (dias <= 0) return 'corriente';
    const buckets = CONFIG.agingBuckets;
    for (let i = 0; i < buckets.length; i++) {
      if (dias <= buckets[i]) return '0-' + buckets[i];
    }
    return buckets[buckets.length - 1] + '+';
  }

  // ─────────────────────────────────────────────────────────────
  // Recordatorios SMS / Email / WhatsApp
  // ─────────────────────────────────────────────────────────────
  async function sendReminder(clientId, channel, customMessage) {
    if (!CONFIG.channels.includes(channel))
      throw new Error('Canal inválido: ' + channel);

    const clients = await listClientsWithBalance();
    const client = clients.find(c => c.id === clientId);
    if (!client) throw new Error('Cliente no encontrado: ' + clientId);

    const msg = customMessage || renderTemplate(CONFIG.templates[channel], {
      nombre: client.nombre,
      saldo: fmtMoney(client.saldo),
      vencimiento: String(client.vencimiento).slice(0, 10)
    });

    const payload = {
      id: uid('rem'),
      clientId: client.id,
      channel: channel,
      message: msg,
      to: channel === 'email' ? client.email
        : channel === 'whatsapp' ? client.whatsapp
        : client.telefono,
      sentAt: nowISO(),
      status: 'queued'
    };

    const remote = await safeFetchJSON(CONFIG.apiBase + '/notifications/' + channel, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    payload.status = remote && remote.ok ? 'sent' : 'sent_local';
    store.reminders.push(payload);
    saveStore(store);
    emit('reminder:sent', payload);
    return payload;
  }

  async function sendBulkReminders(filter, channel) {
    const clients = await listClientsWithBalance(filter || {});
    const results = [];
    for (const c of clients) {
      try { results.push(await sendReminder(c.id, channel)); }
      catch (e) { results.push({ clientId: c.id, error: e.message }); }
    }
    emit('reminder:bulk', { count: results.length, channel });
    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Registro de pagos
  // ─────────────────────────────────────────────────────────────
  async function registerPayment(clientId, amount, opts) {
    opts = opts || {};
    if (!(amount > 0)) throw new Error('Monto inválido');

    const payment = {
      id: uid('pay'),
      clientId: clientId,
      amount: Number(amount),
      method: opts.method || 'efectivo',
      reference: opts.reference || '',
      note: opts.note || '',
      receivedAt: opts.receivedAt || nowISO()
    };

    const remote = await safeFetchJSON(CONFIG.apiBase + '/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment)
    });
    payment.synced = !!(remote && remote.ok);

    // Aplica al saldo local
    const cli = store.clients.find(c => c.id === clientId);
    if (cli) {
      cli.saldo = Math.max(0, Number(cli.saldo || 0) - payment.amount);
      cli.lastPaymentAt = payment.receivedAt;
    }
    store.payments.push(payment);
    saveStore(store);
    emit('payment:registered', payment);
    return payment;
  }

  function listPayments(clientId) {
    if (!clientId) return store.payments.slice();
    return store.payments.filter(p => p.clientId === clientId);
  }

  // ─────────────────────────────────────────────────────────────
  // Aging
  // ─────────────────────────────────────────────────────────────
  async function agingReport() {
    const clients = await listClientsWithBalance();
    const buckets = { corriente: { total: 0, count: 0, clients: [] } };
    CONFIG.agingBuckets.forEach((d, i) => {
      const prev = i === 0 ? 0 : CONFIG.agingBuckets[i - 1];
      buckets[(prev + 1) + '-' + d] = { total: 0, count: 0, clients: [] };
    });
    const last = CONFIG.agingBuckets[CONFIG.agingBuckets.length - 1];
    buckets[(last + 1) + '+'] = { total: 0, count: 0, clients: [] };

    for (const c of clients) {
      let key = 'corriente';
      if (c.diasVencido > 0) {
        let placed = false;
        for (let i = 0; i < CONFIG.agingBuckets.length; i++) {
          const prev = i === 0 ? 0 : CONFIG.agingBuckets[i - 1];
          const cur = CONFIG.agingBuckets[i];
          if (c.diasVencido <= cur) { key = (prev + 1) + '-' + cur; placed = true; break; }
        }
        if (!placed) key = (last + 1) + '+';
      }
      if (!buckets[key]) buckets[key] = { total: 0, count: 0, clients: [] };
      buckets[key].total += c.saldo;
      buckets[key].count += 1;
      buckets[key].clients.push({ id: c.id, nombre: c.nombre, saldo: c.saldo, dias: c.diasVencido });
    }

    const grandTotal = Object.values(buckets).reduce((s, b) => s + b.total, 0);
    return {
      generatedAt: nowISO(),
      grandTotal: grandTotal,
      grandTotalFmt: fmtMoney(grandTotal),
      buckets: buckets
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Historial / Resumen por cliente
  // ─────────────────────────────────────────────────────────────
  async function clientSummary(clientId) {
    const clients = await listClientsWithBalance();
    const cli = clients.find(c => c.id === clientId);
    const reminders = store.reminders.filter(r => r.clientId === clientId);
    const payments = listPayments(clientId);
    return {
      client: cli || null,
      reminders: reminders,
      payments: payments,
      totalPagado: payments.reduce((s, p) => s + p.amount, 0),
      ultimoRecordatorio: reminders.length ? reminders[reminders.length - 1] : null,
      ultimoPago: payments.length ? payments[payments.length - 1] : null
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Workflow orquestado
  // ─────────────────────────────────────────────────────────────
  async function runDailyCollectionsWorkflow(options) {
    options = options || {};
    const channel = options.channel || 'whatsapp';
    const minDias = options.minDias || 1;

    const aging = await agingReport();
    const targets = await listClientsWithBalance({ minDias: minDias });
    const sent = [];

    for (const c of targets) {
      try {
        const rem = await sendReminder(c.id, channel);
        sent.push(rem);
      } catch (e) {
        sent.push({ clientId: c.id, error: e.message });
      }
    }

    const result = {
      ranAt: nowISO(),
      channel: channel,
      aging: aging,
      remindersSent: sent.filter(s => !s.error).length,
      remindersFailed: sent.filter(s => s.error).length,
      details: sent
    };
    emit('workflow:daily', result);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────
  const CollectionsWorkflow = {
    config: CONFIG,
    listClientsWithBalance: listClientsWithBalance,
    sendReminder: sendReminder,
    sendBulkReminders: sendBulkReminders,
    registerPayment: registerPayment,
    listPayments: listPayments,
    agingReport: agingReport,
    clientSummary: clientSummary,
    runDailyCollectionsWorkflow: runDailyCollectionsWorkflow,
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    _store: function () { return store; },
    _reset: function () { store = { clients: [], reminders: [], payments: [] }; saveStore(store); },
    _seed: function (clients) {
      store.clients = clients || [];
      saveStore(store);
    }
  };

  global.CollectionsWorkflow = CollectionsWorkflow;
  if (typeof module !== 'undefined' && module.exports) module.exports = CollectionsWorkflow;

  console.log('[Volvix] CollectionsWorkflow cargado. window.CollectionsWorkflow listo.');
})(typeof window !== 'undefined' ? window : globalThis);
