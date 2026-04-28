# Volvix POS — iOS Build & App Store Submission

> Guía completa para compilar Volvix POS en iOS y publicar en App Store.
> **Tiempo total: 60 min setup + 15 min cada build.**

---

## 1. Prerrequisitos

### 1.1 Hardware obligatorio
- [ ] **Mac** (macOS Sonoma 14+ o Sequoia 15+) — NO se puede compilar iOS desde Windows/Linux
- [ ] Mínimo **8 GB RAM** (16 GB recomendado para Xcode)
- [ ] **30 GB libres** en disco

### 1.2 Cuentas y software
- [ ] **Apple Developer Program**: **$99 USD/año** (https://developer.apple.com/programs/)
- [ ] **Xcode 15+** (gratis en Mac App Store)
- [ ] **CocoaPods** (`sudo gem install cocoapods`)
- [ ] **Node.js 18+** + `npx`

---

## 2. Configurar Apple Developer

### 2.1 Inscribirte
1. https://developer.apple.com/account → Sign In con tu Apple ID
2. Enrollment → individuo o empresa → pagar $99 USD
3. Esperar aprobación: 24h - 48h (a veces más para empresas)

### 2.2 Crear App ID
1. Certificates, Identifiers & Profiles → Identifiers → "+" → App IDs → App
2. Description: "Volvix POS"
3. Bundle ID: **Explicit** → `com.volvix.pos`
4. Capabilities: marcar **Push Notifications**, **Associated Domains**, **In-App Purchase** (si aplica)

### 2.3 Generar certificados
1. Certificates → "+" → **iOS Distribution (App Store and Ad Hoc)**
2. Subir CSR generado en Keychain Access → "Request Certificate from Certificate Authority"
3. Descargar `.cer` → doble click para instalar en Keychain
4. Exportar como `.p12` (incluyendo private key) → guardar como backup

### 2.4 Provisioning Profile
1. Profiles → "+" → **App Store**
2. Seleccionar App ID `com.volvix.pos`
3. Seleccionar tu Distribution certificate
4. Nombre: "Volvix POS App Store"
5. Descargar `.mobileprovision` → doble click para instalar

---

## 3. Configurar proyecto Xcode

### 3.1 Sync Capacitor → iOS
```bash
cd /ruta/a/proyecto
npx cap add ios          # primera vez
npx cap sync ios
npx cap open ios         # abre Xcode
```

### 3.2 En Xcode
1. **Project Navigator** → seleccionar `App` (root)
2. **Signing & Capabilities** tab:
   - Team: tu equipo Apple Developer
   - Bundle Identifier: `com.volvix.pos`
   - Provisioning Profile: "Volvix POS App Store"
   - **Automatically manage signing**: OFF (manual para release)
3. **General** tab:
   - Display Name: "Volvix POS"
   - Version: 1.0.0
   - Build: 1 (incrementar cada upload)
   - Deployment Info → Minimum: iOS 14.0
4. **Info** tab — agregar permisos:
   - `NSCameraUsageDescription`: "Volvix POS necesita acceso a la cámara para escanear códigos de barras"
   - `NSPhotoLibraryUsageDescription`: "Volvix POS necesita acceso a fotos para subir imágenes de productos"

### 3.3 Iconos y Splash
- App Icon: **1024×1024** PNG, sin transparencia, en `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Launch Screen: editar `LaunchScreen.storyboard` (logo Volvix centrado, fondo `#0A0A0A`)

---

## 4. Build IPA (cada release)

### 4.1 Sync webDir → iOS
```bash
npx cap sync ios
cd ios/App
pod install
```

### 4.2 Archive en Xcode
1. Seleccionar device target: **Any iOS Device (arm64)** (NO simulator)
2. **Product → Archive** (10-15 minutos)
3. Cuando termine, abre **Organizer** automáticamente
4. **Distribute App** → **App Store Connect** → **Upload**
5. Seleccionar provisioning, opciones por defecto → Upload

### 4.3 Vía CLI (alternativa)
```bash
cd ios/App
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath ./build/App.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath ./build/App.xcarchive \
  -exportPath ./build \
  -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist` mínimo:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>TU_TEAM_ID</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

---

## 5. App Store Connect

### 5.1 Crear app
1. https://appstoreconnect.apple.com → My Apps → "+" → New App
2. Plataforma: iOS
3. Name: "Volvix POS"
4. Bundle ID: `com.volvix.pos`
5. SKU: `volvix-pos-2026`

### 5.2 TestFlight (recomendado antes de producción)
1. **TestFlight** tab → seleccionar build subido (aparece en 5-30 min después de upload)
2. **Test Information**:
   - Beta App Review Information (email contacto)
   - Demo account (usuario/password si requiere login)
3. **Internal Testing** → agregar testers (hasta 100, sin review Apple)
4. **External Testing** → agregar grupos (hasta 10,000, requiere review Apple ~24h)

### 5.3 Production submission
1. **App Store** tab → "+" New Version → 1.0.0
2. Llenar:
   - **Description** (4000 chars max)
   - **Keywords** (100 chars, comma-separated)
   - **Screenshots**: 6.5" (iPhone 14 Pro Max), 5.5" (iPhone 8 Plus) — mínimo 1 por device
   - **App Preview** (video opcional, max 30s)
   - **Support URL**, **Marketing URL**
   - **Privacy Policy URL** → `/aviso-privacidad.html`
3. **Build** → seleccionar build de TestFlight
4. **App Review Information**:
   - Demo account (CRÍTICO si requiere login)
   - Notes para reviewer
5. **Submit for Review** → revisión Apple **1-3 días** (a veces hasta 7)

---

## 6. Push Notifications (opcional)

### 6.1 APNs key
1. Apple Developer → Keys → "+" → APNs
2. Descargar `.p8` → guardar (NO se puede re-descargar)
3. Anotar Key ID y Team ID

### 6.2 Configurar en backend
- Si usás Firebase Cloud Messaging para iOS, subir `.p8` a Firebase Console → Project Settings → Cloud Messaging
- Si usás backend propio: usar key con paquetes como `node-apn` o `apns2`

---

## 7. Troubleshooting

| Error | Solución |
|---|---|
| `No matching provisioning profiles found` | Re-descargar profile desde developer.apple.com, doble click |
| `Code signing is required for product type 'Application'` | Verificar Team y Provisioning en Signing & Capabilities |
| `Invalid Swift Support` | Borrar `DerivedData`: `rm -rf ~/Library/Developer/Xcode/DerivedData` |
| TestFlight build "Processing" stuck >2h | Email Apple Developer Support, suele resolverse solo |
| App Review reject: "Guideline 5.1.1 Privacy" | Agregar privacy policy URL Y data collection statement |
| Capacitor plugin no funciona | `pod deintegrate && pod install` en `ios/App/` |

---

## 8. Checklist final pre-release

- [ ] Bundle Version (build) incrementado
- [ ] Version Number (marketing) actualizado
- [ ] Probado en TestFlight con al menos 5 usuarios
- [ ] Screenshots actualizados para todos los device sizes
- [ ] Privacy policy URL y Data collection form llenos
- [ ] App Review demo account funciona
- [ ] Push notifications testeadas (si aplica)
- [ ] No NSLog/console.log en producción

---

## 9. Costos resumidos

| Concepto | Costo |
|---|---|
| Apple Developer Program | $99 USD/año |
| Mac (si no tenés) | $1,200+ USD |
| Xcode | Gratis |
| App Store Connect | Gratis (incluido) |
| Apple Search Ads (opcional marketing) | Variable |

**Mínimo viable**: $99 USD/año + acceso a un Mac.

---

**Owner approx tiempo total**: 60 min (primera vez setup) + 15 min (cada build) + 1-3 días review Apple.
