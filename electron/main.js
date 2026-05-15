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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  // Arrancar servidor local ANTES de crear ventana — es rápido (~10ms)
  await startLocalServer();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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
ipcMain.handle('volvix:printers:print', async (event, opts) => {
  try {
    if (!opts || !opts.html) return { ok: false, error: 'html required' };
    // Crear ventana oculta para imprimir
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
