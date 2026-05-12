# Extracción `#permisos` → `paneldecontrol.html`

**Fecha**: 2026-05-12
**Motivo**: usuario reportó "Error por contenido dañado" en `https://systeminternational.app/salvadorex-pos.html#permisos`.
**Causa raíz**: archivo de 24,646 líneas / ~1.5 MB con bloque #permisos de 5,300 líneas inline (HTML+CSS+JS). El navegador truena al renderizar.

---

## Lo que se hizo (esta sesión)

| Antes | Después |
|---|---|
| `salvadorex-pos.html` = **24,646 líneas** / 1.5 MB | `salvadorex-pos.html` = **19,339 líneas** / 1.05 MB (-21.5% / -30% bytes) |
| `#permisos` renderiza dentro del POS (truena) | `#permisos` redirige a `/paneldecontrol.html` |
| — | `paneldecontrol.html` = **8,079 líneas** / 398 KB (nuevo) |

**Backup conservado**: `public/salvadorex-pos.html.bak-pre-paneldecontrol-extract`

### Bloques cortados

| Bloque | Rango original | Tipo | Líneas |
|---|---|---|---|
| `<section id="screen-permisos">` | 4486-4846 | HTML | 361 |
| CSS scoped `.permv14-*` | 19468-20300 | CSS | 833 |
| `window.PERM` IIFE legacy | 20302-21380 | JS | 1078 |
| `permv14-wiring` monkey-patch | 21382-24240 | JS | 2858 |
| Version-control hook (depende de `.permv14-sidebar`) | 24242-24445 | JS | 203 |
| **Total** | | | **5,333** |

### Cómo funciona el redirect

En `salvadorex-pos.html` se insertó un mini-script (23 líneas) que:
1. Al cargar la página, lee `location.hash`
2. Si es `#permisos` → `location.replace('/paneldecontrol.html')`
3. Listener en `hashchange` para casos donde el usuario navega después
4. Usa `replace()` (no `assign()`) para no contaminar el history

`paneldecontrol.html` es standalone:
- Head idéntico al POS (auth-gate, theme-wiring, button-flags, fonts)
- Stubs mínimos para `showToast`, `showScreen`, `toast` (los originales viven en el body del POS)
- Sección `#screen-permisos` **sin** clase `hidden`
- CSS scoped `.permv14-*` (no contamina nada porque sólo existe esta pantalla)
- 3 scripts de PERM intactos (legacy + wiring + version-hook)
- Init: fuerza `location.hash = '#permisos'` y llama `window.PERM.init()`

### Validación

| Test | Resultado |
|---|---|
| HTTP 200 en ambas páginas | ✅ |
| Tag balance (sections/scripts/styles/divs) | ✅ |
| Sintaxis JS inline (35 scripts paneldecontrol + 23 scripts salvadorex) | ✅ 0 errores |
| Auth-gate redirige sin sesión | ✅ |
| `salvadorex-pos.html#permisos` → `paneldecontrol.html` | ✅ navegación trazada |
| `salvadorex-pos.html` (sin hash) carga POS normal | ✅ `#screen-pos` presente, `#screen-permisos` ausente |
| Errores de consola no-404 en POS principal | ✅ **0** |

---

## Próximos candidatos para extraer (roadmap)

El POS sigue con 19,339 líneas. Los próximos bloques pesados son **scripts inline** que se pueden mover a archivos `.js` externos. Cada uno es un IIFE autocontenido con `'use strict'`, así que la extracción es mecánica: cortar el contenido del `<script>` → `public/<nombre>.js` y reemplazar por `<script src="/<nombre>.js" defer></script>`.

### Tier 1 — alto impacto, riesgo bajo (IIFEs aislados)

| Bloque | Líneas (actual) | Archivo sugerido | Riesgo |
|---|---|---|---|
| `consolidatedScreens` (fila / ingredientes / menu-digital / marketing / plan) | ~550 (líneas 13230-13780) | `volvix-screens-consolidated.js` | Bajo |
| Inventario IIFE (gestión de productos `allProducts`) | ~546 (líneas 12680-13225) | `volvix-inventario.js` | Bajo |
| R8c — Sale search + late invoice + reprint + CFDI cancel/refacturar | ~304 (líneas 10650-10955) | `volvix-r8c-sales.js` | Bajo |
| ElevenLabs voice commands | ~258 (líneas 12135-12395) | `volvix-voice-commands.js` | Bajo |
| FIX-N5: verificación pagos transferencia / app-pago | ~205 (líneas 11035-11240) | `volvix-payment-verify.js` | Bajo |
| Tours, PIN lock, Printer config UI helpers | ~194 (líneas 13815-14010) | `volvix-tours-pin-printer.js` | Bajo |
| **Subtotal Tier 1** | **~2,057** | | |

### Tier 2 — alto impacto, riesgo medio (afectan bootstrap)

| Bloque | Líneas (actual) | Archivo sugerido | Riesgo |
|---|---|---|---|
| `impersonation-bootstrap` (superadmin → otro tenant) | ~431 (líneas 2679-3109) | `volvix-impersonation.js` | Medio (corre antes de DOMContentLoaded) |
| Wiring de módulos placeholder → funcionales | ~376 (líneas 11248-11624) | `volvix-modules-wiring.js` | Medio (depende de DOM listo) |
| First-login wizard redirect | ~158 (líneas 2484-2641) | `volvix-first-login.js` | Medio (corre temprano) |
| **Subtotal Tier 2** | **~965** | | |

### Tier 3 — investigar primero

| Bloque | Líneas | Notas |
|---|---|---|
| Date/time utils (`pad2`) | ~187 (líneas 11940-12127) | Verificar si comparte estado con otros bloques |
| Vista control (`data-vista`) | ~184 (líneas 11667-11851) | Verificar si toca `body[data-vista]` global |

### Estimación total si se ejecuta el roadmap

- Hoy: **24,646 → 19,339** (-21.5%) ✅
- + Tier 1: **19,339 → ~17,280** (-30% acumulado)
- + Tier 2: **17,280 → ~16,315** (-34% acumulado)
- + Tier 3: **16,315 → ~15,950** (-35% acumulado)

A esa altura el archivo principal pesaría ~870 KB vs los 1.5 MB de origen.

---

## Notas de implementación si se ejecuta el roadmap

1. **Cada extracción es un commit separado** — facilita revertir si rompe algo.
2. **Probar con un usuario real autenticado** (no solo headless con mock) — el flujo real toca Supabase y auth-gate.
3. **Mantener el orden de `<script>` en el HTML** — algunos dependen de variables globales definidas por scripts anteriores.
4. **Agregar `defer`** en los `<script src="...">` para que no bloqueen el render.
5. **No tocar `volvix-uplift-wiring.js`, `auth-gate.js`, `volvix-feature-flags.js`** — son carga crítica al inicio.

---

## Comandos útiles para verificar

```bash
# Tamaño actual
wc -l public/salvadorex-pos.html public/paneldecontrol.html

# Tag balance
node -e "const h=require('fs').readFileSync('public/salvadorex-pos.html','utf8'); const c=(r)=>(h.match(r)||[]).length; console.log('sections:',c(/<section\b/g),'/',c(/<\/section>/g))"

# Sintaxis JS inline
# (ver verify-pages.cjs en el commit de hoy si se quiere replicar)
```
