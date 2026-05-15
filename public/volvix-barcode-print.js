/**
 * volvix-barcode-print.js — Imprimir código de barras en impresora de etiquetas BT
 *
 * Soporta múltiples dialectos de comando:
 *   - TSPL/TSPL2 (TSC, Munbyn, 3nstar, Phomemo, genéricas chinas) ← default
 *   - ZPL (Zebra)
 *   - EPL2 (Eltron / Zebra antigua)
 *   - ESC/POS (impresoras térmicas comunes 58/80mm)
 *
 * Detección automática:
 *   - Si el nombre BT contiene "Phomemo", "M110", "M220" → TSPL
 *   - Si contiene "Zebra", "ZD" → ZPL
 *   - Si contiene "Brother", "QL", "PT" → Raster (Brother propietario)
 *   - Default: TSPL (cubre 90% de etiquetadoras chinas)
 *
 * Uso:
 *   window.VolvixBarcode.printBarcode({
 *     code: '7501234567890',       // valor del código de barras
 *     name: 'Pomada Premium',      // nombre del producto (sobre el barcode)
 *     price: 120,                   // precio (opcional)
 *     width_mm: 40,                 // ancho etiqueta (default 40)
 *     height_mm: 30,                // alto etiqueta (default 30)
 *     symbology: 'CODE128',         // CODE128, CODE39, EAN13, EAN8, UPC
 *     mac: '...',                   // BT MAC específico (opcional)
 *     dialect: 'TSPL'               // forzar dialecto
 *   });
 */

(function (global) {
  'use strict';

  function detectDialect(printerName) {
    const n = (printerName || '').toLowerCase();
    if (/phomemo|m110|m220|m200|d35/.test(n)) return 'TSPL';
    if (/zebra|zd\d|gx\d|gt\d/.test(n)) return 'ZPL';
    if (/brother|ql-?\d|pt-?\d/.test(n)) return 'RASTER';
    // Default TSPL (genéricas chinas, más común)
    return 'TSPL';
  }

  // ─── TSPL (TSC Programming Language) ─────────────────────────────────
  function buildTSPL(opts) {
    const w = opts.width_mm || 40;
    const h = opts.height_mm || 30;
    const code = String(opts.code || '0000000000000');
    const name = String(opts.name || '').slice(0, 28);
    const price = opts.price != null ? '$' + Number(opts.price).toFixed(2) : '';
    const sym = (opts.symbology || 'CODE128').toUpperCase();
    const tsplSym = {
      'CODE128': '128',
      'CODE39': '39',
      'EAN13': 'EAN13',
      'EAN8': 'EAN8',
      'UPC': 'UPCA',
      'UPCA': 'UPCA'
    }[sym] || '128';

    const lines = [];
    lines.push(`SIZE ${w} mm, ${h} mm`);
    lines.push('GAP 2 mm, 0 mm');
    lines.push('DENSITY 8');
    lines.push('SPEED 4');
    lines.push('DIRECTION 1');
    lines.push('CLS');
    // Nombre del producto (TEXT x,y,"font","rot","x_mult","y_mult","content")
    if (name) {
      lines.push(`TEXT 10,10,"3",0,1,1,"${name.replace(/"/g, '')}"`);
    }
    // Código de barras (BARCODE x,y,"sym",height,human_readable,rot,narrow,wide,"code")
    lines.push(`BARCODE 10,50,"${tsplSym}",80,1,0,2,4,"${code}"`);
    // Precio
    if (price) {
      lines.push(`TEXT 10,${h * 8 - 30},"4",0,1,1,"${price}"`);
    }
    lines.push('PRINT 1,1');
    return lines.join('\r\n') + '\r\n';
  }

  // ─── ZPL (Zebra Programming Language) ────────────────────────────────
  function buildZPL(opts) {
    const w = (opts.width_mm || 40) * 8; // dots @ 203 DPI
    const h = (opts.height_mm || 30) * 8;
    const code = String(opts.code || '0000000000000');
    const name = String(opts.name || '').slice(0, 28);

    let zpl = '^XA\r\n';
    zpl += `^PW${w}\r\n`;
    zpl += `^LL${h}\r\n`;
    if (name) {
      zpl += `^FO20,10^A0N,24,24^FD${name}^FS\r\n`;
    }
    zpl += `^FO20,50^BCN,80,Y,N,N^FD${code}^FS\r\n`;
    zpl += '^XZ\r\n';
    return zpl;
  }

  // ─── ESC/POS para impresoras térmicas con soporte barcode ────────────
  function buildESCPOS(opts) {
    const code = String(opts.code || '0000000000000');
    const name = String(opts.name || '');
    const price = opts.price != null ? '$' + Number(opts.price).toFixed(2) : '';
    const ESC = '\x1B', GS = '\x1D';
    let out = ESC + '@';                           // init
    out += ESC + 'a' + '\x01';                     // center
    if (name) out += name + '\n';
    if (price) out += price + '\n';
    out += GS + 'h\x50';                           // barcode height = 80
    out += GS + 'H\x02';                           // human readable below
    out += GS + 'w\x02';                           // module width
    out += GS + 'k\x49' + String.fromCharCode(code.length) + code;
    out += '\n\n\n\n';
    out += GS + 'V\x00';                           // cut
    return out;
  }

  /**
   * Encoder principal — devuelve string con los comandos en el dialecto correcto
   */
  function encodeBarcodeJob(opts) {
    const dialect = opts.dialect || detectDialect(opts.printerName);
    let body;
    if (dialect === 'TSPL') body = buildTSPL(opts);
    else if (dialect === 'ZPL') body = buildZPL(opts);
    else if (dialect === 'ESCPOS') body = buildESCPOS(opts);
    else body = buildTSPL(opts); // fallback
    return { dialect, body };
  }

  /**
   * Imprimir código de barras
   * Si window.volvixElectron disponible → manda via BT IPC
   * Si no → muestra error (en web no se puede sin extensión)
   */
  async function printBarcode(opts) {
    const ve = global.volvixElectron;
    if (!ve || !ve.printBluetooth) {
      return { ok: false, error: 'Imprimir código de barras requiere la app .exe de Volvix POS (BT)' };
    }

    // Encoder
    const { dialect, body } = encodeBarcodeJob(opts);

    // Mandar como texto al BT (sin parsing HTML, raw bytes)
    const result = await ve.printBluetooth({
      text: body,
      mac: opts.mac,
      baudRate: opts.baudRate || 9600
    });

    return Object.assign({ dialect }, result);
  }

  /**
   * Listar impresoras BT disponibles para mostrar selector
   */
  async function listAvailablePrinters() {
    const ve = global.volvixElectron;
    if (!ve || !ve.listBluetoothPrinters) return [];
    return await ve.listBluetoothPrinters();
  }

  // ─── UI helper: modal para mostrar selector + preview ─────────────────
  function showBarcodeDialog(productCode, productName, productPrice) {
    // Crear modal simple
    const existing = document.getElementById('vlx-barcode-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vlx-barcode-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:90%;font-family:system-ui">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:18px;color:#0B0B0F">🏷️ Imprimir código de barras</h3>
          <button id="vlx-bc-close" style="background:none;border:0;font-size:24px;cursor:pointer;color:#666">×</button>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Producto</label>
          <input id="vlx-bc-name" type="text" value="${(productName||'').replace(/"/g,'')}" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Código (lo que escanea)</label>
            <input id="vlx-bc-code" type="text" value="${productCode||'0000000000000'}" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-family:monospace;font-size:13px">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Precio (opcional)</label>
            <input id="vlx-bc-price" type="number" step="0.01" value="${productPrice||''}" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Simbología</label>
            <select id="vlx-bc-sym" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
              <option value="CODE128">CODE128</option>
              <option value="EAN13">EAN-13</option>
              <option value="CODE39">CODE39</option>
              <option value="UPCA">UPC-A</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Ancho (mm)</label>
            <input id="vlx-bc-w" type="number" value="40" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Alto (mm)</label>
            <input id="vlx-bc-h" type="number" value="30" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Impresora Bluetooth de etiquetas</label>
          <select id="vlx-bc-printer" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
            <option value="">-- Auto-detectar --</option>
          </select>
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">Cantidad de etiquetas</label>
          <input id="vlx-bc-qty" type="number" min="1" max="50" value="1" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px">
        </div>
        <div id="vlx-bc-status" style="font-size:12px;color:#666;margin-bottom:12px;min-height:18px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="vlx-bc-cancel" style="padding:8px 16px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="vlx-bc-print" style="padding:8px 16px;border:0;background:#10B981;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">🏷️ Imprimir etiqueta</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Populate printer selector
    listAvailablePrinters().then((printers) => {
      const sel = document.getElementById('vlx-bc-printer');
      printers.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.mac;
        opt.textContent = `${p.name} (${p.com})`;
        sel.appendChild(opt);
      });
    });

    document.getElementById('vlx-bc-close').onclick = () => modal.remove();
    document.getElementById('vlx-bc-cancel').onclick = () => modal.remove();
    document.getElementById('vlx-bc-print').onclick = async () => {
      const status = document.getElementById('vlx-bc-status');
      const qty = parseInt(document.getElementById('vlx-bc-qty').value, 10) || 1;
      const opts = {
        code: document.getElementById('vlx-bc-code').value,
        name: document.getElementById('vlx-bc-name').value,
        price: parseFloat(document.getElementById('vlx-bc-price').value) || null,
        symbology: document.getElementById('vlx-bc-sym').value,
        width_mm: parseFloat(document.getElementById('vlx-bc-w').value) || 40,
        height_mm: parseFloat(document.getElementById('vlx-bc-h').value) || 30,
        mac: document.getElementById('vlx-bc-printer').value || null
      };
      status.textContent = '🔄 Imprimiendo...';
      let ok = 0, fail = 0, errors = [];
      for (let i = 0; i < qty; i++) {
        const r = await printBarcode(opts);
        if (r.ok) ok++;
        else { fail++; errors.push(r.error); }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (fail === 0) {
        status.textContent = `✅ ${ok} etiqueta(s) enviada(s)`;
        setTimeout(() => modal.remove(), 1500);
      } else {
        status.textContent = `⚠ ${ok} OK, ${fail} error: ${errors[0] || ''}`;
      }
    };
  }

  global.VolvixBarcode = {
    printBarcode,
    listAvailablePrinters,
    encodeBarcodeJob,
    showBarcodeDialog,
    detectDialect
  };
})(typeof window !== 'undefined' ? window : globalThis);
