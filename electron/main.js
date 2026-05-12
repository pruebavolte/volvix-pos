// Volvix POS — Electron wrapper (OFFLINE-FIRST 2026-05-11)
//
// Cambio crítico: ahora NO depende de internet para arrancar. Arranca un
// servidor HTTP local en 127.0.0.1:PORT que sirve toda la carpeta public/,
// y la app carga de ahí. Los API calls a `/api/...` se proxyan a Vercel
// cuando hay internet; si no hay internet, fallan rápido y la app sigue
// funcionando con IndexedDB local.
//
// Antes el .exe cargaba PROD_URL directo → si la red tardaba, congelaba PC.

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
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
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: true,                      // mostrar inmediato — no esperar load
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    title: 'Volvix POS',
    backgroundColor: '#0a0a0a'
  });

  // Pantalla de loading INMEDIATA — para que el user vea progreso
  const loadingHTML = `
    <!doctype html><html><head><meta charset="utf-8"><title>Volvix POS · Cargando…</title>
    <style>
      html,body{margin:0;height:100%;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;
                display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px}
      .l{width:54px;height:54px;border:4px solid #1a1a1a;border-top-color:#f97316;border-radius:50%;
         animation:s 1s linear infinite}
      @keyframes s{to{transform:rotate(360deg)}}
      h1{font-size:18px;font-weight:600;margin:0}
      p{color:#9ca3af;font-size:13px;margin:0}
    </style></head>
    <body><div class="l"></div><h1>Volvix POS v1.0.158 ✨</h1><p>Cargando aplicación local…</p></body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));

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

  setTimeout(() => {
    mainWindow.loadURL(targetURL).catch(err => {
      console.error('[volvix] loadURL falló:', err.message);
      const errHTML = `
        <!doctype html><html><head><meta charset="utf-8"><title>Error</title>
        <style>body{margin:0;padding:40px;background:#0a0a0a;color:#fff;font-family:system-ui;text-align:center}
        h1{color:#f97316}button{margin-top:20px;padding:10px 20px;background:#f97316;border:0;color:#fff;
        font-size:14px;border-radius:6px;cursor:pointer}</style></head>
        <body><h1>⚠️ Error al cargar Volvix POS</h1>
        <p>${err.message}</p><button onclick="location.reload()">Reintentar</button>
        </body></html>`;
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errHTML));
    });
  }, 100);

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
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update descargada:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización lista',
        message: `Nueva versión ${info.version} descargada.`,
        detail: 'Se aplicará al cerrar la aplicación. ¿Reiniciar ahora?',
        buttons: ['Reiniciar ahora', 'Después'],
        defaultId: 0
      }).then(r => {
        if (r.response === 0) autoUpdater.quitAndInstall();
      }).catch(() => {});
    }
  });

  // Chequear updates 5s después de arrancar (no bloquear UI)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.warn('[updater] check falló:', err.message);
    });
  }, 5000);
  // Re-chequear cada 30 min mientras la app está abierta
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
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
