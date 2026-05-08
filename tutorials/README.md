# Tutorials Pipeline

Genera videos tutoriales `.mp4` automatizados con Playwright + Edge TTS + ffmpeg.

## Setup

1. Copia `.env.tutorials.example` a `.env.tutorials` en la raíz del repo:
   ```
   STAGING_URL=http://127.0.0.1:3000
   STAGING_USER=tu@correo.com
   STAGING_PASS=tu_password
   ```

2. Asegúrate de tener `ffmpeg` instalado y en el PATH.

3. Asegúrate de tener Playwright Chromium:
   ```
   npx playwright install chromium
   ```

## Ejecutar

Genera el tutorial **paso-1** (cómo agregar un producto):

```bash
npm run tutorials:paso1
```

El video se guarda en `tutorials/output/paso-1-agregar-producto.mp4`.

## Estructura

```
tutorials/
  lib/
    types.ts            # tipos de TutorialStep, TutorialConfig
    cursor-overlay.ts   # overlay CSS+JS (cursor rojo, halos, captions)
    narrator.ts         # wrapper msedge-tts (TTS GRATIS, voz es-MX-Dalia)
    recorder.ts         # Playwright + login + steps
    composer.ts         # ffmpeg mux video.webm + audio.mp3 → MP4
  scripts/
    paso-1-agregar-producto.ts
  narration/.cache/     # MP3 generados (1 dir por hash de texto)
  output/               # MP4 finales (gitignored)
```

## Sobre la narración

- Voz: `es-MX-DaliaNeural` (femenina, mexicana, cálida)
- Velocidad: -10% (más lenta para tutoriales)
- **GRATIS — sin API key**: usa el TTS de Microsoft Edge vía `msedge-tts`.
- Cache: cada texto se cachea por SHA256 — si re-corres el script, no
  re-genera el audio (instant).

## Sobre la grabación

- Login vía API directo (`POST /api/login` → token → `localStorage`).
  No driving del form via UI (evita race conditions).
- Cursor rojo SVG visible en todo el video.
- Click pulse + ring rojo punteado alrededor del elemento.
- Zoom suave para acciones importantes (`zoom: true`).
- Captions sincronizados con la voz, palabra por palabra.
- Pantallas de transición (intro / cierre).

## Selectores

Los selectores son REALES, verificados contra el DOM de
`public/pos-inventario.html`:

| Acción | Selector |
|---|---|
| Botón Nuevo producto | `button.btn.primary[onclick*="openNuevo"]` |
| Input nombre | `#pNombre` |
| Input precio | `#pPrecio` |
| Input stock | `#pStock` |
| Select categoría | `#pCategoria` |
| Botón Guardar | `#btnGuardar` |

Si el módulo se modifica, actualiza el script. **NO inventes selectores.**

## Próximos pasos (no implementados aún)

- `paso-2-configurar-inventario.ts`
- `paso-3-primera-venta.ts`
- `paso-4-ver-reportes.ts`
- `build.ts` que corra los 4 en serie

## Troubleshooting

**`/api/login → 401`**: credenciales incorrectas en `.env.tutorials`.

**`recorder: selector NO encontrado`**: el módulo cambió de DOM. Inspecciona
el HTML actual y actualiza el selector en el script.

**MP4 sin audio**: ffmpeg no encontró las narraciones. Revisa que
`tutorials/narration/.cache/<HASH>/audio.mp3` exista. Si no, msedge-tts
falló (probablemente conexión a Microsoft Edge bloqueada).
