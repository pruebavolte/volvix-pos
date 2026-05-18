/**
 * volvix-capacitor-bridge.js — 2026-05-12 v1.0.173
 *
 * Cuando la app corre dentro del APK Android (Capacitor), los archivos HTML/CSS/JS
 * se sirven desde `https://localhost` (el server interno de Capacitor lee del
 * webDir bundleado). Pero las llamadas `/api/*` necesitan ir a Vercel.
 *
 * Sin este bridge, `/api/productos` resolvería a `https://localhost/api/productos`
 * que NO existe en el bundle → 404. La app se rompe.
 *
 * Este script DEBE cargarse PRIMERO en el HTML (antes que cualquier otro script
 * que use fetch). Detecta Capacitor y override `window.fetch` + `XMLHttpRequest`
 * para que `/api/*` se reescriba a `https://volvix-pos.vercel.app/api/*`.
 *
 * Offline behavior: si no hay internet, las llamadas a Vercel fallan rápido,
 * y el offline-queue + IndexedDB local toman el relevo.
 */
(function () {
  'use strict';

  if (window.__volvixCapacitorBridgeLoaded) return;
  window.__volvixCapacitorBridgeLoaded = true;

  // Detectar si estamos dentro de Capacitor
  var isCapacitor = !!(
    window.Capacitor ||
    (window.location && window.location.protocol === 'capacitor:') ||
    (window.location && window.location.hostname === 'localhost' &&
     navigator.userAgent.indexOf('Mobile') >= 0)
  );

  if (!isCapacitor) {
    // Browser normal — no hacer nada
    window.__volvixPlatform = 'web';
    return;
  }

  window.__volvixPlatform = 'android';
  console.log('[volvix-capacitor] APK detectado, configurando bridge…');

  var API_BASE = 'https://volvix-pos.vercel.app';

  // Helper: convierte URL relativa o absoluta interna a la URL real del backend
  function rewriteURL(u) {
    if (!u || typeof u !== 'string') return u;
    // Solo reescribir /api/* y rutas que empiezan con / hacia localhost (capacitor scheme)
    if (u.startsWith('/api/') || u.startsWith('/internal/')) {
      return API_BASE + u;
    }
    // URLs absolutas a localhost de capacitor → reescribir a Vercel
    if (u.indexOf('://localhost/api/') >= 0 || u.indexOf('://localhost/internal/') >= 0) {
      return u.replace(/^https?:\/\/localhost/, API_BASE);
    }
    return u;
  }

  // Override window.fetch
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      if (typeof input === 'string') {
        input = rewriteURL(input);
      } else if (input && input.url) {
        // Request object — clonar con la URL reescrita si aplica
        var newUrl = rewriteURL(input.url);
        if (newUrl !== input.url) {
          input = new Request(newUrl, input);
        }
      }
    } catch (e) { /* fallback al origFetch */ }
    return origFetch(input, init);
  };

  // Override XMLHttpRequest.open
  var XHRopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var newUrl = rewriteURL(url);
    arguments[1] = newUrl;
    return XHRopen.apply(this, arguments);
  };

  // ─── AUTO-UPDATER (chequea GitHub Releases) ─────────────────────────────
  // No podemos usar electron-updater. Implementación simple:
  // 1. Al boot, fetch GitHub releases/latest
  // 2. Comparar tag_name con la versión actual (window.__vlxAppVersion o '1.0.0')
  // 3. Si hay nueva versión, mostrar banner discreto que abre URL del APK en navegador
  //    (Android abre el APK descargado y solicita permiso de instalación)
  function checkForUpdate() {
    if (!navigator.onLine) return;
    fetch('https://api.github.com/repos/pruebavolte/volvix-pos/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json' }
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.tag_name) return;
      var latest = String(data.tag_name).replace(/^v/, '');
      var current = window.__vlxAppVersion ||
                    (document.querySelector('meta[name="version"]') &&
                     document.querySelector('meta[name="version"]').content) ||
                    '1.0.0';
      if (compareVersions(latest, current) > 0) {
        var apkAsset = (data.assets || []).find(function (a) {
          return /VolvixPOS\.apk$|VolvixPOS-.*\.apk$/.test(a.name);
        });
        if (apkAsset) {
          showUpdateBanner(latest, apkAsset.browser_download_url);
        }
      }
    })
    .catch(function () { /* offline u otro error — silencioso */ });
  }

  function compareVersions(a, b) {
    var pa = String(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function showUpdateBanner(version, url) {
    if (document.getElementById('vlx-update-banner')) return;
    var b = document.createElement('div');
    b.id = 'vlx-update-banner';
    b.setAttribute('data-vlx-system', 'updater');
    b.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;' +
      'background:linear-gradient(90deg,#1d4ed8,#2563eb);color:#fff;' +
      'font-family:system-ui,sans-serif;font-size:13px;line-height:1.3;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.2);">' +
      '<span style="font-size:18px;">🔄</span>' +
      '<div style="flex:1;"><strong>Actualización disponible</strong> · v' + version +
      '<br><span style="font-size:11.5px;opacity:.85;">' +
      'Descarga el nuevo APK y reinicia la app.</span></div>' +
      '<a href="' + url + '" target="_blank" rel="noopener" ' +
      'style="background:#fff;color:#1d4ed8;padding:7px 14px;border-radius:6px;' +
      'text-decoration:none;font-weight:700;font-size:12.5px;">Descargar</a>' +
      '<button onclick="this.closest(\'#vlx-update-banner\').remove()" ' +
      'style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;' +
      'padding:0 4px;">×</button></div>';
    b.style.cssText =
      'position:fixed!important;top:0!important;left:0!important;right:0!important;' +
      'z-index:2147483647!important;';
    if (document.body) {
      document.body.insertBefore(b, document.body.firstChild);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.insertBefore(b, document.body.firstChild);
      });
    }
  }

  // Chequear actualización 10s después del boot (no bloquear arranque)
  setTimeout(checkForUpdate, 10000);

  // Re-chequear cada 6h
  setInterval(checkForUpdate, 6 * 60 * 60 * 1000);

  // Reportar versión instalada al backend (silent heartbeat)
  setTimeout(function () {
    try {
      fetch(API_BASE + '/api/version/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: window.__vlxAppVersion || '1.0.0',
          platform: 'android',
          user_agent: navigator.userAgent.slice(0, 200)
        })
      }).catch(function () {});
    } catch (_) {}
  }, 5000);

  console.log('[volvix-capacitor] Bridge activo · API_BASE=' + API_BASE);
})();
