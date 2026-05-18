/* volvix-ml-wiring.js — R17 ML widget (top-10 forecast + reorder + anomalies)
 * Renders a dashboard widget #volvix-ml-widget. Falls back gracefully when API is empty.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__volvixMLWired) return;
  window.__volvixMLWired = true;

  var API = (window.VOLVIX_API_BASE || '').replace(/\/$/, '');
  function token() {
    try { return localStorage.getItem('volvix_token') || sessionStorage.getItem('volvix_token') || ''; }
    catch (_) { return ''; }
  }
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }
  function apiFetch(path, opts) {
    return fetch(API + path, Object.assign({ headers: authHeaders() }, opts || {}))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); });
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'className') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function renderReorder(host, data) {
    var box = el('div', { className: 'volvix-ml-section' });
    box.appendChild(el('h4', { text: 'Reorder Suggestions (top 10)' }));
    var rows = (data && data.suggestions || []).slice(0, 10);
    if (!rows.length) {
      box.appendChild(el('p', { text: 'No urgent reorders.' }));
      return box;
    }
    var tbl = el('table', { className: 'volvix-ml-table' });
    var thead = el('thead');
    thead.appendChild(el('tr', null, [
      el('th', { text: 'Product' }),
      el('th', { text: 'Stock' }),
      el('th', { text: 'Avg/day' }),
      el('th', { text: 'Days left' }),
      el('th', { text: 'Reorder' }),
      el('th', { text: 'Urgency' })
    ]));
    tbl.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(el('tr', null, [
        el('td', { text: r.name || r.sku || r.product_id }),
        el('td', { text: String(r.stock) }),
        el('td', { text: String(r.avg_daily) }),
        el('td', { text: String(r.days_of_stock) }),
        el('td', { text: String(r.suggested_reorder_qty) }),
        el('td', { text: r.urgency, className: 'urg-' + r.urgency })
      ]));
    });
    tbl.appendChild(tbody);
    box.appendChild(tbl);
    return box;
  }

  function renderAnomalies(host, data) {
    var box = el('div', { className: 'volvix-ml-section' });
    box.appendChild(el('h4', { text: 'Sales Anomalies (last 7d, |z|>2)' }));
    var rows = (data && data.anomalies) || [];
    if (!rows.length) {
      box.appendChild(el('p', { text: 'No anomalies detected.' }));
      return box;
    }
    var ul = el('ul');
    rows.forEach(function (a) {
      ul.appendChild(el('li', {
        text: a.date + ' — ' + a.direction + ' (z=' + a.z_score + ', value=' + a.value + ')'
      }));
    });
    box.appendChild(ul);
    return box;
  }

  function renderForecastSummary(host, data) {
    var box = el('div', { className: 'volvix-ml-section' });
    box.appendChild(el('h4', { text: 'Demand Forecast (sample product, 30d)' }));
    if (!data) { box.appendChild(el('p', { text: 'No data.' })); return box; }
    box.appendChild(el('p', {
      text: 'Total forecast: ' + data.total_forecast +
            ' | Baseline/day: ' + data.baseline_per_day +
            ' | Confidence: ' + data.confidence
    }));
    return box;
  }

  function findHost() {
    var host = document.getElementById('volvix-ml-widget');
    if (host) return host;
    var dash = document.getElementById('dashboard') || document.querySelector('.dashboard');
    if (!dash) return null;
    host = el('div', { id: 'volvix-ml-widget', className: 'volvix-ml-widget' });
    dash.appendChild(host);
    return host;
  }

  async function refresh() {
    var host = findHost();
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(el('h3', { text: 'ML Predictions (R17)' }));
    try {
      var reorder = await apiFetch('/api/ml/inventory/reorder-suggestions').catch(function () { return { suggestions: [] }; });
      host.appendChild(renderReorder(host, reorder));
      // Pick first suggestion as forecast sample
      var sample = (reorder.suggestions || [])[0];
      if (sample && sample.product_id) {
        var fc = await apiFetch('/api/ml/inventory/forecast?product_id=' + encodeURIComponent(sample.product_id) + '&days=30').catch(function () { return null; });
        host.appendChild(renderForecastSummary(host, fc));
      }
      var anom = await apiFetch('/api/ml/sales/anomalies?days=7').catch(function () { return { anomalies: [] }; });
      host.appendChild(renderAnomalies(host, anom));
    } catch (e) {
      host.appendChild(el('p', { text: 'ML widget error: ' + (e && e.message || e) }));
    }
  }

  window.VolvixML = {
    refresh: refresh,
    forecast: function (productId, days) {
      return apiFetch('/api/ml/inventory/forecast?product_id=' + encodeURIComponent(productId) + '&days=' + (days || 30));
    },
    reorder: function () { return apiFetch('/api/ml/inventory/reorder-suggestions'); },
    anomalies: function (days) { return apiFetch('/api/ml/sales/anomalies?days=' + (days || 7)); },
    cluster: function () { return apiFetch('/api/ml/products/cluster', { method: 'POST', body: '{}' }); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
