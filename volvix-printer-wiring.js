/**
 * volvix-printer-wiring.js
 * Volvix POS - Printer Integration Module
 *
 * Soporta:
 *  - ESC/POS thermal printers (USB / Bluetooth / Serial)
 *  - Web USB API
 *  - Web Bluetooth API
 *  - Web Serial API (fallback)
 *  - window.print() con CSS 80mm como ultimo recurso
 *
 * API publica: window.PrinterAPI
 *   PrinterAPI.connect(transport)
 *   PrinterAPI.disconnect()
 *   PrinterAPI.printTicket(ticketData)
 *   PrinterAPI.printBarcode(code, type)
 *   PrinterAPI.printQR(data, size)
 *   PrinterAPI.openCashDrawer()
 *   PrinterAPI.cut()
 *   PrinterAPI.status()
 */
(function (global) {
    'use strict';

    // ============================================================
    // ESC/POS COMMAND CONSTANTS
    // ============================================================
    const ESC = 0x1B;
    const GS  = 0x1D;
    const LF  = 0x0A;
    const FS  = 0x1C;
    const DLE = 0x10;
    const EOT = 0x04;

    const CMD = {
        INIT:           [ESC, 0x40],
        LF:             [LF],
        CUT_FULL:       [GS, 0x56, 0x00],
        CUT_PARTIAL:    [GS, 0x56, 0x01],
        CUT_FEED:       [GS, 0x56, 0x42, 0x03],
        BOLD_ON:        [ESC, 0x45, 0x01],
        BOLD_OFF:       [ESC, 0x45, 0x00],
        UNDERLINE_ON:   [ESC, 0x2D, 0x01],
        UNDERLINE_OFF:  [ESC, 0x2D, 0x00],
        ALIGN_LEFT:     [ESC, 0x61, 0x00],
        ALIGN_CENTER:   [ESC, 0x61, 0x01],
        ALIGN_RIGHT:    [ESC, 0x61, 0x02],
        SIZE_NORMAL:    [GS, 0x21, 0x00],
        SIZE_DOUBLE_H:  [GS, 0x21, 0x01],
        SIZE_DOUBLE_W:  [GS, 0x21, 0x10],
        SIZE_DOUBLE:    [GS, 0x21, 0x11],
        SIZE_TRIPLE:    [GS, 0x21, 0x22],
        FONT_A:         [ESC, 0x4D, 0x00],
        FONT_B:         [ESC, 0x4D, 0x01],
        DRAWER_PIN2:    [ESC, 0x70, 0x00, 0x19, 0xFA],
        DRAWER_PIN5:    [ESC, 0x70, 0x01, 0x19, 0xFA],
        STATUS:         [DLE, EOT, 0x01],
        BEEP:           [ESC, 0x42, 0x03, 0x03],
        CHARSET_LATIN:  [ESC, 0x74, 0x10] // PC858 Euro
    };

    const BARCODE_TYPES = {
        UPC_A:   65,
        UPC_E:   66,
        EAN13:   67,
        EAN8:    68,
        CODE39:  69,
        ITF:     70,
        CODABAR: 71,
        CODE93:  72,
        CODE128: 73
    };

    // ============================================================
    // STATE
    // ============================================================
    const state = {
        transport: null,        // 'usb' | 'bluetooth' | 'serial' | 'browser'
        device: null,
        characteristic: null,   // BLE write characteristic
        endpoint: null,         // USB out endpoint
        port: null,             // Serial port
        writer: null,
        connected: false,
        paperWidth: 48,         // chars per line (80mm = 48, 58mm = 32)
        encoding: 'cp858',
        listeners: []
    };

    // ============================================================
    // UTILITIES
    // ============================================================
    function emit(event, data) {
        state.listeners.forEach(fn => {
            try { fn(event, data); } catch (e) { console.warn('[Printer] listener err', e); }
        });
    }

    function bytes(...parts) {
        const arr = [];
        for (const p of parts) {
            if (Array.isArray(p)) arr.push(...p);
            else if (typeof p === 'number') arr.push(p & 0xFF);
            else if (typeof p === 'string') {
                for (let i = 0; i < p.length; i++) arr.push(p.charCodeAt(i) & 0xFF);
            } else if (p instanceof Uint8Array) arr.push(...p);
        }
        return new Uint8Array(arr);
    }

    function pad(str, len, align = 'left', char = ' ') {
        str = String(str ?? '');
        if (str.length >= len) return str.slice(0, len);
        const diff = len - str.length;
        if (align === 'right') return char.repeat(diff) + str;
        if (align === 'center') {
            const l = Math.floor(diff / 2);
            return char.repeat(l) + str + char.repeat(diff - l);
        }
        return str + char.repeat(diff);
    }

    function line(char = '-') { return char.repeat(state.paperWidth); }

    function row(left, right) {
        const space = state.paperWidth - left.length - right.length;
        if (space < 1) return left + ' ' + right;
        return left + ' '.repeat(space) + right;
    }

    function money(n, currency = '$') {
        const v = Number(n || 0).toFixed(2);
        return `${currency}${v}`;
    }

    // ============================================================
    // TRANSPORT: WEB USB
    // ============================================================
    async function connectUSB() {
        if (!navigator.usb) throw new Error('Web USB no soportado');
        const filters = [
            { vendorId: 0x04b8 }, // Epson
            { vendorId: 0x0519 }, // Star
            { vendorId: 0x0fe6 }, // ICS
            { vendorId: 0x154f }, // Citizen
            { vendorId: 0x1fc9 }, // NXP
            { vendorId: 0x0416 }, // Winbond
            { vendorId: 0x28e9 }  // Generic
        ];
        const device = await navigator.usb.requestDevice({ filters });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        const iface = device.configuration.interfaces.find(i =>
            i.alternates.some(a => a.interfaceClass === 7)
        ) || device.configuration.interfaces[0];
        await device.claimInterface(iface.interfaceNumber);
        const ep = iface.alternates[0].endpoints.find(e => e.direction === 'out');
        if (!ep) throw new Error('No se encontro endpoint OUT');
        state.device = device;
        state.endpoint = ep.endpointNumber;
        state.transport = 'usb';
        state.connected = true;
        emit('connected', { transport: 'usb', name: device.productName });
        return true;
    }

    async function writeUSB(data) {
        if (!state.device) throw new Error('USB no conectado');
        await state.device.transferOut(state.endpoint, data);
    }

    // ============================================================
    // TRANSPORT: WEB BLUETOOTH
    // ============================================================
    const BLE_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb';
    const BLE_CHAR    = '00002af1-0000-1000-8000-00805f9b34fb';

    async function connectBluetooth() {
        if (!navigator.bluetooth) throw new Error('Web Bluetooth no soportado');
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [BLE_SERVICE] },
                { namePrefix: 'Printer' },
                { namePrefix: 'POS' },
                { namePrefix: 'BT' },
                { namePrefix: 'MTP' },
                { namePrefix: 'MPT' }
            ],
            optionalServices: [BLE_SERVICE]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(BLE_SERVICE);
        const ch = await service.getCharacteristic(BLE_CHAR);
        state.device = device;
        state.characteristic = ch;
        state.transport = 'bluetooth';
        state.connected = true;
        device.addEventListener('gattserverdisconnected', () => {
            state.connected = false;
            emit('disconnected', { transport: 'bluetooth' });
        });
        emit('connected', { transport: 'bluetooth', name: device.name });
        return true;
    }

    async function writeBluetooth(data) {
        if (!state.characteristic) throw new Error('BLE no conectado');
        // BLE MTU ~ 512, fragmentar en chunks de 100
        const CHUNK = 100;
        for (let i = 0; i < data.length; i += CHUNK) {
            const slice = data.slice(i, i + CHUNK);
            await state.characteristic.writeValue(slice);
            await new Promise(r => setTimeout(r, 30));
        }
    }

    // ============================================================
    // TRANSPORT: WEB SERIAL
    // ============================================================
    async function connectSerial() {
        if (!navigator.serial) throw new Error('Web Serial no soportado');
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        state.port = port;
        state.writer = port.writable.getWriter();
        state.transport = 'serial';
        state.connected = true;
        emit('connected', { transport: 'serial' });
        return true;
    }

    async function writeSerial(data) {
        if (!state.writer) throw new Error('Serial no conectado');
        await state.writer.write(data);
    }

    // ============================================================
    // TRANSPORT: BROWSER FALLBACK (window.print)
    // ============================================================
    function ensurePrintStyles() {
        if (document.getElementById('volvix-printer-style')) return;
        const css = `
@media print {
  @page { size: 80mm auto; margin: 0; }
  body * { visibility: hidden; }
  #volvix-print-area, #volvix-print-area * { visibility: visible; }
  #volvix-print-area {
    position: absolute; left: 0; top: 0;
    width: 80mm; padding: 4mm;
    font-family: 'Courier New', monospace;
    font-size: 11px; line-height: 1.25;
    color: #000; background: #fff;
  }
  #volvix-print-area .center { text-align: center; }
  #volvix-print-area .right  { text-align: right; }
  #volvix-print-area .bold   { font-weight: 700; }
  #volvix-print-area .big    { font-size: 16px; font-weight: 700; }
  #volvix-print-area .huge   { font-size: 22px; font-weight: 700; }
  #volvix-print-area hr      { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  #volvix-print-area table   { width: 100%; border-collapse: collapse; }
  #volvix-print-area td      { padding: 1px 0; vertical-align: top; }
}`;
        const el = document.createElement('style');
        el.id = 'volvix-printer-style';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function browserPrint(html) {
        ensurePrintStyles();
        let area = document.getElementById('volvix-print-area');
        if (!area) {
            area = document.createElement('div');
            area.id = 'volvix-print-area';
            document.body.appendChild(area);
        }
        area.innerHTML = html;
        return new Promise(resolve => {
            const after = () => { window.removeEventListener('afterprint', after); resolve(true); };
            window.addEventListener('afterprint', after);
            window.print();
            setTimeout(after, 3000);
        });
    }

    // ============================================================
    // CORE WRITE DISPATCHER
    // ============================================================
    async function send(data) {
        if (!(data instanceof Uint8Array)) data = bytes(data);
        switch (state.transport) {
            case 'usb':       return writeUSB(data);
            case 'bluetooth': return writeBluetooth(data);
            case 'serial':    return writeSerial(data);
            default:          throw new Error('Sin transporte ESC/POS activo');
        }
    }

    // ============================================================
    // PUBLIC: connect / disconnect
    // ============================================================
    async function connect(transport = 'auto') {
        if (state.connected) return true;
        const order = transport === 'auto'
            ? ['usb', 'bluetooth', 'serial']
            : [transport];
        let lastErr = null;
        for (const t of order) {
            try {
                if (t === 'usb' && navigator.usb)             { await connectUSB(); break; }
                if (t === 'bluetooth' && navigator.bluetooth) { await connectBluetooth(); break; }
                if (t === 'serial' && navigator.serial)       { await connectSerial(); break; }
            } catch (e) { lastErr = e; }
        }
        if (!state.connected) {
            state.transport = 'browser';
            state.connected = true;
            emit('connected', { transport: 'browser', fallback: true });
            console.warn('[Printer] Usando fallback window.print()', lastErr?.message);
        }
        // init ESC/POS
        if (state.transport !== 'browser') {
            try { await send(bytes(CMD.INIT, CMD.CHARSET_LATIN)); } catch (e) { console.warn(e); }
        }
        return true;
    }

    async function disconnect() {
        try {
            if (state.transport === 'usb' && state.device) await state.device.close();
            if (state.transport === 'bluetooth' && state.device?.gatt?.connected) state.device.gatt.disconnect();
            if (state.transport === 'serial') {
                if (state.writer) { state.writer.releaseLock(); }
                if (state.port)   { await state.port.close(); }
            }
        } catch (e) { console.warn('[Printer] disconnect err', e); }
        state.transport = null;
        state.device = null;
        state.endpoint = null;
        state.characteristic = null;
        state.port = null;
        state.writer = null;
        state.connected = false;
        emit('disconnected', {});
    }

    // ============================================================
    // PUBLIC: printTicket
    // ============================================================
    async function printTicket(t = {}) {
        if (!state.connected) await connect('auto');

        const business = t.business || 'VOLVIX POS';
        const subtitle = t.subtitle || '';
        const address  = t.address  || '';
        const phone    = t.phone    || '';
        const ticketNo = t.ticketNo || ('T-' + Date.now().toString().slice(-6));
        const cashier  = t.cashier  || 'Cajero';
        const date     = t.date     || new Date().toLocaleString();
        const items    = t.items    || [];
        const subtotal = Number(t.subtotal ?? items.reduce((s,i)=>s + (i.qty||1)*(i.price||0), 0));
        const tax      = Number(t.tax ?? 0);
        const discount = Number(t.discount ?? 0);
        const total    = Number(t.total ?? (subtotal + tax - discount));
        const paid     = Number(t.paid ?? total);
        const change   = Number(t.change ?? Math.max(0, paid - total));
        const payment  = t.payment  || 'EFECTIVO';
        const footer   = t.footer   || '¡Gracias por su compra!';
        const currency = t.currency || '$';

        if (state.transport === 'browser') {
            const rowsHtml = items.map(i => `
                <tr>
                  <td>${escapeHtml(i.name)}</td>
                  <td class="right">${i.qty||1} x ${money(i.price, currency)}</td>
                  <td class="right">${money((i.qty||1)*(i.price||0), currency)}</td>
                </tr>`).join('');
            const html = `
                <div class="center huge">${escapeHtml(business)}</div>
                ${subtitle ? `<div class="center">${escapeHtml(subtitle)}</div>` : ''}
                ${address  ? `<div class="center">${escapeHtml(address)}</div>`  : ''}
                ${phone    ? `<div class="center">Tel: ${escapeHtml(phone)}</div>` : ''}
                <hr>
                <div>Ticket: <b>${escapeHtml(ticketNo)}</b></div>
                <div>Fecha: ${escapeHtml(date)}</div>
                <div>Cajero: ${escapeHtml(cashier)}</div>
                <hr>
                <table>${rowsHtml}</table>
                <hr>
                <table>
                  <tr><td>Subtotal</td><td class="right">${money(subtotal,currency)}</td></tr>
                  ${discount>0?`<tr><td>Descuento</td><td class="right">-${money(discount,currency)}</td></tr>`:''}
                  ${tax>0?`<tr><td>Impuesto</td><td class="right">${money(tax,currency)}</td></tr>`:''}
                  <tr><td class="bold big">TOTAL</td><td class="right bold big">${money(total,currency)}</td></tr>
                  <tr><td>${escapeHtml(payment)}</td><td class="right">${money(paid,currency)}</td></tr>
                  ${change>0?`<tr><td>Cambio</td><td class="right">${money(change,currency)}</td></tr>`:''}
                </table>
                <hr>
                <div class="center">${escapeHtml(footer)}</div>
                <div class="center">${escapeHtml(ticketNo)}</div>
            `;
            return browserPrint(html);
        }

        // ESC/POS
        const buf = [];
        buf.push(...CMD.INIT);
        buf.push(...CMD.ALIGN_CENTER);
        buf.push(...CMD.SIZE_DOUBLE);
        appendText(buf, business + '\n');
        buf.push(...CMD.SIZE_NORMAL);
        if (subtitle) appendText(buf, subtitle + '\n');
        if (address)  appendText(buf, address + '\n');
        if (phone)    appendText(buf, 'Tel: ' + phone + '\n');
        buf.push(...CMD.ALIGN_LEFT);
        appendText(buf, line('=') + '\n');
        appendText(buf, `Ticket: ${ticketNo}\n`);
        appendText(buf, `Fecha:  ${date}\n`);
        appendText(buf, `Cajero: ${cashier}\n`);
        appendText(buf, line('-') + '\n');
        for (const it of items) {
            appendText(buf, (it.name || '') + '\n');
            const qtyPrice = `${it.qty||1} x ${money(it.price, currency)}`;
            const lineTot  = money((it.qty||1)*(it.price||0), currency);
            appendText(buf, row('  ' + qtyPrice, lineTot) + '\n');
        }
        appendText(buf, line('-') + '\n');
        appendText(buf, row('Subtotal', money(subtotal, currency)) + '\n');
        if (discount > 0) appendText(buf, row('Descuento', '-' + money(discount, currency)) + '\n');
        if (tax > 0)      appendText(buf, row('Impuesto',  money(tax, currency)) + '\n');
        buf.push(...CMD.SIZE_DOUBLE_H);
        buf.push(...CMD.BOLD_ON);
        appendText(buf, row('TOTAL', money(total, currency)) + '\n');
        buf.push(...CMD.BOLD_OFF);
        buf.push(...CMD.SIZE_NORMAL);
        appendText(buf, row(payment, money(paid, currency)) + '\n');
        if (change > 0) appendText(buf, row('Cambio', money(change, currency)) + '\n');
        appendText(buf, line('=') + '\n');
        buf.push(...CMD.ALIGN_CENTER);
        appendText(buf, footer + '\n\n');
        appendText(buf, ticketNo + '\n');
        buf.push(...CMD.LF, ...CMD.LF, ...CMD.LF);
        buf.push(...CMD.CUT_FEED);

        await send(bytes(buf));
        emit('printed', { type: 'ticket', ticketNo });
        return true;
    }

    function appendText(buf, txt) {
        for (let i = 0; i < txt.length; i++) buf.push(txt.charCodeAt(i) & 0xFF);
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ============================================================
    // PUBLIC: printBarcode
    // ============================================================
    async function printBarcode(code, type = 'CODE128') {
        if (!state.connected) await connect('auto');
        code = String(code || '');
        if (!code) throw new Error('Codigo vacio');

        if (state.transport === 'browser') {
            const html = `
                <div class="center bold">${escapeHtml(code)}</div>
                <div class="center" style="font-family:'Libre Barcode 128',monospace;font-size:48px;">
                    *${escapeHtml(code)}*
                </div>
                <div class="center">${escapeHtml(type)}</div>`;
            return browserPrint(html);
        }

        const t = BARCODE_TYPES[type.toUpperCase()] || BARCODE_TYPES.CODE128;
        const buf = [];
        buf.push(...CMD.INIT, ...CMD.ALIGN_CENTER);
        // HRI position: below
        buf.push(GS, 0x48, 0x02);
        // HRI font A
        buf.push(GS, 0x66, 0x00);
        // height
        buf.push(GS, 0x68, 80);
        // width
        buf.push(GS, 0x77, 2);
        // print barcode (function B: GS k m n d1..dn)
        buf.push(GS, 0x6B, t, code.length);
        for (let i = 0; i < code.length; i++) buf.push(code.charCodeAt(i) & 0xFF);
        buf.push(LF, LF);
        buf.push(...CMD.CUT_FEED);
        await send(bytes(buf));
        emit('printed', { type: 'barcode', code });
        return true;
    }

    // ============================================================
    // PUBLIC: printQR
    // ============================================================
    async function printQR(data, size = 6) {
        if (!state.connected) await connect('auto');
        data = String(data || '');
        if (!data) throw new Error('QR vacio');
        size = Math.max(1, Math.min(16, size|0));

        if (state.transport === 'browser') {
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
            const html = `
                <div class="center">
                    <img src="${url}" style="width:50mm;height:50mm;" alt="QR">
                </div>
                <div class="center" style="font-size:9px;word-break:break-all;">${escapeHtml(data)}</div>`;
            return browserPrint(html);
        }

        const buf = [];
        buf.push(...CMD.INIT, ...CMD.ALIGN_CENTER);
        // Model 2
        buf.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
        // Module size
        buf.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);
        // Error correction L
        buf.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30);
        // Store data
        const len = data.length + 3;
        buf.push(GS, 0x28, 0x6B, len & 0xFF, (len >> 8) & 0xFF, 0x31, 0x50, 0x30);
        for (let i = 0; i < data.length; i++) buf.push(data.charCodeAt(i) & 0xFF);
        // Print
        buf.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
        buf.push(LF, LF);
        buf.push(...CMD.CUT_FEED);
        await send(bytes(buf));
        emit('printed', { type: 'qr', data });
        return true;
    }

    // ============================================================
    // PUBLIC: openCashDrawer / cut / status
    // ============================================================
    async function openCashDrawer(pin = 2) {
        if (!state.connected) await connect('auto');
        if (state.transport === 'browser') {
            console.warn('[Printer] cashDrawer no disponible en fallback');
            emit('drawer', { ok: false, reason: 'browser-fallback' });
            return false;
        }
        const cmd = pin === 5 ? CMD.DRAWER_PIN5 : CMD.DRAWER_PIN2;
        await send(bytes(cmd));
        emit('drawer', { ok: true, pin });
        return true;
    }

    async function cut(partial = false) {
        if (!state.connected) return false;
        if (state.transport === 'browser') return true;
        await send(bytes(partial ? CMD.CUT_PARTIAL : CMD.CUT_FULL));
        return true;
    }

    function status() {
        return {
            connected: state.connected,
            transport: state.transport,
            paperWidth: state.paperWidth,
            device: state.device?.name || state.device?.productName || null,
            apis: {
                usb:       !!navigator.usb,
                bluetooth: !!navigator.bluetooth,
                serial:    !!navigator.serial
            }
        };
    }

    function setPaperWidth(chars) {
        state.paperWidth = Math.max(20, Math.min(64, chars|0));
    }

    function on(fn) { if (typeof fn === 'function') state.listeners.push(fn); }
    function off(fn) { state.listeners = state.listeners.filter(f => f !== fn); }

    // ============================================================
    // EXPORT
    // ============================================================
    const PrinterAPI = {
        connect,
        disconnect,
        printTicket,
        printBarcode,
        printQR,
        openCashDrawer,
        cut,
        status,
        setPaperWidth,
        on,
        off,
        // raw helpers expuestos para extension
        _send: send,
        _bytes: bytes,
        _CMD: CMD,
        version: '1.0.0'
    };

    global.PrinterAPI = PrinterAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = PrinterAPI;

    // auto-event en window cuando este listo
    try {
        global.dispatchEvent(new CustomEvent('volvix:printer:ready', { detail: status() }));
    } catch (_) {}

    console.log('[Volvix Printer] wired v' + PrinterAPI.version, status());

})(typeof window !== 'undefined' ? window : globalThis);
