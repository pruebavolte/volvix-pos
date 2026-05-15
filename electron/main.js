// Volvix POS — Electron wrapper (OFFLINE-FIRST 2026-05-11)
//
// Cambio crítico: ahora NO depende de internet para arrancar. Arranca un
// servidor HTTP local en 127.0.0.1:PORT que sirve toda la carpeta public/,
// y la app carga de ahí. Los API calls a `/api/...` se proxyan a Vercel
// cuando hay internet; si no hay internet, fallan rápido y la app sigue
// funcionando con IndexedDB local.
//
// Antes el .exe cargaba PROD_URL directo → si la red tardaba, congelaba PC.

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, desktopCapturer, screen: electronScreen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// 2026-05-13 — Control remoto nativo: nut-js para input real de Win/Mac/Linux.
// Lo cargamos lazy + opcional para que la app NO falle si el modulo no esta.
// Si no se instalo nut-js, captureScreen funciona (solo VIEW), pero simulateInput retorna error.
let _nut = null;
let _nutLoadAttempted = false;
function _loadNut() {
  if (_nutLoadAttempted) return _nut;
  _nutLoadAttempted = true;
  try {
    _nut = require('@nut-tree-fork/nut-js');
    console.log('[volvix] nut-js cargado — control nativo HABILITADO');
  } catch (e) {
    console.warn('[volvix] nut-js no disponible (control nativo deshabilitado):', e.message);
    _nut = null;
  }
  return _nut;
}
const url = require('url');

// Auto-updater (electron-updater) — descarga solo el diff binario desde GitHub Releases
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[volvix] electron-updater no disponible:', e.message);
}

const PROD_BASE = 'https://volvix-pos.vercel.app';
const DEV_URL   = process.env.VOLVIX_DEV_URL || 'http://127.0.0.1:8765/salvadorex-pos.html';
const isDev     = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

let mainWindow = null;
let localServerPort = 0;

// ─── MINI STATIC SERVER ──────────────────────────────────────────────────────
// Sirve la carpeta `public/` por HTTP en localhost. Los paths absolutos como
// `/auth-gate.js` se resuelven correctamente. Los `/api/...` se proxyan a
// Vercel cuando hay internet (timeout 4s); si no, regresan 503.
const MIME = {
  '.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8',
  '.js':'application/javascript','.mjs':'application/javascript',
  '.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf',
  '.txt':'text/plain','.map':'application/json','.webmanifest':'application/manifest+json'
};

function getPublicRoot() {
  // En desarrollo: <repo>/public/   En production (asar): <app>/public/
  const candidates = [
    path.join(__dirname, '..', 'public'),
    path.join(process.resourcesPath || '', 'app.asar', 'public'),
    path.join(process.resourcesPath || '', 'app', 'public')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (_) {}
  }
  return candidates[0];
}

const PUBLIC_ROOT = getPublicRoot();
console.log('[volvix] PUBLIC_ROOT =', PUBLIC_ROOT);

// HTTPS agent con keepAlive para reusar conexiones TLS a Vercel.
// Sin esto, cada request paralelo abre nuevo TLS handshake (~150ms).
// 100 requests = 100 handshakes secuenciales = 15s+ adicional.
const __vercelAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

function proxyToVercel(req, res) {
  // Proxy /api/* a Vercel; si no hay red en 4s → 503
  const targetURL = PROD_BASE + req.url;
  const u = url.parse(targetURL);
  const opts = {
    hostname: u.hostname,
    port: 443,
    path: u.path,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: u.hostname }),
    agent: __vercelAgent
  };
  const proxyReq = https.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  const timer = setTimeout(() => {
    try { proxyReq.destroy(); } catch (_) {}
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'offline', message: 'No hay conexión a internet' }));
    }
  }, 4000);
  proxyReq.on('error', () => {
    clearTimeout(timer);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'offline' }));
    }
  });
  proxyReq.on('response', () => clearTimeout(timer));
  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/salvadorex-pos.html';
  // Anti path traversal
  const safe = path.posix.normalize(urlPath).replace(/^(\.\.[\\/])+/, '');
  const filePath = path.join(PUBLIC_ROOT, safe);
  // Asegurar que no salimos del PUBLIC_ROOT
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: si el path no es un archivo, servir salvadorex-pos.html
      if (!path.extname(filePath)) {
        return serveFile(path.join(PUBLIC_ROOT, 'salvadorex-pos.html'), res);
      }
      res.writeHead(404); return res.end('Not Found');
    }
    serveFile(filePath, res, stat);
  });
}

function serveFile(filePath, res, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  };
  if (stat) headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  fs.createReadStream(filePath)
    .on('error', () => { try { res.end(); } catch (_) {} })
    .pipe(res);
}

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // CORS para fetch internos
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

      // 2026-05-15 DEBUG: direct local print-raw endpoint to test winspool
      // API without going through the renderer/SW caching layer.
      // POST /__local/print-raw  body: {text, printerName?}
      if (req.url === '/__local/print-raw' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', async () => {
          try {
            const opts = JSON.parse(body || '{}');
            const path2 = require('path');
            const fs2 = require('fs');
            const os2 = require('os');
            const { spawn } = require('child_process');
            // Auto-detect printer if not given
            let printerName = opts.printerName;
            if (!printerName) {
              try {
                let printers = [];
                if (mainWindow && mainWindow.webContents && typeof mainWindow.webContents.getPrintersAsync === 'function') {
                  printers = await mainWindow.webContents.getPrintersAsync() || [];
                }
                const vt = printers.find(p => /volvix.?thermal/i.test(p.name || ''));
                const def = printers.find(p => p.isDefault);
                printerName = (vt && vt.name) || (def && def.name) || (printers[0] && printers[0].name);
              } catch (_) {}
            }
            if (!printerName) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ ok: false, error: 'no printer' }));
            }
            // 2026-05-15: respetar la configuración del editor (logo/barcode/QR/drawer)
            // Si opts.cfg viene del editor, lo aplicamos como comandos ESC/POS reales
            // (no solo texto). Esto hace que el botón "Imprimir ticket de prueba" honre
            // los toggles del usuario.
            const ESC = String.fromCharCode(27);
            const GS  = String.fromCharCode(29);
            const init = ESC + '@';
            const left = ESC + 'a' + String.fromCharCode(0);
            const center = ESC + 'a' + String.fromCharCode(1);
            const big = GS + '!' + String.fromCharCode(17);   // doble ancho + alto
            const norm = GS + '!' + String.fromCharCode(0);   // normal
            const cut  = GS + 'V' + String.fromCharCode(66) + String.fromCharCode(0);
            const feed = '\n\n\n\n';

            const cfg = opts.cfg || {};
            let head = init + left;

            // LOGO (texto magnificado) si cfg.showLogo y cfg.businessName
            if (cfg.showLogo && cfg.businessName) {
              head += center + big + cfg.businessName.toUpperCase() + '\n' + norm + left;
            }

            // ESC/POS BARCODE (GS k 73 = CODE128) si cfg.showBarcode y data.folio
            let extras = '';
            if (cfg.showBarcode && cfg.folio) {
              const folio = String(cfg.folio);
              // HRI debajo (GS H 2 = debajo del barcode)
              extras += GS + 'H' + String.fromCharCode(2);
              // Altura del barcode (GS h N) — 60 dots ~7.5mm
              extras += GS + 'h' + String.fromCharCode(60);
              // Width módulo (GS w N) — 2 = thin
              extras += GS + 'w' + String.fromCharCode(2);
              // GS k 73 (CODE128) m=73 n=length data
              extras += center + GS + 'k' + String.fromCharCode(73) + String.fromCharCode(folio.length) + folio + '\n' + left;
            }

            // ESC/POS QR CODE si cfg.showQR
            if (cfg.showQR && cfg.folio) {
              const qrData = cfg.qrUrl || ('https://volvix.app/t/' + cfg.folio);
              // Model (GS ( k pL pH cn fn n1 n2): pL=4,pH=0,cn=49,fn=65,n1=50,n2=0
              extras += GS + '(' + 'k' + '\x04\x00\x31\x41\x32\x00';
              // Size (GS ( k pL pH cn fn n): pL=3,pH=0,cn=49,fn=67,n=6
              extras += GS + '(' + 'k' + '\x03\x00\x31\x43\x06';
              // Error correction (GS ( k pL pH cn fn n): pL=3,pH=0,cn=49,fn=69,n=48 (L)
              extras += GS + '(' + 'k' + '\x03\x00\x31\x45\x30';
              // Store data (GS ( k pL pH cn fn 50 0 data...)
              const len = qrData.length + 3;
              extras += GS + '(' + 'k' + String.fromCharCode(len & 0xFF) + String.fromCharCode((len >> 8) & 0xFF) + '\x31\x50\x30' + qrData;
              // Print (GS ( k 3 0 49 81 48)
              extras += center + GS + '(' + 'k' + '\x03\x00\x31\x51\x30' + '\n' + left;
            }

            // OPEN CASH DRAWER si cfg.autoOpenDrawer
            let drawer = '';
            if (cfg.autoOpenDrawer || opts.openDrawer) {
              drawer = ESC + 'p' + String.fromCharCode(0) + String.fromCharCode(25) + String.fromCharCode(250);
            }

            const text = opts.text || '';
            const payload = head + text + extras + feed + cut + drawer;
            const tmpFile = path2.join(os2.tmpdir(), 'volvix-loctest-' + Date.now() + '.bin');
            const buf = Buffer.alloc(payload.length);
            for (let i = 0; i < payload.length; i++) buf[i] = payload.charCodeAt(i) & 0xFF;
            fs2.writeFileSync(tmpFile, buf);
            const psScript = '$bytes=[System.IO.File]::ReadAllBytes(\'' + tmpFile.replace(/\\/g, '\\\\') + '\')\n' +
              'Add-Type @"\nusing System;using System.Runtime.InteropServices;\npublic class RPx2{\n' +
              '[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]public class DI{[MarshalAs(UnmanagedType.LPWStr)]public string n;[MarshalAs(UnmanagedType.LPWStr)]public string o;[MarshalAs(UnmanagedType.LPWStr)]public string d;}\n' +
              '[DllImport("winspool.Drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]public static extern bool OpenPrinter(string s,out IntPtr h,IntPtr p);\n' +
              '[DllImport("winspool.Drv",EntryPoint="ClosePrinter")]public static extern bool ClosePrinter(IntPtr h);\n' +
              '[DllImport("winspool.Drv",EntryPoint="StartDocPrinterW",CharSet=CharSet.Unicode)]public static extern bool StartDocPrinter(IntPtr h,int l,[In,MarshalAs(UnmanagedType.LPStruct)]DI di);\n' +
              '[DllImport("winspool.Drv")]public static extern bool EndDocPrinter(IntPtr h);\n' +
              '[DllImport("winspool.Drv")]public static extern bool StartPagePrinter(IntPtr h);\n' +
              '[DllImport("winspool.Drv")]public static extern bool EndPagePrinter(IntPtr h);\n' +
              '[DllImport("winspool.Drv")]public static extern bool WritePrinter(IntPtr h,byte[] b,int c,out int w);}\n"@\n' +
              '$h=[IntPtr]::Zero\nif(-not [RPx2]::OpenPrinter(\'' + String(printerName).replace(/'/g, "''") + '\',[ref]$h,[IntPtr]::Zero)){Write-Host "OPEN_FAIL";exit 1}\n' +
              '$di=New-Object RPx2+DI;$di.n="Volvix Local Test";$di.d="RAW"\n[RPx2]::StartDocPrinter($h,1,$di)|Out-Null\n' +
              '[RPx2]::StartPagePrinter($h)|Out-Null\n$w=0\n[RPx2]::WritePrinter($h,$bytes,$bytes.Length,[ref]$w)|Out-Null\n' +
              '[RPx2]::EndPagePrinter($h)|Out-Null\n[RPx2]::EndDocPrinter($h)|Out-Null\n[RPx2]::ClosePrinter($h)|Out-Null\nWrite-Host "OK:$w"';
            const ps = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', psScript], { windowsHide: true });
            let stdout = '';
            ps.stdout.on('data', (d) => stdout += d.toString());
            ps.on('exit', (code) => {
              try { fs2.unlinkSync(tmpFile); } catch (_) {}
              res.writeHead(200, { 'Content-Type': 'application/json' });
              const m = stdout.match(/OK:(\d+)/);
              res.end(JSON.stringify({ ok: !!m, written: m ? parseInt(m[1], 10) : 0, printer: printerName, stdout: stdout.trim() }));
            });
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (req.url && req.url.startsWith('/api/')) {
        return proxyToVercel(req, res);
      }
      serveStatic(req, res);
    });
    // Puerto 0 = el SO asigna uno libre automáticamente
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      localServerPort = addr.port;
      console.log('[volvix] Local server arrancado en', 'http://127.0.0.1:' + localServerPort);
      resolve(localServerPort);
    });
    server.on('error', (e) => {
      console.error('[volvix] Local server error:', e.message);
      resolve(0);
    });
  });
}

// ─── ELECTRON WINDOW ─────────────────────────────────────────────────────────
function createWindow () {
  // Detectar Windows 11 (build 22000+) — soporta esquinas nativas vía DWM
  const isWin11Plus = process.platform === 'win32' &&
    /^10\.0\.(2[2-9]|[3-9])\d{3}/.test(require('os').release());

  // 2026-05-11 fix v1.0.172: simplificado.
  // - SIN transparent: causaba pantalla negra mientras carga (renderer aún sin pintar)
  // - SIN frame:false: requería transparent para esquinas, y eso rompía la UX
  // - CON roundedCorners + frame nativo: en Win 11 redondea por DWM (~8px) gratis,
  //   en Win 10/Mac usa frame nativo (Mac ya redondea, Win 10 queda cuadrado pero estable)
  // - SIN splash screen data URL — el server local responde en <50ms, no hace falta
  const winOpts = {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    title: 'Volvix POS',
    backgroundColor: '#ffffff',  // BLANCO (no transparent) — sin pantalla negra al cargar
    roundedCorners: true,        // Win 11 nativo (~8px DWM)
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    hasShadow: true
  };

  mainWindow = new BrowserWindow(winOpts);

  // Solo drag region en topbar/menubar para que la barra nativa funcione bien.
  // SIN custom titlebar, SIN border-radius CSS, SIN splash data URL —
  // todo eso causaba pantalla negra y bloqueos en recargas.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      /* Drag region en topbar (Windows: no hace daño, no se ve) */
      .topbar, header, .menubar, .pos-topbar { -webkit-app-region: drag; }
      .topbar button, .topbar a, .topbar input, .topbar select, .topbar [role="button"],
      header button, header a, header input, header select,
      .menubar button, .menubar a,
      .pos-topbar button, .pos-topbar a, .pos-topbar input { -webkit-app-region: no-drag; }
    `).catch(() => {});
  });

  // Determinar URL a cargar
  let targetURL;
  if (isDev) {
    targetURL = DEV_URL;
  } else if (localServerPort > 0) {
    targetURL = 'http://127.0.0.1:' + localServerPort + '/salvadorex-pos.html';
  } else {
    // Fallback online si el server local falló
    targetURL = PROD_BASE + '/salvadorex-pos.html';
  }
  console.log('[volvix] Cargando:', targetURL);

  // Cargar URL DIRECTO al crear ventana — sin splash data URL intermedio.
  // El server local responde en <50ms, la página HTML aparece instantáneo.
  // Si falla, muestro un error simple sobre fondo blanco (no negro).
  mainWindow.loadURL(targetURL).catch(err => {
    console.error('[volvix] loadURL falló:', err.message);
    const errHTML = `
      <!doctype html><html><head><meta charset="utf-8"><title>Error</title>
      <style>body{margin:0;padding:40px;background:#fff;color:#1a1a1a;font-family:system-ui;text-align:center}
      h1{color:#dc2626}button{margin-top:20px;padding:10px 20px;background:#1a1a1a;border:0;color:#fff;
      font-size:14px;border-radius:6px;cursor:pointer}</style></head>
      <body><h1>Error al cargar Volvix POS</h1>
      <p>${err.message}</p><button onclick="location.reload()">Reintentar</button>
      </body></html>`;
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errHTML));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain) console.warn('[volvix] did-fail-load:', code, desc, url);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const menuTemplate = [
  {
    label: 'Volvix',
    submenu: [
      { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
      { label: 'Forzar actualización (limpiar cache)', click: async () => {
        if (!mainWindow) return;
        await mainWindow.webContents.session.clearCache();
        mainWindow.reload();
      }},
      { label: 'Abrir versión online (Vercel)', click: () => {
        if (mainWindow) mainWindow.loadURL(PROD_BASE + '/salvadorex-pos.html');
      }},
      { label: 'Buscar actualizaciones', click: async () => {
        if (!autoUpdater) return;
        try {
          const r = await autoUpdater.checkForUpdates();
          if (r && r.updateInfo) {
            console.log('[updater] manual check → ', r.updateInfo.version);
          }
        } catch (e) { console.warn('[updater] check manual falló:', e.message); }
      }},
      // 2026-05-14: DevTools accesible para debug. Atajos: F12 o Ctrl+Shift+I
      { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => {
        if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
      }},
      { label: 'Detectar impresora térmica (manual)', click: async () => {
        if (!_printerAutoSetup) return;
        try {
          const r = await _printerAutoSetup.runAutoSetup();
          if (mainWindow) {
            mainWindow.webContents.executeJavaScript(
              `try{showToast&&showToast('🖨 ${r.success ? 'Impresora lista: ' + r.final_printer : 'No se encontró impresora'}','${r.success ? 'success' : 'warning'}',6000);}catch(_){}`
            ).catch(()=>{});
          }
        } catch (e) { console.error('[printer manual] error:', e.message); }
      }},
      { type: 'separator' },
      { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]
  }
];

// ─── AUTO-UPDATER ────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater || isDev) return;
  autoUpdater.autoDownload = true;       // descarga automática al detectar update
  autoUpdater.autoInstallOnAppQuit = true; // instala al cerrar la app
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = { info: (...a) => console.log('[updater]', ...a),
                         warn: (...a) => console.warn('[updater]', ...a),
                         error: (...a) => console.error('[updater]', ...a) };

  autoUpdater.on('checking-for-update', () => console.log('[updater] buscando actualización…'));
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update disponible:', info.version);
    if (mainWindow) mainWindow.webContents.executeJavaScript(
      `try{showToast&&showToast('🔄 Descargando actualización v${info.version}…','info');}catch(_){}`
    ).catch(()=>{});
  });
  autoUpdater.on('update-not-available', () => console.log('[updater] ya está en la última versión'));
  autoUpdater.on('error', (err) => console.error('[updater] error:', err && err.message));
  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] descarga ${Math.round(p.percent)}% (${Math.round(p.bytesPerSecond/1024)} KB/s)`);
  });
  // 2026-05-14 — AUTO-INSTALL SILENCIOSO PARA ADULTOS MAYORES (60-75 años):
  // El usuario NO sabe qué hacer con un dialog "¿Reiniciar ahora?". Antes lo
  // ignoraba o lo cerraba sin saber. Ahora:
  //   1) La actualización se descarga sola en background (autoDownload=true)
  //   2) Mostramos un toast NO-BLOQUEANTE en la app diciendo "Actualización lista"
  //   3) Se instala SOLA en 2 momentos:
  //      a) Cuando el usuario cierre la app (autoInstallOnAppQuit=true)
  //      b) Después de 4h de inactividad (idle detection) → quitAndInstall(true)
  //   4) Si el usuario no cierra la app en 24h, se reinicia automáticamente
  //      a las 3am (hora muerta del POS, sin clientes).
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update descargada:', info.version, '— programando install silencioso');
    if (mainWindow) {
      // Toast informativo, NO bloqueante (no requiere click del usuario)
      mainWindow.webContents.executeJavaScript(
        `try{showToast&&showToast('✓ Actualización ${info.version} lista — se aplicará al cerrar','success',6000);}catch(_){}`
      ).catch(()=>{});
    }
    // Programar reinicio automático en idle largo (4h sin actividad)
    scheduleSilentUpdate(info.version);
    // Y backup: reinicio forzado a las 3am siguiente (si POS sigue abierto)
    schedule3amRestart(info.version);
  });

  // Chequear updates 5s después de arrancar (no bloquear UI)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.warn('[updater] check falló:', err.message);
    });
  }, 5000);
  // Re-chequear cada 30 min mientras la app está abierta
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

// Helpers para auto-install silencioso (2026-05-14)
let __vlxIdleTimer = null;
let __vlx3amTimer = null;
function scheduleSilentUpdate(version) {
  if (__vlxIdleTimer) return;
  // 4h sin actividad de mouse/teclado en la ventana → instalar
  let lastActivity = Date.now();
  const onActivity = () => { lastActivity = Date.now(); };
  if (mainWindow) {
    mainWindow.webContents.on('before-input-event', onActivity);
  }
  __vlxIdleTimer = setInterval(() => {
    const idleMs = Date.now() - lastActivity;
    if (idleMs > 4 * 60 * 60 * 1000) {
      console.log('[updater] 4h sin actividad — instalando update', version, 'silencioso');
      clearInterval(__vlxIdleTimer);
      try { autoUpdater.quitAndInstall(true, true); } catch (e) { console.error('[updater] quitAndInstall err:', e); }
    }
  }, 5 * 60 * 1000); // check cada 5min
}

function schedule3amRestart(version) {
  if (__vlx3amTimer) return;
  const next3am = (() => {
    const d = new Date();
    d.setHours(3, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1); // siguiente 3am
    return d.getTime() - Date.now();
  })();
  __vlx3amTimer = setTimeout(() => {
    console.log('[updater] 3am cron — instalando update', version, 'silencioso (hora muerta del POS)');
    try { autoUpdater.quitAndInstall(true, true); } catch (e) { console.error('[updater] 3am quitAndInstall err:', e); }
  }, next3am);
}

// 2026-05-14: Auto-setup de impresora térmica al arrancar (adulto mayor no toca nada)
let _printerAutoSetup = null;
try { _printerAutoSetup = require('./printer-auto-setup'); }
catch (e) { console.warn('[volvix] printer-auto-setup no disponible:', e.message); }

// 2026-05-14: Impresión Bluetooth (SPP / virtual COM port)
let _printerBluetooth = null;
try { _printerBluetooth = require('./printer-bluetooth'); }
catch (e) { console.warn('[volvix] printer-bluetooth no disponible:', e.message); }

// 2026-05-15: Impresión por IP (TCP raw socket JetDirect 9100)
let _printerNetwork = null;
try { _printerNetwork = require('./printer-network'); }
catch (e) { console.warn('[volvix] printer-network no disponible:', e.message); }

// 2026-05-15: Discovery agresivo de impresoras (mDNS + SSDP + ARP + multi-subnet)
let _printerDiscovery = null;
try { _printerDiscovery = require('./printer-discovery'); }
catch (e) { console.warn('[volvix] printer-discovery no disponible:', e.message); }

// 2026-05-15: Auto-pair Bluetooth (sin click usuario)
let _btAutoPair = null;
try { _btAutoPair = require('./bluetooth-auto-pair'); }
catch (e) { console.warn('[volvix] bluetooth-auto-pair no disponible:', e.message); }

function runPrinterAutoSetupBackground() {
  if (!_printerAutoSetup || process.platform !== 'win32') return;
  // Esperar 3s tras arrancar para no competir con servidor local y ventana
  setTimeout(async () => {
    try {
      console.log('[volvix] printer auto-setup: starting…');
      const report = await _printerAutoSetup.runAutoSetup();
      console.log('[volvix] printer auto-setup report:', JSON.stringify(report, null, 2));
      // Avisar al renderer si hubo cambios significativos (no-bloqueante)
      if (mainWindow && report.success && report.final_printer) {
        mainWindow.webContents.executeJavaScript(
          `try{showToast&&showToast('🖨 Impresora lista: ${report.final_printer}','success',5000);}catch(_){}`
        ).catch(()=>{});
      }
    } catch (e) {
      console.error('[volvix] printer auto-setup failed:', e);
    }
  }, 3000);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  // Arrancar servidor local ANTES de crear ventana — es rápido (~10ms)
  await startLocalServer();
  createWindow();
  setupAutoUpdater();
  runPrinterAutoSetupBackground();

  // 2026-05-15: Discovery de impresoras de red al primer arranque (10s después)
  setTimeout(() => {
    tryAutoConfigNetworkPrinter().catch(() => {});
  }, 10000);

  // 2026-05-15: Auto-pair Bluetooth thermal printers (15s después)
  setTimeout(() => {
    tryAutoPairBluetoothPrinters().catch(() => {});
  }, 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// IPC: el renderer puede triggerar manualmente desde Configuración → "Detectar impresora"
ipcMain.handle('volvix:printer:auto-setup', async () => {
  if (!_printerAutoSetup) return { ok: false, error: 'module not loaded' };
  return await _printerAutoSetup.runAutoSetup();
});
ipcMain.handle('volvix:printer:status', async () => {
  if (!_printerAutoSetup) return { ok: false };
  return await _printerAutoSetup.getStatus();
});

// 2026-05-15: Auto-reparar USB (busca nuevo puerto si cambió)
ipcMain.handle('volvix:printer:repair', async () => {
  if (!_printerAutoSetup) return { ok: false, error: 'module not loaded' };
  return await _printerAutoSetup.repairAfterPrintFailure();
});

// 2026-05-15: Status real del Spooler (papel, tapa, offline)
ipcMain.handle('volvix:printer:real-status', async (event, name) => {
  if (!_printerAutoSetup) return { ok: false };
  return await _printerAutoSetup.queryPrinterRealStatus(name);
});

// IPC Bluetooth printing
ipcMain.handle('volvix:bt:list-printers', async () => {
  if (!_printerBluetooth) return [];
  return await _printerBluetooth.listBluetoothPrinters();
});
ipcMain.handle('volvix:bt:print', async (event, opts) => {
  if (!_printerBluetooth) return { ok: false, error: 'BT module not loaded' };
  return await _printerBluetooth.printTicketBT(opts || {});
});

// 2026-05-15: IPC Network printing (TCP raw socket port 9100)
ipcMain.handle('volvix:net:print', async (event, opts) => {
  if (!_printerNetwork) return { ok: false, error: 'Network module not loaded' };
  return await _printerNetwork.printTicketIP(opts || {});
});
ipcMain.handle('volvix:net:ping', async (event, ip, port) => {
  if (!_printerNetwork) return { ok: false, error: 'Network module not loaded' };
  return await _printerNetwork.pingIP(ip, port || 9100);
});
ipcMain.handle('volvix:net:scan', async (event, subnet, opts) => {
  if (!_printerNetwork) return { ok: false, error: 'Network module not loaded' };
  return await _printerNetwork.scanSubnet(subnet, opts || {});
});

// 2026-05-15: Discovery agresivo multi-protocolo (mDNS+SSDP+ARP+multi-subnet)
// Encuentra impresoras INCLUSO en otros subnets / IP ranges no obvios
ipcMain.handle('volvix:printer:discover-all', async (event, opts) => {
  if (!_printerDiscovery) return { ok: false, error: 'Discovery module not loaded' };
  try {
    const result = await _printerDiscovery.discoverPrinters(Object.assign({
      timeout: 500,
      concurrency: 50,
      includeMDNS: true,
      includeSSDP: true,
      includeArp: true,
      includeCommon: true,
      maxIPs: 2000
    }, opts || {}));
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 2026-05-15: Auto-pair Bluetooth thermal printers detectadas
ipcMain.handle('volvix:bt:scan-and-pair', async () => {
  if (!_btAutoPair) return { ok: false, error: 'BT auto-pair module not loaded' };
  return await _btAutoPair.scanAndPairThermalPrinters();
});
ipcMain.handle('volvix:bt:scan-discoverable', async () => {
  if (!_btAutoPair) return { ok: false, error: 'BT auto-pair module not loaded' };
  return await _btAutoPair.scanDiscoverableDevices();
});
ipcMain.handle('volvix:bt:pair-device', async (event, deviceId) => {
  if (!_btAutoPair) return { ok: false, error: 'BT auto-pair module not loaded' };
  return await _btAutoPair.pairDevice(deviceId);
});

// Background auto-pair al arrancar (silencioso)
async function tryAutoPairBluetoothPrinters() {
  if (!_btAutoPair) return;
  try {
    console.log('[volvix] BT auto-pair: starting...');
    const result = await _btAutoPair.scanAndPairThermalPrinters();
    console.log('[volvix] BT auto-pair result:', JSON.stringify(result));
    if (result.paired && result.paired.length > 0 && mainWindow) {
      const names = result.paired.map(p => p.name).join(', ');
      mainWindow.webContents.executeJavaScript(
        'try{showToast&&showToast("📶 Impresora BT emparejada automaticamente: ' + names + '","success",6000);}catch(_){}'
      ).catch(() => {});
    }
  } catch (e) {
    console.warn('[volvix] BT auto-pair error:', e.message);
  }
}

// 2026-05-15: Auto-config al primer arranque — si encuentra UNA impresora IP, la usa
async function tryAutoConfigNetworkPrinter() {
  if (!_printerDiscovery) return;
  try {
    console.log('[volvix] network printer discovery: starting...');
    const result = await _printerDiscovery.discoverPrinters({
      timeout: 400,
      concurrency: 40,
      includeMDNS: true,
      includeSSDP: true,
      includeArp: true,
      includeCommon: false  // primer pass: no scanear commons, ya hay USB
    });
    console.log('[volvix] discovery found:', result.found.length, 'printers,', result.stats.elapsed_ms, 'ms');
    if (result.found.length > 0 && mainWindow) {
      // Avisar al renderer (no auto-configurar, solo informar)
      mainWindow.webContents.executeJavaScript(
        'try{showToast&&showToast("🌐 ' + result.found.length + ' impresora(s) de red detectada(s). Ve a Configuración para usarla.","info",7000);}catch(_){}'
      ).catch(() => {});
    }
  } catch (e) {
    console.warn('[volvix] discovery error:', e.message);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================================
// 2026-05-13 — IPC HANDLERS PARA CONTROL REMOTO NATIVO
// ============================================================================
// Estos handlers son llamados desde el renderer (web app) via preload.js
// cuando hay una sesion de soporte tecnico activa con consentimiento del usuario.
// La autorizacion del usuario se hizo a nivel web (botones Acepto + codigo 6 digitos);
// aqui no agregamos validacion adicional porque el web ya verifico todo.
// ============================================================================

// Lista las pantallas/ventanas disponibles para captura
ipcMain.handle('volvix:capture:list-sources', async (event, opts) => {
  try {
    const types = (opts && opts.types) || ['screen'];
    const sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: { width: 200, height: 150 }
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id || null,
      thumbnail_dataurl: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null
    }));
  } catch (e) {
    console.error('[volvix:capture:list-sources] error:', e.message);
    return [];
  }
});

// Indica si nut-js esta disponible (es decir, control nativo posible)
ipcMain.handle('volvix:input:available', async () => {
  return !!_loadNut();
});

// 2026-05-14: listar impresoras instaladas en el OS via Electron webContents.
// Devuelve array de {name, displayName, description, status, isDefault, options}.
ipcMain.handle('volvix:printers:list', async () => {
  try {
    if (!mainWindow || !mainWindow.webContents) return [];
    if (typeof mainWindow.webContents.getPrintersAsync === 'function') {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers || [];
    }
    // Fallback Electron <= 21
    if (typeof mainWindow.webContents.getPrinters === 'function') {
      return mainWindow.webContents.getPrinters() || [];
    }
    return [];
  } catch (e) {
    console.warn('[volvix] listSystemPrinters fallo:', e.message);
    return [];
  }
});

// Imprime un HTML directo a una impresora del sistema.
// 2026-05-15 FIX: cuando silent:true, Electron's webContents.print() puede mostrar
// dialogo de todas formas. Bypaseamos extrayendo el texto del HTML y enviando RAW
// via winspool API (que SI es 100% silencioso).
ipcMain.handle('volvix:printers:print', async (event, opts) => {
  try {
    if (!opts || !opts.html) return { ok: false, error: 'html required' };

    // Si es silent + win32, usar la ruta RAW que ES verdaderamente silenciosa.
    // Auto-detectar printer si no se especificó.
    if (opts.silent !== false && process.platform === 'win32') {
      // Auto-detect printerName si está vacío
      if (!opts.printerName) {
        try {
          let printers = [];
          if (mainWindow && mainWindow.webContents) {
            if (typeof mainWindow.webContents.getPrintersAsync === 'function') {
              printers = await mainWindow.webContents.getPrintersAsync() || [];
            } else if (typeof mainWindow.webContents.getPrinters === 'function') {
              printers = mainWindow.webContents.getPrinters() || [];
            }
          }
          // Prefer Volvix-Thermal, then default, then first
          const vt = printers.find(p => p.name === 'Volvix-Thermal' || /volvix.?thermal/i.test(p.name || ''));
          const def = printers.find(p => p.isDefault);
          opts.printerName = (vt && vt.name) || (def && def.name) || (printers[0] && printers[0].name);
        } catch (_) {}
      }
      if (!opts.printerName) {
        return { ok: false, error: 'No printer detected' };
      }
      console.log('[print-raw] Using printer:', opts.printerName);
      // Extraer texto del HTML (quita tags, recupera <br>)
      let text = String(opts.html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"');

      const path = require('path');
      const fs = require('fs');
      const os = require('os');
      const { spawn } = require('child_process');

      const ESC = String.fromCharCode(27);
      const GS  = String.fromCharCode(29);
      const init = ESC + '@';
      const left = ESC + 'a' + String.fromCharCode(0);
      const cut  = GS + 'V' + String.fromCharCode(66) + String.fromCharCode(0);
      const feed = '\n\n\n\n';
      const payload = init + left + text + feed + cut;

      const tmpFile = path.join(os.tmpdir(), 'volvix-print-' + Date.now() + '.bin');
      const buf = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) buf[i] = payload.charCodeAt(i) & 0xFF;
      fs.writeFileSync(tmpFile, buf);

      const psScript = `
        $bytes = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}')
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RPx {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DIx { [MarshalAs(UnmanagedType.LPWStr)] public string n; [MarshalAs(UnmanagedType.LPWStr)] public string o; [MarshalAs(UnmanagedType.LPWStr)] public string d; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string s, out IntPtr h, IntPtr p);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DIx di);
  [DllImport("winspool.Drv")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
}
"@
        $h = [IntPtr]::Zero
        if (-not [RPx]::OpenPrinter('${String(opts.printerName).replace(/'/g, "''")}', [ref]$h, [IntPtr]::Zero)) { Write-Host 'OPEN_FAIL'; exit 1 }
        $di = New-Object RPx+DIx; $di.n='Volvix Ticket'; $di.d='RAW'
        [RPx]::StartDocPrinter($h, 1, $di) | Out-Null
        [RPx]::StartPagePrinter($h) | Out-Null
        $w = 0
        [RPx]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) | Out-Null
        [RPx]::EndPagePrinter($h) | Out-Null
        [RPx]::EndDocPrinter($h) | Out-Null
        [RPx]::ClosePrinter($h) | Out-Null
        Write-Host "OK:$w"
      `;
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { windowsHide: true });
      let stdout = '';
      ps.stdout.on('data', (d) => stdout += d.toString());
      return await new Promise((resolve) => {
        ps.on('exit', (code) => {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          if (code === 0 && stdout.includes('OK:')) {
            const written = parseInt(stdout.match(/OK:(\d+)/)[1], 10);
            resolve({ ok: true, written });
          } else {
            resolve({ ok: false, error: 'ps exit ' + code });
          }
        });
      });
    }

    // Path original (cuando NO es silent o no es win32 o no hay deviceName)
    const { BrowserWindow } = require('electron');
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(opts.html));
    const printOpts = {
      silent: opts.silent !== false,
      printBackground: opts.printBackground !== false,
      copies: opts.copies || 1,
      deviceName: opts.printerName || undefined,
      margins: opts.margins || { marginType: 'default' }
    };
    return await new Promise((resolve) => {
      printWin.webContents.print(printOpts, (success, errorType) => {
        try { printWin.close(); } catch (_) {}
        resolve({ ok: !!success, error: success ? null : (errorType || 'unknown') });
      });
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 2026-05-15 FIX: webContents.print({silent:true}) muestra dialogo cuando hay
// cualquier problema. Imprimir RAW ESC/POS bytes via PowerShell winspool API
// es 100% silencioso y funciona con cualquier impresora "Generic / Text Only".
// opts: { text, printerName, openDrawer }
ipcMain.handle('volvix:printers:print-raw', async (event, opts) => {
  if (process.platform !== 'win32') return { ok: false, error: 'win32 only' };
  if (!opts) return { ok: false, error: 'opts required' };
  opts.text = opts.text || '';

  // 2026-05-15: Auto-detect printer si no se proporciona (preferir Volvix-Thermal)
  if (!opts.printerName) {
    try {
      let printers = [];
      if (mainWindow && mainWindow.webContents && typeof mainWindow.webContents.getPrintersAsync === 'function') {
        printers = await mainWindow.webContents.getPrintersAsync() || [];
      }
      const vt = printers.find(p => /volvix.?thermal/i.test(p.name || ''));
      const def = printers.find(p => p.isDefault);
      opts.printerName = (vt && vt.name) || (def && def.name) || (printers[0] && printers[0].name);
    } catch (_) {}
  }
  if (!opts.printerName) return { ok: false, error: 'no printer detected' };

  // Convertir texto a bytes ESC/POS (CP437)
  // 2026-05-15: respeta cfg.showLogo, cfg.showBarcode, cfg.showQR, cfg.autoOpenDrawer
  const ESC = String.fromCharCode(27);
  const GS  = String.fromCharCode(29);
  const init = ESC + '@';
  const left = ESC + 'a' + String.fromCharCode(0);
  const center = ESC + 'a' + String.fromCharCode(1);
  const big = GS + '!' + String.fromCharCode(17);
  const norm = GS + '!' + String.fromCharCode(0);
  const cut  = GS + 'V' + String.fromCharCode(66) + String.fromCharCode(0);
  const feed = '\n\n\n\n';

  const cfg = opts.cfg || {};
  let head = init + left;
  if (cfg.showLogo && cfg.businessName) {
    head += center + big + cfg.businessName.toUpperCase() + '\n' + norm + left;
  }

  let extras = '';
  if (cfg.showBarcode && cfg.folio) {
    const folio = String(cfg.folio);
    extras += GS + 'H' + String.fromCharCode(2);
    extras += GS + 'h' + String.fromCharCode(60);
    extras += GS + 'w' + String.fromCharCode(2);
    extras += center + GS + 'k' + String.fromCharCode(73) + String.fromCharCode(folio.length) + folio + '\n' + left;
  }
  if (cfg.showQR && cfg.folio) {
    const qrData = cfg.qrUrl || ('https://volvix.app/t/' + cfg.folio);
    extras += GS + '(' + 'k' + '\x04\x00\x31\x41\x32\x00';
    extras += GS + '(' + 'k' + '\x03\x00\x31\x43\x06';
    extras += GS + '(' + 'k' + '\x03\x00\x31\x45\x30';
    const len = qrData.length + 3;
    extras += GS + '(' + 'k' + String.fromCharCode(len & 0xFF) + String.fromCharCode((len >> 8) & 0xFF) + '\x31\x50\x30' + qrData;
    extras += center + GS + '(' + 'k' + '\x03\x00\x31\x51\x30' + '\n' + left;
  }

  let drawer = '';
  if (opts.openDrawer || cfg.autoOpenDrawer) {
    drawer = ESC + 'p' + String.fromCharCode(0) + String.fromCharCode(25) + String.fromCharCode(250);
  }
  const payload = head + opts.text + extras + feed + cut + drawer;

  try {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const { spawn } = require('child_process');
    // Write payload to temp file (binary)
    const tmpFile = path.join(os.tmpdir(), 'volvix-print-' + Date.now() + '.bin');
    // Convert to CP437 bytes (single-byte encoding, just use chars 0-255 as bytes)
    const buf = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) buf[i] = payload.charCodeAt(i) & 0xFF;
    fs.writeFileSync(tmpFile, buf);

    // PowerShell script that reads the file + sends to printer via winspool RAW
    const psScript = `
      $bytes = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}')
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RP {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DI { [MarshalAs(UnmanagedType.LPWStr)] public string n; [MarshalAs(UnmanagedType.LPWStr)] public string o; [MarshalAs(UnmanagedType.LPWStr)] public string d; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string s, out IntPtr h, IntPtr p);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DI di);
  [DllImport("winspool.Drv")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
}
"@
      $h = [IntPtr]::Zero
      if (-not [RP]::OpenPrinter('${opts.printerName.replace(/'/g, "''")}', [ref]$h, [IntPtr]::Zero)) { Write-Host 'OPEN_FAIL'; exit 1 }
      $di = New-Object RP+DI; $di.n='Volvix Ticket'; $di.d='RAW'
      [RP]::StartDocPrinter($h, 1, $di) | Out-Null
      [RP]::StartPagePrinter($h) | Out-Null
      $w = 0
      [RP]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) | Out-Null
      [RP]::EndPagePrinter($h) | Out-Null
      [RP]::EndDocPrinter($h) | Out-Null
      [RP]::ClosePrinter($h) | Out-Null
      Write-Host "OK:$w"
    `;
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { windowsHide: true });
    let stdout = '', stderr = '';
    ps.stdout.on('data', (d) => stdout += d.toString());
    ps.stderr.on('data', (d) => stderr += d.toString());
    return await new Promise((resolve) => {
      ps.on('exit', (code) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        if (code === 0 && stdout.includes('OK:')) {
          const written = parseInt(stdout.match(/OK:(\d+)/)[1], 10);
          resolve({ ok: true, written, printer: opts.printerName });
        } else {
          resolve({ ok: false, error: 'powershell exit ' + code + ' stdout=' + stdout + ' stderr=' + stderr });
        }
      });
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Ejecuta un comando de input nativo (mouse o teclado).
// El renderer manda comandos que vienen del admin via WebRTC datachannel.
ipcMain.handle('volvix:input:execute', async (event, cmd) => {
  const nut = _loadNut();
  if (!nut) {
    return { ok: false, error: 'nut-js no instalado; control nativo deshabilitado' };
  }
  try {
    const { mouse, keyboard, Button, Key, Point } = nut;
    // Setear delays minimos para que sea responsivo
    if (mouse && typeof mouse.config !== 'undefined') mouse.config.mouseSpeed = 1500;
    if (keyboard && typeof keyboard.config !== 'undefined') keyboard.config.autoDelayMs = 5;

    switch (cmd.type) {
      case 'mouse-move': {
        // coordenadas absolutas en pixels del SO
        await mouse.setPosition(new Point(Math.round(cmd.x || 0), Math.round(cmd.y || 0)));
        return { ok: true };
      }
      case 'mouse-click': {
        const btnMap = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };
        const b = btnMap[cmd.button || 'left'] || Button.LEFT;
        if (cmd.x != null && cmd.y != null) {
          await mouse.setPosition(new Point(Math.round(cmd.x), Math.round(cmd.y)));
        }
        if (cmd.double) await mouse.doubleClick(b);
        else await mouse.click(b);
        return { ok: true };
      }
      case 'mouse-down': {
        const btnMap = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };
        await mouse.pressButton(btnMap[cmd.button || 'left'] || Button.LEFT);
        return { ok: true };
      }
      case 'mouse-up': {
        const btnMap = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };
        await mouse.releaseButton(btnMap[cmd.button || 'left'] || Button.LEFT);
        return { ok: true };
      }
      case 'mouse-wheel': {
        if (typeof cmd.dy === 'number') {
          if (cmd.dy > 0) await mouse.scrollDown(Math.round(cmd.dy));
          else await mouse.scrollUp(Math.round(-cmd.dy));
        }
        return { ok: true };
      }
      case 'key': {
        // tecla individual con modifiers opcionales
        const keyName = String(cmd.key || '').trim();
        const mods = Array.isArray(cmd.modifiers) ? cmd.modifiers : [];
        const modKeys = [];
        for (const m of mods) {
          const mm = m.toLowerCase();
          if (mm === 'ctrl' || mm === 'control') modKeys.push(Key.LeftControl);
          else if (mm === 'shift') modKeys.push(Key.LeftShift);
          else if (mm === 'alt') modKeys.push(Key.LeftAlt);
          else if (mm === 'meta' || mm === 'cmd' || mm === 'win') modKeys.push(Key.LeftSuper);
        }
        // Resolver Key.X dinamicamente
        let targetKey = null;
        const lookup = keyName.length === 1 ? keyName.toUpperCase() : keyName;
        if (Key[lookup] !== undefined) targetKey = Key[lookup];
        else if (Key[keyName] !== undefined) targetKey = Key[keyName];
        if (targetKey == null) return { ok: false, error: 'tecla desconocida: ' + keyName };
        await keyboard.pressKey(...modKeys, targetKey);
        await keyboard.releaseKey(...modKeys, targetKey);
        return { ok: true };
      }
      case 'type': {
        const text = String(cmd.text || '');
        if (text.length === 0) return { ok: true };
        if (text.length > 500) return { ok: false, error: 'texto muy largo (max 500)' };
        await keyboard.type(text);
        return { ok: true };
      }
      default:
        return { ok: false, error: 'cmd.type desconocido: ' + cmd.type };
    }
  } catch (e) {
    console.error('[volvix:input:execute] error:', e.message);
    return { ok: false, error: e.message };
  }
});
