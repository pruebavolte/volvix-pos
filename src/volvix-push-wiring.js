/* ============================================================
   Volvix POS - Web Push Notifications (cliente)
   R14 - VAPID + Service Worker
   ============================================================ */
(function () {
  'use strict';

  const API_BASE = (window.VOLVIX_API_BASE || '').replace(/\/$/, '');
  const SW_URL   = '/sw.js';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function getToken() {
    return localStorage.getItem('volvix_token') ||
           localStorage.getItem('token') || '';
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const tk = getToken();
    if (tk) headers['Authorization'] = 'Bearer ' + tk;
    const r = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    return r.json();
  }

  async function getVapidKey() {
    const r = await fetch(API_BASE + '/api/push/vapid-public-key');
    const j = await r.json();
    if (!j || !j.key) throw new Error('VAPID public key no disponible en el backend');
    return j.key;
  }

  async function ensureSWRegistered() {
    if (!('serviceWorker' in navigator)) throw new Error('SW no soportado');
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register(SW_URL);
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function requestPermission() {
    if (!('Notification' in window)) throw new Error('Notification API no soportada');
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';
    return await Notification.requestPermission();
  }

  async function subscribe() {
    const perm = await requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'permission_' + perm };

    const reg = await ensureSWRegistered();
    const vapid = await getVapidKey();

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }

    const json = sub.toJSON();
    const res = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: json }),
    });
    return { ok: !!res.ok, sub: json, server: res };
  }

  async function unsubscribe() {
    const reg = await ensureSWRegistered();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true, message: 'no estaba suscrito' };
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (_) {}
    const res = await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
    return { ok: !!res.ok, server: res };
  }

  async function status() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { supported: false };
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return {
      supported:  true,
      permission: (window.Notification && Notification.permission) || 'default',
      subscribed: !!sub,
      endpoint:   sub ? sub.endpoint : null,
    };
  }

  // API publica
  window.VolvixPush = {
    subscribe,
    unsubscribe,
    status,
    getVapidKey,
  };

  // FIX-B: Auto-init NO dispara Notification.requestPermission().
  // Solo re-asegura suscripción si el permiso YA estaba concedido previamente
  // por una acción explícita del usuario (botón "Activar notificaciones").
  // Si permission === 'default', no hacer nada (evita modal auto-fire).
  // Para permitir auto-subscribe en pantallas legítimas, requiere opt-in explícito:
  //   - URL con ?optin=true
  //   - localStorage.volvix_push_optin === 'true'
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!getToken()) return; // solo usuarios autenticados
      if (!window.Notification) return;

      // FIX-B: NO solicitar permiso automáticamente
      if (Notification.permission !== 'granted') return;

      // Permiso ya concedido (usuario lo aceptó antes): re-asegurar sub silente
      const s = await status();
      if (!s.subscribed) {
        // re-suscribir silenciosamente (no muestra modal — permission ya granted)
        subscribe().catch(() => {});
      }
    } catch (_) {}
  });

  // FIX-B: API pública opt-in para que botones de UI puedan suscribir
  // explícitamente (esto SÍ puede mostrar el prompt — pero solo por click usuario).
  window.VolvixPush = window.VolvixPush || {};
  window.VolvixPush.requestOptIn = async function () {
    try {
      try { localStorage.setItem('volvix_push_optin', 'true'); } catch (_) {}
      return await subscribe();
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  };
})();
