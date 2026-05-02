/**
 * volvix-mobile-wiring.js
 * Volvix POS — Mobile Wrapper Detection & Native API Bridge
 *
 * Detecta el entorno de ejecución (Capacitor, Cordova, PWA standalone, browser)
 * y expone una API unificada window.MobileAPI con mocks de capacidades nativas:
 * camera, GPS, fingerprint, NFC, bluetooth, share.
 *
 * Si existe un puente nativo real (Capacitor/Cordova plugin), lo usa.
 * Si no, cae en mock funcional para desarrollo web.
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. DETECCIÓN DE ENTORNO
  // ─────────────────────────────────────────────────────────────
  const Env = {
    isCapacitor: !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()),
    isCordova: !!(global.cordova || global.PhoneGap || global.phonegap),
    isReactNativeWebView: !!(global.ReactNativeWebView),
    isPWAStandalone: (function () {
      try {
        return (
          (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
          global.navigator.standalone === true
        );
      } catch (e) { return false; }
    })(),
    isAndroid: /Android/i.test(global.navigator ? global.navigator.userAgent : ''),
    isIOS: /iPhone|iPad|iPod/i.test(global.navigator ? global.navigator.userAgent : ''),
    isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator ? global.navigator.userAgent : ''),
    isBrowser: false,
    platform: 'unknown',
    wrapper: 'none'
  };
  Env.isBrowser = !(Env.isCapacitor || Env.isCordova || Env.isReactNativeWebView);
  Env.platform = Env.isAndroid ? 'android' : Env.isIOS ? 'ios' : 'web';
  Env.wrapper = Env.isCapacitor ? 'capacitor'
              : Env.isCordova ? 'cordova'
              : Env.isReactNativeWebView ? 'react-native'
              : Env.isPWAStandalone ? 'pwa'
              : 'browser';

  function log(tag, msg, data) {
    if (!global.__VOLVIX_DEBUG__) return;
    const prefix = '[MobileAPI:' + tag + ']';
    if (data !== undefined) console.log(prefix, msg, data);
    else console.log(prefix, msg);
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CAMERA
  // ─────────────────────────────────────────────────────────────
  async function camera(opts) {
    opts = opts || {};
    const quality = opts.quality || 80;
    const source = opts.source || 'prompt'; // 'camera' | 'gallery' | 'prompt'
    log('camera', 'request', { quality, source, wrapper: Env.wrapper });

    if (Env.isCapacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Camera) {
      try {
        const r = await global.Capacitor.Plugins.Camera.getPhoto({
          quality, allowEditing: false, resultType: 'base64'
        });
        return { ok: true, source: 'capacitor', dataUrl: 'data:image/jpeg;base64,' + r.base64String };
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }

    if (Env.isCordova && global.navigator.camera) {
      return new Promise(function (resolve) {
        global.navigator.camera.getPicture(
          function (data) { resolve({ ok: true, source: 'cordova', dataUrl: 'data:image/jpeg;base64,' + data }); },
          function (err) { resolve({ ok: false, error: err }); },
          { quality: quality, destinationType: 0 }
        );
      });
    }

    // Mock browser: input file
    return new Promise(function (resolve) {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (source === 'camera') input.capture = 'environment';
        input.onchange = function () {
          const f = input.files && input.files[0];
          if (!f) return resolve({ ok: false, error: 'cancelled' });
          const reader = new FileReader();
          reader.onload = function () { resolve({ ok: true, source: 'browser-mock', dataUrl: reader.result, name: f.name, size: f.size }); };
          reader.onerror = function () { resolve({ ok: false, error: 'read-fail' }); };
          reader.readAsDataURL(f);
        };
        input.click();
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. GPS / GEOLOCATION
  // ─────────────────────────────────────────────────────────────
  async function gps(opts) {
    opts = opts || {};
    const timeout = opts.timeout || 10000;
    log('gps', 'request', opts);

    if (Env.isCapacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Geolocation) {
      try {
        const p = await global.Capacitor.Plugins.Geolocation.getCurrentPosition({ timeout });
        return { ok: true, source: 'capacitor', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    if (global.navigator && global.navigator.geolocation) {
      return new Promise(function (resolve) {
        global.navigator.geolocation.getCurrentPosition(
          function (p) {
            resolve({
              ok: true, source: 'browser',
              lat: p.coords.latitude, lng: p.coords.longitude,
              accuracy: p.coords.accuracy, ts: p.timestamp
            });
          },
          function (err) { resolve({ ok: false, error: err.message, code: err.code }); },
          { enableHighAccuracy: true, timeout: timeout, maximumAge: 0 }
        );
      });
    }
    return { ok: false, error: 'geolocation-unsupported' };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. FINGERPRINT / BIOMETRIC
  // ─────────────────────────────────────────────────────────────
  async function fingerprint(opts) {
    opts = opts || {};
    const reason = opts.reason || 'Confirmar identidad';
    log('fingerprint', 'request', { reason });

    if (Env.isCapacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BiometricAuth) {
      try {
        const r = await global.Capacitor.Plugins.BiometricAuth.verify({ reason });
        return { ok: !!r.verified, source: 'capacitor' };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    // WebAuthn fallback (real-ish biometric en browsers compatibles)
    if (global.PublicKeyCredential && global.navigator.credentials) {
      try {
        const available = await global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) return { ok: true, source: 'webauthn-mock', verified: true, note: 'mock-pass' };
        return { ok: false, error: 'no-platform-authenticator' };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    // Mock total
    return new Promise(function (resolve) {
      const ok = global.confirm ? global.confirm('[MOCK FINGERPRINT] ' + reason + '\n¿Aceptar?') : true;
      resolve({ ok: ok, source: 'mock', verified: ok });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 5. NFC
  // ─────────────────────────────────────────────────────────────
  async function nfc(opts) {
    opts = opts || {};
    const action = opts.action || 'read'; // 'read' | 'write'
    log('nfc', 'request', opts);

    if (Env.isCordova && global.nfc) {
      return new Promise(function (resolve) {
        global.nfc.addNdefListener(
          function (ev) { resolve({ ok: true, source: 'cordova', tag: ev.tag }); },
          function () { resolve({ ok: true, source: 'cordova', listener: true }); },
          function (err) { resolve({ ok: false, error: err }); }
        );
      });
    }

    // Web NFC API (Chrome Android)
    if ('NDEFReader' in global) {
      try {
        const reader = new global.NDEFReader();
        await reader.scan();
        return { ok: true, source: 'web-nfc', listening: true };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    // Mock
    return {
      ok: true, source: 'mock', action: action,
      tagId: 'MOCK-' + uuid().slice(0, 8).toUpperCase(),
      payload: action === 'read' ? 'volvix://mock/nfc/' + Date.now() : null
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. BLUETOOTH
  // ─────────────────────────────────────────────────────────────
  async function bluetooth(opts) {
    opts = opts || {};
    const action = opts.action || 'scan';
    log('bluetooth', 'request', opts);

    if (global.navigator && global.navigator.bluetooth && action === 'scan') {
      try {
        const dev = await global.navigator.bluetooth.requestDevice({
          acceptAllDevices: true, optionalServices: opts.services || []
        });
        return { ok: true, source: 'web-bluetooth', id: dev.id, name: dev.name || 'unknown' };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    // Mock
    return {
      ok: true, source: 'mock', action: action,
      devices: [
        { id: 'mock-01', name: 'Volvix Printer 80mm', rssi: -52, type: 'printer' },
        { id: 'mock-02', name: 'Volvix Scanner BT', rssi: -71, type: 'scanner' },
        { id: 'mock-03', name: 'Volvix Drawer', rssi: -65, type: 'cash-drawer' }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. SHARE
  // ─────────────────────────────────────────────────────────────
  async function share(opts) {
    opts = opts || {};
    const payload = {
      title: opts.title || 'Volvix POS',
      text: opts.text || '',
      url: opts.url || (global.location ? global.location.href : '')
    };
    log('share', 'request', payload);

    if (Env.isCapacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Share) {
      try { await global.Capacitor.Plugins.Share.share(payload); return { ok: true, source: 'capacitor' }; }
      catch (e) { return { ok: false, error: e.message }; }
    }

    if (global.navigator && global.navigator.share) {
      try { await global.navigator.share(payload); return { ok: true, source: 'web-share' }; }
      catch (e) { return { ok: false, error: e.message }; }
    }

    // Mock: copy to clipboard
    try {
      const txt = payload.title + '\n' + payload.text + '\n' + payload.url;
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(txt);
        return { ok: true, source: 'clipboard-mock', copied: true };
      }
    } catch (e) {}
    return { ok: false, error: 'no-share-available' };
  }

  // ─────────────────────────────────────────────────────────────
  // 8. EXTRAS: vibrate, statusbar, network, haptics
  // ─────────────────────────────────────────────────────────────
  function vibrate(pattern) {
    pattern = pattern || 100;
    if (global.navigator && global.navigator.vibrate) {
      global.navigator.vibrate(pattern);
      return { ok: true, source: 'browser' };
    }
    return { ok: false, error: 'no-vibration' };
  }

  function network() {
    const c = global.navigator && (global.navigator.connection || global.navigator.mozConnection || global.navigator.webkitConnection);
    return {
      ok: true,
      online: global.navigator ? global.navigator.onLine : true,
      type: c ? c.effectiveType : 'unknown',
      downlink: c ? c.downlink : null,
      rtt: c ? c.rtt : null,
      saveData: c ? !!c.saveData : false
    };
  }

  function haptics(style) {
    style = style || 'light';
    if (Env.isCapacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) {
      try { global.Capacitor.Plugins.Haptics.impact({ style: style }); return { ok: true, source: 'capacitor' }; }
      catch (e) { return { ok: false, error: e.message }; }
    }
    return vibrate(style === 'heavy' ? 200 : style === 'medium' ? 100 : 30);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. DETECT — devuelve snapshot completo del entorno
  // ─────────────────────────────────────────────────────────────
  function detect() {
    const snap = {
      wrapper: Env.wrapper,
      platform: Env.platform,
      isMobile: Env.isMobile,
      isBrowser: Env.isBrowser,
      isPWA: Env.isPWAStandalone,
      capabilities: {
        camera: !!(Env.isCapacitor || Env.isCordova || (global.navigator && global.navigator.mediaDevices)),
        gps: !!(global.navigator && global.navigator.geolocation),
        fingerprint: !!(global.PublicKeyCredential || (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BiometricAuth)),
        nfc: !!('NDEFReader' in global || global.nfc),
        bluetooth: !!(global.navigator && global.navigator.bluetooth),
        share: !!(global.navigator && global.navigator.share) || Env.isCapacitor,
        vibrate: !!(global.navigator && global.navigator.vibrate),
        clipboard: !!(global.navigator && global.navigator.clipboard)
      },
      userAgent: global.navigator ? global.navigator.userAgent : '',
      screen: global.screen ? { w: global.screen.width, h: global.screen.height, dpr: global.devicePixelRatio || 1 } : null,
      online: global.navigator ? global.navigator.onLine : true,
      ts: Date.now()
    };
    log('detect', 'snapshot', snap);
    return snap;
  }

  // ─────────────────────────────────────────────────────────────
  // 10. EVENT BUS — pause/resume/back-button/online/offline
  // ─────────────────────────────────────────────────────────────
  const listeners = {};
  function on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); }
  function off(ev, cb) { if (!listeners[ev]) return; listeners[ev] = listeners[ev].filter(function (f) { return f !== cb; }); }
  function emit(ev, data) { (listeners[ev] || []).forEach(function (cb) { try { cb(data); } catch (e) { log('emit', 'cb-error', e); } }); }

  if (global.addEventListener) {
    global.addEventListener('online', function () { emit('online', network()); });
    global.addEventListener('offline', function () { emit('offline', network()); });
    if (global.document) {
      global.document.addEventListener('pause', function () { emit('pause'); }, false);
      global.document.addEventListener('resume', function () { emit('resume'); }, false);
      global.document.addEventListener('backbutton', function (e) { emit('backbutton', e); }, false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 11. PUBLIC API
  // ─────────────────────────────────────────────────────────────
  const MobileAPI = {
    version: '1.0.0',
    env: Env,
    detect: detect,
    camera: camera,
    gps: gps,
    fingerprint: fingerprint,
    nfc: nfc,
    bluetooth: bluetooth,
    share: share,
    vibrate: vibrate,
    haptics: haptics,
    network: network,
    on: on,
    off: off,
    _emit: emit
  };

  global.MobileAPI = MobileAPI;
  log('init', 'ready', { wrapper: Env.wrapper, platform: Env.platform });

  // Auto-emit ready
  if (global.document && global.document.readyState !== 'loading') {
    setTimeout(function () { emit('ready', detect()); }, 0);
  } else if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () { emit('ready', detect()); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
