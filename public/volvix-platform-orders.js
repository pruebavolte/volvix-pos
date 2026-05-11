/**
 * volvix-platform-orders.js
 * Pedidos de Plataformas (Tu app · Uber Eats · Didi · Rappi)
 *
 * Comportamiento (según especificación del usuario):
 *  - Sección visual estilo Ticket 2 (blanco/negro neutra)
 *  - Polling de /api/pos/app-orders?status=nuevo cada 8s
 *  - Cuando llega pedido nuevo:
 *     · Si Ticket 1 está VACÍO   → abrir MODAL ROJO + sonido alegre
 *     · Si Ticket 1 tiene items  → solo PARPADEO rojo↔amarillo en la sección
 *  - Modal: nombre cliente, dirección, teléfono, productos, total, ref + Aceptar/Rechazar
 *  - Aceptar  → PATCH status='aceptado', cargar productos al Ticket 2 (carrito), asignar cliente
 *  - Rechazar → PATCH status='rechazado', toast "Pedido rechazado"
 *  - Auto-vincula al cliente del POS (pos_customers) si email no existe
 *  - Plataformas externas (Uber, Didi, Rappi): hardcoded gris "Próximamente"
 *
 * Reutiliza: addToCart, asignarCliente, ticket flow existentes
 *
 * API pública:
 *   window.VolvixPlatformOrders.start()  — inicia el polling y monta UI
 *   window.VolvixPlatformOrders.stop()
 *   window.VolvixPlatformOrders.checkNow() — fuerza un poll
 */
(function (global) {
  'use strict';

  const POLL_MS = 8000;
  const SOUND_URL = 'data:audio/wav;base64,UklGRrYDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YZIDAAD//wEAAQAAAP//AAABAP//AAABAP//AAACAP7//v8CAAEA//8AAP//AQABAP//AQAAAP//AAACAAAA/v8AAAEAAQAAAAAAAAAAAP//AQABAP//AAD//wAAAQAAAAAAAAABAP//AAAAAAEA//8AAP//AAABAAEAAAD//wAAAQAAAP//AAAAAAEAAAD//wEAAAAAAP//AQAAAP//AAAAAAEA//8AAP//AAACAAAA//8AAAAAAAABAP//AAABAP//AAAAAAEAAAD//wAAAAAAAAAA//8BAAAAAQAAAP//AAAAAAEAAAAAAAEAAAD//wAAAAABAP//AAAAAAEAAAD//wAAAAAAAAAAAAAAAP//AQAAAP//AAAAAAEAAAAAAP//AAAAAAEAAAD//wAAAAABAAAAAAD//wAAAAABAAAAAAAAAAAAAAAAAAAAAAD//wEAAAAAAP//AAAAAAEAAAD//wAAAAAAAAEAAAD//wAAAAABAAAAAAAAAP//AQAAAP//AAAAAAEAAAAAAAAA//8BAAAAAAAAAAAAAQAAAP//AAAAAAEAAAAAAP//AAAAAAEAAAD//wAAAAAAAAAAAQAAAP//AAAAAAAAAAAAAAAAAAABAAAA//8AAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAEA//8AAAAAAAAAAAAAAAAAAP//AAABAP//AAAAAAAAAAABAAAA/v8AAAEAAAD//wAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAP//AQAAAAAA//8AAAAAAAABAAAAAAD//wAAAAAAAAEAAAD//wAAAQAAAAAA//8AAAAAAQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAP//AAAAAAEAAAAAAP//AAABAAAAAAD//wAAAAABAAAA//8AAAAAAQAAAP//AAAAAAEAAAAAAP//AAABAAAAAAAAAAAAAQAAAAAA//8AAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAEAAAD//wAAAAAAAAAAAAAAAA==';

  let _state = {
    started: false,
    pollTimer: null,
    lastCheckTs: null,
    pendingCount: 0,
    blinkInt: null,
    audio: null,
    seenIds: new Set(),
    lastProcessedAt: 0
  };

  function _hasItemsInCart() {
    try {
      if (Array.isArray(global.CART) && global.CART.length > 0) return true;
      // Fallback DOM: contar filas reales (excluyendo placeholder "carrito vacío")
      const rows = document.querySelectorAll('#cart-body tr, .cart-item, [data-cart-item]');
      let real = 0;
      rows.forEach(r => { if (!r.querySelector('.cart-empty-block, .empty, .placeholder')) real++; });
      return real > 0;
    } catch (_) { return false; }
  }

  function _getTok() {
    return localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || '';
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ────────────────────────────────────────────────────────────────────
  // UI: sección Pedidos de Plataformas (montada en el POS)
  // ────────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('volvix-plat-styles')) return;
    const s = document.createElement('style');
    s.id = 'volvix-plat-styles';
    s.textContent = `
      #volvix-plat-section{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
      #volvix-plat-section.alert{border-color:#dc2626;animation:volvix-plat-blink 1s infinite}
      #volvix-plat-section.alert .volvix-plat-h{color:#dc2626}
      @keyframes volvix-plat-blink{0%,100%{background:#fff;border-color:#dc2626}50%{background:#fef3c7;border-color:#f59e0b}}
      .volvix-plat-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#0f172a;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em}
      .volvix-plat-badge{background:#dc2626;color:#fff;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;display:none}
      .volvix-plat-badge.show{display:inline-block}
      .volvix-plat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
      .volvix-plat-card{padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;transition:all .15s;text-align:center}
      .volvix-plat-card:hover{background:#f0fdf4;border-color:#10b981}
      .volvix-plat-card.disabled{opacity:.5;cursor:not-allowed;filter:grayscale(1)}
      .volvix-plat-card.disabled:hover{background:#fafafa;border-color:#e5e7eb}
      .volvix-plat-ico{font-size:24px}
      .volvix-plat-name{font-size:12.5px;font-weight:600;color:#0f172a}
      .volvix-plat-sub{font-size:10.5px;color:#64748b}
      .volvix-plat-list{margin-top:8px;font-size:12px;color:#475569}
      .volvix-plat-pending{padding:6px 8px;background:#fee2e2;border-left:3px solid #dc2626;border-radius:4px;margin:4px 0;display:flex;justify-content:space-between;align-items:center;gap:6px}
      .volvix-plat-pending b{color:#0f172a}
      .volvix-plat-pending button{padding:3px 8px;font-size:11px;border-radius:4px;border:0;background:#dc2626;color:#fff;cursor:pointer;font-weight:600}
      /* Modal nuevo pedido */
      #volvix-order-modal{position:fixed;inset:0;background:rgba(220,38,38,.85);display:flex;align-items:center;justify-content:center;z-index:99997;padding:18px;backdrop-filter:blur(4px);animation:volvix-fadein .2s}
      @keyframes volvix-fadein{from{opacity:0}to{opacity:1}}
      #volvix-order-card{background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);border:3px solid #dc2626}
      .volvix-ord-head{background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;padding:18px 22px;text-align:center}
      .volvix-ord-h{margin:0;font-size:20px;font-weight:800}
      .volvix-ord-sub{margin:4px 0 0;font-size:13px;opacity:.95}
      .volvix-ord-body{flex:1;overflow:auto;padding:18px 22px}
      .volvix-ord-row{display:flex;gap:8px;font-size:13.5px;color:#0f172a;margin:6px 0;line-height:1.5}
      .volvix-ord-row b{min-width:100px;color:#475569}
      .volvix-ord-items{margin-top:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#334155;line-height:1.7}
      .volvix-ord-foot{padding:14px 22px;background:#f8fafc;display:flex;gap:10px;border-top:1px solid #e5e7eb}
      .volvix-ord-btn{flex:1;padding:14px;font-weight:700;font-size:14px;border:0;border-radius:9px;cursor:pointer}
      .volvix-ord-btn.accept{background:#10b981;color:#fff}
      .volvix-ord-btn.reject{background:#fff;color:#dc2626;border:1.5px solid #dc2626}
      .volvix-ord-btn:hover{transform:translateY(-1px)}
      /* ── Mobile responsive: ocultar panel lateral, mostrar FAB ── */
      @media (max-width: 768px) {
        #volvix-plat-section { display: none !important; }
        #volvix-plat-fab {
          position: fixed;
          bottom: 80px;
          right: 14px;
          z-index: 9500;
          background: #dc2626;
          color: #fff;
          border: none;
          border-radius: 50px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: none;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 16px rgba(220,38,38,.5);
          animation: volvix-fadein .2s;
          touch-action: manipulation;
          min-height: 44px;
        }
        #volvix-plat-fab.show { display: flex; }
        #volvix-plat-fab-count {
          background: #fff;
          color: #dc2626;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 800;
          padding: 1px 7px;
          min-width: 20px;
          text-align: center;
        }
        /* Panel drawer mobile: aparece desde abajo al tocar el FAB */
        #volvix-plat-drawer {
          position: fixed;
          inset: 0;
          z-index: 9400;
          display: none;
        }
        #volvix-plat-drawer.open { display: block; }
        #volvix-plat-drawer-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,.45);
        }
        #volvix-plat-drawer-panel {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: #fff;
          border-radius: 16px 16px 0 0;
          padding: 16px;
          max-height: 75vh;
          overflow-y: auto;
          box-shadow: 0 -4px 24px rgba(0,0,0,.2);
        }
        #volvix-plat-drawer-panel .volvix-plat-h { font-size: 15px; margin-bottom: 12px; }
        #volvix-plat-drawer-panel .volvix-plat-grid { grid-template-columns: repeat(2, 1fr); }
      }
    `;
    document.head.appendChild(s);
  }

  function _mountSection() {
    if (document.getElementById('volvix-plat-section')) return;
    // Buscar contenedor adecuado: el lateral del POS o crear uno
    const target = document.querySelector('.pos-cart-side, .pos-sidebar, #screen-pos .pos-main-area, #screen-pos');
    if (!target) return;
    const sec = document.createElement('div');
    sec.id = 'volvix-plat-section';
    sec.innerHTML = `
      <div class="volvix-plat-h">📦 Pedidos de Plataformas <span class="volvix-plat-badge" id="volvix-plat-badge">0</span></div>
      <div class="volvix-plat-grid">
        <div class="volvix-plat-card" id="volvix-plat-app" title="Pedidos desde tu app cliente">
          <div class="volvix-plat-ico">📱</div>
          <div class="volvix-plat-name">Tu aplicación</div>
          <div class="volvix-plat-sub">Activa</div>
        </div>
        <div class="volvix-plat-card disabled" title="Próximamente">
          <div class="volvix-plat-ico">🟢</div>
          <div class="volvix-plat-name">Uber Eats</div>
          <div class="volvix-plat-sub">Próximamente</div>
        </div>
        <div class="volvix-plat-card disabled" title="Próximamente">
          <div class="volvix-plat-ico">🟠</div>
          <div class="volvix-plat-name">Didi Food</div>
          <div class="volvix-plat-sub">Próximamente</div>
        </div>
        <div class="volvix-plat-card disabled" title="Próximamente">
          <div class="volvix-plat-ico">🛵</div>
          <div class="volvix-plat-name">Rappi</div>
          <div class="volvix-plat-sub">Próximamente</div>
        </div>
      </div>
      <div class="volvix-plat-list" id="volvix-plat-list"></div>
    `;
    // Insertar al inicio del POS si es posible, fallback al body
    if (target.id === 'screen-pos') target.insertBefore(sec, target.firstChild);
    else target.appendChild(sec);
    // Solo forzar visibilidad en desktop; en móvil el FAB toma el control
    function _forceShow() {
      if (window.innerWidth <= 768) return;
      try {
        sec.style.setProperty('display', 'block', 'important');
        sec.style.setProperty('visibility', 'visible', 'important');
        sec.style.setProperty('opacity', '1', 'important');
      } catch (_) {}
    }
    _forceShow();
    let tries = 0;
    const intv = setInterval(() => { _forceShow(); if (++tries > 8) clearInterval(intv); }, 250);
    _mountMobileFab();
    _renderPendingList();
  }

  function _mountMobileFab() {
    if (document.getElementById('volvix-plat-fab')) return;
    // FAB (solo visible en móvil cuando hay pedidos pendientes)
    const fab = document.createElement('button');
    fab.id = 'volvix-plat-fab';
    fab.innerHTML = '📦 Pedidos <span id="volvix-plat-fab-count">0</span>';
    fab.setAttribute('aria-label', 'Ver pedidos de plataformas');
    fab.addEventListener('click', _openMobileDrawer);
    document.body.appendChild(fab);
    // Drawer (bottom sheet)
    const drawer = document.createElement('div');
    drawer.id = 'volvix-plat-drawer';
    drawer.innerHTML = `
      <div id="volvix-plat-drawer-backdrop"></div>
      <div id="volvix-plat-drawer-panel">
        <div class="volvix-plat-h">📦 Pedidos de Plataformas <span class="volvix-plat-badge show" id="volvix-plat-drawer-badge">0</span></div>
        <div class="volvix-plat-grid">
          <div class="volvix-plat-card" id="volvix-plat-drawer-app" title="Pedidos desde tu app cliente">
            <div class="volvix-plat-ico">📱</div>
            <div class="volvix-plat-name">Tu aplicación</div>
            <div class="volvix-plat-sub">Activa</div>
          </div>
          <div class="volvix-plat-card disabled"><div class="volvix-plat-ico">🟢</div><div class="volvix-plat-name">Uber Eats</div><div class="volvix-plat-sub">Próximamente</div></div>
          <div class="volvix-plat-card disabled"><div class="volvix-plat-ico">🟠</div><div class="volvix-plat-name">Didi Food</div><div class="volvix-plat-sub">Próximamente</div></div>
          <div class="volvix-plat-card disabled"><div class="volvix-plat-ico">🛵</div><div class="volvix-plat-name">Rappi</div><div class="volvix-plat-sub">Próximamente</div></div>
        </div>
        <div class="volvix-plat-list" id="volvix-plat-drawer-list"></div>
      </div>
    `;
    drawer.querySelector('#volvix-plat-drawer-backdrop').addEventListener('click', _closeMobileDrawer);
    document.body.appendChild(drawer);
  }

  function _openMobileDrawer() {
    const drawer = document.getElementById('volvix-plat-drawer');
    if (drawer) drawer.classList.add('open');
    _renderDrawerList();
  }

  function _closeMobileDrawer() {
    const drawer = document.getElementById('volvix-plat-drawer');
    if (drawer) drawer.classList.remove('open');
  }

  function _renderDrawerList() {
    const list = document.getElementById('volvix-plat-drawer-list');
    if (!list || !_state.pendingCount) { if (list) list.innerHTML = ''; return; }
    list.innerHTML = Array.from(_state.seenIds).slice(0, 5).map(id =>
      '<div class="volvix-plat-pending"><b>Pedido #' + id + ' pendiente</b>' +
      '<button data-pend-drawer="' + id + '">Ver</button></div>'
    ).join('');
    list.querySelectorAll('[data-pend-drawer]').forEach(b => {
      b.addEventListener('click', () => { _closeMobileDrawer(); _openOrderModal(parseInt(b.dataset.pendDrawer, 10)); });
    });
  }

  function _renderPendingList() {
    const list = document.getElementById('volvix-plat-list');
    if (!list) return;
    if (!_state.pendingCount) {
      list.innerHTML = '';
      return;
    }
    // Lista compacta de pedidos pendientes
    list.innerHTML = Array.from(_state.seenIds).slice(0, 5).map(id =>
      '<div class="volvix-plat-pending"><b>Pedido #' + id + ' pendiente</b>' +
      '<button data-pend-open="' + id + '">Ver</button></div>'
    ).join('');
    list.querySelectorAll('[data-pend-open]').forEach(b => {
      b.addEventListener('click', () => _openOrderModal(parseInt(b.dataset.pendOpen, 10)));
    });
  }

  function _setAlert(on) {
    const sec = document.getElementById('volvix-plat-section');
    if (sec) sec.classList.toggle('alert', !!on);
    // Badge en el panel desktop
    const badge = document.getElementById('volvix-plat-badge');
    if (badge) {
      badge.classList.toggle('show', _state.pendingCount > 0);
      badge.textContent = _state.pendingCount;
    }
    // FAB móvil: solo visible cuando hay pedidos pendientes
    const fab = document.getElementById('volvix-plat-fab');
    if (fab) {
      fab.classList.toggle('show', _state.pendingCount > 0);
      const cnt = document.getElementById('volvix-plat-fab-count');
      if (cnt) cnt.textContent = _state.pendingCount;
    }
    // Badge en el drawer móvil
    const dbadge = document.getElementById('volvix-plat-drawer-badge');
    if (dbadge) dbadge.textContent = _state.pendingCount;
  }

  // ────────────────────────────────────────────────────────────────────
  // POLLING
  // ────────────────────────────────────────────────────────────────────
  async function checkNow() {
    const tok = _getTok();
    if (!tok) return;
    try {
      const r = await fetch('/api/pos/app-orders?status=nuevo&limit=20', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (!r.ok) return;
      const j = await r.json();
      const items = (j && j.items) || [];
      _state.pendingCount = items.length;
      const newOrders = items.filter(o => !_state.seenIds.has(o.id));
      items.forEach(o => _state.seenIds.add(o.id));
      _renderPendingList();
      _setAlert(_state.pendingCount > 0);
      if (newOrders.length > 0) {
        // Throttle: no abrir modal más de 1 cada 3s
        const now = Date.now();
        if (now - _state.lastProcessedAt < 3000) return;
        _state.lastProcessedAt = now;
        // Si Ticket 1 vacío → abrir modal del primer pedido nuevo
        if (!_hasItemsInCart()) {
          _playSound();
          _openOrderModal(newOrders[0].id, newOrders[0]);
        } else {
          // Ticket ocupado → solo parpadeo (ya activo) + toast
          if (typeof global.showToast === 'function') {
            global.showToast('🛎️ Nuevo pedido pendiente · termina la venta actual para revisarlo');
          }
        }
      }
    } catch (e) { console.warn('[platform-orders] poll err', e); }
  }

  function _playSound() {
    try {
      if (!_state.audio) _state.audio = new Audio(SOUND_URL);
      _state.audio.currentTime = 0;
      _state.audio.play().catch(() => {});
    } catch (_) {}
  }

  // ────────────────────────────────────────────────────────────────────
  // MODAL nuevo pedido
  // ────────────────────────────────────────────────────────────────────
  async function _openOrderModal(orderId, prefetched) {
    let order = prefetched;
    if (!order) {
      try {
        const tok = _getTok();
        const r = await fetch('/api/pos/app-orders?limit=50', { headers: { 'Authorization': 'Bearer ' + tok } });
        const j = await r.json();
        order = (j.items || []).find(o => o.id === orderId);
      } catch (_) {}
    }
    if (!order) return;

    const old = document.getElementById('volvix-order-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'volvix-order-modal';
    const itemsHtml = (Array.isArray(order.items_json) ? order.items_json : []).map(it =>
      '• ' + _esc(typeof it === 'string' ? it : (it.name || it.descripcion || JSON.stringify(it)))
    ).join('<br>') || _esc(order.notes || '(sin items)');

    modal.innerHTML = `
      <div id="volvix-order-card">
        <div class="volvix-ord-head">
          <h2 class="volvix-ord-h">🎉 Felicidades, han hecho una compra en tu aplicación</h2>
          <p class="volvix-ord-sub">Pedido #${order.id} · ${new Date(order.created_at).toLocaleString('es-MX')}</p>
        </div>
        <div class="volvix-ord-body">
          <div class="volvix-ord-row"><b>Cliente:</b> <span>${_esc(order.client_name || '—')}</span></div>
          <div class="volvix-ord-row"><b>Email:</b> <span>${_esc(order.client_email || '—')}</span></div>
          <div class="volvix-ord-row"><b>Teléfono:</b> <span>${_esc(order.client_phone || '—')}</span></div>
          <div class="volvix-ord-row"><b>Tipo:</b> <span>${_esc(order.kind || 'pedido')}</span></div>
          ${order.total ? '<div class="volvix-ord-row"><b>Total:</b> <span>$' + Number(order.total).toFixed(2) + '</span></div>' : ''}
          ${order.notes ? '<div class="volvix-ord-row"><b>Notas:</b> <span>' + _esc(order.notes) + '</span></div>' : ''}
          <div class="volvix-ord-items">${itemsHtml}</div>
        </div>
        <div class="volvix-ord-foot">
          <button class="volvix-ord-btn reject" id="volvix-ord-reject">❌ Rechazar</button>
          <button class="volvix-ord-btn accept" id="volvix-ord-accept">✓ Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // Force visible (anti-floater override)
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', '99999', 'important');

    document.getElementById('volvix-ord-accept').addEventListener('click', () => _decide(order, 'aceptado'));
    document.getElementById('volvix-ord-reject').addEventListener('click', () => _decide(order, 'rechazado'));
  }

  async function _decide(order, status) {
    const modal = document.getElementById('volvix-order-modal');
    const tok = _getTok();
    try {
      const r = await fetch('/api/app/orders/' + order.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ status })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        alert('Error: ' + (j.error || r.status));
        return;
      }
      _state.seenIds.delete(order.id);
      _state.pendingCount = Math.max(0, _state.pendingCount - 1);
      if (_state.pendingCount === 0) _setAlert(false);
      _renderPendingList();

      if (status === 'aceptado') {
        // Convertir a Ticket 2: cargar productos al carrito
        _convertToTicket(order);
        if (typeof global.showToast === 'function') global.showToast('✅ Pedido aceptado · cargado al carrito');
      } else {
        if (typeof global.showToast === 'function') global.showToast('❌ Pedido rechazado · cliente notificado');
      }
      if (modal) modal.remove();
    } catch (e) {
      alert('Error de red: ' + e.message);
    }
  }

  // Convertir pedido → Ticket 2 (reutiliza addToCart existente del POS)
  function _convertToTicket(order) {
    if (typeof global.addToCart !== 'function') {
      console.warn('[platform-orders] addToCart no disponible — skip cart load');
      return;
    }
    const items = Array.isArray(order.items_json) ? order.items_json : [];
    items.forEach((it, i) => {
      const name = typeof it === 'string' ? it : (it.name || it.descripcion || ('Item ' + (i + 1)));
      const code = (it && it.code) || ('APP-' + order.id + '-' + i);
      const price = Number((it && it.price)) || 0;
      try {
        global.addToCart({
          id: 'app-' + order.id + '-' + i,
          code, name, price, qty: Number((it && it.qty)) || 1, stock: 999, icon: '📱'
        });
      } catch (e) { console.warn('[platform-orders] addToCart err', e); }
    });
    // Asignar cliente automáticamente si existe el setter
    try {
      if (typeof global.setCurrentCustomer === 'function') {
        global.setCurrentCustomer({
          email: order.client_email,
          name: order.client_name,
          phone: order.client_phone,
          source: 'app'
        });
      } else if (typeof global.assignCliente === 'function') {
        global.assignCliente({
          email: order.client_email,
          name: order.client_name,
          phone: order.client_phone
        });
      } else {
        console.log('[platform-orders] Sin setCurrentCustomer/assignCliente — cliente:', order.client_email);
      }
    } catch (_) {}
  }

  // ────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────
  function start() {
    if (_state.started) return;
    _state.started = true;
    _injectStyles();
    // Esperar a que el POS render esté listo
    function tryMount() {
      if (document.getElementById('screen-pos')) {
        _mountSection();
      } else {
        setTimeout(tryMount, 1000);
      }
    }
    tryMount();
    // Polling
    checkNow();
    _state.pollTimer = setInterval(checkNow, POLL_MS);
  }

  function stop() {
    _state.started = false;
    if (_state.pollTimer) { clearInterval(_state.pollTimer); _state.pollTimer = null; }
  }

  global.VolvixPlatformOrders = { start, stop, checkNow, _state };

  // Auto-start cuando hay token
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (_getTok()) start();
    }, 5000);
  });
})(typeof window !== 'undefined' ? window : this);
