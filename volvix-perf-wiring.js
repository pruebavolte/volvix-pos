/**
 * volvix-perf-wiring.js
 * Performance monitoring + optimization para Volvix POS
 * Agent-24 / Ronda 7 Fibonacci
 */
(function (global) {
  'use strict';

  const VolvixPerf = {
    config: {
      slowThreshold: 500,
      fpsSampleMs: 1000,
      memSampleMs: 2000,
      networkSampleMs: 1500,
      panelEnabled: true,
      autoStart: true,
      leakCheckMs: 30000,
      leakGrowthMB: 25,
    },
    state: {
      started: false,
      fps: 0,
      frameCount: 0,
      lastFpsTs: performance.now(),
      slowOps: [],
      networkCalls: [],
      memorySamples: [],
      paintMetrics: {},
      navMetrics: {},
      observers: [],
      timers: [],
      leakBaseline: null,
      reports: [],
    },
  };

  // ────────────────── 1. CORE METRICS ──────────────────
  function captureNavigationMetrics() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return;
      VolvixPerf.state.navMetrics = {
        pageLoadTime: Math.round(nav.loadEventEnd - nav.startTime),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domInteractive: Math.round(nav.domInteractive - nav.startTime),
        transferSize: nav.transferSize || 0,
        type: nav.type,
      };
    } catch (e) { console.warn('[VolvixPerf] nav metrics fail', e); }
  }

  function capturePaintMetrics() {
    try {
      performance.getEntriesByType('paint').forEach(entry => {
        VolvixPerf.state.paintMetrics[entry.name] = Math.round(entry.startTime);
      });
    } catch (e) { /* noop */ }
  }

  function getMemoryUsage() {
    if (!performance.memory) return null;
    const m = performance.memory;
    return {
      usedMB: +(m.usedJSHeapSize / 1048576).toFixed(2),
      totalMB: +(m.totalJSHeapSize / 1048576).toFixed(2),
      limitMB: +(m.jsHeapSizeLimit / 1048576).toFixed(2),
      pct: +((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100).toFixed(1),
    };
  }

  // ────────────────── 2. FPS COUNTER ──────────────────
  function startFpsLoop() {
    function tick(ts) {
      VolvixPerf.state.frameCount++;
      const elapsed = ts - VolvixPerf.state.lastFpsTs;
      if (elapsed >= VolvixPerf.config.fpsSampleMs) {
        VolvixPerf.state.fps = Math.round((VolvixPerf.state.frameCount * 1000) / elapsed);
        VolvixPerf.state.frameCount = 0;
        VolvixPerf.state.lastFpsTs = ts;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ────────────────── 3. SLOW OPERATION DETECTION ──────────────────
  function observeLongTasks() {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          if (entry.duration >= VolvixPerf.config.slowThreshold) {
            const op = {
              type: entry.entryType,
              name: entry.name || 'task',
              duration: Math.round(entry.duration),
              ts: Date.now(),
            };
            VolvixPerf.state.slowOps.push(op);
            if (VolvixPerf.state.slowOps.length > 100) VolvixPerf.state.slowOps.shift();
            console.warn(`[VolvixPerf] slow op (${op.duration}ms):`, op.name);
          }
        });
      });
      obs.observe({ entryTypes: ['longtask', 'measure'] });
      VolvixPerf.state.observers.push(obs);
    } catch (e) { /* longtask not supported */ }
  }

  function measure(label, fn) {
    const t0 = performance.now();
    try { return fn(); }
    finally {
      const dur = performance.now() - t0;
      if (dur >= VolvixPerf.config.slowThreshold) {
        VolvixPerf.state.slowOps.push({ type: 'manual', name: label, duration: Math.round(dur), ts: Date.now() });
        console.warn(`[VolvixPerf] slow op "${label}": ${dur.toFixed(0)}ms`);
      }
    }
  }

  async function measureAsync(label, fn) {
    const t0 = performance.now();
    try { return await fn(); }
    finally {
      const dur = performance.now() - t0;
      if (dur >= VolvixPerf.config.slowThreshold) {
        VolvixPerf.state.slowOps.push({ type: 'async', name: label, duration: Math.round(dur), ts: Date.now() });
        console.warn(`[VolvixPerf] slow async "${label}": ${dur.toFixed(0)}ms`);
      }
    }
  }

  // ────────────────── 4. NETWORK MONITORING ──────────────────
  function observeNetwork() {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          const call = {
            url: entry.name,
            duration: Math.round(entry.duration),
            size: entry.transferSize || 0,
            type: entry.initiatorType,
            ts: Date.now(),
          };
          VolvixPerf.state.networkCalls.push(call);
          if (VolvixPerf.state.networkCalls.length > 200) VolvixPerf.state.networkCalls.shift();
          if (call.duration >= VolvixPerf.config.slowThreshold) {
            console.warn(`[VolvixPerf] slow network (${call.duration}ms):`, call.url);
          }
        });
      });
      obs.observe({ entryTypes: ['resource'] });
      VolvixPerf.state.observers.push(obs);
    } catch (e) { /* noop */ }
  }

  function wrapFetch() {
    if (!global.fetch || global.fetch.__volvixWrapped) return;
    const orig = global.fetch.bind(global);
    const wrapped = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      const t0 = performance.now();
      try {
        const res = await orig(...args);
        const dur = performance.now() - t0;
        if (dur >= VolvixPerf.config.slowThreshold) {
          console.warn(`[VolvixPerf] slow fetch (${dur.toFixed(0)}ms):`, url);
        }
        return res;
      } catch (err) {
        console.error('[VolvixPerf] fetch error:', url, err);
        throw err;
      }
    };
    wrapped.__volvixWrapped = true;
    global.fetch = wrapped;
  }

  // ────────────────── 5. MEMORY LEAK DETECTION ──────────────────
  function startMemorySampling() {
    const t = setInterval(() => {
      const mem = getMemoryUsage();
      if (!mem) return;
      VolvixPerf.state.memorySamples.push({ ts: Date.now(), usedMB: mem.usedMB });
      if (VolvixPerf.state.memorySamples.length > 300) VolvixPerf.state.memorySamples.shift();
    }, VolvixPerf.config.memSampleMs);
    VolvixPerf.state.timers.push(t);
  }

  function startLeakDetection() {
    const t = setInterval(() => {
      const mem = getMemoryUsage();
      if (!mem) return;
      if (VolvixPerf.state.leakBaseline === null) {
        VolvixPerf.state.leakBaseline = mem.usedMB;
        return;
      }
      const growth = mem.usedMB - VolvixPerf.state.leakBaseline;
      if (growth >= VolvixPerf.config.leakGrowthMB) {
        console.error(`[VolvixPerf] POSIBLE MEMORY LEAK: +${growth.toFixed(1)}MB desde baseline (${VolvixPerf.state.leakBaseline}MB → ${mem.usedMB}MB)`);
        VolvixPerf.state.leakBaseline = mem.usedMB; // rebase para no spammear
      }
    }, VolvixPerf.config.leakCheckMs);
    VolvixPerf.state.timers.push(t);
  }

  // ────────────────── 6. LAZY LOAD IMAGES ──────────────────
  function lazyLoadImages(selector = 'img[data-src]') {
    if (!('IntersectionObserver' in global)) {
      document.querySelectorAll(selector).forEach(img => {
        img.src = img.dataset.src;
      });
      return;
    }
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const img = e.target;
          if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
          if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '50px' });
    document.querySelectorAll(selector).forEach(img => io.observe(img));
    return io;
  }

  // ────────────────── 7. DEBOUNCE / THROTTLE ──────────────────
  function debounce(fn, wait = 250) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function throttle(fn, limit = 100) {
    let inThrottle = false;
    let lastArgs = null;
    return function (...args) {
      lastArgs = args;
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
          if (lastArgs !== args) fn.apply(this, lastArgs);
        }, limit);
      }
    };
  }

  function rafThrottle(fn) {
    let queued = false;
    let lastArgs;
    return function (...args) {
      lastArgs = args;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(this, lastArgs);
      });
    };
  }

  // ────────────────── 8. LIVE STATS PANEL ──────────────────
  function buildPanel() {
    if (document.getElementById('volvix-perf-panel')) return;
    const el = document.createElement('div');
    el.id = 'volvix-perf-panel';
    el.style.cssText = [
      'position:fixed', 'bottom:8px', 'right:8px', 'z-index:999999',
      'background:rgba(15,17,22,0.92)', 'color:#0f8',
      'font:11px/1.4 ui-monospace,Menlo,Consolas,monospace',
      'padding:8px 10px', 'border:1px solid #0f8', 'border-radius:6px',
      'min-width:220px', 'max-width:280px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
      'cursor:move', 'user-select:none',
    ].join(';');
    el.innerHTML = '<b style="color:#fff">VOLVIX PERF</b> <span id="vp-close" style="float:right;cursor:pointer;color:#f55">×</span><div id="vp-body"></div>';
    document.body.appendChild(el);
    document.getElementById('vp-close').onclick = () => el.remove();
    makeDraggable(el);
  }

  function makeDraggable(el) {
    let dx = 0, dy = 0, sx = 0, sy = 0, dragging = false;
    el.addEventListener('mousedown', e => {
      if (e.target.id === 'vp-close') return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); dx = r.left; dy = r.top;
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      el.style.left = (dx + e.clientX - sx) + 'px';
      el.style.top = (dy + e.clientY - sy) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function updatePanel() {
    const body = document.getElementById('vp-body');
    if (!body) return;
    const mem = getMemoryUsage();
    const nav = VolvixPerf.state.navMetrics;
    const paint = VolvixPerf.state.paintMetrics;
    const slow = VolvixPerf.state.slowOps.length;
    const net = VolvixPerf.state.networkCalls.length;
    const fpsColor = VolvixPerf.state.fps >= 50 ? '#0f8' : VolvixPerf.state.fps >= 30 ? '#fc0' : '#f55';
    body.innerHTML = `
      <div>FPS: <span style="color:${fpsColor}">${VolvixPerf.state.fps}</span></div>
      <div>Load: ${nav.pageLoadTime || '—'}ms · TTFB: ${nav.ttfb || '—'}ms</div>
      <div>FP: ${paint['first-paint'] || '—'}ms · FCP: ${paint['first-contentful-paint'] || '—'}ms</div>
      <div>Mem: ${mem ? mem.usedMB + 'MB / ' + mem.limitMB + 'MB (' + mem.pct + '%)' : 'n/a'}</div>
      <div>Slow ops: <span style="color:${slow ? '#fc0' : '#0f8'}">${slow}</span> · Net: ${net}</div>
    `;
  }

  function startPanel() {
    if (!VolvixPerf.config.panelEnabled) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildPanel);
    } else { buildPanel(); }
    const t = setInterval(updatePanel, 500);
    VolvixPerf.state.timers.push(t);
  }

  // ────────────────── 9. REPORTS ──────────────────
  function generateReport() {
    captureNavigationMetrics();
    capturePaintMetrics();
    const report = {
      timestamp: new Date().toISOString(),
      url: location.href,
      navigation: VolvixPerf.state.navMetrics,
      paint: VolvixPerf.state.paintMetrics,
      memory: getMemoryUsage(),
      fps: VolvixPerf.state.fps,
      slowOpsCount: VolvixPerf.state.slowOps.length,
      slowOpsTop: VolvixPerf.state.slowOps.slice(-10),
      networkCount: VolvixPerf.state.networkCalls.length,
      networkSlow: VolvixPerf.state.networkCalls.filter(c => c.duration >= VolvixPerf.config.slowThreshold).slice(-10),
      memoryGrowthMB: (() => {
        const s = VolvixPerf.state.memorySamples;
        if (s.length < 2) return 0;
        return +(s[s.length - 1].usedMB - s[0].usedMB).toFixed(2);
      })(),
      score: calculateScore(),
    };
    VolvixPerf.state.reports.push(report);
    return report;
  }

  function calculateScore() {
    let score = 100;
    const nav = VolvixPerf.state.navMetrics;
    if (nav.pageLoadTime > 3000) score -= 20;
    else if (nav.pageLoadTime > 1500) score -= 10;
    if (VolvixPerf.state.fps < 30) score -= 20;
    else if (VolvixPerf.state.fps < 50) score -= 10;
    score -= Math.min(30, VolvixPerf.state.slowOps.length * 2);
    const mem = getMemoryUsage();
    if (mem && mem.pct > 80) score -= 15;
    else if (mem && mem.pct > 60) score -= 5;
    return Math.max(0, score);
  }

  function downloadReport() {
    const r = generateReport();
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `volvix-perf-${Date.now()}.json`;
    a.click();
  }

  // ────────────────── 10. PUBLIC API & LIFECYCLE ──────────────────
  function start() {
    if (VolvixPerf.state.started) return;
    VolvixPerf.state.started = true;
    captureNavigationMetrics();
    capturePaintMetrics();
    startFpsLoop();
    observeLongTasks();
    observeNetwork();
    wrapFetch();
    startMemorySampling();
    startLeakDetection();
    startPanel();
    if (document.readyState === 'complete') captureNavigationMetrics();
    else global.addEventListener('load', captureNavigationMetrics);
    console.log('[VolvixPerf] monitoring started');
  }

  function stop() {
    VolvixPerf.state.observers.forEach(o => { try { o.disconnect(); } catch (e) {} });
    VolvixPerf.state.timers.forEach(t => clearInterval(t));
    VolvixPerf.state.observers = [];
    VolvixPerf.state.timers = [];
    const p = document.getElementById('volvix-perf-panel');
    if (p) p.remove();
    VolvixPerf.state.started = false;
    console.log('[VolvixPerf] monitoring stopped');
  }

  // Expose API
  VolvixPerf.start = start;
  VolvixPerf.stop = stop;
  VolvixPerf.measure = measure;
  VolvixPerf.measureAsync = measureAsync;
  VolvixPerf.debounce = debounce;
  VolvixPerf.throttle = throttle;
  VolvixPerf.rafThrottle = rafThrottle;
  VolvixPerf.lazyLoadImages = lazyLoadImages;
  VolvixPerf.getMemoryUsage = getMemoryUsage;
  VolvixPerf.generateReport = generateReport;
  VolvixPerf.downloadReport = downloadReport;
  VolvixPerf.score = calculateScore;

  global.VolvixPerf = VolvixPerf;

  if (VolvixPerf.config.autoStart) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else { start(); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
