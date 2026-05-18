# Wave 1 — Parche 1: Botón → Handler/Modal/Screen

- Estado: ✓ Generado
- Archivo generado: `scripts/_patches/patch-1.diff.js`
- Líneas scanner afectadas: ~78-89 (bloque "4. BUTTONS" en `scanFile()`)
- Verbos nuevos: `abre_modal`, `navega_a_screen`, `llama_funcion`
- Errores: ninguno

## Campos nuevos por botón

| Campo | Ejemplo | Detectado via |
|---|---|---|
| `calls` | `"handleLogin"`, `"doLogout"`, `"exportar"` | primer identificador antes de `(` |
| `opens_modal` | `"payment"`, `"change-price"`, `"new-customer"` | heurística por nombre de función |
| `navigates_to` | `"pos"`, `"inventario"`, `"config"` | regex `showScreen('X')` |

## Patrones HTML reales detectados (salvadorex-pos.html)

| onclick | navigates_to | opens_modal | calls |
|---|---|---|---|
| `showScreen('pos')` | `pos` | — | — |
| `openPayment()` | — | `payment` | — |
| `openChangePriceModal()` | — | `change-price` | — |
| `openNewCustomerModal()` | — | `new-customer` | — |
| `openNotificationsPanel()` | — | — | `openNotificationsPanel` |
| `doLogout()` | — | — | `doLogout` |
| `handleLogin(event)` | — | — | `handleLogin` |
| `closeModal('modal-pay')` | — | — (ignorado) | — |

## Helpers añadidos al patch

- `inferModalFromFn(fn)` — detecta `openModal()`, `showModal()`, `openXxxModal()`, `openXxx()`
- `inferScreenFromFn(fn)` — detecta `showScreen('X')`
- `inferCallsFromFn(fn)` — extrae primer nombre de función

## Instrucciones de aplicación

1. Copiar los 3 helpers (`inferModalFromFn`, `inferScreenFromFn`, `inferCallsFromFn`) antes de `scanFile()` en `generate-system-map.js`
2. Reemplazar líneas 78-89 (bloque `// 4. BUTTONS`) con el bloque enriquecido del patch
3. En el `return` de `scanFile()`, cambiar `buttons.slice(0, 50)` → `buttons.slice(0, 80)`
4. Descomentar el bloque de relaciones adicionales en el build section (junto a `pos.modals.forEach`)
