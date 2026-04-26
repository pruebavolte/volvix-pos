/**
 * volvix-anomaly-wiring.js
 * Agent-71 R9 - Volvix POS Anomaly Detection Engine
 *
 * Detecta:
 *  - Ventas inusuales por z-score sobre histórico
 *  - Patrones sospechosos (refunds repetidos, voids encadenados, ticket promedio anómalo)
 *  - Posible fraude (mismo cajero + mismo cliente + reembolsos seguidos)
 *  - Picos / valles de actividad
 *
 * Expone: window.AnomalyAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // Configuración por defecto
  // ─────────────────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    zScoreThreshold: 2.5,           // |z| > 2.5 = anomalía estadística
    extremeZThreshold: 4.0,         // |z| > 4 = crítico
    minSampleSize: 10,              // Necesitamos al menos N ventas para calcular z
    refundWindowMinutes: 30,        // Ventana para detectar refunds en ráfaga
    maxRefundsPerWindow: 3,         // > 3 refunds en 30 min = sospechoso
    voidWindowMinutes: 15,
    maxVoidsPerWindow: 4,
    duplicateAmountWindowMinutes: 5,
    highValueMultiplier: 5,         // venta > 5x promedio = alerta
    nightHourStart: 23,             // operaciones entre 23-05 son sospechosas
    nightHourEnd: 5,
    sameCustomerRefundLimit: 2,     // mismo cliente con 2+ refunds/día
    enableAutoAlert: true,
    historyMaxSize: 5000
  };

  // ─────────────────────────────────────────────────────────────────────
  // Estado interno
  // ─────────────────────────────────────────────────────────────────────
  const state = {
    config: { ...DEFAULT_CONFIG },
    sales: [],          // {id, amount, ts, cashier, customer, items, type}
    refunds: [],
    voids: [],
    alerts: [],
    listeners: [],
    stats: {
      mean: 0,
      std: 0,
      median: 0,
      n: 0,
      lastComputed: 0
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Utilidades estadísticas
  // ─────────────────────────────────────────────────────────────────────
  function mean(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function stdDev(arr, mu) {
    if (arr.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - mu;
      s += d * d;
    }
    return Math.sqrt(s / (arr.length - 1));
  }

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function zScore(value, mu, sigma) {
    if (sigma === 0) return 0;
    return (value - mu) / sigma;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  function recomputeStats() {
    const amounts = state.sales.map(s => s.amount);
    const mu = mean(amounts);
    state.stats = {
      mean: mu,
      std: stdDev(amounts, mu),
      median: median(amounts),
      p95: percentile(amounts, 95),
      p99: percentile(amounts, 99),
      n: amounts.length,
      lastComputed: Date.now()
    };
    return state.stats;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Sistema de alertas
  // ─────────────────────────────────────────────────────────────────────
  function emitAlert(alert) {
    const enriched = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      ...alert
    };
    state.alerts.push(enriched);
    if (state.alerts.length > 500) state.alerts.shift();

    state.listeners.forEach(fn => {
      try { fn(enriched); } catch (e) { console.error('[Anomaly] listener error', e); }
    });

    if (state.config.enableAutoAlert && global.console) {
      const tag = '[Anomaly:' + enriched.severity + ']';
      console.warn(tag, enriched.type, '-', enriched.message);
    }
    return enriched;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Detectores
  // ─────────────────────────────────────────────────────────────────────
  function detectZScoreAnomaly(sale) {
    if (state.stats.n < state.config.minSampleSize) return null;
    const z = zScore(sale.amount, state.stats.mean, state.stats.std);
    const abs = Math.abs(z);

    if (abs > state.config.extremeZThreshold) {
      return emitAlert({
        type: 'EXTREME_ZSCORE',
        severity: 'CRITICAL',
        saleId: sale.id,
        amount: sale.amount,
        zScore: z,
        message: `Venta extremadamente atípica: $${sale.amount} (z=${z.toFixed(2)})`
      });
    }
    if (abs > state.config.zScoreThreshold) {
      return emitAlert({
        type: 'ZSCORE_ANOMALY',
        severity: 'WARNING',
        saleId: sale.id,
        amount: sale.amount,
        zScore: z,
        message: `Venta atípica: $${sale.amount} (z=${z.toFixed(2)}, media=$${state.stats.mean.toFixed(2)})`
      });
    }
    return null;
  }

  function detectHighValue(sale) {
    if (state.stats.n < state.config.minSampleSize) return null;
    if (sale.amount > state.stats.mean * state.config.highValueMultiplier) {
      return emitAlert({
        type: 'HIGH_VALUE_SALE',
        severity: 'WARNING',
        saleId: sale.id,
        amount: sale.amount,
        ratio: sale.amount / state.stats.mean,
        message: `Venta muy alta vs promedio: $${sale.amount} (${(sale.amount / state.stats.mean).toFixed(1)}x)`
      });
    }
    return null;
  }

  function detectNightOperation(sale) {
    const h = new Date(sale.ts).getHours();
    const ns = state.config.nightHourStart;
    const ne = state.config.nightHourEnd;
    const isNight = ns < ne ? (h >= ns && h < ne) : (h >= ns || h < ne);
    if (isNight) {
      return emitAlert({
        type: 'NIGHT_OPERATION',
        severity: 'INFO',
        saleId: sale.id,
        hour: h,
        cashier: sale.cashier,
        message: `Operación fuera de horario: ${h}:00 cajero=${sale.cashier || 'N/A'}`
      });
    }
    return null;
  }

  function detectRefundBurst(refund) {
    const cutoff = Date.now() - state.config.refundWindowMinutes * 60000;
    const recent = state.refunds.filter(r =>
      r.ts >= cutoff && r.cashier === refund.cashier
    );
    if (recent.length > state.config.maxRefundsPerWindow) {
      return emitAlert({
        type: 'REFUND_BURST',
        severity: 'CRITICAL',
        cashier: refund.cashier,
        count: recent.length,
        windowMin: state.config.refundWindowMinutes,
        message: `Posible fraude: ${recent.length} refunds del cajero ${refund.cashier} en ${state.config.refundWindowMinutes} min`
      });
    }
    return null;
  }

  function detectVoidPattern(voidOp) {
    const cutoff = Date.now() - state.config.voidWindowMinutes * 60000;
    const recent = state.voids.filter(v =>
      v.ts >= cutoff && v.cashier === voidOp.cashier
    );
    if (recent.length > state.config.maxVoidsPerWindow) {
      return emitAlert({
        type: 'VOID_PATTERN',
        severity: 'CRITICAL',
        cashier: voidOp.cashier,
        count: recent.length,
        message: `Patrón sospechoso de voids: ${recent.length} en ${state.config.voidWindowMinutes} min por cajero ${voidOp.cashier}`
      });
    }
    return null;
  }

  function detectDuplicateAmount(sale) {
    const cutoff = Date.now() - state.config.duplicateAmountWindowMinutes * 60000;
    const dup = state.sales.filter(s =>
      s.id !== sale.id &&
      s.ts >= cutoff &&
      s.amount === sale.amount &&
      s.cashier === sale.cashier
    );
    if (dup.length >= 2) {
      return emitAlert({
        type: 'DUPLICATE_AMOUNT',
        severity: 'WARNING',
        cashier: sale.cashier,
        amount: sale.amount,
        count: dup.length + 1,
        message: `Cobros duplicados: ${dup.length + 1} ventas de $${sale.amount} por cajero ${sale.cashier}`
      });
    }
    return null;
  }

  function detectSameCustomerRefunds(refund) {
    if (!refund.customer) return null;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const same = state.refunds.filter(r =>
      r.customer === refund.customer && r.ts >= todayStart
    );
    if (same.length >= state.config.sameCustomerRefundLimit) {
      return emitAlert({
        type: 'CUSTOMER_REFUND_PATTERN',
        severity: 'CRITICAL',
        customer: refund.customer,
        count: same.length,
        message: `Cliente ${refund.customer} con ${same.length} refunds hoy - posible fraude`
      });
    }
    return null;
  }

  function detectCashierCustomerCollusion(refund) {
    if (!refund.customer || !refund.cashier) return null;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const pair = state.refunds.filter(r =>
      r.customer === refund.customer &&
      r.cashier === refund.cashier &&
      r.ts >= todayStart
    );
    if (pair.length >= 2) {
      return emitAlert({
        type: 'COLLUSION_SUSPECTED',
        severity: 'CRITICAL',
        cashier: refund.cashier,
        customer: refund.customer,
        count: pair.length,
        message: `Posible colusión: cajero ${refund.cashier} + cliente ${refund.customer} con ${pair.length} refunds`
      });
    }
    return null;
  }

  function runAllSaleDetectors(sale) {
    const out = [];
    [detectZScoreAnomaly, detectHighValue, detectNightOperation, detectDuplicateAmount]
      .forEach(d => { const r = d(sale); if (r) out.push(r); });
    return out;
  }

  function runAllRefundDetectors(refund) {
    const out = [];
    [detectRefundBurst, detectSameCustomerRefunds, detectCashierCustomerCollusion]
      .forEach(d => { const r = d(refund); if (r) out.push(r); });
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Ingesta de eventos
  // ─────────────────────────────────────────────────────────────────────
  function pushSale(sale) {
    if (!sale || typeof sale.amount !== 'number') {
      throw new Error('[Anomaly] sale inválida: requiere {amount:number}');
    }
    const normalized = {
      id: sale.id || 'sale_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      amount: sale.amount,
      ts: sale.ts || Date.now(),
      cashier: sale.cashier || null,
      customer: sale.customer || null,
      items: sale.items || [],
      type: sale.type || 'SALE'
    };
    state.sales.push(normalized);
    if (state.sales.length > state.config.historyMaxSize) state.sales.shift();
    recomputeStats();
    const alerts = runAllSaleDetectors(normalized);
    return { sale: normalized, alerts };
  }

  function pushRefund(refund) {
    const normalized = {
      id: refund.id || 'ref_' + Date.now(),
      amount: refund.amount || 0,
      ts: refund.ts || Date.now(),
      cashier: refund.cashier || null,
      customer: refund.customer || null,
      reason: refund.reason || null,
      originalSaleId: refund.originalSaleId || null
    };
    state.refunds.push(normalized);
    if (state.refunds.length > state.config.historyMaxSize) state.refunds.shift();
    const alerts = runAllRefundDetectors(normalized);
    return { refund: normalized, alerts };
  }

  function pushVoid(voidOp) {
    const normalized = {
      id: voidOp.id || 'void_' + Date.now(),
      amount: voidOp.amount || 0,
      ts: voidOp.ts || Date.now(),
      cashier: voidOp.cashier || null,
      reason: voidOp.reason || null
    };
    state.voids.push(normalized);
    if (state.voids.length > state.config.historyMaxSize) state.voids.shift();
    const alert = detectVoidPattern(normalized);
    return { void: normalized, alerts: alert ? [alert] : [] };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reportes
  // ─────────────────────────────────────────────────────────────────────
  function getReport() {
    recomputeStats();
    const bySeverity = state.alerts.reduce((acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    }, {});
    const byType = state.alerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    return {
      generatedAt: new Date().toISOString(),
      sales: { count: state.sales.length, ...state.stats },
      refunds: { count: state.refunds.length },
      voids: { count: state.voids.length },
      alerts: {
        total: state.alerts.length,
        bySeverity,
        byType,
        recent: state.alerts.slice(-20)
      }
    };
  }

  function getCriticalAlerts() {
    return state.alerts.filter(a => a.severity === 'CRITICAL');
  }

  function clearHistory() {
    state.sales = [];
    state.refunds = [];
    state.voids = [];
    state.alerts = [];
    recomputeStats();
  }

  function onAlert(fn) {
    if (typeof fn !== 'function') throw new Error('listener debe ser función');
    state.listeners.push(fn);
    return () => {
      const i = state.listeners.indexOf(fn);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  function configure(partial) {
    state.config = { ...state.config, ...(partial || {}) };
    return { ...state.config };
  }

  // ─────────────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────────────
  const AnomalyAPI = {
    version: '1.0.0',
    pushSale,
    pushRefund,
    pushVoid,
    getReport,
    getCriticalAlerts,
    getAllAlerts: () => state.alerts.slice(),
    getStats: () => ({ ...state.stats }),
    onAlert,
    configure,
    getConfig: () => ({ ...state.config }),
    clearHistory,
    // Acceso a detectores individuales (útil para testing / batch)
    detectors: {
      zscore: detectZScoreAnomaly,
      highValue: detectHighValue,
      night: detectNightOperation,
      refundBurst: detectRefundBurst,
      voidPattern: detectVoidPattern,
      duplicate: detectDuplicateAmount,
      customerRefunds: detectSameCustomerRefunds,
      collusion: detectCashierCustomerCollusion
    },
    // utils estadísticos expuestos
    util: { mean, stdDev, median, zScore, percentile }
  };

  global.AnomalyAPI = AnomalyAPI;

  if (global.console) {
    console.log('[Volvix Anomaly] v' + AnomalyAPI.version + ' wired - window.AnomalyAPI listo');
  }
})(typeof window !== 'undefined' ? window : globalThis);
