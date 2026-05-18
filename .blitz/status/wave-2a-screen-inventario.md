# Wave 2A — Status: screen `inventario`
> Generado: 2026-05-15 · Agente: Wave 2A

## Resultado
COMPLETADO — Contrato Tier 1 creado en `.specify/contracts/screens/inventario.spec.md`

## Endpoints descubiertos (20)
| Grupo | Método | URL |
|---|---|---|
| Productos | GET | `/api/products?tenant_id={tid}` |
| Productos | GET | `/api/products?search={q}&limit=10&tenant_id={tid}` |
| Productos | POST | `/api/products` |
| Productos | PATCH | `/api/products/{id}` |
| Productos | DELETE | `/api/products/{id}` |
| Productos | DELETE | `/api/products?code={code}&tenant_id={tid}` |
| Productos | POST | `/api/products/import` |
| Productos | GET | `/api/products/next-barcode` |
| Productos | GET | `/api/products/check-barcode?code={v}` |
| Productos | POST | `/api/products/seed-from-giro` |
| Productos | POST | `/api/inventory/dedupe` |
| Movimientos | GET | `/api/inventory-movements?{params}` |
| Movimientos | POST | `/api/inventory-movements` |
| Movimientos | POST | `/api/inventory/bulk-adjust` |
| Movimientos | GET | `/api/inventory/alerts?tenant_id={tid}` |
| Conteo | POST | `/api/inventory-counts/start` |
| Conteo | GET | `/api/inventory-counts/{id}/lines` |
| Conteo | PATCH | `/api/inventory-counts/{id}/lines` |
| Conteo | POST | `/api/inventory-counts/{id}/pause` |
| Conteo | POST | `/api/inventory-counts/{id}/resume` |
| Admin | GET | `/api/admin/tenants` |

> system-map.json solo listaba `/api/admin/tenants` — los 20 endpoints reales no estaban mapeados.

## Modales abiertos
`promptProductForm()` — modal de crear/editar producto. No tiene `<dialog>` HTML propio en el bloque de inventario; se infiere que es un modal compartido (posiblemente en volvix-modals.js o generado dinámicamente). system-map.json confirma `modals_abiertos: []` — pendiente de validar.

## Confianza de inferencia
**MEDIA-ALTA (75%)** — Los endpoints de productos y movimientos son concretos y verificables. El flujo de conteo físico está detallado en HTML con IDs y comentarios. La incertidumbre principal es el modal `promptProductForm` (no visible en el bloque HTML analizado — posiblemente en otro módulo) y la ambigüedad de tabla `pos_products` vs `products` (DT-I1). El fallback de importación CSV y el endpoint de export no están completamente especificados.
