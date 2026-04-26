/* ============================================================================
 * volvix-queue-wiring.js
 * Volvix POS — Queue System (job processing)
 * Agent-34, Ronda 8 Fibonacci
 *
 * Features:
 *   1. Push jobs a queue (con prioridad)
 *   2. Workers procesan jobs
 *   3. Retry con exponential backoff
 *   4. Dead letter queue
 *   5. Cron-like (jobs programados)
 *   6. Concurrency control
 *   7. UI panel para ver queue
 *   8. Stats de jobs procesados
 *   9. window.QueueAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants & storage
  // ---------------------------------------------------------------------------
  const STORAGE_KEY      = 'volvix.queue.state.v1';
  const STORAGE_DLQ      = 'volvix.queue.dlq.v1';
  const STORAGE_STATS    = 'volvix.queue.stats.v1';
  const STORAGE_CRON     = 'volvix.queue.cron.v1';
  const TICK_MS          = 250;
  const DEFAULT_RETRIES  = 5;
  const DEFAULT_BACKOFF  = 500;          // ms base
  const MAX_BACKOFF      = 5 * 60 * 1000; // 5 min cap
  const PRIORITY = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3, BULK: 4 };

  // ---------------------------------------------------------------------------
  // Util
  // ---------------------------------------------------------------------------
  const now   = () => Date.now();
  const uuid  = () => 'job_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const safeParse = (raw, fb) => { try { return JSON.parse(raw); } catch { return fb; } };
  const lsGet = (k, fb) => safeParse(localStorage.getItem(k), fb);
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[Queue] LS save failed', e); } };
  const log = (...a) => console.log('%c[Queue]', 'color:#7c3aed', ...a);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    jobs:         lsGet(STORAGE_KEY,   []),  // pending + in-flight
    dlq:          lsGet(STORAGE_DLQ,   []),
    cron:         lsGet(STORAGE_CRON,  []),
    stats:        lsGet(STORAGE_STATS, {
      processed: 0, failed: 0, retries: 0, deadLettered: 0,
      byHandler: {}, lastProcessedAt: null, startedAt: now()
    }),
    handlers:     new Map(),           // name -> async fn(payload, ctx)
    middleware:   [],                  // pre-process hooks
    workers:      [],                  // active worker promises
    concurrency:  4,
    paused:       false,
    running:      false,
    tickHandle:   null,
    listeners:    new Map(),           // event listeners
  };

  // ---------------------------------------------------------------------------
  // Persistence (debounced)
  // ---------------------------------------------------------------------------
  let saveTimer = null;
  function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      lsSet(STORAGE_KEY, state.jobs);
      lsSet(STORAGE_DLQ, state.dlq);
      lsSet(STORAGE_STATS, state.stats);
      lsSet(STORAGE_CRON, state.cron);
      saveTimer = null;
    }, 120);
  }

  // ---------------------------------------------------------------------------
  // Event bus
  // ---------------------------------------------------------------------------
  function on(evt, cb) {
    if (!state.listeners.has(evt)) state.listeners.set(evt, new Set());
    state.listeners.get(evt).add(cb);
    return () => state.listeners.get(evt).delete(cb);
  }
  function emit(evt, payload) {
    const set = state.listeners.get(evt);
    if (!set) return;
    set.forEach(cb => { try { cb(payload); } catch (e) { console.warn('[Queue] listener error', e); } });
  }

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------
  function registerHandler(name, fn) {
    if (typeof fn !== 'function') throw new Error('Handler must be function');
    state.handlers.set(name, fn);
    log('handler registered:', name);
    return true;
  }
  function unregisterHandler(name) { return state.handlers.delete(name); }
  function use(mw) { if (typeof mw === 'function') state.middleware.push(mw); }

  // ---------------------------------------------------------------------------
  // Enqueue
  // ---------------------------------------------------------------------------
  function push(handler, payload, opts) {
    opts = opts || {};
    const job = {
      id:          opts.id || uuid(),
      handler:     handler,
      payload:     payload || {},
      priority:    opts.priority != null ? opts.priority : PRIORITY.NORMAL,
      attempts:    0,
      maxRetries:  opts.maxRetries != null ? opts.maxRetries : DEFAULT_RETRIES,
      backoffBase: opts.backoffBase || DEFAULT_BACKOFF,
      runAt:       opts.runAt || now(),
      createdAt:   now(),
      status:      'pending',
      lastError:   null,
      tag:         opts.tag || null,
      timeoutMs:   opts.timeoutMs || 30000,
    };
    state.jobs.push(job);
    sortJobs();
    persist();
    emit('job:enqueued', job);
    log('+ job', job.handler, '#' + job.id, 'p=' + job.priority);
    return job.id;
  }

  function sortJobs() {
    // priority asc, then runAt asc
    state.jobs.sort((a, b) => (a.priority - b.priority) || (a.runAt - b.runAt));
  }

  function remove(jobId) {
    const idx = state.jobs.findIndex(j => j.id === jobId);
    if (idx < 0) return false;
    state.jobs.splice(idx, 1);
    persist();
    emit('job:removed', jobId);
    return true;
  }

  function clear(filter) {
    if (!filter) { state.jobs = []; persist(); return; }
    state.jobs = state.jobs.filter(j => !filter(j));
    persist();
  }

  // ---------------------------------------------------------------------------
  // Worker loop
  // ---------------------------------------------------------------------------
  function pickNextJob() {
    const t = now();
    for (let i = 0; i < state.jobs.length; i++) {
      const j = state.jobs[i];
      if (j.status === 'pending' && j.runAt <= t) return j;
    }
    return null;
  }

  async function runJob(job) {
    job.status = 'running';
    job.attempts += 1;
    persist();
    emit('job:started', job);

    const handlerFn = state.handlers.get(job.handler);
    if (!handlerFn) {
      return failJob(job, new Error('No handler registered: ' + job.handler), true);
    }

    const ctx = { id: job.id, attempts: job.attempts, tag: job.tag, push, emit };
    try {
      // Run middleware
      for (const mw of state.middleware) await mw(job, ctx);

      const result = await Promise.race([
        Promise.resolve(handlerFn(job.payload, ctx)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Job timeout')), job.timeoutMs))
      ]);

      // success
      remove(job.id);
      state.stats.processed += 1;
      state.stats.lastProcessedAt = now();
      state.stats.byHandler[job.handler] = (state.stats.byHandler[job.handler] || 0) + 1;
      persist();
      emit('job:succeeded', { job, result });
      return result;
    } catch (err) {
      return failJob(job, err, false);
    }
  }

  function failJob(job, err, fatal) {
    job.lastError = String(err && err.message || err);
    state.stats.failed += 1;
    emit('job:failed', { job, error: job.lastError });

    if (fatal || job.attempts >= job.maxRetries) {
      // Move to DLQ
      remove(job.id);
      job.status = 'dead';
      job.deadAt = now();
      state.dlq.push(job);
      state.stats.deadLettered += 1;
      persist();
      emit('job:dead', job);
      log('☠ DLQ', job.handler, job.id, '-', job.lastError);
      return;
    }

    // Exponential backoff w/ jitter
    const exp = Math.min(MAX_BACKOFF, job.backoffBase * Math.pow(2, job.attempts - 1));
    const jitter = Math.floor(Math.random() * (exp * 0.25));
    job.runAt = now() + exp + jitter;
    job.status = 'pending';
    state.stats.retries += 1;
    sortJobs();
    persist();
    emit('job:retry', job);
    log('↻ retry', job.handler, 'in', exp + jitter, 'ms (attempt', job.attempts, ')');
  }

  async function workerLoop(workerId) {
    while (state.running) {
      if (state.paused) { await sleep(TICK_MS); continue; }
      const job = pickNextJob();
      if (!job) { await sleep(TICK_MS); continue; }
      // Reserve to avoid double-pick
      job.status = 'reserved';
      job._worker = workerId;
      try { await runJob(job); }
      catch (e) { console.warn('[Queue] worker error', e); }
    }
  }

  function start(concurrency) {
    if (state.running) return;
    if (concurrency) state.concurrency = concurrency;
    state.running = true;
    state.workers = [];
    for (let i = 0; i < state.concurrency; i++) {
      state.workers.push(workerLoop('w' + i));
    }
    state.tickHandle = setInterval(tickCron, 1000);
    log('started, concurrency =', state.concurrency);
    emit('queue:started');
  }

  function stop() {
    state.running = false;
    if (state.tickHandle) clearInterval(state.tickHandle);
    state.tickHandle = null;
    state.workers = [];
    log('stopped');
    emit('queue:stopped');
  }

  function pause()  { state.paused = true;  emit('queue:paused'); }
  function resume() { state.paused = false; emit('queue:resumed'); }

  // ---------------------------------------------------------------------------
  // Cron-like scheduler
  // ---------------------------------------------------------------------------
  function schedule(name, handler, payload, opts) {
    opts = opts || {};
    const entry = {
      id:        'cron_' + uuid().slice(4),
      name:      name,
      handler:   handler,
      payload:   payload || {},
      everyMs:   opts.everyMs || null,    // recurring
      atMs:      opts.atMs || null,       // one-shot epoch
      cron:      opts.cron || null,       // simple "HH:MM" daily
      priority:  opts.priority != null ? opts.priority : PRIORITY.NORMAL,
      lastRun:   null,
      nextRun:   computeNext(opts, null),
      enabled:   true,
    };
    state.cron.push(entry);
    persist();
    emit('cron:added', entry);
    return entry.id;
  }
  function unschedule(id) {
    const i = state.cron.findIndex(c => c.id === id);
    if (i < 0) return false;
    state.cron.splice(i, 1);
    persist();
    return true;
  }
  function computeNext(opts, lastRun) {
    const t = now();
    if (opts.atMs) return opts.atMs;
    if (opts.everyMs) return (lastRun || t) + opts.everyMs;
    if (opts.cron && /^\d{1,2}:\d{2}$/.test(opts.cron)) {
      const [h, m] = opts.cron.split(':').map(Number);
      const d = new Date(); d.setHours(h, m, 0, 0);
      if (d.getTime() <= t) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    return t + 60_000;
  }
  function tickCron() {
    const t = now();
    let dirty = false;
    for (const c of state.cron) {
      if (!c.enabled) continue;
      if (c.nextRun && c.nextRun <= t) {
        push(c.handler, c.payload, { priority: c.priority, tag: 'cron:' + c.name });
        c.lastRun = t;
        c.nextRun = computeNext(
          { everyMs: c.everyMs, atMs: c.atMs && c.atMs > t ? c.atMs : null, cron: c.cron },
          t
        );
        if (c.atMs && !c.everyMs && !c.cron) c.enabled = false; // one-shot
        dirty = true;
      }
    }
    if (dirty) persist();
  }

  // ---------------------------------------------------------------------------
  // DLQ ops
  // ---------------------------------------------------------------------------
  function getDLQ() { return state.dlq.slice(); }
  function requeueDead(jobId) {
    const i = state.dlq.findIndex(j => j.id === jobId);
    if (i < 0) return false;
    const job = state.dlq.splice(i, 1)[0];
    job.attempts = 0;
    job.status = 'pending';
    job.runAt = now();
    job.lastError = null;
    state.jobs.push(job);
    sortJobs();
    persist();
    emit('job:requeued', job);
    return true;
  }
  function purgeDLQ() { state.dlq = []; persist(); }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  function getStats() {
    return {
      ...state.stats,
      pending:  state.jobs.filter(j => j.status === 'pending').length,
      running:  state.jobs.filter(j => j.status === 'running' || j.status === 'reserved').length,
      dlqSize:  state.dlq.length,
      cronJobs: state.cron.length,
      uptimeMs: now() - state.stats.startedAt,
      paused:   state.paused,
      concurrency: state.concurrency,
    };
  }
  function resetStats() {
    state.stats = { processed: 0, failed: 0, retries: 0, deadLettered: 0,
                    byHandler: {}, lastProcessedAt: null, startedAt: now() };
    persist();
  }

  // ---------------------------------------------------------------------------
  // UI Panel
  // ---------------------------------------------------------------------------
  let panelEl = null, panelTimer = null;
  function ensurePanelStyles() {
    if (document.getElementById('volvix-queue-panel-css')) return;
    const css = document.createElement('style');
    css.id = 'volvix-queue-panel-css';
    css.textContent = `
      #vqp-root{position:fixed;right:16px;bottom:16px;width:380px;max-height:70vh;
        background:#0f172a;color:#e2e8f0;font:12px/1.4 system-ui,sans-serif;
        border:1px solid #334155;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);
        z-index:999999;display:none;flex-direction:column;overflow:hidden}
      #vqp-root.vqp-open{display:flex}
      #vqp-head{padding:8px 12px;background:#1e293b;display:flex;justify-content:space-between;
        align-items:center;border-bottom:1px solid #334155}
      #vqp-head b{color:#a78bfa}
      #vqp-tabs{display:flex;background:#111827}
      #vqp-tabs button{flex:1;background:transparent;color:#94a3b8;border:0;padding:6px;
        cursor:pointer;font-size:11px;border-bottom:2px solid transparent}
      #vqp-tabs button.active{color:#fff;border-bottom-color:#7c3aed}
      #vqp-body{padding:8px 12px;overflow:auto;flex:1}
      .vqp-row{padding:4px 6px;margin:2px 0;background:#1e293b;border-radius:4px;
        display:flex;justify-content:space-between;gap:6px;font-size:11px}
      .vqp-row .h{color:#a5b4fc;font-weight:600}
      .vqp-row .e{color:#fca5a5}
      .vqp-row .s{color:#86efac}
      .vqp-stat{display:inline-block;margin:2px 6px 2px 0;padding:2px 6px;
        background:#1e293b;border-radius:3px}
      #vqp-foot{padding:6px 12px;background:#1e293b;border-top:1px solid #334155;
        display:flex;gap:6px;flex-wrap:wrap}
      #vqp-foot button{background:#334155;border:0;color:#fff;padding:4px 8px;
        border-radius:4px;cursor:pointer;font-size:11px}
      #vqp-foot button:hover{background:#475569}
      #vqp-toggle{position:fixed;right:16px;bottom:16px;width:44px;height:44px;
        border-radius:50%;background:#7c3aed;color:#fff;border:0;cursor:pointer;
        font-size:18px;z-index:999998;box-shadow:0 4px 12px rgba(0,0,0,.3)}
      #vqp-toggle .badge{position:absolute;top:-4px;right:-4px;background:#ef4444;
        color:#fff;border-radius:10px;padding:1px 5px;font-size:10px;min-width:14px}
    `;
    document.head.appendChild(css);
  }

  function buildPanel() {
    if (panelEl) return;
    ensurePanelStyles();

    const toggle = document.createElement('button');
    toggle.id = 'vqp-toggle';
    toggle.innerHTML = '⚙<span class="badge" id="vqp-badge">0</span>';
    toggle.title = 'Volvix Queue';
    toggle.onclick = () => panelEl.classList.toggle('vqp-open');
    document.body.appendChild(toggle);

    panelEl = document.createElement('div');
    panelEl.id = 'vqp-root';
    panelEl.innerHTML = `
      <div id="vqp-head"><b>Volvix Queue</b>
        <span><button id="vqp-close" style="background:transparent;color:#94a3b8;border:0;cursor:pointer">✕</button></span>
      </div>
      <div id="vqp-tabs">
        <button data-tab="pending" class="active">Pending</button>
        <button data-tab="dlq">DLQ</button>
        <button data-tab="cron">Cron</button>
        <button data-tab="stats">Stats</button>
      </div>
      <div id="vqp-body"></div>
      <div id="vqp-foot">
        <button id="vqp-pause">Pause</button>
        <button id="vqp-resume">Resume</button>
        <button id="vqp-clear">Clear pending</button>
        <button id="vqp-purge">Purge DLQ</button>
      </div>`;
    document.body.appendChild(panelEl);

    panelEl.querySelector('#vqp-close').onclick = () => panelEl.classList.remove('vqp-open');
    panelEl.querySelectorAll('#vqp-tabs button').forEach(b => {
      b.onclick = () => {
        panelEl.querySelectorAll('#vqp-tabs button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        panelEl.dataset.tab = b.dataset.tab;
        renderPanel();
      };
    });
    panelEl.dataset.tab = 'pending';
    panelEl.querySelector('#vqp-pause').onclick  = pause;
    panelEl.querySelector('#vqp-resume').onclick = resume;
    panelEl.querySelector('#vqp-clear').onclick  = () => clear();
    panelEl.querySelector('#vqp-purge').onclick  = purgeDLQ;
  }

  function renderPanel() {
    if (!panelEl) return;
    const body  = panelEl.querySelector('#vqp-body');
    const tab   = panelEl.dataset.tab;
    const badge = document.getElementById('vqp-badge');
    if (badge) badge.textContent = state.jobs.length;

    let html = '';
    if (tab === 'pending') {
      if (!state.jobs.length) html = '<div style="color:#64748b">No pending jobs</div>';
      state.jobs.slice(0, 50).forEach(j => {
        html += `<div class="vqp-row"><span><span class="h">${j.handler}</span> #${j.id.slice(-6)}<br>
          <span style="color:#94a3b8">p=${j.priority} att=${j.attempts}/${j.maxRetries} ${j.status}</span></span>
          <span style="color:#fbbf24">${Math.max(0, j.runAt - now())}ms</span></div>`;
      });
    } else if (tab === 'dlq') {
      if (!state.dlq.length) html = '<div style="color:#64748b">DLQ empty</div>';
      state.dlq.slice(0, 50).forEach(j => {
        html += `<div class="vqp-row"><span><span class="h">${j.handler}</span> #${j.id.slice(-6)}<br>
          <span class="e">${(j.lastError||'').slice(0,80)}</span></span>
          <button onclick="window.QueueAPI.requeueDead('${j.id}')"
            style="background:#7c3aed;border:0;color:#fff;border-radius:3px;padding:2px 6px;cursor:pointer">Retry</button></div>`;
      });
    } else if (tab === 'cron') {
      if (!state.cron.length) html = '<div style="color:#64748b">No scheduled jobs</div>';
      state.cron.forEach(c => {
        html += `<div class="vqp-row"><span><span class="h">${c.name}</span> → ${c.handler}<br>
          <span style="color:#94a3b8">next in ${Math.max(0, (c.nextRun||0) - now())}ms ${c.enabled?'':' (off)'}</span></span>
          <button onclick="window.QueueAPI.unschedule('${c.id}')"
            style="background:#ef4444;border:0;color:#fff;border-radius:3px;padding:2px 6px;cursor:pointer">x</button></div>`;
      });
    } else if (tab === 'stats') {
      const s = getStats();
      html = `
        <div><span class="vqp-stat s">processed: ${s.processed}</span>
        <span class="vqp-stat e">failed: ${s.failed}</span>
        <span class="vqp-stat">retries: ${s.retries}</span>
        <span class="vqp-stat e">DLQ: ${s.dlqSize}</span></div>
        <div><span class="vqp-stat">pending: ${s.pending}</span>
        <span class="vqp-stat">running: ${s.running}</span>
        <span class="vqp-stat">cron: ${s.cronJobs}</span></div>
        <div><span class="vqp-stat">concurrency: ${s.concurrency}</span>
        <span class="vqp-stat">paused: ${s.paused}</span></div>
        <div style="margin-top:8px"><b>By handler:</b></div>
        ${Object.entries(s.byHandler).map(([k,v]) => `<div class="vqp-row"><span class="h">${k}</span><span>${v}</span></div>`).join('') || '<div style="color:#64748b">—</div>'}
      `;
    }
    body.innerHTML = html;
  }

  function showPanel()  { buildPanel(); panelEl.classList.add('vqp-open'); }
  function hidePanel()  { if (panelEl) panelEl.classList.remove('vqp-open'); }

  // Auto-render
  function startUi() {
    buildPanel();
    if (panelTimer) return;
    panelTimer = setInterval(renderPanel, 1000);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const QueueAPI = {
    // core
    push, remove, clear,
    registerHandler, unregisterHandler, use,
    // lifecycle
    start, stop, pause, resume,
    // cron
    schedule, unschedule,
    // dlq
    getDLQ, requeueDead, purgeDLQ,
    // stats
    getStats, resetStats,
    // events
    on, emit,
    // ui
    showPanel, hidePanel, startUi, renderPanel,
    // constants
    PRIORITY,
    // introspection
    list: () => state.jobs.slice(),
    get:  (id) => state.jobs.find(j => j.id === id) || state.dlq.find(j => j.id === id) || null,
    setConcurrency: (n) => { state.concurrency = Math.max(1, n|0); },
    _state: state, // debug
  };

  global.QueueAPI = QueueAPI;

  // Auto-bootstrap
  if (typeof document !== 'undefined') {
    const boot = () => { start(4); startUi(); log('boot complete'); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  } else {
    start(4);
  }

  log('volvix-queue-wiring loaded ✓');
})(typeof window !== 'undefined' ? window : globalThis);
