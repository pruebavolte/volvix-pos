// Volvix POS · Electron preload
// Punto de extensión para exponer APIs nativas seguras a la web vía contextBridge.
// Por ahora vacío — lista para IPC futuro (impresoras térmicas, gaveta, scanners, etc.)

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('volvixDesktop', {
  isElectron: true,
  platform: process.platform,
  // Futuro:
  // printReceipt: (html) => ipcRenderer.invoke('print:receipt', html),
  // openDrawer:   ()     => ipcRenderer.invoke('drawer:open'),
  // scanBarcode:  ()     => ipcRenderer.invoke('barcode:scan'),
});
