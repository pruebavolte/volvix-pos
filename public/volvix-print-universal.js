/**
 * volvix-print-universal.js — Wrapper de impresión multi-plataforma
 *
 * Soporta TODOS los entornos donde corre Volvix POS:
 *   1. ELECTRON (Windows/Mac/Linux .exe) — vía window.volvixElectron IPC
 *      - USB (sistema), Bluetooth (SPP/COM), IP (TCP socket)
 *   2. CAPACITOR (Android APK / iOS) — vía Capacitor plugins
 *      - BluetoothLE plugin para BT
 *      - HTTP fetch para IP (raw socket no soportado en mobile; usa
 *        un microbroker local o impresoras WiFi con HTTP endpoint)
 *      - Web Bluetooth como fallback para algunas impresoras
 *   3. WEB / PWA (Chrome/Edge) — vía Web APIs
 *      - Web Bluetooth API (Chrome) para BT
 *      - Web Serial API (Chrome) para USB serial
 *      - window.print() para USB via diálogo del SO
 *      - fetch() para IP (CORS limitado, generalmente NO funciona direct)
 *
 * API pública:
 *   window.VolvixPrint.detect()       → { platform, methods: ['usb','bt','ip'] }
 *   window.VolvixPrint.print(opts)    → { ok, method, error }
 *     opts: { method?: 'auto'|'usb'|'bt'|'ip', html?, text?, ip?, port?, mac?, ... }
 *   window.VolvixPrint.testConnection({method, ip|mac|name}) → { ok, latency_ms? }
 */

(function (global) {
  'use strict';

  // ─── DETECCIÓN DE PLATAFORMA ────────────────────────────────────────────
  function detectPlatform() {
    const ua = (global.navigator && global.navigator.userAgent) || '';
    const isElectron = !!(global.volvixElectron && global.volvixElectron.isElectron);
    const isCapacitor = !!(global.Capacitor || /capacitor/i.test(ua));
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isPWA = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
    const hasWebBluetooth = !!(global.navigator && global.navigator.bluetooth);
    const hasWebSerial = !!(global.navigator && global.navigator.serial);
    const hasWebUSB = !!(global.navigator && global.navigator.usb);

    let platform = 'web';
    if (isElectron) platform = 'electron';
    else if (isCapacitor && isAndroid) platform = 'capacitor-android';
    else if (isCapacitor && isIOS) platform = 'capacitor-ios';
    else if (isPWA) platform = 'pwa';

    // Métodos disponibles según plataforma
    const methods = [];
    if (isElectron) {
      methods.push('usb', 'bt', 'ip');  // todos
    } else if (isCapacitor) {
      methods.push('bt');                 // BluetoothLE plugin
      methods.push('ip');                 // fetch a HTTP wrapper (no socket raw)
      // USB en mobile = OTG, no soportado de fábrica
    } else {
      // Web/PWA
      if (hasWebBluetooth) methods.push('bt-web');
      if (hasWebSerial) methods.push('usb-serial');
      methods.push('print-dialog');       // window.print() del SO
      methods.push('ip-http');             // solo si la impresora expone HTTP+CORS
    }

    return { platform, methods, isElectron, isCapacitor, isAndroid, isIOS, isPWA, hasWebBluetooth, hasWebSerial, hasWebUSB };
  }

  // ─── PRINT VIA ELECTRON ─────────────────────────────────────────────────
  async function printElectron(opts) {
    const ve = global.volvixElectron;
    const method = opts.method || 'auto';

    if (method === 'ip' || (method === 'auto' && opts.ip)) {
      if (!ve.printNetwork) return { ok: false, error: 'IP print not available' };
      return await ve.printNetwork({
        ip: opts.ip,
        port: opts.port || 9100,
        html: opts.html,
        text: opts.text,
        bytes: opts.bytes,
        cut: opts.cut !== false,
        timeout: opts.timeout || 10000
      });
    }

    if (method === 'bt' || (method === 'auto' && (opts.mac || opts.btName))) {
      if (!ve.printBluetooth) return { ok: false, error: 'BT print not available' };
      return await ve.printBluetooth({
        html: opts.html, text: opts.text,
        mac: opts.mac, printerName: opts.btName,
        baudRate: opts.baudRate || 9600
      });
    }

    if (method === 'usb' || method === 'auto') {
      if (!ve.printToSystem) return { ok: false, error: 'USB print not available' };
      return await ve.printToSystem({
        html: opts.html || textToHtml(opts.text || ''),
        printerName: opts.printerName,
        silent: opts.silent !== false,
        copies: opts.copies || 1
      });
    }

    return { ok: false, error: 'Unknown method: ' + method };
  }

  // ─── PRINT VIA CAPACITOR (Android/iOS) ─────────────────────────────────
  async function printCapacitor(opts) {
    const method = opts.method || 'auto';

    if (method === 'bt' || (method === 'auto' && (opts.mac || opts.btName))) {
      try {
        const { BluetoothLe } = global.Capacitor.Plugins;
        if (!BluetoothLe) return { ok: false, error: 'BluetoothLe plugin not available' };
        await BluetoothLe.initialize();
        const bytes = textToEscPosBytes(opts.html || opts.text || '');
        const b64 = btoa(String.fromCharCode.apply(null, bytes));
        await BluetoothLe.write({
          deviceId: opts.mac,
          service: '000018f0-0000-1000-8000-00805f9b34fb',     // ESC/POS BT common service
          characteristic: '00002af1-0000-1000-8000-00805f9b34fb', // common write char
          value: b64
        });
        return { ok: true, method: 'capacitor-bt' };
      } catch (e) {
        return { ok: false, error: 'Capacitor BT: ' + e.message };
      }
    }

    if (method === 'ip' || (method === 'auto' && opts.ip)) {
      // Capacitor no soporta TCP raw sockets directo. Estrategia:
      // 1. La impresora debe tener un HTTP endpoint (algunas Star/Epson lo tienen)
      // 2. O usar un proxy WebSocket→TCP local
      try {
        const url = `http://${opts.ip}:${opts.port || 80}/print`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: textToEscPosBytes(opts.html || opts.text || '')
        });
        return { ok: r.ok, method: 'capacitor-ip-http', status: r.status };
      } catch (e) {
        return { ok: false, error: 'Capacitor IP HTTP: ' + e.message };
      }
    }

    return { ok: false, error: 'No print method available on Capacitor' };
  }

  // ─── PRINT VIA WEB / PWA ────────────────────────────────────────────────
  async function printWeb(opts) {
    const method = opts.method || 'auto';

    // Web Bluetooth (Chrome only, requiere gesto de usuario para discovery)
    if (method === 'bt' || method === 'bt-web' || (method === 'auto' && opts.mac)) {
      if (!global.navigator.bluetooth) return { ok: false, error: 'Web Bluetooth not supported' };
      try {
        const device = await global.navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        const bytes = textToEscPosBytes(opts.html || opts.text || '');
        // Chunks de 20 bytes (límite GATT)
        for (let i = 0; i < bytes.length; i += 20) {
          const chunk = new Uint8Array(bytes.slice(i, i + 20));
          await characteristic.writeValueWithoutResponse(chunk);
        }
        await device.gatt.disconnect();
        return { ok: true, method: 'web-bluetooth' };
      } catch (e) {
        return { ok: false, error: 'Web BT: ' + e.message };
      }
    }

    // Web Serial (Chrome, USB-Serial directo)
    if (method === 'usb-serial' || (method === 'auto' && opts.serial)) {
      if (!global.navigator.serial) return { ok: false, error: 'Web Serial not supported' };
      try {
        const port = await global.navigator.serial.requestPort();
        await port.open({ baudRate: opts.baudRate || 9600 });
        const writer = port.writable.getWriter();
        const bytes = new Uint8Array(textToEscPosBytes(opts.html || opts.text || ''));
        await writer.write(bytes);
        writer.releaseLock();
        await port.close();
        return { ok: true, method: 'web-serial' };
      } catch (e) {
        return { ok: false, error: 'Web Serial: ' + e.message };
      }
    }

    // Print dialog del SO (fallback siempre disponible)
    if (method === 'print-dialog' || method === 'usb' || method === 'auto') {
      try {
        const html = opts.html || textToHtml(opts.text || '');
        const w = global.open('', '_blank', 'width=400,height=600');
        if (!w) return { ok: false, error: 'Popup bloqueado' };
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); setTimeout(() => w.close(), 500); }, 200);
        return { ok: true, method: 'print-dialog' };
      } catch (e) {
        return { ok: false, error: 'Print dialog: ' + e.message };
      }
    }

    // IP HTTP (requiere CORS open en la impresora — raro)
    if (method === 'ip' || method === 'ip-http') {
      if (!opts.ip) return { ok: false, error: 'IP required' };
      try {
        const url = `http://${opts.ip}:${opts.port || 80}/print`;
        const r = await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          body: textToEscPosBytes(opts.html || opts.text || '')
        });
        return { ok: true, method: 'web-ip-http' };
      } catch (e) {
        return { ok: false, error: 'Web IP: ' + e.message };
      }
    }

    return { ok: false, error: 'No print method available on web' };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────
  function textToEscPosBytes(content) {
    const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
    const out = [ESC, 0x40];
    let text = String(content || '');
    if (/<\w/.test(text)) {
      text = text
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
    }
    for (const ch of text) {
      if (ch === '\n') out.push(LF);
      else {
        const c = ch.charCodeAt(0);
        out.push(c < 256 ? c : 0x3F);
      }
    }
    out.push(LF, LF, LF, LF);
    out.push(GS, 0x56, 0x00);
    return out;
  }

  function textToHtml(text) {
    return '<!doctype html><html><body style="font-family:monospace;font-size:11px;white-space:pre-wrap">' +
      String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</body></html>';
  }

  // ─── API PRINCIPAL ─────────────────────────────────────────────────────
  async function print(opts) {
    opts = opts || {};
    const det = detectPlatform();
    let result;
    try {
      if (det.isElectron) result = await printElectron(opts);
      else if (det.isCapacitor) result = await printCapacitor(opts);
      else result = await printWeb(opts);
    } catch (e) {
      result = { ok: false, error: e.message };
    }
    result.platform = det.platform;
    return result;
  }

  async function testConnection(opts) {
    const det = detectPlatform();
    if (det.isElectron && opts.method === 'ip' && opts.ip) {
      if (global.volvixElectron.pingNetworkPrinter) {
        return await global.volvixElectron.pingNetworkPrinter(opts.ip, opts.port || 9100);
      }
    }
    if (det.isElectron && opts.method === 'bt') {
      if (global.volvixElectron.listBluetoothPrinters) {
        const list = await global.volvixElectron.listBluetoothPrinters();
        const found = (list || []).find((p) => p.mac === opts.mac || p.name === opts.name);
        return { ok: !!found, found };
      }
    }
    return { ok: false, error: 'Test not available for this method/platform' };
  }

  async function scanNetwork(subnet, opts) {
    const det = detectPlatform();
    if (det.isElectron && global.volvixElectron.scanNetworkPrinters) {
      return await global.volvixElectron.scanNetworkPrinters(subnet, opts);
    }
    return { ok: false, error: 'Network scan only available on Electron' };
  }

  // Exponer al global
  global.VolvixPrint = {
    detect: detectPlatform,
    print,
    testConnection,
    scanNetwork,
    textToEscPosBytes,
    textToHtml,
    version: '1.0.312'
  };

  // Disparar evento ready
  if (global.document && global.document.dispatchEvent) {
    setTimeout(() => {
      try {
        global.document.dispatchEvent(new CustomEvent('volvix:print-universal:ready', {
          detail: detectPlatform()
        }));
      } catch (_) {}
    }, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
