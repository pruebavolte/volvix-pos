// Volvix POS · Electron main process
// Wraps the web app into a standalone desktop application (Win/Mac/Linux).

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const PROD_URL = 'https://volvix-pos.vercel.app/login.html';
const OFFLINE_URL = 'file://' + path.join(__dirname, 'offline-app', 'login.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    title: 'Volvix POS',
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });

  // Modo offline si VOLVIX_OFFLINE=1, si no carga la web en Vercel.
  const offline = process.env.VOLVIX_OFFLINE === '1';
  const target = offline ? OFFLINE_URL : PROD_URL;

  win.loadURL(target).catch((err) => {
    console.error('[volvix-electron] loadURL failed:', err);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Abre links externos en el navegador del sistema, no dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Menú minimalista (oculta DevTools en producción).
  if (process.env.NODE_ENV !== 'development') {
    Menu.setApplicationMenu(null);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // En Mac es común que la app siga viva sin ventanas; aquí preferimos quit.
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
