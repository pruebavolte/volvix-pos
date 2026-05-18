/**
 * volvix-pwa-install-prompt.js
 * Advanced PWA Install Prompt with platform detection,
 * platform-specific instructions and smart timing.
 *
 * Exposes: window.PWAInstall
 *   PWAInstall.init(opts)
 *   PWAInstall.show()
 *   PWAInstall.dismiss()
 *   PWAInstall.canInstall()
 *   PWAInstall.getPlatform()
 *   PWAInstall.isInstalled()
 *   PWAInstall.on(event, cb)   // events: 'available','accepted','dismissed','installed','shown'
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'volvix_pwa_install_state_v1';
  var DEFAULTS = {
    minVisits: 2,
    minSecondsOnSite: 30,
    dismissCooldownDays: 7,
    autoShow: true,
    appName: 'Volvix POS',
    appIcon: '/icon-192.png',
    primaryColor: '#0066ff',
    debug: false
  };

  var state = {
    deferredPrompt: null,
    platform: 'unknown',
    installed: false,
    shown: false,
    listeners: {},
    opts: Object.assign({}, DEFAULTS),
    startTs: Date.now()
  };

  // ---------- Storage ----------
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function bumpVisits() {
    var s = loadStore();
    s.visits = (s.visits || 0) + 1;
    s.lastVisit = Date.now();
    saveStore(s);
    return s;
  }
  function markDismissed() {
    var s = loadStore();
    s.dismissedAt = Date.now();
    s.dismissCount = (s.dismissCount || 0) + 1;
    saveStore(s);
  }
  function markInstalled() {
    var s = loadStore();
    s.installedAt = Date.now();
    saveStore(s);
  }

  // ---------- Platform detection ----------
  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (isIOS || isIPadOS) return 'ios';
    if (/Android/i.test(ua)) {
      if (/SamsungBrowser/i.test(ua)) return 'android-samsung';
      if (/FxiOS|Firefox/i.test(ua)) return 'android-firefox';
      return 'android';
    }
    if (/Edg\//.test(ua)) return 'desktop-edge';
    if (/Chrome\//.test(ua)) return 'desktop-chrome';
    if (/Firefox\//.test(ua)) return 'desktop-firefox';
    if (/Safari\//.test(ua)) return 'desktop-safari';
    return 'desktop';
  }

  function isStandalone() {
    return (
      window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0
    );
  }

  // ---------- Event bus ----------
  function on(evt, cb) {
    (state.listeners[evt] = state.listeners[evt] || []).push(cb);
  }
  function emit(evt, data) {
    (state.listeners[evt] || []).forEach(function (cb) {
      try { cb(data); } catch (e) { if (state.opts.debug) console.error(e); }
    });
  }

  // ---------- Smart timing ----------
  function shouldShow() {
    if (state.installed || isStandalone()) return false;
    var s = loadStore();
    var visits = s.visits || 0;
    var secs = (Date.now() - state.startTs) / 1000;
    if (visits < state.opts.minVisits) return false;
    if (secs < state.opts.minSecondsOnSite) return false;
    if (s.dismissedAt) {
      var days = (Date.now() - s.dismissedAt) / 86400000;
      if (days < state.opts.dismissCooldownDays) return false;
    }
    return true;
  }

  // ---------- UI ----------
  function buildInstructions(platform) {
    switch (platform) {
      case 'ios':
        return [
          'Toca el boton Compartir en la barra inferior.',
          'Desplazate y selecciona "Anadir a pantalla de inicio".',
          'Confirma tocando "Anadir".'
        ];
      case 'android':
      case 'android-samsung':
      case 'android-firefox':
        return [
          'Abre el menu del navegador (tres puntos).',
          'Selecciona "Instalar app" o "Anadir a pantalla principal".',
          'Confirma la instalacion.'
        ];
      case 'desktop-chrome':
      case 'desktop-edge':
        return [
          'Haz clic en el icono de instalacion en la barra de direcciones.',
          'O abre el menu y selecciona "Instalar ' + state.opts.appName + '".',
          'Confirma la instalacion.'
        ];
      case 'desktop-firefox':
        return [
          'Firefox no soporta instalacion PWA nativa en escritorio.',
          'Puedes anadir un acceso directo desde el menu.',
          'Recomendamos Chrome o Edge para mejor experiencia.'
        ];
      case 'desktop-safari':
        return [
          'Safari de escritorio tiene soporte limitado de PWA.',
          'Usa Compartir > Anadir al Dock (macOS Sonoma+).',
          'O usa Chrome/Edge para instalacion completa.'
        ];
      default:
        return [
          'Abre el menu de tu navegador.',
          'Busca la opcion "Instalar" o "Anadir a inicio".',
          'Confirma la instalacion.'
        ];
    }
  }

  function injectStyles() {
    if (document.getElementById('pwa-install-styles')) return;
    var css =
      '#pwa-install-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:flex-end;justify-content:center;z-index:99999;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'animation:pwaFadeIn .25s ease}' +
      '#pwa-install-modal.hidden{display:none}' +
      '#pwa-install-card{background:#fff;width:100%;max-width:480px;' +
      'border-radius:16px 16px 0 0;padding:24px;box-shadow:0 -8px 32px rgba(0,0,0,.2);' +
      'animation:pwaSlideUp .3s ease}' +
      '@media(min-width:600px){#pwa-install-card{border-radius:16px;margin-bottom:24px}}' +
      '#pwa-install-card h3{margin:0 0 8px;font-size:20px;color:#111}' +
      '#pwa-install-card p{margin:0 0 16px;color:#555;font-size:14px;line-height:1.5}' +
      '#pwa-install-card ol{padding-left:20px;color:#333;font-size:14px;line-height:1.7}' +
      '#pwa-install-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}' +
      '#pwa-install-header img{width:48px;height:48px;border-radius:12px}' +
      '#pwa-install-actions{display:flex;gap:8px;margin-top:20px}' +
      '#pwa-install-actions button{flex:1;padding:12px;border:none;border-radius:8px;' +
      'font-size:14px;font-weight:600;cursor:pointer}' +
      '#pwa-install-yes{background:var(--pwa-color,#0066ff);color:#fff}' +
      '#pwa-install-no{background:#eee;color:#333}' +
      '@keyframes pwaFadeIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes pwaSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
    var style = document.createElement('style');
    style.id = 'pwa-install-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderModal() {
    injectStyles();
    var existing = document.getElementById('pwa-install-modal');
    if (existing) existing.remove();

    var p = state.platform;
    var nativeAvailable = !!state.deferredPrompt;
    var steps = buildInstructions(p);
    var stepsHtml = nativeAvailable ? '' :
      '<ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';

    var modal = document.createElement('div');
    modal.id = 'pwa-install-modal';
    modal.style.setProperty('--pwa-color', state.opts.primaryColor);
    modal.innerHTML =
      '<div id="pwa-install-card" role="dialog" aria-labelledby="pwa-title">' +
      '<div id="pwa-install-header">' +
      '<img src="' + state.opts.appIcon + '" alt="" onerror="this.style.display=\'none\'">' +
      '<h3 id="pwa-title">Instalar ' + state.opts.appName + '</h3>' +
      '</div>' +
      '<p>Accede mas rapido, funciona offline y notificaciones push.</p>' +
      stepsHtml +
      '<div id="pwa-install-actions">' +
      '<button id="pwa-install-no" type="button">Ahora no</button>' +
      (nativeAvailable ? '<button id="pwa-install-yes" type="button">Instalar</button>' : '') +
      '</div></div>';

    document.body.appendChild(modal);

    document.getElementById('pwa-install-no').addEventListener('click', dismiss);
    if (nativeAvailable) {
      document.getElementById('pwa-install-yes').addEventListener('click', triggerNativePrompt);
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) dismiss();
    });

    state.shown = true;
    emit('shown', { platform: p, native: nativeAvailable });
  }

  // ---------- Actions ----------
  function triggerNativePrompt() {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') {
        emit('accepted', choice);
        markInstalled();
      } else {
        emit('dismissed', choice);
        markDismissed();
      }
      state.deferredPrompt = null;
      hideModal();
    });
  }

  function show() {
    if (state.installed || isStandalone()) return false;
    renderModal();
    return true;
  }

  function dismiss() {
    markDismissed();
    emit('dismissed', { reason: 'user' });
    hideModal();
  }

  function hideModal() {
    var m = document.getElementById('pwa-install-modal');
    if (m) m.remove();
    state.shown = false;
  }

  function canInstall() {
    return !!state.deferredPrompt || /^ios|android/.test(state.platform);
  }

  // ---------- Init ----------
  function init(opts) {
    state.opts = Object.assign({}, DEFAULTS, opts || {});
    state.platform = detectPlatform();
    state.installed = isStandalone();
    bumpVisits();

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.deferredPrompt = e;
      emit('available', { platform: state.platform });
      if (state.opts.autoShow) scheduleAutoShow();
    });

    window.addEventListener('appinstalled', function () {
      state.installed = true;
      state.deferredPrompt = null;
      markInstalled();
      emit('installed', {});
      hideModal();
    });

    if (state.platform === 'ios' && !state.installed && state.opts.autoShow) {
      scheduleAutoShow();
    }

    if (state.opts.debug) {
      console.log('[PWAInstall] init', { platform: state.platform, installed: state.installed });
    }
  }

  function scheduleAutoShow() {
    var delay = state.opts.minSecondsOnSite * 1000;
    setTimeout(function () {
      if (shouldShow()) show();
    }, Math.max(0, delay - (Date.now() - state.startTs)));
  }

  // ---------- Public API ----------
  global.PWAInstall = {
    init: init,
    show: show,
    dismiss: dismiss,
    canInstall: canInstall,
    getPlatform: function () { return state.platform; },
    isInstalled: function () { return state.installed || isStandalone(); },
    on: on
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init({}); });
  } else {
    init({});
  }
})(window);
