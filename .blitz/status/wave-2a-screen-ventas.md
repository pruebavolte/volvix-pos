# Wave 2A — Status: Screen `ventas`
> 2026-05-15 · Agente Wave 2A

## Estado: COMPLETADO (Tier 1)

| Item | Estado |
|---|---|
| Contrato generado | `D:\github\volvix-pos\.specify\contracts\screens\ventas.spec.md` |
| Tier | 1 (DETALLADO) |
| Bloque HTML analizado | `section#screen-ventas` (líneas 4648–4670) |
| Endpoints documentados | 10 (GET/POST sobre `/api/sales`, `/api/sales/search`, `/api/sales/:id`, `/api/sales/:id/print-history`, `/api/sales/:id/reprint`, `/api/sales/:id/invoice-late`) |
| Tablas Supabase | `pos_sales`, `sales`, `volvix_ventas` (3 tablas ambiguas — Deuda D2 ALTA) |

## Hallazgos críticos

1. **Filtro de fecha no filtra la tabla** — `applyHistorialFilter()` guarda el rango en sessionStorage pero al re-renderizar usa `SALES` en memoria sin filtrar. Solo el export CSV respeta el filtro. Bug visible al usuario (AP-V2).
2. **Tres tablas para ventas** — `pos_sales` (API), `sales` (pdf-export), `volvix_ventas` (migraciones). RLS, índices y triggers pueden diferir. Deuda D2 de severidad ALTA en schema-truth.
3. **Botón "👁️" sin handler** — cada fila tiene un botón de detalle que no ejecuta ninguna acción (AP-V1). El detalle de venta solo es accesible desde la búsqueda manual (`r10aOpenFindSale`).

## Deudas abiertas (top 3)
- DT-V3: Unificar `pos_sales` + `sales` + `volvix_ventas` (schema-truth D2 — ALTA)
- DT-V2: Corregir filtro de fecha para que filtre `SALES` en memoria (o recargue del server)
- DT-V1: Implementar botón "👁️" → detalle de venta inline

---
> Wave 2A · SalvadoreX SDD
