/* ============================================================================
 * volvix-barcode-wiring.js
 * Volvix POS — Barcode reading module (R14)
 *
 * Public API:
 *   Volvix.barcode.startCameraScanner(videoElId, onDetect)
 *   Volvix.barcode.stopCameraScanner()
 *   Volvix.barcode.captureKeyboardWedge(inputEl, onScan)
 *   Volvix.barcode.generateBarcode(code, type, targetEl)
 *   Volvix.barcode.openScannerModal(onDetect)
 *   Volvix.barcode.lookupAndAddToCart(code)
 *   Volvix.barcode.autoWire(opts)
 *
 * Engines:
 *   1) Native BarcodeDetector API (Chrome / Edge / Android WebView).
 *   2) Fallback to ZXing-js loaded from CDN when unsupported (Firefox/Safari).
 *   3) JsBarcode (CDN) for EAN/Code128 generation; qrcode-generator for QR.
 *
 * Formats: EAN-13/8, UPC-A/E, Code-128, Code-39, ITF, Codabar, QR, Data Matrix,
 *          PDF417, Aztec.
 * ========================================================================== */

(function (global) {
  'use strict';

  const Volvix = global.Volvix = global.Volvix || {};
  const ns = Volvix.barcode = Volvix.barcode || {};

  const CDN = {
    zxing:     'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js',
    jsbarcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    qrcode:    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
  };

  const state = {
    stream: null, detector: null, rafId: null,
    zxingControls: null, videoEl: null, scriptCache: {}
  };

  function loadScript(url) {
    if (state.scriptCache[url]) return state.scriptCache[url];
    state.scriptCache[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
    return state.scriptCache[url];
  }

  const NATIVE_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'code_93',
    'qr_code', 'data_matrix',
    'itf', 'codabar', 'pdf417', 'aztec'
  ];

  // -- 1) CAMERA SCANNER -----------------------------------------------------
  ns.startCameraScanner = async function (videoElId, onDetect) {
    const videoEl = document.getElementById(videoElId);
    if (!videoEl) throw new Error('Video element #' + videoElId + ' not found');
    if (typeof onDetect !== 'function') throw new Error('onDetect callback required');
    state.videoEl = videoEl;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    state.stream = stream;
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', 'true');
    await videoEl.play();

    if ('BarcodeDetector' in global) {
      try {
        const supported = await global.BarcodeDetector.getSupportedFormats();
        const formats = NATIVE_FORMATS.filter(f => supported.includes(f));
        const detector = new global.BarcodeDetector({ formats });
        state.detector = detector;

        let lastCode = null, lastTs = 0;
        const tick = async () => {
          if (!state.stream) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes && codes.length) {
              const c = codes[0];
              const now = Date.now();
              if (c.rawValue !== lastCode || (now - lastTs) > 1500) {
                lastCode = c.rawValue; lastTs = now;
                onDetect({ code: c.rawValue, format: c.format });
              }
            }
          } catch (_) { /* skip frame */ }
          state.rafId = requestAnimationFrame(tick);
        };
        state.rafId = requestAnimationFrame(tick);
        return { stop: ns.stopCameraScanner, engine: 'native' };
      } catch (e) {
        console.warn('[Volvix.barcode] native detector failed, falling back to ZXing:', e);
      }
    }

    await loadScript(CDN.zxing);
    const ZX = global.ZXingBrowser || global.ZXing;
    if (!ZX) throw new Error('ZXing failed to load from CDN');
    const reader = new ZX.BrowserMultiFormatReader();
    let lastCode = null, lastTs = 0;
    const controls = await reader.decodeFromVideoElement(videoEl, (result) => {
      if (!result) return;
      const code = result.getText();
      const now = Date.now();
      if (code !== lastCode || (now - lastTs) > 1500) {
        lastCode = code; lastTs = now;
        onDetect({
          code,
          format: (result.getBarcodeFormat && result.getBarcodeFormat()) || 'unknown'
        });
      }
    });
    state.zxingControls = controls;
    return { stop: ns.stopCameraScanner, engine: 'zxing' };
  };

  ns.stopCameraScanner = function () {
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.zxingControls) { try { state.zxingControls.stop(); } catch (_) {} state.zxingControls = null; }
    if (state.stream) {
      state.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      state.stream = null;
    }
    if (state.videoEl) state.videoEl.srcObject = null;
    state.detector = null;
  };

  // -- 2) KEYBOARD WEDGE -----------------------------------------------------
  ns.captureKeyboardWedge = function (inputEl, onScan) {
    if (!inputEl) inputEl = document;
    if (typeof onScan !== 'function') throw new Error('onScan callback required');

    const MAX_INTERKEY_MS = 35;
    const MIN_LENGTH      = 4;
    const buffer          = [];
    let lastKeyTs         = 0;

    function onKeyDown(ev) {
      const now = Date.now();
      const dt  = now - lastKeyTs;
      lastKeyTs = now;

      if (ev.key === 'Enter') {
        const start   = buffer[0] ? buffer[0].ts : now;
        const elapsed = now - start;
        if (buffer.length >= MIN_LENGTH) {
          const avg = elapsed / Math.max(buffer.length, 1);
          if (avg < MAX_INTERKEY_MS) {
            const code = buffer.map(k => k.ch).join('');
            buffer.length = 0;
            ev.preventDefault();
            onScan(code);
            return;
          }
        }
        buffer.length = 0;
        return;
      }

      if (dt > 200) buffer.length = 0;
      if (ev.key && ev.key.length === 1) buffer.push({ ch: ev.key, ts: now });
    }

    inputEl.addEventListener('keydown', onKeyDown, true);
    return function unsubscribe() {
      inputEl.removeEventListener('keydown', onKeyDown, true);
    };
  };

  // -- 3) GENERATOR ----------------------------------------------------------
  ns.generateBarcode = async function (code, type, targetEl) {
    type = (type || 'code128').toLowerCase();
    let target = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;

    if (type === 'qr') {
      await loadScript(CDN.qrcode);
      const qr = global.qrcode(0, 'M');
      qr.addData(String(code));
      qr.make();
      const html = qr.createImgTag(4, 8);
      if (target) { target.innerHTML = html; return target; }
      const m = html.match(/src="([^"]+)"/);
      return m ? m[1] : html;
    }

    await loadScript(CDN.jsbarcode);
    const JsBarcode = global.JsBarcode;
    if (!JsBarcode) throw new Error('JsBarcode failed to load');

    const formatMap = {
      ean13: 'EAN13', ean8: 'EAN8',
      upc: 'UPC', upca: 'UPC',
      code128: 'CODE128', code39: 'CODE39',
      itf: 'ITF14'
    };
    const fmt = formatMap[type] || 'CODE128';

    if (!target) {
      target = document.createElement('canvas');
    } else if (target.tagName !== 'SVG' && target.tagName !== 'CANVAS' && target.tagName !== 'IMG') {
      target.innerHTML = '';
      const c = document.createElement('canvas');
      target.appendChild(c);
      target = c;
    }
    JsBarcode(target, String(code), { format: fmt, displayValue: true, margin: 8, height: 60 });
    return target;
  };

  // -- 4) MODAL UI -----------------------------------------------------------
  ns.openScannerModal = function (onDetect) {
    if (document.getElementById('volvix-bc-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'volvix-bc-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    modal.innerHTML =
      '<div style="background:#111;color:#fff;border-radius:12px;padding:18px;' +
      'max-width:560px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.6);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<h3 style="margin:0;font-size:17px;">Escanear código de barras</h3>' +
          '<button id="volvix-bc-close" style="background:transparent;color:#fff;border:0;font-size:22px;cursor:pointer;">&times;</button>' +
        '</div>' +
        '<div style="position:relative;background:#000;border-radius:8px;overflow:hidden;aspect-ratio:4/3;">' +
          '<video id="volvix-bc-video" style="width:100%;height:100%;object-fit:cover;" muted playsinline></video>' +
          '<div style="position:absolute;inset:15% 8%;border:2px solid #00ff88;border-radius:8px;' +
                      'box-shadow:0 0 0 9999px rgba(0,0,0,.25) inset;pointer-events:none;"></div>' +
        '</div>' +
        '<div id="volvix-bc-status" style="margin-top:10px;font-size:13px;opacity:.85;">Listo.</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="volvix-bc-start" style="flex:1;padding:10px 14px;border:0;border-radius:8px;' +
                  'background:#00b894;color:#fff;font-weight:600;cursor:pointer;">Activar cámara</button>' +
          '<button id="volvix-bc-cancel" style="flex:1;padding:10px 14px;border:0;border-radius:8px;' +
                  'background:#444;color:#fff;cursor:pointer;">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const $status = modal.querySelector('#volvix-bc-status');
    const close = () => { try { ns.stopCameraScanner(); } catch (_) {} modal.remove(); };

    modal.querySelector('#volvix-bc-close').onclick  = close;
    modal.querySelector('#volvix-bc-cancel').onclick = close;
    modal.querySelector('#volvix-bc-start').onclick  = async () => {
      $status.textContent = 'Solicitando permiso de cámara...';
      try {
        const handle = await ns.startCameraScanner('volvix-bc-video', (result) => {
          $status.textContent = 'Detectado: ' + result.code + ' (' + result.format + ')';
          if (typeof onDetect === 'function') onDetect(result);
          setTimeout(close, 600);
        });
        $status.textContent = 'Escaneando... (motor: ' + handle.engine + ')';
      } catch (e) {
        $status.textContent = 'Error: ' + e.message;
      }
    };
  };

  // -- 5) LOOKUP IN CATALOG → ADD TO CART ------------------------------------
  ns.lookupAndAddToCart = async function (code) {
    if (!code) return { ok: false, error: 'empty code' };
    try {
      const res = await fetch('/api/products?sku=' + encodeURIComponent(code), {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      if (!res.ok) return { ok: false, status: res.status, error: 'lookup failed' };
      const data = await res.json();
      const product = Array.isArray(data) ? data[0] : (data.product || data.data || data);
      if (!product || !(product.id || product.sku)) {
        document.dispatchEvent(new CustomEvent('volvix:product-not-found', { detail: { code } }));
        return { ok: false, error: 'not found', code };
      }
      if (Volvix.cart && typeof Volvix.cart.addItem === 'function') {
        Volvix.cart.addItem(product, 1);
      } else {
        document.dispatchEvent(new CustomEvent('volvix:product-scanned', { detail: { product, code } }));
      }
      return { ok: true, product };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // -- 6) AUTO-WIRE ----------------------------------------------------------
  ns.autoWire = function (opts) {
    opts = opts || {};
    const target = opts.target || document.body;
    const unsub = ns.captureKeyboardWedge(target, (code) => ns.lookupAndAddToCart(code));

    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('[data-volvix-scan]');
      if (btn) {
        ev.preventDefault();
        ns.openScannerModal((result) => ns.lookupAndAddToCart(result.code));
      }
    });
    return unsub;
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (!global.__VOLVIX_BARCODE_NO_AUTOWIRE) ns.autoWire();
      });
    } else {
      if (!global.__VOLVIX_BARCODE_NO_AUTOWIRE) ns.autoWire();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
