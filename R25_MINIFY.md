# R25 — JS Minification Report

**Fecha:** 2026-04-27
**Carpeta:** `C:\Users\DELL\Downloads\verion 340\`
**Herramienta:** minificador regex propio en Node (`_minify.js`) — terser no estaba instalado y `npx terser` requería descarga. El minificador strip comentarios (`//` y `/* */`) y colapsa whitespace, preservando strings (`"`, `'`, `` ` ``) y regex literales.

## Top 5 JS más pesados (antes)

| # | Archivo | Tamaño |
|---|---------|--------|
| 1 | volvix-i18n-wiring.js | 60K |
| 2 | volvix-extras-wiring.js | 60K |
| 3 | volvix-multipos-extra-wiring.js | 48K |
| 4 | volvix-pos-extra-wiring.js | 44K |
| 5 | volvix-modals.js | 44K |

## Resultados de minificación (top 3)

| Archivo | Antes | Después | Ahorro | % |
|---------|------:|--------:|-------:|--:|
| volvix-i18n-wiring.js → .min.js | 61 405 B (60.0 KB) | 45 237 B (44.2 KB) | 16 168 B (15.8 KB) | **26.3 %** |
| volvix-extras-wiring.js → .min.js | 58 416 B (57.0 KB) | 42 632 B (41.6 KB) | 15 784 B (15.4 KB) | **27.0 %** |
| volvix-multipos-extra-wiring.js → .min.js | 46 777 B (45.7 KB) | 35 921 B (35.1 KB) | 10 856 B (10.6 KB) | **23.2 %** |
| **TOTAL** | **166 598 B (162.7 KB)** | **123 790 B (120.9 KB)** | **42 808 B (41.8 KB)** | **25.7 %** |

## Validación

- `node --check` pasa en los 3 `.min.js` → sintaxis válida.
- Originales **NO modificados**.
- Los `.min.js` **no están enlazados** en ningún HTML; el swap es manual.

## Notas

- Ahorro modesto (~26%) porque es solo strip-comments + whitespace. Un terser real (con mangling de variables locales) llegaría a ~50-60%. Si se quiere, instalar terser: `npm i -g terser` y re-correr.
- No se aplicó mangling para mantener nombres de variables globales (`window.*`) intactos y evitar romper el wiring entre archivos.
- Archivos generados en la misma carpeta:
  - `volvix-i18n-wiring.min.js`
  - `volvix-extras-wiring.min.js`
  - `volvix-multipos-extra-wiring.min.js`
  - `_minify.js` (script reutilizable)

## Próximo paso sugerido

Para activar en producción: en cada HTML, sustituir `<script src="volvix-X-wiring.js">` por `<script src="volvix-X-wiring.min.js">` uno a uno y probar. NO hacer todos a la vez.
