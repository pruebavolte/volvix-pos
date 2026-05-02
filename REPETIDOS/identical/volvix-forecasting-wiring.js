/**
 * volvix-forecasting-wiring.js
 * Agent-70 R9 Volvix - Advanced Forecasting Module
 * Time-series prediction, seasonal patterns, demand planning
 * Exposes: window.ForecastAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // Utility / Math helpers
  // ============================================================
  const Util = {
    mean(arr) {
      if (!arr.length) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    },
    variance(arr) {
      if (arr.length < 2) return 0;
      const m = Util.mean(arr);
      return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    },
    stddev(arr) {
      return Math.sqrt(Util.variance(arr));
    },
    sum(arr) {
      return arr.reduce((a, b) => a + b, 0);
    },
    clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    },
    round(v, decimals = 2) {
      const f = Math.pow(10, decimals);
      return Math.round(v * f) / f;
    },
    range(n) {
      return Array.from({ length: n }, (_, i) => i);
    },
    last(arr, n = 1) {
      return arr.slice(Math.max(0, arr.length - n));
    },
    isNumberArray(a) {
      return Array.isArray(a) && a.every((x) => typeof x === 'number' && !isNaN(x));
    },
  };

  // ============================================================
  // Time-series transformations
  // ============================================================
  const Series = {
    diff(arr, lag = 1) {
      const out = [];
      for (let i = lag; i < arr.length; i++) out.push(arr[i] - arr[i - lag]);
      return out;
    },
    cumulative(arr) {
      const out = [];
      let acc = 0;
      for (const v of arr) {
        acc += v;
        out.push(acc);
      }
      return out;
    },
    normalize(arr) {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const span = max - min || 1;
      return arr.map((v) => (v - min) / span);
    },
    detrend(arr) {
      const n = arr.length;
      const xs = Util.range(n);
      const xMean = Util.mean(xs);
      const yMean = Util.mean(arr);
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (arr[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = yMean - slope * xMean;
      return arr.map((v, i) => v - (slope * i + intercept));
    },
  };

  // ============================================================
  // Forecasting models
  // ============================================================
  const Models = {
    // ---- Simple Moving Average ----
    movingAverage(data, window = 3, horizon = 1) {
      if (!Util.isNumberArray(data) || data.length < window) {
        throw new Error('movingAverage: insufficient data');
      }
      const series = data.slice();
      const forecast = [];
      for (let h = 0; h < horizon; h++) {
        const win = series.slice(series.length - window);
        const next = Util.mean(win);
        forecast.push(next);
        series.push(next);
      }
      return {
        model: 'moving_average',
        window,
        horizon,
        forecast: forecast.map((v) => Util.round(v, 4)),
        lastValues: Util.last(data, window),
      };
    },

    // ---- Weighted Moving Average ----
    weightedMovingAverage(data, weights, horizon = 1) {
      if (!Util.isNumberArray(data) || data.length < weights.length) {
        throw new Error('weightedMovingAverage: insufficient data');
      }
      const wSum = Util.sum(weights);
      const series = data.slice();
      const forecast = [];
      for (let h = 0; h < horizon; h++) {
        const win = series.slice(series.length - weights.length);
        let acc = 0;
        for (let i = 0; i < weights.length; i++) acc += win[i] * weights[i];
        const next = acc / wSum;
        forecast.push(next);
        series.push(next);
      }
      return {
        model: 'weighted_moving_average',
        weights,
        horizon,
        forecast: forecast.map((v) => Util.round(v, 4)),
      };
    },

    // ---- Simple Exponential Smoothing ----
    exponentialSmoothing(data, alpha = 0.3, horizon = 1) {
      if (!Util.isNumberArray(data) || data.length < 2) {
        throw new Error('exponentialSmoothing: insufficient data');
      }
      const a = Util.clamp(alpha, 0.01, 0.99);
      let level = data[0];
      const fitted = [level];
      for (let i = 1; i < data.length; i++) {
        level = a * data[i] + (1 - a) * level;
        fitted.push(level);
      }
      const forecast = [];
      for (let h = 0; h < horizon; h++) forecast.push(level);
      return {
        model: 'exponential_smoothing',
        alpha: a,
        horizon,
        fitted: fitted.map((v) => Util.round(v, 4)),
        forecast: forecast.map((v) => Util.round(v, 4)),
      };
    },

    // ---- Holt linear trend ----
    holtLinear(data, alpha = 0.3, beta = 0.1, horizon = 1) {
      if (!Util.isNumberArray(data) || data.length < 3) {
        throw new Error('holtLinear: insufficient data');
      }
      const a = Util.clamp(alpha, 0.01, 0.99);
      const b = Util.clamp(beta, 0.01, 0.99);
      let level = data[0];
      let trend = data[1] - data[0];
      for (let i = 1; i < data.length; i++) {
        const prevLevel = level;
        level = a * data[i] + (1 - a) * (prevLevel + trend);
        trend = b * (level - prevLevel) + (1 - b) * trend;
      }
      const forecast = [];
      for (let h = 1; h <= horizon; h++) forecast.push(level + h * trend);
      return {
        model: 'holt_linear',
        alpha: a,
        beta: b,
        horizon,
        level: Util.round(level, 4),
        trend: Util.round(trend, 4),
        forecast: forecast.map((v) => Util.round(v, 4)),
      };
    },

    // ---- Holt-Winters additive (seasonal) ----
    holtWinters(data, period = 7, alpha = 0.3, beta = 0.1, gamma = 0.2, horizon = 7) {
      if (!Util.isNumberArray(data) || data.length < period * 2) {
        throw new Error('holtWinters: need at least 2 full seasonal periods');
      }
      const a = Util.clamp(alpha, 0.01, 0.99);
      const b = Util.clamp(beta, 0.01, 0.99);
      const g = Util.clamp(gamma, 0.01, 0.99);

      // Initialize seasonal components (additive)
      const seasons = new Array(period).fill(0);
      const firstCycle = data.slice(0, period);
      const secondCycle = data.slice(period, 2 * period);
      const cycleMean1 = Util.mean(firstCycle);
      for (let i = 0; i < period; i++) {
        seasons[i] = firstCycle[i] - cycleMean1;
      }
      let level = cycleMean1;
      let trend = (Util.mean(secondCycle) - cycleMean1) / period;

      for (let i = 0; i < data.length; i++) {
        const s = i % period;
        const prevLevel = level;
        level = a * (data[i] - seasons[s]) + (1 - a) * (prevLevel + trend);
        trend = b * (level - prevLevel) + (1 - b) * trend;
        seasons[s] = g * (data[i] - level) + (1 - g) * seasons[s];
      }

      const forecast = [];
      for (let h = 1; h <= horizon; h++) {
        const s = (data.length + h - 1) % period;
        forecast.push(level + h * trend + seasons[s]);
      }
      return {
        model: 'holt_winters_additive',
        period,
        alpha: a,
        beta: b,
        gamma: g,
        horizon,
        level: Util.round(level, 4),
        trend: Util.round(trend, 4),
        seasons: seasons.map((v) => Util.round(v, 4)),
        forecast: forecast.map((v) => Util.round(v, 4)),
      };
    },

    // ---- ARIMA mock (AR(1) + I(d) + MA(1)) ----
    arimaMock(data, p = 1, d = 1, q = 1, horizon = 5) {
      if (!Util.isNumberArray(data) || data.length < 5) {
        throw new Error('arimaMock: insufficient data');
      }
      // Difference d times
      let diffed = data.slice();
      const lastVals = [];
      for (let i = 0; i < d; i++) {
        lastVals.push(diffed[diffed.length - 1]);
        diffed = Series.diff(diffed, 1);
      }
      // Estimate AR(1) coefficient via lag-1 autocorrelation
      const m = Util.mean(diffed);
      let num = 0;
      let den = 0;
      for (let i = 1; i < diffed.length; i++) {
        num += (diffed[i] - m) * (diffed[i - 1] - m);
        den += (diffed[i - 1] - m) ** 2;
      }
      const phi = den === 0 ? 0 : Util.clamp(num / den, -0.95, 0.95);

      // Residuals from AR(1)
      const residuals = [0];
      for (let i = 1; i < diffed.length; i++) {
        const pred = m + phi * (diffed[i - 1] - m);
        residuals.push(diffed[i] - pred);
      }
      // Estimate MA(1) theta via lag-1 autocorr of residuals
      let rNum = 0;
      let rDen = 0;
      const rMean = Util.mean(residuals);
      for (let i = 1; i < residuals.length; i++) {
        rNum += (residuals[i] - rMean) * (residuals[i - 1] - rMean);
        rDen += (residuals[i - 1] - rMean) ** 2;
      }
      const theta = rDen === 0 ? 0 : Util.clamp(rNum / rDen, -0.95, 0.95);

      // Forecast in differenced space
      const dForecast = [];
      let lastDiff = diffed[diffed.length - 1];
      let lastResid = residuals[residuals.length - 1];
      for (let h = 0; h < horizon; h++) {
        const next = m + phi * (lastDiff - m) + theta * lastResid;
        dForecast.push(next);
        lastDiff = next;
        lastResid = 0; // residuals decay to 0 in forecast
      }

      // Integrate back d times
      let integrated = dForecast.slice();
      for (let i = d - 1; i >= 0; i--) {
        let acc = lastVals[i];
        integrated = integrated.map((v) => (acc += v));
      }

      return {
        model: 'arima_mock',
        order: { p, d, q },
        phi: Util.round(phi, 4),
        theta: Util.round(theta, 4),
        horizon,
        forecast: integrated.map((v) => Util.round(v, 4)),
      };
    },

    // ---- Linear regression forecast ----
    linearRegression(data, horizon = 1) {
      if (!Util.isNumberArray(data) || data.length < 2) {
        throw new Error('linearRegression: insufficient data');
      }
      const n = data.length;
      const xs = Util.range(n);
      const xMean = Util.mean(xs);
      const yMean = Util.mean(data);
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (data[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = yMean - slope * xMean;
      const forecast = [];
      for (let h = 1; h <= horizon; h++) {
        forecast.push(intercept + slope * (n + h - 1));
      }
      return {
        model: 'linear_regression',
        slope: Util.round(slope, 6),
        intercept: Util.round(intercept, 4),
        horizon,
        forecast: forecast.map((v) => Util.round(v, 4)),
      };
    },
  };

  // ============================================================
  // Seasonal pattern detection
  // ============================================================
  const Seasonal = {
    detectPeriod(data, maxPeriod = 14) {
      if (!Util.isNumberArray(data) || data.length < 6) return null;
      const m = Util.mean(data);
      let bestLag = 1;
      let bestCorr = -Infinity;
      for (let lag = 2; lag <= Math.min(maxPeriod, Math.floor(data.length / 2)); lag++) {
        let num = 0;
        let den = 0;
        for (let i = lag; i < data.length; i++) {
          num += (data[i] - m) * (data[i - lag] - m);
        }
        for (let i = 0; i < data.length; i++) den += (data[i] - m) ** 2;
        const corr = den === 0 ? 0 : num / den;
        if (corr > bestCorr) {
          bestCorr = corr;
          bestLag = lag;
        }
      }
      return { period: bestLag, autocorrelation: Util.round(bestCorr, 4) };
    },

    seasonalIndices(data, period) {
      if (!Util.isNumberArray(data) || data.length < period * 2) return null;
      const buckets = Array.from({ length: period }, () => []);
      for (let i = 0; i < data.length; i++) {
        buckets[i % period].push(data[i]);
      }
      const overallMean = Util.mean(data);
      return buckets.map((b, i) => ({
        index: i,
        mean: Util.round(Util.mean(b), 4),
        ratio: Util.round(overallMean === 0 ? 1 : Util.mean(b) / overallMean, 4),
      }));
    },

    classify(autocorr) {
      if (autocorr == null) return 'unknown';
      if (autocorr > 0.7) return 'strong_seasonal';
      if (autocorr > 0.4) return 'moderate_seasonal';
      if (autocorr > 0.2) return 'weak_seasonal';
      return 'non_seasonal';
    },
  };

  // ============================================================
  // Sales forecast by category
  // ============================================================
  const SalesForecast = {
    byCategory(history, options = {}) {
      // history: { categoryName: [num, num, ...], ... }
      if (!history || typeof history !== 'object') {
        throw new Error('byCategory: history must be an object map');
      }
      const horizon = options.horizon || 7;
      const method = options.method || 'auto';
      const result = {};
      for (const cat of Object.keys(history)) {
        const series = history[cat];
        if (!Util.isNumberArray(series) || series.length < 3) {
          result[cat] = { error: 'insufficient_data', length: series ? series.length : 0 };
          continue;
        }
        try {
          let forecast;
          let chosen = method;
          if (method === 'auto') {
            if (series.length >= 14) {
              const det = Seasonal.detectPeriod(series);
              if (det && det.autocorrelation > 0.4 && series.length >= det.period * 2) {
                forecast = Models.holtWinters(series, det.period, 0.3, 0.1, 0.2, horizon);
                chosen = 'holt_winters';
              } else {
                forecast = Models.holtLinear(series, 0.3, 0.1, horizon);
                chosen = 'holt_linear';
              }
            } else if (series.length >= 5) {
              forecast = Models.exponentialSmoothing(series, 0.3, horizon);
              chosen = 'exponential_smoothing';
            } else {
              forecast = Models.movingAverage(series, Math.min(3, series.length), horizon);
              chosen = 'moving_average';
            }
          } else if (method === 'ma') {
            forecast = Models.movingAverage(series, options.window || 3, horizon);
          } else if (method === 'ses') {
            forecast = Models.exponentialSmoothing(series, options.alpha || 0.3, horizon);
          } else if (method === 'holt') {
            forecast = Models.holtLinear(series, 0.3, 0.1, horizon);
          } else if (method === 'hw') {
            forecast = Models.holtWinters(series, options.period || 7, 0.3, 0.1, 0.2, horizon);
          } else if (method === 'arima') {
            forecast = Models.arimaMock(series, 1, 1, 1, horizon);
          } else {
            forecast = Models.linearRegression(series, horizon);
          }
          const total = Util.round(Util.sum(forecast.forecast), 2);
          result[cat] = {
            method: chosen,
            forecast: forecast.forecast,
            total,
            historyLength: series.length,
            historyMean: Util.round(Util.mean(series), 4),
            historyStdDev: Util.round(Util.stddev(series), 4),
          };
        } catch (e) {
          result[cat] = { error: e.message };
        }
      }
      return {
        horizon,
        generatedAt: new Date().toISOString(),
        categories: result,
        grandTotal: Util.round(
          Object.values(result).reduce((s, r) => s + (r.total || 0), 0),
          2
        ),
      };
    },

    confidenceInterval(forecastValues, history, z = 1.96) {
      if (!Util.isNumberArray(forecastValues) || !Util.isNumberArray(history)) {
        throw new Error('confidenceInterval: invalid inputs');
      }
      const sd = Util.stddev(history);
      return forecastValues.map((v, i) => {
        // widen with sqrt(h) horizon
        const margin = z * sd * Math.sqrt(i + 1);
        return {
          point: Util.round(v, 4),
          lower: Util.round(v - margin, 4),
          upper: Util.round(v + margin, 4),
        };
      });
    },
  };

  // ============================================================
  // Demand planning
  // ============================================================
  const DemandPlanning = {
    safetyStock(history, leadTimeDays = 7, serviceLevel = 0.95) {
      if (!Util.isNumberArray(history)) throw new Error('safetyStock: bad history');
      const sd = Util.stddev(history);
      const z = DemandPlanning._zScore(serviceLevel);
      return Util.round(z * sd * Math.sqrt(leadTimeDays), 2);
    },

    reorderPoint(avgDailyDemand, leadTimeDays, safety) {
      return Util.round(avgDailyDemand * leadTimeDays + safety, 2);
    },

    economicOrderQuantity(annualDemand, orderCost, holdingCostPerUnit) {
      if (holdingCostPerUnit <= 0) throw new Error('EOQ: holding cost must be > 0');
      return Util.round(Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit), 2);
    },

    plan(history, options = {}) {
      const leadTime = options.leadTimeDays || 7;
      const serviceLevel = options.serviceLevel || 0.95;
      const horizon = options.horizon || 30;
      const orderCost = options.orderCost || 50;
      const holdingCost = options.holdingCostPerUnit || 1;

      const fc = Models.holtLinear(history, 0.3, 0.1, horizon);
      const projectedDemand = Util.sum(fc.forecast);
      const avgDaily = Util.mean(history);
      const safety = DemandPlanning.safetyStock(history, leadTime, serviceLevel);
      const reorder = DemandPlanning.reorderPoint(avgDaily, leadTime, safety);
      const annualEstimate = avgDaily * 365;
      const eoq = DemandPlanning.economicOrderQuantity(annualEstimate, orderCost, holdingCost);

      return {
        horizon,
        leadTimeDays: leadTime,
        serviceLevel,
        avgDailyDemand: Util.round(avgDaily, 2),
        projectedDemand: Util.round(projectedDemand, 2),
        safetyStock: safety,
        reorderPoint: reorder,
        economicOrderQuantity: eoq,
        forecast: fc.forecast,
      };
    },

    _zScore(level) {
      const table = {
        0.8: 0.84,
        0.85: 1.04,
        0.9: 1.28,
        0.95: 1.65,
        0.97: 1.88,
        0.99: 2.33,
      };
      const keys = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b);
      let best = keys[0];
      let diff = Math.abs(level - best);
      for (const k of keys) {
        const d = Math.abs(level - k);
        if (d < diff) {
          diff = d;
          best = k;
        }
      }
      return table[best];
    },
  };

  // ============================================================
  // Accuracy metrics
  // ============================================================
  const Metrics = {
    mae(actual, predicted) {
      const n = Math.min(actual.length, predicted.length);
      if (!n) return 0;
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.abs(actual[i] - predicted[i]);
      return Util.round(s / n, 4);
    },
    rmse(actual, predicted) {
      const n = Math.min(actual.length, predicted.length);
      if (!n) return 0;
      let s = 0;
      for (let i = 0; i < n; i++) s += (actual[i] - predicted[i]) ** 2;
      return Util.round(Math.sqrt(s / n), 4);
    },
    mape(actual, predicted) {
      const n = Math.min(actual.length, predicted.length);
      if (!n) return 0;
      let s = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (actual[i] !== 0) {
          s += Math.abs((actual[i] - predicted[i]) / actual[i]);
          count++;
        }
      }
      return count ? Util.round((s / count) * 100, 2) : 0;
    },
    backtest(data, model, params = {}) {
      // last 20% as holdout
      const split = Math.floor(data.length * 0.8);
      const train = data.slice(0, split);
      const test = data.slice(split);
      let result;
      const horizon = test.length;
      if (model === 'ma') result = Models.movingAverage(train, params.window || 3, horizon);
      else if (model === 'ses') result = Models.exponentialSmoothing(train, params.alpha || 0.3, horizon);
      else if (model === 'holt') result = Models.holtLinear(train, 0.3, 0.1, horizon);
      else if (model === 'arima') result = Models.arimaMock(train, 1, 1, 1, horizon);
      else result = Models.linearRegression(train, horizon);
      return {
        model,
        mae: Metrics.mae(test, result.forecast),
        rmse: Metrics.rmse(test, result.forecast),
        mape: Metrics.mape(test, result.forecast),
        actual: test,
        predicted: result.forecast,
      };
    },
  };

  // ============================================================
  // Public API
  // ============================================================
  const ForecastAPI = {
    version: '1.0.0',
    agent: 'Agent-70 R9 Volvix',
    util: Util,
    series: Series,
    models: Models,
    seasonal: Seasonal,
    sales: SalesForecast,
    demand: DemandPlanning,
    metrics: Metrics,

    forecast(data, opts = {}) {
      const method = opts.method || 'auto';
      const horizon = opts.horizon || 7;
      if (method === 'auto') {
        if (data.length >= 14) {
          const det = Seasonal.detectPeriod(data);
          if (det && det.autocorrelation > 0.4 && data.length >= det.period * 2) {
            return Models.holtWinters(data, det.period, 0.3, 0.1, 0.2, horizon);
          }
          return Models.holtLinear(data, 0.3, 0.1, horizon);
        }
        return Models.exponentialSmoothing(data, 0.3, horizon);
      }
      if (method === 'ma') return Models.movingAverage(data, opts.window || 3, horizon);
      if (method === 'wma') return Models.weightedMovingAverage(data, opts.weights || [1, 2, 3], horizon);
      if (method === 'ses') return Models.exponentialSmoothing(data, opts.alpha || 0.3, horizon);
      if (method === 'holt') return Models.holtLinear(data, opts.alpha || 0.3, opts.beta || 0.1, horizon);
      if (method === 'hw')
        return Models.holtWinters(
          data,
          opts.period || 7,
          opts.alpha || 0.3,
          opts.beta || 0.1,
          opts.gamma || 0.2,
          horizon
        );
      if (method === 'arima') return Models.arimaMock(data, opts.p || 1, opts.d || 1, opts.q || 1, horizon);
      if (method === 'linear') return Models.linearRegression(data, horizon);
      throw new Error('Unknown method: ' + method);
    },

    analyzeSeasonality(data, maxPeriod = 14) {
      const det = Seasonal.detectPeriod(data, maxPeriod);
      if (!det) return { classification: 'unknown' };
      const indices = data.length >= det.period * 2 ? Seasonal.seasonalIndices(data, det.period) : null;
      return {
        ...det,
        classification: Seasonal.classify(det.autocorrelation),
        seasonalIndices: indices,
      };
    },

    selfTest() {
      const data = [10, 12, 11, 14, 16, 15, 18, 20, 19, 22, 24, 23, 26, 28];
      const out = {};
      try {
        out.movingAverage = Models.movingAverage(data, 3, 3);
        out.ses = Models.exponentialSmoothing(data, 0.3, 3);
        out.holt = Models.holtLinear(data, 0.3, 0.1, 3);
        out.linear = Models.linearRegression(data, 3);
        out.arima = Models.arimaMock(data, 1, 1, 1, 3);
        out.seasonality = ForecastAPI.analyzeSeasonality(data);
        out.backtestHolt = Metrics.backtest(data, 'holt');
        out.ok = true;
      } catch (e) {
        out.ok = false;
        out.error = e.message;
      }
      return out;
    },
  };

  global.ForecastAPI = ForecastAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ForecastAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
