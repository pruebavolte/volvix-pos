/**
 * volvix-lighthouse-lite.js
 * ----------------------------------------------------------------------------
 * Lighthouse-Lite Client - Mide Core Web Vitals en el navegador y produce
 * un reporte de performance con score 0-100 estilo Lighthouse.
 *
 * Métricas:
 *   - LCP   (Largest Contentful Paint)
 *   - FID   (First Input Delay)
 *   - CLS   (Cumulative Layout Shift)
 *   - FCP   (First Contentful Paint)
 *   - TTFB  (Time To First Byte)
 *   - INP   (Interaction to Next Paint, fallback opcional)
 *
 * API pública:
 *   window.LighthouseLite.start();
 *   window.LighthouseLite.stop();
 *   window.LighthouseLite.getMetrics();
 *   window.LighthouseLite.getScore();
 *   window.LighthouseLite.getReport();
 *   window.LighthouseLite.printReport();
 *   window.LighthouseLite.onUpdate(cb);
 * ----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Umbrales oficiales (web.dev / Lighthouse v10)
  // ---------------------------------------------------------------------------
  const THRESHOLDS = {
    LCP:  { good: 2500, needs: 4000, weight: 0.25 },
    FID:  { good: 100,  needs: 300,  weight: 0.10 },
    CLS:  { good: 0.1,  needs: 0.25, weight: 0.15 },
    FCP:  { good: 1800, needs: 3000, weight: 0.15 },
    TTFB: { good: 800,  needs: 1800, weight: 0.15 },
    INP:  { good: 200,  needs: 500,  weight: 0.20 }
  };

  // ---------------------------------------------------------------------------
  // Estado interno
  // ---------------------------------------------------------------------------
  const state = {
    metrics: {
      LCP: null, FID: null, CLS: 0, FCP: null, TTFB: null, INP: null
    },
    observers: [],
    listeners: [],
    running: false,
    startTime: null,
    sessionId: null
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function uid() {
    return 'lhl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
  }

  function now() {
    return performance.now();
  }

  function emit() {
    const snap = getMetrics();
    state.listeners.forEach(function (cb) {
      try { cb(snap); } catch (e) { /* swallow */ }
    });
  }

  function safeObserve(type, cb, opts) {
    if (typeof PerformanceObserver === 'undefined') return null;
    try {
      const po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(cb);
      });
      po.observe(Object.assign({ type: type, buffered: true }, opts || {}));
      state.observers.push(po);
      return po;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cálculo de score por métrica (curva piecewise-linear estilo Lighthouse)
  // ---------------------------------------------------------------------------
  function scoreMetric(name, value) {
    if (value == null) return null;
    const t = THRESHOLDS[name];
    if (!t) return null;
    if (value <= t.good)  return 100;
    if (value >= t.needs) return Math.max(0, Math.round(40 - ((value - t.needs) / t.needs) * 40));
    // entre good y needs -> 50..90
    const ratio = (value - t.good) / (t.needs - t.good);
    return Math.round(90 - ratio * 40);
  }

  function ratingMetric(name, value) {
    if (value == null) return 'unknown';
    const t = THRESHOLDS[name];
    if (value <= t.good)  return 'good';
    if (value <= t.needs) return 'needs-improvement';
    return 'poor';
  }

  // ---------------------------------------------------------------------------
  // Recolección de métricas
  // ---------------------------------------------------------------------------
  function collectTTFB() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        state.metrics.TTFB = Math.max(0, nav.responseStart - nav.startTime);
      } else if (performance.timing) {
        const t = performance.timing;
        state.metrics.TTFB = t.responseStart - t.navigationStart;
      }
    } catch (e) { /* ignore */ }
  }

  function collectFCP() {
    safeObserve('paint', function (entry) {
      if (entry.name === 'first-contentful-paint') {
        state.metrics.FCP = entry.startTime;
        emit();
      }
    });
  }

  function collectLCP() {
    safeObserve('largest-contentful-paint', function (entry) {
      state.metrics.LCP = entry.renderTime || entry.loadTime || entry.startTime;
      emit();
    });
  }

  function collectFID() {
    safeObserve('first-input', function (entry) {
      state.metrics.FID = entry.processingStart - entry.startTime;
      emit();
    });
  }

  function collectCLS() {
    let sessionValue = 0;
    let sessionEntries = [];
    safeObserve('layout-shift', function (entry) {
      if (entry.hadRecentInput) return;
      const first = sessionEntries[0];
      const last  = sessionEntries[sessionEntries.length - 1];
      if (last && entry.startTime - last.startTime < 1000 &&
          first && entry.startTime - first.startTime < 5000) {
        sessionValue += entry.value;
        sessionEntries.push(entry);
      } else {
        sessionValue = entry.value;
        sessionEntries = [entry];
      }
      if (sessionValue > state.metrics.CLS) {
        state.metrics.CLS = sessionValue;
        emit();
      }
    });
  }

  function collectINP() {
    let worst = 0;
    safeObserve('event', function (entry) {
      if (entry.interactionId && entry.duration > worst) {
        worst = entry.duration;
        state.metrics.INP = worst;
        emit();
      }
    }, { durationThreshold: 40 });
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------
  function start() {
    if (state.running) return;
    state.running = true;
    state.startTime = now();
    state.sessionId = uid();
    collectTTFB();
    collectFCP();
    collectLCP();
    collectFID();
    collectCLS();
    collectINP();
    return state.sessionId;
  }

  function stop() {
    state.running = false;
    state.observers.forEach(function (po) {
      try { po.disconnect(); } catch (e) {}
    });
    state.observers = [];
  }

  function getMetrics() {
    return {
      sessionId: state.sessionId,
      url: location.href,
      timestamp: Date.now(),
      LCP:  state.metrics.LCP  != null ? Math.round(state.metrics.LCP)  : null,
      FID:  state.metrics.FID  != null ? Math.round(state.metrics.FID)  : null,
      CLS:  +state.metrics.CLS.toFixed(4),
      FCP:  state.metrics.FCP  != null ? Math.round(state.metrics.FCP)  : null,
      TTFB: state.metrics.TTFB != null ? Math.round(state.metrics.TTFB) : null,
      INP:  state.metrics.INP  != null ? Math.round(state.metrics.INP)  : null
    };
  }

  function getScore() {
    const m = getMetrics();
    let total = 0;
    let weightSum = 0;
    Object.keys(THRESHOLDS).forEach(function (k) {
      const v = m[k];
      if (v == null) return;
      const s = scoreMetric(k, v);
      if (s == null) return;
      total += s * THRESHOLDS[k].weight;
      weightSum += THRESHOLDS[k].weight;
    });
    if (weightSum === 0) return null;
    return Math.round(total / weightSum);
  }

  function scoreLabel(score) {
    if (score == null) return 'no-data';
    if (score >= 90) return 'good';
    if (score >= 50) return 'needs-improvement';
    return 'poor';
  }

  function getReport() {
    const m = getMetrics();
    const overall = getScore();
    const breakdown = {};
    Object.keys(THRESHOLDS).forEach(function (k) {
      breakdown[k] = {
        value:   m[k],
        score:   scoreMetric(k, m[k]),
        rating:  ratingMetric(k, m[k]),
        weight:  THRESHOLDS[k].weight,
        thresholds: { good: THRESHOLDS[k].good, needs: THRESHOLDS[k].needs }
      };
    });
    return {
      sessionId: m.sessionId,
      url:       m.url,
      timestamp: m.timestamp,
      overall:   { score: overall, label: scoreLabel(overall) },
      metrics:   breakdown,
      raw:       m
    };
  }

  function printReport() {
    const r = getReport();
    const tag = '%c[LighthouseLite]';
    const css = 'color:#fff;background:#0a84ff;padding:2px 6px;border-radius:3px;font-weight:bold;';
    console.log(tag + ' Score: ' + r.overall.score + ' (' + r.overall.label + ')', css);
    console.log('URL:', r.url);
    const rows = {};
    Object.keys(r.metrics).forEach(function (k) {
      const e = r.metrics[k];
      rows[k] = {
        value:  e.value,
        score:  e.score,
        rating: e.rating,
        good:   e.thresholds.good,
        needs:  e.thresholds.needs
      };
    });
    if (console.table) console.table(rows);
    else console.log(rows);
    return r;
  }

  function onUpdate(cb) {
    if (typeof cb !== 'function') return function () {};
    state.listeners.push(cb);
    return function unsubscribe() {
      const i = state.listeners.indexOf(cb);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  function reset() {
    stop();
    state.metrics = { LCP: null, FID: null, CLS: 0, FCP: null, TTFB: null, INP: null };
    state.listeners = [];
    state.sessionId = null;
    state.startTime = null;
  }

  // ---------------------------------------------------------------------------
  // Exposición global
  // ---------------------------------------------------------------------------
  global.LighthouseLite = {
    version: '1.0.0',
    start: start,
    stop: stop,
    reset: reset,
    getMetrics: getMetrics,
    getScore: getScore,
    getReport: getReport,
    printReport: printReport,
    onUpdate: onUpdate,
    THRESHOLDS: THRESHOLDS
  };

  // Auto-start si la página ya está cargando
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // Reporte automático al window.load + 3s (deja madurar LCP/CLS)
  global.addEventListener('load', function () {
    setTimeout(function () {
      try { emit(); } catch (e) {}
    }, 3000);
  });
})(typeof window !== 'undefined' ? window : this);
