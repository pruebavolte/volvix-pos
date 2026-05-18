# Wave 2A — Status: Screen `pos`

> Generado: 2026-05-15
> Agente: Wave 2A (blitz SalvadoreX SDD)

---

## Estado

| Campo | Valor |
|---|---|
| Contrato generado | `.specify/contracts/screens/pos.spec.md` |
| Tier | TIER 1 — DETALLADO |
| HTML analizado | `public/salvadorex-pos.html` |
| Líneas del bloque HTML | 4089–4311 (222 líneas, sección completa `#screen-pos`) |
| Líneas totales del archivo | 22 919 |
| `_block_found` (system-map) | `true` |

---

## Hallazgos

| Métrica | Valor |
|---|---|
| Endpoints POS documentados | 21 (6 directamente al cobro, 15 auxiliares) |
| Endpoint principal de cobro | `POST /api/sales` (tabla: `pos_sales`) |
| Modales que abre la screen | 10 (pay, search, cash, calc, granel, pay-confirm, pay-verify, app-pay, sale-search, sale-detail) |
| Botones de acción en UI | 18 (barra acciones) + 6 (barra inferior) + 3 (summary) |
| Variables de estado en memoria | 14 (`CART`, `CATALOG`, `CUSTOMERS`, `SALES`, flags multi-tab, etc.) |
| Invariantes documentadas | 8 |
| Anti-patrones documentados | 6 |
| Deudas detectadas | 6 (T1–T6) |

---

## Deudas críticas

| ID | Descripción | Severidad |
|---|---|---|
| T2 | Tabla de ventas ambigua (`pos_sales` vs `sales`) | ALTA |
| T1 | Roles duales: `cashier` + `cajero` sin normalización | MEDIA |
| T3 | `window.CART` vs `CART` (let scope) — acceso inconsistente | BAJA |

---

## Confianza

**85 / 100**

Razones de descuento:
- `openCatalogPanel()` y `openVisualCatalog()` referenciados en HTML pero no confirmados como funciones declaradas en el scope principal (pueden ser cargadas dinámicamente).
- Endpoints de `/api/sales` no verificados contra `api/index.js` real (análisis estático sólo).
- Deuda D2 (tablas `sales` vs `pos_sales`) introduce incertidumbre en el mapping exacto.

---

## Siguientes pasos recomendados

1. Verificar que `openCatalogPanel` y `openVisualCatalog` existen y su handler real.
2. Confirmar en `api/index.js` que `POST /api/sales` escribe en `pos_sales` (no en `sales`).
3. Normalizar roles `cashier` / `cajero` (deuda global T1).
