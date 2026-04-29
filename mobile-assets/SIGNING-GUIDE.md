# Volvix POS — Android signing keystore guide

Esta guia explica como generar, almacenar y usar el keystore para firmar
APK/AAB de release antes de subir a Google Play.

> CRITICO: El keystore es UNICO por aplicacion. Si lo pierdes o cambias la
> contrasena despues de publicar, **NO podras enviar updates** al mismo
> appId `com.volvix.pos` en Google Play. Backup obligatorio.

---

## 1. Generar el keystore

Ejecuta una sola vez (raiz del proyecto):

```bash
keytool -genkeypair -v \
  -keystore android/app/volvix-release.keystore \
  -alias volvix-pos \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass "<PASSWORD_KEYSTORE>" \
  -keypass  "<PASSWORD_KEY>" \
  -dname "CN=Volvix POS, OU=Engineering, O=Volvix, L=CDMX, ST=CDMX, C=MX"
```

- `validity 10000` = ~27 anos. Google Play recomienda al menos 25.
- Cambia `<PASSWORD_KEYSTORE>` y `<PASSWORD_KEY>` por valores fuertes.
- Mantén ambas contrasenas distintas (defensa en profundidad).

Resultado: `android/app/volvix-release.keystore`

---

## 2. Configurar `gradle.properties`

Crea o edita `android/gradle.properties` y agrega (NO commitear):

```properties
VOLVIX_KEYSTORE_FILE=volvix-release.keystore
VOLVIX_KEYSTORE_PASSWORD=<PASSWORD_KEYSTORE>
VOLVIX_KEY_ALIAS=volvix-pos
VOLVIX_KEY_PASSWORD=<PASSWORD_KEY>
```

Mejor opcion para CI/CD: usa variables de entorno
(`ORG_GRADLE_PROJECT_VOLVIX_KEYSTORE_PASSWORD=...`) o secret manager
(GitHub Actions secrets, Vault, etc.).

Agrega a `.gitignore`:

```
android/gradle.properties
android/app/volvix-release.keystore
*.keystore
*.jks
```

---

## 3. Configurar `android/app/build.gradle`

Despues de `npx cap add android`, edita el bloque `android { ... }`:

```gradle
android {
    signingConfigs {
        release {
            storeFile     file(VOLVIX_KEYSTORE_FILE)
            storePassword VOLVIX_KEYSTORE_PASSWORD
            keyAlias      VOLVIX_KEY_ALIAS
            keyPassword   VOLVIX_KEY_PASSWORD
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'),
                          'proguard-rules.pro'
        }
        debug {
            // debug usa la firma debug.keystore default de Android
        }
    }
}
```

---

## 4. Compilar release

```bash
node mobile-build.js android-release   # APK firmado
node mobile-build.js android-bundle    # AAB para Google Play (preferido)
```

Outputs:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 5. Verificar la firma

```bash
# Inspeccionar firma del APK
$ANDROID_HOME/build-tools/<version>/apksigner verify --verbose \
  android/app/build/outputs/apk/release/app-release.apk

# Inspeccionar el certificado del keystore
keytool -list -v \
  -keystore android/app/volvix-release.keystore \
  -alias volvix-pos
```

Debe mostrar `Verified using v1 scheme` y `Verified using v2 scheme` (al menos).

---

## 6. Backup CRITICO

El keystore es la UNICA forma de firmar updates. Sin el, no puedes
publicar v1.0.1 sobre tu v1.0.0 en la misma listing.

Backup recomendado (3-2-1 rule):

1. Copia local cifrada (`gpg --symmetric volvix-release.keystore`)
2. Bóveda en gestor de secretos (1Password, Vault, AWS Secrets Manager)
3. Copia offline en un USB cifrado guardado en sitio fisico distinto

Si usas Google Play App Signing, Google guardara la upload-key y firmara
con la app-key suya. Aun asi, conserva tu upload-key porque la pierdes
de tu lado = solicitud manual a Google Support para resetear.

---

## 7. Rotacion de claves (si pasa lo peor)

Si el keystore se compromete: solicita key reset en Google Play Console
> Setup > App signing > "Request key upgrade". Solo aplica si tienes
Play App Signing activado. Si NO lo tienes, no hay rotacion: tendras que
publicar como app nueva con appId distinto.

Por eso recomiendo activar Play App Signing al subir el primer AAB.

---

## 8. Checklist firma OK antes de subir

- [ ] `apksigner verify` pasa con v1 + v2
- [ ] `versionCode` incrementado vs publicacion anterior
- [ ] `versionName` actualizado en `android/app/build.gradle`
- [ ] Keystore backup en >= 2 ubicaciones distintas
- [ ] Contrasenas guardadas en gestor de secretos
- [ ] `.gitignore` incluye `*.keystore`, `*.jks`, `gradle.properties`
- [ ] CI/CD usa variables de entorno, NO archivos en repo
