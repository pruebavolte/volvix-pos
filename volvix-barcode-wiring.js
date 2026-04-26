/**
 * volvix-barcode-wiring.js
 * Agent-49 R9 Volvix - Barcode Scanner Module
 *
 * Provides camera-based barcode scanning (EAN-13, UPC-A, UPC-E, QR)
 * via getUserMedia + canvas image processing. Exposes window.BarcodeAPI.
 *
 * Features:
 *  - Floating camera button (📷)
 *  - Live video preview overlay
 *  - Frame capture & decode loop (~10 fps)
 *  - Pure-JS 1D barcode decoder (EAN/UPC) + QR detection via BarcodeDetector when available
 *  - Beep on detection (WebAudio)
 *  - Auto-fill of target input element
 *  - Public API: start(), stop(), onDetect(cb), setTarget(selector)
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------
  const state = {
    stream: null,
    video: null,
    canvas: null,
    ctx: null,
    overlay: null,
    button: null,
    running: false,
    rafId: null,
    lastCode: null,
    lastDetectAt: 0,
    targetSelector: 'input[data-barcode-target], #barcode-input, input[name="barcode"]',
    callbacks: [],
    audioCtx: null,
    nativeDetector: null,
    decodeBusy: false,
    fps: 10,
  };

  // -------------------------------------------------------------------------
  // Beep using WebAudio
  // -------------------------------------------------------------------------
  function beep(freq, ms) {
    try {
      if (!state.audioCtx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        state.audioCtx = new Ctx();
      }
      const ac = state.audioCtx;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = freq || 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      setTimeout(() => { osc.stop(); }, ms || 120);
    } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // EAN-13 / UPC-A pure-JS decoder
  // -------------------------------------------------------------------------
  // Standard EAN-13 L/G/R encodings
  const EAN_L = ['0001101','0011001','0010011','0111101','0100011',
                 '0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101',
                 '0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100',
                 '1001110','1010000','1000100','1001000','1110100'];
  const FIRST_DIGIT_PATTERN = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
                               'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function binarizeRow(pixels, width, y) {
    // Compute row luminance and threshold (Otsu-like simple mean)
    const row = new Uint8Array(width);
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = (pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114) | 0;
      row[x] = lum;
      sum += lum;
    }
    const mean = sum / width;
    const bin = new Uint8Array(width);
    for (let x = 0; x < width; x++) bin[x] = row[x] < mean ? 1 : 0; // 1 = bar
    return bin;
  }

  function rowToRunLengths(bin) {
    const runs = [];
    let cur = bin[0], len = 1;
    for (let i = 1; i < bin.length; i++) {
      if (bin[i] === cur) { len++; }
      else { runs.push({ v: cur, n: len }); cur = bin[i]; len = 1; }
    }
    runs.push({ v: cur, n: len });
    return runs;
  }

  function decodeEANFromRuns(runs) {
    // Find a start guard 1-1-1 (bar-space-bar) of roughly equal width
    for (let i = 0; i < runs.length - 60; i++) {
      if (runs[i].v !== 1) continue;
      const w = runs[i].n;
      if (runs[i+1].v !== 0 || runs[i+2].v !== 1) continue;
      if (Math.abs(runs[i+1].n - w) > w || Math.abs(runs[i+2].n - w) > w) continue;
      // Module width estimate
      const mw = (runs[i].n + runs[i+1].n + runs[i+2].n) / 3;
      // 6 left digits = 6*4 runs = 24
      const leftStart = i + 3;
      const digits = [];
      const patterns = [];
      let p = leftStart;
      let ok = true;
      for (let d = 0; d < 6; d++) {
        const r = decodeDigit(runs, p, mw);
        if (!r) { ok = false; break; }
        digits.push(r.digit);
        patterns.push(r.set);
        p += 4;
      }
      if (!ok) continue;
      // Center guard 0-1-0-1-0 (5 runs)
      if (p + 5 >= runs.length) continue;
      if (runs[p].v !== 0 || runs[p+1].v !== 1 || runs[p+2].v !== 0 ||
          runs[p+3].v !== 1 || runs[p+4].v !== 0) continue;
      p += 5;
      for (let d = 0; d < 6; d++) {
        const r = decodeDigit(runs, p, mw, true);
        if (!r) { ok = false; break; }
        digits.push(r.digit);
        p += 4;
      }
      if (!ok) continue;
      // Determine first digit from L/G pattern of left side
      const pat = patterns.join('');
      const first = FIRST_DIGIT_PATTERN.indexOf(pat);
      if (first < 0) continue;
      const ean = String(first) + digits.join('');
      if (verifyEAN13(ean)) return ean;
      // Try UPC-A (12 digits = first '0' then rest)
      if (first === 0) {
        const upc = ean.substring(1);
        if (verifyEAN13('0' + upc)) return upc;
      }
    }
    return null;
  }

  function decodeDigit(runs, p, mw, rightSide) {
    if (p + 3 >= runs.length) return null;
    const widths = [runs[p].n, runs[p+1].n, runs[p+2].n, runs[p+3].n];
    const total = widths[0] + widths[1] + widths[2] + widths[3];
    // Each digit = 7 modules; normalize widths to modules
    const mods = widths.map(w => Math.max(1, Math.round((w / total) * 7)));
    const sum = mods.reduce((a,b) => a+b, 0);
    if (sum !== 7) return null;
    // Build bit pattern. Left side starts with space (0), bar (1), space, bar.
    // Right side starts with bar, space, bar, space.
    let bits = '';
    let v = rightSide ? 1 : 0;
    for (let k = 0; k < 4; k++) {
      bits += String(v).repeat(mods[k]);
      v = 1 - v;
    }
    if (rightSide) {
      const idx = EAN_R.indexOf(bits);
      if (idx >= 0) return { digit: idx, set: 'R' };
      return null;
    } else {
      let idx = EAN_L.indexOf(bits);
      if (idx >= 0) return { digit: idx, set: 'L' };
      idx = EAN_G.indexOf(bits);
      if (idx >= 0) return { digit: idx, set: 'G' };
      return null;
    }
  }

  function verifyEAN13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = +code[i];
      sum += (i % 2 === 0) ? d : d * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === +code[12];
  }

  // -------------------------------------------------------------------------
  // Native BarcodeDetector path (Chrome / Edge)
  // -------------------------------------------------------------------------
  async function tryNativeDetect(canvas) {
    if (!state.nativeDetector) return null;
    try {
      const codes = await state.nativeDetector.detect(canvas);
      if (codes && codes.length) {
        return { value: codes[0].rawValue, format: codes[0].format };
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  // -------------------------------------------------------------------------
  // Decode loop
  // -------------------------------------------------------------------------
  async function tick() {
    if (!state.running) return;
    if (!state.decodeBusy && state.video.readyState >= 2) {
      state.decodeBusy = true;
      try {
        const w = state.canvas.width = state.video.videoWidth || 640;
        const h = state.canvas.height = state.video.videoHeight || 480;
        state.ctx.drawImage(state.video, 0, 0, w, h);

        // Try native first (handles QR + many formats)
        let hit = await tryNativeDetect(state.canvas);

        if (!hit) {
          // Try several horizontal scan lines for EAN/UPC
          const img = state.ctx.getImageData(0, 0, w, h);
          const lines = [0.4, 0.5, 0.6, 0.45, 0.55];
          for (const f of lines) {
            const y = Math.floor(h * f);
            const bin = binarizeRow(img.data, w, y);
            const runs = rowToRunLengths(bin);
            const code = decodeEANFromRuns(runs);
            if (code) {
              hit = { value: code, format: code.length === 13 ? 'ean_13' : 'upc_a' };
              break;
            }
          }
        }

        if (hit && hit.value) {
          const now = Date.now();
          if (hit.value !== state.lastCode || (now - state.lastDetectAt) > 1500) {
            state.lastCode = hit.value;
            state.lastDetectAt = now;
            handleDetection(hit);
          }
        }
      } catch (e) {
        console.warn('[BarcodeAPI] decode error', e);
      } finally {
        state.decodeBusy = false;
      }
    }
    state.rafId = setTimeout(() => requestAnimationFrame(tick), 1000 / state.fps);
  }

  function handleDetection(hit) {
    beep(1100, 100);
    setTimeout(() => beep(1500, 80), 120);
    // Auto-fill
    try {
      const target = document.querySelector(state.targetSelector);
      if (target) {
        target.value = hit.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (e) { /* ignore */ }
    // Visual feedback
    if (state.overlay) {
      const flash = state.overlay.querySelector('.bx-flash');
      if (flash) {
        flash.style.opacity = '1';
        setTimeout(() => { flash.style.opacity = '0'; }, 200);
      }
      const status = state.overlay.querySelector('.bx-status');
      if (status) status.textContent = `${hit.format}: ${hit.value}`;
    }
    // Callbacks
    state.callbacks.forEach(cb => {
      try { cb(hit.value, hit.format); } catch (e) { console.error(e); }
    });
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  function buildButton() {
    if (state.button) return;
    const btn = document.createElement('button');
    btn.id = 'volvix-barcode-btn';
    btn.type = 'button';
    btn.title = 'Escanear código de barras';
    btn.textContent = '📷';
    Object.assign(btn.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: 99998,
      width: '56px', height: '56px', borderRadius: '50%',
      background: '#1976d2', color: '#fff', border: 'none',
      fontSize: '26px', cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    });
    btn.addEventListener('click', () => {
      if (state.running) api.stop(); else api.start();
    });
    document.body.appendChild(btn);
    state.button = btn;
  }

  function buildOverlay() {
    if (state.overlay) return;
    const ov = document.createElement('div');
    ov.id = 'volvix-barcode-overlay';
    Object.assign(ov.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
      zIndex: 99999, display: 'none',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    });
    ov.innerHTML = `
      <video class="bx-video" autoplay muted playsinline
             style="max-width:90vw;max-height:70vh;border:2px solid #1976d2;border-radius:8px;"></video>
      <div class="bx-flash" style="position:absolute;inset:0;background:#0f0;opacity:0;transition:opacity .2s;pointer-events:none;"></div>
      <div class="bx-status" style="color:#fff;margin-top:12px;font-family:monospace;font-size:14px;">Buscando código...</div>
      <button class="bx-close" type="button"
              style="margin-top:16px;padding:10px 24px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
        Cerrar (Esc)
      </button>
    `;
    document.body.appendChild(ov);
    ov.querySelector('.bx-close').addEventListener('click', () => api.stop());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.running) api.stop();
    });
    state.overlay = ov;
    state.video = ov.querySelector('.bx-video');
    state.canvas = document.createElement('canvas');
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  const api = {
    async start() {
      if (state.running) return;
      buildOverlay();
      // Detect native API
      if (!state.nativeDetector && 'BarcodeDetector' in global) {
        try {
          state.nativeDetector = new global.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_128', 'code_39'],
          });
        } catch (e) {
          console.warn('[BarcodeAPI] native detector unavailable', e);
        }
      }
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        alert('No se pudo acceder a la cámara: ' + e.message);
        return;
      }
      state.video.srcObject = state.stream;
      state.overlay.style.display = 'flex';
      state.running = true;
      state.lastCode = null;
      tick();
    },
    stop() {
      state.running = false;
      if (state.rafId) { clearTimeout(state.rafId); state.rafId = null; }
      if (state.stream) {
        state.stream.getTracks().forEach(t => t.stop());
        state.stream = null;
      }
      if (state.video) state.video.srcObject = null;
      if (state.overlay) state.overlay.style.display = 'none';
    },
    onDetect(cb) {
      if (typeof cb === 'function') state.callbacks.push(cb);
    },
    setTarget(selector) {
      if (typeof selector === 'string') state.targetSelector = selector;
    },
    isRunning() { return state.running; },
    _internals: state, // for debug
  };

  // Expose
  global.BarcodeAPI = api;

  // Auto-init button on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildButton);
  } else {
    buildButton();
  }

})(window);
