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
- CI: build verde en `apk/loyverse` (run 35511699480, APK 1.0.344 de 30 MB, Java del plugin compila). Push a `main`/`apk/**` solo sube artifact; solo un tag `v*.*.*` publica en el release. Un commit con `[emu-test]` en el mensaje (solo rama `apk/loyverse`) habilita la depuracion remota del WebView para pruebas en emulador.
- **Emulador `emulator-5556` (Android 10, 1080x2280, 393x830 CSS px), APK real de CI** (evidencia 2026-09-20):
  - `VolvixPlatform.kind === 'android'`, `Capacitor.Plugins.VolvixPrinter` registrado, `VolvixEscPos` cargado; app arranca sin crash.
  - Impresion REAL por TCP a una impresora falsa en el host (10.0.2.2:9100/9101): `comandaTest` 274 B; `printTicket` 55 B con CP437 (`Se¤or Jos`) + pulso de cajon (`1b 70 00 3c 78`); comanda ruteada por categoria (Guisados -> :9100, Bebidas -> :9101); `openDrawer` 7 B; `pingPrinter` ok/fallo con mensaje; Bluetooth sin adaptador -> `{ok:false,'Este equipo no tiene Bluetooth'}` sin lanzar.
  - Vista Loyverse (`body[data-vista=2]`): cuadricula de **3 columnas** a 393 px (tiles 128x104), pestanas de categoria, TICKETS ABIERTOS / COBRAR, tacto OK (anillo de foco), menu ⋮ abre ("Articulo vario", "Imprimir cuenta").
  - Camara: `scanBarcode` muestra overlay y oculta el resto; la vista previa de la camara del emulador sale negra (sin decodificar codigos aqui; falta probar en equipo fisico). Bug hallado y corregido: `stopScan()` no resuelve `startScan()`, asi que "Cancelar" ahora cierra por su cuenta (verificado).
  - Bug hallado y corregido: la barra de estado se encimaba con el encabezado (WebView bajo la barra de estado) -> `capacitor.config.json` StatusBar `overlaysWebView:false`, color `#1E8E4E`.
  - NO concluyente (backend simulado, sin datos reales): agregar producto al ticket, modal de Tickets abiertos, campo de busqueda y teclado no respondieron con el mock de `scripts/dev-mock-pos.js` (los mosaicos se fabricaron; el renderizador clasico de quick-picks no genero productos con el mock). Debe repetirse contra el negocio de PRUEBA cuando haya red en el emulador (hoy sin internet).

## 5. Pendientes / degradaciones honestas

- `autoPrintTicket` legado de `volvix-cobro-modal.js` (reintentos USB/BT/IP vía `volvixElectron`) sigue solo-Electron; el camino real de cobro (FASE 4 "rápido") ya usa `VolvixPlatform` y funciona en android.
- Impresión USB directa: no soportada en Android (aviso claro). Logo/QR del ticket: no se imprimen en android (solo texto).
- Botón 📷: HECHO (§8). Falta probar que `searchProduct(codigo)` agregue el producto, en un equipo con WebView actual.
- Firma estable: ver §7 (hasta que existan los 4 secretos en GitHub, cada build firma distinto).

## 6. Deuda (a) de mi area migrada + version derivada (2026-09-20)

- `volvix-capacitor-bridge.js`, `volvix-capacitor-api-rewrite.js`, `volvix-mobile-wiring.js`: 0 referencias directas a `Capacitor`; usan `VolvixPlatform.kind` / `isNative` / `plugin(nombre)` (nuevo en el bloque android de `volvix-platform.js`, idempotente). Si una pagina aun no carga `volvix-platform.js`, el bridge cae a la heuristica de WebView (localhost + UA movil) para no romper el APK. Se agrego 1 linea `<script src=volvix-platform.js>` antes del bridge/mobile-wiring en 8 paginas (commit aparte).
- `android/app/build.gradle`: `versionName` = `-PVOLVIX_VERSION` / env / `package.json`; `versionCode` = `-PVERSION_CODE` / env / `1000000*mayor + 1000*menor + patch` (contiene el patch y sigue subiendo frente a los APK ya publicados, p. ej. v1.0.336 = 1000336). El CI verifica con `aapt2 dump badging` que el APK trae esa version. Guardia `check-paridad`: 0 nuevos, 5 mejorados.

## 7. Firma del APK (keystore estable) — 2026-09-20

**Estado:** el CI ya soporta firma estable pero **hasta que existan los 4 secretos en GitHub, cada build firma con la clave DEBUG de Android: es distinta en cada build y un APK nuevo NO se instala encima del anterior** (hay que desinstalar). Sin contraseñas por defecto en el repo (se quitó `volvix2026` de `build.gradle` y del workflow; sigue en el historial git pero esa clave se regeneraba en cada build, no hay nada que rotar).

Secretos del repo (Settings → Secrets and variables → Actions; los carga el dueño / `gh`, ninguna IA teclea credenciales):

| Secreto | Contenido |
|---|---|
| `ANDROID_KEYSTORE_B64` | el keystore PKCS12 en base64 (una sola línea) |
| `ANDROID_KEYSTORE_PASS` | contraseña del keystore |
| `ANDROID_KEY_ALIAS` | alias de la clave (`volvix-release`) |
| `ANDROID_KEY_PASS` | contraseña de la clave (igual a la del keystore en PKCS12) |

- **Ya generado** (fuera del repo, nunca commiteado ni impreso): `C:\tmp\openclaw-gateway\secrets\` → `volvix-release.jks` (PKCS12, RSA 2048, 10000 días), `volvix-release.jks.b64.txt` (el valor de `ANDROID_KEYSTORE_B64`) y `volvix-release-secrets.txt` (contraseñas y alias). **Respaldar esa carpeta**: si se pierde la clave, los APK ya instalados no se podrán actualizar.
- Huella SHA-256 del certificado (pública, sirve para comprobar el APK): `36:F7:E0:E7:0A:FC:23:23:37:63:0F:63:53:69:ED:A5:8D:27:A6:D3:FD:E4:ED:DA:5E:64:C5:B3:89:D6:61:C2`. El CI la imprime en el resumen de cada run (paso "Verificar firma del APK").
- Cargar los secretos (PowerShell, con `gh auth login` hecho por el dueño):
  ```
  cd C:\tmp\openclaw-gateway\secrets
  gh secret set ANDROID_KEYSTORE_B64 --repo pruebavolte/volvix-pos < volvix-release.jks.b64.txt
  gh secret set ANDROID_KEYSTORE_PASS --repo pruebavolte/volvix-pos    # pegar el valor de volvix-release-secrets.txt
  gh secret set ANDROID_KEY_ALIAS --repo pruebavolte/volvix-pos --body volvix-release
  gh secret set ANDROID_KEY_PASS --repo pruebavolte/volvix-pos         # pegar el valor de volvix-release-secrets.txt
  ```
- Generar el base64 de otro keystore: PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes('volvix-release.jks'))`; bash `base64 -w0 volvix-release.jks`. Crear uno nuevo: `keytool -genkeypair -keystore volvix-release.jks -alias volvix-release -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12`.
- Cómo lo usa el build: el paso "Configurar firma del APK" decodifica `ANDROID_KEYSTORE_B64` a `android/app/volvix-release.keystore` (ignorado por git: `*.keystore`, `*.jks`) y exporta los otros 3 como variables de entorno que lee `android/app/build.gradle`; si falta cualquiera, `release` firma con `signingConfigs.debug` y un tag emite un `::warning::`. El paso "Verificar firma" imprime `Firma: stable|debug`.
- Al pasar a la firma estable, los equipos con un APK anterior (firmado con clave debug) deben **desinstalar una sola vez**; después las actualizaciones se instalan encima.

## 8. Botón 📷, WebView viejo y emulador (2026-09-20)

- **Botón 📷** (`public/volvix-scan-button.js`, `defer`, 1 línea `<script>` en `salvadorex-pos.html`; sin editar el HTML grande): inserta (a) el botón `#vlx-scan-btn-lv` en la barra de la vista Loyverse y `#vlx-scan-btn-pos` en la fila clásica "Código del Producto", (b) el interruptor "Usar la cámara para escanear" en Config → General (`#vlx-cfg-scan-row`). Todo con `data-vlx-keep="1"`. Visible solo si `VolvixPlatform.canScan()` (android con el plugin del escáner; .exe si expone `scanBarcode`) **y** el interruptor está ON (`localStorage.volvix_scan_camera`, por defecto ON). Al leer un código llama a `window.searchProduct(codigo)` (igual que ENTER). No creé módulo/flag: el interruptor de Config es el control; si Vicky quiere `module.camera_scan`, lo da de alta Web.
- Verificado en emulador con el APK real: los 2 botones y el interruptor aparecen, el interruptor los oculta/muestra y guarda `volvix_scan_camera`, tocar 📷 abre el escáner y "Cancelar" lo cierra.
- **WebView mínimo = Chrome 80.** El POS usa `?.` y `??`; el emulador `emulator-5556` trae WebView 74 (sin Play Store para actualizarlo) y el script principal de `salvadorex-pos.html` falla con `SyntaxError: Unexpected token '.'`, así que **ahí no cargan productos ni la venta**. Es una limitación del emulador, no de los teléfonos con WebView actualizado (Motorola g24/Android 14 sin problema). El bridge ahora muestra un aviso rojo (`#vlx-webview-old`) si el WebView es < 80 en vez de dejar la pantalla vacía.
- **Pruebas de UI en emulador (3 caminos intentados):** (1) mock por `10.0.2.2`/`adb reverse`: bloqueado porque `capacitor.config.json` tiene `cleartext:false`; (2) mock inyectado con `Network.setRequestInterception` por CDP (el dominio `Fetch` no existe en WebView 74): funciona, la API simulada responde; (3) causa raíz: WebView 74 no ejecuta el POS. El emulador SÍ tiene internet (el `ping` ICMP falla, pero `fetch` a https funciona), no hizo falta `-dns-server`. Para agregar producto / Tickets abiertos / búsqueda+teclado hace falta un WebView ≥ 80: el humo de esas pantallas ya quedó ✅ en WEB (navegador) y comparte el mismo `public/`.
