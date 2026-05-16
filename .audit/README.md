# Carpeta `.audit/` — Índice de todo el proceso

> Esta carpeta documenta el proceso completo de auditoría adversarial + reparación + ciclo de convergencia del sistema SalvadoreX POS / Volvix.

## Para navegar por primera vez

1. **Si quieres ver el estado actual**: lee `REPORTE-FINAL-V4.md` (último)
2. **Si quieres mostrar a un cliente**: usa `RESUMEN-EJECUTIVO-FINAL.md` (1 página)
3. **Si quieres entender qué falta hacer**: `ROADMAP-POST-PRODUCTION.md`
4. **Si quieres entender qué decisiones se tomaron**: `DECISIONS.md` + `BLOCKERS.md`
5. **Si quieres evidencia técnica**: carpeta `evidence/[fecha]/`

## Reportes finales por ciclo (más reciente arriba)

| Reporte | Cuándo | Score POS / Panel |
|---|---|---|
| `REPORTE-FINAL-V4.md` | **Actual** | 89 / 86 (sin cambio + kit comercial) |
| `REPORTE-FINAL-ABSOLUTO-V3.md` | 2026-05-16 | 89 / 86 |
| `REPORTE-FINAL-ABSOLUTO-V2.md` | 2026-05-16 | 89 / 86 |
| `REPORTE-FINAL-ABSOLUTO.md` | 2026-05-16 | 84 / 78 |
| `REPORTE-FINAL-UNICO.md` | 2026-05-15 | 22 / 15 (baseline) |
| `REPORTE-FINAL-2026-05-16.md` | 2026-05-16 | progreso intermedio |

## Análisis y planes

- `AUDITORIA-ADVERSARIAL-2026-05-16.md` — auditoría base adversarial que detonó todo
- `PLAN-MAESTRO-FINAL.md` — plan maestro de los 14 agentes
- `PLAN-MAESTRO-2026-05-16.md` — versión previa del plan
- `REPORTE-SDD-2026-05-15.md` — Spec-Driven Development inicial
- `legacy-analysis.md` — análisis de las 114 rows legacy (decisión: descartar)
- `legacy-references-map.md` — mapa de 28 referencias a tablas legacy en api/index.js (V4)
- `system-map.report.md` — mapa de subsistemas

## Decisiones y bloqueos

- `DECISIONS.md` — todas las decisiones de negocio/técnicas tomadas con justificación
- `BLOCKERS.md` — lo que queda pendiente y por qué (B-X-6 refactor, B-X-7 E2E)
- `OUT_OF_SCOPE.md` — lo que se sacó del scope explícitamente

## ADRs (Architecture Decision Records)

Estado al cierre del V4:

| ADR | Descripción | Estado |
|---|---|---|
| ADR-001 | window.VolvixState (source of truth) | ✅ Ejecutado |
| ADR-002 | Polling `/api/app/config` con backoff | ✅ Ejecutado |
| ADR-003 | window.VolvixTabs (tabs unificados) | ✅ Ejecutado |
| ADR-004 | DROP tablas legacy | ❌ **DEFERIDA** (B-X-6) |
| ADR-005 | Logout server-side con revocación JWT | ✅ Ejecutado |

**4/5 ejecutadas. ADR-004 deferida con R37 ya escrita como prep.**

## Evidencia técnica archivada

- `evidence/2026-05-16/cross-tenant-tests/CICLO-CONVERGENCIA-2-RESULTS.md` — fuga cross-tenant detectada y reparada (commit `d657cb2`)
- `evidence/2026-05-16/convergencia-3/smoke-tests.md` — verificaciones del ciclo 3 (captcha real funciona)
- `evidence/2026-05-16/backups/legacy-*.json` — backups de las 114 rows legacy (para verificar si hubiera duda)
- `evidence/2026-05-16/agente-*` — evidencia por agente (14 agentes ejecutados en ciclo principal)

## Migraciones SQL

| SQL | Estado | Notas |
|---|---|---|
| `db/R32_TAX_CONFIG.sql` | ✅ Aplicada (con seed removido) | IVA configurable |
| `db/R33_ENFORCEMENT_CROSS.sql` | ✅ Aplicada | Cross-tenant enforcement |
| `db/R34_PANEL_HARDENING.sql` | ✅ Aplicada (vista adaptada a legacy schema) | 2FA + IP + Sesiones |
| `db/R35_ADR-004_DROP_LEGACY.sql` | ❌ NO aplicada (defer) | DROP tablas legacy |
| `db/R37_CREATE_POS_CUSTOMERS.sql` | ⏳ Escrita, NO aplicada | Prep para refactor |
| `db/R38_PILOT_TRACKING.sql` | ⏳ Escrita, NO aplicada | Tracking pilotos + feedback |

## Score final medido (no inflado)

- **Score POS**: 89/100
- **Score Panel**: 86/100
- **Veredicto**: PRE-PRODUCTION (vendible a 2-5 clientes piloto, no a escala masiva sin completar roadmap)

## Cómo continuar el trabajo

1. Lee `REPORTE-FINAL-V4.md` para contexto completo
2. Lee `ROADMAP-POST-PRODUCTION.md` para saber qué sigue
3. Lee `BLOCKERS.md` para entender los 2 bloqueos abiertos
4. Lee `docs/ONBOARDING-CLIENTE-PILOTO.md` para empezar a vender a pilotos
5. Lee `docs/venta/*.md` para los materiales de venta

## URL en vivo

**https://systeminternational.app/**

## Último commit en producción

Ver `git log -1` para el más reciente. Al cierre de V4 será un commit del ciclo de Fase 2 con tag `v1.0-production-ready`.
