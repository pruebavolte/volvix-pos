# Criterio de Done — por wave

> Define qué significa "completado" para cada wave. Los validadores y el script final-validation.sh verifican contra este criterio.

## Wave 0 — Setup

Done = **TODOS** los siguientes:

- [ ] `.specify/` existe con todos los archivos del kit v2
- [ ] `.blitz/` existe con sub-carpetas
- [ ] `.audit/` existe
- [ ] `public/salvadorex-pos.html` existe y es legible
- [ ] `public/paneldecontrol.html` existe y es legible
- [ ] `public/system-map.json` existe y parsea como JSON válido
- [ ] `scripts/generate-system-map.js` existe
- [ ] MCP de Supabase responde a `list_tables` (o se reconoce que no está disponible)
- [ ] `status-board.md` inicializado

## Wave 1 — Scanner + Schema

Done = **al menos 4/6** de las sub-tasks:

- [ ] Patch 1 generado en `scripts/_patches/patch-1.diff.js`
- [ ] Patch 2 generado
- [ ] Patch 3 generado
- [ ] Patch 4 generado
- [ ] Patch 5 generado
- [ ] `.specify/schema-truth.md` regenerado (si MCP disponible)

Y post-wave:

- [ ] `scripts/generate-system-map.v2.js` creado (merge automático)
- [ ] `public/system-map.json` re-generado con la nueva granularidad

Si solo 3/6 completaron, marcar como ⚠️ PARCIAL pero continuar.

## Wave 2A — Screens Tier 1

Done = **5/5** archivos creados con contenido NO stub:

- [ ] `.specify/contracts/screens/pos.spec.md` con confianza ≥ ⭐⭐
- [ ] `.specify/contracts/screens/corte.spec.md`
- [ ] `.specify/contracts/screens/inventario.spec.md`
- [ ] `.specify/contracts/screens/clientes.spec.md`
- [ ] `.specify/contracts/screens/ventas.spec.md`

Cada archivo debe tener:
- Sección "Identidad" llena (no TODOs).
- Al menos 3 endpoints listados en "Endpoints API que consume".
- Al menos 2 invariantes específicas (no genéricas).

## Wave 2B — Screens Tier 2

Done = **29/29** stubs creados:

- [ ] 24 screens restantes del POS (cada una en `screens/<nombre>.spec.md`)
- [ ] 5 perm-tabs del PDC (`screens/pdc-<tab>.spec.md`)

Cada stub debe tener:
- Header de identidad con archivo y línea aprox.
- Marca "STUB Tier 2".
- Lista de endpoints extraídos del system-map (sin necesariamente validar).

## Wave 2C — Endpoints

Done = los 4 buckets:

**2C.1 — Compartidos** (8/8 detallados):
- [ ] `/api/admin/giros/` documentado
- [ ] `/api/admin/tenant/` documentado
- [ ] `/api/admin/tenants` documentado
- [ ] `/api/app/config` documentado
- [ ] `/api/log/client` documentado
- [ ] `/api/owner/low-stock` documentado
- [ ] `/api/pos/app-orders` documentado
- [ ] `/api/users/me` documentado

Cada uno con sección "Tablas Supabase que toca" llena (no TODO).

**2C.2 + 2C.3 — POS exclusivos** (20 stubs Tier 2):
- [ ] 20 archivos `.spec.md` creados en `endpoints/`

**2C.4 — PDC exclusivos** (5 stubs):
- [ ] 5 archivos creados

**2C.5 — _INDEX.md** (resto):
- [ ] `.specify/contracts/endpoints/_INDEX.md` existe
- [ ] Lista al menos 100 endpoints adicionales
- [ ] Sección "Próximos a promover" con top 10 sugeridos

## Wave 3 — Validación

Done = **5/5** reportes:

- [ ] `.audit/validation-schema.md`
- [ ] `.audit/validation-endpoints.md`
- [ ] `.audit/validation-screens.md`
- [ ] `.audit/validation-orphans.md`
- [ ] `.audit/validation-coherence.md`

Y consolidación:

- [ ] `.audit/wave-3-summary.md` con top 10 deudas

## Wave 4 — Cierre

Done = **TODOS**:

- [ ] `.audit/final-report.md` con secciones: resumen, métricas, top 10 deudas, plan mañana
- [ ] `.blitz/status-board.md` actualizado con timestamps de cierre
- [ ] `scripts/final-validation.sh` corre y regresa exit code 0 ó 1 (no 2)
- [ ] Mensaje final al usuario con resumen ejecutivo

## Criterio para llamar al blitz "exitoso"

✅ **EXITOSO** (final-validation regresa 0):
- ≥ 30 screen contracts creados (de 34 esperados)
- ≥ 30 endpoint contracts creados (entre detallados + stubs)
- `_INDEX.md` con resto
- `final-report.md` existe
- Schema-truth regenerado (o reportado como pendiente con razón)

⚠️ **PARCIAL** (final-validation regresa 1):
- ≥ 20 screens
- ≥ 15 endpoints
- final-report existe
- Faltó alguna wave pero la mayoría se completó

❌ **INCOMPLETO** (final-validation regresa 2):
- Menos de 50% de la cobertura objetivo
- Probablemente Wave 0 o Wave 1 falló
- Requiere reintento manual
