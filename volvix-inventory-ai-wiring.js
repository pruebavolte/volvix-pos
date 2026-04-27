/**
 * volvix-inventory-ai-wiring.js
 * Agent-46 — Ronda 8 Fibonacci
 * Inventory Forecasting con AI para Volvix POS
 *
 * Capabilities:
 *  - Predicción de agotamiento de stock (days-to-stockout)
 *  - Reorden óptima (EOQ + safety stock)
 *  - Detección de slow-moving
 *  - Análisis ABC (Pareto 80/20)
 *  - Estacionalidad (semanal / mensual)
 *  - Alertas predictivas
 *  - Carga desde /api/sales y /api/inventory
 *  - Charts de tendencias (canvas-based)
 *  - window.InventoryAIAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────
  // CONFIG
  // ───────────────────────────────────────────────────────────
  const CFG = {
    SALES_ENDPOINT: '/api/sales',
    INVENTORY_ENDPOINT: '/api/inventory',
    REORDER_ENDPOINT: '/api/reorder',
    HISTORY_DAYS: 90,
    SLOW_MOVING_DAYS: 30,
    SAFETY_STOCK_Z: 1.65,        // 95% service level
    LEAD_TIME_DAYS: 7,
    HOLDING_COST_RATE: 0.25,
    ORDER_COST: 50,
    ABC_A_THRESHOLD: 0.80,
    ABC_B_THRESHOLD: 0.95,
    SEASONAL_PERIOD: 7,
    ALERT_DAYS_AHEAD: 5,
    CACHE_TTL_MS: 5 * 60 * 1000,
    DEBUG: true,
  };

  const log = (...a) => CFG.DEBUG && console.log('[InventoryAI]', ...a);
  const warn = (...a) => console.warn('[InventoryAI]', ...a);
  const err = (...a) => console.error('[InventoryAI]', ...a);

  // ───────────────────────────────────────────────────────────
  // CACHE
  // ───────────────────────────────────────────────────────────
  const cache = new Map();
  function cacheGet(key) {
    const e = cache.get(key);
    if (!e) return null;
    if (Date.now() - e.t > CFG.CACHE_TTL_MS) { cache.delete(key); return null; }
    return e.v;
  }
  function cacheSet(key, v) { cache.set(key, { t: Date.now(), v }); }

  // ───────────────────────────────────────────────────────────
  // FETCH HELPERS
  // ───────────────────────────────────────────────────────────
  async function fetchJSON(url, opts = {}) {
    const cached = cacheGet(url);
    if (cached && !opts.nocache) return cached;
    try {
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }, ...opts });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      cacheSet(url, j);
      return j;
    } catch (e) {
      warn('fetchJSON fallo', url, e.message);
      return null;
    }
  }

  async function loadSales(days = CFG.HISTORY_DAYS) {
    const url = `${CFG.SALES_ENDPOINT}?days=${encodeURIComponent(days)}`;
    const data = await fetchJSON(url);
    if (!data) return generateMockSales(days);
    return Array.isArray(data) ? data : (data.sales || []);
  }

  async function loadInventory() {
    const data = await fetchJSON(CFG.INVENTORY_ENDPOINT);
    if (!data) return generateMockInventory();
    return Array.isArray(data) ? data : (data.items || []);
  }

  // ───────────────────────────────────────────────────────────
  // MOCK DATA (fallback offline)
  // ───────────────────────────────────────────────────────────
  function generateMockSales(days) {
    const skus = ['SKU-001','SKU-002','SKU-003','SKU-004','SKU-005','SKU-006','SKU-007','SKU-008'];
    const out = [];
    const now = Date.now();
    for (let d = days; d >= 0; d--) {
      const ts = now - d * 86400000;
      skus.forEach((sku, i) => {
        const base = (8 - i) * 2;
        const seasonal = Math.sin((d / 7) * Math.PI) * 3;
        const noise = (Math.random() - 0.5) * 4;
        const qty = Math.max(0, Math.round(base + seasonal + noise));
        if (qty > 0) {
          out.push({
            sku, qty,
            price: 10 + i * 5,
            timestamp: ts,
            date: new Date(ts).toISOString().slice(0, 10),
          });
        }
      });
    }
    return out;
  }

  function generateMockInventory() {
    return [
      { sku: 'SKU-001', name: 'Café Premium', stock: 45, cost: 6, reorder_point: 20 },
      { sku: 'SKU-002', name: 'Azúcar 1kg', stock: 12, cost: 3, reorder_point: 15 },
      { sku: 'SKU-003', name: 'Leche Entera', stock: 80, cost: 4, reorder_point: 30 },
      { sku: 'SKU-004', name: 'Pan Integral', stock: 5, cost: 2, reorder_point: 10 },
      { sku: 'SKU-005', name: 'Agua 600ml', stock: 200, cost: 1, reorder_point: 50 },
      { sku: 'SKU-006', name: 'Galletas', stock: 30, cost: 3, reorder_point: 20 },
      { sku: 'SKU-007', name: 'Cereal Caja', stock: 8, cost: 8, reorder_point: 12 },
      { sku: 'SKU-008', name: 'Yogur Pack', stock: 22, cost: 5, reorder_point: 18 },
    ];
  }

  // ───────────────────────────────────────────────────────────
  // STATS UTILITIES
  // ───────────────────────────────────────────────────────────
  function mean(a) { return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0; }
  function stddev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));
  }
  function movingAverage(arr, w) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const slice = arr.slice(Math.max(0, i-w+1), i+1);
      out.push(mean(slice));
    }
    return out;
  }
  function linearTrend(arr) {
    const n = arr.length; if (n < 2) return { slope: 0, intercept: arr[0] || 0 };
    let sx=0,sy=0,sxy=0,sxx=0;
    for (let i=0;i<n;i++){ sx+=i; sy+=arr[i]; sxy+=i*arr[i]; sxx+=i*i; }
    const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx || 1);
    const intercept = (sy - slope*sx) / n;
    return { slope, intercept };
  }

  // ───────────────────────────────────────────────────────────
  // AGGREGATE: ventas por SKU por día
  // ───────────────────────────────────────────────────────────
  function aggregateBySkuDay(sales) {
    const map = new Map();
    sales.forEach(s => {
      const key = `${s.sku}|${s.date || new Date(s.timestamp).toISOString().slice(0,10)}`;
      map.set(key, (map.get(key) || 0) + (s.qty || 0));
    });
    const skus = {};
    map.forEach((qty, key) => {
      const [sku, date] = key.split('|');
      (skus[sku] = skus[sku] || []).push({ date, qty });
    });
    Object.values(skus).forEach(arr => arr.sort((a,b)=>a.date.localeCompare(b.date)));
    return skus;
  }

  // ───────────────────────────────────────────────────────────
  // 1. PREDICCIÓN DE AGOTAMIENTO
  // ───────────────────────────────────────────────────────────
  function predictStockout(skuHistory, currentStock) {
    const qtys = skuHistory.map(d => d.qty);
    const avg = mean(qtys);
    if (avg <= 0) return { days: Infinity, depletionDate: null, dailyAvg: 0 };
    const trend = linearTrend(qtys);
    const projectedDaily = Math.max(0.1, avg + trend.slope * 0.5);
    const days = Math.floor(currentStock / projectedDaily);
    const depletionDate = new Date(Date.now() + days * 86400000).toISOString().slice(0,10);
    return { days, depletionDate, dailyAvg: projectedDaily, trendSlope: trend.slope };
  }

  // ───────────────────────────────────────────────────────────
  // 2. REORDEN ÓPTIMA (EOQ)
  // ───────────────────────────────────────────────────────────
  function optimalReorder(skuHistory, item) {
    const qtys = skuHistory.map(d => d.qty);
    const dailyAvg = mean(qtys);
    const dailyStd = stddev(qtys);
    const annualDemand = dailyAvg * 365;
    const holdingCost = (item.cost || 1) * CFG.HOLDING_COST_RATE;
    const eoq = holdingCost > 0 ? Math.sqrt((2 * annualDemand * CFG.ORDER_COST) / holdingCost) : 0;
    const safetyStock = CFG.SAFETY_STOCK_Z * dailyStd * Math.sqrt(CFG.LEAD_TIME_DAYS);
    const reorderPoint = (dailyAvg * CFG.LEAD_TIME_DAYS) + safetyStock;
    return {
      eoq: Math.ceil(eoq),
      safetyStock: Math.ceil(safetyStock),
      reorderPoint: Math.ceil(reorderPoint),
      suggestedQty: Math.ceil(eoq),
      annualDemand: Math.round(annualDemand),
    };
  }

  // ───────────────────────────────────────────────────────────
  // 3. SLOW-MOVING
  // ───────────────────────────────────────────────────────────
  function detectSlowMoving(skuHistory, item) {
    const recent = skuHistory.slice(-CFG.SLOW_MOVING_DAYS);
    const totalQty = recent.reduce((s, d) => s + d.qty, 0);
    const avg = totalQty / Math.max(1, recent.length);
    const stock = item.stock || 0;
    const daysOfSupply = avg > 0 ? stock / avg : Infinity;
    const slow = daysOfSupply > 60 || avg < 0.5;
    return { slow, daysOfSupply: Math.round(daysOfSupply), recentAvg: avg.toFixed(2), totalRecent: totalQty };
  }

  // ───────────────────────────────────────────────────────────
  // 4. ANÁLISIS ABC (Pareto)
  // ───────────────────────────────────────────────────────────
  function abcAnalysis(sales, inventory) {
    const revenue = {};
    sales.forEach(s => {
      revenue[s.sku] = (revenue[s.sku] || 0) + (s.qty || 0) * (s.price || 0);
    });
    const ranked = Object.entries(revenue)
      .map(([sku, rev]) => ({ sku, revenue: rev }))
      .sort((a, b) => b.revenue - a.revenue);
    const total = ranked.reduce((s, x) => s + x.revenue, 0) || 1;
    let cumulative = 0;
    return ranked.map(r => {
      cumulative += r.revenue;
      const pct = cumulative / total;
      let cls = 'C';
      if (pct <= CFG.ABC_A_THRESHOLD) cls = 'A';
      else if (pct <= CFG.ABC_B_THRESHOLD) cls = 'B';
      const inv = inventory.find(i => i.sku === r.sku);
      return {
        sku: r.sku,
        name: inv?.name || r.sku,
        revenue: r.revenue,
        sharePct: ((r.revenue/total)*100).toFixed(2),
        cumulativePct: (pct*100).toFixed(2),
        class: cls,
      };
    });
  }

  // ───────────────────────────────────────────────────────────
  // 5. ESTACIONALIDAD
  // ───────────────────────────────────────────────────────────
  function detectSeasonality(skuHistory) {
    const period = CFG.SEASONAL_PERIOD;
    if (skuHistory.length < period * 2) return { hasSeasonality: false, pattern: [] };
    const buckets = Array.from({ length: period }, () => []);
    skuHistory.forEach((d, i) => buckets[i % period].push(d.qty));
    const pattern = buckets.map(b => mean(b));
    const overallMean = mean(pattern);
    const variance = stddev(pattern);
    const cv = overallMean > 0 ? variance / overallMean : 0;
    const peakIdx = pattern.indexOf(Math.max(...pattern));
    const lowIdx = pattern.indexOf(Math.min(...pattern));
    const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return {
      hasSeasonality: cv > 0.2,
      strength: cv.toFixed(3),
      pattern: pattern.map(v => +v.toFixed(2)),
      peakDay: dayNames[peakIdx % 7] || `idx${peakIdx}`,
      lowDay: dayNames[lowIdx % 7] || `idx${lowIdx}`,
    };
  }

  // ───────────────────────────────────────────────────────────
  // 6. ALERTAS PREDICTIVAS
  // ───────────────────────────────────────────────────────────
  function generateAlerts(report) {
    const alerts = [];
    report.items.forEach(it => {
      if (it.stockout.days <= CFG.ALERT_DAYS_AHEAD) {
        alerts.push({
          level: 'critical',
          sku: it.sku, name: it.name,
          msg: `Se agotará en ${it.stockout.days} días (${it.stockout.depletionDate}). Reordenar ${it.reorder.suggestedQty} unidades.`,
        });
      } else if (it.stockout.days <= CFG.ALERT_DAYS_AHEAD * 2) {
        alerts.push({
          level: 'warning',
          sku: it.sku, name: it.name,
          msg: `Stock bajo proyectado en ${it.stockout.days} días.`,
        });
      }
      if (it.slowMoving.slow) {
        alerts.push({
          level: 'info',
          sku: it.sku, name: it.name,
          msg: `Slow-moving: ${it.slowMoving.daysOfSupply} días de cobertura. Considerar promoción.`,
        });
      }
      if (it.abcClass === 'A' && it.stockout.days < 14) {
        alerts.push({
          level: 'critical',
          sku: it.sku, name: it.name,
          msg: `Producto Clase A en riesgo. Prioridad alta de reorden.`,
        });
      }
    });
    return alerts.sort((a,b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.level] - order[b.level];
    });
  }

  // ───────────────────────────────────────────────────────────
  // 7. ANÁLISIS COMPLETO
  // ───────────────────────────────────────────────────────────
  async function runAnalysis() {
    log('Cargando datos…');
    const [sales, inventory] = await Promise.all([loadSales(), loadInventory()]);
    log(`Sales=${sales.length}  Inventory=${inventory.length}`);
    const skusHistory = aggregateBySkuDay(sales);
    const abc = abcAnalysis(sales, inventory);
    const abcMap = new Map(abc.map(x => [x.sku, x.class]));

    const items = inventory.map(item => {
      const hist = skusHistory[item.sku] || [];
      const stockout = predictStockout(hist, item.stock || 0);
      const reorder = optimalReorder(hist, item);
      const slowMoving = detectSlowMoving(hist, item);
      const seasonality = detectSeasonality(hist);
      return {
        sku: item.sku,
        name: item.name,
        stock: item.stock,
        cost: item.cost,
        abcClass: abcMap.get(item.sku) || 'C',
        stockout, reorder, slowMoving, seasonality,
        history: hist,
      };
    });

    const report = {
      generatedAt: new Date().toISOString(),
      totalSales: sales.length,
      totalSKUs: inventory.length,
      items, abc,
    };
    report.alerts = generateAlerts(report);
    report.summary = {
      critical: report.alerts.filter(a=>a.level==='critical').length,
      warning: report.alerts.filter(a=>a.level==='warning').length,
      info: report.alerts.filter(a=>a.level==='info').length,
      classA: abc.filter(x=>x.class==='A').length,
      classB: abc.filter(x=>x.class==='B').length,
      classC: abc.filter(x=>x.class==='C').length,
      slowMoving: items.filter(i=>i.slowMoving.slow).length,
    };
    log('Análisis completo', report.summary);
    return report;
  }

  // ───────────────────────────────────────────────────────────
  // 8. CHARTS (canvas)
  // ───────────────────────────────────────────────────────────
  function drawTrendChart(canvas, history, opts = {}) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!history.length) {
      ctx.fillStyle = '#888'; ctx.font = '12px sans-serif';
      ctx.fillText('Sin datos', 10, 20); return;
    }
    const qtys = history.map(d => d.qty);
    const max = Math.max(...qtys, 1);
    const ma = movingAverage(qtys, 7);
    const padX = 30, padY = 20;
    const innerW = W - padX*2, innerH = H - padY*2;
    // Axes
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padY); ctx.lineTo(padX, H-padY); ctx.lineTo(W-padX, H-padY);
    ctx.stroke();
    // Bars (raw)
    const bw = innerW / qtys.length;
    qtys.forEach((q, i) => {
      const h = (q / max) * innerH;
      ctx.fillStyle = opts.barColor || 'rgba(33,150,243,0.4)';
      ctx.fillRect(padX + i*bw, H-padY-h, Math.max(1,bw-1), h);
    });
    // MA line
    ctx.strokeStyle = opts.lineColor || '#ff5722'; ctx.lineWidth = 2;
    ctx.beginPath();
    ma.forEach((v, i) => {
      const x = padX + i*bw + bw/2;
      const y = H - padY - (v/max)*innerH;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.stroke();
    // Title
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(opts.title || 'Tendencia', 8, 14);
  }

  function drawABCChart(canvas, abc) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const colors = { A: '#4caf50', B: '#ff9800', C: '#9e9e9e' };
    const padX = 30, padY = 20;
    const innerW = W - padX*2, innerH = H - padY*2;
    const max = Math.max(...abc.map(a=>a.revenue), 1);
    const bw = innerW / Math.max(1, abc.length);
    abc.forEach((a, i) => {
      const h = (a.revenue/max)*innerH;
      ctx.fillStyle = colors[a.class] || '#888';
      ctx.fillRect(padX + i*bw, H-padY-h, Math.max(1, bw-1), h);
    });
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Análisis ABC (revenue)', 8, 14);
  }

  function renderDashboard(targetEl, report) {
    if (!targetEl) return;
    const html = [];
    html.push(`<div style="font-family:system-ui,sans-serif;padding:12px">`);
    html.push(`<h2 style="margin:0 0 8px">Inventory AI Dashboard</h2>`);
    html.push(`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">`);
    const s = report.summary;
    const card = (label, val, color) =>
      `<div style="background:${color};color:#fff;padding:8px 14px;border-radius:6px;min-width:90px">
         <div style="font-size:11px;opacity:.85">${label}</div>
         <div style="font-size:22px;font-weight:bold">${val}</div>
       </div>`;
    html.push(card('Críticas', s.critical, '#d32f2f'));
    html.push(card('Avisos', s.warning, '#f57c00'));
    html.push(card('Info', s.info, '#1976d2'));
    html.push(card('Clase A', s.classA, '#388e3c'));
    html.push(card('Slow', s.slowMoving, '#616161'));
    html.push(`</div>`);
    html.push(`<canvas id="invai-abc" width="600" height="180" style="border:1px solid #eee;display:block;margin-bottom:12px"></canvas>`);
    html.push(`<h3>Alertas</h3><ul style="padding-left:18px">`);
    report.alerts.slice(0, 20).forEach(a => {
      const c = a.level === 'critical' ? '#d32f2f' : a.level === 'warning' ? '#f57c00' : '#1976d2';
      html.push(`<li style="color:${c}"><b>[${a.level.toUpperCase()}]</b> ${a.name} — ${a.msg}</li>`);
    });
    html.push(`</ul>`);
    html.push(`<h3>SKUs</h3>`);
    html.push(`<table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead><tr style="background:#f5f5f5">
      <th style="text-align:left;padding:4px">SKU</th><th>Nombre</th><th>Clase</th>
      <th>Stock</th><th>Días-stockout</th><th>Reorden EOQ</th><th>Slow</th></tr></thead><tbody>`);
    report.items.forEach(it => {
      html.push(`<tr style="border-bottom:1px solid #eee">
        <td style="padding:4px">${it.sku}</td>
        <td>${it.name}</td>
        <td>${it.abcClass}</td>
        <td>${it.stock}</td>
        <td>${isFinite(it.stockout.days)?it.stockout.days:'∞'}</td>
        <td>${it.reorder.suggestedQty}</td>
        <td>${it.slowMoving.slow?'Sí':'No'}</td>
      </tr>`);
    });
    html.push(`</tbody></table></div>`);
    targetEl.innerHTML = html.join('');
    const abcCanvas = targetEl.querySelector('#invai-abc');
    if (abcCanvas) drawABCChart(abcCanvas, report.abc);
  }

  // ───────────────────────────────────────────────────────────
  // 9. ENVIO DE REORDEN (POST)
  // ───────────────────────────────────────────────────────────
  async function submitReorder(sku, qty) {
    try {
      const r = await fetch(CFG.REORDER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty, ts: Date.now() }),
      });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      err('reorder failed', e);
      return { ok: false, error: e.message };
    }
  }

  // ───────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────
  const InventoryAIAPI = {
    config: CFG,
    runAnalysis,
    loadSales,
    loadInventory,
    predictStockout,
    optimalReorder,
    detectSlowMoving,
    abcAnalysis,
    detectSeasonality,
    generateAlerts,
    drawTrendChart,
    drawABCChart,
    renderDashboard,
    submitReorder,
    clearCache: () => cache.clear(),
    version: '1.0.0-agent46-r8fib',
  };

  global.InventoryAIAPI = InventoryAIAPI;
  log('InventoryAIAPI listo', InventoryAIAPI.version);

  // Auto-init si hay div #inventory-ai-dashboard
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
      const el = document.getElementById('inventory-ai-dashboard');
      if (!el) return;
      try {
        const report = await runAnalysis();
        renderDashboard(el, report);
      } catch (e) { err('auto-init', e); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
