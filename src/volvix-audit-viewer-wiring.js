/**
 * volvix-audit-viewer-wiring.js
 * Cliente para volvix-audit-viewer.html — admin viewer of audit logs.
 * Uses Volvix.auth.fetch (JWT auth). Endpoint: GET /api/audit-log
 *
 * Query params: from, to, user_id, action, resource, tenant_id, page, limit
 */
(function () {
  'use strict';

  var API = '/api/audit-log';
  var PAGE_SIZE_DEFAULT = 100;
  var AUTO_MS = 60000;

  var state = {
    page: 1,
    limit: PAGE_SIZE_DEFAULT,
    rows: [],
    total: 0,
    autoRefresh: true,
    expanded: new Set()
  };

  // ------------------------------------------------------------------ //
  // Auth fetch wrapper (fall-back if Volvix.auth missing)
  // ------------------------------------------------------------------ //
  function authFetch(url, opts) {
    if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.fetch === 'function') {
      return window.Volvix.auth.fetch(url, opts || {});
    }
    var token = localStorage.getItem('volvix.token') || localStorage.getItem('token') || '';
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, token ? { Authorization: 'Bearer ' + token } : {});
    return fetch(url, opts);
  }

  // ------------------------------------------------------------------ //
  // Build query string from filters
  // ------------------------------------------------------------------ //
  function buildQuery() {
    var qs = [];
    var from = document.getElementById('f-from').value;
    var to   = document.getElementById('f-to').value;
    var u    = document.getElementById('f-user').value.trim();
    var a    = document.getElementById('f-action').value.trim();
    var r    = document.getElementById('f-resource').value.trim();
    var t    = document.getElementById('f-tenant').value.trim();
    var lim  = parseInt(document.getElementById('f-limit').value, 10) || PAGE_SIZE_DEFAULT;

    if (from) qs.push('from=' + encodeURIComponent(new Date(from).toISOString()));
    if (to)   qs.push('to='   + encodeURIComponent(new Date(to).toISOString()));
    if (u)    qs.push('user_id=' + encodeURIComponent(u));
    if (a)    qs.push('action='  + encodeURIComponent(a));
    if (r)    qs.push('resource=' + encodeURIComponent(r));
    if (t)    qs.push('tenant_id=' + encodeURIComponent(t));
    qs.push('limit=' + lim);
    qs.push('page=' + state.page);
    state.limit = lim;
    return qs.join('&');
  }

  // ------------------------------------------------------------------ //
  // Load data
  // ------------------------------------------------------------------ //
  async function load() {
    var errBox = document.getElementById('errorBox');
    errBox.innerHTML = '';
    try {
      var res = await authFetch(API + '?' + buildQuery());
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          errBox.innerHTML = '<div class="err">Acceso denegado. Solo admin/owner/superadmin pueden ver audit logs.</div>';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      var data = await res.json();
      // Backend may return array OR { ok, items, ... }
      if (Array.isArray(data)) {
        state.rows = data;
        state.total = data.length;
      } else {
        state.rows = data.items || [];
        state.total = data.total || state.rows.length;
      }
      render();
      document.getElementById('stat-ts').textContent = new Date().toLocaleTimeString();
    } catch (e) {
      errBox.innerHTML = '<div class="err">Error: ' + (e.message || e) + '</div>';
    }
  }

  // ------------------------------------------------------------------ //
  // Render table (virtual scroll for >1000)
  // ------------------------------------------------------------------ //
  function render() {
    var tbody = document.getElementById('tbody');
    var empty = document.getElementById('empty');
    tbody.innerHTML = '';

    document.getElementById('stat-total').textContent = state.total;
    document.getElementById('stat-page').textContent = state.page;
    document.getElementById('pageNum').textContent = state.page;
    document.getElementById('btnPrev').disabled = state.page <= 1;
    document.getElementById('btnNext').disabled = state.rows.length < state.limit;

    if (!state.rows.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Virtual scroll: only render first 1000 actually in DOM, rest on demand
    var slice = state.rows.length > 1000 ? state.rows.slice(0, 1000) : state.rows;
    var frag = document.createDocumentFragment();

    slice.forEach(function (row, idx) {
      var tr = document.createElement('tr');
      tr.className = 'row';
      tr.dataset.idx = idx;

      var lvl = (row.level || 'info').toLowerCase();
      tr.innerHTML =
        '<td>' + esc(formatTs(row.ts || row.created_at)) + '</td>' +
        '<td class="lvl-' + esc(lvl) + '">' + esc(lvl) + '</td>' +
        '<td>' + esc(row.user_email || row.user_id || '—') + '</td>' +
        '<td>' + esc(row.action || '—') + '</td>' +
        '<td>' + esc(row.resource || row.entity || '—') + '</td>' +
        '<td>' + esc(row.ip || row.ip_address || '—') + '</td>';

      tr.addEventListener('click', function () { toggleDetail(tr, row); });
      frag.appendChild(tr);

      if (state.expanded.has(idx)) {
        frag.appendChild(buildDetailRow(row));
      }
    });
    tbody.appendChild(frag);

    if (state.rows.length > 1000) {
      var note = document.createElement('tr');
      note.innerHTML = '<td colspan="6" style="text-align:center;color:#94a3b8;padding:14px;">' +
        'Mostrando 1000 de ' + state.rows.length + '. Refina filtros para ver más.</td>';
      tbody.appendChild(note);
    }
  }

  function toggleDetail(tr, row) {
    var idx = parseInt(tr.dataset.idx, 10);
    var next = tr.nextElementSibling;
    if (next && next.classList.contains('detail-row')) {
      next.parentNode.removeChild(next);
      state.expanded.delete(idx);
      return;
    }
    state.expanded.add(idx);
    tr.parentNode.insertBefore(buildDetailRow(row), tr.nextSibling);
  }

  function buildDetailRow(row) {
    var tr = document.createElement('tr');
    tr.className = 'detail-row';
    var before = row.before || row.old_value || null;
    var after  = row.after  || row.new_value || null;
    var diffHtml =
      '<div class="diff"><h4>Before</h4><pre>' + esc(JSON.stringify(before, null, 2) || '(vacío)') + '</pre></div>' +
      '<div class="diff"><h4>After</h4><pre>' + esc(JSON.stringify(after, null, 2) || '(vacío)') + '</pre></div>' +
      '<div class="diff"><h4>Raw</h4><pre>' + esc(JSON.stringify(row, null, 2)) + '</pre></div>';
    tr.innerHTML = '<td colspan="6" style="background:#0b1220;">' + diffHtml + '</td>';
    return tr;
  }

  // ------------------------------------------------------------------ //
  // CSV export
  // ------------------------------------------------------------------ //
  function exportCsv() {
    if (!state.rows.length) return;
    var headers = ['ts', 'level', 'user_id', 'user_email', 'action', 'resource', 'ip', 'before', 'after'];
    var lines = [headers.join(',')];
    state.rows.forEach(function (r) {
      var line = headers.map(function (h) {
        var v = r[h];
        if (h === 'before') v = r.before || r.old_value;
        if (h === 'after')  v = r.after  || r.new_value;
        if (h === 'ip')     v = r.ip || r.ip_address;
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        v = (v === null || v === undefined) ? '' : String(v);
        v = v.replace(/"/g, '""');
        return '"' + v + '"';
      }).join(',');
      lines.push(line);
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'volvix-audit-' + Date.now() + '.csv';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  // ------------------------------------------------------------------ //
  // Helpers
  // ------------------------------------------------------------------ //
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function formatTs(t) {
    if (!t) return '—';
    try { return new Date(t).toLocaleString(); } catch (e) { return t; }
  }

  // ------------------------------------------------------------------ //
  // Wire-up
  // ------------------------------------------------------------------ //
  var autoTimer = null;
  function startAuto() {
    stopAuto();
    autoTimer = setInterval(load, AUTO_MS);
    document.getElementById('auto').textContent = 'Auto-refresh: 60s';
    document.getElementById('toggleAuto').textContent = 'Pausar';
    state.autoRefresh = true;
  }
  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    document.getElementById('auto').textContent = 'Auto-refresh: pausado';
    document.getElementById('toggleAuto').textContent = 'Reanudar';
    state.autoRefresh = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('btnApply').addEventListener('click', function(){ state.page = 1; state.expanded.clear(); load(); });
    document.getElementById('btnClear').addEventListener('click', function () {
      ['f-from','f-to','f-user','f-action','f-resource','f-tenant'].forEach(function(id){ document.getElementById(id).value = ''; });
      state.page = 1; state.expanded.clear(); load();
    });
    document.getElementById('btnExport').addEventListener('click', exportCsv);
    document.getElementById('btnPrev').addEventListener('click', function(){ if (state.page>1){ state.page--; state.expanded.clear(); load(); } });
    document.getElementById('btnNext').addEventListener('click', function(){ state.page++; state.expanded.clear(); load(); });
    document.getElementById('toggleAuto').addEventListener('click', function () {
      if (state.autoRefresh) stopAuto(); else startAuto();
    });
    load();
    startAuto();
  });

  window.VolvixAuditViewer = { reload: load, exportCsv: exportCsv };
})();
