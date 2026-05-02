/**
 * Volvix A/B Test Suite
 * Advanced experimentation framework with variants, conversion tracking,
 * and statistical significance analysis.
 *
 * Exposes: window.ABTestSuite
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_abtest_state_v1';
  const EVENT_KEY = 'volvix_abtest_events_v1';
  const NOW = () => Date.now();

  // ---------- Utilities ----------
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function safeParse(json, fallback) {
    try { return JSON.parse(json) || fallback; } catch (_) { return fallback; }
  }

  function loadState() {
    return safeParse(localStorage.getItem(STORAGE_KEY), { userId: null, assignments: {}, exposures: {} });
  }
  function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function loadEvents() { return safeParse(localStorage.getItem(EVENT_KEY), []); }
  function saveEvents(e) { localStorage.setItem(EVENT_KEY, JSON.stringify(e.slice(-5000))); }

  // ---------- Statistics helpers ----------
  // Normal CDF approximation (Abramowitz & Stegun)
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }

  // Two-proportion z-test
  function twoProportionZ(cA, nA, cB, nB) {
    if (nA === 0 || nB === 0) return { z: 0, p: 1, pA: 0, pB: 0, lift: 0 };
    const pA = cA / nA, pB = cB / nB;
    const pPool = (cA + cB) / (nA + nB);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
    const z = se === 0 ? 0 : (pB - pA) / se;
    const p = 2 * (1 - normCdf(Math.abs(z)));
    const lift = pA === 0 ? 0 : (pB - pA) / pA;
    return { z, p, pA, pB, lift };
  }

  // Required sample size per variant for given baseline + MDE (relative)
  function sampleSize(baseline, mde, alpha = 0.05, power = 0.8) {
    const zA = 1.959963984540054; // 95%
    const zB = 0.8416212335729143; // 80% power
    const p1 = baseline, p2 = baseline * (1 + mde);
    const sd1 = Math.sqrt(2 * ((p1 + p2) / 2) * (1 - (p1 + p2) / 2));
    const sd2 = Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    const num = Math.pow(zA * sd1 + zB * sd2, 2);
    const den = Math.pow(p2 - p1, 2);
    return den === 0 ? Infinity : Math.ceil(num / den);
  }

  // ---------- Core Suite ----------
  const experiments = {};
  let state = loadState();
  let events = loadEvents();
  const subscribers = [];

  if (!state.userId) {
    state.userId = uuid();
    saveState(state);
  }

  function emit(type, payload) {
    const evt = { type, payload, ts: NOW(), userId: state.userId };
    events.push(evt);
    saveEvents(events);
    subscribers.forEach(fn => { try { fn(evt); } catch (_) {} });
  }

  function defineExperiment(config) {
    if (!config || !config.id) throw new Error('Experiment requires id');
    const variants = config.variants || [{ id: 'control', weight: 50 }, { id: 'treatment', weight: 50 }];
    const totalWeight = variants.reduce((a, v) => a + (v.weight || 1), 0);
    experiments[config.id] = {
      id: config.id,
      name: config.name || config.id,
      variants,
      totalWeight,
      goals: config.goals || ['conversion'],
      audience: config.audience || (() => true),
      startedAt: config.startedAt || NOW(),
      endsAt: config.endsAt || null,
      sticky: config.sticky !== false,
      hypothesis: config.hypothesis || '',
      mde: config.mde || 0.1,
      baseline: config.baseline || 0.1,
      status: 'running'
    };
    emit('experiment_defined', { id: config.id });
    return experiments[config.id];
  }

  function pickVariant(exp) {
    const seed = hashStr(state.userId + ':' + exp.id);
    const r = (seed % 10000) / 10000 * exp.totalWeight;
    let acc = 0;
    for (const v of exp.variants) {
      acc += (v.weight || 1);
      if (r < acc) return v;
    }
    return exp.variants[exp.variants.length - 1];
  }

  function assign(experimentId, context) {
    const exp = experiments[experimentId];
    if (!exp) return null;
    if (exp.status !== 'running') return null;
    if (exp.endsAt && NOW() > exp.endsAt) { exp.status = 'ended'; return null; }
    if (typeof exp.audience === 'function' && !exp.audience(context || {})) return null;

    if (exp.sticky && state.assignments[experimentId]) {
      return state.assignments[experimentId];
    }
    const variant = pickVariant(exp);
    state.assignments[experimentId] = variant.id;
    saveState(state);
    emit('assignment', { experimentId, variant: variant.id });
    return variant.id;
  }

  function exposure(experimentId) {
    const variantId = state.assignments[experimentId];
    if (!variantId) return null;
    state.exposures[experimentId] = state.exposures[experimentId] || {};
    state.exposures[experimentId][variantId] = (state.exposures[experimentId][variantId] || 0) + 1;
    saveState(state);
    emit('exposure', { experimentId, variant: variantId });
    return variantId;
  }

  function track(goal, value, meta) {
    const numeric = typeof value === 'number' ? value : 1;
    Object.keys(state.assignments).forEach(expId => {
      const exp = experiments[expId];
      if (!exp) return;
      if (!exp.goals.includes(goal)) return;
      const variant = state.assignments[expId];
      emit('conversion', { experimentId: expId, variant, goal, value: numeric, meta: meta || null });
    });
  }

  function getAssignment(experimentId) { return state.assignments[experimentId] || null; }

  function listExperiments() { return Object.values(experiments); }

  function aggregate(experimentId) {
    const exp = experiments[experimentId];
    if (!exp) return null;
    const expEvents = events.filter(e => e.payload && e.payload.experimentId === experimentId);
    const byVariant = {};
    exp.variants.forEach(v => { byVariant[v.id] = { exposures: 0, conversions: {}, totalConversions: 0, value: 0 }; });
    expEvents.forEach(e => {
      const v = e.payload.variant;
      if (!byVariant[v]) return;
      if (e.type === 'exposure') byVariant[v].exposures += 1;
      if (e.type === 'conversion') {
        byVariant[v].totalConversions += 1;
        byVariant[v].value += e.payload.value || 0;
        const g = e.payload.goal;
        byVariant[v].conversions[g] = (byVariant[v].conversions[g] || 0) + 1;
      }
    });
    return { experiment: exp, byVariant };
  }

  function significance(experimentId, goal, controlId) {
    const agg = aggregate(experimentId);
    if (!agg) return null;
    const exp = agg.experiment;
    const ctrlId = controlId || (exp.variants[0] && exp.variants[0].id);
    const ctrl = agg.byVariant[ctrlId];
    if (!ctrl) return null;
    const results = [];
    Object.keys(agg.byVariant).forEach(vid => {
      if (vid === ctrlId) return;
      const v = agg.byVariant[vid];
      const cA = (ctrl.conversions[goal] || 0);
      const cB = (v.conversions[goal] || 0);
      const stat = twoProportionZ(cA, ctrl.exposures, cB, v.exposures);
      results.push({
        variant: vid,
        control: ctrlId,
        goal,
        nA: ctrl.exposures, cA,
        nB: v.exposures, cB,
        rateA: stat.pA, rateB: stat.pB,
        lift: stat.lift,
        z: stat.z, pValue: stat.p,
        significant: stat.p < 0.05,
        winner: stat.p < 0.05 ? (stat.pB > stat.pA ? vid : ctrlId) : null
      });
    });
    return results;
  }

  function recommendDuration(experimentId) {
    const exp = experiments[experimentId];
    if (!exp) return null;
    const n = sampleSize(exp.baseline, exp.mde);
    return { perVariant: n, totalAcrossVariants: n * exp.variants.length, baseline: exp.baseline, mde: exp.mde };
  }

  function stop(experimentId) {
    if (experiments[experimentId]) {
      experiments[experimentId].status = 'stopped';
      emit('experiment_stopped', { id: experimentId });
    }
  }

  function reset() {
    state = { userId: uuid(), assignments: {}, exposures: {} };
    events = [];
    saveState(state);
    saveEvents(events);
    emit('reset', {});
  }

  function exportData() {
    return JSON.stringify({ state, events, experiments }, null, 2);
  }

  function importData(json) {
    const data = safeParse(json, null);
    if (!data) return false;
    state = data.state || state;
    events = data.events || [];
    Object.keys(data.experiments || {}).forEach(k => experiments[k] = data.experiments[k]);
    saveState(state);
    saveEvents(events);
    return true;
  }

  function on(fn) { subscribers.push(fn); return () => { const i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); }; }

  function userId() { return state.userId; }

  function setUserId(id) { state.userId = id; saveState(state); }

  function debugReport() {
    const out = listExperiments().map(e => {
      const agg = aggregate(e.id);
      const sig = significance(e.id, e.goals[0]);
      return { id: e.id, status: e.status, variants: agg ? agg.byVariant : {}, significance: sig };
    });
    return out;
  }

  // ---------- Public API ----------
  global.ABTestSuite = {
    define: defineExperiment,
    assign,
    exposure,
    track,
    getAssignment,
    list: listExperiments,
    aggregate,
    significance,
    recommendDuration,
    stop,
    reset,
    export: exportData,
    import: importData,
    on,
    userId,
    setUserId,
    debugReport,
    _internal: { sampleSize, twoProportionZ, normCdf, hashStr }
  };

  emit('suite_loaded', { version: '1.0.0' });
})(typeof window !== 'undefined' ? window : globalThis);
