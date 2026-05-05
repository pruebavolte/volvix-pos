/**
 * VOLVIX POS GODMODE 3.4.0 — volvix-inventory-advanced-wiring.js
 * UI helpers para el módulo de inventario avanzado (R14).
 *
 * Este archivo NO depende de un framework. Usa fetch + el JWT que el resto
 * del POS deja en localStorage('volvix_token') (mismo patrón que login.html /
 * auth-helper.js). Si tu app usa otra clave, ajusta TOKEN_KEY abajo.
 *
 * Uso desde una pantalla:
 *   <script src="/volvix-inventory-advanced-wiring.js"></script>
 *   <script>
 *     VolvixInventory.renderLocations(document.getElementById('locs'));
 *     VolvixInventory.renderStock(document.getElementById('stock'), { lowStock:true });
 *   </script>
 */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'volvix_token';
  const API_BASE = (global.VOLVIX_API_BASE || '').replace(/\/+$/, '');

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(API_BASE + path, opts);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!r.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + r.status));
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- LOCATIONS ----------------------------------------------------------
  function listLocations(opts) {
    const q = [];
    if (opts && opts.type) q.push('type=' + encodeURIComponent(opts.type));
    return api('GET', '/api/inventory/locations' + (q.length ? '?' + q.join('&') : ''));
  }
  function createLocation(payload) {
    return api('POST', '/api/inventory/locations', payload);
  }
  function updateLocation(id, payload) {
    return api('PATCH', '/api/inventory/locations/' + encodeURIComponent(id), payload);
  }

  // ---- STOCK --------------------------------------------------------------
  function getStock(opts) {
    const q = [];
    if (opts && opts.location_id) q.push('location_id=' + encodeURIComponent(opts.location_id));
    if (opts && opts.product_id)  q.push('product_id='  + encodeURIComponent(opts.product_id));
    if (opts && opts.lowStock)    q.push('low_stock=true');
    return api('GET', '/api/inventory/stock' + (q.length ? '?' + q.join('&') : ''));
  }

  // ---- MOVEMENTS ----------------------------------------------------------
  function moveIn(payload)       { return api('POST', '/api/inventory/movements', Object.assign({ type: 'in' },       payload)); }
  function moveOut(payload)      { return api('POST', '/api/inventory/movements', Object.assign({ type: 'out' },      payload)); }
  function moveTransfer(payload) { return api('POST', '/api/inventory/movements', Object.assign({ type: 'transfer' }, payload)); }
  function moveLoss(payload)     { return api('POST', '/api/inventory/movements', Object.assign({ type: 'loss' },     payload)); }

  function adjust(payload) {
    return api('POST', '/api/inventory/adjust', payload);
  }

  // ---- COUNTS -------------------------------------------------------------
  function startCount(location_id) {
    return api('POST', '/api/inventory/counts/start', { location_id: location_id });
  }
  function addCountLines(count_id, lines) {
    return api('POST', '/api/inventory/counts/' + encodeURIComponent(count_id) + '/lines', { lines: lines });
  }
  function finalizeCount(count_id) {
    return api('POST', '/api/inventory/counts/' + encodeURIComponent(count_id) + '/finalize', {});
  }

  // ---- DOM HELPERS --------------------------------------------------------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'style') n.setAttribute('style', attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  async function renderLocations(container) {
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(el('h3', null, ['Ubicaciones de inventario']));
    try {
      const rows = await listLocations();
      const tbl = el('table', { class: 'volvix-table' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, ['Nombre']),
            el('th', null, ['Tipo']),
            el('th', null, ['Activa']),
            el('th', null, ['Creada'])
          ])
        ])
      ]);
      const tbody = el('tbody', null, []);
      (rows || []).forEach(r => {
        tbody.appendChild(el('tr', null, [
          el('td', null, [r.name || '']),
          el('td', null, [r.type || '']),
          el('td', null, [r.is_active ? 'Sí' : 'No']),
          el('td', null, [(r.created_at || '').slice(0, 19).replace('T', ' ')])
        ]));
      });
      tbl.appendChild(tbody);
      container.appendChild(tbl);
    } catch (e) {
      container.appendChild(el('div', { class: 'volvix-error' }, ['Error: ' + e.message]));
    }
  }

  async function renderStock(container, opts) {
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(el('h3', null, [opts && opts.lowStock ? 'Stock bajo (reorder)' : 'Stock por ubicación']));
    try {
      const rows = await getStock(opts || {});
      if (!rows.length) { container.appendChild(el('p', null, ['Sin datos.'])); return; }
      const tbl = el('table', { class: 'volvix-table' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, ['Producto']),
            el('th', null, ['Ubicación']),
            el('th', null, ['Qty']),
            el('th', null, ['Reservado']),
            el('th', null, ['Reorder'])
          ])
        ])
      ]);
      const tbody = el('tbody', null, []);
      rows.forEach(r => {
        const low = Number(r.qty) <= Number(r.reorder_point || 0);
        tbody.appendChild(el('tr', { class: low ? 'volvix-low' : '' }, [
          el('td', null, [r.product_id || '']),
          el('td', null, [r.location_id || '']),
          el('td', null, [String(r.qty)]),
          el('td', null, [String(r.reserved_qty || 0)]),
          el('td', null, [String(r.reorder_point || 0)])
        ]));
      });
      tbl.appendChild(tbody);
      container.appendChild(tbl);
    } catch (e) {
      container.appendChild(el('div', { class: 'volvix-error' }, ['Error: ' + e.message]));
    }
  }

  function renderMovementForm(container, defaults) {
    if (!container) return;
    container.innerHTML = '';
    const fProd = el('input', { placeholder: 'product_id (uuid)' });
    const fType = el('select', null, ['in', 'out', 'transfer', 'loss'].map(t =>
      el('option', { value: t }, [t])));
    const fFrom = el('input', { placeholder: 'from_loc (uuid)' });
    const fTo   = el('input', { placeholder: 'to_loc (uuid)' });
    const fQty  = el('input', { placeholder: 'qty', type: 'number', step: '0.0001', min: '0' });
    const fReason = el('input', { placeholder: 'reason (opcional)' });
    const out = el('div', { class: 'volvix-out' }, []);
    const btn = el('button', { type: 'button', onclick: async () => {
      out.textContent = 'Enviando...';
      try {
        const payload = {
          product_id: fProd.value.trim(),
          type: fType.value,
          qty: Number(fQty.value),
          from_loc: fFrom.value.trim() || null,
          to_loc:   fTo.value.trim() || null,
          reason:   fReason.value.trim() || null
        };
        const r = await api('POST', '/api/inventory/movements', payload);
        out.textContent = 'OK: movement_id=' + (r && r.movement_id);
      } catch (e) { out.textContent = 'Error: ' + e.message; }
    } }, ['Registrar movimiento']);

    if (defaults) {
      if (defaults.product_id) fProd.value = defaults.product_id;
      if (defaults.from_loc)   fFrom.value = defaults.from_loc;
      if (defaults.to_loc)     fTo.value   = defaults.to_loc;
      if (defaults.type)       fType.value = defaults.type;
    }

    [fProd, fType, fFrom, fTo, fQty, fReason, btn, out].forEach(n => container.appendChild(n));
  }

  // ---- PUBLIC API ---------------------------------------------------------
  global.VolvixInventory = {
    api: api,
    listLocations, createLocation, updateLocation,
    getStock,
    moveIn, moveOut, moveTransfer, moveLoss, adjust,
    startCount, addCountLines, finalizeCount,
    renderLocations, renderStock, renderMovementForm
  };
})(typeof window !== 'undefined' ? window : globalThis);
