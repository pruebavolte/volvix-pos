/* volvix-loadtest-wiring.js
 * Load testing simulator for Volvix.
 * Exposes window.LoadTest with ramp-up scheduling, RPS control,
 * latency percentile computation, error tracking and reporting.
 *
 * Usage:
 *   LoadTest.configure({ targetRps: 50, durationMs: 60000, rampUpMs: 10000 });
 *   LoadTest.setRequest(async () => Volvix.auth.fetch('/api/ping'));
 *   await LoadTest.run();
 *   console.log(LoadTest.report());
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    targetRps: 10,
    durationMs: 30000,
    rampUpMs: 5000,
    rampDownMs: 0,
    maxConcurrency: 200,
    timeoutMs: 15000,
    warmupRequests: 0,
    sampleIntervalMs: 1000,
    percentiles: [50, 75, 90, 95, 99, 99.9],
    abortOnErrorRate: 0,   // 0 disables; e.g. 0.5 means abort if >50% errors
    label: 'volvix-loadtest'
  };

  const state = {
    config: { ...DEFAULTS },
    requestFn: null,
    running: false,
    aborted: false,
    startedAt: 0,
    endedAt: 0,
    inFlight: 0,
    sent: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    timeouts: 0,
    latencies: [],          // ms per completed request
    errors: [],             // {t, message}
    samples: [],            // {t, rps, inFlight, errors, p95}
    statusCounts: {},       // http status -> count
    listeners: { tick: [], done: [], error: [] }
  };

  function now() { return performance.now ? performance.now() : Date.now(); }

  function emit(event, payload) {
    (state.listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { /* swallow listener errors */ }
    });
  }

  function on(event, fn) {
    if (!state.listeners[event]) state.listeners[event] = [];
    state.listeners[event].push(fn);
    return () => {
      state.listeners[event] = state.listeners[event].filter(f => f !== fn);
    };
  }

  function configure(partial) {
    state.config = { ...DEFAULTS, ...(partial || {}) };
    return state.config;
  }

  function setRequest(fn) {
    if (typeof fn !== 'function') throw new Error('setRequest requires a function');
    state.requestFn = fn;
  }

  function reset() {
    state.running = false;
    state.aborted = false;
    state.startedAt = 0;
    state.endedAt = 0;
    state.inFlight = 0;
    state.sent = 0;
    state.completed = 0;
    state.succeeded = 0;
    state.failed = 0;
    state.timeouts = 0;
    state.latencies = [];
    state.errors = [];
    state.samples = [];
    state.statusCounts = {};
  }

  function currentTargetRps(elapsed) {
    const { targetRps, rampUpMs, rampDownMs, durationMs } = state.config;
    if (elapsed < rampUpMs) {
      return targetRps * (elapsed / rampUpMs);
    }
    const rampDownStart = durationMs - rampDownMs;
    if (rampDownMs > 0 && elapsed > rampDownStart) {
      const remaining = Math.max(0, durationMs - elapsed);
      return targetRps * (remaining / rampDownMs);
    }
    return targetRps;
  }

  async function withTimeout(promise, ms) {
    let timer;
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
    try {
      return await Promise.race([promise, timeoutP]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fireOne() {
    if (!state.requestFn) return;
    if (state.inFlight >= state.config.maxConcurrency) return;
    state.inFlight++;
    state.sent++;
    const t0 = now();
    try {
      const result = await withTimeout(
        Promise.resolve().then(() => state.requestFn()),
        state.config.timeoutMs
      );
      const dt = now() - t0;
      state.latencies.push(dt);
      state.completed++;
      state.succeeded++;
      if (result && typeof result.status === 'number') {
        const k = String(result.status);
        state.statusCounts[k] = (state.statusCounts[k] || 0) + 1;
        if (result.status >= 400) {
          state.succeeded--;
          state.failed++;
          state.errors.push({ t: now(), message: 'HTTP ' + result.status });
        }
      }
    } catch (err) {
      const dt = now() - t0;
      state.latencies.push(dt);
      state.completed++;
      state.failed++;
      const msg = (err && err.message) || String(err);
      if (msg === 'TIMEOUT') state.timeouts++;
      state.errors.push({ t: now(), message: msg });
      emit('error', { message: msg });
    } finally {
      state.inFlight--;
    }
  }

  async function scheduler() {
    const cfg = state.config;
    state.startedAt = now();
    let lastSampleAt = state.startedAt;
    let lastSampleSent = 0;
    let nextFireAt = state.startedAt;

    // warmup
    for (let i = 0; i < cfg.warmupRequests; i++) {
      fireOne();
      await sleep(20);
    }

    while (state.running && !state.aborted) {
      const t = now();
      const elapsed = t - state.startedAt;
      if (elapsed >= cfg.durationMs) break;

      const rps = Math.max(0.0001, currentTargetRps(elapsed));
      const interval = 1000 / rps;

      if (t >= nextFireAt) {
        fireOne();
        nextFireAt += interval;
        // catch-up cap: don't let a starved scheduler burst forever
        if (nextFireAt < t - interval * 5) nextFireAt = t + interval;
      }

      // Sampling tick
      if (t - lastSampleAt >= cfg.sampleIntervalMs) {
        const window = (t - lastSampleAt) / 1000;
        const rpsNow = (state.sent - lastSampleSent) / window;
        const sample = {
          t: Math.round(elapsed),
          rps: +rpsNow.toFixed(2),
          inFlight: state.inFlight,
          completed: state.completed,
          errors: state.failed,
          p95: percentile(state.latencies, 95)
        };
        state.samples.push(sample);
        emit('tick', sample);
        lastSampleAt = t;
        lastSampleSent = state.sent;

        // abort-on-error-rate
        if (cfg.abortOnErrorRate > 0 && state.completed > 50) {
          const rate = state.failed / state.completed;
          if (rate > cfg.abortOnErrorRate) {
            state.aborted = true;
            break;
          }
        }
      }

      await sleep(Math.min(5, Math.max(1, interval / 4)));
    }

    // Drain in-flight
    const drainDeadline = now() + cfg.timeoutMs + 1000;
    while (state.inFlight > 0 && now() < drainDeadline) {
      await sleep(25);
    }

    state.endedAt = now();
    state.running = false;
    const r = report();
    emit('done', r);
    return r;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function percentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return +sorted[idx].toFixed(2);
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2);
  }

  async function run() {
    if (state.running) throw new Error('LoadTest already running');
    if (!state.requestFn) throw new Error('LoadTest.setRequest(fn) required');
    reset();
    state.running = true;
    return await scheduler();
  }

  function abort() {
    state.aborted = true;
    state.running = false;
  }

  function report() {
    const cfg = state.config;
    const durSec = Math.max(0.001, ((state.endedAt || now()) - state.startedAt) / 1000);
    const pct = {};
    cfg.percentiles.forEach(p => { pct['p' + p] = percentile(state.latencies, p); });
    return {
      label: cfg.label,
      config: { ...cfg },
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationSec: +durSec.toFixed(2),
      sent: state.sent,
      completed: state.completed,
      succeeded: state.succeeded,
      failed: state.failed,
      timeouts: state.timeouts,
      errorRate: state.completed ? +(state.failed / state.completed).toFixed(4) : 0,
      throughputRps: +(state.completed / durSec).toFixed(2),
      latencyMs: {
        min: state.latencies.length ? +Math.min(...state.latencies).toFixed(2) : 0,
        max: state.latencies.length ? +Math.max(...state.latencies).toFixed(2) : 0,
        mean: mean(state.latencies),
        ...pct
      },
      statusCounts: { ...state.statusCounts },
      samples: state.samples.slice(),
      errorsSample: state.errors.slice(0, 25),
      aborted: state.aborted
    };
  }

  function formatReport(r) {
    r = r || report();
    const lines = [];
    lines.push('=== ' + r.label + ' ===');
    lines.push('duration: ' + r.durationSec + 's  sent: ' + r.sent +
      '  completed: ' + r.completed + '  failed: ' + r.failed +
      '  timeouts: ' + r.timeouts);
    lines.push('throughput: ' + r.throughputRps + ' rps   error rate: ' +
      (r.errorRate * 100).toFixed(2) + '%');
    const L = r.latencyMs;
    lines.push('latency ms: min=' + L.min + ' mean=' + L.mean + ' max=' + L.max);
    Object.keys(L).filter(k => k.startsWith('p')).forEach(k => {
      lines.push('  ' + k + ' = ' + L[k] + ' ms');
    });
    if (Object.keys(r.statusCounts).length) {
      lines.push('status: ' + JSON.stringify(r.statusCounts));
    }
    if (r.aborted) lines.push('** aborted early **');
    return lines.join('\n');
  }

  const LoadTest = {
    configure,
    setRequest,
    run,
    abort,
    reset,
    report,
    formatReport,
    on,
    get running() { return state.running; },
    get state() {
      return {
        running: state.running,
        sent: state.sent,
        completed: state.completed,
        failed: state.failed,
        inFlight: state.inFlight
      };
    }
  };

  global.LoadTest = LoadTest;
  if (typeof module !== 'undefined' && module.exports) module.exports = LoadTest;
})(typeof window !== 'undefined' ? window : globalThis);
