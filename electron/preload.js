// Volvix POS — Electron preload
// contextBridge para exponer APIs nativas al renderer (la web app cargada).
//
// 2026-05-13 — Agregado soporte de CONTROL REMOTO NATIVO:
//   - volvixElectron.captureScreen() → desktopCapturer + getUserMedia con
//     chromeMediaSource='desktop' (sin popup nativo de seleccion porque el
//     usuario ya consintio explicitamente con la sesion remote-support)
//   - volvixElectron.simulateInput({type, x, y, ...}) → IPC al main que usa
//     @nut-tree-fork/nut-js para mover mouse, click y teclear como input
//     REAL de Windows/Mac/Linux (no es JS event, es Win32/X11/CGEvent)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('volvixElectron', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,

  // -- CAPTURA DE PANTALLA NATIVA (sin popup de eleccion) --
  // El main proceso enumera fuentes con desktopCapturer; aqui tomamos la primera
  // pantalla (o la indicada) y le pedimos al renderer hacer getUserMedia con
  // chromeMediaSource='desktop' apuntando al ID retornado.
  captureScreen: async function (opts) {
    const sources = await ipcRenderer.invoke('volvix:capture:list-sources');
    if (!sources || !sources.length) throw new Error('Sin pantallas disponibles');
    const idx = (opts && typeof opts.screenIndex === 'number') ? opts.screenIndex : 0;
    const src = sources[Math.min(idx, sources.length - 1)];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: src.id,
          minWidth: 1280, maxWidth: 1920,
          minHeight: 720, maxHeight: 1080,
          maxFrameRate: 30
        }
      }
    });
    return stream;
  },

  listScreens: async function () {
    return await ipcRenderer.invoke('volvix:capture:list-sources');
  },

  // -- INPUT NATIVO (mouse + keyboard) --
  // Comandos soportados (cmd.type):
  //   'mouse-move'  + {x, y}                    coordenadas absolutas en pixels
  //   'mouse-click' + {button, double}          button: 'left'|'right'|'middle'
  //   'mouse-down'  + {button}
  //   'mouse-up'    + {button}
  //   'mouse-wheel' + {dy}
  //   'key'         + {key, modifiers}          modifiers: ['ctrl','shift','alt','meta']
  //   'type'        + {text}                    tipea texto literal
  simulateInput: async function (cmd) {
    if (!cmd || typeof cmd !== 'object') throw new Error('cmd invalido');
    return await ipcRenderer.invoke('volvix:input:execute', cmd);
  },

  hasNativeControl: async function () {
    return await ipcRenderer.invoke('volvix:input:available');
  },

  // 2026-05-14: detectar impresoras instaladas en Windows/Mac/Linux.
  // Usa webContents.getPrintersAsync() via IPC al main process.
  // Devuelve array: [{ name, displayName, description, status, isDefault, ... }]
  listSystemPrinters: async function () {
    return await ipcRenderer.invoke('volvix:printers:list');
  },

  // 2026-05-15 v1.0.316: printToSystem REDIRIGE a print-raw (winspool) cuando
  // silent:true, para que NUNCA aparezca el diálogo de Electron (fricción al
  // cobrar). Si necesitas el dialog (silent:false explícito), llama
  // printToSystemWithDialog en su lugar.
  printToSystem: async function (opts) {
    opts = opts || {};
    // Extraer texto del HTML para enviar como RAW al winspool API
    if (opts.silent !== false) {
      let text = String(opts.html || opts.text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"');
      const rawResult = await ipcRenderer.invoke('volvix:printers:print-raw', {
        text: text,
        printerName: opts.printerName,
        openDrawer: !!opts.openDrawer,
        cfg: opts.cfg || {}
      });
      if (rawResult && rawResult.ok) return rawResult;
      // Si el RAW falla, NO caer al dialog — devolver error
      return rawResult || { ok: false, error: 'raw-failed' };
    }
    return await ipcRenderer.invoke('volvix:printers:print', opts);
  },

  // 2026-05-15: Imprime RAW ESC/POS text via Win32 winspool API (100% silent)
  // opts: { text, printerName, openDrawer, cfg }
  printRawText: async function (opts) {
    return await ipcRenderer.invoke('volvix:printers:print-raw', opts || {});
  },

  // Si específicamente necesitas el diálogo de Electron, usa esta función.
  printToSystemWithDialog: async function (opts) {
    return await ipcRenderer.invoke('volvix:printers:print', Object.assign({}, opts || {}, { silent: false }));
  },

  // 2026-05-14 — Auto-setup de impresora térmica (corre como admin, sin UAC adicional)
  // Detecta hardware USB térmico, instala driver Generic, crea "Volvix-Thermal", la marca default.
  // Devuelve { actions:[], hardware_found:[], final_printer, success, elapsed_ms }.
  autoSetupPrinter: async function () {
    return await ipcRenderer.invoke('volvix:printer:auto-setup');
  },
  printerStatus: async function () {
    return await ipcRenderer.invoke('volvix:printer:status');
  },

  // 2026-05-15: Reparar config impresora (USB en otro puerto, etc.)
  repairPrinter: async function () {
    return await ipcRenderer.invoke('volvix:printer:repair');
  },
  // Status REAL: papel out, tapa abierta, offline, jam
  queryPrinterRealStatus: async function (name) {
    return await ipcRenderer.invoke('volvix:printer:real-status', name);
  },

  // 2026-05-15: Auto-pair Bluetooth thermal printers sin clicks
  scanAndPairBT: async function () {
    return await ipcRenderer.invoke('volvix:bt:scan-and-pair');
  },
  scanDiscoverableBT: async function () {
    return await ipcRenderer.invoke('volvix:bt:scan-discoverable');
  },
  pairBTDevice: async function (deviceId) {
    return await ipcRenderer.invoke('volvix:bt:pair-device', deviceId);
  },

  // 2026-05-14 — Bluetooth printing via SPP (virtual COM port)
  // Lista impresoras BT emparejadas: [{name, mac, com, isPrinter}]
  listBluetoothPrinters: async function () {
    return await ipcRenderer.invoke('volvix:bt:list-printers');
  },
  // Manda HTML/texto a impresora BT (auto-detect o forzar mac/name)
  // opts: { html, text, printerName?, mac?, baudRate? }
  printBluetooth: async function (opts) {
    return await ipcRenderer.invoke('volvix:bt:print', opts || {});
  },

  // 2026-05-15 — Network printing (TCP raw socket JetDirect 9100)
  // opts: { ip (required), port? (default 9100), html?, text?, bytes?, cut?, timeout? }
  printNetwork: async function (opts) {
    return await ipcRenderer.invoke('volvix:net:print', opts || {});
  },
  // Verificar conectividad sin imprimir
  pingNetworkPrinter: async function (ip, port) {
    return await ipcRenderer.invoke('volvix:net:ping', ip, port);
  },
  // Escanear subnet en busca de impresoras (ej: '192.168.1')
  scanNetworkPrinters: async function (subnet, opts) {
    return await ipcRenderer.invoke('volvix:net:scan', subnet, opts);
  },

  // 2026-05-15: Discovery AGRESIVO multi-protocolo (encuentra impresoras
  // incluso en OTROS subnets / IP ranges). Combina mDNS + SSDP + ARP +
  // escaneo de TODAS las interfaces de red + subnets comunes (192.168.0-2,
  // 10.0.0, 172.16). Útil cuando PC y impresora están en subnets diferentes
  // pero conectadas al mismo router/switch.
  discoverAllPrinters: async function (opts) {
    return await ipcRenderer.invoke('volvix:printer:discover-all', opts || {});
  }
});
