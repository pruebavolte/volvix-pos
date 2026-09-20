# APK Android — inventario, garantía de "mismo código" y paridad (rol Loyverse APK)

> 2026-09-20 · rama `apk/loyverse`. Columna APK de `PARIDAD_WEB_EXE_APK.md` (la tabla la integra Unificación).

## 1. Inventario (verificado)

| Pieza | Estado |
|---|---|
| `capacitor.config.json` | `appId com.volvix.pos`, `webDir: public`, **sin `server.url`** → el APK **empaqueta `public/`** (offline-first), sirve por `https://localhost`. |
| `android/` | Proyecto Capacitor 8 (AGP 8.13, compileSdk 36, minSdk 24). Plugins npm: bluetooth-le, barcode-scanner, keep-awake, app, camera, device, filesystem, keyboard, network, preferences, share, splash, status-bar. |
| `public/volvix-capacitor-bridge.js` | Reescribe `/api/*` → `https://volvix-pos.vercel.app` (misma API que web/exe) y avisa de versiones nuevas (`releases/latest` → asset `VolvixPOS*.apk`). |
| `build-apps.js` | No existe (el plan lo citaba). El build real es `.github/workflows/build-apk.yml` (`cap sync` + `gradlew assembleRelease`). |
| Plugin nativo propio | `android/app/src/main/java/com/volvix/pos/VolvixPrinterPlugin.java` (solo bytes: TCP 9100 y Bluetooth SPP), registrado en `MainActivity`. **Sin lógica de negocio.** |

## 2. Cómo se garantiza el MISMO `public/` y las MISMAS banderas

- **Código**: el APK lleva `public/` del commit del tag (`cap sync`); el CI verifica que `volvix-platform.js` del bundle sea idéntico al de `public/`. `.exe` (electron-builder `files: public/**`) y APK salen del **mismo tag `v1.0.N`** ⇒ misma versión de código. La web (Railway/Vercel) se despliega de `main`; ⇒ **web, exe y apk coinciden solo si el tag se corta desde el `main` desplegado** (regla de Unificación: un tag por ola).
- **Deriva posible**: una web desplegada *después* del tag adelanta a la app instalada hasta que se instale el siguiente tag (el APK avisa por banner; el .exe se auto-actualiza). No hay `server.url` remoto a propósito: se perdería el offline.
- **Banderas de módulos**: NO viven en el bundle; `volvix-feature-flags.js` las lee de `GET /api/tenant/active-modules` (mismo backend) ⇒ un módulo apagado en `paneldecontrol.html` se apaga igual en web/exe/apk sin reinstalar. El HTML solo lleva los `data-feature="module.*"`.
- **Hardware**: solo por `window.VolvixPlatform`; `kind` = `android` cuando `Capacitor.isNativePlatform()`.

## 3. Adaptador ANDROID de `VolvixPlatform` (hecho)

| Función | Implementación | Config |
|---|---|---|
| `printTicket({text,openDrawer,comanda,target?})` | `VolvixEscPos.buildTicket` (CP437: á é í ó ú ñ ¿ ¡; corte; pulso de cajón) → plugin `printRaw` (red) o `printBluetooth` (SPP). Además manda la comanda si viene (igual que el .exe) sin bloquear el ticket. | Mismas llaves que el .exe: `volvix_printer_mode` (`auto`/`ip`/`bluetooth`; `usb` = aviso), `volvix_printer_ip`, `volvix_printer_port`, `volvix_bt_printer_mac` (modal `VolvixPrintConfig`, ahora con lista BT/ping/prueba en Android). `auto` = red primero, luego BT. |
| `printComanda(c)` | Misma lógica que `electron/comanda-printer.js` (`route` por categoría, cancelaciones, modificadores) → una comanda por impresora por TCP. Deshabilitado por defecto. | `localStorage.volvix_comanda_cfg` (`#cfg-comanda-box`, ahora visible en android). |
| `comandaGet/Save/Test` | normalización idéntica (`VolvixEscPos.clean`). | idem |
| `openDrawer()` | pulso ESC p por la impresora de tickets (RJ11). | idem |
| `scanBarcode()` | `@capacitor-community/barcode-scanner` con overlay "Cancelar" (`#vlx-scan-overlay`, `data-vlx-keep="1"`). Devuelve `{ok,code,format}`. **Sin botón de UI que lo llame todavía** (ver §5). | permiso CAMERA en manifest |
| `pingPrinter`, `listBluetoothPrinters` | plugin `ping` / `listBluetooth` (Android 12+: pide `BLUETOOTH_CONNECT`). | — |

Degradación: sin plugin / sin impresora configurada / modo `usb` ⇒ `{ok:false, unsupported:true, error:'…'}` **sin lanzar**; la venta nunca se rompe.
Los bytes se arman en `public/volvix-escpos.js` (compartido; `scripts/test-escpos-parity.js` lo compara byte a byte con `electron/comanda-printer.js`).

## 4. Pruebas

- Node: `node scripts/test-escpos-parity.js` (16 aserciones), `node scripts/test-platform-android.js` (16, Capacitor y plugin falsos).
- CI: build verde en `apk/loyverse`; el APK sube como artifact. Pruebas en emulador → sección de resultados al final.

## 5. Pendientes / degradaciones honestas

- `autoPrintTicket` legado de `volvix-cobro-modal.js` (reintentos USB/BT/IP vía `volvixElectron`) sigue solo-Electron; el camino real de cobro (FASE 4 "rápido") ya usa `VolvixPlatform` y funciona en android.
- Impresión USB directa: no soportada en Android (aviso claro). Logo/QR del ticket: no se imprimen en android (solo texto).
- Falta un botón 📷 en la búsqueda/pantalla de venta que llame `VolvixPlatform.scanBarcode()` y meta el código al flujo de escaneo del POS (`salvadorex-pos.html`, área compartida: coordinar con exe/Unificación).
- La política de firma del APK (keystore autogenerado en CI con contraseña fija) implica que **cada build tiene otra firma**: un APK nuevo no se instala sobre uno viejo sin desinstalar. Decisión de Vicky: guardar un keystore estable como secreto de GitHub.
