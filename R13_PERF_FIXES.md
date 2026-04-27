# R13 — Performance Fixes (Volvix POS)

Fecha: 2026-04-26
Contexto: deploy Vercel sin build step (HTML/JS/CSS planos).

---

## Resumen ejecutivo

| Cambio aplicado | Archivo | KB ahorrados (estim.) | Requiere build-step |
|---|---|---|---|
| Excluir `files (2).zip` y `files (3).zip` del deploy | `.vercelignore` | ~205 KB en bundle Vercel | NO |
| Crear CSS base compartido | `volvix-shared.css` (nuevo) | ~3-5 KB por HTML si se aplica (×3 = 9-15 KB) | NO |
| Expandir `STATIC_FILES` del Service Worker (12 → 55) | `sw.js` | 0 KB de transfer; mejora drastica de offline / 2da carga | NO |
| Versionado SW por hash (TODO comment dejado) | `sw.js` | n/a (correctitud de cache busting) | SI |
| Reporte de scripts sin defer (no aplicado) | 3 HTMLs | ~200-400 ms TTI estimado por panel | NO (al aplicar) |

---

## 1. Zips pesados excluidos del deploy

Verificacion en raiz:
- `files (2).zip` — 27 KB — EXISTE
- `files (3).zip` — 178 KB — EXISTE
- `files.zip` — NO existe (ya estaba en `.vercelignore` pero el archivo no esta)

Accion: agregadas las 2 lineas a `.vercelignore`. Archivos NO borrados fisicamente (per instruccion).

Ahorro: ~205 KB que ya no se suben a Vercel ni cuentan en el limite del proyecto.

---

## 2. CSS comun extraido

### Bloques `<style>` por archivo

| HTML | Lineas `<style>` | Tamaño aprox. inline CSS |
|---|---|---|
| `salvadorex_web_v25.html` | 12 → 1275 | ~50 KB |
| `volvix_owner_panel_v7.html` | 14 → 589 | ~22 KB |
| `multipos_suite_v3.html` | 10 → 434 | ~15 KB |

### Realidad: los 3 NO comparten su design system

Cada HTML tiene su propia paleta `:root`, su propio sistema de `.btn`, `.card`, `.chip`, `.topbar`, etc. con valores y nombres parecidos pero NO identicos:

- salvadorex usa Geist + paleta calida (`--c-a`, `--g50..g900`), layout mobile-first device-frame.
- volvix_owner usa Inter + paleta Eleventa (`--eleventa-blue`), tokens `--r`, `--r-lg`.
- multipos usa Inter + paleta neutral (sin tokens de radius), layout sidebar dashboard.

Mover `.btn` o `.card` a CSS compartido provocaria regresiones visuales — sus valores difieren.

### Lo que SI es comun (movido a `volvix-shared.css`)

- Reset universal: `*{box-sizing}`, `html,body{margin:0}`, `button{cursor:pointer}`.
- Utilidades: `.hidden`, `.mono`.
- Animaciones: `@keyframes fadeIn`, `slideIn`, `pop`, `pulse`, `spinSlow`.
- Hide-scrollbar helper.

Tamaño del shared: ~1.2 KB. Ahorro estimado por HTML al adoptarlo: ~3-5 KB (las animaciones y el reset duplicado).

### Bloques que MOVERIA (cuando se autorice tocar HTMLs)

| Bloque | Donde duplica | KB estimados que migran |
|---|---|---|
| Reset `*{}`, `html/body`, `button` | los 3 | ~0.5 KB × 3 = 1.5 KB |
| `@keyframes fadeIn / slideIn / pulse / pop / spinSlow` | salvadorex (todos), owner/multipos (parciales) | ~0.8 KB × 3 = 2.4 KB |
| `.hidden`, `.mono` | los 3 | ~0.2 KB × 3 = 0.6 KB |
| Scrollbar-hide patterns | los 3 | ~0.3 KB × 3 = 0.9 KB |

Total potencial al adoptar shared en los 3 HTMLs: **~5-6 KB inline → 1 archivo cacheable**.

NOTA: NO se modificaron los HTMLs en esta iteracion (per instruccion). El CSS shared queda creado y precacheado por SW listo para inclusion futura via `<link rel="stylesheet" href="/volvix-shared.css">`.

---

## 3. Service Worker — precache expandido + version hash TODO

### Antes
- `STATIC_FILES` = 12 entradas.
- `VERSION` = `'v1.0.0'` (manual).

### Despues (`sw.js`)
- `STATIC_FILES` = 55 entradas — todos los wirings criticos referenciados por los 3 paneles + offline queue + pwa prompt.
- `VERSION` bumpeada a `'v1.1.0'` (cambio justificado por nueva lista).
- Comentario `TODO(build-step)` dejado: cuando se agregue esbuild/vite, sustituir manualmente por `__BUILD_HASH__` en build.

### Por que esto importa
- 1ra carga del HTML dispara `install` → cachea 55 archivos en paralelo (`cache.add` tolerante a fallos ya implementado).
- 2da carga: TODO el JS critico sirve desde Cache Storage = ~0 RTT, lista para offline.
- Sin build step necesario hoy. El TODO marca el punto exacto donde un futuro pipeline de build inyectaria el hash.

### Requiere build-step?
- Lista expandida: **NO**.
- Hash automatico de version: **SI** (queda como TODO comentado, no bloquea).

---

## 4. Scripts sin `defer` / `async` (REPORTE — no modificado)

Solo se reportan. NO se aplica defer en esta iteracion.

### `salvadorex_web_v25.html`

| Linea | Script | Tiene defer? | Recomendacion |
|---|---|---|---|
| 8 | `/auth-gate.js` | NO | **MANTENER sync** — auth gate debe correr antes que nada |
| 1276 | `volvix-api.js` | NO | Agregar `defer` (no toca DOM-paint) |
| 1277 | `volvix-sync.js` | NO | Agregar `defer` |
| 1278 | `volvix-sync-widget.js` | NO | Agregar `defer` |
| 2228 | `<script>` inline | n/a | Mover a archivo externo + `defer` (opcional) |
| 1279-3275 | resto wirings | SI ya tiene `defer` | OK |

### `volvix_owner_panel_v7.html`

| Linea | Script | Tiene defer? | Recomendacion |
|---|---|---|---|
| 7 | `/auth-gate.js` | NO | **MANTENER sync** |
| 8 | Chart.js CDN | NO | Agregar `defer` (graficos no son above-the-fold) |
| 12 | `giros_catalog.js` | NO | Agregar `defer` |
| 13 | `giros_catalog_v2.js` | NO | Agregar `defer` |
| 590 | `volvix-api.js` | NO | Agregar `defer` |
| 591 | `volvix-sync.js` | NO | Agregar `defer` |
| 592 | `volvix-sync-widget.js` | NO | Agregar `defer` |
| 2385 | `<script>` inline | n/a | Opcional externalizar |
| 4009-4028 | wirings | SI | OK |

### `multipos_suite_v3.html`

| Linea | Script | Tiene defer? | Recomendacion |
|---|---|---|---|
| 435 | `volvix-api.js` | NO | Agregar `defer` |
| 436 | `volvix-sync.js` | NO | Agregar `defer` |
| 437 | `volvix-sync-widget.js` | NO | Agregar `defer` |
| 1401 | `<script>` inline | n/a | Opcional externalizar |
| 1891-1914 | wirings | SI | OK |

### Impacto estimado al aplicar `defer` a los ~10 scripts no-auth
- **TTI (Time-to-Interactive)**: -200 a -400 ms por panel (depende de red).
- **FCP**: sin cambio significativo (siguen siendo `<script src>` en `<head>`).
- **Riesgo**: bajo si los scripts no se autoejecutan asumiendo DOM ya parseado. Requiere smoke test.

---

## Estado de tareas

- [x] 1. Zips agregados a `.vercelignore` (sin borrar fisicamente).
- [x] 2. `volvix-shared.css` creado con base comun. HTMLs no tocados.
- [x] 3. SW: `STATIC_FILES` 12 → 55, TODO de hash agregado, VERSION bumpeada.
- [x] 4. Reporte de scripts sin defer (sin aplicar cambios).

Sin build step requerido para nada de lo aplicado en esta iteracion. El unico item con build-step es el hash automatico de SW (TODO en codigo).
