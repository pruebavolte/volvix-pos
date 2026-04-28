Volvix POS · Electron icons
============================

Coloca aqui los iconos definitivos antes de buildear el .exe / .dmg / AppImage:

  - icon.png   (256x256 minimo, 512x512 recomendado, RGBA con transparencia)
  - icon.ico   (Windows installer)  — convertir desde icon.png
  - icon.icns  (Mac .dmg)            — convertir desde icon.png

Herramientas recomendadas:
  - https://cloudconvert.com/png-to-ico
  - https://cloudconvert.com/png-to-icns
  - electron-icon-builder (npm)

Mientras no existan, electron-builder usara su icono por defecto y emitira un warning,
pero el build sigue funcionando para pruebas internas.
