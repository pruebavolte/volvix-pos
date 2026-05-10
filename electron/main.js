// Volvix POS — Electron wrapper
// Carga la misma web que Vercel (cero código duplicado).
// Misma terminología, mismos módulos, misma BD vía API.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const PROD_URL = 'https://volvix-pos.vercel.app/salvadorex-pos.html';
const DEV_URL  = process.env.VOLVIX_DEV_URL || 'http://127.0.0.1:8765/salvadorex-pos.html';
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

let mainWindow = null;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Volvix POS',
    backgroundColor: '#0a0a0a'
  });

  const url = isDev ? DEV_URL : PROD_URL;
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Abrir links externos en navegador del sistema (no dentro de Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Menu mínimo
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
      { type: 'separator' },
      { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]
  }
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
