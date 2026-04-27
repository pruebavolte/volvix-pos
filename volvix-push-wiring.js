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

  // Auto-init: si ya hay permiso concedido, re-asegura suscripcion silenciosamente.
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!getToken()) return; // solo usuarios autenticados
      if (window.Notification && Notification.permission === 'granted') {
        const s = await status();
        if (!s.subscribed) {
          // re-suscribir silenciosamente
          subscribe().catch(() => {});
        }
      }
    } catch (_) {}
  });
})();
