# B41  Mobile App Build Pipeline (Capacitor) — Volvix POS

**Fecha:** 2026-04-27
**Working dir:** `C:\Users\DELL\Downloads\verion 340\`
**Production URL (wrapper):** https://salvadorexoficial.com
**App ID:** `com.volvix.pos`
**Estado pipeline:** LISTO para `android-debug` cuando JDK17 + Android SDK estén instalados.

---

## 1. Capacitor config — Auditado

Archivo: `capacitor.config.json`

| Campo                                    | Valor                                                       | Estado |
|------------------------------------------|-------------------------------------------------------------|--------|
| `appId`                                  | `com.volvix.pos`                                            | OK     |
| `appName`                                | `Volvix POS`                                                | OK     |
| `webDir`                                 | `public` (existe, contiene manifest.json + sw.js)           | OK     |
| `bundledWebRuntime`                      | `false`                                                     | OK     |
| `server.url`                             | `https://salvadorexoficial.com`                             | OK     |
| `server.cleartext`                       | `false`                                                     | OK (segura) |
| `server.androidScheme`                   | `https`                                                     | OK     |
| `server.allowNavigation`                 | 5 dominios concretos (volvix-pos, supabase, stripe x3)      | OK (sin wildcards) |
| `android.allowMixedContent`              | `false`                                                     | OK     |
| `android.captureInput`                   | `true`                                                      | OK     |
| `android.webContentsDebuggingEnabled`    | `false`                                                     | OK (release-safe) |
| `android.buildOptions.keystorePath`      | `android/app/volvix-release.keystore`                       | OK     |
| `plugins.SplashScreen`                   | 2000ms `#0A0A0A` `CENTER_CROP`                              | OK     |
| `plugins.StatusBar`                      | `dark` `#0A0A0A`                                            | OK     |
| `plugins.Keyboard`                       | `body resize`, dark, `resizeOnFullScreen`                   | OK     |
| `plugins.Camera`                         | `permissions: ["camera"]`                                   | OK     |

**No fue necesario modificar `capacitor.config.json`.** La hardening de seguridad
(allowNavigation explícito, sin wildcards, cleartext=false, scheme=https) ya estaba
aplicada. La config no afecta al build de Vercel — solo se usa cuando se ejecuta
`cap sync` para empaquetar.

---

## 2. Plugins instalados (12)

Todos quedaron sincronizados a `android/` después de `npx cap sync android`:

| Plugin                                | Versión   | Función                              |
|---------------------------------------|-----------|--------------------------------------|
| `@capacitor/core`                     | 8.3.1     | Runtime Capacitor                     |
| `@capacitor/cli`                      | 8.3.1     | CLI                                   |
| `@capacitor/android`                  | 8.3.1     | Plataforma Android                    |
| `@capacitor/app`                      | 8.1.0     | Lifecycle                             |
| `@capacitor/camera`                   | 8.1.0     | Fotos de recibo                       |
| `@capacitor/device`                   | 8.0.2     | Info dispositivo                      |
| `@capacitor/filesystem`               | 8.1.2     | Archivos locales                      |
| `@capacitor/keyboard`                 | 8.0.3     | Teclado                               |
| `@capacitor/network`                  | 8.0.1     | Online/offline                        |
| `@capacitor/preferences`              | 8.0.1     | KV offline (sucesor de @capacitor/storage) |
| `@capacitor/share`                    | 8.0.1     | Compartir tickets                     |
| `@capacitor/splash-screen`            | 8.0.1     | Splash 2s                             |
| `@capacitor/status-bar`               | 8.0.2     | Barra estado                          |
| `@capacitor-community/keep-awake`     | 8.0.1     | Pantalla activa durante turno         |
| `@capacitor-community/barcode-scanner`| 4.0.1     | Escaneo barcode nativo                |

### Notas importantes
- **`@capacitor/storage` está deprecated** desde Capacitor 4. Reemplazo: `@capacitor/preferences`. Ya está integrado.
- **`@capacitor/keep-awake` NO existe oficial.** Usé `@capacitor-community/keep-awake` (instalado con `--legacy-peer-deps` por conflicto en Capacitor 8).
- **Print Bluetooth:** no instalé plugin específico. El ecosistema fragmentado (`@capacitor-community/bluetooth-le` + driver ESC/POS propio) requiere decisión arquitectónica. **No bloqueante** para APK debug.
- **Push notifications:** no incluido — puede agregarse después con Firebase (`@capacitor/push-notifications`).

### NO instalado (fuera de scope o no existente)
- `@capacitor/barcode-scanner` (no existe oficialmente — usé `@capacitor-community/barcode-scanner`)
- `@capacitor/storage` (deprecated → ya reemplazado por `@capacitor/preferences`)
- `@capacitor/print` (no existe oficial; impresión Bluetooth requiere plugin custom)

---

## 3. mobile-build.js — Mejorado completo

Archivo reescrito en `C:\Users\DELL\Downloads\verion 340\mobile-build.js`.

### Comandos disponibles (kebab-case + alias dos puntos)

```
node mobile-build.js help              # ayuda completa
node mobile-build.js doctor            # diagnostica entorno
node mobile-build.js install           # @capacitor/* + plugins
node mobile-build.js init              # cap add android (+ ios mac)
node mobile-build.js sync              # cap sync (web -> nativo)
node mobile-build.js android-debug     # APK debug
node mobile-build.js android-release   # APK firmado
node mobile-build.js android-bundle    # AAB (Google Play)
node mobile-build.js ios               # abre Xcode (mac)
node mobile-build.js clean             # limpia outputs
```

Aliases legacy aceptados: `android:debug`, `android:release`, `android:bundle`.

### Mejoras vs versión anterior

| Mejora                          | Detalle                                                      |
|---------------------------------|--------------------------------------------------------------|
| `child_process.spawn` streaming | reemplaza `execSync` para output en vivo de gradle/cap       |
| `checkPrereqs()` antes de build | bloquea si falta JDK/ANDROID_HOME/JAVA_HOME, con fix concreto |
| Mensajes de error accionables   | cada fallo apunta a docs/instalación específica              |
| `clean` command                 | borra `android/build`, `android/.gradle`, `ios/build`        |
| `doctor` extendido              | reporta JAVA_HOME, ANDROID_SDK_ROOT, Xcode, Cocoapods        |
| Output del APK                  | imprime tamaño en MB después de build exitoso                |
| Comandos kebab-case             | `android-debug` además de `android:debug` (más portable)     |

### Verificación
```
$ node mobile-build.js help          # ✓ funciona
$ node mobile-build.js doctor        # ✓ detecta correctamente: JDK 8, ANDROID_HOME vacío, JAVA_HOME vacío
```

---

## 4. Variables de entorno requeridas

Para compilar Android se requieren (no presentes en este equipo):

| Variable             | Valor esperado                                    | Estado actual |
|----------------------|---------------------------------------------------|---------------|
| `JAVA_HOME`          | Ruta a JDK 17 (Temurin recomendado)               | VACIO         |
| `ANDROID_HOME`       | `%LOCALAPPDATA%\Android\Sdk` (típico Windows)     | VACIO         |
| `ANDROID_SDK_ROOT`   | Igual a ANDROID_HOME (alternativa moderna)        | VACIO         |
| Path adiciones       | `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\build-tools\34.0.0` | — |

Para release/AAB (no necesarios para debug):

| Variable                          | Uso                                |
|-----------------------------------|-------------------------------------|
| `VOLVIX_KEYSTORE_PASSWORD`        | Contraseña del keystore             |
| `VOLVIX_KEY_ALIAS`                | Alias (default: `volvix-pos`)       |
| `VOLVIX_KEY_PASSWORD`             | Contraseña de la clave              |

Detalle completo en `mobile-assets/SIGNING-GUIDE.md`.

---

## 5. Estructura nativa generada

`cap add android` ejecutó correctamente. Estructura producida:

```
android/
├── app/
│   ├── build.gradle               (real, generado por Capacitor)
│   ├── capacitor.build.gradle     (auto-update por cap sync)
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml    (mejorado con permisos POS + networkSecurityConfig)
│       ├── assets/public/         (mirror de public/, fallback offline)
│       ├── assets/capacitor.config.json
│       ├── assets/capacitor.plugins.json (12 plugins listados)
│       └── res/xml/network_security_config.xml  (cleartext=false + dominios pinned)
├── build.gradle                   (top-level, generado por Capacitor)
├── capacitor.settings.gradle
├── capacitor-cordova-android-plugins/
├── gradle/
├── gradle.properties
├── gradlew                        (Linux/Mac wrapper)
├── gradlew.bat                    (Windows wrapper)
├── settings.gradle
└── variables.gradle
```

`ios/` permanece como placeholder (Podfile sin proyecto Xcode) — solo se materializa
en macOS con `npx cap add ios`.

---

## 6. AndroidManifest.xml — Permisos POS

Archivo `android/app/src/main/AndroidManifest.xml` actualizado con permisos POS reales
(versión Capacitor por defecto solo trae INTERNET):

- `INTERNET` + `ACCESS_NETWORK_STATE` (online/offline)
- `CAMERA` + autofocus (barcode + recibos)
- `VIBRATE` (feedback al escanear)
- `WAKE_LOCK` (keep-awake durante turno)
- `BLUETOOTH` (legacy, maxSdkVersion=30) + `BLUETOOTH_CONNECT` + `BLUETOOTH_SCAN` (impresoras)
- `WRITE_EXTERNAL_STORAGE` (legacy, maxSdkVersion=29) + `READ_EXTERNAL_STORAGE` (maxSdkVersion=32)
- `POST_NOTIFICATIONS` (Android 13+)
- `<uses-feature android:required="false">` para camera y bluetooth_le (instalable sin hardware)
- `android:hardwareAccelerated="true"`
- `android:usesCleartextTraffic="false"` + `android:networkSecurityConfig="@xml/network_security_config"`

`android/app/src/main/res/xml/network_security_config.xml` instalado con:
- `cleartextTrafficPermitted=false` (base + dominios pinned)
- `trust-anchors src="system"` (sin user CAs en producción)
- `<debug-overrides>` para permitir `user` CAs solo en builds debug

---

## 7. Documentación generada en `mobile-assets/`

| Archivo                                              | Contenido                                                |
|------------------------------------------------------|----------------------------------------------------------|
| `mobile-assets/SIGNING-GUIDE.md`                     | Generación keystore, gradle.properties, build.gradle signingConfigs, verificación con apksigner, backup 3-2-1, Play App Signing, rotación |
| `mobile-assets/ICONS.md`                             | Requisitos SVG fuente, splash 2732x2732, generación con `@capacitor/assets`, generación manual con ImageMagick, verificación visual |
| `mobile-assets/android-templates/AndroidManifest.xml`| Template con todos los permisos POS (referencia)         |
| `mobile-assets/android-templates/network_security_config.xml` | Template instalado en `android/app/src/main/res/xml/` |
| `mobile-assets/android-templates/README.md`          | Workflow de uso de los templates                          |

---

## 8. Build attempt — Resultado

### `npx cap sync android` → ÉXITO
```
√ Copying web assets from public to android\app\src\main\assets\public
√ Creating capacitor.config.json in android\app\src\main\assets
√ Updating Android plugins
[info] Found 12 Capacitor plugins for android
√ update android in 359.44ms
[info] Sync finished in 0.758s
```

### `./gradlew assembleDebug` → FALLO (esperado, falta toolchain)

```
A problem occurred configuring root project 'android'.
> Could not resolve com.android.tools.build:gradle:8.13.0.
   > Dependency requires at least JVM runtime version 11. This build uses a Java 8 JVM.
> Could not resolve com.google.gms:google-services:4.4.4.
   > Dependency requires at least JVM runtime version 11.
* Try: Run this build using a Java 11 or newer JVM.
BUILD FAILED in 28s
```

**Causa:** este equipo tiene JDK 8 instalado. Capacitor 8 + Android Gradle Plugin 8.x requieren **JDK 17**.

### Para finalizar el primer APK (en este equipo):

1. Descargar Temurin JDK 17: https://adoptium.net/temurin/releases/?version=17
2. Definir `JAVA_HOME` apuntando al JDK 17
3. Instalar Android Studio: https://developer.android.com/studio
4. Abrir Android Studio → SDK Manager → instalar Android SDK Platform 34 + Build Tools 34
5. Definir `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`
6. Reabrir terminal (para refrescar env vars) y correr:
   ```
   node mobile-build.js doctor          # debe estar todo OK
   node mobile-build.js android-debug
   ```

APK producido en: **`android/app/build/outputs/apk/debug/app-debug.apk`**

---

## 9. PWA installability — Resumen

| Check                              | Estado |
|------------------------------------|--------|
| `manifest.json` en `/public/`      | OK     |
| `name`, `short_name`               | OK     |
| `start_url`                        | OK (`/pos.html?source=pwa`) |
| `display: standalone`              | OK     |
| `icons` (192, 512, maskable)       | OK (referenciados) |
| `theme_color` `#FBBF24`            | OK     |
| `background_color` `#0A0A0A`       | OK     |
| `categories` (business/finance)    | OK     |
| `shortcuts` (4: Vender/Inventario/Corte/Reportes) | OK |
| `share_target`                     | OK     |
| `screenshots`                      | OK     |
| Service worker `sw.js`             | PRESENTE (`/public/sw.js`) |
| HTTPS                              | OK (Vercel) |
| **Iconos PNG físicos**             | **FALTAN** — `public/icon-192.png` y `public/icon-512.png` no existen en disco |

**Score PWA estimado:** 90/100 (perdería puntos solo por iconos PNG faltantes).

**Acción mínima para 100/100:**
Crear `public/icon-192.png` (192x192) y `public/icon-512.png` (512x512) con la marca
Volvix. Una vez existan, Chrome Android mostrará "Instalar app" inmediatamente —
ruta de adopción rápida antes de tener APK firmado en Play Store.

Comando rápido (placeholder negro `#0A0A0A` mientras llega arte definitivo, requiere
ImageMagick):
```bash
convert -size 192x192 xc:'#0A0A0A' -fill '#FBBF24' -gravity center \
  -pointsize 80 -annotate 0 'V' public/icon-192.png
convert -size 512x512 xc:'#0A0A0A' -fill '#FBBF24' -gravity center \
  -pointsize 220 -annotate 0 'V' public/icon-512.png
```

---

## 10. Limitaciones conocidas

| Limitación                               | Impacto                                       | Mitigación                                |
|------------------------------------------|-----------------------------------------------|-------------------------------------------|
| iOS solo se compila en macOS             | Windows/Linux no producen IPA                  | PWA funciona en iOS Safari (instalable)   |
| Keystore no presente para release        | No se puede compilar APK release ni AAB        | Generar con `keytool` (ver SIGNING-GUIDE) |
| JDK 8 en este equipo (necesita JDK 17)   | `gradlew assembleDebug` falla                  | Instalar Temurin JDK 17                    |
| `ANDROID_HOME` no definido               | Gradle no localiza SDK                         | Instalar Android Studio + setear env var   |
| Iconos PNG físicos faltantes             | PWA muestra ícono genérico Chrome              | Generar 2 PNGs (placeholder o arte real)  |
| Plugin Bluetooth print no incluido       | Impresión por BT no funcional out-of-box       | Decisión arquitectónica futura (BLE)      |

Ninguna limitación impide el primer build una vez el toolchain esté instalado.

---

## 11. Step-by-step "Primer APK" (desde otro equipo Windows limpio)

### Pre-requisitos (una vez por equipo)
1. Node 18+ (este equipo tiene 24.13.1 OK)
2. Temurin JDK 17 → `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`
3. Android Studio → SDK Platform 34 + Build Tools 34 + Platform Tools
4. `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`
5. Path: `%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\build-tools\34.0.0`

### Build
```bash
cd "C:\Users\DELL\Downloads\verion 340"
node mobile-build.js doctor              # confirmar que todo está OK
node mobile-build.js install             # solo si node_modules vacío
node mobile-build.js init                # solo si android/ es placeholder
node mobile-build.js android-debug
```

### Output esperado
```
✓ APK debug listo: C:\Users\DELL\Downloads\verion 340\android\app\build\outputs\apk\debug\app-debug.apk
✓ Tamaño: ~6-12 MB
```

### Probar en device
```bash
# Conectar device por USB con USB Debugging activado
adb devices                                     # debe listar tu device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.volvix.pos/.MainActivity
adb logcat -s Capacitor:V                       # logs en vivo
```

### Sample APK output path
```
C:\Users\DELL\Downloads\verion 340\android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 12. Resumen ejecutivo

- ✓ Capacitor config auditado, sin cambios necesarios (ya estaba hardenizado)
- ✓ Capacitor 8.3.1 + 12 plugins instalados (15 si contamos core/cli/android + 12 plugins POS)
- ✓ `mobile-build.js` reescrito con `spawn` streaming, `doctor` extendido, `clean`, prereq checks
- ✓ Android scaffold real creado con `cap add android`
- ✓ AndroidManifest enriquecido con permisos POS reales (BT, camera, notifs, wake_lock)
- ✓ network_security_config instalado (cleartext=false, dominios pinned)
- ✓ SIGNING-GUIDE.md + ICONS.md + templates en `mobile-assets/`
- ✓ `cap sync android` ejecutado con éxito (12 plugins reportados)
- ✗ `gradlew assembleDebug` falla por JDK 8 → JDK 17 (esperado, documentado)
- ✗ Iconos PNG físicos faltantes (impacto: PWA muestra ícono genérico)

**Nada en `api/`, `volvix-feature-flags.js`, `volvix-uplift-wiring.js` ni HTMLs fue modificado.**
**El web build (Vercel) NO se ve afectado** — los cambios son solo en `mobile-build.js`,
`package.json scripts`, `android/`, `mobile-assets/`.

**Pipeline LISTO.** Solo falta toolchain JDK17+SDK en la máquina de build, que es
trabajo de operaciones (no de código).
