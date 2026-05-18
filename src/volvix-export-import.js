/* ============================================================================
 * volvix-export-import.js
 * Export/Import functionality for Products, Customers, Kardex, and Reports.
 *
 * - Hooks into existing buttons in salvadorex_web_v25.html via querySelector
 *   on DOMContentLoaded. Uses MutationObserver to re-hook if DOM changes.
 * - Pulls data from /api/* with JWT bearer auth (multi-tenant via RLS).
 * - CSV export uses Blob + URL.createObjectURL (no server roundtrip).
 * - XLSX export via SheetJS CDN; CSV import via PapaParse CDN.
 * - Self-contained: idempotent, no globals leaked except window.VolvixExportImport.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__volvixExportImportLoaded) return;
  window.__volvixExportImportLoaded = true;

  // ---------------------------------------------------------------------------
  // Config & helpers
  // ---------------------------------------------------------------------------
  var API_BASE = (window.VOLVIX_API_BASE || '') + '/api';
  var PAPAPARSE_CDN = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
  var SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getToken() {
    try {
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getToken === 'function') {
        return window.Volvix.auth.getToken();
      }
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        return window.VolvixAuth.getToken();
      }
    } catch (_) {}
    return null;
  }

  function getUser() {
    try {
      if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.getUser === 'function') {
        return window.Volvix.auth.getUser();
      }
      if (window.VolvixAuth && typeof window.VolvixAuth.getUser === 'function') {
        return window.VolvixAuth.getUser();
      }
    } catch (_) {}
    return null;
  }

  function getTenantSlug() {
    var u = getUser() || {};
    return (u.tenant_slug || u.tenant || u.tenant_id || 'tenant').toString()
      .replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'tenant';
  }

  function ymdToday() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function api(path, opts) {
    opts = opts || {};
    var token = getToken();
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include'
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (txt) {
          var err = new Error('HTTP ' + r.status + ': ' + txt.slice(0, 200));
          err.status = r.status;
          err.body = txt;
          throw err;
        });
      }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') >= 0) return r.json();
      return r.text();
    });
  }

  function toast(msg, level) {
    level = level || 'info';
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, level); return; } catch (_) {}
    }
    if (window.NotificationsAPI && typeof window.NotificationsAPI.show === 'function') {
      try { window.NotificationsAPI.show({ title: 'Volvix', body: msg, level: level }); return; } catch (_) {}
    }
    var t = document.createElement('div');
    t.textContent = msg;
    t.className = 'vlx-mini-toast vlx-toast-' + level;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:' + (level === 'error' ? '#DC2626' : level === 'success' ? '#10B981' : '#1F2937') + ';' +
      'color:#fff;padding:10px 16px;border-radius:8px;z-index:99999;font-size:13px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve(true);
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------------------
  // CSV utilities (no library needed for export)
  // ---------------------------------------------------------------------------
  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function rowsToCsv(rows, columns) {
    var header = columns.map(function (c) { return csvEscape(c.label || c.key); }).join(',');
    var body = rows.map(function (r) {
      return columns.map(function (c) {
        var v = typeof c.get === 'function' ? c.get(r) : r[c.key];
        return csvEscape(v);
      }).join(',');
    }).join('\n');
    // BOM so Excel detects UTF-8
    return '﻿' + header + '\n' + body;
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime || 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Pagination helper: fetches all pages from a paginated endpoint
  // ---------------------------------------------------------------------------
  function fetchAllPaginated(path, pageSize, onProgress) {
    pageSize = pageSize || 1000;
    var collected = [];
    function fetchPage(offset) {
      var sep = path.indexOf('?') >= 0 ? '&' : '?';
      return api(path + sep + 'limit=' + pageSize + '&offset=' + offset).then(function (resp) {
        var items = Array.isArray(resp) ? resp :
                    Array.isArray(resp.data) ? resp.data :
                    Array.isArray(resp.items) ? resp.items :
                    Array.isArray(resp.results) ? resp.results : [];
        collected = collected.concat(items);
        if (onProgress) onProgress(collected.length, resp.total || null);
        if (items.length < pageSize) return collected;
        return fetchPage(offset + pageSize);
      });
    }
    return fetchPage(0);
  }

  // ---------------------------------------------------------------------------
  // Modal helpers (focus trap, ESC to close, ARIA)
  // ---------------------------------------------------------------------------
  function openModal(opts) {
    // opts: { title, body (HTMLElement|string), buttons: [{text, primary, onClick}], onClose }
    var overlay = document.createElement('div');
    overlay.className = 'vlx-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.title || 'Diálogo');

    var modal = document.createElement('div');
    modal.className = 'vlx-modal';

    var header = document.createElement('div');
    header.className = 'vlx-modal-header';
    var h = document.createElement('h3');
    h.textContent = opts.title || '';
    h.id = 'vlx-modal-title-' + Date.now();
    overlay.setAttribute('aria-labelledby', h.id);
    header.appendChild(h);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vlx-modal-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'vlx-modal-body';
    if (typeof opts.body === 'string') {
      bodyEl.innerHTML = opts.body;
    } else if (opts.body instanceof Element) {
      bodyEl.appendChild(opts.body);
    }
    modal.appendChild(bodyEl);

    var footer = document.createElement('div');
    footer.className = 'vlx-modal-footer';
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vlx-btn ' + (b.primary ? 'vlx-btn-primary' : 'vlx-btn-secondary');
      btn.textContent = b.text;
      if (b.id) btn.id = b.id;
      btn.addEventListener('click', function () {
        try { b.onClick && b.onClick({ close: close, modal: modal, body: bodyEl }); } catch (e) { console.error(e); }
      });
      footer.appendChild(btn);
    });
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus trap
    var focusable;
    function refreshFocusable() {
      focusable = $$('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', modal)
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    }
    refreshFocusable();
    var prevFocus = document.activeElement;
    if (focusable[0]) focusable[0].focus();

    function trap(e) {
      if (e.key === 'Tab') {
        refreshFocusable();
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      } else if (e.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', trap);

    function close() {
      document.removeEventListener('keydown', trap);
      overlay.remove();
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (_) {}
      if (opts.onClose) try { opts.onClose(); } catch (_) {}
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    return { close: close, modal: modal, body: bodyEl };
  }

  // ---------------------------------------------------------------------------
  // Progress UI (used during imports / large exports)
  // ---------------------------------------------------------------------------
  function makeProgress(label) {
    var wrap = document.createElement('div');
    wrap.className = 'vlx-progress-wrap';
    wrap.innerHTML =
      '<div class="vlx-progress-label">' + (label || 'Procesando...') + '</div>' +
      '<div class="vlx-progress-bar"><div class="vlx-progress-fill" style="width:0%"></div></div>' +
      '<div class="vlx-progress-text">0 / 0</div>';
    return {
      el: wrap,
      update: function (current, total, msg) {
        var pct = total ? Math.round((current / total) * 100) : 0;
        wrap.querySelector('.vlx-progress-fill').style.width = pct + '%';
        wrap.querySelector('.vlx-progress-text').textContent = current + ' / ' + (total || '?');
        if (msg) wrap.querySelector('.vlx-progress-label').textContent = msg;
      }
    };
  }

  // ===========================================================================
  // FEATURE: Export Products to CSV
  // ===========================================================================
  var PRODUCT_COLUMNS = [
    { key: 'id', label: 'id' },
    { key: 'sku', label: 'sku' },
    { key: 'barcode', label: 'barcode' },
    { key: 'name', label: 'name' },
    { key: 'description', label: 'description' },
    { key: 'price', label: 'price' },
    { key: 'cost', label: 'cost' },
    { key: 'stock', label: 'stock' },
    { key: 'category', label: 'category' },
    { key: 'brand', label: 'brand' },
    { key: 'tax_rate', label: 'tax_rate' },
    { key: 'created_at', label: 'created_at' }
  ];

  function exportProducts() {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }
    toast('Exportando productos...', 'info');
    fetchAllPaginated('/products', 1000, function (n) {
      // Could update a progress here. Keep light for first pass.
    }).then(function (rows) {
      if (!rows.length) { toast('No hay productos para exportar', 'info'); return; }
      var csv = rowsToCsv(rows, PRODUCT_COLUMNS);
      downloadBlob(csv, 'productos-' + getTenantSlug() + '-' + ymdToday() + '.csv');
      toast('Exportados ' + rows.length + ' productos', 'success');
    }).catch(function (e) {
      console.error('[export-import] export products failed', e);
      toast('Error exportando productos: ' + e.message, 'error');
    });
  }

  // ===========================================================================
  // FEATURE: Import Products from CSV
  // ===========================================================================
  function importProducts() {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }
    loadScriptOnce(PAPAPARSE_CDN).then(function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.remove();
        if (!f) return;
        window.Papa.parse(f, {
          header: true,
          skipEmptyLines: true,
          complete: function (res) {
            handleImportPreview(res.data, res.errors);
          },
          error: function (err) {
            toast('Error parseando CSV: ' + err.message, 'error');
          }
        });
      }, { once: true });
      input.click();
    }).catch(function (e) {
      toast('No se pudo cargar PapaParse: ' + e.message, 'error');
    });
  }

  function validateImportRows(rows) {
    var errors = [];
    var valid = [];
    rows.forEach(function (r, idx) {
      var rowNum = idx + 2; // +2 because of header + 1-indexed
      if (!r.name || !String(r.name).trim()) {
        errors.push({ row: rowNum, msg: 'Nombre requerido' });
        return;
      }
      var price = parseFloat(r.price);
      if (isNaN(price) || price < 0) {
        errors.push({ row: rowNum, msg: 'Precio inválido' });
        return;
      }
      var cleaned = {
        sku: r.sku ? String(r.sku).trim() : null,
        barcode: r.barcode ? String(r.barcode).trim() : null,
        name: String(r.name).trim(),
        description: r.description || null,
        price: price,
        cost: r.cost !== undefined && r.cost !== '' ? parseFloat(r.cost) : null,
        stock: r.stock !== undefined && r.stock !== '' ? parseInt(r.stock, 10) : 0,
        category: r.category || null,
        brand: r.brand || null,
        tax_rate: r.tax_rate !== undefined && r.tax_rate !== '' ? parseFloat(r.tax_rate) : null
      };
      valid.push(cleaned);
    });
    // detect duplicate SKUs in file
    var seen = {};
    valid.forEach(function (r, i) {
      if (r.sku) {
        if (seen[r.sku]) errors.push({ row: i + 2, msg: 'SKU duplicado en archivo: ' + r.sku });
        seen[r.sku] = true;
      }
    });
    return { valid: valid, errors: errors };
  }

  function handleImportPreview(rows, parseErrors) {
    var v = validateImportRows(rows);
    var content = document.createElement('div');
    var summary = document.createElement('div');
    summary.className = 'vlx-import-summary';
    summary.innerHTML =
      '<p><strong>Filas leídas:</strong> ' + rows.length + '</p>' +
      '<p><strong>Válidas:</strong> ' + v.valid.length + '</p>' +
      '<p><strong>Con errores:</strong> ' + v.errors.length + '</p>';
    content.appendChild(summary);

    if (v.errors.length) {
      var errBox = document.createElement('div');
      errBox.className = 'vlx-import-errors';
      errBox.innerHTML = '<strong>Errores (primeros 20):</strong>';
      var ul = document.createElement('ul');
      v.errors.slice(0, 20).forEach(function (e) {
        var li = document.createElement('li');
        li.textContent = 'Fila ' + e.row + ': ' + e.msg;
        ul.appendChild(li);
      });
      errBox.appendChild(ul);
      content.appendChild(errBox);
    }

    if (v.valid.length) {
      var tableWrap = document.createElement('div');
      tableWrap.className = 'vlx-import-preview';
      var tbl = document.createElement('table');
      tbl.className = 'vlx-csv-table';
      var thead = '<thead><tr>' + ['sku', 'name', 'price', 'stock', 'category'].map(function (c) {
        return '<th>' + c + '</th>';
      }).join('') + '</tr></thead>';
      var tbody = '<tbody>' + v.valid.slice(0, 10).map(function (r) {
        return '<tr>' +
          '<td>' + (r.sku || '') + '</td>' +
          '<td>' + r.name + '</td>' +
          '<td>' + r.price + '</td>' +
          '<td>' + (r.stock || 0) + '</td>' +
          '<td>' + (r.category || '') + '</td>' +
        '</tr>';
      }).join('') + '</tbody>';
      tbl.innerHTML = thead + tbody;
      tableWrap.appendChild(tbl);
      var preNote = document.createElement('p');
      preNote.style.cssText = 'font-size:12px;color:#9CA3AF;margin-top:4px;';
      preNote.textContent = 'Mostrando los primeros 10 de ' + v.valid.length + ' productos válidos.';
      tableWrap.appendChild(preNote);
      content.appendChild(tableWrap);
    }

    var modalCtl;
    modalCtl = openModal({
      title: 'Vista previa de importación',
      body: content,
      buttons: [
        { text: 'Cancelar', onClick: function (ctx) { ctx.close(); } },
        {
          text: 'Importar ' + v.valid.length + ' productos',
          primary: true,
          onClick: function (ctx) {
            if (!v.valid.length) { toast('Nada que importar', 'info'); return; }
            ctx.close();
            runImport(v.valid);
          }
        }
      ]
    });
  }

  function runImport(rows) {
    var progressUI = makeProgress('Importando productos...');
    var progressContainer = document.createElement('div');
    progressContainer.appendChild(progressUI.el);
    var modalCtl = openModal({
      title: 'Importando productos',
      body: progressContainer,
      buttons: [{ text: 'Cancelar', onClick: function (ctx) { cancelled = true; ctx.close(); } }]
    });
    var BATCH = 100;
    var imported = 0;
    var failed = [];
    var cancelled = false;

    function batchAt(i) {
      if (cancelled) return Promise.resolve();
      if (i >= rows.length) return Promise.resolve();
      var slice = rows.slice(i, i + BATCH);
      return api('/products/bulk', { method: 'POST', body: { products: slice } })
        .then(function (resp) {
          imported += (resp && resp.inserted) ? resp.inserted : slice.length;
          if (resp && Array.isArray(resp.errors)) failed = failed.concat(resp.errors);
          progressUI.update(imported, rows.length, 'Importando productos...');
          return batchAt(i + BATCH);
        })
        .catch(function (e) {
          failed.push({ batch_start: i, error: e.message });
          progressUI.update(imported, rows.length, 'Errores: ' + failed.length);
          // continue with next batch (resilient)
          return batchAt(i + BATCH);
        });
    }

    batchAt(0).then(function () {
      modalCtl.close();
      if (failed.length) {
        toast('Importación con errores: ' + imported + ' OK, ' + failed.length + ' fallos', 'error');
        console.error('[import] failures:', failed);
      } else {
        toast('Importados ' + imported + ' productos', 'success');
      }
      // reload list if possible
      try {
        if (typeof window.loadProducts === 'function') window.loadProducts();
        else window.dispatchEvent(new CustomEvent('volvix:products:reload'));
      } catch (_) {}
    });
  }

  // ===========================================================================
  // FEATURE: Export Customers
  // ===========================================================================
  var CUSTOMER_COLUMNS = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'name' },
    { key: 'phone', label: 'phone' },
    { key: 'email', label: 'email' },
    { key: 'credit_limit', label: 'credit_limit' },
    { key: 'balance', label: 'balance' },
    { key: 'total_spent', label: 'total_spent' },
    { key: 'transaction_count', label: 'transaction_count' },
    { key: 'last_purchase_date', label: 'last_purchase_date' },
    { key: 'created_at', label: 'created_at' }
  ];

  function exportCustomers() {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }
    toast('Exportando clientes...', 'info');
    fetchAllPaginated('/customers', 1000).then(function (rows) {
      if (!rows.length) { toast('No hay clientes para exportar', 'info'); return; }
      var csv = rowsToCsv(rows, CUSTOMER_COLUMNS);
      downloadBlob(csv, 'clientes-' + getTenantSlug() + '-' + ymdToday() + '.csv');
      toast('Exportados ' + rows.length + ' clientes', 'success');
    }).catch(function (e) {
      console.error(e);
      toast('Error exportando clientes: ' + e.message, 'error');
    });
  }

  // ===========================================================================
  // FEATURE: Kardex date filter modal
  // ===========================================================================
  function openKardexFilter() {
    var form = document.createElement('div');
    form.innerHTML =
      '<div class="vlx-form-row"><label>Desde<input type="date" id="vlx-kardex-from" required></label></div>' +
      '<div class="vlx-form-row"><label>Hasta<input type="date" id="vlx-kardex-to" required></label></div>' +
      '<div class="vlx-form-row"><label>Producto (opcional)<input type="text" id="vlx-kardex-product" placeholder="SKU o nombre"></label></div>' +
      '<div class="vlx-form-row"><label>Tipo' +
        '<select id="vlx-kardex-type">' +
          '<option value="">Todos</option>' +
          '<option value="entrada">Entrada</option>' +
          '<option value="salida">Salida</option>' +
          '<option value="ajuste">Ajuste</option>' +
        '</select>' +
      '</label></div>';

    var d = new Date();
    var iso = function (date) { return date.toISOString().slice(0, 10); };
    var firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    setTimeout(function () {
      var fromI = $('#vlx-kardex-from'); if (fromI) fromI.value = iso(firstDay);
      var toI = $('#vlx-kardex-to');     if (toI)   toI.value = iso(d);
    }, 0);

    openModal({
      title: 'Filtrar Kardex por fecha',
      body: form,
      buttons: [
        { text: 'Cancelar', onClick: function (ctx) { ctx.close(); } },
        {
          text: 'Aplicar filtro',
          primary: true,
          onClick: function (ctx) {
            var from = $('#vlx-kardex-from').value;
            var to = $('#vlx-kardex-to').value;
            var product = $('#vlx-kardex-product').value;
            var type = $('#vlx-kardex-type').value;
            if (!from || !to) { toast('Selecciona ambas fechas', 'error'); return; }
            ctx.close();
            applyKardexFilter({ from: from, to: to, product: product, type: type });
          }
        }
      ]
    });
  }

  function applyKardexFilter(f) {
    // Update URL query and dispatch event for kardex view to react
    try {
      var u = new URL(location.href);
      ['from', 'to', 'product', 'type'].forEach(function (k) {
        if (f[k]) u.searchParams.set(k, f[k]);
        else u.searchParams.delete(k);
      });
      history.replaceState({}, '', u.toString());
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('volvix:kardex:filter', { detail: f }));
    if (typeof window.loadKardex === 'function') {
      try { window.loadKardex(f); } catch (_) {}
    }
    toast('Filtro aplicado', 'success');
  }

  // ===========================================================================
  // FEATURE: Export Kardex movements
  // ===========================================================================
  var KARDEX_COLUMNS = [
    { key: 'date', label: 'date', get: function (r) { return r.date || r.created_at; } },
    { key: 'type', label: 'type' },
    { key: 'product_name', label: 'product_name', get: function (r) { return r.product_name || (r.product && r.product.name) || ''; } },
    { key: 'sku', label: 'sku', get: function (r) { return r.sku || (r.product && r.product.sku) || ''; } },
    { key: 'quantity', label: 'quantity' },
    { key: 'before', label: 'before', get: function (r) { return r.stock_before != null ? r.stock_before : r.before; } },
    { key: 'after', label: 'after', get: function (r) { return r.stock_after != null ? r.stock_after : r.after; } },
    { key: 'user', label: 'user', get: function (r) { return r.user_name || r.user_email || (r.user && (r.user.name || r.user.email)) || ''; } },
    { key: 'reason', label: 'reason' },
    { key: 'sale_id', label: 'sale_id' }
  ];

  function exportKardex() {
    if (!getToken()) { toast('No estás autenticado', 'error'); return; }
    var u;
    try { u = new URL(location.href); } catch (_) { u = { searchParams: { get: function () { return null; } } }; }
    var qs = [];
    ['from', 'to', 'product', 'type'].forEach(function (k) {
      var v = u.searchParams.get(k);
      if (v) qs.push(k + '=' + encodeURIComponent(v));
    });
    var path = '/inventory-movements' + (qs.length ? '?' + qs.join('&') : '');
    toast('Exportando movimientos...', 'info');
    fetchAllPaginated(path, 1000).then(function (rows) {
      if (!rows.length) { toast('No hay movimientos para exportar', 'info'); return; }
      var csv = rowsToCsv(rows, KARDEX_COLUMNS);
      downloadBlob(csv, 'kardex-' + getTenantSlug() + '-' + ymdToday() + '.csv');
      toast('Exportados ' + rows.length + ' movimientos', 'success');
    }).catch(function (e) {
      console.error(e);
      toast('Error exportando kardex: ' + e.message, 'error');
    });
  }

  // ===========================================================================
  // FEATURE: Export ALL reports (XLSX with multiple sheets)
  // ===========================================================================
  var REPORT_DEFS = [
    { id: 'sales', label: 'Ventas', endpoint: '/reports/sales' },
    { id: 'top-products', label: 'Top productos', endpoint: '/reports/top-products' },
    { id: 'top-customers', label: 'Top clientes', endpoint: '/reports/top-customers' },
    { id: 'profit', label: 'Utilidad', endpoint: '/reports/profit' },
    { id: 'by-cashier', label: 'Por cajero', endpoint: '/reports/by-cashier' }
  ];

  function openExportAllReports() {
    var form = document.createElement('div');
    var checks = REPORT_DEFS.map(function (r) {
      return '<label class="vlx-check"><input type="checkbox" value="' + r.id + '" checked> ' + r.label + '</label>';
    }).join('');
    var d = new Date();
    var iso = function (x) { return x.toISOString().slice(0, 10); };
    var firstDay = new Date(d.getFullYear(), d.getMonth(), 1);

    form.innerHTML =
      '<div class="vlx-form-row"><label>Desde<input type="date" id="vlx-report-from" value="' + iso(firstDay) + '"></label></div>' +
      '<div class="vlx-form-row"><label>Hasta<input type="date" id="vlx-report-to" value="' + iso(d) + '"></label></div>' +
      '<fieldset class="vlx-checklist"><legend>Reportes a incluir</legend>' + checks + '</fieldset>';

    openModal({
      title: 'Exportar todos los reportes',
      body: form,
      buttons: [
        { text: 'Cancelar', onClick: function (ctx) { ctx.close(); } },
        {
          text: 'Exportar XLSX',
          primary: true,
          onClick: function (ctx) {
            var from = $('#vlx-report-from').value;
            var to = $('#vlx-report-to').value;
            var ids = $$('input[type=checkbox]:checked', form).map(function (c) { return c.value; });
            if (!ids.length) { toast('Selecciona al menos un reporte', 'error'); return; }
            ctx.close();
            runExportAllReports({ from: from, to: to, ids: ids });
          }
        }
      ]
    });
  }

  function runExportAllReports(opts) {
    toast('Generando reportes...', 'info');
    loadScriptOnce(SHEETJS_CDN).then(function () {
      var jobs = REPORT_DEFS.filter(function (r) { return opts.ids.indexOf(r.id) >= 0; }).map(function (r) {
        var qs = [];
        if (opts.from) qs.push('from=' + opts.from);
        if (opts.to) qs.push('to=' + opts.to);
        var path = r.endpoint + (qs.length ? '?' + qs.join('&') : '');
        return api(path).then(function (data) {
          var rows = Array.isArray(data) ? data :
                     Array.isArray(data.data) ? data.data :
                     Array.isArray(data.items) ? data.items :
                     Array.isArray(data.rows) ? data.rows : [data];
          return { def: r, rows: rows };
        }).catch(function (e) {
          console.warn('[reports] ' + r.id + ' failed', e);
          return { def: r, rows: [{ error: e.message }] };
        });
      });
      Promise.all(jobs).then(function (results) {
        var XLSX = window.XLSX;
        var wb = XLSX.utils.book_new();
        results.forEach(function (res) {
          var ws = XLSX.utils.json_to_sheet(res.rows.length ? res.rows : [{}]);
          var sheetName = res.def.label.slice(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        var fname = 'reportes-' + getTenantSlug() + '-' + ymdToday() + '.xlsx';
        XLSX.writeFile(wb, fname);
        toast('Reportes exportados', 'success');
      }).catch(function (e) {
        toast('Error generando reportes: ' + e.message, 'error');
      });
    }).catch(function (e) {
      toast('No se pudo cargar SheetJS: ' + e.message, 'error');
    });
  }

  // ===========================================================================
  // Button hooking
  // ===========================================================================
  var HOOKS = [
    {
      key: 'btn-export-prod',
      match: function () { return $('#btn-export-prod'); },
      handler: exportProducts,
      label: 'Exportar productos'
    },
    {
      key: 'btn-import-prod',
      match: function () { return $('#btn-import-prod'); },
      handler: importProducts,
      label: 'Importar productos'
    },
    {
      key: 'btn-export-customers',
      match: function () {
        // text "📤 Exportar" near "Clientes" section
        var cands = $$('button').filter(function (b) {
          var t = (b.textContent || '').trim();
          return /Exportar/i.test(t) && /📤|⬇/.test(t) === true;
        });
        // narrow to one near a section labelled Clientes
        for (var i = 0; i < cands.length; i++) {
          var btn = cands[i];
          var sec = btn.closest('section,div,article');
          var hops = 0;
          while (sec && hops < 6) {
            if (/Clientes/i.test(sec.textContent || '') && (sec.textContent || '').length < 4000) return btn;
            sec = sec.parentElement; hops++;
          }
        }
        return null;
      },
      handler: exportCustomers,
      label: 'Exportar clientes'
    },
    {
      key: 'btn-kardex-filter',
      match: function () {
        return $$('button').find(function (b) {
          var t = (b.textContent || '').trim();
          return /Filtrar fecha/i.test(t);
        }) || null;
      },
      handler: openKardexFilter,
      label: 'Filtrar kardex por fecha'
    },
    {
      key: 'btn-kardex-export',
      match: function () {
        // Exportar dentro de sección kardex
        var cands = $$('button').filter(function (b) {
          var t = (b.textContent || '').trim();
          return /Exportar/i.test(t);
        });
        for (var i = 0; i < cands.length; i++) {
          var btn = cands[i];
          var sec = btn.closest('section,div,article');
          var hops = 0;
          while (sec && hops < 6) {
            if (/kardex/i.test(sec.textContent || '') && (sec.textContent || '').length < 4000) return btn;
            sec = sec.parentElement; hops++;
          }
        }
        return null;
      },
      handler: exportKardex,
      label: 'Exportar kardex'
    },
    {
      key: 'btn-export-all-reports',
      match: function () {
        return $$('button').find(function (b) {
          var t = (b.textContent || '').trim();
          return /Exportar todo/i.test(t);
        }) || null;
      },
      handler: openExportAllReports,
      label: 'Exportar todos los reportes'
    }
  ];

  function hookAll() {
    HOOKS.forEach(function (h) {
      try {
        var el = h.match();
        if (!el) return;
        if (el.dataset.vlxExportImportHooked === '1') return;
        el.dataset.vlxExportImportHooked = '1';
        // Strip ghost-button rescue if previously attached
        el.removeAttribute('data-vlx-rescued');
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try { h.handler(); } catch (e) {
            console.error('[export-import] handler failed', e);
            toast(h.label + ' falló: ' + e.message, 'error');
          }
        }, true);
      } catch (e) {
        console.warn('[export-import] hook failed for ' + h.key, e);
      }
    });
  }

  function startObserver() {
    if (!('MutationObserver' in window)) return;
    var debounceTimer = null;
    var mo = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(hookAll, 300);
    });
    try {
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function init() {
    hookAll();
    startObserver();
    // Re-attempt periodically in case dynamic UI loads after.
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      hookAll();
      if (tries >= 10) clearInterval(iv);
    }, 1000);
  }

  // Public API for manual invocation
  window.VolvixExportImport = {
    exportProducts: exportProducts,
    importProducts: importProducts,
    exportCustomers: exportCustomers,
    openKardexFilter: openKardexFilter,
    exportKardex: exportKardex,
    openExportAllReports: openExportAllReports,
    rehook: hookAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
