/* volvix-notifications-wiring.js
 * Global Notification Center for Volvix POS.
 * Self-injecting bell + drawer + realtime/polling. Vanilla JS.
 * Theme: amber #FBBF24 / navy #1E3A8A / dark #0A0A0A.
 */
(function () {
  'use strict';
  if (window.__vlxNotifWiringLoaded) return;
  window.__vlxNotifWiringLoaded = true;

  var TOKEN_KEY = 'volvix_token';
  var COLOR_AMBER = '#FBBF24';
  var COLOR_NAVY = '#1E3A8A';
  var COLOR_DARK = '#0A0A0A';
  var POLL_MS = 30000;

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function decodeJwt(tok) {
    try {
      var b64 = (tok.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(atob(b64));
    } catch (_) { return null; }
  }

  // Skip on login/landing pages and when no session
  var path = (location.pathname || '').toLowerCase();
  if (/login\.html|signup|register|index\.html|^\/$/.test(path) && path !== '/') {
    if (path.indexOf('login') !== -1 || path.indexOf('signup') !== -1 || path.indexOf('register') !== -1) return;
  }
  if (!getToken()) return;

  var jwt = decodeJwt(getToken()) || {};
  var TENANT = jwt.tenant_id || jwt.tenantId || '';

  // ---------------------------------------------------------------------------
  // Toast (reuse global if available)
  // ---------------------------------------------------------------------------
  function toast(msg, type) {
    if (typeof window.vlxToast === 'function') return window.vlxToast(msg, type);
    try { console.log('[notif]', type || 'info', msg); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function apiCall(method, url, body) {
    var headers = { 'Content-Type': 'application/json' };
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null && method !== 'GET') {
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (r) {
      if (r.status === 401) { return Promise.reject(new Error('unauthorized')); }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      return r.text().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }

  // ---------------------------------------------------------------------------
  // Sound (Web Audio beep)
  // ---------------------------------------------------------------------------
  var _audio = null;
  function beep() {
    try {
      if (!_audio) _audio = new (window.AudioContext || window.webkitAudioContext)();
      var o = _audio.createOscillator();
      var g = _audio.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(_audio.destination);
      var t = _audio.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.36);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  function injectCss() {
    if (document.getElementById('vlx-notif-css')) return;
    var s = document.createElement('style');
    s.id = 'vlx-notif-css';
    s.textContent =
      '#vlx-bell{position:fixed;top:14px;right:14px;z-index:2147483640;width:44px;height:44px;border-radius:50%;background:' + COLOR_DARK + ';color:' + COLOR_AMBER + ';border:1px solid ' + COLOR_AMBER + ';cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:system-ui,-apple-system,sans-serif;font-size:20px;transition:transform .15s}' +
      '#vlx-bell:hover{transform:scale(1.06)}' +
      '#vlx-bell .vlx-badge{position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;border-radius:10px;padding:2px 6px;min-width:18px;text-align:center;border:2px solid ' + COLOR_DARK + '}' +
      '#vlx-bell.vlx-shake{animation:vlxBellShake .6s ease-in-out}' +
      '@keyframes vlxBellShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-15deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(6deg)}}' +
      '#vlx-notif-drawer{position:fixed;top:0;right:0;width:380px;max-width:100vw;height:100vh;background:' + COLOR_DARK + ';color:#e5e7eb;border-left:2px solid ' + COLOR_AMBER + ';z-index:2147483641;transform:translateX(100%);transition:transform .25s ease;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.5)}' +
      '#vlx-notif-drawer.vlx-open{transform:translateX(0)}' +
      '#vlx-notif-drawer header{padding:14px 16px;background:' + COLOR_NAVY + ';display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + COLOR_AMBER + '}' +
      '#vlx-notif-drawer header h3{margin:0;color:' + COLOR_AMBER + ';font-size:16px}' +
      '#vlx-notif-drawer header .vlx-actions{display:flex;gap:6px}' +
      '#vlx-notif-drawer header button{background:transparent;border:1px solid ' + COLOR_AMBER + ';color:' + COLOR_AMBER + ';padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px}' +
      '#vlx-notif-drawer header button:hover{background:' + COLOR_AMBER + ';color:' + COLOR_DARK + '}' +
      '#vlx-notif-drawer .vlx-list{flex:1;overflow-y:auto;padding:8px}' +
      '.vlx-notif-item{padding:12px;margin-bottom:8px;background:rgba(255,255,255,.03);border:1px solid #1f2937;border-radius:8px;border-left:3px solid #444;cursor:pointer;transition:background .12s,border-color .12s}' +
      '.vlx-notif-item:hover{background:rgba(255,255,255,.06)}' +
      '.vlx-notif-item.vlx-unread{border-left-color:' + COLOR_AMBER + ';background:rgba(251,191,36,.06)}' +
      '.vlx-notif-item .vlx-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
      '.vlx-notif-item .vlx-title{font-weight:600;color:#fff;font-size:13px;margin-bottom:4px}' +
      '.vlx-notif-item .vlx-body{font-size:12px;color:#9ca3af;line-height:1.4}' +
      '.vlx-notif-item .vlx-meta{font-size:10px;color:#6b7280;margin-top:6px;display:flex;gap:8px;align-items:center}' +
      '.vlx-notif-item .vlx-type{display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}' +
      '.vlx-notif-item .vlx-type-sales{background:#065f46;color:#a7f3d0}' +
      '.vlx-notif-item .vlx-type-inventory{background:#7f1d1d;color:#fecaca}' +
      '.vlx-notif-item .vlx-type-system{background:#1e40af;color:#bfdbfe}' +
      '.vlx-notif-item .vlx-type-payment{background:#92400e;color:#fde68a}' +
      '.vlx-notif-item .vlx-type-default{background:#374151;color:#d1d5db}' +
      '#vlx-notif-drawer .vlx-empty{padding:40px 20px;text-align:center;color:#6b7280;font-size:13px}' +
      '#vlx-notif-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483639;opacity:0;pointer-events:none;transition:opacity .25s}' +
      '#vlx-notif-backdrop.vlx-open{opacity:1;pointer-events:auto}';
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  var state = { items: [], unread: 0, lastFetch: 0 };

  function buildBell() {
    if (document.getElementById('vlx-bell')) return;
    var b = document.createElement('button');
    b.id = 'vlx-bell';
    b.type = 'button';
    b.title = 'Notificaciones';
    b.innerHTML = '<span style="font-size:20px;line-height:1">&#128276;</span><span class="vlx-badge" style="display:none">0</span>';
    b.addEventListener('click', toggleDrawer);
    document.body.appendChild(b);

    var bd = document.createElement('div');
    bd.id = 'vlx-notif-backdrop';
    bd.addEventListener('click', closeDrawer);
    document.body.appendChild(bd);

    var d = document.createElement('aside');
    d.id = 'vlx-notif-drawer';
    d.innerHTML =
      '<header>' +
        '<h3>Notificaciones</h3>' +
        '<div class="vlx-actions">' +
          '<button id="vlx-notif-readall" type="button">Marcar todo</button>' +
          '<button id="vlx-notif-close" type="button">Cerrar</button>' +
        '</div>' +
      '</header>' +
      '<div class="vlx-list" id="vlx-notif-list"><div class="vlx-empty">Cargando…</div></div>';
    document.body.appendChild(d);

    document.getElementById('vlx-notif-close').addEventListener('click', closeDrawer);
    document.getElementById('vlx-notif-readall').addEventListener('click', readAll);
  }

  function toggleDrawer() {
    var d = document.getElementById('vlx-notif-drawer');
    if (d.classList.contains('vlx-open')) closeDrawer();
    else openDrawer();
  }

  function openDrawer() {
    document.getElementById('vlx-notif-drawer').classList.add('vlx-open');
    document.getElementById('vlx-notif-backdrop').classList.add('vlx-open');
    fetchNotifications(true);
  }

  function closeDrawer() {
    document.getElementById('vlx-notif-drawer').classList.remove('vlx-open');
    document.getElementById('vlx-notif-backdrop').classList.remove('vlx-open');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function timeAgo(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return 'hace ' + s + 's';
      if (s < 3600) return 'hace ' + Math.floor(s / 60) + 'm';
      if (s < 86400) return 'hace ' + Math.floor(s / 3600) + 'h';
      return 'hace ' + Math.floor(s / 86400) + 'd';
    } catch (_) { return ''; }
  }

  function classifyType(n) {
    var t = (n.type || n.kind || n.category || '').toLowerCase();
    if (/sale|venta|order|pedido/.test(t)) return 'sales';
    if (/inventory|stock|inventario/.test(t)) return 'inventory';
    if (/payment|cobro|pago/.test(t)) return 'payment';
    if (/system|maint|sistema|mantenimiento/.test(t)) return 'system';
    return 'default';
  }

  function renderList() {
    var list = document.getElementById('vlx-notif-list');
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML = '<div class="vlx-empty">No tienes notificaciones recientes.</div>';
      return;
    }
    list.innerHTML = state.items.map(function (n) {
      var t = classifyType(n);
      var unread = !n.read_at && !n.read;
      return '<div class="vlx-notif-item' + (unread ? ' vlx-unread' : '') + '" data-id="' + escapeHtml(n.id) + '">' +
        '<div class="vlx-row">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="vlx-title">' + escapeHtml(n.title || '(sin título)') + '</div>' +
            '<div class="vlx-body">' + escapeHtml(n.body || n.message || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="vlx-meta">' +
          '<span class="vlx-type vlx-type-' + t + '">' + t + '</span>' +
          '<span>' + timeAgo(n.created_at || n.createdAt) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.vlx-notif-item'), function (el) {
      el.addEventListener('click', function () { markRead(el.getAttribute('data-id'), el); });
    });
  }

  function updateBadge() {
    var b = document.querySelector('#vlx-bell .vlx-badge');
    if (!b) return;
    if (state.unread > 0) {
      b.style.display = 'inline-block';
      b.textContent = state.unread > 99 ? '99+' : String(state.unread);
    } else {
      b.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch / mutations
  // ---------------------------------------------------------------------------
  var fetching = false;
  function fetchNotifications(showAll) {
    if (fetching) return;
    fetching = true;
    var url = '/api/notifications' + (showAll ? '' : '?unread=1');
    return apiCall('GET', url).then(function (r) {
      fetching = false;
      if (!r.ok) return;
      var list = Array.isArray(r.data) ? r.data : (r.data && r.data.items) || [];
      var prevIds = (state.items || []).map(function (x) { return x.id; });
      state.items = list;
      state.unread = list.filter(function (x) { return !x.read_at && !x.read; }).length;
      state.lastFetch = Date.now();

      // detect new arrivals (only after first fetch)
      if (prevIds.length) {
        var fresh = list.filter(function (x) { return prevIds.indexOf(x.id) === -1 && !(x.read_at || x.read); });
        if (fresh.length) {
          beep();
          var first = fresh[0];
          toast((first.title || 'Nueva notificación') + (first.body ? ': ' + first.body : ''), 'success');
          var bell = document.getElementById('vlx-bell');
          if (bell) { bell.classList.remove('vlx-shake'); void bell.offsetWidth; bell.classList.add('vlx-shake'); }
        }
      }
      updateBadge();
      renderList();
    }).catch(function () { fetching = false; });
  }

  function markRead(id, el) {
    if (!id) return;
    apiCall('POST', '/api/notifications/' + encodeURIComponent(id) + '/read', {}).then(function (r) {
      if (!r.ok) return;
      var item = state.items.filter(function (x) { return String(x.id) === String(id); })[0];
      if (item && !item.read_at) {
        item.read_at = new Date().toISOString();
        state.unread = Math.max(0, state.unread - 1);
        if (el) el.classList.remove('vlx-unread');
        updateBadge();
      }
    }).catch(function () {});
  }

  function readAll() {
    apiCall('POST', '/api/notifications/read-all', {}).then(function (r) {
      if (!r.ok) return;
      state.items.forEach(function (x) { x.read_at = x.read_at || new Date().toISOString(); });
      state.unread = 0;
      updateBadge();
      renderList();
      toast('Todas marcadas como leídas', 'success');
    }).catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // Realtime via Supabase channel (best-effort)
  // ---------------------------------------------------------------------------
  function setupRealtime() {
    try {
      var sb = window.supabase || (window.SUPABASE_CLIENT) || null;
      if (!sb || !sb.channel || !TENANT) return;
      var ch = sb.channel('notifications:' + TENANT);
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'tenant_id=eq.' + TENANT }, function () {
        fetchNotifications(true);
      });
      ch.subscribe();
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    injectCss();
    buildBell();
    fetchNotifications(true);
    setupRealtime();
    setInterval(function () { fetchNotifications(true); }, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
