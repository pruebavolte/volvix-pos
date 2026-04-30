// pdf-export.js — Volvix POS PDF/HTML report generator
// Lightweight Vercel-serverless friendly: returns styled HTML with auto-print.
// Zero external deps. All reports embed inline SVG charts and brand styling.

const { createClient } = require('@supabase/supabase-js');

// ---------- Brand & helpers ----------
const BRAND = {
  amber: '#FBBF24',
  navy: '#1E3A8A',
  light: '#FAFAF9',
  dark: '#0A0A0A',
  gray: '#6B7280',
  border: '#E5E7EB',
  green: '#10B981',
  red: '#EF4444',
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtMXN = (n) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
  }).format(v);
};

const fmtNum = (n, d = 0) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(v);
};

const fmtDate = (d) => {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
};

const fmtDateTime = (d) => {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const fmtShortDate = (d) => {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
};

// ---------- Auth ----------
async function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function getSupabase(ctx) {
  if (ctx && ctx.supabase) return ctx.supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authCheck(req, ctx) {
  if (ctx && typeof ctx.auth === 'function') {
    try { return await ctx.auth(req); } catch { return null; }
  }
  const supa = getSupabase(ctx);
  if (!supa) return null;
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!auth) return null;
  const token = String(auth).replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch { return null; }
}

async function getTenant(supa, tenantId) {
  if (!tenantId || !supa) return null;
  try {
    const { data } = await supa.from('tenants').select('*').eq('id', tenantId).single();
    return data || null;
  } catch { return null; }
}

// ---------- HTML chrome (CSS, header, footer, watermark) ----------
function baseStyles() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: ${BRAND.dark}; background: ${BRAND.light}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { padding: 24px 32px; max-width: 210mm; margin: 0 auto; font-size: 11pt; line-height: 1.45; }
h1 { font-size: 22pt; font-weight: 800; color: ${BRAND.navy}; letter-spacing: -0.5px; }
h2 { font-size: 14pt; font-weight: 700; color: ${BRAND.navy}; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 2px solid ${BRAND.amber}; }
h3 { font-size: 12pt; font-weight: 600; color: ${BRAND.dark}; margin: 12px 0 6px; }
p { margin-bottom: 6px; }
.brand-bar { height: 6px; background: linear-gradient(90deg, ${BRAND.amber} 0%, ${BRAND.navy} 100%); border-radius: 4px; margin-bottom: 16px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid ${BRAND.border}; margin-bottom: 18px; }
.tenant-block { display: flex; align-items: center; gap: 14px; }
.tenant-logo { width: 56px; height: 56px; border-radius: 12px; background: ${BRAND.navy}; color: ${BRAND.amber}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22pt; }
.tenant-name { font-size: 16pt; font-weight: 700; color: ${BRAND.dark}; }
.tenant-meta { font-size: 9pt; color: ${BRAND.gray}; margin-top: 2px; }
.report-meta { text-align: right; font-size: 9pt; color: ${BRAND.gray}; }
.report-meta .badge { display: inline-block; background: ${BRAND.amber}; color: ${BRAND.dark}; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 9pt; margin-bottom: 6px; }
.report-title { font-size: 18pt; font-weight: 800; color: ${BRAND.navy}; margin-bottom: 4px; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
.kpi-grid.three { grid-template-columns: repeat(3, 1fr); }
.kpi-grid.two { grid-template-columns: repeat(2, 1fr); }
.kpi { background: white; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 14px; border-left: 4px solid ${BRAND.amber}; page-break-inside: avoid; }
.kpi .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.gray}; font-weight: 600; }
.kpi .value { font-size: 16pt; font-weight: 800; color: ${BRAND.navy}; margin-top: 2px; }
.kpi .delta { font-size: 8.5pt; margin-top: 2px; color: ${BRAND.gray}; }
.kpi .delta.up { color: ${BRAND.green}; }
.kpi .delta.down { color: ${BRAND.red}; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 10pt; page-break-inside: auto; }
table thead { background: ${BRAND.navy}; color: white; }
table thead th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
table thead th.num { text-align: right; }
table tbody tr { border-bottom: 1px solid ${BRAND.border}; page-break-inside: avoid; }
table tbody tr:nth-child(even) { background: ${BRAND.light}; }
table tbody td { padding: 7px 10px; vertical-align: top; }
table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
table tbody td.muted { color: ${BRAND.gray}; }
table tbody tr.total { font-weight: 700; background: ${BRAND.amber} !important; color: ${BRAND.dark}; }
.chart-row { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin: 12px 0; align-items: stretch; }
.chart-card { background: white; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 14px; page-break-inside: avoid; }
.chart-card h3 { margin-top: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: 9pt; margin-top: 8px; }
.legend .item { display: flex; align-items: center; gap: 5px; }
.legend .dot { width: 10px; height: 10px; border-radius: 2px; }
.signature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
.signature { border-top: 1px solid ${BRAND.dark}; padding-top: 6px; text-align: center; font-size: 9pt; color: ${BRAND.gray}; font-weight: 500; }
.footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid ${BRAND.border}; display: flex; justify-content: space-between; font-size: 8.5pt; color: ${BRAND.gray}; }
.footer strong { color: ${BRAND.navy}; }
.watermark { position: fixed; bottom: 16px; right: 16px; font-size: 8pt; color: rgba(30, 58, 138, 0.18); font-weight: 800; letter-spacing: 4px; transform: rotate(-4deg); pointer-events: none; z-index: 9999; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8.5pt; font-weight: 600; }
.pill.ok { background: #D1FAE5; color: #065F46; }
.pill.warn { background: #FEF3C7; color: #92400E; }
.pill.bad { background: #FEE2E2; color: #991B1B; }
.print-only { display: none; }
.empty { padding: 24px; text-align: center; color: ${BRAND.gray}; background: white; border: 1px dashed ${BRAND.border}; border-radius: 10px; }

@page { size: A4; margin: 14mm 12mm; }
@media print {
  body { padding: 0; max-width: none; background: white; }
  .no-print { display: none !important; }
  .print-only { display: block; }
  .kpi, .chart-card, table tbody tr { page-break-inside: avoid; }
  h2 { page-break-after: avoid; }
}
.toolbar { position: sticky; top: 0; background: white; padding: 8px 12px; border-bottom: 1px solid ${BRAND.border}; margin: -24px -32px 16px; display: flex; gap: 8px; align-items: center; z-index: 100; }
.toolbar button { background: ${BRAND.navy}; color: white; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-family: inherit; }
.toolbar button.secondary { background: ${BRAND.amber}; color: ${BRAND.dark}; }
`;
}

function tenantInitial(name) {
  if (!name) return 'V';
  return String(name).trim().charAt(0).toUpperCase();
}

function headerHTML(tenant, title, subtitle, range) {
  const name = (tenant && tenant.name) || 'Volvix POS';
  const rfc = tenant && (tenant.rfc || tenant.tax_id) ? `RFC: ${esc(tenant.rfc || tenant.tax_id)}` : '';
  const addr = tenant && tenant.address ? esc(tenant.address) : '';
  const meta = [rfc, addr].filter(Boolean).join(' &middot; ');
  return `
<div class="brand-bar"></div>
<div class="header">
  <div class="tenant-block">
    <div class="tenant-logo">${esc(tenantInitial(name))}</div>
    <div>
      <div class="tenant-name">${esc(name)}</div>
      ${meta ? `<div class="tenant-meta">${meta}</div>` : ''}
    </div>
  </div>
  <div class="report-meta">
    <div class="badge">VOLVIX POS</div>
    <div class="report-title">${esc(title)}</div>
    ${subtitle ? `<div>${esc(subtitle)}</div>` : ''}
    ${range ? `<div>${esc(range)}</div>` : ''}
    <div>Generado: ${esc(fmtDateTime(new Date()))}</div>
  </div>
</div>`;
}

function footerHTML() {
  return `
<div class="footer">
  <div><strong>VOLVIX POS</strong> &middot; Reporte generado automáticamente</div>
  <div>${esc(fmtDateTime(new Date()))}</div>
</div>
<div class="watermark">VOLVIX POS</div>`;
}

function autoPrintScript(download) {
  // Toolbar visible only on screen; auto-print after fonts/SVG settle.
  return `
<div class="toolbar no-print">
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
  <button class="secondary" onclick="window.close()">Cerrar</button>
  <span style="color:${BRAND.gray};font-size:9pt;margin-left:auto;">Use Ctrl/Cmd+P si la impresión no inicia automáticamente.</span>
</div>
<script>
(function(){
  var fired = false;
  function go(){ if(fired) return; fired = true; try { window.print(); } catch(e){} }
  window.addEventListener('load', function(){ setTimeout(go, ${download ? 350 : 700}); });
})();
</script>`;
}

function htmlShell({ title, body, download }) {
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${baseStyles()}</style>
</head>
<body>
${autoPrintScript(download)}
${body}
${footerHTML()}
</body>
</html>`;
}

function send(res, parsedUrl, html, filenameHint) {
  const dl = parsedUrl && parsedUrl.query && (parsedUrl.query.download === '1' || parsedUrl.query.download === 'true');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Disposition',
    `${dl ? 'attachment' : 'inline'}; filename="${(filenameHint || 'reporte').replace(/[^a-z0-9-_]/gi, '_')}.pdf.html"`
  );
  res.end(html);
}

function sendJSON(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// ---------- SVG charts ----------
function svgBarChart(items, opts = {}) {
  const w = opts.width || 560;
  const h = opts.height || 180;
  const pad = { l: 40, r: 16, t: 14, b: 32 };
  const arr = (items || []).filter((x) => x);
  if (!arr.length) return `<div class="empty">Sin datos</div>`;
  const max = Math.max(1, ...arr.map((d) => Number(d.value) || 0));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const bw = innerW / arr.length;
  const bars = arr.map((d, i) => {
    const v = Number(d.value) || 0;
    const bh = (v / max) * innerH;
    const x = pad.l + i * bw + bw * 0.15;
    const y = pad.t + innerH - bh;
    const bwReal = bw * 0.7;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwReal.toFixed(1)}" height="${bh.toFixed(1)}" fill="${BRAND.amber}" rx="3" />
      <text x="${(x + bwReal / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="${BRAND.dark}" font-weight="600">${esc(opts.formatValue ? opts.formatValue(v) : fmtNum(v))}</text>
      <text x="${(x + bwReal / 2).toFixed(1)}" y="${(pad.t + innerH + 14).toFixed(1)}" text-anchor="middle" font-size="8" fill="${BRAND.gray}">${esc(d.label || '')}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="${BRAND.border}" />
    ${bars}
  </svg>`;
}

function svgLineChart(items, opts = {}) {
  const w = opts.width || 560;
  const h = opts.height || 180;
  const pad = { l: 40, r: 16, t: 14, b: 32 };
  const arr = (items || []).filter((x) => x);
  if (arr.length < 2) return svgBarChart(items, opts);
  const max = Math.max(1, ...arr.map((d) => Number(d.value) || 0));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const step = innerW / Math.max(1, arr.length - 1);
  const pts = arr.map((d, i) => {
    const x = pad.l + i * step;
    const y = pad.t + innerH - ((Number(d.value) || 0) / max) * innerH;
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${(pad.t + innerH).toFixed(1)} L${pts[0][0].toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${BRAND.navy}" />
    <text x="${p[0].toFixed(1)}" y="${(pad.t + innerH + 14).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${BRAND.gray}">${esc(arr[i].label || '')}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="${BRAND.border}" />
    <path d="${area}" fill="${BRAND.amber}" fill-opacity="0.25" />
    <path d="${path}" stroke="${BRAND.navy}" stroke-width="2" fill="none" />
    ${dots}
  </svg>`;
}

function svgPieChart(items, opts = {}) {
  const w = opts.width || 220;
  const h = opts.height || 220;
  const arr = (items || []).filter((x) => Number(x.value) > 0);
  if (!arr.length) return `<div class="empty">Sin datos</div>`;
  const total = arr.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 8;
  const palette = [BRAND.amber, BRAND.navy, BRAND.green, BRAND.red, '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
  let acc = -Math.PI / 2;
  const slices = arr.map((d, i) => {
    const v = Number(d.value) || 0;
    const ang = (v / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(acc);
    const y1 = cy + r * Math.sin(acc);
    acc += ang;
    const x2 = cx + r * Math.cos(acc);
    const y2 = cy + r * Math.sin(acc);
    const large = ang > Math.PI ? 1 : 0;
    const path = `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    return `<path d="${path}" fill="${palette[i % palette.length]}" stroke="white" stroke-width="2" />`;
  }).join('');
  const legend = arr.map((d, i) => {
    const v = Number(d.value) || 0;
    const pct = ((v / total) * 100).toFixed(1);
    return `<div class="item"><span class="dot" style="background:${palette[i % palette.length]}"></span>${esc(d.label)} &middot; ${pct}%</div>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">${slices}</svg>
    <div class="legend">${legend}</div>`;
}

// ---------- Data fetch helpers ----------
async function fetchSales(supa, tenantId, from, to) {
  if (!supa) return [];
  const q = supa.from('sales').select('*').eq('tenant_id', tenantId);
  if (from) q.gte('created_at', from);
  if (to) q.lte('created_at', to);
  q.order('created_at', { ascending: true }).limit(20000);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

async function fetchSaleItems(supa, tenantId, from, to) {
  if (!supa) return [];
  const q = supa.from('sale_items').select('*').eq('tenant_id', tenantId);
  if (from) q.gte('created_at', from);
  if (to) q.lte('created_at', to);
  q.limit(50000);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

// ---------- Routes ----------

// 1) Sales report
async function reportSales(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const tenantId = q.tenant_id;
  const from = q.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = q.to || new Date().toISOString().slice(0, 10);
  if (!tenantId) return sendJSON(res, 400, { error: 'tenant_id_required' });

  const tenant = await getTenant(supa, tenantId);
  const sales = await fetchSales(supa, tenantId, from, to + 'T23:59:59');
  const items = await fetchSaleItems(supa, tenantId, from, to + 'T23:59:59');

  const totalSales = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const txCount = sales.length;
  const avgTicket = txCount ? totalSales / txCount : 0;
  const totalItems = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);

  // Top products
  const prodMap = new Map();
  for (const it of items) {
    const key = it.product_id || it.product_name || 'sin-id';
    const cur = prodMap.get(key) || { name: it.product_name || it.name || key, qty: 0, total: 0 };
    cur.qty += Number(it.quantity) || 0;
    cur.total += Number(it.total) || (Number(it.price) || 0) * (Number(it.quantity) || 0);
    prodMap.set(key, cur);
  }
  const topProducts = [...prodMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

  // Daily series
  const byDay = new Map();
  for (const s of sales) {
    const d = String(s.created_at || '').slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + (Number(s.total) || 0));
  }
  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ label: d.slice(5), value: v }));

  // Payment methods
  const payMap = new Map();
  for (const s of sales) {
    const m = s.payment_method || s.method || 'otro';
    payMap.set(m, (payMap.get(m) || 0) + (Number(s.total) || 0));
  }
  const payments = [...payMap.entries()].map(([k, v]) => ({ label: k, value: v }));

  const body = `
${headerHTML(tenant, 'Reporte de Ventas', `Del ${fmtShortDate(from)} al ${fmtShortDate(to)}`, '')}

<div class="kpi-grid">
  <div class="kpi"><div class="label">Ventas totales</div><div class="value">${fmtMXN(totalSales)}</div></div>
  <div class="kpi"><div class="label">Transacciones</div><div class="value">${fmtNum(txCount)}</div></div>
  <div class="kpi"><div class="label">Ticket promedio</div><div class="value">${fmtMXN(avgTicket)}</div></div>
  <div class="kpi"><div class="label">Artículos vendidos</div><div class="value">${fmtNum(totalItems)}</div></div>
</div>

<div class="chart-row">
  <div class="chart-card">
    <h3>Ventas diarias</h3>
    ${svgLineChart(series, { formatValue: fmtMXN })}
  </div>
  <div class="chart-card">
    <h3>Métodos de pago</h3>
    ${svgPieChart(payments)}
  </div>
</div>

<h2>Top 10 productos</h2>
${topProducts.length ? `
<table>
  <thead><tr><th>#</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Total</th></tr></thead>
  <tbody>
    ${topProducts.map((p, i) => `<tr>
      <td class="muted">${i + 1}</td>
      <td>${esc(p.name)}</td>
      <td class="num">${fmtNum(p.qty)}</td>
      <td class="num">${fmtMXN(p.total)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="empty">Sin productos en el periodo</div>'}

<h2>Detalle por día</h2>
${series.length ? `
<table>
  <thead><tr><th>Fecha</th><th class="num">Ventas</th></tr></thead>
  <tbody>
    ${series.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${fmtMXN(d.value)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${fmtMXN(totalSales)}</td></tr>
  </tbody>
</table>` : '<div class="empty">Sin movimientos</div>'}
`;

  send(res, parsedUrl, htmlShell({ title: `Ventas ${from}_${to}`, body }), `ventas_${from}_${to}`);
  return true;
}

// 2) Inventory report
async function reportInventory(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const tenantId = q.tenant_id;
  if (!tenantId) return sendJSON(res, 400, { error: 'tenant_id_required' });

  const tenant = await getTenant(supa, tenantId);
  const { data: products } = await supa.from('products').select('*').eq('tenant_id', tenantId).limit(20000);
  const list = products || [];

  let totalValue = 0;
  let lowStock = 0;
  const byCat = new Map();
  for (const p of list) {
    const stock = Number(p.stock) || 0;
    const cost = Number(p.cost ?? p.price ?? 0);
    totalValue += stock * cost;
    if ((Number(p.min_stock) || 0) > 0 && stock <= (Number(p.min_stock) || 0)) lowStock++;
    const cat = p.category || p.category_name || 'Sin categoría';
    const cur = byCat.get(cat) || { count: 0, value: 0 };
    cur.count += 1;
    cur.value += stock * cost;
    byCat.set(cat, cur);
  }
  const cats = [...byCat.entries()].map(([k, v]) => ({ label: k, ...v })).sort((a, b) => b.value - a.value);

  const body = `
${headerHTML(tenant, 'Reporte de Inventario', '', `Corte: ${fmtDate(new Date())}`)}

<div class="kpi-grid">
  <div class="kpi"><div class="label">Productos</div><div class="value">${fmtNum(list.length)}</div></div>
  <div class="kpi"><div class="label">Valor total</div><div class="value">${fmtMXN(totalValue)}</div></div>
  <div class="kpi"><div class="label">Stock bajo</div><div class="value">${fmtNum(lowStock)}</div></div>
  <div class="kpi"><div class="label">Categorías</div><div class="value">${fmtNum(cats.length)}</div></div>
</div>

<div class="chart-row">
  <div class="chart-card">
    <h3>Valor por categoría</h3>
    ${svgBarChart(cats.slice(0, 10).map((c) => ({ label: c.label.slice(0, 10), value: c.value })), { formatValue: fmtMXN })}
  </div>
  <div class="chart-card">
    <h3>Distribución</h3>
    ${svgPieChart(cats.slice(0, 8).map((c) => ({ label: c.label, value: c.value })))}
  </div>
</div>

<h2>Productos</h2>
${list.length ? `
<table>
  <thead><tr>
    <th>SKU</th><th>Producto</th><th>Categoría</th>
    <th class="num">Stock</th><th class="num">Mín.</th><th class="num">Costo</th><th class="num">Valor</th><th>Estado</th>
  </tr></thead>
  <tbody>
    ${list.map((p) => {
      const stock = Number(p.stock) || 0;
      const min = Number(p.min_stock) || 0;
      const cost = Number(p.cost ?? p.price ?? 0);
      const status = stock <= 0 ? '<span class="pill bad">Agotado</span>'
        : (min > 0 && stock <= min) ? '<span class="pill warn">Bajo</span>'
        : '<span class="pill ok">OK</span>';
      return `<tr>
        <td class="muted">${esc(p.sku || p.code || '-')}</td>
        <td>${esc(p.name || '')}</td>
        <td class="muted">${esc(p.category || p.category_name || '-')}</td>
        <td class="num">${fmtNum(stock)}</td>
        <td class="num">${fmtNum(min)}</td>
        <td class="num">${fmtMXN(cost)}</td>
        <td class="num">${fmtMXN(stock * cost)}</td>
        <td>${status}</td>
      </tr>`;
    }).join('')}
    <tr class="total"><td colspan="6">Total</td><td class="num">${fmtMXN(totalValue)}</td><td></td></tr>
  </tbody>
</table>` : '<div class="empty">Sin productos</div>'}
`;

  send(res, parsedUrl, htmlShell({ title: 'Inventario', body }), 'inventario');
  return true;
}

// 3) Customers report
async function reportCustomers(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const tenantId = q.tenant_id;
  const period = q.period || '90';
  if (!tenantId) return sendJSON(res, 400, { error: 'tenant_id_required' });

  const fromIso = new Date(Date.now() - Number(period) * 86400000).toISOString();
  const tenant = await getTenant(supa, tenantId);
  const sales = await fetchSales(supa, tenantId, fromIso, new Date().toISOString());

  const map = new Map();
  for (const s of sales) {
    const id = s.customer_id || s.customer_email || s.customer_name || 'walk-in';
    const cur = map.get(id) || { id, name: s.customer_name || 'Cliente general', email: s.customer_email || '', spend: 0, count: 0, last: null };
    cur.spend += Number(s.total) || 0;
    cur.count += 1;
    if (!cur.last || new Date(s.created_at) > new Date(cur.last)) cur.last = s.created_at;
    map.set(id, cur);
  }
  const customers = [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, 100);
  const totalRev = customers.reduce((s, c) => s + c.spend, 0);
  const avg = customers.length ? totalRev / customers.length : 0;

  const body = `
${headerHTML(tenant, 'Top Clientes', `Últimos ${esc(period)} días`, '')}

<div class="kpi-grid three">
  <div class="kpi"><div class="label">Clientes activos</div><div class="value">${fmtNum(customers.length)}</div></div>
  <div class="kpi"><div class="label">Ingreso total</div><div class="value">${fmtMXN(totalRev)}</div></div>
  <div class="kpi"><div class="label">Gasto promedio</div><div class="value">${fmtMXN(avg)}</div></div>
</div>

<div class="chart-card">
  <h3>Top 10 por gasto</h3>
  ${svgBarChart(customers.slice(0, 10).map((c) => ({ label: (c.name || '').slice(0, 8), value: c.spend })), { formatValue: fmtMXN })}
</div>

<h2>Clientes</h2>
${customers.length ? `
<table>
  <thead><tr>
    <th>#</th><th>Cliente</th><th>Email</th>
    <th class="num">Gasto</th><th class="num">Compras</th><th>Última visita</th>
  </tr></thead>
  <tbody>
    ${customers.map((c, i) => `<tr>
      <td class="muted">${i + 1}</td>
      <td>${esc(c.name)}</td>
      <td class="muted">${esc(c.email)}</td>
      <td class="num">${fmtMXN(c.spend)}</td>
      <td class="num">${fmtNum(c.count)}</td>
      <td>${esc(fmtShortDate(c.last))}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="empty">Sin clientes en el periodo</div>'}
`;

  send(res, parsedUrl, htmlShell({ title: 'Top Clientes', body }), `clientes_${period}d`);
  return true;
}

// 4) Cash cut Z-report
async function reportCashCut(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const cutId = q.cut_id;
  if (!cutId) return sendJSON(res, 400, { error: 'cut_id_required' });

  const { data: cut } = await supa.from('cash_cuts').select('*').eq('id', cutId).single();
  if (!cut) return sendJSON(res, 404, { error: 'not_found' });
  const tenant = await getTenant(supa, cut.tenant_id);

  const opening = Number(cut.opening_amount) || 0;
  const expected = Number(cut.expected_amount) || 0;
  const actual = Number(cut.actual_amount ?? cut.closing_amount) || 0;
  const diff = actual - expected;

  const sales = await fetchSales(supa, cut.tenant_id, cut.opened_at, cut.closed_at || new Date().toISOString());
  const byMethod = new Map();
  for (const s of sales) {
    const m = s.payment_method || 'otro';
    byMethod.set(m, (byMethod.get(m) || 0) + (Number(s.total) || 0));
  }
  const methods = [...byMethod.entries()].map(([k, v]) => ({ label: k, value: v }));
  const totalSales = methods.reduce((a, b) => a + b.value, 0);

  const body = `
${headerHTML(tenant, 'Corte de Caja Z', `Folio: ${esc(cut.folio || cut.id)}`, `Cajero: ${esc(cut.cashier_name || '-')}`)}

<div class="kpi-grid">
  <div class="kpi"><div class="label">Apertura</div><div class="value">${fmtMXN(opening)}</div></div>
  <div class="kpi"><div class="label">Ventas</div><div class="value">${fmtMXN(totalSales)}</div></div>
  <div class="kpi"><div class="label">Esperado</div><div class="value">${fmtMXN(expected)}</div></div>
  <div class="kpi" style="border-left-color:${diff === 0 ? BRAND.green : (diff > 0 ? BRAND.amber : BRAND.red)}">
    <div class="label">Diferencia</div>
    <div class="value">${fmtMXN(diff)}</div>
    <div class="delta ${diff < 0 ? 'down' : 'up'}">${diff === 0 ? 'Cuadrado' : (diff > 0 ? 'Sobrante' : 'Faltante')}</div>
  </div>
</div>

<div class="chart-row">
  <div class="chart-card">
    <h3>Ventas por método</h3>
    <table>
      <thead><tr><th>Método</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${methods.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${fmtMXN(m.value)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sin movimientos</td></tr>'}
        <tr class="total"><td>Total</td><td class="num">${fmtMXN(totalSales)}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="chart-card">
    <h3>Distribución</h3>
    ${svgPieChart(methods)}
  </div>
</div>

<h2>Resumen</h2>
<table>
  <tbody>
    <tr><td>Apertura</td><td class="num">${fmtMXN(opening)}</td></tr>
    <tr><td>+ Ventas en efectivo</td><td class="num">${fmtMXN(byMethod.get('efectivo') || byMethod.get('cash') || 0)}</td></tr>
    <tr><td>= Esperado en caja</td><td class="num">${fmtMXN(expected)}</td></tr>
    <tr><td>Conteo real</td><td class="num">${fmtMXN(actual)}</td></tr>
    <tr class="total"><td>Diferencia</td><td class="num">${fmtMXN(diff)}</td></tr>
  </tbody>
</table>

<p class="muted" style="margin-top:8px;font-size:9pt;color:${BRAND.gray}">
  Apertura: ${esc(fmtDateTime(cut.opened_at))} &middot; Cierre: ${esc(fmtDateTime(cut.closed_at))}
</p>

<div class="signature-row">
  <div class="signature">Firma cajero<br/>${esc(cut.cashier_name || '')}</div>
  <div class="signature">Firma supervisor</div>
</div>
`;

  send(res, parsedUrl, htmlShell({ title: `Corte ${cut.folio || cut.id}`, body }), `corte_${cut.folio || cut.id}`);
  return true;
}

// 5) Profit report
async function reportProfit(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const tenantId = q.tenant_id;
  const from = q.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = q.to || new Date().toISOString().slice(0, 10);
  if (!tenantId) return sendJSON(res, 400, { error: 'tenant_id_required' });

  const tenant = await getTenant(supa, tenantId);
  const items = await fetchSaleItems(supa, tenantId, from, to + 'T23:59:59');
  const { data: products } = await supa.from('products').select('id,cost,category,category_name').eq('tenant_id', tenantId).limit(20000);
  const costMap = new Map();
  const catMap = new Map();
  for (const p of (products || [])) {
    costMap.set(p.id, Number(p.cost) || 0);
    catMap.set(p.id, p.category || p.category_name || 'Sin categoría');
  }

  let revenue = 0;
  let cogs = 0;
  const byCat = new Map();
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const total = Number(it.total) || (Number(it.price) || 0) * qty;
    const unitCost = Number(it.cost) || costMap.get(it.product_id) || 0;
    const itemCost = unitCost * qty;
    revenue += total;
    cogs += itemCost;
    const cat = it.category || catMap.get(it.product_id) || 'Sin categoría';
    const cur = byCat.get(cat) || { revenue: 0, cogs: 0 };
    cur.revenue += total;
    cur.cogs += itemCost;
    byCat.set(cat, cur);
  }
  const gross = revenue - cogs;
  const margin = revenue ? (gross / revenue) * 100 : 0;

  const cats = [...byCat.entries()].map(([k, v]) => ({
    name: k, revenue: v.revenue, cogs: v.cogs, profit: v.revenue - v.cogs,
    margin: v.revenue ? ((v.revenue - v.cogs) / v.revenue) * 100 : 0,
  })).sort((a, b) => b.profit - a.profit);

  const body = `
${headerHTML(tenant, 'Reporte de Utilidad', `Del ${fmtShortDate(from)} al ${fmtShortDate(to)}`, '')}

<div class="kpi-grid">
  <div class="kpi"><div class="label">Ingresos</div><div class="value">${fmtMXN(revenue)}</div></div>
  <div class="kpi" style="border-left-color:${BRAND.red}"><div class="label">COGS</div><div class="value">${fmtMXN(cogs)}</div></div>
  <div class="kpi" style="border-left-color:${BRAND.green}"><div class="label">Utilidad bruta</div><div class="value">${fmtMXN(gross)}</div></div>
  <div class="kpi" style="border-left-color:${BRAND.navy}"><div class="label">Margen</div><div class="value">${fmtNum(margin, 1)}%</div></div>
</div>

<div class="chart-card">
  <h3>Utilidad por categoría</h3>
  ${svgBarChart(cats.slice(0, 10).map((c) => ({ label: c.name.slice(0, 10), value: c.profit })), { formatValue: fmtMXN })}
</div>

<h2>Detalle por categoría</h2>
${cats.length ? `
<table>
  <thead><tr>
    <th>Categoría</th>
    <th class="num">Ingresos</th><th class="num">COGS</th>
    <th class="num">Utilidad</th><th class="num">Margen</th>
  </tr></thead>
  <tbody>
    ${cats.map((c) => `<tr>
      <td>${esc(c.name)}</td>
      <td class="num">${fmtMXN(c.revenue)}</td>
      <td class="num">${fmtMXN(c.cogs)}</td>
      <td class="num">${fmtMXN(c.profit)}</td>
      <td class="num">${fmtNum(c.margin, 1)}%</td>
    </tr>`).join('')}
    <tr class="total">
      <td>Total</td>
      <td class="num">${fmtMXN(revenue)}</td>
      <td class="num">${fmtMXN(cogs)}</td>
      <td class="num">${fmtMXN(gross)}</td>
      <td class="num">${fmtNum(margin, 1)}%</td>
    </tr>
  </tbody>
</table>` : '<div class="empty">Sin movimientos</div>'}
`;

  send(res, parsedUrl, htmlShell({ title: `Utilidad ${from}_${to}`, body }), `utilidad_${from}_${to}`);
  return true;
}

// 6) Kardex (movement history)
async function reportKardex(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const productId = q.product_id;
  const from = q.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const to = q.to || new Date().toISOString().slice(0, 10);
  if (!productId) return sendJSON(res, 400, { error: 'product_id_required' });

  const { data: product } = await supa.from('products').select('*').eq('id', productId).single();
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  const tenant = await getTenant(supa, product.tenant_id);

  const { data: moves } = await supa.from('inventory_movements')
    .select('*').eq('product_id', productId)
    .gte('created_at', from).lte('created_at', to + 'T23:59:59')
    .order('created_at', { ascending: true }).limit(5000);
  const list = moves || [];

  let running = Number(product.stock_initial ?? 0);
  let totalIn = 0;
  let totalOut = 0;
  const rows = list.map((m) => {
    const qty = Number(m.quantity) || 0;
    const isIn = ['compra', 'entrada', 'ajuste_in', 'devolucion'].includes(String(m.type).toLowerCase()) || qty > 0;
    const inQty = isIn ? Math.abs(qty) : 0;
    const outQty = !isIn ? Math.abs(qty) : 0;
    totalIn += inQty;
    totalOut += outQty;
    running += inQty - outQty;
    return { date: m.created_at, type: m.type, ref: m.reference || m.ref || '', inQty, outQty, balance: running, cost: Number(m.unit_cost || m.cost || 0) };
  });

  const body = `
${headerHTML(tenant, 'Kardex de Producto', esc(product.name || ''), `Del ${fmtShortDate(from)} al ${fmtShortDate(to)}`)}

<div class="kpi-grid">
  <div class="kpi"><div class="label">SKU</div><div class="value" style="font-size:13pt">${esc(product.sku || product.code || '-')}</div></div>
  <div class="kpi" style="border-left-color:${BRAND.green}"><div class="label">Entradas</div><div class="value">${fmtNum(totalIn)}</div></div>
  <div class="kpi" style="border-left-color:${BRAND.red}"><div class="label">Salidas</div><div class="value">${fmtNum(totalOut)}</div></div>
  <div class="kpi"><div class="label">Saldo final</div><div class="value">${fmtNum(running)}</div></div>
</div>

<h2>Movimientos</h2>
${rows.length ? `
<table>
  <thead><tr>
    <th>Fecha</th><th>Tipo</th><th>Referencia</th>
    <th class="num">Entrada</th><th class="num">Salida</th>
    <th class="num">Costo unit.</th><th class="num">Saldo</th>
  </tr></thead>
  <tbody>
    ${rows.map((r) => `<tr>
      <td>${esc(fmtDateTime(r.date))}</td>
      <td>${esc(r.type || '-')}</td>
      <td class="muted">${esc(r.ref)}</td>
      <td class="num" style="color:${BRAND.green}">${r.inQty ? fmtNum(r.inQty) : ''}</td>
      <td class="num" style="color:${BRAND.red}">${r.outQty ? fmtNum(r.outQty) : ''}</td>
      <td class="num">${r.cost ? fmtMXN(r.cost) : '-'}</td>
      <td class="num">${fmtNum(r.balance)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '<div class="empty">Sin movimientos en el periodo</div>'}
`;

  send(res, parsedUrl, htmlShell({ title: `Kardex ${product.sku || productId}`, body }), `kardex_${product.sku || productId}`);
  return true;
}

// 7) CFDI invoice
async function reportCFDI(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const q = parsedUrl.query || {};
  const invoiceId = q.invoice_id;
  if (!invoiceId) return sendJSON(res, 400, { error: 'invoice_id_required' });

  const { data: inv } = await supa.from('invoices').select('*').eq('id', invoiceId).single();
  if (!inv) return sendJSON(res, 404, { error: 'not_found' });
  const tenant = await getTenant(supa, inv.tenant_id);
  const { data: items } = await supa.from('invoice_items').select('*').eq('invoice_id', invoiceId);
  const lines = items || [];

  const subtotal = lines.reduce((s, it) => s + (Number(it.subtotal) || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);
  const tax = lines.reduce((s, it) => s + (Number(it.tax) || 0), 0) || (Number(inv.tax) || 0);
  const total = Number(inv.total) || (subtotal + tax);

  const body = `
${headerHTML(tenant, 'Comprobante Fiscal Digital (CFDI)', `Folio: ${esc(inv.folio || inv.id)}`, `Serie: ${esc(inv.serie || 'A')}`)}

<div class="kpi-grid two">
  <div class="kpi">
    <div class="label">Emisor</div>
    <div class="value" style="font-size:11pt">${esc((tenant && tenant.name) || '-')}</div>
    <div class="delta">RFC: ${esc((tenant && (tenant.rfc || tenant.tax_id)) || '-')}</div>
  </div>
  <div class="kpi" style="border-left-color:${BRAND.navy}">
    <div class="label">Receptor</div>
    <div class="value" style="font-size:11pt">${esc(inv.customer_name || '-')}</div>
    <div class="delta">RFC: ${esc(inv.customer_rfc || '-')} &middot; Uso: ${esc(inv.cfdi_use || '-')}</div>
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="label">UUID</div><div class="value" style="font-size:9pt;word-break:break-all">${esc(inv.uuid || '-')}</div></div>
  <div class="kpi"><div class="label">Fecha</div><div class="value" style="font-size:11pt">${esc(fmtDateTime(inv.created_at || inv.issued_at))}</div></div>
  <div class="kpi"><div class="label">Forma pago</div><div class="value" style="font-size:11pt">${esc(inv.payment_form || '-')}</div></div>
  <div class="kpi"><div class="label">Método</div><div class="value" style="font-size:11pt">${esc(inv.payment_method || '-')}</div></div>
</div>

<h2>Conceptos</h2>
<table>
  <thead><tr>
    <th>Clave</th><th>Descripción</th>
    <th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th>
  </tr></thead>
  <tbody>
    ${lines.map((it) => `<tr>
      <td class="muted">${esc(it.product_code || it.sat_key || '-')}</td>
      <td>${esc(it.description || it.name || '')}</td>
      <td class="num">${fmtNum(it.quantity)}</td>
      <td class="num">${fmtMXN(it.unit_price)}</td>
      <td class="num">${fmtMXN(it.subtotal || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">Sin conceptos</td></tr>'}
  </tbody>
</table>

<table style="max-width:300px;margin-left:auto;">
  <tbody>
    <tr><td>Subtotal</td><td class="num">${fmtMXN(subtotal)}</td></tr>
    <tr><td>IVA</td><td class="num">${fmtMXN(tax)}</td></tr>
    <tr class="total"><td>Total</td><td class="num">${fmtMXN(total)}</td></tr>
  </tbody>
</table>

${inv.sello_cfd ? `<h3>Sello CFD</h3><p style="font-size:7pt;word-break:break-all;color:${BRAND.gray}">${esc(inv.sello_cfd)}</p>` : ''}
${inv.sello_sat ? `<h3>Sello SAT</h3><p style="font-size:7pt;word-break:break-all;color:${BRAND.gray}">${esc(inv.sello_sat)}</p>` : ''}
${inv.cadena_original ? `<h3>Cadena original</h3><p style="font-size:7pt;word-break:break-all;color:${BRAND.gray}">${esc(inv.cadena_original)}</p>` : ''}

<p style="font-size:8.5pt;color:${BRAND.gray};margin-top:12px">
Este documento es una representación impresa de un CFDI. Para validar consulte el portal del SAT.
</p>
`;

  send(res, parsedUrl, htmlShell({ title: `CFDI ${inv.folio || inv.id}`, body }), `cfdi_${inv.folio || inv.id}`);
  return true;
}

// 8) Custom report
async function reportCustom(req, res, parsedUrl, ctx) {
  const user = await authCheck(req, ctx);
  if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
  const supa = getSupabase(ctx);
  if (!supa) return sendJSON(res, 500, { error: 'supabase_unavailable' });

  const body = await readBody(req);
  const title = body.title || 'Reporte personalizado';
  const tenantId = body.tenant_id;
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const tenant = tenantId ? await getTenant(supa, tenantId) : null;

  const rendered = sections.map((sec) => {
    const t = String(sec.type || '').toLowerCase();
    const data = sec.data || {};
    if (t === 'kpis') {
      const items = Array.isArray(data.items) ? data.items : [];
      return `<div class="kpi-grid${items.length === 3 ? ' three' : items.length === 2 ? ' two' : ''}">
        ${items.map((k) => `<div class="kpi">
          <div class="label">${esc(k.label || '')}</div>
          <div class="value">${esc(k.value || '')}</div>
          ${k.delta ? `<div class="delta">${esc(k.delta)}</div>` : ''}
        </div>`).join('')}
      </div>`;
    }
    if (t === 'table') {
      const cols = Array.isArray(data.columns) ? data.columns : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return `${data.title ? `<h2>${esc(data.title)}</h2>` : ''}
        <table>
          <thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label || c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${(Array.isArray(r) ? r : cols.map((c) => r[c.key || c])).map((v, i) => `<td class="${cols[i] && cols[i].num ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
    }
    if (t === 'bar') {
      return `<div class="chart-card">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${svgBarChart(data.items || [])}</div>`;
    }
    if (t === 'line') {
      return `<div class="chart-card">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${svgLineChart(data.items || [])}</div>`;
    }
    if (t === 'pie') {
      return `<div class="chart-card">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${svgPieChart(data.items || [])}</div>`;
    }
    if (t === 'heading') {
      return `<h2>${esc(data.text || '')}</h2>`;
    }
    if (t === 'text') {
      return `<p>${esc(data.text || '')}</p>`;
    }
    if (t === 'html' && typeof data.html === 'string') {
      return data.html;
    }
    return '';
  }).join('\n');

  const html = htmlShell({
    title,
    body: `${headerHTML(tenant, title, body.subtitle || '', body.range || '')}${rendered || '<div class="empty">Sin secciones</div>'}`,
  });

  send(res, parsedUrl, html, title.toLowerCase().replace(/\s+/g, '_'));
  return true;
}

// ---------- Router ----------
const ROUTES = [
  { method: 'GET', path: '/api/reports/sales/pdf', fn: reportSales },
  { method: 'GET', path: '/api/reports/inventory/pdf', fn: reportInventory },
  { method: 'GET', path: '/api/reports/customers/pdf', fn: reportCustomers },
  { method: 'GET', path: '/api/reports/cash-cut/pdf', fn: reportCashCut },
  { method: 'GET', path: '/api/reports/profit/pdf', fn: reportProfit },
  { method: 'GET', path: '/api/reports/kardex/pdf', fn: reportKardex },
  { method: 'GET', path: '/api/reports/cfdi/pdf', fn: reportCFDI },
  { method: 'POST', path: '/api/reports/custom/pdf', fn: reportCustom },
];

module.exports = async function handlePDF(req, res, parsedUrl, ctx) {
  try {
    const path = (parsedUrl && parsedUrl.pathname) || req.url || '';
    const method = (req.method || 'GET').toUpperCase();
    const route = ROUTES.find((r) => r.method === method && path === r.path);
    if (!route) return false;
    await route.fn(req, res, parsedUrl, ctx || {});
    return true;
  } catch (err) {
    try {
      sendJSON(res, 500, { error: 'pdf_export_failed', detail: String(err && err.message || err) });
    } catch {}
    return true;
  }
};

module.exports.routes = ROUTES.map((r) => `${r.method} ${r.path}`);
