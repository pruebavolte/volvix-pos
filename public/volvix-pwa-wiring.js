/* ============================================================================
 * volvix-pwa-wiring.js
 * PWA installer + lifecycle wiring for Volvix POS
 * Agent-14 / Ronda 7 Fibonacci
 *
 * Responsabilidades:
 *  - Inyectar <link rel="manifest"> y meta tags si faltan
 *  - Capturar beforeinstallprompt y mostrar botón flotante "Instalar app"
 *  - Detectar si la PWA ya está instalada (display-mode standalone)
 *  - Registrar service worker y manejar updates automáticos
 *  - Mostrar splash screen en cold-start
 *  - Aplicar styling de status bar (theme-color dinámico)
 *  - Manejar online/offline indicators
 *  - Tracking de instalaciones (appinstalled)
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ----------------------------- Config ------------------------------------
  var CFG = {
    manifestPath: '/manifest.json',
    swPath: '/sw.js',
    themeColor: '#3B82F6',
    bgColor: '#0A0A0A',
    appName: 'Volvix POS',
    installButtonText: 'Instalar app',
    installButtonIcon: '⬇',          // ⬇
    // 2026-05-14 PERF: usuario reporto que el splash negro retrasa la pagina.
    // splashDuration=0 deshabilita la pantalla negra de loading.
    // (Solo en PWA installed habria justificacion para mostrarlo brevemente).
    splashDuration: 0,
    updateCheckInterval: 60 * 60 * 1000,  // 1h
    storageKeys: {
      installDismissed: 'volvix_install_dismissed_at',
      installedAt: 'volvix_installed_at',
      lastUpdateCheck: 'volvix_last_update_check'
    },
    dismissTtl: 7 * 24 * 60 * 60 * 1000   // re-mostrar después de 7 días
  };

  // ---------------------------- State --------------------------------------
  var state = {
    deferredPrompt: null,
    installed: false,
    standalone: false,
    swRegistration: null,
    online: navigator.onLine,
    bootedAt: Date.now()
  };

  // --------------------------- Utilidades ----------------------------------
  function log() {
    if (!global.__VOLVIX_PWA_DEBUG__) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Volvix PWA]');
    console.log.apply(console, args);
  }

  function warn() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Volvix PWA]');
    console.warn.apply(console, args);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  function isStandalone() {
    return (
      (global.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
      (global.matchMedia && matchMedia('(display-mode: window-controls-overlay)').matches) ||
      navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0
    );
  }

  // -------------------- Inyección de manifest + metas ----------------------
  function injectHead() {
    if (!$('link[rel="manifest"]')) {
      var link = document.createElement('link');
      link.rel = 'manifest';
      link.href = CFG.manifestPath;
      document.head.appendChild(link);
      log('manifest link inyectado');
    }
    var metas = [
      ['theme-color', CFG.themeColor],
      ['mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
      ['apple-mobile-web-app-title', CFG.appName],
      ['application-name', CFG.appName],
      ['msapplication-TileColor', CFG.themeColor],
      ['msapplication-tap-highlight', 'no'],
      ['format-detection', 'telephone=no']
    ];
    metas.forEach(function (m) {
      if (!$('meta[name="' + m[0] + '"]')) {
        var el = document.createElement('meta');
        el.name = m[0];
        el.content = m[1];
        document.head.appendChild(el);
      }
    });
  }

  // -------------------------- Splash Screen --------------------------------
  function showSplash() {
    // 2026-05-14 PERF: splash deshabilitado. Early return.
    if (CFG.splashDuration <= 0) return;
    if (sessionStorage.getItem('volvix_splash_shown') === '1') return;
    sessionStorage.setItem('volvix_splash_shown', '1');

    var splash = document.createElement('div');
    splash.id = 'volvix-splash';
    splash.setAttribute('role', 'status');
    splash.setAttribute('aria-label', 'Cargando ' + CFG.appName);
    splash.innerHTML =
      '<div class="vsp-inner">' +
        '<div class="vsp-logo">V</div>' +
        '<div class="vsp-name">' + CFG.appName + '</div>' +
        '<div class="vsp-bar"><div class="vsp-bar-fill"></div></div>' +
      '</div>';
    document.documentElement.appendChild(splash);

    setTimeout(function () {
      splash.classList.add('vsp-fade');
      setTimeout(function () { splash.remove(); }, 400);
    }, CFG.splashDuration);
  }

  // --------------------------- Botón Instalar ------------------------------
  function shouldShowInstallButton() {
    if (state.installed || state.standalone) return false;
    var dismissed = parseInt(lsGet(CFG.storageKeys.installDismissed) || '0', 10);
    if (dismissed && (Date.now() - dismissed) < CFG.dismissTtl) return false;
    return !!state.deferredPrompt;
  }

  function renderInstallButton() {
    if ($('#volvix-install-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'volvix-install-btn';
    btn.type = 'button';
    btn.innerHTML =
      '<span class="vib-icon">' + CFG.installButtonIcon + '</span>' +
      '<span class="vib-text">' + CFG.installButtonText + '</span>' +
      '<span class="vib-close" data-action="dismiss" aria-label="Descartar">&times;</span>';
    btn.addEventListener('click', function (ev) {
      var act = ev.target && ev.target.getAttribute('data-action');
      if (act === 'dismiss') {
        ev.stopPropagation();
        dismissInstall();
        return;
      }
      triggerInstall();
    });
    document.body.appendChild(btn);
    requestAnimationFrame(function () { btn.classList.add('vib-show'); });
  }

  function removeInstallButton() {
    var b = $('#volvix-install-btn');
    if (b) {
      b.classList.remove('vib-show');
      setTimeout(function () { b.remove(); }, 300);
    }
  }

  function dismissInstall() {
    lsSet(CFG.storageKeys.installDismissed, Date.now());
    removeInstallButton();
    log('install dismissed');
  }

  function triggerInstall() {
    if (!state.deferredPrompt) {
      warn('No hay deferredPrompt disponible');
      return;
    }
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then(function (choice) {
      log('userChoice:', choice.outcome);
      if (choice.outcome === 'accepted') {
        lsSet(CFG.storageKeys.installedAt, Date.now());
        removeInstallButton();
        emit('volvix:installed', { source: 'prompt' });
      } else {
        dismissInstall();
      }
      state.deferredPrompt = null;
    }).catch(function (e) { warn('userChoice error', e); });
  }

  // ---------------------- Eventos PWA del navegador ------------------------
  function wireInstallEvents() {
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.deferredPrompt = e;
      log('beforeinstallprompt capturado');
      if (shouldShowInstallButton()) renderInstallButton();
      emit('volvix:installable');
    });

    global.addEventListener('appinstalled', function () {
      state.installed = true;
      lsSet(CFG.storageKeys.installedAt, Date.now());
      removeInstallButton();
      log('appinstalled');
      emit('volvix:installed', { source: 'native' });
    });
  }

  // -------------------------- Service Worker -------------------------------
  function registerSW() {
    if (!('serviceWorker' in navigator)) {
      warn('SW no soportado');
      return;
    }
    navigator.serviceWorker.register(CFG.swPath, { scope: '/' })
      .then(function (reg) {
        state.swRegistration = reg;
        log('SW registrado', reg.scope);

        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });

        // Chequeo periódico
        setInterval(function () {
          reg.update().catch(function () {});
          lsSet(CFG.storageKeys.lastUpdateCheck, Date.now());
        }, CFG.updateCheckInterval);
      })
      .catch(function (e) { warn('SW register fail', e); });

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      log('controllerchange -> reload');
      global.location.reload();
    });
  }

  function showUpdateToast() {
    if ($('#volvix-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'volvix-update-toast';
    t.innerHTML =
      '<span>Nueva versión disponible</span>' +
      '<button id="vut-apply">Actualizar</button>' +
      '<button id="vut-later" aria-label="Más tarde">&times;</button>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('vut-show'); });

    $('#vut-apply').addEventListener('click', function () {
      var reg = state.swRegistration;
      if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    $('#vut-later').addEventListener('click', function () {
      t.classList.remove('vut-show');
      setTimeout(function () { t.remove(); }, 300);
    });
  }

  // -------------------------- Online / Offline -----------------------------
  function wireConnectivity() {
    function onChange() {
      state.online = navigator.onLine;
      document.documentElement.setAttribute('data-volvix-net', state.online ? 'online' : 'offline');
      emit(state.online ? 'volvix:online' : 'volvix:offline');
      if (!state.online) toastOffline();
    }
    global.addEventListener('online', onChange);
    global.addEventListener('offline', onChange);
    onChange();
  }

  function toastOffline() {
    if ($('#volvix-offline-toast')) return;
    var t = document.createElement('div');
    t.id = 'volvix-offline-toast';
    t.textContent = 'Sin conexión — modo offline';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  // ---------------------- Status bar dinámica ------------------------------
  function setThemeColor(color) {
    var meta = $('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color || CFG.themeColor;
  }

  // ----------------------------- Estilos -----------------------------------
  function injectStyles() {
    if ($('#volvix-pwa-styles')) return;
    var css = [
      '#volvix-splash{position:fixed;inset:0;background:' + CFG.bgColor + ';z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:opacity .4s ease;opacity:1}',
      '#volvix-splash.vsp-fade{opacity:0;pointer-events:none}',
      '#volvix-splash .vsp-inner{text-align:center;color:#fff;font-family:system-ui,sans-serif}',
      '#volvix-splash .vsp-logo{width:96px;height:96px;border-radius:24px;background:' + CFG.themeColor + ';color:#fff;font-size:64px;font-weight:900;line-height:96px;margin:0 auto 16px;box-shadow:0 12px 40px rgba(59,130,246,.4)}',
      '#volvix-splash .vsp-name{font-size:20px;letter-spacing:.5px;margin-bottom:24px;opacity:.9}',
      '#volvix-splash .vsp-bar{width:160px;height:4px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;margin:0 auto}',
      '#volvix-splash .vsp-bar-fill{width:40%;height:100%;background:' + CFG.themeColor + ';border-radius:4px;animation:vsp-slide 1.2s ease-in-out infinite}',
      '@keyframes vsp-slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}',

      '#volvix-install-btn{position:fixed;bottom:20px;right:20px;display:flex;align-items:center;gap:8px;background:' + CFG.themeColor + ';color:#fff;border:0;border-radius:999px;padding:12px 18px 12px 16px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(59,130,246,.4);cursor:pointer;z-index:2147483645;opacity:0;transform:translateY(20px);transition:all .3s ease}',
      '#volvix-install-btn.vib-show{opacity:1;transform:translateY(0)}',
      '#volvix-install-btn:hover{filter:brightness(1.1)}',
      '#volvix-install-btn .vib-icon{font-size:16px}',
      '#volvix-install-btn .vib-close{margin-left:6px;padding:0 4px;border-radius:50%;background:rgba(0,0,0,.15);font-size:18px;line-height:1;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center}',
      '#volvix-install-btn .vib-close:hover{background:rgba(0,0,0,.3)}',

      '#volvix-update-toast{position:fixed;bottom:20px;left:50%;transform:translate(-50%,40px);background:#1F2937;color:#fff;padding:12px 16px;border-radius:12px;display:flex;align-items:center;gap:12px;font:500 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:2147483645;opacity:0;transition:all .3s ease}',
      '#volvix-update-toast.vut-show{opacity:1;transform:translate(-50%,0)}',
      '#volvix-update-toast button{background:' + CFG.themeColor + ';color:#fff;border:0;border-radius:8px;padding:6px 12px;font:600 13px system-ui,sans-serif;cursor:pointer}',
      '#volvix-update-toast #vut-later{background:transparent;padding:4px 8px;font-size:18px}',

      '#volvix-offline-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#DC2626;color:#fff;padding:8px 16px;border-radius:999px;font:600 13px system-ui,sans-serif;z-index:2147483645;box-shadow:0 4px 16px rgba(220,38,38,.4)}',

      'html[data-volvix-net="offline"] body::before{content:"";position:fixed;top:0;left:0;right:0;height:3px;background:#DC2626;z-index:2147483647}',

      '@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}#volvix-install-btn{display:none !important}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'volvix-pwa-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ------------------------- Event emitter mini ----------------------------
  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
  }

  // ------------------------------- API -------------------------------------
  var api = {
    install: triggerInstall,
    dismiss: dismissInstall,
    isInstalled: function () { return state.installed || state.standalone; },
    isStandalone: function () { return state.standalone; },
    getRegistration: function () { return state.swRegistration; },
    setThemeColor: setThemeColor,
    config: CFG,
    state: state,
    version: '1.0.0'
  };

  // ------------------------------ Boot -------------------------------------
  function boot() {
    state.standalone = isStandalone();
    state.installed = state.standalone || !!lsGet(CFG.storageKeys.installedAt);

    injectStyles();
    injectHead();
    if (!state.standalone) showSplash();
    wireInstallEvents();
    wireConnectivity();

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      global.addEventListener('load', registerSW);
    }

    log('booted', { standalone: state.standalone, installed: state.installed });
    emit('volvix:pwa-ready', api);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.VolvixPWA = api;
})(window);
