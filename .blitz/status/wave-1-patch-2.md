# Wave 1 — Parche 2: Screen → Endpoint

- Estado: ✓ Generado
- Archivo generado: `scripts/_patches/patch-2.diff.js`
- Líneas scanner afectadas: final de `scanFile()` (nuevo bloque antes del `return`) + sección de relaciones
- Verbo nuevo en grafo: `llama_api` con `granularidad: 'screen'`, `abre_modal` desde HTML inline

---

## Patrón de bloque detectado

**Patrón real confirmado:**
```html
<section id="screen-X" class="screen-pad hidden">...</section>
<!-- excepción: screen-pos usa class="pos-screen" -->
```

Regex usado:
```js
/<section[^>]+id=["']screen-X["'][^>]*>([\s\S]*?)<\/section>/i
```

- 34 screens detectadas (líneas 4089–6575 del HTML)
- **100% de los bloques HTML encontrados** (34/34)

---

## Hallazgo crítico — Separación HTML / JS

| Zona | Líneas | Contenido |
|---|---|---|
| HTML sections | 4089–6575 | `<section id="screen-X">` con markup + onclick attrs |
| Script section | 7000–22900 | Todas las funciones fetch / /api/ calls |

**Los bloques HTML NO contienen `fetch()` inline.** Solo 1 excepción (screen-inventario: un comentario HTML que menciona `/api/admin/tenants`).

Por esto, el parche implementa **estrategia dual**:

- **Fase A (HTML block)**: Extrae onclick handlers y modales desde la section HTML → da `functions_called` y `modals_opened`
- **Fase B (heurística JS)**: Busca el nombre del screen en el bloque JS (línea >7000) y extrae `/api/` calls en ±120 líneas de cada mención → da `endpoints`

---

## Screens por cobertura

| Screen | HTML block | Onclick attrs | JS markers | Endpoints (esperados) |
|---|---|---|---|---|
| pos | ✓ | 29 | 5 | /api/sales, /api/cart/*, /api/products |
| inventario | ✓ | 4 | 5 | /api/products, /api/inventory/*, /api/productos |
| reportes | ✓ | 11 | 3 | /api/reports/* |
| corte | ✓ | 1 | 6 | /api/cuts/* |
| ventas | ✓ | 3 | 4 | /api/sales/*, /api/dashboard/today |
| devoluciones | ✓ | 3 | 7 | /api/returns/*, /api/sales/* |
| kardex | ✓ | 2 | 4 | /api/inventory-movements, /api/reports/kardex |
| cotizaciones | ✓ | 3 | 3 | /api/quotations/* |
| config | ✓ | 50 | 5 | /api/app/config, /api/app/branding |
| clientes | ✓ | 1 | 3 | /api/customers |
| credito | ✓ | 0 | 3 | /api/customers |
| proveedores | ✓ | 6 | 3 | /api/suppliers, /api/purchases |
| facturacion | ✓ | 4 | 3 | /api/facturama/* |
| recargas | ✓ | 7 | 5 | /api/recargas/* |
| servicios | ✓ | 7 | 5 | /api/services/* |
| promociones | ✓ | 7 | 4 | /api/promotions/* |
| fila | ✓ | 9 | 4 | /api/queue/* |
| ingredientes | ✓ | 16 | 4 | /api/ingredientes, /api/recetas |
| menu-digital | ✓ | 19 | 4 | /api/menu-digital, /api/productos |
| marketing | ✓ | 14 | 3 | /api/marketing/* |
| plan | ✓ | 2 | 1 | /api/business-plan |
| rentas | ✓ | 3 | 6 | (módulo externo RentasUI) |
| reservaciones | ✓ | 6 | 6 | (módulo externo) |
| dashboard | ✓ | 2 | 4 | /api/dashboard/today |
| usuarios | ✓ | 0 | 4 | /api/users/* |
| apertura | ✓ | 1 | 6 | /api/cuts/open |
| quickpos | ✓ | 13 | 2 | (reutiliza lógica POS) |
| perfil | ✓ | 0 | 1 | /api/users/me |
| departamentos | ✓ | 2 | 3 | /api/products/categories |
| actualizador | ✓ | 2 | 2 | /api/version |
| salud | ✓ | 1 | 2 | /api/version, /api/payments/health |
| mobile-apps | ✓ | 1 | 2 | /api/tenant/active-modules |
| ayuda | ✓ | 8 | 1 | /api/support/ticket |
| mapa | ✓ | 8 | 3 | (no endpoints directos) |

**Screens con endpoints asignables via heurística JS: ~30/34 (~88%)**

---

## Deuda técnica identificada

1. **Heurística de proximidad imprecisa**: La Fase B asocia endpoints a una screen porque el nombre del screen aparece cerca en el JS, no porque la función pertenezca a esa screen. Puede producir falsos positivos en screens con código solapado (ej. `pos` y `quickpos`, `ventas` y `devoluciones`).

2. **Pantallas con módulos externos**: `screen-rentas` y `screen-reservaciones` delegan render a `window.RentasUI` y módulo externo. Sus endpoints no están en el HTML principal.

3. **Anotación recomendada para futura precisión**: Agregar `// @screen <nombre>` como comentario antes de cada función/módulo JS de screen. Esto permitiría un regex exacto en lugar de heurística de proximidad. Estimado: 2-3h de refactor.

4. **screen-pos es una screen especial**: Su código está en múltiples bloques (PAYMENT, POS cascade lookup, R8a cart, R8b recovery) que son comunes a toda la experiencia POS. No es posible aislar únicamente los endpoints "de la screen pos" sin solapamiento con los demás.

---

## Instrucciones de aplicación

1. Copiar los 4 helpers (`extractEndpoints`, `extractOnclickHandlers`, `extractFnNames`, `extractModalsFromHandlers`) ANTES de `scanFile()` en `generate-system-map.js`
2. Copiar el bloque principal `screenBlocks` al final de `scanFile()`, ANTES del `return`
3. En el `return` de `scanFile()`, agregar: `screen_blocks: screenBlocks`
4. En la sección de relaciones del BUILD SYSTEM MAP, descomentar y pegar el bloque de relaciones screen → endpoint/modal
5. En el `resumen` del JSON final, agregar:
   ```js
   screen_endpoint_coverage: Object.values(pos.screen_blocks).filter(b => b.endpoints.length > 0).length + '/' + pos.screens.length
   ```

---

## Validación pre-aplicación ejecutada

| Métrica | Resultado |
|---|---|
| Screens con HTML block detectado | 34/34 (100%) |
| Screens con /api/ en bloque HTML | 1/34 (solo comentario) |
| Screens con onclick handlers | 33/34 |
| Screens con JS markers | 33/34 |
| Estrategia necesaria | Dual (Fase A + Fase B) |
| Fallback activado | NO — patrón claro encontrado |

---

Generado por agente Wave 1 — Parche 2 · 2026-05-15
