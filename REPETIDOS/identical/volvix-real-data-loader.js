/* volvix-real-data-loader.js
 * Replaces hardcoded/mock counts with real API data on DOM ready.
 * Safe override: if API fails, leaves the existing value intact.
 * Looks for elements by id (m-prods, m-cust, m-sales, m-tickets, inv-sub)
 * and by data-kpi attribute (ai_tickets_resolved, ai_tickets_pct).
 */
(function () {
  'use strict';

  function getTenantId() {
    try {
      if (window.Volvix && Volvix.session && Volvix.session.tenant_id) return Volvix.session.tenant_id;
    } catch (e) {}
    try {
      var s = localStorage.getItem('volvix_session');
      if (s) { var o = JSON.parse(s); if (o && o.tenant_id) return o.tenant_id; }
    } catch (e) {}
    return 'TNT001';
  }

  function authFetch(url) {
    try {
      if (window.Volvix && Volvix.auth && typeof Volvix.auth.fetch === 'function') {
        return Volvix.auth.fetch(url);
      }
    } catch (e) {}
    return fetch(url, { credentials: 'include' });
  }

  function asArray(d) {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.items)) return d.items;
    if (d && Array.isArray(d.data))  return d.data;
    return null;
  }

  function setText(el, txt) {
    if (!el) return;
    el.textContent = txt;
  }

  function setById(id, txt) {
    setText(document.getElementById(id), txt);
  }

  function setKpi(name, txt) {
    document.querySelectorAll('[data-kpi="' + name + '"]').forEach(function (el) {
      el.textContent = txt;
    });
  }

  async function loadProductsReal(tid) {
    try {
      var r = await authFetch('/api/products?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      var arr = asArray(j);
      if (!arr) return;
      window.PRODUCTS_REAL = arr;
      var lowStock = arr.filter(function (p) { return (p.stock || 0) < 20; }).length;
      setById('m-prods', arr.length.toLocaleString());
      var inv = document.getElementById('inv-sub');
      if (inv) inv.textContent = arr.length + ' productos · ' + lowStock + ' con stock bajo';
      document.querySelectorAll('.product-count').forEach(function (el) {
        el.textContent = arr.length + ' productos';
      });
      if (typeof window.renderProductsList === 'function') {
        try { window.renderProductsList(arr); } catch (e) {}
      }
    } catch (e) { console.warn('[volvix-real-data-loader] products failed', e); }
  }

  async function loadCustomersReal(tid) {
    try {
      var r = await authFetch('/api/customers?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      var arr = asArray(j);
      if (!arr) return;
      window.CUSTOMERS_REAL = arr;
      setById('m-cust', arr.length.toLocaleString());
      document.querySelectorAll('.customer-count').forEach(function (el) {
        el.textContent = arr.length + ' clientes';
      });
    } catch (e) { console.warn('[volvix-real-data-loader] customers failed', e); }
  }

  async function loadSalesReal(tid) {
    try {
      var r = await authFetch('/api/sales?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      var arr = asArray(j);
      if (!arr) return;
      window.SALES_REAL = arr;
      // R29: separar ventas TOTALES vs ventas DE HOY (label "Ventas hoy")
      var todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      var todaySales = arr.filter(function(s){
        var d = new Date(s.created_at || s.date || 0);
        return !isNaN(d) && d >= todayStart;
      });
      // m-tickets es contador (cantidad de ventas hoy)
      setById('m-tickets', todaySales.length.toLocaleString());
      // m-sales es monto de hoy, NO el total histórico
      var totalToday = todaySales.reduce(function (s, x) { return s + (Number(x.total) || 0); }, 0);
      setById('m-sales', '$' + Math.round(totalToday).toLocaleString());
      document.querySelectorAll('.sales-count').forEach(function (el) {
        el.textContent = arr.length + ' ventas';
      });
    } catch (e) { console.warn('[volvix-real-data-loader] sales failed', e); }
  }

  async function loadAITickets(tid) {
    try {
      var r = await authFetch('/api/ai/tickets/stats?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      if (!j) return;
      if (j.resolved != null) setKpi('ai_tickets_resolved', Number(j.resolved).toLocaleString());
      if (j.pct != null)      setKpi('ai_tickets_pct', Number(j.pct).toFixed(1) + '%');
    } catch (e) { /* silent — endpoint may not exist */ }
  }

  function fmtMoney(n){ return '$' + Math.round(Number(n)||0).toLocaleString(); }

  async function loadOwnerDashboard(tid) {
    try {
      var r = await authFetch('/api/owner/dashboard?tenant_id=' + encodeURIComponent(tid));
      var raw = await r.json();
      if (!raw) return;
      // B8: el endpoint envuelve KPIs en raw.metrics; soportar ambas formas
      var j = raw.metrics ? Object.assign({}, raw, raw.metrics) : raw;
      if (j.mrr != null)              setKpi('mrr', fmtMoney(j.mrr));
      if (j.arr != null)              setKpi('arr', fmtMoney(j.arr));
      if (j.total_revenue != null)    setKpi('total_revenue', fmtMoney(j.total_revenue));
      if (j.mrr_trend != null)        setKpi('mrr_trend', (Number(j.mrr_trend)>0?'+':'') + Number(j.mrr_trend).toFixed(1) + '%');
      if (j.brands_total != null)     setKpi('brands_total', Number(j.brands_total).toLocaleString());
      if (j.brands_breakdown != null) setKpi('brands_breakdown', String(j.brands_breakdown));
      if (j.active_tenants != null)   setKpi('active_tenants', Number(j.active_tenants).toLocaleString());
      if (j.total_tenants != null)    setKpi('total_tenants', Number(j.total_tenants).toLocaleString());
      if (j.total_users != null)      setKpi('total_users', Number(j.total_users).toLocaleString());
      if (j.active_users != null)     setKpi('active_users', Number(j.active_users).toLocaleString());
      if (j.total_products != null)   setKpi('total_products', Number(j.total_products).toLocaleString());
      if (j.total_customers != null)  setKpi('total_customers', Number(j.total_customers).toLocaleString());
      if (j.total_sales != null)      setKpi('total_sales', Number(j.total_sales).toLocaleString());
      if (j.low_stock_count != null)  setKpi('low_stock_count', Number(j.low_stock_count).toLocaleString());
      if (j.tenants_growth != null)   setKpi('tenants_growth', String(j.tenants_growth));
      if (j.devices_online != null)   setKpi('devices_online', Number(j.devices_online).toLocaleString());
      if (j.devices_sync_pct != null) setKpi('devices_sync_pct', Number(j.devices_sync_pct).toFixed(1) + '% sync');
      if (j.suite_tenants != null)    setKpi('suite_tenants', Number(j.suite_tenants).toLocaleString());
      if (j.suite_devices_active != null) setKpi('suite_devices_active', Number(j.suite_devices_active).toLocaleString());
      if (j.suite_orders_day != null) setKpi('suite_orders_day', Number(j.suite_orders_day).toLocaleString());
      if (j.suite_mrr != null)        setKpi('suite_mrr', fmtMoney(j.suite_mrr));
      // B8: si no hay devices_online del API, derivar de active_users
      if (j.devices_online == null && j.active_users != null) {
        setKpi('devices_online', Number(j.active_users).toLocaleString());
      }
      // B8: si no hay brands_total, usar active_tenants como proxy
      if (j.brands_total == null && j.active_tenants != null) {
        setKpi('brands_total', Number(j.active_tenants).toLocaleString());
      }
    } catch (e) { /* silent */ }
  }

  async function loadOwnerBilling(tid) {
    try {
      var r = await authFetch('/api/owner/billing?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      if (!j) return;
      if (j.invoiced != null)  setKpi('billing_invoiced',  fmtMoney(j.invoiced));
      if (j.collected != null) setKpi('billing_collected', fmtMoney(j.collected));
      if (j.revshare != null)  setKpi('billing_revshare',  fmtMoney(j.revshare));
      if (j.margin != null)    setKpi('billing_margin',    fmtMoney(j.margin));
    } catch (e) {}
  }

  async function loadBillingPlans() {
    try {
      var r = await authFetch('/api/billing/plans');
      var j = await r.json();
      if (!j) return;
      var plans = Array.isArray(j) ? j : (j.plans || j.items || []);
      plans.forEach(function (p) {
        var key = (p.platform || p.key || p.id || '').toLowerCase();
        if (!key) return;
        var price = p.price_per_seat != null ? p.price_per_seat : p.price;
        if (price == null) return;
        document.querySelectorAll('[data-plan-price="' + key + '"]').forEach(function (el) {
          el.textContent = '$' + Number(price) + '/mo';
        });
      });
    } catch (e) {}
  }

  async function loadOwnerSeats(tid) {
    try {
      var r = await authFetch('/api/owner/seats?tenant_id=' + encodeURIComponent(tid));
      var j = await r.json();
      if (!j) return;
      var seats = Array.isArray(j) ? j : (j.seats || j.items || []);
      seats.forEach(function (s) {
        var key = (s.platform || s.key || '').toLowerCase();
        if (!key) return;
        document.querySelectorAll('[data-seat="' + key + '_sold"]').forEach(function (el) { el.textContent = Number(s.sold||0).toLocaleString(); });
        document.querySelectorAll('[data-seat="' + key + '_inuse"]').forEach(function (el) { el.textContent = Number(s.in_use||s.inuse||0).toLocaleString(); });
        document.querySelectorAll('[data-seat="' + key + '_inuse2"]').forEach(function (el) { el.textContent = Number(s.in_use||s.inuse||0).toLocaleString(); });
      });
    } catch (e) {}
  }

  function run() {
    var tid = getTenantId();
    loadProductsReal(tid);
    loadCustomersReal(tid);
    loadSalesReal(tid);
    loadAITickets(tid);
    loadOwnerDashboard(tid);
    loadOwnerBilling(tid);
    loadBillingPlans();
    loadOwnerSeats(tid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
