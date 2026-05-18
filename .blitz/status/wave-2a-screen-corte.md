# Wave 2A — Status: screen `corte`
> Generado: 2026-05-15 · Agente: Wave 2A

## Resultado
COMPLETADO — Contrato Tier 1 creado en `.specify/contracts/screens/corte.spec.md`

## Endpoints descubiertos (9)
| Método | URL |
|---|---|
| GET | `/api/cuts/{id}/summary` |
| GET | `/api/cuts/{id}/check-pending` |
| GET | `/api/cuts/{id}/adjustments` |
| POST | `/api/cuts/{id}/adjustment` |
| POST | `/api/cuts/{id}/adjustment/{adjId}/approve` |
| POST | `/api/cuts/{id}/adjustment/{adjId}/reject` |
| POST | `/api/cuts/{id}/reopen` |
| POST | `/api/cuts/close` |
| GET | `/api/cuts` (historial) |

> system-map.json reportaba `endpoints_propios: []` — incompleto. Todos los endpoints fueron descubiertos por análisis estático del HTML.

## Modales abiertos
Ningún `<dialog>` o modal propio identificado en el HTML. El historial se renderiza en un panel inline (no modal). system-map.json confirma `modals_abiertos: []`.

## Confianza de inferencia
**ALTA (85%)** — Toda la lógica de botones, payloads y flujos está implementada inline en el HTML con comentarios de GAP-Z (Z1, Z2, Z4). Los endpoints son concretos y rastreables. Deuda principal: ambigüedad de tabla `cuts` vs `pos_cortes` (D6 schema-truth) requiere verificación en Supabase.
