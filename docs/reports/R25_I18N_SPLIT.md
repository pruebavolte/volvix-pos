# R25 — Code-split i18n por idioma

## Resumen
Se dividió `volvix-i18n-wiring.js` en 7 archivos JSON (uno por idioma). El bundle ahora carga sólo `es` (eager) y los otros 6 vía `fetch` bajo demanda, con caché en `localStorage`.

## Tamaños antes / después

| Archivo | Antes | Después |
|---|---|---|
| `volvix-i18n-wiring.js` | 61,405 B (1710 líneas) | 23,102 B (574 líneas) |
| **Total cargado en primer paint** | **61,405 B** | **23,102 B** (-62%) |

### Archivos JSON generados (`i18n/`)

| Idioma | Keys | Bytes |
|---|---|---|
| es.json | 187 | 5,984 |
| en.json | 187 | 5,689 |
| pt.json | 187 | 5,928 |
| fr.json | 187 | 6,057 |
| de.json | 187 | 6,013 |
| it.json | 187 | 5,922 |
| ja.json | 187 | 6,247 |

**Total keys**: 1,309 (187 × 7) — sin pérdidas. (El reporte mencionaba ~7×187; el conteo previo de 1,309 cuadra.)

## Plan de carga
- **Eager (siempre)**: `es` embebido en `volvix-i18n-wiring.js` (FALLBACK + idioma por defecto).
- **Lazy (on-demand)**: `en`, `pt`, `fr`, `de`, `it`, `ja` se descargan vía `fetch('i18n/<code>.json', { cache: 'force-cache' })` la primera vez que se invoca `setLanguage(code)`, o en `init()` si el usuario tenía guardado un idioma distinto de `es`.
- **Caché**: tras la primera carga se guarda en `localStorage` bajo `volvix:i18n:cache:<lang>` con `{ v: 'v1', d: dict, t: timestamp }`. Las cargas posteriores son instantáneas (sin red).
- **De-dupe**: peticiones concurrentes para el mismo idioma comparten una sola Promise (`_loading[lang]`).
- **Resolución de URL**: `document.currentScript.src` → mismo directorio + `i18n/`. Funciona aunque el script se sirva desde CDN.

## Cambios de API
- `window.setLanguage(lang)` ahora es **async** y retorna `Promise<boolean>`. Backwards-compatible para callers que no esperaban el retorno (la promesa es ignorada sin error).
- Nueva función pública `Volvix.i18n.loadLanguage(lang)` para precarga manual.
- `Volvix.i18n.available()` usa `AVAILABLE_LANGS` constante (siempre los 7).

## Validación
- `node --check volvix-i18n-wiring.js` → **OK** (sin errores de sintaxis).
- Smoke test con DOM/fetch/localStorage stubeados:
  - `setLanguage('en')` → `true`, `t('login.title')` → `"Sign in"`, `t('nav.dashboard')` → `"Dashboard"`.
  - `setLanguage('ja')` → `true`, `t('login.title')` → `"ログイン"`.
  - `localStorage` contiene `volvix:i18n:cache:en` y `:ja` tras la carga.
  - `setLanguage('xx')` → `false` (rechazo de idioma no listado).
- Backup: `volvix-i18n-wiring.js.bak` (copia íntegra del original).

## Pendiente
NO desplegar. Espera confirmación del supervisor antes de subir a producción.
