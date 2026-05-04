# R22.4 — 4 Bugs Críticos Corregidos (post-test físico)

## Resumen

Cuatro bugs detectados en testing humano del POS, todos arreglados, deploy en producción y verificados con curl.

## Bug #1 — Click "Crear" no disparaba submit

**Diagnóstico**: ya estaba arreglado en `volvix-modals.js` líneas 280–303. El `<form>` contiene el footer (`formFooter`) con el `submitBtn type="submit"` adentro. El handler `onsubmit` se monta vía `addEventListener('submit', ...)` (helper `el()` línea 19). Footer hermano fue eliminado en R22 anterior. **Sin cambios de código nuevos** — verificado in situ.

## Bug #2 — XSS stored en productos

**Fix `api/index.js`**:
- Añadidas funciones `sanitizeName()`, `looksLikeSqlInjection()`, `hasUnsafeChars()` (líneas 345–366).
- POST /api/products (líneas 1068–1117): valida el INPUT ORIGINAL contra `<`, `>`, `javascript:`, `on*=` y rechaza con HTTP 400 ANTES de sanear-y-guardar.
- POST/PATCH /api/customers y POST /api/sales (items[].name, items[].notes, body.notes) reciben el mismo tratamiento.

## Bug #3 — Precio/stock negativos

**Fix POST y PATCH /api/products**:
- `price`: `Number.isFinite(n) && n >= 0` o 400.
- `stock`: `Number.isInteger(n) && n >= 0` o 400 (rechaza floats como 1.5).
- `cost`: `Number.isFinite(n) && n >= 0` o 400.
- `customers.credit_limit` también validado.

## Bug #4 — SQL injection en name

**Fix**: `looksLikeSqlInjection()` regex sobre el input crudo: detecta `(DROP|DELETE|INSERT|UPDATE|UNION|SELECT|TRUNCATE|ALTER) ... (TABLE|FROM|WHERE|INTO|DATABASE)` + `;--` + bloques `/* */`. Permite apostrofes legítimos (O'Brien). Aplicado a name/code/notes.

## Líneas modificadas en `api/index.js`

- 345–366 — helpers nuevos (`sanitizeName`, `looksLikeSqlInjection`, `hasUnsafeChars`).
- 1068–1117 — POST /api/products endurecido.
- 1135–1170 — PATCH /api/products endurecido.
- 1330–1365 — POST /api/customers endurecido.
- 1395–1410 — PATCH /api/customers endurecido.
- 1209–1240 — POST /api/sales: items[].name/notes y notes saneados.

## Productos eliminados de BD (vía Supabase Mgmt API + PAT)

Primera pasada: 7 filas (`NegPrice`, `alert(1)SafeName`, `Robert'); DROP TABLE products;--`, 3× `alert(1)`, `javascript:alert(1)`, `alert(1)X`).
Segunda pasada (residuos del primer test): 3 filas (`X1`, `X6`, `R224TP`).
Tercera pasada (cleanup): 1 fila (`OBRIEN1`).
**Total: 11 filas contaminadas/test purgadas.**

## Validaciones

- `node --check api/index.js` → OK.
- `vercel --prod --yes` → `https://salvadorexoficial.com` (alias estable).

## Tests post-fix (curl)

| Caso | HTTP | Mensaje |
|---|---|---|
| `<script>alert(1)</script>` | 400 | caracteres inválidos en name/code |
| price=-5 | 400 | price debe ser número >= 0 |
| `Robert; DROP TABLE products WHERE 1=1` | 400 | name/code contienen SQL no permitido |
| `javascript:alert(1)` | 400 | caracteres inválidos en name/code |
| `<svg onload=alert(1)>` | 400 | caracteres inválidos en name/code |
| stock=1.5 | 400 | stock debe ser entero >= 0 |
| `O'Brien Cafe` (válido) | 200 | producto creado correctamente |

Todos los vectores quedan bloqueados; nombres legítimos con apóstrofe siguen funcionando.
