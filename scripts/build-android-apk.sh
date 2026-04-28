#!/bin/bash
# Build Volvix POS APK
# Requiere: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS env vars
#
# Uso:
#   export ANDROID_KEYSTORE_PATH=/ruta/a/volvix.keystore
#   export ANDROID_KEYSTORE_PASSWORD=mi_password_seguro
#   export ANDROID_KEY_ALIAS=volvix
#   bash scripts/build-android-apk.sh
#
# Tiempo estimado: 10 minutos (dependiendo de Gradle cache).

set -e

# ─────────────────────────────────────────
# Validación de variables de entorno
# ─────────────────────────────────────────
if [ -z "$ANDROID_KEYSTORE_PATH" ]; then
  echo "❌ ANDROID_KEYSTORE_PATH no set. Generar keystore:"
  echo "   keytool -genkey -v -keystore volvix.keystore -alias volvix -keyalg RSA -keysize 2048 -validity 10000"
  echo ""
  echo "Ver docs/mobile/android-keystore-setup.md para instrucciones completas."
  exit 1
fi

if [ -z "$ANDROID_KEYSTORE_PASSWORD" ]; then
  echo "❌ ANDROID_KEYSTORE_PASSWORD no set."
  exit 1
fi

if [ -z "$ANDROID_KEY_ALIAS" ]; then
  echo "❌ ANDROID_KEY_ALIAS no set (sugerido: 'volvix')."
  exit 1
fi

if [ ! -f "$ANDROID_KEYSTORE_PATH" ]; then
  echo "❌ Keystore no encontrado en: $ANDROID_KEYSTORE_PATH"
  exit 1
fi

# ─────────────────────────────────────────
# Verificar capacitor.config.json
# ─────────────────────────────────────────
if [ ! -f "capacitor.config.json" ]; then
  echo "❌ capacitor.config.json no encontrado. Ejecuta desde raíz del proyecto."
  exit 1
fi

echo "✅ Pre-checks OK"
echo "   Keystore: $ANDROID_KEYSTORE_PATH"
echo "   Alias:    $ANDROID_KEY_ALIAS"
echo ""

# ─────────────────────────────────────────
# Sync Capacitor (copia webDir → android/)
# ─────────────────────────────────────────
echo "🔄 Sincronizando Capacitor..."
if command -v npx >/dev/null 2>&1; then
  npx cap sync android || {
    echo "⚠️  cap sync falló — continuando con build directo de gradle"
  }
fi

# ─────────────────────────────────────────
# Build APK release con gradle
# ─────────────────────────────────────────
echo "🔨 Compilando APK release..."
cd android

# Pasar credenciales del keystore vía propiedades de gradle
./gradlew assembleRelease \
  -PVOLVIX_KEYSTORE_PATH="$ANDROID_KEYSTORE_PATH" \
  -PVOLVIX_KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD" \
  -PVOLVIX_KEY_ALIAS="$ANDROID_KEY_ALIAS" \
  -PVOLVIX_KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}"

cd ..

# ─────────────────────────────────────────
# Resultado
# ─────────────────────────────────────────
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ -f "$APK_PATH" ]; then
  SIZE=$(du -h "$APK_PATH" | cut -f1)
  echo ""
  echo "✅ APK generado: $APK_PATH ($SIZE)"
  echo ""
  echo "Próximos pasos:"
  echo "  1. Verificar firma: jarsigner -verify -verbose -certs $APK_PATH"
  echo "  2. Distribuir:"
  echo "     - Subir a Play Store (recomendado)"
  echo "     - Copiar a /downloads/volvix-pos-android-vXXX.apk para descarga directa"
  echo "  3. Probar en dispositivo: adb install -r $APK_PATH"
else
  echo "❌ APK NO encontrado en $APK_PATH"
  echo "   Revisa los logs de gradle arriba."
  exit 1
fi
