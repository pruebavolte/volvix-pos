/**
 * volvix-print-config.js — UI de configuración de impresoras (USB/BT/IP)
 *
 * Modal accesible vía:
 *   window.VolvixPrintConfig.openConfig()
 *
 * Permite al usuario:
 *   - Elegir modo: USB | Bluetooth | IP | Auto
 *   - Configurar IP (para impresoras de red)
 *   - Listar y elegir BT impresoras emparejadas
 *   - Listar y elegir USB impresoras instaladas
 *   - Probar conexión / impresión de prueba
 *   - Scan de subnet para auto-descubrir impresoras IP
 *
 * Persistencia: localStorage
 *   volvix_printer_mode     = 'auto' | 'usb' | 'bluetooth' | 'ip'
 *   volvix_system_printer   = nombre Windows printer (USB)
 *   volvix_bt_printer_mac   = MAC BT
 *   volvix_printer_ip       = IP
 *   volvix_printer_port     = puerto (default 9100)
 */

(function (global) {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    children.flat().filter(Boolean).forEach((c) => {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function ls(key, def) {
    try { return localStorage.getItem(key) || def; } catch { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }

  async function openConfig() {
    // Quitar modal previo si existe
    const old = document.getElementById('vlx-print-config-modal');
    if (old) old.remove();

    // Detect platform y capacidades
    const platform = global.VolvixPrint ? global.VolvixPrint.detect() : { platform: 'unknown', methods: [] };

    // Cargar config actual
    const currentMode = ls('volvix_printer_mode', 'auto');
    const currentBtMac = ls('volvix_bt_printer_mac', '');
    const currentIP = ls('volvix_printer_ip', '');
    const currentPort = ls('volvix_printer_port', '9100');
    const currentSysPrinter = ls('volvix_system_printer', '');

    const modal = el('div', {
      id: 'vlx-print-config-modal',
      style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }
    });

    const card = el('div', {
      style: { background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '560px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }
    });

    // Header
    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
    },
      el('h3', { style: { margin: '0', fontSize: '18px', color: '#0B0B0F' } }, '🖨 Configuración de impresoras'),
      el('button', {
        style: { background: 'none', border: '0', fontSize: '24px', cursor: 'pointer', color: '#666' },
        onClick: () => modal.remove()
      }, '×')
    ));

    // Plataforma
    card.appendChild(el('div', {
      style: { background: '#F0F9FF', padding: '10px', borderRadius: '8px', marginBottom: '14px', fontSize: '11px', color: '#0369A1' }
    }, `Plataforma: ${platform.platform} · Métodos: ${platform.methods.join(', ') || 'ninguno'}`));

    // Selector de modo
    card.appendChild(el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' } }, 'Modo de impresión'));
    const modeSel = el('select', {
      id: 'vlx-pc-mode',
      style: { width: '100%', padding: '10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' }
    });
    [
      { v: 'auto', t: 'Automático (recomendado)' },
      { v: 'usb', t: 'USB (impresora del sistema)' },
      { v: 'bluetooth', t: 'Bluetooth' },
      { v: 'ip', t: 'Por IP / Red' }
    ].forEach((o) => {
      const opt = el('option', { value: o.v }, o.t);
      if (o.v === currentMode) opt.selected = true;
      modeSel.appendChild(opt);
    });
    card.appendChild(modeSel);

    // ─── Panel USB ──────────────────────────────────────────────────
    const usbPanel = el('div', { id: 'vlx-pc-usb', style: { marginBottom: '14px' } });
    usbPanel.appendChild(el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' } }, 'Impresora USB del sistema'));
    const usbSel = el('select', { id: 'vlx-pc-usb-name', style: { width: '100%', padding: '10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px' } });
    usbSel.appendChild(el('option', { value: '' }, '-- Auto-detectar --'));
    usbPanel.appendChild(usbSel);
    const usbTestBtn = el('button', {
      style: { marginTop: '6px', padding: '6px 12px', border: '1px solid #E5E7EB', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
      onClick: async () => {
        const name = usbSel.value;
        statusEl.textContent = 'Imprimiendo prueba USB…';
        if (global.volvixElectron && global.volvixElectron.printToSystem) {
          const r = await global.volvixElectron.printToSystem({
            html: '<body style="font-family:monospace;width:280px;padding:10px"><h2 style="text-align:center">VOLVIX POS</h2><div style="text-align:center">Prueba USB · ' + new Date().toLocaleString('es-MX') + '</div></body>',
            printerName: name || undefined,
            silent: true
          });
          statusEl.textContent = r.ok ? '✅ Prueba USB enviada' : '✗ ' + (r.error || 'error');
        }
      }
    }, '🖨 Probar USB');
    usbPanel.appendChild(usbTestBtn);
    card.appendChild(usbPanel);

    // Llenar USB printers (Electron only)
    if (global.volvixElectron && global.volvixElectron.listSystemPrinters) {
      global.volvixElectron.listSystemPrinters().then((list) => {
        (list || []).forEach((p) => {
          const opt = el('option', { value: p.name }, p.displayName || p.name);
          if (p.name === currentSysPrinter) opt.selected = true;
          usbSel.appendChild(opt);
        });
      });
    }

    // ─── Panel Bluetooth ────────────────────────────────────────────
    const btPanel = el('div', { id: 'vlx-pc-bt', style: { marginBottom: '14px' } });
    btPanel.appendChild(el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' } }, 'Impresora Bluetooth'));
    const btSel = el('select', { id: 'vlx-pc-bt-mac', style: { width: '100%', padding: '10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px' } });
    btSel.appendChild(el('option', { value: '' }, '-- Auto-detectar --'));
    btPanel.appendChild(btSel);
    const btTestBtn = el('button', {
      style: { marginTop: '6px', padding: '6px 12px', border: '1px solid #E5E7EB', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
      onClick: async () => {
        const mac = btSel.value;
        statusEl.textContent = 'Probando Bluetooth…';
        if (global.volvixElectron && global.volvixElectron.printBluetooth) {
          const r = await global.volvixElectron.printBluetooth({
            text: 'VOLVIX POS - PRUEBA BT\n' + new Date().toLocaleString('es-MX') + '\n--------------\nSi sale este papel,\nBluetooth funciona OK.\n--------------\n\n\n\n',
            mac: mac || undefined
          });
          statusEl.textContent = r.ok ? '✅ BT enviado a ' + (r.printer || mac) : '✗ ' + (r.error || 'error');
        }
      }
    }, '📶 Probar Bluetooth');
    btPanel.appendChild(btTestBtn);
    card.appendChild(btPanel);

    // Llenar BT printers
    if (global.volvixElectron && global.volvixElectron.listBluetoothPrinters) {
      global.volvixElectron.listBluetoothPrinters().then((list) => {
        (list || []).forEach((p) => {
          const opt = el('option', { value: p.mac }, p.name + ' (' + p.com + ')');
          if (p.mac === currentBtMac) opt.selected = true;
          btSel.appendChild(opt);
        });
      });
    }

    // ─── Panel IP ────────────────────────────────────────────────────
    const ipPanel = el('div', { id: 'vlx-pc-ip', style: { marginBottom: '14px' } });
    ipPanel.appendChild(el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' } }, 'Impresora por IP / Red'));
    const ipRow = el('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '6px' } });
    const ipInput = el('input', {
      id: 'vlx-pc-ip-addr', type: 'text', placeholder: '192.168.1.100', value: currentIP,
      style: { padding: '10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }
    });
    const portInput = el('input', {
      id: 'vlx-pc-ip-port', type: 'number', placeholder: '9100', value: currentPort,
      style: { padding: '10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }
    });
    ipRow.appendChild(ipInput);
    ipRow.appendChild(portInput);
    ipPanel.appendChild(ipRow);

    const ipBtnRow = el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } });
    ipBtnRow.appendChild(el('button', {
      style: { padding: '6px 12px', border: '1px solid #E5E7EB', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
      onClick: async () => {
        const ip = ipInput.value.trim();
        const port = parseInt(portInput.value, 10) || 9100;
        if (!ip) { statusEl.textContent = '✗ Ingresa una IP'; return; }
        statusEl.textContent = 'Probando ' + ip + ':' + port + '…';
        if (global.volvixElectron && global.volvixElectron.pingNetworkPrinter) {
          const r = await global.volvixElectron.pingNetworkPrinter(ip, port);
          statusEl.textContent = r.ok ? '✅ ' + ip + ':' + port + ' responde (' + r.ms + 'ms)' : '✗ ' + (r.error || 'no responde');
        }
      }
    }, '📡 Ping'));
    ipBtnRow.appendChild(el('button', {
      style: { padding: '6px 12px', border: '1px solid #E5E7EB', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
      onClick: async () => {
        const ip = ipInput.value.trim();
        const port = parseInt(portInput.value, 10) || 9100;
        if (!ip) { statusEl.textContent = '✗ Ingresa una IP'; return; }
        statusEl.textContent = 'Imprimiendo prueba IP…';
        if (global.volvixElectron && global.volvixElectron.printNetwork) {
          const r = await global.volvixElectron.printNetwork({
            ip: ip, port: port,
            text: 'VOLVIX POS - PRUEBA IP\n' + new Date().toLocaleString('es-MX') + '\nIP: ' + ip + ':' + port + '\n--------------\nSi sale este papel,\nimpresion por red OK.\n--------------\n\n\n\n',
            cut: true
          });
          statusEl.textContent = r.ok ? '✅ Prueba IP enviada (' + r.bytesWritten + ' bytes)' : '✗ ' + (r.error || 'error');
        }
      }
    }, '🖨 Probar IP'));
    ipBtnRow.appendChild(el('button', {
      style: { padding: '6px 12px', border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E40AF', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
      onClick: async () => {
        statusEl.textContent = '🔍 Búsqueda inteligente (mDNS+SSDP+ARP+multi-subnet)… ~30-60s';
        if (global.volvixElectron && global.volvixElectron.discoverAllPrinters) {
          const result = await global.volvixElectron.discoverAllPrinters({
            timeout: 500, concurrency: 50, includeCommon: true
          });
          if (result.ok && Array.isArray(result.found) && result.found.length) {
            const list = result.found.map(f => {
              const tag = f.likelyPrinter ? '⭐' : (f.mdns || f.ssdp ? '📡' : '');
              return tag + ' ' + f.ip + (f.mac ? ' [' + f.mac + ']' : '') + ' (' + f.source + ', ' + f.latency_ms + 'ms)';
            }).join('\n');
            statusEl.style.whiteSpace = 'pre-wrap';
            statusEl.textContent = '✅ ' + result.found.length + ' device(s) en puerto 9100:\n' + list;
            // Si solo hay 1, auto-llenar
            if (result.found.length === 1) {
              ipInput.value = result.found[0].ip;
            } else {
              // Si hay 'likelyPrinter' priorizarla
              const printer = result.found.find(f => f.likelyPrinter);
              if (printer) ipInput.value = printer.ip;
            }
          } else {
            statusEl.textContent = '✗ Ninguna impresora encontrada (' + (result.stats ? result.stats.total_ips_probed + ' IPs probadas en ' + result.stats.elapsed_ms + 'ms' : '') + ')';
          }
        } else if (global.volvixElectron && global.volvixElectron.scanNetworkPrinters) {
          // Fallback al scan viejo
          const subnet = (ipInput.value.trim().split('.').slice(0, 3).join('.')) || '192.168.1';
          const found = await global.volvixElectron.scanNetworkPrinters(subnet, { concurrency: 30, timeout: 400 });
          statusEl.textContent = (found && found.length) ? '✅ ' + found.map(f => f.ip).join(', ') : '✗ No encontradas';
        }
      }
    }, '🔍 Escanear red (todo)'));
    ipPanel.appendChild(ipBtnRow);
    card.appendChild(ipPanel);

    // Status box
    const statusEl = el('div', {
      id: 'vlx-pc-status',
      style: { minHeight: '24px', padding: '8px 10px', background: '#F9FAFB', borderRadius: '6px', fontSize: '12px', color: '#374151', marginBottom: '14px' }
    }, 'Listo. Selecciona un modo y prueba.');
    card.appendChild(statusEl);

    // Mostrar/ocultar paneles según modo
    function updatePanels() {
      const m = modeSel.value;
      usbPanel.style.display = (m === 'usb' || m === 'auto') ? 'block' : 'none';
      btPanel.style.display = (m === 'bluetooth' || m === 'auto') ? 'block' : 'none';
      ipPanel.style.display = (m === 'ip' || m === 'auto') ? 'block' : 'none';
    }
    modeSel.addEventListener('change', updatePanels);
    updatePanels();

    // Botones finales
    const footer = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } });
    footer.appendChild(el('button', {
      style: { padding: '10px 18px', border: '1px solid #E5E7EB', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
      onClick: () => modal.remove()
    }, 'Cancelar'));
    footer.appendChild(el('button', {
      style: { padding: '10px 18px', border: '0', background: '#10B981', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
      onClick: () => {
        lsSet('volvix_printer_mode', modeSel.value);
        lsSet('volvix_system_printer', usbSel.value);
        lsSet('volvix_bt_printer_mac', btSel.value);
        lsSet('volvix_printer_ip', ipInput.value.trim());
        lsSet('volvix_printer_port', portInput.value.trim() || '9100');
        statusEl.textContent = '✅ Configuración guardada';
        setTimeout(() => modal.remove(), 1200);
      }
    }, '💾 Guardar configuración'));
    card.appendChild(footer);

    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  global.VolvixPrintConfig = { openConfig };
})(typeof window !== 'undefined' ? window : globalThis);
