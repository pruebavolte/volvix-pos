# ORQUESTADOR — Blitz de 1 día SalvadoreX SDD

> **CÓMO USAR**: Copia TODO el bloque de código grande de abajo y pégalo en Claude Code dentro de tu repo. Claude Code orquestará todo lanzando sub-agentes en paralelo con la Task tool.
>
> Tiempo estimado wall-clock: **~3 horas** con 8-10 agentes paralelos.
>
> Pre-requisitos:
> - Estás dentro del repo de SalvadoreX (tu `D:\GrupoVolvix\...\` o donde lo tengas).
> - MCP de Supabase conectado (verifica con `claude mcp list`).
> - Acabas de descomprimir el `salvadorex-sdd-kit-v2.zip` y `salvadorex-1day-blitz.zip` en la raíz del repo.
> - Tu `system-map.json` actual está en `public/system-map.json` (el de tu scanner).

---

```
═══════════════════════════════════════════════════════════════════
ORQUESTADOR DE BLITZ — SalvadoreX SDD en 1 día
═══════════════════════════════════════════════════════════════════

MISIÓN: En un solo día, ejecutar todo el plan del SDD Kit v2 con
máximo paralelismo usando la Task tool para lanzar sub-agentes.

REGLAS GLOBALES:
1. Todos los archivos que crees viven dentro del repo (no en /tmp ni
   fuera). Excepto reportes intermedios que van en .blitz/work/.
2. Cada sub-agente reporta su resultado en .blitz/status/<agente>.md
   antes de devolver el control.
3. NO modifiques archivos fuera de tu carpeta asignada. Cada agente
   tiene un namespace propio para evitar conflictos de escritura.
4. Después de CADA wave, sincroniza: actualiza .blitz/status-board.md
   con el progreso global.
5. Si un sub-agente falla, registra el error y CONTINÚA con los demás.
   No abortes la wave entera por un fallo aislado.
6. Reporta progreso al usuario al inicio y fin de cada wave.

ESTRUCTURA DE TRABAJO QUE VAS A CREAR:
  .blitz/
    status-board.md             ← progreso global
    status/<agente>.md          ← reporte por sub-agente
    work/<agente>/...           ← archivos intermedios
  .specify/
    architecture.md             ← ya existe del kit v2
    constitution.md             ← ya existe
    domain.md                   ← ya existe
    contracts/
      screens/<screen>.spec.md  ← N archivos, uno por sub-agente
      endpoints/<file>.spec.md  ← N archivos
    decisions/ADR-*.md          ← ya existe ADR-001
  scripts/
    generate-system-map.js      ← tu scanner, le aplicaremos parches
  public/
    system-map.json             ← regenerado al final
    volvix-system-map-v2.html   ← ya existe
  .audit/
    final-report.md             ← reporte de cierre

═══════════════════════════════════════════════════════════════════
WAVE 0 — SETUP (secuencial, ~5 min)
═══════════════════════════════════════════════════════════════════

Sin sub-agentes. Hazlo tú directamente:

0.1 Crear estructura:
    mkdir -p .blitz/status .blitz/work .audit .specify/contracts/screens .specify/contracts/endpoints .specify/decisions

0.2 Si no existen aún en el repo, copia desde el kit descomprimido:
    - CLAUDE.md → raíz
    - .specify/architecture.md
    - .specify/constitution.md
    - .specify/domain.md
    - .specify/contracts/screens/SCREEN_TEMPLATE.md
    - .specify/contracts/endpoints/ENDPOINT_TEMPLATE.md
    - .specify/decisions/ADR-001-spin-off-pdc.md

0.3 Verificar prerequisitos:
    - ¿Existe public/salvadorex-pos.html? (si no, abortar y avisar)
    - ¿Existe public/paneldecontrol.html? (idem)
    - ¿Existe public/system-map.json? (si no, correr scripts/generate-system-map.js)
    - ¿MCP Supabase responde? (probar mcp__supabase__list_tables)

0.4 Inicializar .blitz/status-board.md con:
    # Status Board — Blitz <fecha>
    ## Wave 0 — Setup: ⏳ EN PROCESO
    ## Wave 1 — Scanner patches: ⏸ PENDIENTE
    ## Wave 2A — Screens TIER 1: ⏸ PENDIENTE
    ## Wave 2B — Screens TIER 2: ⏸ PENDIENTE
    ## Wave 2C — Endpoints: ⏸ PENDIENTE
    ## Wave 3 — Validación: ⏸ PENDIENTE
    ## Wave 4 — Cierre: ⏸ PENDIENTE

0.5 Reporta al usuario: "Wave 0 lista. Empezando Wave 1 con 5 agentes
    paralelos en patches del scanner."

═══════════════════════════════════════════════════════════════════
WAVE 1 — SCANNER PATCHES + SCHEMA TRUTH (paralelo, ~20 min)
═══════════════════════════════════════════════════════════════════

Lanza 6 Tasks EN PARALELO. Cada una con el prompt de su archivo:

Task 1.1: aplica .blitz/agents/wave-1-patch-1.md  (botón→modal/screen/función)
Task 1.2: aplica .blitz/agents/wave-1-patch-2.md  (screen→endpoint)
Task 1.3: aplica .blitz/agents/wave-1-patch-3.md  (roles hardcoded)
Task 1.4: aplica .blitz/agents/wave-1-patch-4.md  (realtime channels)
Task 1.5: aplica .blitz/agents/wave-1-patch-5.md  (window vars)
Task 1.6: aplica .blitz/agents/wave-1-schema-truth.md (regenerar .specify/schema-truth.md desde MCP)

REGLA CRÍTICA: Las Tasks 1.1-1.5 todas modifican scripts/generate-system-map.js.
Para evitar conflictos:
  - Cada Task crea PRIMERO una copia: scripts/_patches/patch-N.js con su versión del cambio.
  - NO sobreescribe directamente generate-system-map.js.
  - Al final de la wave, TÚ (orquestador) mergeas los 5 patches en un solo
    archivo: scripts/generate-system-map.v2.js usando los diffs guardados.

Espera a que las 6 Tasks terminen. Cuando todas regresen:

1.7 Merge de los 5 patches a scripts/generate-system-map.v2.js
    Lee scripts/_patches/patch-1.js .. patch-5.js y construye el archivo
    final integrando los cambios. Mantén el original generate-system-map.js
    intacto como backup.

1.8 Ejecuta el nuevo scanner: node scripts/generate-system-map.v2.js
    Esto regenera public/system-map.json con la nueva granularidad.

1.9 Actualiza status-board: Wave 1 ✓ COMPLETADO

1.10 Reporta al usuario: número de nodos nuevos, relaciones nuevas, deudas detectadas.

═══════════════════════════════════════════════════════════════════
WAVE 2A — SCREEN CONTRACTS TIER 1 (paralelo, ~30 min)
═══════════════════════════════════════════════════════════════════

Las 5 screens más críticas. Cada una con contrato DETALLADO.

Lee public/system-map.json para extraer info de cada screen.

Lanza 5 Tasks EN PARALELO:

Task 2A.1: Crear .specify/contracts/screens/pos.spec.md
  Instrucciones: aplica .blitz/agents/wave-2-screen-detailed.md
  Variable SCREEN_NAME = "pos"
  Variable PRIORITY = "TIER 1 - DETALLADO"

Task 2A.2: SCREEN_NAME = "corte"
Task 2A.3: SCREEN_NAME = "inventario"
Task 2A.4: SCREEN_NAME = "clientes"
Task 2A.5: SCREEN_NAME = "ventas"

Espera resultados, actualiza status-board, reporta.

═══════════════════════════════════════════════════════════════════
WAVE 2B — SCREEN CONTRACTS TIER 2 (paralelo, ~30 min)
═══════════════════════════════════════════════════════════════════

Las 24 screens restantes + 5 perm-tabs de PDC. Stubs estructurados
(no full-detail). Distribuir entre 6 agentes (≈5 screens por agente).

Lanza 6 Tasks EN PARALELO:

Task 2B.1: aplica .blitz/agents/wave-2-screens-batch.md
  Lista: ["actualizador", "apertura", "ayuda", "config", "cotizaciones"]

Task 2B.2: Lista: ["credito", "dashboard", "departamentos", "devoluciones", "facturacion"]

Task 2B.3: Lista: ["kardex", "mapa", "mobile-apps", "perfil", "promociones"]

Task 2B.4: Lista: ["proveedores", "quickpos", "recargas", "rentas", "reportes"]

Task 2B.5: Lista: ["reservaciones", "salud", "servicios", "usuarios"]

Task 2B.6: aplica .blitz/agents/wave-2-pdctabs-batch.md
  Lista: ["audit", "feats", "hierarchy", "mods", "users"]

Espera, actualiza, reporta.

═══════════════════════════════════════════════════════════════════
WAVE 2C — ENDPOINT CONTRACTS (paralelo, ~45 min)
═══════════════════════════════════════════════════════════════════

8 endpoints compartidos (DETALLADOS) + top 30 endpoints en stubs.

Lanza 5 Tasks EN PARALELO:

Task 2C.1: aplica .blitz/agents/wave-2-endpoints-shared.md
  Los 8 endpoints compartidos POS+PDC, cada uno DETALLADO.

Task 2C.2: aplica .blitz/agents/wave-2-endpoints-batch.md
  Top 10 endpoints exclusivos de POS (más mencionados en system-map.json).

Task 2C.3: Top 10 endpoints siguientes de POS.

Task 2C.4: Top 5 endpoints exclusivos de PDC.

Task 2C.5: aplica .blitz/agents/wave-2-endpoints-stubs.md
  Para el RESTO de endpoints, genera stubs minimalistas (1 línea por
  endpoint en .specify/contracts/endpoints/_INDEX.md con TODO).

Espera, actualiza, reporta.

═══════════════════════════════════════════════════════════════════
WAVE 3 — VALIDACIÓN CRUZADA (paralelo, ~20 min)
═══════════════════════════════════════════════════════════════════

5 agentes verifican consistencia. Sin escribir cambios, solo reportes.

Lanza 5 Tasks EN PARALELO:

Task 3.1: aplica .blitz/agents/wave-3-validator-schema.md
  Verifica que TODAS las tablas mencionadas en contratos de endpoints
  EXISTEN en .specify/schema-truth.md (generado en Wave 1.6).
  Reporta tablas inventadas o faltantes en .audit/validation-schema.md.

Task 3.2: aplica .blitz/agents/wave-3-validator-endpoints.md
  Verifica que cada endpoint mencionado en system-map.json tiene
  contrato. Reporta endpoints sin contrato en .audit/validation-endpoints.md.

Task 3.3: aplica .blitz/agents/wave-3-validator-screens.md
  Verifica que cada screen tiene contrato. Detecta screens en
  system-map.json sin .specify/contracts/screens/*.spec.md.

Task 3.4: aplica .blitz/agents/wave-3-validator-orphans.md
  Cruza schema-truth con contratos: tablas en Supabase que ningún
  endpoint toca = huérfanas. Tablas con sufijos prohibidos = deuda.

Task 3.5: aplica .blitz/agents/wave-3-validator-coherence.md
  Verifica que cada screen-contract menciona endpoints que existen
  en endpoint-contracts. Y viceversa: endpoint-contracts dicen ser
  consumidos por screens reales.

Espera, consolida los 5 reportes en .audit/wave-3-summary.md.

═══════════════════════════════════════════════════════════════════
WAVE 4 — CIERRE (secuencial, ~10 min)
═══════════════════════════════════════════════════════════════════

4.1 Re-ejecutar el scanner: node scripts/generate-system-map.v2.js
    para que el mapa final refleje los contratos creados (si el scanner
    detecta presencia de contratos).

4.2 Generar .audit/final-report.md consolidando:
    - Resumen de qué se hizo en cada wave (de status-board.md).
    - Métricas: # contratos creados, # endpoints documentados,
      # screens documentadas, # deudas detectadas.
    - Top 10 deudas críticas a atacar mañana.
    - Cómo correr el blitz mañana para Tier 2 → Tier 1.

4.3 Actualizar status-board.md con timestamps finales.

4.4 Reportar al usuario:
    ═══════════════════════════════════════════════════════════════
    ✓ BLITZ COMPLETADO en X horas Y minutos
    ═══════════════════════════════════════════════════════════════

    Lo creado hoy:
    - Contratos detallados (TIER 1): 5 screens + 8 endpoints + N exclusivos
    - Stubs (TIER 2): 24 screens + 5 perm-tabs + 100+ endpoints
    - Scanner v2 con 5 parches aplicados
    - Schema-truth real generado desde Supabase
    - .audit/final-report.md con deudas y siguientes pasos

    Mañana: enfocarse en convertir los stubs Tier 2 más usados a Tier 1
    (ver .audit/final-report.md sección "Tier 2 prioridad alta").

    Abre public/volvix-system-map-v2.html para ver el grafo
    enriquecido por los parches del scanner.

═══════════════════════════════════════════════════════════════════
MANEJO DE ERRORES
═══════════════════════════════════════════════════════════════════

Si una Task falla:
  - Registra el error en .blitz/status/<task-id>-ERROR.md
  - Marca el ítem como ⚠️ FALLIDO en status-board.md
  - CONTINÚA con las demás tasks de la wave
  - Reporta al usuario al cierre de la wave, no antes

Si toda una wave falla (>50% de tasks):
  - Para el blitz
  - Reporta al usuario con detalles
  - Sugiere acción correctiva

Si el MCP Supabase no responde:
  - Wave 1.6 (schema-truth) falla
  - Marca .specify/schema-truth.md como "PENDIENTE — sin acceso MCP"
  - Continúa el blitz; en Wave 3, validator-schema reportará que no
    pudo cruzar contra schema real.

═══════════════════════════════════════════════════════════════════
INICIO
═══════════════════════════════════════════════════════════════════

Empieza por Wave 0. Reporta progreso al usuario al inicio y cierre
de cada wave. Usa la Task tool para todas las Tasks marcadas como
"EN PARALELO".

EMPIEZA YA.
```

---

## Lo que el orquestador necesita

Todos los archivos en `.blitz/agents/` que el orquestador referencia están dentro de este ZIP. El orquestador los lee cuando lanza cada Task — son las **instrucciones específicas por tipo de agente**.

## Si tu Claude Code no soporta sub-agentes con Task tool

Fallback: ejecuta las waves **secuencialmente** sin paralelización. Tarda más (~6-8 horas en vez de 3) pero funciona igual. Quita el "EN PARALELO" del prompt y haz que el orquestador ejecute Task tras Task en serie.

## Verificación previa antes de copiar

Antes de pegar el orquestador, verifica:

```bash
ls .specify/architecture.md       # debe existir
ls public/salvadorex-pos.html     # debe existir
ls public/paneldecontrol.html     # debe existir
ls public/system-map.json         # debe existir
ls scripts/generate-system-map.js # debe existir
ls .blitz/agents/                 # debe tener los archivos del ZIP
claude mcp list                   # supabase debe aparecer
```

Si falta algo de eso, completa primero antes de arrancar el blitz.
