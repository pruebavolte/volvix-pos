# R20 — Final Migration Report

Fecha: 2026-04-26

## Resumen ejecutivo

Migración R20 de diálogos nativos (`prompt`/`confirm`/`alert`) hacia los modales custom de `volvix-modals.js`. Deploy a producción verificado: `volvix-modals.js` y `volvix-modals.css` responden 200.

## Tabla de avance

| Métrica   | Antes | Después | Reducción | % migrado |
|-----------|------:|--------:|----------:|----------:|
| prompt()  | 167   | 85      | 82        | 49.1%     |
| confirm() | 57    | 80      | -23       | -40.4%    |
| alert()   | 149   | 128     | 21        | 14.1%     |
| **Total** | 373   | 293     | 80        | 21.4%     |

Nota: El conteo de `confirm()` subió respecto al baseline. Causa probable: durante R20 otros agentes introdujeron nuevos `confirm(...)` en wirings recientes (`volvix-pos-extra-wiring.js`, `volvix-extras-wiring.js`) o el regex captura ahora ocurrencias en HTML antes ignoradas. Requiere auditoría diff antes de R21.

## Validación sintáctica (node --check)

- volvix-modals.js  ........................... OK
- volvix-pos-extra-wiring.js  ................. OK
- volvix-extras-wiring.js  .................... OK
- api/index.js  ............................... OK

## Deploy

- URL prod: https://salvadorexoficial.com
- Deploy IDs: `dpl_GaC7ninFYaQ41dQFExfu2Dw7urCT` (inicial) + redeploy con fix CSS
- Verificación curl:
  - `/volvix-modals.js`  → **200**
  - `/volvix-modals.css` → **200** (tras fix)

## Archivos creados

- `volvix-modals.js` — runtime de modales (`VolvixModals.alert/confirm/prompt`)
- `volvix-modals.css` — estilos del overlay/modal
- `R20_FINAL_MIGRATION.md` — este reporte

## Archivos modificados

- `vercel.json` — añadido `**/*.css` a `builds[0].config.includeFiles` (sin esto el CSS daba 404 en prod)
- `volvix-pos-extra-wiring.js`, `volvix-extras-wiring.js`, `api/index.js` — wirings revisados (sintaxis OK)
- Múltiples HTML/JS migrados parcialmente a `VolvixModals.*`

## Próximos pasos (R21)

1. **Auditar el alza de `confirm()`**: diff git de las últimas 6h sobre `*.js`/`*.html` para identificar regresiones e idealmente revertir/migrar.
2. **Migrar el remanente**:
   - 85 `prompt()` restantes — concentrados en wirings de verticales (`volvix-vertical-*.js`).
   - 80 `confirm()` — priorizar flows críticos (pagos, eliminación, cierre de día).
   - 128 `alert()` — barrido masivo con codemod.
3. **Codemod automatizado**: script jscodeshift que reemplace patrones `alert(x)` → `await VolvixModals.alert(x)` con marcado de funciones como `async`.
4. **CSP**: confirmar que `style-src 'self' 'unsafe-inline'` cubre el CSS modal en prod.
5. **Smoke test E2E** (Playwright) sobre los 3 flows más usados para verificar que los modales abren/cierran/devuelven valor.

## Estado

R20 cerrado parcialmente. Migración avanzada (~21% global) y plataforma de modales en producción y servida correctamente. Quedan 293 ocurrencias para R21.
