// Volvix POS — Electron preload
// contextBridge para exponer APIs nativas al renderer si las necesita la web.
// Por ahora vacío (la web habla con la API HTTPS directamente, igual que en browser).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('volvixElectron', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron
});
