# Volvix POS — app Android (APK)

Envoltorio Capacitor del mismo `public/` que usan la web y el .exe (regla de oro: mismo código). Detalle técnico, paridad y pruebas: [`docs/APK_ANDROID.md`](../docs/APK_ANDROID.md).

## Requisitos del dispositivo

| Requisito | Mínimo |
|---|---|
| Android | 7.0 (API 24) |
| **Android System WebView** (o Chrome) | **versión 80 o superior** |

El POS usa sintaxis moderna (`?.` y `??`), que solo entiende Chrome/WebView 80+. **Decisión: NO se transpila** para soportar WebView anterior. Si el equipo tiene un WebView más viejo, al abrir la app aparece una pantalla clara "Actualiza Android System WebView" (con botón a Google Play) en vez de quedar en blanco; el detector está al inicio de `public/volvix-capacitor-bridge.js`.

Cómo actualizar el WebView en el equipo: Google Play → buscar "Android System WebView" → Actualizar (y, si hace falta, "Google Chrome"). Los teléfonos con Google Play lo actualizan solos; los equipos sin Play Services (o emuladores sin cuenta) se quedan con la versión de fábrica.

Antes de usar en el código de `public/` algo que suba ese piso (`??=`, `||=`, `.at()`, `replaceAll`, `structuredClone`, `Object.hasOwn`…) correr `node scripts/scan-webview-min.js` y avisar.

## Compilar y firmar

- **Solo en GitHub Actions** (`.github/workflows/build-apk.yml`): nada de Gradle/SDK en local (disco).
- Cada tag `v*.*.*` publica `VolvixPOS.apk` en el mismo release que el .exe.
- Firma estable por secretos del repo (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASS`); sin ellos firma con la clave debug y cada build firma distinto (ver `docs/APK_ANDROID.md` §7).
