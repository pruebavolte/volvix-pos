# SalvadoreX SDD Blitz — Plan de 1 día con agentes paralelos

> **El plan**: Documentar TODO el sistema (34 screens, 155 endpoints, schema real, 5 parches al scanner) en un solo día (~3 horas wall-clock) usando 8-10 sub-agentes paralelos de Claude Code.

## Qué hay en este ZIP

```
salvadorex-1day-blitz/
├── README.md                          ← este archivo
├── ORQUESTADOR.md                     ⭐ EL PROMPT MAESTRO
│
├── agents/                            ← instrucciones por tipo de agente
│   ├── wave-1-patch-1.md              ← botón→handler
│   ├── wave-1-patch-2.md              ← screen→endpoint
│   ├── wave-1-patch-3.md              ← roles
│   ├── wave-1-patch-4.md              ← realtime
│   ├── wave-1-patch-5.md              ← window vars
│   ├── wave-1-schema-truth.md         ← schema real Supabase
│   ├── wave-2-screen-detailed.md      ← screen Tier 1
│   ├── wave-2-screens-batch.md        ← screens Tier 2 (5 por agente)
│   ├── wave-2-pdctabs-batch.md        ← perm-tabs del PDC
│   ├── wave-2-endpoints-shared.md     ← 8 endpoints compartidos detallados
│   ├── wave-2-endpoints-batch.md      ← endpoints Tier 2 (10 por agente)
│   ├── wave-2-endpoints-stubs.md      ← _INDEX.md masivo
│   └── wave-3-validators.md           ← 5 validadores cruzados
│
├── scripts/                           ← scripts ejecutables
│   ├── status-board.template.md       ← tracking del progreso
│   ├── merge-patches.js               ← auto-merge de Wave 1
│   └── final-validation.sh            ← veredicto final
│
└── checklists/
    └── (vacío, se llena durante la corrida)
```

## El día en una mirada

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        TIMELINE: ~3 HORAS WALL-CLOCK                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  T+00 ──▸ WAVE 0 — Setup (5 min, secuencial)                              │
│             │ Crear estructura, copiar kit, verificar prereqs             │
│             ▼                                                             │
│  T+05 ──▸ WAVE 1 — Scanner + Schema (20 min, 6 agentes ║║║║║║)            │
│             │ Patch 1 + Patch 2 + Patch 3 + Patch 4 + Patch 5 + Schema   │
│             │ Merge automático y regenerar mapa                           │
│             ▼                                                             │
│  T+25 ──▸ WAVE 2A — Screen Tier 1 (30 min, 5 agentes ║║║║║)               │
│             │ pos · corte · inventario · clientes · ventas               │
│             ▼                                                             │
│  T+55 ──▸ WAVE 2B — Screen Tier 2 (30 min, 6 agentes ║║║║║║)              │
│             │ 24 screens + 5 perm-tabs en stubs                          │
│             ▼                                                             │
│  T+85 ──▸ WAVE 2C — Endpoints (45 min, 5 agentes ║║║║║)                  │
│             │ 8 compartidos detallados + 25 stubs + 100 en _INDEX        │
│             ▼                                                             │
│  T+130 ─▸ WAVE 3 — Validación (20 min, 5 agentes ║║║║║)                  │
│             │ Schema · Endpoints · Screens · Orphans · Coherencia        │
│             ▼                                                             │
│  T+150 ─▸ WAVE 4 — Cierre (10 min, secuencial)                            │
│             │ final-report.md + status board final + métricas             │
│             ▼                                                             │
│  T+160 ─▸ DONE ✓ ~2h 40min total                                          │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Pre-requisitos (antes de empezar el día)

1. **Tener el repo clonado** y abierto en Claude Code (`claude` en la terminal del repo).

2. **Tener instalados los 3 kits**:
   - `salvadorex-sdd-kit-v2.zip` descomprimido en raíz.
   - `salvadorex-1day-blitz.zip` (este) descomprimido en raíz.
   - El visualizador `volvix-system-map-v2.html` en `public/`.

3. **MCP de Supabase conectado** en Claude Code:
   ```bash
   claude mcp add supabase \
     --env SUPABASE_URL=https://zhvwmzkcqngcaqpdxtwr.supabase.co \
     --env SUPABASE_SERVICE_KEY=<tu_service_key> \
     -- npx -y @supabase/mcp-server-supabase@latest
   claude mcp list  # debe aparecer supabase
   ```

4. **Tu scanner actual funciona**:
   ```bash
   node scripts/generate-system-map.js
   # Debe generar public/system-map.json sin errores
   ```

5. **Bloquear 3 horas en tu calendario** sin interrupciones. El blitz funciona mejor si no lo paras a mitad.

## Cómo arrancar

### Opción A — Recomendada: copy-paste del orquestador

1. Abre Claude Code en tu repo: `cd /tu/repo && claude`.
2. Abre `ORQUESTADOR.md` en un editor.
3. Copia TODO el bloque de código grande (entre los ```).
4. Pégalo en Claude Code y dale enter.
5. Claude Code procesa el plan y empieza a lanzar Tasks paralelas.

### Opción B — Si tu Claude Code NO soporta Task tool

Algunas versiones / configuraciones no permiten lanzar sub-agentes con Task. En ese caso:

1. Abre el ORQUESTADOR.md
2. Quita las menciones de "EN PARALELO" y "Task tool"
3. Pega y deja que ejecute secuencialmente
4. Tardará ~6-8 horas en vez de 3
5. Mismo resultado al final

### Opción C — Manual / didáctica

Si quieres entender cada wave antes de ejecutarla:

1. Lee `ORQUESTADOR.md` completo.
2. Ejecuta wave por wave manualmente, dándole a Claude Code el prompt de cada wave una a una.
3. Más lento pero te da control total y aprendes el patrón.

## Durante la corrida

- **Status board en vivo**: `.blitz/status-board.md` se actualiza después de cada wave. Puedes hacer `cat .blitz/status-board.md` cuando quieras.
- **No interrumpas mientras corre una wave**. Espera a que reporte cierre de wave antes de hacer otra cosa.
- **Si algo falla**, los agentes registran el error pero continúan con los demás. Al final tendrás visibilidad clara de qué se completó y qué no.

## Después del blitz

Al cerrar:

```bash
bash scripts/final-validation.sh
# Te da el veredicto:
# ✅ BLITZ EXITOSO — objetivos del día cumplidos
# ⚠️ BLITZ PARCIAL — la mayoría completado
# ❌ BLITZ INCOMPLETO — menos del 50%
```

Luego:

```bash
# Ver el reporte final
cat .audit/final-report.md

# Ver el mapa enriquecido
open public/volvix-system-map-v2.html

# Ver qué falta para mañana
grep -A 20 "PRÓXIMOS A PROMOVER" .audit/final-report.md
```

## Qué obtienes al final del día

✅ **Scanner v2** con 5 parches aplicados (botón→handler, screen→endpoint, roles, realtime, window vars).

✅ **Schema-truth real** de Supabase regenerado y deudas (tablas duplicadas, sufijos prohibidos) detectadas.

✅ **5 screens críticas con contrato detallado** (pos, corte, inventario, clientes, ventas).

✅ **24 screens + 5 perm-tabs con stubs estructurados** (Tier 2) — no full detail pero estructura básica para que la IA tenga contexto.

✅ **8 endpoints compartidos con contrato detallado** (los que crean acoplamiento POS↔PDC).

✅ **~25 endpoints exclusivos con stubs Tier 2**.

✅ **_INDEX.md** con TODOS los endpoints restantes (Tier 3) para visibilidad total.

✅ **5 reportes de validación cruzada** identificando deudas, huérfanos e inconsistencias.

✅ **Reporte final** con métricas, top 10 deudas críticas, y plan para mañana.

✅ **Mapa interactivo enriquecido** mostrando relaciones nuevas (botón→modal, screen→endpoint, etc.).

## Qué NO obtienes (intencionalmente)

❌ Contratos full-detail para las 29 screens. Solo las 5 críticas. El resto son stubs.

❌ Contratos full-detail para los 155 endpoints. Solo los 8 compartidos + ~25 top. El resto son stubs o _INDEX.

❌ Fixes a deudas detectadas. Solo se DETECTAN, no se arreglan.

❌ Tests E2E automatizados. Si quieres Playwright tests, eso es otra iteración.

**Esto es intencional**: el blitz produce **80% del valor de SDD con 20% del esfuerzo**. Mañana o el resto de la semana atacas:

1. Convertir Tier 2 stubs a Tier 1 detallados (los más críticos primero).
2. Documentar endpoints que aparecen en bugs reportados.
3. Fixes a las deudas top 10 del reporte.

## Si solo tienes 1 hora hoy en lugar de 3

Corre solo:
- Wave 0 (5 min)
- Wave 1 (20 min) — para que el scanner v2 esté listo
- Wave 2C.1 (15 min) — los 8 endpoints compartidos detallados
- Wave 2A reducido a 2 screens (15 min) — pos y corte
- Wave 4 mini (5 min)

Total: 60 min. Mañana terminas el resto.

## Resolución de problemas

### "Claude Code dice que no puede usar Task tool"

→ Versión limitada. Usa Opción B (secuencial). Mismo resultado, más tiempo.

### "El MCP de Supabase no responde"

→ Wave 1.6 (schema-truth) falla, pero el blitz continúa. Tendrás un schema-truth.md vacío. Mañana lo regeneras manualmente.

### "Un agente se quedó atascado"

→ Claude Code tiene timeout por sub-agente. Si uno se atasca, lo mata. La wave marca esa task como FALLIDA pero continúa.

### "Mi repo no tiene `public/salvadorex-pos.html`"

→ Ajusta los paths en `ORQUESTADOR.md` antes de pegar. Cambia `public/salvadorex-pos.html` por tu ruta real.

### "Hay conflictos al mergear los patches"

→ El script `scripts/merge-patches.js` es heurístico. Si falla, los 5 patches están en `scripts/_patches/`. Aplícalos manualmente leyendo cada uno.

## Filosofía del blitz

> **"Done is better than perfect, but documented is better than done."**

Un contrato Tier 2 con 30 TODOs es MUCHO mejor que NO tener contrato. Le da a tu IA contexto estructurado. Mañana lo refinas.

> **"Paralelismo bate perfección."**

10 agentes haciendo el 80% en 30 min derrotan a 1 agente haciendo el 100% en 4 horas. Y al final, el output del 80% × 10 es más útil porque cubre más superficie.

> **"Tu peor enemigo no es la IA que improvisa. Es la IA que improvisa sin que te enteres."**

Después del blitz, tu IA tiene mapa, contratos y validadores. Si improvisa, los validators de Wave 3 lo detectan en la próxima corrida.

---

¿Listo? Abre `ORQUESTADOR.md` y vamos.
