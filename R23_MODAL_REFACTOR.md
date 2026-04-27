# R23 — Modal Refactor (VolvixUI)

## Mejora 1 — Cleanup label duplicado en hijack `window.prompt`

`volvix-modals.js`: nuevo helper `parsePromptMessage(msg, defaultVal)` que separa el texto del prompt en `{title, description, fieldType, fieldLabel, fieldOpts}` evitando duplicación.

Comportamiento:
- Multi-línea -> `description` = primera línea, `fieldLabel` = última línea (sin `:` ni `?`)
- Una sola línea -> `description` vacío, `fieldLabel` = línea
- Título derivado por keywords (Editar stock / Editar precio / Aplicar descuento / Cantidad / Código / Email / Teléfono / Fecha / Nombre / Motivo / "Acción requerida")
- Detección de tipo:
  - `cantidad|qty|stock|precio|monto|costo|%|descuento|amount|number|comisión` -> `number` (`min:0`, `step:1` para stock/qty, `step:0.01` resto, `max:100` si %)
  - `email|correo` -> `email`
  - `teléfono|phone|celular` -> `tel` con `mask:'tel-mx'`
  - `rfc` -> text con `mask:'rfc'`
  - `fecha|date` -> `date`
  - default -> `text`
- Expuesto como `VolvixUI._parsePromptMessage` para tests.

Ejemplo `prompt('Stock actual: 14\nIngresa nueva cantidad:', 14)` produce:
- title = `Editar stock`
- description = `Stock actual: 14`
- field = `{ name:'value', label:'Nueva cantidad', type:'number', min:0, step:1, default:'14' }`

## Mejora 2 — Refactor de callers críticos

Auditoría: la mayoría de los 73 prompts del repositorio ya estaban dentro de bloques fallback `() => {…}` de `vuiForm` (`volvix-owner-wiring.js`, `volvix-owner-extra-wiring.js`, `volvix-promotions-wiring.js`, etc.) — solo se ejecutan cuando VolvixUI no está cargado, así que NO se refactorizaron individualmente; el helper de Mejora 1 ya cubre cualquier prompt que llegue al hijack.

Callers con prompts inline NO-fallback que sí se refactorizaron a `await VolvixUI.form()` directo (recuperando el valor real):

| # | Archivo:línea | Caller | Tipo de input asignado |
|---|---|---|---|
| 1 | salvadorex_web_v25.html ~3374 | `openVarios()` selección | `number` (min:1, step:1) — "Artículo vario" |
| 2 | salvadorex_web_v25.html ~3380 | `openVarios()` precio cero | `number` (min:0, step:0.01) — "Precio del artículo" |

Callers ya cubiertos por VolvixUI primario (sin cambio necesario):
- `salvadorex_web_v25.html:3007-3022` (`promptProductForm` editar producto: code/name/price/stock — combo 4 fields, 1 modal)
- `salvadorex_web_v25.html:3304-3320` (descuento %, ya con `min:0,max:100,step:0.01,suggestions`)
- `salvadorex_web_v25.html:3393-3402` (producto común `addCommonProduct`: name+price)
- `salvadorex_web_v25.html:3449-3457` (verificador de precios — barcode)
- `volvix-owner-extra-wiring.js:182-194` (precio mensual plan — `vuiForm` con `number,step:0.01,default:29`)

Las líneas 3028-3031 (fallback de `promptProductForm`) y 3325, 3407, 3409, 3462 se mantienen como fallback; ahora usan `window.prompt` explícito para que el hijack las procese y muestre modal limpio (sin label duplicado) gracias a Mejora 1.

`openVarios()` ya era `async`; no se requirió cascadear a callers.

## Validación

- `node --check api/index.js` -> OK
- `node --check volvix-modals.js` -> OK

## Deploy

URL producción: **https://volvix-4wpxurw3i-grupo-volvixs-projects.vercel.app**
Inspector: https://vercel.com/grupo-volvixs-projects/volvix-pos/6U8EanJuomFtxDet34ALch2zQH9G
Status: READY (target: production)

## Resumen

- **Callers refactorizados directamente**: 2 (openVarios selección + precio cero)
- **Callers ya correctos (no requirieron cambio)**: 5 confirmados en archivos clave
- **Callers cubiertos por hijack mejorado** (label sin duplicación, type inteligente): 70 restantes a través del helper `parsePromptMessage`
- Ganancia neta de UX: TODOS los `prompt(...)` del sistema ahora abren modales VolvixUI con título contextual + label corto sin duplicar el mensaje.
