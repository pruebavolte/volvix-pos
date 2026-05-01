# R18 — Volvix POS Mobile App (Capacitor wrapper)

Wrapper Android/iOS de la app web Volvix POS (https://salvadorexoficial.com)
empaquetada con **Capacitor 6**. Reutiliza el mismo frontend PWA.

## 0. Pre-requisitos

| Plataforma | Requisito |
|------------|-----------|
| Ambas      | Node 20+, npm 10+, Git |
| Android    | Android Studio Hedgehog+, JDK 17, Android SDK 34 |
| iOS        | macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`) |

## 1. Instalar Capacitor CLI

```bash
npm install -g @capacitor/cli @capacitor/core
npm install @capacitor/android @capacitor/ios
```

## 2. Inicializar (ya hay capacitor.config.json)

```bash
# desde la raíz del proyecto
npx cap add android
npx cap add ios
```

Esto reemplaza los placeholders `android/build.gradle` y `ios/Podfile` por proyectos completos.

## 3. Sync con cada deploy nuevo

```bash
npx cap sync       # copia public/ + plugins
npx cap copy       # solo assets
```

## 4. Build Android (APK + AAB)

```bash
npx cap open android      # abre Android Studio
# o por CLI:
npx cap build android
cd android && ./gradlew assembleRelease     # APK
./gradlew bundleRelease                     # AAB (Google Play)
```

### Firma APK release

1. Generar keystore (1 sola vez):
   ```bash
   keytool -genkey -v -keystore volvix-release.keystore \
           -alias volvix -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Guardar `volvix-release.keystore` **fuera del repo** (Vault / 1Password).
3. En `android/app/build.gradle` agregar `signingConfigs.release` apuntando a:
   ```
   storeFile file(System.getenv("VOLVIX_KEYSTORE"))
   storePassword System.getenv("VOLVIX_STORE_PASS")
   keyAlias "volvix"
   keyPassword System.getenv("VOLVIX_KEY_PASS")
   ```
4. `./gradlew bundleRelease` → `app-release.aab` listo para Play Console.

## 5. Build iOS

```bash
npx cap open ios          # abre Xcode
# en Xcode: Signing & Capabilities -> Team = Apple Developer ID
# Product -> Archive -> Distribute App -> App Store Connect
```

## 6. Submit Google Play

1. Crear app en [Play Console](https://play.google.com/console) → mx.volvix.app
2. Subir `app-release.aab` a track **internal testing** primero.
3. Llenar:
   - Privacy policy URL → https://salvadorexoficial.com/privacy
   - Data safety form (sin tracking de terceros)
   - Screenshots 1080x1920 (5 mínimo)
   - Descripción ES/EN
4. Promover a **production** tras QA.

## 7. Submit App Store

1. App Store Connect → My Apps → New App → bundle id `mx.volvix.app`.
2. Subir build vía Xcode Archive o `xcrun altool`.
3. Llenar:
   - Privacy nutrition labels
   - Export compliance (uses HTTPS only → exempt)
   - App preview / screenshots iPhone 6.7" + iPad 12.9"
4. Submit for Review (1–3 días).

## 8. OTA / Force update

La app llama a `GET /api/mobile/version` al arrancar. Si `force_update=true` muestra modal bloqueante con link a la store.

```json
{ "version": "1.0.3", "min_supported": "1.0.0", "force_update": false }
```

## 9. Endpoints móviles (ver api/index.js)

| Método | Path                  | Uso                              |
|--------|-----------------------|----------------------------------|
| GET    | /api/mobile/version   | Versión + force_update           |
| GET    | /api/mobile/config    | Endpoints, feature flags, branding |

## 10. Roadmap post-launch

- Push notifications via `@capacitor/push-notifications` + FCM/APNs
- Biometric login `@capacitor-community/biometric-auth`
- Barcode scanner nativo `@capacitor-mlkit/barcode-scanning`
- Deep links `volvix://order/123`
