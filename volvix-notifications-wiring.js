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

  // VxUI: VolvixUI con fallback nativo
  const _w = window;
  const VxUI = {
    async destructiveConfirm(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function')
        return !!(await _w.VolvixUI.destructiveConfirm(opts));
      const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
    }
  };

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
  // Centro de notificaciones (campana + panel) — REMOVED (UI cleanup)
  // #vlx-bell y #vlx-notif-drawer eliminados. Polling conservado.
  // ──────────────────────────────────────────────────────────────
  // createBellButton() removed — no floating bell injected in DOM

  function updateBadge(pulse = false) {
    // no-op: bell UI removed
  }

  function togglePanel() {
    // no-op: panel UI removed
  }

  function renderPanelBody() {
    // no-op: panel UI removed
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

  // Helper: log de error de sistema al backend (silencioso, sin toast).
  function _logSystemError(payload) {
    try {
      var body = JSON.stringify(Object.assign({
        type: 'system',
        url: location.href,
        user_agent: navigator.userAgent
      }, payload || {}));
      var headers = { 'Content-Type': 'application/json' };
      try {
        var tok = localStorage.getItem('volvix_token');
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
      } catch (_) {}
      fetch('/api/errors/log', { method: 'POST', headers: headers, body: body, credentials: 'include' })
        .catch(function () {});
    } catch (_) {}
  }

  async function monitorSync() {
    if (!settings.autoMonitor) return;
    // 2026-05: skip en páginas públicas (home/landings/registro/login) y
    // cuando NO hay token. Antes esto saturaba system_error_logs con 510
    // entradas/semana de '401 sync status' en visitantes anónimos del home.
    try {
      if (typeof window.__vlxIsPublicPage === 'function' && window.__vlxIsPublicPage()) return;
      var __tok = '';
      try { __tok = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || ''; } catch (_) {}
      if (!__tok) return;
    } catch (_) {}
    try {
      const res = await fetch(location.origin + '/api/sync/status', { credentials: 'include' });
      if (!res.ok) {
        // 2026-05: 401 en monitorSync es esperado cuando el token expira;
        // no es ruido — loguear con level=info, no como error.
        if (res.status === 401) {
          // Token expiró, dejar que auth-helper haga el redirect.
          return;
        }
        // Errores de sistema: NO mostrar toast al usuario. Loguear al backend.
        _logSystemError({
          code: String(res.status),
          message: 'sync status http ' + res.status,
          source: 'monitorSync'
        });
        // Si el error es crítico (5xx) y aún no hemos avisado, mensaje genérico discreto.
        if (res.status >= 500 && !recentDuplicate('sync-system-critical')) {
          try {
            window.notify(
              'Conexión inestable',
              'Estamos arreglando un problema. Reintenta en unos minutos.',
              'warning',
              { type: 'sync-system-critical' }
            );
          } catch (_) {}
        }
        return;
      }
      const data = await res.json();
      if (data && data.error) {
        _logSystemError({
          code: 'sync-status-error',
          message: String(data.error).slice(0, 500),
          source: 'monitorSync'
        });
      }
    } catch (e) {
      // Error de red: registrar silenciosamente, no spamear al usuario.
      _logSystemError({
        code: 'network',
        message: String((e && e.message) || e).slice(0, 500),
        source: 'monitorSync'
      });
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
  // FIX-B: NO auto-fire push permission. User must click explicit
  // "Activar notificaciones" button. Modal "Nombre completo" auto-fire
  // bug fixed by removing automatic Notification.requestPermission().
  // ──────────────────────────────────────────────────────────────
  function requestPushPermission() {
    // FIX-B: Auto-fire eliminado. Esta función ahora es no-op por defecto.
    // Para permitir auto-fire en pantallas legítimas (ej. owner_panel para
    // alertas críticas), el usuario debe cumplir UNO de:
    //   1. URL con ?optin=true query param
    //   2. localStorage.volvix_push_optin === 'true'
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    let allowAuto = false;
    try {
      const qs = (typeof URLSearchParams !== 'undefined')
        ? new URLSearchParams(window.location.search)
        : null;
      const optinQS = qs && qs.get('optin') === 'true';
      const optinLS = (typeof localStorage !== 'undefined') &&
                      localStorage.getItem('volvix_push_optin') === 'true';
      allowAuto = !!(optinQS || optinLS);
    } catch (_) {}

    if (!allowAuto) {
      // No-op: solo opt-in explícito vía window.VolvixNotif.requestOptIn()
      return;
    }

    // Opt-in detectado: pedir permiso al primer click (sin spammear al cargar)
    const handler = () => {
      try { Notification.requestPermission(); } catch {}
      document.removeEventListener('click', handler);
    };
    document.addEventListener('click', handler, { once: true });
  }

  // FIX-B: API pública para opt-in EXPLÍCITO por click de usuario.
  // Llamar desde un botón "Activar notificaciones" en la UI.
  function requestOptIn() {
    if (!('Notification' in window)) {
      return Promise.resolve('unsupported');
    }
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied')  return Promise.resolve('denied');
    try {
      try { localStorage.setItem('volvix_push_optin', 'true'); } catch (_) {}
      return Promise.resolve(Notification.requestPermission());
    } catch (e) {
      return Promise.resolve('error');
    }
  }
  // Exponer global para que botones de UI puedan llamarla
  window.VolvixNotif = window.VolvixNotif || {};
  window.VolvixNotif.requestOptIn = requestOptIn;

  // ──────────────────────────────────────────────────────────────
  // Init
  // ──────────────────────────────────────────────────────────────
  function init() {
    // R29: NO disparar auto-monitores en pantallas públicas
    // (marketplace, login, hub-landing, customer-portal, kiosk, fraud)
    var publicPages = [
      '/login.html', '/marketplace.html', '/volvix-hub-landing.html',
      '/landing_dynamic.html', '/volvix-kiosk.html', '/volvix-shop.html',
      '/volvix-grand-tour.html', '/volvix-sitemap.html', '/volvix-api-docs.html',
      '/volvix-gdpr-portal.html', '/404.html'
    ];
    var path = (location && location.pathname) || '';
    var isPublic = publicPages.some(function(p){ return path === p || path.endsWith(p); });
    if (isPublic) {
      // Sin bell, sin monitores, solo expone API
      return;
    }
    load();
    injectStyles();
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
    triggerSyncError:   (msg)     => { _logSystemError({ code:'manual', message: String(msg || 'Sin conexión').slice(0,500), source:'triggerSyncError' }); },
    triggerSessionExp:  (mins)    => window.notify('Sesión por expirar', `Expira en ${mins} min`, 'warning', { type:'session-expiring' })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
