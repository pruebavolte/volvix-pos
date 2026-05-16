# AGENTE 8 — VolvixState (ADR-001 Fase 1)

## Bug original (B-POS-4)
CATALOG (93 menciones) y PRODUCTS_REAL (4 menciones POS + 1 loader) son dos fuentes
de verdad. Subtitulo dice "1000 productos" mientras KPI dice "5".

## Fix aplicado (Fase 1 backward-compatible)
- Nuevo public/volvix-state.js con window.VolvixState
- API: setProducts/setCustomers/setSales + getProducts + onProductsChange + decrementProductStock
- Cargado en salvadorex-pos.html ANTES de cualquier wiring
- Backward-compatible: globals CATALOG/PRODUCTS_REAL siguen existiendo
- Solo nuevos consumidores leen de VolvixState
- Fase 2 (futura): refactor consumers, eliminar globals

## Verificacion
True
VolvixState referencias en salvadorex-pos.html: 7
