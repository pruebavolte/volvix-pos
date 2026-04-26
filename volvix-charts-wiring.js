/**
 * VOLVIX CHARTS - SVG Native Charting Library (Zero Dependencies)
 * Agent-7 Round 6 Fibonacci - Volvix POS
 *
 * Charts: bar, line, pie, donut, sparkline
 * Auto-loads from: /api/owner/dashboard, /api/sales, /api/reports/daily
 * Containers: [data-chart="bar|line|pie|donut|sparkline"]
 */
(function () {
  'use strict';

  const API = location.origin;

  // ============= COLOR PALETTE =============
  const PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];

  const COLORS = {
    text: '#e2e8f0',
    muted: '#94a3b8',
    grid: '#334155',
    bg: 'transparent',
    accent: '#3b82f6',
    accentLight: '#60a5fa',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b'
  };

  // ============= INJECT CSS ANIMATIONS =============
  function injectStyles() {
    if (document.getElementById('volvix-charts-style')) return;
    const style = document.createElement('style');
    style.id = 'volvix-charts-style';
    style.textContent = `
      .vx-chart { position: relative; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .vx-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
      .vx-chart .vx-bar { transition: opacity .2s ease, transform .2s ease; transform-origin: bottom; animation: vx-grow .6s ease-out; }
      .vx-chart .vx-bar:hover { opacity: .85; }
      .vx-chart .vx-line-path { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: vx-draw 1.2s ease-out forwards; }
      .vx-chart .vx-area { animation: vx-fade .8s ease-out; }
      .vx-chart .vx-slice { transition: transform .2s ease; transform-origin: center; cursor: pointer; animation: vx-fade .6s ease-out; }
      .vx-chart .vx-slice:hover { transform: scale(1.04); }
      .vx-chart .vx-dot { transition: r .2s ease; }
      .vx-chart .vx-dot:hover { r: 6; }
      .vx-tooltip {
        position: absolute; pointer-events: none; background: rgba(15,23,42,.95);
        color: #f1f5f9; padding: 6px 10px; border-radius: 6px; font-size: 12px;
        white-space: nowrap; transform: translate(-50%, -120%); opacity: 0;
        transition: opacity .15s ease; border: 1px solid #334155; z-index: 1000;
      }
      .vx-tooltip.vx-show { opacity: 1; }
      .vx-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; font-size: 12px; color: ${COLORS.muted}; }
      .vx-legend-item { display: inline-flex; align-items: center; gap: 6px; }
      .vx-legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
      .vx-empty { padding: 30px; text-align: center; color: ${COLORS.muted}; font-size: 13px; }
      @keyframes vx-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes vx-draw { to { stroke-dashoffset: 0; } }
      @keyframes vx-fade { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  // ============= UTILS =============
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  }

  function ensureWrapper(container) {
    container.classList.add('vx-chart');
    let tip = container.querySelector('.vx-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'vx-tooltip';
      container.appendChild(tip);
    }
    return tip;
  }

  function bindTooltip(container, tooltip) {
    container.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('mousemove', e => {
        const rect = container.getBoundingClientRect();
        tooltip.textContent = el.getAttribute('data-tip');
        tooltip.style.left = (e.clientX - rect.left) + 'px';
        tooltip.style.top = (e.clientY - rect.top) + 'px';
        tooltip.classList.add('vx-show');
      });
      el.addEventListener('mouseleave', () => tooltip.classList.remove('vx-show'));
    });
  }

  function emptyState(container, msg) {
    container.innerHTML = `<div class="vx-empty">${escapeHtml(msg || 'Sin datos')}</div>`;
  }

  // ============= BAR CHART =============
  function bar(data, container, opts = {}) {
    if (!data || !data.length) return emptyState(container, 'Sin datos para mostrar');
    const tooltip = ensureWrapper(container);
    const W = opts.width || 480, H = opts.height || 240;
    const padL = 40, padR = 10, padT = 15, padB = 30;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const max = Math.max(...data.map(d => +d.value || 0)) || 1;
    const barW = innerW / data.length - 6;
    const color = opts.color || COLORS.accent;

    const ticks = 4;
    const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
      const y = padT + (innerH * i) / ticks;
      const val = max * (1 - i / ticks);
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1" stroke-dasharray="2 3" opacity=".4"/>
              <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="${COLORS.muted}">${formatNumber(val)}</text>`;
    }).join('');

    const bars = data.map((d, i) => {
      const v = +d.value || 0;
      const h = (v / max) * innerH;
      const x = padL + i * (innerW / data.length) + 3;
      const y = padT + innerH - h;
      const c = d.color || color;
      return `
        <g>
          <rect class="vx-bar" x="${x}" y="${y}" width="${barW}" height="${h}" fill="${c}" rx="3"
                data-tip="${escapeHtml(d.label)}: ${formatNumber(v)}"></rect>
          <text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="${COLORS.muted}">${escapeHtml(String(d.label).slice(0, 10))}</text>
        </g>`;
    }).join('');

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}${bars}
    </svg>` + (container.querySelector('.vx-tooltip') ? '' : '');
    container.appendChild(tooltip);
    bindTooltip(container, tooltip);
  }

  // ============= LINE CHART =============
  function line(data, container, opts = {}) {
    if (!data || !data.length) return emptyState(container, 'Sin datos para mostrar');
    const tooltip = ensureWrapper(container);
    const W = opts.width || 520, H = opts.height || 240;
    const padL = 40, padR = 15, padT = 15, padB = 30;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const values = data.map(d => +d.value || 0);
    const max = Math.max(...values) || 1;
    const min = opts.minZero === false ? Math.min(...values) : 0;
    const range = max - min || 1;
    const color = opts.color || COLORS.accent;

    const x = i => padL + (i * innerW) / Math.max(1, data.length - 1);
    const y = v => padT + innerH - ((v - min) / range) * innerH;

    const ticks = 4;
    const grid = Array.from({ length: ticks + 1 }, (_, i) => {
      const yy = padT + (innerH * i) / ticks;
      const val = max - (range * i) / ticks;
      return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="${COLORS.grid}" stroke-width="1" stroke-dasharray="2 3" opacity=".4"/>
              <text x="${padL - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="${COLORS.muted}">${formatNumber(val)}</text>`;
    }).join('');

    const path = data.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(+d.value || 0)}`).join(' ');
    const areaPath = path + ` L ${x(data.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;

    const dots = data.map((d, i) => `
      <circle class="vx-dot" cx="${x(i)}" cy="${y(+d.value || 0)}" r="3.5" fill="${color}"
              stroke="#0f172a" stroke-width="2"
              data-tip="${escapeHtml(d.label)}: ${formatNumber(+d.value || 0)}"/>`).join('');

    const labels = data.map((d, i) => {
      if (data.length > 12 && i % Math.ceil(data.length / 8) !== 0) return '';
      return `<text x="${x(i)}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="${COLORS.muted}">${escapeHtml(String(d.label).slice(0, 8))}</text>`;
    }).join('');

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="vx-area-${Math.random().toString(36).slice(2, 7)}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path class="vx-area" d="${areaPath}" fill="${color}" fill-opacity=".15"/>
      <path class="vx-line-path" d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${labels}
    </svg>`;
    container.appendChild(tooltip);
    bindTooltip(container, tooltip);
  }

  // ============= PIE CHART =============
  function pie(data, container, opts = {}) {
    if (!data || !data.length) return emptyState(container, 'Sin datos para mostrar');
    const tooltip = ensureWrapper(container);
    const W = opts.width || 280, H = opts.height || 280;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 10;
    const total = data.reduce((s, d) => s + (+d.value || 0), 0) || 1;

    let angle = -Math.PI / 2;
    const slices = data.map((d, i) => {
      const v = +d.value || 0;
      const slice = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const c = d.color || PALETTE[i % PALETTE.length];
      const pct = ((v / total) * 100).toFixed(1);
      return `<path class="vx-slice" d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z"
              fill="${c}" stroke="#0f172a" stroke-width="2"
              data-tip="${escapeHtml(d.label)}: ${formatNumber(v)} (${pct}%)"/>`;
    }).join('');

    const legend = data.map((d, i) => {
      const c = d.color || PALETTE[i % PALETTE.length];
      const pct = ((+d.value || 0) / total * 100).toFixed(1);
      return `<span class="vx-legend-item"><span class="vx-legend-dot" style="background:${c}"></span>${escapeHtml(d.label)} <strong style="color:${COLORS.text}">${pct}%</strong></span>`;
    }).join('');

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${slices}</svg>
      <div class="vx-legend">${legend}</div>`;
    container.appendChild(tooltip);
    bindTooltip(container, tooltip);
  }

  // ============= DONUT CHART =============
  function donut(data, container, opts = {}) {
    if (!data || !data.length) return emptyState(container, 'Sin datos para mostrar');
    const tooltip = ensureWrapper(container);
    const W = opts.width || 280, H = opts.height || 280;
    const cx = W / 2, cy = H / 2;
    const rOuter = Math.min(W, H) / 2 - 10;
    const rInner = rOuter * (opts.thickness || 0.6);
    const total = data.reduce((s, d) => s + (+d.value || 0), 0) || 1;
    const centerLabel = opts.centerLabel || formatNumber(total);
    const centerSub = opts.centerSub || 'Total';

    let angle = -Math.PI / 2;
    const slices = data.map((d, i) => {
      const v = +d.value || 0;
      const slice = (v / total) * Math.PI * 2;
      const x1o = cx + rOuter * Math.cos(angle), y1o = cy + rOuter * Math.sin(angle);
      const x1i = cx + rInner * Math.cos(angle), y1i = cy + rInner * Math.sin(angle);
      angle += slice;
      const x2o = cx + rOuter * Math.cos(angle), y2o = cy + rOuter * Math.sin(angle);
      const x2i = cx + rInner * Math.cos(angle), y2i = cy + rInner * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const c = d.color || PALETTE[i % PALETTE.length];
      const pct = ((v / total) * 100).toFixed(1);
      return `<path class="vx-slice"
              d="M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i} Z"
              fill="${c}" stroke="#0f172a" stroke-width="2"
              data-tip="${escapeHtml(d.label)}: ${formatNumber(v)} (${pct}%)"/>`;
    }).join('');

    const legend = data.map((d, i) => {
      const c = d.color || PALETTE[i % PALETTE.length];
      const pct = ((+d.value || 0) / total * 100).toFixed(1);
      return `<span class="vx-legend-item"><span class="vx-legend-dot" style="background:${c}"></span>${escapeHtml(d.label)} <strong style="color:${COLORS.text}">${pct}%</strong></span>`;
    }).join('');

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${slices}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" fill="${COLORS.text}">${escapeHtml(centerLabel)}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="${COLORS.muted}">${escapeHtml(centerSub)}</text>
    </svg>
    <div class="vx-legend">${legend}</div>`;
    container.appendChild(tooltip);
    bindTooltip(container, tooltip);
  }

  // ============= SPARKLINE =============
  function sparkline(data, container, opts = {}) {
    if (!data || !data.length) return emptyState(container, '—');
    const values = data.map(d => typeof d === 'number' ? d : +d.value || 0);
    const W = opts.width || 120, H = opts.height || 32;
    const max = Math.max(...values), min = Math.min(...values);
    const range = (max - min) || 1;
    const color = opts.color || COLORS.accent;

    const x = i => (i * W) / Math.max(1, values.length - 1);
    const y = v => H - ((v - min) / range) * (H - 4) - 2;

    const path = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const last = values[values.length - 1];
    const first = values[0];
    const trendColor = last >= first ? COLORS.success : COLORS.danger;

    container.classList.add('vx-chart');
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;">
      <path class="vx-line-path" d="${path}" fill="none" stroke="${opts.trend ? trendColor : color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(values.length - 1)}" cy="${y(last)}" r="2.5" fill="${opts.trend ? trendColor : color}"/>
    </svg>`;
  }

  // ============= LEGEND HELPER =============
  function renderLegend(items, container) {
    const html = items.map((it, i) => {
      const c = it.color || PALETTE[i % PALETTE.length];
      return `<span class="vx-legend-item"><span class="vx-legend-dot" style="background:${c}"></span>${escapeHtml(it.label)}</span>`;
    }).join('');
    const div = document.createElement('div');
    div.className = 'vx-legend';
    div.innerHTML = html;
    container.appendChild(div);
  }

  // ============= DATA FETCHERS =============
  async function fetchJSON(path) {
    try {
      const r = await fetch(API + path, { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function loadDashboard() { return await fetchJSON('/api/owner/dashboard'); }
  async function loadSales() { return await fetchJSON('/api/sales') || []; }
  async function loadDailyReport() { return await fetchJSON('/api/reports/daily'); }

  // ============= DATA TRANSFORMERS =============
  function salesByDay(sales) {
    if (!Array.isArray(sales)) return [];
    const buckets = {};
    sales.forEach(s => {
      const d = (s.created_at || s.date || s.createdAt || '').slice(0, 10);
      if (!d) return;
      const v = +s.total || +s.amount || +s.value || 0;
      buckets[d] = (buckets[d] || 0) + v;
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a < b ? -1 : 1)
      .slice(-14)
      .map(([date, value]) => ({
        label: date.slice(5),
        value: Math.round(value * 100) / 100
      }));
  }

  function productDistribution(sales) {
    if (!Array.isArray(sales)) return [];
    const buckets = {};
    sales.forEach(s => {
      const items = s.items || s.products || [];
      if (Array.isArray(items)) {
        items.forEach(it => {
          const name = it.name || it.product_name || it.title || 'Otro';
          const qty = +it.quantity || +it.qty || 1;
          buckets[name] = (buckets[name] || 0) + qty;
        });
      } else {
        const name = s.product_name || s.name || 'Venta';
        buckets[name] = (buckets[name] || 0) + 1;
      }
    });
    return Object.entries(buckets)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }

  function categoryDistribution(sales) {
    if (!Array.isArray(sales)) return [];
    const buckets = {};
    sales.forEach(s => {
      const items = s.items || s.products || [];
      if (Array.isArray(items)) {
        items.forEach(it => {
          const cat = it.category || it.cat || 'General';
          buckets[cat] = (buckets[cat] || 0) + (+it.quantity || 1) * (+it.price || 1);
        });
      }
    });
    return Object.entries(buckets)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  }

  function revenueTrend(sales) {
    return salesByDay(sales);
  }

  // ============= AUTO LOADER =============
  async function loadAndRenderAll() {
    injectStyles();
    const elements = document.querySelectorAll('[data-chart]');
    if (!elements.length) return;

    // Lazy fetch only what's needed
    const needsSales = Array.from(elements).some(el => {
      const s = el.dataset.source || 'sales-by-day';
      return s !== 'dashboard' && s !== 'daily';
    });
    const needsDashboard = Array.from(elements).some(el => el.dataset.source === 'dashboard');
    const needsDaily = Array.from(elements).some(el => el.dataset.source === 'daily');

    const [sales, dashboard, daily] = await Promise.all([
      needsSales ? loadSales() : Promise.resolve([]),
      needsDashboard ? loadDashboard() : Promise.resolve(null),
      needsDaily ? loadDailyReport() : Promise.resolve(null)
    ]);

    elements.forEach(el => {
      const type = el.dataset.chart;
      const source = el.dataset.source || 'sales-by-day';
      let data = [];

      try {
        switch (source) {
          case 'sales-by-day':
          case 'revenue-trend':
            data = revenueTrend(sales); break;
          case 'products':
          case 'product-distribution':
            data = productDistribution(sales); break;
          case 'categories':
          case 'category-distribution':
            data = categoryDistribution(sales); break;
          case 'dashboard':
            if (dashboard && Array.isArray(dashboard.chart)) data = dashboard.chart;
            else if (dashboard && dashboard.salesByDay) data = dashboard.salesByDay;
            break;
          case 'daily':
            if (daily && Array.isArray(daily.hours)) {
              data = daily.hours.map(h => ({ label: h.hour || h.label, value: +h.total || +h.value || 0 }));
            }
            break;
          default:
            // Try a custom JSON in data-values
            if (el.dataset.values) {
              try { data = JSON.parse(el.dataset.values); } catch (e) { data = []; }
            }
        }
      } catch (e) { data = []; }

      const opts = {};
      if (el.dataset.color) opts.color = el.dataset.color;
      if (el.dataset.width) opts.width = +el.dataset.width;
      if (el.dataset.height) opts.height = +el.dataset.height;
      if (el.dataset.trend === 'true') opts.trend = true;
      if (el.dataset.centerLabel) opts.centerLabel = el.dataset.centerLabel;
      if (el.dataset.centerSub) opts.centerSub = el.dataset.centerSub;

      switch (type) {
        case 'bar': bar(data, el, opts); break;
        case 'line': line(data, el, opts); break;
        case 'pie': pie(data, el, opts); break;
        case 'donut': donut(data, el, opts); break;
        case 'sparkline': sparkline(data, el, opts); break;
        default: emptyState(el, 'Tipo desconocido: ' + type);
      }
    });
  }

  // ============= AUTO REFRESH =============
  let refreshTimer = null;
  function startAutoRefresh(intervalMs) {
    stopAutoRefresh();
    refreshTimer = setInterval(loadAndRenderAll, intervalMs || 60000);
  }
  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // ============= PUBLIC API =============
  window.VolvixCharts = {
    bar, line, pie, donut, sparkline,
    renderLegend,
    loadAll: loadAndRenderAll,
    refresh: loadAndRenderAll,
    startAutoRefresh, stopAutoRefresh,
    transforms: { salesByDay, productDistribution, categoryDistribution, revenueTrend },
    fetch: { dashboard: loadDashboard, sales: loadSales, daily: loadDailyReport },
    palette: PALETTE,
    colors: COLORS,
    version: '1.0.0'
  };

  // ============= AUTO INIT =============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { injectStyles(); loadAndRenderAll(); });
  } else {
    injectStyles();
    loadAndRenderAll();
  }

  // Re-render on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(loadAndRenderAll, 250);
  });
})();
