/**
 * volvix-capacitor-api-rewrite.js
 *
 * 2026-05-12 BUG #5 FIX: cuando el APK Capacitor corre, `location.origin` es
 * `https://localhost` (servidor interno de Capacitor que sirve el bundle).
 * Los `fetch('/api/...')` van a `https://localhost/api/...` que NO existe
 * y termina sirviendo el index.html (SPA fallback) → fail silencioso.
 *
 * Este wrapper detecta Capacitor isNativePlatform y reescribe `/api/*` a
 * `https://volvix-pos.vercel.app/api/*` con credentials:'include'.
 *
 * Debe cargarse ANTES de cualquier código que haga fetch (auth-gate.js,
 * volvix-offline-queue.js, etc.). Idealmente en el <head> de cada HTML.
 *
 * El backend en api/index.js permite Origin = https://localhost via
 * ALLOWED_ORIGINS.
 */
(function () {
  'use strict';

  // Detectar Capacitor de forma robusta:
  // 1. window.Capacitor?.isNativePlatform?.() — la API oficial
  // 2. window.location.protocol === 'capacitor:' — iOS
  // 3. window.location.hostname === 'localhost' Y UA contiene 'Mobile' — heuristica APK
  function isCapacitorNative() {
    try {
      if (typeof window.Capacitor === 'object' &&
          typeof window.Capacitor.isNativePlatform === 'function') {
        return window.Capacitor.isNativePlatform();
      }
    } catch (_) {}
    if (window.location.protocol === 'capacitor:') return true;
    // Fallback heuristico: WebView Android sirve desde localhost con UA mobile
    if (window.location.hostname === 'localhost' &&
        /Android/i.test(navigator.userAgent) &&
        /wv|; wv\)/.test(navigator.userAgent)) {
      return true;
    }
    return false;
  }

  if (!isCapacitorNative()) {
    // En browser web normal, no hacer nada.
    return;
  }

  var API_BASE = 'https://volvix-pos.vercel.app';
  console.info('[capacitor-api] Activado: /api/* y /v1/* serán reenviados a', API_BASE);

  // Marcar que estamos reescribiendo para que otros scripts sepan
  try { window.__VLX_API_BASE = API_BASE; } catch (_) {}

  // Patch fetch
  var __origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      // Solo reescribir paths RELATIVOS que empiezan con /api/ o /v1/
      // (NO si ya es absoluto: https://..., capacitor://..., http://...)
      var isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
      var needsRewrite = !isAbsolute && (
        url.indexOf('/api/') === 0 ||
        url.indexOf('/v1/') === 0
      );
      if (needsRewrite) {
        var newUrl = API_BASE + url;
        if (typeof input === 'string') {
          input = newUrl;
        } else {
          input = new Request(newUrl, input);
        }
        // Forzar credentials='include' para que cookies/CORS funcionen
        init = Object.assign({}, init || {}, { credentials: init && init.credentials || 'include', mode: 'cors' });
      }
    } catch (e) {
      console.warn('[capacitor-api] rewrite error', e);
    }
    return __origFetch(input, init);
  };

  // Patch XMLHttpRequest tambien (por si algun lib viejo lo usa)
  var __origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (typeof url === 'string') {
        var isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
        if (!isAbsolute && (url.indexOf('/api/') === 0 || url.indexOf('/v1/') === 0)) {
          arguments[1] = API_BASE + url;
        }
      }
    } catch (_) {}
    return __origXhrOpen.apply(this, arguments);
  };

  // Tambien hookear navigator.sendBeacon
  if (typeof navigator.sendBeacon === 'function') {
    var __origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try {
        if (typeof url === 'string') {
          var isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
          if (!isAbsolute && (url.indexOf('/api/') === 0 || url.indexOf('/v1/') === 0)) {
            url = API_BASE + url;
          }
        }
      } catch (_) {}
      return __origBeacon(url, data);
    };
  }
})();
