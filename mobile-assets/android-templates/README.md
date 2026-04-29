# Android templates  Volvix POS

Estos archivos son TEMPLATES que debes copiar/mergear despues de
`npx cap add android` (paso que crea `android/app/...`).

## Archivos

| Template                      | Destino real                                                       |
|-------------------------------|--------------------------------------------------------------------|
| `AndroidManifest.xml`         | `android/app/src/main/AndroidManifest.xml` (mergear permisos)      |
| `network_security_config.xml` | `android/app/src/main/res/xml/network_security_config.xml`         |

## Workflow

1. `node mobile-build.js install`
2. `node mobile-build.js init`   # crea android/ real, los placeholders desaparecen
3. Copia `network_security_config.xml` a `android/app/src/main/res/xml/`
4. Abre `android/app/src/main/AndroidManifest.xml` que genero Capacitor
   y agrega los `<uses-permission>` y `android:networkSecurityConfig`
   tomandolos del template aqui (los nodos `<application>` y `<activity>`
   los respeta Capacitor; solo agregas permisos y attrs de seguridad).
5. `node mobile-build.js sync`
6. `node mobile-build.js android-debug`

## Por que no se aplica automaticamente

Capacitor regenera AndroidManifest.xml en algunos casos. Mantener los
templates aqui (fuera de `android/`) evita que `cap sync` los pise.
Considera usar `cordova-plugin-android-permissions` o un script post-sync
si quieres automatizar el merge.
