# R24 — Documentation Gap Analysis

Fecha: 2026-04-27. Sin auditor.

## Estado encontrado

| Doc | Estado | Accion |
|---|---|---|
| `openapi.yaml` | Existe, 71 paths documentados | Sin tocar (suficiente) |
| `README.md` | Existe, v7.0.0, 312 lineas | Sin tocar |
| `CONTRIBUTING.md` | FALTABA | **Creado** |
| `CHANGELOG.md` | FALTABA | **Creado** (R13 -> R24) |
| `SECURITY.md` | FALTABA | **Creado** |
| `.env.example` | FALTABA | **Creado** (~95 vars) |

## OpenAPI vs realidad

- **server.js**: 33 rutas `/api/*` (router por objeto literal `'METHOD /path': handler`).
- **api/*.js**: 9 rutas adicionales (`crm-advanced.js` y otros).
- **Total handlers reales**: ~42 en este snapshot (no 250).
- **openapi.yaml**: 71 paths declarados.

**Hallazgo**: la afirmacion "~250 endpoints" del prompt no coincide. El codigo en `verion 340` solo tiene ~42 handlers; openapi documenta 71 (incluyendo variantes de marketplaces / health / docs no implementadas localmente). El gap real es openapi *adelantado*, no atrasado. Posible que rutas adicionales esten en Supabase Edge Functions (no incluidas en este folder).

**Recomendacion**: re-auditar contra el repo de produccion (Vercel) si se busca alinear a 250.

## Archivos creados

1. `CONTRIBUTING.md` — setup, branch model, commits, PR flow.
2. `CHANGELOG.md` — entradas R13..R24 con fechas y referencias a `R*_*.md`.
3. `SECURITY.md` — politica, scope, practicas, auditorias previas.
4. `.env.example` — todas las env vars usadas en codigo (`grep process.env`), agrupadas: core, auth, IA, Supabase, CFDI, pagos, mensajeria, marketplaces, push, mobile, AWS, observabilidad, GitHub.

## Pendientes (no scope R24 docs)

- Sincronizar openapi.yaml con handlers reales (drift detectado).
- Generar OpenAPI desde codigo (anotaciones JSDoc + script).
