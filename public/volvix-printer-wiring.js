/* volvix-printer-wiring.js — R14 Thermal Receipt Printer drivers
 * ESC/POS + Bluetooth (Web Bluetooth) + USB (WebUSB) + Network (proxy) + window.print fallback
 * Compatible: Epson TM-T20/T82/T88, Star TSP143/TSP100, Citizen CT-S310, Bixolon, Xprinter
 */
(function (global) {
  'use strict';
  const Volvix = global.Volvix = global.Volvix || {};
  Volvix.printer = Volvix.printer || {};

  // ---------- ESC/POS byte commands ----------
  const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
  const CMD = {
    INIT:        [ESC, 0x40],
    LF:          [LF],
    CUT_FULL:    [GS, 0x56, 0x00],
    CUT_PARTIAL: [GS, 0x56, 0x01],
    ALIGN_L:     [ESC, 0x61, 0x00],
    ALIGN_C:     [ESC, 0x61, 0x01],
    ALIGN_R:     [ESC, 0x61, 0x02],
    BOLD_ON:     [ESC, 0x45, 0x01],
    BOLD_OFF:    [ESC, 0x45, 0x00],
    FONT_A:      [ESC, 0x4d, 0x00],
    FONT_B:      [ESC, 0x4d, 0x01],
    SIZE_NORMAL: [GS, 0x21, 0x00],
    SIZE_DOUBLE: [GS, 0x21, 0x11],
    DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xfa]
  };

  function concat(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function enc(str) { return new TextEncoder().encode(str); }
  function pad(left, right, width) {
    const l = String(left || ''), r = String(right || '');
    const sp = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(sp) + r + '\n';
  }
  function line(ch, w) { return ch.repeat(w) + '\n'; }

  function qrPayload(data) {
    const d = enc(data);
    const len = d.length + 3;
    const pL = len & 0xff, pH = (len >> 8) & 0xff;
    return concat([
      new Uint8Array([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
      new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
      new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
      new Uint8Array([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]), d,
      new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])
    ]);
  }

  // ---------- ESC/POS builder ----------
  Volvix.printer.escpos = {
    CMD,
    build(saleData) {
      const W = 32;
      const s = saleData || {};
      const tenant = s.tenant_name || s.business_name || 'VOLVIX POS';
      const lines = s.lines || s.items || [];
      const total = Number(s.total || 0).toFixed(2);
      const subtotal = Number(s.subtotal || s.total || 0).toFixed(2);
      const tax = Number(s.tax || 0).toFixed(2);
      const date = s.created_at || s.date || new Date().toISOString();
      const folio = s.folio || s.id || '';

      const parts = [];
      parts.push(new Uint8Array(CMD.INIT));
      parts.push(new Uint8Array(CMD.ALIGN_C));
      parts.push(new Uint8Array(CMD.SIZE_DOUBLE));
      parts.push(new Uint8Array(CMD.BOLD_ON));
      parts.push(enc(tenant + '\n'));
      parts.push(new Uint8Array(CMD.BOLD_OFF));
      parts.push(new Uint8Array(CMD.SIZE_NORMAL));
      if (s.address) parts.push(enc(s.address + '\n'));
      if (s.rfc) parts.push(enc('RFC: ' + s.rfc + '\n'));
      parts.push(enc(line('-', W)));

      parts.push(new Uint8Array(CMD.ALIGN_L));
      parts.push(enc('Folio: ' + folio + '\n'));
      parts.push(enc('Fecha: ' + String(date).replace('T', ' ').slice(0, 19) + '\n'));
      if (s.cashier) parts.push(enc('Cajero: ' + s.cashier + '\n'));
      if (s.customer) parts.push(enc('Cliente: ' + s.customer + '\n'));
      parts.push(enc(line('-', W)));

      for (const it of lines) {
        const name = (it.name || it.product_name || it.code || 'Item').slice(0, W);
        const qty = Number(it.qty || it.quantity || 1);
        const price = Number(it.price || it.unit_price || 0);
        const sub = (qty * price).toFixed(2);
        parts.push(enc(name + '\n'));
        parts.push(enc(pad('  ' + qty + ' x ' + price.toFixed(2), '$' + sub, W)));
      }
      parts.push(enc(line('-', W)));
      parts.push(enc(pad('Subtotal:', '$' + subtotal, W)));
      if (Number(tax) > 0) parts.push(enc(pad('IVA:', '$' + tax, W)));
      parts.push(new Uint8Array(CMD.BOLD_ON));
      parts.push(new Uint8Array(CMD.SIZE_DOUBLE));
      parts.push(enc(pad('TOTAL', '$' + total, Math.floor(W / 2))));
      parts.push(new Uint8Array(CMD.SIZE_NORMAL));
      parts.push(new Uint8Array(CMD.BOLD_OFF));
      parts.push(enc(line('=', W)));

      if (s.payment_method) parts.push(enc('Pago: ' + s.payment_method + '\n'));
      if (s.payment_received != null) {
        parts.push(enc(pad('Recibido:', '$' + Number(s.payment_received).toFixed(2), W)));
        parts.push(enc(pad('Cambio:', '$' + Number(s.change || 0).toFixed(2), W)));
      }

      parts.push(new Uint8Array(CMD.ALIGN_C));
      parts.push(enc('\n'));
      const qrData = s.qr || s.verify_url || ('VOLVIX:' + folio + ':' + total);
      parts.push(qrPayload(qrData));
      parts.push(enc('\nGracias por su compra\n'));
      parts.push(enc((s.footer || 'Powered by Volvix POS') + '\n\n\n'));

      parts.push(new Uint8Array(CMD.CUT_PARTIAL));
      return concat(parts);
    },
    openDrawer() { return new Uint8Array(CMD.DRAWER_KICK); }
  };

  // ---------- Bluetooth (Web Bluetooth API) ----------
  const BT_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
  ];
  Volvix.printer.bluetooth = {
    device: null, characteristic: null,
    async connect() {
      if (!navigator.bluetooth) throw new Error('Web Bluetooth no soportado en este navegador');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BT_SERVICES
      });
      this.device = device;
      const server = await device.gatt.connect();
      let writeChar = null;
      for (const sUuid of BT_SERVICES) {
        try {
          const svc = await server.getPrimaryService(sUuid);
          const chars = await svc.getCharacteristics();
          writeChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (writeChar) break;
        } catch (_) {}
      }
      if (!writeChar) throw new Error('No se encontro caracteristica writable');
      this.characteristic = writeChar;
      return { name: device.name, id: device.id };
    },
    async send(buffer) {
      if (!this.characteristic) throw new Error('Bluetooth no conectado');
      const CHUNK = 100;
      for (let i = 0; i < buffer.length; i += CHUNK) {
        const slice = buffer.slice(i, i + CHUNK);
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(slice);
        } else {
          await this.characteristic.writeValue(slice);
        }
      }
      return { ok: true, bytes: buffer.length };
    },
    disconnect() {
      if (this.device && this.device.gatt && this.device.gatt.connected) this.device.gatt.disconnect();
      this.device = null; this.characteristic = null;
    }
  };

  // ---------- USB (WebUSB API) ----------
  const USB_VENDORS = [
    { vendorId: 0x04b8 }, // Epson
    { vendorId: 0x0519 }, // Star
    { vendorId: 0x1504 }, // Bixolon
    { vendorId: 0x0fe6 }, // Citizen
    { vendorId: 0x0416 }, // Xprinter
    { vendorId: 0x28e9 }
  ];
  Volvix.printer.usb = {
    device: null, endpoint: null, interfaceNumber: null,
    async connect() {
      if (!navigator.usb) throw new Error('WebUSB no soportado en este navegador');
      const device = await navigator.usb.requestDevice({ filters: USB_VENDORS });
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      const iface = device.configuration.interfaces[0];
      await device.claimInterface(iface.interfaceNumber);
      const ep = iface.alternate.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontro endpoint OUT en impresora USB');
      this.device = device;
      this.endpoint = ep.endpointNumber;
      this.interfaceNumber = iface.interfaceNumber;
      return { name: device.productName || 'USB Printer', vendorId: device.vendorId };
    },
    async send(buffer) {
      if (!this.device || this.endpoint == null) throw new Error('USB no conectado');
      const r = await this.device.transferOut(this.endpoint, buffer);
      return { ok: r.status === 'ok', bytes: r.bytesWritten };
    },
    async disconnect() {
      if (!this.device) return;
      try { await this.device.releaseInterface(this.interfaceNumber); } catch (_) {}
      try { await this.device.close(); } catch (_) {}
      this.device = null; this.endpoint = null;
    }
  };

  // ---------- Network (via local print bridge or audit endpoint) ----------
  Volvix.printer.network = {
    async send(ip, port, buffer) {
      const b64 = btoa(String.fromCharCode.apply(null, buffer));
      try {
        const r = await fetch('http://127.0.0.1:9101/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port: port || 9100, data: b64 })
        });
        if (r.ok) return { ok: true, via: 'local-bridge' };
      } catch (_) {}
      const token = (Volvix.auth && Volvix.auth.token) || localStorage.getItem('volvix_token') || '';
      const r2 = await fetch('/api/printer/raw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? ('Bearer ' + token) : ''
        },
        body: JSON.stringify({ ip, port: port || 9100, data: b64, length: buffer.length })
      });
      const j = await r2.json().catch(() => ({}));
      return { ok: r2.ok, audit: true, response: j };
    }
  };

  // ---------- Configuration ----------
  function getDefaultConfig() {
    try {
      const raw = localStorage.getItem('volvix_printer_config');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { type: 'fallback' };
  }
  Volvix.printer.setConfig = function (cfg) {
    localStorage.setItem('volvix_printer_config', JSON.stringify(cfg));
  };
  Volvix.printer.getConfig = getDefaultConfig;

  // ---------- Fallback HTML/window.print ----------
  function htmlReceipt(s) {
    const lines = (s.lines || s.items || []).map(it => {
      const qty = Number(it.qty || it.quantity || 1);
      const price = Number(it.price || it.unit_price || 0);
      return '<tr><td>' + (it.name || it.code || '') + '</td><td>' + qty + '</td><td>$' + (qty * price).toFixed(2) + '</td></tr>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>Recibo ' + (s.folio || '') + '</title>' +
      '<style>body{font-family:monospace;width:80mm;margin:0;padding:8px;font-size:12px}' +
      'h1{font-size:16px;text-align:center;margin:4px 0}' +
      'table{width:100%;border-collapse:collapse}td{padding:2px 0}' +
      '.tot{font-weight:bold;font-size:14px;border-top:1px dashed #000;padding-top:4px}' +
      '@media print{@page{size:80mm auto;margin:0}}</style></head>' +
      '<body><h1>' + (s.tenant_name || 'VOLVIX POS') + '</h1>' +
      '<div>Folio: ' + (s.folio || s.id || '') + '</div>' +
      '<div>Fecha: ' + String(s.created_at || new Date().toISOString()).slice(0, 19).replace('T', ' ') + '</div>' +
      '<hr><table>' + lines + '</table><hr>' +
      '<div class="tot">TOTAL: $' + Number(s.total || 0).toFixed(2) + '</div>' +
      '<p style="text-align:center">Gracias por su compra</p>' +
      '<scr' + 'ipt>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</scr' + 'ipt>' +
      '</body></html>';
  }
  Volvix.printer.fallbackPrint = function (saleData) {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) { VolvixUI.toast({type:'info', message:'Permite popups para imprimir'}); return { ok: false }; }
    w.document.write(htmlReceipt(saleData));
    w.document.close();
    return { ok: true, via: 'window.print' };
  };

  // ---------- Orchestrator ----------
  Volvix.printer.printReceipt = async function (saleId) {
    let sale = saleId;
    if (typeof saleId === 'string' || typeof saleId === 'number') {
      try {
        const token = (Volvix.auth && Volvix.auth.token) || localStorage.getItem('volvix_token') || '';
        const r = await fetch('/api/sales/' + encodeURIComponent(saleId), {
          headers: { 'Authorization': token ? ('Bearer ' + token) : '' }
        });
        sale = await r.json();
      } catch (e) {
        console.warn('[printer] no se pudo cargar venta', e);
        sale = { id: saleId, total: 0, lines: [] };
      }
    }
    const cfg = getDefaultConfig();
    const buffer = Volvix.printer.escpos.build(sale);
    try {
      if (cfg.type === 'bluetooth') {
        if (!Volvix.printer.bluetooth.characteristic) await Volvix.printer.bluetooth.connect();
        return await Volvix.printer.bluetooth.send(buffer);
      }
      if (cfg.type === 'usb') {
        if (!Volvix.printer.usb.device) await Volvix.printer.usb.connect();
        return await Volvix.printer.usb.send(buffer);
      }
      if (cfg.type === 'network') {
        return await Volvix.printer.network.send(cfg.address, cfg.port || 9100, buffer);
      }
    } catch (e) {
      console.warn('[printer] driver fallo, fallback window.print():', e.message);
    }
    return Volvix.printer.fallbackPrint(sale);
  };

  console.log('[Volvix.printer] R14 wiring ready (escpos+bluetooth+usb+network+fallback)');
})(typeof window !== 'undefined' ? window : globalThis);
