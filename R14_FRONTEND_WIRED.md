# R14 — Frontend Wired to Real Backend

## Problema
`salvadorex_web_v25.html` mostraba "1,247 productos" y "847 clientes" hardcoded en el HTML. La BD real tiene 131 productos.

## Diagnóstico
- `CATALOG` ya se cargaba post-login vía `/api/products?tenant_id=...` (línea 2612).
- `CUSTOMERS` y `SALES` eran arrays demo `const` que nunca se actualizaban desde API.
- Subtítulos `<p class="page-sub">` con cifras estáticas en HTML.
- `renderInv()` no se re-ejecutaba tras cargar productos reales.

## Cambios en `salvadorex_web_v25.html`

| Línea (aprox) | Cambio |
|---|---|
| 1757 | `<p class="page-sub">1,247 productos…</p>` → `<p class="page-sub" id="inv-sub">0 productos</p>` |
| 1778 | `<p class="page-sub">847 clientes…</p>` → `<p class="page-sub" id="cli-sub">0 clientes registrados</p>` |
| 2443 | `const CUSTOMERS = [` → `let CUSTOMERS = [` |
| 2457 | `const SALES = [` → `let SALES = [` |
| 2625-2630 | Tras carga de productos: actualizar `#inv-sub` con conteo real + low-stock, llamar `renderInv()` |
| 2632-2680 | Nuevo bloque: fetch `/api/customers?tenant_id=...`, sustituir `CUSTOMERS`, actualizar `#cli-sub`, llamar `renderClientes()` |
| 2682-2700 | Nuevo bloque: fetch `/api/sales?tenant_id=...`, sustituir `SALES`, llamar `renderVentas()` |

Total: ~55 líneas añadidas / 4 modificadas en `salvadorex_web_v25.html`.

## Wirings revisados (sin cambios)
- `volvix-pos-wiring.js` ya usa `apiGet('/api/customers')`, `apiGet('/api/sales')`, `apiPost('/api/products')` — funciona como overlay.
- `volvix_owner_panel_v7.html`, `multipos_suite_v3.html` no presentaban cifras hardcoded del mismo tipo; sin cambios.

## Validación
- `node --check api/index.js` → OK (sin tocar API).
- 259 `<script>` tags íntegros, archivo HTML parsea correctamente.

## Deploy
Pendiente: `vercel --prod --yes` desde `C:\Users\DELL\Downloads\verion 340`.
