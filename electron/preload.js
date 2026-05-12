// Volvix POS — Electron preload
// contextBridge para exponer APIs nativas al renderer si las necesita la web.
// 2026-05-11 v1.0.172: simplificado. Frame nativo de Windows tiene los botones
// minimize/maximize/close estándar; ya no se necesita electronAPI custom.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('volvixElectron', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron
});
