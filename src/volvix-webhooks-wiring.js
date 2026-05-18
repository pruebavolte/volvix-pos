/* ============================================================================
 * volvix-webhooks-wiring.js
 * Sistema de Webhooks Outbound para Volvix POS
 * Agent-31 — Ronda 8 Fibonacci
 * ----------------------------------------------------------------------------
 * Funcionalidades:
 *   1. Catálogo de eventos (sale.created, customer.added, product.updated, ...)
 *   2. Suscripciones (URL destino + filtros por evento)
 *   3. Retry con exponential backoff
 *   4. Firma HMAC-SHA256 opcional
 *   5. Cola de delivery persistente (localStorage)
 *   6. Logs de webhooks enviados
 *   7. Test webhook UI (modal)
 *   8. Filtros por evento
 *   9. window.WebhooksAPI
 * ========================================================================== */

(function (global) {
  'use strict';

  // ----------------------------- Constantes -------------------------------
  const STORAGE_SUBS    = 'volvix_webhook_subscriptions';
  const STORAGE_QUEUE   = 'volvix_webhook_queue';
  const STORAGE_LOGS    = 'volvix_webhook_logs';
  const STORAGE_CONFIG  = 'volvix_webhook_config';

  const MAX_LOGS        = 500;
  const MAX_RETRIES     = 6;          // 6 reintentos
  const BASE_BACKOFF_MS = 2000;       // 2s base
  const MAX_BACKOFF_MS  = 5 * 60_000; // 5 min cap
  const TICK_INTERVAL   = 4000;       // procesar cola cada 4s

  // Catálogo de eventos soportados
  const EVENT_CATALOG = Object.freeze({
    'sale.created':       'Venta creada',
    'sale.voided':        'Venta anulada',
    'sale.refunded':      'Venta reembolsada',
    'customer.added':     'Cliente agregado',
    'customer.updated':   'Cliente actualizado',
    'customer.deleted':   'Cliente eliminado',
    'product.created':    'Producto creado',
    'product.updated':    'Producto actualizado',
    'product.deleted':    'Producto eliminado',
    'low_stock':          'Stock bajo',
    'inventory.adjusted': 'Inventario ajustado',
    'cashbox.opened':     'Caja abierta',
    'cashbox.closed':     'Caja cerrada',
    'shift.started':      'Turno iniciado',
    'shift.ended':        'Turno finalizado',
    'payment.received':   'Pago recibido',
    'invoice.generated':  'Factura generada',
    'user.login':         'Usuario login',
    'user.logout':        'Usuario logout',
    'system.error':       'Error de sistema'
  });

  // ----------------------------- Storage helpers --------------------------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('[Webhooks] load fail', key, e);
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('[Webhooks] save fail', key, e);
    }
  }

  // ----------------------------- Estado -----------------------------------
  let subscriptions = load(STORAGE_SUBS, []);
  let queue         = load(STORAGE_QUEUE, []);
  let logs          = load(STORAGE_LOGS, []);
  let config        = load(STORAGE_CONFIG, {
    enabled:      true,
    globalSecret: '',
    timeoutMs:    15_000,
    concurrency:  3
  });

  // ----------------------------- Utilidades -------------------------------
  function uid(prefix) {
    return (prefix || 'wh') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 9);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // HMAC-SHA256 hex usando Web Crypto API
  async function hmacSha256(secret, message) {
    if (!secret) return '';
    try {
      const enc  = new TextEncoder();
      const key  = await crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      );
      const sig  = await crypto.subtle.sign('HMAC', key, enc.encode(message));
      return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[Webhooks] HMAC unavailable, signature skipped', e);
      return '';
    }
  }

  function backoffMs(attempt) {
    const exp = BASE_BACKOFF_MS * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return clamp(exp + jitter, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
  }

  // ----------------------------- Logs -------------------------------------
  function addLog(entry) {
    logs.unshift(Object.assign({ id: uid('log'), ts: nowIso() }, entry));
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    save(STORAGE_LOGS, logs);
  }

  function clearLogs() {
    logs = [];
    save(STORAGE_LOGS, logs);
  }

  // ----------------------------- Subscriptions ----------------------------
  function listSubscriptions() {
    return subscriptions.slice();
  }

  function getSubscription(id) {
    return subscriptions.find(s => s.id === id) || null;
  }

  function addSubscription(opts) {
    if (!opts || !opts.url) throw new Error('URL requerida');
    if (!Array.isArray(opts.events) || opts.events.length === 0)
      throw new Error('Debe suscribir al menos un evento');

    const sub = {
      id:        uid('sub'),
      name:      opts.name || opts.url,
      url:       opts.url,
      events:    opts.events.slice(),
      secret:    opts.secret || '',
      headers:   opts.headers || {},
      active:    opts.active !== false,
      createdAt: nowIso(),
      stats:     { sent: 0, failed: 0, lastDelivery: null }
    };
    subscriptions.push(sub);
    save(STORAGE_SUBS, subscriptions);
    return sub;
  }

  function updateSubscription(id, patch) {
    const sub = getSubscription(id);
    if (!sub) return null;
    Object.assign(sub, patch || {});
    save(STORAGE_SUBS, subscriptions);
    return sub;
  }

  function removeSubscription(id) {
    const idx = subscriptions.findIndex(s => s.id === id);
    if (idx === -1) return false;
    subscriptions.splice(idx, 1);
    save(STORAGE_SUBS, subscriptions);
    return true;
  }

  function toggleSubscription(id) {
    const sub = getSubscription(id);
    if (!sub) return null;
    sub.active = !sub.active;
    save(STORAGE_SUBS, subscriptions);
    return sub;
  }

  // ----------------------------- Cola de delivery -------------------------
  function enqueue(subId, eventType, payload) {
    const job = {
      id:         uid('job'),
      subId:      subId,
      event:      eventType,
      payload:    payload,
      attempts:   0,
      nextRunAt:  Date.now(),
      createdAt:  nowIso(),
      status:     'pending' // pending|delivering|done|dead
    };
    queue.push(job);
    save(STORAGE_QUEUE, queue);
    return job;
  }

  function persistQueue() {
    save(STORAGE_QUEUE, queue);
  }

  // ----------------------------- Emit principal ---------------------------
  function emit(eventType, payload) {
    if (!config.enabled) return [];
    if (!EVENT_CATALOG[eventType]) {
      console.warn('[Webhooks] evento no catalogado:', eventType);
    }
    const matched = subscriptions.filter(s =>
      s.active && s.events.includes(eventType)
    );
    const jobs = matched.map(s => enqueue(s.id, eventType, payload));
    return jobs;
  }

  // ----------------------------- Delivery ---------------------------------
  async function deliver(job) {
    const sub = getSubscription(job.subId);
    if (!sub) {
      job.status = 'dead';
      addLog({ jobId: job.id, level: 'error', msg: 'subscription missing' });
      return;
    }

    job.status   = 'delivering';
    job.attempts += 1;
    persistQueue();

    const body = JSON.stringify({
      id:        job.id,
      event:     job.event,
      timestamp: nowIso(),
      attempt:   job.attempts,
      data:      job.payload
    });

    const secret = sub.secret || config.globalSecret || '';
    const sig    = await hmacSha256(secret, body);

    const headers = Object.assign({
      'Content-Type':       'application/json',
      'X-Volvix-Event':     job.event,
      'X-Volvix-Delivery':  job.id,
      'X-Volvix-Attempt':   String(job.attempts)
    }, sub.headers || {});
    if (sig) headers['X-Volvix-Signature'] = 'sha256=' + sig;

    const ctrl = new AbortController();
    const tmo  = setTimeout(() => ctrl.abort(), config.timeoutMs);

    let ok = false, status = 0, errMsg = '';
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: headers,
        body: body,
        signal: ctrl.signal
      });
      status = res.status;
      ok = res.ok;
      if (!ok) errMsg = 'HTTP ' + status;
    } catch (e) {
      errMsg = e.message || String(e);
    } finally {
      clearTimeout(tmo);
    }

    if (ok) {
      job.status = 'done';
      sub.stats.sent += 1;
      sub.stats.lastDelivery = nowIso();
      save(STORAGE_SUBS, subscriptions);
      addLog({
        jobId: job.id, subId: sub.id, event: job.event,
        level: 'ok', status: status, attempt: job.attempts
      });
    } else {
      if (job.attempts >= MAX_RETRIES) {
        job.status = 'dead';
        sub.stats.failed += 1;
        save(STORAGE_SUBS, subscriptions);
        addLog({
          jobId: job.id, subId: sub.id, event: job.event,
          level: 'dead', status: status, attempt: job.attempts, error: errMsg
        });
      } else {
        job.status    = 'pending';
        job.nextRunAt = Date.now() + backoffMs(job.attempts);
        addLog({
          jobId: job.id, subId: sub.id, event: job.event,
          level: 'retry', status: status, attempt: job.attempts, error: errMsg,
          nextRunAt: new Date(job.nextRunAt).toISOString()
        });
      }
    }
    persistQueue();
  }

  // ----------------------------- Tick / Worker ----------------------------
  let working = false;
  async function tick() {
    if (working || !config.enabled) return;
    working = true;
    try {
      const now = Date.now();
      // limpiar terminados
      queue = queue.filter(j => j.status !== 'done' && j.status !== 'dead');
      const ready = queue
        .filter(j => j.status === 'pending' && j.nextRunAt <= now)
        .slice(0, config.concurrency);

      if (ready.length) {
        await Promise.all(ready.map(deliver));
      }
      persistQueue();
    } catch (e) {
      console.error('[Webhooks] tick error', e);
    } finally {
      working = false;
    }
  }

  let timerId = null;
  function start() {
    if (timerId) return;
    timerId = setInterval(tick, TICK_INTERVAL);
  }
  function stop() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  // ----------------------------- Test webhook -----------------------------
  async function testSubscription(id, sampleEvent) {
    const sub = getSubscription(id);
    if (!sub) throw new Error('subscription not found');
    const ev = sampleEvent || sub.events[0] || 'system.error';
    const payload = {
      _test: true,
      message: 'Webhook de prueba desde Volvix POS',
      sampleAt: nowIso()
    };
    const job = enqueue(sub.id, ev, payload);
    await deliver(job);
    persistQueue();
    return logs[0] || null;
  }

  // ----------------------------- UI Modal de prueba -----------------------
  function openTestUI(subId) {
    const sub = subId ? getSubscription(subId) : null;
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#fff;min-width:420px;max-width:560px;border-radius:10px;' +
      'padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.3)';

    const eventOptions = Object.keys(EVENT_CATALOG)
      .map(k => `<option value="${k}">${k} — ${EVENT_CATALOG[k]}</option>`)
      .join('');

    box.innerHTML = `
      <h3 style="margin:0 0 14px;color:#111">Test Webhook</h3>
      <label style="display:block;font-size:13px;margin-bottom:4px">Suscripción</label>
      <select id="wh-sub" style="width:100%;padding:8px;margin-bottom:12px">
        ${subscriptions.map(s =>
          `<option value="${s.id}" ${sub && sub.id === s.id ? 'selected' : ''}>
             ${s.name} (${s.url})
           </option>`).join('')}
      </select>
      <label style="display:block;font-size:13px;margin-bottom:4px">Evento</label>
      <select id="wh-evt" style="width:100%;padding:8px;margin-bottom:12px">${eventOptions}</select>
      <label style="display:block;font-size:13px;margin-bottom:4px">Payload (JSON)</label>
      <textarea id="wh-payload" rows="6" style="width:100%;padding:8px;font-family:monospace">
{ "demo": true, "amount": 123.45 }</textarea>
      <div id="wh-result" style="margin-top:10px;font-size:12px;color:#444"></div>
      <div style="margin-top:14px;text-align:right">
        <button id="wh-cancel" style="padding:8px 14px;margin-right:8px">Cancelar</button>
        <button id="wh-send" style="padding:8px 14px;background:#1d6cff;color:#fff;border:0;border-radius:6px">Enviar prueba</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('#wh-cancel').onclick = () => overlay.remove();
    box.querySelector('#wh-send').onclick = async () => {
      const subId = box.querySelector('#wh-sub').value;
      const evt   = box.querySelector('#wh-evt').value;
      let payload = {};
      try { payload = JSON.parse(box.querySelector('#wh-payload').value || '{}'); }
      catch (e) {
        box.querySelector('#wh-result').textContent = 'JSON inválido: ' + e.message;
        return;
      }
      const job = enqueue(subId, evt, payload);
      await deliver(job);
      persistQueue();
      const last = logs[0];
      box.querySelector('#wh-result').innerHTML =
        '<b>Resultado:</b> ' + (last ? JSON.stringify(last) : 'sin log');
    };
  }

  // ----------------------------- Filtros / consulta -----------------------
  function getLogs(filter) {
    filter = filter || {};
    return logs.filter(l => {
      if (filter.event && l.event !== filter.event) return false;
      if (filter.subId && l.subId !== filter.subId) return false;
      if (filter.level && l.level !== filter.level) return false;
      return true;
    });
  }

  function getQueue(filter) {
    filter = filter || {};
    return queue.filter(j => {
      if (filter.status && j.status !== filter.status) return false;
      if (filter.event  && j.event  !== filter.event)  return false;
      if (filter.subId  && j.subId  !== filter.subId)  return false;
      return true;
    });
  }

  function purgeDead() {
    const before = queue.length;
    queue = queue.filter(j => j.status !== 'dead');
    persistQueue();
    return before - queue.length;
  }

  // ----------------------------- Config -----------------------------------
  function setConfig(patch) {
    Object.assign(config, patch || {});
    save(STORAGE_CONFIG, config);
    return Object.assign({}, config);
  }
  function getConfig() { return Object.assign({}, config); }

  // ----------------------------- API pública ------------------------------
  const WebhooksAPI = {
    EVENT_CATALOG: EVENT_CATALOG,

    // suscripciones
    listSubscriptions:   listSubscriptions,
    getSubscription:     getSubscription,
    addSubscription:     addSubscription,
    updateSubscription:  updateSubscription,
    removeSubscription:  removeSubscription,
    toggleSubscription:  toggleSubscription,

    // emisión
    emit:                emit,
    enqueue:             enqueue,

    // worker
    start:               start,
    stop:                stop,
    tick:                tick,

    // logs / cola
    getLogs:             getLogs,
    clearLogs:           clearLogs,
    getQueue:            getQueue,
    purgeDead:           purgeDead,

    // pruebas
    testSubscription:    testSubscription,
    openTestUI:          openTestUI,

    // config
    getConfig:           getConfig,
    setConfig:           setConfig,

    // constantes
    MAX_RETRIES:         MAX_RETRIES,
    version:             '1.0.0'
  };

  global.WebhooksAPI = WebhooksAPI;

  // Auto-start cuando el DOM está listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  console.log('[Volvix Webhooks] wired v' + WebhooksAPI.version +
              ' — eventos:', Object.keys(EVENT_CATALOG).length,
              '| subs:', subscriptions.length,
              '| queue:', queue.length);

})(typeof window !== 'undefined' ? window : globalThis);
