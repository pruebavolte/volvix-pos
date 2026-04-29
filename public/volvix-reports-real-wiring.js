/**
 * volvix-reports-real-wiring.js
 * R14 — Conecta los charts de pos-reportes.html con endpoints reales /api/reports/*.
 * Reemplaza los datos mock por fetch autenticado vía Volvix.auth.fetch + Chart.js.
 *
 * Requiere:
 *   - <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
 *   - window.Volvix.auth.fetch(url, opts)  (provisto por auth-gate.js / volvix-api.js)
 *   - window.Volvix.session.tenant_id
 *
 * Uso:
 *   <script src="volvix-reports-real-wiring.js" defer></script>
 *   VolvixReports.init();   // o auto-init si DOM listo
 */
(function (global) {
  'use strict';

  const API = '/api/reports';
  const charts = {};

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  function authFetch(url) {
    if (global.Volvix && global.Volvix.auth && typeof global.Volvix.auth.fetch === 'function') {
      return global.Volvix.auth.fetch(url);
    }
    const tok = (global.Volvix && global.Volvix.session && global.Volvix.session.access_token) || '';
    return fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
  }

  async function getJSON(path) {
    const r = await authFetch(path);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r.json();
  }

  function fmtMoney(n) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
  }

  function tenantId() {
    return (global.Volvix && global.Volvix.session && global.Volvix.session.tenant_id) || '';
  }

  function qsParams(extra) {
    const p = new URLSearchParams({ tenant_id: tenantId(), ...(extra || {}) });
    return p.toString();
  }

  function destroy(name) {
    if (charts[name]) { charts[name].destroy(); delete charts[name]; }
  }

  function getCtx(id) {
    const el = document.getElementById(id);
    return el ? el.getContext('2d') : null;
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  // ─── 1) VENTAS DIARIAS ────────────────────────────────────────────────────
  async function loadSalesDaily(from, to) {
    const data = await getJSON(`${API}/sales/daily?${qsParams({ from, to })}`);
    const rows = data.rows || [];
    const labels = rows.map(r => r.dia);
    const totals = rows.map(r => Number(r.venta_total || 0));
    const tickets = rows.map(r => Number(r.tickets || 0));

    const ctx = getCtx('chartSalesDaily');
    if (!ctx) return data;
    destroy('salesDaily');
    charts.salesDaily = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Venta total', data: totals, borderColor: '#2563eb', tension: 0.3, yAxisID: 'y' },
          { label: 'Tickets', data: tickets, borderColor: '#16a34a', tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y:  { type: 'linear', position: 'left',  title: { display: true, text: 'MXN' } },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Tickets' } },
        },
      },
    });

    const totalMXN = totals.reduce((s, v) => s + v, 0);
    const totalTickets = tickets.reduce((s, v) => s + v, 0);
    setText('kpiVentaTotal', fmtMoney(totalMXN));
    setText('kpiTickets', String(totalTickets));
    setText('kpiTicketProm', fmtMoney(totalTickets ? totalMXN / totalTickets : 0));
    return data;
  }

  // ─── 2) TOP PRODUCTOS ─────────────────────────────────────────────────────
  async function loadTopProducts(from, to, top = 10) {
    const data = await getJSON(`${API}/sales/by-product?${qsParams({ from, to, top })}`);
    const rows = data.rows || [];
    const ctx = getCtx('chartTopProducts');
    if (!ctx) return data;
    destroy('topProducts');
    charts.topProducts = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.nombre),
        datasets: [{ label: 'Ingreso', data: rows.map(r => Number(r.ingreso || 0)), backgroundColor: '#7c3aed' }],
      },
      options: { indexAxis: 'y', responsive: true },
    });
    return data;
  }

  // ─── 3) POR CAJERO ────────────────────────────────────────────────────────
  async function loadByCashier(from, to) {
    const data = await getJSON(`${API}/sales/by-cashier?${qsParams({ from, to })}`);
    const rows = data.rows || [];
    const ctx = getCtx('chartByCashier');
    if (!ctx) return data;
    destroy('byCashier');
    charts.byCashier = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.cajero),
        datasets: [
          { label: 'Venta total', data: rows.map(r => Number(r.venta_total || 0)), backgroundColor: '#0891b2' },
          { label: 'Tickets',     data: rows.map(r => Number(r.tickets || 0)),     backgroundColor: '#f59e0b' },
        ],
      },
      options: { responsive: true },
    });
    return data;
  }

  // ─── 4) VALOR DE INVENTARIO ───────────────────────────────────────────────
  async function loadInventoryValue() {
    const data = await getJSON(`${API}/inventory/value?${qsParams()}`);
    const rows = data.rows || [];
    const ctx = getCtx('chartInventoryValue');
    if (!ctx) return data;
    destroy('inventoryValue');
    charts.inventoryValue = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.categoria),
        datasets: [{ data: rows.map(r => Number(r.valor_costo || 0)) }],
      },
      options: { responsive: true },
    });
    setText('kpiInventarioValor', fmtMoney(data.total_valor_costo));
    return data;
  }

  // ─── 5) COHORTE CLIENTES ──────────────────────────────────────────────────
  async function loadCohort() {
    const data = await getJSON(`${API}/customers/cohort?${qsParams()}`);
    const rows = data.rows || [];
    const ctx = getCtx('chartCohort');
    if (!ctx) return data;
    destroy('cohort');
    charts.cohort = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map(r => r.cohorte_mes),
        datasets: [
          { label: 'Ret 30d %', data: rows.map(r => Number(r.ret_30_pct || 0)), borderColor: '#16a34a', tension: 0.3 },
          { label: 'Ret 60d %', data: rows.map(r => Number(r.ret_60_pct || 0)), borderColor: '#0891b2', tension: 0.3 },
          { label: 'Ret 90d %', data: rows.map(r => Number(r.ret_90_pct || 0)), borderColor: '#dc2626', tension: 0.3 },
        ],
      },
      options: { responsive: true, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } },
    });
    return data;
  }

  // ─── 6) MARGEN BRUTO ──────────────────────────────────────────────────────
  async function loadProfit(from, to) {
    const data = await getJSON(`${API}/profit?${qsParams({ from, to })}`);
    const rows = data.rows || [];
    const ctx = getCtx('chartProfit');
    if (!ctx) return data;
    destroy('profit');
    charts.profit = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.dia),
        datasets: [
          { label: 'Ingreso',  data: rows.map(r => Number(r.ingreso  || 0)), backgroundColor: '#2563eb' },
          { label: 'Costo',    data: rows.map(r => Number(r.costo    || 0)), backgroundColor: '#dc2626' },
          { label: 'Utilidad', data: rows.map(r => Number(r.utilidad || 0)), backgroundColor: '#16a34a' },
        ],
      },
      options: { responsive: true },
    });
    if (data.totals) {
      setText('kpiIngreso',   fmtMoney(data.totals.ingreso));
      setText('kpiCosto',     fmtMoney(data.totals.costo));
      setText('kpiUtilidad',  fmtMoney(data.totals.utilidad));
      setText('kpiMargenPct', (data.totals.margen_pct || 0) + '%');
    }
    return data;
  }

  // ─── 7) ABC ANALYSIS ──────────────────────────────────────────────────────
  async function loadABC(from, to) {
    const data = await getJSON(`${API}/abc-analysis?${qsParams({ from, to })}`);
    const rows = data.rows || [];
    const counts = data.counts || { A: 0, B: 0, C: 0 };
    const ctx = getCtx('chartABC');
    if (!ctx) return data;
    destroy('abc');
    charts.abc = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['A (80% ingreso)', 'B (15%)', 'C (5%)'],
        datasets: [{
          data: [counts.A, counts.B, counts.C],
          backgroundColor: ['#16a34a', '#f59e0b', '#dc2626'],
        }],
      },
      options: { responsive: true },
    });
    // Tabla opcional
    const tbl = document.getElementById('tableABC');
    if (tbl) {
      tbl.innerHTML = '<thead><tr><th>Producto</th><th>Ingreso</th><th>%</th><th>% Acum</th><th>Clase</th></tr></thead>'
        + '<tbody>' + rows.slice(0, 50).map(r =>
          `<tr><td>${r.nombre}</td><td>${fmtMoney(r.ingreso)}</td><td>${r.pct_ingreso}%</td><td>${r.pct_acumulado}%</td><td><b>${r.clase}</b></td></tr>`
        ).join('') + '</tbody>';
    }
    return data;
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function defaultRange() {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  async function loadAll(from, to) {
    const r = (from && to) ? { from, to } : defaultRange();
    const tasks = [
      loadSalesDaily(r.from, r.to),
      loadTopProducts(r.from, r.to, 10),
      loadByCashier(r.from, r.to),
      loadInventoryValue(),
      loadCohort(),
      loadProfit(r.from, r.to),
      loadABC(r.from, r.to),
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach((res, i) => {
      if (res.status === 'rejected') console.error('[reports] task', i, 'failed:', res.reason);
    });
    return results;
  }

  function init() {
    if (typeof Chart === 'undefined') {
      console.error('[VolvixReports] Chart.js no cargado');
      return;
    }
    if (!tenantId()) {
      console.warn('[VolvixReports] sin tenant_id en sesión — abortando');
      return;
    }
    // Botón de refresh manual de MVs (solo admin)
    const btn = document.getElementById('btnRefreshReports');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Refrescando...';
        try {
          await authFetch('/api/reports/refresh').then(r => r.ok || Promise.reject());
          await loadAll();
        } catch (e) { alert('Error refrescando: ' + e.message); }
        btn.disabled = false; btn.textContent = 'Refrescar';
      });
    }
    // Selector de rango (opcional)
    const fromEl = document.getElementById('rangeFrom');
    const toEl   = document.getElementById('rangeTo');
    const apply  = document.getElementById('btnApplyRange');
    if (apply && fromEl && toEl) {
      apply.addEventListener('click', () => loadAll(
        new Date(fromEl.value).toISOString(),
        new Date(toEl.value).toISOString()
      ));
    }
    loadAll();
  }

  global.VolvixReports = {
    init, loadAll,
    loadSalesDaily, loadTopProducts, loadByCashier,
    loadInventoryValue, loadCohort, loadProfit, loadABC,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
