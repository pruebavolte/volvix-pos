/* ============================================================================
 * volvix-heatmap-wiring.js — Volvix POS Heatmap Analytics
 * ----------------------------------------------------------------------------
 * Agente: Agent-69 R9 Volvix
 * Propósito: Visualizar horas/días pico, productos más vendidos por zona,
 *            heatmap de clicks UI y mouse tracking. Renderiza SVG.
 * API global: window.HeatmapAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const CFG = {
    storageKey: 'volvix_heatmap_v1',
    maxPoints: 5000,
    sampleRateMs: 120,        // throttle mousemove
    gridSize: 24,             // grid celdas por eje para heatmap UI
    colorScale: [
      [0.0, '#1e3a8a'],
      [0.25, '#2563eb'],
      [0.5, '#10b981'],
      [0.75, '#f59e0b'],
      [1.0, '#dc2626']
    ],
    days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    hours: Array.from({ length: 24 }, (_, i) => i)
  };

  // ── Estado ────────────────────────────────────────────────────────────────
  const state = {
    clicks: [],            // {x,y,t,target}
    moves: [],             // {x,y,t}
    sales: [],             // {productId, zone, hour, day, qty, total, t}
    salesByHourDay: {},    // "d-h" -> qty
    salesByZone: {},       // zone -> {productId -> qty}
    lastMoveAt: 0,
    enabled: true
  };

  // ── Persistencia ──────────────────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch (e) { console.warn('[Heatmap] load fail', e); }
  }

  function save() {
    try {
      const snap = {
        clicks: state.clicks.slice(-CFG.maxPoints),
        moves: state.moves.slice(-CFG.maxPoints),
        sales: state.sales.slice(-CFG.maxPoints),
        salesByHourDay: state.salesByHourDay,
        salesByZone: state.salesByZone
      };
      localStorage.setItem(CFG.storageKey, JSON.stringify(snap));
    } catch (e) { console.warn('[Heatmap] save fail', e); }
  }

  // ── Color helpers ─────────────────────────────────────────────────────────
  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function heatColor(v) {
    if (v <= 0) return CFG.colorScale[0][1];
    if (v >= 1) return CFG.colorScale[CFG.colorScale.length - 1][1];
    for (let i = 0; i < CFG.colorScale.length - 1; i++) {
      const [s1, c1] = CFG.colorScale[i];
      const [s2, c2] = CFG.colorScale[i + 1];
      if (v >= s1 && v <= s2) {
        return lerpColor(c1, c2, (v - s1) / (s2 - s1));
      }
    }
    return '#888';
  }

  // ── Tracking ──────────────────────────────────────────────────────────────
  function onClick(e) {
    if (!state.enabled) return;
    state.clicks.push({
      x: e.clientX, y: e.clientY, t: Date.now(),
      target: (e.target && e.target.tagName) || '?'
    });
    if (state.clicks.length > CFG.maxPoints) state.clicks.shift();
  }

  function onMove(e) {
    if (!state.enabled) return;
    const now = Date.now();
    if (now - state.lastMoveAt < CFG.sampleRateMs) return;
    state.lastMoveAt = now;
    state.moves.push({ x: e.clientX, y: e.clientY, t: now });
    if (state.moves.length > CFG.maxPoints) state.moves.shift();
  }

  function trackSale(productId, zone, qty, total) {
    if (!productId) return;
    const d = new Date();
    const day = d.getDay(), hour = d.getHours();
    const sale = { productId, zone: zone || 'default', hour, day, qty: qty || 1, total: total || 0, t: Date.now() };
    state.sales.push(sale);
    if (state.sales.length > CFG.maxPoints) state.sales.shift();

    const key = `${day}-${hour}`;
    state.salesByHourDay[key] = (state.salesByHourDay[key] || 0) + sale.qty;

    if (!state.salesByZone[sale.zone]) state.salesByZone[sale.zone] = {};
    state.salesByZone[sale.zone][productId] = (state.salesByZone[sale.zone][productId] || 0) + sale.qty;

    save();
  }

  // ── SVG: Heatmap horas x días ─────────────────────────────────────────────
  function renderHourDayHeatmap(target, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    opts = opts || {};
    const cellW = opts.cellW || 26, cellH = opts.cellH || 26;
    const padL = 50, padT = 30;
    const w = padL + 24 * cellW + 10;
    const h = padT + 7 * cellH + 10;

    let max = 1;
    for (const k in state.salesByHourDay) {
      if (state.salesByHourDay[k] > max) max = state.salesByHourDay[k];
    }

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.fontFamily = 'system-ui, sans-serif';
    svg.style.background = '#0b1220';

    // Header horas
    for (let hr = 0; hr < 24; hr++) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', padL + hr * cellW + cellW / 2);
      t.setAttribute('y', padT - 8);
      t.setAttribute('fill', '#94a3b8');
      t.setAttribute('font-size', '10');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = hr;
      svg.appendChild(t);
    }
    // Etiquetas días
    for (let d = 0; d < 7; d++) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', padL - 6);
      t.setAttribute('y', padT + d * cellH + cellH / 2 + 4);
      t.setAttribute('fill', '#94a3b8');
      t.setAttribute('font-size', '11');
      t.setAttribute('text-anchor', 'end');
      t.textContent = CFG.days[d];
      svg.appendChild(t);
    }
    // Celdas
    for (let d = 0; d < 7; d++) {
      for (let hr = 0; hr < 24; hr++) {
        const v = state.salesByHourDay[`${d}-${hr}`] || 0;
        const norm = v / max;
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', padL + hr * cellW + 1);
        r.setAttribute('y', padT + d * cellH + 1);
        r.setAttribute('width', cellW - 2);
        r.setAttribute('height', cellH - 2);
        r.setAttribute('rx', 3);
        r.setAttribute('fill', v === 0 ? '#1e293b' : heatColor(norm));
        const title = document.createElementNS(NS, 'title');
        title.textContent = `${CFG.days[d]} ${hr}:00 — ${v} ventas`;
        r.appendChild(title);
        svg.appendChild(r);
      }
    }

    el.innerHTML = '';
    el.appendChild(svg);
    return svg;
  }

  // ── SVG: Heatmap clicks UI (grid sobre viewport) ──────────────────────────
  function renderClickHeatmap(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    const W = window.innerWidth, H = window.innerHeight;
    const gx = CFG.gridSize, gy = CFG.gridSize;
    const cw = W / gx, ch = H / gy;
    const grid = new Array(gx * gy).fill(0);

    for (const c of state.clicks) {
      const ix = Math.min(gx - 1, Math.max(0, Math.floor(c.x / cw)));
      const iy = Math.min(gy - 1, Math.max(0, Math.floor(c.y / ch)));
      grid[iy * gx + ix]++;
    }
    let max = 1;
    for (const v of grid) if (v > max) max = v;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.position = 'fixed';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = 99999;
    svg.style.opacity = '0.7';

    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const v = grid[y * gx + x];
        if (v === 0) continue;
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', x * cw);
        r.setAttribute('y', y * ch);
        r.setAttribute('width', cw);
        r.setAttribute('height', ch);
        r.setAttribute('fill', heatColor(v / max));
        r.setAttribute('opacity', 0.45);
        svg.appendChild(r);
      }
    }
    el.innerHTML = '';
    el.appendChild(svg);
    return svg;
  }

  // ── SVG: Top productos por zona ───────────────────────────────────────────
  function renderTopProductsByZone(target, topN) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    topN = topN || 5;
    const zones = Object.keys(state.salesByZone);
    if (zones.length === 0) {
      el.innerHTML = '<div style="color:#94a3b8;padding:12px">Sin datos de ventas todavía.</div>';
      return null;
    }

    const rowH = 24, padL = 110, barMax = 220;
    const h = zones.length * (topN * rowH + 30) + 20;
    const w = padL + barMax + 80;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.style.background = '#0b1220';
    svg.style.fontFamily = 'system-ui, sans-serif';

    let y = 18;
    for (const z of zones) {
      const zt = document.createElementNS(NS, 'text');
      zt.setAttribute('x', 8); zt.setAttribute('y', y);
      zt.setAttribute('fill', '#fbbf24'); zt.setAttribute('font-size', '13');
      zt.setAttribute('font-weight', 'bold');
      zt.textContent = `Zona: ${z}`;
      svg.appendChild(zt);
      y += 14;

      const prods = Object.entries(state.salesByZone[z])
        .sort((a, b) => b[1] - a[1]).slice(0, topN);
      const max = prods.length ? prods[0][1] : 1;

      for (const [pid, qty] of prods) {
        const lbl = document.createElementNS(NS, 'text');
        lbl.setAttribute('x', padL - 6); lbl.setAttribute('y', y + 14);
        lbl.setAttribute('fill', '#cbd5e1'); lbl.setAttribute('font-size', '11');
        lbl.setAttribute('text-anchor', 'end');
        lbl.textContent = pid.length > 16 ? pid.slice(0, 15) + '…' : pid;
        svg.appendChild(lbl);

        const bar = document.createElementNS(NS, 'rect');
        bar.setAttribute('x', padL); bar.setAttribute('y', y + 4);
        bar.setAttribute('width', (qty / max) * barMax);
        bar.setAttribute('height', rowH - 8);
        bar.setAttribute('fill', heatColor(qty / max));
        bar.setAttribute('rx', 3);
        svg.appendChild(bar);

        const num = document.createElementNS(NS, 'text');
        num.setAttribute('x', padL + (qty / max) * barMax + 6);
        num.setAttribute('y', y + 17);
        num.setAttribute('fill', '#e2e8f0'); num.setAttribute('font-size', '11');
        num.textContent = qty;
        svg.appendChild(num);
        y += rowH;
      }
      y += 12;
    }

    el.innerHTML = '';
    el.appendChild(svg);
    return svg;
  }

  // ── Stats helpers ─────────────────────────────────────────────────────────
  function getPeakHour() {
    let best = null, bestV = -1;
    for (const k in state.salesByHourDay) {
      if (state.salesByHourDay[k] > bestV) { bestV = state.salesByHourDay[k]; best = k; }
    }
    if (!best) return null;
    const [d, h] = best.split('-').map(Number);
    return { day: CFG.days[d], hour: h, count: bestV };
  }

  function getStats() {
    return {
      totalClicks: state.clicks.length,
      totalMoves: state.moves.length,
      totalSales: state.sales.length,
      zones: Object.keys(state.salesByZone).length,
      peak: getPeakHour()
    };
  }

  function clearAll() {
    state.clicks = []; state.moves = []; state.sales = [];
    state.salesByHourDay = {}; state.salesByZone = {};
    save();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    load();
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMove, { passive: true });
    setInterval(save, 15000);
    window.addEventListener('beforeunload', save);
  }

  // ── API global ────────────────────────────────────────────────────────────
  global.HeatmapAPI = {
    init,
    trackSale,
    renderHourDayHeatmap,
    renderClickHeatmap,
    renderTopProductsByZone,
    getStats,
    getPeakHour,
    clearAll,
    enable: () => { state.enabled = true; },
    disable: () => { state.enabled = false; },
    _state: state,
    _cfg: CFG
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
