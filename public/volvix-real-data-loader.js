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
    // 2026-05 BLOQUEANTE-1: /api/users devuelve {ok:true, users:[...]}, /api/credits {credits:[...]}
    if (d && Array.isArray(d.users)) return d.users;
    if (d && Array.isArray(d.credits)) return d.credits;
    if (d && Array.isArray(d.results)) return d.results;
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

  // 2026-05 BLOQUEANTE-1: helper para mutar in-place (los arrays demo son const)
  function _mutate(arr, items) {
    if (!Array.isArray(arr)) return;
    arr.length = 0;
    if (items && items.length) Array.prototype.push.apply(arr, items);
  }

  // 2026-05 BLOQUEANTE-1: convertir un objeto API a la "tuple" que esperan los
  // arrays demo del POS (CUSTOMERS, SALES, USERS, CREDIT). Hacerlo aquí evita
  // tocar las funciones renderXxx() del HTML.
  function _customerToTuple(c) {
    return [
      c.name || c.nombre || c.full_name || '',
      c.phone || c.telefono || '',
      Number(c.credit_limit || c.creditLimit || 0),
      Number(c.credit_balance || c.balance || 0),
      Number(c.points || c.loyalty_points || 0),
      c.last_visit_at || c.last_purchase || c.last_sale_date || '—'
    ];
  }
  function _saleToTuple(s) {
    // 2026-05 BLOQUEANTE-1 folio: pos_sales.folio es INT correlativo por tenant
    // (asignado por trigger zzz_set_folio_pos_sales). Mostrar siempre como
    // "#000XXX" con padding 6. Fallback: sale_number text (otra tabla legacy)
    // o slice del UUID si no hay nada.
    var folioStr;
    if (typeof s.folio === 'number' && s.folio > 0) {
      folioStr = '#' + String(s.folio).padStart(6, '0');
    } else if (s.sale_number) {
      folioStr = '#' + String(s.sale_number);
    } else if (s.id) {
      folioStr = '#' + String(s.id).slice(0, 8);
    } else {
      folioStr = '#';
    }
    return [
      folioStr,
      s.created_at || s.date || '—',
      s.customer_name || 'Público general',
      s.user_name || s.cashier || 'Admin',
      s.payment_method || s.payment || 'Efectivo',
      Number(s.total || 0),
      s.status || 'completed'
    ];
  }
  function _userToTuple(u) {
    var status = (u.status === 'online' || u.is_online) ? 'online' : 'offline';
    return [
      u.username || u.user || u.email || '',
      u.role_label || u.role || 'Cajero',
      u.email || '',
      u.last_seen || u.last_login || '—',
      status
    ];
  }
  function _creditToTuple(c) {
    var lim = Number(c.credit_limit || c.creditLimit || 0);
    var bal = Number(c.credit_balance || c.balance || 0);
    var paid = Math.max(0, lim - bal);
    var status = (bal <= 0) ? 'sin_abonos' : (c.is_overdue || c.overdue ? 'vencido' : 'ok');
    return [
      c.name || c.customer_name || '',
      lim,
      bal,
      paid,
      c.last_payment_date || c.last_purchase || '—',
      status
    ];
  }

  async function loadProductsReal(tid) {
    try {
      var r = await authFetch('/api/products?tenant_id=' + encodeURIComponent(tid));
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      var arr = asArray(j) || [];
      window.PRODUCTS_REAL = arr;
      var lowStock = arr.filter(function (p) { return (p.stock || 0) < 20; }).length;
      setById('m-prods', arr.length.toLocaleString());
      var inv = document.getElementById('inv-sub');
      if (inv) inv.textContent = arr.length + ' productos · ' + lowStock + ' con stock bajo';
      document.querySelectorAll('.product-count').forEach(function (el) {
        el.textContent = arr.length + ' productos';
      });
      // 2026-05 BLOQUEANTE-1: mutar CATALOG y refrescar render+KPIs.
      // CATALOG espera OBJECTS {code, name, price, cost, stock, ...} (no tuples).
      if (Array.isArray(window.CATALOG)) {
        _mutate(window.CATALOG, arr.map(function (p) {
          return {
            code: p.code || p.barcode || '',
            name: p.name || '',
            price: Number(p.price || 0),
            cost: Number(p.cost || 0),
            stock: Number(p.stock || 0),
            min_stock: Number(p.min_stock || p.minimo || 0),
            category: p.category || p.categoria || '',
            id: p.id
          };
        }));
        if (typeof window.renderInv === 'function') window.renderInv();
        if (typeof window.updateInvStats === 'function') window.updateInvStats();
      }
    } catch (e) {
      console.warn('[volvix-real-data-loader] products failed', e);
      // 2026-05 BLOQUEANTE-1: si falla, vaciar arrays demo para no engañar al user.
      if (Array.isArray(window.CATALOG)) {
        _mutate(window.CATALOG, []);
        if (typeof window.renderInv === 'function') window.renderInv();
        if (typeof window.updateInvStats === 'function') window.updateInvStats();
      }
    }
  }

  async function loadCustomersReal(tid) {
    try {
      var r = await authFetch('/api/customers?tenant_id=' + encodeURIComponent(tid));
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      var arr = asArray(j) || [];
      window.CUSTOMERS_REAL = arr;
      setById('m-cust', arr.length.toLocaleString());
      document.querySelectorAll('.customer-count').forEach(function (el) {
        el.textContent = arr.length + ' clientes';
      });
      // 2026-05 BLOQUEANTE-1: mutar CUSTOMERS (tuples) y derivar CREDIT.
      if (Array.isArray(window.CUSTOMERS)) {
        _mutate(window.CUSTOMERS, arr.map(_customerToTuple));
        if (typeof window.renderClientes === 'function') window.renderClientes();
      }
    } catch (e) {
      console.warn('[volvix-real-data-loader] customers failed', e);
      if (Array.isArray(window.CUSTOMERS)) {
        _mutate(window.CUSTOMERS, []);
        if (typeof window.renderClientes === 'function') window.renderClientes();
      }
    }
  }

  async function loadSalesReal(tid) {
    try {
      var r = await authFetch('/api/sales?tenant_id=' + encodeURIComponent(tid));
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      var arr = asArray(j) || [];
      window.SALES_REAL = arr;
      // R29: separar ventas TOTALES vs ventas DE HOY (label "Ventas hoy")
      var todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      var todaySales = arr.filter(function(s){
        var d = new Date(s.created_at || s.date || 0);
        return !isNaN(d) && d >= todayStart;
      });
      setById('m-tickets', todaySales.length.toLocaleString());
      var totalToday = todaySales.reduce(function (s, x) { return s + (Number(x.total) || 0); }, 0);
      setById('m-sales', '$' + Math.round(totalToday).toLocaleString());
      document.querySelectorAll('.sales-count').forEach(function (el) {
        el.textContent = arr.length + ' ventas';
      });
      // 2026-05 BLOQUEANTE-1: mutar SALES (tuples) y refrescar Historial.
      if (Array.isArray(window.SALES)) {
        _mutate(window.SALES, arr.map(_saleToTuple));
        if (typeof window.renderVentas === 'function') window.renderVentas();
      }
    } catch (e) {
      console.warn('[volvix-real-data-loader] sales failed', e);
      if (Array.isArray(window.SALES)) {
        _mutate(window.SALES, []);
        if (typeof window.renderVentas === 'function') window.renderVentas();
      }
    }
  }

  // 2026-05 BLOQUEANTE-1: nuevo loader USERS — antes USERS era SOLO demo.
  // Endpoint real: /api/users (devuelve {ok, users:[...]}).
  async function loadUsersReal(tid) {
    try {
      var r = await authFetch('/api/users?tenant_id=' + encodeURIComponent(tid));
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      var arr = asArray(j) || [];
      window.USERS_REAL = arr;
      if (Array.isArray(window.USERS)) {
        _mutate(window.USERS, arr.map(_userToTuple));
        if (typeof window.renderUsuarios === 'function') window.renderUsuarios();
      }
    } catch (e) {
      console.warn('[volvix-real-data-loader] users failed (vaciando)', e);
      if (Array.isArray(window.USERS)) {
        _mutate(window.USERS, []);
        if (typeof window.renderUsuarios === 'function') window.renderUsuarios();
      }
    }
  }

  // 2026-05 BLOQUEANTE-1: nuevo loader CREDIT — antes CREDIT era SOLO demo.
  // Endpoint real: /api/credits. Si falla (ej. 500 conocido), vaciar.
  async function loadCreditsReal(tid) {
    try {
      var r = await authFetch('/api/credits?tenant_id=' + encodeURIComponent(tid));
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      var arr = asArray(j) || [];
      window.CREDIT_REAL = arr;
      if (Array.isArray(window.CREDIT)) {
        _mutate(window.CREDIT, arr.map(_creditToTuple));
        if (typeof window.renderCredito === 'function') window.renderCredito();
      }
    } catch (e) {
      console.warn('[volvix-real-data-loader] credits failed (vaciando)', e);
      if (Array.isArray(window.CREDIT)) {
        _mutate(window.CREDIT, []);
        if (typeof window.renderCredito === 'function') window.renderCredito();
      }
    }
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
    // 2026-05 BLOQUEANTE-1: nuevos loaders para USERS y CREDIT (antes solo demo).
    loadUsersReal(tid);
    loadCreditsReal(tid);
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
