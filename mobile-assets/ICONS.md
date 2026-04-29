# Volvix POS — App icons + splash screen

Volvix POS necesita assets graficos para el wrapper Capacitor:

- **App icon**  mostrado en launcher Android/iOS
- **Adaptive icon**  Android 8.0+ (foreground + background separados)
- **Splash screen**  pantalla de carga 2 segundos

Esta guia documenta los requisitos. Si no tienes las fuentes SVG de marca,
usa los placeholders en `public/icon-192.png` y `public/icon-512.png`
hasta tener arte definitivo.

---

## 1. Fuente vectorial (lo ideal)

Diseno base **1024x1024 SVG** con:

- Marca Volvix centrada (logo o monograma "V")
- Fondo solido azul Volvix `#2D5F8F`
- Acento naranja `#EA580C` (tag, dot, accent)
- Margen interno 10% para safe area de iconos circulares Android
- Padding 25% extra para adaptive icon Android (foreground se recorta)

Guarda como `mobile-assets/icon-source.svg` y `mobile-assets/splash-source.svg`.

---

## 2. Splash screen base

`mobile-assets/splash-source.svg`:

- 2732x2732 px (cubre todos los devices)
- Fondo `#0A0A0A` (negro Volvix, coincide con `manifest.json` y capacitor.config)
- Logo centrado al 30% del ancho
- Sin texto (riesgos de truncado por device)
- Duracion configurada: 2000ms (capacitor.config.json -> SplashScreen.launchShowDuration)

---

## 3. Generacion automatica con `@capacitor/assets`

Una vez tengas las fuentes SVG en `mobile-assets/`:

```bash
npm install --save-dev @capacitor/assets
npx capacitor-assets generate \
  --iconBackgroundColor "#0A0A0A" \
  --iconBackgroundColorDark "#0A0A0A" \
  --splashBackgroundColor "#0A0A0A" \
  --splashBackgroundColorDark "#0A0A0A"
```

Esto produce automaticamente:

**Android** (`android/app/src/main/res/`)

- `mipmap-mdpi/ic_launcher.png` (48x48)
- `mipmap-hdpi/ic_launcher.png` (72x72)
- `mipmap-xhdpi/ic_launcher.png` (96x96)
- `mipmap-xxhdpi/ic_launcher.png` (144x144)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192)
- `mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon)
- `drawable/splash.png` (multiple densities)

**iOS** (`ios/App/App/Assets.xcassets/`)

- `AppIcon.appiconset/*.png` (todas las resoluciones requeridas)
- `Splash.imageset/*.png`

Luego corre `npx cap sync` para que los cambios lleguen al wrapper.

---

## 4. Generacion manual (sin SVG)

Si solo tienes PNG 1024x1024:

```bash
# Android adaptive icon
mkdir -p android/app/src/main/res/mipmap-anydpi-v26
# Foreground
convert icon-1024.png -resize 432x432 \
  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
# Background (solido)
convert -size 432x432 xc:'#0A0A0A' \
  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png
```

Y para splash:

```bash
convert -size 2732x2732 xc:'#0A0A0A' \
  -gravity center \
  -draw "image over 0,0 0,0 'icon-1024.png'" \
  android/app/src/main/res/drawable/splash.png
```

(requiere ImageMagick instalado)

---

## 5. PWA icons (compartidos con web)

Los iconos PWA viven en `public/icon-192.png` y `public/icon-512.png`.
Actualizar manifest.json es opcional, ya esta apuntando a ellos.

Tambien recomendado:

- `public/icon-180.png`  apple-touch-icon (iOS Safari home screen)
- `public/icon-32.png`   favicon
- `public/icon-16.png`   favicon

---

## 6. Verificacion visual

Tras `cap sync`:

```bash
# Android: emulador o device fisico
node mobile-build.js android-debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.volvix.pos/.MainActivity
```

Confirma que:

- [ ] Icono aparece en launcher con la marca correcta
- [ ] Splash es negro `#0A0A0A` con logo centrado
- [ ] Splash desaparece a los ~2 segundos
- [ ] No hay franja blanca/parpadeo entre splash y webview
