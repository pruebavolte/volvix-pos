# Wave 2A — Status: Screen `clientes`
> 2026-05-15 · Agente Wave 2A

## Estado: COMPLETADO (Tier 1)

| Item | Estado |
|---|---|
| Contrato generado | `D:\github\volvix-pos\.specify\contracts\screens\clientes.spec.md` |
| Tier | 1 (DETALLADO) |
| Bloque HTML analizado | `section#screen-clientes` (líneas 4610–4623) |
| Endpoints documentados | 5 (GET/POST `/api/customers`) |
| Tablas Supabase | `customers`, `pos_customers`, `loyalty_transactions`, `loyalty_tiers` |

## Hallazgos críticos

1. **Array posicional frágil** — `CUSTOMERS[0..5]` con índices numéricos. Un reordenamiento rompe render, POS y selector sin error explícito.
2. **Tres paths de llenado con campos inconsistentes** — `c.debt` vs `c.credit_balance` vs `c.deuda` para el saldo deudor según cuál fetch ganó la carrera.
3. **Botón "Ver" sin handler** — cada fila tiene un botón de detalle/historial de cliente que no abre nada (AP-C1). El módulo de historial de compras por cliente NO está implementado.

## Deudas abiertas (top 3)
- DT-C2: Unificar `customers` + `pos_customers` (schema-truth Deuda D4 — MEDIA)
- DT-C1: Implementar botón "Ver" → historial de compras del cliente
- DT-C5: Normalizar campo de deuda/saldo en los 3 paths de carga

---
> Wave 2A · SalvadoreX SDD
