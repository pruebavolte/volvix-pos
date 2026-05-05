/**
 * Volvix Performance Monitor
 * Advanced runtime performance monitoring: FPS, memory, network, slow ops, alerts, reports.
 * Exposes window.PerfMonitor.
 */
(function (global) {
  'use strict';

  const NOW = () => (global.performance && performance.now) ? performance.now() : Date.now();

  const config = {
    fpsSampleSize: 60,
    fpsLowThreshold: 30,
    fpsCriticalThreshold: 15,
    memoryWarnPctHeap: 0.75,
    memoryCriticalPctHeap: 0.90,
    slowOpThresholdMs: 50,
    longTaskThresholdMs: 50,
    networkSlowMs: 1500,
    sampleIntervalMs: 1000,
    historyMax: 600,
    alertCooldownMs: 5000,
  };

  const state = {
    running: false,
    startedAt: 0,
    rafId: null,
    intervalId: null,
    lastFrameTs: 0,
    frameTimes: [],
    fpsHistory: [],
    memoryHistory: [],
    networkHistory: [],
    slowOps: [],
    longTasks: [],
    alerts: [],
    counters: { frames: 0, slowOps: 0, longTasks: 0, alerts: 0, networkRequests: 0, networkSlow: 0, networkErrors: 0 },
    listeners: new Set(),
    lastAlertAt: {},
    observers: [],
    origFetch: null,
    origXHROpen: null,
    origXHRSend: null,
  };

  function pushBounded(arr, item) {
    arr.push(item);
    if (arr.length > config.historyMax) arr.shift();
  }

  function emit(event) {
    state.listeners.forEach(fn => { try { fn(event); } catch (_) {} });
  }

  function alert(level, code, message, data) {
    const key = level + ':' + code;
    const now = NOW();
    if (state.lastAlertAt[key] && now - state.lastAlertAt[key] < config.alertCooldownMs) return;
    state.lastAlertAt[key] = now;
    const a = { ts: Date.now(), level, code, message, data: data || null };
    pushBounded(state.alerts, a);
    state.counters.alerts++;
    emit({ type: 'alert', payload: a });
    if (level === 'critical') console.error('[PerfMonitor]', code, message, data || '');
    else if (level === 'warn') console.warn('[PerfMonitor]', code, message, data || '');
  }

  // ── FPS via rAF ──
  function frameTick(ts) {
    if (!state.running) return;
    if (state.lastFrameTs) {
      const delta = ts - state.lastFrameTs;
      state.frameTimes.push(delta);
      if (state.frameTimes.length > config.fpsSampleSize) state.frameTimes.shift();
      state.counters.frames++;
    }
    state.lastFrameTs = ts;
    state.rafId = global.requestAnimationFrame(frameTick);
  }

  function currentFps() {
    if (!state.frameTimes.length) return 0;
    const sum = state.frameTimes.reduce((a, b) => a + b, 0);
    const avg = sum / state.frameTimes.length;
    return avg > 0 ? Math.round(1000 / avg) : 0;
  }

  function frameStats() {
    if (!state.frameTimes.length) return { min: 0, max: 0, avg: 0, p95: 0 };
    const sorted = state.frameTimes.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      min: +sorted[0].toFixed(2),
      max: +sorted[sorted.length - 1].toFixed(2),
      avg: +(sum / sorted.length).toFixed(2),
      p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
    };
  }

  // ── Memory ──
  function snapshotMemory() {
    const mem = global.performance && performance.memory;
    if (!mem) return null;
    return {
      ts: Date.now(),
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
      pct: mem.jsHeapSizeLimit ? mem.usedJSHeapSize / mem.jsHeapSizeLimit : 0,
    };
  }

  // ── Periodic sample ──
  function sample() {
    const fps = currentFps();
    pushBounded(state.fpsHistory, { ts: Date.now(), fps });
    if (fps && fps < config.fpsCriticalThreshold) alert('critical', 'FPS_CRITICAL', 'FPS crítico: ' + fps, { fps });
    else if (fps && fps < config.fpsLowThreshold) alert('warn', 'FPS_LOW', 'FPS bajo: ' + fps, { fps });

    const mem = snapshotMemory();
    if (mem) {
      pushBounded(state.memoryHistory, mem);
      if (mem.pct >= config.memoryCriticalPctHeap) alert('critical', 'MEM_CRITICAL', 'Heap crítico: ' + (mem.pct * 100).toFixed(1) + '%', mem);
      else if (mem.pct >= config.memoryWarnPctHeap) alert('warn', 'MEM_WARN', 'Heap alto: ' + (mem.pct * 100).toFixed(1) + '%', mem);
    }
    emit({ type: 'sample', payload: { fps, memory: mem } });
  }

  // ── Slow ops detection (manual mark/measure + wrapper) ──
  function trackOp(name, fn) {
    const t0 = NOW();
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.finally(() => recordOp(name, NOW() - t0));
      }
      recordOp(name, NOW() - t0);
      return result;
    } catch (e) {
      recordOp(name, NOW() - t0, e);
      throw e;
    }
  }

  function recordOp(name, durationMs, error) {
    if (durationMs >= config.slowOpThresholdMs) {
      const op = { ts: Date.now(), name, durationMs: +durationMs.toFixed(2), error: error ? String(error) : null };
      pushBounded(state.slowOps, op);
      state.counters.slowOps++;
      emit({ type: 'slowOp', payload: op });
      alert('warn', 'SLOW_OP', 'Op lenta: ' + name + ' (' + op.durationMs + 'ms)', op);
    }
  }

  // ── Long tasks (PerformanceObserver) ──
  function startObservers() {
    if (!global.PerformanceObserver) return;
    try {
      const lt = new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          const t = { ts: Date.now(), durationMs: +e.duration.toFixed(2), name: e.name, startTime: +e.startTime.toFixed(2) };
          pushBounded(state.longTasks, t);
          state.counters.longTasks++;
          emit({ type: 'longTask', payload: t });
          if (t.durationMs >= config.longTaskThresholdMs * 2) alert('warn', 'LONG_TASK', 'Long task ' + t.durationMs + 'ms', t);
        });
      });
      lt.observe({ entryTypes: ['longtask'] });
      state.observers.push(lt);
    } catch (_) {}

    try {
      const res = new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          const r = {
            ts: Date.now(),
            url: e.name,
            durationMs: +e.duration.toFixed(2),
            transferSize: e.transferSize || 0,
            initiatorType: e.initiatorType,
          };
          pushBounded(state.networkHistory, r);
          state.counters.networkRequests++;
          if (r.durationMs >= config.networkSlowMs) {
            state.counters.networkSlow++;
            alert('warn', 'NET_SLOW', 'Request lento: ' + r.url + ' (' + r.durationMs + 'ms)', r);
          }
        });
      });
      res.observe({ entryTypes: ['resource'] });
      state.observers.push(res);
    } catch (_) {}
  }

  function stopObservers() {
    state.observers.forEach(o => { try { o.disconnect(); } catch (_) {} });
    state.observers = [];
  }

  // ── Network instrumentation (fetch + XHR) ──
  function patchFetch() {
    if (!global.fetch || state.origFetch) return;
    state.origFetch = global.fetch.bind(global);
    global.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const t0 = NOW();
      return state.origFetch(input, init).then(resp => {
        recordOp('fetch ' + url, NOW() - t0);
        if (!resp.ok) { state.counters.networkErrors++; alert('warn', 'NET_HTTP', 'HTTP ' + resp.status + ' ' + url, { status: resp.status }); }
        return resp;
      }).catch(err => {
        state.counters.networkErrors++;
        alert('critical', 'NET_FAIL', 'Fetch falló: ' + url, { error: String(err) });
        throw err;
      });
    };
  }

  function unpatchFetch() {
    if (state.origFetch) { global.fetch = state.origFetch; state.origFetch = null; }
  }

  function patchXHR() {
    if (!global.XMLHttpRequest || state.origXHROpen) return;
    const proto = global.XMLHttpRequest.prototype;
    state.origXHROpen = proto.open;
    state.origXHRSend = proto.send;
    proto.open = function (method, url) {
      this.__perfUrl = url;
      this.__perfMethod = method;
      return state.origXHROpen.apply(this, arguments);
    };
    proto.send = function () {
      const t0 = NOW();
      const url = this.__perfUrl || '';
      this.addEventListener('loadend', () => {
        recordOp('xhr ' + url, NOW() - t0);
        if (this.status >= 400) { state.counters.networkErrors++; alert('warn', 'NET_HTTP', 'XHR ' + this.status + ' ' + url, { status: this.status }); }
      });
      return state.origXHRSend.apply(this, arguments);
    };
  }

  function unpatchXHR() {
    if (!state.origXHROpen) return;
    const proto = global.XMLHttpRequest.prototype;
    proto.open = state.origXHROpen;
    proto.send = state.origXHRSend;
    state.origXHROpen = null;
    state.origXHRSend = null;
  }

  // ── Public API ──
  function start(opts) {
    if (state.running) return;
    Object.assign(config, opts || {});
    state.running = true;
    state.startedAt = Date.now();
    state.lastFrameTs = 0;
    state.rafId = global.requestAnimationFrame(frameTick);
    state.intervalId = global.setInterval(sample, config.sampleIntervalMs);
    startObservers();
    patchFetch();
    patchXHR();
    emit({ type: 'start' });
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    if (state.rafId) global.cancelAnimationFrame(state.rafId);
    if (state.intervalId) global.clearInterval(state.intervalId);
    stopObservers();
    unpatchFetch();
    unpatchXHR();
    emit({ type: 'stop' });
  }

  function reset() {
    state.frameTimes = [];
    state.fpsHistory = [];
    state.memoryHistory = [];
    state.networkHistory = [];
    state.slowOps = [];
    state.longTasks = [];
    state.alerts = [];
    state.counters = { frames: 0, slowOps: 0, longTasks: 0, alerts: 0, networkRequests: 0, networkSlow: 0, networkErrors: 0 };
    state.lastAlertAt = {};
  }

  function on(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }

  function getReport() {
    return {
      generatedAt: new Date().toISOString(),
      uptimeMs: state.startedAt ? Date.now() - state.startedAt : 0,
      running: state.running,
      config: Object.assign({}, config),
      fps: { current: currentFps(), stats: frameStats(), history: state.fpsHistory.slice() },
      memory: { current: snapshotMemory(), history: state.memoryHistory.slice() },
      network: { history: state.networkHistory.slice(-100) },
      slowOps: state.slowOps.slice(),
      longTasks: state.longTasks.slice(),
      alerts: state.alerts.slice(),
      counters: Object.assign({}, state.counters),
    };
  }

  function exportReport(filename) {
    const report = getReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || ('volvix-perf-' + Date.now() + '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return report;
  }

  function summary() {
    const r = getReport();
    return {
      uptimeS: Math.round(r.uptimeMs / 1000),
      fps: r.fps.current,
      fpsAvg: r.fps.stats.avg ? +(1000 / r.fps.stats.avg).toFixed(1) : 0,
      heapPct: r.memory.current ? +(r.memory.current.pct * 100).toFixed(1) : null,
      slowOps: r.counters.slowOps,
      longTasks: r.counters.longTasks,
      networkRequests: r.counters.networkRequests,
      networkSlow: r.counters.networkSlow,
      networkErrors: r.counters.networkErrors,
      alerts: r.counters.alerts,
    };
  }

  const PerfMonitor = {
    start, stop, reset, on,
    track: trackOp,
    mark: recordOp,
    getReport, exportReport, summary,
    get config() { return config; },
    setConfig(o) { Object.assign(config, o || {}); },
    get state() { return { running: state.running, counters: Object.assign({}, state.counters) }; },
  };

  global.PerfMonitor = PerfMonitor;
  if (typeof module !== 'undefined' && module.exports) module.exports = PerfMonitor;
})(typeof window !== 'undefined' ? window : globalThis);
