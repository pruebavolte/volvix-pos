# Volvix POS · Electron Desktop Wrapper

Empaquetado de Volvix POS como app de escritorio nativa para clientes que **no quieren web** (instalación local, doble-click, sin abrir navegador).

Soporta **Windows (.exe)**, **macOS (.dmg)** y **Linux (.AppImage)**.

---

## Requisitos

- Node.js 18+
- npm
- (Windows) PowerShell 7+ para los scripts de build
- Iconos en `electron/icons/`:
  - `icon.png` (256x256 mínimo)
  - `icon.ico` (Windows)
  - `icon.icns` (Mac)

---

## Modo desarrollo

```bash
npm run electron:dev
```

Lanza Electron y carga **https://volvix-pos.vercel.app/login.html** dentro de la ventana.

### Modo offline (carga local, sin Vercel)

```bash
# Linux/Mac
VOLVIX_OFFLINE=1 npm run electron:dev

# Windows PowerShell
$env:VOLVIX_OFFLINE='1'; npm run electron:dev
```

Cuando `VOLVIX_OFFLINE=1`, Electron carga `electron/offline-app/login.html` desde el filesystem en lugar de la URL de Vercel. Útil para:
- Demostraciones sin internet
- Despliegues en redes locales aisladas
- Clientes con restricciones de salida HTTP

> **Nota**: el directorio `electron/offline-app/` debe contener una copia estática del front (login.html + assets). Generarlo con un script aparte o copiar manualmente desde la build de producción.

---

## Build de instalador `.exe` (Windows)

```powershell
pwsh scripts/build-electron-win.ps1
```

El script:
1. Verifica Node y archivos de scaffold.
2. Instala `electron` + `electron-builder` de forma efímera (no toca `package.json`).
3. Empaqueta con `electron-builder.yml`.
4. Deja `Volvix POS Setup X.X.X.exe` en `dist-electron/`.

**Tiempo aproximado**: 5-15 min según red y CPU. Requiere descargar binarios de Electron (~250 MB).

---

## Build de instalador `.dmg` (Mac)

```bash
npm run electron:build:mac
```

> Requiere correrlo en una Mac. Para firmado de código, configurar `CSC_LINK` y `CSC_KEY_PASSWORD` en el entorno.

---

## Build de instalador `.AppImage` (Linux)

```bash
npm run electron:build:linux
```

Genera un binario portable que corre sin instalar.

---

## Distribución

1. Subir el `.exe` / `.dmg` / `.AppImage` al directorio `/downloads/` del repo desplegado en Vercel.
2. Linkear desde `/descargas.html` con tarjetas por OS:
   - "Descargar para Windows" → `/downloads/Volvix-POS-Setup.exe`
   - "Descargar para Mac" → `/downloads/Volvix-POS.dmg`
   - "Descargar para Linux" → `/downloads/Volvix-POS.AppImage`
3. Mantener checksums (`.sha256`) en el mismo directorio para verificación.

---

## Estructura

```
electron/
  main.js          ← proceso principal (Electron entry)
  preload.js       ← bridge seguro a renderer (contextIsolation)
  icons/
    icon.png       ← 256x256+ (Linux)
    icon.ico       ← Windows
    icon.icns      ← Mac
  offline-app/     ← (opcional) copia estática para modo VOLVIX_OFFLINE=1
  README.md        ← este archivo
electron-builder.yml  ← config de empaquetado (raíz)
scripts/
  build-electron-win.ps1
```

---

## Seguridad

- `contextIsolation: true` y `nodeIntegration: false` — el renderer **no** tiene acceso a Node APIs.
- `preload.js` expone solo lo estrictamente necesario vía `contextBridge`.
- Links externos (`http://`, `https://`) se abren en el navegador del sistema, no dentro de la app.
- En producción se desactiva el menú de DevTools.

---

## Roadmap IPC (preload futuro)

El preload está listo para exponer APIs nativas:
- Impresoras térmicas (ESC/POS sobre USB/serial)
- Apertura de gaveta de efectivo
- Scanners de código de barras (HID + serial)
- Lectura de báscula
- Acceso a archivos de respaldo local

Implementar con `ipcMain.handle()` en `main.js` + `ipcRenderer.invoke()` desde el preload, evitando exponer `require` al renderer.
