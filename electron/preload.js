// Volvix POS — Electron preload
// contextBridge para exponer APIs nativas al renderer si las necesita la web.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('volvixElectron', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron
});

// API para los botones titlebar custom (frameless window)
contextBridge.exposeInMainWorld('electronAPI', {
  minimize:  () => ipcRenderer.invoke('vlx-window-minimize'),
  toggleMax: () => ipcRenderer.invoke('vlx-window-toggle-max'),
  close:     () => ipcRenderer.invoke('vlx-window-close')
});
