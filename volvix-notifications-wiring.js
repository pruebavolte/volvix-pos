/**
 * volvix-notifications-wiring.js
 * Sistema avanzado de notificaciones para Volvix POS
 * Agent-8 — Ronda 6 Fibonacci
 *
 * Características:
 *  - Centro de notificaciones (campana + badge contador)
 *  - Toasts mejorados (success / error / warning / info)
 *  - Web Push API
 *  - Auto-monitoreo: stock bajo, nueva venta, sync error, sesión expirando
 *  - Historial persistente (localStorage, máx 50)
 *  - Marcar leído / no leído / clear all
 *  - Sonidos opcionales (Web Audio API)
 */
(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // Estado y constantes
  // ──────────────────────────────────────────────────────────────
  const NOTIF_KEY        = 'volvix:notifications';
  const SETTINGS_KEY     = 'volvix:notif:settings';
  const MAX_HISTORY      = 50;
  const STOCK_INTERVAL   = 60_000;    // 1 min
  const SALES_INTERVAL   = 30_000;    // 30 s
  const SYNC_INTERVAL    = 45_000;    // 45 s
  const SESSION_INTERVAL = 60_000;    // 1 min
  const DEDUPE_WINDOW    = 60 * 60 * 1000; // 1 h

  let notifications = [];
  let panelOpen     = false;
  let lastSaleId    = null;
  let settings      = { soundEnabled: true, pushEnabled: true, autoMonitor: true };

  // ──────────────────────────────────────────────────────────────
  // Persistencia
  // ──────────────────────────────────────────────────────────────
  function load() {
    try { notifications = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); }
    catch { notifications = []; }
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (s && typeof s === 'object') settings = Object.assign(settings, s);
    } catch {}
  }
  function save() {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications.slice(-MAX_HISTORY)));
    } catch (e) { console.warn('[notif] save failed', e); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }

  // ──────────────────────────────────────────────────────────────
  // Estilos globales (una sola vez)
  // ──────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('volvix-notif-styles')) return;
    const style = document.createElement('style');
    style.id = 'volvix-notif-styles';
    style.textContent = `
      @keyframes vnSlideIn  { from {transform:translateX(110%);opacity:0;} to {transform:translateX(0);opacity:1;} }
      @keyframes vnSlideOut { from {transform:translateX(0);opacity:1;}    to {transform:translateX(110%);opacity:0;} }
      @keyframes vnPulse    { 0%,100% { transform:scale(1);} 50% { transform:scale(1.15);} }
      @keyframes vnFadeIn   { from {opacity:0; transform:translateY(-6px);} to {opacity:1; transform:translateY(0);} }
      .vn-toast { animation: vnSlideIn 0.3s ease forwards; }
      .vn-toast.vn-out { animation: vnSlideOut 0.3s ease forwards; }
      .vn-bell-pulse { animation: vnPulse 0.6s ease; }
      #notif-panel { animation: vnFadeIn 0.2s ease; }
      #notif-panel .vn-item { transition: background 0.15s; cursor:pointer; }
      #notif-panel .vn-item:hover { background:#273449; }
      #notif-panel::-webkit-scrollbar { width:6px; }
      #notif-panel::-webkit-scrollbar-thumb { background:#475569; border-radius:3px; }
    `;
    document.head.appendChild(style);
  }

  // ──────────────────────────────────────────────────────────────
  // Toasts
  // ──────────────────────────────────────────────────────────────
  const COLORS = {
    success: '#22c55e', error: '#ef4444',
    warning: '#f59e0b', info:  '#3b82f6'
  };
  const ICONS = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

  window.toast = function (message, type = 'info', duration = 3000) {
    injectStyles();
    const color = COLORS[type] || COLORS.info;
    const icon  = ICONS[type]  || ICONS.info;

    const div = document.createElement('div');
    div.className = 'vn-toast';
    div.style.cssText = `
      position:fixed;top:20px;right:20px;background:${color};
      color:#fff;padding:12px 20px;border-radius:8px;
      box-shadow:0 4px 12px rgba(0,0,0,0.25);
      z-index:99999;font-size:14px;max-width:350px;
      font-family:system-ui,sans-serif;line-height:1.35;
    `;
    div.innerHTML = `<strong style="margin-right:6px;">${icon}</strong>${escapeHtml(message)}`;

    // Apilar toasts existentes
    const existing = document.querySelectorAll('.vn-toast');
    let offset = 20;
    existing.forEach(e => { offset += e.offsetHeight + 10; });
    div.style.top = offset + 'px';

    document.body.appendChild(div);
    setTimeout(() => {
      div.classList.add('vn-out');
      setTimeout(() => div.remove(), 320);
    }, duration);
    return div;
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ──────────────────────────────────────────────────────────────
  // Notificación persistente
  // ──────────────────────────────────────────────────────────────
  window.notify = function (title, body, type = 'info', metadata = {}) {
    const notif = {
      id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title:    String(title  || ''),
      body:     String(body   || ''),
      type,
      metadata: metadata || {},
      read:     false,
      timestamp: Date.now()
    };
    notifications.push(notif);
    save();
    updateBadge(true);
    window.toast(`${title}: ${body}`, type);

    if (settings.pushEnabled && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/favicon.ico', tag: notif.id }); } catch {}
    }
    if (settings.soundEnabled) playNotifSound(type);

    // Refrescar panel si está abierto
    if (panelOpen) renderPanelBody();
    return notif;
  };

  // ──────────────────────────────────────────────────────────────
  // Sonidos (Web Audio)
  // ──────────────────────────────────────────────────────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { audioCtx = null; }
    return audioCtx;
  }
  function playNotifSound(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const freq = type === 'error'   ? 220 :
                   type === 'success' ? 880 :
                   type === 'warning' ? 440 : 600;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.30);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────
  // Centro de notificaciones (campana + panel)
  // ──────────────────────────────────────────────────────────────
  function createBellButton() {
    if (document.getElementById('volvix-notif-bell')) return;
    const btn = document.createElement('button');
    btn.id = 'volvix-notif-bell';
    btn.title = 'Notificaciones';
    btn.innerHTML = `
      <span style="position:relative;display:inline-block;">🔔
        <span id="notif-badge" style="display:none;position:absolute;top:-8px;right:-10px;
          background:#ef4444;color:#fff;font-size:10px;font-weight:bold;
          padding:2px 6px;border-radius:10px;min-width:18px;text-align:center;">0</span>
      </span>`;
    btn.style.cssText = `
      position:fixed;top:20px;right:80px;width:42px;height:42px;
      border-radius:50%;background:#1e293b;color:#fff;border:none;
      cursor:pointer;font-size:18px;z-index:9997;
      box-shadow:0 4px 12px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
    `;
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
  }

  function updateBadge(pulse = false) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = notifications.filter(n => !n.read).length;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? 'inline-block' : 'none';
    if (pulse) {
      const bell = document.getElementById('volvix-notif-bell');
      if (bell) {
        bell.classList.remove('vn-bell-pulse');
        void bell.offsetWidth;
        bell.classList.add('vn-bell-pulse');
      }
    }
  }

  function togglePanel() {
    const existing = document.getElementById('notif-panel');
    if (panelOpen && existing) {
      existing.remove();
      panelOpen = false;
      return;
    }
    const panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.style.cssText = `
      position:fixed;top:75px;right:80px;width:380px;max-height:520px;
      background:#1e293b;color:#fff;border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;z-index:9996;
      font-family:system-ui,sans-serif;display:flex;flex-direction:column;
    `;
    document.body.appendChild(panel);
    panelOpen = true;
    renderPanelBody();
  }

  function renderPanelBody() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const unread = notifications.filter(n => !n.read).length;
    panel.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:15px;">Notificaciones ${unread ? `<span style="color:#94a3b8;font-weight:normal;">(${unread})</span>`:''}</strong>
        <div style="display:flex;gap:8px;">
          <button data-action="mark-all"
            style="background:none;border:1px solid #334155;color:#94a3b8;cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px;">
            Marcar todo leído
          </button>
          <button data-action="clear"
            style="background:none;border:1px solid #334155;color:#ef4444;cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px;">
            Limpiar
          </button>
        </div>
      </div>
      <div style="overflow:auto;flex:1;">
        ${notifications.length === 0
          ? '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Sin notificaciones</div>'
          : notifications.slice().reverse().map(renderItem).join('')}
      </div>
      <div style="padding:8px 14px;border-top:1px solid #334155;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;">
        <label style="cursor:pointer;"><input type="checkbox" data-setting="soundEnabled" ${settings.soundEnabled?'checked':''}> Sonido</label>
        <label style="cursor:pointer;"><input type="checkbox" data-setting="pushEnabled"  ${settings.pushEnabled ?'checked':''}> Push</label>
        <label style="cursor:pointer;"><input type="checkbox" data-setting="autoMonitor"  ${settings.autoMonitor ?'checked':''}> Monitor</label>
      </div>
    `;

    // Wire-up
    panel.querySelector('[data-action="mark-all"]').onclick = () => { window.markAllRead(); };
    panel.querySelector('[data-action="clear"]').onclick    = () => {
      if (confirm('¿Eliminar todas las notificaciones?')) window.clearNotifications();
    };
    panel.querySelectorAll('[data-setting]').forEach(cb => {
      cb.onchange = () => {
        settings[cb.dataset.setting] = cb.checked;
        saveSettings();
      };
    });
    panel.querySelectorAll('[data-id]').forEach(el => {
      el.onclick = () => window.markRead(el.dataset.id);
    });
  }

  function renderItem(n) {
    const color = COLORS[n.type] || COLORS.info;
    const icon  = ICONS[n.type]  || ICONS.info;
    return `
      <div class="vn-item" data-id="${n.id}"
        style="padding:12px 16px;border-bottom:1px solid #334155;${n.read?'opacity:0.55;':''}border-left:3px solid ${color};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <div style="font-size:13px;font-weight:bold;">
            <span style="color:${color};margin-right:4px;">${icon}</span>${escapeHtml(n.title)}
          </div>
          ${n.read?'':'<span style="width:8px;height:8px;background:#3b82f6;border-radius:50%;display:inline-block;"></span>'}
        </div>
        <div style="font-size:12px;color:#cbd5e1;margin-left:18px;">${escapeHtml(n.body)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;margin-left:18px;">
          ${formatTime(n.timestamp)}
        </div>
      </div>`;
  }

  function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)        return 'hace instantes';
    if (diff < 3_600_000)     return `hace ${Math.floor(diff/60_000)} min`;
    if (diff < 86_400_000)    return `hace ${Math.floor(diff/3_600_000)} h`;
    return new Date(ts).toLocaleString();
  }

  // ──────────────────────────────────────────────────────────────
  // Acciones públicas: marcar / limpiar
  // ──────────────────────────────────────────────────────────────
  window.markRead = function (id) {
    const n = notifications.find(x => x.id === id);
    if (n && !n.read) { n.read = true; save(); updateBadge(); if (panelOpen) renderPanelBody(); }
  };
  window.markAllRead = function () {
    let changed = false;
    notifications.forEach(n => { if (!n.read) { n.read = true; changed = true; } });
    if (changed) { save(); updateBadge(); if (panelOpen) renderPanelBody(); }
  };
  window.clearNotifications = function () {
    notifications = [];
    save();
    updateBadge();
    if (panelOpen) renderPanelBody();
  };
  window.removeNotification = function (id) {
    notifications = notifications.filter(n => n.id !== id);
    save(); updateBadge(); if (panelOpen) renderPanelBody();
  };

  // ──────────────────────────────────────────────────────────────
  // Utilidad: dedupe por tipo de evento
  // ──────────────────────────────────────────────────────────────
  function recentDuplicate(metaType) {
    return notifications.find(n =>
      n.metadata && n.metadata.type === metaType &&
      Date.now() - n.timestamp < DEDUPE_WINDOW
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Auto-monitores
  // ──────────────────────────────────────────────────────────────
  async function monitorStock() {
    if (!settings.autoMonitor) return;
    try {
      const res = await fetch(location.origin + '/api/owner/low-stock', { credentials: 'include' });
      if (!res.ok) return;
      const lowStock = await res.json();
      if (Array.isArray(lowStock) && lowStock.length > 0 && !recentDuplicate('low-stock')) {
        window.notify(
          'Stock bajo',
          `${lowStock.length} producto(s) necesitan reabastecimiento`,
          'warning',
          { type: 'low-stock', count: lowStock.length }
        );
      }
    } catch {}
  }

  async function monitorNewSales() {
    if (!settings.autoMonitor) return;
    try {
      const res = await fetch(location.origin + '/api/sales/latest', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const sale = Array.isArray(data) ? data[0] : data;
      if (!sale || !sale.id) return;
      if (lastSaleId === null) { lastSaleId = sale.id; return; }
      if (sale.id !== lastSaleId) {
        lastSaleId = sale.id;
        window.notify(
          'Nueva venta',
          `Venta #${sale.id}${sale.total ? ' por $' + sale.total : ''}`,
          'success',
          { type: 'new-sale', saleId: sale.id }
        );
      }
    } catch {}
  }

  async function monitorSync() {
    if (!settings.autoMonitor) return;
    try {
      const res = await fetch(location.origin + '/api/sync/status', { credentials: 'include' });
      if (!res.ok) {
        if (!recentDuplicate('sync-error')) {
          window.notify('Error de sincronización',
            `Servidor respondió ${res.status}`, 'error',
            { type: 'sync-error', status: res.status });
        }
        return;
      }
      const data = await res.json();
      if (data && data.error && !recentDuplicate('sync-error')) {
        window.notify('Error de sincronización', String(data.error),
          'error', { type: 'sync-error' });
      }
    } catch (e) {
      if (!recentDuplicate('sync-error')) {
        window.notify('Error de sincronización', 'Sin conexión con el servidor',
          'error', { type: 'sync-error' });
      }
    }
  }

  function monitorSession() {
    if (!settings.autoMonitor) return;
    try {
      const expRaw = localStorage.getItem('volvix:session:expiresAt') ||
                     sessionStorage.getItem('volvix:session:expiresAt');
      if (!expRaw) return;
      const exp = parseInt(expRaw, 10);
      if (!exp) return;
      const remaining = exp - Date.now();
      if (remaining > 0 && remaining < 5 * 60_000 && !recentDuplicate('session-expiring')) {
        window.notify(
          'Sesión por expirar',
          `Tu sesión expira en ${Math.ceil(remaining/60_000)} minuto(s)`,
          'warning',
          { type: 'session-expiring', remaining }
        );
      }
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────
  // Web Push permission
  // ──────────────────────────────────────────────────────────────
  function requestPushPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Diferir hasta primer click del usuario para evitar bloqueo
      const handler = () => {
        try { Notification.requestPermission(); } catch {}
        document.removeEventListener('click', handler);
      };
      document.addEventListener('click', handler, { once: true });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Init
  // ──────────────────────────────────────────────────────────────
  function init() {
    load();
    injectStyles();
    createBellButton();
    updateBadge();
    requestPushPermission();

    // Monitores periódicos
    setInterval(monitorStock,   STOCK_INTERVAL);
    setInterval(monitorNewSales, SALES_INTERVAL);
    setInterval(monitorSync,    SYNC_INTERVAL);
    setInterval(monitorSession, SESSION_INTERVAL);

    // Primera ejecución diferida
    setTimeout(monitorStock,    2_000);
    setTimeout(monitorNewSales, 4_000);
    setTimeout(monitorSync,     6_000);
    setTimeout(monitorSession,  8_000);

    // Cerrar panel al click fuera
    document.addEventListener('click', (e) => {
      if (!panelOpen) return;
      const panel = document.getElementById('notif-panel');
      const bell  = document.getElementById('volvix-notif-bell');
      if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
        panel.remove();
        panelOpen = false;
      }
    });

    console.log('[volvix-notifications] inicializado — historial:', notifications.length);
  }

  // ──────────────────────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────────────────────
  window.NotificationsAPI = {
    toast:           window.toast,
    notify:          window.notify,
    list:            () => notifications.slice(),
    unreadCount:     () => notifications.filter(n => !n.read).length,
    clear:           window.clearNotifications,
    markRead:        window.markRead,
    markAllRead:     window.markAllRead,
    remove:          window.removeNotification,
    open:            () => { if (!panelOpen) togglePanel(); },
    close:           () => { if (panelOpen)  togglePanel(); },
    settings:        () => Object.assign({}, settings),
    setSetting:      (k, v) => { if (k in settings) { settings[k] = !!v; saveSettings(); } },
    requestPush:     () => 'Notification' in window ? Notification.requestPermission() : Promise.resolve('denied'),
    // Disparadores manuales (útiles para testing y para wiring externo)
    triggerLowStock:    (count)   => window.notify('Stock bajo', `${count} producto(s) bajos`, 'warning', { type:'low-stock', count }),
    triggerNewSale:     (id, tot) => window.notify('Nueva venta', `Venta #${id} por $${tot}`,    'success', { type:'new-sale', saleId:id }),
    triggerSyncError:   (msg)     => window.notify('Error de sincronización', msg || 'Sin conexión', 'error', { type:'sync-error' }),
    triggerSessionExp:  (mins)    => window.notify('Sesión por expirar', `Expira en ${mins} min`, 'warning', { type:'session-expiring' })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
