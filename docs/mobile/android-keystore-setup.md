# Volvix POS — Android Keystore Setup & Build

> Guía completa para generar keystore, firmar APK, y publicar en Play Store.
> **Tiempo total: 30 min owner setup + 10 min cada build.**

---

## 1. Prerrequisitos (one-time)

### 1.1 Software requerido
- [ ] **Java JDK 17+** (`java -version`)
- [ ] **Android Studio** o **Android SDK Tools 34+** (`sdkmanager --list`)
- [ ] **Node.js 18+** + `npx` (para Capacitor)
- [ ] **Gradle 8+** (incluido en `android/gradlew`)

### 1.2 Variables de entorno
```bash
export ANDROID_HOME=/ruta/a/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

---

## 2. Generar Keystore (UNA SOLA VEZ — guarda con tu vida)

```bash
keytool -genkey -v \
  -keystore volvix.keystore \
  -alias volvix \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Te pedirá:
- Password del keystore (mínimo 6 caracteres) → **GUARDAR**
- Password del alias `volvix` → puede ser el mismo
- Nombre, Org, Ciudad, País → "Volvix" / "MX"

### CRÍTICO — guarda en al menos 2 lugares seguros:
1. `volvix.keystore` (binario)
2. `keystore-password.txt` (con los passwords)

> ⚠️ **Si pierdes este keystore, NUNCA podrás actualizar la app en Play Store.**
> Guárdalo en un password manager (1Password, Bitwarden) Y un backup offline (USB encrypted).

---

## 3. Configurar `android/gradle.properties`

Crea `android/gradle.properties` (NO commitear):

```properties
VOLVIX_KEYSTORE_PATH=../volvix.keystore
VOLVIX_KEYSTORE_PASSWORD=tu_password_aqui
VOLVIX_KEY_ALIAS=volvix
VOLVIX_KEY_PASSWORD=tu_password_aqui
```

Y agregalo a `.gitignore`:
```
android/gradle.properties
*.keystore
keystore-password.txt
```

---

## 4. Configurar `android/app/build.gradle`

Asegurate que tenga esta sección `signingConfigs` (Capacitor lo genera, solo verificar):

```gradle
android {
    signingConfigs {
        release {
            storeFile file(VOLVIX_KEYSTORE_PATH)
            storePassword VOLVIX_KEYSTORE_PASSWORD
            keyAlias VOLVIX_KEY_ALIAS
            keyPassword VOLVIX_KEY_PASSWORD
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## 5. Build APK (cada release)

### Opción A: Script automatizado
```bash
export ANDROID_KEYSTORE_PATH=/ruta/absoluta/volvix.keystore
export ANDROID_KEYSTORE_PASSWORD=tu_password
export ANDROID_KEY_ALIAS=volvix
bash scripts/build-android-apk.sh
```

### Opción B: Manual
```bash
npx cap sync android
cd android
./gradlew assembleRelease
```

APK final: `android/app/build/outputs/apk/release/app-release.apk`

---

## 6. Verificar firma del APK

```bash
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk
```

Debe mostrar `jar verified` y los detalles del certificado.

---

## 7. Subir a Play Store

### 7.1 Crear cuenta Google Play Console
- URL: https://play.google.com/console
- Costo: **$25 USD una vez** (cuenta de developer)

### 7.2 Crear aplicación
1. **Create app** → "Volvix POS" → idioma ES, app, gratuita
2. Llenar **Store listing**: descripción, screenshots (mín 2), icono 512×512, feature graphic 1024×500

### 7.3 Subir AAB (recomendado sobre APK)
Generar AAB en lugar de APK:
```bash
cd android
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

### 7.4 Flujo de release (en orden)
1. **Internal testing** (hasta 100 testers, deploy en minutos) → tú + equipo
2. **Closed testing** (lista cerrada de emails) → beta clients
3. **Open testing** (público con opt-in) → opcional
4. **Production** → revisión Google 1-7 días

### 7.5 Política de contenido obligatoria
- [ ] Privacy policy URL → `/aviso-privacidad.html`
- [ ] Data safety form (qué datos colectan)
- [ ] Target audience: 18+
- [ ] Content rating questionnaire
- [ ] Permissions justificadas (CAMERA, INTERNET, etc.)

---

## 8. Firebase + Crashlytics (opcional pero recomendado)

### 8.1 Crear proyecto Firebase
1. https://console.firebase.google.com → "Add project" → "Volvix POS"
2. Add Android app → package: `com.volvix.pos`
3. Descargar `google-services.json` → copiar a `android/app/google-services.json`

### 8.2 Agregar SDK en `android/build.gradle`
```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
        classpath 'com.google.firebase:firebase-crashlytics-gradle:2.9.9'
    }
}
```

### 8.3 En `android/app/build.gradle`
```gradle
apply plugin: 'com.google.gms.google-services'
apply plugin: 'com.google.firebase.crashlytics'

dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-crashlytics'
    implementation 'com.google.firebase:firebase-analytics'
}
```

---

## 9. Troubleshooting

| Error | Solución |
|---|---|
| `keystore was tampered with, or password was incorrect` | Verificar password en `gradle.properties` |
| `Failed to read key from keystore` | Verificar `keyAlias` matchea con el del keytool |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | App firmada con keystore diferente — desinstalar primero |
| `Build failed with R8 minification` | Agregar reglas a `proguard-rules.pro` para Capacitor plugins |
| APK > 100 MB | Usar AAB (Android App Bundle) — Play Store optimiza por device |

---

## 10. Checklist final pre-release

- [ ] `versionCode` incrementado en `android/app/build.gradle`
- [ ] `versionName` actualizado (ej. "1.0.1")
- [ ] APK firmado con keystore release
- [ ] Probado en al menos 1 dispositivo físico
- [ ] Privacy policy URL accesible
- [ ] Crashlytics activo
- [ ] Backup del keystore en 2 lugares

---

**Owner approx tiempo total**: 30 min (primera vez) + 10 min (cada release).
