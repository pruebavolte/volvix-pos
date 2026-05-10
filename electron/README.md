# Electron Wrapper

Volvix POS distribuído como `.exe` (Windows), `.dmg` (macOS) y `.AppImage` (Linux).

## Filosofía: cero código duplicado

El wrapper Electron carga `https://volvix-pos.vercel.app/salvadorex-pos.html` —
la **misma web** que ven los usuarios en el navegador. Misma terminología, mismos
módulos, mismo backend, mismo control central data-driven.

| Canal | Carga |
|-------|-------|
| Web | volvix-pos.vercel.app |
| PWA | volvix-pos.vercel.app + manifest |
| Electron .exe / .dmg | volvix-pos.vercel.app (vía Electron BrowserWindow) |
| Capacitor APK | salvadorexoficial.com (vía WebView Android) |

Todos hablan al mismo `/api/*` en Vercel + Supabase.

## Build

```bash
npm run electron:build:win    # .exe Windows
npm run electron:build:mac    # .dmg macOS
npm run electron:build:linux  # .AppImage Linux
npm run electron:build:all    # los 3
```

Output en `dist-electron/`.

## Dev local

```bash
npm run electron:dev
```

Abre Electron apuntando a `http://127.0.0.1:8765/salvadorex-pos.html` (servidor local Python).
Para apuntar a otro URL: `VOLVIX_DEV_URL=https://staging.volvix.com npm run electron:dev`.

## Iconos

Pendiente: agregar `icons/icon.ico` (Win, 256x256), `icons/icon.icns` (Mac), `icons/icon.png` (Linux).
Mientras tanto Electron usa icono default.

## Menu

Mínimo: Recargar (Ctrl+R), Forzar actualización (limpia cache + reload), Salir (Ctrl+Q).
El "Forzar actualización" es el equivalente al botón "🔄 Actualizar" del banner offline web.
