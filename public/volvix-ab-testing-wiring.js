/* ============================================================================
 * volvix-ab-testing-wiring.js
 * Volvix POS — A/B Testing Framework + Feature Flags
 * Agent-44 / Ronda 8 Fibonacci
 * ----------------------------------------------------------------------------
 * Provee:
 *   1. Definicion de experimentos con variantes
 *   2. Asignacion aleatoria ponderada (50/50, 80/20, etc.)
 *   3. Tracking de conversiones por variante
 *   4. Calculo de significancia estadistica (z-test 2 proporciones)
 *   5. Overrides manuales para QA / staging
 *   6. Dashboard de resultados (consola + DOM opcional)
 *   7. Auto-disable de variantes perdedoras
 *   8. Feature flags integrados
 *   9. window.ABTestingAPI publica
 * ==========================================================================*/

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------
  var CONFIG = {
    storageKey: 'volvix_abtest_state_v1',
    flagKey: 'volvix_feature_flags_v1',
    overrideKey: 'volvix_abtest_overrides_v1',
    minSampleSize: 100,         // por variante antes de declarar ganador
    significanceAlpha: 0.05,    // 95% confianza
    autoDisableLosers: true,
    autoDisableDelta: 0.20,     // si conversion < 80% de la mejor, se desactiva
    debug: true,
    persistMs: 1000 * 60 * 60 * 24 * 30, // 30 dias
  };

  // ---------------------------------------------------------------------------
  // UTILS
  // ---------------------------------------------------------------------------
  function log() {
    if (!CONFIG.debug) return;
    try { console.log.apply(console, ['[ABTest]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function warn() {
    try { console.warn.apply(console, ['[ABTest]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function now() { return Date.now(); }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function loadStorage(key, fallback) {
    try {
      if (!global.localStorage) return fallback;
      return safeParse(global.localStorage.getItem(key), fallback);
    } catch (e) { return fallback; }
  }

  function saveStorage(key, value) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { warn('storage error', e); return false; }
  }

  // Fisher-Yates pero usado solo para variant pick: weighted random
  function weightedPick(variants) {
    var total = 0, i;
    for (i = 0; i < variants.length; i++) total += (variants[i].weight || 0);
    if (total <= 0) return variants[0];
    var r = Math.random() * total;
    var acc = 0;
    for (i = 0; i < variants.length; i++) {
      acc += (variants[i].weight || 0);
      if (r <= acc) return variants[i];
    }
    return variants[variants.length - 1];
  }

  // ---------------------------------------------------------------------------
  // STATISTICAL SIGNIFICANCE (z-test, two proportions)
  // ---------------------------------------------------------------------------
  // Aproximacion de la CDF normal (Abramowitz & Stegun 7.1.26)
  function normalCdf(z) {
    var sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    var t = 1.0 / (1.0 + 0.3275911 * z);
    var y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return 0.5 * (1.0 + sign * y);
  }

  function zTestTwoProportions(c1, n1, c2, n2) {
    if (n1 < 1 || n2 < 1) return { z: 0, p: 1, significant: false };
    var p1 = c1 / n1, p2 = c2 / n2;
    var p = (c1 + c2) / (n1 + n2);
    var se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    if (se === 0) return { z: 0, p: 1, significant: false };
    var z = (p1 - p2) / se;
    var pVal = 2 * (1 - normalCdf(Math.abs(z)));
    return {
      z: z,
      p: pVal,
      significant: pVal < CONFIG.significanceAlpha,
      lift: p1 === 0 ? 0 : (p2 - p1) / p1,
      p1: p1, p2: p2
    };
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var state = loadStorage(CONFIG.storageKey, {
    userId: null,
    experiments: {}, // { expId: { variant, assignedAt, exposures, conversions } }
    history: []
  });

  var flagState = loadStorage(CONFIG.flagKey, { flags: {} });
  var overrides = loadStorage(CONFIG.overrideKey, {});

  if (!state.userId) {
    state.userId = uuid();
    saveStorage(CONFIG.storageKey, state);
  }

  function persist() { saveStorage(CONFIG.storageKey, state); }
  function persistFlags() { saveStorage(CONFIG.flagKey, flagState); }
  function persistOverrides() { saveStorage(CONFIG.overrideKey, overrides); }

  // ---------------------------------------------------------------------------
  // EXPERIMENT REGISTRY
  // ---------------------------------------------------------------------------
  var registry = {};

  function defineExperiment(def) {
    if (!def || !def.id) throw new Error('experiment requires id');
    if (!Array.isArray(def.variants) || def.variants.length < 2) {
      throw new Error('experiment requires at least 2 variants');
    }
    // normalizar pesos
    var sum = def.variants.reduce(function (a, v) { return a + (v.weight || 1); }, 0);
    def.variants.forEach(function (v) {
      v.weight = (v.weight == null ? 1 : v.weight);
      v.disabled = !!v.disabled;
    });
    def.totalWeight = sum;
    def.createdAt = def.createdAt || now();
    def.metric = def.metric || 'conversion';
    def.enabled = def.enabled !== false;
    registry[def.id] = def;

    if (!state.experiments[def.id]) {
      state.experiments[def.id] = {
        variant: null,
        assignedAt: null,
        exposures: {}, // variantId -> count
        conversions: {} // variantId -> count
      };
      persist();
    }
    log('defined experiment', def.id, 'variants=', def.variants.map(function (v) { return v.id; }));
    return def;
  }

  function getActiveVariants(expId) {
    var exp = registry[expId];
    if (!exp) return [];
    return exp.variants.filter(function (v) { return !v.disabled; });
  }

  // ---------------------------------------------------------------------------
  // ASSIGNMENT
  // ---------------------------------------------------------------------------
  function assign(expId) {
    var exp = registry[expId];
    if (!exp) { warn('unknown experiment', expId); return null; }
    if (!exp.enabled) return exp.variants[0];

    // override?
    if (overrides[expId]) {
      var ov = exp.variants.find(function (v) { return v.id === overrides[expId]; });
      if (ov) return ov;
    }

    var rec = state.experiments[expId];
    if (rec && rec.variant) {
      var locked = exp.variants.find(function (v) { return v.id === rec.variant && !v.disabled; });
      if (locked) return locked;
    }

    var pool = getActiveVariants(expId);
    if (pool.length === 0) return exp.variants[0];

    var picked = weightedPick(pool);
    rec.variant = picked.id;
    rec.assignedAt = now();
    persist();
    log('assigned', expId, '->', picked.id, 'user=', state.userId);
    return picked;
  }

  function getVariant(expId) {
    var v = assign(expId);
    return v ? v.id : null;
  }

  // ---------------------------------------------------------------------------
  // TRACKING
  // ---------------------------------------------------------------------------
  function trackExposure(expId) {
    var v = assign(expId);
    if (!v) return;
    var rec = state.experiments[expId];
    rec.exposures[v.id] = (rec.exposures[v.id] || 0) + 1;
    state.history.push({ t: now(), type: 'exposure', exp: expId, variant: v.id });
    persist();
    maybeAutoDisable(expId);
  }

  function trackConversion(expId, value) {
    var rec = state.experiments[expId];
    if (!rec || !rec.variant) {
      warn('conversion without assignment', expId);
      return;
    }
    rec.conversions[rec.variant] = (rec.conversions[rec.variant] || 0) + (value || 1);
    state.history.push({ t: now(), type: 'conversion', exp: expId, variant: rec.variant, value: value || 1 });
    persist();
    maybeAutoDisable(expId);
  }

  // ---------------------------------------------------------------------------
  // RESULTS / DASHBOARD
  // ---------------------------------------------------------------------------
  function summarize(expId) {
    var exp = registry[expId];
    if (!exp) return null;
    var rec = state.experiments[expId] || { exposures: {}, conversions: {} };
    var rows = exp.variants.map(function (v) {
      var n = rec.exposures[v.id] || 0;
      var c = rec.conversions[v.id] || 0;
      return {
        variant: v.id,
        label: v.label || v.id,
        weight: v.weight,
        disabled: !!v.disabled,
        exposures: n,
        conversions: c,
        rate: n > 0 ? c / n : 0
      };
    });

    // pairwise comparison vs control (primer variant)
    var control = rows[0];
    rows.forEach(function (r, i) {
      if (i === 0) { r.vsControl = null; return; }
      r.vsControl = zTestTwoProportions(
        control.conversions, control.exposures,
        r.conversions, r.exposures
      );
    });

    var leader = rows.reduce(function (best, r) {
      return r.rate > (best ? best.rate : -1) ? r : best;
    }, null);

    return {
      experiment: expId,
      enabled: exp.enabled,
      rows: rows,
      leader: leader ? leader.variant : null,
      totalExposures: rows.reduce(function (a, r) { return a + r.exposures; }, 0)
    };
  }

  function summarizeAll() {
    return Object.keys(registry).map(summarize);
  }

  function renderDashboard(targetEl) {
    var summaries = summarizeAll();
    if (!targetEl) {
      console.table(summaries.flatMap(function (s) {
        return s.rows.map(function (r) {
          return {
            exp: s.experiment, variant: r.variant, n: r.exposures,
            conv: r.conversions, rate: (r.rate * 100).toFixed(2) + '%',
            sig: r.vsControl ? (r.vsControl.significant ? 'YES' : 'no') : '-',
            p: r.vsControl ? r.vsControl.p.toFixed(4) : '-'
          };
        });
      }));
      return;
    }
    var html = ['<table border="1" cellpadding="4" style="font-family:monospace;font-size:12px"><thead><tr>',
      '<th>Experiment</th><th>Variant</th><th>N</th><th>Conv</th><th>Rate</th><th>p-value</th><th>Sig</th><th>Lift</th></tr></thead><tbody>'].join('');
    summaries.forEach(function (s) {
      s.rows.forEach(function (r) {
        var sig = r.vsControl ? r.vsControl.significant : false;
        html += '<tr style="background:' + (sig ? '#cfc' : 'transparent') + '">';
        html += '<td>' + s.experiment + '</td>';
        html += '<td>' + r.variant + (r.disabled ? ' (off)' : '') + '</td>';
        html += '<td>' + r.exposures + '</td>';
        html += '<td>' + r.conversions + '</td>';
        html += '<td>' + (r.rate * 100).toFixed(2) + '%</td>';
        html += '<td>' + (r.vsControl ? r.vsControl.p.toFixed(4) : '-') + '</td>';
        html += '<td>' + (r.vsControl ? (sig ? 'YES' : 'no') : '-') + '</td>';
        html += '<td>' + (r.vsControl ? (r.vsControl.lift * 100).toFixed(1) + '%' : '-') + '</td>';
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    targetEl.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // AUTO-DISABLE LOSERS
  // ---------------------------------------------------------------------------
  function maybeAutoDisable(expId) {
    if (!CONFIG.autoDisableLosers) return;
    var exp = registry[expId];
    if (!exp) return;
    var s = summarize(expId);
    if (!s) return;

    // Necesitamos sample size minimo en todas las variantes activas
    var ready = s.rows.every(function (r) {
      return r.disabled || r.exposures >= CONFIG.minSampleSize;
    });
    if (!ready) return;

    var best = s.rows.reduce(function (a, r) { return (!r.disabled && r.rate > (a ? a.rate : -1)) ? r : a; }, null);
    if (!best) return;

    s.rows.forEach(function (r) {
      if (r.disabled) return;
      if (r.variant === best.variant) return;
      var threshold = best.rate * (1 - CONFIG.autoDisableDelta);
      if (r.rate < threshold && r.vsControl && r.vsControl.significant) {
        var v = exp.variants.find(function (x) { return x.id === r.variant; });
        if (v) {
          v.disabled = true;
          log('auto-disabled losing variant', expId, r.variant, 'rate=', r.rate.toFixed(3), 'best=', best.rate.toFixed(3));
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // OVERRIDES (QA)
  // ---------------------------------------------------------------------------
  function setOverride(expId, variantId) {
    if (variantId == null) {
      delete overrides[expId];
    } else {
      overrides[expId] = variantId;
    }
    persistOverrides();
    // forzar re-asignacion
    var rec = state.experiments[expId];
    if (rec) { rec.variant = null; persist(); }
    log('override set', expId, '=', variantId);
  }

  function clearOverrides() {
    overrides = {};
    persistOverrides();
    Object.keys(state.experiments).forEach(function (k) { state.experiments[k].variant = null; });
    persist();
  }

  // ---------------------------------------------------------------------------
  // FEATURE FLAGS (integrados)
  // ---------------------------------------------------------------------------
  function setFlag(name, value) {
    flagState.flags[name] = !!value;
    persistFlags();
    log('flag', name, '=', !!value);
  }

  function getFlag(name, fallback) {
    if (flagState.flags.hasOwnProperty(name)) return flagState.flags[name];
    return fallback === undefined ? false : fallback;
  }

  function listFlags() {
    return Object.assign({}, flagState.flags);
  }

  // bind a flag a un experimento booleano
  function flagFromExperiment(flagName, expId, truthyVariant) {
    var v = getVariant(expId);
    var enabled = v === truthyVariant;
    setFlag(flagName, enabled);
    return enabled;
  }

  // ---------------------------------------------------------------------------
  // RESET / EXPORT
  // ---------------------------------------------------------------------------
  function resetUser() {
    state = {
      userId: uuid(),
      experiments: {},
      history: []
    };
    persist();
    Object.keys(registry).forEach(function (id) {
      state.experiments[id] = { variant: null, assignedAt: null, exposures: {}, conversions: {} };
    });
    persist();
    log('user reset', state.userId);
  }

  function exportData() {
    return {
      config: CONFIG,
      userId: state.userId,
      experiments: registry,
      state: state.experiments,
      flags: flagState.flags,
      overrides: overrides,
      summaries: summarizeAll(),
      exportedAt: now()
    };
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  var API = {
    // experiments
    define: defineExperiment,
    getVariant: getVariant,
    assign: function (id) { var v = assign(id); return v ? v.id : null; },
    exposure: trackExposure,
    convert: trackConversion,

    // results
    summary: summarize,
    summaryAll: summarizeAll,
    dashboard: renderDashboard,

    // overrides
    override: setOverride,
    clearOverrides: clearOverrides,

    // flags
    setFlag: setFlag,
    getFlag: getFlag,
    flags: listFlags,
    flagFromExperiment: flagFromExperiment,

    // util
    config: CONFIG,
    reset: resetUser,
    "export": exportData,
    userId: function () { return state.userId; },
    registry: function () { return registry; },

    // stats helper (expuesta por si la app la necesita)
    stats: { zTestTwoProportions: zTestTwoProportions, normalCdf: normalCdf }
  };

  global.ABTestingAPI = API;
  log('volvix-ab-testing-wiring ready, user=', state.userId);

  // ---------------------------------------------------------------------------
  // EXPERIMENTS POR DEFECTO (Volvix POS)
  // ---------------------------------------------------------------------------
  try {
    defineExperiment({
      id: 'checkout_button_color',
      label: 'Color del boton de cobrar',
      variants: [
        { id: 'control_blue', label: 'Azul', weight: 50 },
        { id: 'variant_green', label: 'Verde', weight: 50 }
      ]
    });

    defineExperiment({
      id: 'pos_layout',
      label: 'Layout de POS',
      variants: [
        { id: 'classic', label: 'Clasico', weight: 80 },
        { id: 'compact', label: 'Compacto', weight: 20 }
      ]
    });

    defineExperiment({
      id: 'receipt_upsell',
      label: 'Upsell en ticket',
      variants: [
        { id: 'off', label: 'Sin upsell', weight: 1 },
        { id: 'discount', label: 'Cupon -10%', weight: 1 },
        { id: 'loyalty', label: 'Promo lealtad', weight: 1 }
      ]
    });

    // Feature flags base
    if (!flagState.flags.hasOwnProperty('new_dashboard')) setFlag('new_dashboard', false);
    if (!flagState.flags.hasOwnProperty('inventory_v2')) setFlag('inventory_v2', false);
    if (!flagState.flags.hasOwnProperty('ai_assistant')) setFlag('ai_assistant', true);
  } catch (e) {
    warn('default experiments error', e);
  }

  // Auto-trigger dashboard via querystring ?abdash=1
  // 2026-05-07 cleanup: FAB/dashboard flotante adicionalmente gateado por
  // feature flag. Para re-habilitar: window.VOLVIX_ABTEST_DASHBOARD_FAB = true.
  try {
    if (global.VOLVIX_ABTEST_DASHBOARD_FAB === true &&
        global.location && /[?&]abdash=1/.test(global.location.search)) {
      global.addEventListener && global.addEventListener('load', function () {
        var div = global.document.createElement('div');
        div.id = 'volvix-abtest-dashboard';
        div.style.cssText = 'position:fixed;bottom:0;right:0;z-index:99999;background:#fff;border:2px solid #333;padding:8px;max-height:60vh;overflow:auto';
        global.document.body.appendChild(div);
        renderDashboard(div);
      });
    }
  } catch (e) {}

})(typeof window !== 'undefined' ? window : this);
