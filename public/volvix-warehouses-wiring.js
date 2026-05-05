/* volvix-warehouses-wiring.js — R17
 * Cliente para multi-warehouse con mapa Leaflet (CDN).
 * Carga Leaflet on-demand y renderiza pins de las bodegas.
 *
 * Uso:
 *   <div id="warehouses-map" style="height:400px"></div>
 *   <script src="/volvix-warehouses-wiring.js"></script>
 *   VolvixWarehouses.mountMap('warehouses-map');
 */
(function (global) {
  'use strict';

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var TILE_URL    = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  function getToken() {
    try { return localStorage.getItem('volvix_token') || localStorage.getItem('token') || ''; }
    catch (_) { return ''; }
  }

  function authHeaders(extra) {
    var t = getToken();
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function apiGet(path) {
    var r = await fetch(path, { method: 'GET', headers: authHeaders() });
    if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status);
    return r.json();
  }

  async function apiPost(path, body) {
    var r = await fetch(path, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(body || {})
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error('POST ' + path + ' -> ' + r.status), { body: j });
    return j;
  }

  function listWarehouses() { return apiGet('/api/warehouses'); }
  function createWarehouse(data) { return apiPost('/api/warehouses', data); }
  function getStock(id) { return apiGet('/api/warehouses/' + encodeURIComponent(id) + '/stock'); }
  function transfer(payload) { return apiPost('/api/warehouses/transfer', payload); }
  function optimalFor(customerId, lat, lng) {
    var qs = [];
    if (customerId) qs.push('customer_id=' + encodeURIComponent(customerId));
    if (lat != null) qs.push('lat=' + encodeURIComponent(lat));
    if (lng != null) qs.push('lng=' + encodeURIComponent(lng));
    return apiGet('/api/warehouses/optimal' + (qs.length ? '?' + qs.join('&') : ''));
  }

  // Carga Leaflet desde CDN (idempotente)
  function loadLeaflet() {
    if (global.L) return Promise.resolve(global.L);
    return new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-volvix-leaflet]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
        link.setAttribute('data-volvix-leaflet', '1');
        document.head.appendChild(link);
      }
      var s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.onload = function () { resolve(global.L); };
      s.onerror = function () { reject(new Error('No se pudo cargar Leaflet')); };
      document.head.appendChild(s);
    });
  }

  async function mountMap(elId, opts) {
    opts = opts || {};
    var el = typeof elId === 'string' ? document.getElementById(elId) : elId;
    if (!el) throw new Error('Contenedor no encontrado: ' + elId);
    var L = await loadLeaflet();

    var map = L.map(el).setView(opts.center || [19.4326, -99.1332], opts.zoom || 4);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var data = await listWarehouses().catch(function (e) {
      console.warn('[VolvixWarehouses] list error:', e); return { items: [] };
    });
    var items = (data && data.items) || [];
    var bounds = [];
    items.forEach(function (w) {
      if (w.lat == null || w.lng == null) return;
      var pin = L.marker([w.lat, w.lng]).addTo(map);
      pin.bindPopup(
        '<b>' + (w.name || 'Bodega') + '</b><br>' +
        (w.address ? (w.address + '<br>') : '') +
        (w.is_main ? '<i>Principal</i><br>' : '') +
        'Capacidad: ' + (w.capacity_units || 0) + ' u<br>' +
        '<button data-wh-stock="' + w.id + '">Ver stock</button>'
      );
      bounds.push([w.lat, w.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });

    el.addEventListener('click', async function (ev) {
      var t = ev.target;
      if (t && t.matches && t.matches('button[data-wh-stock]')) {
        var id = t.getAttribute('data-wh-stock');
        try {
          var s = await getStock(id);
          VolvixUI.toast({type:'info', message:'Productos en bodega ' + id + ': ' + (s.total || 0)});
        } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
      }
    });

    return { map: map, items: items, refresh: function () { return mountMap(elId, opts); } };
  }

  global.VolvixWarehouses = {
    list: listWarehouses,
    create: createWarehouse,
    stock: getStock,
    transfer: transfer,
    optimal: optimalFor,
    mountMap: mountMap
  };
})(typeof window !== 'undefined' ? window : globalThis);
