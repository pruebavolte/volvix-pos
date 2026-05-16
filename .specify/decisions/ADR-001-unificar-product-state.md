# ADR-001: Unificar `CATALOG` y `PRODUCTS_REAL` en `window.VolvixState.products`

**Status**: Propuesto
**Fecha**: 2026-05-15
**Decision-makers**: Owner del proyecto

---

## Contexto

Volvix POS tiene **dos arrays globales** poblados por **dos loaders distintos** que representan el catálogo de productos del tenant:

| Variable | Loader | Formato | Uso |
|---|---|---|---|
| `window.CATALOG` | `VolvixDataLoader.loadAll()` en `salvadorex-pos.html` línea ~7460 | Array de objetos `{code, name, price, cost, stock, id, ...}` | Renderizado de `screen-inventario`, búsqueda L1 en `searchProduct()` |
| `window.PRODUCTS_REAL` | `volvix-real-data-loader.js` línea ~126 | Array de objetos de la API tal cual | Subtítulo de `#inv-sub`, sidebar quick-pick |

**Verificación física 2026-05-15** (screenshot en `.audit/VERIFICACION-FISICA-2026-05-15.md`):
- Subtítulo: **"1000 productos · 807 con stock bajo"** (de PRODUCTS_REAL)
- KPI "TOTAL PRODUCTOS": **5** (de CATALOG)
- Tabla visible: **5 filas** (CATALOG render)

→ El sistema declara públicamente que hay **1000 productos** y al mismo tiempo solo carga **5** al estado de búsqueda/cart. Esto es el síntoma descrito por el usuario: "como que el sistema hizo otra tabla que hacía lo mismo".

## Alternativas consideradas

### A. Eliminar `volvix-real-data-loader.js` (consolidar en `VolvixDataLoader`)
**Pros**: estado único, lógica centralizada en el HTML principal.
**Contras**: `volvix-real-data-loader.js` es el archivo activo en producción (29KB, escribe a `m-prods`, KPIs del dashboard, etc.). Habría que migrar todos esos consumidores.

### B. Eliminar `VolvixDataLoader` interno (consolidar en `volvix-real-data-loader.js`)
**Pros**: el loader externo ya escribe a más DOM elements (`m-prods`, `m-cust`, `m-sales`, KPIs del dashboard).
**Contras**: el loader externo NO tiene la lógica de `volvix:products-loaded` event y los renders de `renderInv`/`renderClientes`/`renderVentas`. Tendríamos que portarlas.

### C. **Crear facade `window.VolvixState`** (recomendado)
```js
window.VolvixState = {
  _products: [],
  _customers: [],
  _sales: [],
  _listeners: { products: [], customers: [], sales: [] },
  setProducts(arr) {
    this._products = arr;
    this._listeners.products.forEach(fn => { try { fn(arr); } catch(_){} });
  },
  getProducts() { return this._products; },
  onProductsChange(fn) { this._listeners.products.push(fn); }
};
```
**Pros**: API explícita, listeners reemplazan el `volvix:products-loaded` event con tipado claro. Compatible con ambos loaders.
**Contras**: requiere migrar consumidores (CATALOG → VolvixState.getProducts()).

## Decisión

**Opción C — facade `window.VolvixState`**.

### Plan de migración (3 fases)

**Fase 1** (sin breaking changes, 2h):
- Crear `public/volvix-state.js` con la API completa.
- Cargar en `salvadorex-pos.html` ANTES de cualquier otro JS.
- Hacer que `VolvixDataLoader.loadAll()` Y `volvix-real-data-loader.js` LLAMEN A `VolvixState.setProducts()` además de mutar sus arrays legacy.
- Validar que nada se rompa.

**Fase 2** (migrar consumidores, 4h):
- Refactorizar `renderInv()` para leer de `VolvixState.getProducts()`.
- Refactorizar `searchProduct()` L1 para usar `VolvixState.getProducts()`.
- Suscribirse con `VolvixState.onProductsChange(renderInv)` (reemplaza `volvix:products-loaded`).

**Fase 3** (eliminar arrays legacy, 2h):
- Eliminar `window.CATALOG = [...]` y `window.PRODUCTS_REAL = [...]`.
- Reemplazar 100% de referencias con `VolvixState`.
- Borrar el event `volvix:products-loaded` (ya nadie lo necesita).

**Total**: ~8h de trabajo + 2h de testing E2E con Playwright.

## Consecuencias

### Más fácil
- Debugging: una sola fuente de verdad. `VolvixState.getProducts().length` siempre es el número correcto.
- Onboarding de IA: el contrato dice "lee `VolvixState.getProducts()`", nunca "lee CATALOG o PRODUCTS_REAL según veas".
- Tests: mockear `VolvixState` es trivial vs mockear dos loaders.

### Más difícil
- Si alguien agrega un loader nuevo en el futuro, **DEBE** llamar a `VolvixState.setProducts()`. Requiere disciplina o lint rule.
- Eventos custom DOM (`volvix:products-loaded`) tienen sintaxis más conocida que listeners imperativos.

### Riesgo de rollback
Mantener arrays legacy durante Fase 1 y 2 permite rollback rápido sin tocar consumidores. Solo Fase 3 es irreversible.

## Implementación de referencia

`public/volvix-state.js`:
```js
(function(){
  if (window.VolvixState) return; // idempotente
  const _l = { products: [], customers: [], sales: [] };
  const _d = { products: [], customers: [], sales: [] };
  function _emit(kind) {
    _l[kind].forEach(fn => { try { fn(_d[kind]); } catch(e){ console.warn('VolvixState listener', e); } });
  }
  window.VolvixState = {
    setProducts(arr) { _d.products = Array.isArray(arr) ? arr : []; _emit('products'); },
    setCustomers(arr) { _d.customers = Array.isArray(arr) ? arr : []; _emit('customers'); },
    setSales(arr) { _d.sales = Array.isArray(arr) ? arr : []; _emit('sales'); },
    getProducts() { return _d.products; },
    getCustomers() { return _d.customers; },
    getSales() { return _d.sales; },
    onProductsChange(fn) { _l.products.push(fn); },
    onCustomersChange(fn) { _l.customers.push(fn); },
    onSalesChange(fn) { _l.sales.push(fn); }
  };
})();
```

## Métricas de éxito

- ✅ En la pantalla de Inventario, el subtítulo `#inv-sub` y el KPI `TOTAL PRODUCTOS` y la tabla muestran el **mismo número**.
- ✅ Después de crear un producto, aparece en la lista sin recargar (`onProductsChange` dispara `renderInv`).
- ✅ `searchProduct()` L1 encuentra el producto recién creado sin que el cajero haga refresh.
- ✅ Test Playwright `flow-cobro` pasa todos los checkpoints CK1.1–CK9.3.
